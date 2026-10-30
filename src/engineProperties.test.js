// Engine properties — TASKS 2026-10-30 item 3.
// Table-driven invariants that must hold for every plan, not one fixture:
// determinism, monotone need, non-negative balances, and a closed balance sheet.
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

const BASE = {
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

const spendLevels = [0, 40_000, 60_000, 80_000, 100_000, 140_000];
const horizons = [
  { label: "mid-life retiree", currentAge: 55, retireAge: 65, endAge: 95 },
  { label: "retires today",    currentAge: 65, retireAge: 65, endAge: 90 },
  { label: "already retired",  currentAge: 72, retireAge: 62, endAge: 92 },
];
const plans = horizons.flatMap((h) => spendLevels.map((sp) => ({ ...BASE, ...h, sp })));
const rowsOf = (p) => buildWithdrawalWaterfall(p).smart.rows;
const label = (p) => `${p.currentAge}/${p.retireAge}/${p.endAge} sp=${p.sp}`;

describe("determinism", () => {
  test.each(plans.map((p) => [label(p), p]))("same inputs, same rows: %s", (_l, p) => {
    expect(rowsOf(p)).toEqual(rowsOf(p));
  });
});

describe("need is monotone in planned spending", () => {
  test("a plan that spends more never needs less from the portfolio", () => {
    for (const h of horizons) {
      let prev = -Infinity;   // income can exceed spending, so the first need may be negative
      for (const sp of spendLevels) {
        const row = rowsOf({ ...BASE, ...h, sp })[0];
        const need = row.spending + row.housingCost + row.carveoutCost - row.fixedIncomeTotal;
        expect(need).toBeGreaterThanOrEqual(prev);
        prev = need;
      }
    }
  });
});

describe("balances", () => {
  test.each(plans.map((p) => [label(p), p]))("never negative, never NaN: %s", (_l, p) => {
    for (const row of rowsOf(p)) {
      for (const k of ["cashEnd", "taxableEnd", "pretaxEnd", "rothEnd", "totalPort"]) {
        expect(Number.isFinite(row[k])).toBe(true);
        expect(row[k]).toBeGreaterThanOrEqual(-1);   // rounding tolerance only
      }
    }
  });

  test.each(plans.map((p) => [label(p), p]))("the four buckets close to the total: %s", (_l, p) => {
    for (const row of rowsOf(p)) {
      const sum = row.cashEnd + row.taxableEnd + row.pretaxEnd + row.rothEnd;
      expect(Math.abs(sum - row.totalPort)).toBeLessThanOrEqual(2);
    }
  });
});

describe("horizon", () => {
  test.each(plans.map((p) => [label(p), p]))("one row per retirement year, ending at endAge: %s", (_l, p) => {
    const rows = rowsOf(p);
    const first = Math.max(p.currentAge, p.retireAge);
    expect(rows[0].age).toBe(first);
    expect(rows[rows.length - 1].age).toBe(p.endAge);
    expect(rows).toHaveLength(p.endAge - first + 1);
  });
});
