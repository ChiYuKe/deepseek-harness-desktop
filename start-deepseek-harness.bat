@echo off
setlocal

cd /d "%~dp0deepseek-harness"
title DeepSeek Harness

set "PNPM_CMD="
set "PNPM_PREFIX="

where pnpm.cmd >nul 2>&1
if not errorlevel 1 (
    set "PNPM_CMD=pnpm.cmd"
    goto :pnpm_ready
)

if exist "%ProgramFiles%\nodejs\corepack.cmd" (
    set "PNPM_CMD=%ProgramFiles%\nodejs\corepack.cmd"
    set "PNPM_PREFIX=pnpm"
    goto :pnpm_ready
)

if exist "%ProgramFiles(x86)%\nodejs\corepack.cmd" (
    set "PNPM_CMD=%ProgramFiles(x86)%\nodejs\corepack.cmd"
    set "PNPM_PREFIX=pnpm"
    goto :pnpm_ready
)

if exist "%LocalAppData%\Programs\nodejs\corepack.cmd" (
    set "PNPM_CMD=%LocalAppData%\Programs\nodejs\corepack.cmd"
    set "PNPM_PREFIX=pnpm"
    goto :pnpm_ready
)

goto :pnpm_missing

:pnpm_ready

if not exist "node_modules\.pnpm" (
    echo Installing dependencies...
    call "%PNPM_CMD%" %PNPM_PREFIX% install
    if errorlevel 1 goto :install_failed
)

if not exist "apps\web\dist\index.html" (
    echo Build output not found. Building...
    call "%PNPM_CMD%" %PNPM_PREFIX% run build
    if errorlevel 1 goto :build_failed
)

echo.
echo DeepSeek Harness is starting...
echo Open http://127.0.0.1:3080 in your browser.
echo Press Ctrl+C to stop the service.
echo.
call "%PNPM_CMD%" %PNPM_PREFIX% run dsh -- web
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo DeepSeek Harness exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%

:pnpm_missing
echo [ERROR] pnpm was not found. Install Node.js and pnpm first.
pause
exit /b 1

:install_failed
echo [ERROR] Dependency installation failed.
pause
exit /b 1

:build_failed
echo [ERROR] Build failed.
pause
exit /b 1
