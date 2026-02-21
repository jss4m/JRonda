const fs = require("fs");
const path = require("path");

const normalizedDir = path.join(__dirname, "../normalized");
const outputDir = path.join(__dirname, "../../data/rail");

const railStopsFile = path.join(normalizedDir, "rail_stops.json");
const outputFile = path.join(outputDir, "rail.js");
const stationsFile = path.join(outputDir, "stations.js");
const legacyStationsFile = path.join(outputDir, "stations_legacy.js");

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
fs.writeFileSync(stationsFile, fallbackJs, "utf-8");
console.log(`Generated fallback ${stationsFile} with ${fallbackStations.length} records`);
