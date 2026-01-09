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

// --- SVG dimensions ---
const svgWidth = 1000;
const svgHeight = 1000;
const margin = 50;

const MIN_GAP = 10;
const MAX_GAP = 60;
const RELAX_FACTOR = 0.5;
const TRANSFER_DISTANCE = 12;

// --- Projection function ---
function project(lat, lon) {
  const x = ((lon - minLon) / (maxLon - minLon)) * (svgWidth - 2 * margin) + margin;
  const y = ((maxLat - lat) / (maxLat - minLat)) * (svgHeight - 2 * margin) + margin;
  return [x, y];
}

// --- utilities ---
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// --- Group by route_id ---
const routes = new Map();
for (const s of allStations) {
  if (!routes.has(s.route_id)) routes.set(s.route_id, []);
  routes.get(s.route_id).push(s);
}

// --- Relax route points to avoid overlaps ---
function relaxRoute(points) {
    for(let i=1; i < points.length; i++) {
        const a = points[i-1];
        const b = points[i];
        
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 1;

        const nx = dx / dist;
        const ny = dy / dist;

        if(dist < MIN_GAP) {
            const push = (MIN_GAP - dist) * RELAX_FACTOR;
            b.x += nx * push;
            b.y += ny * push;
        }

        if(dist > MAX_GAP) {
            const pull = (dist - MAX_GAP) * RELAX_FACTOR;
            b.x -= nx * pull;
            b.y -= ny * pull;
        }

        b.x = clamp(b.x, margin, svgWidth - margin);
        b.y = clamp(b.y, margin, svgHeight - margin);
    }
}

for(const [route_id, stops] of routes) {
    relaxRoute(stops);
}

for(const s of allStations) {
    const [x, y] = project(s.stop_lat, s.stop_lon);
    s.x = x;
    s.y = y;
}

// --- Draw route polylines ---
for (const [route_id, stops] of routes) {
  let points = stops
    .map(s => `${s.x},${s.y}`)
    .join(" ");

  // Close loop if flagged
  const last = stops[stops.length - 1];
  if (last.isLoop) {
    const first = stops[0];
    points += ` ${first.x},${first.y}`;
  }

  const style = getRouteColor(route_id);

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", style?.color || "#fff");
  polyline.setAttribute("stroke-width", "4");
  svg.appendChild(polyline);
}

// --- Draw interchanges ---
for (let i = 0; i < allStations.length; i++) {
    for (let j = i + 1; j < allStations.length; j++) {
        const a = allStations[i];
        const b = allStations[j];

        if(a.route_id === b.route_id) continue;

        if(
            (a.isInterchange || a.isConnecting) &&
            (b.isInterchange || b.isConnecting) &&
            distance(a, b) < TRANSFER_DISTANCE
        ) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", a.x);
            line.setAttribute("y1", a.y);
            line.setAttribute("x2", b.x);
            line.setAttribute("y2", b.y);
            line.setAttribute("stroke", "#888");
            line.setAttribute("stroke-width", "2");
            line.setAttribute("stroke-dasharray", "4 4");
            svg.appendChild(line);
        }
    }
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
