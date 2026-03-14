export function normalizeRouteId(route_id) {
  return String(route_id || "").trim().toUpperCase().replace(/-/g, "_");
}

export const railRouteIds = new Set([
  "KTM1", "KTM2", "KTM3", "AG", "PH", "KJ", "ERL1", "ERL2", "MR", "MRT", "SA", "PYL", "CC", "BRT"
]);

export function getRouteColor(route_id, isTransfer = false, route_color = null) {
  if (!route_id) {
    return { color: "#888888", dashed: false };
  }

  const normalized = normalizeRouteId(route_id);

  if (isTransfer) {
    return { color: "#000000", dashed: true };
  }

  // ---- Use route_color if present ----
  if (route_color) {
    return {
      color: route_color.startsWith("#") ? route_color : `#${route_color}`,
      dashed: false,
    };
  }

  if (normalized.startsWith("300")) {
    return { color: "#00ffb3ff", dashed: false };
  }

  // ---- Existing route_id-based colors for all others ----
  let color;
  switch (normalized) {
    // RAIL
    case "AG":
      color = "#FE8E10";
      break;
    case "PH":
      color = "#721422";
      break;
    case "KJ":
      color = "#E0115F";
      break;
    case "MR":
      color = "#7DBA00";
      break;
    case "MRT":
      color = "#11753A";
      break;
    case "PYL":
      color = "#FACA05";
      break;
    case "BRT":
      color = "#1E4D2B";
      break;
    case "SA":
      color = "#59B8E6";
      break;
    case "CC":
      color = "#655DC6";
      break;

    // KTM
    case "KTM1":
      color = "#3C5A9F";
      break;
    case "KTM2":
      color = "#DC2420";
      break;
    case "KTM3":
      color = "#8B4513";
      break;

    // ERL
    case "ERL1":
      color = "#33A8B5";
      break;
    case "ERL2":
      color = "#8C238F";
      break;

    // HOHO
    case "HOHOC":
      color = "#EE1823";
      break;
    case "HOHOG":
      color = "#016C39";
      break;
    case "HOHOS_SAT":
      color = "#DA251D";
      break;
    case "HOHOS_SUN":
      color = "#FCD116";
      break;

    // GOKL
    case "GOKL01":
      color = "#1A974B";
      break;
    case "GOKL02":
      color = "#5C3E86";
      break;
    case "GOKL03":
      color = "#D92639";
      break;
    case "GOKL04":
      color = "#1C77AE";
      break;
    case "GOKL05":
      color = "#E67730";
      break;
    case "GOKL06":
      color = "#CD6298";
      break;
    case "GOKL07":
      color = "#3EB7A8";
      break;
    case "GOKL08":
      color = "#8B2348";
      break;
    case "GOKL09":
      color = "#85482B";
      break;
    case "GOKL10":
      color = "#A2C93C";
      break;
    case "GOKL11":
      color = "#6F8996";
      break;
    case "GOKL12":
      color = "#D4C17C";
      break;
    case "GOKL13":
      color = "#A7227D";
      break;
    case "GOKL14":
      color = "#49534A";
      break;
    case "GOKL15":
      color = "#1F497D";
      break;

    // Default fallback
    default:
      color = stableFallbackRouteColor(normalized);
  }

  return { color, dashed: false };
}

export function getRouteMode(routeId) {
  const id = normalizeRouteId(routeId);
  if (railRouteIds.has(id)) return 'RAIL';
  if (id.includes('BUS') || id.startsWith('300') || id.includes('HOHO') || id.includes('GOKL')) return 'BUS';
  return 'RAIL'; // Default
}

function stableFallbackRouteColor(seed) {
  const text = String(seed || "route");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  const sat = 62;
  const light = 44;
  return hslToHex(hue, sat, light);
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lig - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getModeLabel(id) {
  const normalized = normalizeRouteId(id);
  const route = routes.find((r) => normalizeRouteId(r.id) === normalized);
  return route ? route.name : id;
}

function inferModeFromData(data) {
  const category = normalizeRouteId(data?.category);
  if (["MRT", "LRT", "KTM", "ERL", "MRL", "RAIL"].includes(category)) return "RAIL";
  const routeId = normalizeRouteId(data?.route_id);
  if (railRouteIds.has(routeId)) return "RAIL";
  if (routeId.includes('BUS') || routeId.startsWith('300') || routeId.includes('HOHO') || routeId.includes('GOKL')) return 'BUS';
  return "RAIL";
}

export function getServiceLabel(data, modeHint = null) {
  const source = typeof data === "object" && data ? data : { route_id: data };
  const routeId = normalizeRouteId(source.route_id);
  const mode = modeHint || inferModeFromData(source);
  const routePublicName = String(source.route_public_name || "").trim();

  // Route public name is the authoritative display name when provided.
  if (routePublicName) return routePublicName;

  if (mode === "RAIL") {
    return (
      source.route_long_name ||
      source.route_short_name ||
      getModeLabel(routeId) ||
      routeId
    );
  }

  return (
    source.route_short_name ||
    source.route_long_name ||
    getModeLabel(routeId) ||
    routeId
  );
}

export function getPoiCategoryStyle(category) {
  const c = String(category || "").toLowerCase();
  const filenameMap = {
    'mall': 'mall.svg',
    'shopping': 'mall.svg',
    'hotel': 'hotel.svg',
    'museum': 'museum.svg',
    'religious': 'default.svg',
    'buddhist': 'buddhist.svg',
    'christian': 'christian.svg',
    'hinduist': 'hinduist.svg',
    'muslim': 'muslim.svg',
    'sikhism': 'sikhism.svg',
    'landmark': 'attraction.svg',
    'tourist': 'attraction.svg',
    'attraction': 'attraction.svg',
    'park': 'park.svg',
    'atm': 'atm.svg',
  };
  const filename = filenameMap[c] || 'default.svg';
  return {
    filename,
    color: '#475569'
  };
}

const routeMap = new Map();
for (const r of [
    { id: "KTM1", name: "KTM Komuter Batu Caves - Pulau Sebang" }, //NUM 1
    { id: "KTM2", name: "KTM Komuter Tanjung Malim - Pelabuhan Klang" }, //NUM 2
    { id: "KTM3", name: "KTM KL Sentral -Skypark Terminal" }, //NUM 10
    { id: "AG", name: "Ampang Line" }, //NUM 3
    { id: "PH", name: "Sri Petaling Line" }, //NUM 4
    { id: "KJ", name: "Kelana Jaya Line" }, //NUM 5
    { id: "ERL1", name: "KLIA Transit" }, //NUM 7
    { id: "ERL2", name: "KLIA Ekspres" }, //NUM 6
    { id: "MR", name: "KL Monorail" }, //NUM 8
    { id: "MRT", name: "MRT Kajang Line" }, //NUM 9
    { id: "SA", name: "Shah Alam Line" }, //NUM 11
    { id: "PYL", name: "MRT Putrajaya Line" }, // NUM 12
    { id: "CC", name: "MRT Circle Line" }, //NUM 13
    { id: "BRT", name: "BRT Sunway Line" } //B1
]) {
    const key = normalizeRouteId(r.id);
    if (routeMap.has(key)) {
        console.warn(`Duplicate rail route id in routeStyle routes: ${r.id}`);
    }
    routeMap.set(key, r);
}

export const routes = Array.from(routeMap.values());
