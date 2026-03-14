/**
 * JRonda GPS Manager
 * GPS tracking + marker rendering + snapping
 * Extracted from render.js - COMPLETE
 */

let userLocation = null;
let userHalo = null;
let userDot = null;
let userWatchId = null;

const DEV_LOCATION = { lat: 3.139, lon: 101.6869 };
const FIXED_KIOSK_STOP_KEY = "jronda_fixed_station_stop_id";

/**
 * Project GPS coordinates to schematic space
 * @param {number} lat 
 * @param {number} lon 
 * @returns {[number, number]} [x, y] in schema space
 */
export function projectGpsToSchema(lat, lon, projectGeoFn, geoStopIndex, SNAP_RADIUS = 30) {
  const [xgeo, ygeo] = projectGeoFn(lat, lon);
  
  // Find closest station in geo space
  let nearest = null;
  let minGeoDist = Infinity;
  
  const nearby = getNearbyFromIndex(geoStopIndex, xgeo, ygeo, 42);
  const candidates = nearby || [];
  
  for (const stop of candidates) {
    const d = Math.hypot(stop.xgeo - xgeo, stop.ygeo - ygeo);
    if (d < minGeoDist) {
      minGeoDist = d;
      nearest = stop;
    }
  }

  if (!nearest) return [xgeo, ygeo];

  // Compute geo → schema offset using anchor
  const offsetX = nearest.xschema - nearest.xgeo;
  const offsetY = nearest.yschema - nearest.ygeo;

  return [xgeo + offsetX, ygeo + offsetY];
}

/**
 * Draw GPS user marker on SVG
 * @param {SVGSVGElement} svg 
 * @param {Object} userLocation 
 */
export function drawUserMarker(svg, userLocation, geoStopIndex, projectGpsFn, SNAP_RADIUS = 30) {
  if (!userLocation) return;

  const lat = userLocation.lat ?? userLocation.stop_lat;
  const lon = userLocation.lon ?? userLocation.stop_lon;

  const { nearest: geoStop, minMeters } = findNearestStopByGeo(lat, lon);
  const [px, py] = projectGpsFn(lat, lon);
  
  const snapped = geoStop && minMeters <= 160 ? geoStop : findNearestStopBySchema(px, py);
  
  const x = snapped ? snapped.xschema : px;
  const y = snapped ? snapped.yschema : py;

  if (!userHalo) {
    userHalo = document.createElementNS(svg.namespaceURI, "circle");
    svg.appendChild(userHalo);
  }
  if (!userDot) {
    userDot = document.createElementNS(svg.namespaceURI, "circle");
    svg.appendChild(userDot);
  }

  userHalo.setAttribute("cx", x);
  userHalo.setAttribute("cy", y);
  userHalo.setAttribute("r", snapped ? "12" : "10");
  userHalo.setAttribute("fill", snapped ? "rgba(0,200,100,0.25)" : "rgba(0,150,255,0.25)");

  userDot.setAttribute("cx", x);
  userDot.setAttribute("cy", y);
  userDot.setAttribute("r", "4");
  userDot.setAttribute("fill", snapped ? "#00C864" : "#0096FF");
  userDot.setAttribute("stroke", "#fff");
  userDot.setAttribute("stroke-width", "2");
}

// Make global for bindings
window.gpsManager = { userDot, userHalo, drawUserMarker, projectGpsToSchema };

/**
 * Get current user location (fixed or GPS)
 */
export function getUserLocation(callback, stationById, FIXED_KIOSK_STOP_KEY = FIXED_KIOSK_STOP_KEY, DEV_LOCATION = DEV_LOCATION) {
  const fixedStopId = localStorage.getItem(FIXED_KIOSK_STOP_KEY);
  if (fixedStopId) {
    const fixed = stationById.get(String(fixedStopId));
    if (fixed) {
      callback({ lat: fixed.stop_lat, lon: fixed.stop_lon, fixedStopId });
      return;
    }
  }
  navigator.geolocation.getCurrentPosition(
    pos => callback({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => callback(DEV_LOCATION),
    { enableHighAccuracy: true }
  );
}

/**
 * Start continuous GPS tracking
 */
export function startGpsTracking(callback) {
  getUserLocation(callback);
  if (userWatchId) navigator.geolocation.clearWatch(userWatchId);
  userWatchId = navigator.geolocation.watchPosition(
    pos => callback({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => {},
    { enableHighAccuracy: true }
  );
}

