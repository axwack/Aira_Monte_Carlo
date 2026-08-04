/**
 * Net Worth chart — the median lookup must never invent a number.
 *
 * THE BUG THIS PINS
 * -----------------
 * Reported 2026-08-03: a plan the engine scores at 99.2% success — median
 * $4,050,653 at age 68, rising to $10,974,327 at 90 — was drawn as a vertical
 * cliff to $0 at 68 and a flat $0 line through 90, with the summary card
 * announcing "Net worth at age 90: $0". Nothing distinguished that from a
 * portfolio that had genuinely died, and it is the kind of screen that would
 * talk someone out of a good plan.
 *
 * The chart did:
 *     const pctIndex = Math.min(age - retireAge, pcts.length - 1);
 *     port = pcts[pctIndex]?.p50 || 0;
 *
 * Two independent defects in two lines:
 *   • `|| 0` collapsed "really zero", "no data" and "NaN" into one value. NaN is
 *     falsy, so one broken input rendered as $0 for every year after it.
 *   • `Math.min` clamped past the end of the data, repeating the last row for
 *     every remaining age — fabricated years the summary card then quoted.
 */

import { mcMedianAtAge } from "./App";

// Shape runMC actually returns: each row carries its own `age`.
const PCTS = [
  { age: 54, p10: 1_000_000, p50: 2_000_000, p90: 3_000_000 },
  { age: 55, p10: 1_050_000, p50: 2_100_000, p90: 3_200_000 },
  { age: 56, p10: 1_100_000, p50: 2_250_000, p90: 3_500_000 },
];

describe("mcMedianAtAge — real figures", () => {
  test("returns the median for an age that exists", () => {
    expect(mcMedianAtAge(PCTS, 55, 54)).toBe(2_100_000);
  });

  test("matches on the row's own age, so a stale retireAge cannot shift it", () => {
    // `mc` computed at retireAge 54, but the profile now says 60. Positional
    // arithmetic would read index 55-60 = -5; age matching is immune.
    expect(mcMedianAtAge(PCTS, 55, 60)).toBe(2_100_000);
  });

  test("a genuine zero is still reported as zero, not null", () => {
    const dead = [{ age: 54, p50: 0 }];
    expect(mcMedianAtAge(dead, 54, 54)).toBe(0);
  });
});

describe("mcMedianAtAge — never fabricates", () => {
  test("past the end of the data returns null, NOT the clamped last row", () => {
    // THE regression: ages beyond the horizon used to repeat age 56's figure.
    expect(mcMedianAtAge(PCTS, 57, 54)).toBeNull();
    expect(mcMedianAtAge(PCTS, 90, 54)).toBeNull();
  });

  test("before the first row returns null", () => {
    expect(mcMedianAtAge(PCTS, 53, 54)).toBeNull();
  });

  test("NaN is null, not $0 — the reported failure mode", () => {
    const poisoned = [
      { age: 54, p50: 2_000_000 },
      { age: 55, p50: NaN },
      { age: 56, p50: NaN },
    ];
    expect(mcMedianAtAge(poisoned, 54, 54)).toBe(2_000_000);
    expect(mcMedianAtAge(poisoned, 55, 54)).toBeNull();
    expect(mcMedianAtAge(poisoned, 56, 54)).toBeNull();
    // The distinction that matters: null breaks the chart line and is labelled;
    // 0 draws a confident dead portfolio.
    expect(mcMedianAtAge(poisoned, 55, 54)).not.toBe(0);
  });

  test("undefined and Infinity are also null", () => {
    expect(mcMedianAtAge([{ age: 54, p50: undefined }], 54, 54)).toBeNull();
    expect(mcMedianAtAge([{ age: 54, p50: Infinity }], 54, 54)).toBeNull();
  });

  test("empty or missing pcts returns null instead of throwing", () => {
    expect(mcMedianAtAge([], 54, 54)).toBeNull();
    expect(mcMedianAtAge(undefined, 54, 54)).toBeNull();
    expect(mcMedianAtAge(null, 54, 54)).toBeNull();
  });
});

describe("mcMedianAtAge — legacy rows with no age field", () => {
  const LEGACY = [{ p50: 2_000_000 }, { p50: 2_100_000 }, { p50: 2_250_000 }];

  test("falls back to positional indexing from retireAge", () => {
    expect(mcMedianAtAge(LEGACY, 54, 54)).toBe(2_000_000);
    expect(mcMedianAtAge(LEGACY, 56, 54)).toBe(2_250_000);
  });

  test("but still refuses to clamp past the end", () => {
    expect(mcMedianAtAge(LEGACY, 57, 54)).toBeNull();
    expect(mcMedianAtAge(LEGACY, 90, 54)).toBeNull();
  });
});
