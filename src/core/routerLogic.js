export function deriveMode(category) {
  const normalized = String(category || "").toUpperCase();
  const railCategories = ["MRT", "LRT", "KTM", "ERL", "MRL"];
  if (railCategories.includes(normalized)) return "RAIL";

  if (normalized === "HOHO") return "TOURIST";

  return "BUS";
}

class MinHeap {
  constructor() {
    this.heap = [];
  }

  enqueue(value, priority) {
    this.heap.push({ value, priority });
    this.bubbleUp();
  }

  dequeue() {
    if (!this.heap.length) return null;
    const min = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length) {
      this.heap[0] = end;
      this.sinkDown();
    }
    return min;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  bubbleUp() {
    let idx = this.heap.length - 1;
    const element = this.heap[idx];
    while (idx > 0) {
      let parentIdx = Math.floor((idx - 1) / 2);
      let parent = this.heap[parentIdx];
      if (element.priority >= parent.priority) break;
      this.heap[parentIdx] = element;
      this.heap[idx] = parent;
      idx = parentIdx;
    }
  }

  sinkDown() {
    let idx = 0;
    const length = this.heap.length;
    const element = this.heap[0];

    while (true) {
      let leftIdx = 2 * idx + 1;
      let rightIdx = 2 * idx + 2;
      let swap = null;

      if (leftIdx < length) {
        if (this.heap[leftIdx].priority < element.priority) swap = leftIdx;
      }

      if (rightIdx < length) {
        const comparePriority =
          swap === null ? element.priority : this.heap[leftIdx].priority;
        if (this.heap[rightIdx].priority < comparePriority) swap = rightIdx;
      }

      if (swap === null) break;
      this.heap[idx] = this.heap[swap];
      this.heap[swap] = element;
      idx = swap;
    }
  }
}

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

function gridKey(lat, lon, cellDeg) {
  return `${Math.floor(lat / cellDeg)}:${Math.floor(lon / cellDeg)}`;
}

// ======= buildGraph =======

export function buildGraph(stations, toleranceMeters = 15) {
  const graph = new Map();
  const stationMap = new Map();

  for (const s of stations) {
    const id = String(s.stop_id);
    stationMap.set(id, { ...s, mode: deriveMode(s.category) });
    graph.set(id, []);
  }

  const routes = new Map();

  for (const s of stations) {
    const r = s.route_id;
    if (!routes.has(r)) routes.set(r, []);
    routes.get(r).push(s);
  }

  for (const stops of routes.values()) {
    for (let i = 0; i < stops.length - 1; i++) {
      const a = String(stops[i].stop_id);
      const b = String(stops[i + 1].stop_id);

      const distance = haversineMeters(
        toNumber(stops[i].stop_lat),
        toNumber(stops[i].stop_lon),
        toNumber(stops[i + 1].stop_lat),
        toNumber(stops[i + 1].stop_lon)
      );

      graph.get(a).push({ target: b, weight: distance });
      graph.get(b).push({ target: a, weight: distance });
    }
  }

  const stationArray = Array.from(stationMap.values());
  const latCellDeg = Math.max(0.00005, toleranceMeters / 111320);
  const lonCellDeg = latCellDeg;
  const index = new Map();

  for (const s of stationArray) {
    const key = gridKey(toNumber(s.stop_lat), toNumber(s.stop_lon), latCellDeg);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(s);
  }

  const seen = new Set();
  for (const a of stationArray) {
    const alat = toNumber(a.stop_lat);
    const alon = toNumber(a.stop_lon);
    const gx = Math.floor(alat / latCellDeg);
    const gy = Math.floor(alon / lonCellDeg);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${gx + dx}:${gy + dy}`;
        const candidates = index.get(key);
        if (!candidates) continue;

        for (const b of candidates) {
          if (a.stop_id === b.stop_id) continue;
          if (a.route_id === b.route_id) continue;
          const pair =
            String(a.stop_id) < String(b.stop_id)
              ? `${a.stop_id}:${b.stop_id}`
              : `${b.stop_id}:${a.stop_id}`;
          if (seen.has(pair)) continue;

          const distance = haversineMeters(
            alat,
            alon,
            toNumber(b.stop_lat),
            toNumber(b.stop_lon)
          );

          if (distance <= toleranceMeters) {
            graph.get(String(a.stop_id)).push({ target: String(b.stop_id), weight: 5 });
            graph.get(String(b.stop_id)).push({ target: String(a.stop_id), weight: 5 });
          }
          seen.add(pair);
        }
      }
    }
  }

  return { graph, stationMap };
}

const PRESETS = {
  SMART: { railBias: 0.4, transferPenalty: 3000 },
  FAST: { railBias: 0.7, transferPenalty: 1500 },
  BUDGET: { railBias: -0.2, transferPenalty: 500 }
};

// ======= createCostModel =======

export function createCostModel(presetName = "SMART") {
  const preset = PRESETS[presetName] || PRESETS.SMART;
  return function computeWeight(edge, prevMode, nextMode) {
    let multiplier = nextMode === "RAIL" ? 1 - preset.railBias : 1;
    let weight = edge.weight * multiplier;
    if (prevMode && prevMode !== nextMode) weight += preset.transferPenalty;
    return weight;
  };
}

// ======= Route Metrics =======

function calculateMetrics(path, stationMap) {
  let totalDistance = 0;
  let transfers = 0;
  let prevRoute = null;

  for (let i = 0; i < path.length - 1; i++) {
    const a = stationMap.get(path[i]);
    const b = stationMap.get(path[i + 1]);
    totalDistance += haversineMeters(
      toNumber(a.stop_lat),
      toNumber(a.stop_lon),
      toNumber(b.stop_lat),
      toNumber(b.stop_lon)
    );
    if (prevRoute && prevRoute !== b.route_id) transfers++;
    prevRoute = b.route_id;
  }

  const eta = Math.round(totalDistance / 500); // simple speed approx
  return { path, distance: Math.round(totalDistance), eta, transfers };
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
    const neighbors = graph.get(current) || [];

    for (const edge of neighbors) {
      const neighbor = edge.target;
      if (excludedEdges && excludedEdges.has(`${current}>${neighbor}`)) continue;
      const nextMode = stationMap.get(neighbor).mode;

      const weight = costModel(edge, prevMode, nextMode);
      const newDistance = currentDistance + weight;

      if (newDistance < distances.get(neighbor)) {
        distances.set(neighbor, newDistance);
        previous.set(neighbor, current);
        previousMode.set(neighbor, nextMode);
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
  return calculateMetrics(path, stationMap);
}

// ======= computeKRoutes =======

export function computeKRoutes(startId, endId, graph, stationMap, k = 3, costModel) {
  if (!startId || !endId || startId === endId) return [];
  const routes = [];
  const excludedEdges = new Set();

  for (let i = 0; i < k; i++) {
    const result = computeRoute(
      startId,
      endId,
      graph,
      stationMap,
      costModel,
      excludedEdges
    );
    if (!result.path.length) break;
    routes.push(result);

    const from = result.path[0];
    const to = result.path[1];
    if (!to) break;
    excludedEdges.add(`${from}>${to}`);
  }

  return routes;
}

// ======= End of routerLogic.js =======
