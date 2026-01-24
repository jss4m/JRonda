// normalize-bus.js
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

// Paths
const RAW_GTFS_DIR = path.join(__dirname, "../raw-GTFS");
const OUTPUT_DIR = path.join(__dirname, "../normalized");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "bus_stops.json");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// GTFS ZIP files for buses
const busZips = [
  "gtfs_rapid_bus_kl.zip",
  "gtfs_rapid_bus_mrtfeeder.zip",
];

const { parse } = require("csv-parse/sync");

function parseCSV(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true
  });
}

// Main normalization
let canonicalStops = {};
busZips.forEach(zipFile => {
  const zipPath = path.join(RAW_GTFS_DIR, zipFile);
  if (!fs.existsSync(zipPath)) {
    console.warn(`ZIP file not found: ${zipFile}, skipping`);
    return;
  }

  const zip = new AdmZip(zipPath);
  const stopsEntry = zip.getEntry("stops.txt");
  if (!stopsEntry) {
    console.warn(`stops.txt not found in ${zipFile}, skipping`);
    return;
  }

  const stopsCSV = stopsEntry.getData().toString("utf8");
  const stops = parseCSV(stopsCSV);

  stops.forEach(s => {
    // Detect field format
    const stop_id = s.stop_id || s.stop_code;
    const stop_name = s.stop_name;
    const stop_lat = parseFloat(s.stop_lat);
    const stop_lon = parseFloat(s.stop_lon);

    if (!stop_id || !stop_name || isNaN(stop_lat) || isNaN(stop_lon)) {
      console.warn(`Skipping invalid stop in ${zipFile}:`, s);
      return;
    }

    // Avoid duplicates by stop_id
    if (!canonicalStops[stop_id]) {
      canonicalStops[stop_id] = {
        stop_id,
        stop_name,
        stop_lat,
        stop_lon,
        mode: "bus",
        operator: "rapid_bus"
      };
    }
  });
});

// Convert to array
const stopsArray = Object.values(canonicalStops);
console.log(`Normalized ${stopsArray.length} bus stops`);

// Write output
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stopsArray, null, 2));
console.log(`Output saved to ${OUTPUT_FILE}`);
