/**
 * provenance.test.js — every summary figure must declare where its value came from.
 *
 * WHY THIS EXISTS (REQUIREMENTS §28)
 *
 * In one session Vincent found FOUR figures in the UI that were mislabelled or
 * wired to the wrong source. He found them by looking at his own screen and
 * reporting them one at a time; the fourth was still there after three rounds of
 * "fixed it". THE ENGINE MATH WAS CORRECT EVERY TIME — every defect was in the
 * display layer. That is what makes the class dangerous: the tests pass, the math
 * is right, and the number still misleads.
 *
 *   > A label asserts a derivation, a time point, or an authority the value never got.
 *
 * Examples that shipped:
 *   • "$X/mo safe spend"        → was `params.sp / 12`, the user's typed input
 *   • "$X at age {endAge}"      → was `mc.medR`, the balance at the START of retirement
 *   • "SAFE SPENDING TARGET / GK guardrails" → `p.sp / 12`; GK never touched it
 *   • "Median accumulation"     → a single deterministic projection, no distribution
 *
 * A promise to be careful is worthless — this is modelled on `ghostSettings.test.js`,
 * the working precedent in this repo that stopped ghost settings by making "we
 * forgot to wire it up" a BUILD FAILURE. Same shape here: the registry below
 * declares every metric card, and the test asserts the card count in App.jsx
 * equals the registry size. ADDING A CARD WITHOUT DECLARING IT TURNS THE BUILD RED.
 *
 * The point is NOT the count. It is that the author has to answer
 * "computed, echoed, or point-in-time?" at authoring time — which is exactly the
 * question nobody asked when "safe spend" and "GK guardrails" were written.
 *
 * ── KINDS ───────────────────────────────────────────────────────────────────
 *   "computed"      the engine derived it. The label may claim a derivation.
 *   "echoed"        a user input played back (possibly ÷12 or ×100). The label
 *                   must NOT imply the app calculated or certified it.
 *   "point-in-time" a balance/state at one specific age or year. The label must
 *                   name WHICH age, and it must be the age the value is from.
 *   "count"         a tally of rows/years. Label must say what is being counted.
 *
 * ── HOW TO ADD A CARD ───────────────────────────────────────────────────────
 *   1. Write the card in App.jsx.
 *   2. Add an entry here: label, the exact source expression, and its kind.
 *   3. If the kind is "echoed", the label has to admit it on screen.
 *   4. If it is "point-in-time", the label must name the age.
 */

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

/**
 * App.jsx with comments removed.
 *
 * The phrase assertions further down have to run against what REACHES THE SCREEN,
 * not against the source. This file documents its own history in comments — the
 * fix for the "Median accumulation" caption necessarily quotes the wrong caption
 * in order to explain it — and a naive `not.toContain` on the raw source fails on
 * the explanation instead of the defect. Deleting the explanation to appease the
 * test would be exactly backwards.
 */
const RENDERED = SRC
  .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments, incl. JSX {/* ... */}
  .replace(/^\s*\/\/.*$/gm, " ")       // whole-line // comments
  .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1"); // trailing // comments (not URLs)

/**
 * Every metric card in App.jsx, in source order.
 *
 * `line` is advisory only (it drifts as the file changes and is NOT asserted) —
 * it is there to make a failure quick to locate.
 */
const METRIC_CARDS = [
  // ── Roth Conversion Explorer — plan summary ──────────────────────────────
  { label: "Conversions",                    source: "convRows.length",                          kind: "count" },
  { label: "Pinned / Forecast",              source: "convRows.filter(manual|!manual).length",   kind: "count" },
  { label: "Lifetime Tax Delta",             source: "taxD (opt.cTax − cur.cTax)",               kind: "computed" },
  { label: "RMD Reduction",                  source: "rmdRed (from cur.cRmd vs opt.cRmd)",       kind: "computed" },
  { label: "Lifetime Eff. Rate",             source: "leOpt / leCur",                            kind: "computed" },

  // ── Year-end conversion check-in ─────────────────────────────────────────
  { label: "Convert This Amount",            source: "recConv (yearEndTaxRoom)",                 kind: "computed" },
  { label: "Total Tax Cost",                 source: "recTax.total",                             kind: "computed" },
  { label: "Net → Roth",                     source: "cyNetRoth",                                kind: "computed" },

  // ── Conversion comparison (Without vs With) ──────────────────────────────
  // `nw` is r.totalPort — ALL FOUR buckets, not the two the chart above stacks.
  // Traced 2026-07-30; value correct, composition now disclosed in the card.
  { label: "Savings at Age {endAge} — Without",         source: "cur.rows[last].nw = totalPort", kind: "point-in-time", at: "endAge" },
  { label: "Savings at Age {endAge} — With Conversions", source: "opt.rows[last].nw = totalPort", kind: "point-in-time", at: "endAge" },
  { label: "Lifetime RMDs — Without",        source: "cur.cRmd",                                 kind: "computed" },
  { label: "Lifetime RMDs — With Conversions", source: "opt.cRmd",                               kind: "computed" },

  // ── Withdrawal Plan summary ──────────────────────────────────────────────
  { label: "Smart Lifetime Tax",             source: "summary.lifetimeTaxSmart",                 kind: "computed" },
  { label: "Tax Savings vs No Plan",         source: "summary.taxSavings",                       kind: "computed" },
  { label: "Roth at Age {endAge}",           source: "summary.finalRothSmart",                   kind: "point-in-time", at: "endAge" },
  { label: "IRMAA Years Triggered",          source: "summary.irmaaYearsTriggered",              kind: "count" },
  { label: "Avg. Withdrawal Rate",           source: "mean(wrSeries)",                           kind: "computed" },
  { label: "Portfolio Depletion",            source: "depletionRow.age | 'Never'",               kind: "point-in-time", at: "first depleted year" },

  // ── Deterministic withdrawal view ────────────────────────────────────────
  // Was captioned "Median accumulation". accumulateToRetirement is a SINGLE
  // deterministic projection at the expected return — there is no distribution
  // and therefore no median. Caption fixed 2026-07-30 (§28 D1).
  { label: "Portfolio at Retirement",        source: "accumulateToRetirement(p).total",          kind: "computed" },
  { label: "Initial Withdrawal Rate",        source: "initWR = net need ÷ portAtRetire",         kind: "computed" },
  { label: "Final Portfolio (Age N)",        source: "schedule[last].portfolioEnd",              kind: "point-in-time", at: "schedule[last].age" },

  // ── Progress / check-ins ─────────────────────────────────────────────────
  { label: "Latest success rate",            source: "latest.successRate (stored check-in)",     kind: "point-in-time", at: "latest check-in date" },
  { label: "Since first check-in",           source: "ratePP (latest − first)",                  kind: "computed" },
  { label: "Portfolio change",               source: "portDelta (latest − first)",               kind: "computed" },

  // ── Stress test ──────────────────────────────────────────────────────────
  { label: "Stress success",                 source: "stress.rate",                              kind: "computed" },
  { label: "Delta vs base",                  source: "stress.rate − mc.rate",                    kind: "computed" },

  // ── Widow's-penalty delta (§31) ───────────────────────────────────────────
  // Two runs of the USER'S OWN plan at the same seed and path count, differing only
  // in whether spouse.deathAge is set. Same seed is load-bearing: with a different
  // one, part of the "penalty" would be RNG noise and the label would be claiming a
  // derivation the number did not get.
  { label: "Widow's penalty",                source: "(est.base − est.noDeath) × 100, same seed/N", kind: "computed" },
  { label: "What this figure is",            source: "static explanatory prose, not a figure",   kind: "computed" },

  // ── Bucket strategy (factory: one JSX site, N cards from an array) ───────
  { label: "{m.l} (bucket metrics map)",     source: "m.v from the bucket metrics array",        kind: "computed", factory: true },

  // ── Mortgage calculator ──────────────────────────────────────────────────
  { label: "Current balance",                source: "bal (mortgage inputs)",                    kind: "echoed" },
  { label: "Payoff year",                    source: "sched.payoffYr",                           kind: "point-in-time", at: "payoff year" },
  { label: "Interest saved",                 source: "sched.interestSaved",                      kind: "computed" },
  { label: "Monthly P&I",                    source: "sched.pmt",                                kind: "computed" },

  // ── Net worth tab ────────────────────────────────────────────────────────
  // Genuinely a median (max of mc.pcts p50) AND the asterisk is footnoted below
  // the card — verified 2026-07-30, so the "(median)" claim is earned.
  { label: "Peak liquid (median)*",          source: "max(mc.pcts[].p50)",                       kind: "point-in-time", at: "peakAge" },
  { label: "Net worth at age {planAge}",     source: "finalNW",                                  kind: "point-in-time", at: "p.endAge" },
  { label: "Mortgage-free",                  source: "mortSched.payoffYr",                       kind: "point-in-time", at: "payoff year" },
  { label: "Real estate equity",             source: "reEquity",                                 kind: "computed" },

  // ── Spending-target card (three branches, one card) ──────────────────────
  // The middle branch is the one that shipped mislabelled twice: it ECHOES
  // p.sp / 12. All three branches now disclose which they are, on screen.
  { label: "{label} — spending target (3 branches)", source: "fixed: port×rate/12 (computed) · target set: p.sp/12 (ECHOED) · no target: port×benchRate/12 (computed)", kind: "echoed", factory: true },
];

describe("§28 — metric-card provenance registry", () => {
  test("every metric card in App.jsx is declared here", () => {
    const rendered = (SRC.match(/className="ml"/g) || []).length;
    expect(rendered).toBe(METRIC_CARDS.length);
  });

  test("the failure message explains itself", () => {
    // Not a behavioural assertion — this documents, in the suite itself, what a
    // maintainer should do when the count test above goes red. The instruction
    // lives here rather than only in a comment so it survives a terse CI log.
    const rendered = (SRC.match(/className="ml"/g) || []).length;
    const advice =
      "A metric card was added or removed in src/App.jsx without updating " +
      "METRIC_CARDS in src/provenance.test.js. Add an entry declaring the card's " +
      "label, its exact source expression, and its kind (computed / echoed / " +
      "point-in-time / count). If the value is ECHOED from user input, the label " +
      "must say so on screen; if it is POINT-IN-TIME, the label must name the age.";
    expect(rendered === METRIC_CARDS.length ? "" : advice).toBe("");
  });

  test("every entry declares a label, a source and a valid kind", () => {
    const KINDS = new Set(["computed", "echoed", "point-in-time", "count"]);
    METRIC_CARDS.forEach((c, i) => {
      expect(typeof c.label).toBe("string");
      expect(c.label.length).toBeGreaterThan(0);
      expect(typeof c.source).toBe("string");
      // An empty source is the whole failure mode this file exists to prevent:
      // it means nobody traced where the number came from.
      expect(c.source.length).toBeGreaterThan(0);
      expect(KINDS.has(c.kind)).toBe(true);
      if (c.kind === "point-in-time") {
        // A point-in-time figure whose age is not recorded is precisely the
        // `mc.medR` bug: "balance at age {endAge}" that was the balance at the
        // START of retirement.
        expect(typeof c.at).toBe("string");
        expect(c.at.length).toBeGreaterThan(0);
      }
    });
  });

  test("no two entries share a label AND a source (copy-paste guard)", () => {
    const seen = new Set();
    METRIC_CARDS.forEach((c) => {
      const key = `${c.label}::${c.source}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
  });
});

describe("§28 — provenance regressions that already shipped once", () => {
  test('no card is captioned "Median accumulation" (it was a single projection)', () => {
    expect(RENDERED).not.toContain("Median accumulation");
  });

  test('the results bar does not call the user\'s own input "safe spend"', () => {
    // v1.2.47 replaced this with "your spend target". The phrase asserted the app
    // had computed and certified a safe amount; it was params.sp / 12.
    expect(RENDERED).not.toMatch(/safe spend/i);
  });

  test("the spending target discloses its after-tax basis at the INPUT, not only in results", () => {
    // §28.1 OPEN 1 (Gary): the convention was stated on results surfaces and in
    // the About tab, but not where the number is typed — which is where the user
    // forms their mental model.
    expect(SRC).toMatch(/Enter what you want to spend — after tax/);
  });

  test("the income aggregate names its three components on screen", () => {
    // §28.1 OPEN 2: one concept must not have two names across surfaces.
    expect(SRC).toContain("Income = Social Security + Pension/Other + Annuity/Rental");
  });

  test("no table header hides its explanation behind a hover-only title=", () => {
    // §28.2. `title=` does not exist on touch devices AT ALL, so a column
    // explanation put there is unreachable on every phone and tablet — and a
    // column explanation is tier-1/2 content: it tells you how to read the
    // number. Use <ThInfo tip="…">, which renders the same visible marker but
    // opens on CLICK.
    const hoverOnlyHeaders = RENDERED.match(/<th[^>]*\stitle=/g) || [];
    expect(hoverOnlyHeaders).toEqual([]);
  });

  test("the click-open header component is actually in use", () => {
    // Guards against the conversion being reverted wholesale in a merge.
    expect((RENDERED.match(/<ThInfo/g) || []).length).toBeGreaterThanOrEqual(20);
  });

  test("Toggle hints open a modal rather than rendering a native tooltip", () => {
    // One component change covered every toggle in the app. If `hint` ever goes
    // back to `title={hint}` the whole set silently becomes touch-unreachable
    // again, with no visual difference on a developer's mouse-driven desktop.
    expect(RENDERED).not.toMatch(/<div className="tog-row" title=/);
  });

  test("money in metric cards goes through fmtDollar, not inline toLocaleString", () => {
    // CLAUDE.md: one money helper. Inline formatting is how an actual abbreviator
    // slipped in unnoticed in v1.2.37.
    const badMv = RENDERED.match(/className="mv"[^>]*>\s*\$\{?[a-zA-Z.]+\.toLocaleString\(\)/g) || [];
    expect(badMv).toEqual([]);
  });
});
