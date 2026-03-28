// ======= interaction.js =======
import { createUI } from "./ui.js";
import { RoutingService } from "./bootstrap.js";
import { CANONICAL_RAIL_ROUTE_META, getServiceLabel, getRouteColor, getRouteMode, normalizeRouteId } from "../style/routeStyle.js";
import {
  consumeInitToasts,
  getRenderPointerInteractionBindings,
} from "./render.js";

import { UIState } from './ui-state.js';
import { poi as poiRaw } from "../../data/poi/poi.js";

window.UIState = UIState; // Global bridge during refactor

let includeBus = true; // Fix ReferenceError: declare before use

const t = (key, fallback = "") => {
  if (typeof window !== "undefined" && window.jrondaI18n?.t) {
    return window.jrondaI18n.t(key, fallback);
  }
  return fallback || key;
};

const tf = (key, fallback, params = {}) => {
  let out = t(key, fallback);
  for (const [pKey, pValue] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pValue));
  }
  return out;
};

const sourceLabel = (source) => {
  if (source === "tap") return t("source_tap", "tap");
  if (source === "search") return t("source_search", "search");
  return String(source || "");
};

function __coreDebug(...args) {
  // no-op in production
}

function wireRenderPointerInteractions(config) {
  const {
    svg,
    toSvgPoint,
    findNearestStopWithin,
    findNearestPoiWithin,
    getUserDotPoint,
    startTraceLine,
    appendTracePoint,
    finishTraceLine,
    showStationTooltip,
    showPoiTooltip,
    showGpsTooltip,
    showGpsSetupPanel,
    hideStationTooltip,
    dispatchStationInfo,
  } = config || {};

  if (!svg) return;

  let traceSession = null;
  let lastGpsTapAt = 0;
  let gpsHoldTimerId = null;
  let gpsSetupTriggered = false;
  let pendingGpsDoubleTapHold = false;

  function clearGpsHoldTimer() {
    if (gpsHoldTimerId) {
      clearTimeout(gpsHoldTimerId);
      gpsHoldTimerId = null;
    }
  }

  const onPointerDown = (evt) => {
    const p = toSvgPoint(evt);
    const startStop = findNearestStopWithin(p.x, p.y);
    const userDotPoint = getUserDotPoint();
    const gpsNear =
      userDotPoint &&
      Number.isFinite(userDotPoint.x) &&
      Number.isFinite(userDotPoint.y) &&
      Math.hypot(userDotPoint.x - p.x, userDotPoint.y - p.y) <= 16;
    const now = Date.now();
    const isSecondTapNearGps = gpsNear && now - lastGpsTapAt < 700;
    pendingGpsDoubleTapHold = Boolean(isSecondTapNearGps);
    gpsSetupTriggered = false;
    clearGpsHoldTimer();
    if (pendingGpsDoubleTapHold && typeof showGpsSetupPanel === "function") {
      const clientX = evt.clientX;
      const clientY = evt.clientY;
      gpsHoldTimerId = setTimeout(() => {
        gpsSetupTriggered = true;
        showGpsSetupPanel(clientX, clientY);
      }, 550);
    }
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
  };

  const onPointerMove = (evt) => {
    if (!traceSession || evt.pointerId !== traceSession.pointerId) return;
    const p = toSvgPoint(evt);
    const moveDist = Math.hypot(p.x - traceSession.startX, p.y - traceSession.startY);
    if (moveDist > 8) {
      traceSession.moved = true;
      clearGpsHoldTimer();
    }
    if (traceSession.startStop) appendTracePoint(p.x, p.y);
  };

  const completeTrace = (evt) => {
    if (!traceSession || evt.pointerId !== traceSession.pointerId) return;
    clearGpsHoldTimer();
    const p = toSvgPoint(evt);
    const endStop = findNearestStopWithin(p.x, p.y);
    const endPoi = endStop ? null : findNearestPoiWithin(p.x, p.y);
    const userDotPoint = getUserDotPoint();
    const gpsNear =
      userDotPoint &&
      Number.isFinite(userDotPoint.x) &&
      Number.isFinite(userDotPoint.y) &&
      Math.hypot(userDotPoint.x - p.x, userDotPoint.y - p.y) <= 16;

    if (gpsSetupTriggered) {
      finishTraceLine();
      traceSession = null;
      return;
    }

    if (traceSession.startStop && traceSession.moved && endStop) {
      const startId = String(traceSession.startStop.stop_id);
      const endId = String(endStop.stop_id);
      if (startId !== endId) {
        window.dispatchEvent(new CustomEvent("jronda:trace-route", {
          detail: { startId, endId },
        }));
      } else {
        // Drag/trace should not open station detail panels.
      }
    } else if (endStop) {
      showStationTooltip(endStop, evt.clientX, evt.clientY);
      dispatchStationInfo(endStop, "tap");
    } else if (endPoi) {
      showPoiTooltip(endPoi, evt.clientX, evt.clientY);
    } else if (gpsNear) {
      const now = Date.now();
      if (pendingGpsDoubleTapHold) {
        pendingGpsDoubleTapHold = false;
        lastGpsTapAt = now;
        finishTraceLine();
        traceSession = null;
        return;
      }
      const advanced = now - lastGpsTapAt < 700;
      lastGpsTapAt = now;
      showGpsTooltip(evt.clientX, evt.clientY, advanced);
    } else if (!traceSession.moved) {
      hideStationTooltip();
    }

    finishTraceLine();
    traceSession = null;
    pendingGpsDoubleTapHold = false;
  };

  const onPointerCancel = () => {
    clearGpsHoldTimer();
    finishTraceLine();
    traceSession = null;
    pendingGpsDoubleTapHold = false;
  };

  const onHidePanels = () => {
    hideStationTooltip();
  };

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", completeTrace);
  svg.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("jronda:hide-floating-panels", onHidePanels);
}

// ================= INITIAL CONFIG =================
// Global state now managed by UIState
// Local: currentPreset, resetTimerId, legendResetTimer, panelIdleTimer preserved
let currentPreset = "SMART";
let resetTimerId = null;
let legendResetTimer = null;
let startId = null;
let endId = null;
let currentRoutes = [];
let selectedIndex = 0;
const AUTO_RESET_MS = 45 * 1000;
const PANEL_IDLE_MS = 45 * 1000;
const LEGEND_RESET_MS = 15 * 1000;
let panelIdleTimer = null;
let selectedNetworkMode = "RAIL";
const EXCLUDED_NON_CANONICAL_RAIL_IDS = new Set(["100_47300", "100_9000", "SH", "ST", "ERT"]);

const allRailRouteOptions = Array.from(
  new Map(
    Array.from(RoutingService.stationMap.values())
      .filter((station) => station.mode === "RAIL" && !station.passThrough)
      .map((station) => {
        const routeId = String(station.route_id || "");
        return [
          routeId,
          {
            routeId,
            label: getServiceLabel(station, "RAIL"),
          },
        ];
      })
      .filter(([routeId]) => Boolean(routeId))
  ).values()
).sort((leftOption, rightOption) => leftOption.label.localeCompare(rightOption.label));

const stationOptions = Array.from(RoutingService.stationMap.values())
  .filter((station) => !station.passThrough)
  .filter((station) => !EXCLUDED_NON_CANONICAL_RAIL_IDS.has(normalizeRouteId(station.route_id)))
  .map((s) => ({
    stop_id: String(s.stop_id),
    source_stop_id: String(s.source_stop_id || s.stop_id || ""),
    stop_name: String(s.stop_name || s.stop_id),
    route_id: String(s.route_id || ""),
    route_color: String(s.route_color || ""),
    category: String(s.category || ""),
    mode: String(s.mode || ""),
    stop_lat: Number(s.stop_lat),
    stop_lon: Number(s.stop_lon),
  }));

const lineStops = Array.from(RoutingService.stationMap.values())
  .filter((station) => !station.passThrough)
  .filter((station) => !EXCLUDED_NON_CANONICAL_RAIL_IDS.has(normalizeRouteId(station.route_id)))
  .map((s) => ({
    stop_id: String(s.stop_id),
    source_stop_id: String(s.source_stop_id || s.stop_id || ""),
    stop_name: String(s.stop_name || s.stop_id),
    route_id: String(s.route_id || ""),
    route_color: String(s.route_color || ""),
    category: String(s.category || ""),
    mode: String(s.mode || ""),
    stop_sequence: Number(s.stop_sequence ?? s.seq ?? 0),
  }))
  .sort((a, b) => {
    if (a.route_id !== b.route_id) return a.route_id.localeCompare(b.route_id);
    return (a.stop_sequence || 0) - (b.stop_sequence || 0);
  });

const LEGEND_ORDER = CANONICAL_RAIL_ROUTE_META.map((entry) => ({ id: normalizeRouteId(entry.id), name: entry.name }));
const LEGEND_ORDER_MAP = new Map(LEGEND_ORDER.map((entry, idx) => [entry.id, { rank: idx, name: entry.name }]));

const normalizeLegendKey = (routeId) => {
  const base = normalizeRouteId(routeId);
  return base.replace(/\s+/g, "");
};

const legendItemByRoute = new Map();
const stationByRoute = new Map();
for (const station of RoutingService.stationMap.values()) {
  if (station.mode !== "RAIL" || station.passThrough || !station.route_id) continue;
  const rid = normalizeRouteId(String(station.route_id));
  if (!rid || stationByRoute.has(rid)) continue;
  stationByRoute.set(rid, station);
}

function getLegendIcon(category) {
  const c = String(category || "").toUpperCase();
  if (c === "KTM") return "/src/img/train-panthograph.svg";
  return "/src/img/train-noPanthograph.svg";
}

for (const entry of LEGEND_ORDER) {
  const routeId = normalizeRouteId(String(entry.id));
  const legendKey = normalizeLegendKey(routeId);
  const sample = stationByRoute.get(routeId);
  const mode = getRouteMode(routeId);
  const category = sample?.category || (routeId.startsWith("KTM") ? "KTM" : "");
  const color = getRouteColor(routeId, false, sample?.route_color ?? null).color;
  const label = entry.name || (sample ? String(sample.route_long_name || "").trim() || getServiceLabel(sample, mode) : routeId);
  legendItemByRoute.set(routeId, {
    routeId,
    legendKey,
    label,
    color,
    mode,
    group: "RAIL",
    icon: getLegendIcon(category),
  });
}

const legendItems = Array.from(legendItemByRoute.values()).sort((a, b) => {
  const aMeta = LEGEND_ORDER_MAP.get(String(a.legendKey || a.routeId));
  const bMeta = LEGEND_ORDER_MAP.get(String(b.legendKey || b.routeId));
  const aRank = aMeta ? aMeta.rank : Infinity;
  const bRank = bMeta ? bMeta.rank : Infinity;
  const aGroup = Number.isFinite(aRank) ? 0 : (a.mode === "RAIL" ? 1 : 2);
  const bGroup = Number.isFinite(bRank) ? 0 : (b.mode === "RAIL" ? 1 : 2);
  if (aGroup !== bGroup) return aGroup - bGroup;
  if (aMeta || bMeta) return aRank - bRank;
  return a.label.localeCompare(b.label);
});

const busLegendMap = new Map();
for (const station of RoutingService.stationMap.values()) {
  if (String(station.mode || "").toUpperCase() !== "BUS") continue;
  const routeId = normalizeRouteId(String(station.route_id || ""));
  if (!routeId || busLegendMap.has(routeId)) continue;
  busLegendMap.set(routeId, {
    routeId,
    legendKey: routeId,
    label: getServiceLabel(station, "BUS"),
    color: getRouteColor(routeId, false, station.route_color ?? null).color,
    mode: "BUS",
    group: routeId.includes("GOKL") ? "GOKL" : (routeId.includes("HOHO") ? "HOHO" : "RAPIDBUS"),
    icon: "/src/img/bus.svg",
  });
}
const allBusLegendItems = Array.from(busLegendMap.values());
const goKlLegendItems = allBusLegendItems
  .filter((item) => String(item.routeId || "").includes("GOKL"))
  .sort((a, b) => a.label.localeCompare(b.label));
const rapidBusLegendItems = allBusLegendItems
  .filter((item) => !String(item.routeId || "").includes("GOKL") && !String(item.routeId || "").includes("HOHO"))
  .sort((a, b) => a.label.localeCompare(b.label));
const hohoLegendItems = allBusLegendItems
  .filter((item) => String(item.routeId || "").includes("HOHO"))
  .sort((a, b) => a.label.localeCompare(b.label));

// ================= SETUP UI =================
let showToast = null;
const toastWrapper = (message, type = "info") => {
  if (typeof showToast === "function") {
    showToast(message, type);
  } else {
    window.dispatchEvent(new CustomEvent("jronda:toast", { detail: { message, type } }));
  }
};

const ui = createUI({
  onPresetChange: (preset) => {
    currentPreset = preset;
    toastWrapper(tf("preset_changed", "Preset changed: {preset}", { preset }));
    if (UIState.from && UIState.to) updateRoutes();
  },
  onRailRouteChange: (routeId) => {
    const selected = routeId ? String(routeId) : null;
    setLegendActiveRoute(selected);
    if (selected) {
      toastWrapper(tf("rail_focus", "Rail line focus: {route}", { route: selected }));
    } else {
      toastWrapper(t("rail_focus_cleared", "Rail line focus cleared"));
    }
  },
  onLegendRouteSelect: (routeId) => {
    const selected = routeId ? String(routeId) : null;
    setLegendActiveRoute(selected);
UIState.setState({ selectedLine: selected, ui: { selectedLine: selected } });
    if (legendResetTimer) clearTimeout(legendResetTimer);
    legendResetTimer = setTimeout(() => {
      setLegendActiveRoute(null);
      window.setState({ selectedLine: null, ui: { selectedLine: null } });
      toastWrapper(t("legend_highlight_reset", "Legend highlight reset"));
    }, LEGEND_RESET_MS);
    if (selected) toastWrapper(tf("legend_highlight", "Legend highlight: {route}", { route: selected }));
  },
  onReset: () => {
    resetAllState("manual");
  },
  onSearchSelect: (stopId, choice) => {
    if (choice === "start") {
      setFromStation(String(stopId));
      return;
    }
    if (choice === "end") {
      setToStation(String(stopId));
      return;
    }
    selectStation(String(stopId), "search");
  },
  onRouteSelect: (routeIndex) => {
    const idx = Math.max(0, Math.min((currentRoutes.length || 1) - 1, Number(routeIndex) || 0));
    selectedIndex = idx;
    const selected = currentRoutes[idx];
    if (selected) {
      window.setState({ selectedRoute: selected, ui: { selectedRoute: selected } });
      updatePanel(currentRoutes, selectedIndex);
    }
  },
  stationOptions,
  lineStops,
  poiOptions: Array.isArray(poiRaw) ? poiRaw : [],
});

const {
  updatePanel,
  setStationInfo,
  setJourneyEndpoints,
  resetUI,
  showToast: showToastInner,
  setLegendItems,
  setLegendActiveRoute,
} = ui;
showToast = showToastInner;
const legendItemsCanonical = legendItems.filter(item => LEGEND_ORDER_MAP.has(String(item.legendKey || item.routeId)));
const legendItemsBar = [...legendItemsCanonical];
const legendItemsAllForModal = Array.from(
  new Map(
    [
      ...legendItemsCanonical,
      ...goKlLegendItems,
      ...rapidBusLegendItems,
      ...hohoLegendItems,
    ].map((item) => [String(item.routeId || ""), item])
  ).values()
);
setLegendItems(legendItemsBar, legendItemsAllForModal);

  for (const t of consumeInitToasts()) {
    showToast(t.message, t.type || "info");
  }

function armAutoResetTimer() {
  if (resetTimerId) clearTimeout(resetTimerId);
  resetTimerId = setTimeout(() => resetAllState("auto"), AUTO_RESET_MS);
}

function armPanelIdleTimer() {
  if (panelIdleTimer) clearTimeout(panelIdleTimer);
  panelIdleTimer = setTimeout(() => {
    setStationInfo(t("tap_station_info", "Tap a station to view details"));
    window.dispatchEvent(new CustomEvent("jronda:hide-floating-panels"));
  }, PANEL_IDLE_MS);
}

function resetAllState(reason = "manual") {
  currentPreset = "SMART";
  startId = null;
  endId = null;
  currentRoutes = [];
  selectedIndex = 0;
  includeBus = true;
  RoutingService.routeCache.clear();
  setLegendActiveRoute(null);
  window.setState({
    from: null,
    to: null,
    selectedStation: null,
    selectedRoute: null,
    selectedLine: null,
    highlightedSegments: [],
    routes: [],
    ui: {
      from: null,
      to: null,
      selectedStation: null,
      selectedRoute: null,
      selectedLine: null,
      highlighted: [],
      displayMode: "ALL",
      busVisibility: true,
      mode: "idle",
    },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("jronda:close-legend-modal"));
  }
  if (legendResetTimer) {
    clearTimeout(legendResetTimer);
    legendResetTimer = null;
  }
  resetUI();
  updatePanel([], 0);
  setStationInfo(t("tap_station_info", "Tap a station to view details"));
  setJourneyEndpoints(null, null);
  showToast(reason === "auto" ? t("auto_reset_due_inactivity", "Auto reset due to inactivity") : t("reset_complete", "Reset complete."));
  showNetworkModePicker();
  armAutoResetTimer();
  armPanelIdleTimer();
}

function applyNetworkMode(modeId = "RAIL") {
  const mode = String(modeId || "RAIL").toUpperCase();
  selectedNetworkMode = mode;
  if (mode === "RAIL") {
    includeBus = false;
    window.setState({
      displayMode: "RAIL",
      busVisibility: false,
      ui: { displayMode: "RAIL", busVisibility: false },
    });
    return;
  }
  includeBus = true;
  let busVisibility = true;
  if (mode === "RAPID") busVisibility = { rapid: true, gokl: false, hoho: false, other: false };
  else if (mode === "GOKL") busVisibility = { rapid: false, gokl: true, hoho: false, other: false };
  else if (mode === "HOHO") busVisibility = { rapid: false, gokl: false, hoho: true, other: false };
  window.setState({
    displayMode: "BUS",
    busVisibility,
    ui: { displayMode: "BUS", busVisibility },
  });
}

function showNetworkModePicker() {
  const existing = document.getElementById("jronda-mode-picker");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "jronda-mode-picker";
  overlay.className = "jronda-mode-picker";
  overlay.innerHTML = `
    <div class="jronda-mode-card">
      <div class="jronda-mode-title">Choose Network Mode</div>
      <div class="jronda-mode-grid">
        <button type="button" class="jronda-mode-btn" data-mode="RAIL">
          <span class="jronda-mode-icons">
            <img src="/src/img/train-noPanthograph.svg" alt="Rail"/>
            <span>/</span>
            <img src="/src/img/train-panthograph.svg" alt="Rail"/>
          </span>
          <span class="jronda-mode-label">Rail</span>
        </button>
        <button type="button" class="jronda-mode-btn" data-mode="RAPID">
          <span class="jronda-mode-icons"><img src="/src/img/bus.svg" alt="RapidBus"/></span>
          <span class="jronda-mode-label">RapidBus</span>
        </button>
        <button type="button" class="jronda-mode-btn" data-mode="GOKL">
          <span class="jronda-mode-icons"><img src="/src/img/bus.svg" alt="GoKL"/></span>
          <span class="jronda-mode-label">GoKL</span>
        </button>
        <button type="button" class="jronda-mode-btn" data-mode="HOHO">
          <span class="jronda-mode-icons"><img src="/src/img/bus.svg" alt="Hop-on Hop-off"/></span>
          <span class="jronda-mode-label">Hop-on Hop-off</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll(".jronda-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyNetworkMode(btn.dataset.mode || "RAIL");
      overlay.remove();
      showToast(`Mode selected: ${btn.dataset.mode || "RAIL"}`);
    });
  });
}

// ================= START / END SELECTION =================
export function setFromStation(id) {
  const station = RoutingService.stationMap.get(String(id));
  if (UIState.to === id) {
    setStationInfo(t("start_end_same", "Start and end cannot be the same station."));
    showToast(t("start_end_same", "Start and end cannot be the same station."), "warn");
    return;
  }
  startId = String(id);
  window.setState({ from: id, ui: { from: id } });
  setJourneyEndpoints(station || null, RoutingService.stationMap.get(String(UIState.to || "")) || null);
  if (station) showToast(tf("start_set", "Start set: {station}", { station: station.stop_name }));
  if (UIState.to && UIState.to !== id) updateRoutes();
  armAutoResetTimer();
  armPanelIdleTimer();
}

export function setToStation(id) {
  const station = RoutingService.stationMap.get(String(id));
  if (UIState.from === id) {
    setStationInfo(t("start_end_same", "Start and end cannot be the same station."));
    showToast(t("start_end_same", "Start and end cannot be the same station."), "warn");
    return;
  }
  endId = String(id);
  window.setState({ to: id, ui: { to: id } });
  setJourneyEndpoints(RoutingService.stationMap.get(String(UIState.from || "")) || null, station || null);
  if (station) showToast(tf("end_set", "End set: {station}", { station: station.stop_name }));
  if (UIState.from && UIState.from !== id) updateRoutes();
  armAutoResetTimer();
  armPanelIdleTimer();
}

export function selectStations(fromId, toId) {
  const fromStation = RoutingService.stationMap.get(String(fromId));
  const toStation = RoutingService.stationMap.get(String(toId));
  if (fromId === toId) {
    setStationInfo(t("start_end_same", "Start and end cannot be the same station."));
    showToast(t("start_end_same", "Start and end cannot be the same station."), "warn");
    return;
  }
  startId = String(fromId);
  endId = String(toId);
  window.setState({ 
    from: fromId, 
    to: toId, 
    mode: 'route-view',
    routes: [],
    ui: { from: fromId, to: toId, mode: "route-view" },
  });
  setJourneyEndpoints(fromStation || null, toStation || null);
  updateRoutes();
  armAutoResetTimer();
  armPanelIdleTimer();
}

export function selectStation(id, source = "tap") {
  const station = RoutingService.stationMap.get(String(id));
  if (station) {
    const label = getServiceLabel(station, station.mode);
    setStationInfo(tf("selected_station", "Selected {station} ({label}) via {source}.", {
      station: station.stop_name,
      label,
      source: sourceLabel(source),
    }));
    showToast(tf("selected_station_toast", "Selected: {station}", { station: station.stop_name }));
  }
  window.setState({ selectedStation: id });
  armAutoResetTimer();
  armPanelIdleTimer();
}

// ================= ROUTE UPDATE =================
export function updateRoutes() {
// Trigger route computation via state change
  const state = window.UIState;
  if (!state.from || !state.to) return;
  
    console.log('[DEBUG] updateRoutes:', {from: state.from, to: state.to, preset: currentPreset, includeBus});
    const routes = RoutingService.getRoutes(state.from, state.to, {
      k: 3,
      preset: currentPreset,
      includeBus: true,  // Always include bus for first/last km
    });

  if (!routes || !routes.length) {
    __coreDebug("No routes found.");
    setStationInfo(t("no_route_found_filters", "No route found for the selected stations and filters."));
    showToast(t("no_route_found_current_filters", "No route found with current filters."), "warn");
    return;
  }

  window.setState({ 
    routes,
    selectedRoute: routes[0],
    highlightedSegments: [], // Updated by route-visualizer PHASE 4
    mode: 'route-view',
    ui: { selectedRoute: routes[0], highlighted: [], mode: "route-view" },
  });
  currentRoutes = routes.slice();
  selectedIndex = 0;
  updatePanel(currentRoutes, selectedIndex);
  const fromStation = RoutingService.stationMap.get(String(state.from || ""));
  const toStation = RoutingService.stationMap.get(String(state.to || ""));
  if (fromStation && toStation) {
    setStationInfo(`${fromStation.stop_name} → ${toStation.stop_name}`);
  }
  
  showToast(tf("route_options_updated", "Route options updated ({count})", { count: routes.length }));
  armAutoResetTimer();
  armPanelIdleTimer();
}

// ================= EXPORT UTIL =================
export function highlightRoute(route) {
  window.setState({ selectedRoute: route, ui: { selectedRoute: route } });
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestStationToPoi(poi) {
  if (!poi) return null;
  const poiLat = Number(poi.latitude ?? poi.lat);
  const poiLon = Number(poi.longitude ?? poi.lon);
  if (!Number.isFinite(poiLat) || !Number.isFinite(poiLon)) return null;
  let nearest = null;
  let minDist = Infinity;
  for (const station of stationOptions) {
    const lat = Number(station.stop_lat);
    const lon = Number(station.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const meters = haversineMeters(lat, lon, poiLat, poiLon);
    if (meters < minDist) {
      minDist = meters;
      nearest = station;
    }
  }
  return nearest;
}

function resolveCurrentStartStationId() {
  if (UIState.from) return String(UIState.from);
  const fixedStopId = localStorage.getItem("jronda_fixed_station_stop_id");
  if (fixedStopId) return String(fixedStopId);
  const bindings = getRenderPointerInteractionBindings();
  if (bindings?.getUserDotPoint && bindings?.findNearestStopWithin) {
    const point = bindings.getUserDotPoint();
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      const stop = bindings.findNearestStopWithin(point.x, point.y, 42);
      if (stop?.stop_id) return String(stop.stop_id);
    }
  }
  return "";
}

if (typeof window !== "undefined") {
window.setFromStation = setFromStation;
  window.setToStation = setToStation;
  window.selectStation = selectStation;
  window.selectStations = selectStations;
  window.updateRoutes = updateRoutes;
  window.addEventListener("jronda:station-info", (evt) => {
    const stopId = evt?.detail?.stopId;
    if (!stopId) return;
    const station = RoutingService.stationMap.get(String(stopId));
    if (station) {
      const label = getServiceLabel(station, station.mode);
      setStationInfo(tf("selected_station_short", "Selected {station} ({label})", {
        station: station.stop_name,
        label,
      }));
    }
    armAutoResetTimer();
    armPanelIdleTimer();
  });
  window.addEventListener("jronda:toast", (evt) => {
    const message = evt?.detail?.message;
    const type = evt?.detail?.type || "info";
    if (!message) return;
    showToast(String(message), String(type));
  });
window.addEventListener("jronda:trace-route", (evt) => {
  const startId = evt?.detail?.startId;
  const endId = evt?.detail?.endId;
  if (!startId || !endId) return;
  window.setState({ selectedLine: null, ui: { selectedLine: null } });
  selectStations(startId, endId);
});
window.addEventListener("jronda:find-route", (evt) => {
  const fromId = String(evt?.detail?.fromId || "");
  const toId = String(evt?.detail?.toId || "");
  if (!fromId || !toId) return;
  selectStations(fromId, toId);
});
  window.addEventListener("jronda:legend-retry", () => {
    setLegendItems(legendItemsBar, legendItemsAllForModal);
  });
window.addEventListener("jronda:set-start", (evt) => {
  const id = evt?.detail?.stopId;
  if (!id) return;
  setFromStation(id);
});
window.addEventListener("jronda:set-end", (evt) => {
  const id = evt?.detail?.stopId;
  if (!id) return;
  setToStation(id);
});
window.addEventListener("jronda:swap-journey", (evt) => {
  const fromId = String(evt?.detail?.fromId || "");
  const toId = String(evt?.detail?.toId || "");
  if (!fromId || !toId) return;
  selectStations(fromId, toId);
});
window.addEventListener("jronda:nearby-poi-selected", (evt) => {
  const poi = evt?.detail?.poi;
  if (!poi) return;
  const label = String(poi.name || poi.id || "POI");
  const destination = findNearestStationToPoi(poi);
  const sourceStopId = resolveCurrentStartStationId();
  if (!destination?.stop_id) {
    setStationInfo(`Nearby: ${label}`);
    showToast(`Nearby selected: ${label}`);
    return;
  }
  if (!sourceStopId) {
    setToStation(String(destination.stop_id));
    setStationInfo(`Destination set near ${label}: ${destination.stop_name}`);
    showToast(`Set destination near ${label}`);
    return;
  }
  if (String(sourceStopId) === String(destination.stop_id)) {
    setStationInfo(`You are already near ${label} (${destination.stop_name})`);
    showToast(`Already near ${label}`);
    return;
  }
  selectStations(String(sourceStopId), String(destination.stop_id));
  setStationInfo(`Route to ${label}: ${RoutingService.stationMap.get(String(sourceStopId))?.stop_name || sourceStopId} → ${destination.stop_name}`);
  showToast(`Routing to nearby: ${label}`);
});
  const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart"];
  for (const eventName of activityEvents) {
    window.addEventListener(eventName, () => {
      armAutoResetTimer();
      armPanelIdleTimer();
    }, { passive: true });
  }
  window.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    setLegendItems(legendItemsBar, legendItemsAllForModal);
    setupRenderInteractions();
  });
}

window.setState({ busVisibility: includeBus, ui: { busVisibility: includeBus } });

function setupRenderInteractions() {
  const bindings = getRenderPointerInteractionBindings();
  if (bindings?.svg) {
    __coreDebug('interaction: binding render pointer interactions to SVG');
    wireRenderPointerInteractions(bindings);
    window.jrondaInteractionsWired = true;
    return true;
  }
  __coreDebug('interaction: render not ready yet; waiting for jronda:render-ready');
  return false;
}

if (!setupRenderInteractions()) {
  window.addEventListener('jronda:render-ready', () => {
    setupRenderInteractions();
    setLegendItems(legendItemsBar, legendItemsAllForModal);
  }, { once: true });
}

showNetworkModePicker();
armAutoResetTimer();
armPanelIdleTimer();
