@echo off
rem Reaper War Simulator - Local Edition for Windows.
rem Double-click to build (first run), serve on http://127.0.0.1:4180/ and open the game
rem in Chrome or Edge on this PC's GPU. Options are passed on: run-local.cmd --help
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed, or it is not on PATH.
  echo Install Node.js 20.19 or newer ^(the LTS version^) from https://nodejs.org/en/download
  echo and then double-click run-local.cmd again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\.package-lock.json" (
  echo Installing dependencies ^(first run only^)...
  call npm ci
  if errorlevel 1 (
    echo.
    echo npm ci failed: check the messages above and your internet connection.
    pause
    exit /b 1
  )
)

node scripts\local\launch.mjs %*
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
endlocal
