@echo off
rem Keep the window open on any error: relaunch inside cmd /k
if not defined CC_RELAUNCHED (
  set "CC_RELAUNCHED=1"
  cmd /k call "%~f0"
  exit /b
)

setlocal EnableExtensions
cd /d "%~dp0"
title Chess Coach AI
echo ==========================================
echo          Chess Coach AI - Launcher
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node
where npm.cmd >nul 2>nul
if errorlevel 1 goto :no_node

if not exist "node_modules\.bin\vite.cmd" (
  echo Installing packages - first run only...
  call npm.cmd install
  if errorlevel 1 goto :error
)

echo Starting the site. The browser will open automatically.
echo Press Ctrl+C in this window to stop.
echo.
call npm.cmd run dev -- --open
goto :end

:no_node
echo [ERROR] Node.js not found. Install Node.js LTS from https://nodejs.org/ and run this file again.
goto :end

:error
echo.
echo [ERROR] Package installation failed. Read the error above.

:end
echo.
pause
exit /b 0
