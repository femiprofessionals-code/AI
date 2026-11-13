use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;

use crate::error::{not_found, AppResult};
use crate::util::{count_words, now, write_atomic};

/// Minimum gap between automatic revisions while the user types.
const AUTO_REVISION_SECS: i64 = 5 * 60;
/// Keep the newest N automatic revisions per project (manual ones are kept).
const MAX_AUTO_REVISIONS: i64 = 30;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDoc {
    pub project_id: String,
    pub content: String,
    pub word_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub id: i64,
    pub word_count: i64,
    pub reason: String,
    pub created_at: String,
    pub preview: String,
}

pub fn get(conn: &Connection, project_id: &str) -> AppResult<ScriptDoc> {
    conn.query_row(
        "SELECT project_id, content, word_count, updated_at FROM scripts WHERE project_id = ?1",
        [project_id],
        |r| {
            Ok(ScriptDoc {
                project_id: r.get(0)?,
                content: r.get(1)?,
                word_count: r.get(2)?,
                updated_at: r.get(3)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| not_found("Script"))
}

/// Saves the script, mirrors it to `<project>/script.txt`, and takes an
/// automatic revision when the last one is older than five minutes.
pub fn save(conn: &Connection, project_id: &str, content: &str) -> AppResult<ScriptDoc> {
    let folder: String = conn
        .query_row(
            "SELECT folder_path FROM projects WHERE id = ?1",
            [project_id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or_else(|| not_found("Project"))?;
    let words = count_words(content);
    let ts = now();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO scripts (project_id, content, word_count, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(project_id) DO UPDATE SET content = excluded.content,
           word_count = excluded.word_count, updated_at = excluded.updated_at",
        params![project_id, content, words, ts],
    )?;
    tx.execute(
        "UPDATE projects SET updated_at = ?2 WHERE id = ?1",
        params![project_id, ts],
    )?;

    let last: Option<(String, String)> = tx
        .query_row(
            "SELECT created_at, content FROM script_revisions WHERE project_id = ?1
             ORDER BY id DESC LIMIT 1",
            [project_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let due = match &last {
        None => !content.trim().is_empty(),
        Some((at, prev)) => prev != content && seconds_since(at) >= AUTO_REVISION_SECS,
    };
    if due {
        insert_revision(&tx, project_id, content, words, "auto")?;
        tx.execute(
            "DELETE FROM script_revisions WHERE project_id = ?1 AND reason = 'auto' AND id NOT IN
               (SELECT id FROM script_revisions WHERE project_id = ?1 AND reason = 'auto'
                ORDER BY id DESC LIMIT ?2)",
            params![project_id, MAX_AUTO_REVISIONS],
        )?;
    }
    tx.commit()?;

    // Plain-text mirror for portability; failure here must not lose the DB save.
    let _ = write_atomic(&Path::new(&folder).join("script.txt"), content.as_bytes());
    get(conn, project_id)
}

fn seconds_since(ts: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(ts)
        .map(|t| (chrono::Utc::now() - t.with_timezone(&chrono::Utc)).num_seconds())
        .unwrap_or(i64::MAX)
}

fn insert_revision(
    conn: &Connection,
    project_id: &str,
    content: &str,
    words: i64,
    reason: &str,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO script_revisions (project_id, content, word_count, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, content, words, reason, now()],
    )?;
    Ok(())
}

pub fn snapshot(conn: &Connection, project_id: &str) -> AppResult<()> {
    let doc = get(conn, project_id)?;
    insert_revision(conn, project_id, &doc.content, doc.word_count, "manual")
}

pub fn revisions(conn: &Connection, project_id: &str) -> AppResult<Vec<Revision>> {
    let mut stmt = conn.prepare(
        "SELECT id, word_count, reason, created_at, substr(content, 1, 160)
         FROM script_revisions WHERE project_id = ?1 ORDER BY id DESC LIMIT 100",
    )?;
    let rows = stmt.query_map([project_id], |r| {
        Ok(Revision {
            id: r.get(0)?,
            word_count: r.get(1)?,
            reason: r.get(2)?,
            created_at: r.get(3)?,
            preview: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn revision_content(conn: &Connection, revision_id: i64) -> AppResult<String> {
    conn.query_row(
        "SELECT content FROM script_revisions WHERE id = ?1",
        [revision_id],
        |r| r.get(0),
    )
    .optional()?
    .ok_or_else(|| not_found("Revision"))
}

/// Restores a revision; the current text is kept as a 'before_restore' revision.
pub fn restore(conn: &Connection, project_id: &str, revision_id: i64) -> AppResult<ScriptDoc> {
    let (owner, content): (String, String) = conn
        .query_row(
            "SELECT project_id, content FROM script_revisions WHERE id = ?1",
            [revision_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| not_found("Revision"))?;
    if owner != project_id {
        return Err(not_found("Revision"));
    }
    let cur = get(conn, project_id)?;
    insert_revision(
        conn,
        project_id,
        &cur.content,
        cur.word_count,
        "before_restore",
    )?;
    save(conn, project_id, &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::projects::{create, CreateProject};

    #[test]
    fn save_mirror_and_revisions() {
        let conn = crate::db::open_memory();
        let dir = tempfile::tempdir().unwrap();
        let p = create(
            &conn,
            &CreateProject {
                kind: "conversation".into(),
                title: "T".into(),
                description: "".into(),
                aspect_ratio: None,
            },
            dir.path(),
            "16:9",
        )
        .unwrap();
        let d = save(&conn, &p.id, "A: hello there").unwrap();
        assert_eq!(d.word_count, 3);
        assert_eq!(
            std::fs::read_to_string(Path::new(&p.folder_path).join("script.txt")).unwrap(),
            "A: hello there"
        );
        // First non-empty save creates an automatic revision; the next quick save does not.
        save(&conn, &p.id, "A: hello there friend").unwrap();
        assert_eq!(revisions(&conn, &p.id).unwrap().len(), 1);
        snapshot(&conn, &p.id).unwrap();
        let revs = revisions(&conn, &p.id).unwrap();
        assert_eq!(revs.len(), 2);
        let first = revs.last().unwrap().id;
        let restored = restore(&conn, &p.id, first).unwrap();
        assert_eq!(restored.content, "A: hello there");
        assert_eq!(revisions(&conn, &p.id).unwrap()[0].reason, "before_restore");
    }
}
