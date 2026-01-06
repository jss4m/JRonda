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
    case "hohoC":    color = "#EE1823"; break; // City
    case "hohoG":    color = "#016C39"; break; // Garden
    case "hohoS-sat":color = "#DA251D"; break; // Selangor Saturday
    case "hohoS-sun":color = "#FCD116"; break; // Selangor Sunday

    // ===== GOKL =====
    case "goKL-grey":        color = "#1A974B"; break;
    case "goKL-purple":       color = "#5C3E86"; break;
    case "goKL-red":          color = "#D92639"; break;
    case "goKL-blue":         color = "#1C77AE"; break;
    case "goKL-orange":       color = "#E67730"; break;
    case "goKL-pink":         color = "#CD6298"; break;
    case "goKL-turquoise":    color = "#3EB7A8"; break;
    case "goKL-maroon":       color = "#8B2348"; break;
    case "goKL-chocolate":    color = "#85482B"; break;
    case "goKL-parrot-green": color = "#A2C93C"; break;
    case "goKL-grey":         color = "#6F8996"; break;
    // Appears on map, not found in source data
    case "goKL-cream":        color = "#D4C17C"; break;
    case "goKL-magenta":      color = "#A7227D"; break;
    
    case "goKL-black_1":      color = "#1D1E20"; break;
    case "goKL-black_2":      color = "#1E1F21"; break;

    // ===== rapidBus & feeder =====
    case "dummy1":      color = "#006CFF"; break; // rapidBus placeholder normal
    case "dummy2":      color = "#008716"; break; // rapidBus placeholder mix use
    case "dummy3":      color = "#21618C"; break; // rapidBus placeholder special occasions
    case "dummy4":      color = "#00ffb3ff"; break; // feeder placeholder

    default:
      color = "#888888";
  }

  return {
    color,
    dashed: false
  };
}
