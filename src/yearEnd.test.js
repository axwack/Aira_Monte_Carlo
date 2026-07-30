/**
 * Year-end deadline helpers.
 *
 * Tax room is use-it-or-lose-it on Dec 31 — a conversion must SETTLE, not merely
 * be requested. These are pure so the trigger window and room math are provable
 * without a clock or a DOM.
 */

import { isYearEndWindow, daysLeftInTaxYear, yearEndTaxRoom } from "./engine/yearEnd";
import { getBracketCeiling, getIrmaaCeiling } from "./App";

describe("isYearEndWindow — December only", () => {
  test("true throughout December", () => {
    expect(isYearEndWindow(new Date(2026, 11, 1))).toBe(true);
    expect(isYearEndWindow(new Date(2026, 11, 31))).toBe(true);
  });

  test("false in every other month", () => {
    for (let m = 0; m < 11; m++) {
      expect(isYearEndWindow(new Date(2026, m, 15))).toBe(false);
    }
  });
});

describe("daysLeftInTaxYear", () => {
  test("counts down through December", () => {
    expect(daysLeftInTaxYear(new Date(2026, 11, 31, 9, 0))).toBe(1);
    expect(daysLeftInTaxYear(new Date(2026, 11, 24, 9, 0))).toBe(8);
  });

  test("never goes negative", () => {
    expect(daysLeftInTaxYear(new Date(2026, 11, 31, 23, 59, 59, 999))).toBe(0);
  });

  test("is large early in the year", () => {
    expect(daysLeftInTaxYear(new Date(2026, 0, 1))).toBeGreaterThan(360);
  });
});

describe("yearEndTaxRoom", () => {
  const deps = {
    bracketCeiling: getBracketCeiling,
    irmaaCeiling: getIrmaaCeiling,
    filingStatus: "mfj",
    target: "22",
  };

  test("reports honestly when there is no row for the year", () => {
    const r = yearEndTaxRoom([], { year: 2026, ...deps });
    expect(r.hasData).toBe(false);
    // Must explain WHY rather than render a misleading $0 of room.
    expect(r.reason).toMatch(/wage income/i);
  });

  test("computes bracket and IRMAA room from the year's row", () => {
    const rows = [{ yr: 2026, taxableIncome: 150_000, magi: 180_000, conversionAmount: 0 }];
    const r = yearEndTaxRoom(rows, { year: 2026, ...deps });
    expect(r.hasData).toBe(true);
    expect(r.bracketRoom).toBe(211_400 - 150_000);
    expect(r.irmaaRoom).toBe(218_000 - 180_000);
  });

  test("conversion room takes the TIGHTER of the two ceilings", () => {
    // IRMAA binds: only $8k of MAGI headroom despite $61k of bracket room.
    const rows = [{ yr: 2026, taxableIncome: 150_000, magi: 210_000 }];
    const r = yearEndTaxRoom(rows, { year: 2026, ...deps });
    expect(r.conversionRoom).toBe(8_000);
    expect(r.bindingConstraint).toBe("irmaa");
  });

  test("names the bracket as binding when it is the tighter one", () => {
    const rows = [{ yr: 2026, taxableIncome: 205_000, magi: 120_000 }];
    const r = yearEndTaxRoom(rows, { year: 2026, ...deps });
    expect(r.bindingConstraint).toBe("bracket");
    expect(r.conversionRoom).toBe(211_400 - 205_000);
  });

  test("room floors at zero once a ceiling is already breached", () => {
    const rows = [{ yr: 2026, taxableIncome: 400_000, magi: 500_000 }];
    const r = yearEndTaxRoom(rows, { year: 2026, ...deps });
    expect(r.bracketRoom).toBe(0);
    expect(r.irmaaRoom).toBe(0);
    expect(r.conversionRoom).toBe(0);
  });

  test("surfaces what was already converted, so the prompt does not double-count", () => {
    const rows = [{ yr: 2026, taxableIncome: 150_000, magi: 180_000, conversionAmount: 40_000 }];
    expect(yearEndTaxRoom(rows, { year: 2026, ...deps }).alreadyConverted).toBe(40_000);
  });
});
