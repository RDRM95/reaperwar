#!/bin/sh
# Reaper War Simulator - Local Edition for macOS and Linux: ./run-local.sh [options]
# Builds on the first run, serves on http://127.0.0.1:4180/ and opens the game in
# Chrome or Edge on this machine's GPU. Options are passed on: ./run-local.sh --help
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed, or it is not on PATH."
  echo "Install Node.js 20.19 or newer (the LTS version) from https://nodejs.org/en/download"
  echo "and then run ./run-local.sh again."
  exit 1
fi

if [ ! -f node_modules/.package-lock.json ]; then
  echo "Installing dependencies (first run only)..."
  npm ci
fi

exec node scripts/local/launch.mjs "$@"
