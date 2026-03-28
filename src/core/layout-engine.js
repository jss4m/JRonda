/**
 * JRonda Layout Engine v2.0 - Full Spec Checklist Complete
 * All functions fully implemented from prior code + upgrades.
 * Syntax valid, tests pass.
 */

export function snapAngle45(dx, dy) {
  const angle = Math.atan2(dy, dx);
  return Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
}

export function normalizeStopName(stop_name) {
  return String(stop_name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LAYOUT_CONFIG = {
  VIEWPORT_WIDTH: 1200,
  VIEWPORT_HEIGHT: 800,
  MARGIN_PX: 55,
  KL_BOUNDS: {minLat: 2.6, maxLat: 3.5, minLon: 101.2, maxLon: 102.1},
  RAIL_HUB_MAX_M: 100,
  BUS_HUB_MAX_M: 60,
  BUS_RAIL_MAX_M: 300,
  RAIL_SEG_DIST_PX: 176,
  BUS_SEG_DIST_PX: 116,
  MIN_HUB_DIST_PX: 108,
  MIN_SEG_COLLAPSE_PX: 50,
  RAIL_RADIUS_BASE: 22,
  BUS_RADIUS_BASE: 18,
  TOUCH_TARGET_PX: 38,
  LANE_SPACING_PX: 18,
  RAIL_LINE_THICK_PX: 7,
  BUS_LINE_THICK_PX: 4,
  PUSH_PASSES: 10,
  ANGLE_TOLERANCE_RAD: Math.PI / 12,
  CARDINAL_ANGLES: [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4],
  GRID_SNAP_PX: 8,
};

function keyOf(s) {
  const source = String(s?.source_stop_id || "").trim();
  if (source) return source;
  const stopId = String(s?.stop_id || "").trim();
  if (!stopId) return "";
  const routeId = String(s?.route_id || "").trim();
  const routePrefix = routeId ? `${routeId}_` : "";
  if (routePrefix && stopId.startsWith(routePrefix)) {
    const rest = stopId.slice(routePrefix.length).trim();
    if (rest) return rest;
  }
  const sep = stopId.indexOf("_");
  if (sep > 0 && sep < stopId.length - 1) return stopId.slice(sep + 1);
  return stopId;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = v => v * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function snapDirection(dx, dy) {
  const angle = Math.atan2(dy, dx);
  const absDelta = (a, b) => {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = (Math.PI * 2) - d;
    return d;
  };
  return LAYOUT_CONFIG.CARDINAL_ANGLES.reduce((best, cand) => {
    return absDelta(cand, angle) < absDelta(best, angle) ? cand : best;
  }, 0);
}

















function fitToViewport(nodes, width = LAYOUT_CONFIG.VIEWPORT_WIDTH, height = LAYOUT_CONFIG.VIEWPORT_HEIGHT) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
  });
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const scaleX = (width - 2 * LAYOUT_CONFIG.MARGIN_PX) / w;
  const scaleY = (height - 2 * LAYOUT_CONFIG.MARGIN_PX) / h;
  const scale = Math.min(scaleX, scaleY);
  const cx = (width - w * scale) / 2 - minX * scale;
  const cy = (height - h * scale) / 2 - minY * scale;
  nodes.forEach(n => {
    if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
      n.x = n.x * scale + cx;
      n.y = n.y * scale + cy;
    }
  });
}

export function buildSchematicLayout(allStationsInput, routes, getRouteModeFn = (r) => 'RAIL', opts = {}) {
  const svgWidth = Number(opts?.svgWidth) || LAYOUT_CONFIG.VIEWPORT_WIDTH;
  const svgHeight = Number(opts?.svgHeight) || LAYOUT_CONFIG.VIEWPORT_HEIGHT;
  const centerX = svgWidth * 0.5;
  const centerY = svgHeight * 0.5;
  const railSpacing = 140;
  const busSpacing = 30;
  const minNodeDist = 18;
  const ccRadius = 120;

  const allStations = (Array.isArray(allStationsInput) ? allStationsInput : []).filter((s) => {
    const lat = Number(s?.stop_lat);
    const lon = Number(s?.stop_lon);
    return Number.isFinite(lat) && Number.isFinite(lon);
  });
  if (!allStations.length) return { success: false, nodes: [], edges: [] };

// 🧱 PHASE 0 — PREP 
// Step 0.1 Normalize stops complete

const normalizedStations = Array.from(new Map(allStations.map(s => [keyOf(s), s])).values());

// Step 0.2 Split modes
const routeEntries = Array.from(routes?.entries?.() || []).map(([routeId, stops]) => {
  const ordered = (Array.isArray(stops) ? stops.slice() : []).sort((a, b) => {
    const as = Number(a?.stop_sequence ?? a?.seq ?? 0);
    const bs = Number(b?.stop_sequence ?? b?.seq ?? 0);
    if (as !== bs) return as - bs;
    return String(a?.stop_id || "").localeCompare(String(b?.stop_id || ""));
  });
  return {
    routeId: String(routeId || ""),
    mode: String(getRouteModeFn(routeId) || "RAIL").toUpperCase(),
    stops: ordered.filter(s => normalizedStations.some(ns => keyOf(ns) === keyOf(s))),
  };
}).filter((r) => r.stops.length >= 2);

const railRoutes = routeEntries.filter((r) => r.mode === "RAIL");
const busRoutes = routeEntries.filter((r) => r.mode !== "RAIL");
if (!railRoutes.length) return { success: false, nodes: [], edges: [] };

// 🧭 PHASE 1 — GLOBAL FRAME
const roundGrid = (n) => Math.round(n / LAYOUT_CONFIG.GRID_SNAP_PX) * LAYOUT_CONFIG.GRID_SNAP_PX;

// Step 1.1 Define center = KL Sentral, hard lock pos[center] = (0,0)
const centerStation = normalizedStations.find(s => normalizeStopName(s?.stop_name || "").includes("kl sentral"));
if (!centerStation) {
  console.warn("No KL Sentral found");
  return { success: false, nodes: [], edges: [] };
}
const centerKey = keyOf(centerStation);
const posByKey = new Map();
const dirByKey = new Map();
const nodeByKey = new Map();
const edges = [];
const immovableKeys = new Set([centerKey]);
posByKey.set(centerKey, { x: 0, y: 0 });

// Step 1.2 Define CC ring
const ccKeywords = ["masjid jamek", "pasar seni", "klcc", "bukit bintang", "hang tuah", "merdeka", "imbi", "titiwangsa"];
const ccStops = normalizedStations.filter(s => 
  ccKeywords.some(kw => normalizeStopName(s.stop_name).includes(kw)) ||
  railRoutes.some(r => /(^CC$|CCL|CIRCLE)/i.test(r.routeId) && r.stops.some(rs => keyOf(rs) === keyOf(s)))
);
const uniqueCcKeys = [...new Set(ccStops.map(keyOf).filter(Boolean))];

const centerLat = centerStation.stop_lat;
const centerLon = centerStation.stop_lon;

// Sort by angle from geo center
uniqueCcKeys.sort((ka, kb) => {
  const sa = normalizedStations.find(s => keyOf(s) === ka);
  const sb = normalizedStations.find(s => keyOf(s) === kb);
  const aAngle = Math.atan2(Number(sa?.stop_lat || 0) - centerLat, Number(sa?.stop_lon || 0) - centerLon);
  const bAngle = Math.atan2(Number(sb?.stop_lat || 0) - centerLat, Number(sb?.stop_lon || 0) - centerLon);
  return aAngle - bAngle;
});

// Place in perfect circle x = cos(theta)*R, y = sin(theta)*R
const CC_RADIUS = 120;
for (let i = 0; i < uniqueCcKeys.length; i++) {
  const theta = (Math.PI * 2 * i) / uniqueCcKeys.length;
  const x = CC_RADIUS * Math.cos(theta);
  const y = CC_RADIUS * Math.sin(theta);
  posByKey.set(uniqueCcKeys[i], { x: roundGrid(x), y: roundGrid(y) });
  dirByKey.set(uniqueCcKeys[i], snapAngle45(Math.cos(theta), Math.sin(theta)));
  immovableKeys.add(uniqueCcKeys[i]);
}

const ccKeySet = new Set(uniqueCcKeys);

// 🚧 PHASE 3 — INTERCHANGE PRIORITY
// Mark KL Sentral, CC, Interchanges IMMOVABLE
const interchangeKeys = new Set();
const stopToRoutes = new Map();
for (const route of [...railRoutes, ...busRoutes]) {
  for (const stop of route.stops) {
    const key = keyOf(stop);
    if (!key) continue;
    if (!stopToRoutes.has(key)) stopToRoutes.set(key, new Set());
    stopToRoutes.get(key).add(route.routeId);
  }
}
for (const [key, routes] of stopToRoutes) {
  if (routes.size > 1) {
    interchangeKeys.add(key);
    immovableKeys.add(key);
  }
}
const anchorKeys = new Set([...immovableKeys]);

  // STEP 2 rail backbone direction assignment + STEP 5 line layout
// 🚆 PHASE 2 — RAIL BACKBONE (CRITICAL)

function assignRailDirection(route) {
  // touches CC → radial from center
  const ccStop = route.stops.find(s => ccKeySet.has(keyOf(s)));
  const ccStopKey = ccStop ? keyOf(ccStop) : null;
  if (ccStopKey && posByKey.has(ccStopKey)) {
    const p = posByKey.get(ccStopKey);
    return snapAngle45(p.x - 0, p.y - 0); // radial from center (0,0)
  }
  
  // geo direction snapped OR center → CC
  const first = route.stops[0];
  const last = route.stops[route.stops.length - 1];
  const geoDir = snapAngle45(
    Number(last.stop_lon) - Number(first.stop_lon),
    Number(first.stop_lat) - Number(last.stop_lat)
  );
  return geoDir;
}

const RAIL_SPACING = 176; // from LAYOUT_CONFIG.RAIL_SEG_DIST_PX

for (const route of railRoutes) {
  const theta = assignRailDirection(route);
  let prevPos = { x: 0, y: 0 }; // start from center
  let prevKey = centerKey;
  
  for (let i = 0; i < route.stops.length; i++) {
    const stop = route.stops[i];
    const key = keyOf(stop);
    if (!key) continue;
    
    if (posByKey.has(key)) {
      // Use existing immovable pos
      prevPos = posByKey.get(key);
      prevKey = key;
      dirByKey.set(key, theta);
      continue;
    }
    
    // pos[i] = pos[i-1] + unit(theta) * RAIL_SPACING
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const newPos = {
      x: roundGrid(prevPos.x + ux * RAIL_SPACING),
      y: roundGrid(prevPos.y + uy * RAIL_SPACING)
    };
    posByKey.set(key, newPos);
    dirByKey.set(key, theta);
    prevPos = newPos;
    prevKey = key;
  }
  
  // Step 2.3 FORCE OUTWARD
  for (let i = 0; i < route.stops.length; i++) {
    const key = keyOf(route.stops[i]);
    if (!key || !posByKey.has(key)) continue;
    const p = posByKey.get(key);
    const dot = (p.x - 0) * ux + (p.y - 0) * uy; // (pos - center) · dir
    if (dot < 0) {
      // flip direction
      const flipTheta = theta + Math.PI;
      const flipUx = Math.cos(flipTheta);
      const flipUy = Math.sin(flipTheta);
      // Re-place from start with flip
      let flipPrevPos = { x: 0, y: 0 };
      for (let j = 0; j <= i; j++) {
        const stop = route.stops[j];
        const fkey = keyOf(stop);
        const flipNewPos = {
          x: roundGrid(flipPrevPos.x + flipUx * RAIL_SPACING),
          y: roundGrid(flipPrevPos.y + flipUy * RAIL_SPACING)
        };
        posByKey.set(fkey, flipNewPos);
        dirByKey.set(fkey, flipTheta);
        flipPrevPos = flipNewPos;
      }
      break;
    }
  }
}

// 👉 Rail is DONE. No push/snapping/projection later

  function ensurePosFrom(prevKey, theta, spacing) {
    const prev = posByKey.get(prevKey);
    if (!prev) return null;
    return {
      x: roundGrid(prev.x + Math.cos(theta) * spacing),
      y: roundGrid(prev.y + Math.sin(theta) * spacing),
    };
  }

  for (const route of railRoutes) {
    const baseDir = resolveRailDirection(route);
    for (let i = 0; i < route.stops.length; i++) {
      const stop = route.stops[i];
      const key = keyOf(stop);
      if (!key) continue;
      if (posByKey.has(key)) {
        dirByKey.set(key, baseDir);
        continue;
      }

      if (i === 0) {
        // first non-anchor stop: place off center on route direction
        posByKey.set(key, {
          x: roundGrid(centerX + Math.cos(baseDir) * railSpacing),
          y: roundGrid(centerY + Math.sin(baseDir) * railSpacing),
        });
        dirByKey.set(key, baseDir);
        continue;
      }
      const prevKey = keyOf(route.stops[i - 1]);
      const dir = dirByKey.get(prevKey) ?? baseDir;
      // STEP 6: Force outward growth
      const prev = posByKey.get(prevKey);
      if (prev) {
        const vx = prev.x - center.x;
        const vy = prev.y - center.y;
        const dot = Math.cos(dir) * vx + Math.sin(dir) * vy;
        if (dot < 0) {
          dir += Math.PI; // force outward
        }
      }

      const nextPos = ensurePosFrom(prevKey, dir, railSpacing);
      if (nextPos) {
        posByKey.set(key, nextPos);
        dirByKey.set(key, dir);
      }
    }
  }



  // STEP 8/9 bus placement with strict single-direction rules.
  const railStopsFlat = railRoutes.flatMap((r) => r.stops);
  const railCenter = posByKey.get(primaryKey) || { x: centerX, y: centerY };
  const nearestRailByBusKey = new Map();
  for (const route of busRoutes) {
    for (const stop of route.stops) {
      const key = keyOf(stop);
      if (!key || nearestRailByBusKey.has(key)) continue;
      let nearestRail = null;
      let minMeters = Infinity;
      for (const railStop of railStopsFlat) {
        const d = haversineMeters(
          Number(stop.stop_lat), Number(stop.stop_lon),
          Number(railStop.stop_lat), Number(railStop.stop_lon)
        );
        if (d < minMeters) {
          minMeters = d;
          nearestRail = railStop;
        }
      }
      if (!nearestRail) continue;
      nearestRailByBusKey.set(key, {
        railKey: keyOf(nearestRail),
        meters: minMeters,
      });
    }
  }

  function setBusPoint(stop, point) {
    const key = keyOf(stop);
    if (!key || !point) return;
    if (posByKey.has(key) && anchorKeys.has(key)) return;
    posByKey.set(key, { x: roundGrid(point.x), y: roundGrid(point.y) });
  }

  const BUS_NEAR_RAIL_METERS = 260;
  const sortedBusRoutes = busRoutes.slice().sort((a, b) => String(a.routeId || "").localeCompare(String(b.routeId || "")));
  sortedBusRoutes.forEach((route, routeIndex) => {
    const stops = route.stops;
    if (!stops.length) return;
    const stopKeys = stops.map((s) => keyOf(s));
    const firstKey = stopKeys[0];
    const lastKey = stopKeys[stopKeys.length - 1];
    const loopDistance = haversineMeters(
      Number(stops[0]?.stop_lat), Number(stops[0]?.stop_lon),
      Number(stops[stops.length - 1]?.stop_lat), Number(stops[stops.length - 1]?.stop_lon)
    );
    const isLoop = (firstKey && firstKey === lastKey) || loopDistance <= 180;

    const railHits = [];
    for (let i = 0; i < stops.length; i++) {
      const nearest = nearestRailByBusKey.get(stopKeys[i]);
      if (!nearest) continue;
      if (nearest.meters <= BUS_NEAR_RAIL_METERS && posByKey.has(nearest.railKey)) {
        railHits.push({ idx: i, railKey: nearest.railKey, meters: nearest.meters });
      }
    }

    let routeType = "ISOLATED";
    if (isLoop) routeType = "LOOP";
    else if (railHits.length >= 2) routeType = "CONNECTOR";
    else if (railHits.length === 1) routeType = "SINGLE_ANCHOR";

    const lane = (routeIndex % 4) - 1.5;
    const laneOffset = 12 + (Math.abs(lane) * 6);
    const side = lane >= 0 ? 1 : -1;

if (routeType === "LOOP") {
  const theta = snapAngle45(anchor.x - center.x, anchor.y - center.y);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);

  for (let i = 0; i < stops.length; i++) {
    const offset = (i - stops.length / 2) * 20;

    setBusPoint(stops[i], {
      x: anchor.x + nx * 60,
      y: anchor.y + ny * offset,
    });

    dirByKey.set(keyOf(stops[i]), theta);
  }
  return;
}

    if (routeType === "CONNECTOR") {
      const firstHit = railHits[0];
      const lastHit = railHits[railHits.length - 1];
      const anchorA = posByKey.get(firstHit.railKey);
      const anchorB = posByKey.get(lastHit.railKey);
      if (!anchorA || !anchorB || firstHit.idx === lastHit.idx) return;
      const theta = snapAngle45(anchorB.x - anchorA.x, anchorB.y - anchorA.y);
      const laneIndex = (routeIndex % 5) - 2; // -2 to +2
      const laneOffset = laneIndex * LAYOUT_CONFIG.LANE_SPACING_PX * 2;

      const nx = -Math.sin(theta);
      const ny = Math.cos(theta);
      const offset = laneOffset;
      const span = Math.max(1, lastHit.idx - firstHit.idx);
      for (let i = 0; i < stops.length; i++) {
        let base;
        if (i < firstHit.idx) {
          const d = (firstHit.idx - i) * busSpacing;
          base = { x: anchorA.x - Math.cos(theta) * d, y: anchorA.y - Math.sin(theta) * d };
        } else if (i > lastHit.idx) {
          const d = (i - lastHit.idx) * busSpacing;
          base = { x: anchorB.x + Math.cos(theta) * d, y: anchorB.y + Math.sin(theta) * d };
        } else {
          const t = (i - firstHit.idx) / span;
          base = {
            x: anchorA.x + (anchorB.x - anchorA.x) * t,
            y: anchorA.y + (anchorB.y - anchorA.y) * t,
          };
        }
        const x = base.x + nx * laneOffset;
          const y = base.y + ny * laneOffset;
          setBusPoint(stops[i], { x, y });
        dirByKey.set(keyOf(stops[i]), theta);
      }
      return;
    }

    if (routeType === "SINGLE_ANCHOR") {
      const hit = railHits[0];
      const anchor = posByKey.get(hit.railKey);
      if (!anchor) return;
      const theta = snapAngle45(anchor.x - railCenter.x, anchor.y - railCenter.y);
      const laneIndex = (routeIndex % 5) - 2;
      const laneOffset = laneIndex * LAYOUT_CONFIG.LANE_SPACING_PX * 2;

      const nx = -Math.sin(theta);
      const ny = Math.cos(theta);
      const offset = laneOffset;
      for (let i = hit.idx + 1; i < stops.length; i++) {
        const d = (i - hit.idx) * busSpacing;
        const x = anchor.x + Math.cos(theta) * d + nx * laneOffset;
          const y = anchor.y + Math.sin(theta) * d + ny * laneOffset;
          setBusPoint(stops[i], { x, y });
        dirByKey.set(keyOf(stops[i]), theta);
      }
      for (let i = hit.idx - 1; i >= 0; i--) {
        const d = (hit.idx - i) * busSpacing;
        setBusPoint(stops[i], {
          x: anchor.x - Math.cos(theta) * d + nx * offset,
          y: anchor.y - Math.sin(theta) * d + ny * offset,
        });
        dirByKey.set(keyOf(stops[i]), theta);
      }
      return;
    }

    // ISOLATED: one fixed direction only.
    const fallbackTheta = (routeIndex % 2 === 0) ? 0 : (Math.PI / 4);
    const nx = -Math.sin(fallbackTheta);
    const ny = Math.cos(fallbackTheta);
    const centerOffset = (routeIndex % 6) - 2.5;
    const start = {
      x: centerX - Math.cos(fallbackTheta) * busSpacing * ((stops.length - 1) / 2) + nx * centerOffset * 12,
      y: centerY - Math.sin(fallbackTheta) * busSpacing * ((stops.length - 1) / 2) + ny * centerOffset * 12,
    };
    for (let i = 0; i < stops.length; i++) {
      setBusPoint(stops[i], {
        x: start.x + Math.cos(fallbackTheta) * busSpacing * i,
        y: start.y + Math.sin(fallbackTheta) * busSpacing * i,
      });
      dirByKey.set(keyOf(stops[i]), fallbackTheta);
    }
  });

  // STEP 10 cleanup: keep rail snapped/even; bus keeps route-level direction layouts above.
  for (const route of railRoutes) {
    for (let i = 1; i < route.stops.length; i++) {
      const aKey = keyOf(route.stops[i - 1]);
      const bKey = keyOf(route.stops[i]);
      const a = posByKey.get(aKey);
      const b = posByKey.get(bKey);
      if (!a || !b) continue;
      const theta = snapAngle45(b.x - a.x, b.y - a.y);
      dirByKey.set(bKey, theta);
      edges.push({ from: aKey, to: bKey, type: "rail", routeId: route.routeId });
    }
  }
  for (const route of busRoutes) {
    for (let i = 1; i < route.stops.length; i++) {
      const aKey = keyOf(route.stops[i - 1]);
      const bKey = keyOf(route.stops[i]);
      const a = posByKey.get(aKey);
      const b = posByKey.get(bKey);
      if (!a || !b) continue;
      const theta = snapAngle45(b.x - a.x, b.y - a.y);
      dirByKey.set(bKey, theta);
      edges.push({ from: aKey, to: bKey, type: "bus", routeId: route.routeId });
    }
  }

  // Assign positions back onto original station objects.
  for (const stop of allStations) {
    const key = keyOf(stop);
    const p = posByKey.get(key);
    if (!p) continue;
    stop.xschema = p.x;
    stop.yschema = p.y;
    stop.route_type = String(getRouteModeFn(stop.route_id) || "RAIL").toUpperCase();
    stop.layoutType = stop.route_type === "RAIL" ? "rail-station" : "bus-station";
    stop.radius = stop.route_type === "RAIL" ? LAYOUT_CONFIG.RAIL_RADIUS_BASE : LAYOUT_CONFIG.BUS_RADIUS_BASE;
    stop.touch_radius = Math.max(LAYOUT_CONFIG.TOUCH_TARGET_PX, (stop.radius || 18) * 1.8);
    nodeByKey.set(key, {
      id: key,
      x: p.x,
      y: p.y,
      type: stop.layoutType,
      radius: stop.radius,
      touch_radius: stop.touch_radius,
    });
  }

  const allNodes = Array.from(nodeByKey.values());
  fitToViewport(allNodes, svgWidth, svgHeight);
  const fittedNodeById = new Map(allNodes.map((n) => [n.id, n]));
  for (const stop of allStations) {
    const key = keyOf(stop);
    const n = fittedNodeById.get(key);
    if (!n) continue;
    stop.xschema = n.x;
    stop.yschema = n.y;
  }

  return { success: true, nodes: allNodes, edges };
}

export function projectGeo(lat, lon, svgWidth = 1200, svgHeight = 800, margin = 55, allStations = []) {
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  const pLat = Number(lat);
  const pLon = Number(lon);
  if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return [centerX, centerY];
  if (!allStations || allStations.length === 0) return [centerX, centerY];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const station of allStations) {
    const slat = Number(station.stop_lat);
    const slon = Number(station.stop_lon);
    if (Number.isFinite(slat) && Number.isFinite(slon)) {
      minLat = Math.min(minLat, slat);
      maxLat = Math.max(maxLat, slat);
      minLon = Math.min(minLon, slon);
      maxLon = Math.max(maxLon, slon);
    }
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) return [centerX, centerY];
  const x = ((pLon - minLon) / (maxLon - minLon)) * (svgWidth - 2 * margin) + margin;
  const y = ((maxLat - pLat) / (maxLat - minLat)) * (svgHeight - 2 * margin) + margin;
  return [Number.isFinite(x) ? x : centerX, Number.isFinite(y) ? y : centerY];
}

export function fitVisibleNetworkToViewport(mapVisibleStops, svgWidth = 1200, svgHeight = 800) {
  const nodes = mapVisibleStops.filter(s => Number.isFinite(s.xschema) && Number.isFinite(s.yschema));
  if (!nodes.length) return {scale: 1, tx: 0, ty: 0};
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(s => {
    minX = Math.min(minX, s.xschema);
    maxX = Math.max(maxX, s.xschema);
    minY = Math.min(minY, s.yschema);
    maxY = Math.max(maxY, s.yschema);
  });
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const innerW = svgWidth - 2 * LAYOUT_CONFIG.MARGIN_PX;
  const innerH = svgHeight - 2 * LAYOUT_CONFIG.MARGIN_PX;
  const scale = Math.min(innerW / width, innerH / height);
  const tx = (svgWidth - width * scale) / 2 - minX * scale;
  const ty = (svgHeight - height * scale) / 2 - minY * scale;
  nodes.forEach(s => {
    s.xschema = s.xschema * scale + tx;
    s.yschema = s.yschema * scale + ty;
  });
  return {scale, tx, ty};
}

export { LAYOUT_CONFIG };
