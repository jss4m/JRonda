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

function buildHubs(stopsData, maxDistMeters, mode) {
  const stationGroupsMap = new Map();
  for (const stop of stopsData) {
    const sourceId = String(stop.source_stop_id || stop.stop_id);
    if (!stationGroupsMap.has(sourceId)) {
      stationGroupsMap.set(sourceId, {
        station_id: sourceId,
        lat: Number(stop.stop_lat),
        lon: Number(stop.stop_lon),
        fullStopIds: [],
        routes: new Set(),
      });
    }
    const entry = stationGroupsMap.get(sourceId);
    entry.fullStopIds.push(String(stop.stop_id));
    if (stop.route_id) entry.routes.add(String(stop.route_id));
    if (String(stop.route_id || '').toUpperCase().includes('ETS')) entry.is_ets = true;
  }
  const stationGroups = Array.from(stationGroupsMap.values());
  const n = stationGroups.length;
  const parent = Array.from({length: n}, (_,i)=>i);
  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a,b) {
    parent[find(b)] = find(a);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i+1; j < n; j++) {
      const d = haversineMeters(stationGroups[i].lat, stationGroups[i].lon, stationGroups[j].lat, stationGroups[j].lon);
      if (d <= maxDistMeters) union(i,j);
    }
  }
  const hubMap = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!hubMap.has(root)) hubMap.set(root, []);
    hubMap.get(root).push(stationGroups[i]);
  }
  const hubs = [];
  const stationToHub = new Map();
  let hubIdCounter = 0;
  for (const groups of hubMap.values()) {
    const avgLat = groups.reduce((sum,s)=>sum + s.lat,0) / groups.length;
    const avgLon = groups.reduce((sum,s)=>sum + s.lon,0) / groups.length;
    const hub = {
      hub_id: `${mode.toUpperCase()}_H${++hubIdCounter}`,
      stations: [],
      lat: avgLat,
      lon: avgLon,
      routes: new Set(),
      hubScore: 0,
      x: null,
      y: null,
      mode,
      route_type: mode.toUpperCase(),
      is_ets: false,
      is_major_hub: false,
      nearestRailHubId: null,
      radius: mode === 'rail' ? LAYOUT_CONFIG.RAIL_RADIUS_BASE : LAYOUT_CONFIG.BUS_RADIUS_BASE,
      weight: 1
    };
    for (const g of groups) {
      for (const fullId of g.fullStopIds) {
        stationToHub.set(fullId, hub.hub_id);
        hub.stations.push(fullId);
      }
      for (const r of g.routes) hub.routes.add(r);
      if (g.is_ets) hub.is_ets = true;
    }
    hubs.push(hub);
  }
  return {hubs, stationToHub};
}

function computeHubScores(hubs, routesData) {
  hubs.forEach(hub => {
    const uniqueRoutes = new Set();
    routesData.forEach(route => {
      if (route.hub_sequence?.includes(hub.hub_id)) uniqueRoutes.add(route.route_id);
    });
    hub.hubScore = uniqueRoutes.size;
  });
  // Mark major hubs (top 10%)
  const scores = hubs.map(h => h.hubScore).sort((a,b) => b - a);
  const threshold = scores[Math.floor(scores.length * 0.1)] || 0;
  hubs.forEach(h => h.is_major_hub = h.hubScore >= threshold);
  hubs.sort((a,b) => b.hubScore - a.hubScore);
}

function convertToHubSequences(routesData, stationToHub) {
  const hubRoutes = [];
  routesData.forEach(route => {
    const stops = route.stops.map(s => stationToHub.get(String(s.stop_id))).filter(Boolean);
    const uniqueHubSeq = [];
    stops.forEach(hubId => {
      if (uniqueHubSeq[uniqueHubSeq.length - 1] !== hubId) uniqueHubSeq.push(hubId);
    });
    if (uniqueHubSeq.length >= 2) {
      hubRoutes.push({
        route_id: route.route_id,
        hub_sequence: uniqueHubSeq,
        stop_sequence: route.stops.map(s => String(s.stop_id)),
      });
    }
  });
  return hubRoutes;
}

function placeRailHubsSequenceDriven(hubs, hubRoutes) {
  const hubById = new Map(hubs.map(h => [h.hub_id, h]));
  if (hubs.length === 0) return { success: false };
  const origin = hubs[0];
  origin.x = 0;
  origin.y = 0;
  const visited = new Set([origin.hub_id]);
  const queue = [origin];
  const routesByLength = [...hubRoutes].sort((a, b) => {
    const lenDiff = (b.hub_sequence?.length || 0) - (a.hub_sequence?.length || 0);
    if (lenDiff !== 0) return lenDiff;
    return String(a.route_id || "").localeCompare(String(b.route_id || ""));
  });

  while (queue.length > 0) {
    const current = queue.shift();
    routesByLength.filter(r => r.hub_sequence.includes(current.hub_id)).forEach(route => {
      const seq = route.hub_sequence;
      const currIdx = seq.indexOf(current.hub_id);
      if (currIdx > 0) {
        const prevId = seq[currIdx - 1];
        if (!visited.has(prevId)) {
          const prevHub = hubById.get(prevId);
          const geoDx = prevHub.lon - current.lon;
          const geoDy = prevHub.lat - current.lat;
          const angle = snapDirection(geoDx, geoDy);
          const scoreW = Math.min(1.2, 1 + ((prevHub.hubScore || 0) * 0.02));
          const dist = LAYOUT_CONFIG.RAIL_SEG_DIST_PX * scoreW;
          prevHub.x = current.x + Math.cos(angle + Math.PI) * dist; // opposite
          prevHub.y = current.y + Math.sin(angle + Math.PI) * dist;
          visited.add(prevId);
          queue.push(prevHub);
        }
      }
      if (currIdx < seq.length - 1) {
        const nextId = seq[currIdx + 1];
        if (!visited.has(nextId)) {
          const nextHub = hubById.get(nextId);
          const geoDx = nextHub.lon - current.lon;
          const geoDy = nextHub.lat - current.lat;
          const angle = snapDirection(geoDx, geoDy);
          const scoreW = Math.min(1.2, 1 + ((nextHub.hubScore || 0) * 0.02));
          const dist = LAYOUT_CONFIG.RAIL_SEG_DIST_PX * scoreW;
          nextHub.x = current.x + Math.cos(angle) * dist;
          nextHub.y = current.y + Math.sin(angle) * dist;
          visited.add(nextId);
          queue.push(nextHub);
        }
      }
    });
  }

  // Deterministically place any disconnected hubs by projected geography around origin.
  for (const hub of hubs) {
    if (visited.has(hub.hub_id)) continue;
    const dx = (hub.lon - origin.lon) * 10000;
    const dy = (hub.lat - origin.lat) * 10000;
    const angle = snapDirection(dx, dy);
    const radius = LAYOUT_CONFIG.RAIL_SEG_DIST_PX * Math.max(1, Math.hypot(dx, dy) / 18);
    hub.x = origin.x + Math.cos(angle) * radius;
    hub.y = origin.y + Math.sin(angle) * radius;
    visited.add(hub.hub_id);
  }

  return hubById;
}

function hubPushStabilize(hubs, passes = LAYOUT_CONFIG.PUSH_PASSES) {
  const origin = hubs.sort((a,b) => b.hubScore - a.hubScore)[0];
  for (let pass = 0; pass < passes; pass++) {
    let pushed = false;
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const ha = hubs[i];
        const hb = hubs[j];
        const dx = hb.x - ha.x;
        const dy = hb.y - ha.y;
        const dist = Math.hypot(dx, dy);
        if (dist < LAYOUT_CONFIG.MIN_HUB_DIST_PX && dist > 0) {
          const pushDist = (LAYOUT_CONFIG.MIN_HUB_DIST_PX - dist) / 2;
          const scaleA = 1 / (Math.hypot(ha.x - origin.x, ha.y - origin.y) + 1);
          const scaleB = 1 / (Math.hypot(hb.x - origin.x, hb.y - origin.y) + 1);
          const norm = dist;
          ha.x -= (dx / norm) * pushDist * scaleA;
          ha.y -= (dy / norm) * pushDist * scaleA;
          hb.x += (dx / norm) * pushDist * scaleB;
          hb.y += (dy / norm) * pushDist * scaleB;
          pushed = true;
        }
      }
    }
    // Keep all hubs on a loose grid so polyline directions stay visually clean.
    for (const h of hubs) {
      if (!Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
      h.x = Math.round(h.x / LAYOUT_CONFIG.GRID_SNAP_PX) * LAYOUT_CONFIG.GRID_SNAP_PX;
      h.y = Math.round(h.y / LAYOUT_CONFIG.GRID_SNAP_PX) * LAYOUT_CONFIG.GRID_SNAP_PX;
    }
    if (!pushed) break;
  }
}

function straightenRailRoutes(hubRoutes, hubById) {
  for (const route of hubRoutes) {
    const seq = route.hub_sequence || [];
    if (seq.length < 3) continue;
    for (let i = 1; i < seq.length - 1; i++) {
      const prev = hubById.get(seq[i - 1]);
      const cur = hubById.get(seq[i]);
      const next = hubById.get(seq[i + 1]);
      if (!prev || !cur || !next) continue;
      if (cur.is_major_hub) continue;
      const theta = snapDirection(next.x - prev.x, next.y - prev.y);
      const ux = Math.cos(theta);
      const uy = Math.sin(theta);
      const proj = ((cur.x - prev.x) * ux) + ((cur.y - prev.y) * uy);
      cur.x = prev.x + ux * proj;
      cur.y = prev.y + uy * proj;
    }
  }
}

function placeStationsAlongEdges(routesData, stationToHub, hubById) {
  const stationNodeById = new Map();
  routesData.forEach(route => {
    const stopSeq = route.stop_sequence || route.stops.map(s => String(s.stop_id));
    let segStart = 0;
    for (let i = 1; i <= stopSeq.length; i++) {
      const prevStopId = stopSeq[i - 1];
      const currStopId = i < stopSeq.length ? stopSeq[i] : null;
      const prevHub = stationToHub.get(prevStopId);
      const currHub = currStopId ? stationToHub.get(currStopId) : null;
      if (i === stopSeq.length || prevHub !== currHub) {
        const segmentStops = stopSeq.slice(segStart, i);
        if (prevHub && currHub && prevHub !== currHub && segmentStops.length > 0) {
          const ha = hubById.get(prevHub);
          const hb = hubById.get(currHub);
          if (ha && hb && Number.isFinite(ha.x)) {
            const dx = hb.x - ha.x;
            const dy = hb.y - ha.y;
            const edgeDist = Math.hypot(dx, dy);
            const unitX = edgeDist > 0 ? dx / edgeDist : 0;
            const unitY = edgeDist > 0 ? dy / edgeDist : 0;
            const count = segmentStops.length;
            for (let s = 0; s < count; s++) {
              const t = count > 1 ? s / (count - 1) : 0.5;
              let x = ha.x + dx * t;
              let y = ha.y + dy * t;
              // Offset LABEL_OFFSET ~32px
              let distToA = Math.hypot(x - ha.x, y - ha.y);
              if (distToA < 32) {
                const shift = 32 - distToA;
                x += unitX * shift;
                y += unitY * shift;
              }
              let distToB = Math.hypot(x - hb.x, y - hb.y);
              if (distToB < 32) {
                const shift = 32 - distToB;
                x -= unitX * shift;
                y -= unitY * shift;
              }
              const fullStopId = segmentStops[s];
              const radius = ha.mode === 'RAIL' ? Math.max(20, Math.min(24, LAYOUT_CONFIG.RAIL_RADIUS_BASE + ha.hubScore * 0.8)) : Math.max(16, Math.min(20, LAYOUT_CONFIG.BUS_RADIUS_BASE + ha.hubScore * 0.5));
              stationNodeById.set(fullStopId, {id: fullStopId, x, y, type: 'station', radius, touch_radius: Math.max(LAYOUT_CONFIG.TOUCH_TARGET_PX, radius * 1.8)});
            }
          }
        }
        segStart = i;
      }
    }
  });
  return stationNodeById;
}

function collapseShortSegments(hubRoutes, hubById, minLenPx = LAYOUT_CONFIG.MIN_SEG_COLLAPSE_PX) {
  hubRoutes.forEach(route => {
    const seq = route.hub_sequence;
    if (seq.length < 3) return;
    const collapsed = [seq[0]];
    for (let i = 1; i < seq.length; i++) {
      const prevId = collapsed[collapsed.length - 1];
      const currId = seq[i];
      const a = hubById.get(prevId);
      const b = hubById.get(currId);
      if (!a || !b || !Number.isFinite(a.x)) {
        collapsed.push(currId);
        continue;
      }
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist >= minLenPx) collapsed.push(currId);
    }
    route.hub_sequence = collapsed;
  });
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
  const railSpacing = 40;
  const busSpacing = 30;
  const minNodeDist = 18;
  const ccRadius = 120;

  const allStations = (Array.isArray(allStationsInput) ? allStationsInput : []).filter((s) => {
    const lat = Number(s?.stop_lat);
    const lon = Number(s?.stop_lon);
    return Number.isFinite(lat) && Number.isFinite(lon);
  });
  if (!allStations.length) return { success: false, nodes: [], edges: [] };

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
      stops: ordered,
    };
  }).filter((r) => r.stops.length >= 2);

  const railRoutes = routeEntries.filter((r) => r.mode === "RAIL");
  const busRoutes = routeEntries.filter((r) => r.mode !== "RAIL");
  if (!railRoutes.length) return { success: false, nodes: [], edges: [] };

  const keyOf = (s) => {
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
  };
  const roundGrid = (n) => Math.round(n / LAYOUT_CONFIG.GRID_SNAP_PX) * LAYOUT_CONFIG.GRID_SNAP_PX;
  // Screen Y grows downward, so latitude delta is inverted to keep north-up orientation.
  const geoTheta = (a, b) => snapAngle45(
    Number(b?.stop_lon || 0) - Number(a?.stop_lon || 0),
    Number(a?.stop_lat || 0) - Number(b?.stop_lat || 0)
  );
  const posByKey = new Map();
  const dirByKey = new Map();
  const nodeByKey = new Map();
  const edges = [];

  // STEP 1 anchors
  const normalizedName = (s) => normalizeStopName(s?.stop_name || "");
  const primaryHub = allStations.find((s) => normalizedName(s).includes("kl sentral")) || railRoutes[0].stops[0];
  const primaryKey = keyOf(primaryHub);
  const ccClusterKeywords = new Set([
    "masjid jamek",
    "pasar seni",
    "klcc",
    "bukit bintang",
    "hang tuah",
    "merdeka",
    "imbi",
    "titiwangsa",
  ]);
  const ccStops = [];
  const ccRouteStops = railRoutes
    .filter((r) => /(^CC$|CCL|CIRCLE|MRT.*CIRCLE)/i.test(String(r.routeId || "")))
    .flatMap((r) => r.stops);
  for (const stop of allStations) {
    const name = normalizedName(stop);
    if (!name) continue;
    for (const kw of ccClusterKeywords) {
      if (name.includes(kw)) {
        ccStops.push(stop);
        break;
      }
    }
  }
  for (const stop of ccRouteStops) ccStops.push(stop);
  const uniqueCcStops = Array.from(new Map(ccStops.map((s) => [keyOf(s), s])).values());
  const primaryLat = Number(primaryHub?.stop_lat || 0);
  const primaryLon = Number(primaryHub?.stop_lon || 0);
  uniqueCcStops.sort((a, b) => {
    const aAngle = Math.atan2(
      Number(a?.stop_lat || 0) - primaryLat,
      Number(a?.stop_lon || 0) - primaryLon
    );
    const bAngle = Math.atan2(
      Number(b?.stop_lat || 0) - primaryLat,
      Number(b?.stop_lon || 0) - primaryLon
    );
    return aAngle - bAngle;
  });

  // STEP 3+4 primary + CC ring
  posByKey.set(primaryKey, { x: centerX, y: centerY });
  dirByKey.set(primaryKey, 0);
  if (uniqueCcStops.length) {
    for (let i = 0; i < uniqueCcStops.length; i++) {
      const stop = uniqueCcStops[i];
      const key = keyOf(stop);
      if (key === primaryKey) continue;
      const theta = (Math.PI * 2 * i) / uniqueCcStops.length;
      posByKey.set(key, {
        x: roundGrid(centerX + Math.cos(theta) * ccRadius),
        y: roundGrid(centerY + Math.sin(theta) * ccRadius),
      });
      dirByKey.set(key, snapAngle45(Math.cos(theta), Math.sin(theta)));
    }
  }
  const ccKeySet = new Set(uniqueCcStops.map((s) => keyOf(s)));
  const anchorKeys = new Set(
    allStations
      .filter((s) => String(getRouteModeFn(s.route_id) || "RAIL").toUpperCase() === "RAIL")
      .filter((s) => Boolean(s.isInterchange || s.isConnecting))
      .map((s) => keyOf(s))
      .filter(Boolean)
  );
  anchorKeys.add(primaryKey);
  for (const key of ccKeySet) anchorKeys.add(key);

  // STEP 2 rail backbone direction assignment + STEP 5 line layout
  function resolveRailDirection(route) {
    const stops = route.stops;
    const hasPrimary = stops.some((s) => keyOf(s) === primaryKey);
    const touchesCc = stops.some((s) => ccKeySet.has(keyOf(s)));
    if (hasPrimary && touchesCc) {
      const ccStop = stops.find((s) => ccKeySet.has(keyOf(s)) && keyOf(s) !== primaryKey);
      if (ccStop && posByKey.has(keyOf(ccStop))) {
        const p = posByKey.get(keyOf(ccStop));
        return snapAngle45(p.x - centerX, p.y - centerY);
      }
    }
    if (hasPrimary) {
      const primaryIdx = stops.findIndex((s) => keyOf(s) === primaryKey);
      if (primaryIdx >= 0) {
        const next = stops[primaryIdx + 1] || null;
        const prev = primaryIdx > 0 ? stops[primaryIdx - 1] : null;
        if (next) return geoTheta(stops[primaryIdx], next);
        if (prev) return geoTheta(stops[primaryIdx], prev);
      }
      return geoTheta(stops[0], stops[stops.length - 1]);
    }
    if (touchesCc) {
      const anchor = stops.find((s) => ccKeySet.has(keyOf(s)));
      const ap = anchor ? posByKey.get(keyOf(anchor)) : null;
      if (ap) return snapAngle45(ap.x - centerX, ap.y - centerY);
    }
    // inherit from connected line
    for (const stop of stops) {
      const k = keyOf(stop);
      if (dirByKey.has(k)) return dirByKey.get(k);
    }
    return geoTheta(stops[0], stops[stops.length - 1]);
  }

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
      const geoDir = geoTheta(route.stops[i - 1], stop);
      const dir = snapAngle45(Math.cos(geoDir) + Math.cos(baseDir), Math.sin(geoDir) + Math.sin(baseDir));
      const nextPos = ensurePosFrom(prevKey, dir, railSpacing);
      if (nextPos) {
        posByKey.set(key, nextPos);
        dirByKey.set(key, dir);
      }
    }
  }

  // STEP 7 controlled collision resolution (no random movement)
  const railKeys = Array.from(new Set(railRoutes.flatMap((r) => r.stops.map((s) => keyOf(s)).filter(Boolean))));
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < railKeys.length; i++) {
      for (let j = i + 1; j < railKeys.length; j++) {
        const aKey = railKeys[i];
        const bKey = railKeys[j];
        const a = posByKey.get(aKey);
        const b = posByKey.get(bKey);
        if (!a || !b) continue;
        if (anchorKeys.has(aKey) || anchorKeys.has(bKey)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minNodeDist || d <= 0.001) continue;
        const theta = dirByKey.get(aKey) ?? dirByKey.get(bKey) ?? 0;
        const px = -Math.sin(theta);
        const py = Math.cos(theta);
        const push = (minNodeDist - d) * 0.5;
        a.x = roundGrid(a.x - px * push);
        a.y = roundGrid(a.y - py * push);
        b.x = roundGrid(b.x + px * push);
        b.y = roundGrid(b.y + py * push);
        moved = true;
      }
    }
    if (!moved) break;
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
      let anchor = null;
      if (railHits.length) {
        const firstHit = railHits[0];
        anchor = posByKey.get(firstHit.railKey) || null;
      }
      if (!anchor) {
        let sx = 0;
        let sy = 0;
        let c = 0;
        for (const stop of stops) {
          const key = keyOf(stop);
          const p = key ? posByKey.get(key) : null;
          if (!p) continue;
          sx += p.x;
          sy += p.y;
          c += 1;
        }
        anchor = c > 0 ? { x: sx / c, y: sy / c } : { x: centerX, y: centerY };
      }
      const radius = Math.max(40, Math.min(80, 34 + (stops.length * 2)));
      const step = (Math.PI * 2) / Math.max(1, stops.length);
      for (let i = 0; i < stops.length; i++) {
        const a = (i * step) - (Math.PI / 2);
        setBusPoint(stops[i], {
          x: anchor.x + Math.cos(a) * radius,
          y: anchor.y + Math.sin(a) * radius,
        });
        dirByKey.set(keyOf(stops[i]), a);
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
      const nx = -Math.sin(theta) * side;
      const ny = Math.cos(theta) * side;
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
        setBusPoint(stops[i], { x: base.x + nx * offset, y: base.y + ny * offset });
        dirByKey.set(keyOf(stops[i]), theta);
      }
      return;
    }

    if (routeType === "SINGLE_ANCHOR") {
      const hit = railHits[0];
      const anchor = posByKey.get(hit.railKey);
      if (!anchor) return;
      const theta = snapAngle45(anchor.x - railCenter.x, anchor.y - railCenter.y);
      const nx = -Math.sin(theta) * side;
      const ny = Math.cos(theta) * side;
      const offset = laneOffset;
      for (let i = hit.idx + 1; i < stops.length; i++) {
        const d = (i - hit.idx) * busSpacing;
        setBusPoint(stops[i], {
          x: anchor.x + Math.cos(theta) * d + nx * offset,
          y: anchor.y + Math.sin(theta) * d + ny * offset,
        });
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
      if (!anchorKeys.has(bKey)) {
        b.x = roundGrid(a.x + Math.cos(theta) * railSpacing);
        b.y = roundGrid(a.y + Math.sin(theta) * railSpacing);
      }
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
