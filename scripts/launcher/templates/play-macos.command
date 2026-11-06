#!/bin/sh
# Reaper War Simulator {{VERSION}} - launcher for macOS.
# Double-click to play on this Mac's graphics: the game opens in Google Chrome or Microsoft Edge
# as its own window, with the frame-rate cap off. Nothing is installed. Add --vsync to keep the cap.
DIR="$(cd "$(dirname "$0")" && pwd)"
GAME="$DIR/game/index.html"
if [ ! -f "$GAME" ]; then echo "The game file is missing: $GAME (unzip the whole folder first)"; exit 1; fi
URL="file://$(printf '%s' "$GAME" | sed -e 's/%/%25/g' -e 's/ /%20/g' -e 's/#/%23/g' -e 's/?/%3F/g')"
PROFILE="$HOME/Library/Application Support/ReaperWarSimulator/browser-profile"
EXTRA="--disable-gpu-vsync --disable-frame-rate-limit"
[ "${1:-}" = "--vsync" ] && EXTRA=""
if [ -n "${REAPERWAR_BROWSER:-}" ]; then
  exec "$REAPERWAR_BROWSER" --user-data-dir="$PROFILE" --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --force-high-performance-gpu --no-first-run --no-default-browser-check $EXTRA --app="$URL"
fi
for APP in "Google Chrome" "Microsoft Edge" "Chromium"; do
  if open -Ra "$APP" >/dev/null 2>&1; then
    exec open -na "$APP" --args --user-data-dir="$PROFILE" --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --force-high-performance-gpu --no-first-run --no-default-browser-check $EXTRA --app="$URL"
  fi
done
echo "Google Chrome or Microsoft Edge is needed to play. Open this address in either browser instead:"
echo "$URL"
exit 1
