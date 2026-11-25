const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SHA_CHARS = 16;

const sha = (text) =>
  crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, SHA_CHARS);

function regionText(fileText, region) {
  const lines = fileText.split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes(region.startAnchor));
  if (start === -1) return null;
  let end = lines.length;
  if (region.endAnchor) {
    const e = lines.findIndex((l, i) => i > start && l.includes(region.endAnchor));
    if (e !== -1) end = e;
  } else {
    for (let i = start + 1; i < lines.length; i++) {
      if (/^function /.test(lines[i]) || /^export function /.test(lines[i])) { end = i; break; }
    }
  }
  return lines.slice(start, end).join("\n");
}

function load(root) {
  const registryPath = path.join(root, "agent-marks.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const cache = new Map();
  const readFile = (rel) => {
    if (!cache.has(rel)) {
      const abs = path.join(root, rel);
      cache.set(rel, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null);
    }
    return cache.get(rel);
  };
  return { registry, registryPath, readFile };
}

function verifyMarks(root = process.cwd()) {
  const { registry, readFile } = load(root);
  return registry.regions.map((region) => {
    const fileText = readFile(region.file);
    if (fileText == null) return { ...region, status: "missing-file", actual: null };
    const text = regionText(fileText, region);
    if (text == null) return { ...region, status: "missing-anchor", actual: null };
    const actual = sha(text);
    const status = region.sha === "STAMP_ME" ? "unstamped" : region.sha === actual ? "ok" : "drifted";
    return { ...region, status, actual };
  });
}

function stampMarks(root = process.cwd()) {
  const { registry, registryPath, readFile } = load(root);
  let changed = 0;
  const results = [];
  for (const region of registry.regions) {
    const fileText = readFile(region.file);
    if (fileText == null) { results.push({ ...region, status: "missing-file" }); continue; }
    const text = regionText(fileText, region);
    if (text == null) { results.push({ ...region, status: "missing-anchor" }); continue; }
    const actual = sha(text);
    if (region.sha !== actual) {
      results.push({ ...region, status: region.sha === "STAMP_ME" ? "added" : "restamped", from: region.sha, actual });
      region.sha = actual;
      changed++;
    } else {
      results.push({ ...region, status: "unchanged", actual });
    }
  }
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
  return { changed, results, registryPath };
}

module.exports = { SHA_CHARS, sha, regionText, verifyMarks, stampMarks };
