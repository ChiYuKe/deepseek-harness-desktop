@echo off
setlocal

cd /d "%~dp0"
title Build DeepSeek Harness Electron Shell

if not exist "%~dp0desktop-shell-electron\node_modules\electron\dist\electron.exe" (
    echo Installing Electron shell dependencies...
    call npm install --prefix "%~dp0desktop-shell-electron"
    if errorlevel 1 (
        echo.
        echo [ERROR] Electron dependencies install failed.
        pause
        exit /b 1
    )
)

call npm run check --prefix "%~dp0desktop-shell-electron"
if errorlevel 1 (
    echo.
    echo [ERROR] Electron shell check failed.
    pause
    exit /b 1
)

call npm run dist:win --prefix "%~dp0desktop-shell-electron"
if errorlevel 1 (
    echo.
    echo [ERROR] Electron shell build failed.
    pause
    exit /b 1
)

echo.
echo Fast Electron WebUI shell created:
echo %~dp0desktop-shell-electron\publish\win-unpacked\DeepSeek Harness.exe
echo.
echo Portable fallback created:
echo %~dp0desktop-shell-electron\publish\DeepSeekHarness-Electron-Portable.exe
pause
