#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PIDFILE="$ROOT_DIR/.runtime/jronda.pid"

if [ ! -f "$PIDFILE" ]; then
  echo "[JRonda] No running process file found."
  exit 0
fi

echo "[JRonda] Stopping background PIDs..."
while IFS= read -r pid; do
  [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null || true
done < "$PIDFILE"

rm -f "$PIDFILE"
echo "[JRonda] Stopped cleanly."