const fs = require("fs");
const path = require("path");

const inputFile = path.join(__dirname, "../../data/poi/POI.txt");
const outputFile = path.join(__dirname, "../../data/poi/poi.js");

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePoiText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  let currentSection = "POI";
  let current = null;

  function flush() {
    if (!current) return;
    if (
      current.name &&
      Number.isFinite(current.longitude) &&
      Number.isFinite(current.latitude)
    ) {
      current.id = toSlug(current.name);
      items.push(current);
    }
    current = null;
  }

  for (const line of lines) {
    if (line === "POI") continue;
    if (!line.includes(":")) {
      flush();
      currentSection = line;
      continue;
    }

    const idx = line.indexOf(":");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    if (key === "Name") {
      flush();
      current = {
        id: "",
        section: currentSection,
        name: value,
        category: "",
        longitude: null,
        latitude: null,
      };
      continue;
    }

    if (!current) continue;
    if (key === "Category") current.category = value;
    if (key === "Longitude") current.longitude = Number(value);
    if (key === "Latitude") current.latitude = Number(value);
  }

  flush();
  return items;
}

if (!fs.existsSync(inputFile)) {
  throw new Error(`Missing ${inputFile}`);
}

const raw = fs.readFileSync(inputFile, "utf8");
const pois = parsePoiText(raw);

let js = "export const poi = [\n";
for (const p of pois) {
  js +=
`  {
    id: ${JSON.stringify(p.id)},
    section: ${JSON.stringify(p.section)},
    name: ${JSON.stringify(p.name)},
    category: ${JSON.stringify(p.category)},
    longitude: ${Number(p.longitude)},
    latitude: ${Number(p.latitude)}
  },\n`;
}
js += "];\n";

fs.writeFileSync(outputFile, js, "utf8");
console.log(`Generated ${outputFile} with ${pois.length} POIs`);
