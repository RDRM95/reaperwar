@echo off
setlocal EnableExtensions DisableDelayedExpansion
title REAPER WAR - Local Edition Launcher (diagnostic version)
rem One-click Windows starter for the original Reaper War Simulator.
rem Keeps the console open so startup errors cannot disappear unnoticed.

if not defined LOCALAPPDATA (
  echo ERROR: Windows did not provide LOCALAPPDATA.
  goto :failed
)

set "RW_HOME=%LOCALAPPDATA%\ReaperWar"
set "RW_SCRIPT=%RW_HOME%\one-click-windows.ps1"
set "RW_LOG=%RW_HOME%\launcher-last-run.log"
if not exist "%RW_HOME%" mkdir "%RW_HOME%"
if errorlevel 1 goto :failed

echo.
echo =============================================
echo     REAPER WAR SIMULATOR - LOCAL EDITION
echo =============================================
echo.
echo Checking the latest launcher...
echo The window will stay open if startup fails.
echo.

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Windows PowerShell was not found.
  goto :failed
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $target = $env:RW_SCRIPT; $temp = $target + '.new'; try { Invoke-WebRequest -UseBasicParsing -UserAgent 'ReaperWar-OneClick/2.0' -Uri 'https://raw.githubusercontent.com/RDRM95/reaperwar/main/scripts/local/one-click-windows.ps1' -OutFile $temp; if (-not (Test-Path -LiteralPath $temp)) { throw 'The downloaded script is missing.' }; if (-not ((Get-Content -LiteralPath $temp -Raw) -match 'function Main')) { throw 'Downloaded script did not pass validation.' }; Move-Item -LiteralPath $temp -Destination $target -Force } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } }"
if errorlevel 1 (
  echo.
  echo Online update failed.
  if not exist "%RW_SCRIPT%" (
    echo Could not download the setup script. Check your internet connection.
    goto :failed
  )
  echo Using the previously downloaded setup script.
)

if not exist "%RW_SCRIPT%" (
  echo ERROR: Setup script not present.
  goto :failed
)

echo.
echo Preparing game files and GPU launcher...
echo First launch needs an internet connection.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%RW_SCRIPT%" %*
set "RW_EXIT=%ERRORLEVEL%"
if not "%RW_EXIT%"=="0" goto :failed

echo.
echo Local Edition has stopped.
echo If no game window appeared, check the messages and log below.
goto :finish

:failed
set "RW_EXIT=1"
echo.
echo =============================================
echo   THE GAME DID NOT START SUCCESSFULLY
echo =============================================
echo.
echo An error message should be visible above.
echo You can provide the log contents for diagnosis.

:finish
echo.
if defined RW_LOG echo Diagnostic log: "%RW_LOG%"
echo.
echo Press any key to close this launcher.
pause >nul
exit /b %RW_EXIT%
