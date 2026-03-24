import { stations } from "../../data/rail/stations.js";
import { rail } from "../../data/rail/rail.js";
import { railTimetables } from "../../data/rail/timetables.js";
import { busTimetables } from "../../data/bus/timetables.js";
import { poi as poiRaw } from "../../data/poi/poi.js";
import { goKL } from "../../data/gokl/goKL.js";
import { rapidbus } from "../../data/bus/rapidbus.js";
import { getPoiCategoryStyle, getRouteColor, getServiceLabel } from "../style/routeStyle.js";
import { hohoKL, hohoSel } from "../../data/hoho/hoho.js";

// Extracted modules
import { rebuildSpatialIndexes, schemaStopIndex, geoStopIndex, poiSchemaIndex } from "./spatial-index.js";
import { buildSchematicLayout as layoutBuildSchematic, projectGeo as layoutProjectGeo, fitVisibleNetworkToViewport as layoutFitVisibleNetwork, snapAngle45, normalizeStopName } from "./layout-engine.js";
import { createSvgLayers, computeMapRenderProfile, drawRoutes, drawInterchanges, drawStopsAndPois } from "./map-renderer.js";
import { polylinePathFromPoints, getOffsetPolyline } from "./render-utils.js";
import { SVG_WIDTH, SVG_HEIGHT, MARGIN, NODE_SPACING, 
  ROUTE_OFFSET, TRANSFER_RADIUS, MIN_MARGIN, TRANSFER_DISTANCE, 
  SNAP_RADIUS, TOUCH_SELECT_RADIUS, GPS_SNAP_METERS, 
  PRIMARY_RAIL_STROKE, SECONDARY_RAIL_STROKE, BUS_STROKE, CONNECTION_STROKE, 
  INACTIVE_ROUTE_STROKE, ACTIVE_ROUTE_STROKE, INACTIVE_ROUTE_COLOR, 
  CC_SEGMENT_LENGTH, CC_LANE_GAP, FLOATING_PANEL_IDLE_MS, FIXED_KIOSK_STOP_KEY } from "./render-config.js";
import { mergeRailStops, normalizePoiList, assignPoiIds } from "./data-merger.js";
import { emitToast, getPendingInitToasts, clearPendingInitToasts, translate, translatef } from "./toast-manager.js";
import { subscribe } from "./ui-state.js";

let svg = null;
let runtimeSvgWidth = SVG_WIDTH;
let runtimeSvgHeight = SVG_HEIGHT;
let sharedTrackLayer = null;
let routeLayer = null;
let transferLayer = null;
let stopLayer = null;
let poiLayer = null;
let labelLayer = null;
let interactionLayer = null;
let gpsLayer = null;
let startBadge = null;
let endBadge = null;

function __coreDebug(...args) {
  // Disabled in production to avoid console spam.
}

function reportInitProgress(progress = 0, message = "") {
  if (typeof window !== "undefined" && typeof window.CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("jronda:loading-progress", {
      detail: { progress: Number(progress), message: String(message) },
    }));
  }
}



export async function init(svgElement) {
  try {
    svg = svgElement;
    __coreDebug("render.init called", { allStations: allStations.length, routes: routes.size, poi: poiList.length });
    if (!svg) throw new Error('No SVG element provided to render.init()');
    const parentRect = svg.parentElement?.getBoundingClientRect?.();
    const measuredW = Math.max(640, Math.round(Number(parentRect?.width) || SVG_WIDTH));
    const measuredH = Math.max(520, Math.round(Number(parentRect?.height) || SVG_HEIGHT));
    runtimeSvgWidth = measuredW;
    runtimeSvgHeight = measuredH;
    svg.setAttribute("viewBox", `0 0 ${runtimeSvgWidth} ${runtimeSvgHeight}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    reportInitProgress(0.05, "Initializing map render");
({
    sharedTrackLayer,
    routeLayer,
    transferLayer,
    stopLayer,
    poiLayer,
    labelLayer,
    interactionLayer,
    gpsLayer
  } = createSvgLayers(svg));

  // Ensure GPS layer renders above rail/bus
  gpsLayer.style.zIndex = '10';
  routeLayer.style.zIndex = '1';
  stopLayer.style.zIndex = '5';
  interactionLayer.style.zIndex = '20';


  reportInitProgress(0.25, "SVG layers attached");

  // Populate station name index
  for (const stop of allStations) {
    const key = String(stop.stop_name || "").trim().toLowerCase();
    if (!stationNameIndex.has(key)) stationNameIndex.set(key, []);
    stationNameIndex.get(key).push(stop);
  }

  // HOHO routes
  for (const stop of allStations) {
    const isHoho = String(stop.category || "").toUpperCase() === "HOHO";
    if (!isHoho) continue;
    const key = String(stop.stop_name || "").trim().toLowerCase();
    if (!key) continue;
    if (!hohoRoutesByStopName.has(key)) hohoRoutesByStopName.set(key, new Set());
    hohoRoutesByStopName.get(key).add(String(stop.route_id || ""));
  }

  // Geo projection
  for (const s of allStations) {
    const [x, y] = layoutProjectGeo(s.stop_lat, s.stop_lon, runtimeSvgWidth, runtimeSvgHeight, MARGIN, allStations);
    s.xgeo = x;
    s.ygeo = y;
  }

  for (const p of poiList) {
    const [x, y] = layoutProjectGeo(p.lat, p.lon, runtimeSvgWidth, runtimeSvgHeight, MARGIN, allStations);
    p.xgeo = x;
    p.ygeo = y;
  }

  reportInitProgress(0.55, "Computed geo projection");
  __coreDebug('render.init stage', 'geo projection computed');

  // Now safe to run all render init code
  const layoutInfo = await layoutBuildSchematic(allStations, routes, getRouteMode, { svgWidth: runtimeSvgWidth, svgHeight: runtimeSvgHeight, margin: MARGIN });
  console.log('layoutInfo', layoutInfo);
  
  // DEBUG: Export layout for inspection
  if (layoutInfo.success) {
    console.log('Layout debug stats:', {
      totalNodes: layoutInfo.nodes.length,
      hubs: layoutInfo.nodes.filter(n => n.type?.includes('hub')).length,
      stations: layoutInfo.nodes.filter(n => n.type === 'station').length
    });
  } else {
    console.error('Layout failed:', layoutInfo);
  }
  
  buildPoiLayout();

  __coreDebug('render.init stage', 'layout built and POI layout done');

  rebuildRouteGeometryCaches();
  applyRenderedStopPlacement();
  spreadSharedRailStops();
  rebuildRouteGeometryCaches();
  applyRenderedStopPlacement();
  spreadSharedRailStops();
  alignBusStopsToRailTransferStations();
  fitVisibleNetworkToViewport();
  refreshRouteBaseCoordinates();
  buildBusLoopRenderCache();
  syncBusLoopStopsToRenderedPath();
  rebuildSpatialIndexes(mapVisibleStops, poiList);

  reportInitProgress(0.75, "Spatial indexes rebuilt");
  __coreDebug('render.init stage', 'geometry caches built');
  interchangeCandidates = mapVisibleStops.filter(
    (s) => s.isInterchange || s.isConnecting
  );

  // ================= DRAW ROUTES + INTERCHANGES + STOPS + POI =================
  drawRoutes({
    routes,
    routeDisplayStops,
    routeLayer,
    routeLineRegistry,
    getRouteColor,
    getRouteMode,
    getOffsetPolyline,
    getRouteStopPoint,
    getSegmentOffset,
    makeSegmentKey,
    isCcRailRouteId,
    isCcRailStop,
    polylinePathFromPoints,
    PRIMARY_RAIL_STROKE,
    SECONDARY_RAIL_STROKE,
    BUS_STROKE,
    routeLayerWeight,
    busLoopRenderCache,
  });

  drawInterchanges({
    interchangeCandidates,
    schemaStopIndex,
    transferLayer,
    SCHEMA_BUCKET_SIZE,
    getNearbyFromIndex,
    getRouteMode,
    TRANSFER_DISTANCE,
    CONNECTION_STROKE,
    transferLineRegistry,
  });

  // Layout debug removed
  
  // Guard against NaN layout
  if (!layoutInfo?.success || !mapVisibleStops.length) {
    console.warn('Skipping drawStopsAndPois: Invalid layoutInfo or empty stops');
  } else {
  drawStopsAndPois({

    mapVisibleStops,
    stopLayer,
    interactionLayer,
    labelLayer,
    poiLayer,
    poiList,
    stopElementRegistry,
    poiElementRegistry,
    getRouteMode,
    TOUCH_SELECT_RADIUS,
    TRANSFER_RADIUS,
    getPoiCategoryStyle,
    terminalStopIds,
  });

  // End guard
  } 

  // Create endpoint badges
  startBadge = createEndpointBadge("S", "#0D6EFD");
  endBadge = createEndpointBadge("E", "#D63384");
  svg.appendChild(startBadge.g);
  svg.appendChild(endBadge.g);

  const profile = computeMapRenderProfile(mapVisibleStops);
  
  __coreDebug("render.init completed", {
    routeLayerCount: routeLayer?.children?.length ?? 0,
    stopLayerCount: stopLayer?.children?.length ?? 0,
    poiLayerCount: poiLayer?.children?.length ?? 0,
    interactionLayerCount: interactionLayer?.children?.length ?? 0,
  });
  
  // DIAGNOSTIC: Log layer contents post-draw
  console.log('MAP LAYERS DEBUG:', {
    routeLayerCount: routeLayer.children.length,
    stopLayerCount: stopLayer.children.length,
    poiLayerCount: poiLayer.children.length,
    firstRoutePath: routeLayer.children[0]?.tagName + (routeLayer.children[0]?.getAttribute('d')?.slice(0, 50) || ''),
    firstPoi: poiLayer.children[0]?.tagName || 'EMPTY',
    profile
  });
  window.jrondaRenderDebug = window.jrondaRenderDebug || {};
  window.jrondaRenderDebug.layers = {
    route: routeLayer.children.length,
    stop: stopLayer.children.length,
    poi: poiLayer.children.length
  };
  window.svg = svg;
  window.routeLineRegistry = routeLineRegistry;
  window.stopElementRegistry = stopElementRegistry;
  window.stationById = stationById;

  __coreDebug('render mapVisibleStops bounds', profile);

  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('jronda:render-ready'));
    reportInitProgress(1, "Map render complete");
  }

  window.renderFromState = renderFromState;
  if (typeof subscribe === 'function') {
    const unsubscribeRender = subscribe(renderFromState);
    window.renderUnsubscribe = unsubscribeRender;
  }
  window.jrondaRenderDebug = {
    ...window.jrondaRenderDebug,
    routeLayerCount: routeLayer.children.length,
    stopLayerCount: stopLayer.children.length,
    profile
  };

  // ... rest of init calls ...
  }
  catch (err) { 
    console.error('Error during render.init:', err);
  }
}

function redrawBaseLayers() {
  if (!routeLayer || !transferLayer || !stopLayer || !poiLayer || !labelLayer || !interactionLayer) return;
  routeLayer.replaceChildren();
  transferLayer.replaceChildren();
  stopLayer.replaceChildren();
  poiLayer.replaceChildren();
  labelLayer.replaceChildren();
  interactionLayer.replaceChildren();

  routeLineRegistry.clear();
  stopElementRegistry.clear();
  transferLineRegistry.length = 0;
  poiElementRegistry.length = 0;

  drawRoutes({
    routes,
    routeDisplayStops,
    routeLayer,
    routeLineRegistry,
    getRouteColor,
    getRouteMode,
    getOffsetPolyline,
    getRouteStopPoint,
    getSegmentOffset,
    makeSegmentKey,
    isCcRailRouteId,
    isCcRailStop,
    polylinePathFromPoints,
    PRIMARY_RAIL_STROKE,
    SECONDARY_RAIL_STROKE,
    BUS_STROKE,
    routeLayerWeight,
    busLoopRenderCache,
  });

  drawInterchanges({
    interchangeCandidates,
    schemaStopIndex,
    transferLayer,
    SCHEMA_BUCKET_SIZE,
    getNearbyFromIndex,
    getRouteMode,
    TRANSFER_DISTANCE,
    CONNECTION_STROKE,
    transferLineRegistry,
  });

  drawStopsAndPois({
    mapVisibleStops,
    stopLayer,
    interactionLayer,
    labelLayer,
    poiLayer,
    poiList,
    stopElementRegistry,
    poiElementRegistry,
    getRouteMode,
    TOUCH_SELECT_RADIUS,
    TRANSFER_RADIUS,
    getPoiCategoryStyle,
    terminalStopIds,
  });

  window.svg = svg;
  window.routeLineRegistry = routeLineRegistry;
  window.stopElementRegistry = stopElementRegistry;
  window.stationById = stationById;
}

export function renderFromState(state) {
  if (!svg) return;
  console.log("RENDER", state);

  redrawBaseLayers();

  const ui = state?.ui && typeof state.ui === "object" ? state.ui : {};
  const selectedLine = ui.selectedLine ?? state?.selectedLine ?? null;
  const displayMode = ui.displayMode ?? state?.displayMode ?? "ALL";
  const busVisibility = ui.busVisibility ?? state?.busVisibility ?? true;
  const startStopId = ui.from ?? state?.from ?? null;
  const endStopId = ui.to ?? state?.to ?? null;
  const selectedRoute = ui.selectedRoute ?? state?.selectedRoute ?? null;

  setDisplayModeFilter(displayMode);
  setBusVisibility(busVisibility);
  setRailCategoryFilter(null);
  setRailRouteFilter(selectedLine);
  setRouteEndpoints(startStopId, endStopId);

  if (selectedRoute && Array.isArray(selectedRoute.path) && selectedRoute.path.length >= 2) {
    drawRoute(selectedRoute);
  } else {
    if (activeRouteOverlay) {
      activeRouteOverlay.remove();
      activeRouteOverlay = null;
    }
    applyLayerVisibility();
    refreshEndpointBadges();
  }
}

const ETS_ROUTE_ID = "ETS";
const EXCLUDED_NON_CANONICAL_RAIL_IDS = new Set(["100_47300", "100_9000", "SH", "ST", "ERT"]);
const KLANG_VALLEY_BOUNDS = {
  minLat: 2.6,
  maxLat: 3.5,
  minLon: 101.2,
  maxLon: 102.1,
};

function inKlangValley(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  return (
    la >= KLANG_VALLEY_BOUNDS.minLat &&
    la <= KLANG_VALLEY_BOUNDS.maxLat &&
    lo >= KLANG_VALLEY_BOUNDS.minLon &&
    lo <= KLANG_VALLEY_BOUNDS.maxLon
  );
}

const etsStopIds = new Set(
  (rail || [])
    .filter((s) => String(s.route_id) === ETS_ROUTE_ID)
    .map((s) => String(s.source_stop_id || s.stop_id || ""))
    .filter(Boolean)
);

const railNoETS = (rail || []).filter((s) => {
  const routeId = String(s.route_id || "");
  return routeId !== ETS_ROUTE_ID && !EXCLUDED_NON_CANONICAL_RAIL_IDS.has(routeId);
});
const stationsNoETS = (stations || []).filter((s) => {
  const routeId = String(s.route_id || "");
  return routeId !== ETS_ROUTE_ID && !EXCLUDED_NON_CANONICAL_RAIL_IDS.has(routeId);
});
const mergedRail = mergeRailStops(railNoETS, stationsNoETS);
const allStationsRaw = [...hohoKL, ...hohoSel, ...goKL, ...rapidbus, ...mergedRail];
const allStations = allStationsRaw.filter((s) => inKlangValley(s.stop_lat, s.stop_lon));
const railRouteIds = new Set(mergedRail.map((s) => String(s.route_id)));

function offsetLatLon(lat, lon, eastMeters, northMeters) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return { lat: la, lon: lo };
  const latRad = (la * Math.PI) / 180;
  const dLat = northMeters / 111320;
  const dLon = eastMeters / (111320 * Math.cos(latRad));
  return { lat: la + dLat, lon: lo + dLon };
}

function buildSyntheticPois(stations, basePois) {
  const out = [];
  const atmCandidates = (basePois || []).filter((p) => String(p.category || "").toLowerCase() === "atm");
  const railStops = (stations || []).filter((s) => getRouteMode(s.route_id) === "RAIL");

  const ensureWithinBounds = (p) => inKlangValley(p.lat, p.lon);

  for (const stop of railStops) {
    const lat = Number(stop.stop_lat);
    const lon = Number(stop.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const hasNearbyAtm = atmCandidates.some((p) => {
      const d = haversineMeters(lat, lon, p.lat, p.lon);
      return Number.isFinite(d) && d <= 800;
    });
    if (!hasNearbyAtm) {
      const atmPos = offsetLatLon(lat, lon, 120, 0);
      if (ensureWithinBounds(atmPos)) {
        out.push({
          id: `atm-${stop.stop_id}`,
          section: "SERVICES",
          name: `ATM near ${stop.stop_name || stop.stop_id}`,
          category: "ATM",
          longitude: atmPos.lon,
          latitude: atmPos.lat,
        });
      }
    }

    const prayerPos = offsetLatLon(lat, lon, -90, 70);
    const toiletPos = offsetLatLon(lat, lon, 90, 70);
    const disabledPos = offsetLatLon(lat, lon, 0, -90);
    const amenityPois = [
      {
        id: `amenity-prayer-${stop.stop_id}`,
        section: "AMENITIES",
        name: `Prayer Room (${stop.stop_name || stop.stop_id})`,
        category: "Prayer Room",
        longitude: prayerPos.lon,
        latitude: prayerPos.lat,
      },
      {
        id: `amenity-toilet-${stop.stop_id}`,
        section: "AMENITIES",
        name: `Toilet (${stop.stop_name || stop.stop_id})`,
        category: "Toilet",
        longitude: toiletPos.lon,
        latitude: toiletPos.lat,
      },
      {
        id: `amenity-disabled-toilet-${stop.stop_id}`,
        section: "AMENITIES",
        name: `Disabled Toilet (${stop.stop_name || stop.stop_id})`,
        category: "Disabled Toilet",
        longitude: disabledPos.lon,
        latitude: disabledPos.lat,
      },
    ];
    for (const p of amenityPois) {
      if (ensureWithinBounds({ lat: p.latitude, lon: p.longitude })) out.push(p);
    }
  }

  return out;
}

const basePoiList = normalizePoiList(poiRaw).filter((p) => inKlangValley(p.lat, p.lon));
const syntheticPois = buildSyntheticPois(allStations, basePoiList);
const poiList = assignPoiIds([...basePoiList, ...syntheticPois]);

for (const s of allStations) {
  const key = String(s.source_stop_id || s.stop_id || "");
  if (etsStopIds.has(key)) s.accessETS = true;
}

const stationById = new Map(allStations.map((s) => [String(s.stop_id), s]));

let routes = new Map();
for (const s of allStations) {
  if (!routes.has(s.route_id)) routes.set(s.route_id, []);
  routes.get(s.route_id).push(s);
}
for (const [routeId, routeStops] of routes.entries()) {
  routeStops.sort((a, b) => {
    const as = Number(a.seq ?? 0);
    const bs = Number(b.seq ?? 0);
    if (as !== bs) return as - bs;
    return String(a.stop_id || "").localeCompare(String(b.stop_id || ""));
  });
  routes.set(routeId, routeStops);
}

export function consumeInitToasts() {
  const out = getPendingInitToasts();
  clearPendingInitToasts();
  return out;
}

const railFallbackCount = mergedRail.filter((s) => s._fallbackFromStations).length;
if (railFallbackCount > 0) {
  emitToast(
    translatef(
      "rail_fallback_active",
      "Rail fallback active for {count} stop records.",
      { count: railFallbackCount }
    ),
    "warn"
  );
}

// ================= UTIL =================
function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function getRouteMode(routeId) {
  return railRouteIds.has(String(routeId ?? "")) ? "RAIL" : "BUS";
}

function routeLayerWeight(routeIdOrCategory) {
  const mode = getRouteMode(routeIdOrCategory);
  // Passenger rail should render on top of bus lines.
  if (mode === "RAIL") return 1;
  return 0;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseHHMMToMinutes(v) {
  const m = String(v || "").match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function formatMinutesFromNow(targetMinutes, nowMinutes) {
  if (!Number.isFinite(targetMinutes) || !Number.isFinite(nowMinutes)) return null;
  const diff = Math.max(0, Math.round(targetMinutes - nowMinutes));
  return diff;
}

function estimateHeadwayMinutes(times) {
  const mins = (Array.isArray(times) ? times : [])
    .map(parseHHMMToMinutes)
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  if (mins.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < mins.length; i++) {
    const d = mins[i] - mins[i - 1];
    if (d > 0 && d <= 180) diffs.push(d);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 ? diffs[mid] : Math.round((diffs[mid - 1] + diffs[mid]) / 2);
}

function buildEstimatedSchedule(times, nowMinutes, limit = 3) {
  const base = (Array.isArray(times) ? times : [])
    .map((t) => ({ t, m: parseHHMMToMinutes(t) }))
    .filter((x) => x.m != null)
    .sort((a, b) => a.m - b.m);
  if (!base.length) return [];

  const start = base[0].m;
  const end = base[base.length - 1].m;
  const headway = estimateHeadwayMinutes(base.map((x) => x.t)) || 10;
  if (!Number.isFinite(start) || !Number.isFinite(end) || headway <= 0) return [];

  const rows = [];
  let cursor = start;
  while (cursor <= end) {
    rows.push(cursor);
    cursor += headway;
    if (rows.length > 2400) break;
  }

  const past = rows.filter((m) => m < nowMinutes);
  const future = rows.filter((m) => m >= nowMinutes);
  const out = [];
  const lastPast = past[past.length - 1];
  if (lastPast != null) out.push({ t: formatMinutesToHHMM(lastPast), m: lastPast, status: "past" });
  for (let i = 0; i < future.length && out.length < limit; i++) {
    out.push({ t: formatMinutesToHHMM(future[i]), m: future[i], status: i === 0 ? "next" : "upcoming" });
  }
  if (!out.length) return [];
  return out.slice(0, limit);
}

function formatMinutesToHHMM(mins) {
  const total = Math.max(0, Math.round(mins));
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function getNextDeparturesInMinutes(times, nowMinutes, limit = 2) {
  const schedule = buildEstimatedSchedule(times, nowMinutes, Math.max(limit, 3))
    .filter((row) => row.status !== "past")
    .map((row) => row.m);
  return schedule.slice(0, limit).map((m) => formatMinutesFromNow(m, nowMinutes));
}

function getTodayTimetableBucket() {
  const d = new Date().getDay();
  if (d === 6) return "saturday";
  if (d === 0) return "sunday";
  return "weekday";
}

function resolveSourceStopId(stop) {
  if (stop?.source_stop_id != null) return String(stop.source_stop_id);
  const sid = String(stop?.stop_id || "");
  const rid = String(stop?.route_id || "");
  const prefix = rid ? `${rid}_` : "";
  if (prefix && sid.startsWith(prefix)) return sid.slice(prefix.length);
  return sid;
}

function getUpcomingDepartures(hhmmList, limit = 4) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const sorted = (hhmmList || [])
    .map((x) => ({ t: x, m: parseHHMMToMinutes(x) }))
    .filter((x) => x.m != null)
    .sort((a, b) => a.m - b.m);
  if (!sorted.length) return [];
  const sameDay = sorted.filter((x) => x.m >= nowMins).slice(0, limit).map((x) => x.t);
  if (sameDay.length >= limit) return sameDay;
  const wrap = sorted.slice(0, Math.max(0, limit - sameDay.length)).map((x) => `${x.t}*`);
  return [...sameDay, ...wrap];
}

const SCHEMA_BUCKET_SIZE = 42;
const GEO_BUCKET_SIZE = 42;

function makeBucketKey(x, y, size) {
  return `${Math.floor(x / size)}:${Math.floor(y / size)}`;
}

function buildSpatialIndex(items, getX, getY, size) {
  const index = new Map();
  for (const item of items) {
    const x = getX(item);
    const y = getY(item);
    const key = makeBucketKey(x, y, size);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  }
  return index;
}

function getNearbyFromIndex(index, x, y, size) {
  const bx = Math.floor(x / size);
  const by = Math.floor(y / size);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${bx + dx}:${by + dy}`;
      const items = index.get(key);
      if (items) out.push(...items);
    }
  }
  return out;
}

const routeLineRegistry = new Map();
const stopElementRegistry = new Map();
const poiElementRegistry = [];
const stationNameIndex = new Map();
const transferLineRegistry = [];
let continuationPanelData = [];
let includeBusLayer = true;
let startStopBadgeId = null;
let endStopBadgeId = null;
let selectedRailRouteId = null;
let selectedRailCategory = null;

const hohoRoutesByStopName = new Map();

// ================= SCHEMATIC LAYOUT =================
// Helpers delegated to layout-engine.js (normalizeStopName, snapAngle45)

function isCcRailRouteId(routeId) {
  const id = String(routeId || "").toUpperCase();
  return id === "CC" || id === "CCL" || id === "CIRCLE";
}

function isCcRailStop(stop) {
  if (!stop) return false;
  if (isCcRailRouteId(stop.route_id)) return true;
  const sid = String(stop.stop_id || "").toUpperCase();
  if (/^CC\d+/.test(sid)) return true;
  const name = String(stop.route_long_name || stop.stop_name || "").toUpperCase();
  return name.includes("CIRCLE");
}

function canonicalStopKey(stop) {
  if (!stop) return "";
  if (stop.source_stop_id) return String(stop.source_stop_id);
  const stopId = String(stop.stop_id || "");
  const routeId = String(stop.route_id || "");
  const prefix = `${routeId}_`;
  if (routeId && stopId.startsWith(prefix)) {
    return stopId.slice(prefix.length);
  }
  return stopId;
}

const routeTopologyClassifications = new Map();

function getNodeRefId(stop) {
  return canonicalStopKey(stop) || String(stop?.stop_id || "");
}

function geoBucketFromStops(a, b) {
  if (!a || !b) return null;
  const dLon = Number(b.stop_lon) - Number(a.stop_lon);
  const dLat = Number(b.stop_lat) - Number(a.stop_lat);
  if (!Number.isFinite(dLon) || !Number.isFinite(dLat)) return null;
  if (Math.abs(dLon) < 1e-9 && Math.abs(dLat) < 1e-9) return null;
  if (Math.abs(dLat) >= Math.abs(dLon)) return dLat >= 0 ? "N" : "S";
  return dLon >= 0 ? "E" : "W";
}

function dirVec(bucket) {
  if (bucket === "N") return { x: 0, y: -1 };
  if (bucket === "S") return { x: 0, y: 1 };
  if (bucket === "W") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function perpVec(bucket) {
  if (bucket === "N") return { x: 1, y: 0 };
  if (bucket === "S") return { x: -1, y: 0 };
  if (bucket === "W") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function findNearestOutboundBucket(routeStops, dockIdx, ccNodeIds) {
  if (dockIdx < routeStops.length - 1) {
    const b = geoBucketFromStops(routeStops[dockIdx], routeStops[dockIdx + 1]);
    if (b && !ccNodeIds.has(getNodeRefId(routeStops[dockIdx + 1]))) return b;
  }
  if (dockIdx > 0) {
    const b = geoBucketFromStops(routeStops[dockIdx], routeStops[dockIdx - 1]);
    if (b && !ccNodeIds.has(getNodeRefId(routeStops[dockIdx - 1]))) return b;
  }
  return "E";
}

export function getRouteTopologyClassifications() {
  return new Map(routeTopologyClassifications);
}

function relaxDenseRailStops(railStops, anchors, minSpacing = 22, iterations = 18) {
  if (!railStops.length) return;
  const basePos = new Map();
  for (const s of railStops) {
    basePos.set(String(s.stop_id), { x: s.layoutX, y: s.layoutY });
  }

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < railStops.length; i++) {
      const a = railStops[i];
      for (let j = i + 1; j < railStops.length; j++) {
        const b = railStops[j];
        if (normalizeStopName(a.stop_name) === normalizeStopName(b.stop_name)) continue;

        const dx = b.layoutX - a.layoutX;
        const dy = b.layoutY - a.layoutY;
        const d = Math.hypot(dx, dy);
        if (d <= 0 || d >= minSpacing) continue;

        const overlap = (minSpacing - d) * 0.5;
        const ux = dx / d;
        const uy = dy / d;
        const aPinned = anchors.has(String(a.stop_id));
        const bPinned = anchors.has(String(b.stop_id));
        const aW = aPinned ? 0.2 : 1;
        const bW = bPinned ? 0.2 : 1;
        const denom = aW + bW || 1;
        const aPush = (bW / denom) * overlap;
        const bPush = (aW / denom) * overlap;

        a.layoutX -= ux * aPush;
        a.layoutY -= uy * aPush;
        b.layoutX += ux * bPush;
        b.layoutY += uy * bPush;
      }
    }

    // Gentle spring to preserve route skeleton.
    for (const s of railStops) {
      const base = basePos.get(String(s.stop_id));
      if (!base) continue;
      const pinned = anchors.has(String(s.stop_id));
      const spring = pinned ? 0.28 : 0.1;
      s.layoutX += (base.x - s.layoutX) * spring;
      s.layoutY += (base.y - s.layoutY) * spring;
    }
  }
}

function enforceRailCardinalGeometry(railRouteEntries, anchors) {
  for (const [, routeStops] of railRouteEntries) {
    if (routeStops.length < 2) continue;
    const anchorIdx = [];
    for (let i = 0; i < routeStops.length; i++) {
      if (anchors.has(String(routeStops[i].stop_id))) anchorIdx.push(i);
    }
    if (!anchorIdx.length) anchorIdx.push(0, routeStops.length - 1);
    if (anchorIdx[0] !== 0) anchorIdx.unshift(0);
    if (anchorIdx[anchorIdx.length - 1] !== routeStops.length - 1) anchorIdx.push(routeStops.length - 1);

    for (let k = 0; k < anchorIdx.length - 1; k++) {
      const i0 = anchorIdx[k];
      const i1 = anchorIdx[k + 1];
      if (i1 <= i0) continue;
      const a = routeStops[i0];
      const b = routeStops[i1];
      const dx = b.layoutX - a.layoutX;
      const dy = b.layoutY - a.layoutY;
      const theta = snapAngle45(dx, dy);
      const ux = Math.cos(theta);
      const uy = Math.sin(theta);
      const segCount = i1 - i0;
      const projected = Math.max(
        NODE_SPACING * 0.7,
        Math.abs(dx * ux + dy * uy)
      );

      for (let i = i0 + 1; i < i1; i++) {
        const t = (i - i0) / segCount;
        const s = routeStops[i];
        if (anchors.has(String(s.stop_id))) continue;
        s.layoutX = a.layoutX + ux * projected * t;
        s.layoutY = a.layoutY + uy * projected * t;
      }
    }
  }
}

function buildCcAnchoredTopology(railStops) {
  const railRouteEntries = Array.from(routes.entries()).filter(
    ([routeId]) => getRouteMode(routeId) === "RAIL"
  );
  if (!railRouteEntries.length) return false;

  const ccRouteEntry = railRouteEntries
    .filter(([routeId, stops]) => isCcRailRouteId(routeId) || stops.some((s) => isCcRailStop(s)))
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (!ccRouteEntry || !Array.isArray(ccRouteEntry[1]) || ccRouteEntry[1].length < 4) return false;

  const ccStops = ccRouteEntry[1].slice();
  const ccNodes = [];
  const ccSeen = new Set();
  for (const stop of ccStops) {
    const nodeId = getNodeRefId(stop);
    if (ccSeen.has(nodeId)) continue;
    ccSeen.add(nodeId);
    ccNodes.push(stop);
  }
  if (ccNodes.length < 4) return false;

  const ccDirections = [];
  let fallbackDir = "E";
  for (let i = 0; i < ccNodes.length; i++) {
    const cur = ccNodes[i];
    const nxt = ccNodes[(i + 1) % ccNodes.length];
    const b = geoBucketFromStops(cur, nxt) || fallbackDir;
    ccDirections.push(b);
    fallbackDir = b;
  }

  const center = { x: SVG_WIDTH * 0.5, y: SVG_HEIGHT * 0.5 };
  const ccPos = [{ x: center.x, y: center.y }];
  for (let i = 1; i < ccNodes.length; i++) {
    const v = dirVec(ccDirections[i - 1]);
    const prev = ccPos[i - 1];
    ccPos.push({
      x: prev.x + v.x * CC_SEGMENT_LENGTH,
      y: prev.y + v.y * CC_SEGMENT_LENGTH,
    });
  }
  const closeVec = dirVec(ccDirections[ccDirections.length - 1]);
  const closeEnd = {
    x: ccPos[ccPos.length - 1].x + closeVec.x * CC_SEGMENT_LENGTH,
    y: ccPos[ccPos.length - 1].y + closeVec.y * CC_SEGMENT_LENGTH,
  };
  const closeDelta = { x: center.x - closeEnd.x, y: center.y - closeEnd.y };
  for (let i = 0; i < ccPos.length; i++) {
    const t = i / ccPos.length;
    ccPos[i].x += closeDelta.x * t;
    ccPos[i].y += closeDelta.y * t;
  }

  const ccNodePoint = new Map();
  for (let i = 0; i < ccNodes.length; i++) {
    const nodeId = getNodeRefId(ccNodes[i]);
    const p = ccPos[i];
    ccNodePoint.set(nodeId, p);
    ccNodes[i].xschema = p.x;
    ccNodes[i].yschema = p.y;
    ccNodes[i]._schemaLocked = true;
  }

  const departureGroups = new Map();
  routeTopologyClassifications.clear();

  for (const [routeId, routeStops] of railRouteEntries) {
    const rid = String(routeId || "");
    const isCC = rid === String(ccRouteEntry[0]) || routeStops.some((s) => isCcRailStop(s));
    if (isCC) {
      routeTopologyClassifications.set(rid, "cc_backbone");
      continue;
    }
    const touchIdx = [];
    for (let i = 0; i < routeStops.length; i++) {
      if (ccNodePoint.has(getNodeRefId(routeStops[i]))) touchIdx.push(i);
    }
    let cls = "independent";
    if (touchIdx.length === 1) cls = "radial";
    else if (touchIdx.length >= 2) cls = "chord";
    routeTopologyClassifications.set(rid, cls);

    if (!touchIdx.length) {
      // Independent rail: still schematic, but anchored to projected geography.
      const first = routeStops[0];
      if (first) {
        first.xschema = Number.isFinite(first.xschema) ? first.xschema : first.xgeo;
        first.yschema = Number.isFinite(first.yschema) ? first.yschema : first.ygeo;
      }
      let prevDir = "E";
      for (let i = 1; i < routeStops.length; i++) {
        const prev = routeStops[i - 1];
        const cur = routeStops[i];
        const b = geoBucketFromStops(prev, cur) || prevDir;
        prevDir = b;
        const v = dirVec(b);
        cur.xschema = prev.xschema + v.x * CC_SEGMENT_LENGTH;
        cur.yschema = prev.yschema + v.y * CC_SEGMENT_LENGTH;
      }
      continue;
    }

    const dock = touchIdx[0];
    const dockStop = routeStops[dock];
    const dockNodeId = getNodeRefId(dockStop);
    const dockPoint = ccNodePoint.get(dockNodeId);
    if (dockPoint) {
      dockStop.xschema = dockPoint.x;
      dockStop.yschema = dockPoint.y;
      dockStop._schemaLocked = true;
    }

    const outbound = findNearestOutboundBucket(routeStops, dock, ccNodePoint);
    const depKey = `${dockNodeId}|${outbound}`;
    if (!departureGroups.has(depKey)) departureGroups.set(depKey, []);
    departureGroups.get(depKey).push(rid);

    function layFrom(index, step, initialDir) {
      let prevDir = initialDir || outbound || "E";
      for (let i = index + step; i >= 0 && i < routeStops.length; i += step) {
        const prev = routeStops[i - step];
        const cur = routeStops[i];
        const curNode = getNodeRefId(cur);
        if (ccNodePoint.has(curNode)) {
          const p = ccNodePoint.get(curNode);
          cur.xschema = p.x;
          cur.yschema = p.y;
          cur._schemaLocked = true;
          prevDir = geoBucketFromStops(prev, cur) || prevDir;
          continue;
        }
        const b = geoBucketFromStops(prev, cur) || prevDir;
        prevDir = b;
        const v = dirVec(b);
        const baseX = Number.isFinite(prev.xschema) ? prev.xschema : prev.xgeo;
        const baseY = Number.isFinite(prev.yschema) ? prev.yschema : prev.ygeo;
        cur.xschema = baseX + v.x * CC_SEGMENT_LENGTH;
        cur.yschema = baseY + v.y * CC_SEGMENT_LENGTH;
      }
    }

    layFrom(dock, 1, outbound);
    layFrom(dock, -1, outbound);
  }

  // Lane offsets for routes leaving the same CC dock in same direction.
  for (const [depKey, routeIds] of departureGroups.entries()) {
    if (!routeIds || routeIds.length < 2) continue;
    const [, depDir = "E"] = depKey.split("|");
    const perp = perpVec(depDir);
    const ordered = routeIds.slice().sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < ordered.length; i++) {
      const rid = ordered[i];
      const centered = i - (ordered.length - 1) / 2;
      const offset = centered * CC_LANE_GAP;
      if (Math.abs(offset) < 0.001) continue;
      const routeStops = routes.get(rid) || [];
      for (const s of routeStops) {
        if (!Number.isFinite(s.xschema) || !Number.isFinite(s.yschema)) continue;
        if (s._schemaLocked) continue;
        s.xschema += perp.x * offset;
        s.yschema += perp.y * offset;
      }
    }
  }

  // Fit solved rail network into viewport.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of railStops) {
    if (!Number.isFinite(s.xschema) || !Number.isFinite(s.yschema)) continue;
    minX = Math.min(minX, s.xschema);
    maxX = Math.max(maxX, s.xschema);
    minY = Math.min(minY, s.yschema);
    maxY = Math.max(maxY, s.yschema);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return false;

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const innerW = SVG_WIDTH - MIN_MARGIN * 2;
  const innerH = SVG_HEIGHT - MIN_MARGIN * 2;
  const scale = Math.min(innerW / width, innerH / height);
  const tx = (SVG_WIDTH - width * scale) / 2 - minX * scale;
  const ty = (SVG_HEIGHT - height * scale) / 2 - minY * scale;
  for (const s of railStops) {
    if (!Number.isFinite(s.xschema) || !Number.isFinite(s.yschema)) continue;
    s.xschema = s.xschema * scale + tx;
    s.yschema = s.yschema * scale + ty;
  }

  return true;
}

// Schematic layout logic now lives in src/core/layout-engine.js
// and is invoked from init() via layoutBuildSchematic().

function buildPoiLayout() {
  if (!poiList.length) return;
  for (const p of poiList) {
    let nearest = null;
    let minMeters = Infinity;
    for (const s of allStations) {
      if (getRouteMode(s.route_id) !== "RAIL") continue;
      const m = haversineMeters(p.lat, p.lon, Number(s.stop_lat), Number(s.stop_lon));
      if (m < minMeters) {
        minMeters = m;
        nearest = s;
      }
    }

    if (nearest) {
      const gx = p.xgeo - nearest.xgeo;
      const gy = p.ygeo - nearest.ygeo;
      const glen = Math.hypot(gx, gy) || 1;
      const ux = gx / glen;
      const uy = gy / glen;
      const offset = Math.max(8, Math.min(26, minMeters / 120));
      p.xschema = nearest.xschema + ux * offset;
      p.yschema = nearest.yschema + uy * offset;
      p.nearestStopId = String(nearest.stop_id);
      p.nearestStopName = String(nearest.stop_name || "");
      p.nearestDistanceMeters = Math.round(minMeters);
    } else {
      p.xschema = p.xgeo;
      p.yschema = p.ygeo;
    }
  }
}

buildPoiLayout();

function buildKtmContinuationConfig() {
  const routeDisplayStops = new Map();
  for (const [routeId, stops] of routes.entries()) {
    routeDisplayStops.set(String(routeId), Array.isArray(stops) ? stops : []);
  }
  return { routeDisplayStops, hiddenStopIds: new Set(), panels: [] };
}

const {
  routeDisplayStops,
  hiddenStopIds: mapHiddenStopIds,
  panels: ktmContinuationPanels,
} = buildKtmContinuationConfig();

continuationPanelData = (ktmContinuationPanels || []).map((panel) => ({
  corridorKey: String(panel.corridorKey || ""),
  placement: String(panel.placement || "stack"),
  routeIds: Array.isArray(panel.routeIds) ? panel.routeIds.map((v) => String(v)) : [],
  routeLabels: Array.isArray(panel.routeLabels) ? panel.routeLabels.map((v) => String(v)) : [],
  routeColors: Array.isArray(panel.routeColors) ? panel.routeColors.map((v) => String(v || "#334155")) : [],
  rows: Array.isArray(panel.rows)
    ? panel.rows.map((row) => ({
        key: String(row?.key || ""),
        label: String(row?.label || ""),
        byRoute: row?.byRoute instanceof Map
          ? Object.fromEntries(Array.from(row.byRoute.entries()).map(([k, v]) => [String(k), String(v)]))
          : {},
      }))
    : [],
}));

export function getContinuationPanelData() {
  return continuationPanelData.slice();
}

const mapVisibleStops = allStations.filter(
  (s) => !mapHiddenStopIds.has(String(s.stop_id))
);

const terminalStopIds = new Set();
for (const [routeId, stops] of routes.entries()) {
  if (getRouteMode(routeId) !== "RAIL") continue;
  const displayStops = routeDisplayStops.get(String(routeId)) || stops;
  if (!displayStops.length) continue;
  terminalStopIds.add(String(displayStops[0].stop_id));
  terminalStopIds.add(String(displayStops[displayStops.length - 1].stop_id));
}

function fitVisibleNetworkToViewport() {
  const { scale, tx, ty } = layoutFitVisibleNetwork(mapVisibleStops, runtimeSvgWidth, runtimeSvgHeight, MIN_MARGIN);
  for (const p of poiList) {
    if (!Number.isFinite(p.xschema) || !Number.isFinite(p.yschema)) continue;
    p.xschema = p.xschema * scale + tx;
    p.yschema = p.yschema * scale + ty;
  }
}

fitVisibleNetworkToViewport();

let interchangeCandidates = [];

function makeSegmentKey(a, b) {
  const aId = canonicalStopKey(a);
  const bId = canonicalStopKey(b);
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function getOverlapRanges(routeAStops, routeBStops) {
  const indexA = new Map();
  for (let i = 0; i < routeAStops.length; i++) {
    indexA.set(canonicalStopKey(routeAStops[i]), i);
  }
  const commonStops = [];
  for (let j = 0; j < routeBStops.length; j++) {
    const key = canonicalStopKey(routeBStops[j]);
    if (indexA.has(key)) {
      commonStops.push({ key, indexOnRouteA: indexA.get(key), indexOnRouteB: j });
    }
  }
  if (commonStops.length < 2) return [];
  const ranges = [];
  for (let i = 0; i < commonStops.length - 1; i++) {
    const startCommon = commonStops[i];
    const endCommon = commonStops[i + 1];
    if (startCommon.indexOnRouteA >= endCommon.indexOnRouteA) continue;
    if (startCommon.indexOnRouteB === endCommon.indexOnRouteB) continue;
    ranges.push({
      aStart: startCommon.indexOnRouteA,
      aEnd: endCommon.indexOnRouteA,
      bStart: startCommon.indexOnRouteB,
      bEnd: endCommon.indexOnRouteB,
      startKey: startCommon.key,
      endKey: endCommon.key,
    });
  }
  return ranges;
}

function buildRailCorridorOverrides() {
  const overrides = new Map();
  const railRouteEntries = Array.from(routes.entries())
    .filter(([routeId]) => getRouteMode(routeId) === "RAIL")
    .map(([routeId, stops]) => ({
      routeId: String(routeId),
      category: String(stops[0]?.category || "").toUpperCase(),
      stops,
    }));

  for (let i = 0; i < railRouteEntries.length; i++) {
    for (let j = i + 1; j < railRouteEntries.length; j++) {
      const left = railRouteEntries[i];
      const right = railRouteEntries[j];
      if (!left.stops.length || !right.stops.length) continue;
      if (left.category !== right.category) continue;

      const ranges = getOverlapRanges(left.stops, right.stops);
      for (const range of ranges) {
        const leftSpan = Math.abs(range.aEnd - range.aStart);
        const rightSpan = Math.abs(range.bEnd - range.bStart);
        const denseIsLeft = leftSpan >= rightSpan;
        const dense = denseIsLeft ? left : right;
        const sparse = denseIsLeft ? right : left;
        const dStartRaw = denseIsLeft ? range.aStart : range.bStart;
        const dEndRaw = denseIsLeft ? range.aEnd : range.bEnd;
        const sStartRaw = denseIsLeft ? range.bStart : range.aStart;
        const sEndRaw = denseIsLeft ? range.bEnd : range.aEnd;
        const dStart = Math.min(dStartRaw, dEndRaw);
        const dEnd = Math.max(dStartRaw, dEndRaw);
        const sStart = Math.min(sStartRaw, sEndRaw);
        const sEnd = Math.max(sStartRaw, sEndRaw);
        if (dEnd <= dStart) continue;

        const denseSeg = dense.stops.slice(dStart, dEnd + 1);
        if (denseSeg.length < 2) continue;

        const denseKeys = denseSeg.map((s) => canonicalStopKey(s));
        const densePos = new Map();
        for (let k = 0; k < denseKeys.length; k++) densePos.set(denseKeys[k], k);

        const startStop = denseSeg[0];
        const endStop = denseSeg[denseSeg.length - 1];
        const sx = startStop.xschema;
        const sy = startStop.yschema;
        const ex = endStop.xschema;
        const ey = endStop.yschema;
        const dx = ex - sx;
        const dy = ey - sy;
        const theta = snapAngle45(dx, dy);
        const ux = Math.cos(theta);
        const uy = Math.sin(theta);
        const projectedLen = Math.max(1, dx * ux + dy * uy);
        const steps = denseSeg.length - 1;

        function axisPoint(stepIdx) {
          if (stepIdx <= 0) return { x: sx, y: sy };
          if (stepIdx >= steps) return { x: ex, y: ey };
          const t = stepIdx / steps;
          return {
            x: sx + ux * projectedLen * t,
            y: sy + uy * projectedLen * t,
          };
        }

        for (let k = 0; k < denseSeg.length; k++) {
          const st = denseSeg[k];
          const p = axisPoint(k);
          overrides.set(`${dense.routeId}|${String(st.stop_id)}`, p);
        }

        const sparseSeg = sparse.stops.slice(sStart, sEnd + 1);
        for (const st of sparseSeg) {
          const key = canonicalStopKey(st);
          if (!densePos.has(key)) continue;
          const p = axisPoint(densePos.get(key));
          overrides.set(`${sparse.routeId}|${String(st.stop_id)}`, p);
        }
      }
    }
  }
  return overrides;
}

function absAngleDelta(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  if (d > Math.PI / 2) d = Math.PI - d;
  return Math.abs(d);
}

function buildSharedSegmentOrder() {
  const exactUsage = new Map();
  const records = [];
  for (const [routeId, stops] of routes.entries()) {
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (!a || !b) continue;
      if (!Number.isFinite(a.xschema) || !Number.isFinite(b.xschema)) continue;
      const exactKey = makeSegmentKey(a, b);
      if (!exactUsage.has(exactKey)) exactUsage.set(exactKey, new Set());
      exactUsage.get(exactKey).add(String(routeId));

      const dx = b.xschema - a.xschema;
      const dy = b.yschema - a.yschema;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      records.push({
        routeId: String(routeId),
        mode: getRouteMode(routeId),
        category: String(a.category || ""),
        exactKey,
        theta: snapAngle45(dx, dy),
        mx: (a.xschema + b.xschema) * 0.5,
        my: (a.yschema + b.yschema) * 0.5,
        minX: Math.min(a.xschema, b.xschema),
        maxX: Math.max(a.xschema, b.xschema),
        minY: Math.min(a.yschema, b.yschema),
        maxY: Math.max(a.yschema, b.yschema),
      });
    }
  }

  const groups = [];
  const groupByExactKey = new Map();
  const GROUP_RADIUS = 26;
  for (const rec of records) {
    if (rec.mode !== "RAIL") continue;
    let best = null;
    for (const g of groups) {
      if (g.mode !== "RAIL") continue;
      if (String(g.category).toUpperCase() !== String(rec.category).toUpperCase()) continue;
      if (absAngleDelta(g.theta, rec.theta) > Math.PI / 8) continue;
      const d = Math.hypot(g.mx - rec.mx, g.my - rec.my);
      if (d > GROUP_RADIUS) continue;
      const overlapX = Math.min(g.maxX, rec.maxX) - Math.max(g.minX, rec.minX);
      const overlapY = Math.min(g.maxY, rec.maxY) - Math.max(g.minY, rec.minY);
      if (overlapX < -10 && overlapY < -10) continue;
      best = g;
      break;
    }
    if (!best) {
      best = {
        id: `g${groups.length + 1}`,
        mode: rec.mode,
        category: rec.category,
        theta: rec.theta,
        mx: rec.mx,
        my: rec.my,
        minX: rec.minX,
        maxX: rec.maxX,
        minY: rec.minY,
        maxY: rec.maxY,
        routes: new Set(),
        keys: new Set(),
      };
      groups.push(best);
    } else {
      best.mx = (best.mx + rec.mx) * 0.5;
      best.my = (best.my + rec.my) * 0.5;
      best.minX = Math.min(best.minX, rec.minX);
      best.maxX = Math.max(best.maxX, rec.maxX);
      best.minY = Math.min(best.minY, rec.minY);
      best.maxY = Math.max(best.maxY, rec.maxY);
    }
    best.routes.add(rec.routeId);
    best.keys.add(rec.exactKey);
    if (!groupByExactKey.has(rec.exactKey)) groupByExactKey.set(rec.exactKey, best.id);
  }

  const orderByGroupId = new Map();
  for (const g of groups) {
    orderByGroupId.set(g.id, Array.from(g.routes).sort());
  }

  const orderByExactKey = new Map();
  for (const [exactKey, routeSet] of exactUsage.entries()) {
    const groupId = groupByExactKey.get(exactKey);
    if (groupId && orderByGroupId.has(groupId)) {
      orderByExactKey.set(exactKey, orderByGroupId.get(groupId));
    } else {
      orderByExactKey.set(exactKey, Array.from(routeSet).sort());
    }
  }
  return orderByExactKey;
}

let sharedSegmentOrder = new Map();
let railCorridorOverrides = new Map();
const busLoopRenderCache = new Map();

function rebuildRouteGeometryCaches() {
  sharedSegmentOrder = buildSharedSegmentOrder();
  railCorridorOverrides = buildRailCorridorOverrides();
}

function refreshRouteBaseCoordinates() {
  for (const stop of allStations) {
    stop._baseX = Number.isFinite(stop.xschema) ? stop.xschema : stop.xgeo;
    stop._baseY = Number.isFinite(stop.yschema) ? stop.yschema : stop.ygeo;
  }
}

function rotatePoint(x, y, cx, cy, theta) {
  const dx = x - cx;
  const dy = y - cy;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  return { x: cx + dx * ct - dy * st, y: cy + dx * st + dy * ct };
}

function buildHorizontalCapsuleSamples(xL, xR, yC, r, count = 220) {
  const out = [];
  if (count < 16) count = 16;
  const straightTop = Math.max(0, xR - xL);
  const arcLen = Math.PI * r;
  const perim = straightTop * 2 + arcLen * 2 || 1;
  for (let i = 0; i < count; i++) {
    const d = (i / count) * perim;
    let x = xL;
    let y = yC;
    if (d <= straightTop) {
      x = xL + d;
      y = yC - r;
    } else if (d <= straightTop + arcLen) {
      const t = (d - straightTop) / arcLen;
      const a = -Math.PI / 2 + t * Math.PI;
      x = xR + Math.cos(a) * r;
      y = yC + Math.sin(a) * r;
    } else if (d <= straightTop + arcLen + straightTop) {
      const t = d - straightTop - arcLen;
      x = xR - t;
      y = yC + r;
    } else {
      const t = (d - straightTop - arcLen - straightTop) / arcLen;
      const a = Math.PI / 2 + t * Math.PI;
      x = xL + Math.cos(a) * r;
      y = yC + Math.sin(a) * r;
    }
    out.push({ x, y });
  }
  return out;
}

function buildBusLoopRenderCache() {
  busLoopRenderCache.clear();
  for (const [routeId, stops] of routes.entries()) {
    if (getRouteMode(routeId) === "RAIL") continue;
    const displayStops = routeDisplayStops.get(String(routeId)) || stops;
    if (!displayStops || displayStops.length < 3) continue;
    if (!displayStops.some((s) => Boolean(s.isLoop))) continue;

    const basePts = displayStops
      .map((s) => ({ x: Number.isFinite(s._baseX) ? s._baseX : s.xgeo, y: Number.isFinite(s._baseY) ? s._baseY : s.ygeo }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (basePts.length < 3) continue;

    const cx = basePts.reduce((sum, p) => sum + p.x, 0) / basePts.length;
    const cy = basePts.reduce((sum, p) => sum + p.y, 0) / basePts.length;
    const first = basePts[0];
    const last = basePts[basePts.length - 1];
    const theta = snapAngle45(last.x - first.x, last.y - first.y);
    const localPts = basePts.map((p) => rotatePoint(p.x, p.y, cx, cy, -theta));

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of localPts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const w = Math.max(42, maxX - minX + 16);
    const h = Math.max(26, maxY - minY + 14);
    const r = h * 0.5;
    const xL = cx - w * 0.5 + r;
    const xR = cx + w * 0.5 - r;
    const yC = cy;
    const samplesLocal = buildHorizontalCapsuleSamples(xL, xR, yC, r, Math.max(180, displayStops.length * 10));
    const samples = samplesLocal.map((p) => rotatePoint(p.x, p.y, cx, cy, theta));

    let startIndex = 0;
    let best = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.hypot(samples[i].x - first.x, samples[i].y - first.y);
      if (d < best) {
        best = d;
        startIndex = i;
      }
    }
    const step = samples.length / displayStops.length;
    const routeStopPoints = new Map();
    const ordered = [];
    for (let i = 0; i < displayStops.length; i++) {
      const idx = Math.floor((startIndex + i * step) % samples.length);
      const p = samples[idx];
      routeStopPoints.set(String(displayStops[i].stop_id), p);
      ordered.push(p);
    }
    const d = polylinePathFromPoints([...ordered, ordered[0]]);
    busLoopRenderCache.set(String(routeId), { stopPoints: routeStopPoints, pathD: d });
  }
}

function getRouteStopPoint(routeId, stop) {
  const loopCache = busLoopRenderCache.get(String(routeId));
  if (loopCache?.stopPoints?.has(String(stop.stop_id))) {
    return loopCache.stopPoints.get(String(stop.stop_id));
  }
  const key = `${String(routeId)}|${String(stop.stop_id)}`;
  const p = railCorridorOverrides.get(key);
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  return { x: stop.xschema, y: stop.yschema };
}

function getSegmentOffset(routeId, key, a, b) {
  const list = sharedSegmentOrder.get(key);
  if (!list || list.length < 2) return 0;
  const idx = list.indexOf(String(routeId));
  if (idx < 0) return 0;
  const spacing = ROUTE_OFFSET;
  const centered = (idx - (list.length - 1) / 2) * spacing;
  const aId = String(a.stop_id);
  const bId = String(b.stop_id);
  const directionSign = aId < bId ? 1 : -1;
  return centered * directionSign;
}

function applyRenderedStopPlacement() {
  const acc = new Map();
  for (const [routeId, stops] of routes.entries()) {
    const displayStops = routeDisplayStops.get(String(routeId)) || stops;
    if (!displayStops || displayStops.length < 2) continue;
    const pts = getOffsetPolyline(routeId, displayStops, getRouteStopPoint, getSegmentOffset, makeSegmentKey);
    if (!pts.length || pts.length !== displayStops.length) continue;
    for (let i = 0; i < displayStops.length; i++) {
      const stop = displayStops[i];
      const point = pts[i];
      if (!stop || !point) continue;
      const sid = String(stop.stop_id);
      acc.set(sid, point);
    }
  }

  for (const stop of allStations) {
    const sid = String(stop.stop_id);
    const p = acc.get(sid);
    if (!p) continue;
    if (stop._schemaLocked) continue;
    stop.xschema = p.x;
    stop.yschema = p.y;
  }
}

function spreadSharedRailStops(spacing = 7) {
  const railRouteEntries = Array.from(routes.entries())
    .filter(([routeId]) => getRouteMode(routeId) === "RAIL");
  const bySourceStopId = new Map();
  for (const [, stops] of railRouteEntries) {
    for (const stop of stops) {
      if (!Number.isFinite(stop.xschema) || !Number.isFinite(stop.yschema)) continue;
      const key = String(stop.source_stop_id || "").trim();
      if (!key) continue;
      if (!bySourceStopId.has(key)) bySourceStopId.set(key, []);
      bySourceStopId.get(key).push(stop);
    }
  }

  for (const group of bySourceStopId.values()) {
    const routeIds = new Set(group.map((s) => String(s.route_id || "")));
    if (group.length < 2 || routeIds.size < 2) continue;
    const ordered = group
      .filter((s) => !s._schemaLocked)
      .slice()
      .sort((a, b) => String(a.route_id).localeCompare(String(b.route_id)));
    if (ordered.length < 2) continue;
    const cx = ordered.reduce((sum, s) => sum + s.xschema, 0) / ordered.length;
    const cy = ordered.reduce((sum, s) => sum + s.yschema, 0) / ordered.length;

    let tx = 0;
    let ty = 0;
    for (const stop of ordered) {
      const routeStops = routes.get(stop.route_id) || [];
      const idx = routeStops.findIndex((s) => String(s.stop_id) === String(stop.stop_id));
      const prev = idx > 0 ? routeStops[idx - 1] : null;
      const next = idx >= 0 && idx < routeStops.length - 1 ? routeStops[idx + 1] : null;
      const p = prev ? getRouteStopPoint(stop.route_id, prev) : null;
      const n = next ? getRouteStopPoint(stop.route_id, next) : null;
      if (p && n) {
        tx += n.x - p.x;
        ty += n.y - p.y;
      } else if (n) {
        tx += n.x - stop.xschema;
        ty += n.y - stop.yschema;
      } else if (p) {
        tx += stop.xschema - p.x;
        ty += stop.yschema - p.y;
      }
    }
    if (Math.hypot(tx, ty) < 1) {
      tx = 1;
      ty = 0;
    }
    const len = Math.hypot(tx, ty);
    const nx = -ty / len;
    const ny = tx / len;
    for (let i = 0; i < ordered.length; i++) {
      const centered = i - (ordered.length - 1) / 2;
      ordered[i].xschema = cx + nx * centered * spacing;
      ordered[i].yschema = cy + ny * centered * spacing;
    }
  }
}

function alignBusStopsToRailTransferStations() {
  const railByName = new Map();
  for (const s of mapVisibleStops) {
    if (getRouteMode(s.route_id) !== "RAIL") continue;
    if (!Boolean(s.isInterchange || s.isConnecting)) continue;
    const key = normalizeStopName(s.stop_name);
    if (!key || railByName.has(key)) continue;
    railByName.set(key, s);
  }
  for (const s of mapVisibleStops) {
    if (getRouteMode(s.route_id) === "RAIL") continue;
    const key = normalizeStopName(s.stop_name);
    if (!key) continue;
    const rail = railByName.get(key);
    if (!rail) continue;
    s.xschema = rail.xschema;
    s.yschema = rail.yschema;
  }
}

function syncBusLoopStopsToRenderedPath() {
  for (const [routeId, cache] of busLoopRenderCache.entries()) {
    const stopPoints = cache?.stopPoints;
    if (!(stopPoints instanceof Map) || !stopPoints.size) continue;
    const routeStops = routeDisplayStops.get(String(routeId)) || routes.get(String(routeId)) || [];
    for (const stop of routeStops) {
      const p = stopPoints.get(String(stop.stop_id));
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      stop.xschema = p.x;
      stop.yschema = p.y;
    }
  }
}

// Top-level drawing code removed - moved to init()
/*
// ================= DRAW ROUTES =================
const routeEntries = Array.from(routes.entries()).sort(
  ([routeA], [routeB]) => {
    const w = routeLayerWeight(routeA) - routeLayerWeight(routeB);
    if (w !== 0) return w;
    const aCC = isCcRailRouteId(routeA) ? 0 : 1;
    const bCC = isCcRailRouteId(routeB) ? 0 : 1;
    if (aCC !== bCC) return aCC - bCC;
    return String(routeA).localeCompare(String(routeB));
  }
);

for (const [route_id, stops] of routeEntries) {
  const displayStops = routeDisplayStops.get(String(route_id)) || stops;
  if (!displayStops || displayStops.length < 2) continue;
  const baseColor = getRouteColor(route_id, false, displayStops[0]?.route_color ?? null).color;
  const mode = getRouteMode(route_id);
  const routePoints = getOffsetPolyline(route_id, displayStops, getRouteStopPoint, getSegmentOffset, makeSegmentKey);
  const validRoutePoints = routePoints.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (validRoutePoints.length < 2) continue;
  const isLoopBus = mode !== "RAIL" && displayStops.some((s) => Boolean(s.isLoop));
  const isCcRail = mode === "RAIL" && (isCcRailRouteId(route_id) || displayStops.some((s) => isCcRailStop(s)));
  const loopPath = busLoopRenderCache.get(String(route_id));
  const routePathD = isLoopBus
    ? (loopPath?.pathD || polylinePathFromPoints(validRoutePoints))
    : (isCcRail && validRoutePoints.length > 2
      ? polylinePathFromPoints([...validRoutePoints, validRoutePoints[0]])
      : polylinePathFromPoints(validRoutePoints));
  const strokeWidth = mode === "RAIL"
    ? (displayStops.length >= 26 ? PRIMARY_RAIL_STROKE : SECONDARY_RAIL_STROKE)
    : BUS_STROKE;
  const caseWidth = strokeWidth + (mode === "RAIL" ? 3 : 1);

  const casing = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  const path = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  if (isLoopBus) {
    casing.setAttribute("d", routePathD);
    casing.removeAttribute("transform");
  } else {
    casing.setAttribute("d", routePathD);
    casing.removeAttribute("transform");
  }
  casing.setAttribute("fill", "none");
  casing.setAttribute("stroke", mode === "RAIL" ? "#FFFFFF" : "#E5E7EB");
  casing.setAttribute("stroke-width", String(caseWidth));
  casing.setAttribute("stroke-linecap", "round");
  casing.setAttribute("stroke-linejoin", "round");
  casing.setAttribute("opacity", "1");

  if (isLoopBus) {
    path.setAttribute("d", routePathD);
    path.removeAttribute("transform");
  } else {
    path.setAttribute("d", routePathD);
    path.removeAttribute("transform");
  }
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", baseColor);
  path.setAttribute("stroke-opacity", "0.95");
  path.setAttribute("stroke-width", String(strokeWidth));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (mode !== "RAIL") {
    const dash = "8 7";
    path.setAttribute("stroke-dasharray", dash);
    casing.setAttribute("stroke-dasharray", dash);
  }
  path.dataset.routeId = route_id;
  path.dataset.baseColor = baseColor;
  path.dataset.baseOpacity = "1";
  path.dataset.mode = mode;
  casing.dataset.routeId = route_id;
  casing.dataset.mode = mode;

  routeLayer.appendChild(casing);
  routeLayer.appendChild(path);
  routeLineRegistry.set(route_id, {
    el: path,
    caseEl: casing,
    mode,
    color: baseColor,
    baseWidth: strokeWidth,
    caseWidth,
    category: String(displayStops[0]?.category ?? ""),
  });
}

// ================= INTERCHANGES =================
const seenTransferPair = new Set();
for (const a of interchangeCandidates) {
  const nearby = getNearbyFromIndex(
    schemaStopIndex,
    a.xschema,
    a.yschema,
    SCHEMA_BUCKET_SIZE
  );
  for (const b of nearby) {
    if (a === b) continue;
    if (!(b.isInterchange || b.isConnecting)) continue;
    if (a.route_id === b.route_id) continue;

    const aId = String(a.stop_id);
    const bId = String(b.stop_id);
    const pairKey = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
    if (seenTransferPair.has(pairKey)) continue;
    if (dist(a.xschema, a.yschema, b.xschema, b.yschema) >= TRANSFER_DISTANCE) continue;
    seenTransferPair.add(pairKey);

    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", a.xschema);
    line.setAttribute("y1", a.yschema);
    line.setAttribute("x2", b.xschema);
    line.setAttribute("y2", b.yschema);
    line.setAttribute("stroke", "#6B7280");
    line.setAttribute("stroke-width", String(CONNECTION_STROKE));
    line.setAttribute("stroke-dasharray", "1 5");
    const hasBus =
      getRouteMode(a.route_id) !== "RAIL" || getRouteMode(b.route_id) !== "RAIL";
    line.dataset.hasBus = hasBus ? "1" : "0";
    transferLayer.appendChild(line);
    transferLineRegistry.push(line);
  }
}

// ================= DRAW STOPS =================
const terminalStopIds = new Set();
for (const [routeId, stops] of routes.entries()) {
  if (getRouteMode(routeId) !== "RAIL") continue;
  const displayStops = routeDisplayStops.get(String(routeId)) || stops;
  if (!displayStops.length) continue;
  terminalStopIds.add(String(displayStops[0].stop_id));
  terminalStopIds.add(String(displayStops[displayStops.length - 1].stop_id));
}

for (const stop of mapVisibleStops) {
  const g = document.createElementNS(svg.namespaceURI, "g");
  g.dataset.stopId = String(stop.stop_id);
  g.dataset.baseOpacity = "1";

  const touchTarget = document.createElementNS(svg.namespaceURI, "circle");
  touchTarget.setAttribute("cx", stop.xschema);
  touchTarget.setAttribute("cy", stop.yschema);
  touchTarget.setAttribute("r", "13");
  touchTarget.setAttribute("fill", "rgba(255,255,255,0.001)");
  touchTarget.setAttribute("stroke", "none");
  g.appendChild(touchTarget);

  if (stop.isConnecting) {
    const c = document.createElementNS(svg.namespaceURI, "circle");
    c.setAttribute("cx", stop.xschema);
    c.setAttribute("cy", stop.yschema);
    c.setAttribute("r", String(TRANSFER_RADIUS));
    c.setAttribute("fill", "#FFFFFF");
    c.setAttribute("stroke", "#111111");
    c.setAttribute("stroke-width", "3");
    g.appendChild(c);
  } else if (stop.isInterchange) {
    const c = document.createElementNS(svg.namespaceURI, "circle");
    c.setAttribute("cx", stop.xschema);
    c.setAttribute("cy", stop.yschema);
    c.setAttribute("r", "8");
    c.setAttribute("fill", "#FFFFFF");
    c.setAttribute("stroke", "#111111");
    c.setAttribute("stroke-width", "3");
    g.appendChild(c);
  } else {
    const c = document.createElementNS(svg.namespaceURI, "circle");
    c.setAttribute("cx", stop.xschema);
    c.setAttribute("cy", stop.yschema);
    c.setAttribute("r", "6");
    c.setAttribute("fill", "#FFFFFF");
    c.setAttribute("stroke", "#111111");
    c.setAttribute("stroke-width", "2");
    g.appendChild(c);
  }

  stopLayer.appendChild(g);

  const hit = document.createElementNS(svg.namespaceURI, "circle");
  hit.setAttribute("cx", stop.xschema);
  hit.setAttribute("cy", stop.yschema);
  hit.setAttribute("r", "14");
  hit.setAttribute("fill", "transparent");
  hit.dataset.stopId = String(stop.stop_id);
  interactionLayer.appendChild(hit);

  if (
    getRouteMode(stop.route_id) === "RAIL" &&
    (stop.isInterchange || stop.isConnecting || terminalStopIds.has(String(stop.stop_id)))
  ) {
    const label = document.createElementNS(svg.namespaceURI, "text");
    label.textContent = String(stop.stop_name || "");
    label.setAttribute("x", String(stop.xschema + 8));
    label.setAttribute("y", String(stop.yschema - 8));
    label.setAttribute("font-size", "14");
    label.setAttribute("font-family", "sans-serif");
    label.setAttribute("fill", "#0F172A");
    label.setAttribute("paint-order", "stroke");
    label.setAttribute("stroke", "#FFFFFF");
    label.setAttribute("stroke-width", "3");
    label.setAttribute("stroke-linejoin", "round");
    labelLayer.appendChild(label);
  }

  if (!stopElementRegistry.has(String(stop.stop_id))) {
    stopElementRegistry.set(String(stop.stop_id), []);
  }
  stopElementRegistry.get(String(stop.stop_id)).push({
    el: g,
    mode: getRouteMode(stop.route_id),
    routeId: String(stop.route_id),
    category: String(stop.category || ""),
  });
  stopElementRegistry.get(String(stop.stop_id)).push({
    el: hit,
    mode: getRouteMode(stop.route_id),
    routeId: String(stop.route_id),
    category: String(stop.category || ""),
  });
}

// ================= DRAW POI =================
for (const p of poiList) {
  const style = getPoiCategoryStyle(p.category);
  const g = document.createElementNS(svg.namespaceURI, "g");

  const halo = document.createElementNS(svg.namespaceURI, "circle");
  halo.setAttribute("cx", p.xschema);
  halo.setAttribute("cy", p.yschema);
  halo.setAttribute("r", "6");
  halo.setAttribute("fill", "#FFFFFF");
  halo.setAttribute("stroke", style.color);
  halo.setAttribute("stroke-width", "2");
  g.appendChild(halo);

  const iconSize = 10;
  const iconScale = iconSize / 24;
  const iconGroup = document.createElementNS(svg.namespaceURI, "g");
  iconGroup.setAttribute(
    "transform",
    `translate(${p.xschema - iconSize / 2}, ${p.yschema - iconSize / 2}) scale(${iconScale})`
  );
  const iconPath = document.createElementNS(svg.namespaceURI, "path");
  iconPath.setAttribute("d", style.iconPath || "");
  iconPath.setAttribute("fill", style.color);
  iconPath.setAttribute("stroke", "#FFFFFF");
  iconPath.setAttribute("stroke-width", "1.2");
  iconPath.setAttribute("vector-effect", "non-scaling-stroke");
  iconGroup.appendChild(iconPath);
  g.appendChild(iconGroup);

  const title = document.createElementNS(svg.namespaceURI, "title");
  const nearName = p.nearestStopName || translate("unknown", "Unknown");
  const nearMeters = Number.isFinite(p.nearestDistanceMeters)
    ? ` (${p.nearestDistanceMeters}m)`
    : "";
  title.textContent = `${p.name}\n${p.category}\n${translate("nearest", "Nearest")}: ${nearName}${nearMeters}`;
  g.appendChild(title);

  poiLayer.appendChild(g);
  poiElementRegistry.push({ el: g, category: String(p.category || "") });

  const hit = document.createElementNS(svg.namespaceURI, "circle");
  hit.setAttribute("cx", String(p.xschema));
  hit.setAttribute("cy", String(p.yschema));
  hit.setAttribute("r", "14");
  hit.setAttribute("fill", "transparent");
  hit.dataset.poiId = String(p.id);
  interactionLayer.appendChild(hit);
}
*/

// =================

function smoothPathFromStops(stops) {
  const pts = stops
    .filter((s) => !mapHiddenStopIds.has(String(s?.stop_id || "")))
    .map((s) => ({ s, p: getRouteStopPoint(String(s.route_id || ""), s) }))
    .filter((x) => Number.isFinite(x.p.x) && Number.isFinite(x.p.y))
    .map((x) => ({ x: x.p.x, y: x.p.y }));
  if (!pts.length) return "";
  return polylinePathFromPoints(pts);
}

// ================= TOUCH INTERACTION =================
let activeTraceLine = null;
let traceLastPoint = null;

const stationTooltip = document.getElementById("station-tooltip") || document.createElement("div");
stationTooltip.id = "station-tooltip";
stationTooltip.classList.add("station-tooltip-base");
let tooltipStopId = null;
let floatingPanelTimer = null;
if (!stationTooltip.parentNode) {
  document.body.appendChild(stationTooltip);
}

function positionAndShowStationTooltip(clientX, clientY, maxTooltipHeight = 140) {
  stationTooltip.style.left = `${Math.min(window.innerWidth - 320, clientX + 16)}px`;
  stationTooltip.style.top = `${Math.min(window.innerHeight - maxTooltipHeight, clientY + 16)}px`;
  stationTooltip.style.display = "block";
}

function armFloatingPanelTimeout() {
  if (floatingPanelTimer) clearTimeout(floatingPanelTimer);
  floatingPanelTimer = setTimeout(() => {
    hideStationTooltip();
  }, FLOATING_PANEL_IDLE_MS);
}

function toSvgPoint(evt) {
  const point = svg.createSVGPoint();
  point.x = evt.clientX;
  point.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return point.matrixTransform(ctm.inverse());
}

function findNearestStopWithin(x, y, radius = TOUCH_SELECT_RADIUS) {
  let nearest = null;
  let minDist = Infinity;
  const nearby = getNearbyFromIndex(schemaStopIndex, x, y, SCHEMA_BUCKET_SIZE);
  const candidates = nearby.length ? nearby : mapVisibleStops;
  for (const stop of candidates) {
    const stopMode = getRouteMode(stop.route_id);
    if (!includeBusLayer && stopMode !== "RAIL") continue;
    const d = Math.hypot(stop.xschema - x, stop.yschema - y);
    if (d < minDist) {
      minDist = d;
      nearest = stop;
    }
  }
  return minDist <= radius ? nearest : null;
}

function findNearbyPoiForStop(stop, radiusMeters = 1200, limit = 4) {
  if (!stop || !poiList.length) return [];
  const nearbyInSchema = getNearbyFromIndex(
    poiSchemaIndex,
    stop.xschema,
    stop.yschema,
    SCHEMA_BUCKET_SIZE
  );
  const candidates = nearbyInSchema.length ? nearbyInSchema : poiList;

  const ranked = [];
  for (const p of candidates) {
    const meters = haversineMeters(
      Number(stop.stop_lat),
      Number(stop.stop_lon),
      Number(p.lat),
      Number(p.lon)
    );
    if (meters > radiusMeters) continue;
    ranked.push({
      ...p,
      meters: Math.round(meters),
    });
  }
  ranked.sort((a, b) => a.meters - b.meters);
  return ranked.slice(0, limit);
}

function findNearbyRailStopsForPoi(poi, radiusMeters = 1800, limit = 4) {
  if (!poi) return [];
  const out = [];
  for (const s of allStations) {
    if (getRouteMode(s.route_id) !== "RAIL") continue;
    const meters = haversineMeters(
      Number(poi.lat),
      Number(poi.lon),
      Number(s.stop_lat),
      Number(s.stop_lon)
    );
    if (meters > radiusMeters) continue;
    out.push({ stop: s, meters: Math.round(meters) });
  }
  out.sort((a, b) => a.meters - b.meters);
  return out.slice(0, limit);
}

function findNearestPoiWithin(x, y, radius = TOUCH_SELECT_RADIUS) {
  let nearest = null;
  let minDist = Infinity;
  const nearby = getNearbyFromIndex(poiSchemaIndex, x, y, SCHEMA_BUCKET_SIZE);
  const candidates = nearby.length ? nearby : poiList;
  for (const poi of candidates) {
    const d = Math.hypot((poi.xschema || 0) - x, (poi.yschema || 0) - y);
    if (d < minDist) {
      minDist = d;
      nearest = poi;
    }
  }
  return minDist <= radius ? nearest : null;
}

function dispatchStationInfo(stop, source) {
  window.dispatchEvent(new CustomEvent("jronda:station-info", {
    detail: { stopId: String(stop.stop_id), source },
  }));
}

function buildStationDetailMarkup(stop, includeActions = true) {
  const t = (key, fallback) => {
    if (window?.jrondaI18n && typeof window.jrondaI18n.t === "function") {
      return window.jrondaI18n.t(key, fallback);
    }
    return fallback;
  };
  const key = String(stop.stop_name || "").trim().toLowerCase();
  const siblings = stationNameIndex.get(key) || [stop];
  const modeBadges = [];
  const railTimetableRows = [];
  const busTimetableRows = [];
  const seenBadges = new Set();
  const seenRailTimetable = new Set();
  const nearbyPoi = findNearbyPoiForStop(stop, 1400, 4);
  const todayBucket = getTodayTimetableBucket();
  const dayLabel = todayBucket === "weekday" ? "Weekday" : (todayBucket === "saturday" ? "Saturday" : "Sunday");
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const s of siblings) {
    const routeId = String(s.route_id);
    const routeLabel = getServiceLabel(s, getRouteMode(routeId));
    const mode = getRouteMode(routeId);
    const category = String(s.category || mode || "").toUpperCase();
    const badgeKey = `${mode}|${category}`;
    if (!seenBadges.has(badgeKey)) {
      seenBadges.add(badgeKey);
      const badgeColor = getRouteColor(routeId, false, s.route_color ?? null).color;
      const badgeIcon = mode === "RAIL"
        ? (category === "KTM" ? "/src/img/train-panthograph.svg" : "/src/img/train-noPanthograph.svg")
        : "/src/img/bus.svg";
      modeBadges.push({
        mode,
        category: category || mode,
        color: badgeColor || "#64748b",
        icon: badgeIcon,
      });
    }
    if (mode === "RAIL") {
      const sourceStopId = resolveSourceStopId(s);
      const tKey = `${routeId}|${sourceStopId}`;
      if (!seenRailTimetable.has(tKey)) {
        seenRailTimetable.add(tKey);
        const routeTable = railTimetables?.[routeId]?.[sourceStopId];
        const times = Array.isArray(routeTable?.[todayBucket]) ? routeTable[todayBucket] : [];
        if (times.length) {
          const rows = buildEstimatedSchedule(times, nowMinutes, 3);
          const nextMins = getNextDeparturesInMinutes(times, nowMinutes, 2);
          const nextLabel = nextMins.length
            ? nextMins.map((m) => `${m} min`).join(", ")
            : t("no_more_trains_today", "No more trains today");
          const rowHtml = rows
            .map((row) => `<div class="tt-row ${row.status}"><span class="tt-time">${row.t}</span></div>`)
            .join("");
          railTimetableRows.push(
            `<div><b>${routeLabel}</b>: ${dayLabel}<br/><div class="tt-table">${rowHtml}</div><span class="tooltip-next">${t("next_train", "Next train")}: ${nextLabel}</span></div>`
          );
        } else {
          railTimetableRows.push(
            `<div><b>${routeLabel}</b>: <span class="tooltip-muted">No static timetable</span></div>`
          );
        }
      }
    } else {
      const sourceStopId = resolveSourceStopId(s);
      const bTable = busTimetables?.[routeId]?.[sourceStopId];
      const bt = Array.isArray(bTable?.[todayBucket]) ? bTable[todayBucket] : [];
      if (bt.length) {
        const rows = buildEstimatedSchedule(bt, nowMinutes, 3);
        const nextMins = getNextDeparturesInMinutes(bt, nowMinutes, 2);
        const nextLabel = nextMins.length
          ? nextMins.map((m) => `${m} min`).join(", ")
          : t("no_more_buses_today", "No more buses today");
        const rowHtml = rows
          .map((row) => `<div class="tt-row ${row.status}"><span class="tt-time">${row.t}</span></div>`)
          .join("");
        busTimetableRows.push(
          `<div><b>${routeLabel}</b>: ${dayLabel}<br/><div class="tt-table">${rowHtml}</div><span class="tooltip-next">${t("next_bus", "Next bus")}: ${nextLabel}</span></div>`
        );
      } else {
        busTimetableRows.push(
          `<div><b>${routeLabel}</b>: <span class="tooltip-muted">No static timetable</span></div>`
        );
      }
    }
  }

  const tooltipId = String(stop.stop_id);
  const primaryLabel = getServiceLabel(stop, getRouteMode(stop.route_id));
  const isHoho = String(stop.category || "").toUpperCase() === "HOHO";
  const hohoRouteCount = (hohoRoutesByStopName.get(key) || new Set()).size;
  const isSharedHohoStop = isHoho && hohoRouteCount > 1;
  const weekendOnly = isHoho && isHohoWeekendOnlyRoute(stop.route_id);
  const weekendActive = isHohoRouteActiveToday(stop.route_id);
  const startOnly = isHoho && isSharedHohoStop;
  const endOnly = isHoho && !isSharedHohoStop;
  const actionDisabled = weekendOnly && !weekendActive;
  const disabledStateAttributes = actionDisabled ? "disabled aria-disabled=\"true\"" : "";
  const startButtonClassName = actionDisabled
    ? "tooltip-btn tooltip-btn-disabled"
    : "tooltip-btn tooltip-btn-primary";
  const endButtonClassName = actionDisabled
    ? "tooltip-btn tooltip-btn-disabled"
    : "tooltip-btn tooltip-btn-secondary";
  function poiIcon(category) {
    const { color, filename } = getPoiCategoryStyle(category);
    if (filename) {
      return `<img src="/src/img/poi/${filename}" width="12" height="12" style="vertical-align:middle;margin-right:4px;" alt=""/>`;
    }
    const dotColor = color || "#64748b";
    return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:6px;vertical-align:middle;"></span>`;
  }
  const actionsHtml = includeActions ? `
    <div class="tooltip-actions">
      ${endOnly ? "" : `<button id="jronda-start-here" class="${startButtonClassName}" type="button" aria-label="${t("set_start_here", "Set start here")}" ${disabledStateAttributes}>${t("start_here", "Start here")}</button>`}
      ${startOnly ? "" : `<button id="jronda-end-here" class="${endButtonClassName}" type="button" aria-label="${t("set_end_here", "Set end here")}" ${disabledStateAttributes}>${t("end_here", "End here")}</button>`}
    </div>
  ` : "";
  const modeBadgesHtml = modeBadges.length
    ? modeBadges.map((badge) => `
      <span class="tooltip-mode-chip" title="${badge.mode}">
        <img class="tooltip-mode-icon" src="${badge.icon}" alt="${badge.category}"/>
        <span class="tooltip-mode-swatch" style="background:${badge.color}"></span>
        <span class="tooltip-mode-text">${badge.category}</span>
      </span>
    `).join("")
    : `<span class="tooltip-muted">${t("none", "None")}</span>`;
  const html = `
    <div class="tooltip-title">${stop.stop_name || stop.stop_id}</div>
    <div class="tooltip-mode-row">${modeBadgesHtml}</div>
    <div class="tooltip-line">${t("primary_line", "Primary line")}: <b>${primaryLabel}</b> (${getRouteMode(stop.route_id)})</div>
    <div class="tooltip-section"><b>Rail timetable (${dayLabel})</b>:<br/>${railTimetableRows.length ? railTimetableRows.join("<div class='tooltip-divider'></div>") : "<span class='tooltip-muted'>No timetable data</span>"}</div>
    <div class="tooltip-section"><b>Bus timetable (${dayLabel})</b>:<br/>${busTimetableRows.length ? busTimetableRows.join("<div class='tooltip-divider'></div>") : "<span class='tooltip-muted'>No timetable data</span>"}</div>
    ${weekendOnly && !weekendActive ? `<div class="tooltip-warn">${t("hoho_weekend_only", "This HOHO route runs only on")} ${String(stop.route_id).toUpperCase().includes("SAT") ? t("saturday", "Saturday") : t("sunday", "Sunday")}.</div>` : ""}
    <div class="tooltip-section">${t("nearby_poi", "Nearby POI")}: ${
      nearbyPoi.length
        ? nearbyPoi.map((p) => `${poiIcon(p.category)} ${p.name} (${p.category}, ${p.meters}m)`).join("<br/>")
        : t("none_1_4km", "None in 1.4km")
    }</div>
    ${actionsHtml}
  `;
  return { html, actionDisabled, tooltipId };
}

export function getStationDetailHtml(stopId) {
  const stop = stationById.get(String(stopId || ""));
  if (!stop) return "";
  return buildStationDetailMarkup(stop, false).html;
}

function showStationTooltip(stop, clientX, clientY) {
  const detail = buildStationDetailMarkup(stop, true);
  tooltipStopId = detail.tooltipId;
  stationTooltip.innerHTML = detail.html;
  positionAndShowStationTooltip(clientX, clientY, 140);
  armFloatingPanelTimeout();

  const startBtn = document.getElementById("jronda-start-here");
  const endBtn = document.getElementById("jronda-end-here");
  if (startBtn) {
    startBtn.onclick = () => {
      if (detail.actionDisabled) {
        emitToast(translate("hoho_not_active", "This HOHO service is not active today."), "warn");
        return;
      }
      window.dispatchEvent(new CustomEvent("jronda:set-start", {
        detail: { stopId: tooltipStopId },
      }));
    };
  }
  if (endBtn) {
    endBtn.onclick = () => {
      if (detail.actionDisabled) {
        emitToast(translate("hoho_not_active", "This HOHO service is not active today."), "warn");
        return;
      }
      window.dispatchEvent(new CustomEvent("jronda:set-end", {
        detail: { stopId: tooltipStopId },
      }));
    };
  }
}

async function verifyKioskPinViaPrompt() {
  const pin = window.prompt(translate("enter_passkey", "Enter kiosk passkey:"), "") || "";
  if (!pin) return false;
  if (typeof window.jrondaVerifyKioskPin === "function") {
    try {
      return Boolean(await window.jrondaVerifyKioskPin(pin));
    } catch {
      return false;
    }
  }
  return false;
}

function findRailStopBySearch(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;
  let best = null;
  for (const s of allStations) {
    if (getRouteMode(s.route_id) !== "RAIL") continue;
    const name = String(s.stop_name || "").toLowerCase();
    if (name === q) return s;
    if (name.includes(q) && !best) best = s;
  }
  return best;
}

function showPoiTooltip(poi, clientX, clientY) {
  const t = (key, fallback) => {
    if (window?.jrondaI18n && typeof window.jrondaI18n.t === "function") {
      return window.jrondaI18n.t(key, fallback);
    }
    return fallback;
  };
  const nearest = findNearbyRailStopsForPoi(poi, 1800, 3);
  const nearestLabel = nearest.length
    ? nearest.map((n) => `${n.stop.stop_name} (${n.meters}m)`).join("<br/>")
    : t("no_nearby_rail", "No nearby rail station");
  const nearestStopId = nearest[0] ? String(nearest[0].stop.stop_id) : "";

  tooltipStopId = null;
  stationTooltip.innerHTML = `
    <div class="tooltip-title">${poi.name}</div>
    <div class="tooltip-line">${t("poi_category", "POI category")}: <b>${poi.category || t("poi", "POI")}</b></div>
    <div>${t("nearest_rail", "Nearest rail")}: ${nearestLabel}</div>
    <div class="tooltip-actions">
      <button id="jronda-end-here-poi" class="tooltip-btn tooltip-btn-secondary" type="button" aria-label="${t("set_destination_near_poi", "Set destination near this POI")}">${t("end_here", "End here")}</button>
    </div>
  `;
  positionAndShowStationTooltip(clientX, clientY, 160);
  armFloatingPanelTimeout();

  const endBtn = document.getElementById("jronda-end-here-poi");
  if (endBtn) {
    endBtn.onclick = () => {
      if (!nearestStopId) return;
      window.dispatchEvent(new CustomEvent("jronda:set-end", {
        detail: { stopId: nearestStopId },
      }));
    };
  }
}

function showGpsTooltip(clientX, clientY, advanced = false) {
  const fixedStopId = localStorage.getItem(FIXED_KIOSK_STOP_KEY) || "";
  const fixedStop = fixedStopId ? stationById.get(fixedStopId) : null;
  stationTooltip.innerHTML = `
    <div class="tooltip-title">${translate("you_are_here", "You are here")}</div>
    <div class="tooltip-section">${fixedStop ? `${translate("fixed_kiosk_station", "Fixed kiosk station")}: <b>${fixedStop.stop_name}</b>` : translate("gps_active", "GPS is active.")}</div>
    ${advanced ? `
      <div class="tooltip-input-wrap">
        <input id="jronda-gps-station-search" class="tooltip-input" type="text" placeholder="${translate("search_rail_station", "Search rail station")}" />
      </div>
      <div class="tooltip-actions">
        <button id="jronda-gps-set-station" class="tooltip-btn tooltip-btn-primary" type="button">${translate("set_kiosk_station", "Set kiosk station")}</button>
        <button id="jronda-gps-clear-station" class="tooltip-btn tooltip-btn-secondary" type="button">${translate("clear_fixed_station", "Clear fixed station")}</button>
      </div>
    ` : `<div class="tooltip-hint">${translate("tap_here_again", "Double tap and hold \"You are here\" for kiosk setup.")}</div>`}
  `;
  positionAndShowStationTooltip(clientX, clientY, 180);
  armFloatingPanelTimeout();

  if (advanced) {
    const setBtn = document.getElementById("jronda-gps-set-station");
    const clearBtn = document.getElementById("jronda-gps-clear-station");
    const search = document.getElementById("jronda-gps-station-search");
    if (setBtn && search) {
      setBtn.onclick = async () => {
        const ok = await verifyKioskPinViaPrompt();
        if (!ok) {
          emitToast(translate("invalid_passkey_update", "Invalid passkey for kiosk station update."), "warn");
          return;
        }
        const target = findRailStopBySearch(search.value || "");
        if (!target) {
          emitToast(translate("station_not_found", "Station not found for kiosk lock."), "warn");
          return;
        }
        localStorage.setItem(FIXED_KIOSK_STOP_KEY, String(target.stop_id));
        userLocation = { lat: target.stop_lat, lon: target.stop_lon };
        drawUserMarker();
        emitToast(
          translatef("kiosk_station_set", "Kiosk station set to {station}.", { station: target.stop_name }),
          "info"
        );
      };
    }
    if (clearBtn) {
      clearBtn.onclick = async () => {
        const ok = await verifyKioskPinViaPrompt();
        if (!ok) {
          emitToast(translate("invalid_passkey_clear", "Invalid passkey for kiosk station clear."), "warn");
          return;
        }
        localStorage.removeItem(FIXED_KIOSK_STOP_KEY);
        emitToast(translate("kiosk_station_cleared", "Fixed kiosk station cleared."), "info");
      };
    }
  }
}

async function showGpsSetupPanel(clientX, clientY) {
  const passkeyAccepted = await verifyKioskPinViaPrompt();
  if (!passkeyAccepted) {
    emitToast(translate("invalid_passkey_setup", "Invalid passkey for kiosk station setup."), "warn");
    hideStationTooltip();
    return;
  }

  const uniqueRailStops = [];
  const seenStopIds = new Set();
  for (const stop of allStations) {
    if (getRouteMode(stop.route_id) !== "RAIL") continue;
    const stopId = String(stop.stop_id || "");
    if (!stopId || seenStopIds.has(stopId)) continue;
    seenStopIds.add(stopId);
    uniqueRailStops.push(stop);
  }
  uniqueRailStops.sort((leftStop, rightStop) =>
    String(leftStop.stop_name || "").localeCompare(String(rightStop.stop_name || ""))
  );

  const optionMarkup = uniqueRailStops
    .map((railStop) => `<option value="${String(railStop.stop_id)}">${String(railStop.stop_name || railStop.stop_id)}</option>`)
    .join("");

  stationTooltip.innerHTML = `
    <div class="tooltip-title">${translate("kiosk_location_setup", "Kiosk Location Setup")}</div>
    <div class="tooltip-line">${translate("select_rail_station", "Select a rail station to set as permanent location.")}</div>
    <div class="tooltip-input-wrap">
      <select id="jronda-gps-station-select" class="tooltip-select" aria-label="${translate("select_rail_station", "Select rail station")}">
        ${optionMarkup}
      </select>
    </div>
    <div class="tooltip-actions">
      <button id="jronda-gps-apply-station" class="tooltip-btn tooltip-btn-primary" type="button">${translate("set_to_this_station", "Set to this station")}</button>
      <button id="jronda-gps-change-passkey" class="tooltip-btn tooltip-btn-secondary" type="button">${translate("change_passkey", "Change passkey")}</button>
    </div>
  `;
  positionAndShowStationTooltip(clientX, clientY, 240);
  armFloatingPanelTimeout();

  const stationSelectElement = document.getElementById("jronda-gps-station-select");
  const applyStationButton = document.getElementById("jronda-gps-apply-station");
  const changePasskeyButton = document.getElementById("jronda-gps-change-passkey");
  if (!stationSelectElement || !applyStationButton) return;

  applyStationButton.onclick = () => {
    const selectedStopId = String(stationSelectElement.value || "");
    const selectedStop = stationById.get(selectedStopId);
    if (!selectedStop) {
      emitToast(translate("select_valid_station", "Please select a valid rail station."), "warn");
      return;
    }
    const accepted = window.confirm(`Set permanent location to ${selectedStop.stop_name}?`);
    if (accepted) {
      localStorage.setItem(FIXED_KIOSK_STOP_KEY, selectedStopId);
      userLocation = { lat: selectedStop.stop_lat, lon: selectedStop.stop_lon };
      drawUserMarker();
      emitToast(
        translatef("kiosk_station_set", "Kiosk station set to {station}.", { station: selectedStop.stop_name }),
        "info"
      );
    }
    hideStationTooltip();
  };

  if (changePasskeyButton) {
    changePasskeyButton.onclick = async () => {
      if (typeof window.jrondaChangeKioskPin === "function") {
        await window.jrondaChangeKioskPin();
      } else {
        emitToast(translate("passkey_change_unavailable", "Passkey change is unavailable."), "warn");
      }
    };
  }
}

function hideStationTooltip() {
  stationTooltip.style.display = "none";
  tooltipStopId = null;
  if (floatingPanelTimer) {
    clearTimeout(floatingPanelTimer);
    floatingPanelTimer = null;
  }
}

function startTraceLine(startX, startY) {
  if (activeTraceLine) activeTraceLine.remove();
  activeTraceLine = document.createElementNS(svg.namespaceURI, "polyline");
  activeTraceLine.setAttribute("fill", "none");
  activeTraceLine.setAttribute("stroke", "#2AA7FF");
  activeTraceLine.setAttribute("stroke-width", "5");
  activeTraceLine.setAttribute("stroke-linecap", "round");
  activeTraceLine.setAttribute("stroke-dasharray", "6 6");
  activeTraceLine.setAttribute("opacity", "0.9");
  activeTraceLine.setAttribute("points", `${startX},${startY}`);
  svg.appendChild(activeTraceLine);
  traceLastPoint = { x: startX, y: startY };
}

function appendTracePoint(x, y) {
  if (!activeTraceLine) return;
  if (traceLastPoint && Math.hypot(x - traceLastPoint.x, y - traceLastPoint.y) < 5) {
    return;
  }
  const points = activeTraceLine.getAttribute("points") || "";
  activeTraceLine.setAttribute("points", `${points} ${x},${y}`);
  traceLastPoint = { x, y };
}

function finishTraceLine() {
  if (activeTraceLine) {
    activeTraceLine.remove();
    activeTraceLine = null;
  }
  traceLastPoint = null;
}

export function getRenderPointerInteractionBindings() {
  return {
    svg,
    toSvgPoint,
    findNearestStopWithin,
    findNearestPoiWithin,
    getUserDotPoint: () => {
      if (!userDot) return null;
      const x = Number(userDot.getAttribute("cx"));
      const y = Number(userDot.getAttribute("cy"));
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    },
    startTraceLine,
    appendTracePoint,
    finishTraceLine,
    showStationTooltip,
    showPoiTooltip,
    showGpsTooltip,
    showGpsSetupPanel,
    hideStationTooltip,
    dispatchStationInfo,
  };
}

function findDisplayStop(stopId) {
  const direct = stationById.get(String(stopId));
  if (direct) return direct;
  return null;
}

function createEndpointBadge(label, color) {
  if (!svg || !svg.namespaceURI) {
    __coreDebug('SVG not initialized for endpoint badge creation');
    return { g: null, bubble: null, text: null };
  }
  const g = document.createElementNS(svg.namespaceURI, "g");
  const bubble = document.createElementNS(svg.namespaceURI, "rect");
  const text = document.createElementNS(svg.namespaceURI, "text");
  bubble.setAttribute("width", "24");
  bubble.setAttribute("height", "16");
  bubble.setAttribute("rx", "8");
  bubble.setAttribute("fill", color);
  bubble.setAttribute("stroke", "#fff");
  bubble.setAttribute("stroke-width", "1.5");
  text.textContent = label;
  text.setAttribute("fill", "#fff");
  text.setAttribute("font-size", "10");
  text.setAttribute("font-family", "sans-serif");
  text.setAttribute("font-weight", "700");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  g.appendChild(bubble);
  g.appendChild(text);
  return { g, bubble, text };
}

// Badge creation moved to init()

function positionBadge(badge, stop, visible) {
  if (!badge?.g) return;
  if (!visible || !stop) {
    badge.g.setAttribute("display", "none");
    return;
  }
  const x = stop.xschema + 10;
  const y = stop.yschema - 22;
  badge.g.setAttribute("display", "");
  badge.bubble.setAttribute("x", String(x));
  badge.bubble.setAttribute("y", String(y));
  badge.text.setAttribute("x", String(x + 12));
  badge.text.setAttribute("y", String(y + 8));
}

function refreshEndpointBadges() {
  // Skip badge recreation if SVG not ready (avoid warn spam)
  if (svg && !startBadge?.g) {
    startBadge = createEndpointBadge("S", "#0D6EFD");
    svg.appendChild(startBadge.g);
  }
  if (svg && !endBadge?.g) {
    endBadge = createEndpointBadge("E", "#D63384");
    svg.appendChild(endBadge.g);
  }
  
  const s = startStopBadgeId ? findDisplayStop(startStopBadgeId) : null;
  const e = endStopBadgeId ? findDisplayStop(endStopBadgeId) : null;
  positionBadge(startBadge, s, Boolean(s));
  positionBadge(endBadge, e, Boolean(e));
}

function isRailMode(mode) {
  return mode === "RAIL";
}

function isHohoWeekendOnlyRoute(routeId) {
  const rid = String(routeId || "").toUpperCase();
  // No known HOHO weekend-only route in data; keep placeholder for future schedule filtering.
  return false;
}

function isHohoRouteActiveToday(routeId) {
  const rid = String(routeId || "").toUpperCase();
  if (!rid.includes("HOHO")) return true;
  if (isHohoWeekendOnlyRoute(rid)) {
    const bucket = getTodayTimetableBucket();
    return bucket === "saturday" || bucket === "sunday";
  }
  return true;
}

function getBusOperator(routeId, category = "") {
  const cat = String(category || "").toUpperCase();
  if (cat.includes("HOHO")) return "HOHO";
  if (cat.includes("GOKL")) return "GOKL";
  if (cat.includes("RAPID")) return "RAPID";

  const rid = String(routeId || "").toUpperCase();
  if (rid.startsWith("HOHO")) return "HOHO";
  if (rid.startsWith("GOKL") || rid.includes("GOKL")) return "GOKL";
  if (rid.startsWith("RAPID") || rid.includes("RAPID")) return "RAPID";
  return "OTHER";
}

let includeBusConfig = { hoho: true, gokl: true, rapid: true, other: true };
let displayModeFilter = "ALL";

function applyLayerVisibility() {
  for (const [routeId, meta] of routeLineRegistry.entries()) {
    let visible = true;
    if (displayModeFilter === "RAIL" && meta.mode !== "RAIL") visible = false;
    if (displayModeFilter === "BUS" && meta.mode === "RAIL") visible = false;
    if (meta.mode === "BUS") {
      const op = getBusOperator(routeId, meta.category);
      if (op === "HOHO") visible = includeBusConfig.hoho;
      else if (op === "GOKL") visible = includeBusConfig.gokl;
      else if (op === "RAPID") visible = includeBusConfig.rapid;
      else visible = includeBusConfig.other;
    }
    if (!includeBusLayer && meta.mode === "BUS") {
      visible = false;
    }
    if (
      selectedRailCategory &&
      meta.mode === "RAIL" &&
      String(meta.category || "").toUpperCase() !== String(selectedRailCategory).toUpperCase()
    ) {
      visible = false;
    }
    meta.el.style.display = visible ? "" : "none";
    if (meta.caseEl) meta.caseEl.style.display = visible ? "" : "none";
    if (!visible) continue;

    if (selectedRailRouteId) {
      const focused = routeId === selectedRailRouteId;
      meta.el.setAttribute(
        "stroke",
        focused ? (meta.color || meta.el.dataset.baseColor || "#888") : INACTIVE_ROUTE_COLOR
      );
      meta.el.setAttribute(
        "stroke-width",
        focused ? String(ACTIVE_ROUTE_STROKE) : String(INACTIVE_ROUTE_STROKE)
      );
      meta.el.setAttribute("opacity", "1");
      if (meta.caseEl) {
        meta.caseEl.setAttribute("stroke", focused ? "#FFFFFF" : "#F3F4F6");
        meta.caseEl.setAttribute(
          "stroke-width",
          focused ? String(meta.caseWidth) : String(INACTIVE_ROUTE_STROKE + 1)
        );
        meta.caseEl.setAttribute("opacity", "1");
      }
    } else {
      meta.el.setAttribute("stroke", meta.color || meta.el.dataset.baseColor || "#888");
      meta.el.setAttribute("stroke-width", String(meta.baseWidth));
      meta.el.setAttribute("opacity", "1");
      if (meta.caseEl) {
        meta.caseEl.setAttribute("stroke", meta.mode === "RAIL" ? "#FFFFFF" : "#E5E7EB");
        meta.caseEl.setAttribute("stroke-width", String(meta.caseWidth));
        meta.caseEl.setAttribute("opacity", "1");
      }
    }
  }

  for (const entries of stopElementRegistry.values()) {
    for (const entry of entries) {
      let visible = true;
      if (displayModeFilter === "RAIL" && entry.mode !== "RAIL") visible = false;
      if (displayModeFilter === "BUS" && entry.mode === "RAIL") visible = false;
      if (entry.mode === "BUS") {
        const op = getBusOperator(entry.routeId, entry.category);
        if (op === "HOHO") visible = includeBusConfig.hoho;
        else if (op === "GOKL") visible = includeBusConfig.gokl;
        else if (op === "RAPID") visible = includeBusConfig.rapid;
        else visible = includeBusConfig.other;
      }
      if (!includeBusLayer && entry.mode === "BUS") {
        visible = false;
      }
      if (
        selectedRailCategory &&
        entry.mode === "RAIL" &&
        String(entry.category || "").toUpperCase() !== String(selectedRailCategory).toUpperCase()
      ) {
        visible = false;
      }
      entry.el.style.display = visible ? "" : "none";
      if (!visible) continue;
      if (selectedRailRouteId) {
        const focused = entry.routeId === selectedRailRouteId;
        entry.el.style.filter = focused ? "none" : "grayscale(1)";
        entry.el.setAttribute("opacity", "1");
      } else {
        entry.el.style.filter = "none";
        entry.el.setAttribute("opacity", "1");
      }
    }
  }

  for (const line of transferLineRegistry) {
    const hasBus = line.dataset.hasBus === "1";
    line.style.display = !includeBusLayer && hasBus ? "none" : "";
  }

  for (const entry of poiElementRegistry) {
    entry.el.style.display = "";
  }

}

export function setRouteEndpoints(startId, endId) {
  startStopBadgeId = startId ? String(startId) : null;
  endStopBadgeId = endId ? String(endId) : null;
  refreshEndpointBadges();
}

export function setBusVisibility(config) {
  if (typeof config === "boolean") {
    includeBusConfig = { hoho: config, gokl: config, rapid: config, other: config };
  } else if (typeof config === "object" && config !== null) {
    includeBusConfig = {
      hoho: config.hoho ?? true,
      gokl: config.gokl ?? true,
      rapid: config.rapid ?? true,
      other: config.other ?? true,
    };
  }
  includeBusLayer = Boolean(includeBusConfig.hoho || includeBusConfig.gokl || includeBusConfig.rapid || includeBusConfig.other);
  applyLayerVisibility();
  refreshEndpointBadges();
}

export function setDisplayModeFilter(mode = "ALL") {
  const normalized = String(mode || "ALL").toUpperCase();
  displayModeFilter = ["ALL", "RAIL", "BUS"].includes(normalized) ? normalized : "ALL";
  applyLayerVisibility();
  refreshEndpointBadges();
}

export function setRailRouteFilter(routeId) {
  selectedRailRouteId = routeId ? String(routeId) : null;
  applyLayerVisibility();
  refreshEndpointBadges();
}

export function setRailCategoryFilter(category) {
  selectedRailCategory = category ? String(category) : null;
  selectedRailRouteId = null;
  applyLayerVisibility();
  refreshEndpointBadges();
}

export function resetRenderState() {
  selectedRailRouteId = null;
  selectedRailCategory = null;
  displayModeFilter = "ALL";
  startStopBadgeId = null;
  endStopBadgeId = null;
  if (activeRouteOverlay) {
    activeRouteOverlay.remove();
    activeRouteOverlay = null;
  }
  for (const { el, caseEl, baseWidth, caseWidth } of routeLineRegistry.values()) {
    el.setAttribute("stroke", el.dataset.baseColor || "#888");
    el.setAttribute("opacity", "1");
    el.setAttribute("stroke-width", String(baseWidth));
    if (caseEl) {
      caseEl.setAttribute("stroke", "#FFFFFF");
      caseEl.setAttribute("opacity", "1");
      caseEl.setAttribute("stroke-width", String(caseWidth));
    }
  }
  for (const entries of stopElementRegistry.values()) {
    for (const entry of entries) {
      entry.el.setAttribute("opacity", "1");
      entry.el.style.filter = "none";
    }
  }
  hideStationTooltip();
  applyLayerVisibility();
  refreshEndpointBadges();
}

// ================= GPS + SNAPPING =================

let userLocation = null;
let userHalo = null;
let userDot = null;
let userWatchId = null;

// ---- Find nearest stop in schematic space ----
function findNearestStopBySchema(x, y) {
  let nearest = null;
  let minDist = Infinity;

  const nearby = getNearbyFromIndex(schemaStopIndex, x, y, SCHEMA_BUCKET_SIZE);
  const candidates = nearby.length ? nearby : mapVisibleStops;
  for (const stop of candidates) {
    if (!Number.isFinite(stop.xschema)) continue;

    const d = Math.hypot(stop.xschema - x, stop.yschema - y);
    if (d < minDist) {
      minDist = d;
      nearest = stop;
    }
  }

  return minDist <= SNAP_RADIUS ? nearest : null;
}

// ---- Find nearest stop in real-world meters ----
function findNearestStopByGeo(lat, lon) {
  let nearest = null;
  let minMeters = Infinity;

  const [xgeo, ygeo] = layoutProjectGeo(lat, lon, runtimeSvgWidth, runtimeSvgHeight, MARGIN, allStations);
  const nearby = getNearbyFromIndex(geoStopIndex, xgeo, ygeo, GEO_BUCKET_SIZE);
  const candidates = nearby.length ? nearby : mapVisibleStops;

  for (const stop of candidates) {
    const meters = haversineMeters(
      Number(lat),
      Number(lon),
      Number(stop.stop_lat),
      Number(stop.stop_lon)
    );

    if (meters < minMeters) {
      minMeters = meters;
      nearest = stop;
    }
  }

  return { nearest, minMeters };
}

// ---- Project GPS directly into schematic space ----
function projectGpsToSchema(lat, lon) {
  const [xgeo, ygeo] = layoutProjectGeo(lat, lon, runtimeSvgWidth, runtimeSvgHeight, MARGIN, allStations);

  // Find closest station in geo space
  let nearest = null;
  let minGeoDist = Infinity;

  const nearby = getNearbyFromIndex(geoStopIndex, xgeo, ygeo, GEO_BUCKET_SIZE);
  const candidates = nearby.length ? nearby : mapVisibleStops;
  for (const stop of candidates) {
    const d = Math.hypot(stop.xgeo - xgeo, stop.ygeo - ygeo);
    if (d < minGeoDist) {
      minGeoDist = d;
      nearest = stop;
    }
  }

  if (!nearest) return [xgeo, ygeo];

  // Compute geo → schema offset using that anchor station
  const offsetX = nearest.xschema - nearest.xgeo;
  const offsetY = nearest.yschema - nearest.ygeo;

  return [xgeo + offsetX, ygeo + offsetY];
}

// ---- Draw user marker ----
function drawUserMarker() {
  if (!userLocation) return;
  if (!svg || !svg.namespaceURI) return;
  
  // GPS index safety check (rebuild if empty/missing)
  if (!geoStopIndex || !geoStopIndex.size || !schemaStopIndex || !schemaStopIndex.size) {
    rebuildSpatialIndexes(mapVisibleStops || allStations, poiList || []);
  }

  const lat = userLocation.lat ?? userLocation.stop_lat;
  const lon = userLocation.lon ?? userLocation.stop_lon;

  const { nearest: geoStop } = findNearestStopByGeo(lat, lon);

  const [px, py] = projectGpsToSchema(lat, lon);

  const snapped =
    geoStop && Number.isFinite(geoStop.xschema) && Number.isFinite(geoStop.yschema)
      ? geoStop
      : findNearestStopBySchema(px, py);

  const x = snapped ? snapped.xschema : px;
  const y = snapped ? snapped.yschema : py;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const gpsParent = gpsLayer || svg;
  if (!userHalo) {
    userHalo = document.createElementNS(svg.namespaceURI, "circle");
    userHalo.classList.add("jronda-gps-ripple");
    gpsParent.appendChild(userHalo);
  }

  if (!userDot) {
    userDot = document.createElementNS(svg.namespaceURI, "circle");
    gpsParent.appendChild(userDot);
  }

  userHalo.setAttribute("cx", x);
  userHalo.setAttribute("cy", y);
  userHalo.setAttribute("r", snapped ? 12 : 10);
  userHalo.setAttribute(
    "fill",
    snapped ? "rgba(0,200,100,0.25)" : "rgba(0,150,255,0.25)"
  );

  userDot.setAttribute("cx", x);
  userDot.setAttribute("cy", y);
  userDot.setAttribute("r", 4);
  userDot.setAttribute("fill", snapped ? "#00C864" : "#0096FF");
  userDot.setAttribute("stroke", "#fff");
  userDot.setAttribute("stroke-width", "2");
}

// ================= GEOLOCATION =================

const DEV_LOCATION = { lat: 3.139, lon: 101.6869 };

function getUserLocation(callback) {
  const fixedStopId = localStorage.getItem(FIXED_KIOSK_STOP_KEY);
  if (fixedStopId) {
    const fixed = stationById.get(String(fixedStopId));
    if (fixed) {
      callback({ lat: fixed.stop_lat, lon: fixed.stop_lon, fixedStopId });
      return;
    }
  }
  if (!navigator.geolocation) {
    callback(DEV_LOCATION);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => callback({
      lat: pos.coords.latitude,
      lon: pos.coords.longitude
    }),
    () => callback(DEV_LOCATION),
    { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
  );
}

function startGpsTracking() {
  getUserLocation(loc => {
    userLocation = loc;
    drawUserMarker();
  });

  const fixedStopId = localStorage.getItem(FIXED_KIOSK_STOP_KEY);
  if (fixedStopId) return;

  if (!navigator.geolocation) return;

  if (userWatchId !== null)
    navigator.geolocation.clearWatch(userWatchId);

  userWatchId = navigator.geolocation.watchPosition(
    pos => {
      userLocation = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude
      };
      drawUserMarker();
    },
    () => {},
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 2000 }
  );
}

startGpsTracking();

// ================= ACTIVE ROUTE HIGHLIGHTING =================
let activeRouteOverlay = null;

export function drawRoute(route) {
  if (!route || !Array.isArray(route.path) || route.path.length < 2) return;

  if (activeRouteOverlay) {
    activeRouteOverlay.remove();
    activeRouteOverlay = null;
  }

  const routeStops = route.path
    .map((id) => stationById.get(String(id)))
    .filter(Boolean);

  if (routeStops.length < 2) return;

  const selectedStopIds = new Set(routeStops.map((s) => String(s.stop_id)));
  const selectedRouteIds = new Set(routeStops.map((s) => String(s.route_id)));

  for (const [routeId, routeMeta] of routeLineRegistry.entries()) {
    const polyline = routeMeta.el;
    const casing = routeMeta.caseEl;
    if (selectedRouteIds.has(String(routeId))) {
      polyline.setAttribute("stroke", routeMeta.color || polyline.dataset.baseColor || "#999");
      polyline.setAttribute("opacity", "1");
      polyline.setAttribute("stroke-width", String(ACTIVE_ROUTE_STROKE));
      if (casing) {
        casing.setAttribute("stroke", "#FFFFFF");
        casing.setAttribute("opacity", "1");
        casing.setAttribute("stroke-width", String(ACTIVE_ROUTE_STROKE + 3));
      }
    } else {
      polyline.setAttribute("stroke", INACTIVE_ROUTE_COLOR);
      polyline.setAttribute("opacity", "0.3");
      polyline.setAttribute("stroke-width", String(INACTIVE_ROUTE_STROKE));
      if (casing) {
        casing.setAttribute("stroke", "#F3F4F6");
        casing.setAttribute("opacity", "0.3");
        casing.setAttribute("stroke-width", String(INACTIVE_ROUTE_STROKE + 1));
      }
    }
  }

  // Rail always above bus: adjust z-index on SVG groups
  routeLayer.children.forEach((el, idx) => {
    const routeId = el.dataset.routeId;
    if (!routeId) return;
    const mode = getRouteMode(routeId);
    el.style.zIndex = mode === 'RAIL' ? '2' : '1';
  });

  for (const [stopId, elements] of stopElementRegistry.entries()) {
    const isSelected = selectedStopIds.has(String(stopId));
    for (const entry of elements) {
      const el = entry.el;
      el.setAttribute("opacity", "1");
      el.style.filter = isSelected ? "none" : "grayscale(1)";
    }
  }

  const overlay = document.createElementNS(svg.namespaceURI, "g");
  overlay.setAttribute("id", "active-route-overlay");
  overlay.style.zIndex = '15'; // Above rail/bus

  let chunk = [routeStops[0]];
  for (let i = 1; i < routeStops.length; i++) {
    const prev = routeStops[i - 1];
    const cur = routeStops[i];
    if (cur.route_id === prev.route_id) {
      chunk.push(cur);
      continue;
    }

    const chunkPath = document.createElementNS(svg.namespaceURI, "path");
    const chunkColor = getRouteColor(
      prev.route_id,
      false,
      prev.route_color ?? cur.route_color ?? null
    ).color;
    chunkPath.setAttribute("d", smoothPathFromStops(chunk));
    chunkPath.setAttribute("fill", "none");
    chunkPath.setAttribute("stroke", chunkColor);
    chunkPath.setAttribute("stroke-width", "6");
    chunkPath.setAttribute("stroke-linecap", "round");
    chunkPath.setAttribute("stroke-linejoin", "round");
    chunkPath.setAttribute("opacity", "1");
    overlay.appendChild(chunkPath);

    chunk = [prev, cur];
  }
  if (chunk.length >= 2) {
    const tail = chunk[chunk.length - 1];
    const chunkPath = document.createElementNS(svg.namespaceURI, "path");
    chunkPath.setAttribute("d", smoothPathFromStops(chunk));
    chunkPath.setAttribute("fill", "none");
    chunkPath.setAttribute(
      "stroke",
      getRouteColor(tail.route_id, false, tail.route_color ?? null).color
    );
    chunkPath.setAttribute("stroke-width", "6");
    chunkPath.setAttribute("stroke-linecap", "round");
    chunkPath.setAttribute("stroke-linejoin", "round");
    chunkPath.setAttribute("opacity", "1");
    overlay.appendChild(chunkPath);
  }

  for (const stop of routeStops) {
    const marker = document.createElementNS(svg.namespaceURI, "circle");
    marker.setAttribute("cx", stop.xschema);
    marker.setAttribute("cy", stop.yschema);
    marker.setAttribute("r", 5);
    marker.setAttribute(
      "fill",
      getRouteColor(stop.route_id, false, stop.route_color ?? null).color
    );
    marker.setAttribute("stroke", "#001018");
    marker.setAttribute("stroke-width", "2");
    overlay.appendChild(marker);
  }

  svg.appendChild(overlay);
  activeRouteOverlay = overlay;
  applyLayerVisibility();
  refreshEndpointBadges();
}
