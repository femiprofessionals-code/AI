use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::error::{invalid, not_found, AppResult};
use crate::util::{new_id, now, slugify, write_atomic};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub aspect_ratio: String,
    pub folder_path: String,
    pub bpm: Option<i64>,
    pub target_seconds: Option<i64>,
    pub music_media_id: Option<String>,
    pub music_volume: f64,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    // Aggregates (read-only)
    pub scene_count: i64,
    pub word_count: i64,
    pub total_duration_ms: i64,
}

const SELECT: &str = "SELECT p.id, p.kind, p.title, p.description, p.status, p.aspect_ratio,
    p.folder_path, p.bpm, p.target_seconds, p.music_media_id, p.music_volume, p.archived,
    p.created_at, p.updated_at,
    (SELECT COUNT(*) FROM scenes s WHERE s.project_id = p.id),
    COALESCE((SELECT word_count FROM scripts sc WHERE sc.project_id = p.id), 0),
    COALESCE((SELECT SUM(duration_ms) FROM scenes s WHERE s.project_id = p.id), 0)
    FROM projects p";

fn from_row(r: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        kind: r.get(1)?,
        title: r.get(2)?,
        description: r.get(3)?,
        status: r.get(4)?,
        aspect_ratio: r.get(5)?,
        folder_path: r.get(6)?,
        bpm: r.get(7)?,
        target_seconds: r.get(8)?,
        music_media_id: r.get(9)?,
        music_volume: r.get(10)?,
        archived: r.get::<_, i64>(11)? == 1,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
        scene_count: r.get(14)?,
        word_count: r.get(15)?,
        total_duration_ms: r.get(16)?,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    pub kind: Option<String>,
    #[serde(default)]
    pub include_archived: bool,
    pub search: Option<String>,
    pub limit: Option<i64>,
}

pub fn list(conn: &Connection, q: &ListQuery) -> AppResult<Vec<Project>> {
    let sql = format!(
        "{SELECT} WHERE (?1 IS NULL OR p.kind = ?1)
           AND (?2 = 1 OR p.archived = 0)
           AND (?3 IS NULL OR p.title LIKE ?3 ESCAPE '\\' OR p.description LIKE ?3 ESCAPE '\\')
         ORDER BY p.archived ASC, p.updated_at DESC LIMIT ?4"
    );
    let search = q
        .search
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{}%", s.replace('%', "\\%")));
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![
            q.kind,
            q.include_archived as i64,
            search,
            q.limit.unwrap_or(500)
        ],
        from_row,
    )?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Project> {
    conn.query_row(&format!("{SELECT} WHERE p.id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| not_found("Project"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProject {
    pub kind: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub aspect_ratio: Option<String>,
}

fn check_kind(kind: &str) -> AppResult<()> {
    if matches!(kind, "conversation" | "hypeman") {
        Ok(())
    } else {
        invalid("Project type must be 'conversation' or 'hypeman'.")
    }
}

fn check_aspect(a: &str) -> AppResult<()> {
    if matches!(a, "16:9" | "9:16" | "1:1") {
        Ok(())
    } else {
        invalid("Aspect ratio must be 16:9, 9:16 or 1:1.")
    }
}

fn clean_title(t: &str) -> AppResult<String> {
    let t = t.trim();
    if t.is_empty() {
        return invalid("Please give the project a title.");
    }
    if t.chars().count() > 120 {
        return invalid("Title must be 120 characters or fewer.");
    }
    Ok(t.to_string())
}

/// Creates the DB record and the project folder under `projects_dir`.
pub fn create(
    conn: &Connection,
    input: &CreateProject,
    projects_dir: &Path,
    default_aspect: &str,
) -> AppResult<Project> {
    check_kind(&input.kind)?;
    let title = clean_title(&input.title)?;
    let aspect = input
        .aspect_ratio
        .clone()
        .unwrap_or_else(|| default_aspect.to_string());
    check_aspect(&aspect)?;

    let id = new_id();
    let folder: PathBuf = projects_dir.join(format!("{}-{}", slugify(&title), &id[..8]));
    std::fs::create_dir_all(folder.join("exports"))?;
    let ts = now();
    let (bpm, target): (Option<i64>, Option<i64>) = if input.kind == "hypeman" {
        (Some(120), Some(30))
    } else {
        (None, None)
    };

    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO projects (id, kind, title, description, aspect_ratio, folder_path, bpm,
            target_seconds, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![
            id,
            input.kind,
            title,
            input.description.trim(),
            aspect,
            folder.to_string_lossy(),
            bpm,
            target,
            ts
        ],
    )?;
    tx.execute(
        "INSERT INTO scripts (project_id, content, word_count, updated_at) VALUES (?1, '', 0, ?2)",
        params![id, ts],
    )?;
    tx.commit()?;
    let project = get(conn, &id)?;
    write_manifest(&project);
    Ok(project)
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProject {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub aspect_ratio: Option<String>,
    pub bpm: Option<i64>,
    pub target_seconds: Option<i64>,
    /// Use `Some("")` to clear the music track.
    pub music_media_id: Option<String>,
    pub music_volume: Option<f64>,
}

pub fn update(conn: &Connection, id: &str, u: &UpdateProject) -> AppResult<Project> {
    let mut p = get(conn, id)?;
    if let Some(t) = &u.title {
        p.title = clean_title(t)?;
    }
    if let Some(d) = &u.description {
        p.description = d.trim().to_string();
    }
    if let Some(s) = &u.status {
        if !matches!(s.as_str(), "draft" | "in_progress" | "review" | "complete") {
            return invalid("Unknown status.");
        }
        p.status = s.clone();
    }
    if let Some(a) = &u.aspect_ratio {
        check_aspect(a)?;
        p.aspect_ratio = a.clone();
    }
    if let Some(b) = u.bpm {
        if !(40..=220).contains(&b) {
            return invalid("BPM must be between 40 and 220.");
        }
        p.bpm = Some(b);
    }
    if let Some(t) = u.target_seconds {
        if !(1..=3600).contains(&t) {
            return invalid("Target length must be between 1 and 3600 seconds.");
        }
        p.target_seconds = Some(t);
    }
    if let Some(m) = &u.music_media_id {
        if m.is_empty() {
            p.music_media_id = None;
        } else {
            let kind: Option<String> = conn
                .query_row("SELECT kind FROM media_items WHERE id = ?1", [m], |r| {
                    r.get(0)
                })
                .optional()?;
            match kind.as_deref() {
                Some("audio") => p.music_media_id = Some(m.clone()),
                Some(_) => return invalid("The music track must be an audio file."),
                None => return Err(not_found("Music track")),
            }
        }
    }
    if let Some(v) = u.music_volume {
        if !(0.0..=1.0).contains(&v) {
            return invalid("Music volume must be between 0 and 100%.");
        }
        p.music_volume = v;
    }
    conn.execute(
        "UPDATE projects SET title=?2, description=?3, status=?4, aspect_ratio=?5, bpm=?6,
            target_seconds=?7, music_media_id=?8, music_volume=?9, updated_at=?10 WHERE id=?1",
        params![
            id,
            p.title,
            p.description,
            p.status,
            p.aspect_ratio,
            p.bpm,
            p.target_seconds,
            p.music_media_id,
            p.music_volume,
            now()
        ],
    )?;
    let p = get(conn, id)?;
    write_manifest(&p);
    Ok(p)
}

pub fn set_archived(conn: &Connection, id: &str, archived: bool) -> AppResult<Project> {
    let n = conn.execute(
        "UPDATE projects SET archived = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, archived as i64, now()],
    )?;
    if n == 0 {
        return Err(not_found("Project"));
    }
    get(conn, id)
}

/// Deletes the record (cascades to script, scenes, speakers, jobs).
/// Returns the folder path so the caller can decide whether to remove files.
pub fn delete(conn: &Connection, id: &str) -> AppResult<String> {
    let p = get(conn, id)?;
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(p.folder_path)
}

/// project.json is a human-readable marker/backup of the project metadata.
/// It also proves a folder belongs to a project before we ever delete it.
pub fn write_manifest(p: &Project) {
    let manifest = serde_json::json!({
        "app": "Gospel AI Studio",
        "formatVersion": 1,
        "id": p.id,
        "kind": p.kind,
        "title": p.title,
        "description": p.description,
        "aspectRatio": p.aspect_ratio,
        "createdAt": p.created_at,
        "updatedAt": p.updated_at,
    });
    let path = Path::new(&p.folder_path).join("project.json");
    let _ = write_atomic(
        &path,
        serde_json::to_string_pretty(&manifest)
            .unwrap_or_default()
            .as_bytes(),
    );
}

pub fn folder_is_owned_by(folder: &Path, id: &str) -> bool {
    std::fs::read_to_string(folder.join("project.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .map(|v| v.get("id").and_then(|x| x.as_str()) == Some(id))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_update_archive_delete() {
        let conn = crate::db::open_memory();
        let dir = tempfile::tempdir().unwrap();
        let p = create(
            &conn,
            &CreateProject {
                kind: "hypeman".into(),
                title: " Sunday Fire ".into(),
                description: "".into(),
                aspect_ratio: None,
            },
            dir.path(),
            "9:16",
        )
        .unwrap();
        assert_eq!(p.title, "Sunday Fire");
        assert_eq!(p.aspect_ratio, "9:16");
        assert_eq!(p.bpm, Some(120));
        assert!(Path::new(&p.folder_path).join("exports").is_dir());
        assert!(folder_is_owned_by(Path::new(&p.folder_path), &p.id));

        let p = update(
            &conn,
            &p.id,
            &UpdateProject {
                status: Some("review".into()),
                bpm: Some(140),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(p.status, "review");
        assert_eq!(p.bpm, Some(140));
        assert!(update(
            &conn,
            &p.id,
            &UpdateProject {
                bpm: Some(5),
                ..Default::default()
            }
        )
        .is_err());

        set_archived(&conn, &p.id, true).unwrap();
        let q = ListQuery {
            kind: Some("hypeman".into()),
            include_archived: false,
            search: None,
            limit: None,
        };
        assert_eq!(list(&conn, &q).unwrap().len(), 0);
        let q = ListQuery {
            include_archived: true,
            ..q
        };
        assert_eq!(list(&conn, &q).unwrap().len(), 1);

        delete(&conn, &p.id).unwrap();
        assert!(get(&conn, &p.id).is_err());
    }

    #[test]
    fn rejects_bad_input() {
        let conn = crate::db::open_memory();
        let dir = tempfile::tempdir().unwrap();
        let bad = CreateProject {
            kind: "movie".into(),
            title: "x".into(),
            description: "".into(),
            aspect_ratio: None,
        };
        assert!(create(&conn, &bad, dir.path(), "16:9").is_err());
        let bad = CreateProject {
            kind: "conversation".into(),
            title: "  ".into(),
            description: "".into(),
            aspect_ratio: None,
        };
        assert!(create(&conn, &bad, dir.path(), "16:9").is_err());
    }
}
