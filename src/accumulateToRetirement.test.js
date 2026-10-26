/**
 * Flat "return until retirement" inside the waterfall engine
 * (Stress Lab, handoff 2026-10-26 item 1).
 *
 * The assumption exists so the Withdrawal Plan tab and the Monte Carlo beside
 * it describe the same investor. runMC applies one flat rate to all four of its
 * buckets in the accumulation years; accumulateToRetirement used to ignore the
 * field entirely, so a user who typed 5% saw the chart keep its old numbers.
 *
 * Three things have to hold, and they are the three tests below:
 *   1. unset (blank / missing / junk) is bit-identical to today — no quiet 0%;
 *   2. 0% with no contributions leaves every balance at today's amount, which
 *      is only true if the flat rate also replaces the cash bucket's own rate;
 *   3. 5% compounds for exactly `retireAge - currentAge` years.
 */

import { accumulateToRetirement } from "./engine/buildWithdrawalWaterfall.js";

// No contributions and no cash-flow events, so growth is the ONLY thing that
// moves a balance — otherwise "0% leaves the balance alone" could pass on a
// year of savings rather than on the rate the test is about.
const P = {
  currentAge: 55,
  retireAge: 65,          // ⇒ 10 accumulation years
  accounts: [
    { id: "a", category: "pretax", name: "IRA", balance: 800_000 },
    { id: "b", category: "roth", name: "Roth", balance: 50_000 },
    { id: "c", category: "taxable", name: "Brokerage", balance: 150_000 },
    { id: "d", category: "cash", name: "Cash", balance: 100_000 },
  ],
};

const total = (r) => r.pretax0 + r.roth0 + r.taxable0 + r.cash0;

describe("accumulateToRetirement honors preRetireReturn", () => {
  test("unset — blank, null, missing, non-numeric — reproduces today exactly", () => {
    const base = accumulateToRetirement(P);
    for (const v of [undefined, null, "", "abc"]) {
      const r = accumulateToRetirement({ ...P, preRetireReturn: v });
      expect(r).toEqual(base);
    }
  });

  test("0% with no contributions leaves every balance at today's amount", () => {
    const r = accumulateToRetirement({ ...P, preRetireReturn: 0 });
    expect(r.pretax0).toBe(800_000);
    expect(r.roth0).toBe(50_000);
    expect(r.taxable0).toBe(150_000);
    // The one that would fail if the flat rate skipped cash: cash's own
    // default (3%) would have grown this to 103,000.
    expect(r.cash0).toBe(100_000);
    expect(r.total).toBe(1_100_000);
  });

  test("5% compounds for retireAge - currentAge years", () => {
    const r = accumulateToRetirement({ ...P, preRetireReturn: 5 });
    const n = P.retireAge - P.currentAge;
    expect(total(r)).toBeCloseTo(1_100_000 * 1.05 ** n, 6);
    // Per bucket, so a rate applied to some accounts and not others is caught.
    expect(r.pretax0).toBeCloseTo(800_000 * 1.05 ** n, 6);
    expect(r.roth0).toBeCloseTo(50_000 * 1.05 ** n, 6);
    expect(r.taxable0).toBeCloseTo(150_000 * 1.05 ** n, 6);
    expect(r.cash0).toBeCloseTo(100_000 * 1.05 ** n, 6);
  });

  test("a numeric string means the same rate as the number", () => {
    const a = accumulateToRetirement({ ...P, preRetireReturn: 5 });
    const b = accumulateToRetirement({ ...P, preRetireReturn: "5" });
    expect(b).toEqual(a);
  });

  test("the flat rate overrides gr and the cash return, and contributions still land", () => {
    const r = accumulateToRetirement({ ...P, preRetireReturn: 0, gr: 0.07, cashRealReturn: 9, taxableContrib: 1_000 });
    // 10 years of a 1,000/yr taxable contribution, no growth on anything.
    expect(r.taxable0).toBe(150_000 + 10_000);
    expect(r.total).toBe(1_110_000);
  });
});
