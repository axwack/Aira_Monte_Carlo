#!/usr/bin/env node
/**
 * Guarded production deploy to Cloudflare Pages.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/report/PrintReport.jsx` is committed to git as a 68-line PUBLIC STUB that
 * renders "Report module not included". The real 651-line implementation lives on
 * local disk only, hidden from git by `git update-index --skip-worktree`, and
 * reaches production solely because `wrangler pages deploy` builds from disk
 * rather than from a git checkout. (See REQUIREMENTS.md "Done this session".)
 *
 * That makes shipping the stub a completely silent failure: `npm run build`
 * succeeds, wrangler succeeds, the site loads, and the report is simply gone —
 * a dialog telling paying customers the feature "isn't bundled in this build".
 * It has already happened once in production.
 *
 * The old `deploy` script was `npm run build && wrangler pages deploy …`, which
 * had no idea any of this was true. This one refuses to deploy unless the real
 * report is present BOTH on disk and in the compiled bundle.
 *
 * Usage:  npm run deploy
 * Machines known to hold the real file: red-dragon, t14.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PROJECT = "aira-monte-carlo";
const BRANCH  = "main";
const SITE    = "https://aira.tiredtoretire.com";

const STUB_MARKER = "Report module not included";
// Strings that exist ONLY in the real PrintReport.jsx. Verified unique against
// the whole of src/ — "Vanguard Dynamic Spending" is NOT usable here, it is also
// a strategy label in engine/withdrawalStrategies.js. That false positive once
// made a stubbed bundle look correct.
const REAL_MARKERS = ["pr-btn-unlock-secondary", "Year-by-Year Withdrawals", "Roth Conversion Schedule"];

const red   = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim   = (s) => `\x1b[2m${s}\x1b[0m`;

function die(title, detail) {
  console.error(`\n${red("DEPLOY ABORTED — " + title)}\n`);
  console.error(detail.trim() + "\n");
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) die(`\`${cmd} ${args.join(" ")}\` failed`, "Nothing was deployed.");
}

// ── Gate 1: the real report is on THIS machine ───────────────────────────────
const SRC = "src/report/PrintReport.jsx";
let src;
try { src = readFileSync(SRC, "utf8"); }
catch { die("PrintReport.jsx is missing", `Expected ${SRC}. Copy it from red-dragon or t14.`); }

if (src.includes(STUB_MARKER)) {
  die("this machine has the STUB, not the real report", `
${SRC} is the 68-line public placeholder that git tracks.
Deploying it would replace the working report in production with a
"Report module not included" dialog — and nothing else would look wrong.

Fix: copy the real ${SRC} from red-dragon or t14, then re-run.
Note it is marked skip-worktree, so git will not show it as changed.`);
}
console.log(green("✓") + ` real report on disk ${dim(`(${src.split("\n").length} lines)`)}`);

// ── Gate 2: build ────────────────────────────────────────────────────────────
console.log("\n▸ building…\n");
run("npx", ["react-scripts", "build"]);

// ── Gate 3: the real report survived into the bundle ─────────────────────────
const dir = "build/static/js";
const bundle = readdirSync(dir)
  .filter((f) => /^main\..*\.js$/.test(f))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!bundle) die("no bundle produced", `Nothing matching main.*.js in ${dir}.`);

const js = readFileSync(join(dir, bundle.f), "utf8");
if (js.includes(STUB_MARKER)) {
  die("the built bundle contains the STUB", `${bundle.f} would ship "${STUB_MARKER}" to production.`);
}
const missing = REAL_MARKERS.filter((m) => !js.includes(m));
if (missing.length) {
  die("the built bundle is missing the report", `
${bundle.f} lacks: ${missing.join(", ")}

The build did not include the real PrintReport even though disk looked correct.
Try a clean build (delete build/ and node_modules/.cache) before deploying.`);
}
console.log(green("✓") + ` report present in ${bundle.f} ${dim(`(${REAL_MARKERS.length}/${REAL_MARKERS.length} markers)`)}`);

// ── Deploy ───────────────────────────────────────────────────────────────────
console.log("\n▸ deploying to Cloudflare Pages…\n");
run("npx", ["wrangler", "pages", "deploy", "build",
            "--project-name=" + PROJECT, "--branch=" + BRANCH, "--commit-dirty=true"]);

// ── Gate 4: confirm what production actually serves ──────────────────────────
// The deploy can succeed and the CDN still serve the previous bundle, and a
// git-triggered Pages build can land on top at any moment. Checking the live
// origin is the only statement worth making.
console.log("\n▸ verifying production…\n");
try {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 60_000);
  const html = await (await fetch(SITE + "/?cb=" + Date.now(), { signal: ac.signal })).text();
  const main = (html.match(/\/static\/js\/main\.[a-z0-9]+\.js/) || [])[0];
  if (!main) throw new Error("could not find the bundle URL in index.html");
  const live = await (await fetch(SITE + main, { signal: ac.signal })).text();
  clearTimeout(timer);

  const liveStub    = live.includes(STUB_MARKER);
  const liveMissing = REAL_MARKERS.filter((m) => !live.includes(m));
  const version     = (live.match(/\[main\] v\d+\.\d+\.\d+/) || ["unknown"])[0];

  if (liveStub || liveMissing.length) {
    die("production is NOT serving the report", `
Live bundle: ${main}
${liveStub ? `Contains the stub dialog.` : `Missing: ${liveMissing.join(", ")}`}

The deploy uploaded, but the origin is serving something else — most likely a
git-triggered Pages build landed on top. Re-run, or disable the Pages git
integration so only guarded deploys reach production.`);
  }
  console.log(green("✓") + ` live: ${main} ${dim(version)}`);
  console.log(green("✓") + ` report confirmed serving from ${SITE}\n`);
} catch (e) {
  console.warn(`\n${red("⚠ could not verify production")} — ${e.message}`);
  console.warn(`The deploy itself succeeded. Check ${SITE} by hand.\n`);
}
