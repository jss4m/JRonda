#!/data/data/com.termux/files/usr/bin/bash
# JRonda Autonomous GTFS Updater for Android - Runs when internet detected
# Place in ~/storage/shared/JRonda/android-autoupdate.sh
# Setup: termux-setup-storage, pkg install nodejs cron, termux-boot setup

PROJECT_DIR="$HOME/storage/shared/Download/JRonda"
LOG_FILE="$PROJECT_DIR/gtfs-auto.log"
INTERVAL=60 # min

log() {
  echo "[$(date)] $1" | tee -a "$LOG_FILE"
}

has_internet() {\n  ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&1\n}

update_gtfs() {\n  cd "$PROJECT_DIR" && node data-build/scripts/update-gtfs.js --silent || log "Update failed"\n}

while true; do
  if has_internet; then
    log "Internet detected, updating GTFS..."
    update_gtfs
    sleep $((INTERVAL * 60))
  else
    sleep 300 # Check every 5min when offline
  fi
done
