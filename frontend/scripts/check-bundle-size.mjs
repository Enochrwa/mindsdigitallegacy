// Fails the build when the production bundle grows past perf-budget.json.
// Usage: bun run build && bun run budget
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("../.output/public", import.meta.url).pathname;
const budget = JSON.parse(readFileSync(new URL("../perf-budget.json", import.meta.url), "utf8"));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(ROOT).filter((f) => f.endsWith(".js") || f.endsWith(".css"));
} catch {
  console.error("No build found. Run `bun run build` first.");
  process.exit(2);
}
if (files.length === 0) {
  console.error("Build output has no JS or CSS files; refusing to pass an empty check.");
  process.exit(2);
}

const sized = files
  .map((f) => ({
    name: relative(ROOT, f),
    kb: gzipSync(readFileSync(f), { level: 6 }).length / 1024,
  }))
  .sort((a, b) => b.kb - a.kb);
const js = sized.filter((f) => f.name.endsWith(".js"));
const css = sized.filter((f) => f.name.endsWith(".css"));
const total = sized.reduce((n, f) => n + f.kb, 0);

const checks = [
  ["largest JS chunk", js[0]?.kb ?? 0, budget.maxJsChunkKb, js[0]?.name],
  ["largest CSS file", css[0]?.kb ?? 0, budget.maxCssKb, css[0]?.name],
  ["total JS + CSS", total, budget.maxTotalKb, `${sized.length} files`],
];

let failed = false;
for (const [label, value, limit, detail] of checks) {
  const ok = value <= limit;
  failed ||= !ok;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}: ${value.toFixed(1)} KB gz (limit ${limit}) ${detail ?? ""}`,
  );
}
if (failed) {
  console.error(
    "\nBundle budget exceeded. Check what grew (a new dependency, a missing lazy import).",
  );
  process.exit(1);
}
