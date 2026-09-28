const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// -------- paths --------
const INPUT_FILE = path.join(__dirname, "../../data/gokl/goKL-list.txt");
const OUTPUT_FILE = path.join(__dirname, "../../data/gokl/goKL.js");

// -------- read + parse CSV --------
const csvText = fs.readFileSync(INPUT_FILE, "utf-8");

const records = parse(csvText, {
  columns: true,
  skip_empty_lines: true,
  trim: true
});

// -------- helpers --------
function toBool(v) {
  if (v === undefined || v === null) return false;
  return v.toString().toLowerCase() === "true";
}

// -------- build JS --------
let js = "export const goKL = [\n";

for (const r of records) {
  js += `  {\n`;
  js += `    stop_id: "${r.stop_id}",\n`;
  js += `    stop_name: "${r.stop_name}",\n`;
  js += `    stop_lat: ${Number(r.stop_lat)},\n`;
  js += `    stop_lon: ${Number(r.stop_lon)},\n`;
  js += `    category: "${r.category}",\n`;
  js += `    route_id: "${r.route_id}",\n`;
  js += `    isOKU: ${toBool(r.isOKU)},\n`;
  js += `    status: "${r.status}",\n`;
  js += `    search: "${r.search}",\n`;
  js += `    isConnecting: ${toBool(r.isConnecting)},\n`;
  js += `    isLoop: ${toBool(r.isLoop)}\n`;
  js += `  },\n`;
}

js += "];\n";

// -------- write --------
fs.writeFileSync(OUTPUT_FILE, js, "utf-8");
console.log(`Generated ${OUTPUT_FILE}`);
console.log(`Stops: ${records.length}`);
