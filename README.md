# AI Content Studio

A fully local, 100% free, self-hosted AI content creation platform for faceless YouTube and Facebook automation. Runs on a Windows 10/11 machine with 12 GB RAM and an Intel Core i5 — no paid APIs, no cloud AI services.

## Workflow

```
Topic → Script → Scenes → Image Prompts → Images → Voice → Subtitles → Video → Export
```

## Stack

| Layer        | Tech                                              |
| ------------ | ------------------------------------------------- |
| Frontend     | Next.js 14 (App Router) + React + TypeScript + Tailwind |
| Backend      | FastAPI + Python 3.11                             |
| Database     | SQLite (via SQLAlchemy)                           |
| LLM          | Ollama + `llama3.1:8b-instruct-q4_K_M`            |
| Image        | FLUX.1 Schnell (primary) / SDXL Turbo (fallback)  |
| TTS          | Piper                                             |
| ASR          | faster-whisper (base/small int8)                  |
| Video        | FFmpeg + MoviePy                                  |

All models run locally. The 8B LLM is 4-bit quantized to fit in 12 GB RAM next to the image model and FFmpeg.

## Quick start (Windows)

```bat
scripts\install.bat
scripts\setup_models.bat
scripts\start.bat
```

Open http://localhost:3000.

See [`docs/SETUP.md`](docs/SETUP.md) for details, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for design, and [`docs/TESTING.md`](docs/TESTING.md) for how to verify each phase.

## Layout

```
ai-content-studio/
├── backend/          FastAPI + services + SQLite
├── frontend/         Next.js 14 app
├── scripts/          Windows .bat / .ps1 installers
├── data/             SQLite DB, models, generated assets (gitignored)
└── docs/             Architecture, setup, testing
```

## License

MIT

## Also in this repository

- [`executive-assistant-desk/`](executive-assistant-desk/README.md) — Windows desktop app (Electron) for an Executive Director's meetings, three time-zone clocks, spoken reminders and daily tasks.
