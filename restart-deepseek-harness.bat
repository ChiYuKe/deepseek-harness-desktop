@echo off
setlocal

cd /d "%~dp0"
title Restart DeepSeek Harness

echo.
echo Stopping the service on http://127.0.0.1:3080 ...

set "FOUND_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3080" ^| findstr "LISTENING"') do (
    if not "%%P"=="0" (
        set "FOUND_PID=%%P"
        echo Stopping process %%P ...
        taskkill /PID %%P /T /F >nul 2>&1
    )
)

if defined FOUND_PID (
    timeout /t 2 /nobreak >nul
) else (
    echo No running service was found on port 3080.
)

echo.
echo Starting DeepSeek Harness...
call "%~dp0start-deepseek-harness.bat"
exit /b %ERRORLEVEL%
