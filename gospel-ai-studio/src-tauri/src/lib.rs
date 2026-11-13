mod commands;
mod db;
mod domain;
mod engines;
mod error;
mod media;
mod state;
mod util;
mod workers;

use std::path::PathBuf;
use tauri::Manager;

use state::AppState;

fn default_workspace(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("Gospel AI Studio")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            // The database lives in the per-user app data folder
            // (%APPDATA%\com.gospelaistudio.desktop on Windows), never in the
            // installation directory.
            let data_dir = app.path().app_data_dir()?;
            let db_path = data_dir.join("studio.db");
            let conn = db::open(&db_path).map_err(|e| e.to_string())?;
            domain::jobs::recover_interrupted(&conn).map_err(|e| e.to_string())?;

            let (media_tx, media_rx) = std::sync::mpsc::channel();
            let (render_tx, render_rx) = std::sync::mpsc::channel();
            let default_ws = default_workspace(&handle).to_string_lossy().to_string();
            let state = AppState::new(conn, db_path, default_ws, media_tx, render_tx);

            // Asset protocol scope: only the workspace, project folders and
            // linked media files may be loaded by the webview.
            if let Ok(ws) = state.workspace() {
                let _ = ws.ensure();
                workers::allow_dir(&handle, &ws.root);
                workers::allow_dir(&handle, &ws.library());
                workers::allow_dir(&handle, &ws.thumbnails());
            }
            if let Ok(conn) = state.db() {
                if let Ok(mut stmt) = conn.prepare("SELECT folder_path FROM projects") {
                    let folders: Vec<String> = stmt
                        .query_map([], |r| r.get(0))
                        .map(|r| r.flatten().collect())
                        .unwrap_or_default();
                    for f in folders {
                        workers::allow_dir(&handle, std::path::Path::new(&f));
                    }
                }
                if let Ok(mut stmt) =
                    conn.prepare("SELECT file_path FROM media_items WHERE managed = 0")
                {
                    let files: Vec<String> = stmt
                        .query_map([], |r| r.get(0))
                        .map(|r| r.flatten().collect())
                        .unwrap_or_default();
                    for f in files {
                        workers::allow_file(&handle, std::path::Path::new(&f));
                    }
                }
            }
            app.manage(state);

            workers::spawn_media_worker(handle.clone(), media_rx);
            workers::spawn_render_worker(handle.clone(), render_rx);

            // Detect FFmpeg off the main thread so start-up stays instant,
            // then pick up any media still waiting for thumbnails.
            let h = handle.clone();
            std::thread::spawn(move || {
                let state = h.state::<AppState>();
                if state.refresh_tools().is_some() {
                    if let Ok(ids) = state.db().and_then(|c| domain::media::pending_ids(&c)) {
                        for id in ids {
                            state.queue_media(id);
                        }
                    }
                }
                state.wake_renderer();
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::system_status,
            commands::open_path,
            commands::settings_get,
            commands::settings_save,
            commands::db_backup,
            commands::dashboard,
            commands::projects_list,
            commands::project_get,
            commands::project_create,
            commands::project_update,
            commands::project_set_archived,
            commands::project_delete,
            commands::script_get,
            commands::script_save,
            commands::script_snapshot,
            commands::script_revisions,
            commands::script_revision_content,
            commands::script_restore,
            commands::speakers_list,
            commands::speaker_create,
            commands::speaker_update,
            commands::speaker_delete,
            commands::scenes_list,
            commands::scene_create,
            commands::scene_update,
            commands::scene_delete,
            commands::scene_duplicate,
            commands::scenes_reorder,
            commands::scenes_generate,
            commands::media_list,
            commands::media_import,
            commands::media_update,
            commands::media_reprocess,
            commands::media_delete,
            commands::engines_list,
            commands::render_start,
            commands::jobs_list,
            commands::job_cancel,
            commands::job_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gospel AI Studio");
}
