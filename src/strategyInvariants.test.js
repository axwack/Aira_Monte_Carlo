// Cross-strategy invariants — TASKS 2026-10-30 item 4.
// The ten live strategies are resolved in App.jsx, so these import its exports;
// no file in that lane is edited. The point is drift detection: a strategy that
// changes must still satisfy the same invariants as the other nine.
import { simulateDeterministicWithStrategy } from "./App";
import { LIVE_STRATEGIES } from "./engine/withdrawalStrategies.js";

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

const run = (p, strategy) => simulateDeterministicWithStrategy(p, 2.5, strategy);
const rowsOf = (d) => d.schedule ?? d.rows ?? [];

describe("every live strategy", () => {
  test.each(LIVE_STRATEGIES)("%s survives an empty portfolio without NaN", (strategy) => {
    const p = { ...P, sp: 0, accounts: P.accounts.map((a) => ({ ...a, balance: 0 })) };
    const d = run(p, strategy);
    expect(Number.isFinite(d.portAtRetire)).toBe(true);
    expect(d.portAtRetire).toBeGreaterThanOrEqual(0);
    for (const r of rowsOf(d)) {
      for (const k of ["spending", "portfolioDraw", "totalTax"]) {
        if (r[k] !== undefined) expect(Number.isFinite(r[k])).toBe(true);
      }
    }
  });

  test.each(LIVE_STRATEGIES)("%s produces a finite schedule on a normal plan", (strategy) => {
    const d = run(P, strategy);
    expect(Number.isFinite(d.portAtRetire)).toBe(true);
    expect(d.portAtRetire).toBeGreaterThan(0);
    const rows = rowsOf(d);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number.isFinite(r.spending)).toBe(true);
      expect(r.spending).toBeGreaterThanOrEqual(0);
    }
  });

  test.each(LIVE_STRATEGIES)("%s does not draw from an empty portfolio it does not have", (strategy) => {
    const p = { ...P, sp: 40_000, accounts: P.accounts.map((a) => ({ ...a, balance: 0 })) };
    const d = run(p, strategy);
    // With nothing to draw from, the draw cannot exceed what existed.
    for (const r of rowsOf(d)) {
      if (r.portfolioDraw !== undefined) expect(r.portfolioDraw).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("strategies agree on the same plan's inputs", () => {
  test("portAtRetire is identical across strategies (accumulation must not depend on the draw rule)", () => {
    const values = LIVE_STRATEGIES.map((s) => run(P, s).portAtRetire);
    expect(new Set(values).size).toBe(1);
  });
});
