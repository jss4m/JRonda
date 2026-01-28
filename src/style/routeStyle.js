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
      color = "#888888";
  }

  return { color, dashed: false };
}
