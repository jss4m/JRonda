// ======= ui.js =======
import { getRouteColor } from "../style/routeStyle.js";
export function createUI(config) {
  const {
    onPresetChange = () => {},
    onBusToggle = () => {},
    onCategoryChange = () => {},
    onRailRouteChange = () => {},
    onReset = () => {},
    onSearchSelect = () => {},
    stationOptions = [],
    categoryOptions = [],
  } = config || {};

  const map = document.getElementById("map");
  const responsiveStyle = document.createElement("style");
  responsiveStyle.textContent = `
    #kiosk-root {
      display: grid;
      grid-template-columns: 1fr 380px;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #101418;
    }
    #kiosk-map-wrap { min-width: 0; min-height: 0; }
    #kiosk-map-wrap > svg { width: 100%; height: 100%; display: block; }
    #kiosk-sidebar {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      background: #f8fafc;
      border-left: 1px solid #cfd7e3;
      color: #142033;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      min-height: 0;
    }
    .panel-block {
      border: 1px solid #d5deea;
      border-radius: 10px;
      background: #fff;
      padding: 10px;
    }
    .sr-control {
      border: 1px solid #9fb0c6;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 14px;
      color: #11243b;
      background: #fff;
    }
    .sr-control:focus-visible,
    .sr-btn:focus-visible {
      outline: 3px solid #1f6feb;
      outline-offset: 1px;
    }
    .sr-btn {
      border: 1px solid #9fb0c6;
      background: #fff;
      color: #152a42;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-weight: 600;
    }
    .sr-btn.primary {
      border-color: #0d6efd;
      background: #0d6efd;
      color: #fff;
    }
    #route-info-panel {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      border: 1px solid #d5deea;
      border-radius: 10px;
      padding: 10px;
      background: #fff;
    }
    #search-suggestions {
      display: none;
      position: absolute;
      z-index: 2000;
      left: 0;
      right: 0;
      top: calc(100% + 4px);
      max-height: 180px;
      overflow-y: auto;
      border: 1px solid #c8d2df;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 6px 16px rgba(0,0,0,0.12);
    }
    .suggestion-item {
      width: 100%;
      border: none;
      background: #fff;
      text-align: left;
      padding: 8px;
      cursor: pointer;
      color: #15283e;
    }
    .suggestion-item:hover,
    .suggestion-item:focus-visible { background: #eef5ff; }
    #jronda-toast-root {
      position: fixed;
      right: 14px;
      bottom: 14px;
      z-index: 5000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: min(90vw, 360px);
    }
    .jronda-toast {
      border-radius: 10px;
      border: 1px solid #cfd7e3;
      background: #ffffff;
      color: #10253a;
      font-size: 13px;
      line-height: 1.3;
      padding: 9px 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.16);
    }
    .jronda-toast.warn { border-color: #d97706; background: #fffbeb; }
    .jronda-toast.error { border-color: #b91c1c; background: #fef2f2; }
    .step-list { margin-top: 8px; border-top: 1px solid #dbe5f0; padding-top: 8px; }
    .step-row { display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: start; margin-bottom: 5px; }
    .step-left { position: relative; width: 22px; min-height: 20px; display: flex; justify-content: center; }
    .step-node { width: 10px; height: 10px; border-radius: 999px; border: 2px solid #1f2937; background: #fff; margin-top: 1px; }
    .step-line { position: absolute; left: 10px; top: 13px; bottom: -6px; width: 2px; background: #94a3b8; }
    .step-line.walk { background: repeating-linear-gradient(to bottom, #6b7280 0 4px, transparent 4px 8px); }
    .step-text { font-size: 12px; color: #1f2f45; }
    .mode-icon { width: 14px; height: 14px; vertical-align: text-bottom; margin-right: 4px; }
    @media (max-width: 960px), (orientation: portrait) {
      #kiosk-root { grid-template-columns: 1fr; grid-template-rows: minmax(48vh, 1fr) minmax(40vh, 1fr); }
      #kiosk-sidebar { border-left: none; border-top: 1px solid #cfd7e3; }
    }
  `;
  document.head.appendChild(responsiveStyle);

  Object.assign(document.body.style, { margin: "0", overflow: "hidden" });

  const root = document.createElement("div");
  root.id = "kiosk-root";

  const mapWrap = document.createElement("div");
  mapWrap.id = "kiosk-map-wrap";

  const sidebar = document.createElement("aside");
  sidebar.id = "kiosk-sidebar";
  sidebar.setAttribute("aria-label", "Transit controls and route results");

  if (map) mapWrap.appendChild(map);
  root.appendChild(mapWrap);
  root.appendChild(sidebar);
  document.body.appendChild(root);

  const controlBlock = document.createElement("div");
  controlBlock.className = "panel-block";
  sidebar.appendChild(controlBlock);

  const presetRow = document.createElement("div");
  Object.assign(presetRow.style, { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" });
  controlBlock.appendChild(presetRow);

  const presets = [
    { id: "SMART", label: "Smart" },
    { id: "FAST", label: "Fast" },
    { id: "BUDGET", label: "Budget" },
  ];
  const presetButtons = new Map();
  function setActivePreset(presetId) {
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
    btn.setAttribute("aria-label", `Use ${p.label} routing preset`);
    btn.onclick = () => {
      setActivePreset(p.id);
      onPresetChange(p.id);
    };
    presetButtons.set(p.id, btn);
    presetRow.appendChild(btn);
  });
  setActivePreset("SMART");

  const optionsRow = document.createElement("div");
  Object.assign(optionsRow.style, { display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center", marginBottom: "8px" });
  controlBlock.appendChild(optionsRow);

  const busLabel = document.createElement("label");
  busLabel.setAttribute("for", "jronda-bus-toggle");
  busLabel.textContent = "Include bus routes";
  busLabel.style.fontWeight = "600";
  optionsRow.appendChild(busLabel);

  let includeBus = true;
  const busBtn = document.createElement("button");
  busBtn.type = "button";
  busBtn.id = "jronda-bus-toggle";
  busBtn.className = "sr-btn primary";
  busBtn.textContent = "ON";
  busBtn.setAttribute("aria-label", "Toggle include bus routes");
  busBtn.onclick = () => {
    includeBus = !includeBus;
    busBtn.textContent = includeBus ? "ON" : "OFF";
    busBtn.classList.toggle("primary", includeBus);
    onBusToggle(includeBus);
  };
  optionsRow.appendChild(busBtn);

  const categoryWrap = document.createElement("div");
  Object.assign(categoryWrap.style, { display: "grid", gridTemplateColumns: "1fr", gap: "4px", marginBottom: "8px" });
  controlBlock.appendChild(categoryWrap);

  const categoryLabel = document.createElement("label");
  categoryLabel.setAttribute("for", "jronda-category-filter");
  categoryLabel.textContent = "Rail category filter";
  categoryLabel.style.fontWeight = "600";
  categoryWrap.appendChild(categoryLabel);

  const categorySelect = document.createElement("select");
  categorySelect.id = "jronda-category-filter";
  categorySelect.className = "sr-control";
  categorySelect.setAttribute("aria-label", "Filter rail category");
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All categories";
  categorySelect.appendChild(allOption);
  for (const category of categoryOptions) {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = category;
    categorySelect.appendChild(opt);
  }
  categorySelect.onchange = () => onCategoryChange(categorySelect.value || null);
  categoryWrap.appendChild(categorySelect);

  const routeLabel = document.createElement("label");
  routeLabel.setAttribute("for", "jronda-route-filter");
  routeLabel.textContent = "Rail line";
  routeLabel.style.fontWeight = "600";
  categoryWrap.appendChild(routeLabel);

  const routeSelect = document.createElement("select");
  routeSelect.id = "jronda-route-filter";
  routeSelect.className = "sr-control";
  routeSelect.setAttribute("aria-label", "Filter rail route");
  routeSelect.disabled = true;
  const routeAllOption = document.createElement("option");
  routeAllOption.value = "";
  routeAllOption.textContent = "All routes in category";
  routeSelect.appendChild(routeAllOption);
  routeSelect.onchange = () => onRailRouteChange(routeSelect.value || null);
  categoryWrap.appendChild(routeSelect);

  const searchWrap = document.createElement("div");
  Object.assign(searchWrap.style, { position: "relative", display: "grid", gridTemplateColumns: "1fr", gap: "4px", marginBottom: "8px" });
  controlBlock.appendChild(searchWrap);

  const searchLabel = document.createElement("label");
  searchLabel.setAttribute("for", "jronda-station-search");
  searchLabel.textContent = "Search station";
  searchLabel.style.fontWeight = "600";
  searchWrap.appendChild(searchLabel);

  const searchInput = document.createElement("input");
  searchInput.id = "jronda-station-search";
  searchInput.className = "sr-control";
  searchInput.type = "text";
  searchInput.placeholder = "Type station name";
  searchInput.autocomplete = "off";
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-controls", "search-suggestions");
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.setAttribute("aria-label", "Search station");
  searchWrap.appendChild(searchInput);

  const suggestions = document.createElement("div");
  suggestions.id = "search-suggestions";
  suggestions.setAttribute("role", "listbox");
  searchWrap.appendChild(suggestions);

  const resetRow = document.createElement("div");
  Object.assign(resetRow.style, { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" });
  controlBlock.appendChild(resetRow);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "sr-btn";
  resetBtn.textContent = "Reset";
  resetBtn.setAttribute("aria-label", "Reset map and panel");
  resetBtn.onclick = () => onReset("manual");
  resetRow.appendChild(resetBtn);

  const resetHint = document.createElement("span");
  resetHint.style.fontSize = "12px";
  resetHint.style.color = "#4a5b72";
  resetHint.textContent = "Auto reset active";
  resetRow.appendChild(resetHint);

  const stationInfo = document.createElement("div");
  stationInfo.className = "panel-block";
  stationInfo.setAttribute("aria-live", "polite");
  stationInfo.textContent = "Tap a station to view details";
  sidebar.appendChild(stationInfo);

  const panel = document.createElement("div");
  panel.id = "route-info-panel";
  panel.style.fontSize = "14px";
  sidebar.appendChild(panel);

  const title = document.createElement("h4");
  title.textContent = "Route Info";
  title.style.marginTop = "0";
  panel.appendChild(title);

  const content = document.createElement("div");
  content.id = "route-info-content";
  panel.appendChild(content);

  function hideRoutePanel() {
    panel.style.display = "none";
  }

  function showRoutePanel() {
    panel.style.display = "";
  }

  const toastRoot = document.createElement("div");
  toastRoot.id = "jronda-toast-root";
  document.body.appendChild(toastRoot);

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
        onSearchSelect(String(item.stop_id));
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
        onSearchSelect(String(top.stop_id));
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

  function updatePanel(routes, selectedIndex = 0, onSelect) {
    showRoutePanel();
    const c = content;
    c.innerHTML = "";

    if (!routes || !routes.length) {
      c.textContent = "No route found.";
      return;
    }

    routes.forEach((route, i) => {
      const routeDiv = document.createElement("button");
      routeDiv.type = "button";
      Object.assign(routeDiv.style, {
        width: "100%",
        textAlign: "left",
        border: i === selectedIndex ? "2px solid #005fcc" : "1px solid #cfd7e3",
        padding: "10px",
        borderRadius: "10px",
        marginBottom: "8px",
        cursor: "pointer",
        backgroundColor: i === selectedIndex ? "#eaf2ff" : "#fff",
        color: "#10253a",
      });
      routeDiv.onclick = () => onSelect?.(i);

      const routeTitle = document.createElement("div");
      const firstMode = Array.isArray(route.segments) && route.segments.length
        ? String(route.segments[0].mode || "")
        : "";
      const firstCategory = Array.isArray(route.segments) && route.segments.length
        ? String(route.segments[0].category || "")
        : "";
      const firstModeIcon = getModeIcon(firstMode, firstCategory);
      routeTitle.innerHTML = `<img class="mode-icon" src="${firstModeIcon}" alt="${firstMode || "mode"}"/>Option ${i + 1}`;
      routeTitle.style.fontWeight = "700";
      routeTitle.style.marginBottom = "6px";
      routeDiv.appendChild(routeTitle);

      const distanceValue = route.totalDistance ?? route.distance ?? 0;
      const etaValue = route.ETA ?? route.eta ?? 0;
      const transfersValue = route.transfers ?? 0;

      const summary = document.createElement("div");
      summary.textContent = `Distance ${Math.round(distanceValue)}m | ETA ${etaValue} min | Transfers ${transfersValue}`;
      summary.style.fontSize = "13px";
      routeDiv.appendChild(summary);

      const modeSummary = document.createElement("div");
      modeSummary.textContent = `Modes: ${route.modeSummary || "N/A"}`;
      modeSummary.style.marginTop = "6px";
      modeSummary.style.fontWeight = "600";
      routeDiv.appendChild(modeSummary);

      const chipsWrap = document.createElement("div");
      Object.assign(chipsWrap.style, {
        display: "flex",
        gap: "6px",
        flexWrap: "wrap",
        marginTop: "6px",
      });
      const segments = Array.isArray(route.segments) ? route.segments : [];
      for (const segment of segments) {
        const chip = document.createElement("span");
        const icon = getModeIcon(segment.mode, segment.category);
        chip.innerHTML = `<img class="mode-icon" src="${icon}" alt="${segment.mode || "mode"}"/>${segment.label || segment.routeId}`;
        const chipColor = segment.color || "#607080";
        Object.assign(chip.style, {
          background: chipColor,
          color: getAccessibleTextColor(chipColor),
          borderRadius: "999px",
          padding: "3px 8px",
          fontSize: "12px",
          fontWeight: "700",
        });
        chipsWrap.appendChild(chip);
      }
      routeDiv.appendChild(chipsWrap);

      if (i === selectedIndex && Array.isArray(route.stations) && route.stations.length) {
        const stepList = document.createElement("div");
        stepList.className = "step-list";

        let prev = null;
        route.stations.forEach((station, idx) => {
          const current = station || {};
          const mode = String(current.mode || "");
          const lineName = current.route_public_name || current.route_long_name || current.route_id || "";

          if (prev && String(prev.route_id) !== String(current.route_id)) {
            const walkRow = document.createElement("div");
            walkRow.className = "step-row";
            walkRow.innerHTML = `
              <div class="step-left">
                <img class="mode-icon" src="/src/img/Connecting_icon.svg" alt="Walk" style="margin-top:1px;margin-right:0;"/>
                <div class="step-line walk"></div>
              </div>
              <div class="step-text"><b>Walk</b> to ${current.stop_name || "next station"} station</div>
            `;
            stepList.appendChild(walkRow);
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
            <div class="step-text"><img class="mode-icon" src="${icon}" alt="${mode || "mode"}"/><b>${current.stop_name || current.stop_id || "Stop"}</b> - ${lineName}</div>
          `;
          stepList.appendChild(row);
          prev = current;
        });

        routeDiv.appendChild(stepList);
      }

      c.appendChild(routeDiv);
    });
  }

  function setStationInfo(text) {
    stationInfo.textContent = text || "Tap a station to view details";
  }

  function setRailRouteOptions(options = []) {
    routeSelect.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All routes in category";
    routeSelect.appendChild(all);
    for (const item of options) {
      const opt = document.createElement("option");
      opt.value = String(item.routeId || "");
      opt.textContent = String(item.label || item.routeId || "");
      routeSelect.appendChild(opt);
    }
    routeSelect.disabled = options.length === 0;
    routeSelect.value = "";
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
    categorySelect.value = "";
    routeSelect.value = "";
    routeSelect.disabled = true;
    includeBus = true;
    busBtn.textContent = "ON";
    busBtn.classList.add("primary");
    setActivePreset("SMART");
    setStationInfo("");
    content.innerHTML = "";
    content.textContent = "No route selected.";
  }

  function showToast(message, type = "info", timeoutMs = 2600) {
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
    setRailRouteOptions,
    resetUI,
    showToast,
  };
}
