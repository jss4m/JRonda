@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "PIDFILE=%ROOT%\.runtime\jronda.pid"

echo [JRonda] Stopping services...
if exist "%PIDFILE%" (
    for /f %%i in (%PIDFILE%) do (
        taskkill /PID %%i /T /F >nul 2>&1
    )
    del "%PIDFILE%" >nul 2>&1
)

REM Force-release port 8080 socket owner if lingering
for /f "tokens=5" %%a in ('netstat -a -o -n 2^>nul ^| findstr ":8080 "') do (
    taskkill /PID %%a /T /F >nul 2>&1
)

echo [JRonda] Stopped. Port released.