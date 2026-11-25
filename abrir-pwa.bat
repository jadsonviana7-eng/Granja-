@echo off
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm nao encontrado. Instale o Node.js para iniciar o servidor Vite.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias do projeto...
  call npm install
)

echo Iniciando Servidor Proprio de WhatsApp API (porta 3001)...
start "WhatsApp API - Granja Viana" cmd /k "node whatsapp-server.mjs"

start "" "http://localhost:8765/"
call npm run dev
