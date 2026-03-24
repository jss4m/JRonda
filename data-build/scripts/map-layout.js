/**
 * Map Layout Engine - Full Transit Schematic per Spec
 * Generates layout_nodes.json + layout_edges.json
 * Run: node data-build/scripts/run-layout.js
 * v1: Full rail + basic bus attachment. Corridors/rules v2.
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const normalizedDir = path.join('data-build', 'normalized');

// Load data
const railStopsData = JSON.parse(readFileSync(path.join(normalizedDir, 'rail_stops.json'), 'utf8'));
const railRoutesData = JSON.parse(readFileSync(path.join(normalizedDir, 'rail_routes.json'), 'utf8'));
const busStopsData = JSON.parse(readFileSync(path.join(normalizedDir, 'bus_stops.json'), 'utf8'));
const busRoutesData = JSON.parse(readFileSync(path.join(normalizedDir, 'bus_routes.json'), 'utf8'));

// Constants (tune as needed)
const MAX_HUB_DISTANCE_METERS_RAIL = 100;
const MAX_HUB_DISTANCE_METERS_BUS = 60;
const HUB_DISTANCE_PX_RAIL = 120;
const HUB_DISTANCE_PX_BUS = 70;
const MIN_HUB_DISTANCE_PX = 80;
const MIN_SEGMENT_PX = 40;
const LANE_SPACING_PX = 8;
const VIEWPORT_PADDING_PX = 40;
const INTERCHANGE_MAX_METERS = 300;
const CORRIDOR_OVERLAP_THRESHOLD = 0.6;
const TERMINUS_EXTENSION_PX = 100;
const MIN_BUS_RAIL_DISTANCE_PX = 50;
const LABEL_OFFSET_PX = 20;
const MAX_LINES_PER_DIRECTION = 3;
const CARDINAL_ANGLES = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];

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
  return CARDINAL_ANGLES.reduce((best, cand) => Math.abs(cand - angle) < Math.abs(best - angle) ? cand : best);
}

function snapAngle45(angle) {
  return CARDINAL_ANGLES.reduce((best, cand) => Math.abs(cand - angle) < Math.abs(best - angle) ? cand : best);
}

// Generic hub builder
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
  }
  const stationGroups = Array.from(stationGroupsMap.values());

  // Union-find for merging
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
      if (d < maxDistMeters) union(i,j);
    }
  }

  const hubMap = new Map();
  for (let i=0; i<n; i++) {
    const root = find(i);
    if (!hubMap.has(root)) hubMap.set(root, []);
    hubMap.get(root).push(stationGroups[i]);
  }

  const hubs = [];
  const stationToHub = new Map();
  for (const groups of hubMap.values()) {
    const avgLat = groups.reduce((sum,s)=>sum + s.lat,0) / groups.length;
    const avgLon = groups.reduce((sum,s)=>sum + s.lon,0) / groups.length;
    const hub = {
      hub_id: `H${hubs.length}_${mode}`,
      stations: [],
      lat: avgLat,
      lon: avgLon,
      routes: new Set(),
      hubScore: 0,
      x: null,
      y: null,
      mode,
      nearestRailHubId: null, // for bus
    };
    for (const g of groups) {
      for (const fullId of g.fullStopIds) {
        stationToHub.set(fullId, hub.hub_id);
        hub.stations.push(fullId);
      }
      for (const r of g.routes) hub.routes.add(r);
    }
    hubs.push(hub);
  }
  return {hubs, stationToHub};
}

// Hub scoring and sorting
function computeHubScores(hubs, routesData) {
  hubs.forEach(hub => {
    const uniqueRoutes = new Set();
    routesData.forEach(route => {
      if (route.hub_sequence?.includes(hub.hub_id)) uniqueRoutes.add(route.route_id);
    });
    hub.hubScore = uniqueRoutes.size;
  });
  hubs.sort((a,b) => b.hubScore - a.hubScore);
}

// Initial radial placement
function initialRadialPlacement(hubs) {
  if (hubs.length === 0) return;
  const origin = hubs[0];
  origin.x = 0;
  origin.y = 0;
  const hubById = new Map(hubs.map(h => [h.hub_id, h]));
  for (let i=1; i<hubs.length; i++) {
    const hub = hubs[i];
    const geoDx = hub.lon - origin.lon;
    const geoDy = hub.lat - origin.lat;
    const geoDist = haversineMeters(origin.lat, origin.lon, hub.lat, hub.lon);
    const tier = Math.round(geoDist / 5000);
    const layoutDist = tier * HUB_DISTANCE_PX_RAIL;
    const angle = snapDirection(geoDx, geoDy);
    hub.x = Math.cos(angle) * layoutDist;
    hub.y = Math.sin(angle) * layoutDist;
    hubById.set(hub.hub_id, hub);
  }
  return hubById;
}

// Iterative hub anti-collision push
function hubPush(hubs, maxPasses = 20) {
  let passes = 0;
  let pushed = true;
  while (pushed && passes < maxPasses) {
    pushed = false;
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const ha = hubs[i], hb = hubs[j];
        const dx = hb.x - ha.x;
        const dy = hb.y - ha.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MIN_HUB_DISTANCE_PX && dist > 0) {
          const norm = dist;
          const pushDist = (MIN_HUB_DISTANCE_PX - dist) / 2;
          ha.x -= (dx / norm) * pushDist;
          ha.y -= (dy / norm) * pushDist;
          hb.x += (dx / norm) * pushDist;
          hb.y += (dy / norm) * pushDist;
          pushed = true;
        }
      }
    }
    passes++;
  }
  console.log(`Hub push complete after ${passes} passes`);
}

// Route to hub sequences (current)
function convertToHubSequences(routesData, stationToHub) {
  // same as current
  const hubRoutes = [];
  routesData.forEach(route => {
    const stops = route.stops.map(s => stationToHub.get(s.stop_id)).filter(Boolean);
    const uniqueHubSeq = [];
    stops.forEach(hubId => {
      if (uniqueHubSeq[uniqueHubSeq.length - 1] !== hubId) uniqueHubSeq.push(hubId);
    });
    if (uniqueHubSeq.length > 1) {
      hubRoutes.push({
        route_id: route.route_id,
        hub_sequence: uniqueHubSeq,
        stop_sequence: route.stops.map(s => s.stop_id),
        direction: null, // set later
      });
    }
  });
  return hubRoutes;
}

// Bus-rail connections
function connectBusHubsToRail(busHubs, railHubs) {
  const railHubById = new Map(railHubs.map(h => [h.hub_id, h]));
  busHubs.forEach(bHub => {
    let minDist = Infinity;
    let nearest = null;
    railHubs.forEach(rHub => {
      const d = haversineMeters(bHub.lat, bHub.lon, rHub.lat, rHub.lon);
      if (d < INTERCHANGE_MAX_METERS && d < minDist) {
        minDist = d;
        nearest = rHub;
      }
    });
    if (nearest) {
      bHub.nearestRailHubId = nearest.hub_id;
      bHub.interchangeDist = minDist;
    }
  });
}

// Place bus hubs attached to rail
function placeBusHubs(busHubs, railHubById) {
  busHubs.forEach(bHub => {
    if (!bHub.nearestRailHubId) return;
    const rHub = railHubById.get(bHub.nearestRailHubId);
    if (!rHub || !Number.isFinite(rHub.x)) return;
    const geoDx = bHub.lon - rHub.lon;
    const geoDy = bHub.lat - rHub.lat;
    const angle = snapDirection(geoDx, geoDy);
    bHub.x = rHub.x + Math.cos(angle) * HUB_DISTANCE_PX_BUS;
    bHub.y = rHub.y + Math.sin(angle) * HUB_DISTANCE_PX_BUS;
  });
}

function terminusCorrection(hubRoutes, hubById) {
  const terminalUse = new Map();
  for (const route of hubRoutes) {
    if (!route.hub_sequence?.length) continue;
    const firstId = route.hub_sequence[0];
    const lastId = route.hub_sequence[route.hub_sequence.length - 1];
    if (firstId && firstId !== lastId) {
      terminalUse.set(lastId, (terminalUse.get(lastId) || 0) + 1);
    }
  }

  for (const route of hubRoutes) {
    const seq = route.hub_sequence || [];
    if (seq.length < 2) continue;
    const firstHub = hubById.get(seq[0]);
    const lastHub = hubById.get(seq[seq.length - 1]);
    if (!firstHub || !lastHub) continue;
    if ((terminalUse.get(lastHub.hub_id) || 0) > 1) continue;
    if (!Number.isFinite(firstHub.x) || !Number.isFinite(lastHub.x)) continue;

    const geoDx = lastHub.lon - firstHub.lon;
    const geoDy = lastHub.lat - firstHub.lat;
    const angle = snapDirection(geoDx, geoDy);
    lastHub.x += Math.cos(angle) * TERMINUS_EXTENSION_PX;
    lastHub.y += Math.sin(angle) * TERMINUS_EXTENSION_PX;
  }
}

function detectBusCorridors(busHubRoutes, overlapThreshold = CORRIDOR_OVERLAP_THRESHOLD) {
  const corridors = [];
  const used = new Set();
  let counter = 1;

  function stopSet(route) {
    const ids = (route.stop_sequence || []).map(String);
    return new Set(ids);
  }

  for (let i = 0; i < busHubRoutes.length; i++) {
    const a = busHubRoutes[i];
    if (used.has(a.route_id)) continue;
    const aSet = stopSet(a);
    for (let j = i + 1; j < busHubRoutes.length; j++) {
      const b = busHubRoutes[j];
      if (used.has(b.route_id)) continue;
      const bSet = stopSet(b);
      let shared = 0;
      for (const id of aSet) if (bSet.has(id)) shared++;
      const denom = Math.min(aSet.size || 1, bSet.size || 1);
      const overlap = shared / denom;
      if (overlap >= overlapThreshold) {
        const mergedHubSeq = (a.hub_sequence.length >= b.hub_sequence.length ? a.hub_sequence : b.hub_sequence);
        corridors.push({
          corridor_id: `C${counter++}`,
          routes: [a.route_id, b.route_id],
          hub_sequence: mergedHubSeq.slice(),
        });
        used.add(a.route_id);
        used.add(b.route_id);
        break;
      }
    }
  }

  const remaining = busHubRoutes.filter(r => !used.has(r.route_id));
  return { corridors, remainingRoutes: remaining };
}

function applyBusCollisionRule(busHubs, railHubs) {
  for (const bHub of busHubs) {
    let nearest = null;
    let minDist = Infinity;
    for (const rHub of railHubs) {
      if (!Number.isFinite(rHub.x) || !Number.isFinite(rHub.y)) continue;
      const dx = bHub.x - rHub.x;
      const dy = bHub.y - rHub.y;
      const d = Math.hypot(dx, dy);
      if (d < minDist) {
        minDist = d;
        nearest = rHub;
      }
    }
    if (!nearest || !Number.isFinite(minDist)) continue;
    if (minDist >= MIN_BUS_RAIL_DISTANCE_PX) continue;
    const dx = bHub.x - nearest.x;
    const dy = bHub.y - nearest.y;
    const angle = snapDirection(dx, dy);
    const shift = MIN_BUS_RAIL_DISTANCE_PX - minDist;
    bHub.x += Math.cos(angle) * shift;
    bHub.y += Math.sin(angle) * shift;
  }
}

// Edge groups for lanes
function buildEdgeGroups(hubRoutes, hubById) {
  const edgeGroups = new Map(); // `${from}|${to}` -> {routes:[], count}
  hubRoutes.forEach(route => {
    const routeIds = Array.isArray(route.route_ids) ? route.route_ids : [route.route_id];
    for (let i = 0; i < route.hub_sequence.length - 1; i++) {
      const from = route.hub_sequence[i];
      const to = route.hub_sequence[i + 1];
      const key = `${from}|${to}`;
      if (!edgeGroups.has(key)) edgeGroups.set(key, {routes: new Set(), count: 0});
      routeIds.forEach(rid => edgeGroups.get(key).routes.add(rid));
    }
  });
  // Convert to arrays
  const groups = [];
  for (const [key, g] of edgeGroups) {
    g.route_ids = Array.from(g.routes);
    g.count = g.route_ids.length;
    g.from = key.split('|')[0];
    g.to = key.split('|')[1];
    [g.fromHub, g.toHub] = [hubById.get(g.from), hubById.get(g.to)];
    groups.push(g);
  }
  return groups;
}

function collapseShortSegments(hubRoutes, hubById, minLenPx = MIN_SEGMENT_PX) {
  for (const route of hubRoutes) {
    const seq = route.hub_sequence || [];
    if (seq.length < 3) continue;
    const collapsed = [seq[0]];
    for (let i = 1; i < seq.length; i++) {
      const prevId = collapsed[collapsed.length - 1];
      const currId = seq[i];
      const a = hubById.get(prevId);
      const b = hubById.get(currId);
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) {
        collapsed.push(currId);
        continue;
      }
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < minLenPx && i < seq.length - 1) {
        continue;
      }
      collapsed.push(currId);
    }
    route.hub_sequence = collapsed;
  }
}

// Station interpolation
function placeStationsAlongEdges(routesData, stationToHub, hubById) {
  const stationNodeById = new Map();
  routesData.forEach(route => {
    const stopSeq = route.stop_sequence || [];
    let segStart = 0;
    for (let i = 1; i <= stopSeq.length; i++) {
      const prevStopId = stopSeq[i - 1];
      const currStopId = stopSeq[i];
      const prevHub = stationToHub.get(prevStopId);
      const currHub = stationToHub.get(currStopId);
      if (i === stopSeq.length || prevHub !== currHub) {
        const segmentStops = stopSeq.slice(segStart, i);
        if (prevHub && currHub && prevHub !== currHub && segmentStops.length > 0) {
          const ha = hubById.get(prevHub);
          const hb = hubById.get(currHub);
          if (ha && hb) {
            const count = segmentStops.length;
            for (let s = 0; s < count; s++) {
              const t = count > 1 ? s / (count - 1) : 0.5;
              let x = ha.x + (hb.x - ha.x) * t;
              let y = ha.y + (hb.y - ha.y) * t;
              if (Math.abs(x - ha.x) < LABEL_OFFSET_PX && Math.abs(y - ha.y) < LABEL_OFFSET_PX) {
                const nt = Math.min(1, t + 0.15);
                x = ha.x + (hb.x - ha.x) * nt;
                y = ha.y + (hb.y - ha.y) * nt;
              }
              if (Math.abs(x - hb.x) < LABEL_OFFSET_PX && Math.abs(y - hb.y) < LABEL_OFFSET_PX) {
                const nt = Math.max(0, t - 0.15);
                x = ha.x + (hb.x - ha.x) * nt;
                y = ha.y + (hb.y - ha.y) * nt;
              }
              const fullStopId = segmentStops[s];
              stationNodeById.set(fullStopId, {id: fullStopId, x, y, type: 'station'});
            }
          }
        }
        segStart = i;
      }
    }
  });
  // Fallback: place unplaced at hub centers (simplified)
  return stationNodeById;
}

function applyReadabilityRules(layoutEdges, hubById) {
  // Rule A: fan edges per hub by angle
  const edgesByHub = new Map();
  for (const e of layoutEdges) {
    if (!edgesByHub.has(e.from)) edgesByHub.set(e.from, []);
    edgesByHub.get(e.from).push(e);
    if (!edgesByHub.has(e.to)) edgesByHub.set(e.to, []);
    edgesByHub.get(e.to).push(e);
  }

  for (const [hubId, edges] of edgesByHub) {
    const hub = hubById.get(hubId);
    if (!hub) continue;
    const grouped = new Map();
    for (const e of edges) {
      const otherId = e.from === hubId ? e.to : e.from;
      const other = hubById.get(otherId);
      if (!other) continue;
      const angle = snapAngle45(Math.atan2(other.y - hub.y, other.x - hub.x));
      if (!grouped.has(angle)) grouped.set(angle, []);
      grouped.get(angle).push(e);
    }
    for (const [angle, group] of grouped) {
      if (group.length <= MAX_LINES_PER_DIRECTION) continue;
      const centerIndex = (group.length - 1) / 2;
      group.forEach((edge, idx) => {
        edge.angle_offset = (idx - centerIndex) * (5 * Math.PI / 180);
        edge.base_angle = angle;
      });
    }
  }

  // Rule C: crossing penalty - tag intersections
  function segmentsIntersect(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = cross(a, b, c);
    const d2 = cross(a, b, d);
    const d3 = cross(c, d, a);
    const d4 = cross(c, d, b);
    return (d1 * d2 < 0 && d3 * d4 < 0);
  }

  for (let i = 0; i < layoutEdges.length; i++) {
    const e1 = layoutEdges[i];
    const a1 = hubById.get(e1.from);
    const b1 = hubById.get(e1.to);
    if (!a1 || !b1) continue;
    for (let j = i + 1; j < layoutEdges.length; j++) {
      const e2 = layoutEdges[j];
      if (e1.from === e2.from || e1.from === e2.to || e1.to === e2.from || e1.to === e2.to) continue;
      const a2 = hubById.get(e2.from);
      const b2 = hubById.get(e2.to);
      if (!a2 || !b2) continue;
      if (segmentsIntersect(a1, b1, a2, b2)) {
        e1.force_crossing_angle = 90;
        e2.force_crossing_angle = 90;
      }
    }
  }
}


// Normalize to viewport
function normalizeLayout(nodes, svgWidth = 1000, svgHeight = 1000) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    if (Number.isFinite(n.x)) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
  });
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scaleX = (svgWidth - 2 * VIEWPORT_PADDING_PX) / width;
  const scaleY = (svgHeight - 2 * VIEWPORT_PADDING_PX) / height;
  const scale = Math.min(scaleX, scaleY);
  const cx = (svgWidth - width * scale) / 2 - minX * scale;
  const cy = (svgHeight - height * scale) / 2 - minY * scale;
  nodes.forEach(n => {
    if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
      n.x = n.x * scale + cx;
      n.y = n.y * scale + cy;
    }
  });
}

// MAIN
async function main() {

  // Rail
  const {hubs: railHubs, stationToHub: railStationToHub} = buildHubs(railStopsData, MAX_HUB_DISTANCE_METERS_RAIL, 'rail');
  const railHubRoutes = convertToHubSequences(railRoutesData, railStationToHub);
  computeHubScores(railHubs, railHubRoutes);
  const railHubById = initialRadialPlacement(railHubs);
  hubPush(railHubs);
  terminusCorrection(railHubRoutes, railHubById);
  // Route directions
  railHubRoutes.forEach(route => {
    if (route.hub_sequence.length > 1) {
      const start = railHubById.get(route.hub_sequence[0]);
      const end = railHubById.get(route.hub_sequence[route.hub_sequence.length-1]);
      if (start && end) route.direction = snapDirection(end.lon - start.lon, end.lat - start.lat);
    }
  });

  // Bus
  const {hubs: busHubs, stationToHub: busStationToHub} = buildHubs(busStopsData, MAX_HUB_DISTANCE_METERS_BUS, 'bus');
  const busHubRoutes = convertToHubSequences(busRoutesData, busStationToHub);
  computeHubScores(busHubs, busHubRoutes);
  connectBusHubsToRail(busHubs, railHubs);
  placeBusHubs(busHubs, railHubById);
  applyBusCollisionRule(busHubs, railHubs);
  hubPush([...railHubs, ...busHubs]); // joint push

  // Edges (rail + bus)
  const railEdgeGroups = buildEdgeGroups(railHubRoutes, railHubById);
  const busHubById = new Map([...railHubById, ...busHubs.map(h => [h.hub_id, h])]);

  collapseShortSegments(railHubRoutes, railHubById, MIN_SEGMENT_PX);
  collapseShortSegments(busHubRoutes, busHubById, MIN_SEGMENT_PX);

  const { corridors, remainingRoutes } = detectBusCorridors(busHubRoutes, CORRIDOR_OVERLAP_THRESHOLD);
  const corridorRoutes = corridors.map(c => ({
    route_id: c.corridor_id,
    route_ids: c.routes,
    hub_sequence: c.hub_sequence,
    stop_sequence: [],
  }));
  const busEdgeGroups = buildEdgeGroups([...remainingRoutes, ...corridorRoutes], busHubById);

  // Nodes
  const layoutNodes = [...railHubs.map(h => ({...h, type: 'hub', radius: 12 + h.hubScore * 2})), // label space
    ...busHubs.map(h => ({...h, type: 'bus-hub', radius: 8 + h.hubScore}))];

  // Stations rail + bus
const railStations = placeStationsAlongEdges(railHubRoutes, railStationToHub, railHubById);
const busStations = placeStationsAlongEdges(busHubRoutes, busStationToHub, busHubById);
  layoutNodes.push(...railStations.values(), ...busStations.values());

  // Edges
  const layoutEdges = [
    ...railEdgeGroups.map(g => ({from: g.from, to: g.to, route_ids: g.route_ids, type: 'rail', lanes: g.count})),
    ...busEdgeGroups.map(g => ({from: g.from, to: g.to, route_ids: g.route_ids, type: 'bus', lanes: g.count}))
  ];

  applyReadabilityRules(layoutEdges, busHubById);

  normalizeLayout(layoutNodes);

  writeFileSync(path.join(normalizedDir, 'layout_nodes.json'), JSON.stringify(layoutNodes, null, 2));
  writeFileSync(path.join(normalizedDir, 'layout_edges.json'), JSON.stringify(layoutEdges, null, 2));
}

main().catch(console.error);
