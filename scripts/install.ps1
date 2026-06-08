# Windows one-shot installer.
# Run from PowerShell (Admin) at the repo root:
#   .\scripts\install.ps1

$ErrorActionPreference = "Stop"

function Has-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Winget-Install($id) {
    Write-Host "==> winget install $id"
    winget install --id $id -e --silent --accept-source-agreements --accept-package-agreements
}

Write-Host "AI Content Studio installer"

# 1. Prereqs via winget
if (-not (Has-Cmd python)) { Winget-Install "Python.Python.3.11" }
if (-not (Has-Cmd node))   { Winget-Install "OpenJS.NodeJS.LTS" }
if (-not (Has-Cmd ffmpeg)) { Winget-Install "Gyan.FFmpeg" }
if (-not (Has-Cmd ollama)) { Winget-Install "Ollama.Ollama" }

# Refresh PATH inside this session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")

# 2. Backend venv
Push-Location "$PSScriptRoot\..\backend"
if (-not (Test-Path ".venv")) {
    Write-Host "==> Creating Python venv"
    python -m venv .venv
}
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\pip.exe install -r requirements.txt
Pop-Location

# 3. Frontend
Push-Location "$PSScriptRoot\..\frontend"
Write-Host "==> Installing npm deps"
npm install
Pop-Location

Write-Host ""
Write-Host "Install complete. Next:"
Write-Host "  scripts\setup_models.bat  (one-time model download)"
Write-Host "  scripts\start.bat         (launch backend + frontend)"
