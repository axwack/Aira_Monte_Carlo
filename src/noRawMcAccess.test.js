/**
 * Nobody reads `mc.pcts` for a dollar figure except selectPortfolioAtAge().
 *
 * WHY A TEST AND NOT A COMMENT
 * ----------------------------
 * Three call sites each grew their own copy of "look up the simulated
 * portfolio value at age X": NetWorthTab read `mc.pcts` raw (never deflated,
 * so it ignored the Real $ toggle entirely), the Forecast tab's hero card
 * read a DIFFERENT aggregate (`mc.term.p50`) that also never deflated, and
 * the Checkpoints table read `mc.pcts` with `|| 0` (turning missing data into
 * a false $0). Two users independently reported the same age, same run,
 * showing two different numbers in two tabs. A CLAUDE.md rule saying "always
 * use selectPortfolioAtAge" would not have stopped any of the three — none of
 * them existed when this convention was written, and a comment cannot fail a
 * build. This can.
 *
 * This reads App.jsx as TEXT rather than importing and introspecting it,
 * matching the existing house pattern in billing/creditsGuardSync.test.js —
 * a text parse cannot be satisfied by a stale re-export or a shadowed copy,
 * and it needs no jsdom/component rendering to check "which lines exist".
 *
 * WHEN THIS FAILS
 * ----------------
 * You added a new direct read of `mc.pcts` / `stress.pcts`. Either:
 *   (a) it's a dollar-value lookup — route it through selectPortfolioAtAge()
 *       instead, or
 *   (b) it's a genuine exception (an array-wide scan, or reading structural
 *       metadata like `.length` / `[0]?.age` rather than a dollar figure,
 *       or handing the raw array to FanChart/MCBandTable, which deflate it
 *       themselves) — add the exact trimmed line to ALLOWED below, with a
 *       comment saying why it's safe.
 */

import fs from "fs";
import path from "path";

const APP_JSX = path.join(__dirname, "App.jsx");

// Exact trimmed line contents allowed to read `mc.pcts` / `stress.pcts`
// directly, each with why it's safe rather than a dollar-basis bug waiting
// to happen.
const ALLOWED = [
  // FanChart/MCBandTable deflate the whole array themselves (see their own
  // `useMemo(() => deflate(pcts, inf, useReal), ...)`) — handing them the
  // raw array is correct, not a basis leak.
  "pcts={stress.pcts}",
  "pcts={mc.pcts}",
  // Structural metadata only — which age the data STARTS at, not a dollar
  // value, so there is no basis to get wrong.
  "const dollarBasis = dollarBasisLabel(real, mc?.pcts?.[0]?.age ?? effRetireAge);",
  // selectPortfolioAtAge()'s own implementation — the one place allowed to
  // touch mc.pcts directly, everything else calls this instead.
  "if (!mc?.pcts) return null;",
  "const pcts = real ? deflate(mc.pcts, inf, true) : mc.pcts;",
  // NetWorthTab's peak-liquid scan needs every row at once (the max across
  // all ages), which a single-age selector call can't give it. Uses the same
  // deflate() primitive selectPortfolioAtAge uses internally, so this and
  // the selector can't drift out of basis with each other again.
  "const dPcts = useMemo(() => (mc ? deflate(mc.pcts, inf, real) : []), [mc, inf, real]);",
];

function findRawMcPctsReads() {
  const src = fs.readFileSync(APP_JSX, "utf8");
  const lines = src.split("\n");
  const pattern = /\b(?:mc|stress)\??\.pcts\b/;
  const hits = [];
  let inBlockComment = false;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Crude but sufficient block-comment tracking for this file's own style
    // (JSDoc blocks live on their own lines; nothing here nests /* inline */
    // inside a single line that also has code after it).
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (pattern.test(trimmed)) {
      hits.push({ line: i + 1, text: trimmed });
    }
  });
  return hits;
}

describe("no raw mc.pcts / stress.pcts access outside selectPortfolioAtAge", () => {
  test("selectPortfolioAtAge and deflate still exist in App.jsx", () => {
    const src = fs.readFileSync(APP_JSX, "utf8");
    expect(src).toMatch(/function selectPortfolioAtAge\(/);
    expect(src).toMatch(/function deflate\(/);
  });

  test("every direct mc.pcts/stress.pcts read is on the allow-list", () => {
    const hits = findRawMcPctsReads();
    const unexpected = hits.filter((h) => !ALLOWED.includes(h.text));
    if (unexpected.length > 0) {
      const detail = unexpected.map((h) => `  App.jsx:${h.line}  ${h.text}`).join("\n");
      throw new Error(
        `Found ${unexpected.length} new direct read(s) of mc.pcts/stress.pcts outside ` +
        `selectPortfolioAtAge():\n${detail}\n\n` +
        `If this is a dollar-value lookup, route it through selectPortfolioAtAge() ` +
        `instead — that's the whole point of this test (see its header comment). ` +
        `If it's a genuine exception, add the exact trimmed line to ALLOWED in ` +
        `src/noRawMcAccess.test.js with a comment explaining why it's safe.`
      );
    }
  });
});
