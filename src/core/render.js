import { stations } from "/data/rail/stations.js";
import { rail } from "/data/rail/rail.js";
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
const LAYOUT_DENSITY_TRIGGER_PX = 12;
const LAYOUT_PREF_KEY = "jronda_layout_pref";
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

export function consumeInitToasts() {
  const out = pendingInitToasts.slice();
  pendingInitToasts.length = 0;
  return out;
}

const railFallbackCount = mergedRail.filter((s) => s._fallbackFromStations).length;
if (railFallbackCount > 0) {
  emitToast(`Rail fallback active for ${railFallbackCount} stop records.`, "warn");
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

const routeLineRegistry = new Map();
const stopElementRegistry = new Map();
const poiElementRegistry = [];
const stationNameIndex = new Map();
const transferLineRegistry = [];
let includeBusLayer = true;
let selectedRailRouteId = null;
let selectedRailCategory = null;
let startStopBadgeId = null;
let endStopBadgeId = null;
let activeLayoutMode = "AUTO";

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

function buildSchematicLayout() {
  const railStops = allStations.filter((s) => getRouteMode(s.route_id) === "RAIL");
  const busStops = allStations.filter((s) => getRouteMode(s.route_id) !== "RAIL");
  for (const stop of allStations) {
    stop.layoutX = stop.xgeo;
    stop.layoutY = stop.ygeo;
  }
  if (!railStops.length) {
    for (const stop of allStations) {
      stop.xschema = stop.xgeo;
      stop.yschema = stop.ygeo;
    }
    return;
  }

  const userPref = (() => {
    try {
      return localStorage.getItem(LAYOUT_PREF_KEY) || "GEOGRAPHIC";
    } catch {
      return "GEOGRAPHIC";
    }
  })();
  if (userPref === "GEOGRAPHIC") {
    activeLayoutMode = "GEOGRAPHIC";
    for (const stop of allStations) {
      stop.xschema = stop.xgeo;
      stop.yschema = stop.ygeo;
    }
    emitToast("Map layout: geographic mode", "info");
    return;
  }

  // ---- Rail graph preparation ----
  activeLayoutMode = "SCHEMATIC";
  const railRouteEntries = Array.from(routes.entries()).filter(([routeId]) => getRouteMode(routeId) === "RAIL");
  const neighbors = new Map();
  const routeSetByStop = new Map();
  const stopById = new Map(railStops.map((s) => [String(s.stop_id), s]));
  const nameGroups = new Map();
  for (const s of railStops) {
    const sid = String(s.stop_id);
    if (!neighbors.has(sid)) neighbors.set(sid, new Set());
    if (!routeSetByStop.has(sid)) routeSetByStop.set(sid, new Set());
    routeSetByStop.get(sid).add(String(s.route_id));
    const nk = normalizeStopName(s.stop_name);
    if (!nameGroups.has(nk)) nameGroups.set(nk, []);
    nameGroups.get(nk).push(s);
  }
  for (const [, routeStops] of railRouteEntries) {
    for (let i = 0; i < routeStops.length - 1; i++) {
      const a = String(routeStops[i].stop_id);
      const b = String(routeStops[i + 1].stop_id);
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    }
  }

  const multiRouteByName = new Set();
  for (const [name, group] of nameGroups.entries()) {
    const r = new Set(group.map((s) => String(s.route_id)));
    if (r.size > 1) multiRouteByName.add(name);
  }

  const anchors = new Set();
  for (const s of railStops) {
    const sid = String(s.stop_id);
    const degree = (neighbors.get(sid) || new Set()).size;
    const isHub = degree >= 3 || multiRouteByName.has(normalizeStopName(s.stop_name));
    if (isHub) anchors.add(sid);
  }
  for (const [, routeStops] of railRouteEntries) {
    if (routeStops.length > 0) {
      anchors.add(String(routeStops[0].stop_id));
      anchors.add(String(routeStops[routeStops.length - 1].stop_id));
    }
  }
  const central = railStops
    .slice()
    .sort((a, b) => ((neighbors.get(String(b.stop_id)) || new Set()).size - (neighbors.get(String(a.stop_id)) || new Set()).size))[0];
  if (central) anchors.add(String(central.stop_id));
  const degreeByStop = new Map();
  for (const s of railStops) {
    degreeByStop.set(String(s.stop_id), (neighbors.get(String(s.stop_id)) || new Set()).size);
  }

  // Anchor coordinates start from geo, then frozen.
  for (const sid of anchors) {
    const s = stopById.get(sid);
    if (!s) continue;
    s.layoutX = s.xgeo;
    s.layoutY = s.ygeo;
  }

  const placed = new Set(Array.from(anchors));
  function put(stop, x, y) {
    if (placed.has(String(stop.stop_id)) && anchors.has(String(stop.stop_id))) return;
    if (placed.has(String(stop.stop_id))) {
      stop.layoutX = (stop.layoutX + x) * 0.5;
      stop.layoutY = (stop.layoutY + y) * 0.5;
    } else {
      stop.layoutX = x;
      stop.layoutY = y;
      placed.add(String(stop.stop_id));
    }
  }

  function makeAnchorPairKey(aStop, bStop, category = "") {
    const a = String(aStop.stop_id);
    const b = String(bStop.stop_id);
    const c = String(category || "").toUpperCase();
    return a < b ? `${c}|${a}|${b}` : `${c}|${b}|${a}`;
  }

  // Precompute hub-pair density so spacing is exaggerated where corridors are dense.
  const anchorPairDemand = new Map();
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
      const key = makeAnchorPairKey(a, b, routeStops[0]?.category);
      const segmentCount = i1 - i0;
      const current = anchorPairDemand.get(key) || 0;
      if (segmentCount > current) anchorPairDemand.set(key, segmentCount);
    }
  }

  // Segment layout between anchors with density-aware spacing.
  for (const [, routeStops] of railRouteEntries) {
    if (routeStops.length < 2) continue;
    const anchorIdx = [];
    for (let i = 0; i < routeStops.length; i++) {
      if (anchors.has(String(routeStops[i].stop_id))) anchorIdx.push(i);
    }
    if (!anchorIdx.length) {
      anchorIdx.push(0, routeStops.length - 1);
    }
    if (anchorIdx[0] !== 0) {
      anchorIdx.unshift(0);
    }
    if (anchorIdx[anchorIdx.length - 1] !== routeStops.length - 1) {
      anchorIdx.push(routeStops.length - 1);
    }

    for (let k = 0; k < anchorIdx.length - 1; k++) {
      const i0 = anchorIdx[k];
      const i1 = anchorIdx[k + 1];
      if (i1 <= i0) continue;
      const a = routeStops[i0];
      const b = routeStops[i1];
      const dxGeo = b.xgeo - a.xgeo;
      const dyGeo = b.ygeo - a.ygeo;
      const theta = snapAngle45(dxGeo, dyGeo);
      const segmentCount = i1 - i0;
      const corridorKey = makeAnchorPairKey(a, b, routeStops[0]?.category);
      const demand = anchorPairDemand.get(corridorKey) || segmentCount;
      const hubDegreeScore =
        (degreeByStop.get(String(a.stop_id)) || 1) +
        (degreeByStop.get(String(b.stop_id)) || 1);
      const densityScore = demand + hubDegreeScore * 0.45;
      const exaggeration = 1 + clamp((densityScore - 4) / 9, 0, 1.4);
      const localGap = NODE_SPACING * exaggeration;
      const totalLen = localGap * segmentCount;
      const ux = Math.cos(theta);
      const uy = Math.sin(theta);

      const ax = a.layoutX;
      const ay = a.layoutY;
      let bx = ax + ux * totalLen;
      let by = ay + uy * totalLen;
      const endIsAnchor = anchors.has(String(b.stop_id));
      if (endIsAnchor) {
        // Hub endpoint must remain exact so routes always arrive at the correct hub/connection.
        bx = b.layoutX;
        by = b.layoutY;
      } else {
        put(b, bx, by);
      }

      for (let i = i0 + 1; i < i1; i++) {
        const t = (i - i0) / segmentCount;
        put(routeStops[i], ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
  }

  // Hub docking: slight radial spread at hubs for incoming edges.
  for (const sid of anchors) {
    const hub = stopById.get(sid);
    if (!hub) continue;
    const nbs = Array.from(neighbors.get(sid) || []);
    if (nbs.length < 3) continue;
    const used = new Set();
    for (const nbId of nbs) {
      const nb = stopById.get(nbId);
      if (!nb) continue;
      const dx = nb.layoutX - hub.layoutX;
      const dy = nb.layoutY - hub.layoutY;
      let theta = snapAngle45(dx, dy);
      while (used.has(theta.toFixed(3))) theta += (Math.PI / 60);
      used.add(theta.toFixed(3));
      const dockR = Math.min(20, 8 + nbs.length * 1.2);
      if (!anchors.has(nbId)) {
        const curDx = nb.layoutX - hub.layoutX;
        const curDy = nb.layoutY - hub.layoutY;
        const curDist = Math.hypot(curDx, curDy);
        // Avoid collapsing long segments into a hub; only micro-adjust close neighbors.
        if (curDist < NODE_SPACING * 0.9) {
          const targetX = hub.layoutX + Math.cos(theta) * dockR;
          const targetY = hub.layoutY + Math.sin(theta) * dockR;
          nb.layoutX = nb.layoutX * 0.7 + targetX * 0.3;
          nb.layoutY = nb.layoutY * 0.7 + targetY * 0.3;
        }
      }
    }
  }

  // Strict rail schematic: snap corridor geometry to 8 directions (0,45,90,...).
  enforceRailCardinalGeometry(railRouteEntries, anchors);

  // Fit rail only.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of railStops) {
    minX = Math.min(minX, s.layoutX);
    maxX = Math.max(maxX, s.layoutX);
    minY = Math.min(minY, s.layoutY);
    maxY = Math.max(maxY, s.layoutY);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const innerW = svgWidth - MIN_MARGIN * 2;
  const innerH = svgHeight - MIN_MARGIN * 2;
  const railScale = Math.min(innerW / width, innerH / height);
  const tx = (svgWidth - width * railScale) / 2 - minX * railScale;
  const ty = (svgHeight - height * railScale) / 2 - minY * railScale;
  for (const s of railStops) {
    s.xschema = s.layoutX * railScale + tx;
    s.yschema = s.layoutY * railScale + ty;
  }

  // Build approximate geo->schema transform from rail bounds so bus overlay
  // stays coherent with the solved rail frame.
  let railGeoMinX = Infinity;
  let railGeoMaxX = -Infinity;
  let railGeoMinY = Infinity;
  let railGeoMaxY = -Infinity;
  for (const s of railStops) {
    railGeoMinX = Math.min(railGeoMinX, s.xgeo);
    railGeoMaxX = Math.max(railGeoMaxX, s.xgeo);
    railGeoMinY = Math.min(railGeoMinY, s.ygeo);
    railGeoMaxY = Math.max(railGeoMaxY, s.ygeo);
  }
  const geoW = Math.max(1, railGeoMaxX - railGeoMinX);
  const geoH = Math.max(1, railGeoMaxY - railGeoMinY);
  const schemaW = Math.max(1, maxX - minX);
  const schemaH = Math.max(1, maxY - minY);
  const geoToSchemaScale = Math.min(schemaW / geoW, schemaH / geoH) * railScale;
  const geoToSchemaTx = tx - railGeoMinX * geoToSchemaScale + minX * railScale;
  const geoToSchemaTy = ty - railGeoMinY * geoToSchemaScale + minY * railScale;
  function geoToRailSchema(x, y) {
    return [
      x * geoToSchemaScale + geoToSchemaTx,
      y * geoToSchemaScale + geoToSchemaTy,
    ];
  }

  // ---- Bus overlay (cannot move rail) ----
  const railHubByName = new Map();
  for (const s of railStops) {
    const name = normalizeStopName(s.stop_name);
    if (!railHubByName.has(name)) railHubByName.set(name, s);
  }
  const busRouteEntries = Array.from(routes.entries()).filter(([routeId]) => getRouteMode(routeId) !== "RAIL");
  const busPlaced = new Set();
  for (const [, routeStops] of busRouteEntries) {
    for (let i = 0; i < routeStops.length; i++) {
      const cur = routeStops[i];
      const sid = String(cur.stop_id);
      if (busPlaced.has(sid)) continue;
      const hubCandidate = railHubByName.get(normalizeStopName(cur.stop_name));
      if (hubCandidate) {
        cur.xschema = hubCandidate.xschema;
        cur.yschema = hubCandidate.yschema;
        busPlaced.add(sid);
        continue;
      }
      if (i === 0) {
        const [sx, sy] = geoToRailSchema(cur.xgeo, cur.ygeo);
        cur.xschema = sx;
        cur.yschema = sy;
        busPlaced.add(sid);
        continue;
      }
      const prev = routeStops[i - 1];
      const dx = cur.xgeo - prev.xgeo;
      const dy = cur.ygeo - prev.ygeo;
      const theta = snapAngle45(dx, dy);
      const geoDist = Math.hypot(dx, dy);
      const gap = Math.max(16, Math.min(36, geoDist * geoToSchemaScale * 0.95));
      const prevX = Number.isFinite(prev.xschema) ? prev.xschema : geoToRailSchema(prev.xgeo, prev.ygeo)[0];
      const prevY = Number.isFinite(prev.yschema) ? prev.yschema : geoToRailSchema(prev.xgeo, prev.ygeo)[1];
      cur.xschema = prevX + Math.cos(theta) * gap;
      cur.yschema = prevY + Math.sin(theta) * gap;
      busPlaced.add(sid);
    }
  }

  // Safety pass: keep strict cardinal geometry even when dense.
  let crowded = 0;
  for (let i = 0; i < railStops.length; i++) {
    const a = railStops[i];
    for (let j = i + 1; j < railStops.length; j++) {
      const b = railStops[j];
      if (normalizeStopName(a.stop_name) === normalizeStopName(b.stop_name)) continue;
      if (Math.hypot(a.xschema - b.xschema, a.yschema - b.yschema) < LAYOUT_DENSITY_TRIGGER_PX) {
        crowded++;
      }
    }
  }
  if (crowded > Math.max(16, railStops.length * 0.12)) {
    emitToast("Crowded core detected; keeping strict 8-direction rail geometry.", "warn");
  }

  emitToast("Map layout: rail structural solver + bus overlay", "info");
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

const schemaStopIndex = buildSpatialIndex(
  allStations,
  (s) => s.xschema,
  (s) => s.yschema,
  SCHEMA_BUCKET_SIZE
);
const geoStopIndex = buildSpatialIndex(
  allStations,
  (s) => s.xgeo,
  (s) => s.ygeo,
  GEO_BUCKET_SIZE
);
const poiSchemaIndex = buildSpatialIndex(
  poiList,
  (p) => p.xschema,
  (p) => p.yschema,
  SCHEMA_BUCKET_SIZE
);
const interchangeCandidates = allStations.filter(
  (s) => s.isInterchange || s.isConnecting
);

function makeSegmentKey(a, b) {
  const aId = canonicalStopKey(a);
  const bId = canonicalStopKey(b);
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function getOverlapRanges(ra, rb) {
  const indexA = new Map();
  for (let i = 0; i < ra.length; i++) {
    indexA.set(canonicalStopKey(ra[i]), i);
  }
  const commons = [];
  for (let j = 0; j < rb.length; j++) {
    const key = canonicalStopKey(rb[j]);
    if (indexA.has(key)) {
      commons.push({ key, ia: indexA.get(key), ib: j });
    }
  }
  if (commons.length < 2) return [];
  const ranges = [];
  for (let i = 0; i < commons.length - 1; i++) {
    const s = commons[i];
    const e = commons[i + 1];
    if (s.ia >= e.ia || s.ib >= e.ib) continue;
    ranges.push({
      aStart: s.ia,
      aEnd: e.ia,
      bStart: s.ib,
      bEnd: e.ib,
      startKey: s.key,
      endKey: e.key,
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
        const leftSpan = range.aEnd - range.aStart;
        const rightSpan = range.bEnd - range.bStart;
        const denseIsLeft = leftSpan >= rightSpan;
        const dense = denseIsLeft ? left : right;
        const sparse = denseIsLeft ? right : left;
        const dStart = denseIsLeft ? range.aStart : range.bStart;
        const dEnd = denseIsLeft ? range.aEnd : range.bEnd;
        const sStart = denseIsLeft ? range.bStart : range.aStart;
        const sEnd = denseIsLeft ? range.bEnd : range.aEnd;
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
  if (activeLayoutMode === "GEOGRAPHIC") {
    for (const [routeId, stops] of routes.entries()) {
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        if (!a || !b) continue;
        if (!Number.isFinite(a.xschema) || !Number.isFinite(b.xschema)) continue;
        const exactKey = makeSegmentKey(a, b);
        if (!exactUsage.has(exactKey)) exactUsage.set(exactKey, new Set());
        exactUsage.get(exactKey).add(String(routeId));
      }
    }
    const out = new Map();
    for (const [k, v] of exactUsage.entries()) out.set(k, Array.from(v).sort());
    return out;
  }
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

const sharedSegmentOrder = buildSharedSegmentOrder();
const railCorridorOverrides = activeLayoutMode === "GEOGRAPHIC"
  ? new Map()
  : buildRailCorridorOverrides();

function getRouteStopPoint(routeId, stop) {
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
  const spacing = activeLayoutMode === "GEOGRAPHIC" ? 2.5 : ROUTE_OFFSET;
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

function curvePathFromPoints(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLen = Math.hypot(dx, dy);
    const theta = snapAngle45(dx, dy);
    const cLen = Math.min(18, segLen * 0.45);
    const c1x = p0.x + Math.cos(theta) * cLen;
    const c1y = p0.y + Math.sin(theta) * cLen;
    const c2x = p1.x - Math.cos(theta) * cLen;
    const c2y = p1.y - Math.sin(theta) * cLen;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

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
  ([routeA], [routeB]) => routeLayerWeight(routeA) - routeLayerWeight(routeB)
);

for (const [route_id, stops] of routeEntries) {
  const baseColor = getRouteColor(route_id, false, stops[0]?.route_color ?? null).color;
  const mode = getRouteMode(route_id);
  const routePoints = getOffsetPolyline(route_id, stops);
  const isLoopBus = mode !== "RAIL" && stops.some((s) => Boolean(s.isLoop));
  const routePathD = isLoopBus
    ? ""
    : (mode === "RAIL"
      ? curvePathFromPoints(routePoints)
      : polylinePathFromPoints(routePoints));
  const railPriority = mode === "RAIL" && stops.length >= 26;
  const strokeWidth = mode === "RAIL"
    ? (railPriority ? PRIMARY_RAIL_STROKE : SECONDARY_RAIL_STROKE)
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
    const capsule = capsulePathFromStops(route_id, stops);
    casing.setAttribute("d", capsule.d);
    casing.setAttribute("transform", capsule.transform);
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
    const capsule = capsulePathFromStops(route_id, stops);
    path.setAttribute("d", capsule.d);
    path.setAttribute("transform", capsule.transform);
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
    category: String(stops[0]?.category ?? ""),
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
  if (!stops.length) continue;
  terminalStopIds.add(String(stops[0].stop_id));
  terminalStopIds.add(String(stops[stops.length - 1].stop_id));
}

for (const stop of allStations) {
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

  if (style.shape === "square") {
    const sq = document.createElementNS(svg.namespaceURI, "rect");
    sq.setAttribute("x", String(p.xschema - 2.5));
    sq.setAttribute("y", String(p.yschema - 2.5));
    sq.setAttribute("width", "5");
    sq.setAttribute("height", "5");
    sq.setAttribute("fill", style.color);
    sq.setAttribute("stroke", "#FFFFFF");
    sq.setAttribute("stroke-width", "1");
    g.appendChild(sq);
  } else if (style.shape === "diamond") {
    const d = document.createElementNS(svg.namespaceURI, "path");
    d.setAttribute("d", `M ${p.xschema} ${p.yschema - 3} L ${p.xschema + 3} ${p.yschema} L ${p.xschema} ${p.yschema + 3} L ${p.xschema - 3} ${p.yschema} Z`);
    d.setAttribute("fill", style.color);
    d.setAttribute("stroke", "#FFFFFF");
    d.setAttribute("stroke-width", "1");
    g.appendChild(d);
  } else if (style.shape === "triangle") {
    const t = document.createElementNS(svg.namespaceURI, "path");
    t.setAttribute("d", `M ${p.xschema} ${p.yschema - 3.4} L ${p.xschema + 3.2} ${p.yschema + 2.6} L ${p.xschema - 3.2} ${p.yschema + 2.6} Z`);
    t.setAttribute("fill", style.color);
    t.setAttribute("stroke", "#FFFFFF");
    t.setAttribute("stroke-width", "1");
    g.appendChild(t);
  } else {
    const dot = document.createElementNS(svg.namespaceURI, "circle");
    dot.setAttribute("cx", p.xschema);
    dot.setAttribute("cy", p.yschema);
    dot.setAttribute("r", "2.6");
    dot.setAttribute("fill", style.color);
    dot.setAttribute("stroke", "#FFFFFF");
    dot.setAttribute("stroke-width", "1");
    g.appendChild(dot);
  }

  const title = document.createElementNS(svg.namespaceURI, "title");
  const nearName = p.nearestStopName || "Unknown";
  const nearMeters = Number.isFinite(p.nearestDistanceMeters)
    ? ` (${p.nearestDistanceMeters}m)`
    : "";
  title.textContent = `${p.name}\n${p.category}\nNearest: ${nearName}${nearMeters}`;
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
    .map((s) => ({ s, p: getRouteStopPoint(String(s.route_id || ""), s) }))
    .filter((x) => Number.isFinite(x.p.x) && Number.isFinite(x.p.y))
    .map((x) => ({ x: x.p.x, y: x.p.y }));
  if (!pts.length) return "";
  const sample = stops.find((s) => s && s.route_id != null);
  const mode = sample ? getRouteMode(sample.route_id) : "RAIL";
  return mode === "RAIL" ? curvePathFromPoints(pts) : polylinePathFromPoints(pts);
}

// ================= TOUCH INTERACTION =================
let activeTraceLine = null;
let traceSession = null;
let traceLastPoint = null;

const stationTooltip = document.createElement("div");
stationTooltip.id = "station-tooltip";
let tooltipStopId = null;
let floatingPanelTimer = null;
let lastGpsTapAt = 0;
Object.assign(stationTooltip.style, {
  position: "fixed",
  zIndex: "3000",
  minWidth: "220px",
  maxWidth: "300px",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #D6DEE8",
  background: "rgba(255,255,255,0.98)",
  color: "#1D2B3A",
  fontFamily: "sans-serif",
  fontSize: "12px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
  pointerEvents: "auto",
  display: "none",
});
document.body.appendChild(stationTooltip);

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
  const candidates = nearby.length ? nearby : allStations;
  for (const stop of candidates) {
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
  const key = String(stop.stop_name || "").trim().toLowerCase();
  const siblings = stationNameIndex.get(key) || [stop];
  const railRoutes = [];
  const busRoutes = [];
  const seenRail = new Set();
  const seenBus = new Set();
  const nearbyPoi = findNearbyPoiForStop(stop, 1400, 4);

  for (const s of siblings) {
    const routeId = String(s.route_id);
    const routeLabel = getServiceLabel(s, getRouteMode(routeId));
    const mode = getRouteMode(routeId);
    if (mode === "RAIL") {
      if (!seenRail.has(routeLabel)) {
        seenRail.add(routeLabel);
        railRoutes.push(routeLabel);
      }
    } else if (!seenBus.has(routeLabel)) {
      seenBus.add(routeLabel);
      busRoutes.push(routeLabel);
    }
  }

  tooltipStopId = String(stop.stop_id);
  const primaryLabel = getServiceLabel(stop, getRouteMode(stop.route_id));
  function poiIcon(category) {
    const { color, shape } = getPoiCategoryStyle(category);
    if (shape === "square") return `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="${color}" stroke="#fff" stroke-width="1"/></svg>`;
    if (shape === "diamond") return `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1 L9 5 L5 9 L1 5 Z" fill="${color}" stroke="#fff" stroke-width="1"/></svg>`;
    if (shape === "triangle") return `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1 L9 9 L1 9 Z" fill="${color}" stroke="#fff" stroke-width="1"/></svg>`;
    return `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="${color}" stroke="#fff" stroke-width="1"/></svg>`;
  }
  stationTooltip.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${stop.stop_name || stop.stop_id}</div>
    <div style="margin-bottom:2px;">Primary line: <b>${primaryLabel}</b> (${getRouteMode(stop.route_id)})</div>
    <div style="margin-bottom:2px;">Rail lines: ${railRoutes.join(", ") || "None"}</div>
    <div>Bus lines: ${busRoutes.join(", ") || "None"}</div>
    <div style="margin-top:4px;">Nearby POI: ${
      nearbyPoi.length
        ? nearbyPoi.map((p) => `${poiIcon(p.category)} ${p.name} (${p.category}, ${p.meters}m)`).join("<br/>")
        : "None in 1.4km"
    }</div>
    <div style="margin-top:8px;display:flex;gap:8px;">
      <button id="jronda-start-here" type="button" aria-label="Set start here" style="border:1px solid #0d6efd;background:#0d6efd;color:#fff;border-radius:6px;padding:4px 8px;cursor:pointer;">Start here</button>
      <button id="jronda-end-here" type="button" aria-label="Set end here" style="border:1px solid #495057;background:#fff;color:#212529;border-radius:6px;padding:4px 8px;cursor:pointer;">End here</button>
    </div>
  `;
  stationTooltip.style.left = `${Math.min(window.innerWidth - 320, clientX + 16)}px`;
  stationTooltip.style.top = `${Math.min(window.innerHeight - 140, clientY + 16)}px`;
  stationTooltip.style.display = "block";
  armFloatingPanelTimeout();

  const startBtn = document.getElementById("jronda-start-here");
  const endBtn = document.getElementById("jronda-end-here");
  if (startBtn) {
    startBtn.onclick = () => {
      window.dispatchEvent(new CustomEvent("jronda:set-start", {
        detail: { stopId: tooltipStopId },
      }));
    };
  }
  if (endBtn) {
    endBtn.onclick = () => {
      window.dispatchEvent(new CustomEvent("jronda:set-end", {
        detail: { stopId: tooltipStopId },
      }));
    };
  }
}

async function verifyKioskPinViaPrompt() {
  const pin = window.prompt("Enter kiosk passkey:", "") || "";
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
  const nearest = findNearbyRailStopsForPoi(poi, 1800, 3);
  const nearestLabel = nearest.length
    ? nearest.map((n) => `${n.stop.stop_name} (${n.meters}m)`).join("<br/>")
    : "No nearby rail station";
  const nearestStopId = nearest[0] ? String(nearest[0].stop.stop_id) : "";

  tooltipStopId = null;
  stationTooltip.innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${poi.name}</div>
    <div style="margin-bottom:2px;">POI category: <b>${poi.category || "POI"}</b></div>
    <div>Nearest rail: ${nearestLabel}</div>
    <div style="margin-top:8px;display:flex;gap:8px;">
      <button id="jronda-end-here-poi" type="button" aria-label="Set destination near this POI" style="border:1px solid #495057;background:#fff;color:#212529;border-radius:6px;padding:4px 8px;cursor:pointer;">End here</button>
    </div>
  `;
  stationTooltip.style.left = `${Math.min(window.innerWidth - 320, clientX + 16)}px`;
  stationTooltip.style.top = `${Math.min(window.innerHeight - 160, clientY + 16)}px`;
  stationTooltip.style.display = "block";
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
    <div style="font-weight:700;font-size:13px;margin-bottom:4px;">You are here</div>
    <div style="margin-bottom:4px;">${fixedStop ? `Fixed kiosk station: <b>${fixedStop.stop_name}</b>` : "GPS is active."}</div>
    ${advanced ? `
      <div style="margin-top:6px;">
        <input id="jronda-gps-station-search" type="text" placeholder="Search rail station" style="width:100%;box-sizing:border-box;border:1px solid #CBD5E1;border-radius:6px;padding:6px 8px;" />
      </div>
      <div style="margin-top:6px;display:flex;gap:8px;">
        <button id="jronda-gps-set-station" type="button" style="border:1px solid #0d6efd;background:#0d6efd;color:#fff;border-radius:6px;padding:4px 8px;cursor:pointer;">Set kiosk station</button>
        <button id="jronda-gps-clear-station" type="button" style="border:1px solid #495057;background:#fff;color:#212529;border-radius:6px;padding:4px 8px;cursor:pointer;">Clear fixed station</button>
      </div>
    ` : `<div style="margin-top:6px;font-size:11px;color:#334155;">Tap "You are here" again for station lock controls.</div>`}
  `;
  stationTooltip.style.left = `${Math.min(window.innerWidth - 320, clientX + 16)}px`;
  stationTooltip.style.top = `${Math.min(window.innerHeight - 180, clientY + 16)}px`;
  stationTooltip.style.display = "block";
  armFloatingPanelTimeout();

  if (advanced) {
    const setBtn = document.getElementById("jronda-gps-set-station");
    const clearBtn = document.getElementById("jronda-gps-clear-station");
    const search = document.getElementById("jronda-gps-station-search");
    if (setBtn && search) {
      setBtn.onclick = async () => {
        const ok = await verifyKioskPinViaPrompt();
        if (!ok) {
          emitToast("Invalid passkey for kiosk station update.", "warn");
          return;
        }
        const target = findRailStopBySearch(search.value || "");
        if (!target) {
          emitToast("Station not found for kiosk lock.", "warn");
          return;
        }
        localStorage.setItem(FIXED_KIOSK_STOP_KEY, String(target.stop_id));
        userLocation = { lat: target.stop_lat, lon: target.stop_lon };
        drawUserMarker();
        emitToast(`Kiosk station set to ${target.stop_name}.`, "info");
      };
    }
    if (clearBtn) {
      clearBtn.onclick = async () => {
        const ok = await verifyKioskPinViaPrompt();
        if (!ok) {
          emitToast("Invalid passkey for kiosk station clear.", "warn");
          return;
        }
        localStorage.removeItem(FIXED_KIOSK_STOP_KEY);
        emitToast("Fixed kiosk station cleared.", "info");
      };
    }
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

svg.addEventListener("pointerdown", (evt) => {
  const p = toSvgPoint(evt);
  const startStop = findNearestStopWithin(p.x, p.y);
  traceSession = {
    pointerId: evt.pointerId,
    startX: p.x,
    startY: p.y,
    moved: false,
    startStop,
  };
  if (startStop) {
    startTraceLine(startStop.xschema, startStop.yschema);
  }
  svg.setPointerCapture(evt.pointerId);
});

svg.addEventListener("pointermove", (evt) => {
  if (!traceSession || evt.pointerId !== traceSession.pointerId) return;
  const p = toSvgPoint(evt);
  const moveDist = Math.hypot(p.x - traceSession.startX, p.y - traceSession.startY);
  if (moveDist > 8) traceSession.moved = true;
  if (traceSession.startStop) appendTracePoint(p.x, p.y);
});

function completeTrace(evt) {
  if (!traceSession || evt.pointerId !== traceSession.pointerId) return;
  const p = toSvgPoint(evt);
  const endStop = findNearestStopWithin(p.x, p.y);
  const endPoi = endStop ? null : findNearestPoiWithin(p.x, p.y);
  const gpsNear =
    userDot &&
    Number.isFinite(Number(userDot.getAttribute("cx"))) &&
    Number.isFinite(Number(userDot.getAttribute("cy"))) &&
    Math.hypot(
      Number(userDot.getAttribute("cx")) - p.x,
      Number(userDot.getAttribute("cy")) - p.y
    ) <= 16;

  if (traceSession.startStop && traceSession.moved && endStop) {
    const startId = String(traceSession.startStop.stop_id);
    const endId = String(endStop.stop_id);
    if (startId !== endId) {
      window.dispatchEvent(new CustomEvent("jronda:trace-route", {
        detail: { startId, endId },
      }));
      showStationTooltip(endStop, evt.clientX, evt.clientY);
    } else {
      showStationTooltip(endStop, evt.clientX, evt.clientY);
      dispatchStationInfo(endStop, "tap");
    }
  } else if (endStop) {
    showStationTooltip(endStop, evt.clientX, evt.clientY);
    dispatchStationInfo(endStop, "tap");
  } else if (endPoi) {
    showPoiTooltip(endPoi, evt.clientX, evt.clientY);
  } else if (gpsNear) {
    const now = Date.now();
    const advanced = now - lastGpsTapAt < 700;
    lastGpsTapAt = now;
    showGpsTooltip(evt.clientX, evt.clientY, advanced);
  } else if (!traceSession.moved) {
    hideStationTooltip();
  }

  finishTraceLine();
  traceSession = null;
}

svg.addEventListener("pointerup", completeTrace);
svg.addEventListener("pointercancel", () => {
  finishTraceLine();
  traceSession = null;
});

if (typeof window !== "undefined") {
  window.addEventListener("jronda:hide-floating-panels", () => {
    hideStationTooltip();
  });
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
    if (selectedRailRouteId && isRailMode(meta.mode) && routeId !== selectedRailRouteId) {
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
  }

  for (const entries of stopElementRegistry.values()) {
    for (const entry of entries) {
      let visible = true;
      if (!includeBusLayer && entry.mode === "BUS") {
        visible = false;
      }
      if (selectedRailRouteId && entry.mode === "RAIL" && entry.routeId !== selectedRailRouteId) {
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
  const candidates = nearby.length ? nearby : allStations;
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
  const candidates = nearby.length ? nearby : allStations;

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
  const candidates = nearby.length ? nearby : allStations;
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
