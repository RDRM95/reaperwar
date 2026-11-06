@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Reaper War Simulator - One-Click Launcher
rem Save this file anywhere (Desktop or Downloads), then double-click it.
rem Downloads the trusted launcher from this project's own GitHub repository.
rem Everything is installed in LocalAppData; no administrator access or Git needed.

if not defined LOCALAPPDATA (
  echo Windows could not find the local application-data folder.
  pause
  exit /b 1
)
set "REAPERWAR_HOME=%LOCALAPPDATA%\ReaperWar"
set "REAPERWAR_BOOTSTRAP=%REAPERWAR_HOME%\one-click-windows.ps1"
if not exist "%REAPERWAR_HOME%" mkdir "%REAPERWAR_HOME%"
if errorlevel 1 goto :error

echo.
echo  =========================================
echo       REAPER WAR - LOCAL EDITION
echo  =========================================
echo.
echo  Checking launcher for updates...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $target = $env:REAPERWAR_BOOTSTRAP; $temp = $target + '.new'; try { Invoke-WebRequest -UseBasicParsing -UserAgent 'ReaperWar-OneClick/1.0' -Uri 'https://raw.githubusercontent.com/RDRM95/reaperwar/main/scripts/local/one-click-windows.ps1' -OutFile $temp; Move-Item -LiteralPath $temp -Destination $target -Force } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } }"
if errorlevel 1 (
  if not exist "%REAPERWAR_BOOTSTRAP%" (
    echo.
    echo ERROR: Unable to download the launcher.
    echo Check your internet connection and try again.
    goto :error
  )
  echo Using previously downloaded launcher (offline mode).
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%REAPERWAR_BOOTSTRAP%" %*
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Startup could not complete. The error is shown above.
echo Press any key to close this window.
pause >nul
exit /b 1
