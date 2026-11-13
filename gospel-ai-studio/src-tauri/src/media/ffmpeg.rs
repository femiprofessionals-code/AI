//! Thin wrapper around the user's local FFmpeg/FFprobe executables.
//! FFmpeg is an external, separately installed open-source tool; the app
//! detects it and degrades gracefully (no thumbnails/renders) when missing.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tools {
    pub ffmpeg: PathBuf,
    pub ffprobe: Option<PathBuf>,
    pub version: String,
}

const EXE: &str = if cfg!(windows) { ".exe" } else { "" };

/// Create a Command that never flashes a console window on Windows.
/// `low_priority` runs the process below normal priority so the UI stays smooth.
pub fn command(program: &Path, low_priority: bool) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
        let flags = if low_priority {
            CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS
        } else {
            CREATE_NO_WINDOW
        };
        cmd.creation_flags(flags);
    }
    #[cfg(not(windows))]
    let _ = low_priority;
    cmd.stdin(Stdio::null());
    cmd
}

fn version_of(exe: &Path) -> Option<String> {
    let out = command(exe, false)
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    // "ffmpeg version 7.1 Copyright (c) ..." -> "ffmpeg version 7.1"
    let first = text.lines().next()?;
    Some(
        first
            .split(" Copyright")
            .next()
            .unwrap_or(first)
            .trim()
            .to_string(),
    )
}

fn candidates() -> Vec<PathBuf> {
    let mut c = vec![PathBuf::from(format!("ffmpeg{EXE}"))];
    if cfg!(windows) {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            c.push(
                PathBuf::from(&local)
                    .join("Microsoft")
                    .join("WinGet")
                    .join("Links")
                    .join("ffmpeg.exe"),
            );
        }
        if let Ok(home) = std::env::var("USERPROFILE") {
            c.push(
                PathBuf::from(&home)
                    .join("scoop")
                    .join("shims")
                    .join("ffmpeg.exe"),
            );
        }
        c.push(PathBuf::from(r"C:\ProgramData\chocolatey\bin\ffmpeg.exe"));
        c.push(PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"));
        c.push(PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"));
    } else {
        c.push(PathBuf::from("/usr/bin/ffmpeg"));
        c.push(PathBuf::from("/usr/local/bin/ffmpeg"));
        c.push(PathBuf::from("/opt/homebrew/bin/ffmpeg"));
    }
    c
}

fn sibling_probe(ffmpeg: &Path) -> Option<PathBuf> {
    let name = format!("ffprobe{EXE}");
    let sib = ffmpeg
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| p.join(&name));
    sib.into_iter()
        .chain(std::iter::once(PathBuf::from(&name)))
        .find(|cand| version_of(cand).is_some())
}

/// Locate FFmpeg. `configured` (from settings) wins when non-empty.
pub fn locate(configured: &str) -> Option<Tools> {
    let list = if configured.trim().is_empty() {
        candidates()
    } else {
        vec![PathBuf::from(configured.trim())]
    };
    for cand in list {
        if let Some(version) = version_of(&cand) {
            let ffprobe = sibling_probe(&cand);
            return Some(Tools {
                ffmpeg: cand,
                ffprobe,
                version,
            });
        }
    }
    None
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct ProbeInfo {
    pub duration_ms: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub has_audio: bool,
    pub has_video: bool,
}

pub fn probe(ffprobe: &Path, file: &Path) -> Result<ProbeInfo, String> {
    let out = command(ffprobe, true)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(file)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Could not run ffprobe: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr)
            .trim()
            .chars()
            .take(400)
            .collect());
    }
    parse_probe(&String::from_utf8_lossy(&out.stdout))
}

pub fn parse_probe(json: &str) -> Result<ProbeInfo, String> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let mut info = ProbeInfo::default();
    let secs = |x: Option<&serde_json::Value>| -> Option<i64> {
        x.and_then(|d| d.as_str())
            .and_then(|d| d.parse::<f64>().ok())
            .filter(|d| d.is_finite() && *d > 0.0)
            .map(|d| (d * 1000.0).round() as i64)
    };
    info.duration_ms = secs(v.pointer("/format/duration"));
    if let Some(streams) = v.get("streams").and_then(|s| s.as_array()) {
        for s in streams {
            match s.get("codec_type").and_then(|c| c.as_str()) {
                Some("video") => {
                    // Cover art in audio files shows up as an attached picture; ignore it.
                    let attached = s
                        .pointer("/disposition/attached_pic")
                        .and_then(|a| a.as_i64())
                        == Some(1);
                    if !attached && !info.has_video {
                        info.has_video = true;
                        info.width = s.get("width").and_then(|w| w.as_i64());
                        info.height = s.get("height").and_then(|h| h.as_i64());
                    }
                }
                Some("audio") => info.has_audio = true,
                _ => {}
            }
            if info.duration_ms.is_none() {
                info.duration_ms = secs(s.get("duration"));
            }
        }
    }
    Ok(info)
}

/// Writes a small JPEG thumbnail (320 px wide). For videos a frame ~1s in.
pub fn thumbnail(
    ffmpeg: &Path,
    input: &Path,
    output: &Path,
    seek_secs: Option<f64>,
) -> Result<(), String> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut cmd = command(ffmpeg, true);
    cmd.args(["-hide_banner", "-loglevel", "error", "-y"]);
    if let Some(s) = seek_secs {
        cmd.args(["-ss", &format!("{s:.2}")]);
    }
    cmd.arg("-i").arg(input);
    cmd.args([
        "-frames:v",
        "1",
        "-vf",
        "scale='min(320,iw)':-2",
        "-q:v",
        "5",
        "-threads",
        "1",
    ]);
    cmd.arg(output);
    let out = cmd
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() && output.exists() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr)
            .trim()
            .chars()
            .take(400)
            .collect())
    }
}

/// Look for a font usable by drawtext.
pub fn find_font(configured: &str) -> Option<PathBuf> {
    if !configured.trim().is_empty() {
        let p = PathBuf::from(configured.trim());
        return p.is_file().then_some(p);
    }
    let mut list: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into());
        for f in [
            "segoeuib.ttf",
            "segoeui.ttf",
            "arialbd.ttf",
            "arial.ttf",
            "calibri.ttf",
        ] {
            list.push(PathBuf::from(&windir).join("Fonts").join(f));
        }
    } else {
        for f in [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/Library/Fonts/Arial.ttf",
        ] {
            list.push(PathBuf::from(f));
        }
    }
    list.into_iter().find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_probe_json() {
        let json = r#"{"streams":[{"codec_type":"video","width":1920,"height":1080},{"codec_type":"audio"}],"format":{"duration":"12.345"}}"#;
        let p = parse_probe(json).unwrap();
        assert_eq!(
            p,
            ProbeInfo {
                duration_ms: Some(12345),
                width: Some(1920),
                height: Some(1080),
                has_audio: true,
                has_video: true
            }
        );
    }

    #[test]
    fn ignores_cover_art() {
        let json = r#"{"streams":[{"codec_type":"audio"},{"codec_type":"video","width":500,"height":500,"disposition":{"attached_pic":1}}],"format":{"duration":"3.0"}}"#;
        let p = parse_probe(json).unwrap();
        assert!(!p.has_video);
        assert_eq!(p.width, None);
    }
}
