#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
URL="http://localhost:8080/"

if command -v node >/dev/null 2>&1; then
  node "$ROOT_DIR/data-build/scripts/update-gtfs.js" --watch --interval-min=60 >/tmp/jronda-updater.log 2>&1 &
fi

if command -v python3 >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && python3 -m http.server 8080 >/tmp/jronda-server.log 2>&1) &
else
  echo "python3 is required for start-kiosk.sh"
  exit 1
fi

sleep 2

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
fi

echo "JRonda running at $URL"
echo "Updater/server logs: /tmp/jronda-updater.log /tmp/jronda-server.log"
