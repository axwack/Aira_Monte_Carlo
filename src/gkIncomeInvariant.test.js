/**
 * Guyton-Klinger must react to PORTFOLIO performance, not to scheduled income.
 *
 * User report (2026-07-26): adding a pension that grows $1,135/yr — roughly
 * $637k of extra lifetime income — LOWERED their median liquid balance at 100
 * from $3.5M to $3.1M and dropped success from 100% to 99.7%. They had ruled out
 * every tax explanation themselves: everything in Roth (so no RMD effect),
 * already at the 85% Social Security inclusion ceiling, and no bracket or IRMAA
 * effect could cost $600k.
 *
 * Cause: GK's Prosperity Rule raises spending 10% when the withdrawal rate falls
 * 20% below its baseline. AiRA nets income out of that rate, so a pension rising
 * on schedule was indistinguishable from investment outperformance and fired the
 * rule repeatedly — a $1,135 income increase could trigger a ~$9,000 spending
 * raise, compounding annually. The baseline was calibrated once at retirement
 * and never re-based, so the drift was permanent.
 *
 * The invariant below is the one that broke, and it is the real guard: more
 * income can never make the plan worse.
 */

import { buildWithdrawalWaterfall, gkReferenceWR } from "./engine/buildWithdrawalWaterfall";

const Y = new Date().getFullYear();

// Mirrors the reporter's setup: all-Roth retiree (so nothing here is a tax
// effect), spending untouched, GK guardrails active.
const ALL_ROTH = {
  currentAge: 67, retireAge: 67, endAge: 100,
  sp: 90_000, ssAge: 67, ssb: 40_000, inf: 2.5,
  filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
  accounts: [{ id: "1", category: "roth", name: "Roth", balance: 1_000_000 }],
};

const pension = (growthAmount) => ([{
  id: "p", name: "Pension", annual: 20_000, startYear: Y,
  taxable: true, growthMode: "fixed", growthAmount,
}]);

const finalPort = (r) => r.smart.rows.at(-1).totalPort;
const lifetimeIncome = (r) => r.smart.rows.reduce((s, x) => s + (x.otherIncome || 0), 0);

describe("gkReferenceWR", () => {
  test("at retirement it equals the classic initial withdrawal rate", () => {
    // cumInfl = 1 ⇒ (max(0, 90k − 40k) + 0) / 1,000,000 = 5%
    expect(gkReferenceWR({
      plannedSpend: 90_000, cumInfl: 1, incomeOffset: 40_000, fixedCosts: 0, portAtRetire: 1_000_000,
    })).toBeCloseTo(0.05, 10);
  });

  test("rising income lowers the reference, so it cancels rather than firing a raise", () => {
    const lo = gkReferenceWR({ plannedSpend: 90_000, cumInfl: 1, incomeOffset: 40_000, portAtRetire: 1_000_000 });
    const hi = gkReferenceWR({ plannedSpend: 90_000, cumInfl: 1, incomeOffset: 60_000, portAtRetire: 1_000_000 });
    expect(hi).toBeLessThan(lo);
  });

  test("income covering the whole plan yields 0, which disables the bands", () => {
    // guytonKlingerWithdrawal skips all adjustments when the reference is <= 0 —
    // without that, a near-zero reference makes the ±20% bands hypersensitive.
    expect(gkReferenceWR({ plannedSpend: 50_000, cumInfl: 1, incomeOffset: 80_000, portAtRetire: 1_000_000 })).toBe(0);
  });

  test("guards a zero or missing portfolio instead of dividing by it", () => {
    expect(gkReferenceWR({ plannedSpend: 90_000, portAtRetire: 0 })).toBe(0);
    expect(gkReferenceWR({ plannedSpend: 90_000 })).toBe(0);
  });
});

describe("more income never makes the plan worse", () => {
  test("a growing pension raises the ending balance (the reported bug)", () => {
    const flat = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(0) });
    const grow = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(1_135) });

    const extraIncome = lifetimeIncome(grow) - lifetimeIncome(flat);
    expect(extraIncome).toBeGreaterThan(500_000); // ~$637k, matching the report

    // Previously this went DOWN, because GK spent the income and then some.
    expect(finalPort(grow)).toBeGreaterThan(finalPort(flat));
  });

  test("most of the added income survives to the ending balance", () => {
    const flat = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(0) });
    const grow = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(1_135) });

    const extraIncome = lifetimeIncome(grow) - lifetimeIncome(flat);
    const extraWealth = finalPort(grow) - finalPort(flat);

    // Some legitimately funds higher spending — GK is a variable-spending rule
    // and a genuinely healthier portfolio should support more. But the bulk must
    // reach the balance; the bug absorbed ~62% of it and then some.
    expect(extraWealth).toBeGreaterThan(extraIncome * 0.5);
  });

  test("monotonic: each step up in pension growth improves the ending balance", () => {
    const ends = [0, 500, 1_135, 2_000].map(
      (g) => finalPort(buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(g) }))
    );
    for (let i = 1; i < ends.length; i++) expect(ends[i]).toBeGreaterThan(ends[i - 1]);
  });

  test("a larger flat pension also never lowers the ending balance", () => {
    const small = buildWithdrawalWaterfall({
      ...ALL_ROTH, otherIncomes: [{ id: "p", name: "P", annual: 10_000, startYear: Y, taxable: true }],
    });
    const large = buildWithdrawalWaterfall({
      ...ALL_ROTH, otherIncomes: [{ id: "p", name: "P", annual: 50_000, startYear: Y, taxable: true }],
    });
    expect(finalPort(large)).toBeGreaterThan(finalPort(small));
  });

  test("the reporter's exact shape: a $1 pension with a $1,135 increase still helps", () => {
    // They tried this variant specifically, to rule out a data-entry problem.
    const none = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: [] });
    const tiny = buildWithdrawalWaterfall({
      ...ALL_ROTH,
      otherIncomes: [{ id: "p", name: "P", annual: 1, startYear: Y, taxable: true, growthMode: "fixed", growthAmount: 1_135 }],
    });
    expect(finalPort(tiny)).toBeGreaterThan(finalPort(none));
  });
});
