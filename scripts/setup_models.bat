@echo off
setlocal
cd /d %~dp0..

echo === AI Content Studio: model setup ===

call "%~dp0setup_ollama.bat"
if errorlevel 1 exit /b 1

call "%~dp0setup_piper.bat"
if errorlevel 1 exit /b 1

echo Pre-fetching Whisper model (faster-whisper base int8)...
backend\.venv\Scripts\python.exe -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8', download_root='data/models/whisper')"

echo.
echo All models ready. Run scripts\start.bat to launch.
endlocal
