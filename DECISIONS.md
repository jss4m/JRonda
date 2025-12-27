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