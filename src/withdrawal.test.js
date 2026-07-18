import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { mortgageSchedule, mortgageAnnualPayments } from "./engine/expenses.js";
import { runMC } from "./App";

const BASE = {
  currentAge: 65,
  retireAge: 65,
  endAge: 90,
  sp: 80_000,
  ssAge: 67,
  ssb: 24_000,
  ssCola: 2.4,
  ab: 0,
  inf: 2.5,
  filingStatus: "mfj",
  stateOfResidence: "FL",
  twoHousehold: false,
  useJointRmdTable: false,
  gkFloor: 48_000,
  gkCeiling: 115_000,
  withdrawalBracketTarget: "22",
  irmaaGuard: false,
  ssTorpedoGuard: true,
  rothEmergencyReserve: 0,
  gr: 0.07,
  accounts: [
    { id: "t1", category: "pretax",  name: "401k",    balance: 1_000_000 },
    { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
    { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
    { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
  ],
};

// ─── Output structure ──────────────────────────────────────────────────────────

describe("buildWithdrawalWaterfall — output structure", () => {
  test("returns { smart, naive, summary } with rows arrays", () => {
    const result = buildWithdrawalWaterfall(BASE);
    expect(result).toHaveProperty("smart");
    expect(result).toHaveProperty("naive");
    expect(result).toHaveProperty("summary");
    expect(Array.isArray(result.smart.rows)).toBe(true);
    expect(Array.isArray(result.naive.rows)).toBe(true);
  });

  test("rows length equals endAge - retireAge + 1", () => {
    const result = buildWithdrawalWaterfall(BASE);
    const expected = BASE.endAge - BASE.retireAge + 1; // 26
    expect(result.smart.rows.length).toBe(expected);
    expect(result.naive.rows.length).toBe(expected);
  });
});

// ─── RMD logic ────────────────────────────────────────────────────────────────

describe("buildWithdrawalWaterfall — RMD logic", () => {
  // RMD start age 75 for born 1960+ (currentAge 65, BASE_YEAR ~2026 → born ~1961)
  test("age 75 row has rmd > 0 and rmdActive = true", () => {
    const result = buildWithdrawalWaterfall(BASE);
    const row = result.smart.rows.find(r => r.age === 75);
    expect(row).toBeDefined();
    expect(row.rmd).toBeGreaterThan(0);
    expect(row.rmdActive).toBe(true);
  });

  test("age 74 row has rmd = 0 (RMD starts at 75 for born 1960+)", () => {
    const result = buildWithdrawalWaterfall(BASE);
    const row = result.smart.rows.find(r => r.age === 74);
    expect(row).toBeDefined();
    expect(row.rmd).toBe(0);
  });
});

// ─── Bracket ceiling (smart mode) ─────────────────────────────────────────────

describe("buildWithdrawalWaterfall — bracket ceiling (smart mode)", () => {
  test("smart year-1 fromPretax stays within 22% bracket room", () => {
    // Year 1 (age 65): no SS yet (ssAge=67), no RMD yet
    // std deduction MFJ 2026: 32200 + 3300 (age65) = 35500
    // 22% bracket ceiling (taxable income): ~211400
    // taxableIncomeSoFar = 0 → room = ~211400
    // need from port = sp=80000 (no fixed income at 65)
    // fromPretax should be ≤ 211400 but also ≤ need
    const result = buildWithdrawalWaterfall(BASE);
    const row0 = result.smart.rows[0]; // age 65
    // MFJ 22% taxable ceiling is 211400 (2026), room >> sp, so fromPretax limited by need not bracket
    // Just confirm it doesn't exceed the 22% taxable income ceiling
    const ceiling22_approx = 211_400; // rough
    expect(row0.fromPretax).toBeLessThanOrEqual(ceiling22_approx);
  });

  test("naive year-1 fromPretax >= smart year-1 fromPretax", () => {
    // Naive draw order is pretax first — so year-1 fromPretax must be >= smart's.
    // Smart draws cash then taxable before touching pretax; naive hits pretax immediately.
    const result = buildWithdrawalWaterfall(BASE);
    const smartRow = result.smart.rows[0];
    const naiveRow = result.naive.rows[0];
    expect(naiveRow.fromPretax).toBeGreaterThanOrEqual(smartRow.fromPretax);
  });
});

// ─── Roth emergency reserve ────────────────────────────────────────────────────

describe("buildWithdrawalWaterfall — Roth emergency reserve", () => {
  test("rothEnd never drops below reserve unless portfolio fully exhausted", () => {
    const reserve = 200_000;
    const result = buildWithdrawalWaterfall({ ...BASE, rothEmergencyReserve: reserve });
    result.smart.rows.forEach(row => {
      // rothEnd can only go below reserve if ALL buckets are depleted
      const totalPfEnd = row.cashEnd + row.taxableEnd + row.pretaxEnd + row.rothEnd;
      if (totalPfEnd > reserve) {
        expect(row.rothEnd).toBeGreaterThanOrEqual(reserve - 1); // allow $1 rounding
      }
    });
  });
});

// ─── Landmine detection ────────────────────────────────────────────────────────

describe("buildWithdrawalWaterfall — landmine detection", () => {
  test("ssTorpedo flag appears in SS years when provisional income exceeds threshold", () => {
    // ssAge=67; provisional = ss*0.5 + rmd + fromPretax + annuity
    // With $24K SS: ss*0.5 = $12K, plus pretax draws of ~$80K → provisional ~$92K >> $44K MFJ threshold
    const result = buildWithdrawalWaterfall({ ...BASE, ssTorpedoGuard: true });
    const ssRows = result.smart.rows.filter(r => r.age >= BASE.ssAge);
    const torpedoRows = ssRows.filter(r => r.landmines.ssTorpedo);
    expect(torpedoRows.length).toBeGreaterThan(0);
  });

  test("irmaaTriggered is false when MAGI < $218K tier-1 threshold", () => {
    // BASE has sp=$80K, small portfolio — total income well below $218K IRMAA tier-1
    // Only ages 65+ get IRMAA at all
    const result = buildWithdrawalWaterfall({ ...BASE, sp: 60_000 });
    const earlyRows = result.smart.rows.filter(r => r.age <= 68);
    earlyRows.forEach(row => {
      // With $60K spend and low pretax draws, MAGI should be < $218K
      expect(row.landmines.irmaaTriggered).toBe(false);
    });
  });
});

// ─── Real-world expenses/income feed "need" and conversion headroom ───────────

describe("buildWithdrawalWaterfall — mortgage, carveouts, other income", () => {
  test("an active mortgage raises needFromPort by the annual P&I", () => {
    const noMort = buildWithdrawalWaterfall(BASE);
    const withMort = buildWithdrawalWaterfall({
      ...BASE, mortBalance: 300_000, mortRate: 6, mortStart: "2024-01", mortTerm: 30, mortExtra: 0,
    });
    const r0 = noMort.smart.rows[0];
    const r1 = withMort.smart.rows[0];
    expect(r1.housingCost).toBeGreaterThan(0);
    expect(r1.needFromPort).toBeCloseTo(r0.needFromPort + r1.housingCost, -1);
  });

  test("a carveout (e.g. college costs) raises needFromPort while active and stops after endYear", () => {
    const yr0 = BASE_YEAR();
    const result = buildWithdrawalWaterfall({
      ...BASE,
      carveouts: [{ id: "c1", label: "College", annual: 20_000, endYear: yr0 }],
    });
    const activeRow = result.smart.rows.find(r => r.yr === yr0);
    const laterRow = result.smart.rows.find(r => r.yr === yr0 + 1);
    expect(activeRow.carveoutCost).toBe(20_000);
    expect(laterRow.carveoutCost).toBe(0);
    expect(activeRow.needFromPort).toBeGreaterThan(laterRow.needFromPort - 20_000);
  });

  test("taxable other income reduces conversion headroom vs. the same profile without it", () => {
    const noOther = buildWithdrawalWaterfall({ ...BASE, rothConversionTarget: "22" });
    const withOther = buildWithdrawalWaterfall({
      ...BASE,
      rothConversionTarget: "22",
      otherIncomes: [{ id: "o1", name: "Pension", annual: 40_000, startYear: BASE_YEAR(), taxable: true }],
    });
    const convNo = noOther.smart.rows[0].conversionAmount;
    const convWith = withOther.smart.rows[0].conversionAmount;
    expect(convWith).toBeLessThan(convNo);
  });

  test("a rental/propIncome offsets need (lower fromPretax than without it)", () => {
    const noRental = buildWithdrawalWaterfall(BASE);
    const withRental = buildWithdrawalWaterfall({ ...BASE, propIncome: 20_000 });
    expect(withRental.smart.rows[0].needFromPort).toBeLessThan(noRental.smart.rows[0].needFromPort);
  });
});

function BASE_YEAR() {
  return new Date().getFullYear();
}

// ─── Mortgage payoff-year fix (audit regression) ───────────────────────────────
// Before this fix, housingCost used a flat `pmt * 12` and zeroed out entirely in
// the calendar year the mortgage is paid off, even though up to a full year of
// real payments were still due that year; extra payments (mortExtra) were also
// silently dropped from the annual cash cost. mortgageAnnualPayments() sums the
// schedule's own per-year pPaid+iPaid (which already includes extra payments and
// the partial final year), and buildWithdrawalWaterfall must charge that exact
// figure instead.

describe("buildWithdrawalWaterfall — mortgage payoff-year & extra-payment fix (audit regression)", () => {
  const MORT = { mortBalance: 120_000, mortRate: 6, mortStart: "2015-01", mortTerm: 15, mortExtra: 0 };

  test("the payoff calendar year charges the actual partial-year P&I (not $0); the following year is $0", () => {
    const ms = mortgageSchedule(MORT.mortBalance, MORT.mortRate, MORT.mortStart, MORT.mortTerm, MORT.mortExtra);
    const byYear = mortgageAnnualPayments(ms);
    const payoffAmt = byYear.get(ms.payoffYr);
    // Sanity: the schedule itself actually pays something in the payoff year.
    expect(payoffAmt).toBeGreaterThan(0);

    const result = buildWithdrawalWaterfall({ ...BASE, ...MORT, endAge: 95 });
    const payoffRow = result.smart.rows.find(r => r.yr === ms.payoffYr);
    const nextRow = result.smart.rows.find(r => r.yr === ms.payoffYr + 1);
    expect(payoffRow).toBeDefined();
    // Old behavior: yr === mortPayoffYr fell outside `yr < mortPayoffYr`, so
    // housingCost was $0 in the payoff year. Fixed behavior: it must charge the
    // real partial-year amount.
    expect(payoffRow.housingCost).toBeGreaterThan(0);
    expect(payoffRow.housingCost).toBeCloseTo(payoffAmt, -1);
    if (nextRow) expect(nextRow.housingCost).toBe(0);
  });

  test("mortExtra > 0 raises the annual housing cost above pmt*12 (extra payments were previously ignored)", () => {
    const withExtra = { ...BASE, mortBalance: 300_000, mortRate: 6, mortStart: "2024-01", mortTerm: 30, mortExtra: 500 };
    const ms = mortgageSchedule(withExtra.mortBalance, withExtra.mortRate, withExtra.mortStart, withExtra.mortTerm, withExtra.mortExtra);
    const result = buildWithdrawalWaterfall(withExtra);
    // Year 0 (retirement year) is a normal full year, nowhere near this 30yr
    // loan's payoff, so it isolates the extra-payment effect.
    expect(result.smart.rows[0].housingCost).toBeGreaterThan(ms.pmt * 12);
  });
});

// ─── Guyton-Klinger calibration fix (audit regression) ─────────────────────────
// Before this fix, the GK band baseline (initWR) was net of SS/income, but the
// tracked ratio each year used GROSS spending. A retiree whose SS starts at
// retirement had year-1 cur = sp/port far above initWR = (sp-ss)/port * 1.2,
// firing the capital-preservation cut every year regardless of portfolio
// health, and spending death-spiraled toward the floor. Fixed: both sides are
// the same NET PORTFOLIO NEED, so a healthy portfolio's spending should track
// plain inflation, not collapse.

describe("buildWithdrawalWaterfall — GK calibration matches income-offset baseline (audit regression)", () => {
  // Retires AT ssAge with substantial SS, healthy portfolio, endAge far enough
  // out that yrsRemaining > 15 for the first several years (smart hybrid keeps
  // using GK, not the Bengen inflation-only fallback).
  const gkProfile = {
    currentAge: 65, retireAge: 65, endAge: 95,
    sp: 80_000, ssAge: 65, ssb: 30_000, ssCola: 2.4,
    ab: 0, inf: 2.5, filingStatus: "mfj", stateOfResidence: "FL",
    twoHousehold: false, useJointRmdTable: false,
    gkFloor: 40_000, gkCeiling: 120_000,
    withdrawalBracketTarget: "22", irmaaGuard: false, ssTorpedoGuard: false,
    rothEmergencyReserve: 0, gr: 0.06,
    accounts: [
      { id: "p1", category: "pretax",  balance: 700_000 },
      { id: "p2", category: "roth",    balance: 150_000 },
      { id: "p3", category: "taxable", balance: 100_000 },
      { id: "p4", category: "cash",    balance:  50_000 },
    ],
  };

  test("spending does not collapse toward the GK floor in the first 5 years on a healthy portfolio", () => {
    const result = buildWithdrawalWaterfall(gkProfile);
    const early = result.smart.rows.slice(0, 5);
    for (const row of early) {
      // Well above the floor — the old bug's capital-preservation cut fired
      // every year, ratcheting spending down toward gkFloor almost immediately.
      expect(row.spending).toBeGreaterThan(gkProfile.gkFloor * 1.3);
    }
  });

  test("with SS covering a large share of spending, year-over-year spending tracks inflation, not a repeated 10% cut", () => {
    const result = buildWithdrawalWaterfall(gkProfile);
    const rows = result.smart.rows;
    // A repeated capital-preservation cut compounds ~0.9x(1+inf) each year
    // (≈ -7.75%); a healthy, correctly-calibrated band should instead grow
    // at ~ +2.5% (inflation only, since cur stays within the no-adjustment band).
    for (let i = 1; i < 5; i++) {
      const ratio = rows[i].spending / rows[i - 1].spending;
      expect(ratio).toBeGreaterThan(1.0);
    }
  });
});

// ─── Summary totals ────────────────────────────────────────────────────────────

describe("buildWithdrawalWaterfall — summary", () => {
  test("naive draws more pretax in early years (pretax-first order confirmed)", () => {
    // The core invariant of the fix: naive draws pretax BEFORE cash/taxable,
    // so cumulative fromPretax over the first 5 years must exceed smart's total.
    // Smart draws cash then taxable in early years, deferring pretax draws.
    const result = buildWithdrawalWaterfall(BASE);
    const naiveEarly = result.naive.rows.slice(0, 5).reduce((s, r) => s + r.fromPretax, 0);
    const smartEarly = result.smart.rows.slice(0, 5).reduce((s, r) => s + r.fromPretax, 0);
    expect(naiveEarly).toBeGreaterThan(smartEarly);
  });

  test("smart draws taxable before pretax; naive does not in year 1", () => {
    // Smart order: cash -> taxable -> pretax. In year 1 smart taps taxable to fill need.
    // Naive order: pretax -> cash -> taxable. In year 1 naive takes from pretax first,
    // so taxable is untouched until pretax is exhausted.
    const result = buildWithdrawalWaterfall(BASE);
    const s0 = result.smart.rows[0];
    const n0 = result.naive.rows[0];
    expect(s0.fromTaxable).toBeGreaterThan(0);   // smart uses taxable in year 1
    expect(n0.fromTaxable).toBe(0);              // naive does not touch taxable yet
  });

  test("naive finalPretax = 0 (exhausted); smart retains pretax balance", () => {
    // Aggressive early pretax draws in naive should deplete the account before endAge,
    // while smart's bracket-capped approach leaves a residual pretax balance.
    const result = buildWithdrawalWaterfall(BASE);
    expect(result.naive.finalPretax).toBe(0);
    expect(result.smart.finalPretax).toBeGreaterThan(0);
  });
});

// ─── v1.1.0.30: bracket targets 10/32/35/37 + GK/Bengen hybrid ─────────────────

describe("buildWithdrawalWaterfall — full bracket-target coverage (v1.1.0.30)", () => {
  test("'10' target caps pretax draws below the '22' target (no silent 22% fallback)", () => {
    const ten    = buildWithdrawalWaterfall({ ...BASE, withdrawalBracketTarget: "10" });
    const twenty = buildWithdrawalWaterfall({ ...BASE, withdrawalBracketTarget: "22" });
    const sumPretax = r => r.smart.rows.reduce((s, x) => s + x.fromPretax, 0);
    expect(sumPretax(ten)).toBeLessThan(sumPretax(twenty));
  });

  test("'32' target allows more pretax than '24' (previously both fell back to 22)", () => {
    // Big spend forces the cascade deep into pretax once cash/taxable deplete,
    // so the 24% ceiling binds in later years while 32% still has room.
    const p = { ...BASE, sp: 400_000, gkFloor: 260_000, gkCeiling: 540_000 };
    const t24 = buildWithdrawalWaterfall({ ...p, withdrawalBracketTarget: "24" });
    const t32 = buildWithdrawalWaterfall({ ...p, withdrawalBracketTarget: "32" });
    // First year the 24% cap binds, both runs still hold identical balances
    // (behavior was identical up to that point), so 32% must draw MORE pretax there.
    const cappedRow = t24.smart.rows.find(r => r.pretaxCapReason === "bracket_24");
    expect(cappedRow).toBeDefined();
    const row32 = t32.smart.rows.find(r => r.age === cappedRow.age);
    expect(row32.fromPretax).toBeGreaterThan(cappedRow.fromPretax);
  });

  test("spending grows at exactly the inflation rate inside the final 15 years (Bengen phase)", () => {
    const result = buildWithdrawalWaterfall(BASE); // endAge 90 → Bengen from age 76
    const rows = result.smart.rows;
    const late = rows.filter(r => r.age >= 77 && r.age <= 89);
    for (let i = 1; i < late.length; i++) {
      const ratio = late[i].spending / late[i - 1].spending;
      expect(ratio).toBeGreaterThan(1.024);  // 2.5% inflation ±rounding
      expect(ratio).toBeLessThan(1.026);
    }
  });
});

// ─── useJointRmdTable gated by filingStatus (B2 regression) ────────────────────
// The joint RMD table must only apply when actually filing jointly. A stale
// useJointRmdTable=true left over from switching filingStatus to "single"
// must fall back to the standard Uniform Lifetime table — matching runMC's
// `(p.useJointRmdTable ?? false) && p.filingStatus !== "single"` gate.

describe("buildWithdrawalWaterfall — useJointRmdTable gated by filingStatus (B2 regression)", () => {
  test("filingStatus 'single' + useJointRmdTable=true falls back to Uniform table (matches false)", () => {
    const singleJoint = buildWithdrawalWaterfall({ ...BASE, filingStatus: "single", useJointRmdTable: true });
    const singleUniform = buildWithdrawalWaterfall({ ...BASE, filingStatus: "single", useJointRmdTable: false });
    const rowJoint = singleJoint.smart.rows.find(r => r.age === 75);
    const rowUniform = singleUniform.smart.rows.find(r => r.age === 75);
    expect(rowJoint).toBeDefined();
    expect(rowJoint.rmd).toBe(rowUniform.rmd);
  });

  test("filingStatus 'mfj' + useJointRmdTable=true actually uses the Joint table (differs from Uniform)", () => {
    const mfjJoint = buildWithdrawalWaterfall({ ...BASE, filingStatus: "mfj", useJointRmdTable: true });
    const mfjUniform = buildWithdrawalWaterfall({ ...BASE, filingStatus: "mfj", useJointRmdTable: false });
    const rowJoint = mfjJoint.smart.rows.find(r => r.age === 75);
    const rowUniform = mfjUniform.smart.rows.find(r => r.age === 75);
    expect(rowJoint.rmd).not.toBe(rowUniform.rmd);
  });
});

// ─── Guyton-Klinger 6% inflation pass-through cap (B4 regression) ──────────────
// Must match App.jsx's GK_INFLATION_CAP = 0.06 exactly — the historical
// bootstrapped inflation array used by runMC/deterministic engines can exceed
// 6% (clamped at 7% max), so an uncapped waterfall GK implementation would
// diverge from the MC/deterministic tabs in high-inflation years.

describe("buildWithdrawalWaterfall — GK 6% inflation pass-through cap (B4 regression)", () => {
  const gkBase = {
    ...BASE,
    sp: 80_000, ssAge: 90, ssb: 0, gkFloor: 20_000, gkCeiling: 400_000,
    accounts: [
      { id: "g1", category: "pretax",  name: "401k",    balance: 1_000_000 },
      { id: "g2", category: "roth",    name: "Roth",    balance:   400_000 },
      { id: "g3", category: "taxable", name: "Taxable", balance:   150_000 },
      { id: "g4", category: "cash",    name: "Cash",    balance:    50_000 },
    ],
  };

  test("20% inflation input still caps the year-1 spending bump at ~6%, not 20%", () => {
    const result = buildWithdrawalWaterfall({ ...gkBase, inf: 20 });
    const ratio = result.smart.rows[1].spending / result.smart.rows[0].spending;
    expect(ratio).toBeGreaterThan(1.055);
    expect(ratio).toBeLessThan(1.065);
  });

  test("8% inflation caps the same way, and produces the same year-1 spend as 20% (both hit the 6% ceiling)", () => {
    const eightPct  = buildWithdrawalWaterfall({ ...gkBase, inf: 8 });
    const twentyPct = buildWithdrawalWaterfall({ ...gkBase, inf: 20 });
    expect(eightPct.smart.rows[1].spending).toBe(twentyPct.smart.rows[1].spending);
  });

  test("2.5% inflation (below the cap) is unaffected — grows at the raw rate", () => {
    const result = buildWithdrawalWaterfall({ ...gkBase, inf: 2.5 });
    const ratio = result.smart.rows[1].spending / result.smart.rows[0].spending;
    expect(ratio).toBeGreaterThan(1.024);
    expect(ratio).toBeLessThan(1.026);
  });
});

// ─── Equity-glide-driven growth (C1 regression) ────────────────────────────────
// Before this fix, accumulateToRetirement/buildWithdrawalWaterfall hardcoded a
// flat 7% account-growth rate and never read preRetireEq/postRetireEq at all —
// two profiles differing only in risk posture produced IDENTICAL Smart
// Waterfall trajectories, contradicting the Monte Carlo (which correctly reads
// the glide-path sliders via runMC's portReturn/expectedReturn). BASE pins an
// explicit gr: 0.07, so these tests clear that override to let the equity
// sliders actually drive growth.

describe("buildWithdrawalWaterfall — equity-glide-driven growth (C1 regression)", () => {
  const noGr = { ...BASE, gr: undefined };

  test("a conservative postRetireEq (30) produces a LOWER final portfolio than an aggressive one (70), all else equal", () => {
    const conservative = buildWithdrawalWaterfall({ ...noGr, preRetireEq: 91, postRetireEq: 30 });
    const aggressive   = buildWithdrawalWaterfall({ ...noGr, preRetireEq: 91, postRetireEq: 70 });
    const finalConservative = conservative.smart.finalPretax + conservative.smart.finalRoth
      + conservative.smart.finalCash + conservative.smart.finalTaxable;
    const finalAggressive = aggressive.smart.finalPretax + aggressive.smart.finalRoth
      + aggressive.smart.finalCash + aggressive.smart.finalTaxable;
    expect(finalAggressive).toBeGreaterThan(finalConservative);
  });

  test("two profiles differing only in postRetireEq no longer produce identical trajectories (the reported bug)", () => {
    const low  = buildWithdrawalWaterfall({ ...noGr, postRetireEq: 30 });
    const high = buildWithdrawalWaterfall({ ...noGr, postRetireEq: 70 });
    // Compare a mid-horizon row's ending total portfolio — by this point enough
    // compounding has occurred that a flat-7%-for-both bug would show identical
    // totals, while the real glide-path-driven rates must differ.
    const rowLow  = low.smart.rows[10];
    const rowHigh = high.smart.rows[10];
    expect(rowLow.totalPort).not.toBe(rowHigh.totalPort);
  });

  test("gr defaults to expectedReturn(preRetireEq)/expectedReturn(postRetireEq), not a flat 7%, when no explicit gr override is given", () => {
    // expectedReturn(91) ≈ 7.6%, expectedReturn(70) ≈ 7.34% — both above the
    // old hardcoded 7.0%, so the very first year's pretax growth (age === retireAge,
    // which is 65 here, so postGr applies since 65 >= 62) must exceed a flat-7% run.
    const withGr7   = buildWithdrawalWaterfall({ ...BASE }); // BASE pins gr: 0.07
    const withGlide = buildWithdrawalWaterfall({ ...noGr, postRetireEq: 70 });
    expect(withGlide.smart.rows[0].pretaxEnd).toBeGreaterThan(withGr7.smart.rows[0].pretaxEnd);
  });
});

describe("cashRealReturn honored by the waterfall (profile field regression)", () => {
  // The profile's "Cash return" field drove runMC's cash bucket but the
  // waterfall hardcoded 4.5% — the user's setting silently did nothing on
  // the Withdrawal Plan tab. Both engines now read the same field.
  const cashProfile = {
    currentAge: 60, retireAge: 62, endAge: 90,
    sp: 60_000, ssAge: 67, ssb: 30_000, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "FL",
    accounts: [
      { category: "cash", balance: 500_000 },
      { category: "pretax", balance: 1_000_000 },
    ],
  };

  test("higher cash return grows the cash bucket faster in the waterfall", () => {
    const low  = buildWithdrawalWaterfall({ ...cashProfile, cashRealReturn: 0 });
    const high = buildWithdrawalWaterfall({ ...cashProfile, cashRealReturn: 5 });
    expect(high.smart.rows[0].cashEnd).toBeGreaterThan(low.smart.rows[0].cashEnd);
  });

  test("default matches runMC's default (3.0%), not the old hardcoded 4.5%", () => {
    const dflt = buildWithdrawalWaterfall({ ...cashProfile });
    const three = buildWithdrawalWaterfall({ ...cashProfile, cashRealReturn: 3.0 });
    const old45 = buildWithdrawalWaterfall({ ...cashProfile, cashRealReturn: 4.5 });
    expect(dflt.smart.rows[0].cashEnd).toBe(three.smart.rows[0].cashEnd);
    expect(dflt.smart.rows[0].cashEnd).not.toBe(old45.smart.rows[0].cashEnd);
  });
});

// ─── Capital-gains / cost-basis model on taxable brokerage draws (2026-07-18) ──
// Average-cost basis tracking: taxableBasisPct% of TODAY's taxable balance is
// cost basis; the rest is unrealized gain, realized proportionally on draws
// and taxed at LTCG rates (stacked on top of ordinary income) + NIIT, and
// folded into provisional income (SS taxability) + MAGI (IRMAA).

// sp/balance are deliberately large relative to the standard deduction, and
// inf: 0 freezes the deduction/bracket inflation, so that even the FIRST
// year's realized gain clears the standard deduction and lands somewhere
// inside the LTCG brackets — a modest profile like the other describe blocks'
// BASE would have every year's combined ordinary+gain income absorbed by a
// standard deduction that (correctly) keeps inflating for 20+ years, masking
// the very effect this suite is testing.
const TAX_HEAVY = {
  currentAge: 65, retireAge: 65, endAge: 80,
  sp: 300_000, ssAge: 90, ssb: 0, ssCola: 0, ab: 0, inf: 0,
  filingStatus: "mfj", stateOfResidence: "FL", twoHousehold: false,
  useJointRmdTable: false, gkFloor: 250_000, gkCeiling: 400_000,
  withdrawalBracketTarget: "37", irmaaGuard: false, ssTorpedoGuard: false,
  rothEmergencyReserve: 0, gr: 0.05,
  accounts: [
    { id: "x3", category: "taxable", balance: 4_000_000 },
  ],
};

describe("buildWithdrawalWaterfall — capital-gains / cost-basis model", () => {
  test("a lower cost basis (more unrealized gain) pays MORE lifetime tax than a 100%-basis account", () => {
    const basis50  = buildWithdrawalWaterfall({ ...TAX_HEAVY, taxableBasisPct: 50 });
    const basis100 = buildWithdrawalWaterfall({ ...TAX_HEAVY, taxableBasisPct: 100 });
    expect(basis50.smart.totalTax).toBeGreaterThan(basis100.smart.totalTax);
  });

  test("realizedGain > 0 in every year that draws from taxable, when basisPct < 100", () => {
    const result = buildWithdrawalWaterfall({ ...TAX_HEAVY, taxableBasisPct: 50 });
    const drawYears = result.smart.rows.filter(r => r.fromTaxable > 0);
    expect(drawYears.length).toBeGreaterThan(0);
    drawYears.forEach(r => expect(r.realizedGain).toBeGreaterThan(0));
  });

  test("100%-basis account with no portfolio growth realizes ZERO gain — no LTCG/NIIT tax at all (matches pre-feature behavior)", () => {
    // gr: 0 isolates the LTCG effect from ordinary investment growth: with no
    // growth AND no accumulation phase (currentAge === retireAge), basis stays
    // exactly equal to the balance every year, so every draw realizes $0 gain.
    const result = buildWithdrawalWaterfall({ ...TAX_HEAVY, taxableBasisPct: 100, gr: 0 });
    result.smart.rows.forEach(r => {
      expect(r.realizedGain).toBe(0);
      expect(r.ltcgTax).toBe(0);
      expect(r.niit).toBe(0);
    });
  });

  test("realized gains alone can push Social Security from untaxed to taxed (provisional income includes LTCG)", () => {
    // No pretax/RMD, no cash — spending is funded by SS + a taxable draw only,
    // isolating the effect of the realized gain on provisional income.
    const ssProfile = {
      currentAge: 65, retireAge: 65, endAge: 66,
      sp: 80_000, ssAge: 65, ssb: 30_000, ssCola: 2.4, ab: 0, inf: 2.5,
      filingStatus: "mfj", stateOfResidence: "FL", twoHousehold: false,
      gkFloor: 40_000, gkCeiling: 150_000, withdrawalBracketTarget: "22",
      irmaaGuard: false, ssTorpedoGuard: false, rothEmergencyReserve: 0, gr: 0,
      accounts: [{ id: "s1", category: "taxable", balance: 700_000 }],
    };
    // 100% basis → $0 realized gain → provisional = 0.5×$30K = $15K < $32K MFJ
    // lower threshold → taxSS = 0.
    const highBasis = buildWithdrawalWaterfall({ ...ssProfile, taxableBasisPct: 100 });
    expect(highBasis.smart.rows[0].taxSS).toBe(0);
    // 10% basis → ~90% of the draw is realized gain (~$45K on a ~$50K draw) →
    // provisional = $15K + ~$45K ≈ $60K, well past the $44K MFJ upper threshold
    // → some SS becomes taxable.
    const lowBasis = buildWithdrawalWaterfall({ ...ssProfile, taxableBasisPct: 10 });
    expect(lowBasis.smart.rows[0].taxSS).toBeGreaterThan(0);
  });

  test("basis depletes over time: the realized-gain fraction of each taxable draw is non-decreasing year over year", () => {
    // No pretax (no RMD/rmdExcess to perturb basis) — every dollar of spending
    // comes from the taxable bucket, isolating basis-fraction drift. With
    // average-cost tracking, a proportional draw never changes the basis
    // fraction by itself; only growth (which grows the balance but not the
    // basis) shrinks the basis fraction and grows the gain fraction — so the
    // gain fraction should only ever go up.
    const depletionProfile = {
      currentAge: 65, retireAge: 65, endAge: 85,
      sp: 50_000, ssAge: 67, ssb: 0, ssCola: 2.4, ab: 0, inf: 2.5,
      filingStatus: "mfj", stateOfResidence: "FL", twoHousehold: false,
      gkFloor: 20_000, gkCeiling: 200_000, withdrawalBracketTarget: "22",
      irmaaGuard: false, ssTorpedoGuard: false, rothEmergencyReserve: 0, gr: 0.06,
      accounts: [{ id: "d1", category: "taxable", balance: 1_000_000 }],
    };
    const result = buildWithdrawalWaterfall({ ...depletionProfile, taxableBasisPct: 50 });
    const fracs = result.smart.rows
      .filter(r => r.fromTaxable > 0)
      .map(r => r.realizedGain / r.fromTaxable);
    expect(fracs.length).toBeGreaterThan(5);
    for (let i = 1; i < fracs.length; i++) {
      expect(fracs[i]).toBeGreaterThanOrEqual(fracs[i - 1] - 0.005); // small rounding tolerance
    }
  });
});

describe("runMC — taxable cost-basis (taxableBasisPct) wiring", () => {
  test("basisPct flows through to a lower cost basis realizing more gain (indirect check via lower success rate)", () => {
    const taxableHeavy = {
      currentAge: 65, retireAge: 65, endAge: 90, port: 0, contrib: 0, inf: 2.5,
      sp: 100_000, ssAge: 90, ssb: 0, ssCola: 2.4, ab: 0, useAb: false,
      tax: 22, smile: false, preRetireEq: 91, postRetireEq: 70,
      gkFloor: 40_000, gkCeiling: 150_000, withdrawalStrategy: "gk",
      cashRealReturn: 1.0, useJointRmdTable: false, twoHousehold: false,
      filingStatus: "mfj", stateOfResidence: "FL",
      accounts: [
        { id: "th1", category: "taxable", name: "Taxable", balance: 1_800_000 },
        { id: "th2", category: "cash",    name: "Cash",    balance:    50_000 },
      ],
    };
    const lowBasis  = runMC({ ...taxableHeavy, taxableBasisPct: 40  }, 90, 500, 42, true);
    const highBasis = runMC({ ...taxableHeavy, taxableBasisPct: 100 }, 90, 500, 42, true);
    expect(lowBasis.rate).toBeLessThanOrEqual(highBasis.rate);
  });
});
