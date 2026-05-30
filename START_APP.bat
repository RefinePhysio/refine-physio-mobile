@echo off
cd /d "%~dp0"

echo Starting Refine Physio Mobile...
echo.
echo Keep the server window open while you are using the app.
echo If the app is already running, the browser will still open.
echo.

start "Refine Physio Mobile Server" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

timeout /t 2 >nul
start "" "http://localhost:4173/"

echo App opened at http://localhost:4173/
echo You can close this small window.
pause
