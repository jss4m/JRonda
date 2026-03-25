export function deriveMode(category) {
  const normalized = String(category || "").toUpperCase();
  const railCategories = ["MRT", "LRT", "KTM", "ERL", "MRL", "RAIL"];
  if (railCategories.includes(normalized)) return "RAIL";
  return "BUS";
}

import { MinHeap } from "../utils/min-heap.js";

// ======= Helpers =======

function toNumber(v) {
  return typeof v === "number" ? v : Number(v);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalStopId(stationLike) {
  const source = stationLike?.source_stop_id;
  if (source != null && String(source).trim()) return String(source).trim();
  const routeId = String(stationLike?.route_id || "");
  const stopId = String(stationLike?.stop_id || "");
  const prefix = routeId ? `${routeId}_` : "";
  if (prefix && stopId.startsWith(prefix)) return stopId.slice(prefix.length);
  return stopId;
}

// ======= buildGraph =======

export function buildGraph(stations) {
  const graph = new Map();
  const stationMap = new Map();

  const routes = new Map();
  for (const stationRecord of stations) {
    const stopId = String(stationRecord.stop_id);
    stationMap.set(stopId, {
      ...stationRecord,
      mode: deriveMode(stationRecord.category),
    });
    graph.set(stopId, []);
    const routeId = String(stationRecord.route_id || "");
    if (!routes.has(routeId)) routes.set(routeId, []);
    routes.get(routeId).push(stationRecord);
  }

  const canonicalRepresentativeById = new Map();
  for (const stationRecord of stations) {
    const canonicalId = canonicalStopId(stationRecord);
    if (!canonicalId || canonicalRepresentativeById.has(canonicalId)) continue;
    canonicalRepresentativeById.set(canonicalId, stationRecord);
  }

  const canonicalSequenceByRoute = new Map();
  const passThroughNodeByRouteCanonical = new Map();

  function getOrCreatePassThroughNode(routeId, canonicalId) {
    const passThroughKey = `${routeId}|${canonicalId}`;
    if (passThroughNodeByRouteCanonical.has(passThroughKey)) {
      return passThroughNodeByRouteCanonical.get(passThroughKey);
    }
    const sourceStation = canonicalRepresentativeById.get(canonicalId);
    const passThroughStopId = `PASS_${routeId}_${canonicalId}`;
    const passThroughNode = {
      stop_id: passThroughStopId,
      source_stop_id: canonicalId,
      stop_name: sourceStation?.stop_name || canonicalId,
      stop_lat: sourceStation?.stop_lat,
      stop_lon: sourceStation?.stop_lon,
      route_id: routeId,
      category: sourceStation?.category || "KTM",
      route_long_name: sourceStation?.route_long_name || "",
      route_public_name: sourceStation?.route_public_name || sourceStation?.route_long_name || "",
      route_color: sourceStation?.route_color ?? null,
      mode: deriveMode(sourceStation?.category),
      passThrough: true,
      hiddenInUI: true,
    };
    stationMap.set(passThroughStopId, passThroughNode);
    graph.set(passThroughStopId, []);
    passThroughNodeByRouteCanonical.set(passThroughKey, passThroughStopId);
    return passThroughStopId;
  }

function addDirectedEdge(fromStopId, toStopId, weightMeters, routeId, segmentKey) {
    const safeWeight = Number.isFinite(weightMeters) && weightMeters > 0 ? weightMeters : 1;
    graph.get(fromStopId).push({
      target: toStopId,
      weight: safeWeight,
      routeId,
      segmentKey,
      direction: 'forward'
    });
  }

  function addBidirectionalEdge(fromStopId, toStopId, weightMeters, routeId, segmentKey) {
    addDirectedEdge(fromStopId, toStopId, weightMeters, routeId, segmentKey);
    addDirectedEdge(toStopId, fromStopId, weightMeters, routeId, segmentKey);
  }

  for (const [routeId, routeStopsRaw] of routes.entries()) {
    const routeStops = routeStopsRaw
      .slice()
      .sort((leftStop, rightStop) => {
        const leftSeq = Number(leftStop.seq);
        const rightSeq = Number(rightStop.seq);
        const leftSortableSeq = Number.isFinite(leftSeq) ? leftSeq : Number.MAX_SAFE_INTEGER;
        const rightSortableSeq = Number.isFinite(rightSeq) ? rightSeq : Number.MAX_SAFE_INTEGER;
        if (leftSortableSeq !== rightSortableSeq) return leftSortableSeq - rightSortableSeq;
        return String(leftStop.stop_id).localeCompare(String(rightStop.stop_id));
      });

    const canonicalSequence = [];
    for (const stop of routeStops) {
      const canonicalId = canonicalStopId(stop);
      if (!canonicalId) continue;
      if (!canonicalSequence.length || canonicalSequence[canonicalSequence.length - 1] !== canonicalId) {
        canonicalSequence.push(canonicalId);
      }
    }
    canonicalSequenceByRoute.set(routeId, canonicalSequence);

    for (let i = 0; i < routeStops.length - 1; i++) {
      const fromStop = routeStops[i];
      const toStop = routeStops[i + 1];
      const fromStopId = String(fromStop.stop_id);
      const toStopId = String(toStop.stop_id);
      const fromSeq = Number(fromStop.seq);
      const toSeq = Number(toStop.seq);
      if (Number.isFinite(fromSeq) && Number.isFinite(toSeq) && Math.abs(toSeq - fromSeq) > 1) {
        continue;
      }
      const baseDistanceMeters = haversineMeters(
        toNumber(fromStop.stop_lat),
        toNumber(fromStop.stop_lon),
        toNumber(toStop.stop_lat),
        toNumber(toStop.stop_lon)
      );
      const fromCanonicalId = canonicalStopId(fromStop);
      const toCanonicalId = canonicalStopId(toStop);
      const segmentKey =
        fromCanonicalId < toCanonicalId
          ? `${fromCanonicalId}-${toCanonicalId}`
          : `${toCanonicalId}-${fromCanonicalId}`;
      const routeMode = deriveMode(routeStops[0]?.category);
      if (routeMode === 'RAIL') {
        addBidirectionalEdge(fromStopId, toStopId, baseDistanceMeters, routeId, segmentKey);
      } else {
        addDirectedEdge(fromStopId, toStopId, baseDistanceMeters, routeId, segmentKey);
      }
    }
  }

  function findCorridorIntermediates(fromCanonicalId, toCanonicalId, currentRouteId) {
    let bestIntermediates = [];
    for (const [otherRouteId, canonicalStops] of canonicalSequenceByRoute.entries()) {
      if (otherRouteId === currentRouteId || !Array.isArray(canonicalStops) || canonicalStops.length < 3) continue;
      const fromIndex = canonicalStops.indexOf(fromCanonicalId);
      const toIndex = canonicalStops.indexOf(toCanonicalId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) continue;
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      if (end - start < 2) continue;
      let corridorIntermediates = canonicalStops.slice(start + 1, end);
      if (fromIndex > toIndex) corridorIntermediates = corridorIntermediates.slice().reverse();
      if (corridorIntermediates.length > bestIntermediates.length) {
        bestIntermediates = corridorIntermediates;
      }
    }
    return bestIntermediates;
  }

  for (const [routeId, routeStopsRaw] of routes.entries()) {
    const routeStops = routeStopsRaw
      .slice()
      .sort((leftStop, rightStop) => {
        const leftSeq = Number(leftStop.seq);
        const rightSeq = Number(rightStop.seq);
        const leftSortableSeq = Number.isFinite(leftSeq) ? leftSeq : Number.MAX_SAFE_INTEGER;
        const rightSortableSeq = Number.isFinite(rightSeq) ? rightSeq : Number.MAX_SAFE_INTEGER;
        if (leftSortableSeq !== rightSortableSeq) return leftSortableSeq - rightSortableSeq;
        return String(leftStop.stop_id).localeCompare(String(rightStop.stop_id));
      });

    for (let i = 0; i < routeStops.length - 1; i++) {
      const fromStop = routeStops[i];
      const toStop = routeStops[i + 1];
      const fromSeq = Number(fromStop.seq);
      const toSeq = Number(toStop.seq);
      if (Number.isFinite(fromSeq) && Number.isFinite(toSeq) && Math.abs(toSeq - fromSeq) > 1) {
        continue;
      }
      const fromCanonicalId = canonicalStopId(fromStop);
      const toCanonicalId = canonicalStopId(toStop);
      if (!fromCanonicalId || !toCanonicalId || fromCanonicalId === toCanonicalId) continue;

      const intermediates = findCorridorIntermediates(fromCanonicalId, toCanonicalId, routeId);
      if (!intermediates.length) continue;

      const fromStopId = String(fromStop.stop_id);
      const toStopId = String(toStop.stop_id);
      const segmentKey =
        fromCanonicalId < toCanonicalId
          ? `${fromCanonicalId}-${toCanonicalId}`
          : `${toCanonicalId}-${fromCanonicalId}`;
      const edgeList = graph.get(fromStopId) || [];
      const reverseEdgeList = graph.get(toStopId) || [];
      const edgeIndex = edgeList.findIndex(
        (edge) => edge.target === toStopId && String(edge.routeId || "") === String(routeId)
      );
      const reverseEdgeIndex = reverseEdgeList.findIndex(
        (edge) => edge.target === fromStopId && String(edge.routeId || "") === String(routeId)
      );
      if (edgeIndex < 0 || reverseEdgeIndex < 0) continue;
      const originalWeight = Number(edgeList[edgeIndex].weight) || 1;
      edgeList.splice(edgeIndex, 1);
      reverseEdgeList.splice(reverseEdgeIndex, 1);

      const chainStopIds = [
        fromStopId,
        ...intermediates.map((canonicalId) => getOrCreatePassThroughNode(routeId, canonicalId)),
        toStopId,
      ];
      const segmentWeight = Math.max(1, originalWeight / Math.max(1, chainStopIds.length - 1));
      for (let chainIndex = 0; chainIndex < chainStopIds.length - 1; chainIndex++) {
        const chainRouteMode = deriveMode(routeStops[0]?.category);
        if (chainRouteMode === 'RAIL') {
          addBidirectionalEdge(
            String(chainStopIds[chainIndex]),
            String(chainStopIds[chainIndex + 1]),
            segmentWeight,
            routeId,
            segmentKey
          );
        } else {
          addDirectedEdge(
            String(chainStopIds[chainIndex]),
            String(chainStopIds[chainIndex + 1]),
            segmentWeight,
            routeId,
            segmentKey
          );
        }
      }
    }
  }

  const routesBySegmentKey = new Map();
  for (const edges of graph.values()) {
    for (const edge of edges) {
      const key = String(edge.segmentKey || "");
      if (!key) continue;
      if (!routesBySegmentKey.has(key)) routesBySegmentKey.set(key, new Set());
      routesBySegmentKey.get(key).add(String(edge.routeId || ""));
    }
  }
  for (const edges of graph.values()) {
    for (const edge of edges) {
      const shared = routesBySegmentKey.get(String(edge.segmentKey || ""));
      edge.sharedRouteIds = shared ? Array.from(shared).sort() : [];
    }
  }

  // Explicit transfer edges only (no coordinate proximity collapse):
  // 1) Same canonical/source stop id across routes.
  // 2) Fallback: same normalized stop_name across routes when canonical id is missing.
  const stationArray = Array.from(stationMap.values());
  const byCanonical = new Map();
  const byName = new Map();
  for (const s of stationArray) {
    const canonical = canonicalStopId(s);
    if (canonical) {
      if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
      byCanonical.get(canonical).push(s);
    }
    const nameKey = normalizeName(s.stop_name);
    if (nameKey) {
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(s);
    }
  }

  const seenTransferPairs = new Set();
  function connectTransferGroup(group, weight = 5) {
    if (!Array.isArray(group) || group.length < 2) return;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (!a || !b) continue;
        if (String(a.stop_id) === String(b.stop_id)) continue;
        if (String(a.route_id) === String(b.route_id)) continue;
        const pair =
          String(a.stop_id) < String(b.stop_id)
            ? `${a.stop_id}:${b.stop_id}`
            : `${b.stop_id}:${a.stop_id}`;
        if (seenTransferPairs.has(pair)) continue;
        addBidirectionalEdge(String(a.stop_id), String(b.stop_id), weight, null, 'transfer');
        seenTransferPairs.add(pair);
      }
    }
  }

  for (const group of byCanonical.values()) {
    connectTransferGroup(group, 5);
  }
  for (const group of byName.values()) {
    connectTransferGroup(group, 8);
  }

  return { graph, stationMap };
}

const PRESETS = {
  SMART: { railBias: 0.4, transferPenalty: 3000, routeChangePenalty: 1100 },
  FAST: { railBias: 0.7, transferPenalty: 1500, routeChangePenalty: 700 },
  BUDGET: { railBias: -0.2, transferPenalty: 500, routeChangePenalty: 350 },
};

// ======= createCostModel =======

export function createCostModel(presetName = "SMART") {
  const preset = PRESETS[presetName] || PRESETS.SMART;
  const options = arguments[1] || {};
  const routeHeadwayMinutes = options.routeHeadwayMinutes instanceof Map
    ? options.routeHeadwayMinutes
    : new Map();
  const DEFAULT_HEADWAY_MIN = {
    RAIL: 8,
    BUS: 15,
    TOURIST: 30,
  };
  const WAIT_WEIGHT_PER_MIN = 220;

  function resolveHeadwayMin(routeId, mode) {
    const fromMap = routeHeadwayMinutes.get(String(routeId || ""));
    if (Number.isFinite(fromMap) && fromMap > 0) return fromMap;
    return DEFAULT_HEADWAY_MIN[String(mode || "").toUpperCase()] || 12;
  }

  return function computeWeight(edge, prevMode, nextMode, prevRoute, nextRoute) {
    let multiplier = nextMode === "RAIL" ? 1 - preset.railBias : 1;
    let weight = edge.weight * multiplier;
    if (prevMode && prevMode !== nextMode) weight += preset.transferPenalty;
    if (prevRoute && nextRoute && prevRoute !== nextRoute) {
      weight += preset.routeChangePenalty;
    }

    const isInitialBoarding = !prevRoute && !!nextRoute;
    const isRouteChange = !!prevRoute && !!nextRoute && prevRoute !== nextRoute;
    if (isInitialBoarding || isRouteChange) {
      const headwayMin = resolveHeadwayMin(nextRoute, nextMode);
      const avgWaitMin = headwayMin * 0.5;
      weight += avgWaitMin * WAIT_WEIGHT_PER_MIN;
    }

    return weight;
  };
}

// ======= Route Metrics =======

function calculateMetrics(path, stationMap, graph) {
  let totalDistance = 0;
  let transfers = 0;
  let etaMinutes = 0;
  let prevRoute = null;

  const SPEED_METERS_PER_MIN = {
    RAIL: 560,
    BUS: 330,
    TOURIST: 260,
  };
  const WALK_METERS_PER_MIN = 78;
  const TRANSFER_WAIT_MIN = 3;

  for (let i = 0; i < path.length - 1; i++) {
    const fromId = String(path[i]);
    const toId = String(path[i + 1]);
    const a = stationMap.get(fromId);
    const b = stationMap.get(toId);
    if (!a || !b) continue;

    const edge = (graph.get(fromId) || []).find((candidate) => String(candidate.target) === toId);
    const isTransferEdge = !edge?.routeId;

    let legDistance = Number(edge?.weight);
    if (!Number.isFinite(legDistance) || legDistance <= 0) {
      legDistance = haversineMeters(
        toNumber(a.stop_lat),
        toNumber(a.stop_lon),
        toNumber(b.stop_lat),
        toNumber(b.stop_lon)
      );
    }
    if (!Number.isFinite(legDistance) || legDistance <= 0) legDistance = 1;

    if (isTransferEdge) {
      legDistance = Math.max(120, Math.min(400, legDistance));
    } else {
      legDistance = Math.max(10, Math.min(30000, legDistance));
    }

    totalDistance += legDistance;

    if (prevRoute && prevRoute !== b.route_id) {
      transfers++;
      etaMinutes += TRANSFER_WAIT_MIN;
    }

    const legMode = isTransferEdge ? "WALK" : String(b.mode || a.mode || "BUS").toUpperCase();
    const speed = legMode === "WALK"
      ? WALK_METERS_PER_MIN
      : (SPEED_METERS_PER_MIN[legMode] || SPEED_METERS_PER_MIN.BUS);
    etaMinutes += legDistance / speed;

    prevRoute = b.route_id;
  }

  const eta = Math.max(1, Math.min(1440, Math.round(etaMinutes)));
  const rawDistance = Math.round(totalDistance);
  const formattedDistance = formatDistance(rawDistance);
  return { path, distance: rawDistance, formattedDistance, eta, transfers };
}

function formatDistance(meters) {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;

}

// ======= computeRoute =======

function computeRoute(startId, endId, graph, stationMap, costModel, excludedEdges = null) {
  if (!startId || !endId || !graph.has(startId) || !graph.has(endId)) {
    return { path: [], distance: 0, eta: 0, transfers: 0 };
  }
  if (startId === endId) {
    return { path: [startId], distance: 0, eta: 0, transfers: 0 };
  }

  const distances = new Map();
  const previous = new Map();
  const previousMode = new Map();
  const previousRoute = new Map();
  const heap = new MinHeap();

  for (let key of graph.keys()) distances.set(key, Infinity);
  distances.set(startId, 0);
  heap.enqueue(startId, 0);

  while (!heap.isEmpty()) {
    const currentNode = heap.dequeue();
    if (!currentNode) break;
    const { value: current, priority: queuedDistance } = currentNode;
    const bestKnownDistance = distances.get(current);
    if (queuedDistance > bestKnownDistance) continue;

    if (current === endId) break;

    const currentDistance = bestKnownDistance;
    const prevMode = previousMode.get(current);
    const prevRoute = previousRoute.get(current);
    const neighbors = graph.get(current) || [];

    for (const edge of neighbors) {
      const neighbor = edge.target;
      if (excludedEdges && excludedEdges.has(`${current}>${neighbor}`)) continue;
      const nextStation = stationMap.get(neighbor);
      if (!nextStation) continue;
      const nextMode = nextStation.mode;
      const nextRoute = String(nextStation.route_id || "");

      const weight = costModel(edge, prevMode, nextMode, prevRoute, nextRoute);
      const newDistance = currentDistance + weight;

      if (newDistance < distances.get(neighbor)) {
        distances.set(neighbor, newDistance);
        previous.set(neighbor, current);
        previousMode.set(neighbor, nextMode);
        previousRoute.set(neighbor, nextRoute);
        heap.enqueue(neighbor, newDistance);
      }
    }
  }

  const path = [];
  let curr = endId;
  while (curr) {
    path.unshift(curr);
    curr = previous.get(curr);
  }

  if (!path.length || path[0] !== startId) return { path: [], distance: 0, eta: 0, transfers: 0 };
  return calculateMetrics(path, stationMap, graph);
}

function findRouteReentryEdge(path, stationMap) {
  if (!Array.isArray(path) || path.length < 4) return null;
  const routeSeq = [];
  for (const stopId of path) {
    const s = stationMap.get(stopId);
    if (!s) continue;
    const routeId = String(s.route_id || "");
    if (!routeSeq.length || routeSeq[routeSeq.length - 1].routeId !== routeId) {
      routeSeq.push({ routeId, stopId });
    }
  }
  if (routeSeq.length < 3) return null;

  const firstSeen = new Map();
  for (let i = 0; i < routeSeq.length; i++) {
    const routeId = routeSeq[i].routeId;
    if (!firstSeen.has(routeId)) {
      firstSeen.set(routeId, i);
      continue;
    }
    const prevIndex = firstSeen.get(routeId);
    if (i - prevIndex >= 2) {
      const reentryStopId = routeSeq[i].stopId;
      const pathIdx = path.indexOf(reentryStopId);
      if (pathIdx > 0) {
        return {
          forward: `${path[pathIdx - 1]}>${path[pathIdx]}`,
          reverse: `${path[pathIdx]}>${path[pathIdx - 1]}`,
        };
      }
    }
  }
  return null;
}

// ======= computeKRoutes =======

export function computeKRoutes(startId, endId, graph, stationMap, k = 3, costModel) {
  if (!startId || !endId || startId === endId) return [];
  const routes = [];
  const excludedEdges = new Set();
  const MAX_ATTEMPTS = Math.max(8, k * 6);
  let attempts = 0;

  while (routes.length < k && attempts < MAX_ATTEMPTS) {
    attempts++;
    const result = computeRoute(
      startId,
      endId,
      graph,
      stationMap,
      costModel,
      excludedEdges
    );
    if (!result.path.length) break;

    const loopEdge = findRouteReentryEdge(result.path, stationMap);
    if (loopEdge) {
      excludedEdges.add(loopEdge.forward);
      excludedEdges.add(loopEdge.reverse);
      continue;
    }

    routes.push(result);

    const from = result.path[0];
    const to = result.path[1];
    if (!to) break;
    excludedEdges.add(`${from}>${to}`);
  }

  return routes;
}

// ======= End of routerLogic.js =======
