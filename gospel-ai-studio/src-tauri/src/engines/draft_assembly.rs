//! "Draft assembly": cuts each scene's image/video and audio into a single
//! MP4 with FFmpeg. Scenes without a visual become text cards. Hypeman
//! projects can mix in a background music bed. Pure FFmpeg, no AI.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::Ordering;

use super::{EngineEnv, EngineInfo, RenderContext, RenderEngine, RenderError};
use crate::media::ffmpeg;

pub struct DraftAssembly;

pub const ID: &str = "draft_assembly";

pub fn dimensions(aspect: &str, quality: &str) -> (u32, u32) {
    let short = if quality == "1080p" { 1080 } else { 720 };
    let long = short * 16 / 9;
    match aspect {
        "9:16" => (short, long),
        "1:1" => (short, short),
        _ => (long, short),
    }
}

/// Greedy word wrap for text cards (drawtext does not wrap).
pub fn wrap(text: &str, max_chars: usize, max_lines: usize) -> String {
    let mut lines: Vec<String> = Vec::new();
    for para in text.split('\n') {
        let mut line = String::new();
        for word in para.split_whitespace() {
            if !line.is_empty() && line.chars().count() + 1 + word.chars().count() > max_chars {
                lines.push(std::mem::take(&mut line));
            }
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(word);
        }
        lines.push(line);
    }
    while lines.last().map(|l| l.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    if lines.len() > max_lines {
        lines.truncate(max_lines);
        if let Some(last) = lines.last_mut() {
            last.push_str(" …");
        }
    }
    lines.join("\n")
}

impl RenderEngine for DraftAssembly {
    fn info(&self, env: &EngineEnv) -> EngineInfo {
        let (available, reason) = match env.tools {
            Some(_) => (true, None),
            None => (
                false,
                Some(
                    "FFmpeg was not found. Install FFmpeg or set its path in Settings.".to_string(),
                ),
            ),
        };
        EngineInfo {
            id: ID,
            name: "Draft assembly (FFmpeg)",
            description: "Joins each scene's image or video clip with its audio into one MP4. Scenes without visuals become text cards. Hypeman projects can add a music bed. Uses FFmpeg only; no AI model is involved.",
            uses_ai: false,
            available,
            unavailable_reason: reason,
        }
    }

    fn render(&self, ctx: &RenderContext) -> Result<PathBuf, RenderError> {
        if ctx.scenes.is_empty() {
            return Err(RenderError::Failed(
                "Add at least one scene before rendering.".into(),
            ));
        }
        std::fs::create_dir_all(&ctx.work_dir)
            .map_err(|e| fail(format!("Could not create temp folder: {e}")))?;
        let result = self.run(ctx);
        let _ = std::fs::remove_dir_all(&ctx.work_dir);
        result
    }
}

fn fail(msg: impl Into<String>) -> RenderError {
    RenderError::Failed(msg.into())
}

impl DraftAssembly {
    fn run(&self, ctx: &RenderContext) -> Result<PathBuf, RenderError> {
        let quality = ctx
            .options
            .get("quality")
            .and_then(|q| q.as_str())
            .unwrap_or(&ctx.settings.render_quality);
        let (w, h) = dimensions(&ctx.project.aspect_ratio, quality);
        let threads = ctx.settings.render_threads.to_string();
        let font = ffmpeg::find_font(&ctx.settings.render_font_path);
        let have_font = match &font {
            Some(f) => std::fs::copy(f, ctx.work_dir.join("font.ttf")).is_ok(),
            None => false,
        };

        // Validate media up front so we fail fast with a clear message.
        for (i, s) in ctx.scenes.iter().enumerate() {
            for id in [&s.visual_media_id, &s.audio_media_id]
                .into_iter()
                .flatten()
            {
                match ctx.media.get(id) {
                    Some(m) if Path::new(&m.file_path).is_file() => {}
                    Some(m) => {
                        return Err(fail(format!(
                            "Scene {} uses \"{}\", but the file is missing: {}",
                            i + 1,
                            m.title,
                            m.file_path
                        )))
                    }
                    None => {
                        return Err(fail(format!(
                            "Scene {} references media that no longer exists.",
                            i + 1
                        )))
                    }
                }
            }
        }

        let total_ms: i64 = ctx.scenes.iter().map(|s| s.duration_ms).sum();
        let mut done_ms: i64 = 0;
        let mut list = String::new();

        for (i, scene) in ctx.scenes.iter().enumerate() {
            if ctx.cancel.load(Ordering::Relaxed) {
                return Err(RenderError::Cancelled);
            }
            let secs = scene.duration_ms as f64 / 1000.0;
            let d = format!("{secs:.3}");
            let seg_name = format!("seg_{i:04}.mp4");
            let mut args: Vec<String> = vec![
                "-hide_banner".into(),
                "-y".into(),
                "-nostats".into(),
                "-progress".into(),
                "pipe:1".into(),
            ];
            let visual = scene
                .visual_media_id
                .as_ref()
                .and_then(|id| ctx.media.get(id));
            let audio = scene
                .audio_media_id
                .as_ref()
                .and_then(|id| ctx.media.get(id));

            // Input 0: visual
            let mut vf = format!(
                "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30"
            );
            match visual {
                Some(m) if m.kind == "image" => {
                    args.extend(
                        [
                            "-loop",
                            "1",
                            "-framerate",
                            "30",
                            "-t",
                            &d,
                            "-i",
                            &m.file_path,
                        ]
                        .map(String::from),
                    );
                }
                Some(m) => {
                    args.extend(
                        ["-stream_loop", "-1", "-t", &d, "-i", &m.file_path].map(String::from),
                    );
                }
                None => {
                    args.extend(
                        [
                            "-f",
                            "lavfi",
                            "-t",
                            &d,
                            "-i",
                            &format!("color=c=0x15120e:s={w}x{h}:r=30"),
                        ]
                        .map(String::from),
                    );
                    let mut card = String::new();
                    if let Some(name) = &scene.speaker_name {
                        card.push_str(&name.to_uppercase());
                        card.push_str("\n\n");
                    }
                    card.push_str(scene.script_text.trim());
                    if card.trim().is_empty() {
                        card = scene.title.clone();
                    }
                    if have_font && !card.trim().is_empty() {
                        let fs = (w.min(h) as f64 / 15.0).round() as u32;
                        let max_chars =
                            ((w as f64 * 0.84) / (fs as f64 * 0.56)).floor().max(10.0) as usize;
                        let max_lines =
                            ((h as f64 * 0.8) / (fs as f64 * 1.35)).floor().max(3.0) as usize;
                        let txt = format!("card_{i:04}.txt");
                        std::fs::write(ctx.work_dir.join(&txt), wrap(&card, max_chars, max_lines))
                            .map_err(|e| fail(e.to_string()))?;
                        vf.push_str(&format!(
                            ",drawtext=fontfile=font.ttf:textfile={txt}:fontcolor=0xF5EFE0:fontsize={fs}:line_spacing={ls}:x=(w-text_w)/2:y=(h-text_h)/2",
                            ls = fs / 3
                        ));
                    }
                }
            }
            if secs >= 1.0 {
                vf.push_str(&format!(
                    ",fade=t=in:st=0:d=0.25,fade=t=out:st={:.3}:d=0.25",
                    secs - 0.25
                ));
            }
            vf.push_str(",format=yuv420p");

            // Input 1: audio (scene audio, the clip's own sound, or silence)
            let audio_src = match (audio, visual) {
                (Some(a), _) => {
                    args.extend(["-i", &a.file_path].map(String::from));
                    "[1:a]"
                }
                (None, Some(v)) if v.kind == "video" && v.has_audio => "[0:a]",
                _ => {
                    args.extend(
                        ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"].map(String::from),
                    );
                    "[1:a]"
                }
            };
            let filter = format!(
                "[0:v]{vf}[v];{audio_src}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]"
            );
            args.extend(
                [
                    "-filter_complex",
                    &filter,
                    "-map",
                    "[v]",
                    "-map",
                    "[a]",
                    "-t",
                    &d,
                ]
                .map(String::from),
            );
            args.extend(
                [
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", "30", "-c:a",
                    "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-threads", &threads,
                    &seg_name,
                ]
                .map(String::from),
            );

            let label = format!("Scene {} of {}", i + 1, ctx.scenes.len());
            let base = done_ms;
            run_ffmpeg(ctx, &args, |out_ms| {
                let p = (base + out_ms.min(scene.duration_ms)) as f64 / total_ms as f64;
                (ctx.progress)(p * 0.92, &label);
            })?;
            done_ms += scene.duration_ms;
            list.push_str(&format!("file '{seg_name}'\n"));
        }

        std::fs::write(ctx.work_dir.join("list.txt"), list).map_err(|e| fail(e.to_string()))?;
        (ctx.progress)(0.93, "Joining scenes");
        let tmp_out = "output.mp4";

        let music = ctx
            .project
            .music_media_id
            .as_ref()
            .and_then(|id| ctx.media.get(id))
            .filter(|m| Path::new(&m.file_path).is_file());
        let mut args: Vec<String> = [
            "-hide_banner",
            "-y",
            "-nostats",
            "-progress",
            "pipe:1",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            "list.txt",
        ]
        .map(String::from)
        .to_vec();
        match music {
            Some(m) => {
                let vol = format!("{:.2}", ctx.project.music_volume);
                args.extend(["-stream_loop", "-1", "-i", &m.file_path].map(String::from));
                let filter = format!(
                    "[1:a]volume={vol},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]"
                );
                args.extend(
                    [
                        "-filter_complex",
                        &filter,
                        "-map",
                        "0:v",
                        "-map",
                        "[a]",
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "192k",
                    ]
                    .map(String::from),
                );
            }
            None => args.extend(["-c", "copy"].map(String::from)),
        }
        args.extend(["-movflags", "+faststart", "-threads", &threads, tmp_out].map(String::from));
        run_ffmpeg(ctx, &args, |out_ms| {
            (ctx.progress)(
                0.93 + 0.06 * (out_ms as f64 / total_ms.max(1) as f64).min(1.0),
                "Finishing video",
            );
        })?;

        if let Some(parent) = ctx.output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| fail(e.to_string()))?;
        }
        let produced = ctx.work_dir.join(tmp_out);
        if std::fs::rename(&produced, &ctx.output_path).is_err() {
            std::fs::copy(&produced, &ctx.output_path)
                .map_err(|e| fail(format!("Could not save the video: {e}")))?;
        }
        Ok(ctx.output_path.clone())
    }
}

/// Runs FFmpeg in the work dir (relative names avoid filter escaping issues),
/// reports `out_time` progress, and kills the process if cancelled.
fn run_ffmpeg(
    ctx: &RenderContext,
    args: &[String],
    mut on_progress: impl FnMut(i64),
) -> Result<(), RenderError> {
    let mut child = ffmpeg::command(&ctx.tools.ffmpeg, true)
        .current_dir(&ctx.work_dir)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| fail(format!("Could not start FFmpeg: {e}")))?;

    let mut stderr = child.stderr.take().expect("stderr piped");
    let err_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf);
        buf
    });

    let stdout = child.stdout.take().expect("stdout piped");
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if ctx.cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(RenderError::Cancelled);
        }
        if let Some(v) = line
            .strip_prefix("out_time_us=")
            .or_else(|| line.strip_prefix("out_time_ms="))
        {
            if let Ok(us) = v.trim().parse::<i64>() {
                on_progress(us / 1000);
            }
        }
    }
    let status = child.wait().map_err(|e| fail(e.to_string()))?;
    let stderr_text = err_thread.join().unwrap_or_default();
    if ctx.cancel.load(Ordering::Relaxed) {
        return Err(RenderError::Cancelled);
    }
    if !status.success() {
        let tail: Vec<&str> = stderr_text.lines().rev().take(8).collect();
        let tail: Vec<&str> = tail.into_iter().rev().collect();
        return Err(fail(format!("FFmpeg failed:\n{}", tail.join("\n"))));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dims() {
        assert_eq!(dimensions("16:9", "720p"), (1280, 720));
        assert_eq!(dimensions("9:16", "1080p"), (1080, 1920));
        assert_eq!(dimensions("1:1", "720p"), (720, 720));
    }

    #[test]
    fn wraps_text() {
        assert_eq!(wrap("one two three four", 9, 10), "one two\nthree\nfour");
        assert_eq!(wrap("a b c d e f", 1, 2), "a\nb …");
        assert_eq!(wrap("NAME\n\nhello", 20, 10), "NAME\n\nhello");
    }

    /// End-to-end render with the real FFmpeg on this machine.
    /// Skipped automatically when FFmpeg is not installed.
    #[test]
    fn renders_real_video_with_ffmpeg() {
        use crate::domain::{media, projects, scenes, scripts, settings::Settings};
        use std::collections::HashMap;
        use std::sync::atomic::AtomicBool;

        let Some(tools) = ffmpeg::locate("") else {
            eprintln!("ffmpeg not found; skipping");
            return;
        };
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        std::fs::create_dir_all(&src).unwrap();
        let gen = |args: &[&str]| {
            let ok = ffmpeg::command(&tools.ffmpeg, false)
                .args(["-hide_banner", "-loglevel", "error", "-y"])
                .args(args)
                .status()
                .unwrap()
                .success();
            assert!(ok, "fixture generation failed: {args:?}");
        };
        let img = src.join("sky.png");
        let wav = src.join("voice.wav");
        let vid = src.join("clip.mp4");
        let music = src.join("music.mp3");
        gen(&[
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=640x360",
            "-frames:v",
            "1",
            img.to_str().unwrap(),
        ]);
        gen(&[
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1.5",
            wav.to_str().unwrap(),
        ]);
        gen(&[
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x240:rate=25:duration=1",
            "-f",
            "lavfi",
            "-i",
            "sine=duration=1",
            "-shortest",
            "-pix_fmt",
            "yuv420p",
            vid.to_str().unwrap(),
        ]);
        gen(&[
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=220:duration=1",
            music.to_str().unwrap(),
        ]);

        let conn = crate::db::open_memory();
        let ws = tmp.path().join("ws");
        let p = projects::create(
            &conn,
            &projects::CreateProject {
                kind: "hypeman".into(),
                title: "Render Test".into(),
                description: String::new(),
                aspect_ratio: Some("9:16".into()),
            },
            &ws.join("Projects"),
            "9:16",
        )
        .unwrap();
        let paths: Vec<String> = [&img, &wav, &vid, &music]
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        let imported = media::import(&conn, &paths, &ws.join("Library"), "copy")
            .unwrap()
            .imported;
        assert_eq!(imported.len(), 4);
        for m in &imported {
            let info = ffmpeg::probe(
                tools.ffprobe.as_ref().unwrap(),
                std::path::Path::new(&m.file_path),
            )
            .unwrap();
            media::set_probe_result(&conn, &m.id, Some(&info), None).unwrap();
        }
        let id = |name: &str| {
            imported
                .iter()
                .find(|m| m.original_name == name)
                .unwrap()
                .id
                .clone()
        };
        projects::update(
            &conn,
            &p.id,
            &projects::UpdateProject {
                music_media_id: Some(id("music.mp3")),
                ..Default::default()
            },
        )
        .unwrap();
        scripts::save(&conn, &p.id, "Are you ready?").unwrap();
        let mk = |input: scenes::SceneInput| scenes::create(&conn, &p.id, &input, None).unwrap();
        mk(scenes::SceneInput {
            visual_media_id: Some(id("sky.png")),
            audio_media_id: Some(id("voice.wav")),
            duration_ms: Some(1500),
            ..Default::default()
        });
        mk(scenes::SceneInput {
            visual_media_id: Some(id("clip.mp4")),
            duration_ms: Some(1000),
            ..Default::default()
        });
        mk(scenes::SceneInput {
            script_text: Some("Jesus is alive! Say amen.".into()),
            duration_ms: Some(1000),
            ..Default::default()
        });

        let project = projects::get(&conn, &p.id).unwrap();
        let scene_list = scenes::list(&conn, &p.id).unwrap();
        let map: HashMap<String, media::MediaItem> = imported
            .iter()
            .map(|m| (m.id.clone(), media::get(&conn, &m.id).unwrap()))
            .collect();
        let settings = Settings::defaults(ws.to_str().unwrap());
        let cancel = AtomicBool::new(false);
        let progress = |_p: f64, _m: &str| {};
        let opts = serde_json::json!({});
        let out = tmp.path().join("out.mp4");
        let ctx = RenderContext {
            tools: &tools,
            settings: &settings,
            project: &project,
            scenes: &scene_list,
            media: &map,
            work_dir: tmp.path().join("work"),
            output_path: out.clone(),
            options: &opts,
            cancel: &cancel,
            progress: &progress,
        };
        let produced = DraftAssembly
            .render(&ctx)
            .unwrap_or_else(|e| panic!("render failed: {e:?}"));
        assert!(produced.is_file());
        assert!(
            !tmp.path().join("work").exists(),
            "temp folder should be cleaned up"
        );
        let info = ffmpeg::probe(tools.ffprobe.as_ref().unwrap(), &produced).unwrap();
        assert_eq!((info.width, info.height), (Some(720), Some(1280)));
        assert!(info.has_audio);
        let d = info.duration_ms.unwrap();
        assert!((3300..=3900).contains(&d), "unexpected duration {d}");
    }
}
