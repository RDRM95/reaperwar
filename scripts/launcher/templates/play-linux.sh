#!/bin/sh
# Reaper War Simulator {{VERSION}} - launcher for Linux: ./play-reaper-war-linux.sh [--vsync]
# Opens the game in Google Chrome, Chromium or Microsoft Edge as its own window on this machine's
# graphics, with the frame-rate cap off (--vsync keeps it). Nothing is installed.
DIR="$(cd "$(dirname "$0")" && pwd)"
GAME="$DIR/game/index.html"
if [ ! -f "$GAME" ]; then echo "The game file is missing: $GAME (unzip the whole folder first)"; exit 1; fi
URL="file://$(printf '%s' "$GAME" | sed -e 's/%/%25/g' -e 's/ /%20/g' -e 's/#/%23/g' -e 's/?/%3F/g')"
PROFILE="${XDG_DATA_HOME:-$HOME/.local/share}/ReaperWarSimulator/browser-profile"
EXTRA="--disable-gpu-vsync --disable-frame-rate-limit"
[ "${1:-}" = "--vsync" ] && EXTRA=""
for B in "${REAPERWAR_BROWSER:-}" google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable; do
  [ -n "$B" ] || continue
  if command -v "$B" >/dev/null 2>&1; then
    exec "$B" --user-data-dir="$PROFILE" --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --no-first-run --no-default-browser-check $EXTRA --app="$URL"
  fi
done
echo "Google Chrome, Chromium or Microsoft Edge is needed to play. Open this address in one of them instead:"
echo "$URL"
exit 1
