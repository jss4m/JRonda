export function normalizeRouteId(route_id) {
  return String(route_id || "").trim().toUpperCase().replace(/-/g, "_");
}

export const CANONICAL_RAIL_ROUTE_META = [
  { id: "KC05_KB18", name: "1 - KTM Komuter Batu Caves - Pulau Sebang", color: "#3C5A9F" },
  { id: "KA15_KD19", name: "2 - KTM Komuter Tanjung Malim - Pelabuhan Klang", color: "#DC2420" },
  { id: "AG", name: "3 - Ampang Line", color: "#E57200" },
  { id: "PH", name: "4 - Sri Petaling Line", color: "#76232F" },
  { id: "KJ", name: "5 - Kelana Jaya Line", color: "#D50032" },
  { id: "ERL2", name: "6 - KLIA Ekspres", color: "#8C238F" },
  { id: "ERL1", name: "7 - KLIA Transit", color: "#33A8B5" },
  { id: "MR", name: "8 - KL Monorail", color: "#84BD00" },
  { id: "KGL", name: "9 - MRT Kajang Line", color: "#047940" },
  { id: "KTM3", name: "10 - KTM KL Sentral - Skypark Terminal", color: "#8B4513" },
  { id: "SA", name: "11 - Shah Alam Line", color: "#59B8E6" },
  { id: "PYL", name: "12 - MRT Putrajaya Line", color: "#FFCD00" },
  { id: "CC", name: "13 - MRT Circle Line", color: "#655DC6" },
  { id: "BRT", name: "B1 - BRT Sunway Line", color: "#115740" },
];

const CANONICAL_RAIL_META_BY_ID = new Map(
  CANONICAL_RAIL_ROUTE_META.map((entry) => [normalizeRouteId(entry.id), entry])
);

export const railRouteIds = new Set(CANONICAL_RAIL_ROUTE_META.map((entry) => normalizeRouteId(entry.id)));

const ETS_ROUTE_ID = "ETS";
const BUS_COLOR_MAP = new Map([
  // HOHO
  ["HOHOC", "#EE1823"],
  ["HOHOG", "#016C39"],
  ["HOHOS_SAT", "#DA251D"],
  ["HOHOS_SUN", "#FCD116"],
  // GOKL
  ["GOKL01", "#1A974B"],
  ["GOKL02", "#5C3E86"],
  ["GOKL03", "#D92639"],
  ["GOKL04", "#1C77AE"],
  ["GOKL05", "#E67730"],
  ["GOKL06", "#CD6298"],
  ["GOKL07", "#3EB7A8"],
  ["GOKL08", "#8B2348"],
  ["GOKL09", "#85482B"],
  ["GOKL10", "#A2C93C"],
  ["GOKL11", "#6F8996"],
  ["GOKL12", "#D4C17C"],
  ["GOKL13", "#A7227D"],
  ["GOKL14", "#49534A"],
  ["GOKL15", "#1F497D"],
]);

function normalizeHexColor(raw) {
  const source = String(raw || "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(source)) return `#${source.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(source)) {
    const expanded = source.split("").map((char) => `${char}${char}`).join("");
    return `#${expanded.toUpperCase()}`;
  }
  return "";
}

export function getRouteColor(route_id, isTransfer = false, route_color = null) {
  if (!route_id) return { color: "#888888", dashed: false };
  if (isTransfer) return { color: "#000000", dashed: true };

  const sourceColor = normalizeHexColor(route_color);
  if (sourceColor) return { color: sourceColor, dashed: false };

  const normalized = normalizeRouteId(route_id);
  const canonical = CANONICAL_RAIL_META_BY_ID.get(normalized);
  if (canonical?.color) return { color: canonical.color, dashed: false };
  const mappedBusColor = BUS_COLOR_MAP.get(normalized);
  if (mappedBusColor) return { color: mappedBusColor, dashed: false };

  if (normalized === ETS_ROUTE_ID) return { color: "#334155", dashed: true };
  return { color: stableFallbackRouteColor(normalized), dashed: false };
}

export function getRouteMode(routeId) {
  const id = normalizeRouteId(routeId);
  if (id === ETS_ROUTE_ID || railRouteIds.has(id)) return "RAIL";
  return "BUS";
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
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function getModeLabel(id) {
  const normalized = normalizeRouteId(id);
  const route = CANONICAL_RAIL_META_BY_ID.get(normalized);
  if (route) return route.name;
  if (normalized === ETS_ROUTE_ID) return "ETS - Intercity connection";
  return id;
}

function inferModeFromData(data) {
  const routeId = normalizeRouteId(data?.route_id);
  return getRouteMode(routeId);
}

export function getServiceLabel(data, modeHint = null) {
  const source = typeof data === "object" && data ? data : { route_id: data };
  const routeId = normalizeRouteId(source.route_id);
  const mode = modeHint || inferModeFromData(source);
  const routePublicName = String(source.route_public_name || "").trim();
  if (routePublicName) return routePublicName;

  if (mode === "RAIL") {
    return source.route_long_name || source.route_short_name || getModeLabel(routeId) || routeId;
  }
  return source.route_short_name || source.route_long_name || routeId;
}

export function getPoiCategoryStyle(category) {
  const c = String(category || "").toLowerCase();
  const filenameMap = {
    mall: "mall.svg",
    shopping: "mall.svg",
    hotel: "hotel.svg",
    museum: "museum.svg",
    religious: "default.svg",
    buddhist: "buddhist.svg",
    christian: "christian.svg",
    hinduist: "hinduist.svg",
    muslim: "muslim.svg",
    sikhism: "sikhism.svg",
    landmark: "attraction.svg",
    tourist: "attraction.svg",
    attraction: "attraction.svg",
    park: "park.svg",
    atm: "atm.svg",
    "prayer room": "prayer-room.svg",
    prayer: "prayer-room.svg",
    toilet: "toilet.svg",
    restroom: "toilet.svg",
    wc: "toilet.svg",
    "disabled toilet": "wheelchair.svg",
    "accessible toilet": "wheelchair.svg",
    wheelchair: "wheelchair.svg",
  };
  const filename = filenameMap[c] || "default.svg";
  return { filename, color: "#475569" };
}

export const routes = CANONICAL_RAIL_ROUTE_META.map((entry) => ({ id: entry.id, name: entry.name }));
