/**
 * Agent attribution + tamper-evidence — shared logic.
 *
 * Two agents work this repo concurrently. `agent-marks.json` names the regions
 * each one owns and records a hash of the region's exact source; this module
 * derives those hashes so an edit to someone else's region is detectable.
 *
 * It lives in src/ (not scripts/) because CRA's Jest transform only covers src/,
 * and the gate that enforces this — src/agentMarks.test.js — has to be able to
 * import the SAME implementation the CLI uses. Two copies of "how do we hash a
 * region" would drift, and the drift would look like a passing check.
 *
 * HONESTY ABOUT THE GUARANTEE: a recorded hash is tamper-EVIDENT, not
 * tamper-PROOF. Anyone with write access can re-stamp it. What gives it teeth is
 * that the suite fails on drift, so editing another agent's region becomes a
 * deliberate, reviewable act rather than a quiet one.
 *
 * Regions are located by ANCHOR (a string the region already contains), not by
 * injected BEGIN/END comments: injecting markers would mean editing the other
 * agent's code in order to tag it, which is the collision the registry exists to
 * avoid.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** Digest chars kept. 16 hex = 64 bits — collision-free in practice, still readable. */
const SHA_CHARS = 16;

const sha = (text) =>
  crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, SHA_CHARS);

/**
 * Extract a region's source.
 *
 * Start: the line containing `startAnchor`.
 * End:   the line before `endAnchor` when given, else the next line beginning a
 *        top-level `function ` — the same boundary convention
 *        src/disclaimers.test.js uses to slice component bodies.
 *
 * Line endings are normalised to \n before hashing so a CRLF rewrite (or a
 * checkout with different autocrlf) doesn't read as a content change. False
 * alarms on a platform change are how a guard like this gets switched off by the
 * person it inconveniences.
 */
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

/** Derive every region's current hash. Never writes. */
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

/** Rewrite the recorded hashes. Returns {changed, results, registryPath}. */
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
