/**
 * Map Layout Engine - Implements exact task spec
 * Generates layout_nodes.json + layout_edges.json
 * Run: node data-build/scripts/map-layout.js
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const normalizedDir = path.join('data-build', 'normalized');
const railStopsData = JSON.parse(readFileSync(path.join(normalizedDir, 'rail_stops.json'), 'utf8'));
const railRoutesData = JSON.parse(readFileSync(path.join(normalizedDir, 'rail_routes.json'), 'utf8'));
// Bus data separate (rapidbus, hoho, gokl)
const busStopsData = [];

const MAX_HUB_DISTANCE_METERS = 100;
const HUB_DISTANCE_PX = 120;
const MIN_HUB_DISTANCE_PX = 80;
const MIN_STATION_DISTANCE_PX = 40;
const LANE_SPACING_PX = 8;
const VIEWPORT_PADDING_PX = 40;
const CARDINAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315].map(deg => deg * Math.PI / 180);

// Haversine distance (already in layout-engine.js)
function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = v => v * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 1. Build Physical Hubs (merge nearby stations <100m)
function buildHubs(stationGroups) {
  const n = stationGroups.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x) {
    let p = x;
    while (parent[p] !== p) p = parent[p];
    while (parent[x] !== x) {
      const next = parent[x];
      parent[x] = p;
      x = next;
    }
    return p;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = stationGroups[i];
      const b = stationGroups[j];
      const d = haversineMeters(a.lat, a.lon, b.lat, b.lon);
      if (d < MAX_HUB_DISTANCE_METERS) {
        union(i, j);
      }
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
  for (const groups of hubMap.values()) {
    const avgLat = groups.reduce((sum, s) => sum + s.lat, 0) / groups.length;
    const avgLon = groups.reduce((sum, s) => sum + s.lon, 0) / groups.length;
    const hub = {
      hub_id: `H${hubs.length}`,
      stations: [],
      lat: avgLat,
      lon: avgLon,
      routes: new Set(),
      x: null,
      y: null,
    };
    for (const g of groups) {
      stationToHub.set(g.station_id, hub.hub_id);
      for (const fullId of g.fullStopIds) hub.stations.push(fullId);
      for (const routeId of g.routes) hub.routes.add(routeId);
    }
    hubs.push(hub);
  }

  return { hubs, stationToHub };
}

// 2. Convert station sequences to hub sequences
function convertToHubSequences(routesData, stationToHub) {
  const hubRoutes = [];
  
  routesData.forEach(route => {
    const stops = route.stops
      .map(s => s.stop_id)
      .map(id => stationToHub.get(id))
      .filter(hubId => hubId !== undefined);
    const uniqueHubSeq = [];
    for (const hubId of stops) {
      if (uniqueHubSeq[uniqueHubSeq.length - 1] !== hubId) {
        uniqueHubSeq.push(hubId);
      }
    }
    
    if (uniqueHubSeq.length > 1) {
      hubRoutes.push({
        route_id: route.route_id,
        hub_sequence: uniqueHubSeq,
        stop_sequence: route.stops.map(s => s.stop_id),
      });
    }
  });
  
  return hubRoutes;
}

// 3. Detect route termini
function detectTermini(hubRoutes, hubs) {
  hubRoutes.forEach(route => {
    if (route.hub_sequence?.length) {
      route.start_terminus = route.hub_sequence[0];
      route.end_terminus = route.hub_sequence[route.hub_sequence.length - 1];
    }
  });
  
  // Hub importance by unique routes
  hubs.forEach(hub => {
    const servingRoutes = new Set();
    hubRoutes.forEach(route => {
      if (route.hub_sequence?.includes(hub.hub_id)) {
        servingRoutes.add(route.route_id);
      }
    });
    hub.hubScore = servingRoutes.size;
  });
  
  return hubs.sort((a, b) => b.hubScore - a.hubScore);
}

// 4. Snap vector to cardinal angle
function snapDirection(dx, dy) {
  const angle = Math.atan2(dy, dx);
  const snapped = CARDINAL_ANGLES.reduce((best, cand) => {
    return Math.abs(cand - angle) < Math.abs(best - angle) ? cand : best;
  });
  return snapped;
}

// 5. Main layout placement
function placeHubs(hubRoutes, hubs) {
  // Choose anchors: top 3-5 hubs
  const anchors = hubs.slice(0, 5).map(h => h.hub_id);
  const centerHub = hubs[0];
  const centerIdx = hubs.findIndex(h => h.hub_id === centerHub.hub_id);
  if (centerIdx >= 0) {
    hubs[centerIdx].x = 0;
    hubs[centerIdx].y = 0;
  }
  
  // Place routes directionally
  const hubById = new Map(hubs.map(h => [h.hub_id, h]));

  for (const route of hubRoutes) {
    const startHub = hubById.get(route.start_terminus);
    const endHub = hubById.get(route.end_terminus);
    if (!startHub || !endHub) continue;
    const dx = endHub.lon - startHub.lon;
    const dy = endHub.lat - startHub.lat;
    route.direction = snapDirection(dx, dy);
  }

  let placed = true;
  let passes = 0;
  while (placed && passes < 8) {
    placed = false;
    passes++;
    for (const route of hubRoutes) {
      for (let i = 1; i < route.hub_sequence.length; i++) {
        const prevHubId = route.hub_sequence[i - 1];
        const currHubId = route.hub_sequence[i];
        const prevHub = hubById.get(prevHubId);
        const currHub = hubById.get(currHubId);
        if (!prevHub || !currHub) continue;
        if (!Number.isFinite(prevHub.x) || !Number.isFinite(prevHub.y)) continue;
        if (Number.isFinite(currHub.x) && Number.isFinite(currHub.y)) continue;

        const geoDx = currHub.lon - prevHub.lon;
        const geoDy = currHub.lat - prevHub.lat;
        const theta = Number.isFinite(geoDx) && Number.isFinite(geoDy) && (geoDx !== 0 || geoDy !== 0)
          ? snapDirection(geoDx, geoDy)
          : route.direction;
        currHub.x = prevHub.x + Math.cos(theta) * HUB_DISTANCE_PX;
        currHub.y = prevHub.y + Math.sin(theta) * HUB_DISTANCE_PX;
        placed = true;
      }
    }
  }

  // Enforce min hub distance by shifting downstream along route direction
  for (const route of hubRoutes) {
    for (let i = 1; i < route.hub_sequence.length; i++) {
      const a = hubById.get(route.hub_sequence[i - 1]);
      const b = hubById.get(route.hub_sequence[i]);
      if (!a || !b) continue;
      if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < MIN_HUB_DISTANCE_PX) {
        const theta = route.direction || 0;
        const shift = MIN_HUB_DISTANCE_PX - dist;
        b.x = a.x + Math.cos(theta) * (dist + shift);
        b.y = a.y + Math.sin(theta) * (dist + shift);
      }
    }
  }
  
  return { hubs, hubRoutes };
}

// 6. Normalize + Output
function normalizeLayout(hubs, svgWidth = 1000, svgHeight = 1000) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  hubs.forEach(hub => {
    minX = Math.min(minX, hub.x || 0);
    maxX = Math.max(maxX, hub.x || 0);
    minY = Math.min(minY, hub.y || 0);
    maxY = Math.max(maxY, hub.y || 0);
  });
  
  const width = maxX - minX;
  const height = maxY - minY;
  const scaleX = (svgWidth - 2 * VIEWPORT_PADDING_PX) / Math.max(1, width);
  const scaleY = (svgHeight - 2 * VIEWPORT_PADDING_PX) / Math.max(1, height);
  const scale = Math.min(scaleX, scaleY);
  
  const cx = (svgWidth - width * scale) / 2 - minX * scale;
  const cy = (svgHeight - height * scale) / 2 - minY * scale;
  
  hubs.forEach(hub => {
    hub.x = (hub.x || 0) * scale + cx;
    hub.y = (hub.y || 0) * scale + cy;
  });
  
  return hubs;
}

// MAIN EXECUTION
async function main() {
  console.log('🚇 Building map layout...');
  
  const stationGroupsMap = new Map();
  const routeStopIdBySource = new Map();
  for (const stop of railStopsData) {
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
    routeStopIdBySource.set(`${String(stop.route_id)}|${sourceId}`, String(stop.stop_id));
  }
  const stationGroups = Array.from(stationGroupsMap.values());

  const { hubs, stationToHub } = buildHubs(stationGroups);
  const railHubRoutes = convertToHubSequences(railRoutesData, stationToHub);
  detectTermini(railHubRoutes, hubs);
  const { hubs: placedHubs } = placeHubs(railHubRoutes, hubs);
  const normalizedHubs = normalizeLayout(placedHubs);
  
  // Output: hubs → nodes (hub/station), routes → edges
  const layoutNodes = [];
  const layoutEdges = [];

  const hubById = new Map(normalizedHubs.map(h => [h.hub_id, h]));
  
  normalizedHubs.forEach(hub => {
    layoutNodes.push({
      id: hub.hub_id,
      x: hub.x,
      y: hub.y,
      type: 'hub',
      stations: [],
      hubScore: hub.hubScore
    });
  });

  // Place stations along hub segments
  const stationNodeById = new Map();
  for (const route of railHubRoutes) {
    const stopSeq = Array.isArray(route.stop_sequence) ? route.stop_sequence : [];
    if (stopSeq.length < 2) continue;
    let segStartIdx = 0;
    for (let i = 1; i < stopSeq.length; i++) {
      const prevStationId = stopSeq[i - 1];
      const currStationId = stopSeq[i];
      const prevHubId = stationToHub.get(prevStationId);
      const currHubId = stationToHub.get(currStationId);
      if (prevHubId !== currHubId) {
        const hubA = hubById.get(prevHubId);
        const hubB = hubById.get(currHubId);
        const segmentStops = stopSeq.slice(segStartIdx, i + 1);
        if (hubA && hubB && Number.isFinite(hubA.x) && Number.isFinite(hubB.x)) {
          const count = segmentStops.length;
          for (let s = 0; s < count; s++) {
            const t = count > 1 ? s / (count - 1) : 0;
            const x = hubA.x + (hubB.x - hubA.x) * t;
            const y = hubA.y + (hubB.y - hubA.y) * t;
            const sourceId = segmentStops[s];
            const fullStopId = routeStopIdBySource.get(`${route.route_id}|${sourceId}`);
            if (!fullStopId) continue;
            stationNodeById.set(fullStopId, {
              id: fullStopId,
              x,
              y,
              type: 'station',
            });
          }
        }
        segStartIdx = i;
      }
    }
  }

  // Ensure every stop gets a node (fallback to hub center)
  for (const stop of railStopsData) {
    const fullId = String(stop.stop_id);
    if (stationNodeById.has(fullId)) continue;
    const hubId = stationToHub.get(String(stop.source_stop_id || stop.stop_id));
    const hub = hubById.get(hubId);
    if (hub) {
      stationNodeById.set(fullId, {
        id: fullId,
        x: hub.x,
        y: hub.y,
        type: 'station',
      });
    }
  }

  for (const node of stationNodeById.values()) {
    layoutNodes.push(node);
  }
  
  railHubRoutes.forEach(route => {
    for (let i = 0; i < route.hub_sequence.length - 1; i++) {
      layoutEdges.push({
        from: route.hub_sequence[i],
        to: route.hub_sequence[i+1],
        route_id: route.route_id,
        type: 'rail'
      });
    }
  });
  
  // Bus corridors (simplified)
  // TODO: integrate bus_stops.json when populated
  // layoutNodes.push(...busNodes);
  // layoutEdges.push(...busEdges);
  
  writeFileSync(path.join('data-build', 'normalized', 'layout_nodes.json'), JSON.stringify(layoutNodes, null, 2));
  writeFileSync(path.join('data-build', 'normalized', 'layout_edges.json'), JSON.stringify(layoutEdges, null, 2));
  
  console.log(`✅ Layout complete: ${layoutNodes.length} nodes, ${layoutEdges.length} edges`);
  console.log('Files: data-build/normalized/layout_*.json');
}

main().catch(console.error);

