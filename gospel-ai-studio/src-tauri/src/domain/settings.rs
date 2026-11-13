use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{invalid, AppResult};
use crate::util::now;

/// User settings. Stored one key per row in the `settings` table so new
/// settings can be added without a migration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Root folder for projects, library and backups. Never inside the install dir.
    pub workspace_root: String,
    /// Explicit FFmpeg executable; empty = auto-detect on PATH / common locations.
    pub ffmpeg_path: String,
    /// "copy" = copy imports into the library folder, "link" = reference in place.
    pub import_mode: String,
    pub autosave_delay_ms: i64,
    pub words_per_minute_conversation: i64,
    pub words_per_minute_hypeman: i64,
    pub default_aspect_conversation: String,
    pub default_aspect_hypeman: String,
    /// "720p" or "1080p"
    pub render_quality: String,
    /// Encoder threads for FFmpeg (keep low on dual-core laptops).
    pub render_threads: i64,
    /// Font file used for text cards in draft renders; empty = auto-detect.
    pub render_font_path: String,
    /// "system" | "dark" | "light"
    pub theme: String,
}

impl Settings {
    pub fn defaults(default_workspace: &str) -> Self {
        Settings {
            workspace_root: default_workspace.to_string(),
            ffmpeg_path: String::new(),
            import_mode: "copy".into(),
            autosave_delay_ms: 800,
            words_per_minute_conversation: 150,
            words_per_minute_hypeman: 170,
            default_aspect_conversation: "16:9".into(),
            default_aspect_hypeman: "9:16".into(),
            render_quality: "720p".into(),
            render_threads: 2,
            render_font_path: String::new(),
            theme: "system".into(),
        }
    }

    pub fn validate(&self) -> AppResult<()> {
        if self.workspace_root.trim().is_empty() {
            return invalid("Workspace folder cannot be empty.");
        }
        if !matches!(self.import_mode.as_str(), "copy" | "link") {
            return invalid("Import mode must be 'copy' or 'link'.");
        }
        if !(300..=10_000).contains(&self.autosave_delay_ms) {
            return invalid("Autosave delay must be between 300 and 10000 ms.");
        }
        for wpm in [
            self.words_per_minute_conversation,
            self.words_per_minute_hypeman,
        ] {
            if !(60..=320).contains(&wpm) {
                return invalid("Words per minute must be between 60 and 320.");
            }
        }
        for a in [
            &self.default_aspect_conversation,
            &self.default_aspect_hypeman,
        ] {
            if !matches!(a.as_str(), "16:9" | "9:16" | "1:1") {
                return invalid("Aspect ratio must be 16:9, 9:16 or 1:1.");
            }
        }
        if !matches!(self.render_quality.as_str(), "720p" | "1080p") {
            return invalid("Render quality must be 720p or 1080p.");
        }
        if !(1..=16).contains(&self.render_threads) {
            return invalid("Render threads must be between 1 and 16.");
        }
        if !matches!(self.theme.as_str(), "system" | "dark" | "light") {
            return invalid("Theme must be system, dark or light.");
        }
        Ok(())
    }
}

pub fn load(conn: &Connection, default_workspace: &str) -> AppResult<Settings> {
    let mut map = match serde_json::to_value(Settings::defaults(default_workspace))? {
        Value::Object(m) => m,
        _ => unreachable!(),
    };
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (k, v) = row?;
        if map.contains_key(&k) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&v) {
                map.insert(k, parsed);
            }
        }
    }
    // Fall back to defaults if a stored value has the wrong type.
    Ok(serde_json::from_value(Value::Object(map))
        .unwrap_or_else(|_| Settings::defaults(default_workspace)))
}

pub fn save(conn: &Connection, s: &Settings) -> AppResult<()> {
    s.validate()?;
    let map = match serde_json::to_value(s)? {
        Value::Object(m) => m,
        _ => unreachable!(),
    };
    let tx = conn.unchecked_transaction()?;
    let ts = now();
    for (k, v) in map {
        tx.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![k, v.to_string(), ts],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_defaults() {
        let conn = crate::db::open_memory();
        let s = load(&conn, "/w").unwrap();
        assert_eq!(s.workspace_root, "/w");
        let mut s2 = s.clone();
        s2.render_threads = 3;
        s2.theme = "dark".into();
        save(&conn, &s2).unwrap();
        assert_eq!(load(&conn, "/other").unwrap(), s2);
    }

    #[test]
    fn rejects_bad_values() {
        let mut s = Settings::defaults("/w");
        s.import_mode = "move".into();
        assert!(s.validate().is_err());
    }
}
