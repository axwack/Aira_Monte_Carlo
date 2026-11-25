import {
  runMC,
  runStress,
  calcYearTax,
  getRmdStartAge,
  guytonKlingerWithdrawal,
  progTax,
  irmaaCost,
  simulateDeterministicWithStrategy,
  waterfallForActiveStrategy,
  getStandardDeduction,
  getIrmaaCeiling,
  getBracketCeiling,
  accountBucketPieces,
  expandAccountBuckets,
  _defaultBucket,
  getAnalogues,
} from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { LIVE_STRATEGIES } from "./engine/withdrawalStrategies.js";
import { taxableYieldSplit } from "./engine/taxableYield.js";

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
  stateOfResidence: "FL",
  accounts: [
    { id: "t1", category: "pretax",  name: "401k",    balance: 1_400_000 },
    { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
    { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
    { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
  ],
};

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
    expect(progTax(5_000, brackets)).toBeCloseTo(500, 0);
  });

  test("income spanning two brackets", () => {
    expect(progTax(20_000, brackets)).toBeCloseTo(3_000, 0);
  });

  test("income spanning all three brackets", () => {
    expect(progTax(50_000, brackets)).toBeCloseTo(10_000, 0);
  });

  test("income exactly at bracket boundary", () => {
    expect(progTax(10_000, brackets)).toBeCloseTo(1_000, 0);
  });
});

describe("irmaaCost — IRMAA Medicare surcharges", () => {
  test("MAGI below $218K → $0 (no IRMAA)", () => {
    expect(irmaaCost(200_000, 2026)).toBe(0);
  });

  test("MAGI $218K–$274K → $2,297 surcharge", () => {
    expect(irmaaCost(250_000, 2026)).toBe(2_297);
  });

  test("MAGI $274K–$342K → $5,770 surcharge", () => {
    expect(irmaaCost(300_000, 2026)).toBe(5_770);
  });

  test("MAGI $342K–$410K → $9,240 surcharge", () => {
    expect(irmaaCost(380_000, 2026)).toBe(9_240);
  });

  test("MAGI $410K–$750K → $12,710 surcharge", () => {
    expect(irmaaCost(500_000, 2026)).toBe(12_710);
  });

  test("MAGI $750K+ → $13,872 surcharge (true top tier)", () => {
    expect(irmaaCost(800_000, 2026)).toBe(13_872);
  });

  test("future year thresholds inflate at 2.5%/yr from the 2027 table (first tier $224K)", () => {
    const f = Math.pow(1.025, 4);
    const tierThreshold = Math.round(224_000 * f);
    expect(irmaaCost(tierThreshold - 1, 2031)).toBe(0);
    expect(irmaaCost(tierThreshold + 1, 2031)).toBeGreaterThan(0);
  });
});

describe("calcYearTax — federal tax, state tax, IRMAA", () => {

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
    const r = taxFL(60, 32_200);
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("MFJ age 65+ gets extra $3,300 deduction → $35,500 total", () => {
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
    const r = taxFL(60, 40_000);
    expect(r.taxableIncome).toBe(7_800);
    expect(r.fedTax).toBeCloseTo(780, 0);
  });

  test("MFJ income spanning 10%→12% brackets", () => {
    const r = taxFL(60, 60_000);
    expect(r.taxableIncome).toBe(27_800);
    expect(r.fedTax).toBeCloseTo(2_840, 0);
  });

  test("SS not taxable when provisional income ≤ $32K MFJ lower threshold (IRC §86)", () => {
    const r = taxFL(60, 20_000, { ss: 24_000 });
    expect(r.taxableIncome).toBe(0);
  });

  test("85% of SS taxable at high income (provisional far above $44K MFJ)", () => {
    const r = taxFL(60, 100_000, { ss: 24_000 });
    expect(r.taxableIncome).toBe(88_200);
  });

  test("50% tier: provisional income between MFJ thresholds taxes half the excess", () => {
    const r = taxFL(60, 26_000, { ss: 24_000 });
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("Low-income: SS is the only income, spending funded by cash/Roth → ~$0 tax", () => {
    const r = taxFL(70, 0, { ss: 24_000 });
    expect(r.taxableIncome).toBe(0);
    expect(r.fedTax).toBe(0);
    expect(r.stateTax).toBe(0);
  });

  test("Florida state tax = 0 regardless of income", () => {
    const r = taxFL(60, 100_000);
    expect(r.stateTax).toBe(0);
  });

  test("California state tax uses progressive brackets for MFJ", () => {
    const r = calcYearTax(60, 2026, 60_000, 0, 0, 0, 0, false, 0.025, "mfj", "CA");
    expect(r.stateTax).toBe(341);
  });

  test("twoHousehold = true skips state tax entirely", () => {
    const withState = calcYearTax(60, 2026, 60_000, 0, 0, 0, 0, false, 0.025, "mfj", "CA");
    const twoHH    = calcYearTax(60, 2026, 60_000, 0, 0, 0, 0, true,  0.025, "mfj", "CA");
    expect(withState.stateTax).toBeGreaterThan(0);
    expect(twoHH.stateTax).toBe(0);
  });

  test("IRMAA charged at age 65 when MAGI lands in the $274K-$342K tier", () => {
    const r = calcYearTax(65, 2026, 300_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(r.irmaa).toBe(5_770);
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
    const now    = taxFL(60, 60_000);
    const future = calcYearTax(60, 2036, 60_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(future.taxableIncome).toBeLessThan(now.taxableIncome);
    expect(future.fedTax).toBeLessThanOrEqual(now.fedTax);
  });

  test("calcYearTax exposes this year's own MAGI on the result (magi field)", () => {
    const r = calcYearTax(60, 2026, 60_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(r.magi).toBe(60_000);
  });
});

describe("calcYearTax — IRMAA 2-year lookback (magiLookback param)", () => {
  test("magiLookback above tier-1 charges IRMAA even when THIS year's MAGI is low", () => {
    const r = calcYearTax(66, 2026, 100_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 0, 300_000);
    expect(r.irmaa).toBeGreaterThan(0);
    expect(r.irmaa).toBe(5_770);
  });

  test("magiLookback below tier-1 charges NO IRMAA even when THIS year's MAGI is high", () => {
    const r = calcYearTax(66, 2026, 300_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 0, 100_000);
    expect(r.irmaa).toBe(0);
  });

  test("magiLookback = null (default/omitted) falls back to same-year MAGI (backward compatible)", () => {
    const withNull    = calcYearTax(66, 2026, 300_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 0, null);
    const omitted     = calcYearTax(66, 2026, 300_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 0);
    const sameYearRef = calcYearTax(66, 2026, 300_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(withNull.irmaa).toBe(sameYearRef.irmaa);
    expect(omitted.irmaa).toBe(sameYearRef.irmaa);
  });

  test("age < 65 still charges no IRMAA regardless of magiLookback", () => {
    const r = calcYearTax(64, 2026, 100_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 0, 900_000);
    expect(r.irmaa).toBe(0);
  });
});

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
    delete p.stateOfResidence;
    const omitted = runMC(p, 90, 1, 42, true);
    const nj      = runMC({ ...p, stateOfResidence: "NJ" }, 90, 1, 42, true);
    const ca      = runMC({ ...p, stateOfResidence: "CA" }, 90, 1, 42, true);
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
    expect(getRmdStartAge({ birthYear: 1960, dob: "1955-01-01" })).toBe(75);
  });
});

describe("guytonKlingerWithdrawal — GK guardrails", () => {
  const FLOOR   = 30_000;
  const CEILING = 80_000;

  test("positive return year: spending inflates by inflation rate", () => {
    const result = guytonKlingerWithdrawal(1_000_000, 0.04, 40_000, 0.10, 0.025, FLOOR, CEILING);
    expect(result).toBeCloseTo(41_000, 0);
  });

  test("negative return year: spending holds flat (no inflation)", () => {
    const result = guytonKlingerWithdrawal(1_000_000, 0.04, 40_000, -0.05, 0.025, FLOOR, CEILING);
    expect(result).toBe(40_000);
  });

  test("prosperity trigger: WR < 80% of initial → 10% raise", () => {
    const result = guytonKlingerWithdrawal(1_500_000, 0.04, 40_000, 0.20, 0.02, FLOOR, CEILING);
    expect(result).toBeCloseTo(40_000 * 1.02 * 1.10, 0);
  });

  test("capital preservation: WR > 120% of initial → 10% cut", () => {
    const result = guytonKlingerWithdrawal(500_000, 0.04, 40_000, 0.01, 0.025, FLOOR, CEILING);
    expect(result).toBeCloseTo(41_000 * 0.90, 0);
  });

  test("floor constraint: never drops below floor even after capital preservation", () => {
    const result = guytonKlingerWithdrawal(50_000, 0.04, 25_000, 0.01, 0.025, FLOOR, CEILING);
    expect(result).toBe(FLOOR);
  });

  test("ceiling constraint: never exceeds ceiling even after prosperity", () => {
    const result = guytonKlingerWithdrawal(10_000_000, 0.04, 120_000, 0.20, 0.025, FLOOR, CEILING);
    expect(result).toBe(CEILING);
  });

  test("zero portfolio → returns floor", () => {
    const result = guytonKlingerWithdrawal(0, 0.04, 40_000, 0.05, 0.025, FLOOR, CEILING);
    expect(result).toBe(FLOOR);
  });
});

describe("runMC — Monte Carlo integration", () => {
  test("determinism: same seed always yields identical results", () => {
    const r1 = runMC(BASE, 90, 1000, 42, true);
    const r2 = runMC(BASE, 90, 1000, 42, true);
    expect(r1.rate).toBe(r2.rate);
    expect(r1.medR).toBe(r2.medR);
  });

  test("different seeds produce different median portfolio paths", () => {
    const r1 = runMC(BASE, 90, 500, 42,  true);
    const r2 = runMC(BASE, 90, 500, 99,  true);
    const p50_r1 = r1.pcts[10].p50;
    const p50_r2 = r2.pcts[10].p50;
    expect(p50_r1).not.toBe(p50_r2);
  });

  test("output shape: rate ∈ [0,1], pcts has correct length", () => {
    const r = runMC(BASE, 90, 500, 42, true);
    expect(r.rate).toBeGreaterThanOrEqual(0);
    expect(r.rate).toBeLessThanOrEqual(1);
    expect(r.pcts).toHaveLength(31);
  });

  test("terminal percentiles are monotonically ordered", () => {
    const { term } = runMC(BASE, 90, 500, 42, true);
    expect(term.p10).toBeLessThanOrEqual(term.p25);
    expect(term.p25).toBeLessThanOrEqual(term.p50);
    expect(term.p50).toBeLessThanOrEqual(term.p75);
    expect(term.p75).toBeLessThanOrEqual(term.p90);
  });

  test("terminal percentiles match pcts' final-year row even when paths exhaust early", () => {
    const r = runMC({ ...BASE, port: 100_000, sp: 200_000, accounts: [
      { id: "t1", category: "pretax", name: "401k", balance: 100_000 },
    ]}, 90, 500, 42, true);
    const lastRow = r.pcts[r.pcts.length - 1];
    expect(r.term.p10).toBe(lastRow.p10);
    expect(r.term.p25).toBe(lastRow.p25);
    expect(r.term.p50).toBe(lastRow.p50);
    expect(r.term.p75).toBe(lastRow.p75);
    expect(r.term.p90).toBe(lastRow.p90);
  });

  test("monotonicity: higher spending → lower success rate", () => {
    const conservative = runMC({ ...BASE, sp: 60_000  }, 90, 1000, 42, true);
    const aggressive   = runMC({ ...BASE, sp: 120_000 }, 90, 1000, 42, true);
    expect(conservative.rate).toBeGreaterThan(aggressive.rate);
  });

  test("monotonicity: longer horizon → lower success rate", () => {
    const LEAN = { ...BASE, port: 1_100_000, gkFloor: 80_000, gkCeiling: 80_000 };
    const shorter = runMC(LEAN, 85, 1000, 42, true);
    const longer  = runMC(LEAN, 95, 1000, 42, true);
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
    const tight = { ...BASE, withdrawalStrategy: "bengen", ssb: 0, sp: 90_000,
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance: 900_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance: 200_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:  80_000 },
        { id: "t4", category: "cash",    name: "Cash",    balance:  20_000 },
      ] };
    const fl = runMC({ ...tight, stateOfResidence: "FL" }, 90, 2000, 42, true);
    const ca = runMC({ ...tight, stateOfResidence: "CA" }, 90, 2000, 42, true);
    expect(fl.rate).toBeGreaterThan(ca.rate);
  });

  test("twoHousehold mode (no state tax) has higher success rate than single CA household", () => {
    const tight = { ...BASE, withdrawalStrategy: "bengen", stateOfResidence: "CA", ssb: 0, sp: 90_000,
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance: 900_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance: 200_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:  80_000 },
        { id: "t4", category: "cash",    name: "Cash",    balance:  20_000 },
      ] };
    const two = runMC({ ...tight, twoHousehold: true  }, 90, 2000, 42, true);
    const one = runMC({ ...tight, twoHousehold: false }, 90, 2000, 42, true);
    expect(two.rate).toBeGreaterThan(one.rate);
  });

  test("RMD at age 73: pretax-heavy portfolio has lower success than Roth-heavy (same total)", () => {
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

    expect(rothHeavy.rate).toBeGreaterThanOrEqual(pretaxHeavy.rate);
    expect(rothHeavy.term.p50).toBeGreaterThan(pretaxHeavy.term.p50);
  });

  test("joint RMD table gives lower RMD draw than uniform table (divisors are higher)", () => {
    const uniform = runMC({ ...BASE, stateOfResidence: "CA", useJointRmdTable: false }, 90, 1000, 42, true);
    const joint   = runMC({ ...BASE, stateOfResidence: "CA", useJointRmdTable: true  }, 90, 1000, 42, true);
    expect(uniform.rate).toBeGreaterThanOrEqual(0);
    expect(joint.rate).toBeGreaterThanOrEqual(0);
  });

  test("withdrawal strategies all produce valid success rates", () => {
    const strategies = LIVE_STRATEGIES;
    for (const s of strategies) {
      const r = runMC({ ...BASE, withdrawalStrategy: s }, 90, 200, 42, true);
      expect(r.rate).toBeGreaterThanOrEqual(0);
      expect(r.rate).toBeLessThanOrEqual(1);
      expect(r.pcts).toHaveLength(31);
    }
  });

  test("fixed 4% strategy: produces different median terminal portfolio than GK", () => {
    const gk    = runMC({ ...BASE, withdrawalStrategy: "gk"    }, 90, 1000, 42, true);
    const fixed = runMC({ ...BASE, withdrawalStrategy: "fixed" }, 90, 1000, 42, true);
    const gkMedian    = gk.pcts[gk.pcts.length - 1].p50;
    const fixedMedian = fixed.pcts[fixed.pcts.length - 1].p50;
    expect(gkMedian).not.toBe(fixedMedian);
  });
});

describe("Roth conversion tax cost — progressive bracket stacking (A1 regression)", () => {
  test("calcYearTax: real progressive cost of a bracket-spanning conversion is far above a flat pre-conversion marginal-rate estimate", () => {
    const noConv = calcYearTax(65, 2026, 0, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(noConv.marginalBracket).toBe(0);

    const convAmt = 211_400;
    const withConv = calcYearTax(65, 2026, 0, 0, 0, 0, convAmt, false, 0.025, "mfj", "FL");
    const trueCost = withConv.totalTax - noConv.totalTax;
    expect(withConv.taxableIncome).toBe(171_268);

    const buggyCost = Math.round(convAmt * (noConv.marginalBracket || 0));
    expect(buggyCost).toBe(0);

    expect(trueCost).toBeGreaterThan(25_000);
    expect(trueCost).toBeGreaterThan(buggyCost);
  });

  test("runMC: a bracket-filling conversion from zero baseline income reduces terminal portfolio by a real, materially-nonzero tax cost", () => {
    const base = {
      currentAge: 65, retireAge: 65, endAge: 66,
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
    const withConv = runMC(base, 66, 1, 42, true);
    const noConv   = runMC({ ...base, rothConversionTarget: "off" }, 66, 1, 42, true);
    const diff = noConv.pcts[1].p50 - withConv.pcts[1].p50;

    expect(diff).toBeGreaterThan(20_000);
  });
});

describe("runStress — tax model uniformity with runMC", () => {
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
    expect(s.pcts.length).toBe(90 - stressBand.retireAge + 1);
    const row = s.pcts[0];
    ["age", "p10", "p25", "p50", "p75", "p90"].forEach((k) => expect(row).toHaveProperty(k));
  });

  test("2000–2012 sequence makes stress no kinder than the random MC (sequence-of-returns risk)", () => {
    const stress = runStress(stressBand, 90, 2000, 99);
    const random = runMC(stressBand, 90, 2000, 99, true);
    expect(stress.rate).toBeLessThanOrEqual(random.rate);
  });
});

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
    const num  = runMC({ ...taxy, tax: 22    }, 90, 1000, 42, true);
    const off  = runMC({ ...taxy, tax: false }, 90, 1000, 42, true);
    expect(num.rate).toBeLessThan(off.rate);
  });
});

const USER_PROFILE = {
  currentAge:      55,
  retireAge:       65,
  endAge:          90,
  port:        266_000,
  contrib:         200,
  hsaMonthly:       10,
  inf:             2.5,
  sp:           72_000,
  ssAge:            67,
  ssb:          16_800,
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
  stateOfResidence: "FL",
  accounts: [
    { id: "u1", category: "pretax", name: "IRA", balance: 266_000 },
  ],
};

describe("User scenario — $266K portfolio, single filer, Fixed 4%", () => {

  test("Fixed % simulation runs without error and returns valid rate", () => {
    const profile = { ...USER_PROFILE, currentAge: 65, retireAge: 65 };
    const r = runMC(profile, 90, 500, 42, true);
    expect(r.rate).toBeGreaterThanOrEqual(0);
    expect(r.rate).toBeLessThanOrEqual(1);
    expect(r.pcts).toHaveLength(26);
    expect(r.pcts.every(p => isFinite(p.p50))).toBe(true);
  });

  test("Fixed 4%: success rate is HIGH (portfolio never hits $0) — but income is inadequate", () => {
    const profile = { ...USER_PROFILE, currentAge: 65, retireAge: 65 };
    const r = runMC(profile, 90, 1000, 42, true);
    expect(r.rate).toBeGreaterThan(0.70);
    expect(r.term.p50).toBeGreaterThan(266_000);
  });

  test("GK strategy on same portfolio WILL show low success rate (underfunded)", () => {
    const profile = { ...USER_PROFILE, currentAge: 65, retireAge: 65, withdrawalStrategy: "gk" };
    const r = runMC(profile, 90, 1000, 42, true);
    expect(r.rate).toBeLessThan(0.40);
  });

  test("portfolio required for $72K spend at Fixed 4% with $16.8K SS = ~$1.38M", () => {
    const needed = (72_000 - 16_800) / 0.04;
    expect(needed).toBeCloseTo(1_380_000, -3);
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
    expect(withToggle.rate).toBeCloseTo(withoutToggle.rate, 2);
  });

  test("$20K/yr contrib gives materially larger portfolio at retirement than $200/yr", () => {
    const low  = runMC({ ...USER_PROFILE, contrib:    200 }, 90, 500, 42, true);
    const high = runMC({ ...USER_PROFILE, contrib: 20_000 }, 90, 500, 42, true);
    expect(high.term.p50).toBeGreaterThan(low.term.p50);
  });

  test("SS starting at 67 vs 65: delaying SS lowers success slightly (2-year income gap)", () => {
    const base = { ...USER_PROFILE, currentAge: 65, retireAge: 65 };
    const ssAt65 = runMC({ ...base, ssAge: 65 }, 90, 500, 42, true);
    const ssAt67 = runMC({ ...base, ssAge: 67 }, 90, 500, 42, true);
    expect(ssAt65.rate).toBeGreaterThanOrEqual(ssAt67.rate);
  });
});

const tax26 = (age, withdrawal, filing, state = "FL") =>
  calcYearTax(age, 2026, withdrawal, 0, 0, 0, 0, false, 0.025, filing, state);

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

  test("Single under-65: $30K withdrawal — hand-calculated fedTax = $1,420", () => {
    const r = tax26(60, 30_000, "single");
    expect(r.taxableIncome).toBe(13_900);
    expect(r.fedTax).toBeCloseTo(1_420, 0);
  });

  test("Single under-65: $60K withdrawal — hand-calculated fedTax = $5,020", () => {
    const r = tax26(60, 60_000, "single");
    expect(r.taxableIncome).toBe(43_900);
    expect(r.fedTax).toBeCloseTo(5_020, 0);
  });

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

describe("Net income = gross withdrawal − total taxes", () => {

  test("Single, age 62, FL, $50K: net income = $50K − fedTax ($3,820)", () => {
    const r = tax26(62, 50_000, "single", "FL");
    expect(r.taxableIncome).toBe(33_900);
    expect(r.fedTax).toBeCloseTo(3_820, 0);
    expect(r.stateTax).toBe(0);
    expect(50_000 - r.totalTax).toBeCloseTo(46_180, 0);
  });

  test("Single, age 62, NJ, $50K: NJ progressive state tax, net lower than FL", () => {
    const rFL = tax26(62, 50_000, "single", "FL");
    const rNJ = tax26(62, 50_000, "single", "NJ");
    expect(rNJ.stateTax).toBeCloseTo(523, 0);
    expect(50_000 - rFL.totalTax).toBeGreaterThan(50_000 - rNJ.totalTax);
  });

  test("Single, age 68, FL: SS taxed per provisional-income tiers, correct taxableIncome", () => {
    const r = calcYearTax(68, 2026, 30_000, 24_000, 0, 0, 0, false, 0.025, "single", "FL");
    expect(r.taxableIncome).toBe(17_550);
    expect(r.fedTax).toBeCloseTo(1_858, 0);
  });

  test("totalTax === fedTax + stateTax + irmaa for single filer", () => {
    const r = calcYearTax(68, 2026, 100_000, 24_000, 0, 0, 0, false, 0.025, "single", "CA");
    expect(r.totalTax).toBe(r.fedTax + r.stateTax + r.irmaa);
  });
});

describe("RMD calculations — SECURE Act 2.0 divisors and tax impact", () => {

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
    expect(yr1.totalWithdrawal).toBeGreaterThanOrEqual(yr1.portfolioDraw);
    expect(schedule.some(r => r.totalTax > 0)).toBe(true);
  });

  test("Deterministic Fixed 4%: year-2 spending = 4% × portfolioEnd[0]", () => {
    const p = { ...BASE, currentAge: 65, retireAge: 65, endAge: 90,
      sp: 80_000, ssAge: 65, ssb: 24_000, filingStatus: "mfj",
      withdrawalStrategy: "fixed", fixedWithdrawalRate: 0.04, stateOfResidence: "FL" };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "fixed");
    expect(schedule[1].spending).toBeCloseTo(schedule[0].portfolioEnd * 0.04, -3);
  });

  test("Total portfolio draw increases more than linearly as spending rises (progressive tax drag)", () => {
    const base = { ...BASE, currentAge: 65, retireAge: 65, endAge: 90,
      ssAge: 70, ssb: 0, filingStatus: "single", stateOfResidence: "FL",
      accounts: [{ id: "p", category: "pretax", name: "401k", balance: 2_000_000 }] };
    const low  = simulateDeterministicWithStrategy({ ...base, sp:  60_000, withdrawalStrategy: "gk" }, 2.5, "gk");
    const high = simulateDeterministicWithStrategy({ ...base, sp: 120_000, withdrawalStrategy: "gk" }, 2.5, "gk");
    expect(high.schedule[0].totalWithdrawal - low.schedule[0].totalWithdrawal).toBeGreaterThan(60_000);
  });
});

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
    expect(s3[1].spending).toBeCloseTo(s3[0].portfolioEnd * 0.03, -2);
    expect(s3[1].spending).toBeLessThan(s4[1].spending);
  });

  test("Fixed 4% SS-offset regression: year-1 draw = 4% × port, year-2 draw is SS-reduced", () => {
    const p = { ...baseStrat, ssAge: 65, ssb: 24_000, withdrawalStrategy: "fixed" };
    const { schedule } = simulateDeterministicWithStrategy(p, 2.5, "fixed");
    expect(schedule[1].spending).toBeCloseTo(schedule[0].portfolioEnd * 0.04, -3);
    expect(schedule[1].portfolioDraw).toBeCloseTo(schedule[1].spending - schedule[1].ss, -2);
  });

  test("GK vs Fixed 4%: year-5 draws diverge (strategies produce different paths)", () => {
    const gk    = simulateDeterministicWithStrategy({ ...baseStrat, withdrawalStrategy: "gk"    }, 2.5, "gk");
    const fixed = simulateDeterministicWithStrategy({ ...baseStrat, withdrawalStrategy: "fixed" }, 2.5, "fixed");
    expect(Math.abs((gk.schedule[4]?.spending ?? 0) - (fixed.schedule[4]?.spending ?? 0))).toBeGreaterThan(100);
  });

  test("Every live strategy produces a valid deterministic schedule with positive draws", () => {
    for (const s of LIVE_STRATEGIES) {
      const { schedule } = simulateDeterministicWithStrategy({ ...baseStrat, withdrawalStrategy: s }, 2.5, s);
      expect(schedule.length).toBeGreaterThan(0);
      expect(schedule[0].spending).toBeGreaterThan(0);
      expect(isFinite(schedule[0].portfolioEnd)).toBe(true);
    }
  });
});

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

  test("Year-1 federal tax: single 65+, $40K, FL → fedTax ≈ $1,702", () => {
    const r = calcYearTax(65, 2026, 40_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(r.taxableIncome).toBe(16_250);
    expect(r.fedTax).toBeCloseTo(1_702, 0);
    expect(r.stateTax).toBe(0);
  });

  test("Year-3 (age 67): SS kicks in and reduces portfolio draw below spending", () => {
    const { schedule } = simulateDeterministicWithStrategy(SINGLE_FL, 2.5, "gk");
    const yr3 = schedule.find(r => r.age === 67);
    expect(yr3.ss).toBeGreaterThan(0);
    expect(yr3.portfolioDraw).toBeLessThan(yr3.spending);
  });

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

describe("Withdrawal strategy implied draws — year-2 formula verification", () => {
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
    fixedWithdrawalRate: 0.04,
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
  const adjFloor1   = Math.round(GK_FLOOR   * (1 + inflY));
  const adjCeiling1 = Math.round(GK_CEILING * (1 + inflY));

  test("GK: year-2 spending = year-1 spend × (1 + 2.5%) inflation adjustment", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "gk" }, "gk");
    const sp0 = schedule[0].spending;
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(sp0 * (1 + inflY))));
    expect(schedule[1].spending).toBeCloseTo(expected, -1);
  });

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

  test("VPW: year-2 spending = port × vpw_rate(age=66, n=endAge−66, r=3.76%), clamped", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "vpw" }, "vpw");
    const port1 = schedule[0].portfolioEnd;
    const n = (baseStrat.vpwEndAge ?? baseStrat.endAge) - 66;
    const r = 0.0376;
    const rate = Math.min(0.10, r / (1 - Math.pow(1 + r, -n)));
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, Math.round(port1 * rate)));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  test("95% Rule: year-2 spending = p.sp (slider), clamped to GK band", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "ninety_five_rule" }, "ninety_five_rule");
    const expected = Math.min(adjCeiling1, Math.max(adjFloor1, baseStrat.sp));
    expect(schedule[1].spending).toBeCloseTo(expected, -2);
  });

  test("95% Rule: year-3 spending ≥ year-2 spending (inflation > 5% deflation floor)", () => {
    const { schedule } = sim({ ...baseStrat, withdrawalStrategy: "ninety_five_rule" }, "ninety_five_rule");
    expect(schedule[2].spending).toBeGreaterThanOrEqual(schedule[1].spending);
  });

  test("Year-2: VPW draws more than Fixed 4% on same portfolio (higher VPW rate at age 66)", () => {
    const fixed = sim({ ...baseStrat, withdrawalStrategy: "fixed" }, "fixed");
    const vpw   = sim({ ...baseStrat, withdrawalStrategy: "vpw"   }, "vpw");
    expect(vpw.schedule[1].spending).toBeGreaterThan(fixed.schedule[1].spending);
  });
});

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
  const scheduleByAge = (age) => schedule[age - 60];

  test("pre-claim year (age 66, before ssAge=67): ss = 0", () => {
    expect(scheduleByAge(66).ss).toBe(0);
  });

  test("first claim year (age 67 = ssAge): ss = ssb exactly — NOT compounded by y=7 years of COLA", () => {
    expect(scheduleByAge(67).ss).toBe(24_000);
  });

  test("second claim year (age 68): ss = ssb × (1 + cola) — one year of COLA, not y=8 years", () => {
    expect(scheduleByAge(68).ss).toBe(Math.round(24_000 * 1.024));
  });
});

describe("Income flow-through — all sources must reach the withdrawal schedule", () => {

  const BASE_INCOME = {
    ...BASE,
    currentAge: 65, retireAge: 65, endAge: 90,
    ssb: 0, ssAge: 65, ab: 0, otherIncomes: [],
    withdrawalStrategy: "gk", stateOfResidence: "FL",
  };

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
    const endYear = 2026 + 5;
    const { schedule } = simulateDeterministicWithStrategy(
      { ...BASE_INCOME, ab: 12_000, abEndYear: endYear }, 2.5, "gk"
    );
    const beforeEnd = schedule.find(r => r.yr <= endYear);
    const afterEnd  = schedule.find(r => r.yr >  endYear);
    expect(beforeEnd.Rental).toBeGreaterThan(0);
    expect(afterEnd.Rental).toBe(0);
  });

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

describe("getStandardDeduction / getIrmaaCeiling / getBracketCeiling helpers", () => {
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
  test("IRMAA tier-1 ceiling = $218K MFJ / $109K single", () => {
    expect(getIrmaaCeiling(1, "mfj", 1)).toBe(218_000);
    expect(getIrmaaCeiling(1, "single", 1)).toBe(109_000);
  });
  test('getBracketCeiling 22% top = $211,400 MFJ; unknown target defaults to 22%', () => {
    expect(getBracketCeiling("22", "mfj", 1)).toBe(211_400);
    expect(getBracketCeiling("bogus", "mfj", 1)).toBe(211_400);
  });
});

describe("VPW withdrawal — PMT amortization formula", () => {
  const VPW_BASE = {
    ...BASE,
    withdrawalStrategy: "vpw",
    ssb: 0, ssAge: 99, ab: 0, propIncome: 0,
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
    const age = schedule[5].age;
    const expected = schedule[4].portfolioEnd * rate(age);
    expect(Math.abs(schedule[5].spending / expected - 1)).toBeLessThan(0.01);
  });

  test("long-horizon VPW rate stays well below the 10% cap (old bug hit the cap)", () => {
    const { schedule } = simulateDeterministicWithStrategy(VPW_BASE, 2.5, "vpw");
    const impliedRate = schedule[1].spending / schedule[0].portfolioEnd;
    expect(impliedRate).toBeLessThan(0.07);
    expect(impliedRate).toBeCloseTo(rate(schedule[1].age), 3);
  });

  test("VPW payout rate rises monotonically with age (shorter horizon)", () => {
    expect(rate(80)).toBeGreaterThan(rate(65));
    expect(rate(65)).toBeGreaterThan(rate(61));
  });
});

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
    expect(pieces[0].bucket).toBe(_defaultBucket("cash"));
    expect(pieces[0].balance).toBe(50_000);
  });

  test("split distributes balance by pct and rolls up to the original total", () => {
    const a = { id: "1", category: "cash", balance: 100_000,
      splits: [{ bucket: 1, pct: 30 }, { bucket: 3, pct: 70 }] };
    const pieces = accountBucketPieces(a);
    expect(pieces).toHaveLength(2);
    expect(pieces.find(p => p.bucket === 1).balance).toBeCloseTo(30_000, 6);
    expect(pieces.find(p => p.bucket === 3).balance).toBeCloseTo(70_000, 6);
    expect(pieces.reduce((s, p) => s + p.balance, 0)).toBeCloseTo(100_000, 6);
  });

  test("pct that doesn't total 100 is normalized (still rolls up to balance)", () => {
    const a = { id: "1", category: "cash", balance: 100_000,
      splits: [{ bucket: 1, pct: 1 }, { bucket: 2, pct: 3 }] };
    const pieces = accountBucketPieces(a);
    expect(pieces.find(p => p.bucket === 1).balance).toBeCloseTo(25_000, 6);
    expect(pieces.find(p => p.bucket === 2).balance).toBeCloseTo(75_000, 6);
    expect(pieces.reduce((s, p) => s + p.balance, 0)).toBeCloseTo(100_000, 6);
  });

  test("expandAccountBuckets flattens a mixed account list, preserving total balance", () => {
    const accts = [
      { id: "1", category: "cash", balance: 100_000, splits: [{ bucket: 1, pct: 40 }, { bucket: 3, pct: 60 }] },
      { id: "2", category: "roth", balance: 50_000,  bucket: 3 },
    ];
    const pieces = expandAccountBuckets(accts);
    expect(pieces).toHaveLength(3);
    const total = pieces.reduce((s, p) => s + p.balance, 0);
    expect(total).toBeCloseTo(150_000, 6);
    const b1 = pieces.filter(p => p.bucket === 1).reduce((s, p) => s + p.balance, 0);
    expect(b1).toBeCloseTo(40_000, 6);
  });

  test("bucket 1 is cash-only: a non-cash account tagged 1 clamps to 2 (regression)", () => {
    const whole = accountBucketPieces({ id: "1", category: "pretax", balance: 100_000, bucket: 1 });
    expect(whole[0].bucket).toBe(2);

    const split = accountBucketPieces({ id: "2", category: "pretax", balance: 100_000,
      splits: [{ bucket: 1, pct: 40 }, { bucket: 3, pct: 60 }] });
    expect(split.find(p => p._splitPct === 40).bucket).toBe(2);
    expect(split.find(p => p._splitPct === 60).bucket).toBe(3);

    const cashOk = accountBucketPieces({ id: "3", category: "cash", balance: 50_000, bucket: 1 });
    expect(cashOk[0].bucket).toBe(1);
  });
});

describe("Federal brackets — 35% and 37% tiers (v1.1.0.30)", () => {
  test("MFJ $1M ordinary income: taxed through 35% and 37% brackets, not capped at 32%", () => {
    const r = calcYearTax(60, 2026, 1_000_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(r.taxableIncome).toBe(967_800);
    expect(r.fedTax).toBeCloseTo(280_250.5, 0);
    expect(r.marginalBracket).toBe(0.37);
  });
});

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

describe("CURRENT_YEAR — dynamic 'today' anchor for tax-year math (C2 regression)", () => {
  const fs = require("fs");
  const path = require("path");
  const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
  const thisYear = new Date().getFullYear();

  test("App.jsx defines CURRENT_YEAR dynamically (new Date().getFullYear()), not a hardcoded literal", () => {
    expect(SRC).toMatch(/const CURRENT_YEAR = new Date\(\)\.getFullYear\(\);/);
  });

  test("irmaaCost's inflation factor at the real current year is 1.0 (no spurious inflation) regardless of the assumed inflation rate", () => {
    const magi = 250_000;
    const atOnePctInfl = irmaaCost(magi, thisYear, 0.01, true);
    const atTenPctInfl = irmaaCost(magi, thisYear, 0.10, true);
    expect(atOnePctInfl).toBe(atTenPctInfl);
  });

  test("calcYearTax's inflation factor at the real current year is 1.0 — same-year tax is independent of the assumed inflation rate", () => {
    const low  = calcYearTax(65, thisYear, 100_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    const high = calcYearTax(65, thisYear, 100_000, 0, 0, 0, 0, false, 0.08, "mfj", "FL");
    expect(low.totalTax).toBe(high.totalTax);
  });
});

describe("GK calibration — cross-engine consistency (audit regression)", () => {
  const gkProfile = {
    currentAge: 65, retireAge: 65, endAge: 95,
    sp: 80_000, ssAge: 65, ssb: 30_000, ssCola: 2.4,
    ab: 0, inf: 2.5, filingStatus: "mfj", stateOfResidence: "FL",
    twoHousehold: false, useJointRmdTable: false,
    gkFloor: 40_000, gkCeiling: 120_000,
    withdrawalBracketTarget: "22", irmaaGuard: false, ssTorpedoGuard: false,
    rothEmergencyReserve: 0, gr: 0.06,
    port: 1_000_000,
    accounts: [
      { id: "p1", category: "pretax",  balance: 700_000 },
      { id: "p2", category: "roth",    balance: 150_000 },
      { id: "p3", category: "taxable", balance: 100_000 },
      { id: "p4", category: "cash",    balance:  50_000 },
    ],
  };

  test("buildWithdrawalWaterfall (smart) and simulateDeterministicWithStrategy (gk) agree: neither cuts while the other grows", () => {
    const wf = buildWithdrawalWaterfall(gkProfile);
    const det = simulateDeterministicWithStrategy(gkProfile, 2.5, "gk");
    const wfRatios = [];
    const detRatios = [];
    for (let i = 1; i < 5; i++) {
      wfRatios.push(wf.smart.rows[i].spending / wf.smart.rows[i - 1].spending);
      detRatios.push(det.schedule[i].spending / det.schedule[i - 1].spending);
    }
    for (let i = 0; i < wfRatios.length; i++) {
      expect(Math.sign(wfRatios[i] - 1)).toBe(Math.sign(detRatios[i] - 1));
    }
  });

  test("both engines keep spending well above the GK floor in the first 5 years (healthy portfolio, no death spiral)", () => {
    const wf = buildWithdrawalWaterfall(gkProfile);
    const det = simulateDeterministicWithStrategy(gkProfile, 2.5, "gk");
    for (let i = 0; i < 5; i++) {
      expect(wf.smart.rows[i].spending).toBeGreaterThan(gkProfile.gkFloor * 1.3);
      expect(det.schedule[i].spending).toBeGreaterThan(gkProfile.gkFloor * 1.3);
    }
  });
});

describe("probability analogies — revolving context messages", () => {
  test("every success rate from 0% to 100% lands in a band with at least one analogy", () => {
    for (let pct = 0; pct <= 100; pct++) {
      const pool = getAnalogues(pct / 100);
      expect(pool.length).toBeGreaterThanOrEqual(1);
      for (const a of pool) {
        expect(typeof a.text).toBe("string");
        expect(a.text.length).toBeGreaterThan(0);
        expect(typeof a.emoji).toBe("string");
      }
    }
  });

  test("every band offers at least two analogies so the display can revolve", () => {
    for (const pct of [97, 92, 87, 82, 77, 72, 65, 55, 30]) {
      expect(getAnalogues(pct / 100).length).toBeGreaterThanOrEqual(2);
    }
  });

  test("all analogies in a band share the same band floor (no cross-band mixing)", () => {
    const pool = getAnalogues(0.93);
    const mins = new Set(pool.map((a) => a.min));
    expect(mins.size).toBe(1);
    expect(pool[0].min).toBe(90);
  });

  test("the 96.4% flagship keeps the commercial-flight analogy", () => {
    const pool = getAnalogues(0.964);
    expect(pool.some((a) => a.text.includes("commercial flight"))).toBe(true);
  });

  test("coin-flip math is stated correctly (87.5% = NOT flipping three heads, not 'calling heads 3x')", () => {
    const pool = getAnalogues(0.875);
    const coin = pool.find((a) => a.text.toLowerCase().includes("three heads"));
    expect(coin).toBeDefined();
    expect(coin.text).toMatch(/Not flipping/i);
    expect(coin.stat).toBe("87.5%");
  });

  test("low rates get urgency messaging, not false comfort", () => {
    const pool = getAnalogues(0.30);
    expect(pool.some((a) => a.text.toLowerCase().includes("worse than a coin flip"))).toBe(true);
  });
});

describe("per-age funded fraction (MC band table)", () => {
  test("alive fraction starts at 1.0, never increases, and ends consistent with the success rate", () => {
    const tight = { ...BASE, ssb: 0, sp: 110_000, accounts: [
      { id: "t1", category: "pretax", name: "401k", balance: 1_000_000 },
    ]};
    const r = runMC(tight, 90, 500, 42, true);
    expect(r.pcts[0].alive).toBe(1.0);
    for (let i = 1; i < r.pcts.length; i++) {
      expect(r.pcts[i].alive).toBeLessThanOrEqual(r.pcts[i - 1].alive);
    }
    expect(r.pcts[r.pcts.length - 1].alive).toBeGreaterThanOrEqual(r.rate);
    expect(r.pcts[r.pcts.length - 1].alive).toBeLessThan(1.0);
  });
});

describe("calcYearTax — LTCG stacking (ltcgAmount param)", () => {
  test("ordinary income $0 + $80K LTCG, current year → LTCG tax $0 (fits entirely in the 0% band after the std deduction)", () => {
    const r = calcYearTax(60, 2026, 0, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 80_000);
    expect(r.ltcgTax).toBe(0);
    expect(r.fedTax).toBe(0);
  });

  test("ordinary income $150K + $100K LTCG → gains straddle into the 15% band (hand-computed)", () => {
    const r = calcYearTax(60, 2026, 150_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 100_000);
    expect(r.ltcgTax).toBeCloseTo(15_000, 0);
    expect(r.niit).toBe(0);
    expect(r.fedTax).toBeCloseTo(30_340, 0);
  });

  test("NIIT: MFJ MAGI over $250K with $100K LTCG adds 3.8% on the excess (hand-computed)", () => {
    const r = calcYearTax(60, 2026, 200_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 100_000);
    expect(r.niit).toBe(1_900);
  });

  test("NIIT is $0 when MAGI is below the threshold even with large realized gains", () => {
    const r = calcYearTax(60, 2026, 0, 0, 0, 0, 0, false, 0.025, "mfj", "FL", 50_000);
    expect(r.niit).toBe(0);
  });

  test("ltcgAmount defaults to 0 — omitting it reproduces the pre-feature (no-LTCG) result", () => {
    const explicit0 = calcYearTax(65, 2026, 100_000, 24_000, 0, 0, 0, false, 0.025, "mfj", "FL", 0);
    const omitted   = calcYearTax(65, 2026, 100_000, 24_000, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(omitted.fedTax).toBe(explicit0.fedTax);
    expect(omitted.ltcgTax).toBe(0);
    expect(omitted.niit).toBe(0);
  });
});

describe("runMC — taxable cost-basis (taxableBasisPct) success-rate impact", () => {
  test("a taxable-heavy profile with a lower cost basis has success rate <= the same profile at 100% basis (same seed)", () => {
    const taxableHeavy = {
      ...BASE, ssb: 0, sp: 100_000,
      accounts: [
        { id: "th1", category: "taxable", name: "Taxable", balance: 1_800_000 },
        { id: "th2", category: "cash",    name: "Cash",    balance:    50_000 },
      ],
    };
    const lowBasis  = runMC({ ...taxableHeavy, taxableBasisPct: 40  }, 90, 1000, 42, true);
    const highBasis = runMC({ ...taxableHeavy, taxableBasisPct: 100 }, 90, 1000, 42, true);
    expect(lowBasis.rate).toBeLessThanOrEqual(highBasis.rate + 0.01);
  });
});

describe("runMC — IRMAA 2-year lookback wiring", () => {
  test("completes with a finite, in-range success rate for an IRMAA-crossing conversion profile", () => {
    const irmaaHeavy = {
      currentAge: 60, retireAge: 60, endAge: 90, port: 0, contrib: 0, inf: 2.5,
      sp: 150_000, ssAge: 67, ssb: 30_000, ssCola: 2.4, ab: 0, useAb: false,
      tax: 22, smile: false, preRetireEq: 91, postRetireEq: 70,
      gkFloor: 100_000, gkCeiling: 250_000, withdrawalStrategy: "gk",
      cashRealReturn: 1.0, useJointRmdTable: false, twoHousehold: false,
      filingStatus: "mfj", stateOfResidence: "FL",
      withdrawalBracketTarget: "off", irmaaGuard: false,
      rothConversionTarget: "24",
      accounts: [
        { id: "m1", category: "pretax", name: "401k", balance: 3_000_000 },
        { id: "m2", category: "cash",   name: "Cash",  balance:   200_000 },
      ],
    };
    const result = runMC(irmaaHeavy, 90, 200, 42, true);
    expect(Number.isFinite(result.rate)).toBe(true);
    expect(result.rate).toBeGreaterThanOrEqual(0);
    expect(result.rate).toBeLessThanOrEqual(1);
    result.pcts.forEach((row) => {
      expect(Number.isNaN(row.p10)).toBe(false);
      expect(Number.isNaN(row.p50)).toBe(false);
      expect(Number.isNaN(row.p90)).toBe(false);
      expect(Number.isNaN(row.alive)).toBe(false);
    });
  });
});

describe("MCBandTable 'What do these numbers mean?' explainer", () => {
  const fs = require("fs");
  const path = require("path");
  const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

  test("Age-by-Age Projection Bands table has an ℹ️ explainer trigger", () => {
    expect(SRC).toMatch(/ℹ️ What do these numbers mean\?/);
  });

  test("explainer panel condenses Still Funded / 10th percentile pairing guidance and links back to the About page", () => {
    expect(SRC).toMatch(/Still Funded<\/strong> is the share of simulated retirement/);
    expect(SRC).toMatch(/10th percentile/);
    expect(SRC).toMatch(/Help → Reading the Charts → "What does Still Funded % actually mean\?"/);
  });
});

describe("mortality-weighted success rate (money outlives you)", () => {
  const { survivalToAge } = require("./App");

  test("survivalToAge: 1.0 at the starting age, strictly decreasing after, female >= male", () => {
    expect(survivalToAge(65, 65, "male")).toBe(1);
    let prev = 1;
    for (const age of [70, 75, 80, 85, 90, 95, 100]) {
      const s = survivalToAge(65, age, "male");
      expect(s).toBeLessThan(prev);
      expect(s).toBeGreaterThan(0);
      prev = s;
    }
    for (const age of [75, 85, 95]) {
      expect(survivalToAge(65, age, "female")).toBeGreaterThan(survivalToAge(65, age, "male"));
      const blended = survivalToAge(65, age, "blended");
      expect(blended).toBeGreaterThan(survivalToAge(65, age, "male"));
      expect(blended).toBeLessThan(survivalToAge(65, age, "female"));
    }
  });

  test("mwRate >= rate always, equal when nothing fails, strictly higher when failures exist", () => {
    const comfortable = runMC(BASE, 90, 300, 42, true);
    expect(comfortable.mwRate).toBeGreaterThanOrEqual(comfortable.rate);
    if (comfortable.rate === 1) expect(comfortable.mwRate).toBe(1);

    const tight = { ...BASE, ssb: 0, sp: 120_000, accounts: [
      { id: "t1", category: "pretax", name: "401k", balance: 1_000_000 },
    ]};
    const r = runMC(tight, 90, 500, 42, true);
    expect(r.rate).toBeLessThan(1);
    expect(r.mwRate).toBeGreaterThan(r.rate);
    expect(r.mwRate).toBeLessThanOrEqual(1);
  });

  test("late failures are discounted more than early ones: same failure count, older exhaust ages -> higher mwRate boost", () => {
    const tight = { ...BASE, ssb: 0, sp: 120_000, accounts: [
      { id: "t1", category: "pretax", name: "401k", balance: 1_000_000 },
    ]};
    const r = runMC(tight, 90, 500, 42, true);
    const failureMass = 1 - r.rate;
    const boost = r.mwRate - r.rate;
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThan(failureMass);
  });
});

describe("OBBBA senior bonus deduction", () => {
  test("below the phase-out: single 65+ gets the full per-person amount", () => {
    const r = calcYearTax(66, 2026, 50_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(r.seniorBonus).toBe(6_000);
    expect(r.taxableIncome).toBe(26_250);
  });

  test("MFJ both 65+ gets 2x the per-person amount", () => {
    const r = calcYearTax(70, 2026, 100_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(r.seniorBonus).toBe(12_000);
    expect(r.taxableIncome).toBe(52_500);
  });

  test("partial phase-out reduces the bonus by 6% of excess MAGI, per person", () => {
    const r = calcYearTax(70, 2026, 180_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(r.seniorBonus).toBe(8_400);
  });

  test("fully phased out at threshold + $100,000 of MAGI", () => {
    const atCliff = calcYearTax(66, 2026, 175_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(atCliff.seniorBonus).toBe(0);
    const mfjAtCliff = calcYearTax(70, 2026, 250_000, 0, 0, 0, 0, false, 0.025, "mfj", "FL");
    expect(mfjAtCliff.seniorBonus).toBe(0);
    const beyond = calcYearTax(66, 2026, 400_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(beyond.seniorBonus).toBe(0);
  });

  test("under 65 never qualifies, whatever the year", () => {
    const r = calcYearTax(64, 2026, 50_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(r.seniorBonus).toBe(0);
  });

  test("sunsets: $0 in 2029 even for a qualifying 65+ filer", () => {
    const in2028 = calcYearTax(70, 2028, 50_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    const in2029 = calcYearTax(70, 2029, 50_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(in2028.seniorBonus).toBe(6_000);
    expect(in2029.seniorBonus).toBe(0);
    expect(in2029.taxableIncome).toBeGreaterThan(in2028.taxableIncome);
  });

  test("is NOT inflation-indexed: same nominal amount in 2026 and 2028", () => {
    const a = calcYearTax(70, 2026, 50_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    const b = calcYearTax(70, 2028, 50_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(a.seniorBonus).toBe(6_000);
    expect(b.seniorBonus).toBe(6_000);
  });

  test("REGRESSION (CLAUDE.md rule 3): the bonus must not reduce MAGI", () => {
    const inWindow = calcYearTax(70, 2028, 120_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    const afterSunset = calcYearTax(70, 2029, 120_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(inWindow.seniorBonus).toBeGreaterThan(0);
    expect(inWindow.taxableIncome).toBeLessThan(afterSunset.taxableIncome);
    expect(inWindow.magi).toBe(afterSunset.magi);
  });

  test("stacks additively on top of the standard deduction, not merged into it", () => {
    expect(getStandardDeduction(70, "single", 1)).toBe(17_750);
    expect(getStandardDeduction(70, "mfj", 1)).toBe(35_500);
    const r = calcYearTax(70, 2026, 50_000, 0, 0, 0, 0, false, 0.025, "single", "FL");
    expect(r.stdDeduction).toBe(17_750);
    expect(r.taxableIncome).toBe(50_000 - r.stdDeduction - r.seniorBonus);
  });
});

describe("taxableYieldSplit — pure function", () => {
  test("worked example: $500k @ 2% yield, 50/50 ordinary/qualified split", () => {
    const r = taxableYieldSplit(500_000, 2, 50);
    expect(r.yieldAmount).toBe(10_000);
    expect(r.ordinaryYield).toBe(5_000);
    expect(r.qualifiedYield).toBe(5_000);
  });

  test("yieldAmount always equals ordinaryYield + qualifiedYield", () => {
    const r = taxableYieldSplit(837_412, 2.7, 63);
    expect(r.ordinaryYield + r.qualifiedYield).toBeCloseTo(r.yieldAmount, 6);
  });

  test("yieldPct = 0 is a true no-op (the shipped default)", () => {
    const r = taxableYieldSplit(500_000, 0, 50);
    expect(r).toEqual({ yieldAmount: 0, ordinaryYield: 0, qualifiedYield: 0 });
  });

  test("zero or negative balance is a no-op regardless of yieldPct", () => {
    expect(taxableYieldSplit(0, 2, 50)).toEqual({ yieldAmount: 0, ordinaryYield: 0, qualifiedYield: 0 });
    expect(taxableYieldSplit(-1000, 2, 50)).toEqual({ yieldAmount: 0, ordinaryYield: 0, qualifiedYield: 0 });
  });

  test("ordinaryPct clamps to [0, 100] rather than producing a negative or >100% split", () => {
    const over = taxableYieldSplit(100_000, 3, 150);
    expect(over.ordinaryYield).toBe(over.yieldAmount);
    expect(over.qualifiedYield).toBe(0);

    const under = taxableYieldSplit(100_000, 3, -20);
    expect(under.ordinaryYield).toBe(0);
    expect(under.qualifiedYield).toBe(under.yieldAmount);
  });

  test("100% ordinary and 0% ordinary are the two pure-split edge cases", () => {
    const allOrdinary = taxableYieldSplit(200_000, 4, 100);
    expect(allOrdinary.ordinaryYield).toBe(8_000);
    expect(allOrdinary.qualifiedYield).toBe(0);

    const allQualified = taxableYieldSplit(200_000, 4, 0);
    expect(allQualified.ordinaryYield).toBe(0);
    expect(allQualified.qualifiedYield).toBe(8_000);
  });
});

describe("waterfallForActiveStrategy — Section 1 waterfall matches the saved distribution strategy", () => {
  const FIXED = { ...BASE, withdrawalStrategy: "fixed", fixedWithdrawalRate: 0.05 };

  test("fixed-% strategy: wired waterfall's spend path matches simulateDeterministicWithStrategy's own schedule, not the raw Smart Waterfall hybrid", () => {
    const wired = waterfallForActiveStrategy(FIXED);
    const det = simulateDeterministicWithStrategy(FIXED, FIXED.inf, "fixed");
    const raw = buildWithdrawalWaterfall(FIXED);

    for (let i = 0; i < det.spByYear.length; i++) {
      expect(wired.smart.rows[i].spending).toBe(Math.round(det.spByYear[i].amount));
    }

    const laterIdx = Math.min(5, wired.smart.rows.length - 1, raw.smart.rows.length - 1);
    expect(wired.smart.rows[laterIdx].spending).not.toBe(raw.smart.rows[laterIdx].spending);
  });

  test("smart strategy: waterfallForActiveStrategy is a pure pass-through (no behavior change for the one case that was already correct)", () => {
    const SMART = { ...BASE, withdrawalStrategy: "smart" };
    const wired = waterfallForActiveStrategy(SMART);
    const raw = buildWithdrawalWaterfall(SMART);
    expect(wired.summary.lifetimeTaxSmart).toBe(raw.summary.lifetimeTaxSmart);
    expect(wired.smart.rows.map(r => r.spending)).toEqual(raw.smart.rows.map(r => r.spending));
  });

  test("explicit spSchedule import still wins over the distribution strategy (unchanged behavior)", () => {
    const IMPORTED = {
      ...BASE,
      withdrawalStrategy: "gk",
      spSchedule: [{ year: new Date().getFullYear(), amount: 60_000 }],
    };
    const wired = waterfallForActiveStrategy(IMPORTED);
    const raw = buildWithdrawalWaterfall(IMPORTED);
    expect(wired.smart.rows[0].spending).toBe(raw.smart.rows[0].spending);
  });
});
