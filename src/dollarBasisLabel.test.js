/**
 * The dollar-basis label, and the year it names.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `dollarBasisLabel` returned "Today's Dollars" while the module's own comment
 * says Real-$ figures are stated in the FIRST SIMULATED RETIREMENT YEAR, not
 * today. VerdictHeader and MCOverviewCards already printed the retirement year,
 * so the Forecast tab could show "2041 dollars", "Today's Dollars" and
 * "future $" for the very same figures. §41 A3 forbids exactly that phrasing,
 * and two existing tests already assert it never appears where the basis is
 * named.
 *
 * These pin the label itself, so the wrong phrasing cannot come back through
 * this function, and pin the shared year so VerdictHeader, MCOverviewCards and
 * the label cannot drift apart again.
 */
import { dollarBasisLabel, retirementBasisYear } from "./engine/mcSelectors.js";

describe("dollarBasisLabel", () => {
  test("names the retirement year for the Real-$ basis", () => {
    expect(dollarBasisLabel(true, 2041)).toBe("2041 dollars");
  });

  test("accepts a numeric string year (callers pass ages/years loosely)", () => {
    expect(dollarBasisLabel(true, "2041")).toBe("2041 dollars");
  });

  test("nominal basis says future dollars, with or without a year", () => {
    expect(dollarBasisLabel(false, 2041)).toBe("Future dollars");
    expect(dollarBasisLabel(false)).toBe("Future dollars");
  });

  test("with no usable year it stays honest rather than inventing a date", () => {
    ["Retirement-year dollars", "Retirement-year dollars", "Retirement-year dollars"].forEach((expected, i) => {
      expect(dollarBasisLabel(true, [undefined, null, "nope"][i])).toBe(expected);
    });
  });

  test("never says \"today's dollars\" — the basis has never been today (§41 A3)", () => {
    for (const year of [undefined, null, 0, -1, NaN, "nope", 2041, "2041"]) {
      expect(dollarBasisLabel(true, year)).not.toMatch(/today's dollars/i);
      expect(dollarBasisLabel(false, year)).not.toMatch(/today's dollars/i);
    }
  });

  test("an AGE is not a year — it must never print \"50 dollars\"", () => {
    // Two call sites pass pcts[0].age today. Until they pass a year the label
    // has to stay honest rather than render an age as a date.
    expect(dollarBasisLabel(true, 50)).toBe("Retirement-year dollars");
    expect(dollarBasisLabel(true, 65)).toBe("Retirement-year dollars");
    expect(dollarBasisLabel(true, 999999)).toBe("Retirement-year dollars");
  });
});

describe("retirementBasisYear", () => {
  test("counts the years to retirement onto the current year", () => {
    expect(retirementBasisYear(50, 65, 2026)).toBe(2041);
    expect(retirementBasisYear(45, 60, 2026)).toBe(2041);
  });

  test("an already-retired household reads the current year, never the past", () => {
    expect(retirementBasisYear(65, 65, 2026)).toBe(2026);
    expect(retirementBasisYear(70, 65, 2026)).toBe(2026);
  });

  test("no retirement age means no year, not a fabricated one", () => {
    expect(retirementBasisYear(50, null, 2026)).toBeNull();
    expect(retirementBasisYear(50, undefined, 2026)).toBeNull();
    expect(retirementBasisYear(50, "nope", 2026)).toBeNull();
  });

  test("no current age falls back to retireAge, which reads as the current year", () => {
    expect(retirementBasisYear(null, 65, 2026)).toBe(2026);
    expect(retirementBasisYear(undefined, 65, 2026)).toBe(2026);
  });

  test("its output is what the label expects", () => {
    expect(dollarBasisLabel(true, retirementBasisYear(50, 65, 2026))).toBe("2041 dollars");
  });
});
