import { stations } from "/data/rail/stations.js";
import { rail } from "/data/rail/rail.js";
import { railTimetables } from "/data/rail/timetables.js";
import { busTimetables } from "/data/bus/timetables.js";
import { poi as poiRaw } from "/data/poi/poi.js";
import { goKL } from "/data/gokl/goKL.js";
import { rapidbus } from "/data/bus/rapidbus.js";
import { getPoiCategoryStyle, getRouteColor, getServiceLabel } from "../style/routeStyle.js";
import { hohoKL, hohoSel } from "/data/hoho/hoho.js";

const svg = document.getElementById("map");

// ================= CONFIG =================
const svgWidth = 1000;
const svgHeight = 1000;
const margin = 40;

const NODE_SPACING = 60;
const ROUTE_OFFSET = 6;
const TRANSFER_RADIUS = 10;
const MIN_MARGIN = 40;
const TRANSFER_DISTANCE = 28;
const SNAP_RADIUS = 30;
const TOUCH_SELECT_RADIUS = 44;
const GPS_SNAP_METERS = 160;
const PRIMARY_RAIL_STROKE = 6;
const SECONDARY_RAIL_STROKE = 5;
const BUS_STROKE = 3;
const CONNECTION_STROKE = 2;
const INACTIVE_ROUTE_STROKE = 2;
const ACTIVE_ROUTE_STROKE = 6;
const INACTIVE_ROUTE_COLOR = "#B0B0B0";
const CC_SEGMENT_LENGTH = 48;
const CC_LANE_GAP = 8;
const FLOATING_PANEL_IDLE_MS = 15 * 1000;
const FIXED_KIOSK_STOP_KEY = "jronda_fixed_station_stop_id";

// ================= DATA =================
function mergeRailStops(primary, fallback) {
  const merged = [];
  const seen = new Set();
  const keyOf = (s) => `${String(s.route_id || "")}|${String(s.source_stop_id || s.stop_id || "")}`;
  for (const s of primary || []) {
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }
  for (const s of fallback || []) {
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...s, _fallbackFromStations: true });
  }
  return merged;
}

const mergedRail = mergeRailStops(rail, stations);
const allStations = [...hohoKL, ...hohoSel, ...goKL, ...rapidbus, ...mergedRail];
const poiList = (poiRaw || []).map((p) => ({
  ...p,
  lon: Number(p.longitude),
  lat: Number(p.latitude),
})).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
for (let i = 0; i < poiList.length; i++) {
  poiList[i].id = String(poiList[i].id || `poi-${i + 1}`);
}
const stationById = new Map(allStations.map((s) => [String(s.stop_id), s]));
const railRouteIds = new Set(mergedRail.map((s) => String(s.route_id)));
const pendingInitToasts = [];

function emitToast(message, type = "info") {
  pendingInitToasts.push({ message, type });
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("jronda:toast", {
    detail: { message, type },
  }));
}

function translate(key, fallback = "") {
  if (typeof window !== "undefined" && window.jrondaI18n?.t) {
    return window.jrondaI18n.t(key, fallback);
  }
  return fallback || key;
}

function translatef(key, fallback, params = {}) {
  let out = translate(key, fallback);
  for (const [pKey, pValue] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pValue));
  }
  return out;
}

export function consumeInitToasts() {
  const out = pendingInitToasts.slice();
  pendingInitToasts.length = 0;
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
  if (mode === "RAIL") return 0;
  return 1;
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

// ================= ROUTE GROUPING =================
const routes = new Map();
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

const routeLineRegistry = new Map();
const stopElementRegistry = new Map();
const poiElementRegistry = [];
const stationNameIndex = new Map();
const transferLineRegistry = [];
let continuationPanelData = [];
let includeBusLayer = true;
let selectedRailRouteId = null;
let selectedRailCategory = null;
let startStopBadgeId = null;
let endStopBadgeId = null;

const sharedTrackLayer = document.createElementNS(svg.namespaceURI, "g");
sharedTrackLayer.setAttribute("id", "offset-layer");
const routeLayer = document.createElementNS(svg.namespaceURI, "g");
routeLayer.setAttribute("id", "route-layer");
const transferLayer = document.createElementNS(svg.namespaceURI, "g");
transferLayer.setAttribute("id", "transfer-layer");
const stopLayer = document.createElementNS(svg.namespaceURI, "g");
stopLayer.setAttribute("id", "stop-layer");
const poiLayer = document.createElementNS(svg.namespaceURI, "g");
poiLayer.setAttribute("id", "poi-layer");
const labelLayer = document.createElementNS(svg.namespaceURI, "g");
labelLayer.setAttribute("id", "label-layer");
const interactionLayer = document.createElementNS(svg.namespaceURI, "g");
interactionLayer.setAttribute("id", "interaction-layer");

const defs = document.createElementNS(svg.namespaceURI, "defs");
const clip = document.createElementNS(svg.namespaceURI, "clipPath");
clip.setAttribute("id", "map-clip");
const clipRect = document.createElementNS(svg.namespaceURI, "rect");
clipRect.setAttribute("x", "0");
clipRect.setAttribute("y", "0");
clipRect.setAttribute("width", String(svgWidth));
clipRect.setAttribute("height", String(svgHeight));
clip.appendChild(clipRect);
defs.appendChild(clip);
svg.appendChild(defs);
sharedTrackLayer.setAttribute("clip-path", "url(#map-clip)");
routeLayer.setAttribute("clip-path", "url(#map-clip)");
transferLayer.setAttribute("clip-path", "url(#map-clip)");
stopLayer.setAttribute("clip-path", "url(#map-clip)");
poiLayer.setAttribute("clip-path", "url(#map-clip)");
labelLayer.setAttribute("clip-path", "url(#map-clip)");
interactionLayer.setAttribute("clip-path", "url(#map-clip)");
svg.appendChild(sharedTrackLayer);
svg.appendChild(routeLayer);
svg.appendChild(transferLayer);
svg.appendChild(poiLayer);
svg.appendChild(stopLayer);
svg.appendChild(labelLayer);
svg.appendChild(interactionLayer);

for (const stop of allStations) {
  const key = String(stop.stop_name || "").trim().toLowerCase();
  if (!stationNameIndex.has(key)) stationNameIndex.set(key, []);
  stationNameIndex.get(key).push(stop);
}

const hohoRoutesByStopName = new Map();
for (const stop of allStations) {
  const isHoho = String(stop.category || "").toUpperCase() === "HOHO";
  if (!isHoho) continue;
  const key = String(stop.stop_name || "").trim().toLowerCase();
  if (!key) continue;
  if (!hohoRoutesByStopName.has(key)) hohoRoutesByStopName.set(key, new Set());
  hohoRoutesByStopName.get(key).add(String(stop.route_id || ""));
}

function isHohoWeekendOnlyRoute(routeId) {
  const rid = String(routeId || "").toUpperCase();
  return rid === "HOHOS-SAT" || rid === "HOHOS-SUN";
}

function isHohoRouteActiveToday(routeId) {
  const rid = String(routeId || "").toUpperCase();
  const day = new Date().getDay();
  if (rid === "HOHOS-SAT") return day === 6;
  if (rid === "HOHOS-SUN") return day === 0;
  return true;
}

// ================= GEO PROJECTION =================
const lats = allStations.map(s => s.stop_lat);
const lons = allStations.map(s => s.stop_lon);
const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const minLon = Math.min(...lons);
const maxLon = Math.max(...lons);

function projectGeo(lat, lon) {
  const x = ((lon - minLon) / (maxLon - minLon)) * (svgWidth - 2 * margin) + margin;
  const y = ((maxLat - lat) / (maxLat - minLat)) * (svgHeight - 2 * margin) + margin;
  return [x, y];
}

for (const s of allStations) {
  const [x, y] = projectGeo(s.stop_lat, s.stop_lon);
  s.xgeo = x;
  s.ygeo = y;
}

for (const p of poiList) {
  const [x, y] = projectGeo(p.lat, p.lon);
  p.xgeo = x;
  p.ygeo = y;
}

// ================= SCHEMATIC LAYOUT =================
function normalizeStopName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snapAngle45(dx, dy) {
  const angle = Math.atan2(dy, dx);
  return Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
}

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

  const center = { x: svgWidth * 0.5, y: svgHeight * 0.5 };
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
  const innerW = svgWidth - MIN_MARGIN * 2;
  const innerH = svgHeight - MIN_MARGIN * 2;
  const scale = Math.min(innerW / width, innerH / height);
  const tx = (svgWidth - width * scale) / 2 - minX * scale;
  const ty = (svgHeight - height * scale) / 2 - minY * scale;
  for (const s of railStops) {
    if (!Number.isFinite(s.xschema) || !Number.isFinite(s.yschema)) continue;
    s.xschema = s.xschema * scale + tx;
    s.yschema = s.yschema * scale + ty;
  }

  return true;
}

function buildSchematicLayout() {
  const railStops = allStations.filter((stop) => getRouteMode(stop.route_id) === "RAIL");
  const busStops = allStations.filter((stop) => getRouteMode(stop.route_id) !== "RAIL");
  const railRoutes = Array.from(routes.entries())
    .filter(([routeId]) => getRouteMode(routeId) === "RAIL")
    .map(([routeId, routeStops]) => [String(routeId), routeStops]);
  const busRoutes = Array.from(routes.entries())
    .filter(([routeId]) => getRouteMode(routeId) !== "RAIL")
    .map(([routeId, routeStops]) => [String(routeId), routeStops]);

  if (!railStops.length) {
    for (const stop of allStations) {
      stop.xschema = stop.xgeo;
      stop.yschema = stop.ygeo;
    }
    return;
  }

  const GRID_SPACING = 80;
  const HUB_SPACING = 140;
  const MAX_STRAIGHT_SEGMENT_NODES = 6;

  const centroidLon =
    railStops.reduce((sum, stop) => sum + Number(stop.stop_lon || 0), 0) / Math.max(1, railStops.length);
  const centroidLat =
    railStops.reduce((sum, stop) => sum + Number(stop.stop_lat || 0), 0) / Math.max(1, railStops.length);

  const stopById = new Map(allStations.map((stop) => [String(stop.stop_id), stop]));
  const neighbors = new Map();
  const routeLengthById = new Map();
  for (const stop of railStops) {
    const sid = String(stop.stop_id);
    if (!neighbors.has(sid)) neighbors.set(sid, new Set());
    stop.layoutX = null;
    stop.layoutY = null;
  }

  const segmentUsage = new Map();
  const railEdges = [];
  const seenEdge = new Set();
  function edgeKeyByStops(aStop, bStop) {
    const a = canonicalStopKey(aStop) || String(aStop.stop_id);
    const b = canonicalStopKey(bStop) || String(bStop.stop_id);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  function edgeIdByStopIds(aId, bId) {
    return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
  }

  for (const [routeId, routeStops] of railRoutes) {
    routeLengthById.set(routeId, routeStops.length);
    for (let i = 0; i < routeStops.length - 1; i++) {
      const fromStop = routeStops[i];
      const toStop = routeStops[i + 1];
      const fromId = String(fromStop.stop_id);
      const toId = String(toStop.stop_id);
      if (!neighbors.has(fromId)) neighbors.set(fromId, new Set());
      if (!neighbors.has(toId)) neighbors.set(toId, new Set());
      neighbors.get(fromId).add(toId);
      neighbors.get(toId).add(fromId);

      const sharedKey = edgeKeyByStops(fromStop, toStop);
      if (!segmentUsage.has(sharedKey)) segmentUsage.set(sharedKey, new Set());
      segmentUsage.get(sharedKey).add(routeId);

      const edgeId = edgeIdByStopIds(fromId, toId);

      if (!seenEdge.has(edgeId)) {
        seenEdge.add(edgeId);
        railEdges.push([fromId, toId]);
      }
    }

    if (routeStops.length >= 3) {
      const firstStop = routeStops[0];
      const lastStop = routeStops[routeStops.length - 1];
      const loopLike =
        canonicalStopKey(firstStop) === canonicalStopKey(lastStop) ||
        haversineMeters(
          Number(firstStop.stop_lat),
          Number(firstStop.stop_lon),
          Number(lastStop.stop_lat),
          Number(lastStop.stop_lon)
        ) < 900;
      if (loopLike) {
        const firstId = String(firstStop.stop_id);
        const lastId = String(lastStop.stop_id);
        if (firstId !== lastId) {
          const edgeId = edgeIdByStopIds(firstId, lastId);
          if (!seenEdge.has(edgeId)) {
            seenEdge.add(edgeId);
            railEdges.push([firstId, lastId]);
          }
        }
      }
    }
  }

  const degreeByStop = new Map();
  for (const stop of railStops) {
    degreeByStop.set(String(stop.stop_id), (neighbors.get(String(stop.stop_id)) || new Set()).size);
  }

  const anchors = new Set();
  for (const stop of railStops) {
    const sid = String(stop.stop_id);
    const degree = degreeByStop.get(sid) || 0;
    if (degree >= 3 || stop.isInterchange || stop.isConnecting) anchors.add(sid);
  }
  for (const [, routeStops] of railRoutes) {
    if (!routeStops.length) continue;
    anchors.add(String(routeStops[0].stop_id));
    anchors.add(String(routeStops[routeStops.length - 1].stop_id));
  }

  const corridorScores = [];
  for (const [corridorKey, routeSet] of segmentUsage.entries()) {
    const routeIds = Array.from(routeSet);
    const maxRouteLength = routeIds.reduce(
      (maxLen, routeId) => Math.max(maxLen, routeLengthById.get(routeId) || 0),
      0
    );
    const corridorScore = routeSet.size * 5 + maxRouteLength;
    corridorScores.push({ corridorKey, corridorScore });
  }
  corridorScores.sort((a, b) => b.corridorScore - a.corridorScore);
  const trunkCount = Math.max(1, Math.ceil(corridorScores.length * 0.3));
  const trunkCorridorKeys = new Set(
    corridorScores.slice(0, trunkCount).map((entry) => entry.corridorKey)
  );
  const routePlacementScore = new Map();
  for (const [routeId, routeStops] of railRoutes) {
    let trunkHits = 0;
    for (let i = 0; i < routeStops.length - 1; i++) {
      const key = edgeKeyByStops(routeStops[i], routeStops[i + 1]);
      if (trunkCorridorKeys.has(key)) trunkHits++;
    }
    routePlacementScore.set(routeId, trunkHits * 5 + routeStops.length);
  }
  railRoutes.sort(
    (left, right) =>
      (routePlacementScore.get(right[0]) || 0) -
      (routePlacementScore.get(left[0]) || 0)
  );

  const placed = new Set();
  function absAngleDeltaLocal(a, b) {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  }
  function chooseOutwardTheta(anchorX, anchorY, preferredTheta) {
    const centerDx = centerX - anchorX;
    const centerDy = centerY - anchorY;
    let baseTheta = preferredTheta;
    if (Math.cos(baseTheta) * centerDx + Math.sin(baseTheta) * centerDy > 0) {
      baseTheta += Math.PI;
    }
    const candidateAngles = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (deg * Math.PI) / 180);
    let bestTheta = baseTheta;
    let bestDelta = Infinity;
    for (const candidate of candidateAngles) {
      if (absAngleDeltaLocal(candidate, preferredTheta) > Math.PI / 4 + 0.001) continue;
      const ux = Math.cos(candidate);
      const uy = Math.sin(candidate);
      const dotToCenter = ux * centerDx + uy * centerDy;
      if (dotToCenter > 0) continue;
      const delta = absAngleDeltaLocal(candidate, preferredTheta);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestTheta = candidate;
      }
    }
    return bestTheta;
  }
  function spacingForEdge(aId, bId) {
    const aDegree = degreeByStop.get(String(aId)) || 0;
    const bDegree = degreeByStop.get(String(bId)) || 0;
    return aDegree > 4 || bDegree > 4 ? HUB_SPACING : GRID_SPACING;
  }
  function placeStop(stop, x, y, blend = 1) {
    const sid = String(stop.stop_id);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (placed.has(sid)) {
      if (anchors.has(sid)) return false;
      stop.layoutX = stop.layoutX * (1 - blend) + x * blend;
      stop.layoutY = stop.layoutY * (1 - blend) + y * blend;
      return false;
    }
    stop.layoutX = x;
    stop.layoutY = y;
    placed.add(sid);
    return true;
  }

  const centerX = svgWidth * 0.5;
  const centerY = svgHeight * 0.5;
  let seeded = false;
  for (const corridor of corridorScores) {
    if (!trunkCorridorKeys.has(corridor.corridorKey)) continue;
    let match = null;
    for (const [aId, bId] of railEdges) {
      const aStop = stopById.get(aId);
      const bStop = stopById.get(bId);
      if (!aStop || !bStop) continue;
      if (edgeKeyByStops(aStop, bStop) !== corridor.corridorKey) continue;
      match = [aStop, bStop];
      break;
    }
    if (!match) continue;
    const [aStop, bStop] = match;
    const theta = snapAngle45(
      Number(bStop.stop_lon) - Number(aStop.stop_lon),
      Number(bStop.stop_lat) - Number(aStop.stop_lat)
    );
    const step = spacingForEdge(aStop.stop_id, bStop.stop_id);
    if (!seeded) {
      placeStop(aStop, centerX, centerY);
      placeStop(bStop, centerX + Math.cos(theta) * step, centerY + Math.sin(theta) * step);
      seeded = true;
      continue;
    }
    const aPlaced = placed.has(String(aStop.stop_id));
    const bPlaced = placed.has(String(bStop.stop_id));
    if (aPlaced && !bPlaced) {
      placeStop(
        bStop,
        aStop.layoutX + Math.cos(theta) * step,
        aStop.layoutY + Math.sin(theta) * step
      );
    } else if (!aPlaced && bPlaced) {
      placeStop(
        aStop,
        bStop.layoutX - Math.cos(theta) * step,
        bStop.layoutY - Math.sin(theta) * step
      );
    }
  }

  function placeRouteSequential(routeId, routeStops, seedIndex) {
    if (!routeStops.length) return 0;
    let created = 0;
    let anchorIndex = routeStops.findIndex((stop) => placed.has(String(stop.stop_id)));
    if (anchorIndex < 0) {
      const theta = (Math.PI * 2 * seedIndex) / Math.max(1, railRoutes.length);
      const seedX = centerX + Math.cos(theta) * GRID_SPACING * 1.4;
      const seedY = centerY + Math.sin(theta) * GRID_SPACING * 1.4;
      anchorIndex = 0;
      created += placeStop(routeStops[0], seedX, seedY) ? 1 : 0;
    }

    let forwardStraightCount = 0;
    let forwardPrevTheta = null;
    for (let i = anchorIndex + 1; i < routeStops.length; i++) {
      const prev = routeStops[i - 1];
      const curr = routeStops[i];
      if (!placed.has(String(prev.stop_id))) continue;
      if (placed.has(String(curr.stop_id))) continue;
      const step = spacingForEdge(prev.stop_id, curr.stop_id);
      const geoTheta = snapAngle45(
        Number(curr.stop_lon) - Number(prev.stop_lon),
        Number(curr.stop_lat) - Number(prev.stop_lat)
      );
      let theta = chooseOutwardTheta(prev.layoutX, prev.layoutY, geoTheta);
      if (forwardPrevTheta != null && absAngleDeltaLocal(forwardPrevTheta, theta) < 0.001) {
        forwardStraightCount++;
      } else {
        forwardStraightCount = 1;
      }
      forwardPrevTheta = theta;
      if (forwardStraightCount > MAX_STRAIGHT_SEGMENT_NODES) {
        const bendA = geoTheta + Math.PI / 4;
        const bendB = geoTheta - Math.PI / 4;
        const outA = chooseOutwardTheta(prev.layoutX, prev.layoutY, bendA);
        const outB = chooseOutwardTheta(prev.layoutX, prev.layoutY, bendB);
        theta =
          absAngleDeltaLocal(outA, geoTheta) <= absAngleDeltaLocal(outB, geoTheta)
            ? outA
            : outB;
        forwardStraightCount = 1;
      }
      if (absAngleDeltaLocal(theta, geoTheta) > Math.PI / 4) theta = geoTheta;
      const x = prev.layoutX + Math.cos(theta) * step;
      const y = prev.layoutY + Math.sin(theta) * step;
      created += placeStop(curr, x, y) ? 1 : 0;
    }

    let backwardStraightCount = 0;
    let backwardPrevTheta = null;
    for (let i = anchorIndex - 1; i >= 0; i--) {
      const next = routeStops[i + 1];
      const curr = routeStops[i];
      if (!placed.has(String(next.stop_id))) continue;
      if (placed.has(String(curr.stop_id))) continue;
      const step = spacingForEdge(curr.stop_id, next.stop_id);
      const geoTheta = snapAngle45(
        Number(curr.stop_lon) - Number(next.stop_lon),
        Number(curr.stop_lat) - Number(next.stop_lat)
      );
      let theta = chooseOutwardTheta(next.layoutX, next.layoutY, geoTheta);
      if (backwardPrevTheta != null && absAngleDeltaLocal(backwardPrevTheta, theta) < 0.001) {
        backwardStraightCount++;
      } else {
        backwardStraightCount = 1;
      }
      backwardPrevTheta = theta;
      if (backwardStraightCount > MAX_STRAIGHT_SEGMENT_NODES) {
        const bendA = geoTheta + Math.PI / 4;
        const bendB = geoTheta - Math.PI / 4;
        const outA = chooseOutwardTheta(next.layoutX, next.layoutY, bendA);
        const outB = chooseOutwardTheta(next.layoutX, next.layoutY, bendB);
        theta =
          absAngleDeltaLocal(outA, geoTheta) <= absAngleDeltaLocal(outB, geoTheta)
            ? outA
            : outB;
        backwardStraightCount = 1;
      }
      if (absAngleDeltaLocal(theta, geoTheta) > Math.PI / 4) theta = geoTheta;
      const x = next.layoutX + Math.cos(theta) * step;
      const y = next.layoutY + Math.sin(theta) * step;
      created += placeStop(curr, x, y) ? 1 : 0;
    }
    return created;
  }

  let grown = true;
  let pass = 0;
  while (grown && pass < 10) {
    grown = false;
    pass++;
    for (let routeIndex = 0; routeIndex < railRoutes.length; routeIndex++) {
      const [routeId, routeStops] = railRoutes[routeIndex];
      const created = placeRouteSequential(routeId, routeStops, routeIndex);
      if (created > 0) grown = true;
    }
  }

  for (const stop of railStops) {
    if (placed.has(String(stop.stop_id))) continue;
    const px = ((stop.xgeo - margin) / Math.max(1, svgWidth - margin * 2)) * (svgWidth - MIN_MARGIN * 2) + MIN_MARGIN;
    const py = ((stop.ygeo - margin) / Math.max(1, svgHeight - margin * 2)) * (svgHeight - MIN_MARGIN * 2) + MIN_MARGIN;
    placeStop(stop, px, py);
  }

  let minLayoutX = Infinity;
  let maxLayoutX = -Infinity;
  let minLayoutY = Infinity;
  let maxLayoutY = -Infinity;
  for (const stop of railStops) {
    minLayoutX = Math.min(minLayoutX, stop.layoutX);
    maxLayoutX = Math.max(maxLayoutX, stop.layoutX);
    minLayoutY = Math.min(minLayoutY, stop.layoutY);
    maxLayoutY = Math.max(maxLayoutY, stop.layoutY);
  }
  const layoutWidth = Math.max(1, maxLayoutX - minLayoutX);
  const layoutHeight = Math.max(1, maxLayoutY - minLayoutY);
  const fitScale = Math.min(
    (svgWidth - MIN_MARGIN * 2) / layoutWidth,
    (svgHeight - MIN_MARGIN * 2) / layoutHeight
  );
  const fitTx = (svgWidth - layoutWidth * fitScale) * 0.5 - minLayoutX * fitScale;
  const fitTy = (svgHeight - layoutHeight * fitScale) * 0.5 - minLayoutY * fitScale;
  for (const stop of railStops) {
    stop.xschema = stop.layoutX * fitScale + fitTx;
    stop.yschema = stop.layoutY * fitScale + fitTy;
  }

  let railGeoMinX = Infinity;
  let railGeoMaxX = -Infinity;
  let railGeoMinY = Infinity;
  let railGeoMaxY = -Infinity;
  for (const stop of railStops) {
    railGeoMinX = Math.min(railGeoMinX, stop.xgeo);
    railGeoMaxX = Math.max(railGeoMaxX, stop.xgeo);
    railGeoMinY = Math.min(railGeoMinY, stop.ygeo);
    railGeoMaxY = Math.max(railGeoMaxY, stop.ygeo);
  }
  function mapGeoToRailSchema(x, y) {
    const tx = (x - railGeoMinX) / Math.max(1, railGeoMaxX - railGeoMinX);
    const ty = (y - railGeoMinY) / Math.max(1, railGeoMaxY - railGeoMinY);
    return [
      MIN_MARGIN + tx * (svgWidth - MIN_MARGIN * 2),
      MIN_MARGIN + ty * (svgHeight - MIN_MARGIN * 2),
    ];
  }

  const railByName = new Map();
  for (const stop of railStops) {
    const key = normalizeStopName(stop.stop_name);
    if (!key || railByName.has(key)) continue;
    railByName.set(key, stop);
  }

  for (const stop of busStops) {
    stop.xschema = null;
    stop.yschema = null;
  }
  for (const [, routeStops] of busRoutes) {
    for (let i = 0; i < routeStops.length; i++) {
      const currentStop = routeStops[i];
      const railMatch = railByName.get(normalizeStopName(currentStop.stop_name));
      if (railMatch) {
        currentStop.xschema = railMatch.xschema;
        currentStop.yschema = railMatch.yschema;
        continue;
      }
      if (i === 0) {
        const [sx, sy] = mapGeoToRailSchema(currentStop.xgeo, currentStop.ygeo);
        currentStop.xschema = sx;
        currentStop.yschema = sy;
        continue;
      }
      const previousStop = routeStops[i - 1];
      const prevX = Number.isFinite(previousStop.xschema)
        ? previousStop.xschema
        : mapGeoToRailSchema(previousStop.xgeo, previousStop.ygeo)[0];
      const prevY = Number.isFinite(previousStop.yschema)
        ? previousStop.yschema
        : mapGeoToRailSchema(previousStop.xgeo, previousStop.ygeo)[1];
      const theta = snapAngle45(
        Number(currentStop.stop_lon) - Number(previousStop.stop_lon),
        Number(currentStop.stop_lat) - Number(previousStop.stop_lat)
      );
      const step = Math.max(18, GRID_SPACING * 0.5);
      currentStop.xschema = prevX + Math.cos(theta) * step;
      currentStop.yschema = prevY + Math.sin(theta) * step;
    }
  }

  for (const stop of allStations) {
    if (!Number.isFinite(stop.xschema) || !Number.isFinite(stop.yschema)) {
      stop.xschema = stop.xgeo;
      stop.yschema = stop.ygeo;
    }
  }

  emitToast(
    translatef(
      "layout_centroid_info",
      "Map layout: centroid ({lat}, {lon}) with trunk-first directional schematic",
      { lat: centroidLat.toFixed(4), lon: centroidLon.toFixed(4) }
    ),
    "info"
  );
}

buildSchematicLayout();

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

function fitVisibleNetworkToViewport() {
  const nodes = mapVisibleStops.filter(
    (s) => Number.isFinite(s.xschema) && Number.isFinite(s.yschema)
  );
  if (!nodes.length) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of nodes) {
    minX = Math.min(minX, s.xschema);
    maxX = Math.max(maxX, s.xschema);
    minY = Math.min(minY, s.yschema);
    maxY = Math.max(maxY, s.yschema);
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const innerW = svgWidth - MIN_MARGIN * 2;
  const innerH = svgHeight - MIN_MARGIN * 2;
  const scale = Math.min(innerW / width, innerH / height);
  const tx = (svgWidth - width * scale) / 2 - minX * scale;
  const ty = (svgHeight - height * scale) / 2 - minY * scale;

  for (const s of nodes) {
    s.xschema = s.xschema * scale + tx;
    s.yschema = s.yschema * scale + ty;
  }
  for (const p of poiList) {
    if (!Number.isFinite(p.xschema) || !Number.isFinite(p.yschema)) continue;
    p.xschema = p.xschema * scale + tx;
    p.yschema = p.yschema * scale + ty;
  }
}

fitVisibleNetworkToViewport();

let schemaStopIndex = new Map();
let geoStopIndex = new Map();
let poiSchemaIndex = new Map();
let interchangeCandidates = [];

function rebuildSpatialIndexes() {
  schemaStopIndex = buildSpatialIndex(
    mapVisibleStops,
    (s) => s.xschema,
    (s) => s.yschema,
    SCHEMA_BUCKET_SIZE
  );
  geoStopIndex = buildSpatialIndex(
    mapVisibleStops,
    (s) => s.xgeo,
    (s) => s.ygeo,
    GEO_BUCKET_SIZE
  );
  poiSchemaIndex = buildSpatialIndex(
    poiList,
    (p) => p.xschema,
    (p) => p.yschema,
    SCHEMA_BUCKET_SIZE
  );
  interchangeCandidates = mapVisibleStops.filter(
    (s) => s.isInterchange || s.isConnecting
  );
}

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

function getSegmentOffset(routeId, a, b) {
  const key = makeSegmentKey(a, b);
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

function getOffsetPolyline(routeId, stops) {
  const points = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const ap = getRouteStopPoint(routeId, a);
    const bp = getRouteStopPoint(routeId, b);
    const dx = bp.x - ap.x;
    const dy = bp.y - ap.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = getSegmentOffset(routeId, a, b);
    const p1 = { x: ap.x + nx * offset, y: ap.y + ny * offset };
    const p2 = { x: bp.x + nx * offset, y: bp.y + ny * offset };
    if (i === 0) points.push(p1);
    points.push(p2);
  }
  return points;
}

function applyRenderedStopPlacement() {
  const acc = new Map();
  for (const [routeId, stops] of routes.entries()) {
    const displayStops = routeDisplayStops.get(String(routeId)) || stops;
    if (!displayStops || displayStops.length < 2) continue;
    const pts = getOffsetPolyline(routeId, displayStops);
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
rebuildSpatialIndexes();

function polylinePathFromPoints(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function capsulePathFromStops(routeId, stops) {
  const pts = stops
    .map((s) => getRouteStopPoint(routeId, s))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return polylinePathFromPoints(pts);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  let w = Math.max(42, maxX - minX + 24);
  let h = Math.max(26, maxY - minY + 20);
  const majorHorizontal = w >= h;
  if (majorHorizontal) h = Math.min(h, w * 0.55);
  else w = Math.min(w, h * 0.55);
  const r = majorHorizontal ? h * 0.5 : w * 0.5;

  const dx = pts[pts.length - 1].x - pts[0].x;
  const dy = pts[pts.length - 1].y - pts[0].y;
  const theta = snapAngle45(dx, dy);
  const deg = (theta * 180) / Math.PI;

  let d = "";
  if (majorHorizontal) {
    const x0 = cx - w * 0.5;
    const x1 = cx + w * 0.5;
    const y0 = cy - h * 0.5;
    const y1 = cy + h * 0.5;
    d = [
      `M ${x0 + r} ${y0}`,
      `L ${x1 - r} ${y0}`,
      `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
      `L ${x0 + r} ${y1}`,
      `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
      "Z",
    ].join(" ");
  } else {
    const x0 = cx - w * 0.5;
    const x1 = cx + w * 0.5;
    const y0 = cy - h * 0.5;
    const y1 = cy + h * 0.5;
    d = [
      `M ${x0} ${y0 + r}`,
      `L ${x0} ${y1 - r}`,
      `A ${r} ${r} 0 0 1 ${x1} ${y1 - r}`,
      `L ${x1} ${y0 + r}`,
      `A ${r} ${r} 0 0 1 ${x0} ${y0 + r}`,
      "Z",
    ].join(" ");
  }
  return {
    d,
    transform: `rotate(${deg} ${cx} ${cy})`,
  };
}

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
  const routePoints = getOffsetPolyline(route_id, displayStops);
  const isLoopBus = mode !== "RAIL" && displayStops.some((s) => Boolean(s.isLoop));
  const isCcRail = mode === "RAIL" && (isCcRailRouteId(route_id) || displayStops.some((s) => isCcRailStop(s)));
  const loopPath = busLoopRenderCache.get(String(route_id));
  const routePathD = isLoopBus
    ? (loopPath?.pathD || polylinePathFromPoints(routePoints))
    : (isCcRail && routePoints.length > 2
      ? polylinePathFromPoints([...routePoints, routePoints[0]])
      : polylinePathFromPoints(routePoints));
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

const stationTooltip = document.createElement("div");
stationTooltip.id = "station-tooltip";
let tooltipStopId = null;
let floatingPanelTimer = null;
document.body.appendChild(stationTooltip);

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

function showStationTooltip(stop, clientX, clientY) {
  const t = (key, fallback) => {
    if (window?.jrondaI18n && typeof window.jrondaI18n.t === "function") {
      return window.jrondaI18n.t(key, fallback);
    }
    return fallback;
  };
  const key = String(stop.stop_name || "").trim().toLowerCase();
  const siblings = stationNameIndex.get(key) || [stop];
  const railRoutes = [];
  const busRoutes = [];
  const railTimetableRows = [];
  const busTimetableRows = [];
  const seenRail = new Set();
  const seenBus = new Set();
  const seenRailTimetable = new Set();
  const nearbyPoi = findNearbyPoiForStop(stop, 1400, 4);
  const todayBucket = getTodayTimetableBucket();
  const dayLabel = todayBucket === "weekday" ? "Weekday" : (todayBucket === "saturday" ? "Saturday" : "Sunday");

  for (const s of siblings) {
    const routeId = String(s.route_id);
    const routeLabel = getServiceLabel(s, getRouteMode(routeId));
    const mode = getRouteMode(routeId);
    if (mode === "RAIL") {
      if (!seenRail.has(routeLabel)) {
        seenRail.add(routeLabel);
        railRoutes.push(routeLabel);
      }
      const sourceStopId = resolveSourceStopId(s);
      const tKey = `${routeId}|${sourceStopId}`;
      if (!seenRailTimetable.has(tKey)) {
        seenRailTimetable.add(tKey);
        const routeTable = railTimetables?.[routeId]?.[sourceStopId];
        const times = Array.isArray(routeTable?.[todayBucket]) ? routeTable[todayBucket] : [];
        if (times.length) {
          const next = getUpcomingDepartures(times, 4).join(", ");
          const first = times[0];
          const last = times[times.length - 1];
          railTimetableRows.push(
            `<div><b>${routeLabel}</b>: ${dayLabel} ${first} - ${last}<br/><span class="tooltip-next">Next: ${next}</span></div>`
          );
        } else {
          railTimetableRows.push(
            `<div><b>${routeLabel}</b>: <span class="tooltip-muted">No static timetable</span></div>`
          );
        }
      }
    } else if (!seenBus.has(routeLabel)) {
      seenBus.add(routeLabel);
      busRoutes.push(routeLabel);
      const sourceStopId = resolveSourceStopId(s);
      const bTable = busTimetables?.[routeId]?.[sourceStopId];
      const bt = Array.isArray(bTable?.[todayBucket]) ? bTable[todayBucket] : [];
      if (bt.length) {
        const next = getUpcomingDepartures(bt, 3).join(", ");
        const first = bt[0];
        const last = bt[bt.length - 1];
        busTimetableRows.push(
          `<div><b>${routeLabel}</b>: ${dayLabel} ${first} - ${last}<br/><span class="tooltip-next">Next: ${next}</span></div>`
        );
      } else {
        busTimetableRows.push(
          `<div><b>${routeLabel}</b>: <span class="tooltip-muted">No static timetable</span></div>`
        );
      }
    }
  }

  tooltipStopId = String(stop.stop_id);
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
    const { color, iconPath } = getPoiCategoryStyle(category);
    return `<svg width="12" height="12" viewBox="0 0 24 24" style="vertical-align:middle;margin-right:4px;">
      <path d="${iconPath || ""}" fill="${color}" stroke="#fff" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }
  stationTooltip.innerHTML = `
    <div class="tooltip-title">${stop.stop_name || stop.stop_id}</div>
    <div class="tooltip-line">${t("primary_line", "Primary line")}: <b>${primaryLabel}</b> (${getRouteMode(stop.route_id)})</div>
    <div class="tooltip-line">${t("rail_lines", "Rail lines")}: ${railRoutes.join(", ") || t("none", "None")}</div>
    <div>${t("bus_lines", "Bus lines")}: ${busRoutes.join(", ") || t("none", "None")}</div>
    <div class="tooltip-section"><b>Rail timetable (${dayLabel})</b>:<br/>${railTimetableRows.length ? railTimetableRows.join("<div class='tooltip-divider'></div>") : "<span class='tooltip-muted'>No timetable data</span>"}</div>
    <div class="tooltip-section"><b>Bus timetable (${dayLabel})</b>:<br/>${busTimetableRows.length ? busTimetableRows.join("<div class='tooltip-divider'></div>") : "<span class='tooltip-muted'>No timetable data</span>"}</div>
    ${weekendOnly && !weekendActive ? `<div class="tooltip-warn">${t("hoho_weekend_only", "This HOHO route runs only on")} ${String(stop.route_id).toUpperCase().includes("SAT") ? t("saturday", "Saturday") : t("sunday", "Sunday")}.</div>` : ""}
    <div class="tooltip-section">${t("nearby_poi", "Nearby POI")}: ${
      nearbyPoi.length
        ? nearbyPoi.map((p) => `${poiIcon(p.category)} ${p.name} (${p.category}, ${p.meters}m)`).join("<br/>")
        : t("none_1_4km", "None in 1.4km")
    }</div>
    <div class="tooltip-actions">
      ${endOnly ? "" : `<button id="jronda-start-here" class="${startButtonClassName}" type="button" aria-label="${t("set_start_here", "Set start here")}" ${disabledStateAttributes}>${t("start_here", "Start here")}</button>`}
      ${startOnly ? "" : `<button id="jronda-end-here" class="${endButtonClassName}" type="button" aria-label="${t("set_end_here", "Set end here")}" ${disabledStateAttributes}>${t("end_here", "End here")}</button>`}
    </div>
  `;
  positionAndShowStationTooltip(clientX, clientY, 140);
  armFloatingPanelTimeout();

  const startBtn = document.getElementById("jronda-start-here");
  const endBtn = document.getElementById("jronda-end-here");
  if (startBtn) {
    startBtn.onclick = () => {
      if (actionDisabled) {
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
      if (actionDisabled) {
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
    ` : `<div class="tooltip-hint">${translate("tap_here_again", "Tap \"You are here\" again for station lock controls.")}</div>`}
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
    </div>
  `;
  positionAndShowStationTooltip(clientX, clientY, 220);
  armFloatingPanelTimeout();

  const stationSelectElement = document.getElementById("jronda-gps-station-select");
  const applyStationButton = document.getElementById("jronda-gps-apply-station");
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

const startBadge = createEndpointBadge("S", "#0D6EFD");
const endBadge = createEndpointBadge("E", "#D63384");
svg.appendChild(startBadge.g);
svg.appendChild(endBadge.g);

function positionBadge(badge, stop, visible) {
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
  const s = startStopBadgeId ? findDisplayStop(startStopBadgeId) : null;
  const e = endStopBadgeId ? findDisplayStop(endStopBadgeId) : null;
  positionBadge(startBadge, s, Boolean(s));
  positionBadge(endBadge, e, Boolean(e));
}

function isRailMode(mode) {
  return mode === "RAIL";
}

function applyLayerVisibility() {
  for (const [routeId, meta] of routeLineRegistry.entries()) {
    let visible = true;
    if (!includeBusLayer && meta.mode === "BUS") {
      visible = false;
    }
    if (
      selectedRailCategory &&
      isRailMode(meta.mode) &&
      String(meta.category || "").toUpperCase() !== String(selectedRailCategory).toUpperCase()
    ) {
      visible = false;
    }
    meta.el.style.display = visible ? "" : "none";
    if (meta.caseEl) meta.caseEl.style.display = visible ? "" : "none";
    if (!visible) continue;

    if (selectedRailRouteId) {
      const focused = routeId === selectedRailRouteId;
      meta.el.setAttribute("stroke", focused ? (meta.color || meta.el.dataset.baseColor || "#888") : INACTIVE_ROUTE_COLOR);
      meta.el.setAttribute("stroke-width", focused ? String(ACTIVE_ROUTE_STROKE) : String(INACTIVE_ROUTE_STROKE));
      meta.el.setAttribute("opacity", "1");
      if (meta.caseEl) {
        meta.caseEl.setAttribute("stroke", focused ? "#FFFFFF" : "#F3F4F6");
        meta.caseEl.setAttribute("stroke-width", focused ? String(meta.caseWidth) : String(INACTIVE_ROUTE_STROKE + 1));
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

export function setBusVisibility(includeBus) {
  includeBusLayer = Boolean(includeBus);
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

  const [xgeo, ygeo] = projectGeo(lat, lon);
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
  const [xgeo, ygeo] = projectGeo(lat, lon);

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

  const lat = userLocation.lat ?? userLocation.stop_lat;
  const lon = userLocation.lon ?? userLocation.stop_lon;

  const { nearest: geoStop, minMeters } =
    findNearestStopByGeo(lat, lon);

  const [px, py] = projectGpsToSchema(lat, lon);

  const snapped =
    geoStop && minMeters <= GPS_SNAP_METERS
      ? geoStop
      : findNearestStopBySchema(px, py);

  const x = snapped ? snapped.xschema : px;
  const y = snapped ? snapped.yschema : py;

  if (!userHalo) {
    userHalo = document.createElementNS(svg.namespaceURI, "circle");
    svg.appendChild(userHalo);
  }

  if (!userDot) {
    userDot = document.createElementNS(svg.namespaceURI, "circle");
    svg.appendChild(userDot);
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
      polyline.setAttribute("opacity", "1");
      polyline.setAttribute("stroke-width", String(INACTIVE_ROUTE_STROKE));
      if (casing) {
        casing.setAttribute("stroke", "#F3F4F6");
        casing.setAttribute("opacity", "1");
        casing.setAttribute("stroke-width", String(INACTIVE_ROUTE_STROKE + 1));
      }
    }
  }

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
