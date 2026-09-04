/**
 * Nobody reads `mc.pcts` / `mc.term` for a dollar figure except through
 * selectPortfolioAtAge() (src/engine/mcSelectors.js).
 *
 * WHY A TEST AND NOT A COMMENT
 * ----------------------------
 * Reported 2026-09-04: the same run, same age, showed two different median
 * portfolio values in two tabs (~1.9x apart). Investigating turned up FOUR
 * independent reimplementations of "look up the simulated portfolio value at
 * age X" in App.jsx alone (NetWorthTab, the hero card, its termAt() helper,
 * the Checkpoints table — the last one via `|| 0`, silently turning missing
 * data into a false $0) — and once an ESLint rule pointed the same question
 * at the rest of src/ (no-restricted-properties, see .eslintrc.json), THREE
 * MORE turned up in engine/rulesEngine.js, engine/explainScore.js, and
 * report/PrintReport.jsx. A CLAUDE.md rule saying "always use
 * selectPortfolioAtAge" would not have stopped any of them — none of these
 * call sites existed (or had been audited) when that convention was written,
 * and a comment cannot fail a build. This can.
 *
 * This is the Jest-side twin of the ESLint rule, not a replacement for it —
 * ESLint gives faster, AST-precise feedback (`npm run audit:ui`, and in the
 * dev-server overlay), but `npm test` is the gate CLAUDE.md actually requires
 * before a financial-math commit, so this walks the same src/ tree as plain
 * text so the guarantee holds even if the lint step gets skipped. Matches the
 * house pattern in billing/creditsGuardSync.test.js — a text parse can't be
 * satisfied by a stale re-export or a shadowed copy.
 *
 * WHEN THIS FAILS
 * ----------------
 * You added a new direct read of `mc.pcts` / `mc.term` / `stress.pcts`. Either:
 *   (a) it's a dollar-value lookup — route it through selectPortfolioAtAge()
 *       instead, or
 *   (b) it's a genuine exception (an array-wide scan/render, a structural
 *       check like `.length` or `[0]?.age` rather than a dollar figure, or
 *       handing the raw array to FanChart/MCBandTable, which deflate it
 *       themselves) — add the exact trimmed line to ALLOWED below, under that
 *       file's entry, with a comment saying why it's safe. Add a matching
 *       `// eslint-disable-next-line no-restricted-properties` in the source
 *       too, or `npm run audit:ui` will still fail on it.
 */

import fs from "fs";
import path from "path";

const SRC_DIR = __dirname;

// Directories/files this walk never descends into or reads.
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

// Exact trimmed line contents allowed to read mc.pcts/mc.term/stress.pcts
// directly, keyed by path relative to src/, each with why it's safe rather
// than a dollar-basis bug waiting to happen.
const ALLOWED = {
  "App.jsx": [
    // FanChart deflates the whole array itself (see its own
    // `useMemo(() => deflate(pcts, inf, useReal), ...)`) — handing it the
    // raw array is correct, not a basis leak.
    "pcts={stress.pcts}",
    "pcts={mc.pcts}",
    // Structural metadata only — which age the data STARTS at, not a dollar
    // value, so there is no basis to get wrong.
    "const dollarBasis = dollarBasisLabel(real, mc?.pcts?.[0]?.age ?? effRetireAge);",
    // NetWorthTab's peak-liquid scan needs every row at once (the max across
    // all ages), which a single-age selector call can't give it. Uses the
    // same deflate() primitive selectPortfolioAtAge uses internally, so this
    // and the selector can't drift out of basis with each other again.
    "const dPcts = useMemo(() => (mc ? deflate(mc.pcts, inf, real) : []), [mc, inf, real]);",
    // A permanent point-in-time snapshot written on Check-in (LEGACY score
    // history), not a live display re-derived on every render — there is
    // nothing for it to disagree with at read time the way a UI card can.
    "medianTerminal: mc.term?.p50 ?? null,",
  ],
  "engine/mcSelectors.js": [
    // selectPortfolioAtAge()'s own implementation — the one place allowed to
    // touch mc.pcts directly, everything else calls this instead.
    "if (!mc?.pcts) return null;",
    "const pcts = real ? deflate(mc.pcts, inf, true) : mc.pcts;",
  ],
  "engine/explainScore.js": [
    // Structural validity check (array-ness/length) before doing anything
    // else, not a dollar read.
    "if (!mc || !Array.isArray(mc.pcts) || mc.pcts.length === 0) {",
  ],
  "report/PrintReport.jsx": [
    // Array-wide render of the age-by-age table, one row per age — there is
    // no single-age selector call that could replace this.
    "{(mc.pcts || []).map((d) => {",
  ],
  "provenance.js": [
    // A documentation string (the "where did this number come from"
    // disclosure registry) describing NetWorthTab's peak-liquid scan in
    // prose, not an actual property read — the regex can't tell a string
    // literal from code, so it's listed here rather than making the parser
    // string-literal-aware for one line.
    'source: "max(mc.pcts[].p50)",',
  ],
};

function findRawMcReads(file) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  const pattern = /\b(?:mc|stress)\??\.(?:pcts|term)\b/;
  const hits = [];
  let inBlockComment = false;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Crude but sufficient block-comment tracking for this codebase's style
    // (JSDoc blocks live on their own lines; nothing here nests /* inline */
    // inside a single line that also has code after it).
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    // JSX comments open with `{/*`, not just `/*`.
    if (trimmed.startsWith("/*") || trimmed.startsWith("{/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (pattern.test(trimmed)) hits.push({ line: i + 1, text: trimmed });
  });
  return hits;
}

describe("no raw mc.pcts/mc.term/stress.pcts access outside selectPortfolioAtAge", () => {
  test("selectPortfolioAtAge, deflate, mcMedianAtAge still exist in engine/mcSelectors.js", () => {
    const src = fs.readFileSync(path.join(SRC_DIR, "engine", "mcSelectors.js"), "utf8");
    expect(src).toMatch(/export function selectPortfolioAtAge\(/);
    expect(src).toMatch(/export function deflate\(/);
    expect(src).toMatch(/export function mcMedianAtAge\(/);
  });

  test("every direct mc.pcts/mc.term/stress.pcts read, anywhere in src/, is on that file's allow-list", () => {
    const files = listSourceFiles(SRC_DIR);
    const unexpected = [];
    for (const file of files) {
      const rel = path.relative(SRC_DIR, file).split(path.sep).join("/");
      const allowedForFile = ALLOWED[rel] || [];
      for (const hit of findRawMcReads(file)) {
        if (!allowedForFile.includes(hit.text)) {
          unexpected.push({ file: rel, ...hit });
        }
      }
    }
    if (unexpected.length > 0) {
      const detail = unexpected.map((h) => `  src/${h.file}:${h.line}  ${h.text}`).join("\n");
      throw new Error(
        `Found ${unexpected.length} new direct read(s) of mc.pcts/mc.term/stress.pcts outside ` +
        `selectPortfolioAtAge():\n${detail}\n\n` +
        `If this is a dollar-value lookup, route it through selectPortfolioAtAge() from ` +
        `engine/mcSelectors.js instead — that's the whole point of this test (see its header ` +
        `comment). If it's a genuine exception, add the exact trimmed line to ALLOWED under ` +
        `that file's entry in src/noRawMcAccess.test.js, with a comment explaining why, and add ` +
        `a matching // eslint-disable-next-line no-restricted-properties in the source.`
      );
    }
  });
});
