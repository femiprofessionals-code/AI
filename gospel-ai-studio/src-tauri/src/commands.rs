//! Tauri command handlers: thin wrappers that validate, call the domain
//! layer and keep side effects (files, events, asset scope) in one place.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::domain::media::{ImportResult, LibraryStats, MediaItem, MediaQuery, MediaUpdate};
use crate::domain::projects::{CreateProject, ListQuery, Project, UpdateProject};
use crate::domain::scenes::{GenerateResult, Scene, SceneInput};
use crate::domain::scripts::{Revision, ScriptDoc};
use crate::domain::settings::Settings;
use crate::domain::speakers::{Speaker, SpeakerInput};
use crate::domain::{jobs, media, projects, scenes, scripts, settings, speakers};
use crate::engines::{EngineEnv, EngineInfo};
use crate::error::{invalid, AppError, AppResult};
use crate::media::ffmpeg;
use crate::state::AppState;
use crate::util::is_within;
use crate::workers::{allow_dir, allow_file};

type S<'a> = State<'a, AppState>;

// ---------- App / system ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    db_path: String,
    schema_version: i64,
    workspace_root: String,
    platform: String,
    cpu_threads: usize,
}

#[tauri::command(async)]
pub fn app_info(app: AppHandle, state: S<'_>) -> AppResult<AppInfo> {
    let conn = state.db()?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        db_path: state.db_path.to_string_lossy().into(),
        schema_version: crate::db::schema_version(&conn)?,
        workspace_root: settings::load(&conn, &state.default_workspace)?.workspace_root,
        platform: std::env::consts::OS.into(),
        cpu_threads: std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    ffmpeg_found: bool,
    ffmpeg_path: Option<String>,
    ffmpeg_version: Option<String>,
    ffprobe_found: bool,
    font_found: bool,
    workspace_writable: bool,
    pending_media: usize,
}

#[tauri::command(async)]
pub fn system_status(state: S<'_>, refresh: Option<bool>) -> AppResult<SystemStatus> {
    let tools = if refresh.unwrap_or(false) {
        state.refresh_tools()
    } else {
        state.tools()
    };
    let s = state.settings()?;
    let ws = state.workspace()?;
    let writable = ws.ensure().is_ok() && {
        let probe = ws.root.join(".write-test");
        let ok = std::fs::write(&probe, b"ok").is_ok();
        let _ = std::fs::remove_file(&probe);
        ok
    };
    let pending = media::pending_ids(&*state.db()?)?;
    if tools.is_some() {
        for id in &pending {
            state.queue_media(id.clone());
        }
    }
    Ok(SystemStatus {
        ffmpeg_found: tools.is_some(),
        ffmpeg_path: tools.as_ref().map(|t| t.ffmpeg.to_string_lossy().into()),
        ffmpeg_version: tools.as_ref().map(|t| t.version.clone()),
        ffprobe_found: tools.as_ref().map(|t| t.ffprobe.is_some()).unwrap_or(false),
        font_found: ffmpeg::find_font(&s.render_font_path).is_some(),
        workspace_writable: writable,
        pending_media: pending.len(),
    })
}

/// Opens a file or folder with the OS default app. Restricted to paths the
/// app manages (workspace, project folders, library files, render outputs).
#[tauri::command(async)]
pub fn open_path(
    app: AppHandle,
    state: S<'_>,
    path: String,
    reveal: Option<bool>,
) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return invalid("That file or folder no longer exists.");
    }
    if !is_known_path(&state, &p)? {
        return invalid(
            "Only files and folders managed by Gospel AI Studio can be opened from here.",
        );
    }
    let r = if reveal.unwrap_or(false) {
        app.opener().reveal_item_in_dir(&p)
    } else {
        app.opener().open_path(p.to_string_lossy(), None::<&str>)
    };
    r.map_err(|e| AppError::Other(format!("Could not open: {e}")))
}

fn is_known_path(state: &AppState, p: &Path) -> AppResult<bool> {
    let ws = state.workspace()?;
    if is_within(p, &ws.root) {
        return Ok(true);
    }
    let conn = state.db()?;
    let mut stmt = conn
        .prepare("SELECT folder_path FROM projects UNION ALL SELECT file_path FROM media_items")?;
    let known: Vec<String> = stmt
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(known.iter().any(|k| is_within(p, Path::new(k))))
}

// ---------- Settings ----------

#[tauri::command(async)]
pub fn settings_get(state: S<'_>) -> AppResult<Settings> {
    state.settings()
}

#[tauri::command(async)]
pub fn settings_save(app: AppHandle, state: S<'_>, settings: Settings) -> AppResult<Settings> {
    let mut s = settings;
    s.workspace_root = s.workspace_root.trim().to_string();
    let root = PathBuf::from(&s.workspace_root);
    if !root.is_absolute() {
        return invalid(
            "Choose a full folder path for the workspace (for example D:\\Gospel AI Studio).",
        );
    }
    if let Some(install) = &state.install_dir {
        if is_within(&root, install) {
            return invalid("The workspace must be outside the application's installation folder.");
        }
    }
    crate::state::Workspace::new(root.clone())
        .ensure()
        .map_err(|e| AppError::Invalid(format!("Cannot use that workspace folder: {e}")))?;
    if !s.ffmpeg_path.trim().is_empty() && ffmpeg::locate(&s.ffmpeg_path).is_none() {
        return invalid(
            "That FFmpeg path did not run. Choose ffmpeg.exe or leave it empty to auto-detect.",
        );
    }
    let previous_ffmpeg = state.settings()?.ffmpeg_path;
    settings::save(&*state.db()?, &s)?;
    allow_dir(&app, &root);
    if previous_ffmpeg != s.ffmpeg_path {
        state.refresh_tools();
    }
    state.settings()
}

#[tauri::command(async)]
pub fn db_backup(state: S<'_>) -> AppResult<String> {
    let ws = state.workspace()?;
    std::fs::create_dir_all(ws.backups())?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let dest = ws.backups().join(format!("studio-backup-{stamp}.db"));
    state
        .db()?
        .execute("VACUUM INTO ?1", [dest.to_string_lossy()])?;
    Ok(dest.to_string_lossy().into())
}

// ---------- Dashboard ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    conversation_count: i64,
    hypeman_count: i64,
    scene_count: i64,
    library: LibraryStats,
    recent_projects: Vec<Project>,
    recent_jobs: Vec<jobs::RenderJob>,
}

#[tauri::command(async)]
pub fn dashboard(state: S<'_>) -> AppResult<Dashboard> {
    let conn = state.db()?;
    let count = |kind: &str| -> AppResult<i64> {
        Ok(conn.query_row(
            "SELECT COUNT(*) FROM projects WHERE kind = ?1 AND archived = 0",
            [kind],
            |r| r.get(0),
        )?)
    };
    Ok(Dashboard {
        conversation_count: count("conversation")?,
        hypeman_count: count("hypeman")?,
        scene_count: conn.query_row(
            "SELECT COUNT(*) FROM scenes s JOIN projects p ON p.id = s.project_id WHERE p.archived = 0",
            [],
            |r| r.get(0),
        )?,
        library: media::stats(&conn)?,
        recent_projects: projects::list(&conn, &ListQuery { kind: None, include_archived: false, search: None, limit: Some(6) })?,
        recent_jobs: jobs::list(&conn, None, 5)?,
    })
}

// ---------- Projects ----------

#[tauri::command(async)]
pub fn projects_list(state: S<'_>, query: ListQuery) -> AppResult<Vec<Project>> {
    projects::list(&*state.db()?, &query)
}

#[tauri::command(async)]
pub fn project_get(state: S<'_>, id: String) -> AppResult<Project> {
    projects::get(&*state.db()?, &id)
}

#[tauri::command(async)]
pub fn project_create(app: AppHandle, state: S<'_>, input: CreateProject) -> AppResult<Project> {
    let s = state.settings()?;
    let ws = state.workspace()?;
    ws.ensure()?;
    let default_aspect = if input.kind == "hypeman" {
        &s.default_aspect_hypeman
    } else {
        &s.default_aspect_conversation
    };
    let p = projects::create(&*state.db()?, &input, &ws.projects(), default_aspect)?;
    allow_dir(&app, Path::new(&p.folder_path));
    Ok(p)
}

#[tauri::command(async)]
pub fn project_update(state: S<'_>, id: String, input: UpdateProject) -> AppResult<Project> {
    projects::update(&*state.db()?, &id, &input)
}

#[tauri::command(async)]
pub fn project_set_archived(state: S<'_>, id: String, archived: bool) -> AppResult<Project> {
    projects::set_archived(&*state.db()?, &id, archived)
}

/// Deletes a project. Files are removed only when asked, and only if the
/// folder's project.json proves it belongs to this project.
#[tauri::command(async)]
pub fn project_delete(state: S<'_>, id: String, delete_files: bool) -> AppResult<bool> {
    if let Ok(a) = state.active_job.lock() {
        if let Some((job_id, _)) = a.as_ref() {
            let conn = state.db()?;
            if jobs::get(&conn, job_id)
                .map(|j| j.project_id == id)
                .unwrap_or(false)
            {
                return invalid("A render for this project is running. Cancel it first.");
            }
        }
    }
    let folder = projects::delete(&*state.db()?, &id)?;
    let folder = PathBuf::from(folder);
    if delete_files && folder.is_dir() && projects::folder_is_owned_by(&folder, &id) {
        std::fs::remove_dir_all(&folder)?;
        return Ok(true);
    }
    Ok(false)
}

// ---------- Script ----------

#[tauri::command(async)]
pub fn script_get(state: S<'_>, project_id: String) -> AppResult<ScriptDoc> {
    scripts::get(&*state.db()?, &project_id)
}

#[tauri::command(async)]
pub fn script_save(state: S<'_>, project_id: String, content: String) -> AppResult<ScriptDoc> {
    if content.len() > 2_000_000 {
        return invalid("Scripts are limited to 2 MB of text.");
    }
    scripts::save(&*state.db()?, &project_id, &content)
}

#[tauri::command(async)]
pub fn script_snapshot(state: S<'_>, project_id: String) -> AppResult<Vec<Revision>> {
    let conn = state.db()?;
    scripts::snapshot(&conn, &project_id)?;
    scripts::revisions(&conn, &project_id)
}

#[tauri::command(async)]
pub fn script_revisions(state: S<'_>, project_id: String) -> AppResult<Vec<Revision>> {
    scripts::revisions(&*state.db()?, &project_id)
}

#[tauri::command(async)]
pub fn script_revision_content(state: S<'_>, revision_id: i64) -> AppResult<String> {
    scripts::revision_content(&*state.db()?, revision_id)
}

#[tauri::command(async)]
pub fn script_restore(state: S<'_>, project_id: String, revision_id: i64) -> AppResult<ScriptDoc> {
    scripts::restore(&*state.db()?, &project_id, revision_id)
}

// ---------- Speakers ----------

#[tauri::command(async)]
pub fn speakers_list(state: S<'_>, project_id: String) -> AppResult<Vec<Speaker>> {
    speakers::list(&*state.db()?, &project_id)
}

#[tauri::command(async)]
pub fn speaker_create(state: S<'_>, project_id: String, input: SpeakerInput) -> AppResult<Speaker> {
    speakers::create(&*state.db()?, &project_id, &input)
}

#[tauri::command(async)]
pub fn speaker_update(state: S<'_>, id: String, input: SpeakerInput) -> AppResult<Speaker> {
    speakers::update(&*state.db()?, &id, &input)
}

#[tauri::command(async)]
pub fn speaker_delete(state: S<'_>, id: String) -> AppResult<()> {
    speakers::delete(&*state.db()?, &id)
}

// ---------- Scenes ----------

#[tauri::command(async)]
pub fn scenes_list(state: S<'_>, project_id: String) -> AppResult<Vec<Scene>> {
    scenes::list(&*state.db()?, &project_id)
}

#[tauri::command(async)]
pub fn scene_create(
    state: S<'_>,
    project_id: String,
    input: SceneInput,
    after_position: Option<i64>,
) -> AppResult<Scene> {
    scenes::create(&*state.db()?, &project_id, &input, after_position)
}

#[tauri::command(async)]
pub fn scene_update(state: S<'_>, id: String, input: SceneInput) -> AppResult<Scene> {
    scenes::update(&*state.db()?, &id, &input)
}

#[tauri::command(async)]
pub fn scene_delete(state: S<'_>, id: String) -> AppResult<()> {
    scenes::delete(&*state.db()?, &id)
}

#[tauri::command(async)]
pub fn scene_duplicate(state: S<'_>, id: String) -> AppResult<Scene> {
    scenes::duplicate(&*state.db()?, &id)
}

#[tauri::command(async)]
pub fn scenes_reorder(
    state: S<'_>,
    project_id: String,
    ordered_ids: Vec<String>,
) -> AppResult<Vec<Scene>> {
    scenes::reorder(&*state.db()?, &project_id, &ordered_ids)
}

#[tauri::command(async)]
pub fn scenes_generate(
    state: S<'_>,
    project_id: String,
    replace: bool,
) -> AppResult<GenerateResult> {
    let s = state.settings()?;
    let conn = state.db()?;
    let kind = projects::get(&conn, &project_id)?.kind;
    let wpm = if kind == "hypeman" {
        s.words_per_minute_hypeman
    } else {
        s.words_per_minute_conversation
    };
    scenes::generate_from_script(&conn, &project_id, replace, wpm)
}

// ---------- Media library ----------

#[tauri::command(async)]
pub fn media_list(state: S<'_>, query: MediaQuery) -> AppResult<Vec<MediaItem>> {
    media::list(&*state.db()?, &query)
}

#[tauri::command]
pub async fn media_import(app: AppHandle, paths: Vec<String>) -> AppResult<ImportResult> {
    // Copying large videos can take a while: do it off the async runtime.
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state = app.state::<AppState>();
        let s = state.settings()?;
        let ws = state.workspace()?;
        ws.ensure()?;
        let result = {
            let conn = state.db()?;
            media::import(&conn, &paths, &ws.library(), &s.import_mode)?
        };
        allow_dir(&app, &ws.library());
        for item in &result.imported {
            if !item.managed {
                allow_file(&app, Path::new(&item.file_path));
            }
            state.queue_media(item.id.clone());
        }
        Ok(result)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command(async)]
pub fn media_update(state: S<'_>, id: String, input: MediaUpdate) -> AppResult<MediaItem> {
    media::update(&*state.db()?, &id, &input)
}

#[tauri::command(async)]
pub fn media_reprocess(state: S<'_>, id: String) -> AppResult<MediaItem> {
    let conn = state.db()?;
    media::mark_pending(&conn, &id)?;
    state.queue_media(id.clone());
    media::get(&conn, &id)
}

/// Removes a library item. Copies inside the library are deleted from disk;
/// linked originals are never touched.
#[tauri::command(async)]
pub fn media_delete(state: S<'_>, id: String) -> AppResult<()> {
    let item = media::delete(&*state.db()?, &id)?;
    let ws = state.workspace()?;
    if item.managed && is_within(Path::new(&item.file_path), &ws.library()) {
        let _ = std::fs::remove_file(&item.file_path);
    }
    if let Some(t) = item.thumbnail_path {
        let _ = std::fs::remove_file(t);
    }
    Ok(())
}

// ---------- Rendering ----------

#[tauri::command(async)]
pub fn engines_list(state: S<'_>) -> AppResult<Vec<EngineInfo>> {
    let tools = state.tools();
    let env = EngineEnv {
        tools: tools.as_ref(),
    };
    Ok(state.engines.iter().map(|e| e.info(&env)).collect())
}

#[tauri::command(async)]
pub fn render_start(
    state: S<'_>,
    project_id: String,
    engine_id: String,
    options: serde_json::Value,
) -> AppResult<jobs::RenderJob> {
    let tools = state.tools();
    let env = EngineEnv {
        tools: tools.as_ref(),
    };
    let info = state
        .engines
        .iter()
        .map(|e| e.info(&env))
        .find(|i| i.id == engine_id)
        .ok_or_else(|| AppError::Invalid("Unknown render engine.".into()))?;
    if !info.available {
        return Err(AppError::Dependency(
            info.unavailable_reason
                .unwrap_or_else(|| "This engine is unavailable.".into()),
        ));
    }
    if let Some(q) = options.get("quality").and_then(|q| q.as_str()) {
        if !matches!(q, "720p" | "1080p") {
            return invalid("Quality must be 720p or 1080p.");
        }
    }
    let job = {
        let conn = state.db()?;
        if scenes::list(&conn, &project_id)?.is_empty() {
            return invalid("Add at least one scene before rendering.");
        }
        jobs::create(&conn, &project_id, &engine_id, &options)?
    };
    state.wake_renderer();
    Ok(job)
}

#[tauri::command(async)]
pub fn jobs_list(state: S<'_>, project_id: Option<String>) -> AppResult<Vec<jobs::RenderJob>> {
    jobs::list(&*state.db()?, project_id.as_deref(), 50)
}

#[tauri::command(async)]
pub fn job_cancel(state: S<'_>, id: String) -> AppResult<jobs::RenderJob> {
    let conn = state.db()?;
    if !jobs::cancel_queued(&conn, &id)? {
        if let Ok(a) = state.active_job.lock() {
            if let Some((active, flag)) = a.as_ref() {
                if *active == id {
                    flag.store(true, std::sync::atomic::Ordering::Relaxed);
                }
            }
        }
    }
    jobs::get(&conn, &id)
}

#[tauri::command(async)]
pub fn job_delete(state: S<'_>, id: String) -> AppResult<()> {
    jobs::delete(&*state.db()?, &id)
}
