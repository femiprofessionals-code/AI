use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use crate::domain::{script_parse, scripts, speakers};
use crate::error::{invalid, not_found, AppResult};
use crate::util::{new_id, now};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub project_id: String,
    pub position: i64,
    pub title: String,
    pub script_text: String,
    pub speaker_id: Option<String>,
    pub speaker_name: Option<String>,
    pub speaker_color: Option<String>,
    pub visual_media_id: Option<String>,
    pub visual_kind: Option<String>,
    pub visual_title: Option<String>,
    pub visual_thumbnail: Option<String>,
    pub visual_path: Option<String>,
    pub audio_media_id: Option<String>,
    pub audio_title: Option<String>,
    pub audio_duration_ms: Option<i64>,
    pub audio_path: Option<String>,
    pub duration_ms: i64,
    pub notes: String,
    pub updated_at: String,
}

const SELECT: &str = "SELECT s.id, s.project_id, s.position, s.title, s.script_text,
    s.speaker_id, sp.name, sp.color,
    s.visual_media_id, v.kind, v.title, v.thumbnail_path,
    s.audio_media_id, a.title, a.duration_ms,
    s.duration_ms, s.notes, s.updated_at, v.file_path, a.file_path
    FROM scenes s
    LEFT JOIN speakers sp ON sp.id = s.speaker_id
    LEFT JOIN media_items v ON v.id = s.visual_media_id
    LEFT JOIN media_items a ON a.id = s.audio_media_id";

fn from_row(r: &Row) -> rusqlite::Result<Scene> {
    Ok(Scene {
        id: r.get(0)?,
        project_id: r.get(1)?,
        position: r.get(2)?,
        title: r.get(3)?,
        script_text: r.get(4)?,
        speaker_id: r.get(5)?,
        speaker_name: r.get(6)?,
        speaker_color: r.get(7)?,
        visual_media_id: r.get(8)?,
        visual_kind: r.get(9)?,
        visual_title: r.get(10)?,
        visual_thumbnail: r.get(11)?,
        audio_media_id: r.get(12)?,
        audio_title: r.get(13)?,
        audio_duration_ms: r.get(14)?,
        duration_ms: r.get(15)?,
        notes: r.get(16)?,
        updated_at: r.get(17)?,
        visual_path: r.get(18)?,
        audio_path: r.get(19)?,
    })
}

pub fn list(conn: &Connection, project_id: &str) -> AppResult<Vec<Scene>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE s.project_id = ?1 ORDER BY s.position"
    ))?;
    let rows = stmt.query_map([project_id], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Scene> {
    conn.query_row(&format!("{SELECT} WHERE s.id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| not_found("Scene"))
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SceneInput {
    pub title: Option<String>,
    pub script_text: Option<String>,
    /// "" clears the field
    pub speaker_id: Option<String>,
    pub visual_media_id: Option<String>,
    pub audio_media_id: Option<String>,
    pub duration_ms: Option<i64>,
    pub notes: Option<String>,
}

fn opt_ref(v: &Option<String>, current: Option<String>) -> Option<String> {
    match v {
        None => current,
        Some(s) if s.is_empty() => None,
        Some(s) => Some(s.clone()),
    }
}

fn check_refs(
    conn: &Connection,
    project_id: &str,
    speaker: &Option<String>,
    visual: &Option<String>,
    audio: &Option<String>,
) -> AppResult<()> {
    if let Some(sp) = speaker {
        let owner: Option<String> = conn
            .query_row("SELECT project_id FROM speakers WHERE id = ?1", [sp], |r| {
                r.get(0)
            })
            .optional()?;
        if owner.as_deref() != Some(project_id) {
            return Err(not_found("Speaker"));
        }
    }
    let kind_of = |id: &str| -> AppResult<Option<String>> {
        Ok(conn
            .query_row("SELECT kind FROM media_items WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()?)
    };
    if let Some(v) = visual {
        match kind_of(v)?.as_deref() {
            Some("image") | Some("video") => {}
            Some(_) => return invalid("The scene visual must be an image or a video."),
            None => return Err(not_found("Visual media")),
        }
    }
    if let Some(a) = audio {
        match kind_of(a)?.as_deref() {
            Some("audio") => {}
            Some(_) => return invalid("The scene audio must be an audio file."),
            None => return Err(not_found("Audio media")),
        }
    }
    Ok(())
}

fn check_duration(d: i64) -> AppResult<()> {
    if (500..=600_000).contains(&d) {
        Ok(())
    } else {
        invalid("Scene duration must be between 0.5 and 600 seconds.")
    }
}

/// Inserts a scene after `after_position` (or at the end).
pub fn create(
    conn: &Connection,
    project_id: &str,
    input: &SceneInput,
    after_position: Option<i64>,
) -> AppResult<Scene> {
    let tx = conn.unchecked_transaction()?;
    let id = insert(&tx, project_id, input, after_position)?;
    tx.commit()?;
    get(conn, &id)
}

/// Insert without opening a transaction (callers may already be inside one).
fn insert(
    conn: &Connection,
    project_id: &str,
    input: &SceneInput,
    after_position: Option<i64>,
) -> AppResult<String> {
    let exists: Option<i64> = conn
        .query_row("SELECT 1 FROM projects WHERE id = ?1", [project_id], |r| {
            r.get(0)
        })
        .optional()?;
    if exists.is_none() {
        return Err(not_found("Project"));
    }
    let speaker = opt_ref(&input.speaker_id, None);
    let visual = opt_ref(&input.visual_media_id, None);
    let audio = opt_ref(&input.audio_media_id, None);
    check_refs(conn, project_id, &speaker, &visual, &audio)?;
    let duration = input.duration_ms.unwrap_or(4000);
    check_duration(duration)?;

    let max: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) FROM scenes WHERE project_id = ?1",
        [project_id],
        |r| r.get(0),
    )?;
    let pos = match after_position {
        Some(p) if p < max => {
            conn.execute(
                "UPDATE scenes SET position = position + 1 WHERE project_id = ?1 AND position > ?2",
                params![project_id, p],
            )?;
            p + 1
        }
        _ => max + 1,
    };
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO scenes (id, project_id, position, title, script_text, speaker_id, visual_media_id,
            audio_media_id, duration_ms, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![id, project_id, pos, input.title.clone().unwrap_or_default().trim(),
                input.script_text.clone().unwrap_or_default(), speaker, visual, audio, duration,
                input.notes.clone().unwrap_or_default(), ts],
    )?;
    conn.execute(
        "UPDATE projects SET updated_at = ?2 WHERE id = ?1",
        params![project_id, ts],
    )?;
    Ok(id)
}

pub fn update(conn: &Connection, id: &str, input: &SceneInput) -> AppResult<Scene> {
    let cur = get(conn, id)?;
    let speaker = opt_ref(&input.speaker_id, cur.speaker_id.clone());
    let visual = opt_ref(&input.visual_media_id, cur.visual_media_id.clone());
    let audio = opt_ref(&input.audio_media_id, cur.audio_media_id.clone());
    check_refs(conn, &cur.project_id, &speaker, &visual, &audio)?;
    let duration = input.duration_ms.unwrap_or(cur.duration_ms);
    check_duration(duration)?;
    let ts = now();
    conn.execute(
        "UPDATE scenes SET title = ?2, script_text = ?3, speaker_id = ?4, visual_media_id = ?5,
            audio_media_id = ?6, duration_ms = ?7, notes = ?8, updated_at = ?9 WHERE id = ?1",
        params![
            id,
            input.title.as_deref().map(str::trim).unwrap_or(&cur.title),
            input.script_text.as_ref().unwrap_or(&cur.script_text),
            speaker,
            visual,
            audio,
            duration,
            input.notes.as_ref().unwrap_or(&cur.notes),
            ts
        ],
    )?;
    conn.execute(
        "UPDATE projects SET updated_at = ?2 WHERE id = ?1",
        params![cur.project_id, ts],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let cur = get(conn, id)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM scenes WHERE id = ?1", [id])?;
    tx.execute(
        "UPDATE scenes SET position = position - 1 WHERE project_id = ?1 AND position > ?2",
        params![cur.project_id, cur.position],
    )?;
    tx.commit()?;
    Ok(())
}

pub fn duplicate(conn: &Connection, id: &str) -> AppResult<Scene> {
    let s = get(conn, id)?;
    let input = SceneInput {
        title: Some(format!("{} (copy)", s.title).trim().to_string()),
        script_text: Some(s.script_text.clone()),
        speaker_id: s.speaker_id.clone(),
        visual_media_id: s.visual_media_id.clone(),
        audio_media_id: s.audio_media_id.clone(),
        duration_ms: Some(s.duration_ms),
        notes: Some(s.notes.clone()),
    };
    create(conn, &s.project_id, &input, Some(s.position))
}

/// `ordered_ids` must contain exactly the project's scene ids.
pub fn reorder(
    conn: &Connection,
    project_id: &str,
    ordered_ids: &[String],
) -> AppResult<Vec<Scene>> {
    let current = list(conn, project_id)?;
    let mut a: Vec<&String> = current.iter().map(|s| &s.id).collect();
    let mut b: Vec<&String> = ordered_ids.iter().collect();
    a.sort();
    b.sort();
    if a != b {
        return invalid("The scene list changed while reordering. Please try again.");
    }
    let tx = conn.unchecked_transaction()?;
    // Two passes avoid transient duplicate positions.
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE scenes SET position = ?2 WHERE id = ?1",
            params![id, -(i as i64) - 1],
        )?;
    }
    tx.execute(
        "UPDATE scenes SET position = -position - 1 WHERE project_id = ?1",
        [project_id],
    )?;
    tx.execute(
        "UPDATE projects SET updated_at = ?2 WHERE id = ?1",
        params![project_id, now()],
    )?;
    tx.commit()?;
    list(conn, project_id)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub created: usize,
    pub speakers_created: usize,
    pub scenes: Vec<Scene>,
}

/// Splits the saved script into scenes (deterministic text rules, not AI).
pub fn generate_from_script(
    conn: &Connection,
    project_id: &str,
    replace: bool,
    wpm: i64,
) -> AppResult<GenerateResult> {
    let kind: String = conn
        .query_row(
            "SELECT kind FROM projects WHERE id = ?1",
            [project_id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or_else(|| not_found("Project"))?;
    let script = scripts::get(conn, project_id)?;
    let beats = if kind == "conversation" {
        script_parse::parse_conversation(&script.content)
    } else {
        script_parse::parse_hypeman(&script.content)
    };
    if beats.is_empty() {
        return invalid("The script is empty, so there is nothing to turn into scenes yet.");
    }
    let speakers_before = speakers::list(conn, project_id)?.len();
    let tx = conn.unchecked_transaction()?;
    if replace {
        tx.execute("DELETE FROM scenes WHERE project_id = ?1", [project_id])?;
    }
    let mut created = 0;
    for b in &beats {
        let speaker_id = match &b.speaker {
            Some(name) if kind == "conversation" => Some(speakers::ensure(&tx, project_id, name)?),
            _ => None,
        };
        let text = match (&b.speaker, kind.as_str()) {
            (Some(name), "hypeman") => format!("{name}: {}", b.text),
            _ => b.text.clone(),
        };
        let input = SceneInput {
            title: Some(b.title.chars().take(120).collect()),
            script_text: Some(text.clone()),
            speaker_id: speaker_id.clone(),
            duration_ms: Some(script_parse::estimate_ms(&text, wpm).min(600_000)),
            notes: Some(b.notes.clone()),
            ..Default::default()
        };
        insert(&tx, project_id, &input, None)?;
        created += 1;
    }
    tx.commit()?;
    let speakers_after = speakers::list(conn, project_id)?.len();
    Ok(GenerateResult {
        created,
        speakers_created: speakers_after - speakers_before,
        scenes: list(conn, project_id)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::projects::{create as create_project, CreateProject};

    fn project(conn: &Connection, kind: &str, dir: &std::path::Path) -> String {
        create_project(
            conn,
            &CreateProject {
                kind: kind.into(),
                title: "P".into(),
                description: "".into(),
                aspect_ratio: None,
            },
            dir,
            "16:9",
        )
        .unwrap()
        .id
    }

    #[test]
    fn crud_and_reorder() {
        let conn = crate::db::open_memory();
        let dir = tempfile::tempdir().unwrap();
        let pid = project(&conn, "conversation", dir.path());
        let a = create(
            &conn,
            &pid,
            &SceneInput {
                title: Some("A".into()),
                ..Default::default()
            },
            None,
        )
        .unwrap();
        let b = create(
            &conn,
            &pid,
            &SceneInput {
                title: Some("B".into()),
                ..Default::default()
            },
            None,
        )
        .unwrap();
        let c = create(
            &conn,
            &pid,
            &SceneInput {
                title: Some("C".into()),
                ..Default::default()
            },
            Some(0),
        )
        .unwrap();
        let titles: Vec<_> = list(&conn, &pid)
            .unwrap()
            .into_iter()
            .map(|s| s.title)
            .collect();
        assert_eq!(titles, ["A", "C", "B"]);
        let ordered = reorder(&conn, &pid, &[b.id.clone(), a.id.clone(), c.id.clone()]).unwrap();
        assert_eq!(
            ordered.iter().map(|s| s.position).collect::<Vec<_>>(),
            [0, 1, 2]
        );
        assert_eq!(ordered[0].title, "B");
        assert!(reorder(&conn, &pid, std::slice::from_ref(&a.id)).is_err());
        delete(&conn, &a.id).unwrap();
        let rest = list(&conn, &pid).unwrap();
        assert_eq!(rest.iter().map(|s| s.position).collect::<Vec<_>>(), [0, 1]);
        let d = duplicate(&conn, &rest[0].id).unwrap();
        assert_eq!(d.position, 1);
        assert!(update(
            &conn,
            &d.id,
            &SceneInput {
                duration_ms: Some(10),
                ..Default::default()
            }
        )
        .is_err());
    }

    #[test]
    fn generate_conversation() {
        let conn = crate::db::open_memory();
        let dir = tempfile::tempdir().unwrap();
        let pid = project(&conn, "conversation", dir.path());
        scripts::save(
            &conn,
            &pid,
            "PASTOR: Welcome home.\n\nSEEKER: Thank you.\n\npastor: Amen.",
        )
        .unwrap();
        let r = generate_from_script(&conn, &pid, true, 150).unwrap();
        assert_eq!(r.created, 3);
        assert_eq!(r.speakers_created, 2);
        assert_eq!(r.scenes[2].speaker_name.as_deref(), Some("PASTOR"));
        let r = generate_from_script(&conn, &pid, true, 150).unwrap();
        assert_eq!(r.scenes.len(), 3);
        assert_eq!(r.speakers_created, 0);
    }
}
