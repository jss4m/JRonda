#!/data/data/com.termux/files/usr/bin/bash
# JRonda Autonomous GTFS Updater for Android - Fixed version
PROJECT_DIR="$HOME/storage/shared/Download/JRonda"
LOG_FILE="$PROJECT_DIR/gtfs-auto.log"
INTERVAL=60

log() {
  echo "[$(date)] $1" | tee -a "$LOG_FILE"
}

has_internet() {
  ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&amp;1
}

update_gtfs() {
  cd "$PROJECT_DIR" &amp;&amp; node data-build/scripts/update-gtfs.js --silent || log "Update failed"
}

while true; do
  if has_internet; then
    log "Internet detected, updating GTFS..."
    update_gtfs
    sleep $((INTERVAL * 60))
  else
    sleep 300
  fi
done
