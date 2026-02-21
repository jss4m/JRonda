/**
 * update-gtfs.js
 *
 * Downloads latest GTFS static ZIP files and rebuilds normalized outputs.
 * Safe for offline kiosks: failed downloads keep existing files unchanged.
 *
 * Usage:
 *   node data-build/scripts/update-gtfs.js
 *   node data-build/scripts/update-gtfs.js --watch --interval-min=60
 *   node data-build/scripts/update-gtfs.js --force-build
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { execFileSync } = require("child_process");

const RAW_GTFS_DIR = path.join(__dirname, "../raw-GTFS");
const SCRIPT_DIR = __dirname;

const SOURCES = [
  {
    name: "ktmb",
    url: "https://api.data.gov.my/gtfs-static/ktmb",
    output: path.join(RAW_GTFS_DIR, "gtfs_ktmb.zip"),
  },
  {
    name: "rapid-bus-kl",
    url: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl",
    output: path.join(RAW_GTFS_DIR, "gtfs_rapid_bus_kl.zip"),
  },
  {
    name: "rapid-bus-mrtfeeder",
    url: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder",
    output: path.join(RAW_GTFS_DIR, "gtfs_rapid_bus_mrtfeeder.zip"),
  },
  {
    name: "rapid-rail-kl",
    url: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl",
    output: path.join(RAW_GTFS_DIR, "gtfs_rapid_rail_kl.zip"),
  },
];

function parseArgs(argv) {
  const args = {
    watch: false,
    intervalMin: 60,
    forceBuild: false,
  };
  for (const token of argv) {
    if (token === "--watch") args.watch = true;
    else if (token === "--force-build") args.forceBuild = true;
    else if (token.startsWith("--interval-min=")) {
      const n = Number(token.split("=")[1]);
      if (Number.isFinite(n) && n > 0) args.intervalMin = n;
    }
  }
  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function fileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function downloadWithRedirects(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Too many redirects"));
      return;
    }

    const req = https.get(url, { timeout: 20000 }, (res) => {
      const status = Number(res.statusCode || 0);
      if (status >= 300 && status < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        resolve(downloadWithRedirects(nextUrl, redirectCount + 1));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`HTTP ${status} for ${url}`));
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });

    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });
    req.on("error", reject);
  });
}

async function updateOne(source) {
  const tmpPath = `${source.output}.tmp`;
  const prevHash = fileSha256(source.output);

  const data = await downloadWithRedirects(source.url);
  fs.writeFileSync(tmpPath, data);
  const nextHash = fileSha256(tmpPath);

  if (prevHash && nextHash && prevHash === nextHash) {
    fs.unlinkSync(tmpPath);
    return { changed: false, source: source.name };
  }

  fs.renameSync(tmpPath, source.output);
  return { changed: true, source: source.name };
}

function runBuilder(scriptName) {
  const nodeExe = process.execPath;
  const scriptPath = path.join(SCRIPT_DIR, scriptName);
  execFileSync(nodeExe, [scriptPath], { stdio: "inherit" });
}

function rebuildAll() {
  runBuilder("normalize-bus.js");
  runBuilder("normalize-bus-routes.js");
  runBuilder("bus_json-to-js.js");
  runBuilder("normalize-rail.js");
  runBuilder("rail_json-to-js.js");
  runBuilder("poi_txt-to-js.js");
}

async function runCycle(args) {
  ensureDir(RAW_GTFS_DIR);
  let changedAny = false;

  for (const source of SOURCES) {
    try {
      const result = await updateOne(source);
      if (result.changed) {
        changedAny = true;
        console.log(`[update-gtfs] updated: ${source.name}`);
      } else {
        console.log(`[update-gtfs] unchanged: ${source.name}`);
      }
    } catch (err) {
      console.warn(`[update-gtfs] failed: ${source.name} (${err.message})`);
    }
  }

  if (changedAny || args.forceBuild) {
    console.log("[update-gtfs] rebuilding normalized outputs...");
    rebuildAll();
    console.log("[update-gtfs] rebuild complete.");
  } else {
    console.log("[update-gtfs] no GTFS changes detected.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await runCycle(args);

  if (!args.watch) return;

  const intervalMs = args.intervalMin * 60 * 1000;
  console.log(`[update-gtfs] watch mode active (${args.intervalMin} min interval).`);

  setInterval(() => {
    runCycle(args).catch((err) => {
      console.warn(`[update-gtfs] cycle error: ${err.message}`);
    });
  }, intervalMs);
}

main().catch((err) => {
  console.error(`[update-gtfs] fatal: ${err.message}`);
  process.exitCode = 1;
});
