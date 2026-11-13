use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::error::{invalid, not_found, AppResult};
use crate::media::ffmpeg::ProbeInfo;
use crate::util::{new_id, now};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub original_name: String,
    pub file_path: String,
    pub managed: bool,
    pub file_size: i64,
    pub duration_ms: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub has_audio: bool,
    pub thumbnail_path: Option<String>,
    pub probe_status: String,
    pub tags: String,
    pub created_at: String,
    pub usage_count: i64,
    pub file_missing: bool,
}

const SELECT: &str = "SELECT m.id, m.kind, m.title, m.original_name, m.file_path, m.managed,
    m.file_size, m.duration_ms, m.width, m.height, m.has_audio, m.thumbnail_path,
    m.probe_status, m.tags, m.created_at,
    (SELECT COUNT(*) FROM scenes s WHERE s.visual_media_id = m.id OR s.audio_media_id = m.id)
      + (SELECT COUNT(*) FROM projects p WHERE p.music_media_id = m.id)
    FROM media_items m";

fn from_row(r: &Row) -> rusqlite::Result<MediaItem> {
    let file_path: String = r.get(4)?;
    Ok(MediaItem {
        id: r.get(0)?,
        kind: r.get(1)?,
        title: r.get(2)?,
        original_name: r.get(3)?,
        file_missing: !Path::new(&file_path).exists(),
        file_path,
        managed: r.get::<_, i64>(5)? == 1,
        file_size: r.get(6)?,
        duration_ms: r.get(7)?,
        width: r.get(8)?,
        height: r.get(9)?,
        has_audio: r.get::<_, i64>(10)? == 1,
        thumbnail_path: r.get(11)?,
        probe_status: r.get(12)?,
        tags: r.get(13)?,
        created_at: r.get(14)?,
        usage_count: r.get(15)?,
    })
}

pub fn kind_for(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif" => Some("image"),
        "mp4" | "mov" | "mkv" | "webm" | "avi" | "m4v" => Some("video"),
        "mp3" | "wav" | "m4a" | "aac" | "ogg" | "flac" | "opus" => Some("audio"),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaQuery {
    pub kind: Option<String>,
    pub search: Option<String>,
}

pub fn list(conn: &Connection, q: &MediaQuery) -> AppResult<Vec<MediaItem>> {
    let search = q
        .search
        .as_ref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{}%", s.replace('%', "\\%")));
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE (?1 IS NULL OR m.kind = ?1)
           AND (?2 IS NULL OR lower(m.title) LIKE ?2 ESCAPE '\\' OR m.tags LIKE ?2 ESCAPE '\\'
                OR lower(m.original_name) LIKE ?2 ESCAPE '\\')
         ORDER BY m.created_at DESC, m.title"
    ))?;
    let rows = stmt.query_map(params![q.kind, search], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<MediaItem> {
    conn.query_row(&format!("{SELECT} WHERE m.id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| not_found("Media item"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: Vec<MediaItem>,
    pub skipped: Vec<String>,
}

/// Imports files. In "copy" mode files are copied into
/// `<library>/<kind>s/<id>.<ext>`; in "link" mode they are referenced in place.
pub fn import(
    conn: &Connection,
    paths: &[String],
    library_dir: &Path,
    mode: &str,
) -> AppResult<ImportResult> {
    let mut imported = Vec::new();
    let mut skipped = Vec::new();
    for raw in paths {
        let src = PathBuf::from(raw);
        let name = src
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| raw.clone());
        let Some(kind) = kind_for(&src) else {
            skipped.push(format!("{name}: unsupported file type"));
            continue;
        };
        let meta = match std::fs::metadata(&src) {
            Ok(m) if m.is_file() => m,
            _ => {
                skipped.push(format!("{name}: file not found"));
                continue;
            }
        };
        let id = new_id();
        let (dest, managed) = if mode == "link" {
            (crate::util::strip_verbatim(src.clone()), false)
        } else {
            let ext = src
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            let dir = library_dir.join(match kind {
                "image" => "Images",
                "video" => "Videos",
                _ => "Audio",
            });
            std::fs::create_dir_all(&dir)?;
            let dest = dir.join(format!("{id}.{ext}"));
            if let Err(e) = std::fs::copy(&src, &dest) {
                skipped.push(format!("{name}: could not copy ({e})"));
                continue;
            }
            (dest, true)
        };
        let title = src
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| name.clone());
        conn.execute(
            "INSERT INTO media_items (id, kind, title, original_name, file_path, managed, file_size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, kind, title, name, dest.to_string_lossy(), managed as i64, meta.len() as i64, now()],
        )?;
        imported.push(get(conn, &id)?);
    }
    Ok(ImportResult { imported, skipped })
}

pub fn set_probe_result(
    conn: &Connection,
    id: &str,
    info: Option<&ProbeInfo>,
    thumbnail: Option<&Path>,
) -> AppResult<()> {
    match info {
        Some(i) => conn.execute(
            "UPDATE media_items SET duration_ms = ?2, width = ?3, height = ?4, has_audio = ?5,
                thumbnail_path = ?6, probe_status = 'ready' WHERE id = ?1",
            params![
                id,
                i.duration_ms,
                i.width,
                i.height,
                i.has_audio as i64,
                thumbnail.map(|t| t.to_string_lossy().to_string())
            ],
        )?,
        None => conn.execute(
            "UPDATE media_items SET probe_status = 'failed', thumbnail_path = ?2 WHERE id = ?1",
            params![id, thumbnail.map(|t| t.to_string_lossy().to_string())],
        )?,
    };
    Ok(())
}

pub fn pending_ids(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT id FROM media_items WHERE probe_status = 'pending' ORDER BY created_at")?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn mark_pending(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE media_items SET probe_status = 'pending' WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUpdate {
    pub title: Option<String>,
    pub tags: Option<String>,
}

pub fn normalize_tags(raw: &str) -> String {
    let mut tags: Vec<String> = Vec::new();
    for t in raw
        .split(',')
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty())
    {
        if !tags.contains(&t) {
            tags.push(t);
        }
    }
    tags.join(", ")
}

pub fn update(conn: &Connection, id: &str, u: &MediaUpdate) -> AppResult<MediaItem> {
    let cur = get(conn, id)?;
    let title = match &u.title {
        Some(t) if t.trim().is_empty() => return invalid("Title cannot be empty."),
        Some(t) => t.trim().to_string(),
        None => cur.title,
    };
    let tags = u.tags.as_deref().map(normalize_tags).unwrap_or(cur.tags);
    conn.execute(
        "UPDATE media_items SET title = ?2, tags = ?3 WHERE id = ?1",
        params![id, title, tags],
    )?;
    get(conn, id)
}

/// Removes the record. Returns the item so the caller can delete managed files.
pub fn delete(conn: &Connection, id: &str) -> AppResult<MediaItem> {
    let item = get(conn, id)?;
    conn.execute("DELETE FROM media_items WHERE id = ?1", [id])?;
    Ok(item)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub images: i64,
    pub videos: i64,
    pub audio: i64,
    pub total_bytes: i64,
}

pub fn stats(conn: &Connection) -> AppResult<LibraryStats> {
    Ok(conn.query_row(
        "SELECT
           COALESCE(SUM(kind = 'image'), 0), COALESCE(SUM(kind = 'video'), 0),
           COALESCE(SUM(kind = 'audio'), 0), COALESCE(SUM(CASE WHEN managed = 1 THEN file_size ELSE 0 END), 0)
         FROM media_items",
        [],
        |r| Ok(LibraryStats { images: r.get(0)?, videos: r.get(1)?, audio: r.get(2)?, total_bytes: r.get(3)? }),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_copy_and_link() {
        let conn = crate::db::open_memory();
        let src = tempfile::tempdir().unwrap();
        let lib = tempfile::tempdir().unwrap();
        let img = src.path().join("Sunrise.PNG");
        std::fs::write(&img, b"fake").unwrap();
        let txt = src.path().join("notes.txt");
        std::fs::write(&txt, b"x").unwrap();
        let paths = vec![
            img.to_string_lossy().to_string(),
            txt.to_string_lossy().to_string(),
            "/nope/a.mp3".to_string(),
        ];
        let r = import(&conn, &paths, lib.path(), "copy").unwrap();
        assert_eq!(r.imported.len(), 1);
        assert_eq!(r.skipped.len(), 2);
        let item = &r.imported[0];
        assert_eq!(item.kind, "image");
        assert_eq!(item.title, "Sunrise");
        assert!(item.managed);
        assert!(Path::new(&item.file_path).starts_with(lib.path().join("Images")));

        let r = import(&conn, &paths[..1], lib.path(), "link").unwrap();
        assert!(!r.imported[0].managed);

        let u = update(
            &conn,
            &item.id,
            &MediaUpdate {
                title: None,
                tags: Some(" Worship, Sky ,worship".into()),
            },
        )
        .unwrap();
        assert_eq!(u.tags, "worship, sky");
        assert_eq!(
            list(
                &conn,
                &MediaQuery {
                    kind: Some("image".into()),
                    search: Some("sky".into())
                }
            )
            .unwrap()
            .len(),
            1
        );
        assert_eq!(stats(&conn).unwrap().images, 2);
    }
}
