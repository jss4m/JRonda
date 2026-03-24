import fs from "fs";
import path from "path";
import Module from "module";

const [, , scriptArg, exportFnArg] = process.argv;
if (!scriptArg) {
  console.error("Usage: node data-build/scripts/run-cjs.mjs <scriptPath> [exportFunctionName]");
  process.exit(1);
}

const filename = path.resolve(process.cwd(), scriptArg);
const code = fs.readFileSync(filename, "utf8");
const mod = new Module(filename);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(code, filename);

if (exportFnArg) {
  const fn = mod.exports?.[exportFnArg];
  if (typeof fn !== "function") {
    console.error(`Export function "${exportFnArg}" not found in ${scriptArg}`);
    process.exit(1);
  }
  await fn();
}
