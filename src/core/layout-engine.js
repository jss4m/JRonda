/**
 * JRonda Layout Engine Module
 * Schematic layout generation + geo projection
 * Extracted from render.js TODO Step 3.2 (High risk: core visual algorithm)
 */


// Config (moved from render.js)
const GRID_SPACING = 80;
const HUB_SPACING = 140;
const MAX_STRAIGHT_SEGMENT_NODES = 6;
const NODE_SPACING = 60;
const MIN_MARGIN = 40;

/**
 * Project geo coordinates to schematic space
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} svgWidth - SVG width
 * @param {number} svgHeight - SVG height 
 * @param {number} margin - Layout margin
 * @returns {[number,number]} [x,y] schematic coords
 */
function _extractGeoBounds(allStations = []) {
  const valid = (Array.isArray(allStations) ? allStations : []).filter(
    (s) => Number.isFinite(Number(s?.stop_lat)) && Number.isFinite(Number(s?.stop_lon))
  );
  if (!valid.length) {
    return null;
  }
  const lats = valid.map((s) => Number(s.stop_lat));
  const lons = valid.map((s) => Number(s.stop_lon));
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);

  if (minLat === maxLat) {
    minLat -= 0.0001;
    maxLat += 0.0001;
  }
  if (minLon === maxLon) {
    minLon -= 0.0001;
    maxLon += 0.0001;
  }
  return { minLat, maxLat, minLon, maxLon };
}

export function projectGeo(lat, lon, svgWidth = 1000, svgHeight = 1000, margin = 40, allStations = []) {
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  const pLat = Number(lat);
  const pLon = Number(lon);

  if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) {
    return [centerX, centerY];
  }

  const bounds = _extractGeoBounds(allStations);
  if (!bounds) {
    return [centerX, centerY];
  }

  const { minLat, maxLat, minLon, maxLon } = bounds;
  const x = ((pLon - minLon) / (maxLon - minLon)) * (svgWidth - 2 * margin) + margin;
  const y = ((maxLat - pLat) / (maxLat - minLat)) * (svgHeight - 2 * margin) + margin;
  return [
    Number.isFinite(x) ? x : centerX,
    Number.isFinite(y) ? y : centerY,
  ];
}

/**
 * Fit visible network to viewport (post-layout scaling)
 * @param {Array} mapVisibleStops - Visible stops with xschema/yschema
 * @param {number} svgWidth
 * @param {number} svgHeight
 */
export function fitVisibleNetworkToViewport(mapVisibleStops, svgWidth = 1000, svgHeight = 1000, MIN_MARGIN = 40) {
  const nodes = mapVisibleStops.filter(
    (s) => Number.isFinite(s.xschema) && Number.isFinite(s.yschema)
  );
  if (!nodes.length) return { scale: 1, tx: 0, ty: 0 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
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

  return { scale, tx, ty };
}

/**
 * Main schematic layout algorithm (trunk-first cardinal placement)
 * @param {Array} allStations - All stations
 * @param {Map} routes - Route ID → stops
 * @param {Function} getRouteMode - Classify route (RAIL/BUS)
 * @returns {boolean} Success
 */
export function buildSchematicLayout(
  allStations,
  routes,
  getRouteModeFn,
  { svgWidth = 1000, svgHeight = 1000, margin = MIN_MARGIN } = {}
) {
  // Apply pre-computed layout if available
  try {
    const layoutNodes = JSON.parse(readFileSync('../data-build/normalized/layout_nodes.json', 'utf8'));
    const nodeById = new Map(layoutNodes.map(node => [node.id, node]));
    const hubStations = new Map();
    layoutNodes.filter(n => n.type === 'hub').forEach(hub => {
      hub.stations?.forEach(stationId => hubStations.set(stationId, hub.id));
    });
    
    allStations.forEach(stop => {
      const hubId = hubStations.get(stop.stop_id);
      if (hubId) {
        const hub = nodeById.get(hubId);
        if (hub) {
          stop.xschema = hub.x;
          stop.yschema = hub.y;
          return;
        }
      }
      const node = nodeById.get(stop.stop_id);
      if (node) {
        stop.xschema = node.x;
        stop.yschema = node.y;
        return;
      }
    });
    console.log('✅ Applied schematic layout from pre-computed files');
    return { success: true };
  } catch (e) {
    // Precomputed layout is optional; this fallback is normal in non-build environments
    console.debug('No precomputed layout nodes available, using schematic layout', e?.message || e);
  }
  const railStops = allStations.filter((stop) => getRouteModeFn(stop.route_id) === "RAIL");
  const busStops = allStations.filter((stop) => getRouteModeFn(stop.route_id) !== "RAIL");
  const railRoutes = Array.from(routes.entries())
    .filter(([routeId]) => getRouteModeFn(routeId) === "RAIL")
    .map(([routeId, routeStops]) => [String(routeId), routeStops]);
  const busRoutes = Array.from(routes.entries())
    .filter(([routeId]) => getRouteModeFn(routeId) !== "RAIL")
    .map(([routeId, routeStops]) => [String(routeId), routeStops]);

  if (!railStops.length) {
    for (const stop of allStations) {
      stop.xschema = stop.xgeo;
      stop.yschema = stop.ygeo;
    }
    return { success: false };
  }

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

  return {
    success: true,
    centroidLat,
    centroidLon,
  };
}

// Internal utils (scoped to module)
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
  return normalizeStopName(stop.stop_name) || String(stop.stop_id || "");
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

// ... other layout internals (geoBucketFromStops, dirVec, etc.)

export { GRID_SPACING, HUB_SPACING, MAX_STRAIGHT_SEGMENT_NODES, snapAngle45, normalizeStopName };

