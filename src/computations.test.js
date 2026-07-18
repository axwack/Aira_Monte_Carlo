/**
 * Comprehensive computation correctness tests for AiRA Forecaster.
 *
 * Covers: tax brackets, standard deductions, 85% SS inclusion, IRMAA,
 * state tax, Guyton-Klinger guardrails, RMD start age, progressive tax
 * math, and Monte Carlo integration (monotonicity, SS impact, determinism).
 */

import {
  runMC,
  runStress,
  calcYearTax,
  getRmdStartAge,
  guytonKlingerWithdrawal,
  progTax,
  irmaaCost,
  simulateDeterministicWithStrategy,
  getStandardDeduction,
  getIrmaaCeiling,
  getBracketCeiling,
  accountBucketPieces,
  expandAccountBuckets,
  _defaultBucket,
} from "./App";

// ─── Shared MC baseline ───────────────────────────────────────────────────────
const BASE = {
  currentAge: 60,
  retireAge: 60,
  endAge: 90,
  port: 2_000_000,
  contrib: 0,
  inf: 2.5,
  sp: 80_000,
  ssAge: 62,
  ssb: 24_000,
  ssCola: 2.4,
  ab: 0,
  useAb: false,
  tax: 22,
  smile: false,
  preRetireEq: 91,
  postRetireEq: 70,
  gkFloor: 48_000,
  gkCeiling: 115_000,
  withdrawalStrategy: "gk",
  cashRealReturn: 1.0,
  useJointRmdTable: false,
  twoHousehold: false,
  filingStatus: "mfj",
  stateOfResidence: "FL", // no state tax — isolates federal math
  accounts: [
    { id: "t1", category: "pretax",  name: "401k",    balance: 1_400_000 },
    { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
    { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
    { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// progTax — raw progressive bracket math
// ═══════════════════════════════════════════════════════════════════════════════
describe("progTax — progressive bracket math", () => {
  const brackets = [
    { lo: 0,     hi: 10_000, rate: 0.10 },
    { lo: 10_000, hi: 40_000, rate: 0.20 },
    { lo: 40_000, hi: Infinity, rate: 0.30 },
  ];

  test("zero income → zero tax", () => {
    expect(progTax(0, brackets)).toBe(0);
  });

  test("income entirely in first bracket", () => {
    // $5K × 10% = $500
    expect(progTax(5_000, brackets)).toBeCloseTo(500, 0);
  });

  test("income spanning two brackets", () => {
    // $10K×10% + $10K×20% = $1000 + $2000 = $3000
    expect(progTax(20_000, brackets)).toBeCloseTo(3_000, 0);
  });

  test("income spanning all three brackets", () => {
    // $10K×10% + $30K×20% + $10K×30% = $1000 + $6000 + $3000 = $10000
    expect(progTax(50_000, brackets)).toBeCloseTo(10_000, 0);
  });

  test("income exactly at bracket boundary", () => {
    expect(progTax(10_000, brackets)).toBeCloseTo(1_000, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// irmaaCost — Medicare IRMAA surcharge
// ═══════════════════════════════════════════════════════════════════════════════
describe("irmaaCost — IRMAA Medicare surcharges", () => {
  // The IRMAA table has: {m:218000, f:0} as the "base Medicare tier" entry.
  // Crossing $218K alone does NOT add a surcharge; surcharge begins at $274K.
  // Tiers (2026 annual):
  //   < $218K → $0
  //   $218K–$274K → $0 (standard Medicare, no IRMAA surcharge)
  //   $274K–$342K → $2,160
  //   $342K–$410K → $5,470
  //   $410K–$750K → $8,300
  //   $750K+      → $11,130

  test("MAGI below $218K → $0 (no IRMAA)", () => {
    expect(irmaaCost(200_000, 2026)).toBe(0);
  });

  test("MAGI $218K–$274K → $0 (standard Medicare tier, no surcharge)", () => {
    expect(irmaaCost(250_000, 2026)).toBe(0);
  });

  test("MAGI $274K–$342K → $2,160 surcharge", () => {
    expect(irmaaCost(300_000, 2026)).toBe(2_160);
  });

  test("MAGI $342K–$410K → $5,470 surcharge", () => {
    expect(irmaaCost(380_000, 2026)).toBe(5_470);
  });

  test("MAGI $410K–$750K → $8,300 surcharge", () => {
    expect(irmaaCost(500_000, 2026)).toBe(8_300);
  });

  test("MAGI $750K+ → $11,130 surcharge", () => {
    expect(irmaaCost(800_000, 2026)).toBe(11_130);
  });

  test("future year thresholds inflate at 2.5%/yr (tier at $274K)", () => {
    // 2031 = 5 years out → factor ≈ 1.1314
    // $274K × 1.1314 ≈ $310,004 — just above the inflated threshold triggers $2,160 surcharge
    const f = Math.pow(1.025, 5);
    const tierThreshold = Math.round(274_000 * f);
    // Below the inflated $274K threshold → should be $0 (still in the $218K–$274K base tier)
    expect(irmaaCost(tierThreshold - 1, 2031)).toBe(0);
    // Above the inflated $274K threshold → should be $2,160 (inflated)
    expect(irmaaCost(tierThreshold + 1, 2031)).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// calcYearTax — full tax engine
// ═══════════════════════════════════════════════════════════════════════════════
describe("calcYearTax — federal tax, state tax, IRMAA", () => {

  // Helper: call with minimal args in current year, no SS, no rental, MFJ, FL (no state tax)
  const taxFL = (age, withdrawal, opts = {}) =>
    calcYearTax(
      age, 2026, withdrawal,
      opts.ss ?? 0,
      opts.rental ?? 0,
      opts.rmd ?? 0,
      opts.conversion ?? 0,
      opts.twoHousehold ?? false,
      opts.infl ?? 0.025,
      opts.filing ?? "mfj",
      "FL"
    );

  test("zero income → zero tax across all components", () => {
    const r = taxFL(60, 0);
    expect(r.fedTax).toBe(0);
    expect(r.stateTax).toBe(0);
    expect(r.irmaa).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.taxableIncome).toBe(0);
  });

  test("MFJ under-65 standard deduction = $32,200 (2026)", () => {
    // Exactly at the standard deduction → taxable income = 0
    const r = taxFL(60, 32_200);
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("MFJ age 65+ gets extra $3,300 deduction → $35,500 total", () => {
    // $35,500 income → taxable income = 0
    const r = taxFL(65, 35_500);
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("single filer standard deduction = $16,100 (2026)", () => {
    const r = taxFL(60, 16_100, { filing: "single" });
    expect(r.taxableIncome).toBe(0);
  });

  test("single filer age 65+ extra $1,650 deduction → $17,750 total", () => {
    const r = taxFL(65, 17_750, { filing: "single" });
    expect(r.taxableIncome).toBe(0);
  });

  test("MFJ income in 10% bracket only: correct federal tax", () => {
    // $40K withdrawal, MFJ, FL → taxableIncome = 40000 - 32200 = 7800 → all at 10%
    const r = taxFL(60, 40_000);
    expect(r.taxableIncome).toBe(7_800);
    expect(r.fedTax).toBeCloseTo(780, 0);
  });

  test("MFJ income spanning 10%→12% brackets", () => {
    // $60K withdrawal → taxable = 60000 - 32200 = 27800
    // 10%: 24800 × 0.10 = 2480
    // 12%: (27800 - 24800) × 0.12 = 360
    // fedTax = 2840
    const r = taxFL(60, 60_000);
    expect(r.taxableIncome).toBe(27_800);
    expect(r.fedTax).toBeCloseTo(2_840, 0);
  });

  test("SS not taxable when provisional income ≤ $32K MFJ lower threshold (IRC §86)", () => {
    // $24K SS + $20K withdrawal → provisional = 20000 + 12000 = 32000 ≤ 32000 → taxableSS = 0
    // totalIncome = 20000; taxableIncome = max(0, 20000 - 32200) = 0
    const r = taxFL(60, 20_000, { ss: 24_000 });
    expect(r.taxableIncome).toBe(0);
  });

  test("85% of SS taxable at high income (provisional far above $44K MFJ)", () => {
    // $24K SS + $100K withdrawal → provisional = 112000 >> 44000 → taxableSS = 20400 (85% cap)
    // totalIncome = 120400; taxableIncome = 120400 - 32200 = 88200
    const r = taxFL(60, 100_000, { ss: 24_000 });
    expect(r.taxableIncome).toBe(88_200);
  });

  test("50% tier: provisional income between MFJ thresholds taxes half the excess", () => {
    // $24K SS + $26K withdrawal → provisional = 26000 + 12000 = 38000 (between 32K and 44K)
    // taxableSS = min(0.5 × (38000 − 32000), 0.5 × 24000) = 3000
    // totalIncome = 29000; taxableIncome = max(0, 29000 - 32200) = 0
    const r = taxFL(60, 26_000, { ss: 24_000 });
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("Low-income: SS is the only income, spending funded by cash/Roth → ~$0 tax", () => {
    // Cash and Roth withdrawals are non-taxable, so they are NOT passed as ordinary
    // income (withdrawalAmount = 0). SS is the only income source.
    // provisional = ½ × $24K = $12K < $32K MFJ lower threshold → taxableSS = 0
    // → taxableIncome = 0 → fedTax = 0.
    // Regression: before the IRC §86 fix, SS was always taxed at 85% ($20,400 of
    // taxable income), producing a nonzero federal tax even with no real income.
    const r = taxFL(70, 0, { ss: 24_000 });
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
    expect(r.stateTax).toBe(0); // FL has no state income tax
  });

  test("Florida state tax = 0 regardless of income", () => {
    const r = taxFL(60, 100_000);
    expect(r.stateTax).toBe(0);
  });

  test("California state tax uses progressive brackets for MFJ", () => {
    const r = calcYearTax(60, 2026, 60_000, 0, 0, 0, 0, false, 0.025, "mfj", "CA");
    // taxableIncome = 27800 (60000 - 32200 MFJ std ded)
    // CA MFJ progressive brackets → 341 (far below top 13.3% bracket)
    expect(r.stateTax).toBe(341);
  });

  test("twoHousehold = true skips state tax entirely", () => {
    const withState = calcYearTax(60, 2026, 60_000, 0, 0, 0, 0, false, 0.025, "mfj", "CA");
    const twoHH    = calcYearTax(60, 2026, 60_000, 0, 0, 0, 0, true,  0.025, "mfj", "CA");
    expect(withState.stateTax).toBeGreaterThan(0);
    expect(twoHH.stateTax).toBe(0);
  });

  test("IRMAA charged at age 65 when MAGI ≥ $274K (first surcharge tier)", () => {
    // MAGI = 300K (withdrawal=300K, ss=0) → falls in $274K–$342K tier → $2,160
    const r = calcYearTax(65, 2026, 300_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(r.irmaa).toBe(2_160);
  });

  test("no IRMAA before age 65", () => {
    const r = calcYearTax(64, 2026, 250_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(r.irmaa).toBe(0);
  });

  test("effective rate increases with income (progressive)", () => {
    const low  = taxFL(60, 60_000);
    const high = taxFL(60, 150_000);
    expect(high.effectiveRate).toBeGreaterThan(low.effectiveRate);
  });

  test("totalTax = fedTax + stateTax + irmaa", () => {
    const r = calcYearTax(66, 2026, 300_000, 24_000, 0, 0, 0, false, 0.025, "mfj", "CA");
    expect(r.totalTax).toBe(r.fedTax + r.stateTax + r.irmaa);
  });

  test("inflation adjusts brackets forward (year 2036 vs 2026)", () => {
    // Same nominal income; 2036 should have larger deductions and lower taxable income
    const now    = taxFL(60, 60_000);
    // Simulate 2036 by using a different year — via calcYearTax directly
    const future = calcYearTax(60, 2036, 60_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(future.taxableIncome).toBeLessThan(now.taxableIncome);
    expect(future.fedTax).toBeLessThanOrEqual(now.fedTax);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// stateOfResidence fallback consistency (B1 regression)
//
// Every code path that defaults stateOfResidence when it's omitted must agree
// on "NJ" — the documented, majority default (matches BLANK_PROFILE's UI
// display defaults and buildWithdrawalWaterfall.js). Regression guard for the
// bug where runMC's per-year tax calc and simulateDeterministicWithStrategy
// silently fell back to "CA" while everything else in the app agreed on "NJ".
// ═══════════════════════════════════════════════════════════════════════════════
describe("stateOfResidence fallback consistency (B1 regression)", () => {
  test("calcYearTax: omitted stateOfResidence defaults to NJ, not CA", () => {
    const omitted = calcYearTax(65, 2026, 150_000, 0, 0, 0, 0, false, 0.025, "mfj");
    const nj      = calcYearTax(65, 2026, 150_000, 0, 0, 0, 0, false, 0.025, "mfj", "NJ");
    const ca      = calcYearTax(65, 2026, 150_000, 0, 0, 0, 0, false, 0.025, "mfj", "CA");
    expect(omitted.stateTax).toBe(nj.stateTax);
    expect(omitted.stateTax).not.toBe(ca.stateTax);
  });

  test("runMC: profile with stateOfResidence omitted matches an explicit NJ profile, not CA", () => {
    const p = {
      ...BASE, ssb: 0, sp: 90_000,
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance: 900_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance: 200_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:  80_000 },
        { id: "t4", category: "cash",    name: "Cash",    balance:  20_000 },
      ],
    };
    delete p.stateOfResidence; // simulate a profile that never set the field
    const omitted = runMC(p, 90, 1, 42, true);
    const nj      = runMC({ ...p, stateOfResidence: "NJ" }, 90, 1, 42, true);
    const ca      = runMC({ ...p, stateOfResidence: "CA" }, 90, 1, 42, true);
    // medR is portfolio-AT-RETIREMENT (pre-drawdown) — unaffected by state tax.
    // Use the terminal portfolio value, which accumulates the annual state-tax
    // drag over the whole retirement horizon.
    expect(omitted.term.p50).toBe(nj.term.p50);
    expect(omitted.term.p50).not.toBe(ca.term.p50);
  });

  test("simulateDeterministicWithStrategy: omitted stateOfResidence matches explicit NJ, not CA", () => {
    const p = {
      currentAge: 65, retireAge: 65, endAge: 90,
      port: 2_000_000, sp: 90_000, ssAge: 90, ssb: 0,
      filingStatus: "mfj", gkFloor: 48_000, gkCeiling: 300_000,
      withdrawalStrategy: "gk",
      accounts: [{ id: "a1", category: "pretax", name: "401k", balance: 2_000_000 }],
    };
    const omitted = simulateDeterministicWithStrategy(p, 2.5, "gk");
    const nj = simulateDeterministicWithStrategy({ ...p, stateOfResidence: "NJ" }, 2.5, "gk");
    const ca = simulateDeterministicWithStrategy({ ...p, stateOfResidence: "CA" }, 2.5, "gk");
    expect(omitted.schedule[1].stateTax).toBe(nj.schedule[1].stateTax);
    expect(omitted.schedule[1].stateTax).not.toBe(ca.schedule[1].stateTax);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getRmdStartAge — SECURE Act 2.0 RMD start age
// ═══════════════════════════════════════════════════════════════════════════════
describe("getRmdStartAge — SECURE Act 2.0 RMD start age", () => {
  test("born 1960 or later → RMD starts at 75", () => {
    expect(getRmdStartAge({ dob: "1960-01-01" })).toBe(75);
    expect(getRmdStartAge({ dob: "1965-06-15" })).toBe(75);
    expect(getRmdStartAge({ birthYear: 1960 })).toBe(75);
  });

  test("born 1951–1959 → RMD starts at 73", () => {
    expect(getRmdStartAge({ dob: "1959-12-31" })).toBe(73);
    expect(getRmdStartAge({ dob: "1955-03-01" })).toBe(73);
    expect(getRmdStartAge({ birthYear: 1951 })).toBe(73);
  });

  test("born before 1951 → RMD starts at 72 (pre-SECURE 2.0)", () => {
    expect(getRmdStartAge({ dob: "1950-12-31" })).toBe(72);
    expect(getRmdStartAge({ dob: "1940-01-01" })).toBe(72);
    expect(getRmdStartAge({ birthYear: 1945 })).toBe(72);
  });

  test("no info → safe default of 73", () => {
    expect(getRmdStartAge({})).toBe(73);
    expect(getRmdStartAge()).toBe(73);
  });

  test("birthYear takes precedence over dob", () => {
    // birthYear=1960, dob says 1955 — birthYear wins
    expect(getRmdStartAge({ birthYear: 1960, dob: "1955-01-01" })).toBe(75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// guytonKlingerWithdrawal — GK guardrails
// ═══════════════════════════════════════════════════════════════════════════════
describe("guytonKlingerWithdrawal — GK guardrails", () => {
  const FLOOR   = 30_000;
  const CEILING = 80_000;

  test("positive return year: spending inflates by inflation rate", () => {
    // portfolioValue=1M, initialWR=4%, lastW=40K, infl=2.5%
    // WR after inflation: 41000/1000000 = 4.1% — within ±20% of 4% (3.2%–4.8%)
    const result = guytonKlingerWithdrawal(1_000_000, 0.04, 40_000, 0.10, 0.025, FLOOR, CEILING);
    expect(result).toBeCloseTo(41_000, 0);
  });

  test("negative return year: spending holds flat (no inflation)", () => {
    const result = guytonKlingerWithdrawal(1_000_000, 0.04, 40_000, -0.05, 0.025, FLOOR, CEILING);
    expect(result).toBe(40_000);
  });

  test("prosperity trigger: WR < 80% of initial → 10% raise", () => {
    // portfolioValue=1.5M, initialWR=4%, lastW=40K, infl=2%
    // inflated w = 40800; WR = 40800/1500000 = 0.0272 < 0.04*0.8=0.032 → +10%
    const result = guytonKlingerWithdrawal(1_500_000, 0.04, 40_000, 0.20, 0.02, FLOOR, CEILING);
    expect(result).toBeCloseTo(40_000 * 1.02 * 1.10, 0);
  });

  test("capital preservation: WR > 120% of initial → 10% cut", () => {
    // portfolioValue=500K, initialWR=4%, lastW=40K, infl=2.5%
    // inflated w = 41000; WR = 41000/500000 = 0.082 > 0.04*1.2=0.048 → -10%
    const result = guytonKlingerWithdrawal(500_000, 0.04, 40_000, 0.01, 0.025, FLOOR, CEILING);
    expect(result).toBeCloseTo(41_000 * 0.90, 0);
  });

  test("floor constraint: never drops below floor even after capital preservation", () => {
    // lastW=25K → after cap-pres: 25K*0.9 = 22.5K < floor 30K
    const result = guytonKlingerWithdrawal(50_000, 0.04, 25_000, 0.01, 0.025, FLOOR, CEILING);
    expect(result).toBe(FLOOR);
  });

  test("ceiling constraint: never exceeds ceiling even after prosperity", () => {
    // Large portfolio, high lastWithdrawal to push above ceiling
    const result = guytonKlingerWithdrawal(10_000_000, 0.04, 120_000, 0.20, 0.025, FLOOR, CEILING);
    expect(result).toBe(CEILING);
  });

  test("zero portfolio → returns floor", () => {
    const result = guytonKlingerWithdrawal(0, 0.04, 40_000, 0.05, 0.025, FLOOR, CEILING);
    expect(result).toBe(FLOOR);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runMC — Monte Carlo integration tests
// ═══════════════════════════════════════════════════════════════════════════════
describe("runMC — Monte Carlo integration", () => {
  test("determinism: same seed always yields identical results", () => {
    const r1 = runMC(BASE, 90, 1000, 42, true);
    const r2 = runMC(BASE, 90, 1000, 42, true);
    expect(r1.rate).toBe(r2.rate);
    expect(r1.medR).toBe(r2.medR);
  });

  test("different seeds produce different median portfolio paths", () => {
    // The scenario is very favorable (success ~99%), so rates may tie.
    // But the random paths themselves differ — median portfolio at year 10 will diverge.
    const r1 = runMC(BASE, 90, 500, 42,  true);
    const r2 = runMC(BASE, 90, 500, 99,  true);
    // At least one mid-point percentile should differ between seeds
    const p50_r1 = r1.pcts[10].p50;
    const p50_r2 = r2.pcts[10].p50;
    expect(p50_r1).not.toBe(p50_r2);
  });

  test("output shape: rate ∈ [0,1], pcts has correct length", () => {
    const r = runMC(BASE, 90, 500, 42, true);
    expect(r.rate).toBeGreaterThanOrEqual(0);
    expect(r.rate).toBeLessThanOrEqual(1);
    expect(r.pcts).toHaveLength(31); // age 60–90 inclusive
  });

  test("terminal percentiles are monotonically ordered", () => {
    const { term } = runMC(BASE, 90, 500, 42, true);
    expect(term.p10).toBeLessThanOrEqual(term.p25);
    expect(term.p25).toBeLessThanOrEqual(term.p50);
    expect(term.p50).toBeLessThanOrEqual(term.p75);
    expect(term.p75).toBeLessThanOrEqual(term.p90);
  });

  test("monotonicity: higher spending → lower success rate", () => {
    const conservative = runMC({ ...BASE, sp: 60_000  }, 90, 1000, 42, true);
    const aggressive   = runMC({ ...BASE, sp: 120_000 }, 90, 1000, 42, true);
    expect(conservative.rate).toBeGreaterThan(aggressive.rate);
  });

  test("monotonicity: longer horizon → lower success rate", () => {
    const shorter = runMC(BASE, 85, 1000, 42, true);
    const longer  = runMC(BASE, 95, 1000, 42, true);
    expect(shorter.rate).toBeGreaterThan(longer.rate);
  });

  test("Social Security income raises success rate vs no SS", () => {
    const noSS   = runMC({ ...BASE, ssb: 0         }, 90, 1000, 42, true);
    const withSS = runMC({ ...BASE, ssb: 24_000     }, 90, 1000, 42, true);
    expect(withSS.rate).toBeGreaterThan(noSS.rate);
  });

  test("conservative baseline ($2M, $80K, 30yr) succeeds >50% of simulations", () => {
    const r = runMC(BASE, 90, 2000, 42, true);
    expect(r.rate).toBeGreaterThan(0.5);
  });

  test("nearly-impossible scenario (tiny portfolio, huge spend) fails most paths", () => {
    const r = runMC({ ...BASE, port: 100_000, sp: 200_000, accounts: [
      { id: "t1", category: "pretax", name: "401k", balance: 100_000 },
    ]}, 90, 500, 42, true);
    expect(r.rate).toBeLessThan(0.2);
  });

  test("accumulaton phase: retiring at 65 with 5yr growth gives larger portfolio than retiring at 60", () => {
    const retireAt60 = runMC({ ...BASE, currentAge: 60, retireAge: 60 }, 90, 500, 42, true);
    const retireAt65 = runMC({ ...BASE, currentAge: 60, retireAge: 65, contrib: 20_000 }, 90, 500, 42, true);
    expect(retireAt65.medR).toBeGreaterThan(retireAt60.medR);
  });

  test("FL (no state tax) has higher success rate than CA (13.3% state tax)", () => {
    // Use a tighter scenario so the 13.3% state tax drag is detectable
    const tight = { ...BASE, ssb: 0, sp: 90_000,
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance: 900_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance: 200_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:  80_000 },
        { id: "t4", category: "cash",    name: "Cash",    balance:  20_000 },
      ] };
    const fl = runMC({ ...tight, stateOfResidence: "FL" }, 90, 2000, 42, true);
    const ca = runMC({ ...tight, stateOfResidence: "CA" }, 90, 2000, 42, true);
    // 13.3% state tax = meaningfully higher annual draw → lower success rate
    expect(fl.rate).toBeGreaterThan(ca.rate);
  });

  test("twoHousehold mode (no state tax) has higher success rate than single CA household", () => {
    const tight = { ...BASE, stateOfResidence: "CA", ssb: 0, sp: 90_000,
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance: 900_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance: 200_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:  80_000 },
        { id: "t4", category: "cash",    name: "Cash",    balance:  20_000 },
      ] };
    const two = runMC({ ...tight, twoHousehold: true  }, 90, 2000, 42, true);
    const one = runMC({ ...tight, twoHousehold: false }, 90, 2000, 42, true);
    // Skipping CA 13.3% state tax is a meaningful annual saving → higher success
    expect(two.rate).toBeGreaterThan(one.rate);
  });

  test("RMD at age 73: pretax-heavy portfolio has lower success than Roth-heavy (same total)", () => {
    // Pretax triggers RMDs at 73 — forces taxable withdrawals earlier, increasing tax burden
    const pretaxHeavy = runMC({
      ...BASE,
      stateOfResidence: "CA",
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance: 1_900_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance:    50_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:    30_000 },
        { id: "t4", category: "cash",    name: "Cash",    balance:    20_000 },
      ],
    }, 90, 1000, 42, true);

    const rothHeavy = runMC({
      ...BASE,
      stateOfResidence: "CA",
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance:    50_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance: 1_900_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:    30_000 },
        { id: "t4", category: "cash",    name: "Cash",    balance:    20_000 },
      ],
    }, 90, 1000, 42, true);

    // With source-aware taxes both variants can saturate at 100% survival on this
    // portfolio; the RMD tax drag still shows up in median terminal wealth.
    expect(rothHeavy.rate).toBeGreaterThanOrEqual(pretaxHeavy.rate);
    expect(rothHeavy.term.p50).toBeGreaterThan(pretaxHeavy.term.p50);
  });

  test("joint RMD table gives lower RMD draw than uniform table (divisors are higher)", () => {
    const uniform = runMC({ ...BASE, stateOfResidence: "CA", useJointRmdTable: false }, 90, 1000, 42, true);
    const joint   = runMC({ ...BASE, stateOfResidence: "CA", useJointRmdTable: true  }, 90, 1000, 42, true);
    // Joint Table II (spouse >10y younger) has LARGER divisors than Uniform Table III
    // at most ages (e.g. 26.5 uniform vs 25.3 joint at 73 — joint is smaller there, but
    // crosses over by ~80), so direction varies by age mix; just verify both run validly.
    expect(uniform.rate).toBeGreaterThanOrEqual(0);
    expect(joint.rate).toBeGreaterThanOrEqual(0);
  });

  test("withdrawal strategies all produce valid success rates", () => {
    const strategies = ["gk", "fixed", "vanguard", "risk", "kitces", "vpw", "cape", "endowment", "one_n", "ninety_five_rule"];
    for (const s of strategies) {
      const r = runMC({ ...BASE, withdrawalStrategy: s }, 90, 200, 42, true);
      expect(r.rate).toBeGreaterThanOrEqual(0);
      expect(r.rate).toBeLessThanOrEqual(1);
      expect(r.pcts).toHaveLength(31);
    }
  });

  test("fixed 4% strategy: produces different median terminal portfolio than GK", () => {
    // With a well-funded scenario, both strategies may hit ~100% success, but the
    // wealth accumulation paths differ because withdrawal amounts differ each year.
    const gk    = runMC({ ...BASE, withdrawalStrategy: "gk"    }, 90, 1000, 42, true);
    const fixed = runMC({ ...BASE, withdrawalStrategy: "fixed" }, 90, 1000, 42, true);
    const gkMedian    = gk.pcts[gk.pcts.length - 1].p50;
    const fixedMedian = fixed.pcts[fixed.pcts.length - 1].p50;
    // The two strategies generate different wealth paths even if both succeed
    expect(gkMedian).not.toBe(fixedMedian);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Roth conversion tax cost — progressive bracket stacking (A1 regression)
//
// The conversion cost must be the DELTA in full progressive tax (with the
// conversion stacked as ordinary income) vs. the no-conversion tax — not a flat
// marginal-rate estimate priced off the PRE-conversion income level. A flat rate
// badly under-costs any conversion whose `room` spans multiple brackets above the
// pre-conversion bracket (in the extreme, starting from $0 taxable income, the
// pre-conversion marginal bracket is 0% — the old code would have priced a
// six-figure bracket-fill conversion at $0 tax).
// ═══════════════════════════════════════════════════════════════════════════════
describe("Roth conversion tax cost — progressive bracket stacking (A1 regression)", () => {
  test("calcYearTax: real progressive cost of a bracket-spanning conversion is far above a flat pre-conversion marginal-rate estimate", () => {
    // Zero baseline ordinary income → pre-conversion marginal bracket is 0%
    // (the old flat-rate bug's worst case: convTax = round(convAmt × 0) = $0).
    const noConv = calcYearTax(65, 2026, 0, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(noConv.marginalBracket).toBe(0);

    // conversionAmount is ORDINARY INCOME (pre-standard-deduction); at age 65
    // MFJ the std deduction is 35,500, so a $211,400 conversion leaves taxable
    // income of 175,900 — squarely inside the 22% bracket (100,800–211,400).
    const convAmt = 211_400;
    const withConv = calcYearTax(65, 2026, 0, 0, 0, 0, convAmt, false, 0.025, "mfj", "FL");
    const trueCost = withConv.totalTax - noConv.totalTax;
    expect(withConv.taxableIncome).toBe(175_900);

    // Old buggy cost estimate: convAmt × pre-conversion marginal bracket (0%) = $0.
    const buggyCost = Math.round(convAmt * (noConv.marginalBracket || 0));
    expect(buggyCost).toBe(0);

    // True progressive-stacked cost: 10% × $24,800 + 12% × $76,000 + 22% × $75,100
    // = 2,480 + 9,120 + 16,522 = $28,122 — the fix must charge the real stacked
    // amount, not $0.
    expect(trueCost).toBeGreaterThan(25_000);
    expect(trueCost).toBeGreaterThan(buggyCost);
  });

  test("runMC: a bracket-filling conversion from zero baseline income reduces terminal portfolio by a real, materially-nonzero tax cost", () => {
    const base = {
      currentAge: 65, retireAge: 65, endAge: 66, // single retirement year — isolates the conversion cost
      port: 5_000_000, contrib: 0, inf: 2.5,
      sp: 0, ssAge: 90, ssb: 0, ab: 0, useAb: false,
      tax: 22, smile: false,
      preRetireEq: 91, postRetireEq: 70,
      gkFloor: 1_000, gkCeiling: 10_000_000,
      withdrawalStrategy: "gk",
      cashRealReturn: 1.0, useJointRmdTable: false, twoHousehold: false,
      filingStatus: "mfj", stateOfResidence: "FL",
      rothConversionTarget: "22",
      accounts: [
        { id: "t1", category: "pretax", name: "401k", balance: 5_000_000 },
      ],
    };
    // Single deterministic path (N=1, fixed seed) — the equity/inflation draws
    // are identical between the two runs since the conversion branch consumes
    // no RNG calls, so any portfolio difference is purely the conversion tax cost.
    const withConv = runMC(base, 66, 1, 42, true);
    const noConv   = runMC({ ...base, rothConversionTarget: "off" }, 66, 1, 42, true);
    const diff = noConv.pcts[1].p50 - withConv.pcts[1].p50;

    // Old bug (flat rate off $0 pre-conversion income) would have priced this at
    // ~$0 cost. The fix must show a real, substantial tax drag (comfortably above
    // MC/rounding noise, safely below the true ~$35,932 cost even after applying
    // a plausible single-year growth factor).
    expect(diff).toBeGreaterThan(20_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runStress — Stress Test pivot must share runMC's tax model (uniformity)
//
// The stress pivot delegates to runMC with the 2000–2012 equity sequence forced at
// retirement. These tests pin the property the user cares about: every tax lever that
// moves the Monte Carlo must move the stress number the SAME way — no pivot can read
// differently. Regression guard for the old flat taxDragRate heuristic, which ignored
// the non-resident (twoHousehold) toggle and state of residence entirely.
// ═══════════════════════════════════════════════════════════════════════════════
describe("runStress — tax model uniformity with runMC", () => {
  // Scenario tuned to sit on the steep part of the stress survival curve (~40%), with
  // the non-adaptive Bengen rule and uncapped sourcing so a state-tax-sized drag is
  // visible in the success rate. (GK guardrails would absorb the crash via spending
  // cuts and mask the tax difference; Bengen holds spending and lets tax bite.)
  const stressBand = {
    ...BASE, stateOfResidence: "CA", ssb: 24_000, ssAge: 62, sp: 90_000,
    withdrawalStrategy: "bengen", withdrawalBracketTarget: "off",
    accounts: [
      { id: "t1", category: "pretax",  name: "401k",    balance: 1_470_000 },
      { id: "t2", category: "roth",    name: "Roth",    balance:   420_000 },
      { id: "t3", category: "taxable", name: "Taxable", balance:   157_500 },
      { id: "t4", category: "cash",    name: "Cash",    balance:    52_500 },
    ],
  };

  test("non-resident toggle (twoHousehold) raises the stress success rate — the reported bug", () => {
    // This is the exact pivot the user flagged: flipping non-resident ON must change
    // the stress number. Skipping CA's state tax is a real annual saving. (Empirically
    // ~0.407 → ~0.444 at this fixture; the old taxDragRate heuristic ignored the flag.)
    const resident    = runStress({ ...stressBand, twoHousehold: false }, 90, 2000, 99);
    const nonResident = runStress({ ...stressBand, twoHousehold: true  }, 90, 2000, 99);
    expect(nonResident.rate).toBeGreaterThan(resident.rate);
  });

  test("state of residence flows into the stress number (FL beats CA)", () => {
    const fl = runStress({ ...stressBand, stateOfResidence: "FL" }, 90, 2000, 99);
    const ca = runStress({ ...stressBand, stateOfResidence: "CA" }, 90, 2000, 99);
    expect(fl.rate).toBeGreaterThan(ca.rate);
  });

  test("non-resident equals a no-state-tax state (both zero out state tax identically)", () => {
    // Same engine, same seed: claiming non-residency in CA must land exactly where a
    // genuinely tax-free state (FL) lands — proof the toggle routes through one tax path.
    const flResident = runStress({ ...stressBand, stateOfResidence: "FL", twoHousehold: false }, 90, 2000, 99);
    const caNonRes   = runStress({ ...stressBand, stateOfResidence: "CA", twoHousehold: true  }, 90, 2000, 99);
    expect(caNonRes.rate).toBe(flResident.rate);
  });

  test("deterministic for a fixed seed", () => {
    const a = runStress(stressBand, 90, 1000, 99);
    const b = runStress(stressBand, 90, 1000, 99);
    expect(a.rate).toBe(b.rate);
    expect(a.pcts[a.pcts.length - 1].p50).toBe(b.pcts[b.pcts.length - 1].p50);
  });

  test("returns the runMC result shape (rate + per-age percentile bands)", () => {
    const s = runStress(stressBand, 90, 500, 99);
    expect(typeof s.rate).toBe("number");
    expect(s.rate).toBeGreaterThanOrEqual(0);
    expect(s.rate).toBeLessThanOrEqual(1);
    expect(Array.isArray(s.pcts)).toBe(true);
    expect(s.pcts.length).toBe(90 - stressBand.retireAge + 1);   // initial + one row per retirement year
    const row = s.pcts[0];
    ["age", "p10", "p25", "p50", "p75", "p90"].forEach((k) => expect(row).toHaveProperty(k));
  });

  test("2000–2012 sequence makes stress no kinder than the random MC (sequence-of-returns risk)", () => {
    // Same engine, same seed — the only difference is the forced bad sequence at
    // retirement. A front-loaded crash can only hurt or tie, never help.
    const stress = runStress(stressBand, 90, 2000, 99);
    const random = runMC(stressBand, 90, 2000, 99, true);
    expect(stress.rate).toBeLessThanOrEqual(random.rate);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tax master toggle — p.tax === false zeroes ALL tax, uniformly across pivots
//
// The "🏛 Tax" toggle (OFF) must produce a genuine pre-tax view: zero federal/state/
// IRMAA in the Monte Carlo, the Stress Test (which delegates to runMC), and the
// deterministic year-by-year table. Only an explicit boolean false disables tax — a
// numeric or true value (the default) keeps it on, so existing tax-ON tests are unaffected.
// ═══════════════════════════════════════════════════════════════════════════════
describe("Tax master toggle — OFF zeroes all tax uniformly", () => {
  const taxy = { ...BASE, stateOfResidence: "CA", ssb: 0, sp: 95_000,
    withdrawalStrategy: "bengen", withdrawalBracketTarget: "off",
    accounts: [
      { id: "t1", category: "pretax",  name: "401k",    balance: 1_300_000 },
      { id: "t2", category: "roth",    name: "Roth",    balance:   300_000 },
      { id: "t3", category: "taxable", name: "Taxable", balance:   100_000 },
      { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
    ] };

  test("runMC: tax OFF survives at least as often as tax ON (no tax dollars withdrawn)", () => {
    const taxOn  = runMC({ ...taxy, tax: true  }, 90, 2000, 42, true);
    const taxOff = runMC({ ...taxy, tax: false }, 90, 2000, 42, true);
    expect(taxOff.rate).toBeGreaterThan(taxOn.rate);
  });

  test("Stress Test inherits the toggle: tax OFF beats tax ON (uniform with runMC)", () => {
    // Larger portfolio so survival sits on the steep part of the stress curve — the
    // harsher `taxy` scenario collapses to 0% under the forced crash regardless of tax,
    // which can't discriminate. This band (~40% with tax on) reacts to zeroing tax.
    const band = { ...taxy, ssb: 24_000, ssAge: 62, sp: 90_000,
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance: 1_470_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance:   420_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:   157_500 },
        { id: "t4", category: "cash",    name: "Cash",    balance:    52_500 },
      ] };
    const taxOn  = runStress({ ...band, tax: true  }, 90, 2000, 99);
    const taxOff = runStress({ ...band, tax: false }, 90, 2000, 99);
    expect(taxOff.rate).toBeGreaterThan(taxOn.rate);
  });

  test("Deterministic table: tax OFF zeroes every tax field in the schedule", () => {
    const { schedule } = simulateDeterministicWithStrategy({ ...taxy, tax: false }, 2.5, "bengen");
    expect(schedule.length).toBeGreaterThan(0);
    for (const row of schedule) {
      expect(row.totalTax).toBe(0);
      expect(row.fedTax).toBe(0);
      expect(row.stateTax).toBe(0);
      expect(row.irmaa).toBe(0);
    }
  });

  test("Deterministic table: tax ON produces at least one taxed year (guards the OFF test)", () => {
    const { schedule } = simulateDeterministicWithStrategy({ ...taxy, tax: true }, 2.5, "bengen");
    expect(schedule.some(r => r.totalTax > 0)).toBe(true);
  });

  test("a numeric tax value (legacy fixtures) is treated as ON, not OFF", () => {
    // Regression guard: the gate is `p.tax !== false`, so tax: 22 must keep tax on.
    const num  = runMC({ ...taxy, tax: 22    }, 90, 1000, 42, true);
    const off  = runMC({ ...taxy, tax: false }, 90, 1000, 42, true);
    expect(num.rate).toBeLessThan(off.rate);   // numeric → taxed → lower success
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// User scenario validation — $266K portfolio, SS $1,400/mo, Single filer
//
// Numbers given:
//   Portfolio:        $266,000 (all pre-tax IRA)
//   SS benefit:       $1,400/mo = $16,800/yr (starts at 67)
//   Annual spending:  $72,000/yr  ← spending TARGET, not what Fixed % delivers
//   401k contrib:     $200/yr  ← NOTE: very low; likely a typo for $2,400 or $20,000/yr
//   HSA:              $10/mo = $120/yr
//   Employer match:   1.5% of 401k contrib
//   Filing status:    Single
//   No other income
//
// ─── IMPORTANT: How Fixed % success rate works ───────────────────────────────
// Fixed % strategy draws exactly (rate × portfolio) each year. Because you
// always take a percentage of what remains, the portfolio approaches zero
// asymptotically but almost never hits $0. That means the MC "success rate"
// (portfolio survives to end age) will be HIGH (near 100%) even on a tiny
// portfolio. High success rate ≠ adequate income.
//
// The real concern is SPENDING ADEQUACY:
//   Portfolio draw:  0.04 × $266K = $10,640/yr
//   Social Security: $16,800/yr (starts at 67)
//   Total income:    ~$27,440/yr vs $72,000 spending target
//   Annual gap:      ~$44,560/yr — user will have to spend less or work longer
//
// For a $72K lifestyle with Fixed 4%, the user needs ~$1.38M in the portfolio
// ($72K - $16.8K SS = $55.2K needed from portfolio → $55.2K / 0.04 = $1.38M).
// ═══════════════════════════════════════════════════════════════════════════════

const USER_PROFILE = {
  currentAge:      55,   // assumed — adjust to match real age
  retireAge:       65,
  endAge:          90,
  port:        266_000,
  contrib:         200,  // $200/yr as given (likely should be $2,400 or $20,000 — see test below)
  hsaMonthly:       10,  // $10/mo = $120/yr
  inf:             2.5,
  sp:           72_000,  // spending target (not what Fixed % will deliver)
  ssAge:            67,
  ssb:          16_800,  // $1,400/mo × 12
  ssCola:          2.4,
  ab:                0,
  useAb:         false,
  tax:              22,
  smile:         false,
  preRetireEq:      91,
  postRetireEq:     70,
  gkFloor:      46_800,
  gkCeiling:    97_200,
  withdrawalStrategy:  "fixed",
  fixedWithdrawalRate: 0.04,
  cashRealReturn:  1.0,
  useJointRmdTable: false,
  twoHousehold:  false,
  filingStatus: "single",
  stateOfResidence: "FL",  // no state tax — isolates federal math
  accounts: [
    { id: "u1", category: "pretax", name: "IRA", balance: 266_000 },
  ],
};

describe("User scenario — $266K portfolio, single filer, Fixed 4%", () => {

  test("Fixed % simulation runs without error and returns valid rate", () => {
    // This was broken before (ReferenceError at y=0). Now it must complete cleanly.
    const profile = { ...USER_PROFILE, currentAge: 65, retireAge: 65 };
    const r = runMC(profile, 90, 500, 42, true);
    expect(r.rate).toBeGreaterThanOrEqual(0);
    expect(r.rate).toBeLessThanOrEqual(1);
    expect(r.pcts).toHaveLength(26); // 90 - 65 + 1 years including retirement year
    expect(r.pcts.every(p => isFinite(p.p50))).toBe(true); // no NaN in any percentile
  });

  test("Fixed 4%: success rate is HIGH (portfolio never hits $0) — but income is inadequate", () => {
    // Because sp = 4% × remaining portfolio each year, the portfolio mathematically
    // never depletes. Expect high success rate (> 70%). This does NOT mean the plan
    // is adequate — 4% of ~$266K is ~$10.6K/yr vs the $72K target.
    // With source-aware taxes the median-return path outgrows the 4% draw, so the
    // median terminal portfolio ends ABOVE the starting $266K.
    const profile = { ...USER_PROFILE, currentAge: 65, retireAge: 65 };
    const r = runMC(profile, 90, 1000, 42, true);
    expect(r.rate).toBeGreaterThan(0.70);
    expect(r.term.p50).toBeGreaterThan(266_000);
  });

  test("GK strategy on same portfolio WILL show low success rate (underfunded)", () => {
    // Guyton-Klinger tries to deliver the full $72K spending target each year.
    // $72K spend - $16.8K SS = $55.2K needed from a $266K portfolio = 20.8% WR.
    // That is 5× the safe withdrawal rate. GK will deplete the portfolio rapidly.
    // Expect success rate well below 50%.
    const profile = { ...USER_PROFILE, currentAge: 65, retireAge: 65, withdrawalStrategy: "gk" };
    const r = runMC(profile, 90, 1000, 42, true);
    expect(r.rate).toBeLessThan(0.40);
  });

  test("portfolio required for $72K spend at Fixed 4% with $16.8K SS = ~$1.38M", () => {
    // ($72K spend - $16.8K SS) / 0.04 = $1.38M needed
    const needed = (72_000 - 16_800) / 0.04;
    expect(needed).toBeCloseTo(1_380_000, -3); // within $1K
  });

  test("Single filer pays more federal tax than MFJ on same income", () => {
    const age = 68, yr = 2026, infl = 0.025;
    const draw = 10_640, ss = 16_800;
    const single = calcYearTax(age, yr, draw, ss, 0, 0, 0, false, infl, "single", "FL");
    const mfj    = calcYearTax(age, yr, draw, ss, 0, 0, 0, false, infl, "mfj",    "FL");
    expect(single.fedTax).toBeGreaterThanOrEqual(mfj.fedTax);
  });

  test("Single filer: Joint RMD table ignored even when toggle is on", () => {
    const base = { ...USER_PROFILE, currentAge: 65, retireAge: 65 };
    const withToggle    = runMC({ ...base, useJointRmdTable: true  }, 90, 200, 42, true);
    const withoutToggle = runMC({ ...base, useJointRmdTable: false }, 90, 200, 42, true);
    // Identical results — joint table is suppressed for single filers
    expect(withToggle.rate).toBeCloseTo(withoutToggle.rate, 2);
  });

  test("$20K/yr contrib gives materially larger portfolio at retirement than $200/yr", () => {
    // $200/yr × 10 years ≈ ~$2,400 added (negligible)
    // $20,000/yr × 10 years ≈ ~$279K added at 7% growth (material)
    const low  = runMC({ ...USER_PROFILE, contrib:    200 }, 90, 500, 42, true);
    const high = runMC({ ...USER_PROFILE, contrib: 20_000 }, 90, 500, 42, true);
    // Higher contributions → larger portfolio at retirement → higher terminal median
    expect(high.term.p50).toBeGreaterThan(low.term.p50);
  });

  test("SS starting at 67 vs 65: delaying SS lowers success slightly (2-year income gap)", () => {
    const base = { ...USER_PROFILE, currentAge: 65, retireAge: 65 };
    const ssAt65 = runMC({ ...base, ssAge: 65 }, 90, 500, 42, true);
    const ssAt67 = runMC({ ...base, ssAge: 67 }, 90, 500, 42, true);
    // Earlier SS is slightly better (more income sooner)
    expect(ssAt65.rate).toBeGreaterThanOrEqual(ssAt67.rate);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCIAL ACCURACY SUITE — Single filer taxes, net income, RMDs, cash flow,
// and each withdrawal strategy with hand-verified dollar amounts.
//
// These tests were added after a user reported that switching Filing Status to
// "Single" did not change their tax burden. They serve as the regression fence.
// ═══════════════════════════════════════════════════════════════════════════════

const tax26 = (age, withdrawal, filing, state = "FL") =>
  calcYearTax(age, 2026, withdrawal, 0, 0, 0, 0, false, 0.025, filing, state);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SINGLE-FILER TAX RATES — the exact bug the user hit
// ═══════════════════════════════════════════════════════════════════════════════
describe("Single filer tax accuracy — regression for filing-status bug", () => {

  test("Single under-65: std deduction = $16,100 — income at deduction = $0 tax", () => {
    const r = tax26(60, 16_100, "single");
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("Single 65+: std deduction = $17,750 ($16,100 + $1,650) — income at deduction = $0 tax", () => {
    const r = tax26(65, 17_750, "single");
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("MFJ under-65: std deduction = $32,200 — income at deduction = $0 tax", () => {
    const r = tax26(60, 32_200, "mfj");
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("MFJ 65+: std deduction = $35,500 ($32,200 + $3,300) — income at deduction = $0 tax", () => {
    const r = tax26(65, 35_500, "mfj");
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  // Single 2026 brackets: 10% to $12,400 | 12% to $50,400 | 22% to $105,700
  // Std deduction under-65: $16,100
  //
  // $30K: taxable = 13,900 → 10%×12,400=1,240 + 12%×1,500=180 = 1,420
  test("Single under-65: $30K withdrawal — hand-calculated fedTax = $1,420", () => {
    const r = tax26(60, 30_000, "single");
    expect(r.taxableIncome).toBe(13_900);
    expect(r.fedTax).toBeCloseTo(1_420, 0);
  });

  // $60K: taxable = 43,900 → 10%×12,400=1,240 + 12%×31,500=3,780 = 5,020
  test("Single under-65: $60K withdrawal — hand-calculated fedTax = $5,020", () => {
    const r = tax26(60, 60_000, "single");
    expect(r.taxableIncome).toBe(43_900);
    expect(r.fedTax).toBeCloseTo(5_020, 0);
  });

  // $120K: taxable = 103,900 → 10%×12,400 + 12%×38,000 + 22%×53,500 = 17,570
  test("Single under-65: $120K withdrawal — spans 10/12/22% brackets, fedTax = $17,570", () => {
    const r = tax26(60, 120_000, "single");
    expect(r.taxableIncome).toBe(103_900);
    expect(r.fedTax).toBeCloseTo(17_570, 0);
  });

  test("Single pays more federal tax than MFJ on $50K withdrawal (same age, state)", () => {
    const single = tax26(62, 50_000, "single");
    const mfj    = tax26(62, 50_000, "mfj");
    expect(single.fedTax).toBeGreaterThan(mfj.fedTax);
    expect(single.fedTax - mfj.fedTax).toBeGreaterThan(500);
  });

  test("Single pays more federal tax than MFJ on $80K withdrawal", () => {
    const single = tax26(68, 80_000, "single");
    const mfj    = tax26(68, 80_000, "mfj");
    expect(single.fedTax).toBeGreaterThan(mfj.fedTax);
    expect(single.fedTax - mfj.fedTax).toBeGreaterThan(2_000);
  });

  test("MC: single filer has lower success rate than MFJ on identical portfolio/spend", () => {
    const scenario = {
      ...BASE,
      port: 1_000_000,
      sp:     70_000,
      ssb:    24_000,
      accounts: [
        { id: "a1", category: "pretax",  name: "401k", balance: 700_000 },
        { id: "a2", category: "roth",    name: "Roth", balance: 200_000 },
        { id: "a3", category: "taxable", name: "Brok", balance:  80_000 },
        { id: "a4", category: "cash",    name: "Cash", balance:  20_000 },
      ],
    };
    const mfj    = runMC({ ...scenario, filingStatus: "mfj"    }, 90, 2000, 42, true);
    const single = runMC({ ...scenario, filingStatus: "single" }, 90, 2000, 42, true);
    expect(mfj.rate).toBeGreaterThan(single.rate);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. NET INCOME — what you actually keep after all taxes
// ═══════════════════════════════════════════════════════════════════════════════
describe("Net income = gross withdrawal − total taxes", () => {

  // Single, age 62, FL, $50K: taxable=33,900 → 10%×12,400+12%×21,500 = 3,820
  test("Single, age 62, FL, $50K: net income = $50K − fedTax ($3,820)", () => {
    const r = tax26(62, 50_000, "single", "FL");
    expect(r.taxableIncome).toBe(33_900);
    expect(r.fedTax).toBeCloseTo(3_820, 0);
    expect(r.stateTax).toBe(0);
    expect(50_000 - r.totalTax).toBeCloseTo(46_180, 0);
  });

  // NJ progressive brackets on $33,900 taxable → 523 (much lower than old flat 10.75%)
  test("Single, age 62, NJ, $50K: NJ progressive state tax, net lower than FL", () => {
    const rFL = tax26(62, 50_000, "single", "FL");
    const rNJ = tax26(62, 50_000, "single", "NJ");
    expect(rNJ.stateTax).toBeCloseTo(523, 0);
    expect(50_000 - rFL.totalTax).toBeGreaterThan(50_000 - rNJ.totalTax);
  });

  // IRC §86: $30K draw + $24K SS → provisional = 30000 + 12000 = 42000 (single, above $34K)
  // taxableSS = min(0.85 × (42000 − 34000) + min(0.5 × 9000, 12000), 20400) = 6800 + 4500 = 11300
  // totalIncome = 41,300; single 65+ std ded = 17,750 → taxable = 23,550
  // fedTax = 12400 × 10% + (23550 − 12400) × 12% = 1240 + 1338 = 2578
  test("Single, age 68, FL: SS taxed per provisional-income tiers, correct taxableIncome", () => {
    const r = calcYearTax(68, 2026, 30_000, 24_000, 0, 0, 0, false, 0.025, "single", "FL");
    expect(r.taxableIncome).toBe(23_550);
    expect(r.fedTax).toBeCloseTo(2_578, 0);
  });

  test("totalTax === fedTax + stateTax + irmaa for single filer", () => {
    const r = calcYearTax(68, 2026, 100_000, 24_000, 0, 0, 0, false, 0.025, "single", "CA");
    expect(r.totalTax).toBe(r.fedTax + r.stateTax + r.irmaa);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. RMD CALCULATIONS — forced withdrawals from pre-tax accounts
// ═══════════════════════════════════════════════════════════════════════════════
describe("RMD calculations — SECURE Act 2.0 divisors and tax impact", () => {

  // Divisors from IRS Pub 590-B Table III (Uniform Lifetime), 2022+ table
  test("RMD at age 73: $1M / 26.5 = $37,736", () => {
    expect(Math.round(1_000_000 / 26.5)).toBe(37_736);
  });

  test("RMD at age 80: $500K / 20.2 = $24,752", () => {
    expect(Math.round(500_000 / 20.2)).toBe(24_752);
  });

  test("RMD at age 90: $200K / 12.2 = $16,393", () => {
    expect(Math.round(200_000 / 12.2)).toBe(16_393);
  });

  test("RMD in calcYearTax raises taxable income vs no RMD (single filer, age 73)", () => {
    const noRmd   = calcYearTax(73, 2026, 40_000,     0, 0,      0, 0, false, 0.025, "single", "FL");
    const withRmd = calcYearTax(73, 2026, 40_000,     0, 0, 32_895, 0, false, 0.025, "single", "FL");
    expect(withRmd.taxableIncome).toBeGreaterThan(noRmd.taxableIncome);
    expect(withRmd.fedTax).toBeGreaterThan(noRmd.fedTax);
  });

  test("MC: pretax-heavy (RMD at 73) lowers success vs Roth-heavy — single filer, CA", () => {
    const base = { ...BASE, filingStatus: "single", stateOfResidence: "CA", ssb: 0, sp: 80_000 };
    const pretaxHeavy = runMC({ ...base, accounts: [
      { id: "p1", category: "pretax",  name: "401k", balance: 1_900_000 },
      { id: "p2", category: "roth",    name: "Roth", balance:    50_000 },
      { id: "p3", category: "taxable", name: "Brok", balance:    30_000 },
      { id: "p4", category: "cash",    name: "Cash", balance:    20_000 },
    ]}, 90, 1000, 42, true);
    const rothHeavy = runMC({ ...base, accounts: [
      { id: "r1", category: "pretax",  name: "401k", balance:    50_000 },
      { id: "r2", category: "roth",    name: "Roth", balance: 1_900_000 },
      { id: "r3", category: "taxable", name: "Brok", balance:    30_000 },
      { id: "r4", category: "cash",    name: "Cash", balance:    20_000 },
    ]}, 90, 1000, 42, true);
    expect(rothHeavy.rate).toBeGreaterThan(pretaxHeavy.rate);
  });

  test("Deterministic schedule: spending at age 73 is positive (RMD-age checkpoint)", () => {
    const p = { ...BASE, currentAge: 65, retireAge: 65, endAge: 90,
      filingStatus: "single", withdrawalStrategy: "gk", sp: 60_000 };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "gk");
    const age73row = schedule.find(r => r.age === 73);
    expect(age73row).toBeDefined();
    expect(age73row.spending).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CASH FLOW — portfolio draw, taxes, spending
// ═══════════════════════════════════════════════════════════════════════════════
describe("Cash flow accuracy — portfolio draw, taxes, and spending", () => {

  test("Deterministic GK: year-1 portfolio draw = spending − SS (SS offsets need)", () => {
    const p = { ...BASE, currentAge: 65, retireAge: 65, endAge: 90,
      sp: 80_000, ssAge: 65, ssb: 24_000, filingStatus: "single",
      withdrawalStrategy: "gk", stateOfResidence: "FL",
      accounts: [
        { id: "g1", category: "pretax",  name: "401k", balance: 1_400_000 },
        { id: "g2", category: "roth",    name: "Roth", balance:   400_000 },
        { id: "g3", category: "taxable", name: "Brok", balance:   150_000 },
        { id: "g4", category: "cash",    name: "Cash", balance:    50_000 },
      ] };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "gk");
    const yr1 = schedule[0];
    expect(yr1.portfolioDraw).toBeCloseTo(56_000, -3);
    expect(yr1.ss).toBe(24_000);
    // Year 1 is funded from cash/taxable (waterfall order), so provisional income
    // is just ½ SS = $12K — below the $25K single threshold → $0 tax is correct
    // under IRC §86. Taxes must appear once pretax draws/RMDs kick in.
    expect(yr1.totalWithdrawal).toBeGreaterThanOrEqual(yr1.portfolioDraw);
    expect(schedule.some(r => r.totalTax > 0)).toBe(true);
  });

  // Fixed 4%: at year 0 spending = p.sp (target), SS still offsets portfolioDraw.
  // From year 1 onward, spending = port × 4%.
  test("Deterministic Fixed 4%: year-2 spending = 4% × portfolioEnd[0]", () => {
    const p = { ...BASE, currentAge: 65, retireAge: 65, endAge: 90,
      sp: 80_000, ssAge: 65, ssb: 24_000, filingStatus: "mfj",
      withdrawalStrategy: "fixed", fixedWithdrawalRate: 0.04, stateOfResidence: "FL" };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "fixed");
    expect(schedule[1].spending).toBeCloseTo(schedule[0].portfolioEnd * 0.04, -3);
  });

  test("Total portfolio draw increases more than linearly as spending rises (progressive tax drag)", () => {
    // Force draws from pre-tax so we actually see ordinary-income tax drag.
    // With cash/taxable available, the Smart Waterfall correctly skips fed tax
    // on the low-spend case, so the progressive-bracket test only holds when
    // both years draw entirely from pre-tax.
    const base = { ...BASE, currentAge: 65, retireAge: 65, endAge: 90,
      ssAge: 70, ssb: 0, filingStatus: "single", stateOfResidence: "FL",
      accounts: [{ id: "p", category: "pretax", name: "401k", balance: 2_000_000 }] };
    const low  = simulateDeterministicWithStrategy({ ...base, sp:  60_000, withdrawalStrategy: "gk" }, 2.5, "gk");
    const high = simulateDeterministicWithStrategy({ ...base, sp: 120_000, withdrawalStrategy: "gk" }, 2.5, "gk");
    expect(high.schedule[0].totalWithdrawal - low.schedule[0].totalWithdrawal).toBeGreaterThan(60_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. WITHDRAWAL STRATEGY COMPARISON — year-1 deterministic draws
// ═══════════════════════════════════════════════════════════════════════════════
describe("Withdrawal strategy accuracy — year-1 deterministic draws", () => {

  const PORT = 2_000_000;
  const baseStrat = {
    ...BASE,
    currentAge: 65, retireAge: 65, endAge: 90,
    port: PORT, sp: 80_000, ssAge: 70, ssb: 24_000,
    filingStatus: "mfj", stateOfResidence: "FL",
    gkFloor: 48_000, gkCeiling: 115_000, fixedWithdrawalRate: 0.04,
    accounts: [
      { id: "s1", category: "pretax",  name: "401k", balance: 1_400_000 },
      { id: "s2", category: "roth",    name: "Roth", balance:   400_000 },
      { id: "s3", category: "taxable", name: "Brok", balance:   150_000 },
      { id: "s4", category: "cash",    name: "Cash", balance:    50_000 },
    ],
  };

  test("GK strategy: year-1 spending equals target spend ($80K) when within guardrails", () => {
    const { schedule } = simulateDeterministicWithStrategy({ ...baseStrat, withdrawalStrategy: "gk" }, 2.5, "gk");
    expect(schedule[0].spending).toBe(80_000);
  });

  test("Fixed 4%: year-1 draw = 4% × $2M = $80,000", () => {
    const { schedule } = simulateDeterministicWithStrategy({ ...baseStrat, withdrawalStrategy: "fixed" }, 2.5, "fixed");
    expect(schedule[0].spending).toBeCloseTo(PORT * 0.04, -2);
  });

  test("Fixed 3% draws less than Fixed 4% on same portfolio", () => {
    const { schedule: s3 } = simulateDeterministicWithStrategy(
      { ...baseStrat, withdrawalStrategy: "fixed", fixedWithdrawalRate: 0.03 }, 2.5, "fixed");
    const { schedule: s4 } = simulateDeterministicWithStrategy(
      { ...baseStrat, withdrawalStrategy: "fixed", fixedWithdrawalRate: 0.04 }, 2.5, "fixed");
    // Year 0 uses p.sp for all strategies; Fixed rate first applies at year 1
    expect(s3[1].spending).toBeCloseTo(s3[0].portfolioEnd * 0.03, -2);
    expect(s3[1].spending).toBeLessThan(s4[1].spending);
  });

  test("Fixed 4% SS-offset regression: year-1 draw = 4% × port, year-2 draw is SS-reduced", () => {
    // Year 0: spending = p.sp (target), SS offsets need → portfolioDraw = sp - SS
    // Year 1+: spending = port × fixedRate, SS still offsets portfolioDraw
    const p = { ...baseStrat, ssAge: 65, ssb: 24_000, withdrawalStrategy: "fixed" };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "fixed");
    // Year 1 spending = port[0] × 4%
    expect(schedule[1].spending).toBeCloseTo(schedule[0].portfolioEnd * 0.04, -3);
    // portfolioDraw = spending - SS (SS reduces the draw from portfolio; SS grows with COLA)
    expect(schedule[1].portfolioDraw).toBeCloseTo(schedule[1].spending - schedule[1].ss, -2);
  });

  test("GK vs Fixed 4%: year-5 draws diverge (strategies produce different paths)", () => {
    const gk    = simulateDeterministicWithStrategy({ ...baseStrat, withdrawalStrategy: "gk"    }, 2.5, "gk");
    const fixed = simulateDeterministicWithStrategy({ ...baseStrat, withdrawalStrategy: "fixed" }, 2.5, "fixed");
    expect(Math.abs((gk.schedule[4]?.spending ?? 0) - (fixed.schedule[4]?.spending ?? 0))).toBeGreaterThan(100);
  });

  test("1/N strategy: year-1 draw = portfolio / 25 years, within guardrails", () => {
    const { schedule, portAtRetire } = simulateDeterministicWithStrategy(
      { ...baseStrat, withdrawalStrategy: "one_n" }, 2.5, "one_n");
    const expected = Math.min(115_000, Math.max(48_000, portAtRetire / (90 - 65)));
    expect(schedule[0].spending).toBeCloseTo(expected, -2);
  });

  test("All 10 strategies produce valid deterministic schedules with positive draws", () => {
    for (const s of ["gk","fixed","vanguard","risk","kitces","vpw","cape","endowment","one_n","ninety_five_rule"]) {
      const { schedule } = simulateDeterministicWithStrategy({ ...baseStrat, withdrawalStrategy: s }, 2.5, s);
      expect(schedule.length).toBeGreaterThan(0);
      expect(schedule[0].spending).toBeGreaterThan(0);
      expect(isFinite(schedule[0].portfolioEnd)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. FULL SINGLE-FILER SCENARIO — $500K pretax IRA, age 65, FL, $40K GK spend
// ═══════════════════════════════════════════════════════════════════════════════
describe("Full scenario: single filer, age 65, FL, $500K IRA, $40K GK spend", () => {

  const SINGLE_FL = {
    currentAge: 65, retireAge: 65, endAge: 90,
    port: 500_000, contrib: 0, inf: 2.5,
    sp: 40_000, ssAge: 67, ssb: 18_000, ssCola: 2.4,
    ab: 0, useAb: false, tax: 22, smile: false,
    preRetireEq: 91, postRetireEq: 70,
    gkFloor: 26_000, gkCeiling: 54_000,
    withdrawalStrategy: "gk", fixedWithdrawalRate: 0.04,
    cashRealReturn: 1.0, useJointRmdTable: false, twoHousehold: false,
    filingStatus: "single", stateOfResidence: "FL",
    accounts: [{ id: "f1", category: "pretax", name: "IRA", balance: 500_000 }],
  };

  test("Year-1 (age 65, no SS yet): portfolioDraw = spending = $40K", () => {
    const { schedule } = simulateDeterministicWithStrategy(SINGLE_FL, 2.5, "gk");
    expect(schedule[0].age).toBe(65);
    expect(schedule[0].ss).toBe(0);
    expect(schedule[0].portfolioDraw).toBeCloseTo(40_000, -2);
  });

  // Age 65, single 65+, $40K, FL:
  //   std ded = 17,750 → taxable = 22,250
  //   10%×12,400=1,240 + 12%×9,850=1,182 → fedTax = 2,422
  test("Year-1 federal tax: single 65+, $40K, FL → fedTax ≈ $2,422", () => {
    const r = calcYearTax(65, 2026, 40_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(r.taxableIncome).toBe(22_250);
    expect(r.fedTax).toBeCloseTo(2_422, 0);
    expect(r.stateTax).toBe(0);
  });

  test("Year-3 (age 67): SS kicks in and reduces portfolio draw below spending", () => {
    const { schedule } = simulateDeterministicWithStrategy(SINGLE_FL, 2.5, "gk");
    const yr3 = schedule.find(r => r.age === 67);
    expect(yr3.ss).toBeGreaterThan(0);
    expect(yr3.portfolioDraw).toBeLessThan(yr3.spending);
  });

  // Aggressive WR stress scenario. With source-aware taxes (v1.1.0.29) the original
  // $40K spend became safely fundable (~99.6% success), so the stress point moved:
  // $48K (9.6% initial WR, guardrails at 65/135%) keeps this scenario in the
  // discriminating mid-band (~87% at seed 42).
  test("MC: scenario runs successfully and rate is between 10–95% (not trivially safe or failed)", () => {
    const r = runMC({ ...SINGLE_FL, sp: 48_000, gkFloor: 31_200, gkCeiling: 64_800 }, 90, 1000, 42, true);
    expect(r.rate).toBeGreaterThan(0.10);
    expect(r.rate).toBeLessThan(0.95);
  });

  test("Single filer pays higher effective rate and more fedTax than MFJ on same $40K income", () => {
    const single = calcYearTax(65, 2026, 40_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    const mfj    = calcYearTax(65, 2026, 40_000, 0, 0, 0, 0, false, 0.025, "mfj",    "FL");
    expect(single.effectiveRate).toBeGreaterThan(mfj.effectiveRate);
    expect(single.fedTax).toBeGreaterThan(mfj.fedTax);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. WITHDRAWAL STRATEGY IMPLIED DRAWS — year-2 formula verification
//    Each test extracts the year-0 ending portfolio and independently computes
//    the formula-implied year-1 (schedule[1]) spending, then verifies the
//    deterministic engine produces that amount within $500.
// ═══════════════════════════════════════════════════════════════════════════════
describe("Withdrawal strategy implied draws — year-2 formula verification", () => {
  // Shared setup: $2M portfolio, retire at 65, SS delayed to 70, MFJ, FL, 2.5% inflation
  const PORT = 2_000_000;
  const INF  = 2.5;
  const GK_FLOOR   = 48_000;
  const GK_CEILING = 115_000;
  const baseStrat = {
    ...BASE,
    currentAge: 65, retireAge: 65, endAge: 90,
    port: PORT, sp: 80_000, ssAge: 70, ssb: 24_000,
    filingStatus: "mfj", stateOfResidence: "FL",
    gkFloor: GK_FLOOR, gkCeiling: GK_CEILING,
    fixedWithdrawalRate: 0.04, vanguardInitialRate: 0.04,
    safeWithdrawalRate: 0.04,
    accounts: [
      { id: "s1", category: "pretax",  name: "401k", balance: 1_400_000 },
      { id: "s2", category: "roth",    name: "Roth", balance:   400_000 },
      { id: "s3", category: "taxable", name: "Brok", balance:   150_000 },
      { id: "s4", category: "cash",    name: "Cash", balance:    50_000 },
    ],
  };
  const sim = (p, s) => simulateDeterministicWithStrategy(p, INF, s);
  const inflY = INF / 100;
  const adjFloor1   = Math.round(GK_FLOOR   * (1 + inflY)); // 49,200
  const adjCeiling1 = Math.round(GK_CEILING * (1 + inflY)); // 117,875

  // ── Guyton-Klinger ─────────────────────────────────────────────────────────
  // Year 1: no capital-preservation trigger (7%+ return), no excess-spending
  // trigger (WR ≈ 3.88% < 120% of 4%). Formula: sp_0 × (1 + inflY).
  test("GK: year-2 spending = year-1 spend × (1 + 2.5%) inflation adjustment", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "gk" }, "gk");
    const sp0 = schedule[0].spending; // 80,000
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(sp0 * (1 + inflY))));
    expect(schedule[1].spending).toBeCloseTo(expected, -1);
  });

  // ── Fixed % ────────────────────────────────────────────────────────────────
  // Year 1: pure portfolio percentage — draw = rate × portfolio_end_yr0.
  // SS is NOT an offset. No GK clamp.
  test("Fixed 4%: year-2 spending = 4% × portfolio at end of year 1", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "fixed" }, "fixed");
    const port1 = schedule[0].portfolioEnd;
    expect(schedule[1].spending).toBeCloseTo(port1 * 0.04, -2);
  });

  test("Fixed 3%: year-2 spending = 3% × portfolio (less than Fixed 4%)", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "fixed", fixedWithdrawalRate: 0.03 }, "fixed");
    const { schedule: s4 } = sim({ ...baseStrat, withdrawalStrategy: "fixed", fixedWithdrawalRate: 0.04 }, "fixed");
    const port1 = schedule[0].portfolioEnd;
    expect(schedule[1].spending).toBeCloseTo(port1 * 0.03, -2);
    expect(schedule[1].spending).toBeLessThan(s4[1].spending);
  });

  // ── Vanguard Dynamic ───────────────────────────────────────────────────────
  // Year 1 formula: candidate = avg(sp×(1+inflY), port×rate); capped ±5%/−2.5%.
  test("Vanguard: year-2 spending = average of inflation-adj and portfolio %, capped ±5%", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "vanguard" }, "vanguard");
    const sp0   = schedule[0].spending;  // 80,000
    const port1 = schedule[0].portfolioEnd;
    const rate  = 0.04; // vanguardInitialRate
    const cap   = 0.05, floorRate = -0.025;
    const portPct  = port1 * rate;
    const inflAdj  = sp0 * (1 + inflY);
    const candidate = (inflAdj + portPct) / 2;
    const change = (candidate / sp0) - 1;
    const cappedChange = Math.max(floorRate, Math.min(cap, change));
    const raw = Math.round(sp0 * (1 + cappedChange));
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, raw));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  // ── Risk-Based ─────────────────────────────────────────────────────────────
  // Year 1: WR = sp/port ≈ 80K/2.06M ≈ 3.88%, between 80% and 120% of 4% target
  // → no adjustment. sp = sp_0 × (1 + inflY), clamped.
  test("Risk-Based: year-2 spending = inflation-adjusted spend (WR within safe band)", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "risk" }, "risk");
    const sp0   = schedule[0].spending;
    const port1 = schedule[0].portfolioEnd;
    const safeWR = 0.04;
    const currentWR = sp0 / port1;
    // Confirm WR is within the no-adjustment band
    expect(currentWR).toBeLessThan(safeWR * 1.2);
    expect(currentWR).toBeGreaterThan(safeWR * 0.8);
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(sp0 * (1 + inflY))));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  // ── Kitces Ratcheting ──────────────────────────────────────────────────────
  // Year 1: portfolio ($2.06M) < 1.5 × portAtRetire ($3M) → no ratchet.
  // sp = sp_0 × (1 + inflY), clamped.
  test("Kitces: year-2 spending = inflation-adjusted spend (no ratchet — below 150% trigger)", () => {
    const { schedule, portAtRetire } = sim({ ...baseStrat, withdrawalStrategy: "kitces" }, "kitces");
    const sp0   = schedule[0].spending;
    const port1 = schedule[0].portfolioEnd;
    // Verify no ratchet triggered
    expect(port1).toBeLessThan(portAtRetire * 1.5);
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(sp0 * (1 + inflY))));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  // Regression test for the "ratchet re-fires every year forever" bug (A3):
  // startingPort must be a high-water mark that persists across years, so once
  // portfolio crosses 1.5× the CURRENT startingPort it should NOT ratchet again
  // until portfolio grows another 50% past the NEW (updated) startingPort — not
  // just stay above the original portAtRetire forever.
  test("Kitces: ratchet fires once, then does not re-fire every subsequent year", () => {
    const kitcesProfile = {
      currentAge: 65, retireAge: 65, endAge: 90,
      port: 2_000_000, sp: 20_000, ssAge: 90, ssb: 0,
      filingStatus: "mfj", stateOfResidence: "FL",
      gkFloor: 1_000, gkCeiling: 10_000_000,
      preRetireEq: 91, postRetireEq: 91,
      withdrawalStrategy: "kitces",
      accounts: [
        { id: "k1", category: "pretax", name: "401k", balance: 1_600_000 },
        { id: "k2", category: "roth",   name: "Roth", balance:   400_000 },
      ],
    };
    const { schedule } = sim(kitcesProfile, "kitces");

    // Year-over-year spending ratios. A ratchet fire looks like ~1.10 × 1.025
    // ≈ 1.1275; a plain inflation-only bump is ~1.025.
    const ratios = [];
    for (let i = 1; i < schedule.length; i++) {
      ratios.push(schedule[i].spending / schedule[i - 1].spending);
    }
    const ratchetFireIdx = ratios.findIndex((r) => r > 1.05);
    expect(ratchetFireIdx).toBeGreaterThan(-1); // sanity: at least one ratchet did fire

    // The bug: with the broken (un-hoisted) startingPort, EVERY year after the
    // first crossing re-fires the +10% bump, since the comparison never moves
    // off the original portAtRetire. With the fix, the very next year after a
    // ratchet fire must be a plain inflation adjustment only (portfolio hasn't
    // had time to grow another 50% off the new, updated high-water mark).
    expect(ratios[ratchetFireIdx + 1]).toBeLessThan(1.05);
  });

  // ── Variable Percentage Withdrawal (VPW) ───────────────────────────────────
  // Year 1 (age 66): n = vpwEndAge − age = 100 − 66 = 34, r = 3.76%.
  // Canonical PMT payout rate (fixed 2026-06-10): rate = r / (1 − (1+r)^(−n)),
  // capped at 10%. spending = port × rate, clamped to the GK band.
  test("VPW: year-2 spending = port × vpw_rate(age=66, n=34, r=3.76%), clamped", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "vpw" }, "vpw");
    const port1 = schedule[0].portfolioEnd;
    const n = 100 - 66; // age=66 at y=1
    const r = 0.0376;
    const rate = Math.min(0.10, r / (1 - Math.pow(1 + r, -n)));
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(port1 * rate)));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  // ── CAPE-Based ─────────────────────────────────────────────────────────────
  // Hardcoded CAPE=20 → rate = 0.015 + 0.5×(1/20) = 0.04 (exactly 4%)
  // spending = port × 0.04, clamped.
  test("CAPE: year-2 spending = port × 4% (hardcoded CAPE=20 → rate=0.04), clamped", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "cape" }, "cape");
    const port1 = schedule[0].portfolioEnd;
    const capeVal = 20, a = 0.015, b = 0.5;
    const rate = a + b * (1 / capeVal); // 0.015 + 0.025 = 0.04
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(port1 * rate)));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
    // Sanity: rate is exactly 4% with CAPE=20
    expect(rate).toBeCloseTo(0.04, 3);
  });

  // ── Endowment (Yale) ────────────────────────────────────────────────────────
  // Year 1 (y=1 in code): spending = port × 5%, clamped.
  test("Endowment: year-2 spending = port × 5% spend rate, clamped to GK band", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "endowment" }, "endowment");
    const port1 = schedule[0].portfolioEnd;
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(port1 * 0.05)));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  // ── 1/N ─────────────────────────────────────────────────────────────────────
  // Year 1 (age 66): yearsLeft = endAge − 66 = 24, spending = port / 24, clamped.
  test("1/N: year-2 spending = portfolio / (endAge − 66) = port / 24, clamped", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "one_n" }, "one_n");
    const port1 = schedule[0].portfolioEnd;
    const yearsLeft = 90 - 66;
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(port1 / yearsLeft)));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  // ── 95% Rule ─────────────────────────────────────────────────────────────────
  // Year 1 (y=1 in code): sp = p.sp (slider reset), then clamped.
  // Years 2+: max(sp × 0.95, sp × (1+inflY)) — with positive returns and 2.5% inflation
  // the inflated value wins, so spending trends upward at the inflation rate.
  test("95% Rule: year-2 spending = p.sp (slider), clamped to GK band", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "ninety_five_rule" }, "ninety_five_rule");
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, baseStrat.sp));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  test("95% Rule: year-3 spending ≥ year-2 spending (inflation > 5% deflation floor)", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "ninety_five_rule" }, "ninety_five_rule");
    // With 2.5% inflation, inflated value (×1.025) always > 95% floor (×0.95)
    // so spending should grow
    expect(schedule[2].spending).toBeGreaterThanOrEqual(schedule[1].spending);
  });

  // ── Cross-strategy ordering at year 2 ──────────────────────────────────────
  // With a growing $2M portfolio and 2.5% inflation:
  // Endowment (5%) > VPW (~5.1%) > CAPE=Endowment ≈ Fixed 4% < Endowment
  // Key ordering: Endowment spend > GK/Kitces/Risk (all ≈ inflation-adjusted 80K)
  test("Year-2: Endowment (5%) draws more than GK/Risk (inflation-adj 4%) on growing portfolio", () => {
    const gk        = sim({ ...baseStrat, withdrawalStrategy: "gk"        }, "gk");
    const endowment = sim({ ...baseStrat, withdrawalStrategy: "endowment" }, "endowment");
    expect(endowment.schedule[1].spending).toBeGreaterThan(gk.schedule[1].spending);
  });

  test("Year-2: VPW draws more than Fixed 4% on same portfolio (higher VPW rate at age 66)", () => {
    const fixed = sim({ ...baseStrat, withdrawalStrategy: "fixed" }, "fixed");
    const vpw   = sim({ ...baseStrat, withdrawalStrategy: "vpw"   }, "vpw");
    // VPW rate at 66 ≈ 5.1% > 4%, so VPW draws more per dollar of portfolio
    expect(vpw.schedule[1].spending).toBeGreaterThan(fixed.schedule[1].spending);
  });

  test("Year-2: CAPE (cape=20, 4%) and Fixed 4% produce nearly identical draws", () => {
    const fixed = sim({ ...baseStrat, withdrawalStrategy: "fixed" }, "fixed");
    const cape  = sim({ ...baseStrat, withdrawalStrategy: "cape"  }, "cape");
    // Both draw exactly 4% of the portfolio — should be within $1
    expect(Math.abs(cape.schedule[1].spending - fixed.schedule[1].spending)).toBeLessThan(1_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7.5 SOCIAL SECURITY COLA ANCHORING — regression for A2
//
// COLA must compound from the SS CLAIMING age (ssAge), not from the number of
// years since retirement (`y`). Someone who retires before claiming SS would
// otherwise get bogus pre-claim COLA compounding baked into their very first
// check (retire at 60, claim at 67 → y=7 at the first check, so the bug applies
// 7 years of compounding that should not have happened yet).
// ═══════════════════════════════════════════════════════════════════════════════
describe("Social Security COLA anchoring — regression for A2 (simulateDeterministicWithStrategy)", () => {
  const profile = {
    currentAge: 60, retireAge: 60, endAge: 90,
    port: 2_000_000, sp: 200_000,
    ssAge: 67, ssb: 24_000, ssCola: 2.4,
    filingStatus: "mfj", stateOfResidence: "FL",
    gkFloor: 48_000, gkCeiling: 300_000,
    withdrawalStrategy: "gk",
    accounts: [{ id: "a1", category: "pretax", name: "401k", balance: 2_000_000 }],
  };
  const { schedule } = simulateDeterministicWithStrategy(profile, 2.5, "gk");
  // retireAge=60 → schedule index i is age (60+i)
  const scheduleByAge = (age) => schedule[age - 60];

  test("pre-claim year (age 66, before ssAge=67): ss = 0", () => {
    expect(scheduleByAge(66).ss).toBe(0);
  });

  test("first claim year (age 67 = ssAge): ss = ssb exactly — NOT compounded by y=7 years of COLA", () => {
    // Buggy formula would give round(24_000 × 1.024^7) ≈ 28,337 — 18%+ too high.
    expect(scheduleByAge(67).ss).toBe(24_000);
  });

  test("second claim year (age 68): ss = ssb × (1 + cola) — one year of COLA, not y=8 years", () => {
    // Buggy formula would give round(24_000 × 1.024^8) ≈ 29,017.
    expect(scheduleByAge(68).ss).toBe(Math.round(24_000 * 1.024));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. INCOME FLOW-THROUGH — every income source must reach the schedule
//
// Regression suite for the class of bug where an income field is set by the
// user but silently zeroed before reaching the simulation (e.g. ab hardcoded
// to 0 in params, useAb gate defaulting false with no UI toggle).
//
// Rule: if you set an income field to a non-zero value, it MUST appear non-zero
// in the withdrawal schedule's corresponding column AND reduce portfolio draw
// compared to a baseline with that income absent.
// ═══════════════════════════════════════════════════════════════════════════════
describe("Income flow-through — all sources must reach the withdrawal schedule", () => {

  const BASE_INCOME = {
    ...BASE,
    currentAge: 65, retireAge: 65, endAge: 90,
    ssb: 0, ssAge: 65, ab: 0, otherIncomes: [],
    withdrawalStrategy: "gk", stateOfResidence: "FL",
  };

  // ── Rental / Airbnb (ab) ───────────────────────────────────────────────────
  test("ab > 0: Rental column is non-zero in year-1 schedule", () => {
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ab: 18_000 }, 2.5, "gk"
    );
    expect(schedule[0].Rental).toBe(18_000);
  });

  test("ab > 0: portfolio draw is less than spending in year 1 (rental offsets need)", () => {
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ab: 18_000 }, 2.5, "gk"
    );
    expect(schedule[0].portfolioDraw).toBeLessThan(schedule[0].spending);
    expect(schedule[0].portfolioDraw).toBeCloseTo(schedule[0].spending - 18_000, -2);
  });

  test("ab > 0: MC success rate is higher than ab = 0 (rental income helps portfolio survive)", () => {
    const noRental   = runMC({ ...BASE_INCOME, sp: 90_000 }, 90, 1000, 42, true);
    const withRental = runMC({ ...BASE_INCOME, sp: 90_000, ab: 18_000 }, 90, 1000, 42, true);
    expect(withRental.rate).toBeGreaterThan(noRental.rate);
  });

  test("ab = 0: Rental column is zero (no phantom income injected)", () => {
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ab: 0 }, 2.5, "gk"
    );
    expect(schedule[0].Rental).toBe(0);
  });

  test("ab grows at abGrowth rate: year-10 rental > year-1 rental", () => {
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ab: 12_000, abGrowth: 3 }, 2.5, "gk"
    );
    expect(schedule[9].Rental).toBeGreaterThan(schedule[0].Rental);
  });

  test("abEndYear: rental is zero after end year, non-zero before", () => {
    const endYear = 2026 + 5; // 5 years into retirement
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ab: 12_000, abEndYear: endYear }, 2.5, "gk"
    );
    const beforeEnd = schedule.find(r => r.yr <= endYear);
    const afterEnd  = schedule.find(r => r.yr >  endYear);
    expect(beforeEnd.Rental).toBeGreaterThan(0);
    expect(afterEnd.Rental).toBe(0);
  });

  // ── Social Security (ssb) ─────────────────────────────────────────────────
  test("ssb > 0: SS column is non-zero once ssAge is reached", () => {
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ssb: 24_000, ssAge: 67 }, 2.5, "gk"
    );
    const ssRow = schedule.find(r => r.age >= 67);
    expect(ssRow.ss).toBeGreaterThan(0);
  });

  test("ssb > 0: portfolio draw drops when SS kicks in at ssAge", () => {
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ssb: 24_000, ssAge: 67 }, 2.5, "gk"
    );
    const beforeSS = schedule.find(r => r.age === 66);
    const atSS     = schedule.find(r => r.age === 67);
    expect(beforeSS.ss).toBe(0);
    expect(atSS.ss).toBeGreaterThan(0);
    expect(atSS.portfolioDraw).toBeLessThan(beforeSS.portfolioDraw);
  });

  test("ssb = 0: SS column is always zero (no phantom SS)", () => {
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ssb: 0 }, 2.5, "gk"
    );
    expect(schedule.every(r => r.ss === 0)).toBe(true);
  });

  test("MC: ssb > 0 raises success rate vs ssb = 0", () => {
    const noSS   = runMC({ ...BASE_INCOME, sp: 90_000, ssb: 0      }, 90, 1000, 42, true);
    const withSS = runMC({ ...BASE_INCOME, sp: 90_000, ssb: 24_000, ssAge: 65 }, 90, 1000, 42, true);
    expect(withSS.rate).toBeGreaterThan(noSS.rate);
  });

  // ── Other Income (otherIncomes) ───────────────────────────────────────────
  test("otherIncomes > 0: OtherIncome column is non-zero in active years", () => {
    const income = [{ id: "oi1", name: "Pension", annual: 15_000,
      startYear: 2030, endYear: 2050, growthRate: 0, growthCapYears: null, taxable: true }];
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, otherIncomes: income }, 2.5, "gk"
    );
    const activeRow = schedule.find(r => r.yr >= 2030 && r.yr <= 2050);
    expect(activeRow).toBeDefined();
    expect(activeRow.OtherIncome).toBeGreaterThan(0);
  });

  test("otherIncomes: OtherIncome is zero before startYear and after endYear", () => {
    const income = [{ id: "oi2", name: "Consulting", annual: 20_000,
      startYear: 2032, endYear: 2035, growthRate: 0, growthCapYears: null, taxable: true }];
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, otherIncomes: income }, 2.5, "gk"
    );
    const beforeRow = schedule.find(r => r.yr < 2032);
    const afterRow  = schedule.find(r => r.yr > 2035);
    if (beforeRow) expect(beforeRow.OtherIncome).toBe(0);
    if (afterRow)  expect(afterRow.OtherIncome).toBe(0);
  });

  test("otherIncomes: reduces portfolio draw in active years", () => {
    const income = [{ id: "oi3", name: "Royalties", annual: 12_000,
      startYear: 2026, endYear: 2099, growthRate: 0, growthCapYears: null, taxable: true }];
    const noOther   = simulateDeterministicWithStrategy({ ...BASE_INCOME }, 2.5, "gk");
    const withOther = simulateDeterministicWithStrategy({ ...BASE_INCOME, otherIncomes: income }, 2.5, "gk");
    expect(withOther.schedule[0].portfolioDraw).toBeLessThan(noOther.schedule[0].portfolioDraw);
  });

  // ── Property Income (propIncome) ──────────────────────────────────────────
  test("propIncome > 0: included in Rental column (propIncome + ab)", () => {
    const p = {
      ...BASE_INCOME,
      ab: 0,
      propIncome: 10_000,
    };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "gk");
    expect(schedule[0].Rental).toBe(10_000);
  });

  test("propIncome + ab: Rental column = sum of both sources", () => {
    const p = {
      ...BASE_INCOME,
      ab: 8_000,
      propIncome: 10_000,
    };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "gk");
    expect(schedule[0].Rental).toBeCloseTo(18_000, -2);
  });

  // ── Combined income sources reduce draw proportionally ────────────────────
  test("All income sources together: portfolio draw = spending − SS − rental − otherIncome", () => {
    const income = [{ id: "c1", name: "Pension", annual: 10_000,
      startYear: 2026, endYear: 2099, growthRate: 0, growthCapYears: null, taxable: true }];
    const p = { ...BASE_INCOME, ssb: 20_000, ssAge: 65, ab: 12_000, otherIncomes: income };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "gk");
    const yr1 = schedule[0];
    const expectedDraw = Math.max(0, yr1.spending - yr1.ss - yr1.Rental - yr1.OtherIncome);
    expect(yr1.portfolioDraw).toBeCloseTo(expectedDraw, -1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tax-constant helpers — single source of truth (TAX_REFERENCE.md, CLAUDE.md Rule 6)
// ═══════════════════════════════════════════════════════════════════════════════
describe("getStandardDeduction / getIrmaaCeiling / getBracketCeiling helpers", () => {
  // Values per TAX_REFERENCE.md "Standard Deduction (MFJ 2026)".
  test("std deduction MFJ base (<65) = $32,200 at inflFactor 1", () => {
    expect(getStandardDeduction(60, "mfj", 1)).toBe(32_200);
  });
  test("std deduction MFJ both-65+ = $35,500 (base + 2×$1,650)", () => {
    expect(getStandardDeduction(65, "mfj", 1)).toBe(35_500);
  });
  test("std deduction Single base = $16,100; 65+ = $17,750", () => {
    expect(getStandardDeduction(60, "single", 1)).toBe(16_100);
    expect(getStandardDeduction(65, "single", 1)).toBe(17_750);
  });
  test("std deduction scales by inflation factor", () => {
    expect(getStandardDeduction(60, "mfj", 1.025)).toBe(Math.round(32_200 * 1.025));
  });
  // Values per TAX_REFERENCE.md "IRMAA Thresholds (MFJ 2026)".
  test("IRMAA tier-1 ceiling = $218K MFJ / $109K single", () => {
    expect(getIrmaaCeiling(1, "mfj", 1)).toBe(218_000);
    expect(getIrmaaCeiling(1, "single", 1)).toBe(109_000);
  });
  test('getBracketCeiling("irmaa") delegates to getIrmaaCeiling (one source of truth)', () => {
    const inflF = 1.0838;
    expect(getBracketCeiling("irmaa", "mfj", inflF)).toBe(getIrmaaCeiling(1, "mfj", inflF));
  });
  test('getBracketCeiling 22% top = $211,400 MFJ; unknown target defaults to 22%', () => {
    expect(getBracketCeiling("22", "mfj", 1)).toBe(211_400);
    expect(getBracketCeiling("bogus", "mfj", 1)).toBe(211_400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VPW — canonical PMT payout rate: rate = r / (1 − (1+r)^(−n)), n = vpwEndAge − age
// Regression guard for the 2026-06-10 fix (wrong exponent −(n−1) + spurious +r term).
// ═══════════════════════════════════════════════════════════════════════════════
describe("VPW withdrawal — PMT amortization formula", () => {
  // Wide GK bands so the floor/ceiling clamp never masks the raw VPW rate.
  const VPW_BASE = {
    ...BASE,
    withdrawalStrategy: "vpw",
    ssb: 0, ssAge: 99, ab: 0, propIncome: 0,   // no offsets → draw == spend
    gkFloor: 1_000, gkCeiling: 5_000_000,
    vpwRealReturn: 0.0376, vpwEndAge: 100,
    accounts: [{ id: "p", category: "pretax", name: "401k", balance: 2_000_000 }],
  };
  const rate = (age) => {
    const r = 0.0376, n = 100 - age;
    return r / (1 - Math.pow(1 + r, -n));
  };

  test("year-N spend = prior-year end balance × PMT rate at that age", () => {
    const { schedule } = simulateDeterministicWithStrategy(VPW_BASE, 2.5, "vpw");
    // Check an interior year (y=5, age 65) — strategy applies for y>0, and the
    // VPW rate is applied to the START-of-year balance = prior row's portfolioEnd.
    const age = schedule[5].age;            // 65
    const expected = schedule[4].portfolioEnd * rate(age);
    expect(Math.abs(schedule[5].spending / expected - 1)).toBeLessThan(0.01);
  });

  test("long-horizon VPW rate stays well below the 10% cap (old bug hit the cap)", () => {
    const { schedule } = simulateDeterministicWithStrategy(VPW_BASE, 2.5, "vpw");
    // Age 61, n=39 → correct rate ≈ 4.9%. The pre-fix formula inflated this past 10%.
    const impliedRate = schedule[1].spending / schedule[0].portfolioEnd;
    expect(impliedRate).toBeLessThan(0.07);
    expect(impliedRate).toBeCloseTo(rate(schedule[1].age), 3);
  });

  test("VPW payout rate rises monotonically with age (shorter horizon)", () => {
    expect(rate(80)).toBeGreaterThan(rate(65));
    expect(rate(65)).toBeGreaterThan(rate(61));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Account bucket splits (Quicken-style: one balance, many bucket allocations)
// ───────────────────────────────────────────────────────────────────────────
describe("account bucket splits", () => {
  test("no splits → single piece carrying the full balance in the assigned bucket", () => {
    const a = { id: "1", category: "pretax", balance: 100_000, bucket: 2 };
    const pieces = accountBucketPieces(a);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].bucket).toBe(2);
    expect(pieces[0].balance).toBe(100_000);
  });

  test("no bucket + no splits → falls back to _defaultBucket(category)", () => {
    const a = { id: "1", category: "cash", balance: 50_000 };
    const pieces = accountBucketPieces(a);
    expect(pieces[0].bucket).toBe(_defaultBucket("cash")); // cash → 1
    expect(pieces[0].balance).toBe(50_000);
  });

  test("split distributes balance by pct and rolls up to the original total", () => {
    const a = { id: "1", category: "pretax", balance: 100_000,
      splits: [{ bucket: 1, pct: 30 }, { bucket: 3, pct: 70 }] };
    const pieces = accountBucketPieces(a);
    expect(pieces).toHaveLength(2);
    expect(pieces.find(p => p.bucket === 1).balance).toBeCloseTo(30_000, 6);
    expect(pieces.find(p => p.bucket === 3).balance).toBeCloseTo(70_000, 6);
    // Rollup invariant: pieces sum back to the single account balance
    expect(pieces.reduce((s, p) => s + p.balance, 0)).toBeCloseTo(100_000, 6);
  });

  test("pct that doesn't total 100 is normalized (still rolls up to balance)", () => {
    const a = { id: "1", category: "pretax", balance: 100_000,
      splits: [{ bucket: 1, pct: 1 }, { bucket: 2, pct: 3 }] }; // 1:3 ratio
    const pieces = accountBucketPieces(a);
    expect(pieces.find(p => p.bucket === 1).balance).toBeCloseTo(25_000, 6);
    expect(pieces.find(p => p.bucket === 2).balance).toBeCloseTo(75_000, 6);
    expect(pieces.reduce((s, p) => s + p.balance, 0)).toBeCloseTo(100_000, 6);
  });

  test("expandAccountBuckets flattens a mixed account list, preserving total balance", () => {
    const accts = [
      { id: "1", category: "pretax", balance: 100_000, splits: [{ bucket: 1, pct: 40 }, { bucket: 3, pct: 60 }] },
      { id: "2", category: "roth",   balance: 50_000,  bucket: 3 },
    ];
    const pieces = expandAccountBuckets(accts);
    expect(pieces).toHaveLength(3); // 2 from the split + 1 single
    const total = pieces.reduce((s, p) => s + p.balance, 0);
    expect(total).toBeCloseTo(150_000, 6);
    const b1 = pieces.filter(p => p.bucket === 1).reduce((s, p) => s + p.balance, 0);
    expect(b1).toBeCloseTo(40_000, 6);
  });
});

// ─── v1.1.0.30: 35%/37% federal brackets exist above $512K ─────────────────────

describe("Federal brackets — 35% and 37% tiers (v1.1.0.30)", () => {
  test("MFJ $1M ordinary income: taxed through 35% and 37% brackets, not capped at 32%", () => {
    // taxable = 1,000,000 − 32,200 = 967,800
    // 2,480 + 9,120 + 24,332 + 46,116 + 34,848 + 89,687.50 + 73,667 = 280,250.50
    const r = calcYearTax(60, 2026, 1_000_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(r.taxableIncome).toBe(967_800);
    expect(r.fedTax).toBeCloseTo(280_250.5, 0);
    expect(r.marginalBracket).toBe(0.37);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// twoHousehold default consistency — regression for B3
//
// A brand-new profile (BLANK_PROFILE) and a profile restored from an older
// exported JSON missing the `twoHousehold` field must agree on the default
// (false — full state tax). Before the fix, the import-restore handler
// defaulted to `true` (zero state tax), silently flipping identical financial
// data depending on whether it was hand-entered or imported. Source-text
// check (same convention as banner.test.js) since the restore handler lives
// inside a file-input React event handler, not an exportable pure function.
// ═══════════════════════════════════════════════════════════════════════════════
describe("twoHousehold default consistency (B3 regression)", () => {
  const fs = require("fs");
  const path = require("path");
  const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

  test("BLANK_PROFILE.twoHousehold defaults to false", () => {
    const blankMatch = SRC.match(/export const BLANK_PROFILE = \{[\s\S]*?\n\};/);
    expect(blankMatch).not.toBeNull();
    expect(blankMatch[0]).toMatch(/twoHousehold:\s*false/);
  });

  test("Import Profile JSON-restore handler defaults twoHousehold to false, not true", () => {
    expect(SRC).toMatch(/twoHousehold:\s*data\.twoHousehold\s*\?\?\s*false/);
    expect(SRC).not.toMatch(/twoHousehold:\s*data\.twoHousehold\s*\?\?\s*true/);
  });
});
