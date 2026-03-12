// ======= interaction.js =======
import { createUI } from "./ui.js";
import { RoutingService } from "./bootstrap.js";
import { getServiceLabel } from "../style/routeStyle.js";
import { getRouteColor } from "../style/routeStyle.js";
import {
  consumeInitToasts,
  drawRoute as renderDrawRoute,
  getContinuationPanelData,
  getRenderPointerInteractionBindings,
  resetRenderState,
  setRailRouteFilter,
  setRouteEndpoints,
  setBusVisibility,
} from "./render.js";

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
        showStationTooltip(endStop, evt.clientX, evt.clientY);
      } else {
        showStationTooltip(endStop, evt.clientX, evt.clientY);
        dispatchStationInfo(endStop, "tap");
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
let currentPreset = "SMART";
let startId = null;
let endId = null;
let currentRoutes = [];
let selectedIndex = 0;
let includeBus = true;
let resetTimerId = null;
let legendResetTimer = null;
const AUTO_RESET_MS = 2 * 60 * 1000;
const PANEL_IDLE_MS = 15 * 1000;
const LEGEND_RESET_MS = 15 * 1000;
let panelIdleTimer = null;

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
  .map((s) => ({
    stop_id: String(s.stop_id),
    stop_name: String(s.stop_name || s.stop_id),
    route_id: String(s.route_id || ""),
  }));

const legendItems = Array.from(
  new Map(
    Array.from(RoutingService.stationMap.values()).map((s) => {
      const routeId = String(s.route_id || "");
      const color = getRouteColor(routeId, false, s.route_color ?? null).color;
      return [
        routeId,
        {
          routeId,
          label: getServiceLabel(s, s.mode),
          color,
          mode: s.mode,
        },
      ];
    })
  ).values()
)
  .filter((item) => item.routeId)
  .sort((a, b) => {
    if (a.mode !== b.mode) return a.mode === "RAIL" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

// ================= SETUP UI =================
const {
  updatePanel,
  setStationInfo,
  setRailRouteOptions,
  resetUI,
  showToast,
  setLegendItems,
  setLegendActiveRoute,
} = createUI({
  onPresetChange: (preset) => {
    currentPreset = preset;
    showToast(tf("preset_changed", "Preset changed: {preset}", { preset }));
    if (startId && endId) updateRoute(true);
  },
  onBusToggle: (busEnabled) => {
    includeBus = Boolean(busEnabled);
    setBusVisibility(includeBus);
    showToast(includeBus ? t("bus_routes_included", "Bus routes included") : t("bus_routes_hidden", "Bus routes hidden"));
    if (startId && endId) updateRoute(true);
  },
  onRailRouteChange: (routeId) => {
    const selected = routeId ? String(routeId) : null;
    setRailRouteFilter(selected);
    setLegendActiveRoute(selected);
    if (selected) {
      showToast(tf("rail_focus", "Rail line focus: {route}", { route: selected }));
    } else {
      showToast(t("rail_focus_cleared", "Rail line focus cleared"));
    }
  },
  onLegendRouteSelect: (routeId) => {
    const selected = routeId ? String(routeId) : null;
    setRailRouteFilter(selected);
    setLegendActiveRoute(selected);
    if (legendResetTimer) clearTimeout(legendResetTimer);
    legendResetTimer = setTimeout(() => {
      setRailRouteFilter(null);
      setLegendActiveRoute(null);
      showToast(t("legend_highlight_reset", "Legend highlight reset"));
    }, LEGEND_RESET_MS);
    if (selected) showToast(tf("legend_highlight", "Legend highlight: {route}", { route: selected }));
  },
  onReset: () => {
    resetAllState("manual");
  },
  onSearchSelect: (stopId) => {
    handleStationSelection(String(stopId), "search");
  },
  stationOptions,
  summaryPanels: getContinuationPanelData(),
});
setRailRouteOptions(allRailRouteOptions);
setLegendItems(legendItems);

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
  setRouteEndpoints(null, null);
  setBusVisibility(true);
  setRailRouteFilter(null);
  setLegendActiveRoute(null);
  if (legendResetTimer) {
    clearTimeout(legendResetTimer);
    legendResetTimer = null;
  }
  setRailRouteOptions(allRailRouteOptions);
  resetRenderState();
  resetUI();
  updatePanel([], 0);
  setStationInfo(reason === "auto" ? t("session_auto_reset", "Session auto-reset.") : t("reset_complete", "Reset complete."));
  showToast(reason === "auto" ? t("auto_reset_due_inactivity", "Auto reset due to inactivity") : t("reset_complete", "Reset complete."));
  armAutoResetTimer();
  armPanelIdleTimer();
}

// ================= START / END SELECTION =================
export function setStartStop(stopId) {
  const nextStart = String(stopId);
  if (endId && nextStart === endId) {
    setStationInfo(t("start_end_same", "Start and end cannot be the same station."));
    showToast(t("start_end_same", "Start and end cannot be the same station."), "warn");
    return;
  }
  startId = nextStart;
  setRouteEndpoints(startId, endId);
  const s = RoutingService.stationMap.get(startId);
  if (s) showToast(tf("start_set", "Start set: {station}", { station: s.stop_name }));
  if (startId && endId) updateRoute();
  armAutoResetTimer();
  armPanelIdleTimer();
}

export function setEndStop(stopId) {
  const nextEnd = String(stopId);
  if (startId && nextEnd === startId) {
    setStationInfo(t("start_end_same", "Start and end cannot be the same station."));
    showToast(t("start_end_same", "Start and end cannot be the same station."), "warn");
    return;
  }
  endId = nextEnd;
  setRouteEndpoints(startId, endId);
  const e = RoutingService.stationMap.get(endId);
  if (e) showToast(tf("end_set", "End set: {station}", { station: e.stop_name }));
  if (startId && endId) updateRoute();
  armAutoResetTimer();
  armPanelIdleTimer();
}

function setStartAndEnd(startStopId, endStopId, forceRefresh = true) {
  startId = String(startStopId);
  endId = String(endStopId);
  if (startId === endId) {
    setStationInfo(t("start_end_same", "Start and end cannot be the same station."));
    showToast(t("start_end_same", "Start and end cannot be the same station."), "warn");
    return;
  }
  setRouteEndpoints(startId, endId);
  if (startId && endId) {
    updateRoute(forceRefresh);
  }
  armAutoResetTimer();
  armPanelIdleTimer();
}

function handleStationSelection(stopId, source = "tap") {
  const station = RoutingService.stationMap.get(String(stopId));
  if (station) {
    const label = getServiceLabel(station, station.mode);
    setStationInfo(tf("selected_station", "Selected {station} ({label}) via {source}.", {
      station: station.stop_name,
      label,
      source: sourceLabel(source),
    }));
    showToast(tf("selected_station_toast", "Selected: {station}", { station: station.stop_name }));
  }
  if (!startId || (startId && endId)) {
    startId = String(stopId);
    endId = null;
    setRouteEndpoints(startId, endId);
    armAutoResetTimer();
    armPanelIdleTimer();
    return;
  }
  if (startId === stopId) return;
  endId = String(stopId);
  setRouteEndpoints(startId, endId);
  updateRoute(true);
  armAutoResetTimer();
  armPanelIdleTimer();
}

// ================= ROUTE UPDATE =================
function updateRoute(forceRefresh = false) {
  currentRoutes = RoutingService.getRoutes(startId, endId, {
    k: 3,
    preset: currentPreset,
    forceRefresh,
    includeBus,
  });

  if (!currentRoutes || !currentRoutes.length) {
    console.warn("No routes found.");
    setStationInfo(t("no_route_found_filters", "No route found for the selected stations and filters."));
    showToast(t("no_route_found_current_filters", "No route found with current filters."), "warn");
    updatePanel([], 0);
    return;
  }

  selectedIndex = 0;
  renderDrawRoute(currentRoutes[selectedIndex]);

  // Update panel with clickable routes
  const onSelect = (i) => {
    selectedIndex = i;
    renderDrawRoute(currentRoutes[selectedIndex]);
    updatePanel(currentRoutes, selectedIndex, onSelect);
  };
  updatePanel(currentRoutes, selectedIndex, onSelect);
  showToast(tf("route_options_updated", "Route options updated ({count})", { count: currentRoutes.length }));
  armAutoResetTimer();
  armPanelIdleTimer();
}

// ================= EXPORT UTIL =================
export function highlightRoute(route) {
  renderDrawRoute(route);
  updatePanel([route], 0);
}

if (typeof window !== "undefined") {
  window.setStartStop = setStartStop;
  window.setEndStop = setEndStop;
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
    const startRouteId = evt?.detail?.startId;
    const endRouteId = evt?.detail?.endId;
    if (!startRouteId || !endRouteId) return;
    setStartAndEnd(String(startRouteId), String(endRouteId), true);
  });
  window.addEventListener("jronda:set-start", (evt) => {
    const stopId = evt?.detail?.stopId;
    if (!stopId) return;
    setStartStop(String(stopId));
  });
  window.addEventListener("jronda:set-end", (evt) => {
    const stopId = evt?.detail?.stopId;
    if (!stopId) return;
    setEndStop(String(stopId));
  });
  const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart"];
  for (const eventName of activityEvents) {
    window.addEventListener(eventName, () => {
      armAutoResetTimer();
      armPanelIdleTimer();
    }, { passive: true });
  }
}

setBusVisibility(includeBus);
setRailRouteFilter(null);
wireRenderPointerInteractions(getRenderPointerInteractionBindings());
armAutoResetTimer();
armPanelIdleTimer();
