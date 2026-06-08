@echo off
setlocal
echo Pulling Llama 3.1 8B Instruct (q4_K_M) via Ollama...
ollama pull llama3.1:8b-instruct-q4_K_M
if errorlevel 1 (
    echo Ollama pull failed. Is Ollama installed and running?
    exit /b 1
)
echo Done.
endlocal
