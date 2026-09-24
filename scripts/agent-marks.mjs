#!/usr/bin/env node
// Agent attribution + tamper-evidence CLI.
//
//   node scripts/agent-marks.mjs --verify   (default) fail if a region drifted
//   node scripts/agent-marks.mjs --stamp    rewrite the recorded hashes
//   node scripts/agent-marks.mjs --list     show regions, owners, drift state
//
// The logic lives in src/agentMarks.js because CRA's Jest transform only covers
// src/, and src/agentMarks.test.js must import the SAME implementation this CLI
// uses — two copies of "how do we hash a region" would drift, and the drift
// would look like a passing check. This file is only the argument handling.

import { verifyMarks, stampMarks } from "../src/agentMarks.js";

const STATUS_FLAG = {
  ok: "ok      ",
  drifted: "DRIFTED ",
  unstamped: "UNSTAMPED",
  "missing-anchor": "NO ANCHOR",
  "missing-file": "NO FILE ",
};

const mode = process.argv.includes("--stamp") ? "stamp"
  : process.argv.includes("--list") ? "list"
  : "verify";

if (mode === "stamp") {
  const { changed, results, registryPath } = stampMarks(process.cwd());
  for (const r of results) {
    if (r.status === "added") console.log(`  + ${r.id}  STAMP_ME -> ${r.actual}  [${r.owner}]`);
    else if (r.status === "restamped") console.log(`  ~ ${r.id}  ${r.from} -> ${r.actual}  [${r.owner}]`);
    else if (r.status === "missing-file") console.log(`  ! ${r.id}: file not found (${r.file})`);
    else if (r.status === "missing-anchor") console.log(`  ! ${r.id}: anchor not found (${r.startAnchor})`);
  }
  console.log(`\nStamped ${changed} region(s). Registry: ${registryPath}`);
  console.log("COMMIT agent-marks.json WITH the code change so the re-stamp is visible in review.");
} else {
  const results = verifyMarks(process.cwd());
  const bad = results.filter((r) => r.status !== "ok");
  if (mode === "list" || bad.length) {
    const pad = Math.max(...results.map((r) => r.id.length));
    const ownerPad = Math.max(...results.map((r) => r.owner.length));
    for (const r of results) {
      console.log(`${STATUS_FLAG[r.status] || r.status}  ${r.id.padEnd(pad)}  ${r.owner.padEnd(ownerPad)}  ${r.file}`);
    }
  }
  if (bad.length) {
    console.log("\n" + "=".repeat(78));
    console.log("AGENT MARK CHECK FAILED — a marked region changed or disappeared.");
    console.log("=".repeat(78));
    for (const r of bad) {
      console.log(`\n  ${r.id}  (owner: ${r.owner})   ${r.status.toUpperCase()}`);
      console.log(`  ${r.file}`);
      console.log(`  ${r.description}`);
      if (r.status === "drifted") console.log(`  recorded ${r.sha}  !=  actual ${r.actual}`);
    }
    console.log("\nIf you changed this region on purpose (including re-styling or a");
    console.log("refactor), re-stamp and commit the registry in the same change:");
    console.log("\n    node scripts/agent-marks.mjs --stamp\n");
    console.log("If you did NOT — you are editing another agent's region. Stop and");
    console.log("coordinate: that is exactly what this check is here to catch.\n");
    process.exit(1);
  }
  if (mode === "verify") console.log(`All ${results.length} marked regions verified.`);
}
