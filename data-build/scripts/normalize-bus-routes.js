/**
 * normalize-bus-routes.js
 *
 * Builds canonical Rapid Bus routes with ordered stops
 * from GTFS data. One route per route_id using the most
 * complete trip as representative.
 *
 * Input: data-build/raw-GTFS/*.zip
 * Output: data-build/normalized/bus_routes.json
 */

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { parse } = require("csv-parse/sync");

const RAW_GTFS_DIR = path.join(__dirname, "../raw-GTFS");
const OUTPUT_DIR = path.join(__dirname, "../normalized");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "bus_routes.json");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const BUS_ZIPS = ["gtfs_rapid_bus_kl.zip", "gtfs_rapid_bus_mrtfeeder.zip"];

function parseCSV(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function pickPublicRouteName(route) {
  const shortName = String(route.route_short_name || "").trim();
  const longName = String(route.route_long_name || "").trim();
  if (shortName) return shortName;
  if (longName) return longName;
  return String(route.route_id || "").trim();
}

let routesMap = {};

BUS_ZIPS.forEach((zipName) => {
  const zipPath = path.join(RAW_GTFS_DIR, zipName);
  if (!fs.existsSync(zipPath)) return;

  const zip = new AdmZip(zipPath);

  const routes = parseCSV(zip.readAsText("routes.txt"));
  const trips = parseCSV(zip.readAsText("trips.txt"));
  const stopTimes = parseCSV(zip.readAsText("stop_times.txt"));

  // route_id -> route metadata (color, agency, etc)
  const routeMeta = {};
  routes.forEach((r) => {
    routeMeta[r.route_id] = {
      route_color: r.route_color || null,
      agency_id: r.agency_id || null,
      route_short_name: r.route_short_name || null,
      route_long_name: r.route_long_name || null,
      route_public_name: pickPublicRouteName(r),
    };
  });

  // route_id -> [trip_id]
  const routeTrips = {};
  trips.forEach((t) => {
    if (!routeTrips[t.route_id]) routeTrips[t.route_id] = [];
    routeTrips[t.route_id].push(t.trip_id);
  });

  // trip_id -> ordered stop_times
  const tripStops = {};
  stopTimes.forEach((st) => {
    if (!tripStops[st.trip_id]) tripStops[st.trip_id] = [];
    tripStops[st.trip_id].push({
      stop_id: st.stop_id,
      seq: Number(st.stop_sequence),
    });
  });

  Object.entries(routeTrips).forEach(([route_id, tripIds]) => {
    let bestTrip = null;
    let bestStops = [];

    // Pick the trip with the most stops
    tripIds.forEach((tripId) => {
      const stops = tripStops[tripId];
      if (stops && stops.length > bestStops.length) {
        bestTrip = tripId;
        bestStops = stops;
      }
    });

    if (!bestTrip) return;

    // Sort by stop_sequence
    const orderedStops = bestStops
      .sort((a, b) => a.seq - b.seq)
      .map((s) => s.stop_id);

    // --- LOOP HANDLING ---
    // If first and last stops are the same, remove the last to avoid duplication
    let isLoop = false;
    if (
      orderedStops.length >= 2 &&
      orderedStops[0] === orderedStops[orderedStops.length - 1]
    ) {
      orderedStops.pop();
      isLoop = true;
    }

    // Final normalized route
    const meta = routeMeta[route_id] || {};

    routesMap[route_id] = {
      route_id,
      operator: meta.agency_id || "rapid_bus",
      mode: "bus",
      route_short_name: meta.route_short_name || null,
      route_long_name: meta.route_long_name || null,
      route_public_name: meta.route_public_name || route_id,
      isLoop,
      route_color: meta.route_color,
      isFeeder: !meta.route_color,
      stops: orderedStops.map((stop_id, idx) => ({
        stop_id,
        seq: idx + 1,
      })),
    };
  });
});

const routesArray = Object.values(routesMap);
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(routesArray, null, 2));

console.log(`Normalized ${routesArray.length} bus routes`);
console.log(`Output saved to ${OUTPUT_FILE}`);
