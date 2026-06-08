# Setup (Windows 10/11)

## Prerequisites

- Windows 10/11, 12 GB RAM, Intel i5 or newer
- 30 GB free disk for models + generated assets
- Internet for first-time model downloads

## One-shot install

Open **PowerShell as Administrator** and:

```powershell
cd ai-content-studio
.\scripts\install.ps1
```

This installs (idempotently):

1. Python 3.11 via winget if missing
2. Node.js 20 LTS via winget if missing
3. FFmpeg via winget if missing
4. Ollama via winget if missing
5. Python venv + pip deps in `backend/.venv`
6. Node deps in `frontend/`

## Models

```bat
scripts\setup_models.bat
```

Pulls `llama3.1:8b-instruct-q4_K_M` via Ollama, downloads Piper voices and a Whisper model. FLUX/SDXL are pulled on first image-gen call via the Hugging Face cache.

## Run

```bat
scripts\start.bat
```

Two consoles open:
- Backend on http://localhost:8000 (docs at `/docs`)
- Frontend on http://localhost:3000

Stop with `scripts\stop.bat` or Ctrl+C in each window.

## Troubleshooting

| Symptom                                       | Fix                                                           |
| --------------------------------------------- | ------------------------------------------------------------- |
| `ollama` not in PATH                          | Restart terminal after install. Check `ollama --version`.     |
| `ffmpeg` not found by MoviePy                 | `setx IMAGEIO_FFMPEG_EXE "C:\ProgramData\chocolatey\bin\ffmpeg.exe"` |
| Image gen OOM                                 | Lower resolution in Settings → Image; pipeline auto-falls back to SDXL Turbo |
| First image gen takes 10+ minutes             | Normal — diffusers is downloading 6 GB of weights. Cached for next time. |
| Piper "no voice found"                        | Re-run `scripts\setup_piper.bat`                              |
