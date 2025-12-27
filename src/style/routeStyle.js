export function getRouteColor(route_id, isTransfer = false) {
  if (!route_id) {
    return { color: "#888888", dashed: false };
  }

  const normalized = route_id
    .toString()
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");

  if (isTransfer) {
    return {
      color: "#000000",
      dashed: true
    };
  }

  let color;

  switch (route_id) {
    // ===== RAIL =====
    case "AG":   color = "#FE8E10"; break; // Ampang Line
    case "PH":   color = "#721422"; break; // Sri Petaling Line
    case "KJ":   color = "#E0115F"; break; // Kelana Jaya Line
    case "MR":   color = "#7DBA00"; break; // KL Monorail
    case "MRT":  color = "#11753A"; break; // MRT Kajang Line
    case "PYL":  color = "#FACA05"; break; // MRT Putrajaya Line
    case "BRT":  color = "#1E4D2B"; break; // BRT Sunway Line
    case "SA":   color = "#59B8E6"; break; // Shah Alam Line (future)
    case "CC":   color = "#655DC6"; break; // Circle Line (future)

    case "KTM1": color = "#3C5A9F"; break; // KTM Komuter Line 1
    case "KTM2": color = "#DC2420"; break; // KTM Komuter Line 2
    case "KTM3": color = "#8B4513"; break; // KTM Komuter Line 3

    case "ERL1": color = "#33A8B5"; break; // KLIA Transit
    case "ERL2": color = "#8C238F"; break; // KLIA Ekspres

    // ===== HOHO =====
    case "HOHO_C":    color = "#EE1823"; break; // City
    case "HOHO_G":    color = "#016C39"; break; // Garden
    case "HOHO_S_SAT":color = "#DA251D"; break; // Selangor Saturday
    case "HOHO_S_SUN":color = "#FCD116"; break; // Selangor Sunday

    // ===== GOKL =====
    case "GOKL_GREEN":        color = "#1A974B"; break;
    case "GOKL_PURPLE":       color = "#5C3E86"; break;
    case "GOKL_RED":          color = "#D92639"; break;
    case "GOKL_BLUE":         color = "#1C77AE"; break;
    case "GOKL_ORANGE":       color = "#E67730"; break;
    case "GOKL_PINK":         color = "#CD6298"; break;
    case "GOKL_TURQUOISE":    color = "#3EB7A8"; break;
    case "GOKL_MAROON":       color = "#8B2348"; break;
    case "GOKL_CHOCOLATE":    color = "#85482B"; break;
    case "GOKL_PARROT_GREEN": color = "#A2C93C"; break;
    case "GOKL_GREY":         color = "#6F8996"; break;
    case "GOKL_CREAM":        color = "#D4C17C"; break;
    case "GOKL_MAGENTA":      color = "#A7227D"; break;

    // Appears on map, not official site
    case "GOKL_BLACK_1":      color = "#1D1E20"; break;
    case "GOKL_BLACK_2":      color = "#1E1F21"; break;

    default:
      color = "#888888";
  }

  return {
    color,
    dashed: false
  };
}
