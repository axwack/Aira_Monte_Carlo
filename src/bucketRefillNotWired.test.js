/**
 * The bucket REFILL PROTOCOL is not wired. This test keeps that true, or
 * forces the UI to stop saying it is.
 *
 * WHY A TEST AND NOT A COMMENT
 * ----------------------------
 * Reported 2026-09-16: a user A/B-tested two otherwise-identical profiles
 * (one with a funded cash bucket, one without) through the Market Crashes
 * Early stress card with "3-Bucket Strategy" selected, at 3,000 paths, and
 * got statistically indistinguishable survival either way — and sizing the
 * cash bucket from $86k to $220k didn't move it either.
 *
 * The audit found the mode never claimed the right thing. It does asset
 * location (what each bucket is invested in, so what it earns) plus a
 * Bucket 2 -> Bucket 1 yield sweep. It does NOT do the refill protocol the
 * name "3-Bucket Strategy" promises: spend Bucket 1 first regardless of
 * account type, sell Bucket 3 to refill it in good years, freeze those sales
 * in bad ones. bucketStrategy.js has all four refill primitives built and
 * unit-tested — with zero production callers. Being unit-tested is exactly
 * what made them read as shipped.
 *
 * So the label was corrected to "Bucket investing (same draw order)" and the
 * inline disclosure now states what the mode does not do. Those are strings;
 * nothing stops a later change from wiring a refill helper and leaving the
 * copy behind, or from re-promising the full protocol without building it.
 * This can.
 *
 * WHEN THIS FAILS
 * ----------------
 * You wired one of the refill primitives into a real engine. Good — that's
 * the intended next increment. Before deleting the failing entry here:
 *   1. Update the AccountDrawOrder mode label in App.jsx. "(same draw order)"
 *      becomes a lie the moment tier sequencing is real.
 *   2. Update the inline disclosure under that radio — the "What this does
 *      not do" paragraph names the exact behaviors being added.
 *   3. Delete the NOT WIRED banner above bucketDrawCaps in bucketStrategy.js.
 *   4. Re-run the with-bucket vs without-bucket stress comparison and record
 *      the numbers. The whole point of the feature is a measurable difference;
 *      Kitces (2014) says freeze-only refill matches total-return rebalancing
 *      rather than beating it, so parity is the result to expect and defend,
 *      not a bug to chase.
 */

import fs from "fs";
import path from "path";

const SRC_DIR = __dirname;

const SKIP_DIRS = new Set(["node_modules", "build", "__snapshots__"]);
const isTestFile = (name) => /\.test\.jsx?$/.test(name);
const isSourceFile = (name) => /\.(js|jsx)$/.test(name) && !isTestFile(name);

function listSourceFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out = out.concat(listSourceFiles(path.join(dir, entry.name)));
    } else if (isSourceFile(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// The refill-protocol primitives. Every one of these should appear ONLY in
// its own definition file until the protocol is actually built.
const REFILL_PRIMITIVES = [
  "bucketDrawCaps",
  "BEAR_REFILL_THRESHOLD",
  "bucket3DrawdownFromPeak",
  "shouldFreezeRefill",
];

// Where each primitive is allowed to appear: its own module. Paths relative
// to src/, POSIX-separated.
const DEFINITION_FILE = "engine/bucketStrategy.js";

describe("bucket refill protocol — not wired, and the UI must not claim it is", () => {
  const files = listSourceFiles(SRC_DIR);

  test("no production code calls the refill primitives", () => {
    const offenders = [];

    for (const file of files) {
      const rel = path.relative(SRC_DIR, file).split(path.sep).join("/");
      if (rel === DEFINITION_FILE) continue; // its own definitions + banner

      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        // Comments referring to these by name are fine — the banner in
        // bucketStrategy.js and the pointer to it from App.jsx both do.
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
        for (const name of REFILL_PRIMITIVES) {
          if (new RegExp(`\\b${name}\\b`).test(line)) {
            offenders.push(`${rel}:${i + 1}  ${trimmed}`);
          }
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  test("the draw-order resolver returns the same order for three_bucket as tax_reactive", () => {
    // The other half of the same promise. If tier sequencing ever lands, this
    // is where it lands, and the "(same draw order)" label has to change with it.
    // eslint-disable-next-line global-require
    const { resolveDrawOrder } = require("./engine/buildWithdrawalWaterfall.js");
    expect(resolveDrawOrder("three_bucket")).toEqual(resolveDrawOrder("tax_reactive"));
  });

  test("the mode label does not promise draw-order control it lacks", () => {
    const app = fs.readFileSync(path.join(SRC_DIR, "App.jsx"), "utf8");
    // The radio label for orderingMode "three_bucket".
    const match = app.match(/\["three_bucket",\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    const label = match[1];
    // "3-Bucket Strategy" is the name of the full advisor protocol, most of
    // which isn't built. Any label claiming it needs the protocol to exist.
    expect(label).not.toMatch(/3-Bucket Strategy/i);
  });
});
