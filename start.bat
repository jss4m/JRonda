@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "JR_ROOT=%ROOT%"
if not exist "%JR_ROOT%\.runtime" mkdir "%JR_ROOT%\.runtime"

echo [JRonda] Launching dev services...
powershell -NoLogo -NoProfile -Command "$r = [Environment]::GetEnvironmentVariable('JR_ROOT'); $args1 = @(\"$r\data-build\scripts\update-gtfs.js\", '--watch'); $p1 = Start-Process node -ArgumentList $args1 -PassThru -NoNewWindow; $args2 = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', \"$r\tools\serve.ps1\", '-Port', '8080', '-Root', \"$r\"); $p2 = Start-Process powershell -ArgumentList $args2 -PassThru -NoNewWindow; @($p1.Id, $p2.Id) | Out-File -FilePath \"$r\.runtime\jronda.pid\" -Encoding ascii"

echo [JRonda] Running. Double-click stop.bat to teardown.