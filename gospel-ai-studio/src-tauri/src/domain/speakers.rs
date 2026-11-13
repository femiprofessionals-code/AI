use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::{invalid, not_found, AppResult};
use crate::util::{new_id, now};

pub const PALETTE: &[&str] = &[
    "#c9a227", "#4f8fd6", "#c4566b", "#4caf84", "#9b6dd6", "#e07b39", "#3fb3b8", "#b0b357",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Speaker {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub role: String,
    pub color: String,
    pub sort_order: i64,
    pub scene_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerInput {
    pub name: String,
    #[serde(default)]
    pub role: String,
    pub color: Option<String>,
}

pub fn list(conn: &Connection, project_id: &str) -> AppResult<Vec<Speaker>> {
    let mut stmt = conn.prepare(
        "SELECT sp.id, sp.project_id, sp.name, sp.role, sp.color, sp.sort_order,
            (SELECT COUNT(*) FROM scenes s WHERE s.speaker_id = sp.id)
         FROM speakers sp WHERE sp.project_id = ?1 ORDER BY sp.sort_order, sp.created_at",
    )?;
    let rows = stmt.query_map([project_id], |r| {
        Ok(Speaker {
            id: r.get(0)?,
            project_id: r.get(1)?,
            name: r.get(2)?,
            role: r.get(3)?,
            color: r.get(4)?,
            sort_order: r.get(5)?,
            scene_count: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn get(conn: &Connection, id: &str) -> AppResult<Speaker> {
    let project_id: String = conn
        .query_row("SELECT project_id FROM speakers WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .optional()?
        .ok_or_else(|| not_found("Speaker"))?;
    list(conn, &project_id)?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| not_found("Speaker"))
}

fn clean(input: &SpeakerInput) -> AppResult<(String, String, Option<String>)> {
    let name = input.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 40 {
        return invalid("Speaker name must be 1-40 characters.");
    }
    if let Some(c) = &input.color {
        let ok =
            c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|x| x.is_ascii_hexdigit());
        if !ok {
            return invalid("Colour must look like #RRGGBB.");
        }
    }
    Ok((name, input.role.trim().to_string(), input.color.clone()))
}

fn name_taken(
    conn: &Connection,
    project_id: &str,
    name: &str,
    except: Option<&str>,
) -> AppResult<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM speakers WHERE project_id = ?1 AND lower(name) = lower(?2)
           AND (?3 IS NULL OR id <> ?3)",
        params![project_id, name, except],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

pub fn create(conn: &Connection, project_id: &str, input: &SpeakerInput) -> AppResult<Speaker> {
    let (name, role, color) = clean(input)?;
    if name_taken(conn, project_id, &name, None)? {
        return invalid(format!("A speaker named \"{name}\" already exists."));
    }
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM speakers WHERE project_id = ?1",
        [project_id],
        |r| r.get(0),
    )?;
    let color = color.unwrap_or_else(|| PALETTE[(count as usize) % PALETTE.len()].to_string());
    let id = new_id();
    conn.execute(
        "INSERT INTO speakers (id, project_id, name, role, color, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, project_id, name, role, color, count, now()],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: &SpeakerInput) -> AppResult<Speaker> {
    let cur = get(conn, id)?;
    let (name, role, color) = clean(input)?;
    if name_taken(conn, &cur.project_id, &name, Some(id))? {
        return invalid(format!("A speaker named \"{name}\" already exists."));
    }
    conn.execute(
        "UPDATE speakers SET name = ?2, role = ?3, color = ?4 WHERE id = ?1",
        params![id, name, role, color.unwrap_or(cur.color)],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    if conn.execute("DELETE FROM speakers WHERE id = ?1", [id])? == 0 {
        return Err(not_found("Speaker"));
    }
    Ok(())
}

/// Finds a speaker by case-insensitive name, creating it if missing.
pub fn ensure(conn: &Connection, project_id: &str, name: &str) -> AppResult<String> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM speakers WHERE project_id = ?1 AND lower(name) = lower(?2)",
            params![project_id, name.trim()],
            |r| r.get(0),
        )
        .optional()?;
    match existing {
        Some(id) => Ok(id),
        None => Ok(create(
            conn,
            project_id,
            &SpeakerInput {
                name: name.into(),
                role: String::new(),
                color: None,
            },
        )?
        .id),
    }
}
