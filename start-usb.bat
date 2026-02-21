@echo off
setlocal
set SCRIPT_DIR=%~dp0
where node >nul 2>nul
if %errorlevel%==0 (
  start "JRonda GTFS Updater" /min cmd /c node "%SCRIPT_DIR%data-build\scripts\update-gtfs.js" --watch --interval-min=60
)
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%tools\serve.ps1" -Port 8080 -Root "%SCRIPT_DIR%" -OpenBrowser
