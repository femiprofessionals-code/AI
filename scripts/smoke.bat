@echo off
setlocal
cd /d %~dp0..

REM End-to-end smoke test: creates a project, runs the full pipeline, exports MP4.
backend\.venv\Scripts\python.exe -m scripts.smoke
endlocal
