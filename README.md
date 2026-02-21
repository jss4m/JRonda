Klang Valley Transit – Offline Static Model

Goal:
Build a unified, offline-capable static transit graph for Klang Valley.
Uses GTFS where available and custom canonical data where not.

Out of scope (for now):
- Realtime data
- APIs
- App UI
# JRonda

## Data Build Pipeline

GTFS data is normalized via Node.js scripts under `data-build/scripts`.
The renderer consumes only files under `data-build/normalized`.

Example:
- normalize-bus.js → bus_stops.json

## Offline USB Run (Windows)

This project is prepared to run fully offline from a USB drive.

1. Copy the whole project folder to USB.
2. On the target machine, open the folder and run `start-usb.bat`.
3. Browser opens `http://localhost:8080` and serves local files only.

Notes:
- First launch caches app/data via Service Worker (`sw.js`).
- After caching, the app continues working without internet.
- Keep the server window open while the kiosk is running.
- Optional fullscreen kiosk launcher: `start-kiosk.bat`.

## Kiosk Security

For kiosk deployments (USB + touchscreen devices), use:
- in-app lock (`src/core/kioskSecurity.js`) with PIN re-identification,
- fullscreen enforcement,
- shortcut/context-menu hardening,
- OS kiosk controls (required for true app-lock).

Read: `KIOSK_HARDENING.md`

## GTFS Build Commands

- Build bus normalized + JS:
  - `npm run build:bus`
- Build rail normalized + JS (`data/rail/rail.js`):
  - `npm run build:rail`
- Build all:
  - `npm run build:data`

Outputs:
- `data-build/normalized/bus_stops.json`
- `data-build/normalized/bus_routes.json`
- `data-build/normalized/rail_stops.json`
- `data-build/normalized/rail_routes.json`
- `data/bus/rapidbus.js`
- `data/rail/rail.js`

## GTFS Auto Update (Online Kiosk)

Data sources:
- `https://api.data.gov.my/gtfs-static/ktmb`
- `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder`
- `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl`
- `https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl`

Commands:
- One-shot update + rebuild: `npm run update:gtfs`
- Background update loop (every 60 min): `npm run update:gtfs:watch`

Launcher behavior:
- `start-usb.bat` and `start-kiosk.bat` now auto-start updater watch in background if `node` exists.

Route display name handling for bus:
- Public name is resolved as: `route_short_name` -> `route_long_name` -> `route_id`.
- Stored as `route_public_name` and used in route panel labels.
- Linux/macOS launcher: `./start-kiosk.sh` (requires `python3`, optional `node` for updater).

## POI Data Pipeline

- Source text: `data/poi/POI.txt`
- Build script: `npm run build:poi`
- Output: `data/poi/poi.js`

Renderer consumes `data/poi/poi.js` to draw POI markers and include nearby POI summaries in station tooltip info.
