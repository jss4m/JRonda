/**
 * normalize-rail.js
 *
 * Builds canonical rail stops/routes from rail GTFS ZIP files.
 * One representative trip per route_id (most complete stop sequence).
 *
 * Inputs: data-build/raw-GTFS/gtfs_rapid_rail_kl.zip, gtfs_ktmb.zip
 * Outputs:
 * - data-build/normalized/rail_stops.json
 * - data-build/normalized/rail_routes.json
 */

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { parse } = require("csv-parse/sync");

const RAW_GTFS_DIR = path.join(__dirname, "../raw-GTFS");
const OUTPUT_DIR = path.join(__dirname, "../normalized");
const STOPS_OUTPUT = path.join(OUTPUT_DIR, "rail_stops.json");
const ROUTES_OUTPUT = path.join(OUTPUT_DIR, "rail_routes.json");
const TIMETABLE_OUTPUT = path.join(OUTPUT_DIR, "rail_timetables.json");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const RAIL_ZIPS = ["gtfs_rapid_rail_kl.zip", "gtfs_ktmb.zip"];

function parseCSV(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });
}

function inferRailCategory(route, sourceName = "") {
  const source = String(sourceName || "").toLowerCase();
  if (source.includes("ktmb")) return "KTM";
  const shortName = String(route.route_short_name || "").toUpperCase();
  const longName = String(route.route_long_name || "").toUpperCase();
  const text = `${shortName} ${longName}`;
  if (text.includes("MRT")) return "MRT";
  if (text.includes("LRT")) return "LRT";
  if (text.includes("BRT")) return "BRT";
  if (text.includes("MONORAIL")) return "MRL";
  if (text.includes("INTERCITY")) return "INTERCITY";
}

function pickPublicRouteName(route) {
  const shortName = String(route.route_short_name || "").trim();
  const longName = String(route.route_long_name || "").trim();
  if (shortName) return shortName;
  if (longName) return longName;
  return String(route.route_id || "").trim();
}

const normalizedRoutes = {};
const normalizedStops = {};
const timetableSets = {};

function gtfsTimeToMinutes(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function toHHMM(value) {
  const mins = gtfsTimeToMinutes(value);
  if (mins == null) return null;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function ensureTimetableBucket(routeId, stopId) {
  if (!timetableSets[routeId]) timetableSets[routeId] = {};
  if (!timetableSets[routeId][stopId]) {
    timetableSets[routeId][stopId] = {
      weekday: new Set(),
      saturday: new Set(),
      sunday: new Set(),
    };
  }
  return timetableSets[routeId][stopId];
}

for (const zipName of RAIL_ZIPS) {
  const zipPath = path.join(RAW_GTFS_DIR, zipName);
  if (!fs.existsSync(zipPath)) continue;

  const zip = new AdmZip(zipPath);
  const entries = {
    routes: zip.getEntry("routes.txt"),
    trips: zip.getEntry("trips.txt"),
    stopTimes: zip.getEntry("stop_times.txt"),
    stops: zip.getEntry("stops.txt"),
    calendar: zip.getEntry("calendar.txt"),
  };
  if (!entries.routes || !entries.trips || !entries.stopTimes || !entries.stops) continue;

  const routes = parseCSV(entries.routes.getData().toString("utf8"));
  const trips = parseCSV(entries.trips.getData().toString("utf8"));
  const stopTimes = parseCSV(entries.stopTimes.getData().toString("utf8"));
  const stops = parseCSV(entries.stops.getData().toString("utf8"));
  const calendar = entries.calendar
    ? parseCSV(entries.calendar.getData().toString("utf8"))
    : [];

  const serviceDays = {};
  for (const c of calendar) {
    const sid = String(c.service_id || "");
    if (!sid) continue;
    const days = new Set();
    const hasWeekday =
      String(c.monday) === "1" ||
      String(c.tuesday) === "1" ||
      String(c.wednesday) === "1" ||
      String(c.thursday) === "1" ||
      String(c.friday) === "1";
    if (hasWeekday) days.add("weekday");
    if (String(c.saturday) === "1") days.add("saturday");
    if (String(c.sunday) === "1") days.add("sunday");
    if (!days.size) {
      days.add("weekday");
      days.add("saturday");
      days.add("sunday");
    }
    serviceDays[sid] = days;
  }

  const routeMeta = {};
  for (const r of routes) {
    routeMeta[r.route_id] = {
      route_id: String(r.route_id),
      route_color: r.route_color || null,
      route_short_name: r.route_short_name || null,
      route_long_name: r.route_long_name || null,
      route_public_name: pickPublicRouteName(r),
      category: inferRailCategory(r, zipName),
      agency_id: r.agency_id || null,
    };
  }

  const stopLookup = {};
  for (const s of stops) {
    stopLookup[s.stop_id] = s;
  }

  const routeTrips = {};
  const tripMeta = {};
  for (const t of trips) {
    if (!routeTrips[t.route_id]) routeTrips[t.route_id] = [];
    const tripId = String(t.trip_id);
    routeTrips[t.route_id].push(tripId);
    const sid = String(t.service_id || "");
    const days = serviceDays[sid] || new Set(["weekday", "saturday", "sunday"]);
    tripMeta[tripId] = {
      route_id: String(t.route_id),
      service_days: days,
    };
  }

  const tripStops = {};
  for (const st of stopTimes) {
    const tripId = String(st.trip_id);
    if (!tripStops[tripId]) tripStops[tripId] = [];
    tripStops[tripId].push({
      stop_id: String(st.stop_id),
      seq: Number(st.stop_sequence),
    });

    const meta = tripMeta[tripId];
    if (!meta) continue;
    const hhmm = toHHMM(st.departure_time || st.arrival_time);
    if (!hhmm) continue;
    const bucket = ensureTimetableBucket(meta.route_id, String(st.stop_id));
    for (const d of meta.service_days) {
      if (d === "weekday" || d === "saturday" || d === "sunday") {
        bucket[d].add(hhmm);
      }
    }
  }

  for (const [routeId, tripIds] of Object.entries(routeTrips)) {
    let bestStops = [];
    for (const tripId of tripIds) {
      const seqStops = tripStops[tripId] || [];
      if (seqStops.length > bestStops.length) bestStops = seqStops;
    }
    if (!bestStops.length) continue;

    const ordered = bestStops
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((x) => x.stop_id);

    const isLoop =
      ordered.length > 1 && ordered[0] === ordered[ordered.length - 1];
    const finalStops = isLoop ? ordered.slice(0, ordered.length - 1) : ordered;

    const meta = routeMeta[routeId] || {
      route_id: routeId,
      route_color: null,
      route_short_name: null,
      route_long_name: null,
      route_public_name: routeId,
      category: "RAIL",
      agency_id: null,
    };

    normalizedRoutes[routeId] = {
      route_id: routeId,
      mode: "rail",
      category: meta.category,
      route_color: meta.route_color,
      route_short_name: meta.route_short_name,
      route_long_name: meta.route_long_name,
      route_public_name: meta.route_public_name,
      operator: meta.agency_id || "rail",
      isLoop,
      stops: finalStops.map((stop_id, idx) => ({
        stop_id,
        seq: idx + 1,
      })),
    };

    for (let i = 0; i < finalStops.length; i++) {
      const stopId = finalStops[i];
      const rawStop = stopLookup[stopId];
      if (!rawStop) continue;

      const uniqueStopId = `${routeId}_${stopId}`;
      normalizedStops[uniqueStopId] = {
        stop_id: uniqueStopId,
        source_stop_id: stopId,
        stop_name: String(rawStop.stop_name || stopId),
        stop_lat: Number(rawStop.stop_lat),
        stop_lon: Number(rawStop.stop_lon),
        category: meta.category,
        route_id: routeId,
        route_color: meta.route_color,
        route_short_name: meta.route_short_name,
        route_long_name: meta.route_long_name,
        route_public_name: meta.route_public_name,
        seq: i + 1,
        isLoop,
        isOKU: true,
        status: "valid",
      };
    }
  }
}

const routesArray = Object.values(normalizedRoutes);
const stopsArray = Object.values(normalizedStops)
  .filter((s) => Number.isFinite(s.stop_lat) && Number.isFinite(s.stop_lon));

fs.writeFileSync(ROUTES_OUTPUT, JSON.stringify(routesArray, null, 2));
fs.writeFileSync(STOPS_OUTPUT, JSON.stringify(stopsArray, null, 2));

const normalizedTimetables = {};
for (const [routeId, stops] of Object.entries(timetableSets)) {
  normalizedTimetables[routeId] = {};
  for (const [stopId, table] of Object.entries(stops)) {
    const toSorted = (set) =>
      Array.from(set || [])
        .sort((a, b) => (gtfsTimeToMinutes(a) ?? 0) - (gtfsTimeToMinutes(b) ?? 0));
    normalizedTimetables[routeId][stopId] = {
      weekday: toSorted(table.weekday),
      saturday: toSorted(table.saturday),
      sunday: toSorted(table.sunday),
    };
  }
}
fs.writeFileSync(TIMETABLE_OUTPUT, JSON.stringify(normalizedTimetables, null, 2));

console.log(`Normalized ${routesArray.length} rail routes -> ${ROUTES_OUTPUT}`);
console.log(`Normalized ${stopsArray.length} rail stops -> ${STOPS_OUTPUT}`);
console.log(`Normalized rail timetable map -> ${TIMETABLE_OUTPUT}`);
