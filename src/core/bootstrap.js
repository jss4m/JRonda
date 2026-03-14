import {
  buildGraph,
  computeKRoutes,
  createCostModel
} from "./routerLogic.js";
import { getRouteColor, getServiceLabel } from "../style/routeStyle.js";

import { stations } from "../../data/rail/stations.js";
import { rail } from "../../data/rail/rail.js";
import { railTimetables } from "../../data/rail/timetables.js";
import { goKL } from "../../data/gokl/goKL.js";
import { hohoAll } from "../../data/hoho/hoho.js";
import { rapidbus } from "../../data/bus/rapidbus.js";
import { busTimetables } from "../../data/bus/timetables.js";

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
const routeHeadwayMinutes = buildRouteHeadwayMinutes(railTimetables, busTimetables);

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

    const costModel = createCostModel(preset, { routeHeadwayMinutes });
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
    const routes = rawRoutes.map((route) => enrichRoute(route, activeStationMap, activeGraph));

    if (routeCache.size >= ROUTE_CACHE_LIMIT) {
      const firstKey = routeCache.keys().next().value;
      if (firstKey !== undefined) routeCache.delete(firstKey);
    }
    routeCache.set(cacheKey, routes);

    return routes;
  }
};

function parseHHMMToMinutes(v) {
  const m = String(v || "").match(/^(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function extractHeadwayFromTimetableMap(mapByStop) {
  if (!mapByStop || typeof mapByStop !== "object") return null;
  const allDiffs = [];
  for (const table of Object.values(mapByStop)) {
    const weekday = Array.isArray(table?.weekday) ? table.weekday : [];
    if (weekday.length < 2) continue;
    const mins = weekday
      .map(parseHHMMToMinutes)
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b);
    for (let i = 1; i < mins.length; i++) {
      const d = mins[i] - mins[i - 1];
      if (d > 0 && d <= 180) allDiffs.push(d);
    }
  }
  return median(allDiffs);
}

function buildRouteHeadwayMinutes(railMap, busMap) {
  const out = new Map();
  for (const [routeId, byStop] of Object.entries(railMap || {})) {
    const h = extractHeadwayFromTimetableMap(byStop);
    if (Number.isFinite(h) && h > 0) out.set(String(routeId), h);
  }
  for (const [routeId, byStop] of Object.entries(busMap || {})) {
    const h = extractHeadwayFromTimetableMap(byStop);
    if (Number.isFinite(h) && h > 0) out.set(String(routeId), h);
  }
  return out;
}

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

function enrichRoute(route, stationMapRef, graphRef) {
  const rawStationsOnPath = (route.path || [])
    .map((id) => stationMapRef.get(String(id)))
    .filter(Boolean);
  const stationsOnPath = rawStationsOnPath.filter((stop) => !stop.passThrough);

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

  const alternativesByRoute = new Map();
  const path = Array.isArray(route.path) ? route.path : [];
  for (let i = 0; i < path.length - 1; i++) {
    const fromId = String(path[i]);
    const toId = String(path[i + 1]);
    const edges = graphRef?.get(fromId) || [];
    const edge = edges.find((candidateEdge) => String(candidateEdge.target) === toId);
    if (!edge || !Array.isArray(edge.sharedRouteIds) || edge.sharedRouteIds.length < 2) continue;
    const toStation = stationMapRef.get(toId);
    if (!toStation) continue;
    const activeRouteId = String(toStation.route_id || "");
    for (const sharedRouteIdRaw of edge.sharedRouteIds) {
      const sharedRouteId = String(sharedRouteIdRaw || "");
      if (!sharedRouteId || sharedRouteId === activeRouteId) continue;
      if (!alternativesByRoute.has(activeRouteId)) alternativesByRoute.set(activeRouteId, new Set());
      alternativesByRoute.get(activeRouteId).add(sharedRouteId);
    }
  }

  let routeAlternativeCount = 0;
  for (const alternativeSet of alternativesByRoute.values()) {
    routeAlternativeCount += alternativeSet.size;
  }
  for (const segment of segments) {
    const alternatives = alternativesByRoute.get(String(segment.routeId || ""));
    segment.alternativeRouteIds = alternatives ? Array.from(alternatives).sort() : [];
  }

  return {
    ...route,
    totalDistance: route.distance,
    ETA: route.eta,
    stations: stationsOnPath,
    services,
    segments,
    modeSummary: compressModes(segments).join(" -> "),
    alternativesByRoute: Object.fromEntries(
      Array.from(alternativesByRoute.entries()).map(([routeId, routeAlternatives]) => [
        routeId,
        Array.from(routeAlternatives).sort(),
      ])
    ),
    alternativeCount: routeAlternativeCount,
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
