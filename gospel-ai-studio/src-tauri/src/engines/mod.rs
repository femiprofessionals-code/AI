//! Pluggable render engines.
//!
//! Every way of turning a project into media implements [`RenderEngine`].
//! Version 1 ships one engine, `draft_assembly`, which uses FFmpeg to cut
//! the user's own media together. It is *not* AI. Future local engines
//! (e.g. offline text-to-speech, local image or lip-sync models) can be added
//! by implementing this trait and registering them in [`registry`]; the UI
//! lists whatever the registry returns, together with its real availability.

pub mod draft_assembly;

use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

use crate::domain::media::MediaItem;
use crate::domain::projects::Project;
use crate::domain::scenes::Scene;
use crate::domain::settings::Settings;
use crate::media::ffmpeg::Tools;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    /// True only if the engine actually runs a machine-learning model.
    pub uses_ai: bool,
    pub available: bool,
    pub unavailable_reason: Option<String>,
}

/// What an engine may inspect to decide whether it can run.
pub struct EngineEnv<'a> {
    pub tools: Option<&'a Tools>,
}

pub struct RenderContext<'a> {
    pub tools: &'a Tools,
    pub settings: &'a Settings,
    pub project: &'a Project,
    pub scenes: &'a [Scene],
    pub media: &'a HashMap<String, MediaItem>,
    pub work_dir: PathBuf,
    pub output_path: PathBuf,
    pub options: &'a serde_json::Value,
    pub cancel: &'a AtomicBool,
    pub progress: &'a (dyn Fn(f64, &str) + Sync),
}

#[derive(Debug)]
pub enum RenderError {
    Cancelled,
    Failed(String),
}

pub trait RenderEngine: Send + Sync {
    fn info(&self, env: &EngineEnv) -> EngineInfo;
    fn render(&self, ctx: &RenderContext) -> Result<PathBuf, RenderError>;
}

pub fn registry() -> Vec<Box<dyn RenderEngine>> {
    vec![Box::new(draft_assembly::DraftAssembly)]
}
