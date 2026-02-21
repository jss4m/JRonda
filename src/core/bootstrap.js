import {
  buildGraph,
  computeKRoutes,
  createCostModel
} from "./routerLogic.js";
import { getRouteColor, getServiceLabel } from "../style/routeStyle.js";

import { stations } from "/data/rail/stations.js";
import { rail } from "/data/rail/rail.js";
import { goKL } from "/data/gokl/goKL.js";
import { hohoAll } from "/data/hoho/hoho.js";
import { rapidbus } from "/data/bus/rapidbus.js";

function mergeRailStops(primary, fallback) {
  const out = [];
  const seen = new Set();
  const keyOf = (s) => `${String(s.route_id || "")}|${String(s.source_stop_id || s.stop_id || "")}`;

  for (const s of primary) {
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  for (const s of fallback) {
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, _fallbackFromStations: true });
  }
  return out;
}

const mergedRail = mergeRailStops(rail || [], stations || []);

const allStations = [
  ...mergedRail,
  ...goKL,
  ...hohoAll,
  ...rapidbus
];

const { graph, stationMap } = buildGraph(allStations);
const { graph: railGraph, stationMap: railStationMap } = buildRailOnlyNetwork(graph, stationMap);

const routeCache = new Map();
const ROUTE_CACHE_LIMIT = 240;

export const RoutingService = {
  graph,
  stationMap,
  routeCache,

  getRoutes(startId, endId, options = {}) {
    const {
      k = 3,
      preset = "SMART",
      forceRefresh = false,
      includeBus = true,
    } = options;

    const cacheKey = `${startId}->${endId}|${preset}|${k}|bus:${includeBus ? 1 : 0}`;
    if (!forceRefresh && routeCache.has(cacheKey)) {
      return routeCache.get(cacheKey);
    }

    const costModel = createCostModel(preset);
    const activeGraph = includeBus ? graph : railGraph;
    const activeStationMap = includeBus ? stationMap : railStationMap;

    const rawRoutes = computeKRoutes(
      startId,
      endId,
      activeGraph,
      activeStationMap,
      k,
      costModel
    );
    const routes = rawRoutes.map((route) => enrichRoute(route, activeStationMap));

    if (routeCache.size >= ROUTE_CACHE_LIMIT) {
      const firstKey = routeCache.keys().next().value;
      if (firstKey !== undefined) routeCache.delete(firstKey);
    }
    routeCache.set(cacheKey, routes);

    return routes;
  }
};

function buildRailOnlyNetwork(sourceGraph, sourceStationMap) {
  const filteredStationMap = new Map();
  for (const [id, station] of sourceStationMap.entries()) {
    if (station.mode === "RAIL") {
      filteredStationMap.set(id, station);
    }
  }

  const filteredGraph = new Map();
  for (const [id, edges] of sourceGraph.entries()) {
    if (!filteredStationMap.has(id)) continue;
    filteredGraph.set(
      id,
      edges.filter((edge) => filteredStationMap.has(edge.target))
    );
  }

  return { graph: filteredGraph, stationMap: filteredStationMap };
}

function enrichRoute(route, stationMapRef) {
  const stationsOnPath = (route.path || [])
    .map((id) => stationMapRef.get(String(id)))
    .filter(Boolean);

  const services = [];
  const seen = new Set();
  for (const stop of stationsOnPath) {
    const key = String(stop.route_id);
    if (!seen.has(key)) {
      seen.add(key);
      services.push(key);
    }
  }

  const segments = [];
  for (const stop of stationsOnPath) {
    const routeId = String(stop.route_id);
    const mode = String(stop.mode || "BUS");
    const color = getRouteColor(routeId, false, stop.route_color ?? null).color;
    const last = segments[segments.length - 1];
    const label = getServiceLabel(stop, mode);

    if (!last || last.routeId !== routeId) {
      segments.push({
        routeId,
        label,
        mode,
        category: String(stop.category || ""),
        color,
        stopCount: 1
      });
    } else {
      last.stopCount += 1;
    }
  }

  return {
    ...route,
    totalDistance: route.distance,
    ETA: route.eta,
    stations: stationsOnPath,
    services,
    segments,
    modeSummary: compressModes(segments).join(" -> ")
  };
}

function compressModes(segments) {
  const modes = [];
  for (const segment of segments) {
    if (!modes.length || modes[modes.length - 1] !== segment.mode) {
      modes.push(segment.mode);
    }
  }
  return modes;
}
