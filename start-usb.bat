@echo off
setlocal
set SCRIPT_DIR=%~dp0
set URL=http://localhost:8080/
where node >nul 2>nul
if %errorlevel%==0 (
  start "JRonda GTFS Updater" /min cmd /c node "%SCRIPT_DIR%data-build\scripts\update-gtfs.js" --silent --watch --interval-min=60 ^> "%SCRIPT_DIR%gtfs-usb.log" 2^&1
)
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%tools\serve.ps1" -Port 8080 -Root "%SCRIPT_DIR%" -OpenBrowser
timeout /t 5 /nobreak ^>nul
set PROFILE_DIR=%SCRIPT_DIR%usb-profile
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk --user-data-dir="%PROFILE_DIR%" --disable-web-security --no-first-run %URL% --edge-kiosk-type=fullscreen
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --user-data-dir="%PROFILE_DIR%" --disable-web-security --no-first-run %URL%
) else (
  start "" "%URL%"
)
