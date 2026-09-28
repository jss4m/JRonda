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
const { z } = require("zod");

// Schema definitions
const RailStopSchema = z.object({
  stop_id: z.string().min(1),
  source_stop_id: z.string().min(1),
  stop_name: z.string().min(1),
  stop_lat: z.number(),
  stop_lon: z.number(),
  category: z.string().optional(),
  route_id: z.string().min(1),
  route_color: z.string().nullable(),
  route_short_name: z.string().nullable(),
  route_long_name: z.string().nullable(),
  route_public_name: z.string().min(1),
  seq: z.number().int().positive(),
  isLoop: z.boolean(),
  isOKU: z.boolean(),
  status: z.string(),
});

const RailRouteSchema = z.object({
  route_id: z.string().min(1),
  mode: z.literal("rail"),
  category: z.string().min(1),
  route_color: z.string().nullable(),
  route_short_name: z.string().nullable(),
  route_long_name: z.string().nullable(),
  route_public_name: z.string().min(1),
  operator: z.string().min(1),
  isLoop: z.boolean(),
  stops: z.array(z.object({stop_id:z.string().min(1), seq:z.number().int().positive()})),
});

const RAW_GTFS_DIR = path.join(__dirname, "../raw-GTFS");
const OUTPUT_DIR = path.join(__dirname, "../normalized");
const STOPS_OUTPUT = path.join(OUTPUT_DIR, "rail_stops.json");
const ROUTES_OUTPUT = path.join(OUTPUT_DIR, "rail_routes.json");
const TIMETABLE_OUTPUT = path.join(OUTPUT_DIR, "rail_timetables.json");
const VALIDATION_OUTPUT = path.join(OUTPUT_DIR, "rail_validation.json");
const LEGACY_STATIONS_FILE = path.join(__dirname, "../../data/rail/stations_legacy.js");
const LEGACY_TO_CANONICAL_ROUTE = {
  KTM1: "KA15_KD19",
  KTM2: "KC05_KB18",
};

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

function loadExportedArray(filePath, exportName) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, "utf8");
  const marker = new RegExp(`export\\s+const\\s+${exportName}\\s*=`, "m");
  if (!marker.test(src)) return [];
  const transformed = src.replace(marker, `const ${exportName} =`);
  try {
    const fn = new Function(`${transformed}\nreturn ${exportName};`);
    const data = fn();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function inferSourceStopId(stop) {
  const explicit = String(stop?.source_stop_id || "").trim();
  if (explicit) return explicit;
  const stopId = String(stop?.stop_id || "").trim();
  const routeId = String(stop?.route_id || "").trim();
  if (!stopId) return "";
  const routePrefix = routeId ? `${routeId}_` : "";
  if (routePrefix && stopId.startsWith(routePrefix)) {
    const rest = stopId.slice(routePrefix.length).trim();
    if (rest) return rest;
  }
  const sep = stopId.indexOf("_");
  if (sep > 0 && sep < stopId.length - 1) return stopId.slice(sep + 1);
  return stopId;
}

function buildLegacyRouteStopOrder() {
  const legacy = loadExportedArray(LEGACY_STATIONS_FILE, "stations");
  const byRoute = new Map();
  for (const stop of legacy) {
    const rawRoute = String(stop?.route_id || "").trim();
    const routeId = LEGACY_TO_CANONICAL_ROUTE[rawRoute] || rawRoute;
    const sourceId = inferSourceStopId(stop);
    if (!routeId || !sourceId) continue;
    if (!byRoute.has(routeId)) byRoute.set(routeId, []);
    const list = byRoute.get(routeId);
    if (!list.includes(sourceId)) list.push(sourceId);
  }
  return byRoute;
}

function buildLegacyDirectionScore(stopIds, legacyIndex) {
  let matches = 0;
  let increasing = 0;
  let prev = null;
  for (const stopId of stopIds) {
    const idx = legacyIndex.get(String(stopId));
    if (idx == null) continue;
    matches += 1;
    if (prev != null && idx > prev) increasing += 1;
    prev = idx;
  }
  return (matches * 1000) + increasing;
}

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

function inferRailCategory(route, zipName) {
  const zip = String(zipName || "").toLowerCase();
  if (zip.includes("ktmb")) return "KTM";
  const routeId = String(route.route_id || "").toUpperCase();
  const shortName = String(route.route_short_name || "").toUpperCase();
  const longName = String(route.route_long_name || "").toUpperCase();

  if (routeId === "BRT" || shortName === "BRT" || longName.includes("BRT")) return "BRT";
  if (routeId.startsWith("ERL") || shortName.includes("ERL") || longName.includes("KLIA")) return "ERL";
  if (routeId.startsWith("MR") || shortName.includes("MRL") || longName.includes("MONORAIL")) return "MRL";
  if (shortName.includes("MRT") || longName.includes("MRT") || routeId === "KGL" || routeId === "PYL") return "MRT";
  if (shortName.includes("LRT") || longName.includes("LRT") || ["AG", "KJ", "PH", "SP"].includes(routeId)) {
    return "LRT";
  }
  return "RAIL";
}

function normalizeRail() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const RAIL_ZIPS = ["gtfs_rapid_rail_kl.zip", "gtfs_ktmb.zip"];
  const normalizedRoutes = {};
  const normalizedStops = {};
  const legacyRouteStopOrder = buildLegacyRouteStopOrder();
  const timetableSets = {};
  const validation = {
    generated_at: new Date().toISOString(),
    routes: [],
  };

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
      const tripCandidates = [];
      for (const tripId of tripIds) {
        const seqStops = tripStops[tripId] || [];
        if (!seqStops.length) continue;
        const ordered = seqStops
          .slice()
          .sort((a, b) => a.seq - b.seq);
        let candidateLoop = false;
        if (ordered.length > 1 && ordered[0].stop_id === ordered[ordered.length - 1].stop_id) {
          ordered.pop();
          candidateLoop = true;
        }
        const stopIds = [];
        const seenConsecutive = new Set();
        for (const item of ordered) {
          const stopId = String(item.stop_id || "");
          if (!stopId) continue;
          const dedupeKey = `${stopIds[stopIds.length - 1] || ""}=>${stopId}`;
          if (seenConsecutive.has(dedupeKey)) continue;
          seenConsecutive.add(dedupeKey);
          if (stopIds[stopIds.length - 1] !== stopId) stopIds.push(stopId);
        }
        if (!stopIds.length) continue;
        tripCandidates.push({
          tripId: String(tripId),
          stopIds,
          isLoop: candidateLoop,
          length: stopIds.length,
        });
      }

      if (!tripCandidates.length) continue;
      const legacyStops = legacyRouteStopOrder.get(String(routeId)) || [];
      const legacyIndex = new Map(legacyStops.map((sid, idx) => [String(sid), idx]));
      // Canonical direction: prefer best alignment against legacy route ordering when available,
      // fallback to most complete trip otherwise.
      tripCandidates.sort((a, b) => {
        const aScore = legacyIndex.size ? buildLegacyDirectionScore(a.stopIds, legacyIndex) : 0;
        const bScore = legacyIndex.size ? buildLegacyDirectionScore(b.stopIds, legacyIndex) : 0;
        if (bScore !== aScore) return bScore - aScore;
        if (b.length !== a.length) return b.length - a.length;
        return a.tripId.localeCompare(b.tripId);
      });
      const canonical = tripCandidates[0];
      const finalStops = canonical.stopIds.slice();
      const isLoop = canonical.isLoop;

      const meta = routeMeta[routeId] || {
        route_id: routeId,
        route_color: null,
        route_short_name: null,
        route_long_name: null,
        route_public_name: routeId,
        category: "RAIL",
        agency_id: null,
      };

      const routeObj = {
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

      try {
        RailRouteSchema.parse(routeObj);
        normalizedRoutes[routeId] = routeObj;
      } catch (schemaErr) {
        console.warn(`Skipping invalid route ${routeId} (schema):`, schemaErr.errors || schemaErr.message);
        continue;
      }

      const missingStopRecords = [];
      const invalidCoordStops = [];
      for (let i = 0; i < finalStops.length; i++) {
        const stopId = finalStops[i];
        const rawStop = stopLookup[stopId];
        if (!rawStop) {
          missingStopRecords.push(stopId);
          continue;
        }

        const lat = Number(rawStop.stop_lat);
        const lon = Number(rawStop.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          invalidCoordStops.push(stopId);
          continue;
        }

        const uniqueStopId = `${routeId}_${stopId}`;
        const stopObj = {
          stop_id: uniqueStopId,
          source_stop_id: stopId,
          stop_name: String(rawStop.stop_name || stopId),
          stop_lat: lat,
          stop_lon: lon,
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

        try {
          RailStopSchema.parse(stopObj);
          normalizedStops[uniqueStopId] = stopObj;
        } catch (stopSchemaErr) {
          console.warn(`Skipping invalid stop ${uniqueStopId} (schema):`, stopSchemaErr.errors || stopSchemaErr.message);
        }
      }

      validation.routes.push({
        route_id: routeId,
        selected_trip_id: canonical.tripId,
        trip_stop_count: finalStops.length,
        missing_stop_records: missingStopRecords,
        invalid_coord_stops: invalidCoordStops,
      });
    }
  }

  const routesArray = Object.values(normalizedRoutes);
  const stopsArray = Object.values(normalizedStops).filter((s) => Number.isFinite(s.stop_lat) && Number.isFinite(s.stop_lon));

  fs.writeFileSync(ROUTES_OUTPUT, JSON.stringify(routesArray, null, 2));
  fs.writeFileSync(STOPS_OUTPUT, JSON.stringify(stopsArray, null, 2));
  fs.writeFileSync(VALIDATION_OUTPUT, JSON.stringify(validation, null, 2));

  const normalizedTimetables = {};
  for (const [routeId, stops] of Object.entries(timetableSets)) {
    normalizedTimetables[routeId] = {};
    for (const [stopId, table] of Object.entries(stops)) {
      const toSorted = (set) =>
        Array.from(set || []).sort((a, b) => (gtfsTimeToMinutes(a) ?? 0) - (gtfsTimeToMinutes(b) ?? 0));
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
  console.log(`Wrote rail validation report -> ${VALIDATION_OUTPUT}`);
}

if (require.main === module) {
  normalizeRail();
}

module.exports = { normalizeRail, RailRouteSchema, RailStopSchema };
