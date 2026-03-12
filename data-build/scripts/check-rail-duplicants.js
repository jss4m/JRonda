const fs = require("fs");
const path = require("path");

const railFile = path.join(__dirname, "../../data/rail/rail.js");
const stationsFile = path.join(__dirname, "../../data/rail/stations.js");
const normalizedOut = path.join(__dirname, "../normalized/rail_duplicants.json");

function loadRailArray(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }
  const src = fs.readFileSync(filePath, "utf-8");
  const marker = /export\s+const\s+rail\s*=/m;
  if (!marker.test(src)) {
    throw new Error(`Could not find 'export const rail =' in ${filePath}`);
  }
  const transformed = src.replace(marker, "const rail =");
  const fn = new Function(`${transformed}\nreturn rail;`);
  const out = fn();
  if (!Array.isArray(out)) {
    throw new Error(`Parsed rail export is not an array in ${filePath}`);
  }
  return out;
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

function writeIntoStations(stationsPath, duplicants) {
  if (!fs.existsSync(stationsPath)) {
    throw new Error(`Missing ${stationsPath}`);
  }
  const src = fs.readFileSync(stationsPath, "utf-8");
  const payload = `export const duplicants = ${JSON.stringify(duplicants, null, 2)};\n`;
  const token = "export const duplicants =";
  let next;
  if (src.includes(token)) {
    next = src.replace(/export const duplicants =[\s\S]*?;\s*$/m, payload);
  } else {
    next = `${src.trimEnd()}\n\n${payload}`;
  }
  fs.writeFileSync(stationsPath, next, "utf-8");
}

function main() {
  const rail = loadRailArray(railFile);
  const duplicants = buildDuplicants(rail);
  writeIntoStations(stationsFile, duplicants);
  fs.writeFileSync(normalizedOut, JSON.stringify(duplicants, null, 2), "utf-8");

  const recordCount = duplicants.reduce((sum, g) => sum + (g.records?.length || 0), 0);
  console.log(`Duplicants updated: ${duplicants.length} groups, ${recordCount} records`);
  console.log(`- stations: ${stationsFile}`);
  console.log(`- json: ${normalizedOut}`);
}

main();
