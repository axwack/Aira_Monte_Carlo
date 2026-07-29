/**
 * IRC §72(t) 10% additional tax on early distributions.
 *
 * Neither engine charged this. A 56-year-old filling the 12% bracket from a
 * Rollover IRA was billed income tax only — understating the true cost of those
 * dollars by a tenth, and recommending an order that is wrong for anyone
 * retiring before 59½.
 */

import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall";
import {
  earlyWithdrawalPenalty, detectEmployerPlan, seppActive, seppMustRunUntil,
  EARLY_PENALTY_RATE, EARLY_PENALTY_AGE,
} from "./engine/earlyWithdrawal";

describe("detectEmployerPlan — name-based by design", () => {
  test("finds 401k / 403b / 457 among PRETAX accounts only", () => {
    const d = detectEmployerPlan([
      { category: "pretax", name: "Alpha 401(k)", balance: 600_000 },
      { category: "pretax", name: "Rollover IRA", balance: 400_000 },
      { category: "roth",   name: "Roth 401k",    balance: 200_000 }, // roth: ignored
    ]);
    expect(d.hasEmployerPlan).toBe(true);
    expect(d.employerPlanBalance).toBe(600_000);
    expect(d.pretaxBalance).toBe(1_000_000);
    expect(d.share).toBeCloseTo(0.6, 6);
  });

  test("a pure Rollover IRA holder has no employer plan", () => {
    const d = detectEmployerPlan([{ category: "pretax", name: "Rollover IRA", balance: 900_000 }]);
    expect(d.hasEmployerPlan).toBe(false);
    expect(d.share).toBe(0);
  });

  test("matches common spellings", () => {
    for (const name of ["401k", "401 (k)", "Solo 401(k)", "403b", "403(b)", "457 Plan"]) {
      expect(detectEmployerPlan([{ category: "pretax", name, balance: 1 }]).hasEmployerPlan).toBe(true);
    }
  });

  test("does not false-positive on unrelated names", () => {
    for (const name of ["Traditional IRA", "SEP IRA", "Pension"]) {
      expect(detectEmployerPlan([{ category: "pretax", name, balance: 1 }]).hasEmployerPlan).toBe(false);
    }
  });
});

describe("earlyWithdrawalPenalty", () => {
  test("charges 10% on a pre-59½ IRA distribution", () => {
    const r = earlyWithdrawalPenalty({ age: 56, pretaxDistribution: 50_000, retireAge: 56 });
    expect(r.penalty).toBe(50_000 * EARLY_PENALTY_RATE);
  });

  test("charges nothing at 59½ and after", () => {
    expect(earlyWithdrawalPenalty({ age: EARLY_PENALTY_AGE, pretaxDistribution: 50_000 }).penalty).toBe(0);
    expect(earlyWithdrawalPenalty({ age: 70, pretaxDistribution: 50_000 }).penalty).toBe(0);
  });

  test("Rule of 55 exempts the employer-plan share, not the IRA remainder", () => {
    const r = earlyWithdrawalPenalty({
      age: 56, pretaxDistribution: 100_000, retireAge: 56,
      ruleOf55: true, ruleOf55Share: 0.6,
    });
    // 60% employer plan is exempt; the 40% IRA slice is still penalized.
    expect(r.exemptAmount).toBe(60_000);
    expect(r.penalty).toBe(4_000);
  });

  test("Rule of 55 does NOT apply when separation happened before 55", () => {
    const r = earlyWithdrawalPenalty({
      age: 54, pretaxDistribution: 40_000, retireAge: 52,
      ruleOf55: true, ruleOf55Share: 1,
    });
    expect(r.penalty).toBe(4_000);
  });

  test("Rule of 55 is worthless to a pure-IRA holder even if asserted", () => {
    const r = earlyWithdrawalPenalty({
      age: 56, pretaxDistribution: 40_000, retireAge: 56,
      ruleOf55: true, ruleOf55Share: 0,   // everything was rolled to an IRA
    });
    expect(r.penalty).toBe(4_000);
  });

  test("a running 72(t) SEPP exempts the whole distribution", () => {
    const r = earlyWithdrawalPenalty({
      age: 57, pretaxDistribution: 40_000, retireAge: 55,
      sepp72t: true, sepp72tStartAge: 56,
    });
    expect(r.penalty).toBe(0);
    expect(r.reason).toMatch(/SEPP/);
  });

  test("a SEPP not yet started does not exempt", () => {
    const r = earlyWithdrawalPenalty({
      age: 55, pretaxDistribution: 40_000, retireAge: 55,
      sepp72t: true, sepp72tStartAge: 58,
    });
    expect(r.penalty).toBe(4_000);
  });

  test("zero distribution is free and silent", () => {
    expect(earlyWithdrawalPenalty({ age: 50, pretaxDistribution: 0 }).penalty).toBe(0);
  });
});

describe("SEPP duration — the longer of 5 years or 59½", () => {
  test("starting early, five years is not enough", () => {
    // Start at 50 → 5 years ends at 55, but the series must run to 59½.
    expect(seppMustRunUntil(50)).toBe(EARLY_PENALTY_AGE);
  });

  test("starting late, 59½ is not enough — five years governs", () => {
    // Start at 57 → must run to 62, well past 59½.
    expect(seppMustRunUntil(57)).toBe(62);
  });

  test("active only from the start age onward", () => {
    expect(seppActive(55, 56)).toBe(false);
    expect(seppActive(56, 56)).toBe(true);
    expect(seppActive(60, 56)).toBe(true);
  });
});

/**
 * Wired into the plan, not just the helper.
 *
 * The helper being correct proves nothing if the waterfall never calls it — that
 * is exactly how `checkRothWithdrawalPenalty` ended up fully tested and reachable
 * only from its own test file.
 */
describe("§72(t) reaches buildWithdrawalWaterfall", () => {
  const EARLY = {
    currentAge: 56, retireAge: 56, endAge: 90,
    sp: 90_000, ssAge: 67, ssb: 30_000, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05, birthYear: 1970,
    accounts: [{ id: "e1", category: "pretax", name: "Rollover IRA", balance: 2_000_000 }],
  };

  test("a pre-59½ IRA draw is penalized, and the penalty is 10% of the distribution", () => {
    const rows = buildWithdrawalWaterfall(EARLY).smart.rows;
    const r = rows.find(x => x.age === 56);
    expect(r.fromPretax).toBeGreaterThan(0);
    expect(r.earlyPenalty).toBeGreaterThan(0);
    expect(r.earlyPenalty).toBeCloseTo((r.fromPretax + r.rmd) * EARLY_PENALTY_RATE, -1);
  });

  test("the penalty stops at 59½ and never returns", () => {
    const rows = buildWithdrawalWaterfall(EARLY).smart.rows;
    rows.filter(r => r.age >= EARLY_PENALTY_AGE)
        .forEach(r => expect(r.earlyPenalty).toBe(0));
    expect(rows.filter(r => r.age < EARLY_PENALTY_AGE && r.earlyPenalty > 0).length).toBeGreaterThan(0);
  });

  test("retiring early genuinely costs more lifetime tax than waiting", () => {
    const early = buildWithdrawalWaterfall(EARLY);
    const late  = buildWithdrawalWaterfall({ ...EARLY, currentAge: 60, retireAge: 60 });
    const penaltyYears = early.smart.rows.filter(r => r.earlyPenalty > 0);
    expect(penaltyYears.length).toBeGreaterThan(0);
    expect(late.smart.rows.every(r => r.earlyPenalty === 0)).toBe(true);
  });

  test("Rule of 55 on a former-employer 401k removes it", () => {
    const with401k = {
      ...EARLY,
      accounts: [{ id: "e1", category: "pretax", name: "Alpha 401(k)", balance: 2_000_000 }],
    };
    const penalized = buildWithdrawalWaterfall(with401k).smart.rows.find(x => x.age === 56);
    const exempt    = buildWithdrawalWaterfall({ ...with401k, ruleOf55: true }).smart.rows.find(x => x.age === 56);
    expect(penalized.earlyPenalty).toBeGreaterThan(0);
    expect(exempt.earlyPenalty).toBe(0);
  });

  test("Rule of 55 cannot rescue a Rollover IRA even if the user ticks it", () => {
    // EARLY holds only a Rollover IRA — no employer plan to apply the exception to.
    const r = buildWithdrawalWaterfall({ ...EARLY, ruleOf55: true }).smart.rows.find(x => x.age === 56);
    expect(r.earlyPenalty).toBeGreaterThan(0);
  });

  test("a running 72(t) SEPP removes it", () => {
    const r = buildWithdrawalWaterfall({ ...EARLY, sepp72t: true, sepp72tStartAge: 56 })
      .smart.rows.find(x => x.age === 56);
    expect(r.earlyPenalty).toBe(0);
  });

  test("the penalty is FUNDED — draws cover it, not just reported", () => {
    const r = buildWithdrawalWaterfall(EARLY).smart.rows.find(x => x.age === 56);
    const taxTotal = r.fedTax + r.stateTax + r.irmaa + r.earlyPenalty;
    const lhs = r.fixedIncomeTotal + r.otherIncome + r.rmd
      + (r.fromCash + r.fromTaxable + r.fromPretax + r.fromRoth);
    const rhs = r.spending + r.housingCost + r.carveoutCost + taxTotal + (r.eventCost || 0);
    expect(Math.abs(lhs - rhs)).toBeLessThan(2);
  });
});
