#!/bin/sh
# Reaper War Simulator {{VERSION}} - launcher for macOS.
# Double-click to play on this Mac's graphics: the game opens in Google Chrome or Microsoft Edge
# as its own window, with the frame-rate cap off. Nothing is installed. To keep the cap, run it from
# Terminal with --vsync. REAPERWAR_BROWSER=/path/to/browser-binary picks the browser.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
GAME="$DIR/game/index.html"
if [ ! -f "$GAME" ]; then echo "The game file is missing: $GAME (unzip the whole folder first)"; exit 1; fi
# file:// URL with every byte outside A-Z a-z 0-9 - . _ ~ / percent-encoded: Chromium ignores an --app
# address that is not plain ASCII (accented or non-Latin folder names), and a space, #, ?, % or \ would
# change its meaning.
URL="file://$(printf '%s' "$GAME" | LC_ALL=C od -An -v -tx1 | LC_ALL=C awk 'BEGIN { for (i = 0; i < 256; i++) h[sprintf("%02x", i)] = i }
  { for (i = 1; i <= NF; i++) { n = h[$i]; if ((n >= 48 && n <= 57) || (n >= 65 && n <= 90) || (n >= 97 && n <= 122) || n == 45 || n == 46 || n == 95 || n == 126 || n == 47) printf "%c", n; else printf "%%%s", toupper($i) } }')"
PROFILE="$HOME/Library/Application Support/ReaperWarSimulator/browser-profile"
EXTRA="--disable-gpu-vsync --disable-frame-rate-limit"
[ "${1:-}" = "--vsync" ] && EXTRA=""
FLAGS="--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --force-high-performance-gpu --no-first-run --no-default-browser-check $EXTRA"
if [ -n "${REAPERWAR_BROWSER:-}" ]; then
  # shellcheck disable=SC2086 # FLAGS is a list of switches
  exec "$REAPERWAR_BROWSER" --user-data-dir="$PROFILE" $FLAGS --app="$URL"
fi
# open -n starts a separate browser on the game's own profile even when the normal browser is open;
# it fails (and the next browser is tried) when the app is not installed.
for APP in "Google Chrome" "Microsoft Edge" "Chromium"; do
  # shellcheck disable=SC2086
  if open -na "$APP" --args --user-data-dir="$PROFILE" $FLAGS --app="$URL" 2>/dev/null; then
    echo "Reaper War Simulator is starting in $APP. You can close this window."
    exit 0
  fi
done
echo "Google Chrome or Microsoft Edge is needed to play. Open this address in either browser instead:"
echo "$URL"
exit 1
