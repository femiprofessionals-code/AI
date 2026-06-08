@echo off
setlocal
cd /d %~dp0..

REM Start Ollama in the background if not already running
tasklist /FI "IMAGENAME eq ollama.exe" | find /I "ollama.exe" >nul
if errorlevel 1 (
    start "" /b ollama serve
    timeout /t 2 /nobreak >nul
)

start "studio-backend" cmd /k "cd backend && .venv\Scripts\activate && python run.py"
start "studio-frontend" cmd /k "cd frontend && npm run dev"

echo Backend  -> http://localhost:8000/docs
echo Frontend -> http://localhost:3000
endlocal
