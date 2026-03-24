@echo off
REM JRonda USB Portable Kiosk Launcher
REM Copy entire JRonda folder to USB root, double-click this bat

setlocal enabledelayedexpansion
set USB_ROOT=%~d0
set PROJECT_DIR=%~dp0
set URL=http://localhost:8080/

echo.
echo ========================================
echo JRonda USB Kiosk v1.0 - Portable Mode
echo ========================================
echo USB Drive: %USB_ROOT%
echo Project: %PROJECT_DIR%
echo Starting server + kiosk... (Press Ctrl+C to stop)

REM Kill any existing JRonda processes
taskkill /f /im powershell.exe /im node.exe 2^>nul
timeout /t 1 /nobreak ^>nul

REM Start GTFS updater if Node available (silent)
  start /min /b cmd /c "cd /d "%PROJECT_DIR%" && node data-build\scripts\update-gtfs.js --silent --watch --interval-min=30 ^>gtfs-usb.log 2^&1"

REM Start Vite dev server fallback (Node) or static server
if exist "tools\serve.ps1" (
  start "JRonda Server" powershell -NoExit -ExecutionPolicy Bypass -Command "cd '%PROJECT_DIR%'; & .\tools\serve.ps1 -Port 8080 -Root '%PROJECT_DIR%'"
) else (
  echo No server script found, using fallback...
  start "Static Server" powershell -Command "cd '%PROJECT_DIR%'; python -m http.server 8080"
)

timeout /t 5 /nobreak ^>nul

REM Launch persistent kiosk browser
set PROFILE_DIR=%PROJECT_DIR%usb-profile
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

echo Launching browser kiosk...
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk --user-data-dir="%PROFILE_DIR%" --disable-web-security --no-first-run %URL% --edge-kiosk-type=fullscreen
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --user-data-dir="%PROFILE_DIR%" --disable-web-security --no-first-run %URL%
) else (
  start "" "%URL%"
)

echo.
echo ========================================
echo Kiosk launched! USB portable mode active.
echo PIN persists in usb-profile/
echo Logs: gtfs-usb.log, server-log.txt
echo Ctrl+C to stop services.
echo ========================================
:wait
timeout /t 10 /nobreak >nul
goto wait

