@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Reaper War Simulator {{VERSION}} - launcher for Windows.
rem Double-click to play on this PC's graphics card: the game opens in Microsoft Edge or
rem Google Chrome as its own window, with the frame-rate cap off. Nothing is installed.
rem Put --vsync after this file's name (for example at the end of a shortcut's Target) to keep the
rem monitor's refresh rate. REAPERWAR_BROWSER=<path to a browser .exe> picks the browser.
set "GAME=%~dp0game\index.html"
if not exist "%GAME%" goto missing
set "PROFILE=%LOCALAPPDATA%\ReaperWarSimulator\browser-profile"
set "URL="
for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.Uri]::new((Resolve-Path -LiteralPath $env:GAME).ProviderPath).AbsoluteUri"`) do set "URL=%%U"
if not defined URL goto nourl
set "BROWSER="
if defined REAPERWAR_BROWSER set "BROWSER=%REAPERWAR_BROWSER%"
for %%B in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe") do if not defined BROWSER if exist "%%~B" set "BROWSER=%%~B"
if not defined BROWSER goto nobrowser
set "FLAGS=--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --force-high-performance-gpu --no-first-run --no-default-browser-check"
if /i not "%~1"=="--vsync" set "FLAGS=%FLAGS% --disable-gpu-vsync --disable-frame-rate-limit"
start "" "%BROWSER%" --user-data-dir="%PROFILE%" %FLAGS% --app="%URL%"
exit /b 0

:missing
echo The game file is missing: "%GAME%"
echo Unzip the whole folder first, then double-click this file again.
pause
exit /b 1

:nourl
echo Could not turn the game's location into a browser address (Windows PowerShell is needed).
echo Open this file in Microsoft Edge or Google Chrome instead: "%GAME%"
pause
exit /b 1

:nobrowser
echo Microsoft Edge or Google Chrome is needed to play.
echo Open this address in either browser instead:
rem Printed through a FOR variable so an ampersand in the folder name cannot split the line.
for %%U in ("%URL%") do echo %%~U
pause
exit /b 1
