// ======= interaction.js =======
import { createUI } from "./ui.js";
import { RoutingService } from "./bootstrap.js";
import { getServiceLabel } from "../style/routeStyle.js";
import {
  consumeInitToasts,
  drawRoute as renderDrawRoute,
  resetRenderState,
  setRailRouteFilter,
  setRailCategoryFilter,
  setRouteEndpoints,
  setBusVisibility,
} from "./render.js";

// ================= INITIAL CONFIG =================
let currentPreset = "SMART";
let startId = null;
let endId = null;
let currentRoutes = [];
let selectedIndex = 0;
let includeBus = true;
let currentCategory = null;
let resetTimerId = null;
const AUTO_RESET_MS = 2 * 60 * 1000;
const PANEL_IDLE_MS = 15 * 1000;
let panelIdleTimer = null;

const railCategoryOptions = Array.from(
  new Set(
    Array.from(RoutingService.stationMap.values())
      .filter((s) => s.mode === "RAIL" && s.category)
      .map((s) => String(s.category))
  )
).sort();

const railRoutesByCategory = new Map();
for (const s of Array.from(RoutingService.stationMap.values())) {
  if (s.mode !== "RAIL" || !s.category) continue;
  const category = String(s.category);
  if (!railRoutesByCategory.has(category)) railRoutesByCategory.set(category, new Map());
  const byRoute = railRoutesByCategory.get(category);
  const routeId = String(s.route_id || "");
  if (!routeId) continue;
  if (!byRoute.has(routeId)) {
    byRoute.set(routeId, {
      routeId,
      label: getServiceLabel(s, "RAIL"),
    });
  }
}

const stationOptions = Array.from(RoutingService.stationMap.values()).map((s) => ({
  stop_id: String(s.stop_id),
  stop_name: String(s.stop_name || s.stop_id),
  route_id: String(s.route_id || ""),
}));

// ================= SETUP UI =================
const { updatePanel, setStationInfo, setRailRouteOptions, resetUI, showToast } = createUI({
  onPresetChange: (preset) => {
    currentPreset = preset;
    showToast(`Preset changed: ${preset}`);
    if (startId && endId) updateRoute(true);
  },
  onBusToggle: (busEnabled) => {
    includeBus = Boolean(busEnabled);
    setBusVisibility(includeBus);
    showToast(includeBus ? "Bus routes included" : "Bus routes hidden");
    if (startId && endId) updateRoute(true);
  },
  onCategoryChange: (category) => {
    currentCategory = category ? String(category) : null;
    setRailCategoryFilter(currentCategory);
    setRailRouteFilter(null);
    const options = currentCategory
      ? Array.from((railRoutesByCategory.get(currentCategory) || new Map()).values())
          .sort((a, b) => a.label.localeCompare(b.label))
      : [];
    setRailRouteOptions(options);
    showToast(currentCategory ? `Rail category: ${currentCategory}` : "Rail category filter cleared");
  },
  onRailRouteChange: (routeId) => {
    const selected = routeId ? String(routeId) : null;
    setRailRouteFilter(selected);
    if (selected) {
      showToast(`Rail line focus: ${selected}`);
    } else {
      showToast("Rail line focus cleared");
    }
  },
  onReset: () => {
    resetAllState("manual");
  },
  onSearchSelect: (stopId) => {
    handleStationSelection(String(stopId), "search");
  },
  categoryOptions: railCategoryOptions,
  stationOptions,
});

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
    setStationInfo("Tap a station to view details");
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
  currentCategory = null;
  RoutingService.routeCache.clear();
  setRouteEndpoints(null, null);
  setBusVisibility(true);
  setRailCategoryFilter(null);
  setRailRouteFilter(null);
  setRailRouteOptions([]);
  resetRenderState();
  resetUI();
  updatePanel([], 0);
  setStationInfo(reason === "auto" ? "Session auto-reset." : "Reset complete.");
  showToast(reason === "auto" ? "Auto reset due to inactivity" : "Reset complete");
  armAutoResetTimer();
  armPanelIdleTimer();
}

// ================= START / END SELECTION =================
export function setStartStop(stopId) {
  const nextStart = String(stopId);
  if (endId && nextStart === endId) {
    setStationInfo("Start and end cannot be the same station.");
    showToast("Start and end cannot be the same station.", "warn");
    return;
  }
  startId = nextStart;
  setRouteEndpoints(startId, endId);
  const s = RoutingService.stationMap.get(startId);
  if (s) showToast(`Start set: ${s.stop_name}`);
  if (startId && endId) updateRoute();
  armAutoResetTimer();
  armPanelIdleTimer();
}

export function setEndStop(stopId) {
  const nextEnd = String(stopId);
  if (startId && nextEnd === startId) {
    setStationInfo("Start and end cannot be the same station.");
    showToast("Start and end cannot be the same station.", "warn");
    return;
  }
  endId = nextEnd;
  setRouteEndpoints(startId, endId);
  const e = RoutingService.stationMap.get(endId);
  if (e) showToast(`End set: ${e.stop_name}`);
  if (startId && endId) updateRoute();
  armAutoResetTimer();
  armPanelIdleTimer();
}

function setStartAndEnd(startStopId, endStopId, forceRefresh = true) {
  startId = String(startStopId);
  endId = String(endStopId);
  if (startId === endId) {
    setStationInfo("Start and end cannot be the same station.");
    showToast("Start and end cannot be the same station.", "warn");
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
    setStationInfo(`Selected ${station.stop_name} (${label}) via ${source}.`);
    showToast(`Selected: ${station.stop_name}`);
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
    setStationInfo("No route found for the selected stations and filters.");
    showToast("No route found with current filters.", "warn");
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
  showToast(`Route options updated (${currentRoutes.length})`);
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
      setStationInfo(`${station.stop_name} (${label})`);
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
setRailCategoryFilter(null);
setRailRouteFilter(null);
armAutoResetTimer();
armPanelIdleTimer();
