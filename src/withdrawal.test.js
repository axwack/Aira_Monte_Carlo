import { buildWithdrawalWaterfall, resolveDrawOrder } from "./engine/buildWithdrawalWaterfall.js";
import { mortgageSchedule, mortgageAnnualPayments, computeOtherIncome } from "./engine/expenses.js";
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

// ─── IRMAA 2-year lookback (2026-07-18) ────────────────────────────────────────
// Medicare charges year T's surcharge off MAGI from year T-2, not the current
// year. buildWithdrawalWaterfall now maintains a per-scenario magiByAge history
// and threads magiLookback into yearTax every year. The first two retirement
// years (no pre-retirement wage history modeled) fall back to same-year MAGI.
//
// LOOKBACK_BASE: cash is abundant enough to fund baseline spending for the
// whole horizon without ever touching pretax (draw order is cash → taxable →
// pretax in smart mode), so baseline-year MAGI stays ~$0 (well under the
// $218K IRMAA tier-1). gr: 0 and inf: 0 freeze balances/thresholds so the
// ONLY thing that moves MAGI in any given year is a pinned conversionOverrides
// entry — isolating the lookback effect cleanly.
const LOOKBACK_BASE = {
  currentAge: 60, retireAge: 60, endAge: 85,
  sp: 60_000, ssAge: 90, ssb: 0, ssCola: 0, ab: 0, inf: 0,
  filingStatus: "mfj", stateOfResidence: "FL", twoHousehold: false,
  useJointRmdTable: false, gkFloor: 40_000, gkCeiling: 150_000,
  withdrawalBracketTarget: "off", irmaaGuard: false, ssTorpedoGuard: false,
  rothEmergencyReserve: 0, gr: 0,
  accounts: [
    { id: "p1", category: "pretax", balance: 2_000_000 },
    { id: "c1", category: "cash",   balance: 2_000_000 },
  ],
};

describe("buildWithdrawalWaterfall — IRMAA 2-year lookback", () => {
  test("a pinned Roth conversion at exactly age 63 charges IRMAA at age 65, NOT at 63/64", () => {
    const yr63 = BASE_YEAR() + (63 - 60);
    const result = buildWithdrawalWaterfall({
      ...LOOKBACK_BASE,
      conversionOverrides: [{ year: yr63, amount: 700_000 }],
    });
    const row63 = result.smart.rows.find(r => r.age === 63);
    const row64 = result.smart.rows.find(r => r.age === 64);
    const row65 = result.smart.rows.find(r => r.age === 65);
    // Ages 63/64 are under-65 anyway (no IRMAA gate at all), but assert them
    // explicitly per spec.
    expect(row63.irmaa).toBe(0);
    expect(row64.irmaa).toBe(0);
    // Age 65's charge is driven by age 63's MAGI (the conversion year) — under
    // the OLD same-year behavior this charge would never appear at 65 at all
    // (65's own income is back to baseline-low).
    expect(row65.irmaa).toBeGreaterThan(0);
    expect(row65.landmines.irmaaTriggered).toBe(true);
  });

  test("moving the same pinned conversion to age 70 shifts the IRMAA charge to age 72", () => {
    const yr70 = BASE_YEAR() + (70 - 60);
    const result = buildWithdrawalWaterfall({
      ...LOOKBACK_BASE,
      conversionOverrides: [{ year: yr70, amount: 700_000 }],
    });
    const row70 = result.smart.rows.find(r => r.age === 70);
    const row71 = result.smart.rows.find(r => r.age === 71);
    const row72 = result.smart.rows.find(r => r.age === 72);
    // Under the OLD same-year behavior this would have charged AT 70 — the
    // lookback proves itself by showing $0 here instead.
    expect(row70.irmaa).toBe(0);
    expect(row71.irmaa).toBe(0);
    expect(row72.irmaa).toBeGreaterThan(0);
  });

  test("income high at 65-66 (conversions) then dropping: IRMAA charges shift to 67-68 via the lookback, then stop", () => {
    const yr65 = BASE_YEAR() + (65 - 60);
    const yr66 = BASE_YEAR() + (66 - 60);
    const result = buildWithdrawalWaterfall({
      ...LOOKBACK_BASE,
      conversionOverrides: [
        { year: yr65, amount: 700_000 },
        { year: yr66, amount: 700_000 },
      ],
    });
    const byAge = (a) => result.smart.rows.find(r => r.age === a);
    // 65/66 themselves: their OWN lookback (ages 63/64) is baseline-low, so no
    // charge in the conversion years themselves.
    expect(byAge(65).irmaa).toBe(0);
    expect(byAge(66).irmaa).toBe(0);
    // 67/68: lookback now sees the high 65/66 MAGI — charged.
    expect(byAge(67).irmaa).toBeGreaterThan(0);
    expect(byAge(68).irmaa).toBeGreaterThan(0);
    // 69+: income already dropped back to baseline two years earlier (67's
    // own MAGI, which 69 looks back on, is low again) — charge stops.
    expect(byAge(69).irmaa).toBe(0);
    expect(byAge(70).irmaa).toBe(0);
  });

  test("row exposes this year's own magi (for the age+2 lookback / future UI use)", () => {
    const yr63 = BASE_YEAR() + (63 - 60);
    const result = buildWithdrawalWaterfall({
      ...LOOKBACK_BASE,
      conversionOverrides: [{ year: yr63, amount: 700_000 }],
    });
    const row63 = result.smart.rows.find(r => r.age === 63);
    expect(row63.magi).toBeGreaterThan(600_000); // conversion dominates MAGI that year
  });
});

// ─── Funding identity holds with IRMAA-triggering income (audit regression) ────
// Fixed income + otherIncome + RMD + draws − rmdExcess must equal spending +
// housing + carveouts + fedTax + stateTax + irmaa on every row, within $2
// rounding — the same identity App.jsx documents above the Withdrawal Order
// table. No conversionOverrides/rothConversionTarget here (kept "off") so the
// draw cascade and the reported fedTax/stateTax/irmaa stay in lockstep (a
// pinned conversion's own tax is funded separately, outside the cascade —
// deliberately out of scope for this identity check).
describe("buildWithdrawalWaterfall — funding identity holds with IRMAA-triggering income", () => {
  const IDENTITY_PROFILE = {
    currentAge: 63, retireAge: 63, endAge: 90,
    sp: 260_000, ssAge: 65, ssb: 30_000, ssCola: 2.4, ab: 0, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "CA", twoHousehold: false,
    useJointRmdTable: false, gkFloor: 200_000, gkCeiling: 400_000,
    withdrawalBracketTarget: "off", irmaaGuard: false, ssTorpedoGuard: false,
    rothEmergencyReserve: 0, gr: 0.03, rothConversionTarget: "off",
    // A large balance relative to spending — the identity assumes every
    // dollar of "need" is actually funded by the draw cascade; a portfolio
    // that depletes mid-horizon (pretax exhausted, no other buckets left)
    // breaks that assumption in its own well-known way (a documented
    // modeling edge case, not part of this lookback fix), so this profile
    // is sized to comfortably survive the full 63→90 horizon.
    accounts: [
      { id: "p1", category: "pretax", balance: 10_000_000 },
      { id: "c1", category: "cash",   balance:    200_000 },
    ],
  };

  function assertIdentity(rows) {
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => {
      const taxTotal = r.fedTax + r.stateTax + r.irmaa;
      const rmdExcess = Math.max(0, r.rmd - (r.needFromPort + taxTotal));
      const lhs = r.fixedIncomeTotal + r.otherIncome + r.rmd
        + (r.fromCash + r.fromTaxable + r.fromPretax + r.fromRoth) - rmdExcess;
      // eventCost is real spending the draws must fund, so it belongs on this
      // side alongside housing and carveouts.
      //
      // healthcareRisk deliberately does NOT appear here. It is a probability-
      // weighted advisory (E[X]), not a cash obligation — see its declaration in
      // buildWithdrawalWaterfall. It was previously charged to the draw as
      // `healthcareCost`, which is what made this identity fail on screen: the
      // rendered table was off by exactly the healthcare charge from age 72 on.
      // The §72(t) early-distribution penalty is funded by the draws like any
      // other tax, so it sits on this side too (it is $0 from age 59½ on).
      const rhs = r.spending + r.housingCost + r.carveoutCost + taxTotal
        + (r.eventCost || 0) + (r.earlyPenalty || 0);
      expect(Math.abs(lhs - rhs)).toBeLessThan(2);
    });
  }

  test("identity holds on every smart row for an IRMAA-triggering profile", () => {
    const result = buildWithdrawalWaterfall(IDENTITY_PROFILE);
    // Guard: this profile must actually trigger IRMAA somewhere, or the test
    // isn't exercising the lookback-charged tax component at all.
    expect(result.smart.rows.some(r => r.irmaa > 0)).toBe(true);
    assertIdentity(result.smart.rows);
  });

  test("identity holds on every naive row for the same IRMAA-triggering profile", () => {
    const result = buildWithdrawalWaterfall(IDENTITY_PROFILE);
    expect(result.naive.rows.some(r => r.irmaa > 0)).toBe(true);
    assertIdentity(result.naive.rows);
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
    // smile:false keeps the depletion comparison about DRAW ORDER — the spending
    // smile makes every plan cheaper, which is enough to stop naive exhausting.
    const result = buildWithdrawalWaterfall({ ...BASE, smile: false });
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
    // smile:false isolates this from the Blanchett spending curve, which is an
    // orthogonal real-spending overlay. With it on, spending deliberately grows
    // BELOW inflation, which is not what this test is measuring.
    const result = buildWithdrawalWaterfall({ ...BASE, smile: false }); // endAge 90 → Bengen from age 76
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
    // This suite measures the INFLATION pass-through cap, so the spending smile
    // (a real-terms lifestyle curve) is switched off to avoid confounding it.
    smile: false,
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

// ─── Custom account draw order (orderingMode / withdrawalOrder) ──────────────────
// ─── Other income growth modes (pension fixed-$ COLA vs compounding %) ──────────
describe("computeOtherIncome — growth modes", () => {
  test("compounding % (default) grows geometrically", () => {
    const inc = [{ annual: 10_000, startYear: 2026, endYear: null, growthMode: "pct", growthRate: 2, taxable: true }];
    // 3 years elapsed (2029): 10000 × 1.02^3
    expect(computeOtherIncome(inc, 2029).total).toBeCloseTo(10_000 * Math.pow(1.02, 3), 2);
  });

  test("fixed $/yr COLA adds a flat amount each year", () => {
    const inc = [{ annual: 30_000, startYear: 2026, endYear: null, growthMode: "fixed", growthAmount: 600, taxable: true }];
    expect(computeOtherIncome(inc, 2026).total).toBe(30_000);          // start year: no increase yet
    expect(computeOtherIncome(inc, 2031).total).toBe(33_000);          // +600 × 5 years
  });

  test("growthCapYears caps both modes", () => {
    const fixed = [{ annual: 20_000, startYear: 2026, growthMode: "fixed", growthAmount: 1_000, growthCapYears: 3, taxable: true }];
    // 10 years elapsed but capped at 3 → 20000 + 1000×3
    expect(computeOtherIncome(fixed, 2036).total).toBe(23_000);
  });

  test("taxable flag routes fixed-mode income to totalTaxable", () => {
    const inc = [{ annual: 10_000, startYear: 2026, growthMode: "fixed", growthAmount: 0, taxable: false }];
    const r = computeOtherIncome(inc, 2028);
    expect(r.total).toBe(10_000);
    expect(r.totalTaxable).toBe(0);
  });
});

describe("Account draw order — resolveDrawOrder", () => {
  test("Test 1 — resolves each mode and sanitizes custom orders", () => {
    // default + tax_reactive → the historical sequence
    expect(resolveDrawOrder(undefined)).toEqual(["cash", "taxable", "pretax", "roth"]);
    expect(resolveDrawOrder("tax_reactive")).toEqual(["cash", "taxable", "pretax", "roth"]);
    expect(resolveDrawOrder("pretax_first")).toEqual(["pretax", "cash", "taxable", "roth"]);
    // custom passes through when it's a full valid permutation
    expect(resolveDrawOrder("custom", ["taxable", "cash", "pretax", "roth"]))
      .toEqual(["taxable", "cash", "pretax", "roth"]);
    // sanitize: drop dupes + invalid tokens, append any missing bucket
    expect(resolveDrawOrder("custom", ["roth", "roth", "bogus", "cash"]))
      .toEqual(["roth", "cash", "taxable", "pretax"]);
    // partial order is completed in canonical order
    expect(resolveDrawOrder("custom", ["pretax"]))
      .toEqual(["pretax", "cash", "taxable", "roth"]);
  });
});

describe("Account draw order — engine behavior", () => {
  const def = buildWithdrawalWaterfall(BASE); // no orderingMode → default

  test("Test 2 — default equals explicit tax_reactive (regression lock)", () => {
    const tr = buildWithdrawalWaterfall({ ...BASE, orderingMode: "tax_reactive" });
    expect(tr.smart.rows).toEqual(def.smart.rows);
    // The naive ("No plan") scenario is order-invariant — orderingMode must never
    // touch it (it's the fixed comparison baseline).
    expect(tr.naive.rows).toEqual(def.naive.rows);
    const custom = buildWithdrawalWaterfall({
      ...BASE, orderingMode: "custom", withdrawalOrder: ["roth", "pretax", "taxable", "cash"],
    });
    expect(custom.naive.rows).toEqual(def.naive.rows);
  });

  test("Test 3 — custom taxable-first drains taxable before cash; sum funds the need", () => {
    const cust = buildWithdrawalWaterfall({
      ...BASE, orderingMode: "custom", withdrawalOrder: ["taxable", "cash", "pretax", "roth"],
    });
    const c0 = cust.smart.rows[0];
    const d0 = def.smart.rows[0];
    expect(d0.fromCash).toBeGreaterThan(0);            // default drains cash first
    expect(c0.fromCash).toBe(0);                       // custom leaves cash untouched first year
    expect(c0.fromTaxable).toBeGreaterThan(d0.fromTaxable);
    // Sum invariant: order changes WHERE, not roughly HOW MUCH — both fund ~ the year's spend.
    const total = (r) => r.fromCash + r.fromTaxable + r.fromPretax + r.fromRoth + r.rmd;
    expect(total(c0)).toBeGreaterThanOrEqual(BASE.sp * 0.8);
    expect(total(d0)).toBeGreaterThanOrEqual(BASE.sp * 0.8);
  });

  test("Test 4 — Roth reserve is honored even when Roth is dragged to first", () => {
    const rothFirst = buildWithdrawalWaterfall({
      ...BASE, orderingMode: "custom", withdrawalOrder: ["roth", "cash", "taxable", "pretax"],
      rothEmergencyReserve: 10_000_000, // reserve >> balance → Roth fully protected
    });
    rothFirst.smart.rows.forEach((r) => expect(r.fromRoth).toBe(0));
  });

  test("Test 5 — pre-tax bracket cap still binds when pre-tax is moved to position 1", () => {
    const common = {
      ...BASE, sp: 200_000, gkFloor: 40_000, gkCeiling: 260_000,
      orderingMode: "custom", withdrawalOrder: ["pretax", "cash", "taxable", "roth"],
    };
    const capped   = buildWithdrawalWaterfall({ ...common, withdrawalBracketTarget: "12" });
    const uncapped = buildWithdrawalWaterfall({ ...common, withdrawalBracketTarget: "off" });
    // The 12% ceiling limits the year-1 pre-tax draw even though pre-tax is drained first.
    expect(capped.smart.rows[0].fromPretax).toBeLessThan(uncapped.smart.rows[0].fromPretax);
    expect(String(capped.smart.rows[0].pretaxCapReason)).toMatch(/^bracket_|^irmaa_ceil$/);
  });
});

describe("Account draw order — runMC honors it (cross-engine, shared resolver)", () => {
  const MC_ORDER = {
    currentAge: 65, retireAge: 65, endAge: 90, port: 0, contrib: 0, inf: 2.5,
    sp: 90_000, ssAge: 67, ssb: 24_000, ssCola: 2.4, ab: 0, useAb: false,
    tax: 22, smile: false, preRetireEq: 91, postRetireEq: 70,
    gkFloor: 40_000, gkCeiling: 150_000, withdrawalStrategy: "gk",
    withdrawalBracketTarget: "22", irmaaGuard: false, rothEmergencyReserve: 0,
    cashRealReturn: 1.0, useJointRmdTable: false, twoHousehold: false,
    filingStatus: "mfj", stateOfResidence: "FL",
    accounts: [
      { id: "m1", category: "pretax",  name: "401k",    balance: 900_000 },
      { id: "m2", category: "roth",    name: "Roth",    balance: 400_000 },
      { id: "m3", category: "taxable", name: "Taxable", balance: 200_000 },
      { id: "m4", category: "cash",    name: "Cash",    balance:  60_000 },
    ],
  };

  test("Test 6 — a different order changes the deterministic MC outcome, tax-reactive not worse", () => {
    const taxReactive = runMC({ ...MC_ORDER, orderingMode: "tax_reactive" }, 90, 800, 42, true);
    const rothFirst   = runMC({ ...MC_ORDER, orderingMode: "custom", withdrawalOrder: ["roth", "cash", "taxable", "pretax"] }, 90, 800, 42, true);
    for (const r of [taxReactive.rate, rothFirst.rate]) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
    // Draw order is wired into runMC (same seed, deterministic) — the outcomes differ,
    // and draining tax-free Roth first is no better than the tax-reactive default.
    // Tolerance of 1pp: with paired bootstrap sampling (v1.2.104) the two strategies
    // both sit at ~99% for this fixture, so per-seed noise can flip the ordering by
    // a fraction of a percent. The semantic claim ("roth-first is not better") holds
    // up to that tolerance; without it the test asserts a stricter guarantee than
    // 800-path MC on a near-100% portfolio can deliver.
    expect(rothFirst.rate).not.toBe(taxReactive.rate);
    expect(rothFirst.rate).toBeLessThanOrEqual(taxReactive.rate + 0.01);
  });
});

// ─── Item 11: rental/annuity single model (REQUIREMENTS §13.2 #11) ────────────
// The waterfall used to hardcode 1.03 growth, ignore abGrowth/abEndYear, inflate
// propIncome on a separate CPI track, and stop ALL rental income at age 80.

describe("waterfall rental income — one model, matching the other engines", () => {
  const RENTAL = { ...BASE, ab: 12_000, abGrowth: 3, endAge: 90, abEndYear: null };

  test("rental does NOT stop at age 80 (the undisclosed age-80 cliff is gone)", () => {
    const rows = buildWithdrawalWaterfall(RENTAL).smart.rows;
    const at81 = rows.find(r => r.age === 81);
    expect(at81).toBeTruthy();
    // Would have been exactly 0 before the fix, for every profile planning past 80.
    expect(at81.annuityRental).toBeGreaterThan(0);
  });

  test("abGrowth is honored rather than a hardcoded 3%", () => {
    const slow = buildWithdrawalWaterfall({ ...RENTAL, abGrowth: 3 }).smart.rows;
    const fast = buildWithdrawalWaterfall({ ...RENTAL, abGrowth: 6 }).smart.rows;
    const age75slow = slow.find(r => r.age === 75).annuityRental;
    const age75fast = fast.find(r => r.age === 75).annuityRental;
    expect(age75fast).toBeGreaterThan(age75slow);
    // 10 years of compounding at 6% vs 3% on 12,000: 21,490 vs 16,127.
    expect(age75fast).toBe(Math.round(12_000 * Math.pow(1.06, 10)));
    expect(age75slow).toBe(Math.round(12_000 * Math.pow(1.03, 10)));
  });

  test("ab and propIncome are summed first, then grown on ONE basis", () => {
    // At the retirement year the growth factor is exactly 1.0, so year 0 must be
    // the plain sum. Previously propIncome was inflated by CPI separately here.
    const rows = buildWithdrawalWaterfall({
      ...RENTAL, ab: 8_000, propIncome: 10_000,
    }).smart.rows;
    expect(rows[0].annuityRental).toBe(18_000);
  });

  test("abEndYear still stops the stream", () => {
    const rows = buildWithdrawalWaterfall({ ...RENTAL, abEndYear: 2030 }).smart.rows;
    const after = rows.filter(r => r.yr > 2030);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(r => r.annuityRental === 0)).toBe(true);
  });
});

// ─── Item 10 / ENG-8: IRMAA guard caps the Roth conversion ────────────────────

describe("ENG-8 — irmaaGuard caps the Step-6.5 Roth conversion", () => {
  // Age 64 so the age>=63 gate is open; big pretax balance so the bracket ceiling
  // (24%) is well above the IRMAA tier-1 ceiling and the guard is what binds.
  const CONV = {
    ...BASE,
    currentAge: 64, retireAge: 64, ssAge: 70, ssb: 0,
    rothConversionTarget: "24",
    accounts: [
      { id: "t1", category: "pretax",  name: "401k",    balance: 3_000_000 },
      { id: "t2", category: "roth",    name: "Roth",    balance:   200_000 },
      { id: "t3", category: "taxable", name: "Taxable", balance:   500_000 },
      { id: "t4", category: "cash",    name: "Cash",    balance:   200_000 },
    ],
  };

  test("guard ON produces a smaller conversion than guard OFF", () => {
    const off = buildWithdrawalWaterfall({ ...CONV, irmaaGuard: false }).smart.rows[0];
    const on  = buildWithdrawalWaterfall({ ...CONV, irmaaGuard: true  }).smart.rows[0];
    expect(off.conversionAmount).toBeGreaterThan(0);
    expect(on.conversionAmount).toBeLessThan(off.conversionAmount);
  });

  test("guard ON keeps MAGI at or under the IRMAA tier-1 ceiling", () => {
    const on = buildWithdrawalWaterfall({ ...CONV, irmaaGuard: true }).smart.rows[0];
    // Tier-1 MFJ 2026 = 218,000 per TAX_REFERENCE.md, indexed to the row's year.
    const ceiling = 218_000 * Math.pow(1 + 2.5 / 100, on.yr - new Date().getFullYear());
    expect(on.magi).toBeLessThanOrEqual(Math.round(ceiling) + 1);
  });

  test("the row reports WHY the conversion was capped", () => {
    const on = buildWithdrawalWaterfall({ ...CONV, irmaaGuard: true }).smart.rows[0];
    expect(on.convCapReason).toBe("irmaa_ceil");
    const off = buildWithdrawalWaterfall({ ...CONV, irmaaGuard: false }).smart.rows[0];
    expect(off.convCapReason).not.toBe("irmaa_ceil");
  });

  test("below the age gate (62) the conversion cap does NOT bind", () => {
    // age 62 → the 2-year lookback lands at 64, still pre-Medicare, so IRMAA
    // cannot be charged on it and the guard must not throttle the conversion.
    const young = { ...CONV, currentAge: 62, retireAge: 62 };
    const off = buildWithdrawalWaterfall({ ...young, irmaaGuard: false }).smart.rows[0];
    const on  = buildWithdrawalWaterfall({ ...young, irmaaGuard: true  }).smart.rows[0];
    expect(on.conversionAmount).toBe(off.conversionAmount);
  });

  test("a same-year conversion never moves that same year's own IRMAA charge", () => {
    // Pins the 2-year-lookback invariant: IRMAA comes from MAGI[age-2], which is
    // fixed before conversion sizing, so it must be identical with and without a
    // conversion in the same year.
    const withC = buildWithdrawalWaterfall({ ...CONV, irmaaGuard: false }).smart.rows;
    const noC   = buildWithdrawalWaterfall({ ...CONV, rothConversionTarget: "off" }).smart.rows;
    const y0 = withC[0], n0 = noC[0];
    expect(y0.conversionAmount).toBeGreaterThan(0);
    expect(y0.irmaa).toBe(n0.irmaa);
  });
});

// ─── §23: conversion tax must come from REAL buckets ──────────────────────────
// Previously `taxFunding` was read by NOTHING in this engine: conversion tax always
// came out of pre-tax whatever the user picked, and "outside cash" implied an
// unlimited external pot the simulation never tracked. Now taxable → cash → pretax.

describe("Roth conversion tax funding (§23)", () => {
  const CONV = {
    ...BASE,
    currentAge: 65, retireAge: 65, ssAge: 70, ssb: 0, sp: 40_000,
    rothConversionTarget: "22", irmaaGuard: false,
    accounts: [
      { id: "t1", category: "pretax",  name: "401k",    balance: 1_500_000 },
      { id: "t2", category: "roth",    name: "Roth",    balance:   100_000 },
      { id: "t3", category: "taxable", name: "Taxable", balance:   400_000 },
      { id: "t4", category: "cash",    name: "Cash",    balance:   100_000 },
    ],
  };
  const y0 = (p) => buildWithdrawalWaterfall(p).smart.rows[0];

  test("from_taxable pays the tax out of taxable, not pre-tax", () => {
    const r = y0({ ...CONV, taxFunding: "from_taxable" });
    expect(r.conversionAmount).toBeGreaterThan(0);
    expect(r.conversionTax).toBeGreaterThan(0);
    expect(r.convTaxFromTaxable).toBeGreaterThan(0);
    expect(r.convTaxFromPretax).toBe(0);
    // Full conversion reaches the Roth when tax is paid from outside it.
    expect(r.convToRoth).toBe(r.conversionAmount);
  });

  test("from_conversion withholds instead — less lands in the Roth", () => {
    const r = y0({ ...CONV, taxFunding: "from_conversion" });
    expect(r.conversionTax).toBeGreaterThan(0);
    expect(r.convToRoth).toBe(r.conversionAmount - r.conversionTax);
    expect(r.convTaxFromTaxable).toBe(0);
    expect(r.convTaxFromCash).toBe(0);
  });

  test("the setting is no longer inert — funding sources give different results", () => {
    const a = y0({ ...CONV, taxFunding: "from_taxable" });
    const b = y0({ ...CONV, taxFunding: "from_conversion" });
    expect(a.convToRoth).not.toBe(b.convToRoth);
  });

  test("no imaginary money: tax falls back to pre-tax only when real buckets run dry", () => {
    // Almost no taxable/cash, so there is nothing outside pre-tax to pay with.
    const broke = {
      ...CONV,
      accounts: [
        { id: "t1", category: "pretax",  name: "401k",    balance: 1_500_000 },
        { id: "t2", category: "roth",    name: "Roth",    balance:   100_000 },
        { id: "t3", category: "taxable", name: "Taxable", balance:         0 },
        { id: "t4", category: "cash",    name: "Cash",    balance:         0 },
      ],
    };
    const r = y0({ ...broke, taxFunding: "from_taxable" });
    if (r.conversionAmount > 0) {
      expect(r.convTaxFromTaxable).toBe(0);
      // It must come from somewhere real — pre-tax — never from nowhere.
      expect(r.convTaxFromPretax).toBeGreaterThan(0);
      expect(r.convTaxFromTaxable + r.convTaxFromCash + r.convTaxFromPretax)
        .toBeCloseTo(r.conversionTax, 0);
    }
  });

  test("every dollar of conversion tax is accounted to a real bucket", () => {
    const r = y0({ ...CONV, taxFunding: "from_taxable" });
    expect(r.convTaxFromTaxable + r.convTaxFromCash + r.convTaxFromPretax)
      .toBeCloseTo(r.conversionTax, 0);
  });
});

describe("taxFunding value contract (§23 follow-up)", () => {
  // The Profile dropdown emits "from_conv", NOT "from_conversion". A mismatch here
  // fails SILENTLY — withholding never fires and the tax quietly comes from the
  // buckets instead. That is the exact class of bug this work exists to kill, so
  // pin the value the UI actually sends.
  const CONV2 = {
    ...BASE, currentAge: 65, retireAge: 65, ssAge: 70, ssb: 0, sp: 40_000,
    rothConversionTarget: "22", irmaaGuard: false,
    accounts: [
      { id: "t1", category: "pretax",  balance: 1_500_000 },
      { id: "t2", category: "roth",    balance:   100_000 },
      { id: "t3", category: "taxable", balance:   400_000 },
      { id: "t4", category: "cash",    balance:   100_000 },
    ],
  };
  test('"from_conv" (the dropdown value) actually withholds', () => {
    const r = buildWithdrawalWaterfall({ ...CONV2, taxFunding: "from_conv" }).smart.rows[0];
    expect(r.conversionTax).toBeGreaterThan(0);
    expect(r.convToRoth).toBe(r.conversionAmount - r.conversionTax);
    expect(r.convTaxFromTaxable).toBe(0);
  });
  test('"from_conversion" is accepted as an alias', () => {
    const a = buildWithdrawalWaterfall({ ...CONV2, taxFunding: "from_conv" }).smart.rows[0];
    const b = buildWithdrawalWaterfall({ ...CONV2, taxFunding: "from_conversion" }).smart.rows[0];
    expect(a.convToRoth).toBe(b.convToRoth);
  });
  test("runMC honors taxFunding too — MC must not describe a different plan", () => {
    const mcA = runMC({ ...CONV2, taxFunding: "from_taxable" }, 90, 120, 42, true);
    const mcB = runMC({ ...CONV2, taxFunding: "from_conv" },    90, 120, 42, true);
    // Same seed, same everything except who pays the tax → results must differ.
    const endA = mcA.pcts?.[mcA.pcts.length - 1]?.p50;
    const endB = mcB.pcts?.[mcB.pcts.length - 1]?.p50;
    expect(typeof endA).toBe("number");
    expect(typeof endB).toBe("number");
    // Withholding shrinks what reaches the Roth, so terminal wealth must differ.
    expect(endA).not.toBe(endB);
  });
});

/**
 * Engine fields that the UI needs in order to explain a number.
 *
 * Every field below was computed by the engine and rendered NOWHERE, which is the
 * defect class u/garylapointe found twice: a table that invites reconciliation and
 * then fails it. `rmdSurplus` was worse than missing — the UI recomputed it with a
 * DIFFERENT formula (omitting fed + state tax from the offset), so the "reinvested
 * into Taxable" figure on screen was overstated in every year with income tax.
 */
describe("disclosure: engine emits what the UI must explain", () => {
  const P = {
    currentAge: 70, retireAge: 70, endAge: 92,
    sp: 60_000, ssAge: 70, ssb: 40_000, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.06,
    birthYear: 1956,
    accounts: [
      { id: "d1", category: "pretax",  balance: 3_000_000 },
      { id: "d2", category: "taxable", balance:   200_000 },
    ],
  };

  test("rmdSurplus is emitted, not left for the UI to re-derive", () => {
    const rows = buildWithdrawalWaterfall(P).smart.rows;
    rows.forEach(r => expect(typeof r.rmdSurplus).toBe("number"));
    // This fixture must actually force RMD beyond need, or the test proves nothing.
    expect(rows.some(r => r.rmdSurplus > 0)).toBe(true);
  });

  test("rmdSurplus diverges from the old UI formula in CONVERSION years", () => {
    // The tooltip's `rmd - (needFromPort + irmaaFull)` agreed exactly in ordinary
    // years — irmaaFull is fed + state + IRMAA, despite the name. It broke only
    // when a Roth conversion ran: irmaaFull is the WITH-conversion tax, while the
    // engine's offset excludes conversion tax (funded separately via convTaxFrom*),
    // so the tooltip subtracted it twice and understated the reinvestment.
    const rows = buildWithdrawalWaterfall({ ...P, rothConversionTarget: "24" }).smart.rows;
    const stale = (r) => Math.max(0, r.rmd - ((r.needFromPort || 0) + (r.irmaaFull || 0)));

    const convYear = rows.find(r => r.conversionAmount > 0 && r.rmdSurplus > 0);
    expect(convYear).toBeDefined();
    expect(convYear.rmdSurplus).toBeGreaterThan(stale(convYear));

    // And it must still agree where there is no conversion — otherwise this
    // "fix" would be silently changing correct numbers.
    rows.filter(r => !(r.conversionAmount > 0))
        .forEach(r => expect(Math.abs(r.rmdSurplus - stale(r))).toBeLessThan(2));
  });

  test("fed tax components are exposed and reconcile to fedTax", () => {
    const rows = buildWithdrawalWaterfall(P).smart.rows;
    rows.forEach(r => {
      const ordinary = r.fedTax - (r.ltcgTax || 0) - (r.niit || 0);
      expect(ordinary).toBeGreaterThanOrEqual(-1);
      expect(typeof r.taxSS).toBe("number");
      expect(typeof r.realizedGain).toBe("number");
    });
  });

  test("planned-expense fields travel with the row that charges them", () => {
    const withEvent = buildWithdrawalWaterfall({
      ...P,
      cashFlowEvents: [{ id: "e1", label: "New roof", year: 2032, amount: 40_000 }],
    }).smart.rows;
    const hit = withEvent.find(r => r.eventCost > 0);
    expect(hit).toBeDefined();
    // The label must ride along, or the UI can name the cost but not the cause.
    expect(hit.eventLabels).toContain("New roof");
    expect(hit.needFromPort).toBeGreaterThan(0);
  });
});

// ─── §28.1 — a pension holder's income covers his spending ────────────────────
//
// u/garylapointe, 2026-07-28: with his $44,668 pension counted, income is
// ~$81,400, "which is more than enough to cover the taxes listed there and does
// not need to take the Roth." v1.2.52 fixed the DISPLAY (the pension appeared in
// no column), but nobody had verified the DRAW. If a Roth draw is real here it is
// an engine bug and outranks every display fix in §28.
//
// These lock the behaviour either way, so the question cannot go unverified again.
describe("§28.1 — income-covered retiree does not touch Roth", () => {
  const GARY = {
    ...BASE,
    sp: 60_000,
    ssb: 36_732,          // ~$3,061/mo
    ssAge: 65,            // already claiming at retirement
    smile: false,         // isolate the funding question from the spending curve
    housingType: "none",
    otherIncomes: [
      { id: "pen", name: "Pension", annual: 44_668, startYear: 2000,
        endYear: 9999, growthMode: "pct", growthRate: 0, taxable: true },
    ],
  };

  test("fixed income + pension exceeds spending, so the portfolio funds only tax", () => {
    const r = buildWithdrawalWaterfall(GARY).smart.rows[0];
    const income = (r.fixedIncomeTotal || 0) + (r.otherIncome || 0);
    expect(income).toBeGreaterThan(r.spending);
    // Whatever leaves the portfolio must be small relative to income — it is the
    // tax bill on the pension/SS, not a spending shortfall.
    const drawn = r.fromCash + r.fromTaxable + r.fromPretax + r.fromRoth;
    expect(drawn).toBeLessThan(income * 0.35);
  });

  test("Roth is untouched while cheaper buckets remain — every year", () => {
    const rows = buildWithdrawalWaterfall(GARY).smart.rows;
    rows.forEach(r => {
      const cheaperLeft = r.cashEnd > 1 || r.taxableEnd > 1;
      // Roth is the last resort. If cash or taxable money is still on the books,
      // a Roth draw means the waterfall skipped a cheaper bucket.
      if (cheaperLeft) expect(r.fromRoth).toBe(0);
    });
  });

  test("no Roth draw at all in the first year for this profile", () => {
    expect(buildWithdrawalWaterfall(GARY).smart.rows[0].fromRoth).toBe(0);
  });
});
