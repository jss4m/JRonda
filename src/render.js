import { stations } from "../data/rail/stations.js";
import { goKL } from "../data/gokl/goKL.js";
import { hohoAll } from "../data/hoho/hoho.js";
import { rapidbus } from "../data/bus/rapidbus.js";
import { getRouteColor } from "./style/routeStyle.js";

const svg = document.getElementById("map");

// ================= CONFIG =================
const svgWidth = 1000;
const svgHeight = 1000;
const margin = 50;

const MIN_GAP = 10;
const MAX_GAP = 60;
const RELAX_FACTOR = 0.5;
const TRANSFER_DISTANCE = 12;

const SNAP_RADIUS = 50; // in pixels
const DEV_LOCATION = { lat: 3.1390, lon: 101.6869 }; // fallback for dev/testing

// ================= DATA =================
const allStations = [...stations, ...goKL, ...hohoAll, ...rapidbus];

// ================= BOUNDS =================
const lats = allStations.map(s => s.stop_lat);
const lons = allStations.map(s => s.stop_lon);

const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const minLon = Math.min(...lons);
const maxLon = Math.max(...lons);

// ================= PROJECTION =================
function project(lat, lon) {
  const x =
    ((lon - minLon) / (maxLon - minLon)) * (svgWidth - 2 * margin) + margin;
  const y =
    ((maxLat - lat) / (maxLat - minLat)) * (svgHeight - 2 * margin) + margin;
  return [x, y];
}

// ================= UTIL =================
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ================= GROUP BY ROUTE =================
const routes = new Map();
for (const s of allStations) {
  if (!routes.has(s.route_id)) routes.set(s.route_id, []);
  routes.get(s.route_id).push(s);
}

// ================= RELAX ROUTES =================
function relaxRoute(points) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];

    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy) || 1;

    const nx = dx / dist;
    const ny = dy / dist;

    if (dist < MIN_GAP) {
      const push = (MIN_GAP - dist) * RELAX_FACTOR;
      b.x += nx * push;
      b.y += ny * push;
    }

    if (dist > MAX_GAP) {
      const pull = (dist - MAX_GAP) * RELAX_FACTOR;
      b.x -= nx * pull;
      b.y -= ny * pull;
    }

    b.x = clamp(b.x, margin, svgWidth - margin);
    b.y = clamp(b.y, margin, svgHeight - margin);
  }
}

// ================= PROJECT POINTS =================
for (const s of allStations) {
  const [x, y] = project(s.stop_lat, s.stop_lon);
  s.x = x;
  s.y = y;
}

for (const [, stops] of routes) {
  relaxRoute(stops);
}

// ================= DRAW ROUTES =================
for (const [route_id, stops] of routes) {
  let points = stops.map(s => `${s.x},${s.y}`).join(" ");

  if (stops[stops.length - 1]?.isLoop) {
    const first = stops[0];
    points += ` ${first.x},${first.y}`;
  }

  const style = getRouteColor(
    route_id,
    false,
    stops[0]?.route_color ?? null
  );

  const polyline = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline"
  );
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", style.color);
  polyline.setAttribute("stroke-width", "4");

  svg.appendChild(polyline);
}

// ================= INTERCHANGES =================
for (let i = 0; i < allStations.length; i++) {
  for (let j = i + 1; j < allStations.length; j++) {
    const a = allStations[i];
    const b = allStations[j];

    if (a.route_id === b.route_id) continue;

    if (
      (a.isInterchange || a.isConnecting) &&
      (b.isInterchange || b.isConnecting) &&
      distance(a, b) < TRANSFER_DISTANCE
    ) {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
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

// ================= DRAW STOPS =================
for (const s of allStations) {
  const style = getRouteColor(s.route_id, false, s.route_color);

  if (s.isInterchange) {
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("x", s.x - 6);
    rect.setAttribute("y", s.y - 3);
    rect.setAttribute("width", 12);
    rect.setAttribute("height", 6);
    rect.setAttribute("rx", 3);
    rect.setAttribute("fill", style.color);
    svg.appendChild(rect);
  } else {
    const c = document.createElementNS(svg.namespaceURI, "circle");
    c.setAttribute("cx", s.x);
    c.setAttribute("cy", s.y);
    c.setAttribute("r", 3);
    c.setAttribute("fill", "#fff");
    svg.appendChild(c);
  }
}

// ================= GPS + SNAPPING =================
let userLocation = null;
let userHalo = null;
let userDot = null;

function findNearestStop(x, y) {
  let nearest = null;
  let minDist = Infinity;

  for (const s of allStations) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < minDist) {
      minDist = d;
      nearest = s;
    }
  }

  return minDist <= SNAP_RADIUS ? nearest : null;
}

function drawUserMarker() {
  if (!userLocation) return;

  const [gx, gy] = project(
    userLocation.lat ?? userLocation.stop_lat,
    userLocation.lon ?? userLocation.stop_lon
  );

  const snapped = findNearestStop(gx, gy);
  const x = snapped ? snapped.x : gx;
  const y = snapped ? snapped.y : gy;

  // Create once
  if (!userHalo) {
    userHalo = document.createElementNS(svg.namespaceURI, "circle");
    svg.appendChild(userHalo);
  }

  if (!userDot) {
    userDot = document.createElementNS(svg.namespaceURI, "circle");
    svg.appendChild(userDot);
  }

  // Update halo
  userHalo.setAttribute("cx", x);
  userHalo.setAttribute("cy", y);
  userHalo.setAttribute("r", snapped ? 12 : 10);
  userHalo.setAttribute(
    "fill",
    snapped ? "rgba(0,200,100,0.25)" : "rgba(0,150,255,0.25)"
  );

  // Update dot
  userDot.setAttribute("cx", x);
  userDot.setAttribute("cy", y);
  userDot.setAttribute("r", 4);
  userDot.setAttribute("fill", snapped ? "#00C864" : "#0096FF");
  userDot.setAttribute("stroke", "#fff");
  userDot.setAttribute("stroke-width", "2");
}

// ================= GEOLOCATION =================
function getUserLocation(callback) {
  if (!("geolocation" in navigator)) {
    console.warn("No geolocation, using dev location");
    callback(DEV_LOCATION);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      callback({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      });
    },
    (err) => {
      console.warn("GPS failed, using dev location", err.code);
      callback(DEV_LOCATION);
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
  );
}

// ================= INIT USER MARKER =================
getUserLocation((loc) => {
  userLocation = loc;
  drawUserMarker();
});
