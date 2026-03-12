const fs = require("fs");
const path = require("path");

const normalizedDir = path.join(__dirname, "../normalized");
const outputDir = path.join(__dirname, "../../data/rail");

const railStopsFile = path.join(normalizedDir, "rail_stops.json");
const railTimetableFile = path.join(normalizedDir, "rail_timetables.json");
const outputFile = path.join(outputDir, "rail.js");
const timetableOutputFile = path.join(outputDir, "timetables.js");
const stationsFile = path.join(outputDir, "stations.js");
const legacyStationsFile = path.join(outputDir, "stations_legacy.js");
const duplicantsOutputFile = path.join(normalizedDir, "rail_duplicants.json");

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
if (!fs.existsSync(railStopsFile)) {
  throw new Error(`Missing ${railStopsFile}. Run normalize-rail.js first.`);
}

const stopsArray = JSON.parse(fs.readFileSync(railStopsFile, "utf-8"));

let js = "export const rail = [\n";
for (const stop of stopsArray) {
  js +=
`  {
    stop_id: ${JSON.stringify(stop.stop_id)},
    source_stop_id: ${JSON.stringify(stop.source_stop_id || null)},
    stop_name: ${JSON.stringify(stop.stop_name)},
    stop_lat: ${Number(stop.stop_lat)},
    stop_lon: ${Number(stop.stop_lon)},
    category: ${JSON.stringify(stop.category || "RAIL")},
    route_id: ${JSON.stringify(stop.route_id)},
    route_color: ${stop.route_color ? JSON.stringify(stop.route_color) : "null"},
    route_short_name: ${stop.route_short_name ? JSON.stringify(stop.route_short_name) : "null"},
    route_long_name: ${stop.route_long_name ? JSON.stringify(stop.route_long_name) : "null"},
    route_public_name: ${stop.route_public_name ? JSON.stringify(stop.route_public_name) : "null"},
    seq: ${Number(stop.seq || 0)},
    isLoop: ${Boolean(stop.isLoop)},
    isOKU: ${stop.isOKU !== false},
    status: ${JSON.stringify(stop.status || "valid")}
  },\n`;
}
js += "];\n";

fs.writeFileSync(outputFile, js, "utf-8");
console.log(`Generated ${outputFile} with ${stopsArray.length} records`);

let timetableMap = {};
if (fs.existsSync(railTimetableFile)) {
  timetableMap = JSON.parse(fs.readFileSync(railTimetableFile, "utf-8"));
}
const timetableJs = `export const railTimetables = ${JSON.stringify(timetableMap, null, 2)};\n`;
fs.writeFileSync(timetableOutputFile, timetableJs, "utf-8");
console.log(`Generated ${timetableOutputFile}`);

function loadExportedArray(filePath, exportName) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, "utf-8");
  const marker = new RegExp(`export\\s+const\\s+${exportName}\\s*=`, "m");
  if (!marker.test(src)) return [];
  const transformed = src.replace(marker, `const ${exportName} =`);
  const fn = new Function(`${transformed}\nreturn ${exportName};`);
  const data = fn();
  return Array.isArray(data) ? data : [];
}

function coordKey(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  return `${la.toFixed(6)}|${lo.toFixed(6)}`;
}

function buildDuplicants(stops) {
  const byCoord = new Map();
  for (const s of stops) {
    const lat = Number(s.stop_lat);
    const lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${lat}|${lon}`;
    if (!byCoord.has(key)) byCoord.set(key, []);
    byCoord.get(key).push(s);
  }

  const out = [];
  for (const list of byCoord.values()) {
    const names = Array.from(
      new Set(list.map((s) => String(s.stop_name || "").trim()).filter(Boolean))
    );
    if (names.length < 2) continue;
    out.push({
      stop_lat: Number(list[0].stop_lat),
      stop_lon: Number(list[0].stop_lon),
      stop_names: names,
      records: list.map((s) => ({
        stop_id: String(s.stop_id || ""),
        source_stop_id: s.source_stop_id ? String(s.source_stop_id) : null,
        stop_name: String(s.stop_name || ""),
        route_id: String(s.route_id || ""),
        category: String(s.category || ""),
      })),
    });
  }
  out.sort((a, b) => a.stop_lat - b.stop_lat || a.stop_lon - b.stop_lon);
  return out;
}

const railCoordSet = new Set(
  stopsArray.map((s) => coordKey(s.stop_lat, s.stop_lon))
);

const legacyStations = loadExportedArray(legacyStationsFile, "stations");
const fallbackStations = legacyStations
  .filter((s) => Number.isFinite(Number(s.stop_lat)) && Number.isFinite(Number(s.stop_lon)))
  .filter((s) => !railCoordSet.has(coordKey(s.stop_lat, s.stop_lon)))
  .map((s) => ({
    stop_id: String(s.stop_id || ""),
    source_stop_id: s.source_stop_id ? String(s.source_stop_id) : null,
    stop_name: String(s.stop_name || s.stop_id || ""),
    stop_lat: Number(s.stop_lat),
    stop_lon: Number(s.stop_lon),
    category: String(s.category || "RAIL"),
    route_id: String(s.route_id || ""),
    route_color: s.route_color ? String(s.route_color) : null,
    route_short_name: s.route_short_name ? String(s.route_short_name) : null,
    route_long_name: s.route_long_name ? String(s.route_long_name) : null,
    route_public_name: s.route_public_name ? String(s.route_public_name) : null,
    seq: Number(s.seq || 0),
    isLoop: Boolean(s.isLoop),
    isOKU: s.isOKU !== false,
    status: String(s.status || "valid"),
    search: s.search ? String(s.search) : null,
    isInterchange: Boolean(s.isInterchange),
    isConnecting: Boolean(s.isConnecting),
  }));

let fallbackJs = "export const stations = [\n";
for (const stop of fallbackStations) {
  fallbackJs +=
`  {
    stop_id: ${JSON.stringify(stop.stop_id)},
    source_stop_id: ${JSON.stringify(stop.source_stop_id)},
    stop_name: ${JSON.stringify(stop.stop_name)},
    stop_lat: ${Number(stop.stop_lat)},
    stop_lon: ${Number(stop.stop_lon)},
    category: ${JSON.stringify(stop.category)},
    route_id: ${JSON.stringify(stop.route_id)},
    route_color: ${stop.route_color ? JSON.stringify(stop.route_color) : "null"},
    route_short_name: ${stop.route_short_name ? JSON.stringify(stop.route_short_name) : "null"},
    route_long_name: ${stop.route_long_name ? JSON.stringify(stop.route_long_name) : "null"},
    route_public_name: ${stop.route_public_name ? JSON.stringify(stop.route_public_name) : "null"},
    seq: ${Number(stop.seq || 0)},
    isLoop: ${Boolean(stop.isLoop)},
    isOKU: ${stop.isOKU !== false},
    status: ${JSON.stringify(stop.status || "valid")},
    search: ${stop.search ? JSON.stringify(stop.search) : "null"},
    isInterchange: ${Boolean(stop.isInterchange)},
    isConnecting: ${Boolean(stop.isConnecting)}
  },\n`;
}
fallbackJs += "];\n";
const duplicants = buildDuplicants(stopsArray);
fallbackJs += `\nexport const duplicants = ${JSON.stringify(duplicants, null, 2)};\n`;
fs.writeFileSync(stationsFile, fallbackJs, "utf-8");
console.log(`Generated fallback ${stationsFile} with ${fallbackStations.length} records`);
fs.writeFileSync(duplicantsOutputFile, JSON.stringify(duplicants, null, 2), "utf-8");
console.log(`Detected ${duplicants.length} coordinate-duplicate groups -> ${duplicantsOutputFile}`);
