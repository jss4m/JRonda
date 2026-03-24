export const UIState = {
  stations: [],
  routesCatalog: [],
  layout: {
    positions: new Map(),
    edges: [],
  },
  ui: {
    from: null,
    to: null,
    selectedStation: null,
    selectedRoute: null,
    selectedLine: null,
    highlighted: [],
    displayMode: "ALL",
    busVisibility: true,
    mode: "idle", // idle | selecting-from | selecting-to | route-view
  },
  routes: [],
  listeners: new Set(),
};

function syncLegacyAliases() {
  UIState.from = UIState.ui.from;
  UIState.to = UIState.ui.to;
  UIState.selectedStation = UIState.ui.selectedStation;
  UIState.selectedRoute = UIState.ui.selectedRoute;
  UIState.highlightedSegments = Array.isArray(UIState.ui.highlighted) ? UIState.ui.highlighted : [];
  UIState.mode = UIState.ui.mode;
  UIState.selectedLine = UIState.ui.selectedLine;
  UIState.displayMode = UIState.ui.displayMode;
  UIState.busVisibility = UIState.ui.busVisibility;
}

syncLegacyAliases();

export function setState(patch = {}) {
  if (!patch || typeof patch !== "object") return;

  const next = { ...patch };

  if (Object.prototype.hasOwnProperty.call(next, "ui") && next.ui && typeof next.ui === "object") {
    UIState.ui = { ...UIState.ui, ...next.ui };
    delete next.ui;
  }

  if (Object.prototype.hasOwnProperty.call(next, "from")) UIState.ui.from = next.from ?? null;
  if (Object.prototype.hasOwnProperty.call(next, "to")) UIState.ui.to = next.to ?? null;
  if (Object.prototype.hasOwnProperty.call(next, "selectedStation")) UIState.ui.selectedStation = next.selectedStation ?? null;
  if (Object.prototype.hasOwnProperty.call(next, "selectedRoute")) UIState.ui.selectedRoute = next.selectedRoute ?? null;
  if (Object.prototype.hasOwnProperty.call(next, "selectedLine")) UIState.ui.selectedLine = next.selectedLine ?? null;
  if (Object.prototype.hasOwnProperty.call(next, "highlightedSegments")) UIState.ui.highlighted = Array.isArray(next.highlightedSegments) ? next.highlightedSegments.slice() : [];
  if (Object.prototype.hasOwnProperty.call(next, "mode")) UIState.ui.mode = next.mode ?? "idle";
  if (Object.prototype.hasOwnProperty.call(next, "displayMode")) UIState.ui.displayMode = next.displayMode ?? "ALL";
  if (Object.prototype.hasOwnProperty.call(next, "busVisibility")) UIState.ui.busVisibility = next.busVisibility ?? true;

  Object.assign(UIState, next);
  syncLegacyAliases();
  UIState.listeners.forEach((fn) => fn(UIState));
}

export function subscribe(fn) {
  UIState.listeners.add(fn);
  return () => UIState.listeners.delete(fn);
}
