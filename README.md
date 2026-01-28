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
