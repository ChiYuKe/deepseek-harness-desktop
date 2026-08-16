@echo off
setlocal

cd /d "%~dp0"
set "FAST_EXE=%~dp0desktop-shell-electron\publish\win-unpacked\DeepSeek Harness.exe"
set "PORTABLE_EXE=%~dp0desktop-shell-electron\publish\DeepSeekHarness-Electron-Portable.exe"
set "DSH_PROJECT_ROOT=%~dp0deepseek-harness"

if exist "%FAST_EXE%" set "SHELL_EXE=%FAST_EXE%"
if not defined SHELL_EXE if exist "%PORTABLE_EXE%" set "SHELL_EXE=%PORTABLE_EXE%"

if not defined SHELL_EXE (
    call "%~dp0build-webui-shell-electron.bat"
    if errorlevel 1 exit /b 1
    if exist "%FAST_EXE%" set "SHELL_EXE=%FAST_EXE%"
    if not defined SHELL_EXE set "SHELL_EXE=%PORTABLE_EXE%"
)

start "DeepSeek Harness" "%SHELL_EXE%"
exit /b 0
