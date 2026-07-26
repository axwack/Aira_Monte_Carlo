/**
 * Already-retired users: entering the age you ACTUALLY retired at must not
 * replay years that have already happened.
 *
 * Reported by a user (2026-07-26): "The age starting calculator only goes to 62.
 * What if already retired and 67 years old?"
 *
 * All three engines walk the drawdown as `age = retireAge … endAge` and map it
 * to calendar years via `BASE_YEAR + (age - currentAge)`, while account balances
 * are always TODAY's balances. So a 67-year-old who retired at 65 and enters 65
 * would start the projection two years in the PAST and draw two extra years of
 * spending out of a balance that already lived through them — the plan looks
 * worse than it is, and the year-by-year table lists years that already
 * happened. effectiveRetireAge clamps the start to currentAge.
 */

import { effectiveRetireAge, buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall";
import { runMC } from "./App";

describe("effectiveRetireAge", () => {
  test("a future retirement age is left alone", () => {
    expect(effectiveRetireAge(65, 50)).toBe(65);
    expect(effectiveRetireAge(70, 69)).toBe(70);
  });

  test("a past retirement age clamps to today", () => {
    expect(effectiveRetireAge(65, 67)).toBe(67);
    expect(effectiveRetireAge(55, 80)).toBe(80);
  });

  test("retiring exactly now is unchanged", () => {
    expect(effectiveRetireAge(67, 67)).toBe(67);
  });

  test("non-numeric input is passed through for the caller's own null handling", () => {
    expect(effectiveRetireAge(undefined, 67)).toBeUndefined();
    expect(effectiveRetireAge(65, null)).toBe(65);
  });
});

const RETIREE = {
  currentAge: 67,
  endAge: 90,
  sp: 70_000,
  ssAge: 67,
  ssb: 30_000,
  inf: 2.5,
  filingStatus: "mfj",
  stateOfResidence: "NJ",
  taxableBasisPct: 70,
  gr: 0.05,
  accounts: [
    { id: "1", category: "pretax",  name: "IRA",       balance: 900_000 },
    { id: "2", category: "roth",    name: "Roth",      balance: 200_000 },
    { id: "3", category: "taxable", name: "Brokerage", balance: 300_000 },
    { id: "4", category: "cash",    name: "Cash",      balance: 100_000 },
  ],
};

describe("buildWithdrawalWaterfall — already retired", () => {
  test("a past retire age produces the same plan as retiring today", () => {
    const enteredPast = buildWithdrawalWaterfall({ ...RETIREE, retireAge: 65 });
    const retiringNow = buildWithdrawalWaterfall({ ...RETIREE, retireAge: 67 });

    expect(enteredPast.smart.rows.length).toBe(retiringNow.smart.rows.length);
    expect(enteredPast.smart.rows[0].age).toBe(67);
    expect(enteredPast.summary).toEqual(retiringNow.summary);
  });

  test("the schedule never contains an age before today", () => {
    const r = buildWithdrawalWaterfall({ ...RETIREE, retireAge: 60 });
    expect(r.smart.rows.length).toBeGreaterThan(0);
    for (const row of r.smart.rows) expect(row.age).toBeGreaterThanOrEqual(67);
  });

  test("the schedule never contains a calendar year in the past", () => {
    const thisYear = new Date().getFullYear();
    const r = buildWithdrawalWaterfall({ ...RETIREE, retireAge: 60 });
    for (const row of r.smart.rows) expect(row.yr).toBeGreaterThanOrEqual(thisYear);
  });

  test("Social Security is recognized as already claimable at the clamped age", () => {
    // retireAge 60 < ssAge 67, but the user is 67 TODAY, so SS applies in year 1.
    // Keyed off the raw 60 this would have reported no SS income at all.
    const r = buildWithdrawalWaterfall({ ...RETIREE, retireAge: 60, ssAge: 67 });
    expect(r.smart.rows[0].ss).toBeGreaterThan(0);
  });

  test("a future retirement age is still honored (no clamping for pre-retirees)", () => {
    const r = buildWithdrawalWaterfall({ ...RETIREE, currentAge: 55, retireAge: 65 });
    expect(r.smart.rows[0].age).toBe(65);
  });
});

describe("runMC — already retired", () => {
  test("a past retire age yields the same success rate as retiring today", () => {
    const past = runMC({ ...RETIREE, retireAge: 65, port: 1_500_000 }, 90, 300, 42, true);
    const now  = runMC({ ...RETIREE, retireAge: 67, port: 1_500_000 }, 90, 300, 42, true);
    expect(past.rate).toBeCloseTo(now.rate, 10);
  });

  test("the percentile band starts at the user's current age, not the past", () => {
    const r = runMC({ ...RETIREE, retireAge: 62, port: 1_500_000 }, 90, 200, 42, true);
    const minAge = Math.min(...r.pcts.map((d) => d.age));
    expect(minAge).toBeGreaterThanOrEqual(67);
  });
});
