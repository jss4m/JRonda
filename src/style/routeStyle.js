export function getRouteColor(
  route_id,
  isTransfer = false,
  route_color = null,
) {
  if (!route_id) {
    return { color: "#888888", dashed: false };
  }

  const normalized = route_id
    .toString()
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");

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


export const routes = [
    { id: "KTM1", name: "KTM Komuter Batu Caves - P. Sebang" },
    { id: "KTM2", name: "KTM Komuter Tanjung Malim - Pel. Klang" },
    { id: "KTM3", name: "KTM SKYPARK LINK" },
    { id: "AG", name: "Ampang Line" },
    { id: "PH", name: "Sri Petaling Line" },
    { id: "KJ", name: "Kelana Jaya Line" },
    { id: "ERL1", name: "KLIA Transit" },
    { id: "ERL2", name: "KLIA Ekspres" },
    { id: "MR", name: "KL Monorail" },
    { id: "MRT", name: "MRT Kajang Line" },
    { id: "SA", name: "Shah Alam Line" },
    { id: "PYL", name: "MRT Putrajaya Line" },
    { id: "CC", name: "MRT Circle Line" },
    { id: "BRT", name: "BRT Sunway Line" }
];

export function getModeLabel(id) {
  const route = routes.find(r => r.id === id);
  return route ? route.name : id;
}

function inferModeFromData(data) {
  const category = String(data?.category || "").toUpperCase();
  if (["MRT", "LRT", "KTM", "ERL", "MRL", "RAIL"].includes(category)) return "RAIL";
  const routeId = String(data?.route_id || "").toUpperCase();
  if (routes.some((r) => r.id === routeId)) return "RAIL";
  return "BUS";
}

export function getServiceLabel(data, modeHint = null) {
  const source = typeof data === "object" && data ? data : { route_id: data };
  const routeId = String(source.route_id || "");
  const mode = modeHint || inferModeFromData(source);

  if (mode === "RAIL") {
    return (
      source.route_long_name ||
      source.route_short_name ||
      getModeLabel(routeId) ||
      routeId
    );
  }

  return (
    source.route_public_name ||
    source.route_short_name ||
    source.route_long_name ||
    routeId
  );
}

export function getPoiCategoryStyle(category) {
  const c = String(category || "").toLowerCase();
  if (c.includes("mall") || c.includes("shopping")) {
    return {
      color: "#1D4ED8",
      iconPath: "M3 7h18v12H3z M6 10h3v3H6z M10.5 10h3v3h-3z M15 10h3v3h-3z",
    };
  }
  if (c.includes("hotel")) {
    return {
      color: "#7C3AED",
      iconPath: "M3 10h4v3H3z M8 12h13v6H8z M3 12h3v6H3z M2 18h20v2H2z",
    };
  }
  if (c.includes("museum")) {
    return {
      color: "#B45309",
      iconPath: "M3 9h18l-9-4z M4 10h16v10H4z M7 10v10 M12 10v10 M17 10v10",
    };
  }
  if (c.includes("religious")) {
    return {
      color: "#9A3412",
      iconPath: "M4 20h16v-2H4z M6 10h12v8H6z M12 4l6 4H6z M11 8h2v6h-2z",
    };
  }
  if (c.includes("landmark")) {
    return {
      color: "#DC2626",
      iconPath: "M12 3a5 5 0 0 0-5 5c0 4 5 10 5 10s5-6 5-10a5 5 0 0 0-5-5z M12 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z",
    };
  }
  if (c.includes("tourist") || c.includes("attraction")) {
    return {
      color: "#16A34A",
      iconPath: "M12 2l2.7 5.5 6.1.9-4.4 4.2 1 6.1L12 16l-5.4 2.7 1-6.1L3.3 8.4l6.1-.9z",
    };
  }
  if (c.includes("park")) {
    return {
      color: "#059669",
      iconPath: "M12 3l4 6h-3l3 5h-8l3-5H8z M11 14h2v5h-2z M7 19h10v2H7z",
    };
  }
  return {
    color: "#475569",
    iconPath: "M12 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12z M12 10a2 2 0 1 1 0 4a2 2 0 0 1 0-4z",
  };
}
