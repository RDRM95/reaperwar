REAPER WAR SIMULATOR {{VERSION}} - PLAY ON YOUR OWN GRAPHICS CARD
==================================================================

Unofficial, non-commercial Mass Effect 3 fan project. Nothing to install, no internet needed.

WINDOWS
  Double-click "Play Reaper War (Windows).cmd".
  If Windows shows "Windows protected your PC", click "More info", then "Run anyway"
  (the launcher only opens the game in Microsoft Edge or Google Chrome).

MACOS
  Right-click "Play Reaper War (macOS).command" and choose Open the first time
  (macOS asks because the file came from the internet). Needs Google Chrome or Microsoft Edge.

LINUX
  Run ./play-reaper-war-linux.sh (needs Google Chrome, Chromium or Microsoft Edge).

WHAT THE LAUNCHER DOES
  It opens game/index.html in Edge or Chrome as its own window, on a separate browser profile
  so your normal browser is untouched, with flags that use your graphics card fully and switch
  the frame-rate cap off (high-refresh monitors run at their full rate). The game starts on the
  Ultra graphics quality (native resolution, longer detail distances, bigger effect budgets);
  change it any time in Settings. Settings -> Graphics names the graphics chip in use; if it
  says "software rendering", update the graphics driver.

OPTIONS
  Add --vsync after the launcher's name (for example in a shortcut) to keep the frame rate at
  the monitor's refresh rate if your graphics card runs hot.

SAVES
  Saves and settings live in the launcher's browser profile:
    Windows: %LOCALAPPDATA%\ReaperWarSimulator
    macOS:   ~/Library/Application Support/ReaperWarSimulator
    Linux:   ~/.local/share/ReaperWarSimulator
  They carry over when you unzip a newer version into any folder. To remove everything, delete
  this folder and that one.

You can also open game/index.html in Edge or Chrome directly; the launcher only adds the
graphics flags and the separate window.
