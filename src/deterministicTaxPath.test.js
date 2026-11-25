import { simulateDeterministicWithStrategy } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { scheduleSpendForYear } from "./engine/expenseImport.js";
import { spendingSmileFactor } from "./engine/expenses.js";

const P = {
  currentAge: 60, retireAge: 60, endAge: 90,
  port: 1_500_000, contrib: 0, inf: 2.5, sp: 80_000,
  ssAge: 67, ssb: 30_000, ssCola: 2.4, ab: 0, abReliability: 100,
  eqPct: 60, filingStatus: "mfj", stateOfResidence: "NJ", birthYear: 1966,
  gkFloor: 60_000, gkCeiling: 120_000, fixedWithdrawalRate: 0.04,
  accounts: [
    { id: "a1", category: "pretax",  name: "401k", balance: 900_000 },
    { id: "a2", category: "taxable", name: "Brok", balance: 400_000 },
    { id: "a3", category: "roth",    name: "Roth", balance: 200_000 },
  ],
};

const sim = (extra, s) => simulateDeterministicWithStrategy({ ...P, ...extra, withdrawalStrategy: s }, 2.5, s);
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);

describe("Tax columns describe the strategy that is on screen", () => {
  test("strategies with materially different draws do NOT all show the same tax", () => {
    const taxes = ["gk", "bengen", "fixed", "ninety_five_rule", "vpw"].map(
      (s) => Math.round(sum(sim({}, s).schedule, "totalTax"))
    );
    expect(new Set(taxes).size).toBeGreaterThan(1);
  });

  test("the biggest and smallest spending plans do not pay identical tax", () => {
    const vpw = sim({}, "vpw").schedule;
    const n95 = sim({}, "ninety_five_rule").schedule;
    expect(sum(vpw, "spending")).toBeGreaterThan(sum(n95, "spending") * 1.2);
    expect(Math.round(sum(vpw, "totalTax"))).not.toBe(Math.round(sum(n95, "totalTax")));
  });

  test("each strategy's tax is the waterfall's tax for that strategy's own spending", () => {
    for (const s of ["gk", "bengen", "fixed", "ninety_five_rule", "vpw"]) {
      const det = sim({}, s).schedule;
      const preSmile = det.map((r) => ({
        year: r.yr,
        amount: Math.round(r.spending / spendingSmileFactor(r.age, P.retireAge, true)),
      }));
      const wf = buildWithdrawalWaterfall({ ...P, spSchedule: preSmile });
      const byAge = new Map(wf.smart.rows.map((r) => [r.age, r.totalTax || 0]));
      const shown = sum(det, "totalTax");
      const expected = det.reduce((a, r) => a + (byAge.get(r.age) ?? 0), 0);
      expect(Math.abs(shown - expected)).toBeLessThan(Math.max(2_000, shown * 0.01));
    }
  });

  test("a strategy that draws more from PRE-TAX money pays more tax", () => {
    const allPretax = { accounts: [{ id: "x", category: "pretax", name: "401k", balance: 1_500_000 }] };
    const rothHeavy = {
      accounts: [
        { id: "y1", category: "pretax", name: "401k", balance: 300_000 },
        { id: "y2", category: "roth",   name: "Roth", balance: 1_200_000 },
      ],
    };
    const a = sum(sim(allPretax, "bengen").schedule, "totalTax");
    const b = sum(sim(rothHeavy, "bengen").schedule, "totalTax");
    expect(a).toBeGreaterThan(b);
  });
});

describe("Trap 1: the smile is applied once, not twice", () => {
  test("spending with the smile ON is exactly ONE smile factor below smile OFF", () => {
    const on  = sim({ smile: true  }, "bengen").schedule;
    const off = sim({ smile: false }, "bengen").schedule;
    for (const i of [0, 5, 10, 15, 20, 25]) {
      if (!on[i] || !off[i]) continue;
      const factor = spendingSmileFactor(on[i].age, P.retireAge, true);
      const ratio = on[i].spending / off[i].spending;
      expect(ratio).toBeCloseTo(factor, 3);
      if (Math.abs(factor - factor * factor) > 0.01) {
        expect(Math.abs(ratio - factor * factor)).toBeGreaterThan(0.005);
      }
    }
  });

  test("the second pass does not shrink the spending the first pass found", () => {
    const rows = sim({}, "bengen").schedule;
    const inflY = 0.025;
    for (const i of [1, 5, 10, 20]) {
      if (!rows[i]) continue;
      const expected = P.sp * Math.pow(1 + inflY, i) * spendingSmileFactor(rows[i].age, P.retireAge, true);
      expect(rows[i].spending).toBeCloseTo(expected, -1);
    }
  });
});

describe("Trap 2: the fed-back schedule is not re-inflated", () => {
  test("a schedule covering every year returns each amount verbatim", () => {
    const sched = [
      { year: 2030, amount: 100_000 },
      { year: 2031, amount: 110_000 },
      { year: 2032, amount: 120_000 },
    ];
    expect(scheduleSpendForYear(sched, 2030, 2.5)).toBe(100_000);
    expect(scheduleSpendForYear(sched, 2031, 2.5)).toBe(110_000);
    expect(scheduleSpendForYear(sched, 2032, 2.5)).toBe(120_000);
  });

  test("but a GAP past the last entry DOES inflate — which is why coverage matters", () => {
    const sched = [{ year: 2030, amount: 100_000 }];
    expect(scheduleSpendForYear(sched, 2032, 2.5)).toBeGreaterThan(100_000);
    expect(scheduleSpendForYear(sched, 2032, 2.5)).toBe(Math.round(100_000 * 1.025 ** 2));
  });

  test("a non-portfolio-linked strategy still tracks plain inflation end to end", () => {
    const rows = sim({ smile: false }, "bengen").schedule;
    expect(rows[20].spending / rows[0].spending).toBeCloseTo(1.025 ** 20, 2);
  });
});

describe("Two-pass restructure leaves the rest of the schedule intact", () => {
  test("a user's own detailed budget short-circuits pass 2 and is not clobbered", () => {
    const budget = [];
    for (let y = 0; y < 30; y++) budget.push({ year: 2026 + y, amount: 70_000 + y * 1_000 });
    const frozen = JSON.parse(JSON.stringify(budget));
    const rows = sim({ spSchedule: budget, smile: false }, "vpw").schedule;
    expect(budget).toEqual(frozen);
    expect(rows[0].spending).toBeCloseTo(70_000, -1);
    expect(rows[5].spending).toBeCloseTo(75_000, -1);
  });

  test("the schedule is deterministic — same input, same output", () => {
    for (const s of ["gk", "fixed", "vpw"]) {
      expect(sim({}, s).schedule).toEqual(sim({}, s).schedule);
    }
  });

  test("every row still carries a complete, finite set of columns", () => {
    for (const s of ["gk", "bengen", "fixed", "ninety_five_rule", "vpw"]) {
      const rows = sim({}, s).schedule;
      expect(rows.length).toBeGreaterThan(20);
      for (const r of rows) {
        for (const k of ["age", "yr", "spending", "portfolioDraw", "fedTax", "stateTax", "irmaa", "totalTax", "totalWithdrawal", "portfolioEnd"]) {
          expect(Number.isFinite(r[k])).toBe(true);
        }
        expect(r.totalTax).toBeGreaterThanOrEqual(0);
        expect(r.totalWithdrawal).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("the tax-drag master toggle still zeroes every tax column", () => {
    const rows = sim({ tax: false }, "vpw").schedule;
    expect(sum(rows, "totalTax")).toBe(0);
    expect(sum(rows, "fedTax")).toBe(0);
    expect(sum(rows, "stateTax")).toBe(0);
    expect(sum(rows, "irmaa")).toBe(0);
  });

  test("Smart Waterfall is untouched — it reads the waterfall rows directly", () => {
    const rows = simulateDeterministicWithStrategy({ ...P, withdrawalStrategy: "smart" }, 2.5, "smart").schedule;
    const wf = buildWithdrawalWaterfall(P);
    expect(rows.length).toBe(wf.smart.rows.length);
    expect(Math.round(sum(rows, "totalTax"))).toBe(Math.round(sum(wf.smart.rows, "totalTax")));
  });

  test("a portfolio with no accounts configured still produces a schedule", () => {
    const rows = simulateDeterministicWithStrategy(
      { ...P, accounts: [], withdrawalStrategy: "gk" }, 2.5, "gk"
    ).schedule;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Number.isFinite(r.totalTax)).toBe(true);
  });
});
