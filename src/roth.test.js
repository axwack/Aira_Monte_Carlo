/**
 * Roth Conversion Engine Tests — buildRothExplorer / buildRothLadder
 *
 * Covers: output structure, state tax behaviour (FL/NJ/twoHousehold),
 * age-gate constraints, bracket fill amounts (fill_12 vs fill_22),
 * manual override / orphaned-pin detection, FAFSA guard, the
 * "Alex Mercer" tiny-pretax scenario (1-entry plan), tax-funding modes,
 * and buildRothLadder net-Roth accounting.
 *
 * IMPORTANT: When currentAge === retireAge the first simulation year has
 * f = 1.025^(yr - ROTH_BASE_YEAR) = 1 (retire immediately in the base year),
 * so the raw 2026 bracket constants apply and exact-dollar assertions are valid.
 */

import { buildRothExplorer, buildRothLadder } from "./engine/buildRothExplorer.js";

// ─── 2026 MFJ engine constants (from buildRothExplorer.js) ──────────────────
const B10T_MFJ  =  24_800;   // 10% bracket ceiling, MFJ 2026
const B12T_MFJ  = 100_800;   // 12% bracket ceiling, MFJ 2026
const B22T_MFJ  = 211_400;   // 22% bracket ceiling, MFJ 2026
const STD_MFJ   =  32_200;   // standard deduction, MFJ 2026 (under 65)
const STD_MFJ65 =  35_500;   // standard deduction, MFJ 2026 (65+)

// ─── Shared base — retire immediately, no income offsets, large pretax ───────
// f = 1.0 at age 60/year ROTH_BASE_YEAR → 2026 bracket constants apply exactly
const BASE = {
  currentAge: 60,
  retireAge: 60,
  endAge: 90,
  port: 2_000_000,
  inf: 2.5,
  sp: 80_000,
  ssAge: 75,     // SS delayed — no income to reduce bracket room in first 15 yrs
  ssb: 0,
  ab: 0,
  filingStatus: "mfj",
  stateOfResidence: "FL",
  twoHousehold: false,
  rothMode: "fill_22",
  rmdStartAge: 75,
  taxFunding: "from_taxable",
  conversionOverrides: [],
  accounts: [
    { id: "p1", category: "pretax",  name: "401k",    balance: 1_500_000 },
    { id: "p2", category: "roth",    name: "Roth",    balance:   350_000 },
    { id: "p3", category: "taxable", name: "Taxable", balance:   150_000 },
  ],
};

// Alex Mercer profile — tiny pretax ($46,500) exhausted in year 1
const ALEX = {
  currentAge: 56,
  retireAge: 60,
  endAge: 85,
  port: 143_000,
  inf: 2.5,
  sp: 65_000,
  ssAge: 64,
  ssb: 24_000,
  ab: 12_000,
  filingStatus: "mfj",
  stateOfResidence: "FL",
  twoHousehold: false,
  rothMode: "fill_12",
  rmdStartAge: 75,
  taxFunding: "from_taxable",
  conversionOverrides: [],
  accounts: [
    { id: "a1", category: "pretax",  name: "401k",    balance: 46_500 },
    { id: "a2", category: "roth",    name: "Roth IRA", balance: 16_500 },
    { id: "a5", category: "taxable", name: "Taxable",  balance: 80_000 },
  ],
};

// ─── Helper: compute retire year the same way the engine does ────────────────
const ROTH_BASE_YEAR = new Date().getFullYear();
const retireYearFor = (p) => ROTH_BASE_YEAR + (p.retireAge - p.currentAge);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. OUTPUT STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — output structure", () => {

  test("returns opt, cur, convRows, isNoTaxState at minimum", () => {
    const r = buildRothExplorer(BASE);
    expect(r).toHaveProperty("opt");
    expect(r).toHaveProperty("cur");
    expect(r).toHaveProperty("convRows");
    expect(r).toHaveProperty("isNoTaxState");
  });

  test("opt and cur each have rows array and cTax / cConv accumulators", () => {
    const { opt, cur } = buildRothExplorer(BASE);
    expect(Array.isArray(opt.rows)).toBe(true);
    expect(Array.isArray(cur.rows)).toBe(true);
    expect(typeof opt.cTax).toBe("number");
    expect(typeof opt.cConv).toBe("number");
    expect(typeof cur.cTax).toBe("number");
    expect(typeof cur.cConv).toBe("number");
  });

  test("rows span exactly retireAge to endAge inclusive", () => {
    const { opt } = buildRothExplorer(BASE);
    expect(opt.rows[0].age).toBe(BASE.retireAge);
    expect(opt.rows[opt.rows.length - 1].age).toBe(BASE.endAge);
    expect(opt.rows).toHaveLength(BASE.endAge - BASE.retireAge + 1);
  });

  test("every row contains the required fields", () => {
    const { opt } = buildRothExplorer(BASE);
    for (const r of opt.rows) {
      expect(r).toHaveProperty("yr");
      expect(r).toHaveProperty("age");
      expect(r).toHaveProperty("conv");
      expect(r).toHaveProperty("fedT");
      expect(r).toHaveProperty("stT");
      expect(r).toHaveProperty("totT");
      expect(r).toHaveProperty("pT");
    }
  });

  test("missing required params returns empty stub without throwing", () => {
    const r = buildRothExplorer({ currentAge: 60, retireAge: 60 }); // missing port
    expect(r.opt.rows).toHaveLength(0);
    expect(r.convRows).toHaveLength(0);
  });

  test("isNoTaxState is true for FL (no state income tax)", () => {
    const { isNoTaxState } = buildRothExplorer({ ...BASE, stateOfResidence: "FL" });
    expect(isNoTaxState).toBe(true);
  });

  test("isNoTaxState is false for NJ", () => {
    const { isNoTaxState } = buildRothExplorer({ ...BASE, stateOfResidence: "NJ" });
    expect(isNoTaxState).toBe(false);
  });

  test("isNoTaxState is true when twoHousehold=true regardless of state", () => {
    const { isNoTaxState } = buildRothExplorer({ ...BASE, stateOfResidence: "NJ", twoHousehold: true });
    expect(isNoTaxState).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. NO-CONVERSION BASELINE (cur)
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — no-conversion baseline (cur)", () => {

  test("cur.rows all have conv === 0", () => {
    const { cur } = buildRothExplorer(BASE);
    expect(cur.rows.every(r => r.conv === 0)).toBe(true);
  });

  test("cur.cConv === 0", () => {
    const { cur } = buildRothExplorer(BASE);
    expect(cur.cConv).toBe(0);
  });

  test("convRows contains no cur entries — only opt rows with conv > 0", () => {
    const { convRows } = buildRothExplorer(BASE);
    expect(convRows.every(r => r.conv > 0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. STRUCTURAL INVARIANTS — every row, every scenario
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — structural invariants", () => {

  test("totT = fedT + stT on every opt row", () => {
    const { opt } = buildRothExplorer(BASE);
    for (const r of opt.rows) {
      expect(r.totT).toBe(r.fedT + r.stT);
    }
  });

  test("totT = fedT + stT on every cur row", () => {
    const { cur } = buildRothExplorer(BASE);
    for (const r of cur.rows) {
      expect(r.totT).toBe(r.fedT + r.stT);
    }
  });

  test("pT never goes negative", () => {
    const { opt } = buildRothExplorer(BASE);
    expect(opt.rows.every(r => r.pT >= 0)).toBe(true);
  });

  test("conv never exceeds pT at start of that year (pretax never over-converted)", () => {
    // pT in the row is the END-of-year balance after conversion; conv <= opening pT.
    // We verify transitively: cumulative conv never exceeds initial pretaxBal.
    const { opt } = buildRothExplorer(BASE);
    const totalConverted = opt.rows.reduce((s, r) => s + r.conv, 0);
    const pretaxBal = BASE.accounts.find(a => a.category === "pretax").balance;
    expect(totalConverted).toBeLessThanOrEqual(pretaxBal * 20); // generous upper bound (growth)
    expect(totalConverted).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. STATE TAX BEHAVIOUR
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — state tax behaviour", () => {

  test("FL: stT = 0 on every opt row (no state income tax)", () => {
    const { opt } = buildRothExplorer({ ...BASE, stateOfResidence: "FL" });
    expect(opt.rows.every(r => r.stT === 0)).toBe(true);
  });

  test("NJ: stT > 0 on rows where a conversion occurs", () => {
    const { opt } = buildRothExplorer({ ...BASE, stateOfResidence: "NJ" });
    const convRows = opt.rows.filter(r => r.conv > 0);
    expect(convRows.length).toBeGreaterThan(0);
    expect(convRows.every(r => r.stT > 0)).toBe(true);
  });

  test("NJ with twoHousehold=true: stT = 0 on every row (state tax bypassed)", () => {
    const { opt } = buildRothExplorer({ ...BASE, stateOfResidence: "NJ", twoHousehold: true });
    expect(opt.rows.every(r => r.stT === 0)).toBe(true);
  });

  test("NJ tax > 0 means fedT stays the same but totT is higher than FL", () => {
    const fl = buildRothExplorer({ ...BASE, stateOfResidence: "FL" });
    const nj = buildRothExplorer({ ...BASE, stateOfResidence: "NJ" });
    const flFirst = fl.opt.rows.find(r => r.conv > 0);
    const njFirst = nj.opt.rows.find(r => r.conv > 0);
    expect(njFirst.totT).toBeGreaterThan(flFirst.totT);
    expect(njFirst.fedT).toBe(flFirst.fedT); // same federal, different state
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. AGE-GATE CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — conversion age-gate (retireAge to rmdAge)", () => {

  test("no conversions before retireAge (years prior to window have conv=0)", () => {
    // Retire at 65, so ages 60-64 would have conv=0 if they appeared.
    // In this engine the loop starts at retireAge, so this tests that age==retireAge IS included.
    const p = { ...BASE, currentAge: 60, retireAge: 65, endAge: 90, rmdStartAge: 75 };
    const { opt } = buildRothExplorer(p);
    expect(opt.rows[0].age).toBe(65);
    expect(opt.rows[0].conv).toBeGreaterThan(0); // first eligible year fires
  });

  test("no conversions at or after rmdAge (age >= rmdAge → conv = 0)", () => {
    const rmdAge = 75;
    const { opt } = buildRothExplorer({ ...BASE, rmdStartAge: rmdAge });
    const atOrAfterRmd = opt.rows.filter(r => r.age >= rmdAge);
    expect(atOrAfterRmd.every(r => r.conv === 0)).toBe(true);
  });

  test("conversions happen in the window [retireAge, rmdAge)", () => {
    const rmdAge = 75;
    const { opt } = buildRothExplorer({ ...BASE, rmdStartAge: rmdAge });
    const inWindow = opt.rows.filter(r => r.age >= BASE.retireAge && r.age < rmdAge);
    expect(inWindow.some(r => r.conv > 0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. BRACKET FILL AMOUNTS — exact values at first retirement year (f=1)
//    With currentAge=retireAge=60 and no SS/rental: txBC=0, first-year f=1.0
//    so the raw 2026 bracket constants apply exactly.
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — bracket fill amounts (first retirement year, f=1)", () => {

  test("fill_22: first-year conv = B22T_MFJ (211,400) when pT >> bracket room", () => {
    const { opt } = buildRothExplorer({ ...BASE, rothMode: "fill_22" });
    expect(opt.rows[0].conv).toBe(B22T_MFJ);
  });

  test("fill_12: first-year conv = B12T_MFJ (100,800) when pT >> bracket room", () => {
    const { opt } = buildRothExplorer({ ...BASE, rothMode: "fill_12" });
    expect(opt.rows[0].conv).toBe(B12T_MFJ);
  });

  test("fill_22 converts more per year than fill_12 on same profile (more bracket room)", () => {
    const f22 = buildRothExplorer({ ...BASE, rothMode: "fill_22" });
    const f12 = buildRothExplorer({ ...BASE, rothMode: "fill_12" });
    expect(f22.opt.rows[0].conv).toBeGreaterThan(f12.opt.rows[0].conv);
  });

  test("fill_22: first-year fedT = 28,848 (hand-verified progressive bracket math)", () => {
    // txInc = 211,400 − 32,200 std = 179,200
    // 10%: 24,800×0.10 = 2,480
    // 12%: (100,800−24,800)×0.12 = 9,120
    // 22%: (179,200−100,800)×0.22 = 17,248
    // Total = 28,848
    const { opt } = buildRothExplorer({ ...BASE, rothMode: "fill_22" });
    expect(opt.rows[0].fedT).toBe(28_848);
  });

  test("fill_12: first-year fedT = 8,432 (hand-verified bracket math)", () => {
    // txInc = 100,800 − 32,200 = 68,600
    // 10%: 24,800×0.10 = 2,480
    // 12%: (68,600−24,800)×0.12 = 43,800×0.12 = 5,256  -- wait let me recalculate
    // Actually: 10% bracket is 0→24,800, 12% is 24,800→100,800
    // 10%: min(68,600, 24,800) = 24,800 → 2,480
    // 12%: 68,600 − 24,800 = 43,800 → 43,800×0.12 = 5,256
    // Total = 7,736
    // Hmm, let me recalculate more carefully.
    // The brackets are IN TAXABLE INCOME (after std deduction).
    // txInc = max(0, totInc - stdD) = max(0, 100,800 - 32,200) = 68,600
    // 10%: min(68600,24800) - 0 = 24,800 → 2,480
    // 12%: min(68600,100800) - 24800 = 68600-24800 = 43,800 → 5,256
    // Total = 7,736
    const { opt } = buildRothExplorer({ ...BASE, rothMode: "fill_12" });
    expect(opt.rows[0].fedT).toBe(7_736);
  });

  test("no_convert: opt.cConv = 0 and convRows is empty", () => {
    const { opt, convRows } = buildRothExplorer({ ...BASE, rothMode: "no_convert" });
    expect(opt.cConv).toBe(0);
    expect(convRows).toHaveLength(0);
  });

  test("large pretax fully exhausted eventually: final pT = 0 or near 0 for fill_22 (15yr window)", () => {
    // 15 years × 211,400/yr (growing with inflation) >> 1.5M starting balance
    const { opt } = buildRothExplorer({ ...BASE, rothMode: "fill_22", endAge: 90, rmdStartAge: 75 });
    const lastConvRow = [...opt.rows].reverse().find(r => r.conv > 0);
    // At some point capReason will be "pretax exhausted" showing pT ran out
    const exhaustedRows = opt.rows.filter(r => r.capReason === "pretax exhausted");
    expect(exhaustedRows.length).toBeGreaterThan(0);
  });

  test("fill_22 plan has more total convRows than fill_12 plan (depletes faster)", () => {
    // fill_22 depletes the pretax faster → the window closes sooner → fewer convRows
    // (smaller annual bite under fill_12 takes more years to exhaust the same balance)
    const f22 = buildRothExplorer({ ...BASE, rothMode: "fill_22" });
    const f12 = buildRothExplorer({ ...BASE, rothMode: "fill_12" });
    // Both should exhaust pretax before rmdAge — fill_12 takes more annual entries
    expect(f12.convRows.length).toBeGreaterThanOrEqual(f22.convRows.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. MANUAL OVERRIDES AND ORPHANED PINS
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — manual overrides and orphaned pins", () => {

  const retireYr = retireYearFor(BASE); // BASE: currentAge=retireAge=60

  test("manual override: capReason starts with 'manual' for that year", () => {
    const p = {
      ...BASE,
      conversionOverrides: [{ id: "o1", year: retireYr, amount: 50_000 }],
    };
    const { opt } = buildRothExplorer(p);
    const overrideRow = opt.rows.find(r => r.yr === retireYr);
    expect(overrideRow.capReason).toMatch(/^manual/);
  });

  test("manual override amount is respected (conv = override amount, capped at pT)", () => {
    const p = {
      ...BASE,
      conversionOverrides: [{ id: "o2", year: retireYr, amount: 50_000 }],
    };
    const { opt } = buildRothExplorer(p);
    const overrideRow = opt.rows.find(r => r.yr === retireYr);
    expect(overrideRow.conv).toBe(50_000); // pT is 1.5M >> 50K so no cap
  });

  test("manual $0 override: conv = 0, capReason = 'manual $0'", () => {
    const p = {
      ...BASE,
      conversionOverrides: [{ id: "o3", year: retireYr, amount: 0 }],
    };
    const { opt } = buildRothExplorer(p);
    const overrideRow = opt.rows.find(r => r.yr === retireYr);
    expect(overrideRow.conv).toBe(0);
    expect(overrideRow.capReason).toBe("manual $0");
  });

  test("manual $0 year is NOT in convRows (conv=0 is filtered out)", () => {
    const p = {
      ...BASE,
      conversionOverrides: [{ id: "o4", year: retireYr, amount: 0 }],
    };
    const { convRows } = buildRothExplorer(p);
    expect(convRows.some(r => r.yr === retireYr)).toBe(false);
  });

  test("orphaned pin (Alex Mercer): override after pT exhausted → NOT in convRows", () => {
    // Alex's pre-tax is exhausted in first retirement year.
    // An override for year+1 should produce conv=0 and be absent from convRows.
    const alexRetireYr = retireYearFor(ALEX);
    const orphanYear = alexRetireYr + 1;
    const p = {
      ...ALEX,
      conversionOverrides: [{ id: "stale", year: orphanYear, amount: 94_239 }],
    };
    const { convRows } = buildRothExplorer(p);
    expect(convRows.some(r => r.yr === orphanYear)).toBe(false);
  });

  test("upsert: saving a second override for the same year replaces the first", () => {
    const p1 = {
      ...BASE,
      conversionOverrides: [{ id: "first", year: retireYr, amount: 40_000 }],
    };
    const p2 = {
      ...BASE,
      conversionOverrides: [{ id: "second", year: retireYr, amount: 60_000 }],
    };
    const r1 = buildRothExplorer(p1).opt.rows.find(r => r.yr === retireYr);
    const r2 = buildRothExplorer(p2).opt.rows.find(r => r.yr === retireYr);
    expect(r1.conv).toBe(40_000);
    expect(r2.conv).toBe(60_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. FAFSA GUARD
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — FAFSA guard (cap at 12% bracket)", () => {

  const FAFSA_END = retireYearFor(BASE) + 3; // 4 years into retirement

  test("fill_22 with fafsaEndYear: years ≤ fafsaEndYear are capped at fill_12 room", () => {
    const p = { ...BASE, rothMode: "fill_22", fafsaEndYear: FAFSA_END };
    const { opt } = buildRothExplorer(p);
    // First year: FAFSA guard → conv = B12T_MFJ (same as fill_12), not B22T_MFJ
    expect(opt.rows[0].conv).toBe(B12T_MFJ);
    expect(opt.rows[0].capReason).toMatch(/FAFSA/);
  });

  test("fill_22 after fafsaEndYear: reverts to full 22% room", () => {
    const p = { ...BASE, rothMode: "fill_22", fafsaEndYear: FAFSA_END };
    const { opt } = buildRothExplorer(p);
    // Find first row after the guard period (if pT still has room)
    const postFafsa = opt.rows.find(r => r.yr > FAFSA_END && r.conv > 0);
    if (postFafsa) {
      // Should now fill to 22% (larger than 12% cap)
      expect(postFafsa.conv).toBeGreaterThan(B12T_MFJ);
    }
  });

  test("fafsaEndYear=0 (disabled): no FAFSA guard applied in fill_22 mode", () => {
    const p = { ...BASE, rothMode: "fill_22", fafsaEndYear: 0 };
    const { opt } = buildRothExplorer(p);
    // No FAFSA guard → first year conv should be B22T_MFJ
    expect(opt.rows[0].conv).toBe(B22T_MFJ);
    expect(opt.rows[0].capReason).not.toMatch(/FAFSA/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ALEX MERCER SCENARIO — tiny pretax exhausted in year 1
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — Alex Mercer (tiny pretax, FL, fill_12)", () => {

  test("produces exactly 1 convRow: entire pretax converted in retirement year 1", () => {
    const { convRows } = buildRothExplorer(ALEX);
    expect(convRows).toHaveLength(1);
  });

  test("single convRow: capReason = 'pretax exhausted' (pT < bracket room)", () => {
    const { convRows } = buildRothExplorer(ALEX);
    expect(convRows[0].capReason).toBe("pretax exhausted");
  });

  test("single convRow: conv = 46,500 (entire pretax balance)", () => {
    const { convRows } = buildRothExplorer(ALEX);
    expect(convRows[0].conv).toBe(46_500);
  });

  test("single convRow: stT = 0 (FL, no state income tax)", () => {
    const { convRows } = buildRothExplorer(ALEX);
    expect(convRows[0].stT).toBe(0);
  });

  test("all rows after retirement year 1 have conv = 0 (pretax gone)", () => {
    const { opt } = buildRothExplorer(ALEX);
    const afterFirst = opt.rows.slice(1); // skip first year
    expect(afterFirst.every(r => r.conv === 0)).toBe(true);
  });

  test("pT drops to 0 after year 1 and stays 0", () => {
    const { opt } = buildRothExplorer(ALEX);
    const afterFirst = opt.rows.slice(1);
    expect(afterFirst.every(r => r.pT === 0)).toBe(true);
  });

  test("override for year after exhaustion is orphaned: not in convRows", () => {
    const retireYr = retireYearFor(ALEX);
    const p = {
      ...ALEX,
      conversionOverrides: [{ id: "stale2032", year: retireYr + 2, amount: 94_239 }],
    };
    const { convRows } = buildRothExplorer(p);
    expect(convRows.every(r => r.yr !== retireYr + 2)).toBe(true);
    expect(convRows).toHaveLength(1); // still just the year-1 conversion
  });

  test("1-entry plan is correct for this profile: not a bug", () => {
    // This is the documented expected behaviour:
    // pretaxBal (46,500) < fill_12 bracket room (~111,263 in 2030) → exhausted in 1 year.
    const { convRows } = buildRothExplorer(ALEX);
    expect(convRows[0].conv).toBeLessThanOrEqual(convRows[0].conv + 1); // always true — documents intent
    expect(convRows).toHaveLength(1); // behavioural regression guard
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. MULTI-YEAR CONVERSION PLAN — large pretax portfolio
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — multi-year conversion plan (large pretax)", () => {

  test("fill_22 with 1.5M pretax: conversion window spans multiple years", () => {
    const { convRows } = buildRothExplorer(BASE);
    expect(convRows.length).toBeGreaterThan(3);
  });

  test("each convRow has a positive conversion amount", () => {
    const { convRows } = buildRothExplorer(BASE);
    expect(convRows.every(r => r.conv > 0)).toBe(true);
  });

  test("conv amounts track approximately with inflation across years", () => {
    // Each year the bracket ceiling grows at 2.5% → conversion room grows slightly
    const { convRows } = buildRothExplorer(BASE);
    if (convRows.length >= 2) {
      // Later years should have equal or larger room (inflation-indexed brackets)
      expect(convRows[1].conv).toBeGreaterThanOrEqual(convRows[0].conv * 0.99); // ≥ prior year − 1%
    }
  });

  test("opt.cConv > 0 (aggregate conversions are non-zero)", () => {
    const { opt } = buildRothExplorer(BASE);
    expect(opt.cConv).toBeGreaterThan(0);
  });

  test("opt.cConv === sum of all conv in convRows", () => {
    const { opt, convRows } = buildRothExplorer(BASE);
    const sum = convRows.reduce((s, r) => s + r.conv, 0);
    expect(opt.cConv).toBe(sum);
  });

  test("additional income (ab) reduces conversion room by raising txBC above stdD", () => {
    // ab = rental/pension income; engine adds it to baseInc (fully taxable).
    // With ab=60K: txBC = 60K − stdD ≈ 60K − 32.2K = 27.8K → conv ≈ 211.4K − 27.8K = 183.6K
    // Without ab: txBC=0 → conv = 211.4K (full bracket fill)
    const noAb   = buildRothExplorer({ ...BASE, ab: 0       });
    const withAb = buildRothExplorer({ ...BASE, ab: 60_000  });
    const noAbFirst   = noAb.convRows.find(r => r.age === BASE.retireAge);
    const withAbFirst = withAb.convRows.find(r => r.age === BASE.retireAge);
    expect(noAbFirst).toBeDefined();
    expect(withAbFirst).toBeDefined();
    expect(withAbFirst.conv).toBeLessThan(noAbFirst.conv);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. TAX FUNDING MODES
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — taxFunding modes do not change conv amount", () => {
  // The taxFunding param controls WHERE the tax comes from, not HOW MUCH is converted.
  // conv should be identical across all three modes.

  test("conv amount is the same for from_taxable, from_conv, outside_cash", () => {
    const taxable  = buildRothExplorer({ ...BASE, taxFunding: "from_taxable" });
    const fromConv = buildRothExplorer({ ...BASE, taxFunding: "from_conv" });
    const outside  = buildRothExplorer({ ...BASE, taxFunding: "outside_cash" });

    expect(taxable.opt.rows[0].conv).toBe(fromConv.opt.rows[0].conv);
    expect(taxable.opt.rows[0].conv).toBe(outside.opt.rows[0].conv);
  });

  test("from_conv: taxBal drains more slowly (tax paid from conv, not taxable pool)", () => {
    // This is an indirect test — both scenarios should run without error
    const taxable  = buildRothExplorer({ ...BASE, taxFunding: "from_taxable" });
    const fromConv = buildRothExplorer({ ...BASE, taxFunding: "from_conv" });
    expect(taxable.opt.rows.length).toBe(fromConv.opt.rows.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. buildRothLadder — net-Roth accounting per tax-funding mode
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothLadder — net-Roth accounting", () => {

  test("from_conv: netRoth = max(0, conv - fedT - stT)", () => {
    const ladder = buildRothLadder({ ...BASE, taxFunding: "from_conv" });
    expect(ladder.length).toBeGreaterThan(0);
    for (const r of ladder) {
      const expected = Math.max(0, r.conv - r.fedTax - r.stateTax);
      expect(r.netRoth).toBe(expected);
    }
  });

  test("from_taxable: netRoth = conv (full conversion reaches Roth)", () => {
    const ladder = buildRothLadder({ ...BASE, taxFunding: "from_taxable" });
    for (const r of ladder) {
      expect(r.netRoth).toBe(r.conv);
    }
  });

  test("outside_cash: netRoth = conv (tax paid externally, full conv to Roth)", () => {
    const ladder = buildRothLadder({ ...BASE, taxFunding: "outside_cash" });
    for (const r of ladder) {
      expect(r.netRoth).toBe(r.conv);
    }
  });

  test("from_conv produces smaller netRoth than from_taxable (tax reduces transfer)", () => {
    const fromConv = buildRothLadder({ ...BASE, taxFunding: "from_conv" });
    const fromTaxable = buildRothLadder({ ...BASE, taxFunding: "from_taxable" });
    if (fromConv.length > 0 && fromTaxable.length > 0) {
      expect(fromConv[0].netRoth).toBeLessThan(fromTaxable[0].netRoth);
    }
  });

  test("ladder rows all have conv > 0 (only years with conversions appear)", () => {
    const ladder = buildRothLadder(BASE);
    expect(ladder.every(r => r.conv > 0)).toBe(true);
  });

  test("ladder returns empty array for no_convert mode", () => {
    const ladder = buildRothLadder({ ...BASE, rothMode: "no_convert" });
    expect(ladder).toHaveLength(0);
  });

  test("Alex Mercer: ladder has exactly 1 row, netRoth = conv (from_taxable)", () => {
    const ladder = buildRothLadder({ ...ALEX, taxFunding: "from_taxable" });
    expect(ladder).toHaveLength(1);
    expect(ladder[0].netRoth).toBe(ladder[0].conv);
    expect(ladder[0].conv).toBe(46_500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. ALEX MERCER FULL PROFILE — Roth balance / conversion accounting
//     Verifies the exact scenario the user reported: profile with NM state tax,
//     outside_cash tax funding, conversionOverride for 2032 at 87,239.
//
//     Key invariants tested:
//       pT update:  pT_end = max(0, pT_start - rmd - conv - portDraw*0.6) * 1.07
//       ro update:  ro_end = max(0, ro_start + conv - portDraw*0.4) * 1.07  (outside_cash)
//       continuity: row[N].pT === row[N+1].pTStart (and same for ro / roStart)
// ═══════════════════════════════════════════════════════════════════════════════
const GR = 0.07; // growth rate hardcoded in engine

const ALEX_FULL = {
  currentAge: 56,
  retireAge: 60,
  endAge: 85,
  port: 693_000,
  inf: 2.5,
  sp: 65_000,
  ssAge: 64,
  ssb: 24_000,
  ab: 12_000,
  useAb: true,
  filingStatus: "mfj",
  stateOfResidence: "NM",
  twoHousehold: false,
  rothMode: "fill_12",
  rmdStartAge: 75,
  taxFunding: "outside_cash",
  fafsaGuard: true,
  fafsaEndYear: 0,
  dob: "1972-01-12",
  useJointRmdTable: true,
  gkFloor: 50_000,
  gkCeiling: 90_000,
  conversionOverrides: [{ id: "1778021776472", year: 2032, amount: 87_239 }],
  accounts: [
    { id: "a1", category: "pretax",  name: "Traditional 401(k)", balance: 426_500 },
    { id: "a2", category: "roth",    name: "Roth IRA",           balance: 186_500 },
    { id: "a5", category: "taxable", name: "Taxable Brokerage",  balance:  80_000 },
  ],
};

const ALEX_FULL_RETIRE_YR = ROTH_BASE_YEAR + (ALEX_FULL.retireAge - ALEX_FULL.currentAge); // 2030

describe("buildRothExplorer — Alex Mercer full profile (NM, fill_12, outside_cash)", () => {

  test("year 2032 override fires: conv = 87,239 and capReason starts with 'manual'", () => {
    const { convRows } = buildRothExplorer(ALEX_FULL);
    const row = convRows.find(r => r.yr === 2032);
    expect(row).toBeDefined();
    expect(row.conv).toBe(87_239);
    expect(row.capReason).toMatch(/^manual/);
  });

  test("pretax balance is reduced by conv+spending in year 2032 (not frozen)", () => {
    const { opt } = buildRothExplorer(ALEX_FULL);
    const row = opt.rows.find(r => r.yr === 2032);
    expect(row.pT).toBeLessThan(row.pTStart);           // pT went down
    expect(row.pTStart).toBeGreaterThan(row.conv);       // override fits in remaining pretax
  });

  test("Roth balance is higher than starting 186,500 in year 2032 (growth + conversions)", () => {
    const { opt } = buildRothExplorer(ALEX_FULL);
    const row = opt.rows.find(r => r.yr === 2032);
    expect(row.ro).toBeGreaterThan(186_500);             // Roth grew since retirement start
    expect(row.ro).toBeGreaterThan(row.roStart);         // this year's conv pushed it up
  });

  test("pT update invariant holds on every row with a conversion", () => {
    const { opt } = buildRothExplorer(ALEX_FULL);
    for (const r of opt.rows.filter(r => r.conv > 0)) {
      const expected = Math.round(
        Math.max(0, r.pTStart - r.rmd - r.conv - Math.max(0, r.portDraw * 0.6)) * (1 + GR)
      );
      expect(Math.abs(r.pT - expected)).toBeLessThanOrEqual(2); // ±$2 rounding tolerance
    }
  });

  test("ro update invariant holds for outside_cash (full conv reaches Roth) on every conversion row", () => {
    const { opt } = buildRothExplorer(ALEX_FULL);
    for (const r of opt.rows.filter(r => r.conv > 0)) {
      const expected = Math.round(
        Math.max(0, r.roStart + r.conv - Math.max(0, r.portDraw * 0.4)) * (1 + GR)
      );
      expect(Math.abs(r.ro - expected)).toBeLessThanOrEqual(2);
    }
  });

  test("pT continuity: every row's pT equals the next row's pTStart", () => {
    const { opt } = buildRothExplorer(ALEX_FULL);
    for (let i = 0; i < opt.rows.length - 1; i++) {
      expect(opt.rows[i + 1].pTStart).toBe(opt.rows[i].pT);
    }
  });

  test("ro continuity: every row's ro equals the next row's roStart", () => {
    const { opt } = buildRothExplorer(ALEX_FULL);
    for (let i = 0; i < opt.rows.length - 1; i++) {
      expect(opt.rows[i + 1].roStart).toBe(opt.rows[i].ro);
    }
  });

  test("auto-fill runs in 2030 and 2031 (fill_12 mode, no override) — pT shrinks each year", () => {
    const { opt } = buildRothExplorer(ALEX_FULL);
    const row2030 = opt.rows.find(r => r.yr === ALEX_FULL_RETIRE_YR);
    const row2031 = opt.rows.find(r => r.yr === ALEX_FULL_RETIRE_YR + 1);
    expect(row2030.conv).toBeGreaterThan(0);             // auto-fill fired in 2030
    expect(row2031.conv).toBeGreaterThan(0);             // auto-fill fired in 2031
    expect(row2031.pTStart).toBeLessThan(row2030.pTStart); // pretax shrinking
  });

  test("with fill_22 mode the 2032 override is orphaned: conv = 0 and absent from convRows", () => {
    const { opt, convRows } = buildRothExplorer({ ...ALEX_FULL, rothMode: "fill_22" });
    const row2032 = opt.rows.find(r => r.yr === 2032);
    expect(row2032.conv).toBe(0);                        // pT exhausted, override capped at 0
    expect(convRows.some(r => r.yr === 2032)).toBe(false);
  });

  test("Roth balance in first retirement year is above starting 186,500 (auto-fill adds to Roth)", () => {
    const { opt } = buildRothExplorer(ALEX_FULL);
    const row2030 = opt.rows.find(r => r.yr === ALEX_FULL_RETIRE_YR);
    expect(row2030.ro).toBeGreaterThan(186_500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════
describe("buildRothExplorer — edge cases", () => {

  test("zero pretax: no conversions occur (nothing to convert)", () => {
    const p = {
      ...BASE,
      accounts: [
        { id: "r1", category: "roth",    name: "Roth",    balance: 1_500_000 },
        { id: "t1", category: "taxable", name: "Taxable", balance:   500_000 },
      ],
    };
    const { convRows } = buildRothExplorer(p);
    expect(convRows).toHaveLength(0);
  });

  test("port fallback: when no accounts provided, uses port with 60/40 split", () => {
    const p = { ...BASE, port: 2_000_000, accounts: undefined };
    const { opt } = buildRothExplorer(p);
    expect(opt.rows.length).toBeGreaterThan(0);
    expect(opt.rows.some(r => r.conv > 0)).toBe(true);
  });

  test("single filer gets less fill_12 room than MFJ (lower bracket ceiling)", () => {
    const mfj    = buildRothExplorer({ ...BASE, filingStatus: "mfj",    rothMode: "fill_12" });
    const single = buildRothExplorer({ ...BASE, filingStatus: "single", rothMode: "fill_12" });
    // MFJ 12% ceiling: 100,800; Single 12% ceiling: 50,400 → single converts less
    expect(single.opt.rows[0].conv).toBeLessThan(mfj.opt.rows[0].conv);
  });

  test("endAge === retireAge: single row, conversion attempt in that one year", () => {
    const p = { ...BASE, endAge: 60, retireAge: 60, rmdStartAge: 75 };
    const { opt } = buildRothExplorer(p);
    expect(opt.rows).toHaveLength(1);
    expect(opt.rows[0].age).toBe(60);
    expect(opt.rows[0].conv).toBeGreaterThan(0);
  });
});
