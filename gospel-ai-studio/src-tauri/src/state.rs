use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, MutexGuard, RwLock};

use crate::domain::settings::{self, Settings};
use crate::engines::RenderEngine;
use crate::error::{AppError, AppResult};
use crate::media::ffmpeg::Tools;

pub struct AppState {
    db: Mutex<Connection>,
    pub db_path: PathBuf,
    pub default_workspace: String,
    pub install_dir: Option<PathBuf>,
    pub tools: RwLock<Option<Tools>>,
    pub media_tx: Mutex<Sender<String>>,
    pub render_tx: Mutex<Sender<()>>,
    pub active_job: Mutex<Option<(String, Arc<AtomicBool>)>>,
    pub engines: Vec<Box<dyn RenderEngine>>,
}

impl AppState {
    pub fn new(
        conn: Connection,
        db_path: PathBuf,
        default_workspace: String,
        media_tx: Sender<String>,
        render_tx: Sender<()>,
    ) -> Self {
        let install_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf));
        AppState {
            db: Mutex::new(conn),
            db_path,
            default_workspace,
            install_dir,
            tools: RwLock::new(None),
            media_tx: Mutex::new(media_tx),
            render_tx: Mutex::new(render_tx),
            active_job: Mutex::new(None),
            engines: crate::engines::registry(),
        }
    }

    pub fn db(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db
            .lock()
            .map_err(|_| AppError::Other("Database lock poisoned; please restart the app.".into()))
    }

    pub fn settings(&self) -> AppResult<Settings> {
        settings::load(&*self.db()?, &self.default_workspace)
    }

    pub fn tools(&self) -> Option<Tools> {
        self.tools.read().ok().and_then(|t| t.clone())
    }

    pub fn refresh_tools(&self) -> Option<Tools> {
        let configured = self.settings().map(|s| s.ffmpeg_path).unwrap_or_default();
        let found = crate::media::ffmpeg::locate(&configured);
        if let Ok(mut t) = self.tools.write() {
            *t = found.clone();
        }
        found
    }

    pub fn workspace(&self) -> AppResult<Workspace> {
        Ok(Workspace::new(PathBuf::from(
            self.settings()?.workspace_root,
        )))
    }

    pub fn queue_media(&self, id: String) {
        if let Ok(tx) = self.media_tx.lock() {
            let _ = tx.send(id);
        }
    }

    pub fn wake_renderer(&self) {
        if let Ok(tx) = self.render_tx.lock() {
            let _ = tx.send(());
        }
    }
}

/// Folder layout inside the user's workspace (default: Documents\Gospel AI Studio).
pub struct Workspace {
    pub root: PathBuf,
}

impl Workspace {
    pub fn new(root: PathBuf) -> Self {
        Workspace { root }
    }
    pub fn projects(&self) -> PathBuf {
        self.root.join("Projects")
    }
    pub fn library(&self) -> PathBuf {
        self.root.join("Library")
    }
    pub fn thumbnails(&self) -> PathBuf {
        self.root.join("Library").join("Thumbnails")
    }
    pub fn backups(&self) -> PathBuf {
        self.root.join("Backups")
    }
    pub fn ensure(&self) -> std::io::Result<()> {
        for d in [
            self.projects(),
            self.library(),
            self.thumbnails(),
            self.backups(),
        ] {
            std::fs::create_dir_all(d)?;
        }
        Ok(())
    }
}
