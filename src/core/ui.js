// ======= ui.js =======
import { getRouteColor } from "../style/routeStyle.js";
import { I18N, I18N_KEY } from "./i18n.js";

export function createUI(config) {


  const {
    onPresetChange = () => {},
    onReset = () => {},
    onSearchSelect = () => {},
    onRouteSelect = () => {},
    onLegendRouteSelect = () => {},
    stationOptions = [],
    lineStops = [],
    poiOptions = []
  } = config || {};
  let lang = localStorage.getItem(I18N_KEY) || "en";
  if (!I18N[lang]) lang = "en";
  const t = (key, fallback = "") => I18N[lang]?.[key] || I18N.en[key] || fallback || key;
  const tf = (key, fallback, params = {}) => {
    let out = t(key, fallback);
    for (const [pKey, pValue] of Object.entries(params)) {
      out = out.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pValue));
    }
    return out;
  };
  window.jrondaI18n = { t, getLang: () => lang };
  const dynamicStyleId = "jronda-dynamic-colors";
  const dynamicColorClasses = new Set();

  function ensureColorClass(color, property) {
    const normalized = String(color || "").trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return "";
    const prop = property === "border-color" ? "border" : "bg";
    const className = `${prop}-c-${normalized.slice(1).toLowerCase()}`;
    if (!dynamicColorClasses.has(className)) {
      const styleNode = document.getElementById(dynamicStyleId) || (() => {
        const node = document.createElement("style");
        node.id = dynamicStyleId;
        document.head.appendChild(node);
        return node;
      })();
      styleNode.appendChild(
        document.createTextNode(
          property === "border-color"
            ? `.step-node.${className}{border-color:${normalized};}`
            : `.step-line.${className}, .legend-swatch.${className}, .rseg.${className}{background:${normalized};}`
        )
      );
      dynamicColorClasses.add(className);
    }
    return className;
  }

  const map = document.getElementById("map");

  const existingRoot = document.getElementById("kiosk-root");
  if (existingRoot) {
    existingRoot.remove();
  }

  const root = document.createElement("div");
  root.id = "kiosk-root";
  root.className = "bg-slate-50 text-slate-900 antialiased";
  const topbar = document.createElement("header");
  topbar.id = "kiosk-topbar";
  topbar.classList.add("backdrop-blur-sm");
  topbar.innerHTML = `
    <div class="brand">
      <div class="brand-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.5"/><line x1="8" y1="1" x2="8" y2="4"/><line x1="8" y1="12" x2="8" y2="15"/><line x1="1" y1="8" x2="4" y2="8"/><line x1="12" y1="8" x2="15" y2="8"/><line x1="3.1" y1="3.1" x2="5.2" y2="5.2"/><line x1="10.8" y1="10.8" x2="12.9" y2="12.9"/></svg>
      </div>
      <div class="brand-text">J<span class="r">R</span>onda</div>
    </div>
    <div class="view-switch" role="tablist" aria-label="Map view switch">
      <button type="button" class="view-pill act" data-view="map" role="tab" aria-selected="true">Map</button>
      <button type="button" class="view-pill" data-view="lines" role="tab" aria-selected="false">Lines</button>
    </div>
    <div class="topbar-nearby">
      <label for="jronda-nearby-select" class="nearby-label">Nearby</label>
      <select id="jronda-nearby-select" class="nearby-select">
        <option value="">Select POI</option>
      </select>
    </div>
  `;
  root.appendChild(topbar);

  const body = document.createElement("div");
  body.id = "kiosk-body";
  body.className = "shadow-2xl";

  const mapWrap = document.createElement("div");
  mapWrap.id = "kiosk-map-wrap";
  mapWrap.className = "relative";
  const mapSurface = document.createElement("div");
  mapSurface.id = "kiosk-map-surface";
  mapSurface.dataset.view = "map";
  const linesView = document.createElement("div");
  linesView.id = "kiosk-lines-view";
  linesView.innerHTML = `<div id="kiosk-lines-grid"></div>`;
  const clockWidget = document.createElement("div");
  clockWidget.id = "kiosk-clock";
  clockWidget.className = "w-72 max-w-72";
  clockWidget.setAttribute("aria-live", "off");
  clockWidget.innerHTML = `
    <div class="kiosk-clock-grid">
      <div id="kiosk-clock-day" class="kiosk-clock-day">-</div>
      <div class="kiosk-clock-right">
        <div id="kiosk-clock-date" class="kiosk-clock-date">-- -- ----</div>
        <div id="kiosk-clock-time" class="kiosk-clock-time">--:--:--</div>
      </div>
    </div>
  `;
  const legendDock = document.createElement("div");
  legendDock.id = "map-legend-dock";

  const sidebar = document.createElement("aside");
  sidebar.id = "kiosk-sidebar";
  sidebar.className = "bg-white/95";
  sidebar.setAttribute("aria-label", t("sidebar_aria", "Transit controls and route results"));

  const loadingOverlay = document.createElement("div");
  loadingOverlay.id = "kiosk-loading-overlay";
  loadingOverlay.className = "kiosk-loading-overlay";

  /* ## LOADING BAR COMPONENT (Viewport-responsive: min(90vw,420px) x clamp(12vh,120px)) */
  const loadingPanel = document.createElement("div");
  loadingPanel.className = "kiosk-loading-panel";
  loadingPanel.innerHTML = `
    <div class="loading-brand">
      <div class="brand-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.5"/><line x1="8" y1="1" x2="8" y2="4"/><line x1="8" y1="12" x2="8" y2="15"/><line x1="1" y1="8" x2="4" y2="8"/><line x1="12" y1="8" x2="15" y2="8"/><line x1="3.1" y1="3.1" x2="5.2" y2="5.2"/><line x1="10.8" y1="10.8" x2="12.9" y2="12.9"/></svg>
      </div>
      <div class="brand-text">J<span class="r">R</span>onda</div>
    </div>
  `;

  const loadingMessage = document.createElement("div");
  loadingMessage.id = "kiosk-loading-message";
  loadingMessage.textContent = "Loading map...";
  loadingMessage.className = "kiosk-loading-message";

  const loadingBar = document.createElement("div");
  loadingBar.id = "kiosk-loading-bar";
  loadingBar.className = "kiosk-loading-bar";

  const loadingFill = document.createElement("div");
  loadingFill.id = "kiosk-loading-fill";
  loadingFill.className = "kiosk-loading-fill";

  loadingBar.appendChild(loadingFill);
  loadingPanel.appendChild(loadingMessage);
  loadingPanel.appendChild(loadingBar);
  loadingOverlay.appendChild(loadingPanel);

  if (map) mapSurface.appendChild(map);
  mapSurface.appendChild(linesView);
  mapWrap.appendChild(mapSurface);
  mapWrap.appendChild(legendDock);
  body.appendChild(mapWrap);
  body.appendChild(sidebar);
  root.appendChild(body);
  const statusDock = document.createElement("div");
  statusDock.id = "kiosk-status-dock";
  statusDock.appendChild(clockWidget);
  statusDock.appendChild(loadingOverlay);
  root.appendChild(statusDock);
  document.body.appendChild(root);
  const nearbySelect = document.getElementById("jronda-nearby-select");
  const stationById = new Map((stationOptions || []).map((station) => [String(station.stop_id || ""), station]));
  const allPoi = Array.isArray(poiOptions) ? poiOptions.slice() : [];
  function geoDistanceMeters(lat1, lon1, lat2, lon2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function refillNearbyOptions(anchorStopId = "") {
    if (!nearbySelect) return;
    nearbySelect.innerHTML = `<option value="">Select POI</option>`;
    const anchor = stationById.get(String(anchorStopId || ""));
    const sorted = allPoi.slice().sort((left, right) => {
      if (!anchor) return String(left.name || "").localeCompare(String(right.name || ""));
      const lDist = geoDistanceMeters(Number(anchor.stop_lat), Number(anchor.stop_lon), Number(left.latitude ?? left.lat), Number(left.longitude ?? left.lon));
      const rDist = geoDistanceMeters(Number(anchor.stop_lat), Number(anchor.stop_lon), Number(right.latitude ?? right.lat), Number(right.longitude ?? right.lon));
      return lDist - rDist;
    });
    sorted.slice(0, 120).forEach((poi) => {
      const opt = document.createElement("option");
      opt.value = String(poi.id || "");
      const category = String(poi.category || "POI").trim();
      const maybeDist = anchor
        ? ` · ${Math.round(
            geoDistanceMeters(
              Number(anchor.stop_lat),
              Number(anchor.stop_lon),
              Number(poi.latitude ?? poi.lat),
              Number(poi.longitude ?? poi.lon)
            )
          )}m`
        : "";
      opt.textContent = `${String(poi.name || "POI")} (${category})${maybeDist}`;
      nearbySelect.appendChild(opt);
    });
  }
  if (nearbySelect) {
    refillNearbyOptions("");
    nearbySelect.addEventListener("change", () => {
      const selectedPoi = allPoi.find((poi) => String(poi.id || "") === String(nearbySelect.value || ""));
      if (!selectedPoi) return;
      window.dispatchEvent(new CustomEvent("jronda:nearby-poi-selected", { detail: { poi: selectedPoi } }));
    });
  }

  let lastLoadingProgress = 0;
  let loadingHideTimer = null;
  function setLoadingState(progress = 0, message = "") {
    const raw = Math.min(1, Math.max(0, Number(progress) || 0));
    const clamped = Math.max(lastLoadingProgress, raw);
    lastLoadingProgress = clamped;
    const messageNode = document.getElementById("kiosk-loading-message");
    const fillNode = document.getElementById("kiosk-loading-fill");
    const overlayNode = document.getElementById("kiosk-loading-overlay");
    if (messageNode) messageNode.textContent = message || "Loading map...";
    if (fillNode) fillNode.style.width = `${Math.round(clamped * 100)}%`;
    if (overlayNode) {
      overlayNode.classList.toggle("is-complete", clamped >= 1);
      if (clamped >= 1) {
        if (loadingHideTimer) clearTimeout(loadingHideTimer);
        loadingHideTimer = setTimeout(() => {
          overlayNode.classList.add("is-hidden");
        }, 320);
      } else {
        if (loadingHideTimer) clearTimeout(loadingHideTimer);
        overlayNode.classList.remove("is-hidden");
      }
    }
  }

  setLoadingState(0.02, "Loading map...");

  window.addEventListener("jronda:loading-progress", (evt) => {
    const detail = evt?.detail || {};
    setLoadingState(detail.progress || 0, detail.message || "Loading map...");
  });

  window.addEventListener("jronda:render-ready", () => {
    setLoadingState(1, "Map is ready");
  });

  // Trigger render init after DOM
  import('./render.js').then(async module => {
    if (module.init && map) {
      await module.init(map);
    }
  });

  const controlBlock = document.createElement("section");
  controlBlock.className = "panel-block sidebar-section controls-section fpills-block rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm";
  const controlBlockTitle = document.createElement("h3");
  controlBlockTitle.className = "section-title";
  controlBlockTitle.textContent = t("controls", "CONTROLS");
  controlBlock.appendChild(controlBlockTitle);
  sidebar.appendChild(controlBlock);

  const searchBlock = document.createElement("section");
  searchBlock.className = "panel-block sidebar-section jplan rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm";
  const searchBlockTitle = document.createElement("h3");
  searchBlockTitle.className = "section-title";
  searchBlockTitle.textContent = t("search", "SEARCH");
  searchBlock.appendChild(searchBlockTitle);
  sidebar.appendChild(searchBlock);

  const resultBlock = document.createElement("section");
  resultBlock.className = "panel-block sidebar-section route-result-section rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm";
  const resultBlockTitle = document.createElement("h3");
  resultBlockTitle.className = "section-title";
  resultBlockTitle.textContent = t("route_result", "ROUTE RESULT");
  resultBlock.appendChild(resultBlockTitle);
  sidebar.appendChild(resultBlock);

  const presetRow = document.createElement("div");
  presetRow.className = "control-row-presets";
  controlBlock.appendChild(presetRow);

  const presetButtonsWrap = document.createElement("div");
  presetButtonsWrap.className = "preset-buttons-wrap fpills flex flex-wrap gap-1.5";
  presetRow.appendChild(presetButtonsWrap);

  const langSelect = document.createElement("select");
  langSelect.id = "jronda-language";
  langSelect.className = "sr-control sr-language w-10";
  const langOptions = [
    ["en", "EN"],
    ["ms", "MS"],
    ["zh", "ZH"],
    ["yue", "YUE"],
    ["ta", "TA"],
    ["ar", "AR"],
  ];
  for (const [value, label] of langOptions) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    langSelect.appendChild(opt);
  }
  langSelect.value = lang;
  langSelect.onchange = () => {
    lang = langSelect.value || "en";
    localStorage.setItem(I18N_KEY, lang);
    window.jrondaI18n = { t, getLang: () => lang };
    applyI18n();
    updateKioskClock();
    window.dispatchEvent(new CustomEvent("jronda:lang-changed", { detail: { lang } }));
  };
  presetRow.appendChild(langSelect);

  const presets = [
    { id: "SMART", label: "Smart" },
    { id: "FAST", label: "Fast" },
    { id: "BUDGET", label: "Budget" },
  ];
  let activePreset = "SMART";
  const presetButtons = new Map();

  function setActivePreset(presetId) {
    activePreset = presetId;
    for (const [id, btn] of presetButtons.entries()) {
      const active = id === presetId;
      btn.classList.toggle("primary", active);
      btn.classList.toggle("act", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  presets.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sr-btn fp transition-all duration-150";
    btn.textContent = p.label;
    btn.setAttribute("aria-label", tf("preset_aria", "Use {preset} routing preset", { preset: p.label }));
    btn.onclick = () => {
      setActivePreset(p.id);
      onPresetChange(p.id);
    };
    presetButtons.set(p.id, btn);
    presetButtonsWrap.appendChild(btn);
  });
  setActivePreset("SMART");

  // Rail route filter removed (feature deprecated).
  // Keep a placeholder `routeSelect` variable for backward compatibility
  // with callers that may still attempt to set options.
  let routeSelect = null;

  const journeyWrap = document.createElement("div");
  journeyWrap.className = "jplan-fields flex flex-col gap-1.5";
  searchBlock.appendChild(journeyWrap);

  const fromRow = document.createElement("div");
  fromRow.className = "frow";
  fromRow.innerHTML = `
    <div class="fdot fd-cy"></div>
    <input id="jronda-from-search" class="sr-control finp" type="text" autocomplete="off" placeholder="From station" aria-label="From station" />
  `;
  journeyWrap.appendChild(fromRow);

  const midRow = document.createElement("div");
  midRow.className = "mid-row";
  midRow.innerHTML = `
    <div class="dot-line"></div>
    <button type="button" id="jronda-swap-btn" class="swap-btn">⇅ swap</button>
  `;
  journeyWrap.appendChild(midRow);

  const toRow = document.createElement("div");
  toRow.className = "frow to-row";
  toRow.innerHTML = `
    <div class="fdot fd-pk"></div>
    <input id="jronda-to-search" class="sr-control finp" type="text" autocomplete="off" placeholder="To station" aria-label="To station" />
  `;
  journeyWrap.appendChild(toRow);

  const fromSuggestions = document.createElement("div");
  fromSuggestions.id = "jronda-from-suggestions";
  fromSuggestions.className = "search-suggestions";
  fromSuggestions.setAttribute("role", "listbox");
  journeyWrap.appendChild(fromSuggestions);

  const toSuggestions = document.createElement("div");
  toSuggestions.id = "jronda-to-suggestions";
  toSuggestions.className = "search-suggestions";
  toSuggestions.setAttribute("role", "listbox");
  journeyWrap.appendChild(toSuggestions);

  const journeyButtons = document.createElement("div");
  journeyButtons.className = "jbtns flex items-center gap-2";
  journeyButtons.innerHTML = `
    <button type="button" id="jronda-clear-journey" class="jb jb-cl">Clear</button>
    <button type="button" id="jronda-find-route" class="jb jb-go">Find route</button>
  `;
  searchBlock.appendChild(journeyButtons);

  const resetRow = document.createElement("div");
  resetRow.className = "control-row-reset";
  controlBlock.appendChild(resetRow);

  const resetBtn = document.createElement("button");
  resetBtn.id = "jronda-reset-btn";
  resetBtn.type = "button";
  resetBtn.className = "sr-btn";
  resetBtn.textContent = t("reset", "Reset");
  resetBtn.setAttribute("aria-label", t("reset_map", "Reset map and panel"));
  resetBtn.onclick = () => onReset("manual");
  resetRow.appendChild(resetBtn);

  const resetHint = document.createElement("span");
  resetHint.id = "jronda-reset-hint";
  resetHint.className = "hint-text is-hidden";
  resetHint.textContent = t("auto_reset_active", "Auto reset active");
  resetRow.appendChild(resetHint);

  // Debug toggle button
  const debugBtn = document.createElement("button");
  debugBtn.id = "jronda-layout-debug";
  debugBtn.type = "button";
  debugBtn.className = "sr-btn ghost";
  debugBtn.textContent = "Layout Debug";
  debugBtn.title = "Toggle raw schematic layout overlay";
  debugBtn.onclick = () => {
    if (typeof window.drawLayoutDebugOverlay === 'function') {
      window.drawLayoutDebugOverlay();
      debugBtn.textContent = debugBtn.textContent === 'Layout Debug' ? 'Hide Debug' : 'Layout Debug';
    } else {
      console.warn('drawLayoutDebugOverlay not available');
    }
  };
  resetRow.appendChild(debugBtn);

  // Global toggle function
  window.toggleLayoutDebug = debugBtn.onclick;

  const stationInfo = document.createElement("div");
  stationInfo.id = "jronda-station-info";
  stationInfo.className = "panel-block";
  stationInfo.setAttribute("aria-live", "polite");
  stationInfo.textContent = t("tap_station_info", "Tap a station to view details");
  resultBlock.appendChild(stationInfo);

  const panel = document.createElement("div");
  panel.id = "route-info-panel";
  resultBlock.appendChild(panel);

  const title = document.createElement("h4");
  title.id = "jronda-route-info-title";
  title.textContent = t("route_info", "Route Info");
  title.className = "panel-title";
  panel.appendChild(title);

  const content = document.createElement("div");
  content.id = "route-info-content";
  panel.appendChild(content);

  const routeDetailModal = document.createElement("div");
  routeDetailModal.id = "route-detail-modal";
  routeDetailModal.setAttribute("role", "dialog");
  routeDetailModal.setAttribute("aria-modal", "true");
  routeDetailModal.setAttribute("aria-label", "Route details");
  const routeDetailCard = document.createElement("div");
  routeDetailCard.id = "route-detail-card";
  const routeDetailHead = document.createElement("div");
  routeDetailHead.id = "route-detail-head";
  const routeDetailTitle = document.createElement("div");
  routeDetailTitle.id = "route-detail-title";
  routeDetailTitle.textContent = t("details", "Details");
  const routeDetailClose = document.createElement("button");
  routeDetailClose.id = "jronda-route-detail-close";
  routeDetailClose.type = "button";
  routeDetailClose.className = "sr-btn ghost";
  routeDetailClose.textContent = t("close", "Close");
  routeDetailHead.appendChild(routeDetailTitle);
  routeDetailHead.appendChild(routeDetailClose);
  const routeDetailContent = document.createElement("div");
  routeDetailContent.id = "route-detail-content";
  routeDetailCard.appendChild(routeDetailHead);
  routeDetailCard.appendChild(routeDetailContent);
  routeDetailModal.appendChild(routeDetailCard);
  document.body.appendChild(routeDetailModal);

  const searchModal = document.createElement("div");
  searchModal.id = "search-modal";
  searchModal.setAttribute("role", "dialog");
  searchModal.setAttribute("aria-modal", "true");
  searchModal.setAttribute("aria-label", "Set station");
  const searchModalCard = document.createElement("div");
  searchModalCard.id = "search-modal-card";
  const searchModalHead = document.createElement("div");
  searchModalHead.id = "search-modal-head";
  const searchModalTitle = document.createElement("div");
  searchModalTitle.id = "search-modal-title";
  searchModalTitle.textContent = t("set_station", "Set station");
  const searchModalClose = document.createElement("button");
  searchModalClose.id = "search-modal-close";
  searchModalClose.type = "button";
  searchModalClose.className = "sr-btn ghost";
  searchModalClose.textContent = t("close", "Close");
  searchModalHead.appendChild(searchModalTitle);
  searchModalHead.appendChild(searchModalClose);
  const searchModalBody = document.createElement("div");
  searchModalBody.id = "search-modal-body";
  const searchModalActions = document.createElement("div");
  searchModalActions.id = "search-modal-actions";
  searchModalBody.appendChild(searchModalActions);
  searchModalCard.appendChild(searchModalHead);
  searchModalCard.appendChild(searchModalBody);
  searchModal.appendChild(searchModalCard);
  document.body.appendChild(searchModal);

  const legendPanel = document.createElement("div");
  legendPanel.id = "legend-panel";
  legendPanel.setAttribute("aria-label", "Route legend");
  legendDock.appendChild(legendPanel);

  const legendTitle = document.createElement("button");
  legendTitle.id = "jronda-legend-title";
  legendTitle.textContent = t("legend_tap", "Legend (tap to highlight)");
  legendTitle.className = "legend-title";
  legendTitle.type = "button";
  legendTitle.onclick = () => {
    if (legendPanel.dataset.legendEmpty === "1") {
      window.dispatchEvent(new CustomEvent("jronda:legend-retry"));
    }
  };
  legendPanel.onclick = (evt) => {
    if (evt.target === legendPanel || evt.target === legendList) {
      if (legendPanel.dataset.legendEmpty === "1") {
        window.dispatchEvent(new CustomEvent("jronda:legend-retry"));
      }
    }
  };
  legendDock.prepend(legendTitle);

  const legendList = document.createElement("div");
  legendList.id = "legend-list";
  legendPanel.appendChild(legendList);
  const legendButtons = new Map();
  let legendItemsAll = [];

  function normalizeRouteKey(value) {
    return String(value || "").trim().toUpperCase().replace(/-/g, "_");
  }

  function renderLinesView(items = []) {
    const linesGrid = document.getElementById("kiosk-lines-grid");
    if (!linesGrid) return;
    const normalizedItems = Array.isArray(items) ? items : [];
    if (!normalizedItems.length) {
      linesGrid.innerHTML = `<div class="lines-empty">${t("legend_unavailable", "Legend unavailable. Tap to retry.")}</div>`;
      return;
    }
    const groupedStops = new Map();
    const stationBySource = new Map();
    const stationByName = new Map();
    const normalizeNameKey = (name) =>
      String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ");
    const sourceStops = Array.isArray(lineStops) && lineStops.length ? lineStops : stationOptions;
    const sourceKeyOf = (s) => {
      const source = String(s?.source_stop_id || "").trim();
      if (source) return source;
      const sid = String(s?.stop_id || "").trim();
      if (!sid) return "";
      const rid = String(s?.route_id || "").trim();
      const routePrefix = rid ? `${rid}_` : "";
      if (routePrefix && sid.startsWith(routePrefix)) return sid.slice(routePrefix.length);
      return sid;
    };
    for (const station of stationOptions || []) {
      const sourceKey = sourceKeyOf(station);
      if (!sourceKey) continue;
      const list = stationBySource.get(sourceKey) || [];
      list.push(station);
      stationBySource.set(sourceKey, list);
      const nameKey = normalizeNameKey(station?.stop_name);
      if (!nameKey) continue;
      const byName = stationByName.get(nameKey) || [];
      byName.push(station);
      stationByName.set(nameKey, byName);
    }
    const sortedSourceStops = (sourceStops || []).slice().sort((a, b) => {
      const routeCmp = String(a?.route_id || "").localeCompare(String(b?.route_id || ""));
      if (routeCmp !== 0) return routeCmp;
      const as = Number(a?.stop_sequence ?? a?.seq ?? 0);
      const bs = Number(b?.stop_sequence ?? b?.seq ?? 0);
      if (as !== bs) return as - bs;
      return String(a?.stop_id || "").localeCompare(String(b?.stop_id || ""));
    });
    for (const stop of sortedSourceStops) {
      const key = normalizeRouteKey(stop?.route_id);
      if (!key) continue;
      const list = groupedStops.get(key) || [];
      const stopId = String(stop?.stop_id || "").trim();
      const name = String(stop?.stop_name || "").trim();
      const sourceStopId = sourceKeyOf(stop);
      if (name && stopId && !list.find((x) => x.stopId === stopId)) {
        list.push({
          stopId,
          sourceStopId,
          stopName: name,
          routeId: String(stop?.route_id || ""),
          category: String(stop?.category || ""),
          mode: String(stop?.mode || ""),
          color: String(stop?.route_color || ""),
        });
      }
      groupedStops.set(key, list);
    }
    linesGrid.innerHTML = "";
    normalizedItems.forEach((item) => {
      const routeId = String(item.routeId || "");
      const color = String(item.color || "#64748b");
      const row = document.createElement("div");
      row.className = "lines-row";
      row.dataset.routeId = routeId;
      const stops = groupedStops.get(normalizeRouteKey(routeId)) || [];
      row.innerHTML = `
        <button type="button" class="lines-line-chip" data-route-id="${routeId}">
          <span class="lines-chip-swatch" style="background:${color}"></span>
          <span class="lines-chip-label">${String(item.label || routeId || "")}</span>
        </button>
        <div class="lines-stops-track"></div>
      `;
      const stopWrap = row.querySelector(".lines-stops-track");
      if (stopWrap) {
        if (stops.length) {
          stopWrap.classList.add("has-stops");
          stopWrap.style.setProperty("--track-color", color);
          stops.forEach((stopRef, idx) => {
            const nodeWrap = document.createElement("div");
            nodeWrap.className = "lines-node-wrap";
            const stop = document.createElement("button");
            stop.type = "button";
            stop.className = "lines-node";
            stop.title = stopRef.stopName;
            stop.setAttribute("data-stop-id", String(stopRef.stopId || ""));
            stop.addEventListener("click", () => {
              const match = (stationOptions || []).find((station) => String(station.stop_id || "") === String(stopRef.stopId || ""));
              if (!match) return;
              const fromInput = document.getElementById("jronda-from-search");
              const toInput = document.getElementById("jronda-to-search");
              const fromId = String(fromInput?.dataset.stopId || "");
              const toId = String(toInput?.dataset.stopId || "");
              const useFrom = !fromId || (fromId && toId);
              if (useFrom && fromInput) {
                fromInput.value = String(match.stop_name || "");
                fromInput.dataset.stopId = String(match.stop_id || "");
                onSearchSelect(String(match.stop_id), "start");
              } else if (toInput) {
                toInput.value = String(match.stop_name || "");
                toInput.dataset.stopId = String(match.stop_id || "");
                onSearchSelect(String(match.stop_id), "end");
              }
              refreshLinesEndpointHighlight();
            });
            const label = document.createElement("div");
            label.className = "lines-node-label";
            const title = document.createElement("span");
            title.className = "lines-node-name";
            title.textContent = stopRef.stopName;
            label.appendChild(title);
            const nearbyWrap = document.createElement("span");
            nearbyWrap.className = "lines-node-nearby";
            const currentCategory = String(stopRef.category || stopRef.mode || "").toUpperCase();
            const currentNameKey = normalizeNameKey(stopRef.stopName || "");
            const sourceSiblings = stationBySource.get(String(stopRef.sourceStopId || "")) || [];
            const nameSiblings = stationByName.get(currentNameKey) || [];
            const siblingPool = currentCategory === "ERL"
              ? nameSiblings
              : [...sourceSiblings, ...nameSiblings];
            const siblingRoutes = Array.from(
              new Map(
                siblingPool
                  .filter((s) => normalizeRouteKey(s.route_id) !== normalizeRouteKey(stopRef.routeId))
                  .map((s) => {
                    const siblingCategory = String(s.category || s.mode || "").toUpperCase();
                    const siblingNameKey = normalizeNameKey(s.stop_name || "");
                    const erlInvolved = currentCategory === "ERL" || siblingCategory === "ERL";
                    if (erlInvolved && siblingNameKey !== currentNameKey) return null;
                    let connectionType = "same-family";
                    if (currentCategory === "ERL" || siblingCategory === "ERL") {
                      connectionType = "connecting";
                    } else if (currentCategory === "KTM" && siblingCategory !== "KTM") {
                      connectionType = "connecting";
                    } else if (currentCategory !== "KTM" && siblingCategory !== "KTM") {
                      connectionType = "interchange";
                    }
                    if (connectionType === "same-family") return null;
                    return {
                      routeId: String(s.route_id || ""),
                      category: siblingCategory || "RAIL",
                      color: getRouteColor(String(s.route_id || ""), false, s.route_color ?? null).color,
                      connectionType,
                    };
                  })
                  .filter(Boolean)
                  .map((item) => [`${item.routeId}|${item.category}|${item.connectionType}`, item])
              ).values()
            );
            siblingRoutes.slice(0, 6).forEach((item) => {
              const chip = document.createElement("span");
              chip.className = "lines-mini-chip";
              const icon = item.connectionType === "interchange"
                ? "/src/img/Interchange_icon.svg"
                : "/src/img/Connecting_icon.svg";
              chip.innerHTML = `
                <img class="lines-mini-icon" src="${icon}" alt="${item.category}"/>
                <span class="lines-mini-swatch" style="background:${item.color || "#64748b"}"></span>
                <span class="lines-mini-text">${item.category || item.mode || "RAIL"}</span>
              `;
              nearbyWrap.appendChild(chip);
            });
            if (nearbyWrap.childElementCount > 0) label.appendChild(nearbyWrap);
            nodeWrap.appendChild(stop);
            nodeWrap.appendChild(label);
            stopWrap.appendChild(nodeWrap);
          });
        } else {
          const none = document.createElement("span");
          none.className = "lines-stop lines-stop-empty";
          none.textContent = t("route", "Route");
          stopWrap.appendChild(none);
        }
      }
      const lineBtn = row.querySelector(".lines-line-chip");
      if (lineBtn) {
        lineBtn.addEventListener("click", () => {
          setSurfaceView("map");
          onLegendRouteSelect(routeId);
        });
      }
      linesGrid.appendChild(row);
    });
    requestAnimationFrame(() => {
      reflowLinesTrackGeometry();
      requestAnimationFrame(reflowLinesTrackGeometry);
    });
    refreshLinesEndpointHighlight();
  }

  function reflowLinesTrackGeometry() {
    document.querySelectorAll(".lines-stops-track.has-stops").forEach((track) => {
      const nodes = track.querySelectorAll(".lines-node");
      if (!nodes.length) {
        track.style.removeProperty("--track-left");
        track.style.removeProperty("--track-right");
        return;
      }
      const firstRect = nodes[0].getBoundingClientRect();
      const lastRect = nodes[nodes.length - 1].getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const left = Math.max(0, (firstRect.left - trackRect.left) + firstRect.width / 2);
      const right = Math.max(0, trackRect.width - ((lastRect.left - trackRect.left) + lastRect.width / 2));
      track.style.setProperty("--track-left", `${left}px`);
      track.style.setProperty("--track-right", `${right}px`);
    });
  }

  function refreshLinesEndpointHighlight() {
    const fromInputEl = document.getElementById("jronda-from-search");
    const toInputEl = document.getElementById("jronda-to-search");
    const fromId = String(fromInputEl?.dataset.stopId || "");
    const toId = String(toInputEl?.dataset.stopId || "");
    document.querySelectorAll(".lines-node").forEach((node) => {
      const nodeStopId = String(node.getAttribute("data-stop-id") || "");
      node.classList.toggle("endpoint-start", Boolean(fromId) && nodeStopId === fromId);
      node.classList.toggle("endpoint-end", Boolean(toId) && nodeStopId === toId);
    });
  }

  function setSurfaceView(viewMode = "map") {
    const mode = viewMode === "lines" ? "lines" : "map";
    mapSurface.dataset.view = mode;
    topbar.querySelectorAll(".view-pill").forEach((btn) => {
      const active = btn.dataset.view === mode;
      btn.classList.toggle("act", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  topbar.querySelectorAll(".view-pill").forEach((btn) => {
    btn.addEventListener("click", () => setSurfaceView(btn.dataset.view));
  });

  const legendModal = document.createElement("div");
  legendModal.id = "legend-modal";
  legendModal.setAttribute("role", "dialog");
  legendModal.setAttribute("aria-modal", "true");
  legendModal.setAttribute("aria-label", "Full legend");
  const legendModalCard = document.createElement("div");
  legendModalCard.id = "legend-modal-card";
  const legendModalHead = document.createElement("div");
  legendModalHead.id = "legend-modal-head";
  const legendModalTitle = document.createElement("div");
  legendModalTitle.id = "legend-modal-title";
  legendModalTitle.textContent = t("legend_full", "All routes");
  const legendModalClose = document.createElement("button");
  legendModalClose.id = "legend-modal-close";
  legendModalClose.type = "button";
  legendModalClose.className = "sr-btn ghost";
  legendModalClose.textContent = t("close", "Close");
  legendModalHead.appendChild(legendModalTitle);
  legendModalHead.appendChild(legendModalClose);
  const legendModalBody = document.createElement("div");
  legendModalBody.id = "legend-modal-body";
  const legendModalTable = document.createElement("div");
  legendModalTable.id = "legend-modal-table";
  legendModalBody.appendChild(legendModalTable);
  legendModalCard.appendChild(legendModalHead);
  legendModalCard.appendChild(legendModalBody);
  legendModal.appendChild(legendModalCard);
  document.body.appendChild(legendModal);

  function hideRoutePanel() {
    panel.style.display = "none";
    routeDetailModal.style.display = "none";
  }

  function showRoutePanel() {
    panel.style.display = "";
  }

  function closeRouteDetail() {
    routeDetailModal.style.display = "none";
    routeDetailContent.innerHTML = "";
  }

  function openRouteDetail(titleText, detailNode) {
    routeDetailTitle.textContent = titleText || t("details", "Details");
    routeDetailContent.innerHTML = "";
    if (detailNode) routeDetailContent.appendChild(detailNode);
    routeDetailModal.style.display = "flex";
  }

  routeDetailClose.onclick = closeRouteDetail;
  routeDetailModal.addEventListener("click", (evt) => {
    if (evt.target === routeDetailModal) closeRouteDetail();
  });

  function closeLegendModal() {
    legendModal.style.display = "none";
  }

  legendModalClose.onclick = closeLegendModal;
  legendModal.addEventListener("click", (evt) => {
    if (evt.target === legendModal) closeLegendModal();
  });

  if (typeof window !== "undefined") {
    window.addEventListener("jronda:close-legend-modal", closeLegendModal);
    window.addEventListener("resize", reflowLinesTrackGeometry);
  }

  function closeSearchModal() {
    searchModal.style.display = "none";
    if (searchModalTitle) delete searchModalTitle.dataset.locked;
  }

  searchModalClose.onclick = closeSearchModal;
  searchModal.addEventListener("click", (evt) => {
    if (evt.target === searchModal) closeSearchModal();
  });

  function openLegendModal() {
    legendModalTable.innerHTML = "";
    const routeSection = document.createElement("div");
    routeSection.className = "legend-modal-section";
    routeSection.innerHTML = `<div class="legend-modal-section-title">${t("legend_full", "All routes")}</div>`;
    legendModalTable.appendChild(routeSection);

    const groupOrder = [
      { id: "RAIL", title: "Rail (1 - B1)" },
      { id: "GOKL", title: "GoKL" },
      { id: "RAPIDBUS", title: "RapidBus" },
      { id: "HOHO", title: "HOHO" },
      { id: "OTHER", title: "Other routes" },
    ];

    const grouped = new Map(groupOrder.map((group) => [group.id, []]));
    for (const item of legendItemsAll) {
      const key = String(item.group || "").toUpperCase() || (String(item.mode || "").toUpperCase() === "RAIL" ? "RAIL" : "OTHER");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }

    const renderLegendRow = (item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "legend-modal-row";
      row.dataset.routeId = String(item.routeId || "");
      row.title = String(item.label || item.routeId || "");
      const icon = item.icon || "";
      row.innerHTML = `
        <span class="legend-swatch" style="background:${item.color || "#64748b"}"></span>
        ${icon ? `<img class="legend-icon" src="${icon}" alt="${String(item.mode || "route")}"/>` : `<span class="legend-icon"></span>`}
        <span class="legend-modal-label">${String(item.label || item.routeId || "")}</span>
        <span class="legend-modal-mode">${String(item.mode || "")}</span>
      `;
      row.onclick = () => {
        onLegendRouteSelect(String(item.routeId || ""));
        closeLegendModal();
      };
      return row;
    };

    for (const group of groupOrder) {
      const items = grouped.get(group.id) || [];
      if (!items.length) continue;
      const block = document.createElement("div");
      block.className = "legend-modal-section";
      block.innerHTML = `<div class="legend-modal-section-title">${group.title}</div>`;
      routeSection.appendChild(block);
      if (group.id === "RAPIDBUS") {
        const rapidFilter = document.createElement("input");
        rapidFilter.className = "sr-control";
        rapidFilter.type = "text";
        rapidFilter.placeholder = "Search RapidBus route";
        block.appendChild(rapidFilter);
        const rowsWrap = document.createElement("div");
        block.appendChild(rowsWrap);
        const renderRapid = (query = "") => {
          rowsWrap.innerHTML = "";
          const normalizedQuery = String(query || "").trim().toLowerCase();
          items
            .filter((item) => !normalizedQuery || String(item.label || item.routeId || "").toLowerCase().includes(normalizedQuery))
            .forEach((item) => rowsWrap.appendChild(renderLegendRow(item)));
        };
        rapidFilter.addEventListener("input", () => renderRapid(rapidFilter.value));
        renderRapid("");
      } else {
        items.forEach((item) => block.appendChild(renderLegendRow(item)));
      }
    }
    legendModal.style.display = "flex";
  }

  function openSearchModal(stopId, stopName) {
    searchModalActions.innerHTML = "";
    const title = stopName ? `${t("set_station", "Set station")}: ${stopName}` : t("set_station", "Set station");
    searchModalTitle.textContent = title;
    searchModalTitle.dataset.locked = "1";
    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "sr-btn primary";
    startBtn.textContent = t("start_here", "Start here");
    startBtn.onclick = () => {
      onSearchSelect(String(stopId), "start");
      closeSearchModal();
    };
    const endBtn = document.createElement("button");
    endBtn.type = "button";
    endBtn.className = "sr-btn";
    endBtn.textContent = t("end_here", "End here");
    endBtn.onclick = () => {
      onSearchSelect(String(stopId), "end");
      closeSearchModal();
    };
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "sr-btn ghost";
    cancelBtn.textContent = t("cancel", "Cancel");
    cancelBtn.onclick = closeSearchModal;
    searchModalActions.appendChild(startBtn);
    searchModalActions.appendChild(endBtn);
    searchModalActions.appendChild(cancelBtn);
    searchModal.style.display = "flex";
  }
  window.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && routeDetailModal.style.display === "flex") {
      closeRouteDetail();
    }
  });

  const toastRoot = document.createElement("div");
  toastRoot.id = "jronda-toast-root";
  document.body.appendChild(toastRoot);

  const clockDayEl = document.getElementById("kiosk-clock-day");
  const clockDateEl = document.getElementById("kiosk-clock-date");
  const clockTimeEl = document.getElementById("kiosk-clock-time");

  function resolveClockLocale() {
    const mapByLang = {
      en: "en-MY",
      ms: "ms-MY",
      zh: "zh-CN",
      yue: "yue-HK",
      ta: "ta-MY",
      ar: "ar-MY",
    };
    return mapByLang[lang] || "en-MY";
  }

  function formatTwoDigits(value, locale) {
    return new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 2,
      useGrouping: false,
    }).format(value);
  }

  function formatFourDigits(value, locale) {
    return new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 4,
      useGrouping: false,
    }).format(value);
  }

function updateKioskClock() {
    const clockTimeEl = document.getElementById("kiosk-clock-time");
    if (!clockTimeEl) return; // DOM guard

    const now = new Date();
    const locale = resolveClockLocale();
    const dayName = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(now);
    const dayNumber = formatTwoDigits(now.getDate(), locale);
    const monthNumber = formatTwoDigits(now.getMonth() + 1, locale);
    const yearNumber = formatFourDigits(now.getFullYear(), locale);
    const hour = formatTwoDigits(now.getHours(), locale);
    const minute = formatTwoDigits(now.getMinutes(), locale);
    const second = formatTwoDigits(now.getSeconds(), locale);

    if (clockDayEl) clockDayEl.textContent = dayName;
    if (clockDateEl) clockDateEl.textContent = `${dayNumber}-${monthNumber}-${yearNumber}`;
    clockTimeEl.textContent = `${hour}:${minute}:${second}`;
  }

  updateKioskClock();
  setInterval(updateKioskClock, 1000);

  function applyI18n() {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    const fromInputEl = document.getElementById("jronda-from-search");
    const toInputEl = document.getElementById("jronda-to-search");
    const resetBtnEl = document.getElementById("jronda-reset-btn");
    const resetHintEl = document.getElementById("jronda-reset-hint");
    const stationInfoEl = document.getElementById("jronda-station-info");
    const titleEl = document.getElementById("jronda-route-info-title");
    const legendTitleEl = document.getElementById("jronda-legend-title");
    const routeDetailCloseEl = document.getElementById("jronda-route-detail-close");
    const routeDetailTitleEl = document.getElementById("route-detail-title");
    const legendModalTitleEl = document.getElementById("legend-modal-title");
    const legendModalCloseEl = document.getElementById("legend-modal-close");
    const searchModalTitleEl = document.getElementById("search-modal-title");
    const searchModalCloseEl = document.getElementById("search-modal-close");

    if (fromInputEl) fromInputEl.placeholder = t("from_station", "From station");
    if (toInputEl) toInputEl.placeholder = t("to_station", "To station");
    if (resetBtnEl) resetBtnEl.textContent = t("reset", "Reset");
    if (resetHintEl) resetHintEl.textContent = t("auto_reset_active", "Auto reset active");
    const defaultInfo = t("tap_station_info", "Tap a station to view details");
    if (stationInfoEl && (!stationInfoEl.textContent || stationInfoEl.textContent === defaultInfo)) {
      stationInfoEl.textContent = defaultInfo;
    }
    if (titleEl) titleEl.textContent = t("route_info", "Route Info");
    if (legendTitleEl) legendTitleEl.textContent = t("legend_tap", "Legend (tap to highlight)");
    if (routeDetailCloseEl) routeDetailCloseEl.textContent = t("close", "Close");
    if (legendModalTitleEl) legendModalTitleEl.textContent = t("legend_full", "All routes");
    if (legendModalCloseEl) legendModalCloseEl.textContent = t("close", "Close");
    if (searchModalTitleEl && (!searchModalTitleEl.dataset.locked || searchModal.style.display !== "flex")) {
      searchModalTitleEl.textContent = t("set_station", "Set station");
    }
    if (searchModalCloseEl) searchModalCloseEl.textContent = t("close", "Close");
    if (routeDetailModal.style.display === "flex" && routeDetailTitleEl) {
      routeDetailTitleEl.textContent = t("details", "Details");
    }
  }


  function normText(v) {
    return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function expandQueryWithSynonyms(rawQuery) {
    const base = normText(rawQuery);
    if (!base) return [];
    const expanded = new Set([base]);
    const tokenSynonyms = new Map([
      ["stesen", "station"],
      ["station", "stesen"],
      ["muzium", "museum"],
      ["museum", "muzium"],
      ["jalan", "jln"],
      ["jln", "jalan"],
      ["kuala lumpur", "kl"],
      ["kl", "kuala lumpur"],
    ]);
    for (const [from, to] of tokenSynonyms.entries()) {
      if (base.includes(from)) expanded.add(base.replaceAll(from, to));
    }
    expanded.add(base.replace(/\b([a-z])\s+([a-z])\s+([a-z])\s+([a-z])\b/g, "$1$2$3$4"));
    return Array.from(expanded);
  }

  function fuzzyScore(query, text) {
    if (!query) return 0;
    if (text === query) return 100;
    if (text.startsWith(query)) return 80;
    if (text.includes(query)) return 60;
    let qi = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) qi++;
    }
    return qi === query.length ? 40 : 0;
  }

  function buildSuggestions(rawQuery) {
    const queries = expandQueryWithSynonyms(rawQuery);
    if (!queries.length) return [];

    const dedupe = new Map();
    for (const s of stationOptions) {
      const key = `${s.stop_id}`;
      if (!dedupe.has(key)) dedupe.set(key, s);
    }

    return Array.from(dedupe.values())
      .map((s) => {
        const routeColor = getRouteColor(String(s.route_id || ""), false, s.route_color || null).color;
        const label = `${s.stop_name} (${s.route_id})`;
        const name = normText(s.stop_name);
        const normalizedLabel = normText(label);
        let score = 0;
        for (const query of queries) {
          score = Math.max(score, fuzzyScore(query, name), fuzzyScore(query, normalizedLabel));
        }
        return { ...s, label, score, routeColor };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  function renderSuggestions(list, target, container, inputEl) {
    container.innerHTML = "";
    if (!list.length) {
      container.style.display = "none";
      inputEl.setAttribute("aria-expanded", "false");
      return;
    }
    container.style.display = "block";
    inputEl.setAttribute("aria-expanded", "true");
    list.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion-item";
      btn.setAttribute("role", "option");
      btn.innerHTML = `
        <span class="suggestion-color" style="background:${item.routeColor || "#64748b"}"></span>
        <span class="suggestion-main">${item.stop_name}</span>
        <span class="suggestion-line">${item.route_id}</span>
      `;
      btn.onclick = () => {
        inputEl.value = String(item.stop_name || "");
        inputEl.dataset.stopId = String(item.stop_id || "");
        fromSuggestions.style.display = "none";
        toSuggestions.style.display = "none";
        inputEl.setAttribute("aria-expanded", "false");
        onSearchSelect(String(item.stop_id), target === "from" ? "start" : "end");
      };
      container.appendChild(btn);
    });
  }

  const fromInput = document.getElementById("jronda-from-search");
  const toInput = document.getElementById("jronda-to-search");
  const swapBtn = document.getElementById("jronda-swap-btn");
  const clearJourneyBtn = document.getElementById("jronda-clear-journey");
  const findRouteBtn = document.getElementById("jronda-find-route");

  function bindAutocomplete(inputEl, target, container) {
    if (!inputEl || !container) return;
    inputEl.setAttribute("aria-autocomplete", "list");
    inputEl.setAttribute("aria-controls", container.id);
    inputEl.setAttribute("aria-expanded", "false");
    inputEl.oninput = () => {
      inputEl.dataset.stopId = "";
      renderSuggestions(buildSuggestions(inputEl.value), target, container, inputEl);
    };
    inputEl.onfocus = () => {
      renderSuggestions(buildSuggestions(inputEl.value), target, container, inputEl);
    };
    inputEl.onblur = () => {
      setTimeout(() => {
        container.style.display = "none";
        inputEl.setAttribute("aria-expanded", "false");
      }, 120);
    };
    inputEl.onkeydown = (evt) => {
      if (evt.key !== "Enter") return;
      const top = buildSuggestions(inputEl.value)[0];
      if (!top) return;
      inputEl.value = String(top.stop_name || "");
      inputEl.dataset.stopId = String(top.stop_id || "");
      container.style.display = "none";
      inputEl.setAttribute("aria-expanded", "false");
      onSearchSelect(String(top.stop_id), target === "from" ? "start" : "end");
    };
  }

  bindAutocomplete(fromInput, "from", fromSuggestions);
  bindAutocomplete(toInput, "to", toSuggestions);

  if (swapBtn) {
    swapBtn.onclick = () => {
      const fromName = fromInput?.value || "";
      const toName = toInput?.value || "";
      const fromId = fromInput?.dataset.stopId || "";
      const toId = toInput?.dataset.stopId || "";
      if (fromInput && toInput) {
        fromInput.value = toName;
        toInput.value = fromName;
        fromInput.dataset.stopId = toId;
        toInput.dataset.stopId = fromId;
      }
      if (toId && fromId) {
        window.dispatchEvent(new CustomEvent("jronda:swap-journey", { detail: { fromId: toId, toId: fromId } }));
      } else {
        if (toId) onSearchSelect(toId, "start");
        if (fromId) onSearchSelect(fromId, "end");
      }
      refreshLinesEndpointHighlight();
    };
  }

  if (clearJourneyBtn) {
    clearJourneyBtn.onclick = () => {
      if (fromInput) {
        fromInput.value = "";
        fromInput.dataset.stopId = "";
      }
      if (toInput) {
        toInput.value = "";
        toInput.dataset.stopId = "";
      }
      refreshLinesEndpointHighlight();
      onReset("manual");
    };
  }

  if (findRouteBtn) {
    findRouteBtn.onclick = () => {
      let fromId = fromInput?.dataset.stopId || "";
      let toId = toInput?.dataset.stopId || "";
      if (!fromId && fromInput?.value) {
        const topFrom = buildSuggestions(fromInput.value)[0];
        if (topFrom) {
          fromId = String(topFrom.stop_id || "");
          fromInput.dataset.stopId = fromId;
          fromInput.value = String(topFrom.stop_name || fromInput.value);
        }
      }
      if (!toId && toInput?.value) {
        const topTo = buildSuggestions(toInput.value)[0];
        if (topTo) {
          toId = String(topTo.stop_id || "");
          toInput.dataset.stopId = toId;
          toInput.value = String(topTo.stop_name || toInput.value);
        }
      }
      if (fromId) onSearchSelect(fromId, "start");
      if (toId) onSearchSelect(toId, "end");
      if (fromId && toId) {
        window.dispatchEvent(new CustomEvent("jronda:find-route", { detail: { fromId, toId } }));
      }
    };
  }

  if (typeof window !== "undefined") {
    window.addEventListener("jronda:hide-floating-panels", () => {
      hideRoutePanel();
    });
    const showPanelOnActivity = () => showRoutePanel();
    ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
      window.addEventListener(eventName, showPanelOnActivity, { passive: true });
    });
  }

  function buildRouteStepList(route) {
    const wrapper = document.createElement("div");
    if (!route || !Array.isArray(route.stations) || !route.stations.length) {
      wrapper.textContent = t("no_route_detail", "No route detail.");
      return wrapper;
    }

    function toPositiveNumber(value) {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    function estimateWalkMinutesBetweenStops(fromStop, toStop) {
      const lat1 = Number(fromStop?.stop_lat);
      const lon1 = Number(fromStop?.stop_lon);
      const lat2 = Number(toStop?.stop_lat);
      const lon2 = Number(toStop?.stop_lon);
      if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 3;
      const toRad = (v) => (v * Math.PI) / 180;
      const earthRadiusMeters = 6371000;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) ** 2;
      const meters = 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const walkingMetersPerMinute = 78;
      return Math.max(1, Math.round(meters / walkingMetersPerMinute));
    }

    function pad2(value, locale) {
      return new Intl.NumberFormat(locale, {
        minimumIntegerDigits: 2,
        useGrouping: false,
      }).format(value);
    }

    function formatClock(date, locale) {
      return `${pad2(date.getHours(), locale)}:${pad2(date.getMinutes(), locale)}:${pad2(date.getSeconds(), locale)}`;
    }

    const stepItems = [];
    const stationRows = route.stations;
    let prev = null;
    const locale = (() => {
      const currentLang = window?.jrondaI18n?.getLang?.() || "en";
      const localeByLang = {
        en: "en-MY",
        ms: "ms-MY",
        zh: "zh-CN",
        yue: "yue-HK",
        ta: "ta-MY",
        ar: "ar-MY",
      };
      return localeByLang[currentLang] || "en-MY";
    })();
    const etaMinutes = toPositiveNumber(route.ETA ?? route.eta);
    if (etaMinutes != null) {
      const now = new Date();
      const arrival = new Date(now.getTime() + etaMinutes * 60 * 1000);
      const timeMeta = document.createElement("div");
      timeMeta.className = "route-option-meta";
      timeMeta.textContent =
        `${t("now", "Now")} ${formatClock(now, locale)} | ${t("eta", "ETA")} ${etaMinutes} min | ${t("arrival", "Arrival")} ${formatClock(arrival, locale)}`;
      stepItems.push(timeMeta);
    }

    for (let idx = 0; idx < stationRows.length; idx++) {
      const station = stationRows[idx];
      const current = station || {};
      const mode = String(current.mode || "");
      const lineName = current.route_public_name || current.route_long_name || current.route_id || "";

      if (prev && String(prev.route_id) !== String(current.route_id)) {
        const transferToLineName = current.route_public_name || current.route_long_name || current.route_id || "route";
        const transferToStationName = current.stop_name || "next station";
        const transferWalkMinutes = estimateWalkMinutesBetweenStops(prev, current);
        const walkRow = document.createElement("div");
        walkRow.className = "step-row";
        walkRow.innerHTML = `
          <div class="step-left">
            <img class="mode-icon mode-icon-walk" src="/src/img/Connecting_icon.svg" alt="${t("walk", "Walk")}"/>
            <div class="step-line walk"></div>
          </div>
          <div class="step-text"><b>${t("walk", "Walk")}</b> to (${transferToLineName} ${transferToStationName}) (~${transferWalkMinutes} min)</div>
        `;
        stepItems.push(walkRow);
      }

      const icon = getModeIcon(mode, current.category);
      const routeColor = getRouteColor(
        String(current.route_id || ""),
        false,
        current.route_color ?? null
      ).color;
      const row = document.createElement("div");
      row.className = "step-row";
      const nodeColorClass = ensureColorClass(routeColor, "border-color");
      const lineColorClass = ensureColorClass(routeColor, "background");
      row.innerHTML = `
        <div class="step-left">
          <div class="step-node ${nodeColorClass}"></div>
          ${idx < route.stations.length - 1 ? `<div class="step-line ${lineColorClass}"></div>` : ""}
        </div>
        <div class="step-text"><img class="mode-icon" src="${icon}" alt="${mode || t("mode_label", "mode")}"/><b>${current.stop_name || current.stop_id || t("route", "Route")}</b> - ${lineName}</div>
      `;
      stepItems.push(row);
      prev = current;
    }

    const stepList = document.createElement("div");
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
    let columnCount = 1;
    if (stepItems.length > 18) columnCount = 2;
    if (stepItems.length > 36 && viewportW >= 1100) columnCount = 3;
    if (stepItems.length > 60 && viewportW >= 1400) columnCount = 4;
    stepList.className = `step-list step-list-grid cols-${columnCount}`;
    if (columnCount === 1) {
      for (const item of stepItems) stepList.appendChild(item);
    } else {
      const itemsPerCol = Math.ceil(stepItems.length / columnCount);
      for (let col = 0; col < columnCount; col++) {
        const colWrap = document.createElement("div");
        colWrap.className = "step-column";
        const slice = stepItems.slice(col * itemsPerCol, (col + 1) * itemsPerCol);
        for (const item of slice) colWrap.appendChild(item);
        stepList.appendChild(colWrap);
        if (col < columnCount - 1) {
          const divider = document.createElement("div");
          divider.className = "step-column-divider";
          divider.innerHTML = `<span class="step-dots">&bull; &bull; &bull;</span><span class="step-dots">&bull; &bull; &bull;</span>`;
          stepList.appendChild(divider);
        }
      }
    }
    wrapper.appendChild(stepList);
    return wrapper;
  }


  function buildRouteCard(route, routeIndex, selected) {
    const stations = Array.isArray(route?.stations) ? route.stations : [];
    const fromName = stations[0]?.stop_name || "Start";
    const toName = stations[stations.length - 1]?.stop_name || "End";
    const eta = Number(route?.ETA ?? route?.eta ?? 0);
    const routeIds = [];
    stations.forEach((stop) => {
      const rid = String(stop?.route_id || "").trim();
      if (rid && !routeIds.includes(rid)) routeIds.push(rid);
    });
    const transfers = Math.max(0, routeIds.length - 1);
    const card = document.createElement("div");
    card.className = `rcard${selected ? " sel" : ""}`;
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="rc-r1">
        <div class="rc-name">${fromName} → ${toName}</div>
      </div>
      <div class="rc-meta">${eta > 0 ? `${eta} min` : "ETA N/A"} · ${Math.max(0, stations.length - 1)} stops · ${transfers} transfer${transfers === 1 ? "" : "s"}</div>
      <div class="rc-segs"></div>
    `;
    const segWrap = card.querySelector(".rc-segs");
    routeIds.forEach((rid, idx) => {
      const seg = document.createElement("div");
      const color = getRouteColor(rid, false, null).color;
      const segClass = ensureColorClass(color, "background");
      seg.className = `rseg ${segClass}`;
      seg.textContent = rid;
      segWrap?.appendChild(seg);
      if (idx < routeIds.length - 1) {
        const arr = document.createElement("span");
        arr.className = "rarr";
        arr.textContent = "›";
        segWrap?.appendChild(arr);
      }
    });
    const openDetail = () => {
      onRouteSelect(routeIndex);
      openRouteDetail(`${fromName} → ${toName}`, buildRouteStepList(route));
    };
    card.onclick = openDetail;
    card.onkeydown = (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        openDetail();
      }
    };
    return card;
  }

  function updatePanel(routes = [], selectedIndex = 0) {
    content.innerHTML = "";
    const list = Array.isArray(routes) ? routes : [];
    if (!list.length) {
      content.textContent = t("no_route_selected", "No route selected.");
      return;
    }
    const safeSelected = Math.max(0, Math.min(list.length - 1, Number(selectedIndex) || 0));
    list.forEach((route, routeIndex) => {
      content.appendChild(buildRouteCard(route, routeIndex, routeIndex === safeSelected));
    });
  }

  function setStationInfo(text) {
    stationInfo.textContent = text || t("tap_station_info", "Tap a station to view details");
  }

  function setStationDetailHtml(html) {
    if (!html) {
      setStationInfo("");
      return;
    }
    stationInfo.innerHTML = html;
  }

  function setRailRouteOptions(options = []) {
    // No-op: rail route filter was removed. Kept for compatibility.
    return;
  }

  function setLegendItems(items = [], modalItems = items) {
    legendList.innerHTML = "";
    legendButtons.clear();
    legendItemsAll = Array.isArray(modalItems) ? modalItems.slice() : [];
    renderLinesView(legendItemsAll);
    const previewItems = Array.isArray(items) ? items.slice() : [];
    let rendered = 0;
    for (const item of previewItems) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-item";
      btn.dataset.routeId = String(item.routeId || "");
      const icon = item.icon || "";
      const swatchClass = ensureColorClass(item.color || "#64748b", "background");
      btn.innerHTML = `
        <span class="legend-swatch ${swatchClass}"></span>
        ${icon ? `<img class="legend-icon" src="${icon}" alt="${String(item.mode || "route")}"/>` : ""}
        <span>${String(item.label || item.routeId || "")}</span>
      `;
      btn.onclick = () => onLegendRouteSelect(String(item.routeId || ""));
      legendButtons.set(String(item.routeId || ""), btn);
      legendList.appendChild(btn);
      rendered += 1;
    }
    if (legendItemsAll.length > previewItems.length) {
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "legend-item legend-more";
      moreBtn.textContent = `More (${legendItemsAll.length - previewItems.length})`;
      moreBtn.onclick = openLegendModal;
      legendList.appendChild(moreBtn);
    }
    if (rendered === 0) {
      const empty = document.createElement("div");
      empty.className = "legend-empty";
      empty.textContent = t("legend_unavailable", "Legend unavailable. Tap to retry.");
      legendList.appendChild(empty);
    }
    legendPanel.dataset.legendEmpty = rendered === 0 ? "1" : "0";
  }

  function setLegendActiveRoute(routeId = null) {
    const active = routeId ? String(routeId) : "";
    for (const [id, btn] of legendButtons.entries()) {
      btn.classList.toggle("active", id === active);
    }
    document.querySelectorAll(".lines-row").forEach((row) => {
      row.classList.toggle("active", String(row.dataset.routeId || "") === active);
    });
    document.querySelectorAll(".lines-line-chip").forEach((chip) => {
      chip.classList.toggle("active", String(chip.dataset.routeId || "") === active);
    });
    if (mapSurface.dataset.view === "lines" && active) {
      const linesGrid = document.getElementById("kiosk-lines-grid");
      const activeRow = linesGrid?.querySelector(`.lines-row[data-route-id="${active}"]`);
      if (linesGrid && activeRow) {
        activeRow.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }
  }

  function getModeIcon(mode, category = "") {
    const m = String(mode || "").toUpperCase();
    const c = String(category || "").toUpperCase();
    if (m === "RAIL") {
      return c === "KTM" ? "/src/img/train-panthograph.svg" : "/src/img/train-noPanthograph.svg";
    }
    return "/src/img/bus.svg";
  }

  function getAccessibleTextColor(colorHex) {
    const hex = String(colorHex || "").replace("#", "").trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6 ? "#10253a" : "#ffffff";
  }

  function resetUI() {
    const fromInputEl = document.getElementById("jronda-from-search");
    const toInputEl = document.getElementById("jronda-to-search");
    const fromSugEl = document.getElementById("jronda-from-suggestions");
    const toSugEl = document.getElementById("jronda-to-suggestions");
    if (fromInputEl) {
      fromInputEl.value = "";
      fromInputEl.dataset.stopId = "";
    }
    if (toInputEl) {
      toInputEl.value = "";
      toInputEl.dataset.stopId = "";
    }
    if (fromSugEl) fromSugEl.style.display = "none";
    if (toSugEl) toSugEl.style.display = "none";
    if (routeSelect) {
      routeSelect.value = "";
      routeSelect.disabled = true;
    }
    setActivePreset("SMART");
    setStationInfo("");
    content.innerHTML = "";
    content.textContent = t("no_route_selected", "No route selected.");
    applyI18n();
  }

  applyI18n();

  function showToast(message, type = "info", timeoutMs = 5200) {
    if (!message) return;
    const t = document.createElement("div");
    t.className = `jronda-toast ${type}`;
    t.textContent = String(message);
    toastRoot.appendChild(t);
    window.setTimeout(() => {
      t.remove();
    }, timeoutMs);
  }

  return {
    updatePanel,
    setStationInfo,
    setStationDetailHtml,
    setJourneyEndpoints: (fromStation, toStation) => {
      const fromInputEl = document.getElementById("jronda-from-search");
      const toInputEl = document.getElementById("jronda-to-search");
      if (fromInputEl) {
        fromInputEl.value = fromStation?.stop_name || "";
        fromInputEl.dataset.stopId = fromStation?.stop_id ? String(fromStation.stop_id) : "";
      }
      if (toInputEl) {
        toInputEl.value = toStation?.stop_name || "";
        toInputEl.dataset.stopId = toStation?.stop_id ? String(toStation.stop_id) : "";
      }
      refillNearbyOptions(fromStation?.stop_id || "");
      refreshLinesEndpointHighlight();
    },
    setRailRouteOptions,
    resetUI,
    showToast,
    setLegendItems,
    setLegendActiveRoute,
  };
}
