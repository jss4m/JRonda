@echo off
setlocal enabledelayedexpansion
set SCRIPT_DIR=%~dp0
set URL=http://localhost:8080/
set LOGFILE=%SCRIPT_DIR%server-log.txt

echo Starting JRonda Kiosk from: %SCRIPT_DIR%
echo USB Root: %~d0
echo Logs: server-log.txt, gtfs-update.log

REM Cleanup and start server + updater
taskkill /f /im powershell.exe 2^>nul
timeout /t 2 /nobreak ^>nul

where node ^>nul 2^>nul
if !errorlevel!==0 (
  start /min /b "GTFS Updater" cmd /c "node data-build\scripts\update-gtfs.js --silent --watch --interval-min=60 >%SCRIPT_DIR%gtfs-update.log 2>&1"
)

start "Server (Ctrl+C to stop)" powershell -NoExit -ExecutionPolicy Bypass -Command "cd '%SCRIPT_DIR%'; & tools\serve.ps1 -Port 8080 -Root '%SCRIPT_DIR%'"

timeout /t 6 /nobreak ^>nul

REM USB-aware persistent kiosk browser
set BROWSER_PROFILE=%SCRIPT_DIR%profile-kiosk
if not exist "%BROWSER_PROFILE%" mkdir "%BROWSER_PROFILE%"

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk --user-data-dir="%BROWSER_PROFILE%" --disable-web-security %URL% --edge-kiosk-type=fullscreen
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --user-data-dir="%BROWSER_PROFILE%" --disable-web-security %URL%
) else (
  start %URL%
)

echo Kiosk launched! Server running...

:end
echo Kiosk ready. Server log: %LOGFILE%
pause
