/**
 * provenance.test.js — every summary figure must declare where its value came from.
 *
 * WHY THIS EXISTS (REQUIREMENTS §28)
 *
 * In one session the owner found FOUR figures in the UI that were mislabelled or
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
import { METRIC_CARDS, formulaFor, provenanceFor } from "./provenance.js";
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

/* The registry moved to src/provenance.js so ONE declaration is both rendered by the
 * app and enforced here. Keeping it in this file would have forced the app to hold a
 * second copy of every formula — the duplication this codebase keeps paying for. */
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

  test("EVERY figure states its arithmetic in words a user can check", () => {
    // Owner, 2026-07-31: "each label should have the exactly calculation clear to
    // the user and if it is not important at least show it."
    //
    // This is the enforcement half. Three defects were found by users doing sums on
    // screen — "safe spend" (an echoed input), "Median accumulation" (one projection,
    // no distribution), and the WR column (a spending rate labelled a withdrawal
    // rate). A visible formula makes that class obvious on first read instead of
    // requiring a user to reverse-engineer it.
    METRIC_CARDS.forEach((c) => {
      expect(typeof c.formula).toBe("string");
      expect(c.formula.length).toBeGreaterThan(10);
      // Plain words, not code. A formula a user cannot check is not a formula.
      expect(c.formula).not.toMatch(/[a-zA-Z]\.[a-zA-Z]+\s*[/*+-]/);   // e.g. "r.spending / x"
      expect(c.formula).not.toMatch(/p\.|mc\.|params\./);
    });
  });

  test("EVERY card renders an explanation line on screen — none is bare", () => {
    // The rendering half of the owner's rule. A formula declared in the registry but
    // never displayed helps nobody; five cards used to show a number with no
    // explanation at all. Structural check: every `ml` label must have an `ms`
    // sub-line within its own card block.
    const lines = SRC.split("\n");
    const bare = [];
    lines.forEach((l, i) => {
      if (!l.includes('className="ml"')) return;
      const block = lines.slice(i, i + 13).join("\n");
      if (!block.includes('className="ms"')) bare.push(i + 1);
    });
    expect(bare).toEqual([]);
  });

  test("displayed formulas come from the registry, not inlined per call site", () => {
    // If a call site hand-writes its arithmetic, the screen and the registry can
    // disagree — which is the whole failure mode. At least the cards that had none
    // must be pulling from formulaFor().
    expect(SRC).toContain('import { formulaFor } from "./provenance.js"');
    expect((SRC.match(/formulaFor\(/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  test("every card has a stable unique id so a component can look it up", () => {
    const ids = METRIC_CARDS.map(c => c.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // The lookup helpers the app uses must actually resolve.
    expect(formulaFor(ids[0])).toBe(METRIC_CARDS[0].formula);
    expect(provenanceFor("nope")).toBeNull();
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

  test("the WR column is a WITHDRAWAL rate, not a spending rate", () => {
    // Reported by u/garylapointe: the WR column read 17.8% in a year whose actual
    // draw was $26K. 17.8% was his $100,000 SPENDING over the portfolio — his
    // pension covered ~$81K of it. Two defects in one expression:
    // `r.spending / r.totalPort` used spending as the numerator AND the END-of-year
    // balance as the denominator, so a plan drawing under 5% displayed as 17.8%.
    //
    // The same tab already computed this correctly for the "Avg. Withdrawal Rate"
    // card, so one page carried two withdrawal rates that disagreed fourfold. Both
    // now come from `wrAt`.
    expect(RENDERED).not.toMatch(/spending\s*\/\s*r?\.?totalPort/);
    // And the one definition must exist and be draw-over-start-of-year.
    expect(RENDERED).toContain("r.totalWithdrawal / startPort");
  });

  test("money in metric cards goes through fmtDollar, not inline toLocaleString", () => {
    // CLAUDE.md: one money helper. Inline formatting is how an actual abbreviator
    // slipped in unnoticed in v1.2.37.
    const badMv = RENDERED.match(/className="mv"[^>]*>\s*\$\{?[a-zA-Z.]+\.toLocaleString\(\)/g) || [];
    expect(badMv).toEqual([]);
  });
});
