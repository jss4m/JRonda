2025-12-25 — Project scope locked
- Goal: offline, static transit graph for Klang Valley
- Realtime data explicitly out of scope
- GTFS used only where available and reliable

2025-12-25 — Data source classification
- Rail: canonical, GTFS-inspired (some operators lack GTFS)
- Bus (Rapid/Feeder): raw GTFS + config overlays
- GoKL: canonical, manual (no GTFS)
- HOHO: canonical, manual, non-routable by default

2025-12-27 — Canonical stop and route modeling
- Stops are modeled as route-scoped instances with unique stop_id per route and explicit sequence.
- Loop routes are represented by isLoop boolean at start and end position unique to route's route_id.
- A single stop object schema is shared across Rail, GoKL, and HOHO; Bus data will adapt to this schema.

2025-12-27 — Transfer and connectivity rules
- Inter-route connectivity is derived, not hardcoded.
- Walking transfers are inferred using geographic proximity and Connection flags.
- Connection flags split into 2 type, isInterchange for fee-less connection, and isConnecting for pay to connect, connection.
- Dashed line styling represents transfer edges; solid lines represent in-vehicle movement.

2025-12-27 — Data vs presentation separation
- Transit data remains under data/ as source-of-truth assets.
- Visual semantics (route colors, dashed walking edges) are resolved in runtime code under src/style/.

2025-12-27 — Route identifiers and normalization
- Source data route identifiers are not rewritten.
- Route identifiers are normalized at consumption boundaries (case- and separator-insensitive).

2025-12-27 — GoKL route metadata
- GoKL routes are fully manual and canonical.
- Official route colors are used where available; undocumented variants are explicitly flagged.

2026-01-09 — Bus data freeze
- Current bus data is derived from partial GTFS (routes + stops only).
- These files are placeholders and must not be extended.
- Accurate bus routing requires full GTFS ingestion via a build pipeline.
- Existing bus files remain frozen until replaced by normalized outputs.

2026-01-24 - Data Normalization – Bus (GTFS)

- GTFS ZIP files are treated as volatile inputs and are never consumed directly by the renderer.
- A Node.js normalization step converts GTFS `stops.txt` into a canonical JSON format.
- CSV parsing uses a standards-compliant parser to handle quoted fields.
- Output: `data-build/normalized/bus_stops.json`
- Schema (bus):
  - stop_id
  - stop_name
  - stop_lat
  - stop_lon
  - mode
  - operator
- Derived flags (interchange, connecting, loop) are intentionally excluded at this stage.

2026-03-15 — Kiosk disturbance recovery
- If UI wiring is disturbed (render interactions drop, legend disconnects), the app rebinds on `jronda:render-ready` and on visibility regain.
- Legend shows a fallback message and supports tap-to-retry to rehydrate the list without forcing a full reload.
- This favors self-healing over hard reloads to avoid breaking kiosk uptime.
