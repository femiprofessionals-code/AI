//! Background workers. Exactly one thread probes media and one thread runs
//! renders, so heavy FFmpeg work never piles up on a dual-core laptop.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::domain::{jobs, media, projects, scenes};
use crate::engines::{EngineEnv, RenderContext, RenderError};
use crate::media::ffmpeg;
use crate::state::AppState;

pub const EVT_MEDIA: &str = "media-updated";
pub const EVT_JOB: &str = "render-job-updated";

pub fn spawn_media_worker(app: AppHandle, rx: Receiver<String>) {
    std::thread::Builder::new()
        .name("media-worker".into())
        .spawn(move || {
            while let Ok(id) = rx.recv() {
                process_media(&app, &id);
            }
        })
        .expect("spawn media worker");
}

fn process_media(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    let item = match state.db().and_then(|c| media::get(&c, id)) {
        Ok(i) if i.probe_status == "pending" => i,
        _ => return,
    };
    let Some(tools) = state.tools() else {
        // Without FFmpeg we cannot probe; leave it pending so it is retried
        // after the user installs FFmpeg.
        return;
    };
    let file = PathBuf::from(&item.file_path);
    let info = tools
        .ffprobe
        .as_ref()
        .and_then(|p| ffmpeg::probe(p, &file).ok());

    let mut thumb: Option<PathBuf> = None;
    if item.kind != "audio" {
        if let Ok(ws) = state.workspace() {
            let out = ws.thumbnails().join(format!("{}.jpg", item.id));
            let seek = if item.kind == "video" {
                let dur = info.as_ref().and_then(|i| i.duration_ms).unwrap_or(0) as f64 / 1000.0;
                Some(if dur > 2.0 { 1.0 } else { 0.0 })
            } else {
                None
            };
            if ffmpeg::thumbnail(&tools.ffmpeg, &file, &out, seek).is_ok() {
                if let Some(parent) = out.parent() {
                    allow_dir(app, parent);
                }
                thumb = Some(out);
            }
        }
    }
    // Images decode fine without ffprobe; treat a thumbnail as success.
    let info = info.or_else(|| {
        thumb.as_ref().map(|_| ffmpeg::ProbeInfo {
            has_video: true,
            ..Default::default()
        })
    });
    if let Ok(conn) = state.db() {
        let _ = media::set_probe_result(&conn, id, info.as_ref(), thumb.as_deref());
        if let Ok(updated) = media::get(&conn, id) {
            let _ = app.emit(EVT_MEDIA, updated);
        }
    };
}

pub fn allow_dir(app: &AppHandle, dir: &Path) {
    let _ = app.asset_protocol_scope().allow_directory(dir, true);
}

pub fn allow_file(app: &AppHandle, file: &Path) {
    let _ = app.asset_protocol_scope().allow_file(file);
}

pub fn spawn_render_worker(app: AppHandle, rx: Receiver<()>) {
    std::thread::Builder::new()
        .name("render-worker".into())
        .spawn(move || loop {
            loop {
                let state = app.state::<AppState>();
                let next = state
                    .db()
                    .and_then(|c| jobs::next_queued(&c))
                    .ok()
                    .flatten();
                match next {
                    Some(id) => run_job(&app, &id),
                    None => break,
                }
            }
            if rx.recv().is_err() {
                break;
            }
        })
        .expect("spawn render worker");
}

fn emit_job(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    if let Ok(job) = state.db().and_then(|c| jobs::get(&c, id)) {
        let _ = app.emit(EVT_JOB, job);
    }
}

fn run_job(app: &AppHandle, job_id: &str) {
    let state = app.state::<AppState>();
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut a) = state.active_job.lock() {
        *a = Some((job_id.to_string(), cancel.clone()));
    }
    if let Ok(c) = state.db() {
        let _ = jobs::mark_running(&c, job_id);
    }
    emit_job(app, job_id);

    let outcome = execute(app, job_id, &cancel);
    if let Ok(c) = state.db() {
        let _ = match &outcome {
            Ok(path) => jobs::finish(&c, job_id, "succeeded", Some(&path.to_string_lossy()), None),
            Err(RenderError::Cancelled) => jobs::finish(&c, job_id, "cancelled", None, None),
            Err(RenderError::Failed(msg)) => jobs::finish(&c, job_id, "failed", None, Some(msg)),
        };
    }
    if let Ok(mut a) = state.active_job.lock() {
        *a = None;
    }
    emit_job(app, job_id);
}

fn execute(app: &AppHandle, job_id: &str, cancel: &AtomicBool) -> Result<PathBuf, RenderError> {
    let state = app.state::<AppState>();
    let f = |e: crate::error::AppError| RenderError::Failed(e.to_string());

    let tools = state.tools().ok_or_else(|| {
        RenderError::Failed("FFmpeg was not found. Install it or set its path in Settings.".into())
    })?;
    let settings = state.settings().map_err(f)?;
    let (job, project, scene_list, media_map) = {
        let c = state.db().map_err(f)?;
        let job = jobs::get(&c, job_id).map_err(f)?;
        let project = projects::get(&c, &job.project_id).map_err(f)?;
        let scene_list = scenes::list(&c, &project.id).map_err(f)?;
        let mut map = HashMap::new();
        let ids = scene_list
            .iter()
            .flat_map(|s| [s.visual_media_id.clone(), s.audio_media_id.clone()])
            .chain(std::iter::once(project.music_media_id.clone()))
            .flatten();
        for id in ids {
            if let Ok(m) = media::get(&c, &id) {
                map.insert(id, m);
            }
        }
        (job, project, scene_list, map)
    };
    let engine = state
        .engines
        .iter()
        .find(|e| {
            e.info(&EngineEnv {
                tools: Some(&tools),
            })
            .id == job.engine_id
        })
        .ok_or_else(|| RenderError::Failed(format!("Unknown engine '{}'.", job.engine_id)))?;

    let folder = PathBuf::from(&project.folder_path);
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let output_path = folder.join("exports").join(format!(
        "{}-draft-{stamp}.mp4",
        crate::util::slugify(&project.title)
    ));
    let work_dir = folder
        .join(".cache")
        .join(format!("render-{}", &job.id[..8]));

    let last = Mutex::new((Instant::now() - Duration::from_secs(5), -1.0f64));
    let progress = |p: f64, msg: &str| {
        let mut l = last.lock().unwrap();
        // Throttle DB writes and UI events: at most ~3 per second.
        if l.0.elapsed() >= Duration::from_millis(350) || (p - l.1).abs() >= 0.05 {
            *l = (Instant::now(), p);
            if let Ok(c) = state.db() {
                let _ = jobs::set_progress(&c, job_id, p, msg);
            }
            emit_job(app, job_id);
        }
    };

    let ctx = RenderContext {
        tools: &tools,
        settings: &settings,
        project: &project,
        scenes: &scene_list,
        media: &media_map,
        work_dir,
        output_path,
        options: &job.options,
        cancel,
        progress: &progress,
    };
    let out = engine.render(&ctx)?;
    allow_file(app, &out);
    Ok(out)
}
