# JRonda Android Kiosk Guide

## 1. PWA Install (Recommended - Offline Kiosk)
1. Copy JRonda folder to phone storage (e.g., Download/JRonda).
2. Open Chrome, navigate to `file:///storage/emulated/0/Download/JRonda/index.html`.
3. Tap menu → "Install app" → Add to home screen.
4. App icon appears → Launch → Fullscreen kiosk (Chrome kiosk mode).
5. Set PIN on first run (full keyboard now).

**PIN persists** in app storage. GTFS static (offline-first).

## 2. Full Server + Auto-Updates (Termux)
### Install Termux (F-Droid version recommended)
```
pkg update
pkg install nodejs python
```

### Autonomous GTFS Updates (Fixed - Internet Aware)\nUse android-autoupdate-fixed.sh (cleaned HTML entities)\n1. `chmod +x android-autoupdate-fixed.sh`\n2. `cd /storage/emulated/0/Download/JRonda && ./android-autoupdate-fixed.sh &`\n   - Auto-pings internet, 60min updates, gtfs-auto.log\n3. Termux:Boot: copy to ~/.termux/boot/

### Run Local Server
```
cd /storage/emulated/0/Download/JRonda
termux-setup-storage
python -m http.server 8080
```

New terminal:
```
am start -a android.intent.action.VIEW -d http://localhost:8080 --ez android.intent.extra.FULL_SCREEN true --es android.intent.extra.TITLE \"JRonda Kiosk\"
```

New terminal:
```
am start -a android.intent.action.VIEW -d http://localhost:8080 --ez android.intent.extra.FULL_SCREEN true --es android.intent.extra.TITLE "JRonda Kiosk"
```

## 3. USB OTG Auto-Run (Advanced)
- Root phone + Tasker/Automate → USB detect → Run Termux script.
- Or use Android-x86 PC with USB boot (load GRUB + Termux container).

## Troubleshooting
- PIN keyboard numeric? Fixed - now full keyboard.
- No updates? Run `node data-build/scripts/update-gtfs.js` manually (internet).
- Fullscreen: Chrome flags + kioskSecurity.js enforces.

**Tested**: PWA works offline, server for updates. PIN secure/persistent across sessions.

---
*USB copy → Android storage → Chrome PWA install → Kiosk ready.*

