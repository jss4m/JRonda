# JRonda Code Improvements & Issues

**Scan Date**: 2024-10 (BLACKBOXAI) - 24 prior issues + new scan (3 TODOs, 51 consoles).

## File-Level Issues [Issues]

data-build/scripts/normalize-*.js [10+ console.warn invalid data parsing; CLI verbose - low prio].
data-build/scripts/map-layout.js [1 TODO bus_stops; console.log progress].
data-build/scripts/update-gtfs.js [console.log/warn/error cycles/watch; silent flag exists].
data-build/scripts/rail_json-to-js.js [console.log counts/duplicants].
data-build/scripts/poi_txt-to-js.js [console.warn invalid POIs].
data-build/scripts/gokl_json-to-js.js [console.log counts/duplicants].
data-build/scripts/check-rail-duplicants.js [console.log stats].
data-build/scripts/bus_json-to-js.js [console.log sizes/routes].
data-build/scripts/run-layout.js [console.log/error complete].

src/core/layout-engine.js [1 TODO extraction].

src/core/render.js [console.error layout fail; console.log debug stats; console.warn skips - prod polish].

src/core/kioskSecurity.js [5 error UI/text logs].

src/core/ui.js [console.warn drawLayoutDebugOverlay missing].

src/core/bootstrap.js [console.log UIState; console.error bootstrap fail].

src/core/ui-route-cards.js [TODO: verify/remove dead module (not imported)].

src/core/tooltip-manager.js [TODO: verify/remove dead module (not imported)].

src/core/data-bootstrap.js [TODO: verify/remove dead module (not imported)].

src/style/routeStyle.js [1 duplicate warn].

sw.js [1 catch reject log].

**Summary**: Build scripts verbose (expected CLI). Core has debug consoles/TODOs (dead modules). Prod-ready, but remove for cleanliness.

**Next**: 
- Replace console.* -> structured logger (optional).
- Delete/revive TODO modules.
- `npm run build:data` → verify no-warn mode.
- `npm test` → all pass.
