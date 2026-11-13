# Gospel AI Studio

A private, offline-first Windows desktop app for producing **Gospel Conversations** (dialogue videos) and **Gospel Hypeman** (short, high-energy promos). Everything runs on your own computer: no accounts, no cloud, no paid APIs. Your files are never uploaded.

> **Honest status (v0.1.0):** this version contains **no AI models**. Script-to-scene splitting uses plain text rules, and rendering uses FFmpeg. The architecture leaves room for local AI engines later (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#render-engines-and-future-local-ai)). They will only appear in the app once they actually run locally.

## What works today

| Area | Features |
| --- | --- |
| Dashboard | Quick actions, project, scene and library counts, recent projects, recent renders, system check (FFmpeg, workspace, offline) |
| Gospel Conversations | Project list (search, status filter, archive), script editor with speaker-turn stats, cast manager (names, roles, colours), scenes with speaker assignment |
| Gospel Hypeman | Project list, one-beat-per-line scripts, BPM and bar length, *snap scene durations to bars*, target length with over/under indicator, music bed with volume |
| Projects | Create, rename, status, aspect ratio (16:9 / 9:16 / 1:1), archive, delete (optionally with files), open folder |
| Script editor | Debounced autosave (default 800 ms), Ctrl+S, saves on blur, tab switch and window close, plain-text `script.txt` mirror, automatic and manual revision history with preview and restore |
| Scene manager | Create from script (replace or append), add, duplicate, delete, drag-and-drop or button reordering, per-scene text, speaker, visual (image or video), voice/audio, duration (*match audio* / *spoken estimate*), notes |
| Media library | Import via dialog or drag-and-drop from Explorer, copy or link mode, FFmpeg thumbnails, durations and dimensions (background, low priority), search, tags, preview, re-scan, usage count, safe delete |
| Render | **Draft assembly (FFmpeg)**: one MP4 per project from scene visuals and audio, text cards for scenes without visuals, music bed for Hypeman, live progress, cancel, queue, history, open or reveal output |
| Settings | Workspace folder, import mode, autosave delay, speaking pace, default aspects, FFmpeg path and auto-detect, render quality and threads, text-card font, theme (system, dark or light), one-click database backup |

## Requirements (Windows 10/11)

Runtime (end users):
- **WebView2**: built into Windows 10 (21H2+) and 11. The installer bootstraps it if it is missing.
- **FFmpeg** (free, open source), needed for thumbnails and rendering. The rest of the app works without it.
  ```powershell
  winget install Gyan.FFmpeg
  ```
  Then click **Settings → Detect**. Alternatively, unzip any FFmpeg build and choose `bin\ffmpeg.exe` in Settings.

Development:
- Node.js 20+ (LTS), Rust (stable, MSVC toolchain), and Microsoft C++ Build Tools ("Desktop development with C++").
- Run the checker from this folder:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\check-prereqs.ps1
  ```

## Build and run

```powershell
cd gospel-ai-studio
npm install
npm run app:dev        # run the desktop app with hot reload
npm run app:build      # produce NSIS + MSI installers in src-tauri\target\release\bundle
```

Tests:

```powershell
npm test                          # TypeScript unit tests (vitest)
npm run typecheck
cd src-tauri; cargo test          # Rust: DB, parser, settings, media, and a real FFmpeg render test
```

The first `cargo` build compiles SQLite and Tauri, which takes about 5–10 minutes on an i7-6500U. Later builds are incremental.

## Where your data lives

| What | Default location |
| --- | --- |
| Projects | `Documents\Gospel AI Studio\Projects\<title>-<id>\` (contains `project.json`, `script.txt`, `exports\`) |
| Media library | `Documents\Gospel AI Studio\Library\{Images,Videos,Audio,Thumbnails}` |
| Database backups | `Documents\Gospel AI Studio\Backups\` |
| Database | `%APPDATA%\com.gospelaistudio.desktop\studio.db` (SQLite, WAL mode) |

Nothing is stored in the installation directory. The app refuses a workspace inside it.

## Folder structure

```
gospel-ai-studio/
├── index.html, package.json, vite.config.ts, tsconfig.json
├── scripts/check-prereqs.ps1     Windows prerequisite checker
├── docs/ARCHITECTURE.md          architecture, SQLite schema, risks
├── src/                          React + TypeScript UI
│   ├── App.tsx, main.tsx, styles.css
│   ├── lib/        api.ts (typed IPC), types.ts, format.ts, scriptStats.ts (+ tests), appContext.tsx
│   ├── hooks/      useAutosave, useLoad, useTauriEvent
│   ├── components/ Sidebar, Modal, Confirm, Toasts, MediaPicker, NewProjectDialog, ProjectCard, Common
│   ├── pages/      Dashboard, Projects (Conversations/Hypeman), ProjectWorkspace, MediaLibrary, Settings
│   └── workspace/  ScriptTab, ScenesTab, CastTab, HypeTab, RenderTab
└── src-tauri/                    Rust backend
    ├── tauri.conf.json, capabilities/default.json, icons/
    └── src/
        ├── lib.rs        app setup, asset scope, worker start-up, command registry
        ├── commands.rs   IPC commands (thin, validated)
        ├── state.rs      AppState + workspace layout
        ├── workers.rs    media-probe worker, render worker (one job at a time)
        ├── db/           connection, migrations (migrations/0001_init.sql)
        ├── domain/       projects, scripts, script_parse, speakers, scenes, media, jobs, settings
        ├── media/        ffmpeg.rs (detect, probe, thumbnail, no-console spawn)
        └── engines/      RenderEngine trait + draft_assembly (FFmpeg)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture, schema and risk notes.
