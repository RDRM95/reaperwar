#!/bin/sh
# Reaper War Simulator {{VERSION}} - launcher for Linux: ./play-reaper-war-linux.sh [--vsync]
# Opens the game in Google Chrome, Chromium or Microsoft Edge (installed normally, as a Snap or from
# Flathub) as its own window on this machine's graphics, with the browser's frame-rate cap lifted (the
# game paces battles itself: 144 FPS by default, Settings > Graphics; --vsync keeps the browser on the
# monitor's refresh). Nothing is installed. REAPERWAR_BROWSER=/path/to/browser picks the browser.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
GAME="$DIR/game/index.html"
if [ ! -f "$GAME" ]; then echo "The game file is missing: $GAME (unzip the whole folder first)"; exit 1; fi
# file:// URL with every byte outside A-Z a-z 0-9 - . _ ~ / percent-encoded: Chromium ignores an --app
# address that is not plain ASCII (accented or non-Latin folder names), and a space, #, ?, % or \ would
# change its meaning.
URL="file://$(printf '%s' "$GAME" | LC_ALL=C od -An -v -tx1 | LC_ALL=C awk 'BEGIN { for (i = 0; i < 256; i++) h[sprintf("%02x", i)] = i }
  { for (i = 1; i <= NF; i++) { n = h[$i]; if ((n >= 48 && n <= 57) || (n >= 65 && n <= 90) || (n >= 97 && n <= 122) || n == 45 || n == 46 || n == 95 || n == 126 || n == 47) printf "%c", n; else printf "%%%s", toupper($i) } }')"
PROFILE="${XDG_DATA_HOME:-$HOME/.local/share}/ReaperWarSimulator/browser-profile"
EXTRA="--disable-gpu-vsync --disable-frame-rate-limit"
[ "${1:-}" = "--vsync" ] && EXTRA=""
FLAGS="--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --no-first-run --no-default-browser-check $EXTRA"

# Start the browser detached from this terminal, so closing the terminal does not close the game.
launch() {
  if command -v setsid >/dev/null 2>&1; then
    trap '' HUP
    setsid "$@" >/dev/null 2>&1 </dev/null &
    exit 0
  fi
  exec "$@"
}

for B in "${REAPERWAR_BROWSER:-}" google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable; do
  [ -n "$B" ] || continue
  if command -v "$B" >/dev/null 2>&1; then
    # A Snap browser cannot write to hidden folders such as ~/.local: keep its profile in its own area.
    case "$(command -v "$B")" in /snap/bin/*) PROFILE="$HOME/snap/$(basename "$(command -v "$B")")/common/ReaperWarSimulator/browser-profile" ;; esac
    # shellcheck disable=SC2086 # FLAGS is a list of switches
    launch "$B" --user-data-dir="$PROFILE" $FLAGS --app="$URL"
  fi
done
# Browsers installed from Flathub (Steam Deck, Bazzite, Fedora Silverblue): give the sandbox the game
# folder (read-only) and the profile folder.
if command -v flatpak >/dev/null 2>&1; then
  for F in com.google.Chrome org.chromium.Chromium com.microsoft.Edge; do
    if flatpak info "$F" >/dev/null 2>&1; then
      mkdir -p "$PROFILE"
      # shellcheck disable=SC2086
      launch flatpak run --filesystem="$DIR:ro" --filesystem="$PROFILE" "$F" --user-data-dir="$PROFILE" $FLAGS --app="$URL"
    fi
  done
fi
echo "Google Chrome, Chromium or Microsoft Edge is needed to play. Open this address in one of them instead:"
echo "$URL"
exit 1
