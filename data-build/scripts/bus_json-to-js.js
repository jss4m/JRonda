const fs = require("fs");
const path = require("path");

// paths
const normalizedDir = path.join(__dirname, "../normalized");
const outputDir = path.join(__dirname, "../../data/bus");

const busStopsFile = path.join(normalizedDir, "bus_stops.json");
const busRoutesFile = path.join(normalizedDir, "bus_routes.json");

const outputFile = path.join(outputDir, "rapidbus.js");

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// load data
const stopsArray = JSON.parse(fs.readFileSync(busStopsFile, "utf-8"));

const stopsIndex = {};
for (const stop of stopsArray) {
  stopsIndex[stop.stop_id] = stop;
}

const routesJSON = JSON.parse(fs.readFileSync(busRoutesFile, "utf-8"));

// build unified structure
let js = "export const rapidbus = [\n";

for (const route of routesJSON) {
  const {
    route_id,
    route_public_name = route_id,
    route_short_name = null,
    route_long_name = null,
    isLoop,
    route_color = null,
    stops
  } = route;

  if (!Array.isArray(stops) || stops.length === 0) continue;

  for (const s of stops) {
    const stop = stopsIndex[s.stop_id];
    if (!stop) continue;

    const uniqueStopId = `${route_id}_${s.stop_id}`;

    js +=
`  {
    stop_id: "${uniqueStopId}",
    stop_name: "${stop.stop_name}",
    stop_lat: ${stop.stop_lat},
    stop_lon: ${stop.stop_lon},
    category: "rapidbus",
    route_id: "${route_id}",
    route_public_name: ${JSON.stringify(route_public_name)},
    route_short_name: ${route_short_name ? JSON.stringify(route_short_name) : "null"},
    route_long_name: ${route_long_name ? JSON.stringify(route_long_name) : "null"},
    seq: ${s.seq},
    isLoop: ${isLoop},
    route_color: ${route_color ? `"${route_color}"` : "null"},
    isOKU: true,
    status: "valid"
  },\n`;
  }
}

js += "];\n";

fs.writeFileSync(outputFile, js, "utf-8");
console.log("STOPS INDEX SIZE:", Object.keys(stopsIndex).length);
console.log("ROUTES:", routesJSON.length);
console.log(`Generated ${outputFile}`);
