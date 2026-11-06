REAPER WAR SIMULATOR {{VERSION}} - PLAY ON YOUR OWN GRAPHICS CARD
==================================================================

Unofficial, non-commercial Mass Effect 3 fan project. Nothing to install, no internet needed.

WINDOWS
  Double-click "Play Reaper War (Windows).cmd".
  If Windows shows "Windows protected your PC", click "More info", then "Run anyway"
  (the launcher only opens the game in Microsoft Edge or Google Chrome).
  If Windows says Smart App Control blocked the file (there is no "Run anyway"), or the PC
  runs Windows in S mode, right-click game\index.html > Open with > Microsoft Edge instead.
  The game then runs without the launcher's graphics settings and keeps its saves in Edge.

MACOS
  Double-click "Play Reaper War (macOS).command" (needs Google Chrome or Microsoft Edge).
  The first time, macOS blocks it because it was downloaded and is not notarized:
    macOS 15 Sequoia or later: click Done, open System Settings > Privacy & Security,
      click "Open Anyway" next to the launcher's name, enter your password, then Open.
    macOS 14 or earlier: right-click the file, choose Open, then Open.
  Or in Terminal: type sh and a space, drag the .command file into the window, press Return.
  You can close the Terminal window that opens. Closing the game window leaves its browser
  running in the Dock: quit it with Cmd+Q before starting again with another option.

LINUX
  Run ./play-reaper-war-linux.sh in a terminal (it needs Google Chrome, Chromium or
  Microsoft Edge; Snap Store and Flathub installs work too). The game keeps running when you
  close the terminal. With Chromium from the Snap Store, unzip the game inside your home
  folder (not in a hidden folder).

WHAT THE LAUNCHER DOES
  It opens game/index.html in Edge or Chrome as its own window, on a separate browser profile
  (with its own saves) so your normal browser is untouched, with flags that use your graphics
  card fully and lift the browser's own frame-rate cap. The game starts on the Ultra graphics
  quality (native resolution, longer detail distances, bigger effect budgets) and paces battles
  at up to 144 FPS; change both any time in Settings -> Graphics (Frame rate limit: 60 to 240
  FPS or Unlimited). The battle HUD shows the frame rate.

CONFIRM IT RUNS ON YOUR GPU
  Settings -> Graphics names the graphics chip in use. If it says "software rendering",
  update the graphics driver; on a laptop, also set Chrome or Edge to High performance in the
  system's graphics settings (Windows: Settings > System > Display > Graphics). If it says
  WebGL is not available, turn on graphics acceleration in the browser's settings.

OPTIONS
  Add --vsync after the launcher's name to keep the browser synchronised to the monitor's
  refresh rate (smoother, cooler, quieter): on Windows at the end of a shortcut's Target; on macOS and
  Linux from Terminal, for example ./play-reaper-war-linux.sh --vsync. Close the game window
  first (on macOS also quit its browser with Cmd+Q): a browser that is still running keeps
  its old settings.

SAVES
  Saves and settings live in the launcher's browser profile:
    Windows: %LOCALAPPDATA%\ReaperWarSimulator
    macOS:   ~/Library/Application Support/ReaperWarSimulator
    Linux:   ~/.local/share/ReaperWarSimulator
             (Chromium from the Snap Store: ~/snap/chromium/common/ReaperWarSimulator)
  They carry over when you unzip a newer version into any folder. To remove everything, delete
  this folder and that one.
  Saves from the web version, the one-click Windows launcher, or game/index.html opened directly
  in your own browser are kept separately. To bring them here: Settings -> Export save data
  there, then Settings -> Import save data here.

You can also open game/index.html in Edge or Chrome directly; the launcher only adds the
graphics flags, the separate window and its own browser profile.
