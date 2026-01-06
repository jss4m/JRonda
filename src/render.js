import { stations } from "../data/rail/stations.js";
import { goKL } from "../data/gokl/goKL.js";
import { hohoAll } from "../data/hoho/hoho.js";
import { getRouteColor } from "./style/routeStyle.js";

const svg = document.getElementById("map");

// --- Combine all transit sources ---
const allStations = [...stations, ...goKL, ...hohoAll];

// --- Compute bounding box for scaling ---
const lats = allStations.map(s => s.stop_lat);
const lons = allStations.map(s => s.stop_lon);
const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const minLon = Math.min(...lons);
const maxLon = Math.max(...lons);

const svgWidth = 1000;
const svgHeight = 1000;
const margin = 50;

// --- Projection function ---
function project(lat, lon) {
  const x = ((lon - minLon) / (maxLon - minLon)) * (svgWidth - 2 * margin) + margin;
  const y = ((maxLat - lat) / (maxLat - minLat)) * (svgHeight - 2 * margin) + margin;
  return [x, y];
}

// --- Group by route_id ---
const routes = new Map();
for (const s of allStations) {
  if (!routes.has(s.route_id)) routes.set(s.route_id, []);
  routes.get(s.route_id).push(s);
}

// --- Draw route polylines ---
for (const [route_id, stops] of routes) {
  let points = stops
    .map(s => {
      const [x, y] = project(s.stop_lat, s.stop_lon);
      return `${x},${y}`;
    })
    .join(" ");

  // Close loop if flagged
  const last = stops[stops.length - 1];
  if (last.isLoop) {
    const [x, y] = project(stops[0].stop_lat, stops[0].stop_lon);
    points += ` ${x},${y}`;
  }

  const style = getRouteColor(route_id);

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", style?.color || "#fff");
  polyline.setAttribute("stroke-width", "4");
  svg.appendChild(polyline);
}

// --- Draw stops as metro-style capsules ---
for (const s of allStations) {
  const [x, y] = project(s.stop_lat, s.stop_lon);
  const style = getRouteColor(s.route_id);

  if (s.isInterchange) {
    // Colored capsule for interchange
    const capsule = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const width = 12, height = 6, rx = 3;
    capsule.setAttribute("x", x - width / 2);
    capsule.setAttribute("y", y - height / 2);
    capsule.setAttribute("width", width);
    capsule.setAttribute("height", height);
    capsule.setAttribute("rx", rx);
    capsule.setAttribute("ry", rx);
    capsule.setAttribute("fill", style?.color || "#fff");
    svg.appendChild(capsule);
  } else if (s.isConnecting) {
    // Small gray capsule for connecting transfer
    const capsule = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const width = 8, height = 4, rx = 2;
    capsule.setAttribute("x", x - width / 2);
    capsule.setAttribute("y", y - height / 2);
    capsule.setAttribute("width", width);
    capsule.setAttribute("height", height);
    capsule.setAttribute("rx", rx);
    capsule.setAttribute("ry", rx);
    capsule.setAttribute("fill", "#888");
    svg.appendChild(capsule);
  } else {
    // Regular stop
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 3);
    circle.setAttribute("fill", "#fff");
    svg.appendChild(circle);
  }
}
