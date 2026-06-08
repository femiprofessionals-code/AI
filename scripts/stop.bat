@echo off
taskkill /FI "WINDOWTITLE eq studio-backend*" /F 2>nul
taskkill /FI "WINDOWTITLE eq studio-frontend*" /F 2>nul
echo Stopped.
