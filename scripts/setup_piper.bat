@echo off
setlocal
cd /d %~dp0..

set MODELS_DIR=data\models\piper
if not exist "%MODELS_DIR%" mkdir "%MODELS_DIR%"

echo Downloading Piper voices...

powershell -NoProfile -Command ^
  "$ProgressPreference='SilentlyContinue';" ^
  "$base='https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US';" ^
  "$voices=@(@{name='en_US-amy-medium';path='amy/medium/en_US-amy-medium'},@{name='en_US-ryan-medium';path='ryan/medium/en_US-ryan-medium'});" ^
  "foreach ($v in $voices) {" ^
  "  $onnx = \"$base/$($v.path).onnx\";" ^
  "  $json = \"$base/$($v.path).onnx.json\";" ^
  "  $out_onnx = \"%MODELS_DIR%\\$($v.name).onnx\";" ^
  "  $out_json = \"%MODELS_DIR%\\$($v.name).onnx.json\";" ^
  "  if (!(Test-Path $out_onnx)) { Invoke-WebRequest -Uri $onnx -OutFile $out_onnx }" ^
  "  if (!(Test-Path $out_json)) { Invoke-WebRequest -Uri $json -OutFile $out_json }" ^
  "  Write-Host \"  OK: $($v.name)\"" ^
  "}"

if errorlevel 1 (
    echo Piper voice download failed.
    exit /b 1
)
echo Done.
endlocal
