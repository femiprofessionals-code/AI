use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::error::{not_found, AppResult};
use crate::util::{new_id, now};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderJob {
    pub id: String,
    pub project_id: String,
    pub project_title: String,
    pub engine_id: String,
    pub options: serde_json::Value,
    pub status: String,
    pub progress: f64,
    pub message: String,
    pub output_path: Option<String>,
    pub output_exists: bool,
    pub error: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

const SELECT: &str =
    "SELECT j.id, j.project_id, p.title, j.engine_id, j.options, j.status, j.progress,
    j.message, j.output_path, j.error, j.created_at, j.started_at, j.finished_at
    FROM render_jobs j JOIN projects p ON p.id = j.project_id";

fn from_row(r: &Row) -> rusqlite::Result<RenderJob> {
    let output_path: Option<String> = r.get(8)?;
    Ok(RenderJob {
        id: r.get(0)?,
        project_id: r.get(1)?,
        project_title: r.get(2)?,
        engine_id: r.get(3)?,
        options: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or(serde_json::Value::Null),
        status: r.get(5)?,
        progress: r.get(6)?,
        message: r.get(7)?,
        output_exists: output_path
            .as_ref()
            .map(|p| std::path::Path::new(p).is_file())
            .unwrap_or(false),
        output_path,
        error: r.get(9)?,
        created_at: r.get(10)?,
        started_at: r.get(11)?,
        finished_at: r.get(12)?,
    })
}

pub fn create(
    conn: &Connection,
    project_id: &str,
    engine_id: &str,
    options: &serde_json::Value,
) -> AppResult<RenderJob> {
    let id = new_id();
    conn.execute(
        "INSERT INTO render_jobs (id, project_id, engine_id, options, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, project_id, engine_id, options.to_string(), now()],
    )?;
    get(conn, &id)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<RenderJob> {
    conn.query_row(&format!("{SELECT} WHERE j.id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| not_found("Render job"))
}

pub fn list(conn: &Connection, project_id: Option<&str>, limit: i64) -> AppResult<Vec<RenderJob>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE (?1 IS NULL OR j.project_id = ?1) ORDER BY j.created_at DESC LIMIT ?2"
    ))?;
    let rows = stmt.query_map(params![project_id, limit], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn next_queued(conn: &Connection) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT id FROM render_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn mark_running(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE render_jobs SET status = 'running', started_at = ?2, message = 'Starting…' WHERE id = ?1",
        params![id, now()],
    )?;
    Ok(())
}

pub fn set_progress(conn: &Connection, id: &str, progress: f64, message: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE render_jobs SET progress = ?2, message = ?3 WHERE id = ?1 AND status = 'running'",
        params![id, progress.clamp(0.0, 1.0), message],
    )?;
    Ok(())
}

pub fn finish(
    conn: &Connection,
    id: &str,
    status: &str,
    output: Option<&str>,
    error: Option<&str>,
) -> AppResult<()> {
    let progress = if status == "succeeded" { 1.0 } else { -1.0 };
    let message = match status {
        "succeeded" => "Finished",
        "cancelled" => "Cancelled",
        _ => "Failed",
    };
    conn.execute(
        "UPDATE render_jobs SET status = ?2, output_path = ?3, error = ?4, message = ?5,
            progress = CASE WHEN ?6 < 0 THEN progress ELSE ?6 END, finished_at = ?7 WHERE id = ?1",
        params![id, status, output, error, message, progress, now()],
    )?;
    Ok(())
}

/// Called at start-up: anything left "running" was interrupted by an app exit.
pub fn recover_interrupted(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "UPDATE render_jobs SET status = 'failed', error = 'The app was closed while this job was running.',
            message = 'Interrupted', finished_at = ?1 WHERE status = 'running'",
        [now()],
    )?;
    Ok(())
}

pub fn cancel_queued(conn: &Connection, id: &str) -> AppResult<bool> {
    let n = conn.execute(
        "UPDATE render_jobs SET status = 'cancelled', message = 'Cancelled', finished_at = ?2 WHERE id = ?1 AND status = 'queued'",
        params![id, now()],
    )?;
    Ok(n > 0)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM render_jobs WHERE id = ?1 AND status NOT IN ('running', 'queued')",
        [id],
    )?;
    Ok(())
}
