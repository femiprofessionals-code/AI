@echo off
setlocal
cd /d %~dp0..
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
endlocal
