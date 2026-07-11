import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

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
