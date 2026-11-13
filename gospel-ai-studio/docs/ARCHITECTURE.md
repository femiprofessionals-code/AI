# Gospel AI Studio: architecture

## Goals that shaped the design

1. **Offline and private.** The app has no network code. The CSP blocks remote origins, user files are only read from or written to local disk, and there are no accounts.
2. **Modest hardware** (i7-6500U: 2 cores and 4 threads, 12 GB RAM, Intel HD 520). The UI is a single small bundle (~370 KB JS) using system fonts. Heavy work runs in exactly one background thread per kind, FFmpeg runs at below-normal priority with 2 threads by default, and there are no polling loops or idle background services.
3. **Stable first.** A small set of features, each backed by real code and tests. No placeholder buttons.
4. **Modular rendering.** New local engines, including future AI models, plug in behind one trait.

## Process model

```
┌──────────────────────── WebView2 (React UI) ────────────────────────┐
│ pages / workspace tabs ── lib/api.ts (typed invoke) ── listen(events)│
└───────────────▲──────────────────────────────┬───────────────────────┘
                │ IPC (JSON)                    │ asset:// (thumbnails, previews)
┌───────────────┴──────────────── Rust core ───▼───────────────────────┐
│ commands.rs → domain/* → SQLite (rusqlite, WAL)                       │
│      │                                                                │
│      ├─ media worker thread ── ffprobe/ffmpeg (thumbnails, metadata)  │
│      └─ render worker thread ── engines::RenderEngine ── ffmpeg       │
│ events: "media-updated", "render-job-updated"                         │
└───────────────────────────────────────────────────────────────────────┘
```

- **Commands** are `#[tauri::command(async)]`, so they never block the UI thread. Database access goes through one `Mutex<Connection>`, which is enough for a single-user desktop app, and every query is short. Long file copies on import run in `spawn_blocking`.
- **Workers**: one thread probes newly imported media, one runs render jobs from the `render_jobs` table in FIFO order. Jobs still marked *running* when the app closed are flagged as interrupted on the next start.
- **Events**: workers push updated rows to the UI, so the UI never polls.
- **Asset protocol**: the webview can only load files from the workspace, project folders and individually linked media files. The scope is granted at runtime.
- **Errors** cross IPC as `{ code, message }` with user-readable messages.

## Frontend

React 19 + TypeScript + Vite, `react-router` (hash routing), `lucide-react` icons, plain CSS with design tokens (dark and light). There is no state library: each page loads with `useLoad`, and live updates arrive through `useTauriEvent`.

`useAutosave` debounces edits, never overlaps saves, retries after errors, and flushes on blur, unmount, Ctrl+S and window close. It registers a global flusher that `App.tsx` awaits in `onCloseRequested`.

## SQLite schema (v1)

Defined in `src-tauri/src/db/migrations/0001_init.sql`, applied by a small versioned migrator (`schema_migrations`). Pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `settings` | Key → JSON value | `key` PK, `value`, `updated_at` |
| `projects` | Conversations and Hypeman projects | `id` (UUID), `kind` ∈ {conversation, hypeman}, `title`, `description`, `status` ∈ {draft, in_progress, review, complete}, `aspect_ratio` ∈ {16:9, 9:16, 1:1}, `folder_path` UNIQUE, Hypeman: `bpm` (40–220), `target_seconds`, `music_media_id` → media_items (SET NULL), `music_volume` (0–1); `archived`, timestamps |
| `scripts` | One live script per project | `project_id` PK → projects (CASCADE), `content`, `word_count`, `updated_at` |
| `script_revisions` | History snapshots | `id`, `project_id` (CASCADE), `content`, `word_count`, `reason` ∈ {auto, manual, before_restore}, `created_at`; at most 30 *auto* revisions kept, at most one per 5 minutes |
| `speakers` | Conversation cast | `id`, `project_id` (CASCADE), `name` (unique per project), `role`, `color`, `sort_order` |
| `media_items` | Global media library | `id`, `kind` ∈ {image, video, audio}, `title`, `original_name`, `file_path`, `managed` (copied vs linked), `file_size`, `duration_ms`, `width`, `height`, `has_audio`, `thumbnail_path`, `probe_status` ∈ {pending, ready, failed}, `tags` |
| `scenes` | Ordered scenes | `id`, `project_id` (CASCADE), `position`, `title`, `script_text`, `speaker_id` (SET NULL), `visual_media_id` (SET NULL), `audio_media_id` (SET NULL), `duration_ms` (500–600000), `notes` |
| `render_jobs` | Render queue and history | `id`, `project_id` (CASCADE), `engine_id`, `options` JSON, `status` ∈ {queued, running, succeeded, failed, cancelled}, `progress`, `message`, `output_path`, `error`, timestamps |

Integrity rules beyond SQL constraints are enforced in `domain/*`: a speaker must belong to the scene's project, a scene's visual must be an image or video and its audio must be audio, music must be audio, and reordering must contain exactly the project's scenes.

Every project folder holds a `project.json` marker. The app deletes a project folder only if that marker's id matches, so a wrong path can never be wiped.

## Script → scenes (deterministic, not AI)

`domain/script_parse.rs` (mirrored for live stats in `src/lib/scriptStats.ts`):

- `# Heading` titles the next scene. A line wrapped entirely in parentheses, such as `(direction)`, goes into the scene notes.
- In **Conversations**, `NAME: text` starts a turn, following lines continue it, and a blank line ends it. Names are 1–4 words starting with a letter, so `10:30` and `John 3:16` are not treated as speakers. Unknown names are added to the cast automatically.
- In **Hypeman**, every line is a beat.
- Durations are estimated from the speaking pace (words per minute, configurable), with a minimum of 1.5 s.

## Render engines and future local AI

```rust
pub trait RenderEngine: Send + Sync {
    fn info(&self, env: &EngineEnv) -> EngineInfo;   // id, name, uses_ai, available, reason
    fn render(&self, ctx: &RenderContext) -> Result<PathBuf, RenderError>;
}
```

`RenderContext` provides the project, ordered scenes, resolved media, settings, a work dir, the output path, a cancel flag and a progress callback. The UI lists `engines::registry()` with real availability and a visible **"No AI"** or **"Local AI model"** badge driven by `uses_ai`.

**Draft assembly (FFmpeg)** renders each scene to a uniform H.264/AAC segment:
- images are looped, videos are looped and trimmed, and scenes without a visual get a solid card with wrapped `drawtext`;
- the scene's voice is used if set, otherwise the clip's own sound, otherwise silence;
- each segment gets a 0.25 s fade in and out;
- the segments are joined with the concat demuxer (stream copy), and Hypeman music is mixed with `amix`.

FFmpeg runs inside the job's temp folder with relative file names, which avoids Windows filter-escaping problems (`C:` in font paths), and `-progress pipe:1` drives the progress bar.

Candidate future engines, each a new `RenderEngine` or a pre-processing step. None are included yet:
- offline TTS (e.g. Piper, CPU-friendly) to create voice audio for scenes;
- local captions with whisper.cpp (tiny or base models run on this CPU);
- lightweight local image generation is **not** realistic on Intel HD 520 at useful speed, so this should be optional, external and clearly labelled.

## Hardware and dependency risks

| Risk | Impact | Mitigation in v1 |
| --- | --- | --- |
| Dual-core CPU, no discrete GPU | Encoding is slow and UI stutter is possible during renders | One render at a time, `BELOW_NORMAL_PRIORITY_CLASS`, 2 threads default, `veryfast` preset, 720p default, renders cancellable at any time |
| 12 GB RAM shared with the browser and OS | Memory pressure | No in-memory media; thumbnails are 320 px JPEGs; lazy-loaded images; the webview only loads the active page |
| FFmpeg not installed | No thumbnails or renders | App fully usable for writing and planning; clear Settings guidance (`winget install Gyan.FFmpeg`); pending media is processed automatically after detection |
| Intel HD H.264 decode in WebView2 | Preview playback of large 1080p+ clips may stutter | Previews use `preload="metadata"`; thumbnails instead of video in lists; final review can use the system player ("Play in default player") |
| Large video imports on a small SSD | Disk fills up | *Link* import mode (no copy); library size shown on the dashboard; renders go to the project `exports` folder only |
| Documents folder synced by OneDrive | Sync churn on big media files | Workspace folder is configurable (e.g. `D:\Gospel AI Studio`) |
| WebView2 missing on older Windows 10 | App won't start | Installer embeds the WebView2 bootstrapper |
| First Rust build time (~5–10 min) | Developer friction | Documented; incremental builds are fast; release profile uses LTO and `opt-level = "s"` for a small binary |
| Antivirus scanning of FFmpeg spawns | Slower renders | Processes are few and long-lived (one per scene) |
| Fonts for text cards | No text on cards if no font is found | Auto-detects Segoe UI or Arial; configurable font path; Settings shows whether a font was found |
| npm peer-dependency resolution bug | `npm install` failure | `.npmrc` sets `legacy-peer-deps=true` |

## What was verified, and where

The app was built and exercised in a Linux container (Ubuntu 24.04, WebKitGTK) because no Windows machine was available here:
- `cargo test`: 20 tests, including an end-to-end render with the real FFmpeg (image + voice + video clip + text card + music → 720×1280 MP4 with correct duration and streams);
- `vitest`: script statistics;
- manual UI run of the real Tauri binary: create project, type script, autosave and `script.txt`, generate scenes, import media (dialog), thumbnails, assign visual and audio, render with progress, settings save, theme switch, restart persistence.

Not yet verified on Windows: the NSIS/MSI installer, WebView2-specific rendering, the `CREATE_NO_WINDOW` spawn path, Explorer drag-and-drop, and Windows font paths. Run `npm run app:build` on the target PC and walk through the same checklist.
