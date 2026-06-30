@echo off
cd /d "%~dp0"

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe"
  ) else (
    echo Node.js nao encontrado. Instale o Node.js ou abra este projeto por um servidor local/HTTPS.
    pause
    exit /b 1
  )
)

if not exist "server.cjs" (
  echo Erro: Arquivo server.cjs nao encontrado no diretorio atual.
  pause
  exit /b 1
)

start "Granja PWA" cmd /k "%NODE_EXE%" server.cjs
timeout /t 5 /nobreak >nul
start "" "http://localhost:8765/?v=%RANDOM%"
