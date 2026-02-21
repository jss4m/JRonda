@echo off
setlocal
set SCRIPT_DIR=%~dp0
set URL=http://localhost:8080/

where node >nul 2>nul
if %errorlevel%==0 (
  start "JRonda GTFS Updater" /min cmd /c node "%SCRIPT_DIR%data-build\scripts\update-gtfs.js" --watch --interval-min=60
)

start "JRonda Server" powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%tools\serve.ps1" -Port 8080 -Root "%SCRIPT_DIR%"

timeout /t 2 /nobreak >nul

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk %URL% --edge-kiosk-type=fullscreen
  goto :eof
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk %URL%
  goto :eof
)

start %URL%
