// Monte Carlo properties — TASKS 2026-10-30 item 3, the runMC half.
// Imports App's exported engine; edits nothing outside this file.
import { runMC } from "./App";

const P = {
  currentAge: 65, retireAge: 65, endAge: 90,
  sp: 80_000, ssAge: 67, ssb: 24_000, ssCola: 2.4,
  ab: 0, inf: 2.5, filingStatus: "mfj", stateOfResidence: "FL",
  twoHousehold: false, useJointRmdTable: false,
  gkFloor: 48_000, gkCeiling: 115_000, withdrawalBracketTarget: "22",
  irmaaGuard: false, ssTorpedoGuard: true, rothEmergencyReserve: 0, gr: 0.07,
  accounts: [
    { id: "t1", category: "pretax",  name: "401k",    balance: 1_000_000 },
    { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
    { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
    { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
  ],
};
const run = (p, seed = 42, n = 250) => runMC(p, 90, n, seed, true);

describe("seed determinism", () => {
  test("the same seed gives the same headline numbers and the same percentile paths", () => {
    const a = run(P, 42), b = run(P, 42);
    expect(b.rate).toBe(a.rate);
    expect(b.medR).toBe(a.medR);
    expect(b.term).toEqual(a.term);
    expect(b.pcts).toEqual(a.pcts);
  });

  test("a different seed moves the distribution", () => {
    const a = run(P, 42), b = run(P, 7);
    expect(b.pcts).not.toEqual(a.pcts);
  });
});

describe("spending monotonicity", () => {
  test("success never rises when planned spending rises", () => {
    const rates = [0, 60_000, 100_000, 150_000].map((sp) => run({ ...P, sp }).rate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThanOrEqual(rates[i - 1] + 1e-9);
  });

  test("a plan with no spending and no income never fails", () => {
    expect(run({ ...P, sp: 0, ssb: 0, ab: 0 }).rate).toBe(1);
  });
});

describe("failed paths", () => {
  const on = runMC({ ...P, sp: 120_000 }, 90, 300, 42, true, null, false, true);

  test("balances are never negative before the year a failure is recorded", () => {
    for (const f of Object.values({ w: on.failures.worst, t: on.failures.typical, c: on.failures.closest })) {
      const rows = f.rows;
      for (let i = 0; i < rows.length - 1; i++) {
        expect(rows[i].end).toBeGreaterThanOrEqual(0);
      }
      expect(rows.at(-1).end).toBeLessThanOrEqual(1);   // the year it ran out
      expect(rows.at(-1).age).toBe(f.exhaustAge);
    }
  });

  test("the drill-down never invents a draw larger than the year's spending plus tax", () => {
    for (const f of Object.values({ w: on.failures.worst, t: on.failures.typical, c: on.failures.closest })) {
      for (const r of f.rows) {
        expect(r.spend + r.tax + 1).toBeGreaterThanOrEqual(r.short);
      }
    }
  });
});
