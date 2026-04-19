@echo off
REM Local Agent Engine only (main.py)
setlocal
if exist "C:\Users\user\Dev\local-agent\config.json" (
  cd /d "C:\Users\user\Dev\local-agent"
) else (
  cd /d "%~dp0.."
)
python agent\main.py
pause
