#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$ROOT_DIR/.runtime"
PIDFILE="$ROOT_DIR/.runtime/jronda.pid"
URL="http://localhost:8080/"

if [ -f "$PIDFILE" ]; then
  echo "[JRonda] Already running or stale PID file found."
  exit 1
fi

echo "[JRonda] Launching POSIX dev services..."
node "$ROOT_DIR/data-build/scripts/update-gtfs.js" --watch >"$ROOT_DIR/.runtime/updater.log" 2>&1 &
P1=$!

python3 -m http.server 8080 -d "$ROOT_DIR" >"$ROOT_DIR/.runtime/server.log" 2>&1 &
P2=$!

printf "%s\n%s\n" "$P1" "$P2" > "$PIDFILE"
echo "[JRonda] Up at $URL (PIDs: $P1, $P2). Run ./stop.sh to close."