@echo off
REM NeO: minimized Engine + Bot windows; browser opens after /api/health OK.
setlocal
if exist "C:\Users\user\Dev\local-agent\config.json" (
  cd /d "C:\Users\user\Dev\local-agent"
) else (
  cd /d "%~dp0.."
)
set "ROOT=%CD%"

start /min "NeO Engine" /D "%ROOT%" cmd /k python agent\main.py
start /min "NeO Bot" /D "%ROOT%" cmd /k python agent\bot_server.py
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0wait-and-open-browser.ps1"
exit /b 0
