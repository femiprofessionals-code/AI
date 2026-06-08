# Architecture

## High level

```
┌──────────────────┐    HTTP/SSE     ┌─────────────────────┐
│ Next.js Frontend │ ──────────────► │  FastAPI Backend    │
│  (port 3000)     │ ◄────────────── │   (port 8000)       │
└──────────────────┘                 └──────────┬──────────┘
                                                │
              ┌─────────────────────────────────┼────────────────────┐
              │                                 │                    │
       ┌──────▼──────┐                ┌─────────▼────────┐   ┌──────▼──────┐
       │   SQLite    │                │  AI Services     │   │  Job Queue  │
       │ projects/   │                │ ollama / flux /  │   │ (in-proc    │
       │ scripts/    │                │ piper / whisper  │   │  asyncio)   │
       │ scenes/...  │                └────────┬─────────┘   └─────────────┘
       └─────────────┘                         │
                                       ┌───────▼────────┐
                                       │  FFmpeg /      │
                                       │  MoviePy       │
                                       └────────────────┘
```

All processing is local. The backend dispatches long-running jobs (image gen, video assembly) to an in-process asyncio task queue so the API stays responsive. Progress is exposed over an SSE endpoint that the frontend subscribes to.

## Memory budget (12 GB system)

| Component                | Peak RAM | Strategy                                       |
| ------------------------ | -------- | ---------------------------------------------- |
| Llama 3.1 8B Q4_K_M      | ~5.5 GB  | Resident in Ollama; offloads on idle           |
| FLUX.1 Schnell (1024px)  | ~6 GB    | Loaded on demand, freed after batch            |
| SDXL Turbo fallback      | ~5 GB    | Used when FLUX OOMs                            |
| Piper                    | ~0.3 GB  | Resident, cheap                                |
| faster-whisper base int8 | ~0.5 GB  | Loaded per transcription                       |
| FFmpeg encode            | ~0.8 GB  | Streamed                                       |

The pipeline is serialized — never two heavy models in RAM at once. The orchestrator (`backend/app/services/pipeline.py`) explicitly unloads the LLM before image gen, and image gen before video assembly.

## Data flow

1. **Topic** → `POST /api/scripts/generate` → Ollama → script + hook + CTA persisted as `Script`.
2. **Scene breakdown** → `POST /api/scenes/generate` → LLM produces JSON array of `{narration, image_prompt, duration_sec}`.
3. **Images** → `POST /api/images/generate` for each scene → FLUX Schnell.
4. **Voice** → `POST /api/voice/generate` for each scene → Piper writes WAV.
5. **Subtitles** → `POST /api/voice/transcribe` → faster-whisper produces SRT.
6. **Video** → `POST /api/video/assemble` → MoviePy Ken-Burns + crossfades + audio + SRT burn-in → MP4.
7. **Export** → `GET /api/video/{id}/download`.

## Storage layout

```
data/
├── db/studio.sqlite
├── models/
│   ├── piper/{voice}.onnx
│   ├── whisper/
│   └── flux/  (optional local weights; default downloaded by diffusers cache)
└── projects/{project_id}/
    ├── script.txt
    ├── scenes.json
    ├── images/scene_{n}.png
    ├── audio/scene_{n}.wav
    ├── audio/full.wav
    ├── subtitles/full.srt
    ├── thumbnails/yt.png, fb.png
    └── exports/final_1080p.mp4
```

## Why these choices

- **Ollama** keeps the LLM hot, exposes a single HTTP API, and handles memory pressure better than raw llama.cpp on Windows.
- **FLUX.1 Schnell** is 4-step generation — fastest acceptable quality on a CPU-leaning box. SDXL Turbo is the safety net.
- **Piper** is the only TTS that hits real-time on CPU with natural prosody.
- **faster-whisper int8** is 4× faster than openai-whisper and uses ~⅓ the RAM.
- **MoviePy** wraps FFmpeg with a Pythonic clip model — fast enough for 1080p30 final encodes.

## Failure modes & mitigations

| Failure                              | Mitigation                                          |
| ------------------------------------ | --------------------------------------------------- |
| Ollama not running                   | `/api/health` reports it; UI shows install prompt   |
| Image model OOM                      | Pipeline catches `OutOfMemoryError`, retries on SDXL |
| Long jobs blocking event loop        | `run_in_threadpool` for sync libs                   |
| Browser closes mid-job               | Jobs persist in DB with status; resumable from UI   |
