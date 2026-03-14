// ======= ui.js =======
import { getRouteColor } from "../style/routeStyle.js";
import { createI18n, I18N, I18N_KEY } from "./i18n.js";
import { formatDistance, formatEtaMinutes } from "../utils/format.js";

export function createUI(config) {
  // Fail-safe for stale cached HTML: ensure the kiosk stylesheet is present.
  if (!document.querySelector('link[href$="/src/style/kiosk.css"], link[href="./src/style/kiosk.css"], link[href="/src/style/kiosk.css"]')) {
    const kioskStylesheetLink = document.createElement("link");
    kioskStylesheetLink.rel = "stylesheet";
    kioskStylesheetLink.href = "/src/style/kiosk.css";
    document.head.appendChild(kioskStylesheetLink);
  }

  const {
    onPresetChange = () => {},
    onBusToggle = () => {},
    onRailRouteChange = () => {},
    onReset = () => {},
    onSearchSelect = () => {},
    onLegendRouteSelect = () => {},
    stationOptions = [],
    summaryPanels = [],
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

  const map = document.getElementById("map");

  const existingRoot = document.getElementById("kiosk-root");
  if (existingRoot) {
    existingRoot.remove();
  }

  const root = document.createElement("div");
  root.id = "kiosk-root";

  const mapWrap = document.createElement("div");
  mapWrap.id = "kiosk-map-wrap";
  const mapSurface = document.createElement("div");
  mapSurface.id = "kiosk-map-surface";
  const clockWidget = document.createElement("div");
  clockWidget.id = "kiosk-clock";
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
  sidebar.setAttribute("aria-label", t("sidebar_aria", "Transit controls and route results"));

  const loadingOverlay = document.createElement("div");
  loadingOverlay.id = "kiosk-loading-overlay";
  loadingOverlay.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,11,24,0.65);z-index:200;pointer-events:none;transition:opacity 300ms ease;";

  const loadingPanel = document.createElement("div");
  loadingPanel.style.cssText = "width:320px;padding:12px 14px;border-radius:10px;background:rgba(15,23,42,0.9);color:#fff;font-size:13px;box-shadow:0 6px 12px rgba(0,0,0,0.2);";

  const loadingMessage = document.createElement("div");
  loadingMessage.id = "kiosk-loading-message";
  loadingMessage.textContent = "Loading map...";
  loadingMessage.style.marginBottom = "8px";

  const loadingBar = document.createElement("div");
  loadingBar.id = "kiosk-loading-bar";
  loadingBar.style.cssText = "width:100%;height:8px;background:rgba(255,255,255,0.2);border-radius:999px;overflow:hidden;";

  const loadingFill = document.createElement("div");
  loadingFill.id = "kiosk-loading-fill";
  loadingFill.style.cssText = "width:0%;height:100%;background:#3b82f6;border-radius:999px;transition:width 220ms ease;";

  loadingBar.appendChild(loadingFill);
  loadingPanel.appendChild(loadingMessage);
  loadingPanel.appendChild(loadingBar);
  loadingOverlay.appendChild(loadingPanel);

  if (map) mapSurface.appendChild(map);
  mapSurface.appendChild(clockWidget);
  mapSurface.appendChild(loadingOverlay);
  mapWrap.appendChild(mapSurface);
  mapWrap.appendChild(legendDock);
  root.appendChild(mapWrap);
  root.appendChild(sidebar);
document.body.appendChild(root);

  let lastLoadingProgress = 0;
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
      overlayNode.style.opacity = clamped < 1 ? "1" : "0";
      overlayNode.style.pointerEvents = clamped < 1 ? "none" : "none";
      if (clamped >= 1) {
        setTimeout(() => {
          overlayNode.style.display = "none";
        }, 320);
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
  import('./render.js').then(module => {
    if (module.init && map) {
      module.init(map);
    }
  });

  const controlBlock = document.createElement("div");
  controlBlock.className = "panel-block";
  sidebar.appendChild(controlBlock);

  const presetRow = document.createElement("div");
  presetRow.className = "control-row-presets";
  presetRow.style.display = "flex";
  presetRow.style.alignItems = "center";
  presetRow.style.justifyContent = "space-between";
  presetRow.style.gap = "12px";
  controlBlock.appendChild(presetRow);

  const presetButtonsWrap = document.createElement("div");
  presetButtonsWrap.style.display = "flex";
  presetButtonsWrap.style.gap = "8px";
  presetRow.appendChild(presetButtonsWrap);

  const langSelect = document.createElement("select");
  langSelect.id = "jronda-language";
  langSelect.className = "sr-control";
  langSelect.style.minWidth = "52px";
  langSelect.style.padding = "4px 8px";
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
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  presets.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sr-btn";
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

  const optionsRow = document.createElement("div");
  optionsRow.className = "control-row-options";
  controlBlock.appendChild(optionsRow);

  const busLabel = document.createElement("label");
  busLabel.id = "jronda-bus-label";
  busLabel.textContent = t("include_bus", "Include bus routes");
  busLabel.className = "label-strong";
  optionsRow.appendChild(busLabel);

  const busFilterState = { hoho: true, rapid: true, gokl: true, other: true };

  const busOperatorLabel = document.createElement("label");
  busOperatorLabel.className = "label-strong";
  busOperatorLabel.id = "jronda-bus-operator-label";
  busOperatorLabel.textContent = t("bus_operator", "Bus operator");
  optionsRow.appendChild(busOperatorLabel);

  const busOperatorInput = document.createElement("input");
  busOperatorInput.className = "sr-control";
  busOperatorInput.id = "jronda-bus-operator";
  busOperatorInput.setAttribute("list", "jronda-bus-operator-list");
  busOperatorInput.placeholder = t("bus_operator_placeholder", "All operators");
  busOperatorInput.value = t("bus_operator_all", "All");
  optionsRow.appendChild(busOperatorInput);

  const busOperatorList = document.createElement("datalist");
  busOperatorList.id = "jronda-bus-operator-list";
  const operatorOptions = [
    t("bus_operator_all", "All"),
    "RapidBus",
    "goKL",
    "HOHO",
    t("bus_operator_other", "Other"),
  ];
  operatorOptions.forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label;
    busOperatorList.appendChild(opt);
  });
  optionsRow.appendChild(busOperatorList);

  function applyBusOperatorFilter(rawValue) {
    const value = String(rawValue || "").trim().toLowerCase();
    busFilterState.hoho = value === "hoho" || value === "all" || value === t("bus_operator_all", "All").toLowerCase();
    busFilterState.gokl = value === "gokl" || value === "all" || value === t("bus_operator_all", "All").toLowerCase();
    busFilterState.rapid = value === "rapidbus" || value === "rapid" || value === "all" || value === t("bus_operator_all", "All").toLowerCase();
    busFilterState.other = value === t("bus_operator_other", "Other").toLowerCase() || value === "other" || value === "all" || value === t("bus_operator_all", "All").toLowerCase();
    if (value === "hoho") {
      busFilterState.gokl = false;
      busFilterState.rapid = false;
      busFilterState.other = false;
    } else if (value === "gokl") {
      busFilterState.hoho = false;
      busFilterState.rapid = false;
      busFilterState.other = false;
    } else if (value === "rapidbus" || value === "rapid") {
      busFilterState.hoho = false;
      busFilterState.gokl = false;
      busFilterState.other = false;
    } else if (value === "other" || value === t("bus_operator_other", "Other").toLowerCase()) {
      busFilterState.hoho = false;
      busFilterState.gokl = false;
      busFilterState.rapid = false;
    }
    onBusToggle({ ...busFilterState });
  }

  busOperatorInput.onchange = () => applyBusOperatorFilter(busOperatorInput.value);
  busOperatorInput.onblur = () => {
    if (!busOperatorInput.value) {
      busOperatorInput.value = t("bus_operator_all", "All");
      applyBusOperatorFilter(busOperatorInput.value);
    }
  };

  let includeBus = true;
  onBusToggle({ hoho: true, rapid: true, gokl: true, other: true });

  // Rail route filter removed (feature deprecated).
  // Keep a placeholder `routeSelect` variable for backward compatibility
  // with callers that may still attempt to set options.
  let routeSelect = null;

  const searchWrap = document.createElement("div");
  searchWrap.className = "control-row-search";
  controlBlock.appendChild(searchWrap);

  const searchLabel = document.createElement("label");
  searchLabel.id = "jronda-search-label";
  searchLabel.setAttribute("for", "jronda-station-search");
  searchLabel.textContent = t("search_station", "Search station");
  searchLabel.className = "label-strong";
  searchWrap.appendChild(searchLabel);

  const searchInput = document.createElement("input");
  searchInput.id = "jronda-station-search";
  searchInput.className = "sr-control";
  searchInput.type = "text";
  searchInput.placeholder = t("type_station_name", "Type station name");
  searchInput.autocomplete = "off";
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-controls", "search-suggestions");
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.setAttribute("aria-label", t("search_station_aria", "Search station"));
  searchWrap.appendChild(searchInput);

  const suggestions = document.createElement("div");
  suggestions.id = "search-suggestions";
  suggestions.setAttribute("role", "listbox");
  searchWrap.appendChild(suggestions);

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
  resetHint.className = "hint-text";
  resetHint.textContent = t("auto_reset_active", "Auto reset active");
  resetHint.style.display = "none";
  resetRow.appendChild(resetHint);

  const stationInfo = document.createElement("div");
  stationInfo.id = "jronda-station-info";
  stationInfo.className = "panel-block";
  stationInfo.setAttribute("aria-live", "polite");
  stationInfo.textContent = t("tap_station_info", "Tap a station to view details");
  sidebar.appendChild(stationInfo);

  const summaryPanel = document.createElement("div");
  summaryPanel.id = "summary-corridor-panel";
  summaryPanel.setAttribute("aria-label", "Summarized corridor routes");
  summaryPanel.hidden = true;
  sidebar.appendChild(summaryPanel);

  const panel = document.createElement("div");
  panel.id = "route-info-panel";
  sidebar.appendChild(panel);

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
  routeDetailClose.className = "sr-btn";
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
  searchModalClose.className = "sr-btn";
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
      return;
    }
    openLegendModal();
  };
  legendPanel.onclick = (evt) => {
    if (evt.target === legendPanel || evt.target === legendList) {
      if (legendPanel.dataset.legendEmpty === "1") {
        window.dispatchEvent(new CustomEvent("jronda:legend-retry"));
        return;
      }
      openLegendModal();
    }
  };
  legendDock.prepend(legendTitle);

  const legendList = document.createElement("div");
  legendList.id = "legend-list";
  legendPanel.appendChild(legendList);
  const legendButtons = new Map();
  let legendItemsAll = [];

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
  legendModalClose.className = "sr-btn";
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
    for (const item of legendItemsAll) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "legend-modal-row";
      row.dataset.routeId = String(item.routeId || "");
      row.title = String(item.label || item.routeId || "");
      row.innerHTML = `
        <span class="legend-swatch" style="background:${item.color || "#64748b"}"></span>
        <span class="legend-modal-label">${String(item.label || item.routeId || "")}</span>
        <span class="legend-modal-mode">${String(item.mode || "")}</span>
      `;
      row.onclick = () => {
        onLegendRouteSelect(String(item.routeId || ""));
        closeLegendModal();
      };
      legendModalTable.appendChild(row);
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
    cancelBtn.className = "sr-btn";
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

  function resolveSummaryStopId(panel, row) {
    const byRoute = row?.byRoute || {};
    const routeIds = Array.isArray(panel?.routeIds) ? panel.routeIds : [];
    for (const routeId of routeIds) {
      const sid = byRoute[String(routeId)];
      if (sid) return String(sid);
    }
    const first = Object.values(byRoute)[0];
    return first ? String(first) : "";
  }

  function renderSummaryPanels(panels = []) {
    summaryPanel.innerHTML = "";
    const title = document.createElement("div");
    title.textContent = t("corridor_summaries", "Corridor Summaries");
    title.className = "summary-panel-title";
    summaryPanel.appendChild(title);

    if (!panels.length) {
      const empty = document.createElement("div");
      empty.className = "summary-panel-empty";
      empty.textContent = t("no_summarized", "No summarized corridor.");
      summaryPanel.appendChild(empty);
      return;
    }

    for (const panelData of panels) {
      const card = document.createElement("div");
      card.className = "corridor-card";
      const heading = document.createElement("button");
      heading.type = "button";
      heading.className = "corridor-toggle";
      heading.setAttribute("aria-expanded", "false");
      const corridorKey = String(panelData?.corridorKey || "");
      heading.textContent =
        String(panelData?.placement || "") === "above"
          ? t("tumpat_gemas", "Tumpat - Gemas")
          : (String(panelData?.placement || "") === "below"
            ? t("gemas_woodlands", "Gemas - Woodlands")
            : (corridorKey.includes("butterworth_padang")
              ? "Padang Besar - Butterworth"
              : (corridorKey.includes("butterworth_ipoh")
                ? "Butterworth - Ipoh"
                : (corridorKey.includes("ets_north")
                  ? "ETS North (to 15200)"
                  : (corridorKey.includes("ets_south")
                    ? "ETS South (from 25100)"
                    : "Corridor")))));
      card.appendChild(heading);
      const body = document.createElement("div");
      body.className = "corridor-body";
      body.hidden = true;

      const routeIds = Array.isArray(panelData?.routeIds) ? panelData.routeIds : [];
      const routeLabels = Array.isArray(panelData?.routeLabels) ? panelData.routeLabels : [];
      const routeColors = Array.isArray(panelData?.routeColors) ? panelData.routeColors : [];
      for (let i = 0; i < routeIds.length; i++) {
        const chip = document.createElement("span");
        chip.className = "corridor-route-chip";
        chip.style.background = routeColors[i] || "#607080";
        chip.textContent = routeLabels[i] || routeIds[i] || t("route", "Route");
        body.appendChild(chip);
      }

      const rows = Array.isArray(panelData?.rows) ? panelData.rows : [];
      for (const row of rows) {
        const stopId = resolveSummaryStopId(panelData, row);
        if (!stopId) continue;
        const rowEl = document.createElement("div");
        rowEl.className = "corridor-stop-row";

        const stopName = document.createElement("div");
        stopName.className = "corridor-stop-name";
        stopName.textContent = String(row?.label || "");
        rowEl.appendChild(stopName);

        const startBtn = document.createElement("button");
        startBtn.type = "button";
        startBtn.className = "corridor-mini-btn primary";
        startBtn.textContent = t("start", "Start");
        startBtn.onclick = () => {
          window.dispatchEvent(new CustomEvent("jronda:set-start", { detail: { stopId } }));
        };
        rowEl.appendChild(startBtn);

        const endBtn = document.createElement("button");
        endBtn.type = "button";
        endBtn.className = "corridor-mini-btn";
        endBtn.textContent = t("end", "End");
        endBtn.onclick = () => {
          window.dispatchEvent(new CustomEvent("jronda:set-end", { detail: { stopId } }));
        };
        rowEl.appendChild(endBtn);

        body.appendChild(rowEl);
      }

      heading.onclick = () => {
        const next = body.hidden;
        body.hidden = !next;
        heading.setAttribute("aria-expanded", next ? "true" : "false");
      };
      card.appendChild(body);
      summaryPanel.appendChild(card);
    }
  }

  renderSummaryPanels(summaryPanels);

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
    const busLabelEl = document.getElementById("jronda-bus-label");
    const busOperatorLabelEl = document.getElementById("jronda-bus-operator-label");
    const busOperatorInputEl = document.getElementById("jronda-bus-operator");
    const searchLabelEl = document.getElementById("jronda-search-label");
    const searchInputEl = document.getElementById("jronda-station-search");
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

    if (busLabelEl) busLabelEl.textContent = t("include_bus", "Include bus routes");
    if (busOperatorLabelEl) busOperatorLabelEl.textContent = t("bus_operator", "Bus operator");
    if (busOperatorInputEl && !busOperatorInputEl.value) {
      busOperatorInputEl.placeholder = t("bus_operator_placeholder", "All operators");
      busOperatorInputEl.value = t("bus_operator_all", "All");
    }
    if (searchLabelEl) searchLabelEl.textContent = t("search_station", "Search station");
    if (searchInputEl) searchInputEl.placeholder = t("type_station_name", "Type station name");
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
    renderSummaryPanels(summaryPanels);
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
        const label = `${s.stop_name} (${s.route_id})`;
        const name = normText(s.stop_name);
        const normalizedLabel = normText(label);
        let score = 0;
        for (const query of queries) {
          score = Math.max(score, fuzzyScore(query, name), fuzzyScore(query, normalizedLabel));
        }
        return { ...s, label, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  function renderSuggestions(list) {
    suggestions.innerHTML = "";
    if (!list.length) {
      suggestions.style.display = "none";
      searchInput.setAttribute("aria-expanded", "false");
      return;
    }
    suggestions.style.display = "block";
    searchInput.setAttribute("aria-expanded", "true");
    list.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion-item";
      btn.setAttribute("role", "option");
      btn.textContent = item.label;
      btn.onclick = () => {
        searchInput.value = "";
        suggestions.style.display = "none";
        searchInput.setAttribute("aria-expanded", "false");
        openSearchModal(String(item.stop_id), String(item.label || item.stop_name || item.stop_id));
      };
      suggestions.appendChild(btn);
    });
  }

  searchInput.oninput = () => {
    renderSuggestions(buildSuggestions(searchInput.value));
  };
  searchInput.onfocus = () => {
    renderSuggestions(buildSuggestions(searchInput.value));
  };
  searchInput.onblur = () => {
    setTimeout(() => {
      suggestions.style.display = "none";
      searchInput.setAttribute("aria-expanded", "false");
    }, 120);
  };
  searchInput.onkeydown = (evt) => {
    if (evt.key === "Enter") {
      const top = buildSuggestions(searchInput.value)[0];
      if (top) {
        openSearchModal(String(top.stop_id), String(top.label || top.stop_name || top.stop_id));
        suggestions.style.display = "none";
        searchInput.setAttribute("aria-expanded", "false");
      }
    }
  };

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
    const lineSummaryRegex = /(seremban line|port klang line)/i;
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
            <img class="mode-icon" src="/src/img/Connecting_icon.svg" alt="${t("walk", "Walk")}" style="margin-top:1px;margin-right:0;"/>
            <div class="step-line walk"></div>
          </div>
          <div class="step-text"><b>${t("walk", "Walk")}</b> to (${transferToLineName} ${transferToStationName}) (~${transferWalkMinutes} min)</div>
        `;
        stepItems.push(walkRow);
      }

      if (
        mode === "RAIL" &&
        lineSummaryRegex.test(String(lineName)) &&
        (idx === 0 || String(stationRows[idx - 1]?.route_long_name || "") !== String(current.route_long_name || ""))
      ) {
        const blockStations = [];
        let cursor = idx;
        while (cursor < stationRows.length) {
          const cs = stationRows[cursor] || {};
          const csLine = cs.route_public_name || cs.route_long_name || cs.route_id || "";
          if (String(cs.route_id || "") !== String(current.route_id || "")) break;
          if (!lineSummaryRegex.test(String(csLine))) break;
          blockStations.push(cs);
          cursor++;
        }
        if (blockStations.length >= 3) {
          const routeColor = getRouteColor(
            String(current.route_id || ""),
            false,
            current.route_color ?? null
          ).color;
          const summaryWrap = document.createElement("div");
          summaryWrap.className = "step-summary";
          summaryWrap.style.color = routeColor;
          const uniqueStops = [];
          const seenStop = new Set();
          for (const st of blockStations) {
            const name = String(st.stop_name || "");
            if (!name || seenStop.has(name)) continue;
            seenStop.add(name);
            uniqueStops.push(name);
          }
          summaryWrap.innerHTML = `
            <div class="summary-title">${lineName} ${t("summary", "summary")} (${uniqueStops.length} ${t("stops", "stops")})</div>
            <div class="summary-list">
              ${uniqueStops
                .map((name) => `<div class="summary-stop"><span class="dot"></span><span>${name}</span></div>`)
                .join("")}
            </div>
          `;
          stepItems.push(summaryWrap);
          prev = blockStations[blockStations.length - 1];
          idx = cursor - 1;
          continue;
        }
      }

      const icon = getModeIcon(mode, current.category);
      const routeColor = getRouteColor(
        String(current.route_id || ""),
        false,
        current.route_color ?? null
      ).color;
      const row = document.createElement("div");
      row.className = "step-row";
      row.innerHTML = `
        <div class="step-left">
          <div class="step-node" style="border-color:${routeColor};"></div>
          ${idx < route.stations.length - 1 ? `<div class="step-line" style="background:${routeColor};"></div>` : ""}
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
    if (stepItems.length > 40 && viewportW >= 1100) columnCount = 3;
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
          divider.innerHTML = `<span class="step-dots">• • •</span><span class="step-dots">• • •</span>`;
          stepList.appendChild(divider);
        }
      }
    }
    wrapper.appendChild(stepList);
    return wrapper;
  }

  function updatePanel(routes, selectedIndex = 0, onSelect) {
    showRoutePanel();
    const c = content;
    const presetLine = document.createElement("div");
    presetLine.className = "route-option-meta";
    presetLine.textContent = `${t("preset_label", "Preset")} : ${activePreset}`;
    c.appendChild(presetLine);
    c.innerHTML = "";

    if (!routes || !routes.length) {
      c.textContent = t("no_route_found", "No route found.");
      return;
    }

    routes.forEach((route, i) => {
      const routeDiv = document.createElement("div");
      routeDiv.setAttribute("role", "button");
      routeDiv.tabIndex = 0;
      routeDiv.className = `route-option-card${i === selectedIndex ? " is-selected" : ""}`;
      routeDiv.onclick = () => onSelect?.(i);
      routeDiv.onkeydown = (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          onSelect?.(i);
        }
      };
      const routeTitle = document.createElement("div");
      routeTitle.className = "route-option-title";
      const firstMode = Array.isArray(route.segments) && route.segments.length
        ? String(route.segments[0].mode || "")
        : "";
      const firstCategory = Array.isArray(route.segments) && route.segments.length
        ? String(route.segments[0].category || "")
        : "";
      const firstModeIcon = getModeIcon(firstMode, firstCategory);
      routeTitle.innerHTML = `<img class="mode-icon" src="${firstModeIcon}" alt="${firstMode || t("mode_label", "mode")}"/>${t("option", "Option")} ${i + 1}`;
      routeDiv.appendChild(routeTitle);

      const distanceValue = route.totalDistance ?? route.distance ?? 0;
      const etaValue = route.ETA ?? route.eta ?? 0;
      const transfersValue = route.transfers ?? 0;
      const alternativesValue = route.alternativeCount ?? 0;

      const summary = document.createElement("div");
      summary.textContent = `${t("distance", "Distance")} ${formatDistance(distanceValue)} | ${t("eta", "ETA")} ${formatEtaMinutes(etaValue)} | ${t("transfers", "Transfers")} ${transfersValue}`;
      summary.className = "route-option-meta";
      routeDiv.appendChild(summary);

      if (alternativesValue > 0) {
        const alternativesMeta = document.createElement("div");
        alternativesMeta.className = "route-option-meta";
        alternativesMeta.textContent = `${t("shared_corridor_alternatives", "Shared-corridor alternatives")}: ${alternativesValue}`;
        routeDiv.appendChild(alternativesMeta);
      }

      const modeSummary = document.createElement("div");
      modeSummary.textContent = `${t("modes", "Modes")}: ${route.modeSummary || "N/A"}`;
      modeSummary.className = "route-option-meta route-option-meta-spaced";
      routeDiv.appendChild(modeSummary);

      const chipsWrap = document.createElement("div");
      chipsWrap.className = "route-segment-chip-list";
      const segments = Array.isArray(route.segments) ? route.segments : [];
      for (const segment of segments) {
        const chip = document.createElement("span");
        chip.className = "route-segment-chip";
        const icon = getModeIcon(segment.mode, segment.category);
        chip.innerHTML = `<img class="mode-icon" src="${icon}" alt="${segment.mode || t("mode_label", "mode")}"/>${segment.label || segment.routeId}`;
        const chipColor = segment.color || "#607080";
        chip.style.background = chipColor;
        chip.style.color = getAccessibleTextColor(chipColor);
        if (Array.isArray(segment.alternativeRouteIds) && segment.alternativeRouteIds.length) {
          chip.title = `${t("shared_corridor_alternatives", "Shared-corridor alternatives")}: ${segment.alternativeRouteIds.join(", ")}`;
        }
        chipsWrap.appendChild(chip);
      }
      routeDiv.appendChild(chipsWrap);

      const actions = document.createElement("div");
      actions.className = "route-actions";
      const detailsBtn = document.createElement("button");
      detailsBtn.type = "button";
      detailsBtn.className = "sr-btn";
      detailsBtn.textContent = t("view_steps", "View Steps");
      detailsBtn.onclick = (evt) => {
        evt.stopPropagation();
        const detailNode = buildRouteStepList(route);
        openRouteDetail(`${t("option", "Option")} ${i + 1} ${t("details", "Details")}`, detailNode);
      };
      actions.appendChild(detailsBtn);
      if (i === selectedIndex) {
        const selectedTag = document.createElement("span");
        selectedTag.className = "route-option-meta route-option-selected";
        selectedTag.textContent = t("selected", "Selected");
        actions.appendChild(selectedTag);
      }
      routeDiv.appendChild(actions);

      c.appendChild(routeDiv);
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

  function setLegendItems(items = []) {
    legendList.innerHTML = "";
    legendButtons.clear();
    legendItemsAll = Array.isArray(items) ? items.slice() : [];
    let rendered = 0;
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-item";
      btn.dataset.routeId = String(item.routeId || "");
      btn.innerHTML = `
        <span class="legend-swatch" style="background:${item.color || "#64748b"}"></span>
        <span>${String(item.label || item.routeId || "")}</span>
      `;
      btn.onclick = () => onLegendRouteSelect(String(item.routeId || ""));
      legendButtons.set(String(item.routeId || ""), btn);
      const labelText = String(item.label || item.routeId || "");
      if (/^\s*(\d+|B1)\s*-/.test(labelText)) {
        legendList.appendChild(btn);
        rendered += 1;
      }
    }
    if (rendered === 0) {
      for (const item of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "legend-item";
        btn.dataset.routeId = String(item.routeId || "");
        btn.innerHTML = `
          <span class="legend-swatch" style="background:${item.color || "#64748b"}"></span>
          <span>${String(item.label || item.routeId || "")}</span>
        `;
        btn.onclick = () => onLegendRouteSelect(String(item.routeId || ""));
        legendButtons.set(String(item.routeId || ""), btn);
        legendList.appendChild(btn);
        rendered += 1;
      }
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
    searchInput.value = "";
    suggestions.style.display = "none";
    if (routeSelect) {
      routeSelect.value = "";
      routeSelect.disabled = true;
    }
    includeBus = true;
    busFilterState.hoho = true;
    busFilterState.rapid = true;
    busFilterState.gokl = true;
    busFilterState.other = true;
    const busOperatorInputEl = document.getElementById("jronda-bus-operator");
    if (busOperatorInputEl) {
      busOperatorInputEl.value = t("bus_operator_all", "All");
    }
    onBusToggle({ ...busFilterState });
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
    setRailRouteOptions,
    resetUI,
    showToast,
    setLegendItems,
    setLegendActiveRoute,
  };
}
