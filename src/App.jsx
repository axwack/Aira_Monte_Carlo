/* ============================================================
 *  AiRA Monte Carlo · App.jsx
 *  BUILD TAG : roth-fix-13 (prev: roth-fix-12)
 *  BUILD TIME: 2026-04-17 21:45 UTC
 *  NOTES     : Roth conversion plan diagnostics.
 *              - Each year's row now carries capReason (why
 *                the target bracket was capped) and a per-
 *                bracket breakdown of the conversion dollars.
 *              - Conversion Plan bar chart is now STACKED by
 *                federal bracket: you can see how much of the
 *                year's conversion lands in 10/12/22/24/32/
 *                35/37 bracket segments (explains why fill_22
 *                vs fill_24 can look identical when FAFSA /
 *                CSS / IRMAA-lookback / age<66 guards bind).
 *              - Added "Cap" column to the conversion plan
 *                table — orange text when a guard binds,
 *                grey when the chosen mode is the binding
 *                constraint. Hover for full reason.
 *  roth-fix-12: FanChart top margin so labels aren't clipped.
 *  roth-fix-11: FanChart RMD reference line is now dynamic.
 *              Was hardcoded at x={73}. Now threaded via
 *              rmdAge prop from the root (computed via
 *              getRmdStartAge from assumptions.dob +
 *              assumptions.rmdStartAge override). Passed to
 *              all three FanChart call sites (Portfolio fan
 *              tab, MCTab below the results, Stress scenario).
 *  roth-fix-10 notes below ──────────────────────────────────
 *              Removed hardcoded personal info across the app.
 *              - Golden-year banner: dropped "Danielle graduates"
 *                reference; now uses generic pre-SS framing.
 *              - BucketsTab: dollar targets now computed from
 *                params.port × pct; holdings replaced with
 *                asset-class descriptions; lock dates derive
 *                from retireAge.
 *              - MCTab Withdrawal Phase cards: SS amount/age,
 *                COLA, rental net, SS gap, healthcare age+prob,
 *                shock range, mortgage payoff all from params.
 *              - MCTab Market & Statistical cards: glide-path
 *                phases, horizon, rental reliability from params.
 *              - RothLadder Assumptions: SS start and Portfolio
 *                lines no longer fall back to my personal
 *                defaults; pre-tax % now computed from accounts.
 *  Branch history:
 *    roth-fix-10: strip hardcoded PII across MCTab, RothLadder,
 *                 BucketsTab, and Golden-year banner.
 *    roth-fix-9: Roth chart reacts to DOB / rmdStartAge edits.
 *    roth-fix-8: dynamic MCTab input cards (no hardcoded names).
 *    roth-fix-7: merge Full Name + hide-Next-on-step-6.
 *    roth-fix-6: Full Name input + filename sanitization.
 *    roth-fix-5: wizard-level save bar + version sync to 9.2.1.
 *    roth-fix-4: in-panel Save button + localStorage persistence.
 *    roth-fix-3: <Row> → <ARow> fix in AssumptionsPanel.
 *    roth-fix-2: build stamp header + console log.
 *    roth-fix-1 (ba1bb89): FED_BRACKETS_2026 bug + SECURE 2.0 RMD age.
 *  If the browser console shows an older BUILD TAG than this,
 *  you are running a stale build — rebuild with `npm run build`
 *  and hard-refresh the page (Ctrl/Cmd-Shift-R).
 * ============================================================ */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ComposedChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}

/** This application is  Aira - Freedom Financial Forecaster
 * Here is some reference information: 
 * IRS Publication 590‑B (PDF) – see Appendix B (pages 46‑60)  https://www.irs.gov/pub/irs-pdf/p590b.pdf
 * Capital Group's joint life table – excerpt for ages 55‑80 https://www.capitalgroup.com/individual/service-and-support/rmd/how-to-calculate/irs-joint-life-table.html

🔢 Please see the disclaimer below. This is an app to help you with retirement planning but not financial advice.
 * 
 */


/* ════ REFERENCE DATA ════ updated to 12/20/2026*/
const APP_VERSION = "9.2.1";
export const BUILD_TAG = "roth-fix-13";
export const BUILD_TIME = "2026-04-17 21:45 UTC";
if (typeof window !== "undefined" && !window.__AIRA_BUILD_LOGGED__) {
  window.__AIRA_BUILD_LOGGED__ = true;
  // eslint-disable-next-line no-console
  console.log(`[AiRA] build ${BUILD_TAG} · ${BUILD_TIME} · v${APP_VERSION}`);
}

const SP500 = [
  37.88, -11.91, -28.48, -47.07, -15.15, 46.59, -5.94, 41.37, 27.92, -38.59,
  25.21, -5.45, -15.29, -17.86, 12.43, 19.45, 13.8, 30.72, -11.87, 0, -0.65,
  10.26, 21.78, 16.46, 11.78, -6.62, 45.02, 26.4, 2.62, -14.31, 38.06, 8.48,
  -2.97, 23.13, -11.81, 18.89, 12.97, 9.06, -13.09, 20.09, 7.66, -11.36, 0.1,
  10.79, 15.63, -17.37, -29.72, 31.55, 19.15, -11.5, 1.06, 12.31, 25.77, -9.73,
  14.76, 17.27, 1.4, 26.33, 14.62, 2.03, 12.4, 27.25, -6.56, 26.31, 4.46, 7.06,
  -1.54, 34.11, 20.26, 31.01, 26.67, 19.53, -10.14, -13.04, -23.37, 26.38, 8.99,
  3, 13.62, 3.53, -38.49, 23.45, 12.78, 0, 13.41, 29.6, 11.39, -0.73, 9.54,
  19.42, -6.24, 28.88, 16.26, 26.89, -19.44, 24.23, 23.31, 16.39, 1.53,
].map((r) => Math.max(-30, Math.min(30, r)) / 100);

const BONDS = [
  15.6, 3.0, 1.4, 1.9, 2.7, 6.2, 32.6, 8.4, 8.4, 22.1, 15.1, 15.3, 2.7, 14.5,
  8.9, 16.0, 7.4, 9.8, -2.9, 18.5, 3.6, 9.7, 8.7, -0.8, 11.6, 8.4, 10.3, 4.1,
  4.3, 2.4, 4.3, 7.0, 5.2, 5.9, 6.5, 7.8, 4.2, -2.0, 6.0, 0.5, 2.6, 3.5, 0.0,
  8.7, -1.5, 7.5, -13.0, 5.5, 1.7, 7.1,
].map((r) => Math.max(-15, Math.min(20, r)) / 100);

const INFL = [
  3.4, 2.8, 1.6, 2.3, 2.7, 3.4, 3.2, 2.8, 3.8, -0.4, 1.6, 3.2, 2.1, 1.5, 1.6,
  0.1, 1.3, 2.1, 2.4, 1.8, 1.2, 4.7, 8.0, 4.1, 2.9,
].map((r) => Math.max(0.5, Math.min(7.0, r)) / 100);

const SEQ_2000_2012 = [
  -0.091, -0.119, -0.221, 0.287, 0.109, 0.048, 0.158, 0.055, -0.37, 0.265,
  0.151, 0.021, 0.16,
];

const CALIB = {
  phase1Mean: 9.68,
  phase1Std: 13.65,
  phase2Mean: 8.93,
  phase2Std: 10.35,
};

const JOINT_RMD_TABLE = {
  // Format: [ownerAge]: { [spouseAge]: divisor }
  73: { 64: 25.3 },
  74: { 65: 24.6 },
  75: { 66: 24.0 },
  76: { 67: 23.4 },
  77: { 68: 22.8 },
  78: { 69: 22.3 },
  79: { 70: 21.8 },
  80: { 71: 21.3 },
  81: { 72: 20.9 },
  82: { 73: 20.5 },
  83: { 74: 20.1 },
  84: { 75: 19.7 },
  85: { 76: 19.3 },
  86: { 77: 19.0 },
  87: { 78: 18.7 },
  88: { 79: 18.4 },
  89: { 80: 18.1 },
  90: { 81: 17.8 },
};

const STATE_TAX_RATES = {
  "AL": 0.050, "AK": 0, "AZ": 0.025, "AR": 0.039, "CA": 0.133,
  "CO": 0.044, "CT": 0.069, "DE": 0.066, "FL": 0, "GA": 0.055,
  "HI": 0.110, "ID": 0.058, "IL": 0.0495, "IN": 0.0305, "IA": 0.06,
  "KS": 0.057, "KY": 0.04, "LA": 0.0425, "ME": 0.0715, "MD": 0.0575,
  "MA": 0.09, "MI": 0.0425, "MN": 0.0985, "MS": 0.05, "MO": 0.048,
  "MT": 0.059, "NE": 0.0584, "NV": 0, "NH": 0, "NJ": 0.1075,
  "NM": 0.059, "NY": 0.109, "NC": 0.045, "ND": 0.025, "OH": 0.035,
  "OK": 0.0475, "OR": 0.099, "PA": 0.0307, "RI": 0.0599, "SC": 0.064,
  "SD": 0, "TN": 0, "TX": 0, "UT": 0.0465, "VT": 0.0875,
  "VA": 0.0575, "WA": 0, "WV": 0.0512, "WI": 0.0753, "WY": 0,
};

/* ════ PROFILES ════ */
/* Personal data lives in AiRA_Profile.json — never hardcoded here */
/* Use Export button to save your data. Use Import to load it back. */

const BLANK_PROFILE = {
  label: "My Plan",
  name: "",
  dob: "",
  stateOfResidence: "NJ",
  currentAge: 50,
  retireAge: 60,
  endAge: 85,
  port: 1_000_000,
  contrib: 20_000,
  inf: 2.5,
  sp: 72_000,
  spSpendOutofState: 48_000,
  spInStateSpend: 0,
  ssAge: 67,
  ssb: 24_000,
  ab: 0,
  useAb: false,
  smile: true,
  tax: true,
  real: true,
  twoHousehold: false,
  employerStartDate: "2026-03-02",
  gkFloor: 48_000,
  gkFloorSpendOutofState: 48_000,
  gkTarget: 72_000,
  gkCeiling: 100_000,
  // Mortgage
  mortBalance: 0,
  mortRate: 6.5,
  mortStart: "2020-01",
  mortTerm: 30,
  mortExtra: 0,
  mortPI: 0,
  // Real estate (not in liquid portfolio)
  properties: [
    { id:"p1", label:"Primary Residence", value:0, mortgage:0, income:0 },
    { id:"p2", label:"Property 2",        value:0, mortgage:0, income:0 },
  ],
  // NEW:
  filingStatus: "mfj",          // "mfj" | "single" — drives federal brackets & std deduction
  reGrowthRate: 3.0,            // annual home/RE appreciation rate (%)
  useJointRmdTable: false,      // default: use Uniform Lifetime table
  cashRealReturn: 1.0,          // default real return for cash/HYSA (percent)
  // Expense model
  housingType: "own",           // "own" | "rent" | "none"
  annualRent: 0,                // annual rent if housingType === "rent" (today's dollars)
  carveouts: [],                // [{id, label, annual, endYear}] fixed obligations (car, HOA, etc.)
  rothConversionTarget: "off",  // "off" | "12" | "22" | "24" | "irmaa"
  // Account breakdown (feeds port total)
  accounts: [
    { id: "1", category: "pretax", name: "401(k)", balance: 0 },
    { id: "2", category: "roth", name: "Roth IRA", balance: 0 },
    { id: "3", category: "taxable", name: "Brokerage", balance: 0 },
    { id: "4", category: "hsa", name: "HSA", balance: 0 },
    { id: "5", category: "cash", name: "Cash/Savings", balance: 0 },
  ],
  // MC assumptions
  abReliability: 80,
  abGrowth: 3.0,
  ssCola: 2.4,
  preRetireEq: 91,
  postRetireEq: 70,
  hcShockAge: 72,
  hcProb: 3.5,
  hcMin: 70_000,
  hcMax: 130_000,
};

const DEMO_PROFILE = {
  label: "Demo Mode",
  name: "Alex",
  dob: "1974-06-15",
  // NEW:
  filingStatus: "mfj",          // "mfj" | "single"
  reGrowthRate: 3.0,            // annual home/RE appreciation rate (%)
  useJointRmdTable: false,      // default: use Uniform Lifetime table
  cashRealReturn: 1.0,          // default real return for cash/HYSA (percent)
  housingType: "own",
  annualRent: 0,
  carveouts: [],
  rothConversionTarget: "off",
  currentAge: 51,
  retireAge: 62,
  stateOfResidence: "NJ",
  endAge: 88,
  port: 1_000_000,
  contrib: 24_000,
  inf: 2.5,
  sp: 72_000,
  spSpendOutofState: 72_000,
  spInStateSpend: 0,
  ssAge: 67,
  ssb: 28_000,
  employerStartDate: "2026-03-02",
  ab: 0,
  useAb: false,
  smile: true,
  tax: true,
  real: true,
  twoHousehold: false,
  gkFloor: 48_000,
  gkFloorSpendOutofState: 48_000,
  gkTarget: 72_000,
  gkCeiling: 100_000,
  mortBalance: 200_000,
  mortRate: 7.0,
  mortStart: "2022-01",
  mortTerm: 30,
  mortExtra: 0,
  mortPI: 1330,
  properties: [
    { id:"p1", label:"Primary Residence", value:600_000, mortgage:200_000, income:0 },
    { id:"p2", label:"Rental Unit",        value:0,       mortgage:0,       income:0 },
  ],
  accounts: [
    { id: "d1", category: "pretax", name: "Solo 401k", balance: 750_000 },
    { id: "d2", category: "roth", name: "Roth IRA", balance: 150_000 },
    { id: "d3", category: "taxable", name: "Taxable", balance: 50_000 },
    { id: "d4", category: "hsa", name: "HSA", balance: 50_000 },
    { id: "d5", category: "cash", name: "Savings", balance: 0 },
  ],
  abReliability: 80,
  abGrowth: 3.0,
  ssCola: 2.4,
  preRetireEq: 91,
  postRetireEq: 70,
  hcShockAge: 72,
  hcProb: 3.5,
  hcMin: 70_000,
  hcMax: 130_000,
}

const PROFILES = { user: BLANK_PROFILE, demo: DEMO_PROFILE };
const ANALOGUES = [
  {
    min: 95,
    text: "As reliable as a commercial flight landing safely",
    emoji: "✈️",
    color: "#10b981",
  },
  {
    min: 90,
    text: "Odds a 50-year-old reaches age 65 — F-You Money territory",
    emoji: "💪",
    color: "#34d399",
  },
  {
    min: 85,
    text: "Like calling heads correctly three times in a row",
    emoji: "🪙",
    color: "#6ee7b7",
  },
  {
    min: 80,
    text: "Similar to a college freshman graduating in 4 years",
    emoji: "🎓",
    color: "#fbbf24",
  },
  {
    min: 75,
    text: "About the odds an NBA player makes a free throw",
    emoji: "🏀",
    color: "#fbbf24",
  },
  {
    min: 70,
    text: "Odds a new business survives its first two years",
    emoji: "🏢",
    color: "#f97316",
  },
  {
    min: 0,
    text: "Slightly better than a coin flip — plan needs work",
    emoji: "😰",
    color: "#ef4444",
  },
];

/* ════ MATH CORE ════ */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalDraw(mean, vol, rand) {
  const u = Math.max(rand(), 1e-10);
  return (
    mean + vol * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
  );
}
function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function bootstrapDraw(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}
function portReturn(age, rand, preRetireEq, postRetireEq) {
  const eqW = age < 62 ? (preRetireEq || 91) / 100 : (postRetireEq || 70) / 100;
  return (
    eqW * bootstrapDraw(SP500, rand) + (1 - eqW) * bootstrapDraw(BONDS, rand)
  );
}
function smileMult(age) {
  if (age < 65) return 1.15;
  if (age < 70) return 1.05;
  if (age < 75) return 0.95;
  if (age < 80) return 0.85;
  if (age < 85) return 0.8;
  return 0.9;
}
function taxDragRate(age, ssAge, useTax, filingStatus = "mfj") {
  if (!useTax) return 0;
  // Single filers hit higher brackets sooner (halved thresholds, halved deduction)
  const single = filingStatus === "single";
  if (age < ssAge) return single ? 0.092 : 0.072;
  if (age < 73)    return single ? 0.115 : 0.090;
  return                  single ? 0.162 : 0.132;
}
function guytonKlingerWithdrawal(
  portfolioValue,
  initialWR,
  lastWithdrawal,
  lastReturn,
  inflationRate,
  floor,
  ceiling
) {
  if (portfolioValue <= 0) return floor;
  let w =
    lastReturn >= 0 ? lastWithdrawal * (1 + inflationRate) : lastWithdrawal;
  const currentWR = w / portfolioValue;
  if (currentWR <= initialWR * 0.8) w *= 1.1;
  else if (currentWR >= initialWR * 1.2) w *= 0.9;
  return Math.max(floor, Math.min(ceiling, w));
}
function calcYearTax(
  age,
  yr,
  withdrawalAmount,
  ssIncome,
  RentalIncome,
  rmdIncome,
  conversionAmount,
  isTwoHousehold,
  inflationRate,
  filingStatus = "mfj"
) {
  const isMFJ = filingStatus !== "single";
  const taxableSS = ssIncome * 0.85;
  const otherIncome =
    (withdrawalAmount || 0) +
    (RentalIncome || 0) +
    (rmdIncome || 0) +
    (conversionAmount || 0);
  const totalIncome = taxableSS + otherIncome;
  const inflationFactor = Math.pow(1 + inflationRate, Math.max(0, yr - 2026));
  // Standard deduction: MFJ $32,200 / Single $16,100 (2026 est.), inflation-adjusted forward
  let stdDeduction = Math.round((isMFJ ? 32200 : 16100) * inflationFactor);
  // Additional deduction for age 65+: MFJ adds $3,300, Single adds $1,650
  if (age >= 65) stdDeduction += Math.round((isMFJ ? 3300 : 1650) * inflationFactor);
  const taxableIncome = Math.max(0, totalIncome - stdDeduction);
  // Select federal brackets by filing status
  const rawBrackets = isMFJ ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE;
  const fedBrackets = idxB(rawBrackets, inflationFactor);
  const fedTax = progTax(taxableIncome, fedBrackets);
  let stateTax = 0;

  if (!isTwoHousehold) {
    const njBrackets = idxB(NJ_BRACKETS_2026, inflationFactor);
    stateTax = progTax(taxableIncome, njBrackets);
  }
      const magi = totalIncome;
      const irmaa = age >= 65 ? irmaaCost(magi, yr) : 0;
      const totalTax = fedTax + stateTax + irmaa;
      const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0;
      let marginalBracket = 0;

  for (const b of fedBrackets) {
    if (taxableIncome > b.lo) marginalBracket = b.rate;
    else break;
  }
  return { fedTax, stateTax, irmaa, totalTax, effectiveRate, marginalBracket, taxableIncome };
}

/**
 * Returns the TAXABLE INCOME ceiling (after std deduction) for a given bracket target.
 * Values are 2026 estimates, inflated by inflFactor for future years.
 */
function getBracketCeiling(target, filingStatus, inflFactor) {
  const mfj = filingStatus !== "single";
  const ceilings = mfj
    ? { "12": 100_800, "22": 211_400, "24": 403_550, "irmaa": 212_000 }
    : { "12":  50_400, "22": 105_700, "24": 201_800, "irmaa": 106_000 };
  return Math.round((ceilings[target] ?? ceilings["22"]) * inflFactor);
}

function runMC(p, endAge, N = 3000, seed = 42, useGK = true) {
  const rand = mulberry32(seed);
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = endAge - p.retireAge;
  const results = [];
  const gkFloor = p.gkFloor || 48_000;
  const gkCeiling = p.gkCeiling || 115_000;
  const withdrawalStrategy = p.withdrawalStrategy || "gk";
  
  // User settings for cash return and RMD table
  const cashRealReturn = (p.cashRealReturn ?? 1.0) / 100;
  const useJointTable = p.useJointRmdTable ?? false;

  // Pre-compute annual mortgage P&I obligation (constant across all paths)
  let mortAnnualPI = 0, mortPayoffYr = 0;
  if (p.mortBalance > 0) {
    const ms = mortgageSchedule(p.mortBalance, p.mortRate || 6.5, p.mortStart || "2020-01", p.mortTerm || 30, p.mortExtra || 0);
    mortAnnualPI = ms.pmt * 12;
    mortPayoffYr = ms.payoffYr;
  }

  // Simplified Joint & Last Survivor table (assumes spouse is 10 years younger)
  const JOINT_RMD_TABLE = {
    73: 25.3, 74: 24.6, 75: 24.0, 76: 23.4, 77: 22.8,
    78: 22.3, 79: 21.8, 80: 21.3, 81: 20.9, 82: 20.5,
    83: 20.1, 84: 19.7, 85: 19.3, 86: 19.0, 87: 18.7,
    88: 18.4, 89: 18.1, 90: 17.8,
  };
  const UNIFORM_TABLE = RMD_DIV;

  for (let i = 0; i < N; i++) {
    // Initialize buckets from p.accounts for this path
    let pretax = 0, roth = 0, taxable = 0, cash = 0;
    for (const acct of (p.accounts || [])) {
      const bal = acct.balance || 0;
      if (acct.category === "pretax") pretax += bal;
      else if (acct.category === "roth") roth += bal;
      else if (acct.category === "taxable") taxable += bal;
      else if (acct.category === "cash") cash += bal;
    }
    let totalPort = pretax + roth + taxable + cash;

    // Accumulation phase
    for (let y = 0; y < accYrs; y++) {
      const ret = portReturn(p.currentAge + y, rand, p.preRetireEq, p.postRetireEq);
      pretax   = Math.max(0, pretax   * (1 + ret));
      roth     = Math.max(0, roth     * (1 + ret));
      taxable  = Math.max(0, taxable  * (1 + ret));
      cash     = Math.max(0, cash     * (1 + ret));
      pretax += p.contrib;
      totalPort = pretax + roth + taxable + cash;
    }

    const portAtRetire = Math.round(totalPort);

    const gg = clip(normalDraw(0.03, 0.005, rand), 0.005, 0.08);
    const sg = clip(normalDraw(0.015, 0.005, rand), 0.002, 0.05);
    const ng = clip(normalDraw(0.025, 0.005, rand), 0.005, 0.08);

    const path = [portAtRetire];
    let survived = true, exhaustAge = null;
    let sp = p.sp;
    let lastReturn = 0;
    let startingPort = portAtRetire; // for Kitces ratcheting

    const ss0 = p.retireAge >= p.ssAge ? p.ssb : 0;
    const ab0 = p.useAb ? p.ab : 0;
    const initDraw = Math.max(0, p.sp - ss0 - ab0) * (1 + taxDragRate(p.retireAge, p.ssAge, p.tax, p.filingStatus));
    const initWR = portAtRetire > 0 ? initDraw / portAtRetire : 0.04;

    for (let y = 0; y < retYrs; y++) {
      const age = p.retireAge + y;
      const r = portReturn(age, rand, p.preRetireEq, p.postRetireEq);
      const inflY = bootstrapDraw(INFL, rand);

      const cumInfl = Math.pow(1 + (p.inf || 2.5) / 100, y);
      const adjFloor = gkFloor * cumInfl;
      const adjCeiling = gkCeiling * cumInfl;
      
      // ========== WITHDRAWAL STRATEGY ==========
      if (y === 0) {
        // First year: use target spend (p.sp)
      } else {
        if (withdrawalStrategy === "gk") {
          sp = guytonKlingerWithdrawal(totalPort, initWR, sp, lastReturn, inflY, adjFloor, adjCeiling);
        }
        else if (withdrawalStrategy === "fixed") {
          const fixedRate = p.fixedWithdrawalRate ?? 0.04;
          let newSp = totalPort * fixedRate;
          sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
        }
        else if (withdrawalStrategy === "vanguard") {
          const initialRate = p.vanguardInitialRate ?? 0.04;
          const cap = p.vanguardCap ?? 0.05;
          const floorRate = p.vanguardFloor ?? -0.025;
          
          if (y === 1) {
            const pctOfPort = totalPort * initialRate;
            const inflationAdj = sp * (1 + inflY);
            let candidate = (inflationAdj + pctOfPort) / 2;
            let change = (candidate / sp) - 1;
            let cappedChange = Math.max(floorRate, Math.min(cap, change));
            sp = sp * (1 + cappedChange);
          } else {
            const pctOfPort = totalPort * initialRate;
            const dynamic = sp * (1 + inflY) * (1 + (r - inflY) * 0.5);
            let candidate = dynamic;
            let change = (candidate / sp) - 1;
            let cappedChange = Math.max(floorRate, Math.min(cap, change));
            sp = sp * (1 + cappedChange);
          }
          sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
        }
        else if (withdrawalStrategy === "risk") {
          const safeWR = p.safeWithdrawalRate ?? 0.04;
          const currentWR = sp / totalPort;
          if (currentWR > safeWR * 1.2) {
            sp = sp * 0.9;
          } else if (currentWR < safeWR * 0.8) {
            sp = sp * 1.1;
          }
          sp = sp * (1 + inflY);
          sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
        }
        else if (withdrawalStrategy === "kitces") {
          if (totalPort >= startingPort * 1.5) {
            sp = sp * 1.10;
            startingPort = totalPort;
          }
          sp = sp * (1 + inflY);
          sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
        }
        else if (withdrawalStrategy === "vpw") {
          // Variable Percentage Withdrawal
          const eqPct = age < 62 ? (p.preRetireEq || 91) : (p.postRetireEq || 70);
          const r = 0.0376; // real return assumption for 60/40 (3.76%)
          const maxAge = 100;
          const n = Math.max(1, maxAge - age);
          // VPW formula: rate = 1 / (1 + ((1 - (1+r)^(-n+1)) / r))   (capped at 10%)
          let rate;
          if (r === 0) {
            rate = 1 / n;
          } else {
            const term = (1 - Math.pow(1 + r, -n + 1)) / r;
            rate = 1 / (1 + term);
          }
          rate = Math.min(0.10, rate);
          let newSp = totalPort * rate;
          sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
        }
        else if (withdrawalStrategy === "cape") {
          // CAPE-based withdrawal
          const a = 0.015;   // base rate 1.5%
          const b = 0.5;     // weight
          const cape = 20;   // Shiller CAPE (historical average) – could be user param
          const capeYield = 1 / cape;
          const rate = a + b * capeYield;
          let newSp = totalPort * rate;
          sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
        }
        else if (withdrawalStrategy === "endowment") {
          // Yale Endowment model with 0.7 smoothing
          const smoothing = 0.7;
          const spendRate = 0.05; // 5% spending rate
          if (y === 1) {
            // First year: just percentage of portfolio
            sp = totalPort * spendRate;
          } else {
            const inflationAdj = sp * (1 + inflY);
            const pctOfPort = totalPort * spendRate;
            sp = smoothing * inflationAdj + (1 - smoothing) * pctOfPort;
          }
          sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
        }
        else if (withdrawalStrategy === "one_n") {
          // 1/N rule: divide remaining portfolio by years left (to endAge)
          const yearsLeft = Math.max(1, p.endAge - age);
          let newSp = totalPort / yearsLeft;
          sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
        }
        else if (withdrawalStrategy === "ninety_five_rule") {
          // 95% rule: spending can only decrease to 95% of last year, otherwise inflate
          if (y === 1) {
            // First year: target spend (p.sp)
            sp = p.sp;
          } else {
            const inflated = sp * (1 + inflY);
            const floor95 = sp * 0.95;
            sp = Math.max(floor95, inflated);
          }
          sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
        }


      }
      lastReturn = r;

      // Income from SS and rental/AB
      const ss = age >= p.ssAge ? p.ssb * Math.pow(1 + (p.ssCola || 2.4)/100, y) : 0;
      const abReliable = rand() < (p.abReliability || 80)/100;
      const ab = p.useAb && abReliable ? p.ab * Math.pow(1 + (p.abGrowth || 3)/100, Math.min(y, 20)) : 0;

      // Housing cost (own = mortgage P&I while active, rent = inflation-adjusted rent, none = 0)
      const calYear = 2026 + (age - p.currentAge);
      const housingType = p.housingType || "own";
      let housingCost = 0;
      if (housingType === "own") {
        housingCost = mortAnnualPI > 0 && calYear < mortPayoffYr ? mortAnnualPI : 0;
      } else if (housingType === "rent") {
        housingCost = Math.round((p.annualRent || 0) * inflY);
      }

      // Active fixed carveouts (car loans, HOA, etc.) — inflation-adjusted
      const carveoutCost = (p.carveouts || []).reduce((sum, c) => {
        return sum + (calYear <= (c.endYear || 9999) ? Math.round((c.annual || 0) * inflY) : 0);
      }, 0);

      const need = Math.max(0, sp - ss - ab) + housingCost + carveoutCost;

      // RMD calculation
      let rmd = 0;
      if (age >= 73 && pretax > 0) {
        let divisor;
        if (useJointTable && JOINT_RMD_TABLE[age]) {
          divisor = JOINT_RMD_TABLE[age];
        } else {
          divisor = UNIFORM_TABLE[age] || 15.0;
        }
        rmd = Math.round(pretax / divisor);
      }
      const totalNeed = need + rmd;

      // Tax calculation
      const yr = 2026 + (age - p.currentAge);
      const filingStatus = p.filingStatus || "mfj";
      const taxResult = calcYearTax(age, yr, totalNeed, ss, ab, rmd, 0, p.twoHousehold || false, inflY, filingStatus);
      const totalTax = taxResult.totalTax;
      const totalWithdrawalNeeded = totalNeed + totalTax;

      // Withdraw from buckets in order: cash → taxable → pretax → roth
      let remaining = totalWithdrawalNeeded;
      let fromCash = Math.min(remaining, cash);
      remaining -= fromCash;
      let fromTaxable = Math.min(remaining, taxable);
      remaining -= fromTaxable;
      let fromPretax = Math.min(remaining, pretax);
      remaining -= fromPretax;
      let fromRoth = Math.min(remaining, roth);
      remaining -= fromRoth;

      if (remaining > 0.01) {
        survived = false;
        exhaustAge = age;
        break;
      }

      // Update bucket balances
      cash    = Math.max(0, cash    - fromCash);
      taxable = Math.max(0, taxable - fromTaxable);
      pretax  = Math.max(0, pretax  - fromPretax - rmd);
      roth    = Math.max(0, roth    - fromRoth);

      // Bracket-fill Roth conversion (after spending withdrawals, before growth)
      if (p.rothConversionTarget && p.rothConversionTarget !== "off" && pretax > 1000) {
        const inflFactor = Math.pow(1 + inflY, Math.max(0, yr - 2026));
        const bracketCeiling = getBracketCeiling(p.rothConversionTarget, filingStatus, inflFactor);
        // Room = ceiling minus current taxable income (from spending + RMD)
        const room = Math.max(0, bracketCeiling - (taxResult.taxableIncome || 0));
        if (room > 500) {
          // Convert up to room, capped at 40% of pretax to avoid over-converting
          const convAmt = Math.min(room, pretax * 0.4);
          // Tax on conversion at the marginal rate, funded from pretax
          const convTax = Math.round(convAmt * (taxResult.marginalBracket || 0.22));
          const totalCost = convAmt + convTax;
          if (pretax >= totalCost) {
            pretax -= totalCost;
            roth   += convAmt;
          }
        }
      }

      // Apply growth
      cash    = Math.max(0, cash    * (1 + cashRealReturn));
      pretax  = Math.max(0, pretax  * (1 + r));
      roth    = Math.max(0, roth    * (1 + r));
      taxable = Math.max(0, taxable * (1 + r));

      totalPort = pretax + roth + taxable + cash;
      path.push(Math.round(totalPort));

      if (totalPort <= 0 && survived) {
        survived = false;
        exhaustAge = age;
      }
    }
    results.push({ path, survived, exhaustAge, portAtRetire });
  }

  // Aggregate results
  const pL = results[0].path.length;
  const pcts = [];
  for (let t = 0; t < pL; t++) {
    const vals = results.map(r => r.path[t]).sort((a, b) => a - b);
    const q = pct => vals[Math.floor(pct * (vals.length - 1))];
    pcts.push({
      age: p.retireAge + t,
      p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9),
    });
  }
  const nS = results.filter(r => r.survived).length;
  const rV = results.map(r => r.portAtRetire).sort((a, b) => a - b);
  const medR = rV[Math.floor(rV.length / 2)];
  const tV = results.map(r => r.path[r.path.length - 1]).sort((a, b) => a - b);
  const qt = p => tV[Math.floor(p * (tV.length - 1))];
  return {
    rate: nS / N,
    pcts,
    medR,
    term: { p10: qt(0.1), p25: qt(0.25), p50: qt(0.5), p75: qt(0.75), p90: qt(0.9) },
    N,
  };
}
function runStress(p, endAge, N = 2000, seed = 99) {
  const rand = mulberry32(seed);
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = endAge - p.retireAge;
  const results = [];
  const gkFloor = p.gkFloor || 48_000;
  const gkCeiling = p.gkCeiling || 115_000;

  for (let i = 0; i < N; i++) {
    let port = p.port;
    for (let y = 0; y < accYrs; y++) {
      port = port * (1 + portReturn(p.currentAge + y, rand, p.preRetireEq, p.postRetireEq)) + p.contrib;
    }
    const portAtRetire = Math.round(port);
    const path = [portAtRetire];
    let survived = true, sp = p.sp;
    let lastReturn = 0;

    const ss0 = p.retireAge >= p.ssAge ? p.ssb : 0;
    const ab0 = p.useAb ? p.ab : 0;
    const initDraw = Math.max(0, p.sp - ss0 - ab0) * (1 + taxDragRate(p.retireAge, p.ssAge, p.tax, p.filingStatus));
    const initWR = portAtRetire > 0 ? initDraw / portAtRetire : 0.04;

    for (let y = 0; y < retYrs; y++) {
      const age = p.retireAge + y;
      const eqW = age < 62 ? (p.preRetireEq || 91) / 100 : (p.postRetireEq || 70) / 100;
      const eq = y < SEQ_2000_2012.length ? SEQ_2000_2012[y] : bootstrapDraw(SP500, rand);
      const r = eqW * eq + (1 - eqW) * bootstrapDraw(BONDS, rand);
      const inflY = bootstrapDraw(INFL, rand);

      const cumInfl = Math.pow(1 + (p.inf || 2.5) / 100, y);
      const adjFloor = gkFloor * cumInfl;
      const adjCeiling = gkCeiling * cumInfl;
      if (y > 0 && port > 0) {
        sp = guytonKlingerWithdrawal(port, initWR, sp, lastReturn, inflY, adjFloor, adjCeiling);
      }
      lastReturn = r;

      const ss = age >= p.ssAge ? p.ssb * Math.pow(1.024, y) : 0;
      const ab = p.useAb && rand() < (p.abReliability || 80) / 100
        ? p.ab * Math.pow(1 + (p.abGrowth || 3) / 100, Math.min(y, 20))
        : 0;
      const td = taxDragRate(age, p.ssAge, p.tax, p.filingStatus);
      const hShock = age >= (p.hcShockAge || 72) && rand() < (p.hcProb || 3.5) / 100
        ? (p.hcMin || 70_000) + rand() * ((p.hcMax || 130_000) - (p.hcMin || 70_000))
        : 0;
      const draw = Math.max(0, sp - ss - ab) * (1 + td) + hShock;

      port = port * (1 + r) - draw;
      if (port <= 0 && survived) {
        survived = false;
        port = 0;
      }
      path.push(Math.max(0, Math.round(port)));
    }
    results.push({ path, survived });
  }

  const pL = results[0].path.length;
  const pcts = [];
  for (let t = 0; t < pL; t++) {
    const vals = results.map((r) => r.path[t]).sort((a, b) => a - b);
    const q = (p) => vals[Math.floor(p * (vals.length - 1))];
    pcts.push({
      age: p.retireAge + t,
      p10: q(0.1),
      p25: q(0.25),
      p50: q(0.5),
      p75: q(0.75),
      p90: q(0.9),
    });
  }
  return { rate: results.filter((r) => r.survived).length / N, pcts };
}

/* ════ DETERMINISTIC WITHDRAWAL SCHEDULE (median returns) ════ */
function simulateDeterministic(p, inf) {
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = p.endAge - p.retireAge;
  const strategy = p.withdrawalStrategy || "gk";

  // Sum portfolio from accounts (same as runMC)
  let port = 0;
  for (const acct of (p.accounts || [])) {
    port += acct.balance || 0;
  }

  // Accumulation phase — deterministic median return
  for (let y = 0; y < accYrs; y++) {
    const ret = CALIB.phase1Mean / 100;
    port = port * (1 + ret) + p.contrib;
  }

  const portAtRetire = port;
  let startingPort = portAtRetire;
  const gkFloor = p.gkFloor || 48_000;
  const gkCeiling = p.gkCeiling || 115_000;
  const ss0 = p.retireAge >= p.ssAge ? p.ssb : 0;
  const ab0 = p.useAb ? p.ab : 0;
  const initDraw = Math.max(0, p.sp - ss0 - ab0);
  const initWR = portAtRetire > 0 ? initDraw / portAtRetire : 0.04;

  let sp = p.sp;
  let lastReturn = 0;
  const schedule = [];

  for (let y = 0; y < retYrs; y++) {
    const age = p.retireAge + y;
    const yr = 2026 + (age - p.currentAge);
    const ret = age < 62 ? CALIB.phase1Mean / 100 : CALIB.phase2Mean / 100;
    const inflY = inf / 100;
    const cumInfl = Math.pow(1 + inflY, y);
    const adjFloor = gkFloor * cumInfl;
    const adjCeiling = gkCeiling * cumInfl;

    // ========== WITHDRAWAL STRATEGY (mirrors runMC) ==========
    if (y > 0 && port > 0) {
      if (strategy === "gk") {
        sp = guytonKlingerWithdrawal(port, initWR, sp, lastReturn, inflY, adjFloor, adjCeiling);
      } else if (strategy === "fixed") {
        const fixedRate = p.fixedWithdrawalRate ?? 0.04;
        sp = Math.max(adjFloor, Math.min(adjCeiling, port * fixedRate));
      } else if (strategy === "vanguard") {
        const initialRate = p.vanguardInitialRate ?? 0.04;
        const cap = p.vanguardCap ?? 0.05;
        const floorRate = p.vanguardFloor ?? -0.025;
        const pctOfPort = port * initialRate;
        const dynamic = y === 1
          ? (sp * (1 + inflY) + pctOfPort) / 2
          : sp * (1 + inflY) * (1 + (ret - inflY) * 0.5);
        const change = (dynamic / sp) - 1;
        const cappedChange = Math.max(floorRate, Math.min(cap, change));
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp * (1 + cappedChange)));
      } else if (strategy === "risk") {
        const safeWR = p.safeWithdrawalRate ?? 0.04;
        const currentWR = sp / port;
        if (currentWR > safeWR * 1.2) sp *= 0.9;
        else if (currentWR < safeWR * 0.8) sp *= 1.1;
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp * (1 + inflY)));
      } else if (strategy === "kitces") {
        if (port >= startingPort * 1.5) {
          sp *= 1.10;
          startingPort = port;
        }
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp * (1 + inflY)));
      }
    }
    lastReturn = ret;

    const ss = age >= p.ssAge
      ? Math.round(p.ssb * Math.pow(1 + (p.ssCola || 2.4) / 100, y))
      : 0;
    const ab = p.useAb
      ? Math.round(p.ab * Math.pow(1 + (p.abGrowth || 3) / 100, Math.min(y, 20)))
      : 0;
    const need = Math.max(0, sp - ss - ab);

    const taxResult = calcYearTax(age, yr, need, ss, ab, 0, 0, p.twoHousehold || false, inflY, p.filingStatus || "mfj");
    const totalDraw = need + taxResult.totalTax;
    port = port * (1 + ret) - totalDraw;

    // Determine GK band (useful for all strategies to show where spending sits)
    const wr = port > 0 ? (sp / port) : 0;
    let band = "normal";
    if (wr <= initWR * 0.8) band = "prosperity";
    else if (wr >= initWR * 1.2) band = "capital_preservation";

    schedule.push({
      age, yr,
      spending: Math.round(sp),
      ss, Rental: ab,
      portfolioDraw: Math.round(need),
      fedTax: taxResult.fedTax,
      stateTax: taxResult.stateTax,
      irmaa: taxResult.irmaa,
      totalTax: taxResult.totalTax,
      totalWithdrawal: Math.round(totalDraw),
      portfolioEnd: Math.max(0, Math.round(port)),
      gkFloor: Math.round(adjFloor),
      gkCeiling: Math.round(adjCeiling),
      withdrawalRate: port > 0 ? sp / port : 0,
      gkBand: band,
    });

    if (port <= 0) break;
  }
  return { schedule, portAtRetire: Math.round(portAtRetire), initWR, strategy };
}

function simulateDeterministicWithStrategy(p, inf, withdrawalStrategy) {
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = p.endAge - p.retireAge;
  let port = p.port;

  // Accumulation using median returns
  for (let y = 0; y < accYrs; y++) {
    const ret = CALIB.phase1Mean / 100;
    port = port * (1 + ret) + p.contrib;
  }

  const portAtRetire = port;
  const gkFloor = p.gkFloor || 48_000;
  const gkCeiling = p.gkCeiling || 115_000;
  const ss0 = p.retireAge >= p.ssAge ? p.ssb : 0;
  const ab0 = p.useAb ? p.ab : 0;
  const initDraw = Math.max(0, p.sp - ss0 - ab0);
  const initWR = portAtRetire > 0 ? initDraw / portAtRetire : 0.04;

  let sp = p.sp;
  let lastReturn = 0;
  const schedule = [];

  for (let y = 0; y < retYrs; y++) {
    const age = p.retireAge + y;
    const yr = 2026 + (age - p.currentAge);
    const ret = age < 62 ? CALIB.phase1Mean / 100 : CALIB.phase2Mean / 100;
    const inflY = inf / 100;
    const cumInfl = Math.pow(1 + inflY, y);
    const adjFloor = gkFloor * cumInfl;
    const adjCeiling = gkCeiling * cumInfl;

    // Apply withdrawal strategy (deterministic version)
    if (y === 0) {
      // first year: use target spend
    } else {
      if (withdrawalStrategy === "gk") {
        // Use existing GK function with deterministic return
        sp = guytonKlingerWithdrawal(port, initWR, sp, lastReturn, inflY, adjFloor, adjCeiling);
      }
      else if (withdrawalStrategy === "fixed") {
        const fixedRate = p.fixedWithdrawalRate ?? 0.04;
        let newSp = port * fixedRate;
        sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
      }
      else if (withdrawalStrategy === "vanguard") {
        const initialRate = p.vanguardInitialRate ?? 0.04;
        const cap = 0.05;
        const floorRate = -0.025;
        if (y === 1) {
          const pctOfPort = port * initialRate;
          const inflationAdj = sp * (1 + inflY);
          let candidate = (inflationAdj + pctOfPort) / 2;
          let change = (candidate / sp) - 1;
          let cappedChange = Math.max(floorRate, Math.min(cap, change));
          sp = sp * (1 + cappedChange);
        } else {
          const pctOfPort = port * initialRate;
          const dynamic = sp * (1 + inflY) * (1 + (ret - inflY) * 0.5);
          let change = (dynamic / sp) - 1;
          let cappedChange = Math.max(floorRate, Math.min(cap, change));
          sp = sp * (1 + cappedChange);
        }
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
      }
      else if (withdrawalStrategy === "risk") {
        const safeWR = p.safeWithdrawalRate ?? 0.04;
        const currentWR = sp / port;
        if (currentWR > safeWR * 1.2) sp = sp * 0.9;
        else if (currentWR < safeWR * 0.8) sp = sp * 1.1;
        sp = sp * (1 + inflY);
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
      }
      else if (withdrawalStrategy === "kitces") {
        let startingPort = portAtRetire;
        if (y === 1) startingPort = portAtRetire;
        if (port >= startingPort * 1.5) {
          sp = sp * 1.10;
          startingPort = port;
        }
        sp = sp * (1 + inflY);
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
      }
      // New strategies (deterministic)
      else if (withdrawalStrategy === "vpw") {
        const eqPct = age < 62 ? (p.preRetireEq || 91) : (p.postRetireEq || 70);
        const r = 0.0376;
        const maxAge = 100;
        const n = Math.max(1, maxAge - age);
        let rate;
        if (r === 0) rate = 1 / n;
        else {
          const term = (1 - Math.pow(1 + r, -n + 1)) / r;
          rate = 1 / (1 + term);
        }
        rate = Math.min(0.10, rate);
        let newSp = port * rate;
        sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
      }
      else if (withdrawalStrategy === "cape") {
        const a = 0.015, b = 0.5, cape = 20;
        const rate = a + b * (1 / cape);
        let newSp = port * rate;
        sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
      }
      else if (withdrawalStrategy === "endowment") {
        const smoothing = 0.7, spendRate = 0.05;
        if (y === 1) sp = port * spendRate;
        else {
          const inflationAdj = sp * (1 + inflY);
          const pctOfPort = port * spendRate;
          sp = smoothing * inflationAdj + (1 - smoothing) * pctOfPort;
        }
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
      }
      else if (withdrawalStrategy === "one_n") {
        const yearsLeft = Math.max(1, p.endAge - age);
        let newSp = port / yearsLeft;
        sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
      }
      else if (withdrawalStrategy === "ninety_five_rule") {
        if (y === 1) sp = p.sp;
        else {
          const inflated = sp * (1 + inflY);
          const floor95 = sp * 0.95;
          sp = Math.max(floor95, inflated);
        }
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
      }
    }
    lastReturn = ret;

    const ss = age >= p.ssAge ? Math.round(p.ssb * Math.pow(1 + (p.ssCola || 2.4)/100, y)) : 0;
    const ab = p.useAb ? Math.round(p.ab * Math.pow(1 + (p.abGrowth || 3)/100, Math.min(y, 20))) : 0;
    const need = Math.max(0, sp - ss - ab);
    const taxResult = calcYearTax(age, yr, need, ss, ab, 0, 0, p.twoHousehold || false, inflY, p.filingStatus || "mfj");
    const totalDraw = need + taxResult.totalTax;
    port = port * (1 + ret) - totalDraw;

    schedule.push({
      age, yr,
      spending: Math.round(sp),
      ss, airbnb: ab,
      portfolioDraw: Math.round(need),
      fedTax: taxResult.fedTax,
      stateTax: taxResult.stateTax,
      irmaa: taxResult.irmaa,
      totalTax: taxResult.totalTax,
      totalWithdrawal: Math.round(totalDraw),
      portfolioEnd: Math.max(0, Math.round(port)),
    });
    if (port <= 0) break;
  }
  return { schedule, portAtRetire: Math.round(portAtRetire), initWR };
}

/* ════ ROTH CONVERSION EXPLORER ════ */
// 2026 MFJ federal brackets (inflation-adjusted from 2025)
const FED_BRACKETS_2026_MFJ = [
  { lo: 0,       hi: 24800,  rate: 0.10 },
  { lo: 24800,   hi: 100800, rate: 0.12 },
  { lo: 100800,  hi: 211400, rate: 0.22 },
  { lo: 211400,  hi: 403550, rate: 0.24 },
  { lo: 403550,  hi: 512450, rate: 0.32 },
];
// 2026 Single filer federal brackets (~half the MFJ thresholds)
const FED_BRACKETS_2026_SINGLE = [
  { lo: 0,      hi: 12400,  rate: 0.10 },
  { lo: 12400,  hi: 50400,  rate: 0.12 },
  { lo: 50400,  hi: 105700, rate: 0.22 },
  { lo: 105700, hi: 201800, rate: 0.24 },
  { lo: 201800, hi: 256225, rate: 0.32 },
];
const NJ_BRACKETS_2026 = [
  { lo: 0, hi: 20000, rate: 0.014 },
  { lo: 20000, hi: 35000, rate: 0.0175 },
  { lo: 35000, hi: 40000, rate: 0.035 },
  { lo: 40000, hi: 75000, rate: 0.05525 },
  { lo: 75000, hi: 500000, rate: 0.0637 },
  { lo: 500000, hi: 1000000, rate: 0.0897 },
  { lo: 1000000, hi: Infinity, rate: 0.1075 },
];
const IRMAA_2026 = [
  { m: 218000, f: 0 },
  { m: 274000, f: 2160 },
  { m: 342000, f: 5470 },
  { m: 410000, f: 8300 },
  { m: 750000, f: 11130 },
];
const RMD_DIV = {
  73: 30.4,
  74: 29.5,
  75: 28.5,
  76: 27.6,
  77: 26.6,
  78: 25.7,
  79: 24.7,
  80: 23.8,
  81: 22.9,
  82: 22.0,
  83: 21.1,
  84: 20.2,
  85: 19.4,
  86: 18.5,
  87: 17.7,
  88: 16.9,
  89: 16.1,
  90: 15.3,
};

function progTax(ti, br) {
  let t = 0;
  for (const b of br) {
    if (ti <= b.lo) break;
    t += Math.max(0, Math.min(ti, b.hi) - b.lo) * b.rate;
  }
  return t;
}
function idxB(br, f) {
  return br.map((b) => ({
    lo: Math.round(b.lo * f),
    hi: b.hi === Infinity ? Infinity : Math.round(b.hi * f),
    rate: b.rate,
  }));
}
function irmaaCost(magi, yr) {
  const f = Math.pow(1.025, yr - 2026);
  for (let i = IRMAA_2026.length - 1; i >= 0; i--) {
    if (magi >= IRMAA_2026[i].m * f) return Math.round(IRMAA_2026[i].f * f);
  }
  return 0;
}

const ROTH_BASE_YEAR = new Date().getFullYear();

/**
 * SECURE Act 2.0 RMD start age.
 * Born before 1951 → 72 (pre-SECURE 2.0 transition)
 * Born 1951–1959  → 73
 * Born 1960+      → 75
 * Accepts either a birth year (number) or an ISO dob string ("YYYY-MM-DD").
 */
function getRmdStartAge({ dob, birthYear, currentAge } = {}) {
  let by = null;
  if (typeof birthYear === "number" && birthYear > 0) by = birthYear;
  else if (typeof dob === "string" && dob.length >= 4) {
    const y = parseInt(dob.slice(0, 4), 10);
    if (!isNaN(y)) by = y;
  } else if (typeof currentAge === "number" && currentAge > 0) {
    by = ROTH_BASE_YEAR - currentAge;
  }
  if (by === null) return 73; // safe default
  if (by >= 1960) return 75;
  if (by >= 1951) return 73;
  return 72;
}

function buildRothExplorer(params = {}) {
  const {
    currentAge = 56,
    retireAge = 60,
    ssAge = 64,
    ssb = 31543,
    ab = 20000,
    useAb = true,
    inf = 2.5,
    port = 2434000,
    twoHousehold = true,
    rothMode = "fill_22",
    filingStatus = "mfj",
    dob,
    birthYear,
    rmdStartAge, // explicit override switch
  } = params;

  const isMFJ = filingStatus !== "single";
  const fedBase = isMFJ ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE;
  const stdDedBase = isMFJ ? 32200 : 16100;
  const stdDedAgeBonus = isMFJ ? 3300 : 1650;
  const rmdAge = typeof rmdStartAge === "number" && rmdStartAge > 0
    ? rmdStartAge
    : getRmdStartAge({ dob, birthYear, currentAge });

  const infR = inf / 100,
    retireYear = ROTH_BASE_YEAR + (retireAge - currentAge),
    isNoTaxState = twoHousehold;

  const _pretaxSum = (params.accounts || []).filter(a => a.category === "pretax").reduce((s, a) => s + (a.balance || 0), 0);
  const _rothSum = (params.accounts || []).filter(a => a.category === "roth").reduce((s, a) => s + (a.balance || 0), 0);
  const _otherSum = (params.accounts || []).filter(a => !["pretax","roth"].includes(a.category)).reduce((s, a) => s + (a.balance || 0), 0);
  const _totalFromAccounts = _pretaxSum + _rothSum + _otherSum;
  const pretaxBal = _totalFromAccounts > 0 ? _pretaxSum : port * 0.6,
    rothBal = _totalFromAccounts > 0 ? (_rothSum + _otherSum) : port * 0.4,
    gr = 0.07;

  function irmaaCeiling(yr) {
    const f = Math.pow(1.025, yr - 2026);
    return Math.round(218000 * f);
  }

  const gkF = params.gkFloor || 48000;
  const gkC = params.gkCeiling || 115000;
  const baseSp = params.sp || 100000;

  function runScenario(doConvert) {
    let pT = pretaxBal,
      ro = rothBal,
      cTax = 0,
      cConv = 0,
      cIrmaa = 0,
      cRmd = 0;
    const rows = [];
    let sp = baseSp,
      lastReturn = gr;
    const totalPort0 = pretaxBal + rothBal;
    const ss0 = retireAge >= ssAge ? ssb : 0;
    const ab0 = useAb ? ab : 0;
    const initDraw0 = Math.max(0, baseSp - ss0 - ab0);
    const initWR = totalPort0 > 0 ? initDraw0 / totalPort0 : 0.04;

    for (let age = retireAge; age <= 90; age++) {
      const yr = retireYear + (age - retireAge),
        f = Math.pow(1 + infR, yr - ROTH_BASE_YEAR);
      const fB = idxB(fedBase, f),
        nB = idxB(NJ_BRACKETS_2026, f);
      const stdD = Math.round(stdDedBase * f) + (age >= 65 ? Math.round(stdDedAgeBonus * f) : 0);
      const b12t = fB.find((b) => b.rate === 0.12)?.hi || Math.round((isMFJ ? 100800 : 50400) * f);
      const b22t = fB.find((b) => b.rate === 0.22)?.hi || Math.round((isMFJ ? 211400 : 105700) * f);
      const b24t = fB.find((b) => b.rate === 0.24)?.hi || Math.round((isMFJ ? 403550 : 201800) * f);

      const totalPort = pT + ro;
      if (age > retireAge && totalPort > 0) {
        sp = guytonKlingerWithdrawal(
          totalPort,
          initWR,
          sp,
          lastReturn,
          infR,
          gkF,
          gkC
        );
      }

      const ss = age >= ssAge ? Math.round(ssb * Math.pow(1.024, age - ssAge)) : 0;
      const ssT = Math.round(ss * 0.85);
      const abn = useAb && age <= 80
        ? Math.round(ab * Math.pow(1.03, Math.min(age - retireAge, 20)))
        : 0;
      const baseInc = ssT + abn;
      const portDraw = Math.max(0, sp - ss - abn);

      // RMD calculation – using Uniform Lifetime Table (RMD_DIV)
      // Start age follows SECURE Act 2.0: 75 if born 1960+, 73 if born 1951-1959, 72 if born before 1951.
      // For Joint & Last Survivor, you would need spouse age and a 2D table.
      let rmd = 0;
      if (age >= rmdAge && pT > 0) {
        const divisor = RMD_DIV[age] || 15.0;
        rmd = Math.round(pT / divisor);
      }
      const incBC = baseInc + rmd;
      const txBC = Math.max(0, incBC - stdD);

      let conv = 0;
      let capReason = "";
      if (
        doConvert &&
        rothMode !== "no_convert" &&
        age >= retireAge &&
        age < rmdAge &&
        pT > 0
      ) {
        let targetTop;
        if (rothMode === "fill_12") { targetTop = b12t; capReason = "mode 12%"; }
        else if (rothMode === "fill_22") { targetTop = b22t; capReason = "mode 22%"; }
        else if (rothMode === "fill_24") { targetTop = b24t; capReason = "mode 24%"; }
        else if (rothMode === "irmaa_safe") {
          const irmaaTop = irmaaCeiling(yr) + stdD;
          if (irmaaTop < b22t) { targetTop = irmaaTop; capReason = "IRMAA ceiling"; }
          else { targetTop = b22t; capReason = "mode 22%"; }
        } else { targetTop = b22t; capReason = "mode 22%"; }

        // IRMAA lookback guard: ages 60-65 — cap at 22%
        if (age >= 60 && age <= 65 && rothMode === "fill_24" && b22t < targetTop) {
          targetTop = b22t; capReason = "IRMAA lookback (age 60-65)";
        }
        // FAFSA/CSS guard: through 2029 — cap at 12%
        if (yr <= 2029 && b12t < targetTop) {
          targetTop = b12t; capReason = "FAFSA (≤2029)";
        }
        // CSS Profile guard: 2030-2033 — cap at 22%
        if (yr > 2029 && yr <= 2033 && b22t < targetTop) {
          targetTop = b22t; capReason = "CSS Profile (2030-33)";
        }
        // 24% permitted from age 66 until the year before RMDs begin
        if (rothMode === "fill_24" && (age < 66 || age >= rmdAge) && b22t < targetTop) {
          targetTop = b22t; capReason = "24% gated (age 66+ only)";
        }
        const room = Math.max(0, targetTop - txBC);
        // Hard cap: never convert more than $250K in a single year
        const preCap = Math.min(room, Math.max(0, pT));
        conv = Math.round(Math.min(preCap, 250_000));
        if (preCap > 250_000) capReason = "$250K annual cap";
        else if (pT < room) capReason = "pretax exhausted";
      }

      const totInc = incBC + conv,
        txInc = Math.max(0, totInc - stdD);
      const fedT = Math.round(progTax(txInc, fB));
      const stT = isNoTaxState ? 0 : Math.round(progTax(Math.max(0, txInc), nB));
      const totT = fedT + stT,
        effR = totInc > 0 ? totT / totInc : 0;
      const magi = totInc + (ss - ssT);
      const irmaa = age >= 65 ? irmaaCost(magi, yr) : 0;

      pT = Math.max(0, pT - rmd - conv - Math.max(0, portDraw * 0.6)) * (1 + gr);
      ro = Math.max(0, ro + conv - Math.max(0, portDraw * 0.4)) * (1 + gr);
      lastReturn = gr;
      cTax += totT;
      cConv += conv;
      cIrmaa += irmaa;
      cRmd += rmd;

      let label = "";
      if (conv > 0) {
        if (age === ssAge - 1) label = "Golden Year ★";
        else if (age === ssAge) label = "SS Starts";
        else label = `Year ${age - retireAge}`;
      }

      // Per-bracket split of the conversion: which dollars landed in which bracket.
      const convByBr = { conv10: 0, conv12: 0, conv22: 0, conv24: 0, conv32: 0, conv35: 0, conv37: 0 };
      if (conv > 0) {
        fB.forEach((b) => {
          const inBr = Math.max(0, Math.min(txInc, b.hi) - Math.max(txBC, b.lo));
          const key = `conv${Math.round(b.rate * 100)}`;
          if (key in convByBr) convByBr[key] = Math.round(inBr);
        });
      }
      rows.push({
        yr, age, ss, abn, rmd, conv, baseInc: incBC, totInc, txInc,
        fedT, stT, totT, effR, irmaa, magi,
        pT: Math.round(pT), ro: Math.round(ro), nw: Math.round(pT + ro),
        label,
        bracketUsed: conv > 0
          ? txInc <= b12t ? "12%" : txInc <= b22t ? "22%" : txInc <= b24t ? "24%" : "32%"
          : "-",
        capReason,
        ...convByBr,
        sp: Math.round(sp), portDraw: Math.round(portDraw),
      });
    }
    return { rows, cTax, cConv, cIrmaa, cRmd, fPT: Math.round(pT), fRo: Math.round(ro) };
  }

  const opt = runScenario(true),
    cur = runScenario(false);
  const convRows = opt.rows.filter((r) => r.conv > 0);
  const taxD = opt.cTax - cur.cTax;
  const estD = (cur.rows[cur.rows.length - 1]?.nw || 0) - (opt.rows[opt.rows.length - 1]?.nw || 0);
  const totIncOpt = opt.rows.reduce((s, r) => s + r.totInc, 0);
  const totIncCur = cur.rows.reduce((s, r) => s + r.totInc, 0);
  const leOpt = totIncOpt > 0 ? opt.cTax / totIncOpt : 0;
  const leCur = totIncCur > 0 ? cur.cTax / totIncCur : 0;
  const rmdRed = cur.cRmd > 0 ? Math.round((1 - opt.cRmd / cur.cRmd) * 100) : 0;

  return {
    opt, cur, convRows, taxD, estD, leOpt, leCur, rmdRed,
    isNoTaxState, retireYear, retireAge, ssAge, rmdAge, filingStatus: isMFJ ? "mfj" : "single",
  };
}

function buildRothLadder(params = {}) {
  const ex = buildRothExplorer(params);
  return ex.convRows.map((r) => ({
    yr: r.yr,
    age: r.age,
    label: r.label,
    otherInc: r.abn,
    conv: r.conv,
    fedTax: r.fedT,
    stateNJ: r.stT,
    effFL: r.conv > 0 ? ((r.fedT / r.conv) * 100).toFixed(1) : "0.0",
    effNJ: r.conv > 0 ? (((r.fedT + r.stT) / r.conv) * 100).toFixed(1) : "0.0",
    netRoth: Math.round(r.conv - r.fedT - (params.twoHousehold ? 0 : r.stT)),
  }));
}

/* ════ MORTGAGE MATH ════ */
function mortgageSchedule(
  balance,
  annualRate,
  startDate,
  termYrs,
  extraMonthly
) {
  const mRate = annualRate / 100 / 12;
  const totalMonths = termYrs * 12;
  const start = new Date(startDate + "-01"),
    now = new Date();
  const elapsed = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      now.getMonth() -
      start.getMonth()
  );
  const remaining = Math.max(1, totalMonths - elapsed);
  const pmt =
    mRate === 0
      ? balance / remaining
      : (balance * mRate * Math.pow(1 + mRate, remaining)) /
        (Math.pow(1 + mRate, remaining) - 1);
  let bal = balance,
    yr = now.getFullYear(),
    years = [],
    totalInt = 0,
    totalIntNoExtra = 0;
  while (bal > 0.01 && years.length < 35) {
    let pPaid = 0,
      iPaid = 0,
      ePaid = 0,
      balNE = bal;
    for (let m = 0; m < 12 && bal > 0.01; m++) {
      const intM = bal * mRate,
        prin = Math.min(pmt - intM, bal),
        extra = Math.min(extraMonthly, bal - prin);
      pPaid += prin + extra;
      iPaid += intM;
      ePaid += extra;
      totalInt += intM;
      bal -= prin + extra;
      if (bal <= 0) {
        bal = 0;
        break;
      }
      const intNE = balNE * mRate,
        prinNE = Math.min(pmt - intNE, balNE);
      totalIntNoExtra += intNE;
      balNE -= prinNE;
      if (balNE <= 0) balNE = 0;
    }
    years.push({
      yr,
      pPaid: Math.round(pPaid),
      iPaid: Math.round(iPaid),
      ePaid: Math.round(ePaid),
      bal: Math.round(Math.max(0, bal)),
    });
    yr++;
  }
  return {
    years,
    pmt: Math.round(pmt),
    payoffYr: years[years.length - 1]?.yr || now.getFullYear(),
    totalInt: Math.round(totalInt),
    interestSaved: Math.round(totalIntNoExtra - totalInt),
  };
}

/* ════ FORMATTERS ════ */
const fmtM = (v) =>
  v >= 1e6
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1e3
    ? `$${Math.round(v / 1e3)}K`
    : `$${Math.round(v)}`;
const fmtK = (v) => `$${Math.round(v / 1e3)}K`;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;
function getAnalogue(rate) {
  const pct = rate * 100;
  return ANALOGUES.find((a) => pct >= a.min) || ANALOGUES[ANALOGUES.length - 1];
}
function countdownDays() {
  return Math.max(0, Math.floor((DDAY - new Date()) / 86400000));
}

function useCountdown(dday, startDate) {
  const calc = () => {
    const diff = Math.max(0, dday - new Date());
    const start = new Date(startDate);
    const now = new Date();
    let pct = 0;

    if (start < dday && now > start) {
      const total = dday - start;
      const elapsed = now - start;
      pct = Math.min(100, (elapsed / total) * 100);
    }

    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      mins: Math.floor((diff % 3600000) / 60000),
      secs: Math.floor((diff % 60000) / 1000),
      pct: pct.toFixed(1),
    };
  };
  const [cd, setCd] = useState(calc);

  useEffect(() => {
    const t = setInterval(() => setCd(calc()), 1000);
    return () => clearInterval(t);
  }, [dday, startDate]);

  return cd;
}

function deflate(data, inf, useReal) {
  if (!useReal) return data;
  return data.map((d, i) => ({
    ...d,
    p10: Math.round(d.p10 / Math.pow(1 + inf / 100, i)),
    p25: Math.round(d.p25 / Math.pow(1 + inf / 100, i)),
    p50: Math.round(d.p50 / Math.pow(1 + inf / 100, i)),
    p75: Math.round(d.p75 / Math.pow(1 + inf / 100, i)),
    p90: Math.round(d.p90 / Math.pow(1 + inf / 100, i)),
  }));
}

function SectorBadge({ age }) {
  const sectors = [
    { n: "Sector 1: The Escape", color: "#ef4444", active: age < 59.5 },
    {
      n: "Sector 2: The Gap",
      color: "#0ea5e9",
      active: age >= 59.5 && age < 63,
    },
    {
      n: "Sector 3: The Maneuver",
      color: "#fbbf24",
      active: age >= 65 && age < 72,
    },
    {
      n: "Sector 4: The Torpedo",
      color: "#f97316",
      active: age >= 72 && age < 73,
    },
    { n: "Sector 5: Legacy", color: "#a78bfa", active: false },
  ];
  const cur = sectors.find((s) => s.active) || sectors[0];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: `${cur.color}18`,
        border: `1px solid ${cur.color}44`,
        borderRadius: 12,
        padding: "2px 10px",
        fontSize: 10,
        color: cur.color,
        fontWeight: 600,
      }}
    >
      ⚡ {cur.n}
    </span>
  );
}

/* ════ CSS ════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing:border-box; }
  body { margin:0; font-family:'Inter',sans-serif; background:#0a0f1e; color:#f1f5f9; font-size:13px; line-height:1.5; }
  .app { min-height:100vh; background:linear-gradient(135deg,#0a0f1e 0%,#0d1529 50%,#0a0f1e 100%); }
  .hdr { background:rgba(10,15,30,0.98); border-bottom:1px solid rgba(99,179,237,0.15); padding:10px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:100; backdrop-filter:blur(16px); }
  .logo { font-size:18px; font-weight:800; letter-spacing:-0.03em; color:#f8fafc; }
  .logo-sub { color:#38bdf8; font-weight:400; font-size:13px; margin-left:6px; }
  .mbtn { padding:5px 13px; border-radius:7px; border:1px solid rgba(255,255,255,0.12); cursor:pointer; font-size:11px; font-family:'Inter',sans-serif; font-weight:500; transition:all 0.2s; background:transparent; color:#94a3b8; }
  .mbtn:hover { color:#e2e8f0; border-color:rgba(255,255,255,0.2); }
  .mbtn.on { background:linear-gradient(135deg,#0ea5e9,#38bdf8); border-color:transparent; color:white; box-shadow:0 0 16px rgba(14,165,233,0.3); }
  .mbtn.demo-on { background:linear-gradient(135deg,#7c3aed,#4f46e5); border-color:transparent; color:white; }
  .layout { display:grid; grid-template-columns:268px 1fr; height:calc(100vh - 56px); overflow:hidden; }
  .sidebar { border-right:1px solid rgba(255,255,255,0.06); padding:14px; overflow-y:auto; background:rgba(10,15,30,0.7); display:flex; flex-direction:column; gap:10px; min-height:0; }
  .sb-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:11px; padding:13px; }
  .sb-title { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.12em; margin-bottom:12px; }
  .sl-row { display:grid; grid-template-columns:108px 1fr 66px; align-items:center; gap:8px; margin-bottom:13px; }
  .sl-label { font-size:12px; color:#cbd5e1; font-weight:500; }
  .sl-val { font-size:12px; font-weight:700; text-align:right; color:#f1f5f9; font-family:'JetBrains Mono',monospace; }
  input[type=range] { display:none; }
  .tog-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .tog-label { font-size:12px; color:#cbd5e1; font-weight:500; }
  .tog { width:34px; height:18px; border-radius:9px; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; }
  .tok { position:absolute; top:2px; width:14px; height:14px; border-radius:50%; background:white; transition:left 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.4); }
  .run-btn { width:100%; padding:10px; background:linear-gradient(135deg,#0ea5e9,#38bdf8); border:none; border-radius:9px; color:white; font-size:13px; font-weight:700; cursor:pointer; font-family:'Inter',sans-serif; transition:all 0.2s; letter-spacing:-0.01em; box-shadow:0 4px 14px rgba(14,165,233,0.25); }
  .run-btn:hover { opacity:0.9; box-shadow:0 6px 20px rgba(14,165,233,0.35); }
  .run-btn:disabled { opacity:0.4; cursor:not-allowed; box-shadow:none; }
  .main { padding:16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; min-height:0; }
  .main > * { flex-shrink:0; }
  .flag-w { border-left:3px solid #f59e0b; background:rgba(245,158,11,0.1); padding:7px 12px; font-size:12px; color:#fde68a; border-radius:0 8px 8px 0; margin-bottom:4px; font-weight:500; }
  .flag-i { border-left:3px solid #38bdf8; background:rgba(56,189,248,0.08); color:#bae6fd; border-radius:0 8px 8px 0; padding:7px 12px; font-size:12px; margin-bottom:4px; font-weight:500; }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; }
  .met { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); border-radius:10px; padding:13px 15px; }
  .ml { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.09em; margin-bottom:7px; font-weight:600; }
  .mv { font-size:22px; font-weight:800; font-family:'JetBrains Mono',monospace; line-height:1; }
  .ms { font-size:11px; color:#64748b; margin-top:5px; }
  .analogue { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px 16px; font-size:13px; color:#cbd5e1; font-style:italic; }
  .tabs { display:flex; gap:3px; background:rgba(255,255,255,0.04); border-radius:10px; padding:3px; flex-wrap:wrap; }
  .tab { flex:1; min-width:72px; padding:7px 6px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:11px; font-family:'Inter',sans-serif; color:#64748b; transition:all 0.15s; font-weight:500; white-space:nowrap; letter-spacing:-0.01em; }
  .tab:hover { color:#94a3b8; }
  .tab.on { background:rgba(255,255,255,0.09); color:#f1f5f9; border:1px solid rgba(255,255,255,0.12); font-weight:600; }
  .chart-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:11px; padding:15px 17px; }
  .ct { font-size:12px; color:#94a3b8; margin-bottom:12px; font-weight:500; }
  .leg { display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; }
  .li { display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b; }
  .ll { width:18px; height:2px; border-radius:1px; }
  .ppl-grid { display:flex; flex-wrap:wrap; gap:4px; margin:8px 0; }
  .ppl-dot { width:18px; height:18px; border-radius:50%; }
  .roth-tbl { width:100%; border-collapse:collapse; font-size:12px; }
  .roth-tbl th { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; padding:7px 8px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.09); }
  .roth-tbl th:first-child { text-align:left; }
  .roth-tbl td { padding:9px 8px; border-bottom:1px solid rgba(255,255,255,0.05); text-align:right; font-family:'JetBrains Mono',monospace; font-size:12px; color:#e2e8f0; }
  .roth-tbl td:first-child { text-align:left; font-family:'Inter',sans-serif; color:#f1f5f9; }
  .gold { background:rgba(251,191,36,0.07); }
  .gk-bar { background:rgba(14,165,233,0.07); border:1px solid rgba(14,165,233,0.2); border-radius:9px; padding:11px 15px; font-size:12px; color:#bae6fd; }
  .countdown-grid { display:flex; gap:5px; }
  .cd-unit { text-align:center; background:rgba(255,255,255,0.05); border-radius:6px; padding:5px 8px; min-width:38px; }
  .cd-val { font-size:17px; font-weight:800; color:#f0fdfa; font-family:'JetBrains Mono',monospace; line-height:1; }
  .cd-lbl { font-size:9px; color:#64748b; letter-spacing:0.12em; margin-top:2px; }
  .progress-bar { height:5px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin-top:6px; }
  .progress-fill { height:100%; background:linear-gradient(90deg,#0ea5e9,#38bdf8); border-radius:3px; transition:width 1s; }
  .nw-table { width:100%; border-collapse:collapse; font-size:12px; }
  .nw-table th { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; padding:7px 8px; border-bottom:1px solid rgba(255,255,255,0.09); text-align:right; font-weight:700; }
  .nw-table th:first-child { text-align:left; }
  .nw-table td { padding:8px 8px; border-bottom:1px solid rgba(255,255,255,0.04); text-align:right; font-family:'JetBrains Mono',monospace; color:#e2e8f0; }
  .nw-table td:first-child { text-align:left; font-family:'Inter',sans-serif; color:#f1f5f9; }
  .wizard-mobile-steps { display:none; }
  .ap-col { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px; }
  .ap-hdr { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:11px; }
  .ap-item { font-size:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); color:#cbd5e1; }
  .ms-dot { width:11px; height:11px; border-radius:50%; flex-shrink:0; margin-top:2px; }
  .ms-line { width:2px; background:rgba(255,255,255,0.08); margin:0 4px; }
  .tip-box { background:rgba(10,15,30,0.98); border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:9px 12px; font-size:12px; color:#f1f5f9; }
  ::-webkit-scrollbar { width:3px; height:3px; }
  ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:2px; }

  /* ── Mobile / Responsive ── */
  @media (max-width: 768px) {
    .hdr { padding:8px 12px; gap:6px; flex-wrap:wrap; }
    .logo-sub { display:none; }
    .mbtn { padding:4px 9px; font-size:10px; }
    .layout { grid-template-columns:1fr; height:auto; overflow:visible; }
    .sidebar { border-right:none; border-bottom:1px solid rgba(255,255,255,0.06); max-height:220px; overflow-y:auto; min-height:unset; padding:10px; flex-direction:row; flex-wrap:wrap; gap:8px; }
    .sb-card { padding:10px; }
    .main { padding:10px; overflow-y:visible; min-height:unset; }
    .main > * { flex-shrink:0; }
    .metrics { grid-template-columns:1fr 1fr; }
    .sl-row { grid-template-columns:1fr 52px; }
    .tabs { gap:2px; }
    .tab { min-width:56px; padding:6px 4px; font-size:10px; }
    .wizard-grid { grid-template-columns:1fr !important; }
    .wizard-sidebar { display:none !important; }
    .wizard-panel { border-radius:0 !important; }
    .wizard-mobile-steps { display:block !important; }
    .metrics .met { padding:10px 12px; }
    .metrics .mv { font-size:17px; }
    .roth-tbl { font-size:11px; }
    .roth-tbl th, .roth-tbl td { padding:6px 5px; }
    .nw-table { font-size:11px; }
    .nw-table th, .nw-table td { padding:6px 5px; }
  }
  @media (max-width: 480px) {
    .metrics { grid-template-columns:1fr; }
    .tabs { gap:1px; }
    .tab { min-width:44px; font-size:9px; padding:5px 3px; }
    .hdr { justify-content:center; }
  }
`;

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip-box">
      <div style={{ color: "#64748b", marginBottom: 3 }}>Age {label}</div>
      {payload
        .filter((p) => p.value > 0)
        .map((p, i) => (
          <div key={i} style={{ color: p.color, marginBottom: 1 }}>
            <span style={{ color: "#94a3b8" }}>{p.name}: </span>
            {fmtM(p.value)}
          </div>
        ))}
    </div>
  );
};

function Toggle({ val, onChange, label, accent = "#0d9488" }) {
  return (
    <div className="tog-row">
      <span className="tog-label">{label}</span>
      <div
        className="tog"
        onClick={() => onChange(!val)}
        style={{ background: val ? accent : "rgba(255,255,255,0.1)" }}
      >
        <div className="tok" style={{ left: val ? 18 : 2 }} />
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = ((clamped - min) / (max - min)) * 100;
  const trackRef = useRef(null);
  const handleClick = useCallback(
    (e) => {
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const stepped = Math.round((min + ratio * (max - min)) / step) * step;
      onChange(Math.max(min, Math.min(max, stepped)));
    },
    [min, max, step, onChange]
  );
  const handleDrag = useCallback(
    (e) => {
      e.preventDefault();
      const move = (ev) => {
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const rect = trackRef.current.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (clientX - rect.left) / rect.width)
        );
        const stepped = Math.round((min + ratio * (max - min)) / step) * step;
        onChange(Math.max(min, Math.min(max, stepped)));
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", up);
    },
    [min, max, step, onChange]
  );
  return (
    <div className="sl-row">
      <span className="sl-label">{label}</span>
      <div
        ref={trackRef}
        onClick={handleClick}
        style={{
          position: "relative",
          height: 20,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            background: "rgba(255,255,255,0.15)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            height: 6,
            borderRadius: 3,
            background: "linear-gradient(90deg,#0d9488,#14b8a6)",
          }}
        />
        <div
          onMouseDown={handleDrag}
          onTouchStart={handleDrag}
          style={{
            position: "absolute",
            left: `calc(${pct}% - 9px)`,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#0d9488",
            border: "2.5px solid #14b8a6",
            boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
            cursor: "grab",
            zIndex: 2,
            transition: "transform 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        />
      </div>
      <span className="sl-val">{format(value)}</span>
    </div>
  );
}

/* ════ DUAL INPUT — text box + slider auto-sync ════ */
function DualInput({ label, value, min, max, step, format, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
        <input
          type="number"
          value={value}
          min={min} max={max} step={step}
          onChange={e => {
            const v = Math.max(min, Math.min(max, Number(e.target.value)));
            if (!isNaN(v)) onChange(v);
          }}
          style={{ width: 100, background: "#0d1b2a", border: "1px solid #1e3a5f",
            color: "#5eead4", borderRadius: 5, padding: "3px 8px",
            fontSize: 12, fontFamily: "'DM Mono',monospace", textAlign: "right" }}
        />
      </div>
      <Slider label="" value={value} min={min} max={max} step={step} format={format} onChange={onChange} />
    </div>
  );
}

/* ════ IMPORT / EXPORT ════ */
const LS_PROFILE_KEY = "aira_profile_v1";
function saveProfileToLocal(values) {
  try {
    const payload = { ...values, savedAt: new Date().toISOString(), buildTag: BUILD_TAG };
    localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
function loadProfileFromLocal() {
  try {
    const raw = localStorage.getItem(LS_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function exportProfile(values, name = "AiRA_Profile") {
  const blob = new Blob([JSON.stringify(values, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProfile(onLoad) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        // Migrate old account fields to new accounts array
        if (parsed.solo401k !== undefined && !parsed.accounts) {
          parsed.accounts = [
            ...(parsed.solo401k ? [{ id: "m1", category: "pretax", name: "Solo 401k", balance: parsed.solo401k }] : []),
            ...(parsed.alpha401k ? [{ id: "m2", category: "pretax", name: "Alpha 401k", balance: parsed.alpha401k }] : []),
            ...(parsed.rothFid ? [{ id: "m3", category: "roth", name: "Roth Fidelity", balance: parsed.rothFid }] : []),
            ...(parsed.rothVgd ? [{ id: "m4", category: "roth", name: "Roth Vanguard", balance: parsed.rothVgd }] : []),
            ...(parsed.hsaBal ? [{ id: "m5", category: "hsa", name: "HSA", balance: parsed.hsaBal }] : []),
            ...(parsed.taxable ? [{ id: "m6", category: "taxable", name: "Taxable", balance: parsed.taxable }] : []),
          ];
          if (parsed.accounts.length === 0) {
            parsed.accounts = BLANK_PROFILE.accounts;
          }
          delete parsed.solo401k;
          delete parsed.alpha401k;
          delete parsed.rothFid;
          delete parsed.rothVgd;
          delete parsed.hsaBal;
          delete parsed.taxable;
        }
        // Ensure accounts is always a valid array
        if (!Array.isArray(parsed.accounts)) {
          parsed.accounts = BLANK_PROFILE.accounts;
        }
        // Migrate old rePrimaryResidencce fields to properties array
        if (parsed.rePrimaryResidencce !== undefined && !parsed.properties) {
          parsed.properties = [
            { id:"p1", label:"Primary Residence", value: parsed.rePrimaryResidencce||0, mortgage: parsed.mortBalance||0, income:0 },
            { id:"p2", label:"Rental Unit 1",     value: parsed.reRentalUnit1||0,       mortgage:0, income:0 },
            { id:"p3", label:"Rental Unit 2",     value: parsed.reRentalUnit2||0,       mortgage:0, income:0 },
          ].filter((p,i) => p.value > 0 || i === 0);
          delete parsed.rePrimaryResidencce;
          delete parsed.reRentalUnit1;
          delete parsed.reRentalUnit2;
        }
        if (!Array.isArray(parsed.properties)) {
          parsed.properties = BLANK_PROFILE.properties;
        }
        if (parsed.dob && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.dob)) {
          const d = new Date(parsed.dob);
          if (!isNaN(d.getTime())) {
            parsed.dob = d.toISOString().slice(0, 10);
          }
        }
        onLoad(parsed);
      } catch {
        alert("Invalid profile file — must be a valid AiRA JSON export.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function FanChart({ pcts, retireAge, ssAge, inf, useReal, title, rmdAge = 73 }) {
  const data = useMemo(() => deflate(pcts, inf, useReal), [pcts, inf, useReal]);
  return (
    <div className="chart-card">
      <div className="ct">
        {title} · {useReal ? "Real $" : "Nominal $"}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={data}
          margin={{ top: 28, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="g90v5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5eead4" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#5eead4" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="g75v5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 11 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 11 }}
            tickFormatter={(v) => fmtM(v)}
            width={58}
          />
          <Tooltip content={<Tip />} />
          <ReferenceLine
            x={retireAge}
            stroke="#fbbf24"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              value: "D-Day",
              fill: "#fbbf24",
              fontSize: 10,
              position: "top",
            }}
          />
          <ReferenceLine
            x={ssAge}
            stroke="#c084fc"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              value: "SS",
              fill: "#c084fc",
              fontSize: 10,
              position: "top",
            }}
          />
          <ReferenceLine
            x={rmdAge}
            stroke="#34d399"
            strokeWidth={1}
            strokeDasharray="4 3"
            label={{
              value: "RMD",
              fill: "#34d399",
              fontSize: 10,
              position: "top",
            }}
          />
          <Area
            type="monotone"
            dataKey="p90"
            stroke="#5eead4"
            strokeWidth={1}
            strokeDasharray="4 2"
            fill="url(#g90v5)"
            dot={false}
            name="90th"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="p75"
            stroke="#0d9488"
            strokeWidth={1}
            strokeDasharray="3 2"
            fill="url(#g75v5)"
            dot={false}
            name="75th"
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#14b8a6"
            strokeWidth={2.5}
            dot={false}
            name="Median"
          />
          <Line
            type="monotone"
            dataKey="p25"
            stroke="#fbbf24"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="5 3"
            name="25th"
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke="#f87171"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="3 3"
            name="10th"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="leg">
        {[
          { c: "#5eead4", l: "90th" },
          { c: "#0d9488", l: "75th" },
          { c: "#14b8a6", l: "Median" },
          { c: "#fbbf24", l: "25th" },
          { c: "#f87171", l: "10th" },
        ].map((i) => (
          <div key={i.l} className="li">
            <div className="ll" style={{ background: i.c }} />
            {i.l}
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleViz({ rate }) {
  const success = Math.round(rate * 26);
  return (
    <div className="chart-card">
      <div className="ct">26 people with your exact plan — age 90 horizon</div>
      <div className="ppl-grid">
        {Array.from({ length: 26 }, (_, i) => (
          <div
            key={i}
            className="ppl-dot"
            style={{
              background: i < success ? "#0d9488" : "#ef4444",
              opacity: i < success ? 1 : 0.4,
            }}
            title={i < success ? "Survives to 90" : "Exhausted before 90"}
          />
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
        <span style={{ color: "#0d9488", fontWeight: 600 }}>{success}</span>{" "}
        make it to 90.{" "}
        {26 - success > 0 && (
          <>
            {" "}
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              {26 - success}
            </span>{" "}
            run out.
          </>
        )}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          color: "#475569",
          fontStyle: "italic",
        }}
      >
        100% doesn't exist. As Morgan Housel says — room for error IS the plan.
      </div>
    </div>
  );
}

function IncomeMap({ p, inf }) {
  const data = useMemo(() => {
    const yrs = Math.min(26, p.endAge - p.retireAge);
    return Array.from({ length: yrs }, (_, i) => {
      const age = p.retireAge + i;
      const ss = age >= p.ssAge ? Math.round(p.ssb * Math.pow(1.024, i)) : 0;
      const ab = p.useAb
        ? Math.round(p.ab * Math.pow(1.03, Math.min(i, 20)))
        : 0;
      let sp = p.sp;
      for (let j = 1; j <= i; j++)
        sp *= p.smile ? 1 + smileMult(p.retireAge + j) * 0.03 : 1 + inf / 100;
      return {
        age,
        "Portfolio Draw": Math.max(0, Math.round(sp) - ss - ab),
        "Social Security": ss,
        "Rental Net": ab,
      };
    });
  }, [p, inf]);
  return (
    <div className="chart-card">
      <div className="ct">
        Annual income coverage · {p.smile ? "Smile" : "Flat"} spending · Rental
        80% reliability modeled
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 9 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 9 }}
            tickFormatter={(v) => fmtM(v)}
            width={50}
          />
          <Tooltip content={<Tip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, color: "#64748b", paddingTop: 6 }}
          />
          <Bar dataKey="Portfolio Draw" stackId="a" fill="#0d9488cc" />
          <Bar dataKey="Social Security" stackId="a" fill="#7c3aedcc" />
          <Bar
            dataKey="Rental Net"
            stackId="a"
            fill="#059669cc"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="flag-w" style={{ marginTop: 8, fontSize: 10 }}>
        ⚠ SS gap ages {p.retireAge}–{p.ssAge - 1} — portfolio carries 100% of
        spending. Highest-risk window.
      </div>
    </div>
  );
}

function SmileChart({ p, inf }) {
  const data = useMemo(
    () =>
      Array.from({ length: 31 }, (_, i) => {
        const age = p.retireAge + i;
        const infR = inf / 100;
        let smile = p.sp,
          flat = p.sp;
        for (let j = 1; j <= i; j++) {
          const a = p.retireAge + j;
          smile *= 1 + smileMult(a) * 0.028;
          flat *= 1 + infR;
        }
        return {
          age,
          Flat: Math.round(flat),
          "Smile (Blanchett)": Math.round(smile),
        };
      }),
    [p, inf]
  );
  return (
    <div className="chart-card">
      <div className="ct">
        Retirement Smile · Go-go 115% → Slow-go 85% → Healthcare tail 90% ·
        Blanchett/Morningstar
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 9 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 9 }}
            tickFormatter={(v) => fmtK(v)}
            width={46}
          />
          <Tooltip content={<Tip />} />
          <ReferenceLine
            x={65}
            stroke="rgba(251,191,36,0.35)"
            strokeDasharray="3 3"
          />
          <ReferenceLine
            x={75}
            stroke="rgba(249,115,22,0.35)"
            strokeDasharray="3 3"
          />
          <Line
            type="monotone"
            dataKey="Flat"
            stroke="#475569"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Smile (Blanchett)"
            stroke="#a78bfa"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RothLadder({ params }) {
  const [showInputs, setShowInputs] = useState(false);
  const [view, setView] = useState("optimized");
  const [rothMode, setRothMode] = useState("fill_22");
  const ex = useMemo(
    () => buildRothExplorer({ ...(params ?? {}), rothMode }),
    [
      params?.currentAge,
      params?.retireAge,
      params?.ssAge,
      params?.ab,
      params?.inf,
      params?.port,
      params?.twoHousehold,
      params?.useAb,
      params?.ssb,
      params?.accounts,
      params?.dob,
      params?.birthYear,
      params?.filingStatus,
      params?.rmdStartAge,
      rothMode,
    ]
  );
  const {
    opt,
    cur,
    convRows,
    taxD,
    estD,
    leOpt,
    leCur,
    rmdRed,
    isNoTaxState,
    retireYear,
    rmdAge,
    filingStatus,
  } = ex;
  const domLabel = isNoTaxState
    ? "No Tax State Move or Out of Country"
    : `${params.stateOfResidence} Domicile (with tax) · CA/NY/Washington worst-case`;
  const domColor = isNoTaxState ? "#34d399" : "#fb923c";
  const modeLabels = {
    fill_12: "Fill 12%",
    fill_22: "Fill 22%",
    fill_24: "Fill 24%",
    irmaa_safe: "IRMAA-Safe",
  };
  const modeDescs = {
    fill_12:
      "Conservative — stay in 12% bracket. Lowest tax, slowest conversion.",
    fill_22: "Moderate — fill to top of 22%. IRMAA-safe. AiRA default.",
    fill_24:
      "Aggressive — fill to 24%. ⚠️ IRMAA risk at 65 (2-yr lookback). Faster conversion.",
    irmaa_safe:
      "Dynamic — fills 22% normally, auto-throttles near IRMAA threshold.",
  };
  const InputsPanel = () => (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: showInputs ? "12px" : "0",
        maxHeight: showInputs ? "600px" : "0",
        overflow: "hidden",
        transition: "all 0.3s ease",
        marginBottom: showInputs ? 10 : 0,
      }}
    >
      {showInputs && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px 20px",
            fontSize: 11,
          }}
        >
          {[
            ["Domicile", domLabel, domColor],
            ["Filing Status", filingStatus === "mfj" ? "MFJ" : "Single", "#94a3b8"],
            ["Bracket Target", modeLabels[rothMode], "#5eead4"],
            [
              "Std Deduction (2026)",
              (filingStatus === "mfj" ? "$32,200" : "$16,100") +
                " (indexed " + params.inf + "%/yr)",
              "#94a3b8",
            ],
            [
              "Other Income",
              "Rental $" +
                (params.ab || 20000).toLocaleString() +
                "/yr (3% growth)",
              "#94a3b8",
            ],
            [
              "SS Start",
              "Age " +
                (params.ssAge ?? "—") +
                " / $" +
                (params.ssb || 0).toLocaleString() +
                "/yr",
              "#94a3b8",
            ],
            [
              "Portfolio",
              (() => {
                const accts = params.accounts || [];
                const total = accts.reduce((s, a) => s + (a.balance || 0), 0);
                const pretax = accts
                  .filter((a) => a.category === "pretax")
                  .reduce((s, a) => s + (a.balance || 0), 0);
                const pct = total > 0 ? Math.round((pretax / total) * 100) : 0;
                return (
                  fmtM(params.port || 0) +
                  (total > 0 ? ` (${pct}% pre-tax)` : "")
                );
              })(),
              "#94a3b8",
            ],
            ["Growth Assumption", "7% nominal (balance projection)", "#94a3b8"],
            ["IRMAA Guard", "Ages 63-65 auto-throttled to 22%", "#fbbf24"],
            ["FAFSA Guard", "Through 2029 · capped at 12%", "#fbbf24"],
            [
              "Conversion Window",
              "Age " + (params.retireAge || 60) + "–" + (rmdAge - 1) + " (dynamic fill)",
              "#5eead4",
            ],
            [
              "RMD Start Age",
              rmdAge + " (SECURE Act 2.0)",
              "#94a3b8",
            ],
            [
              "RMD Table",
              "Joint & Last Survivor (Spouse)",
              "#94a3b8",
            ],
          ].map(([k, v, c]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ color: "#64748b" }}>{k}</span>
              <span
                style={{
                  color: c,
                  fontFamily: "'DM Mono',monospace",
                  fontWeight: 500,
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const barData = convRows.map((r) => ({
    yr: r.yr,
    age: r.age,
    conv: r.conv,
    label: r.label,
    "10%": r.conv10 || 0,
    "12%": r.conv12 || 0,
    "22%": r.conv22 || 0,
    "24%": r.conv24 || 0,
    "32%": r.conv32 || 0,
    "35%": r.conv35 || 0,
    "37%": r.conv37 || 0,
  }));
  const taxCompare = opt.rows
    .filter((_, i) => i % 2 === 0 || i < 10)
    .map((r, i) => {
      const c = cur.rows.find((cr) => cr.yr === r.yr);
      return {
        yr: r.yr,
        age: r.age,
        optRate: (r.effR * 100).toFixed(0),
        curRate: c ? (c.effR * 100).toFixed(0) : "0",
        optTax: r.totT,
        curTax: c ? c.totT : 0,
      };
    });
  const rmdYears = opt.rows
    .filter((r) => r.age >= rmdAge && r.age <= 90)
    .map((r) => {
      const c = cur.rows.find((cr) => cr.yr === r.yr);
      return {
        age: r.age,
        optRmd: r.rmd,
        curRmd: c ? c.rmd : 0,
        optPT: r.pT,
        curPT: c ? c.pT : 0,
      };
    });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {["optimized", "comparison", "table"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: 600,
                background: view === v ? "rgba(13,148,136,0.2)" : "transparent",
                color: view === v ? "#5eead4" : "#64748b",
              }}
            >
              {v === "optimized"
                ? "📊 Conversion Plan"
                : v === "comparison"
                ? "⚖️ Compare"
                : "📋 Year-by-Year"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowInputs(!showInputs)}
          style={{
            padding: "3px 8px",
            borderRadius: 5,
            border: "1px solid rgba(255,255,255,0.1)",
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "inherit",
            background: "transparent",
            color: "#64748b",
          }}
        >
          {showInputs ? "▲ Hide" : "▼ Show"} Assumptions
        </button>
      </div>
      <InputsPanel />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontSize: 10,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Bracket Fill Strategy
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {Object.entries(modeLabels).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setRothMode(k)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: 600,
                border:
                  rothMode === k
                    ? "1px solid #0d9488"
                    : "1px solid rgba(255,255,255,0.1)",
                background:
                  rothMode === k ? "rgba(13,148,136,0.15)" : "transparent",
                color: rothMode === k ? "#5eead4" : "#64748b",
                transition: "all 0.15s",
              }}
            >
              {v}
              {k === "fill_24" ? " ⚠️" : ""}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>
          {modeDescs[rothMode]}
        </div>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: 4, background: domColor }}
        />
        <span style={{ color: domColor, fontWeight: 600 }}>
          Domicile: {domLabel}
        </span>
        <span style={{ color: "#475569" }}>
          · {isNoTaxState ? "🌴 Two households toggle ON" : "🏠 Both in NJ"}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 8,
        }}
      >
        <div className="met">
          <div className="ml">Conversions</div>
          <div className="mv" style={{ color: "#5eead4", fontSize: 20 }}>
            {convRows.length}
          </div>
          <div className="ms">during plan window</div>
        </div>
        <div className="met">
          <div className="ml">Lifetime Tax Delta</div>
          <div
            className="mv"
            style={{ color: taxD > 0 ? "#fb923c" : "#34d399", fontSize: 16 }}
          >
            {taxD > 0 ? "+" : ""}
            {fmtM(Math.abs(taxD))}
          </div>
          <div className="ms">
            {taxD > 0 ? "more" : "less"} with conversions
          </div>
        </div>
        <div className="met">
          <div className="ml">RMD Reduction</div>
          <div className="mv" style={{ color: "#34d399", fontSize: 20 }}>
            {rmdRed}%
          </div>
          <div className="ms">lower forced distributions</div>
        </div>
        <div className="met">
          <div className="ml">Lifetime Eff. Rate</div>
          <div className="mv" style={{ color: "#5eead4", fontSize: 16 }}>
            {(leOpt * 100).toFixed(1)}% vs {(leCur * 100).toFixed(1)}%
          </div>
          <div className="ms">optimized vs current</div>
        </div>
      </div>
      {view === "optimized" && (
        <>
          <div className="chart-card">
            <div className="ct">
              Conversion Plan · Ages {convRows[0]?.age}–
              {convRows[convRows.length - 1]?.age} · {domLabel}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={barData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="yr"
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  tickFormatter={(v) => fmtK(v)}
                  width={46}
                />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="10%" stackId="br" fill="#1d4ed8" name="10%" />
                <Bar dataKey="12%" stackId="br" fill="#0ea5e9" name="12%" />
                <Bar dataKey="22%" stackId="br" fill="#14b8a6" name="22%" />
                <Bar dataKey="24%" stackId="br" fill="#fbbf24" name="24%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="32%" stackId="br" fill="#f97316" name="32%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="35%" stackId="br" fill="#ef4444" name="35%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="37%" stackId="br" fill="#991b1b" name="37%" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <table className="roth-tbl" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Age</th>
                  <th>Label</th>
                  <th>Conversion</th>
                  <th>Fed Tax</th>
                  <th>State Tax</th>
                  <th>Bracket</th>
                  <th title="Why conversion was capped this year">Cap</th>
                  <th>Eff Rate</th>
                  <th>Net→Roth</th>
                </tr>
              </thead>
              <tbody>
                {convRows.map((r) => (
                  <tr
                    key={r.yr}
                    className={r.label === "Golden Year ★" ? "gold" : ""}
                  >
                    <td>{r.yr}</td>
                    <td style={{ color: "#94a3b8" }}>{r.age}</td>
                    <td
                      style={{
                        color: r.label.includes("Golden")
                          ? "#fbbf24"
                          : "#94a3b8",
                        fontWeight: r.label.includes("Golden") ? 700 : 400,
                      }}
                    >
                      {r.label}
                    </td>
                    <td style={{ color: "#e2e8f0" }}>{fmtM(r.conv)}</td>
                    <td style={{ color: "#f87171" }}>{fmtM(r.fedT)}</td>
                    <td style={{ color: isNoTaxState ? "#34d399" : "#fb923c" }}>
                      {isNoTaxState ? "$0" : fmtM(r.stT)}
                    </td>
                    <td
                      style={{
                        color:
                          r.bracketUsed === "24%"
                            ? "#fbbf24"
                            : r.bracketUsed === "22%"
                            ? "#5eead4"
                            : "#94a3b8",
                        fontSize: 10,
                      }}
                    >
                      {r.bracketUsed}
                    </td>
                    <td
                      style={{
                        color: r.capReason && r.capReason.startsWith("mode")
                          ? "#64748b"
                          : "#fb923c",
                        fontSize: 9,
                      }}
                      title={r.capReason || ""}
                    >
                      {r.capReason || "-"}
                    </td>
                    <td style={{ color: "#94a3b8" }}>
                      {(r.effR * 100).toFixed(1)}%
                    </td>
                    <td style={{ color: "#14b8a6", fontWeight: 600 }}>
                      {fmtM(r.conv - r.fedT - (isNoTaxState ? 0 : r.stT))}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                  <td style={{ fontWeight: 700 }} colSpan={3}>
                    Total
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmtM(opt.cConv)}</td>
                  <td style={{ color: "#f87171", fontWeight: 700 }}>
                    {fmtM(convRows.reduce((s, r) => s + r.fedT, 0))}
                  </td>
                  <td
                    style={{
                      color: isNoTaxState ? "#34d399" : "#fb923c",
                      fontWeight: 700,
                    }}
                  >
                    {isNoTaxState
                      ? "$0"
                      : fmtM(convRows.reduce((s, r) => s + r.stT, 0))}
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td style={{ color: "#14b8a6", fontWeight: 700 }}>
                    {fmtM(
                      convRows.reduce(
                        (s, r) => s + r.conv - r.fedT - (isNoTaxState ? 0 : r.stT),
                        0
                      )
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="chart-card">
            <div className="ct">
              Projected Account Balances · Pre-Tax vs Roth
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={opt.rows.filter((_, i) => i % 2 === 0)}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="age"
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  tickFormatter={(v) => fmtM(v)}
                  width={54}
                />
                <Tooltip content={<Tip />} />
                <Bar dataKey="pT" name="Pre-Tax" stackId="a" fill="#1e3a5f" />
                <Bar
                  dataKey="ro"
                  name="Roth"
                  stackId="a"
                  fill="#0d9488"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            <div className="met">
              <div className="ml">Savings at Age 90 — Without</div>
              <div className="mv" style={{ color: "#94a3b8", fontSize: 16 }}>
                {fmtM(cur.rows[cur.rows.length - 1]?.nw || 0)}
              </div>
            </div>
            <div className="met">
              <div className="ml">Savings at Age 90 — With Conversions</div>
              <div className="mv" style={{ color: "#5eead4", fontSize: 16 }}>
                {fmtM(opt.rows[opt.rows.length - 1]?.nw || 0)}
              </div>
            </div>
          </div>
          {rmdYears.length > 0 && (
            <div className="chart-card">
              <div className="ct">
                Required Minimum Distributions · Joint & Last Survivor Table
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div className="met">
                  <div className="ml">Lifetime RMDs — Without</div>
                  <div
                    className="mv"
                    style={{ color: "#f87171", fontSize: 16 }}
                  >
                    {fmtM(cur.cRmd)}
                  </div>
                </div>
                <div className="met">
                  <div className="ml">Lifetime RMDs — With Conversions</div>
                  <div
                    className="mv"
                    style={{ color: "#34d399", fontSize: 16 }}
                  >
                    {fmtM(opt.cRmd)}
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={rmdYears.filter((_, i) => i % 2 === 0)}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="age"
                    stroke="#1e3a5f"
                    tick={{ fill: "#475569", fontSize: 9 }}
                  />
                  <YAxis
                    stroke="#1e3a5f"
                    tick={{ fill: "#475569", fontSize: 9 }}
                    tickFormatter={(v) => fmtK(v)}
                    width={46}
                  />
                  <Tooltip content={<Tip />} />
                  <Bar
                    dataKey="curRmd"
                    name="RMD — No Convert"
                    fill="rgba(239,68,68,0.4)"
                  />
                  <Bar
                    dataKey="optRmd"
                    name="RMD — With Convert"
                    fill="rgba(16,185,129,0.5)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {(() => {
            const g = convRows.find((r) => r.label === "Golden Year ★");
            return g ? (
              <div
                style={{
                  fontSize: 11,
                  color: "#7c3aed",
                  background: "rgba(124,58,237,0.08)",
                  borderRadius: 7,
                  padding: "7px 11px",
                  border: "1px solid rgba(124,58,237,0.2)",
                }}
              >
                ★ Golden year {g.yr} (age {g.age}): last year before Social
                Security begins. Maximum bracket room up to the 24% ceiling.
                Once SS starts, available space compresses — prioritize larger
                conversions here.
              </div>
            ) : null;
          })()}
        </>
      )}
      {view === "comparison" && (
        <>
          <div className="chart-card">
            <div className="ct">Effective Federal Tax Rate · Year-by-Year</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={opt.rows.filter((_, i) => i % 2 === 0)}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="age"
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  tickFormatter={(v) => (v * 100).toFixed(0) + "%"}
                  width={36}
                />
                <Tooltip content={<Tip />} />
                <Line
                  type="monotone"
                  dataKey="effR"
                  name="Optimized Rate"
                  stroke="#0d9488"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <div className="ct">
              Tax Liability Comparison · Optimized vs Current Plan
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div className="met">
                <div className="ml">Lifetime Taxes — Without</div>
                <div className="mv" style={{ color: "#94a3b8", fontSize: 16 }}>
                  {fmtM(cur.cTax)}
                </div>
              </div>
              <div className="met">
                <div className="ml">Lifetime Taxes — With Conversions</div>
                <div
                  className="mv"
                  style={{
                    color: taxD > 0 ? "#fb923c" : "#34d399",
                    fontSize: 16,
                  }}
                >
                  {fmtM(opt.cTax)}
                </div>
              </div>
            </div>
          </div>
          <div className="chart-card">
            <div className="ct">IRMAA Fees · Medicare Premium Surcharges</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <div className="met">
                <div className="ml">Lifetime IRMAA — Without</div>
                <div className="mv" style={{ fontSize: 16 }}>
                  {cur.cIrmaa > 0 ? fmtM(cur.cIrmaa) : "$0"}
                </div>
              </div>
              <div className="met">
                <div className="ml">Lifetime IRMAA — With Conversions</div>
                <div className="mv" style={{ fontSize: 16 }}>
                  {opt.cIrmaa > 0 ? fmtM(opt.cIrmaa) : "$0"}
                </div>
              </div>
            </div>
            {opt.cIrmaa === 0 && cur.cIrmaa === 0 && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "#475569",
                  textAlign: "center",
                }}
              >
                ✅ No IRMAA surcharges projected in either scenario
              </div>
            )}
          </div>
        </>
      )}
      {view === "table" && (
        <div className="chart-card" style={{ overflowX: "auto" }}>
          <div className="ct">Year-by-Year Comparison Table</div>
          <table className="roth-tbl">
            <thead>
              <tr>
                <th>Year</th>
                <th>Age</th>
                <th>Opt Rate</th>
                <th>Cur Rate</th>
                <th>Opt Tax</th>
                <th>Cur Tax</th>
                <th>Opt RMD</th>
                <th>Cur RMD</th>
              </tr>
            </thead>
            <tbody>
              {opt.rows
                .filter((r) => r.age >= 60 && r.age <= 90)
                .filter((_, i) => i % 2 === 0 || i < 12)
                .map((r) => {
                  const c = cur.rows.find((cr) => cr.yr === r.yr);
                  return (
                    <tr key={r.yr} className={r.conv > 0 ? "gold" : ""}>
                      <td>{r.yr}</td>
                      <td style={{ color: "#94a3b8" }}>{r.age}</td>
                      <td>{(r.effR * 100).toFixed(0)}%</td>
                      <td>{c ? (c.effR * 100).toFixed(0) : "0"}%</td>
                      <td style={{ color: "#f87171" }}>{fmtM(r.totT)}</td>
                      <td style={{ color: "#94a3b8" }}>
                        {c ? fmtM(c.totT) : "$0"}
                      </td>
                      <td style={{ color: "#34d399" }}>
                        {r.rmd > 0 ? fmtM(r.rmd) : "-"}
                      </td>
                      <td style={{ color: "#f87171" }}>
                        {c && c.rmd > 0 ? fmtM(c.rmd) : "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <div
        style={{
          fontSize: 9,
          color: "#334155",
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        This analysis is for planning purposes only. Consult a tax professional
        before executing Roth conversions. Progressive fed brackets (IRS Rev.
        Proc. 2025-32) · NJ graduated rates · Joint & Last Survivor RMD table ·
        7% growth assumption
      </div>
    </div>
  );
}

function DeterministicWithdrawalView({ p, inf, withdrawalStrategy }) {
  const [showTable, setShowTable] = useState(false);
  const data = useMemo(
    () => simulateDeterministicWithStrategy(p, inf, withdrawalStrategy),
    [p, inf, withdrawalStrategy]
  );
  const { schedule, portAtRetire, initWR } = data;
  const chartData = schedule.map((s) => ({
    age: s.age,
    "Total Withdrawal": s.totalWithdrawal,
    "Portfolio End": s.portfolioEnd,
    Spending: s.spending,
  }));

  if (!schedule || schedule.length === 0) {
    return <div className="chart-card">No data available. Run Monte Carlo first.</div>;
  }

  const strategyLabel = {
    gk: "Guyton‑Klinger", fixed: "Fixed %", vanguard: "Vanguard Dynamic",
    risk: "Risk‑Based", kitces: "Kitces Ratcheting",
    vpw: "VPW", cape: "CAPE‑Based", endowment: "Endowment (Yale)",
    one_n: "1/N", ninety_five_rule: "95% Rule",
  }[withdrawalStrategy] || withdrawalStrategy;

  return (
    <>
      <div className="chart-card">
        <div className="ct">
          📈 Deterministic Schedule – {strategyLabel} · Median historical returns
          ({CALIB.phase1Mean}% pre‑62 / {CALIB.phase2Mean}% after) · Inflation {inf}%
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "#475569", fontSize: 10 }} />
            <YAxis yAxisId="port" stroke="#1e3a5f" tick={{ fill: "#475569", fontSize: 10 }} tickFormatter={(v) => fmtM(v)} width={58} />
            <YAxis yAxisId="spend" orientation="right" stroke="#1e3a5f" tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(v) => fmtK(v)} width={52} />
            <Tooltip content={<Tip />} />
            <Line yAxisId="spend" type="monotone" dataKey="Spending" stroke="#fbbf24" strokeWidth={2.5} dot={false} name="Spending" />
            <Line yAxisId="spend" type="monotone" dataKey="Total Withdrawal" stroke="#f87171" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Total Withdrawal (inc. tax)" />
            <Line yAxisId="port" type="monotone" dataKey="Portfolio End" stroke="#14b8a6" strokeWidth={2.5} dot={false} name="Portfolio Balance" />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="leg">
          <div className="li"><div className="ll" style={{ background: "#fbbf24" }} />Spending</div>
          <div className="li"><div className="ll" style={{ background: "#f87171" }} />Total Withdrawal (inc. tax)</div>
          <div className="li"><div className="ll" style={{ background: "#14b8a6" }} />Portfolio Balance</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div className="met"><div className="ml">Portfolio at Retirement</div><div className="mv" style={{ color: "#5eead4" }}>{fmtM(portAtRetire)}</div><div className="ms">Median accumulation</div></div>
        <div className="met"><div className="ml">Initial Withdrawal Rate</div><div className="mv" style={{ color: "#fbbf24" }}>{(initWR * 100).toFixed(1)}%</div><div className="ms">Pre‑tax spending / portfolio</div></div>
        <div className="met"><div className="ml">Final Portfolio (Age {schedule[schedule.length - 1]?.age})</div><div className="mv" style={{ color: schedule[schedule.length - 1]?.portfolioEnd > 0 ? "#34d399" : "#ef4444" }}>{fmtM(schedule[schedule.length - 1]?.portfolioEnd || 0)}</div><div className="ms">{schedule[schedule.length - 1]?.portfolioEnd > 0 ? "Survives" : "Exhausted"}</div></div>
      </div>

      <div className="chart-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="ct">📋 Year‑by‑Year Schedule</div>
          <button onClick={() => setShowTable(!showTable)} className="mbtn" style={{ fontSize: 10, padding: "3px 8px" }}>{showTable ? "Hide Table" : "Show Table"}</button>
        </div>
        {showTable && (
          <div style={{ overflowX: "auto" }}>
            <table className="nw-table" style={{ fontSize: 11 }}>
              <thead><tr><th>Age</th><th>Year</th><th>Spending</th><th>SS</th><th>Airbnb</th><th>Portfolio Draw</th><th>Fed Tax</th><th>State Tax</th><th>IRMAA</th><th>Total Withdrawal</th><th>Portfolio End</th></tr></thead>
              <tbody>
                {schedule.map((s) => (
                  <tr key={s.age}>
                    <td style={{ textAlign: "left" }}>{s.age}</td><td>{s.yr}</td>
                    <td style={{ color: "#fbbf24" }}>{fmtM(s.spending)}</td>
                    <td>{fmtM(s.ss)}</td><td>{fmtM(s.airbnb)}</td><td>{fmtM(s.portfolioDraw)}</td>
                    <td style={{ color: "#f87171" }}>{fmtM(s.fedTax)}</td>
                    <td style={{ color: "#fb923c" }}>{fmtM(s.stateTax)}</td>
                    <td style={{ color: "#a78bfa" }}>{fmtM(s.irmaa)}</td>
                    <td style={{ color: "#94a3b8" }}>{fmtM(s.totalWithdrawal)}</td>
                    <td style={{ color: "#14b8a6", fontWeight: 600 }}>{fmtM(s.portfolioEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flag-i" style={{ fontSize: 11 }}>
        ℹ️ Deterministic (median) path – shows how the {strategyLabel} strategy would behave in a single "typical" sequence of returns. Actual outcomes will vary.
      </div>
    </>
  );
}

function BucketsTab({ params = {} }) {
  const port = params.port || 0;
  const retireAge = params.retireAge || 60;
  const currentAge = params.currentAge || 50;
  const yrsToRetire = Math.max(0, retireAge - currentAge);
  const retireYear = new Date().getFullYear() + yrsToRetire;
  const bucketPcts = [6, 16, 78];
  const bucketTargets = bucketPcts.map((pct) =>
    port > 0 ? fmtM((port * pct) / 100) : `${pct}%`
  );
  const buckets = [
    {
      name: "Bucket 1 — Cash / Short-term",
      target: bucketTargets[0],
      pct: bucketPcts[0],
      color: "#0ea5e9",
      purpose:
        "Living expenses 3-5yr runway. GK floor mechanism. NEVER dual-purpose.",
      holdings: "Cash · Money market · Short-term Treasuries",
      locked: `Draws begin at retirement (age ${retireAge})`,
    },
    {
      name: "Bucket 2 — Income Sleeve",
      target: bucketTargets[1],
      pct: bucketPcts[1],
      color: "#a78bfa",
      purpose:
        "Dividend/income generation. Starts AT retirement. Reduces portfolio WR.",
      holdings: "Dividend equities · Covered-call income · REITs",
      locked: `Activates at retirement (${retireYear})`,
    },
    {
      name: "Bucket 3 — Growth",
      target: bucketTargets[2],
      pct: bucketPcts[2],
      color: "#10b981",
      purpose:
        "Never touch 7-10 years. Compounding engine. Draw only when Bucket 1 depleted.",
      holdings: "Broad-market equity · Momentum · International",
      locked: `Never before age ${retireAge + 7}`,
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="chart-card">
        <div className="ct">
          3-Bucket strategy · Section 0.G · GK guardrails govern all draws
        </div>
        {buckets.map((b) => (
          <div
            key={b.name}
            style={{
              marginBottom: 12,
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${b.color}33`,
              borderRadius: 9,
              padding: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: b.color }}>
                {b.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: b.color,
                  fontFamily: "'DM Mono',monospace",
                }}
              >
                {b.target} · {b.pct}%
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
              {b.purpose}
            </div>
            <div style={{ fontSize: 10, color: "#475569" }}>
              <span style={{ color: b.color }}>Holdings:</span> {b.holdings}
            </div>
            <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>
              🔒 {b.locked}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function ScenariosTab({
 baseParams,
  r90,
  stress,
  retireAge,
  ssAge,
  rmdAge,
  inf,
  real,
  fmtPct,
  FanChart,
  SEQ_2000_2012,
  DeterministicWithdrawalView,
  RothLadder,
  BucketsTab,
  SmileChart,
  withdrawalStrategy,   // ✅ only once
}) {

  const [scenarioSubTab, setScenarioSubTab] = useState("stress");

  const SCENARIO_SUBTABS = [
    ["stress", "🔶 Stress"],
    ["withdrawal", "💸 Withdrawal Analysis"],
    ["roth", "🔄 Roth"],
    ["buckets", "🪣 Buckets"],
    ["smile", "🙂 Smile"],
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 12,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          paddingBottom: 8,
        }}
      >
        {SCENARIO_SUBTABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setScenarioSubTab(key)}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background:
                scenarioSubTab === key
                  ? "rgba(255,255,255,0.1)"
                  : "transparent",
              color: scenarioSubTab === key ? "#e2e8f0" : "#475569",
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {scenarioSubTab === "stress" && stress && (
        <div>
          <FanChart
            pcts={stress.pcts}
            retireAge={retireAge}
            ssAge={ssAge}
            rmdAge={rmdAge}
            inf={inf}
            useReal={real}
            title="Stress test: 2000–2012 actual S&P sequence at retirement"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 10,
            }}
          >
            <div className="met">
              <div className="ml">Stress success</div>
              <div
                className="mv"
                style={{ color: stress.rate >= 0.85 ? "#0d9488" : "#f59e0b" }}
              >
                {fmtPct(stress.rate)}
              </div>
            </div>
            <div className="met">
              <div className="ml">Delta vs base</div>
              <div
                className="mv"
                style={{
                  color: r90 && stress.rate >= r90.rate ? "#0d9488" : "#ef4444",
                }}
              >
                {r90 ? `${((stress.rate - r90.rate) * 100).toFixed(1)}pp` : "—"}
              </div>
            </div>
          </div>
          <div
            style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}
          >
            {SEQ_2000_2012.map((r, i) => (
              <span
                key={i}
                style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: "'DM Mono',monospace",
                  background:
                    r < 0 ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.12)",
                  color: r < 0 ? "#f87171" : "#34d399",
                  border: `1px solid ${
                    r < 0 ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.25)"
                  }`,
                }}
              >
                {2000 + i}: {r > 0 ? "+" : ""}
                {(r * 100).toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {scenarioSubTab === "withdrawal" && (
        <DeterministicWithdrawalView p={baseParams} inf={inf} withdrawalStrategy={withdrawalStrategy} />
      )}

      {scenarioSubTab === "roth" && <RothLadder params={baseParams} />}
      {scenarioSubTab === "buckets" && <BucketsTab params={baseParams} />}
      {scenarioSubTab === "smile" && <SmileChart p={baseParams} inf={inf} />}
    </div>
  );
}

function MCTab({ params, r85, r90, stress, running, onRun }) {
  const [showInputs, setShowInputs] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const accPhase = `Age ${params.currentAge} → ${params.retireAge}`;
  const retPhase = `Age ${params.retireAge} → ${params.endAge}`;
  const mortSched = params.mortBalance > 0
    ? mortgageSchedule(params.mortBalance, params.mortRate || 6.5, params.mortStart || "2020-01", params.mortTerm || 30, params.mortExtra || 0)
    : null;
  const mortAnnual = mortSched ? mortSched.pmt * 12 : 0;
  const mortPayoffAge = mortSched
    ? params.currentAge + (mortSched.payoffYr - new Date().getFullYear())
    : 0;
  const rateColor = (r) =>
    r >= 0.9
      ? "#0d9488"
      : r >= 0.8
      ? "#34d399"
      : r >= 0.7
      ? "#fbbf24"
      : r >= 0.6
      ? "#f97316"
      : "#ef4444";
  const riskLabel = (r) =>
    r >= 0.9
      ? "Low risk — strong plan. As JL Collins would say — F-You Money."
      : r >= 0.8
      ? "Moderate risk — solid foundation. Consider small adjustments."
      : r >= 0.7
      ? "Elevated risk — plan needs some work."
      : "High risk — most scenarios deplete savings before target age.";
  const SectionHeader = ({ label, open, onToggle, color = "#5eead4" }) => (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        marginBottom: open ? 14 : 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 10, color: "#475569" }}>
        {open ? "▲ Hide" : "▼ Show"}
      </div>
    </div>
  );
  const InputCard = ({ title, rows }) => (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 9,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {rows.map(([label, val]) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
            fontSize: 12,
          }}
        >
          <span style={{ color: "#64748b" }}>{label}</span>
          <span
            style={{
              color: "#e2e8f0",
              fontFamily: "'DM Mono',monospace",
              fontWeight: 500,
            }}
          >
            {val}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#e2e8f0",
            marginBottom: 10,
          }}
        >
          WHAT IS A MONTE CARLO SIMULATION?
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>
          A Monte Carlo simulation tests your retirement plan against{" "}
          <strong style={{ color: "#e2e8f0" }}>
            3,000 different market scenarios
          </strong>{" "}
          using randomized annual returns drawn from 99 years of actual S&P 500
          history. Instead of assuming a single fixed growth rate, it models the
          real-world uncertainty of markets — some years boom, some years crash
          — and tells you how often your savings last through retirement.{" "}
          <strong style={{ color: "#5eead4" }}>
            A success rate above 85% is generally considered a solid plan.
          </strong>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
          AiRA also applies{" "}
          <strong style={{ color: "#fbbf24" }}>
            Guyton-Klinger guardrails
          </strong>{" "}
          — your spending adapts each year based on portfolio performance, so
          the simulation reflects how a real retiree would behave, not a robot
          spending a fixed amount no matter what.
        </div>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <SectionHeader
          label="Simulation Inputs & Assumptions"
          open={showInputs}
          onToggle={() => setShowInputs(!showInputs)}
        />
        {showInputs && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#0ea5e9",
                  marginBottom: 10,
                }}
              >
                ACCUMULATION PHASE ({accPhase})
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 10,
                }}
              >
                <InputCard
                  title="Starting Balances"
                  rows={[
                    ...((params.accounts || [])
                      .filter((a) => (a.balance || 0) > 0)
                      .map((a) => [a.name || a.category, fmtM(a.balance || 0)])),
                    ["Total liquid", fmtM(params.port)],
                  ]}
                />
                <InputCard
                  title="Annual Contributions"
                  rows={[
                    ["Total savings", fmtK(params.contrib || 0) + "/yr"],
                    [
                      "Years contributing",
                      Math.max(0, params.retireAge - params.currentAge) + " yrs",
                    ],
                    [
                      "Projected added",
                      fmtK((params.contrib || 0) * Math.max(0, params.retireAge - params.currentAge)),
                    ],
                  ]}
                />
                <InputCard
                  title="Plan Parameters"
                  rows={[
                    ["Current age", "Age " + params.currentAge],
                    ["Retire age", "Age " + params.retireAge],
                    [
                      "Years to retirement",
                      Math.max(0, params.retireAge - params.currentAge) + " yrs",
                    ],
                    [
                      "Pre-retirement glide",
                      `${params.preRetireEq ?? 91}% equity / ${100 - (params.preRetireEq ?? 91)}% bonds`,
                    ],
                    [
                      "Post-retirement glide",
                      `${params.postRetireEq ?? 70}% equity / ${100 - (params.postRetireEq ?? 70)}% bonds`,
                    ],
                  ]}
                />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#a78bfa",
                  marginBottom: 10,
                }}
              >
                WITHDRAWAL PHASE ({retPhase})
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 10,
                }}
              >
                <InputCard
                  title="Living Expenses"
                  rows={[
                    ["Base annual spend", fmtM(params.sp) + "/yr"],
                    ["Inflation model", params.smile ? "Blanchett smile" : "Flat"],
                    [`Go-go (${params.retireAge}–${Math.min(74, params.endAge)})`, "115% of base"],
                    [`Slow-go (75–${Math.min(84, params.endAge)})`, "85% of base"],
                  ]}
                />
                <InputCard
                  title="Income Offsets"
                  rows={[
                    [
                      "Social Security",
                      `$${(params.ssb || 0).toLocaleString()}/yr @ ${params.ssAge || "—"}`,
                    ],
                    ["SS COLA", `${params.ssCola ?? 2.4}%/yr`],
                    [
                      `Rental net (${params.abReliability ?? 80}% reliable)`,
                      params.useAb ? `$${(params.ab || 0).toLocaleString()}/yr` : "Off",
                    ],
                    [
                      "SS gap",
                      `Ages ${params.retireAge}–${(params.ssAge || params.retireAge) - 1}: $0`,
                    ],
                  ]}
                />
                <InputCard
                  title="Additional Costs"
                  rows={[
                    [
                      `Healthcare (age ${params.hcShockAge ?? 72}+)`,
                      `${params.hcProb ?? 3.5}% shock prob/yr`,
                    ],
                    [
                      "Shock range",
                      `${fmtK(params.hcMin ?? 70000)}–${fmtK(params.hcMax ?? 130000)}`,
                    ],
                    [
                      "Mortgage annual",
                      mortAnnual > 0 ? fmtM(mortAnnual) + "/yr" : "Paid off",
                    ],
                    ["Mortgage payoff", mortPayoffAge > 0 ? "~" + mortPayoffAge : "—"],
                  ]}
                />
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#34d399",
                  marginBottom: 10,
                }}
              >
                MARKET & STATISTICAL MODEL
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 10,
                }}
              >
                <InputCard
                  title="Return Distribution"
                  rows={[
                    ["Model", "Historical bootstrap"],
                    ["Equity data", "99yr S&P 500 (1928–2026)"],
                    [
                      `Pre-retire mix (${params.preRetireEq ?? 91}/${100 - (params.preRetireEq ?? 91)})`,
                      "Equity / Bonds",
                    ],
                    [
                      `Post-retire mix (${params.postRetireEq ?? 70}/${100 - (params.postRetireEq ?? 70)})`,
                      "Equity / Bonds",
                    ],
                  ]}
                />
                <InputCard
                  title="Inflation & Guardrails"
                  rows={[
                    ["Inflation", "Historical bootstrap"],
                    ["Inflation source", "2000–2024 actual CPI"],
                    ["GK floor", fmtM(params.gkFloor) + "/yr"],
                    ["GK ceiling", fmtM(params.gkCeiling) + "/yr"],
                  ]}
                />
                <InputCard
                  title="Simulation Parameters"
                  rows={[
                    ["Simulations", "3,000 paths"],
                    [
                      "Horizons",
                      `Age 85 + Age ${params.endAge || 90}`,
                    ],
                    ["Withdrawal", "Guyton-Klinger"],
                    [
                      "Rental reliability",
                      `${params.abReliability ?? 80}% per year`,
                    ],
                  ]}
                />
              </div>
            </div>
          </>
        )}
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <SectionHeader
          label="How the Simulation Works"
          open={showHow}
          onToggle={() => setShowHow(!showHow)}
          color="#64748b"
        />
        {showHow && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              fontSize: 12,
              color: "#94a3b8",
              lineHeight: 1.7,
            }}
          >
            <div>
              <div
                style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              >
                1. Accumulation (ages {params.currentAge}–{params.retireAge})
              </div>
              Each of 3,000 paths independently draws a random S&P 500 year and
              a random bond year, blended by glide path weight. Contributions
              are added annually. The result is a unique portfolio value at
              retirement for each path.
            </div>
            <div>
              <div
                style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              >
                2. Retirement spending
              </div>
              Each path draws fresh random returns year by year. Spending
              follows the Blanchett smile curve. SS and Rental income offset
              draws. Rental fails 20% of years randomly. Healthcare shocks hit
              3.5% of years after age 72.
            </div>
            <div>
              <div
                style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              >
                3. Guyton-Klinger guardrails
              </div>
              Every year, if the current withdrawal rate exceeds 120% of the
              initial rate, spending cuts 10% (never below floor). If it falls
              below 80%, spending increases 10% (never above ceiling). This
              mimics real retiree behavior.
            </div>
            <div>
              <div
                style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              >
                4. Survival check
              </div>
              A path "succeeds" if the portfolio balance stays above $0 through
              the target age. The success rate is the percentage of paths that
              survive. The fan chart shows the 10th–90th percentile spread of
              all outcomes.
            </div>
          </div>
        )}
      </div>
      {!r90 && (
        <div
          style={{
            textAlign: "center",
            padding: "20px",
            color: "#475569",
            fontSize: 13,
          }}
        >
          {running
            ? "Running 6,000 paths..."
            : "Run Monte Carlo from the sidebar to see results here."}
        </div>
      )}
      {r90 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          <div
            style={{
              background: `${rateColor(r90.rate)}12`,
              border: `1.5px solid ${rateColor(r90.rate)}44`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
              }}
            >
              SUCCESS RATE ⓘ
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 900,
                color: rateColor(r90.rate),
                fontFamily: "'DM Mono',monospace",
                lineHeight: 1,
                marginBottom: 6,
              }}
            >
              {fmtPct(r90.rate)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
              of 3,000 simulations last to age {params.endAge}
            </div>
            <div
              style={{
                fontSize: 12,
                color: rateColor(r90.rate),
                marginBottom: 14,
                lineHeight: 1.5,
              }}
            >
              {riskLabel(r90.rate)}
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.07)",
                paddingTop: 10,
                display: "flex",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 9,
                    color: "#475569",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  To age 85
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: rateColor(r85?.rate || 0),
                    fontFamily: "'DM Mono',monospace",
                  }}
                >
                  {r85 ? fmtPct(r85.rate) : "—"}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  textAlign: "center",
                  borderLeft: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "#475569",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Stress test
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: rateColor(stress?.rate || 0),
                    fontFamily: "'DM Mono',monospace",
                  }}
                >
                  {stress ? fmtPct(stress.rate) : "—"}
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
              }}
            >
              MEDIAN FINAL BALANCE ⓘ
            </div>
            <div
              style={{
                fontSize: 42,
                fontWeight: 900,
                color: "#14b8a6",
                fontFamily: "'DM Mono',monospace",
                lineHeight: 1,
                marginBottom: 6,
              }}
            >
              {fmtM(r90.term.p50)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
              50th percentile at age {params.endAge}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                lineHeight: 1.5,
                marginBottom: 14,
              }}
            >
              Half of all simulations end above this. A higher balance cushions
              against sequence-of-returns risk.
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.07)",
                paddingTop: 10,
              }}
            >
              {[
                { l: "10th (near-worst)", v: r90.term.p10, c: "#f87171" },
                { l: "25th (cautious)", v: r90.term.p25, c: "#fbbf24" },
                { l: "75th (good case)", v: r90.term.p75, c: "#34d399" },
                { l: "90th (best 10%)", v: r90.term.p90, c: "#5eead4" },
              ].map(({ l, v, c }) => (
                <div
                  key={l}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 5,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "#475569" }}>{l}</span>
                  <span
                    style={{
                      color: c,
                      fontFamily: "'DM Mono',monospace",
                      fontWeight: 600,
                    }}
                  >
                    {fmtM(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 12,
              }}
            >
              MODEL ASSUMPTIONS
            </div>
            {[
              ["3,000 randomized return sequences", "#5eead4"],
              ["99yr S&P 500 + 50yr Bloomberg Agg bootstrap", "#5eead4"],
              ["Separate equity & bond draws each year", "#5eead4"],
              ["Rental income fails 20% of years randomly", "#fbbf24"],
              ["Healthcare shocks 3.5%/yr from age 72", "#fbbf24"],
              ["Guyton-Klinger guardrails each path", "#a78bfa"],
              ["Blanchett smile spending (not flat)", "#a78bfa"],
              ["SS COLA 2.4%/yr · Rental growth 3%/yr", "#94a3b8"],
              [
                params.tax
                  ? "Tax drag modeled (pre/post SS/RMD)"
                  : "Tax drag OFF",
                "#94a3b8",
              ],
              ["Glide path: 91/9 → 70/30 at age 62", "#94a3b8"],
            ].map(([text, color]) => (
              <div
                key={text}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  marginBottom: 7,
                  fontSize: 11,
                }}
              >
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: color,
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "#64748b", lineHeight: 1.4 }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MortgageTab({ values, onChange }) {
  const bal   = values.mortBalance || 0;
  const rate  = values.mortRate    || 6.5;
  const extra = values.mortExtra   || 0;
  const start = values.mortStart   || "2020-01";
  const term  = values.mortTerm    || 30;

  const sched   = useMemo(() => mortgageSchedule(bal, rate, start, term, extra),  [bal, rate, start, term, extra]);
  const schedNE = useMemo(() => mortgageSchedule(bal, rate, start, term, 0),       [bal, rate, start, term]);
  const chartData = useMemo(() => {
    const maxLen = Math.max(sched.years.length, schedNE.years.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      yr: new Date().getFullYear() + i,
      "With extra": sched.years[i]?.bal ?? 0,
      Original:     schedNE.years[i]?.bal ?? 0,
    }));
  }, [sched, schedNE]);

  // Properties state — sourced from assumptions via values
  const properties = values.properties || [
    { id:"p1", label:"Primary Residence", value:0, mortgage:0, income:0 },
    { id:"p2", label:"Property 2",        value:0, mortgage:0, income:0 },
  ];

  const updateProp = (id, field, val) => {
    const updated = properties.map(p => p.id === id ? { ...p, [field]: val } : p);
    onChange("properties", updated);
    // Keep primary mortgage in sync with mortgage calculator
    if (id === properties[0]?.id && field === "mortgage") {
      onChange("mortBalance", val);
    }
  };

  const updateLabel = (id, label) => {
    onChange("properties", properties.map(p => p.id === id ? { ...p, label } : p));
  };

  const addProperty = () => {
    if (properties.length >= 5) return;
    onChange("properties", [
      ...properties,
      { id:"p"+Date.now(), label:`Property ${properties.length + 1}`, value:0, mortgage:0, income:0 },
    ]);
  };

  const removeProperty = (id) => {
    if (properties.length <= 1) return;
    onChange("properties", properties.filter(p => p.id !== id));
  };

  const totalValue    = properties.reduce((s, p) => s + (p.value||0), 0);
  const totalMortgage = properties.reduce((s, p) => s + (p.mortgage||0), 0);
  const totalEquity   = totalValue - totalMortgage;
  const totalIncome   = properties.reduce((s, p) => s + (p.income||0), 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      {/* ── PROPERTY CARDS ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0" }}>Properties</div>
          {properties.length < 5 && (
            <button onClick={addProperty}
              style={{ padding:"4px 12px", borderRadius:6,
                border:"1px dashed rgba(13,148,136,0.4)", background:"transparent",
                color:"#0d9488", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
              + Add property
            </button>
          )}
        </div>

        {properties.map((prop, idx) => {
          const equity  = (prop.value||0) - (prop.mortgage||0);
          const isFirst = idx === 0;
          return (
            <div key={prop.id} style={{
              background: isFirst ? "rgba(13,148,136,0.05)" : "rgba(255,255,255,0.03)",
              border:`1px solid ${isFirst ? "rgba(13,148,136,0.25)" : "rgba(255,255,255,0.08)"}`,
              borderRadius:10, padding:14,
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <input type="text" value={prop.label}
                  onChange={e => updateLabel(prop.id, e.target.value)}
                  style={{ fontSize:13, fontWeight:600, color:"#e2e8f0",
                    background:"transparent", border:"none", outline:"none",
                    borderBottom:"1px solid rgba(255,255,255,0.12)",
                    padding:"2px 0", width:180, fontFamily:"'DM Sans',sans-serif" }}/>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {isFirst && (
                    <span style={{ fontSize:9, color:"#0d9488",
                      background:"rgba(13,148,136,0.1)", border:"1px solid rgba(13,148,136,0.3)",
                      borderRadius:8, padding:"2px 7px" }}>
                      Primary · wired to mortgage calc
                    </span>
                  )}
                  {properties.length > 1 && (
                    <button onClick={() => removeProperty(prop.id)}
                      style={{ background:"transparent", border:"none", color:"#475569",
                        cursor:"pointer", fontSize:13, padding:"2px 4px", transition:"color 0.15s" }}
                      onMouseEnter={e=>e.currentTarget.style.color="#f87171"}
                      onMouseLeave={e=>e.currentTarget.style.color="#475569"}>
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:10, color:"#64748b", marginBottom:4 }}>Gross value</div>
                  <DualInput label="" value={prop.value||0} min={0} max={5_000_000} step={5_000}
                    format={v=>fmtM(v)} onChange={v=>updateProp(prop.id,"value",v)}/>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#64748b", marginBottom:4 }}>Mortgage balance</div>
                  <DualInput label="" value={prop.mortgage||0} min={0} max={3_000_000} step={1_000}
                    format={v=>fmtM(v)} onChange={v=>updateProp(prop.id,"mortgage",v)}/>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#64748b", marginBottom:4 }}>Annual income (opt)</div>
                  <DualInput label="" value={prop.income||0} min={0} max={200_000} step={1_000}
                    format={v=>fmtK(v)+"/yr"} onChange={v=>updateProp(prop.id,"income",v)}/>
                </div>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:10, color:"#64748b" }}>Net equity:</span>
                <span style={{ fontSize:13, fontWeight:700,
                  fontFamily:"'DM Mono',monospace",
                  color: equity >= 0 ? "#10b981" : "#f87171" }}>
                  {equity < 0 ? "-" : ""}{fmtM(Math.abs(equity))}
                </span>
                {(prop.income||0) > 0 && (
                  <span style={{ fontSize:10, color:"#059669" }}>
                    · {fmtK(prop.income)}/yr income
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Totals row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {[
            { l:"Total value",    v:totalValue,    c:"#0ea5e9" },
            { l:"Total mortgage", v:totalMortgage, c:"#f87171" },
            { l:"Total equity",   v:totalEquity,   c:"#10b981" },
            { l:"Annual income",  v:totalIncome,   c:"#a78bfa" },
          ].map(m => (
            <div key={m.l} className="met">
              <div className="ml">{m.l}</div>
              <div className="mv" style={{ color:m.c, fontSize:16 }}>{fmtM(m.v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PRIMARY MORTGAGE CALCULATOR ── */}
      <div className="chart-card">
        <div className="ct">{properties[0]?.label || "Primary Residence"} · Mortgage calculator</div>

        <div className="metrics" style={{ marginBottom:12 }}>
          <div className="met">
            <div className="ml">Current balance</div>
            <div className="mv" style={{ color:"#0ea5e9", fontSize:18 }}>{fmtM(bal)}</div>
          </div>
          <div className="met">
            <div className="ml">Payoff year</div>
            <div className="mv" style={{ color:"#10b981", fontSize:18 }}>{sched.payoffYr}</div>
            <div className="ms">With ${extra}/mo extra</div>
          </div>
          <div className="met">
            <div className="ml">Interest saved</div>
            <div className="mv" style={{ color:"#34d399", fontSize:18 }}>{fmtM(sched.interestSaved)}</div>
            <div className="ms">vs no extra</div>
          </div>
          <div className="met">
            <div className="ml">Monthly P&I</div>
            <div className="mv" style={{ color:"#94a3b8", fontSize:18 }}>{fmtM(sched.pmt)}</div>
            <div className="ms">At {rate}% fixed</div>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
          <DualInput label="Balance" value={bal} min={0} max={1_500_000} step={1_000}
            format={v=>fmtM(v)}
            onChange={v=>{ onChange("mortBalance",v); updateProp(properties[0]?.id,"mortgage",v); }}/>
          <DualInput label="Rate %" value={rate} min={0} max={12} step={0.125}
            format={v=>v.toFixed(3)+"%"} onChange={v=>onChange("mortRate",v)}/>
          <DualInput label="Term (yrs)" value={term} min={10} max={30} step={1}
            format={v=>v+" yrs"} onChange={v=>onChange("mortTerm",v)}/>
          <DualInput label="Extra/mo" value={extra} min={0} max={5_000} step={50}
            format={v=>"$"+v.toLocaleString()+"/mo"} onChange={v=>onChange("mortExtra",v)}/>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:11, color:"#94a3b8", minWidth:70 }}>Start date</span>
            <input type="month" value={start} onChange={e=>onChange("mortStart",e.target.value)}
              style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0",
                borderRadius:4, padding:"4px 8px", fontSize:11, fontFamily:"'DM Mono',monospace" }}/>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top:8, right:8, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)"/>
            <XAxis dataKey="yr" stroke="#1e3a5f" tick={{ fill:"#475569", fontSize:9 }}/>
            <YAxis stroke="#1e3a5f" tick={{ fill:"#475569", fontSize:9 }}
              tickFormatter={v=>fmtM(v)} width={54}/>
            <Tooltip content={<Tip/>}/>
            <Line type="monotone" dataKey="With extra" stroke="#10b981" strokeWidth={2.5} dot={false}/>
            <Line type="monotone" dataKey="Original" stroke="#475569" strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── AMORTIZATION TABLE ── */}
      <div className="chart-card">
        <div className="ct">Amortization — first 10 years with extra payments</div>
        <table className="nw-table">
          <thead>
            <tr><th>Year</th><th>Principal</th><th>Interest</th><th>Extra</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {sched.years.slice(0,10).map(r => (
              <tr key={r.yr}>
                <td style={{ textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>{r.yr}</td>
                <td>{fmtM(r.pPaid)}</td>
                <td style={{ color:"#f87171" }}>{fmtM(r.iPaid)}</td>
                <td style={{ color:"#34d399" }}>{fmtM(r.ePaid)}</td>
                <td style={{ color:"#0ea5e9" }}>{fmtM(r.bal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetWorthTab({ p, results90, inf }) {
  const [showRE, setShowRE] = useState(false);
  const props    = p.properties || [];
  const reTotal   = props.reduce((s, pr) => s + (pr.value||0), 0);
  const reMortgs  = props.reduce((s, pr) => s + (pr.mortgage||0), 0);
  const reEquity  = reTotal - reMortgs;
  const mortSched = useMemo(
    () =>
      mortgageSchedule(
        p.mortBalance,
        p.mortRate,
        p.mortStart,
        p.mortTerm,
        p.mortExtra
      ),
    [p]
  );

  const nwData = useMemo(() => {
    if (!results90) return [];
    
    // Build ages dynamically: from current age to plan end age, step 5
    const maxChartAge = p.endAge;
    const step = 5;
    const ages = [];
    for (let age = p.currentAge; age <= maxChartAge; age += step) {
      ages.push(age);
    }
    
    return ages.map((age, idx) => {
      const yr = new Date().getFullYear() + idx * step;
      // Map age to closest index in results90.pcts (which goes to age 90)
      const pctIndex = Math.min(
        Math.max(0, age - p.retireAge),
        results90.pcts.length - 1
      );
      const port = results90.pcts[pctIndex]?.p50 || 0;
      const mortEntry = mortSched.years.find((y) => y.yr === yr);
      const mortBal = mortEntry ? mortEntry.bal : 0;
      const yearsFromNow = yr - new Date().getFullYear();
      const reGrow = Math.pow(1 + (p.reGrowthRate ?? 3.0) / 100, yearsFromNow);
      const re = showRE ? Math.round(reTotal * reGrow) : 0;
      return {
        age,
        "Liquid Portfolio": port,
        "Mortgage Debt": -mortBal,
        "Real Estate": re,
        "Net Worth": port + re - mortBal,
      };
    });
  }, [p, results90, showRE, mortSched, reTotal]);

  // Peak liquid portfolio (median) – from full MC horizon (age 90) – optional note
  const peakPort = results90
    ? Math.max(...results90.pcts.map((d) => d.p50))
    : 0;
  const peakAge = results90
    ? p.retireAge + results90.pcts.findIndex((d) => d.p50 === peakPort)
    : 0;

  // Final net worth at the user's plan age (p.endAge)
  const finalNW = nwData[nwData.length - 1]?.["Net Worth"] || 0;
  const planAge = p.endAge;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="metrics">
        <div className="met">
          <div className="ml">Peak liquid (median)*</div>
          <div className="mv" style={{ color: "#10b981", fontSize: 18 }}>
            {fmtM(peakPort)}
          </div>
          <div className="ms">Age {peakAge}</div>
        </div>
        <div className="met">
          <div className="ml">Net worth at age {planAge}</div>
          <div className="mv" style={{ color: "#0ea5e9", fontSize: 18 }}>
            {fmtM(finalNW)}
          </div>
          <div className="ms">{showRE ? "Incl." : "Excl."} real estate</div>
        </div>
        <div className="met">
          <div className="ml">Mortgage‑free</div>
          <div className="mv" style={{ color: "#a78bfa", fontSize: 18 }}>
            {mortSched.payoffYr}
          </div>
          <div className="ms">With extra payments</div>
        </div>
        <div className="met">
          <div className="ml">Real estate equity</div>
          <div className="mv" style={{ color: "#fbbf24", fontSize: 18 }}>
            {fmtM(reEquity)}
          </div>
          <div className="ms">NOT in liquid total</div>
        </div>
      </div>

      <div className="chart-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="ct" style={{ margin: 0 }}>
              Net worth projection · 5‑year intervals to age {planAge} · median MC path
            </div>
            <span
              style={{ cursor: "pointer", color: "#64748b", fontSize: 12 }}
              title="Liquid Portfolio = investments (excl. real estate). Mortgage Debt shown as negative (dashed red line). Net Worth = Liquid + Real Estate - Mortgage Debt."
            >
              ⓘ
            </span>
          </div>
          <Toggle
            val={showRE}
            onChange={setShowRE}
            label="Include RE"
            accent="#fbbf24"
          />
        </div>

        <ResponsiveContainer width="100%" height={230}>
          <LineChart
            data={nwData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="age"
              stroke="#1e3a5f"
              tick={{ fill: "#475569", fontSize: 9 }}
            />
            <YAxis
              stroke="#1e3a5f"
              tick={{ fill: "#475569", fontSize: 9 }}
              tickFormatter={(v) => fmtM(v)}
              width={54}
            />
            <Tooltip content={<Tip />} />
            <Line
              type="monotone"
              dataKey="Liquid Portfolio"
              stroke="#0ea5e9"
              strokeWidth={2.5}
              dot={false}
            />
            {showRE && (
              <Line
                type="monotone"
                dataKey="Real Estate"
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="Mortgage Debt"
              stroke="#f87171"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Net Worth"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="leg" style={{ marginTop: 8, justifyContent: "center" }}>
          <div className="li"><div className="ll" style={{ background: "#0ea5e9" }} />Liquid Portfolio</div>
          <div className="li"><div className="ll" style={{ background: "#f87171", borderTop: "1px dashed #f87171", height: 2 }} />Mortgage Debt (dashed)</div>
          {showRE && <div className="li"><div className="ll" style={{ background: "#fbbf24" }} />Real Estate</div>}
          <div className="li"><div className="ll" style={{ background: "#10b981" }} />Net Worth</div>
        </div>

        {/* Footnote about peak age */}
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 6, textAlign: "center" }}>
          * Peak liquid based on full Monte Carlo horizon (age 90). May exceed your plan age.
        </div>
      </div>

      {!results90 && (
        <div className="flag-i">
          ℹ Run Monte Carlo first to see net worth projections.
        </div>
      )}
    </div>
  );
}

function generateActions({
  params,
  r90,
  r85,
  assumptions,
  mortgagePayoffYear,
  currentYear,
  retireYear,
  daysToRetire,
  goal = 3_200_000,
  fafsaEndYear = 2029,
}) {
  const actions = [];
  const swr = (params.sp / params.port) * 100;
  const isNoTaxState = params.twoHousehold;
  const _accts = assumptions.accounts || [];
  const preTaxTotal = _accts.filter(a => a.category === "pretax").reduce((s, a) => s + (a.balance || 0), 0);
  const _rothTotal = _accts.filter(a => a.category === "roth").reduce((s, a) => s + (a.balance || 0), 0);
  const rothPct = params.port > 0 ? _rothTotal / params.port : 0;
  const preTaxPct = params.port > 0 ? preTaxTotal / params.port : 0;
  const successRate = r90 ? r90.rate : 0;
  const portFundedPct = (params.port / goal) * 100;

  // 🔴 RED rules
  if (r90 && successRate < 0.80) {
    actions.push({
      priority: "red",
      category: "Monte Carlo",
      action: "Success rate below 80%",
      reason: `${(successRate * 100).toFixed(1)}% — plan needs restructuring`,
      deadline: "Now",
    });
  }
  if (r90 && successRate < 0.70) {
    actions.push({
      priority: "red",
      category: "Monte Carlo",
      action: "Plan failure risk — urgent review",
      reason: `Less than 70% success to age ${params.endAge}`,
      deadline: "Now",
    });
  }
  if (swr > 5.0) {
    actions.push({
      priority: "red",
      category: "Withdrawal Rate",
      action: "Withdrawal rate dangerously high",
      reason: `${swr.toFixed(1)}% — safe benchmark is 4%`,
      deadline: "Now",
    });
  }
  if (preTaxPct > 0.75) {
    actions.push({
      priority: "red",
      category: "Tax",
      action: "Pre-tax concentration — RMD bomb",
      reason: `${(preTaxPct * 100).toFixed(0)}% in taxable accounts, RMD age 73`,
      deadline: "Before age 66",
    });
  }
  if (daysToRetire < 730 && !isNoTaxState) {
    actions.push({
      priority: "red",
      category: "Domicile",
      action: "FL domicile not established",
      reason: "NJ tax on withdrawals = ~$50K+ loss",
      deadline: "Before D-Day",
    });
  }
  if (portFundedPct < 60) {
    actions.push({
      priority: "red",
      category: "Savings",
      action: `Portfolio below 60% of goal (${(portFundedPct).toFixed(0)}%)`,
      reason: `${(goal - params.port).toLocaleString()} gap remaining`,
      deadline: "Now",
    });
  }

  // 🟡 YELLOW rules
  if (currentYear <= fafsaEndYear) {
    actions.push({
      priority: "yellow",
      category: "FAFSA/CSS",
      action: "Minimize AGI — FAFSA years active",
      reason: `CSS/FAFSA through ${fafsaEndYear} — cap Roth conversions at 12%`,
      deadline: `Spring ${fafsaEndYear}`,
    });
  }
  if (portFundedPct < 75) {
    actions.push({
      priority: "yellow",
      category: "Savings",
      action: "Increase contributions or reduce spend",
      reason: `${portFundedPct.toFixed(0)}% funded — ${params.retireAge - params.currentAge} years to D-Day`,
      deadline: "D-Day",
    });
  }
  if (mortgagePayoffYear > retireYear) {
    actions.push({
      priority: "yellow",
      category: "Mortgage",
      action: "Mortgage outlasts retirement date",
      reason: `Payoff ${mortgagePayoffYear} — balance remains at D-Day`,
      deadline: "Pre-retirement",
    });
  }
  const _hsaBal = (assumptions.accounts || []).filter(a => a.category === "hsa").reduce((s, a) => s + (a.balance || 0), 0);
  if (_hsaBal < 50000) {
    actions.push({
      priority: "yellow",
      category: "HSA",
      action: "Maximize HSA contributions",
      reason: `Current HSA $${_hsaBal.toLocaleString()} — triple tax advantage`,
      deadline: "Each year",
    });
  }
  if (rothPct < 0.25) {
    actions.push({
      priority: "yellow",
      category: "Roth",
      action: "Roth balance low — conversion needed",
      reason: `${(rothPct * 100).toFixed(0)}% Roth — target 40%+ before RMDs`,
      deadline: "Ages 61-72",
    });
  }
  if (daysToRetire < 1460) {
    actions.push({
      priority: "yellow",
      category: "Liquidity",
      action: "Bucket 1 funding — confirm cash",
      reason: `D-Day in ${Math.ceil(daysToRetire / 365)} years — need 2yr expenses liquid`,
      deadline: "1 year before D-Day",
    });
  }
  if (params.ssAge > 64) {
    actions.push({
      priority: "yellow",
      category: "Social Security",
      action: "Confirm SS claiming age",
      reason: `Each year delay = 8% increase — verify break-even at age ${params.ssAge}`,
      deadline: "Before retirement",
    });
  }
  const taxableBrok = assumptions.taxableBrok|| 0;
  if (taxableBrok < 50000) {
    actions.push({
      priority: "yellow",
      category: "Emergency Fund",
      action: "Build emergency dry powder",
      reason: `Less than $50K liquid taxable — sequence risk`,
      deadline: "Now",
    });
  }

  // 🟢 GREEN rules
  if (r90 && successRate >= 0.90) {
    actions.push({
      priority: "green",
      category: "Monte Carlo",
      action: "Plan on track — stay the course",
      reason: `${(successRate * 100).toFixed(1)}% success — JL Collins would approve`,
      deadline: "Ongoing",
    });
  }
  if (swr <= 3.5) {
    actions.push({
      priority: "green",
      category: "Withdrawal Rate",
      action: "Withdrawal rate conservative",
      reason: `${swr.toFixed(1)}% — strong margin of safety`,
      deadline: "Monitor",
    });
  }
  if (mortgagePayoffYear <= retireYear) {
    actions.push({
      priority: "green",
      category: "Mortgage",
      action: "Mortgage paid off before retirement",
      reason: `Payoff ${mortgagePayoffYear} — debt-free at D-Day ✅`,
      deadline: "✅ Done",
    });
  }
  if (r90 && successRate >= 0.85 && swr <= 4) {
    actions.push({
      priority: "green",
      category: "Guardrails",
      action: "Guyton-Klinger guardrails healthy",
      reason: `Floor ${params.gkFloor?.toLocaleString()} · Ceiling ${params.gkCeiling?.toLocaleString()} · WR ${swr.toFixed(1)}%`,
      deadline: "Monitor",
    });
  }
  if (rothPct >= 0.30) {
    actions.push({
      priority: "green",
      category: "Roth",
      action: "Roth allocation healthy",
      reason: `${(rothPct * 100).toFixed(0)}% Roth — reducing future RMD exposure`,
      deadline: "Monitor",
    });
  }
  if (portFundedPct >= 85) {
    actions.push({
      priority: "green",
      category: "Savings",
      action: `On pace for ${(goal / 1e6).toFixed(1)}M goal`,
      reason: `${portFundedPct.toFixed(0)}% funded · ${params.retireAge - params.currentAge} years remaining`,
      deadline: "D-Day",
    });
  }

  // Sort: red → yellow → green
  return actions.sort((a, b) => {
    const order = { red: 0, yellow: 1, green: 2 };
    return order[a.priority] - order[b.priority];
  });
}
// Replace the existing ActionPlanTab with this dynamic version
function ActionPlanTab({ params, r90, r85, assumptions, mortgagePayoffYear }) {
  const currentYear = new Date().getFullYear();
  const retireYear = currentYear + ((params?.retireAge || 60) - (params?.currentAge || 56));
  const daysToRetire = Math.max(0,
    Math.floor((new Date(`${retireYear}-03-15`) - new Date()) / 86400000)
  );

  if (!params || !r90) {
    return (
      <div className="chart-card" style={{ textAlign:"center", padding:"40px 20px" }}>
        <div style={{ fontSize:14, color:"#94a3b8", marginBottom:8 }}>🎲 Monte Carlo not run yet</div>
        <div style={{ fontSize:12, color:"#64748b" }}>Press ▶ Run Monte Carlo to generate your personalized action plan.</div>
      </div>
    );
  }

  const dynActions = generateActions({
    params, r90, r85, assumptions, mortgagePayoffYear,
    currentYear, retireYear, daysToRetire,
    goal: assumptions?.portfolioGoal || 3_200_000,
  });

  const colors = {
    red:    { bg:"rgba(239,68,68,0.08)",   border:"rgba(239,68,68,0.25)",   label:"#f87171", badge:"🔴 Critical" },
    yellow: { bg:"rgba(245,158,11,0.08)",  border:"rgba(245,158,11,0.25)",  label:"#fbbf24", badge:"🟡 Important" },
    green:  { bg:"rgba(16,185,129,0.08)",  border:"rgba(16,185,129,0.25)",  label:"#34d399", badge:"🟢 On Track" },
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {dynActions.map((a, i) => {
        const c = colors[a.priority];
        return (
          <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`,
            borderRadius:9, padding:"11px 15px",
            display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
                letterSpacing:"0.08em", color:c.label, marginBottom:3 }}>
                {c.badge} · {a.category}
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:"#f1f5f9", marginBottom:2 }}>
                {a.action}
              </div>
              <div style={{ fontSize:11, color:"#64748b" }}>{a.reason}</div>
            </div>
            <div style={{ fontSize:11, color:"#475569", whiteSpace:"nowrap",
              marginLeft:16, paddingTop:2 }}>⏱ {a.deadline}</div>
          </div>
        );
      })}
    </div>
  );
}
function ProfileWizard({ values, onChange }) {
  const [step, setStep] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");
  const flashStatus = (msg) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(""), 2000);
  };
  const handleSave = () => {
    const ok = saveProfileToLocal(values);
    flashStatus(ok ? "✓ Saved to this browser" : "✗ Save failed (localStorage blocked)");
  };
  const handleReload = () => {
    const saved = loadProfileFromLocal();
    if (!saved) {
      flashStatus("No saved profile found");
      return;
    }
    if (!window.confirm("Restore your last saved profile? Unsaved changes will be overwritten.")) return;
    Object.entries(saved).forEach(([k, v]) => {
      if (k === "savedAt" || k === "buildTag") return;
      onChange(k, v);
    });
    flashStatus("✓ Restored saved profile");
  };
  const savedMeta = (() => {
    const s = loadProfileFromLocal();
    if (!s || !s.savedAt) return null;
    try { return new Date(s.savedAt).toLocaleString(); } catch { return s.savedAt; }
  })();

  const STEPS = [
    { label: "About You", icon: "👤", sub: `${values.currentAge} yrs old` },
    { label: "Current Savings", icon: "💰", sub: `${fmtM(values.port)} saved` },
    { label: "Contributions", icon: "📋", sub: `${fmtK(values.contrib)}/yr` },
    { label: "Retirement Plan", icon: "🎯", sub: `Age ${values.retireAge}` },
    {
      label: "Other Income",
      icon: "🏖",
      sub: `$${(values.ab / 1000).toFixed(0)}K/yr`,
    },
    { label: "Assumptions", icon: "⚙️", sub: "Model parameters" },
  ];

  const PANELS = [
    <AboutYouPanel values={values} onChange={onChange} />,
    <SavingsPanel values={values} onChange={onChange} />,
    <ContribPanel values={values} onChange={onChange} />,
    <RetirementPanel values={values} onChange={onChange} />,
    <IncomePanel values={values} onChange={onChange} />,
    <AssumptionsPanel values={values} onChange={onChange} />,
  ];

  return (
    <div
      className="wizard-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        alignItems: "start",
        flexShrink: 0,
      }}
    >
      {/* LEFT SIDEBAR */}
      <div
        className="wizard-sidebar"
        style={{ borderRight: "1px solid rgba(255,255,255,0.06)", padding: 16 }}
      >
        {STEPS.map((s, i) => (
          <div
            key={i}
            onClick={() => setStep(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              marginBottom: 4,
              cursor: "pointer",
              background: i === step ? "rgba(13,148,136,0.15)" : "transparent",
              border:
                i === step
                  ? "1px solid rgba(13,148,136,0.3)"
                  : "1px solid transparent",
            }}
          >
            {/* Dot */}
            <div
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                flexShrink: 0,
                background:
                  i < step
                    ? "#0d9488"
                    : i === step
                    ? "#14b8a6"
                    : "rgba(255,255,255,0.1)",
                border: `2px solid ${
                  i <= step ? "#0d9488" : "rgba(255,255,255,0.15)"
                }`,
                boxShadow: i === step ? "0 0 8px #0d948866" : "none",
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: i === step ? "#e2e8f0" : "#64748b",
                }}
              >
                {s.icon} {s.label}
              </div>
              <div style={{ fontSize: 10, color: "#334155" }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* RIGHT PANEL */}
       <div className="wizard-panel" style={{ padding: 24 }}>
        {/* Save bar — visible on every wizard step */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            marginBottom: 16,
            background: "rgba(13,148,136,0.08)",
            border: "1px solid rgba(13,148,136,0.25)",
            borderRadius: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#5eead4" }}>
              Profile Save
            </div>
            <div style={{ fontSize: 10, color: "#64748b" }}>
              {savedMeta
                ? `Last saved to this browser: ${savedMeta}`
                : "No saved profile in this browser yet"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {saveStatus && (
              <span style={{ fontSize: 11, color: "#5eead4" }}>{saveStatus}</span>
            )}
            <button
              onClick={handleReload}
              disabled={!savedMeta}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: savedMeta ? "#94a3b8" : "#334155",
                cursor: savedMeta ? "pointer" : "not-allowed",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              🔁 Reload Saved
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "6px 14px",
                borderRadius: 7,
                border: "none",
                background: "linear-gradient(135deg,#0d9488,#14b8a6)",
                color: "white",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
                fontWeight: 600,
              }}
            >
              💾 Save
            </button>
          </div>
        </div>
        {/* Mobile step selector — only visible when sidebar is hidden */}
        <div className="wizard-mobile-steps" style={{ marginBottom: 16 }}>
          <select
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            style={{ width:"100%", background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"'Inter',sans-serif" }}
          >
            {STEPS.map((s, i) => (
              <option key={i} value={i}>{s.icon} {s.label}</option>
            ))}
          </select>
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#e2e8f0",
            marginBottom: 4,
          }}
        >
          {STEPS[step].icon} {STEPS[step].label}
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
          {STEPS[step].sub}
        </div>

        {/* Panel content */}
        {PANELS[step]}

        {/* Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: step === 0 ? "#334155" : "#94a3b8",
              cursor: step === 0 ? "not-allowed" : "pointer",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            ← Previous
          </button>

          <div style={{ fontSize: 11, color: "#334155" }}>
            {step + 1} / {STEPS.length}
          </div>

          {/* Only show Next button if not on page 6 (step index 5) */}
          {step !== 5 && (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={step === STEPS.length - 1}
              style={{
                padding: "7px 18px",
                borderRadius: 7,
                border: "none",
                background: "linear-gradient(135deg,#0d9488,#14b8a6)",
                color: "white",
                cursor: step === STEPS.length - 1 ? "not-allowed" : "pointer",
                fontSize: 12,
                fontFamily: "inherit",
                fontWeight: 600,
              }}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SavingsPanel({ values, onChange }) {
  const GOAL = 3_200_000;
  const accounts = values.accounts || BLANK_PROFILE.accounts;

  const CATEGORIES = [
    { key: "pretax",  label: "Pre-Tax",        color: "#0ea5e9", defaultName: "401(k)" },
    { key: "roth",    label: "Roth",           color: "#a78bfa", defaultName: "Roth IRA" },
    { key: "taxable", label: "Taxable",        color: "#fbbf24", defaultName: "Brokerage" },
    { key: "hsa",     label: "HSA",            color: "#34d399", defaultName: "HSA" },
    { key: "cash",    label: "Cash / Savings", color: "#94a3b8", defaultName: "Savings" },
  ];

  const catSum = (cat) => accounts.filter(a => a.category === cat).reduce((s, a) => s + (a.balance || 0), 0);
  const autoTotal = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const percentToGoal = Math.min(100, (autoTotal / GOAL) * 100);
  const remaining = Math.max(0, GOAL - autoTotal);

  const updateAccounts = (newAccounts) => {
    onChange("accounts", newAccounts);
    const total = newAccounts.reduce((s, a) => s + (a.balance || 0), 0);
    onChange("port", total);
  };

  const handleBalance = (id, bal) => {
    const newAccounts = accounts.map(a => a.id === id ? { ...a, balance: bal } : a);
    updateAccounts(newAccounts);
  };

  const handleName = (id, name) => {
    const newAccounts = accounts.map(a => a.id === id ? { ...a, name } : a);
    onChange("accounts", newAccounts);
  };

  const addAccount = (cat) => {
    const def = CATEGORIES.find(c => c.key === cat);
    const newAccounts = [...accounts, { id: Date.now().toString(), category: cat, name: def ? def.defaultName : cat, balance: 0 }];
    onChange("accounts", newAccounts);
  };

  const removeAccount = (id, cat) => {
    const catAccounts = accounts.filter(a => a.category === cat);
    if (catAccounts.length <= 1) return;
    const newAccounts = accounts.filter(a => a.id !== id);
    updateAccounts(newAccounts);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {CATEGORIES.map(cat => {
        const catAccounts = accounts.filter(a => a.category === cat.key);
        return (
          <div key={cat.key} style={{
            background:"rgba(255,255,255,0.02)", borderRadius:8,
            borderLeft:`3px solid ${cat.color}`, padding:"8px 12px",
          }}>
            <div style={{ fontSize:11, color:cat.color, fontWeight:600, marginBottom:6, fontFamily:"'DM Sans',sans-serif" }}>
              {cat.label}
            </div>
            {catAccounts.map(acct => (
              <div key={acct.id} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                <input
                  type="text" value={acct.name}
                  onChange={e => handleName(acct.id, e.target.value)}
                  style={{
                    width:100, fontSize:11, color:"#e2e8f0", background:"transparent",
                    border:"1px solid rgba(255,255,255,0.06)", borderRadius:4, padding:"2px 6px",
                    fontFamily:"'DM Sans',sans-serif", outline:"none",
                  }}
                  onFocus={e => { e.target.style.borderColor = cat.color + "66"; }}
                  onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.06)"; }}
                />
                <div style={{ flex:1 }}>
                  <DualInput label="" value={acct.balance} min={0} max={5_000_000} step={5_000}
                    format={v => fmtM(v)} onChange={v => handleBalance(acct.id, v)} />
                </div>
                <button
                  onClick={() => removeAccount(acct.id, acct.category)}
                  title={catAccounts.length <= 1 ? "Cannot remove last account in category" : "Remove account"}
                  style={{
                    background:"transparent", border:"none", color:"#64748b", cursor: catAccounts.length <= 1 ? "not-allowed" : "pointer",
                    fontSize:14, lineHeight:1, padding:"2px 4px", opacity: catAccounts.length <= 1 ? 0.2 : 0.4,
                    transition:"opacity 0.15s, color 0.15s",
                  }}
                  onMouseEnter={e => { if (catAccounts.length > 1) { e.target.style.opacity = 1; e.target.style.color = "#f87171"; } }}
                  onMouseLeave={e => { e.target.style.opacity = catAccounts.length <= 1 ? 0.2 : 0.4; e.target.style.color = "#64748b"; }}
                >x</button>
              </div>
            ))}
            <button onClick={() => addAccount(cat.key)} style={{
              background:"transparent", border:`1px dashed ${cat.color}33`, borderRadius:4,
              color:cat.color, fontSize:11, padding:"2px 8px", cursor:"pointer", opacity:0.6,
              marginTop:2, transition:"opacity 0.15s",
            }}
            onMouseEnter={e => { e.target.style.opacity = 1; }}
            onMouseLeave={e => { e.target.style.opacity = 0.6; }}
            >+ Add</button>
          </div>
        );
      })}

      {/* Auto-total summary */}
      <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
          <span style={{ fontSize:12, color:"#e2e8f0" }}>🎯 $3.2M Goal Progress</span>
          <span style={{ fontSize:14, fontWeight:700, color:"#5eead4", fontFamily:"'DM Mono',monospace" }}>
            {percentToGoal.toFixed(1)}%
          </span>
        </div>
        <div style={{ height:10, background:"rgba(255,255,255,0.1)", borderRadius:5, overflow:"hidden" }}>
          <div style={{ width:`${percentToGoal}%`, height:"100%",
            background:"linear-gradient(90deg,#0d9488,#14b8a6)", borderRadius:5, transition:"width 0.3s" }} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6, marginTop:12 }}>
          {[
            { label:"Pre-Tax", val:catSum("pretax"),  color:"#0ea5e9" },
            { label:"Roth",    val:catSum("roth"),     color:"#a78bfa" },
            { label:"Taxable", val:catSum("taxable"),  color:"#fbbf24" },
            { label:"HSA",     val:catSum("hsa"),      color:"#34d399" },
            { label:"Cash",    val:catSum("cash"),     color:"#94a3b8" },
          ].map(s => (
            <div key={s.label} style={{ textAlign:"center" }}>
              <div style={{ fontSize:10, color:"#475569" }}>{s.label}</div>
              <div style={{ fontSize:12, fontWeight:700, color:s.color, fontFamily:"'DM Mono',monospace" }}>{fmtM(s.val)}</div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, fontSize:11, color:"#64748b" }}>
          <span>Total: <strong style={{ color:"#e2e8f0" }}>{fmtM(autoTotal)}</strong></span>
          <span>Remaining: <strong style={{ color:"#f87171" }}>{fmtM(remaining)}</strong></span>
        </div>
      </div>
    </div>
  );
}

function AboutYouPanel({ values, onChange }) {
  const formatDateForInput = (dateStr) => {
      if (!dateStr) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 10);
        }
      } catch(e) {}
      return "";
    };

  // Derive currentAge from values.dob (if valid)
  const derivedAge = useMemo(() => {
    if (!values.dob) return null;
    try {
      const dobDate = new Date(values.dob);
      if (isNaN(dobDate.getTime())) return null;
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
      return age;
    } catch {
      return null;
    }
  }, [values.dob]);

  // Years to retirement (uses derivedAge if available, otherwise values.currentAge fallback)
  const currentAgeForCalc = derivedAge ?? values.currentAge;
  const yearsToRetire = Math.max(0, values.retireAge - currentAgeForCalc);
  const yearsInRetire = Math.max(0, values.endAge - values.retireAge);
  const totalHorizon = yearsToRetire + yearsInRetire;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* DOB Input + derived age */}
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
          Date of Birth
        </div>
        <input type="date" value={formatDateForInput(values.dob)}
          onChange={(e) => onChange("dob", e.target.value)}
              style={{
                width: "100%",
                background: "#0d1b2a",
                border: "1px solid #1e3a5f",
                color: "#e2e8f0",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 13,
                fontFamily: "'DM Mono',monospace",
              }}
        />
        {derivedAge !== null && (
          <div style={{ fontSize: 11, color: "#5eead4", marginTop: 6 }}>
            Current age: <strong>{derivedAge}</strong> (calculated from DOB)
          </div>
        )}
        {derivedAge === null && values.dob && (
          <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>
            Invalid date format. Use YYYY-MM-DD.
          </div>
        )}
      </div>

      {/* Retirement Age slider (unchanged) */}
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
          Retirement Age
        </div>
        <Slider
          label=""
          value={values.retireAge}
          min={50}
          max={75}
          step={1}
          format={(v) => `${v} yrs`}
          onChange={(v) => onChange("retireAge", v)}
        />
      </div>

      {/* Planning Horizon (endAge) slider (unchanged) */}
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
          Planning Horizon
        </div>
        <Slider
          label=""
          value={values.endAge}
          min={75}
          max={100}
          step={1}
          format={(v) => `to age ${v}`}
          onChange={(v) => onChange("endAge", v)}
        />
      </div>

      {/* Summary row (uses derived age) */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: "14px 20px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        {[
          {
            label: "Years to retirement",
            val: yearsToRetire,
            color: "#14b8a6",
          },
          {
            label: "Years in retirement",
            val: yearsInRetire,
            color: "#a78bfa",
          },
          {
            label: "Total planning horizon",
            val: `${totalHorizon} yrs`,
            color: "#e2e8f0",
          },
        ].map((m) => (
          <div key={m.label}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
              {m.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: m.color,
                fontFamily: "'DM Mono',monospace",
                lineHeight: 1,
              }}
            >
              {m.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Stable module-level helpers for AssumptionsPanel ──────────────────
   Defined OUTSIDE the component so their reference never changes between
   renders — prevents React from unmounting/remounting inputs on each keystroke.
*/
function ARow({ label, desc, children }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
      <div>
        <div style={{ fontSize:12, color:"#e2e8f0", fontWeight:500 }}>{label}</div>
        {desc && <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{desc}</div>}
      </div>
      <div style={{ marginLeft:16, flexShrink:0 }}>{children}</div>
    </div>
  );
}
function ANumInput({ value, onSet, min, max, step, suffix = "" }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <input
        type="number"
        value={value ?? ""}
        min={min} max={max} step={step}
        onChange={(e) => onSet(Number(e.target.value))}
        style={{ width:80, background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'DM Mono',monospace", textAlign:"right" }}
      />
      {suffix && <span style={{ fontSize:11, color:"#475569" }}>{suffix}</span>}
    </div>
  );
}
function AStateSelect({ value, onSet }) {
  return (
    <select
      value={value || "NJ"}
      onChange={(e) => onSet(e.target.value)}
      style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'DM Mono',monospace" }}
    >
      {Object.entries(STATE_TAX_RATES).map(([state, rate]) => (
        <option key={state} value={state}>{state} ({(rate * 100).toFixed(1)}%)</option>
      ))}
    </select>
  );
}
function ADateInput({ value, onSet }) {
  return (
    <input
      type="date"
      value={value || ""}
      onChange={(e) => onSet(e.target.value)}
      style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'DM Mono',monospace" }}
    />
  );
}

function AssumptionsPanel({ values, onChange }) {
  const {
    dob,
    abReliability,
    abGrowth,
    ssCola,
    preRetireEq,
    postRetireEq,
    hcShockAge,
    hcProb,
    hcMin,
    hcMax,
    ab,
    ssb,
  } = values;
  const derivedAge = dob
    ? Math.floor((new Date() - new Date(dob)) / (365.25 * 24 * 3600 * 1000))
    : "—";


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#0ea5e9",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          Personal Profile
        </div>
        <ARow
          label="Full Name"
          desc="Used in the exported JSON filename (AiRA_Profile_<name>_YYYY-MM-DD.json)."
        >
          <input
            type="text"
            value={values.name || ""}
            placeholder="Full Name"
            onChange={(e) => onChange("name", e.target.value)}
            style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'DM Mono',monospace" }}
          />
        </ARow>
        <ARow
          label="Date of Birth"
          desc={`Current age: ${derivedAge} · Used to derive D-Day and accumulation years`}
        >
          <ADateInput value={values.dob} onSet={(v) => onChange("dob", v)} />
        </ARow>
        <ARow
          label="State of Residence at Retirement"
          desc="State where RMD taxes will be applied. Use the Two Household toggle for out-of-country scenarios.">
          <AStateSelect value={values.stateOfResidence} onSet={(v) => onChange("stateOfResidence", v)} />
        </ARow>

        <ARow
          label="Rental net income / yr"
          desc="Net after expenses · Always use net, never gross"
        >
          <ANumInput value={values.ab} onSet={(v) => onChange("ab", v)} min={0} max={100000} step={1000} suffix="/yr" />
        </ARow>
        <ARow
          label="Social Security Benefit"
          desc="Monthly benefit at your SS start age"
        >
          <ANumInput value={values.ssb} onSet={(v) => onChange("ssb", v)} min={0} max={5000} step={100} suffix="/mo" />
        </ARow>
        <ARow label="Cash real return" desc="Annual real return on cash/savings (e.g., HYSA)">
          <ANumInput value={values.cashRealReturn} onSet={(v) => onChange("cashRealReturn", v)} min={0} max={3} step={0.1} suffix="%" />
        </ARow>
        <ARow label="Employer Start Date (Countdown to D-Day)" desc="Used for D-Day progress bar (when you started your last job) and counting days until D-Day">
          <ADateInput value={values.employerStartDate} onSet={(v) => onChange("employerStartDate", v)} />
        </ARow>
        <ARow label="Federal Filing Status" desc="MFJ doubles standard deduction ($32,200) and uses wider brackets. Single uses $16,100 deduction and narrower brackets.">
          <select
            value={values.filingStatus || "mfj"}
            onChange={(e) => onChange("filingStatus", e.target.value)}
            style={{ background:"#0a1628", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, cursor:"pointer" }}
          >
            <option value="mfj">Married Filing Jointly (MFJ)</option>
            <option value="single">Single</option>
          </select>
        </ARow>
        <ARow label="Home / RE Annual Growth" desc="Annual appreciation rate applied to real estate values in Net Worth projection">
          <ANumInput value={values.reGrowthRate} onSet={(v) => onChange("reGrowthRate", v)} min={0} max={10} step={0.5} suffix="%" />
        </ARow>
      <Toggle
        val={values.useJointRmdTable}
        onChange={(v) => onChange("useJointRmdTable", v)}
        label="👥 Use Joint & Last Survivor RMD Table (spouse >10 yrs younger)"
        accent="#a78bfa"
      />
      </div>

      {/* ── Expense Model ── */}
      <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#f59e0b", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>
          Expense Model
        </div>
        <div style={{ fontSize:11, color:"#475569", marginBottom:12 }}>
          Separate housing &amp; fixed obligations from core lifestyle spend. The MC engine adds each carveout to the portfolio draw automatically.
        </div>

        <ARow label="Housing type" desc="Own = mortgage P&I drawn from portfolio until payoff. Rent = inflation-adjusted annual rent. None = housing already in core spend.">
          <select
            value={values.housingType || "own"}
            onChange={(e) => onChange("housingType", e.target.value)}
            style={{ background:"#0a1628", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, cursor:"pointer" }}
          >
            <option value="own">Own (mortgage)</option>
            <option value="rent">Rent</option>
            <option value="none">None / already in spend</option>
          </select>
        </ARow>

        {(values.housingType || "own") === "rent" && (
          <ARow label="Annual rent" desc="Today's dollars — inflated each year in simulation">
            <ANumInput value={values.annualRent} onSet={(v) => onChange("annualRent", v)} min={0} max={60000} step={500} suffix="/yr" />
          </ARow>
        )}

        {/* Carveouts */}
        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:11, color:"#94a3b8", fontWeight:600, marginBottom:8 }}>
            Fixed Obligations (car loans, HOA, etc.)
          </div>
          {(values.carveouts || []).map((c, idx) => (
            <div key={c.id} style={{ display:"grid", gridTemplateColumns:"1fr 90px 80px 28px", gap:6, marginBottom:6, alignItems:"center" }}>
              <input
                type="text"
                value={c.label}
                placeholder="Label"
                onChange={(e) => {
                  const updated = [...(values.carveouts||[])];
                  updated[idx] = { ...c, label: e.target.value };
                  onChange("carveouts", updated);
                }}
                style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'DM Mono',monospace" }}
              />
              <input
                type="number"
                value={c.annual}
                min={0}
                step={100}
                placeholder="$/yr"
                onChange={(e) => {
                  const updated = [...(values.carveouts||[])];
                  updated[idx] = { ...c, annual: Number(e.target.value) };
                  onChange("carveouts", updated);
                }}
                style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'DM Mono',monospace", textAlign:"right" }}
              />
              <input
                type="number"
                value={c.endYear}
                min={2025}
                max={2080}
                step={1}
                placeholder="End yr"
                onChange={(e) => {
                  const updated = [...(values.carveouts||[])];
                  updated[idx] = { ...c, endYear: Number(e.target.value) };
                  onChange("carveouts", updated);
                }}
                style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'DM Mono',monospace", textAlign:"right" }}
              />
              <button
                onClick={() => onChange("carveouts", (values.carveouts||[]).filter((_,i) => i !== idx))}
                style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", color:"#f87171", borderRadius:5, cursor:"pointer", fontSize:13, padding:"2px 6px" }}
              >×</button>
            </div>
          ))}
          <div style={{ fontSize:9, color:"#334155", marginBottom:6 }}>Label · $/yr · End year (calendar year when obligation ends)</div>
          <button
            onClick={() => onChange("carveouts", [...(values.carveouts||[]), { id: Date.now().toString(), label:"", annual:0, endYear: new Date().getFullYear() + 5 }])}
            style={{ fontSize:11, background:"rgba(14,165,233,0.1)", border:"1px solid rgba(14,165,233,0.25)", color:"#38bdf8", borderRadius:6, padding:"5px 12px", cursor:"pointer" }}
          >+ Add obligation</button>
        </div>
      </div>

      {/* ── Roth Conversion Strategy ── */}
      <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#a78bfa", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>
          Roth Conversion Strategy
        </div>
        <div style={{ fontSize:11, color:"#475569", marginBottom:12 }}>
          After each year's spending withdrawal, AiRA converts additional pretax → Roth to fill up to your target bracket. Tax on conversion is funded from the pretax bucket.
        </div>
        <ARow label="Bracket-fill target" desc="AiRA converts pretax → Roth up to this bracket ceiling each year (off = no conversions)">
          <select
            value={values.rothConversionTarget || "off"}
            onChange={(e) => onChange("rothConversionTarget", e.target.value)}
            style={{ background:"#0a1628", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, cursor:"pointer" }}
          >
            <option value="off">Off — no conversions</option>
            <option value="12">Fill to top of 12% bracket</option>
            <option value="22">Fill to top of 22% bracket</option>
            <option value="24">Fill to top of 24% bracket</option>
            <option value="irmaa">IRMAA-safe (just below Tier 1)</option>
          </select>
        </ARow>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#34d399",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          Monte Carlo Model Parameters
        </div>
        <ARow label="Rental reliability" desc="Probability Rental income arrives in any given year (default 80%)">
          <ANumInput value={values.abReliability} onSet={(v) => onChange("abReliability", v)} min={0} max={100} step={5} suffix="%" />
        </ARow>
        <ARow label="Rental income growth / yr" desc="Annual growth rate for Rental income (default 3%)">
          <ANumInput value={values.abGrowth} onSet={(v) => onChange("abGrowth", v)} min={0} max={10} step={0.5} suffix="%" />
        </ARow>
        <ARow label="SS COLA / yr" desc="Social Security cost-of-living adjustment (default 2.4%)">
          <ANumInput value={values.ssCola} onSet={(v) => onChange("ssCola", v)} min={0} max={6} step={0.1} suffix="%" />
        </ARow>
        <ARow label="Pre-retirement equity weight" desc="Equity % before retirement age (default 91%)">
          <ANumInput value={values.preRetireEq} onSet={(v) => onChange("preRetireEq", v)} min={50} max={100} step={1} suffix="%" />
        </ARow>
        <ARow label="Post-retirement equity weight" desc="Equity % after retirement age (default 70%)">
          <ANumInput value={values.postRetireEq} onSet={(v) => onChange("postRetireEq", v)} min={30} max={90} step={1} suffix="%" />
        </ARow>
      </div>
      <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#f87171", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>
          Healthcare Shock Model
        </div>
        <div style={{ fontSize:11, color:"#475569", marginBottom:12 }}>
          In each simulation year after the shock age, there is a random probability of a large one-time healthcare cost.
        </div>
        <ARow label="Shock start age" desc="Age after which annual healthcare shocks can occur (default 72)">
          <ANumInput value={values.hcShockAge} onSet={(v) => onChange("hcShockAge", v)} min={60} max={85} step={1} suffix="yrs" />
        </ARow>
        <ARow label="Annual shock probability" desc="Chance of a shock in any given year (default 3.5%)">
          <ANumInput value={values.hcProb} onSet={(v) => onChange("hcProb", v)} min={0} max={20} step={0.5} suffix="%" />
        </ARow>
        <ARow label="Shock cost — minimum" desc="Low end of randomized healthcare shock cost (default $70K)">
          <ANumInput value={values.hcMin} onSet={(v) => onChange("hcMin", v)} min={0} max={200000} step={5000} suffix="$" />
        </ARow>
        <ARow label="Shock cost — maximum" desc="High end of randomized healthcare shock cost (default $130K)">
          <ANumInput value={values.hcMax} onSet={(v) => onChange("hcMax", v)} min={0} max={500000} step={5000} suffix="$" />
        </ARow>
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#334155",
          fontStyle: "italic",
          textAlign: "right",
        }}
      >
        Changes take effect on next Monte Carlo run · These replace all
        hardcoded simulation values
      </div>
    </div>
  );
}

function ContribPanel({ values, onChange }) {
  const annual401k = values.contrib || 0;
  const hsaAnnual = (values.hsaMonthly || 795.83) * 12;
  const employerMatch = values.employerMatch || 4.5;
  const matchAmount = (annual401k * employerMatch) / 100;
  const totalSavings = annual401k + hsaAnnual + matchAmount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
            401(k) Annual Contribution
          </div>
          <Slider
            label=""
            value={annual401k}
            min={0}
            max={80_000}
            step={500}
            format={(v) => fmtK(v) + "/yr"}
            onChange={(v) => onChange("contrib", v)}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
            HSA Monthly Contribution
          </div>
          <Slider
            label=""
            value={values.hsaMonthly || 795.83}
            min={0}
            max={1000}
            step={50}
            format={(v) => fmtM(v) + "/mo"}
            onChange={(v) => onChange("hsaMonthly", v)}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
            Employer Match (%)
          </div>
          <Slider
            label=""
            value={employerMatch}
            min={0}
            max={10}
            step={0.5}
            format={(v) => v.toFixed(1) + "%"}
            onChange={(v) => onChange("employerMatch", v)}
          />
        </div>
      </div>

      {/* Summary */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 18,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        {[
          { label: "401(k) Contribution", val: annual401k, color: "#0ea5e9" },
          { label: "Employer Match", val: matchAmount, color: "#34d399" },
          { label: "HSA Contribution", val: hsaAnnual, color: "#a78bfa" },
        ].map((m) => (
          <div key={m.label}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
              {m.label}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: m.color,
                fontFamily: "'DM Mono',monospace",
                lineHeight: 1,
              }}
            >
              {fmtK(m.val)}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "linear-gradient(135deg, #0d948818, #14b8a618)",
          border: "1px solid #0d948844",
          borderRadius: 10,
          padding: 18,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
          💰 Total Annual Savings Rate
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 900,
            color: "#14b8a6",
            fontFamily: "'DM Mono',monospace",
            lineHeight: 1,
          }}
        >
          {fmtK(totalSavings)}
          <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>
            /yr
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
          Including employer match and HSA
        </div>
      </div>
    </div>
  );
}

function RetirementPanel({ values, onChange }) {
  const spend = values.sp || 100_000;
  const floor = values.gkFloor || 88_000;
  const ceiling = values.gkCeiling || 115_000;
  const floorPct = (floor / spend) * 100;
  const ceilingPct = (ceiling / spend) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {[
          {
            k: "sp",
            label: "Core Lifestyle Spend (excl. housing & fixed obligations)",
            min: 30000,
            max: 200000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
          {
            k: "spSpendOutofState",
            label: "Out of State Solo Spend",
            min: 20000,
            max: 150000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
          {
            k: "spInStateSpend",
            label: "Non Taxable State/Offshore Spend",
            min: 20000,
            max: 150000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k] || 0}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
        {[
          {
            k: "gkFloor",
            label: "Guyton-Klinger Floor",
            min: 20000,
            max: 150000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
          {
            k: "gkCeiling",
            label: "Guyton-Klinger Ceiling",
            min: 50000,
            max: 250000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k] || 0}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
      </div>

      {/* GK % of spend */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 16 }}>
          🛡️ Guardrails as % of Spend
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
              Floor
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#fbbf24",
                fontFamily: "'DM Mono',monospace",
              }}
            >
              {floorPct.toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: "#334155" }}>
              {fmtK(floor)} / {fmtK(spend)}
            </div>
          </div>
          <div
            style={{
              width: 1,
              height: 30,
              background: "rgba(255,255,255,0.1)",
            }}
          />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
              Ceiling
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#34d399",
                fontFamily: "'DM Mono',monospace",
              }}
            >
              {ceilingPct.toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: "#334155" }}>
              {fmtK(ceiling)} / {fmtK(spend)}
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#64748b",
            marginTop: 16,
            fontStyle: "italic",
          }}
        >
          GK adjusts spending ±10% when withdrawal rate deviates 20% from
          initial.
        </div>
      </div>
    </div>
  );
}

function IncomePanel({ values, onChange }) {
  const ab = values.ab || 20_000;
  const ssb = values.ssb || 31_543;
  const totalRetirementIncome = ab + ssb;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {[
          {
            k: "ab",
            label: "Rental Net Income",
            min: 0,
            max: 60_000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
          {
            k: "ssb",
            label: "Social Security Benefit",
            min: 0,
            max: 50_000,
            step: 500,
            fmt: (v) => fmtK(v) + "/yr",
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k] || 0}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
        {[
          {
            k: "ssAge",
            label: "SS Start Age",
            min: 62,
            max: 70,
            step: 1,
            fmt: (v) => "Age " + v,
          },
          {
            k: "abReliability",
            label: "Rental Reliability",
            min: 0,
            max: 100,
            step: 5,
            fmt: (v) => v + "%",
          },
          {
            k: "abGrowth",
            label: "Rental Growth Rate",
            min: 0,
            max: 10,
            step: 0.5,
            fmt: (v) => v + "%/yr",
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k] || 0}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
      </div>

      {/* Total income at retirement */}
      <div
        style={{
          background: "linear-gradient(135deg, #05966918, #0ea5e918)",
          border: "1px solid #05966944",
          borderRadius: 10,
          padding: 18,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
          🏖️ Total Income at Retirement (Pre-Tax)
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 900,
            color: "#34d399",
            fontFamily: "'DM Mono',monospace",
            lineHeight: 1,
          }}
        >
          {fmtK(totalRetirementIncome)}
          <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>
            /yr
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 20,
            marginTop: 12,
            fontSize: 12,
            color: "#64748b",
          }}
        >
          <span>🏖 Rental: {fmtK(ab)}</span>
          <span>
            🏛 SS: {fmtK(ssb)} @ age {values.ssAge || 64}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginTop: 8 }}>
          Rental reliability: {values.abReliability || 80}% · Growth:{" "}
          {values.abGrowth || 3}%/yr
        </div>
      </div>
    </div>
  );
}

function formatDate(dateString) {
  if (!dateString) return "Start date";
    const d = new Date(dateString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AiRAForecaster() {
  const [mode, setMode] = useState("user");
  const [activeTab, setTab] = useState("networth");
  const [running, setRunning] = useState(false);
  const [stale, setStale] = useState(false);
  const [r85, setR85] = useState(null);
  const [r90, setR90] = useState(null);
  const [stress, setStress] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState(null);
  const [feedbackText, setFeedbackText] = useState("");
  const isFirst = useRef(true);

  const prof = PROFILES[mode];
  const [port, setPort] = useState(prof.port);
  const [contrib, setContrib] = useState(prof.contrib);
  const [inf, setInf] = useState(prof.inf);
  const [retAge, setRetAge] = useState(prof.retireAge);
  const [endAge, setEndAge] = useState(prof.endAge);
  const [sp, setSp] = useState(prof.sp);
  const [ssAge, setSsAge] = useState(prof.ssAge);
  const [ssb, setSsb] = useState(prof.ssb);
  const [ab, setAb] = useState(prof.ab);
  const [smile, setSmile] = useState(prof.smile);
  const [tax, setTax] = useState(prof.tax);
  const [useAb, setUseAb] = useState(prof.useAb);
  const [real, setReal] = useState(prof.real);
  const [twoHousehold, setTwoHousehold] = useState(true);
  const [withdrawalStrategy, setWithdrawalStrategy] = useState("gk"); // "gk", "fixed", "vanguard", "risk", "kitces"

  const [assumptions, setAssumptions] = useState({
    // Personal — blank by default, loaded from JSON
    name: BLANK_PROFILE.name,
    dob:  BLANK_PROFILE.dob,
    stateOfResidence: BLANK_PROFILE.stateOfResidence,
    employerStartDate: BLANK_PROFILE.employerStartDate,
    // Account breakdown
    accounts: BLANK_PROFILE.accounts,
    // MC model parameters
    abReliability: BLANK_PROFILE.abReliability,
    abGrowth:      BLANK_PROFILE.abGrowth,
    ssCola:        BLANK_PROFILE.ssCola,
    preRetireEq:   BLANK_PROFILE.preRetireEq,
    postRetireEq:  BLANK_PROFILE.postRetireEq,
    hcShockAge:    BLANK_PROFILE.hcShockAge,
    hcProb:        BLANK_PROFILE.hcProb,
    hcMin:         BLANK_PROFILE.hcMin,
    hcMax:         BLANK_PROFILE.hcMax,
    
    // Income (also blank by default)
    ab:  BLANK_PROFILE.ab,
    ssb: BLANK_PROFILE.ssb,
    useJointRmdTable: BLANK_PROFILE.useJointRmdTable,
    cashRealReturn: BLANK_PROFILE.cashRealReturn,
    // Mortgage
    mortBalance: BLANK_PROFILE.mortBalance,
    mortRate: BLANK_PROFILE.mortRate,
    mortStart: BLANK_PROFILE.mortStart,
    mortTerm: BLANK_PROFILE.mortTerm,
    mortExtra: BLANK_PROFILE.mortExtra,
    mortPI: BLANK_PROFILE.mortPI,
    properties: BLANK_PROFILE.properties,
    // Expense model
    housingType: BLANK_PROFILE.housingType,
    annualRent: BLANK_PROFILE.annualRent,
    carveouts: BLANK_PROFILE.carveouts,
    rothConversionTarget: BLANK_PROFILE.rothConversionTarget,
  });
  const updateAssumption = useCallback(
    (key, val) => setAssumptions((prev) => ({ ...prev, [key]: val })),
    []
  );

  const currentAge = useMemo(() => {
    try {
      const d = new Date(assumptions.dob);
      if (isNaN(d)) return prof.currentAge;
      return Math.floor((new Date() - d) / (365.25 * 24 * 3600 * 1000));
    } catch {
      return prof.currentAge;
    }
  }, [assumptions.dob, prof.currentAge]);

  const rmdAge = useMemo(() => {
    const override = assumptions.rmdStartAge;
    if (typeof override === "number" && override > 0) return override;
    return getRmdStartAge({ dob: assumptions.dob, currentAge });
  }, [assumptions.dob, assumptions.rmdStartAge, currentAge]);

  const DDAY_dynamic = useMemo(() => {
    try {
      const d = new Date(assumptions.dob);
      if (isNaN(d)) return new Date("2030-03-14T00:00:00");
      return new Date(d.getFullYear() + retAge, d.getMonth(), d.getDate());
    } catch {
      return new Date("2030-03-14T00:00:00");
    }
  }, [assumptions.dob, retAge]);

  const days = Math.max(0, Math.floor((DDAY_dynamic - new Date()) / 86400000));
  const countdown = useCountdown(DDAY_dynamic, assumptions.employerStartDate);

  const switchMode = useCallback((m) => {
    setMode(m);
    const p = PROFILES[m];
    const acctTotal = (p.accounts || []).reduce((s, a) => s + (a.balance || 0), 0);
    setPort(acctTotal > 0 ? acctTotal : p.port);
    setContrib(p.contrib);
    setInf(p.inf);
    setRetAge(p.retireAge);
    setEndAge(p.endAge);
    setSp(p.sp);
    setSsAge(p.ssAge);
    setSsb(p.ssb);
    setAb(p.ab);
    setSmile(p.smile);
    setTax(p.tax);
    setUseAb(p.useAb);
    setReal(p.real);
    setTwoHousehold(true);
    if (p.accounts) updateAssumption("accounts", p.accounts);
    if (p.mortBalance !== undefined) updateAssumption("mortBalance", p.mortBalance);
    if (p.mortRate !== undefined) updateAssumption("mortRate", p.mortRate);
    if (p.mortStart) updateAssumption("mortStart", p.mortStart);
    if (p.mortTerm) updateAssumption("mortTerm", p.mortTerm);
    if (p.mortExtra !== undefined) updateAssumption("mortExtra", p.mortExtra);
    setR85(null);
    setR90(null);
    setStress(null);
    setStale(false);
  }, [updateAssumption]);

  const params = useMemo(
    () => ({
      dob: assumptions.dob || "",
      rmdStartAge: assumptions.rmdStartAge,
      retireAge: retAge,
      endAge,
      port,
      contrib,
      inf,
      sp: twoHousehold ? sp : prof.spSpendOutofState,
      ssAge,
      ssb,
      ab,
      useAb,
      smile,
      tax,
      real,
      // GK dynamic — derived from spending needs (today's dollars, inflation-adjusted in MC)
      // Floor = 65% of target spending (bare essentials). Ceiling = 135% of target (comfort cap).
      gkFloor: Math.round((twoHousehold ? sp : (prof.spSpendOutofState || sp)) * 0.65),
      gkCeiling: Math.round((twoHousehold ? sp : (prof.spSpendOutofState || sp)) * 1.35),
      mortBalance: assumptions.mortBalance || 0,
      mortRate: assumptions.mortRate || 6.5,
      mortStart: assumptions.mortStart || "2020-01",
      mortTerm: assumptions.mortTerm || 30,
      mortExtra: assumptions.mortExtra || 0,
      rePrimaryResidencce: prof.rePrimaryResidencce,
      reRentalUnit1: prof.reRentalUnit1,
      reRentalUnit2: prof.reRentalUnit2,
      twoHousehold,
      currentAge,
      abReliability: assumptions.abReliability,
      abGrowth: assumptions.abGrowth,
      ssCola: assumptions.ssCola,
      preRetireEq: assumptions.preRetireEq,
      postRetireEq: assumptions.postRetireEq,
      hcShockAge: assumptions.hcShockAge,
      hcProb: assumptions.hcProb,
      hcMin: assumptions.hcMin,
      hcMax: assumptions.hcMax,
      accounts: assumptions.accounts,
      properties: assumptions.properties || BLANK_PROFILE.properties,
      filingStatus: assumptions.filingStatus || "mfj",
      reGrowthRate: assumptions.reGrowthRate ?? 3.0,
      housingType: assumptions.housingType || "own",
      annualRent: assumptions.annualRent || 0,
      carveouts: assumptions.carveouts || [],
      rothConversionTarget: assumptions.rothConversionTarget || "off",
      withdrawalStrategy: withdrawalStrategy,
      fixedWithdrawalRate: 0.04,
      vanguardInitialRate: 0.04,
      vanguardCap: 0.05,
      vanguardFloor: -0.025,
      safeWithdrawalRate: 0.04,
    }),
    [
      prof,
      retAge,
      endAge,
      port,
      contrib,
      inf,
      sp,
      ssAge,
      ssb,
      ab,
      useAb,
      smile,
      tax,
      real,
      twoHousehold,
      assumptions,
      currentAge,
      withdrawalStrategy,
    ]
  );

  const mortgageSched = useMemo(
  () => mortgageSchedule(
    assumptions.mortBalance || 0,
    assumptions.mortRate || 6.5,
    assumptions.mortStart || "2020-01",
    assumptions.mortTerm || 30,
    assumptions.mortExtra || 0
  ),
  [assumptions.mortBalance, assumptions.mortRate, assumptions.mortStart, assumptions.mortTerm, assumptions.mortExtra]
);

const mortgagePayoffYear = mortgageSched.payoffYr;

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (r85 || r90) setStale(true);
  }, [params]);

  const swr = ((params.sp / port) * 100).toFixed(1);

  const runSimulation = useCallback(() => {
    setRunning(true);
    setStale(false);
    setTimeout(() => {
      const r85_ = runMC(params, 85, 3000, 42, true);
      const r90_ = runMC(params, 90, 3000, 43, true);
      const str = runStress(params, params.endAge, 2000, 99);
      setR85(r85_);
      setR90(r90_);
      setStress(str);
      setRunning(false);
    }, 40);
  }, [params]);

  const analogue = r90 ? getAnalogue(r90.rate) : null;

  const TABS = [
    ["networth",   "📊 Net Worth"],
    ["montecarlo", "🎲 Forecast"],
    ["scenarios",  "🎯 Scenarios"],
    ["income",     "💵 Income"],
    ["mortgage",   "🏠 Mortgage"],
    ["actionplan", "✅ Action Plan"],
    ["assumptions","👤 Profile"],
  ];

  const needsMC = ["montecarlo", "networth", "fan"];
  const hasMC = !!r90;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="hdr">
          <div>
            <div className="logo">
              AiRA <span className="logo-sub">Freedom Financial</span>
            </div>
            <div style={{ fontSize: 12, color: "#6e8099" }}>
              v{APP_VERSION} · Property cards · Dynamic action plan · Premium AI layer · GK dynamic · CSS/FAFSA guards
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {Object.entries(PROFILES).map(([k, v]) => (
              <button
                key={k}
                className={`mbtn ${
                  mode === k ? (k === "demo" ? "demo-on" : "on") : ""
                }`}
                onClick={() => switchMode(k)}
              >
                {k === "demo" ? "🎬 Demo" : "👤 My Plan"}
              </button>
            ))}
            <div style={{ width:1, height:20, background:"rgba(255,255,255,0.1)", margin:"0 4px" }} />
            <button className="mbtn" title="Export profile to JSON"
              onClick={() => exportProfile({
                // Identity
                name: assumptions.name || "", dob: assumptions.dob || "",
                stateOfResidence: assumptions.stateOfResidence || "NJ",
                employerStartDate: assumptions.employerStartDate || "",
                // Core retirement
                retireAge: retAge, endAge, port, contrib, inf: inf,
                sp, ssAge, ssb, ab, useAb, smile, tax, real, twoHousehold,
                // Spending
                spSpendOutofState: prof.spSpendOutofState || 48000,
                spInStateSpend: prof.spInStateSpend || 0,
                // Mortgage
                mortBalance: assumptions.mortBalance || 0,
                mortRate: assumptions.mortRate || 6.5,
                mortStart: assumptions.mortStart || "2020-01",
                mortTerm: assumptions.mortTerm || 30,
                mortExtra: assumptions.mortExtra || 0,
                mortPI: assumptions.mortPI || 0,
                // Tax & RE
                filingStatus: assumptions.filingStatus || "mfj",
                reGrowthRate: assumptions.reGrowthRate ?? 3.0,
                useJointRmdTable: assumptions.useJointRmdTable || false,
                cashRealReturn: assumptions.cashRealReturn ?? 1.0,
                // Expense model
                housingType: assumptions.housingType || "own",
                annualRent: assumptions.annualRent || 0,
                carveouts: assumptions.carveouts || [],
                rothConversionTarget: assumptions.rothConversionTarget || "off",
                // Real estate
                properties: assumptions.properties || BLANK_PROFILE.properties,
                // Account breakdown
                accounts: assumptions.accounts || BLANK_PROFILE.accounts,
                // MC assumptions
                abReliability: assumptions.abReliability,
                abGrowth: assumptions.abGrowth,
                ssCola: assumptions.ssCola,
                preRetireEq: assumptions.preRetireEq,
                postRetireEq: assumptions.postRetireEq,
                hcShockAge: assumptions.hcShockAge,
                hcProb: assumptions.hcProb,
                hcMin: assumptions.hcMin,
                hcMax: assumptions.hcMax,
                // Meta
                exportedAt: new Date().toISOString(),
                appVersion: APP_VERSION,
              }, assumptions.name
                   ? `AiRA_Profile_${assumptions.name.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "AiRA_Profile"}`
                   : "AiRA_Profile")}>
              ⬇ Export
            </button>
            <button className="mbtn" title="Import profile from JSON"
              onClick={() => importProfile((data) => {
                // ---- 1. Main sliders (already working) ----
                if (data.retireAge)  setRetAge(data.retireAge);
                if (data.endAge)     setEndAge(data.endAge);
                if (data.port)       setPort(data.port);
                if (data.contrib)    setContrib(data.contrib);
                if (data.inf)        setInf(data.inf);
                if (data.sp)         setSp(data.sp);
                if (data.ssAge)      setSsAge(data.ssAge);
                if (data.ssb)        setSsb(data.ssb);
                if (data.ab !== undefined) setAb(data.ab);
                if (data.useAb !== undefined) setUseAb(data.useAb);
                if (data.smile !== undefined) setSmile(data.smile);
                if (data.tax !== undefined) setTax(data.tax);
                if (data.real !== undefined) setReal(data.real);
                if (data.twoHousehold !== undefined) setTwoHousehold(data.twoHousehold);

                // ---- 2. Migrate old account fields to new accounts array ----
                if (data.solo401k !== undefined && !data.accounts) {
                  data.accounts = [
                    ...(data.solo401k ? [{ id: "m1", category: "pretax", name: "Solo 401k", balance: data.solo401k }] : []),
                    ...(data.alpha401k ? [{ id: "m2", category: "pretax", name: "Alpha 401k", balance: data.alpha401k }] : []),
                    ...(data.rothFid ? [{ id: "m3", category: "roth", name: "Roth Fidelity", balance: data.rothFid }] : []),
                    ...(data.rothVgd ? [{ id: "m4", category: "roth", name: "Roth Vanguard", balance: data.rothVgd }] : []),
                    ...(data.hsaBal ? [{ id: "m5", category: "hsa", name: "HSA", balance: data.hsaBal }] : []),
                    ...(data.taxable ? [{ id: "m6", category: "taxable", name: "Taxable", balance: data.taxable }] : []),
                  ];
                  if (data.accounts.length === 0) data.accounts = BLANK_PROFILE.accounts;
                  delete data.solo401k;
                  delete data.alpha401k;
                  delete data.rothFid;
                  delete data.rothVgd;
                  delete data.hsaBal;
                  delete data.taxable;
                }

                // ---- 3. Ensure accounts is always an array ----
                if (!Array.isArray(data.accounts)) data.accounts = BLANK_PROFILE.accounts;

                // ---- 4. Recalculate portfolio total from accounts ----
                const acctTotal = data.accounts.reduce((s, a) => s + (a.balance || 0), 0);
                if (acctTotal > 0) setPort(acctTotal);

                // ---- 5. Fix mortgage start date format (add "-01" if missing) ----
                if (data.mortStart && !data.mortStart.includes("-01")) {
                  data.mortStart = data.mortStart + "-01";
                }

                // ---- 6. Update ALL assumptions fields (including missing ones) ----
                const keys = [
                  "name", "dob", "stateOfResidence", "employerStartDate", "useJointRmdTable", "cashRealReturn",
                  "filingStatus", "reGrowthRate",
                  "abReliability", "abGrowth", "ssCola", "preRetireEq", "postRetireEq",
                  "hcShockAge", "hcProb", "hcMin", "hcMax", "accounts",
                  "mortBalance", "mortRate", "mortStart", "mortTerm", "mortExtra", "mortPI",
                  "housingType", "annualRent", "carveouts", "rothConversionTarget", "properties"
                ];
                keys.forEach(k => {
                  if (data[k] !== undefined) updateAssumption(k, data[k]);
                });

                // ---- 7. Switch to user mode and mark stale ----
                setMode("user");
                setStale(true);
                alert(`✅ Profile loaded${data.name ? ` for ${data.name}` : ""}. Press ▶ Run Monte Carlo to update.`);
              })}>
              ⬆ Import
            </button>
            <a href="https://buymeacoffee.com/axwacki"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 13px",
                borderRadius: 7,
                border: "1px solid rgba(255,193,7,0.4)",
                background: "rgba(255,193,7,0.08)",
                color: "#fbbf24",
                fontSize: 11,
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,193,7,0.18)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,193,7,0.08)"}
            >
              ☕ Buy me a coffee
            </a>
            {/* Feedback widget */}
            <div style={{ position: "relative", display: "inline-flex" }}>
              <button
                onClick={() => setShowFeedback(prev => !prev)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 13px", borderRadius: 7,
                  border: "1px solid rgba(139,92,246,0.4)",
                  background: "rgba(139,92,246,0.08)",
                  color: "#a78bfa", fontSize: 11,
                  fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
                  cursor: "pointer", transition: "all 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(139,92,246,0.18)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(139,92,246,0.08)"}
              >
                💬 Feedback
              </button>
              {showFeedback && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: 6,
                  background: "#0f2138", border: "1px solid #1e3a5f", borderRadius: 10,
                  padding: 14, width: 280, zIndex: 999,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}>
                  <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, marginBottom: 10 }}>
                    How's AiRA working for you?
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {[
                      { emoji: "👍", label: "Great", type: "praise" },
                      { emoji: "💡", label: "Idea", type: "suggestion" },
                      { emoji: "🐛", label: "Bug", type: "bug" },
                      { emoji: "👎", label: "Issue", type: "issue" },
                    ].map(fb => (
                      <button key={fb.type}
                        onClick={() => setFeedbackType(fb.type)}
                        style={{
                          flex: 1, padding: "6px 4px", borderRadius: 6, cursor: "pointer",
                          border: feedbackType === fb.type ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.08)",
                          background: feedbackType === fb.type ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.03)",
                          transition: "all 0.15s",
                        }}>
                        <div style={{ fontSize: 18 }}>{fb.emoji}</div>
                        <div style={{ fontSize: 9, color: feedbackType === fb.type ? "#a78bfa" : "#64748b", marginTop: 2 }}>{fb.label}</div>
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    placeholder="Tell us more (optional)..."
                    rows={3}
                    style={{
                      width: "100%", background: "#0a1628", border: "1px solid #1e3a5f",
                      color: "#e2e8f0", borderRadius: 6, padding: "8px 10px",
                      fontSize: 11, fontFamily: "'DM Sans',sans-serif",
                      resize: "vertical", outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={e => e.target.style.borderColor = "#a78bfa"}
                    onBlur={e => e.target.style.borderColor = "#1e3a5f"}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <button onClick={() => setShowFeedback(false)}
                      style={{ background: "transparent", border: "none", color: "#475569", fontSize: 11, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!feedbackType) { alert("Please select a feedback type"); return; }
                        const payload = { type: feedbackType, message: feedbackText, timestamp: new Date().toISOString(), appVersion: "6.1" };
                        const existing = JSON.parse(localStorage.getItem("aira_feedback") || "[]");
                        existing.push(payload);
                        localStorage.setItem("aira_feedback", JSON.stringify(existing));
                        alert("Thanks for your feedback! \ud83d\ude4f");
                        setFeedbackType(null);
                        setFeedbackText("");
                        setShowFeedback(false);
                      }}
                      style={{
                        padding: "5px 16px", borderRadius: 6,
                        border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)",
                        color: "white", fontSize: 11, fontWeight: 600,
                        cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                      }}>
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#14b8a6",
                fontFamily: "'DM Mono',monospace",
              }}
            >
              {days.toLocaleString()}
            </div>
            <div
              style={{ fontSize: 9, color: "#334155" }}
            >{`days · ${DDAY_dynamic.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`}</div>
          </div>
        </div>
        <div className="layout">
          <div className="sidebar">
            <div className="sb-card">
              <div className="sb-title">D-Day Countdown</div>
              <div className="countdown-grid">
                {[
                  { v: countdown.days, l: "DAYS" },
                  { v: countdown.hours, l: "HRS" },
                  { v: countdown.mins, l: "MIN" },
                  { v: countdown.secs, l: "SEC" },
                ].map((u) => (
                  <div key={u.l} className="cd-unit">
                    <div className="cd-val">{String(u.v).padStart(2, "0")}</div>
                    <div className="cd-lbl">{u.l}</div>
                  </div>
                ))}
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${countdown.pct}%` }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9,
                  color: "#334155",
                  marginTop: 3,
                }}
              >
               <span>{formatDate(assumptions.employerStartDate)} (Start date)</span>
                <span style={{ color: "#5eead4", fontWeight: 600 }}>
                  {countdown.pct}%
                </span>
              </div>
              <div style={{
                    marginTop: 10, paddingTop: 10,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  }}>
                    <span style={{ fontSize: 10, color: "#64748b" }}>Total Portfolio</span>
                    <span style={{
                      fontSize: 18, fontWeight: 700, color: "#5eead4",
                      fontFamily: "'DM Mono',monospace", letterSpacing: "-0.5px",
                    }}>{fmtM(port)}</span>
              </div>
            </div>
            <div className="sb-card">
              <div className="sb-title">MC Engine — {APP_VERSION}</div>
              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.8 }}>
                <div>
                  📈 <span style={{ color: "#5eead4" }}>Equity:</span> 99yr S&P
                  bootstrap [-30 / +30%]
                </div>
                <div>
                  📊 <span style={{ color: "#a78bfa" }}>Bonds:</span> 50yr
                  Bloomberg [-15 / +20%]
                </div>
                <div>
                  🛡️ <span style={
                                    { color: "#fbbf24" }
                                 }>Guyton Klinger
                      </span>{" "} Floor: {fmtM(params.gkFloor)} 
                  · Ceiling {fmtM(params.gkCeiling)}
                </div>
                <div>
                  🏖 <span style={{ color: "#059669" }}>Rental:</span> 80%
                  reliability per year
                </div>
                <div>
                  🏥 <span style={{ color: "#f87171" }}>Healthcare:</span> 3.5%
                  shock risk age 72+
                </div>
                <div>
                  💹 <span style={{ color: "#14b8a6" }}>Phase 1 (91/9):</span>{" "}
                  {CALIB.phase1Mean}% μ
                </div>
                <div>
                  💹 <span style={{ color: "#fb923c" }}>Phase 2 (70/30):</span>{" "}
                  {CALIB.phase2Mean}% μ
                </div>
              </div>
            </div>
            <div className="sb-card">
              <div className="sb-title">Portfolio</div>
              <Slider
                label="Annual contrib"
                value={contrib}
                min={0}
                max={100000}
                step={500}
                format={(v) => fmtK(v) + "/yr"}
                onChange={setContrib}
              />
            </div>
            <div className="sb-card">
              <div className="sb-title">Retirement</div>
              <Slider
                label="Retire age"
                value={retAge}
                min={55}
                max={68}
                step={1}
                format={(v) => "Age " + v}
                onChange={setRetAge}
              />
              <Slider
                label="Plan to age"
                value={endAge}
                min={80}
                max={100}
                step={1}
                format={(v) => "Age " + v}
                onChange={setEndAge}
              />
              <Slider
                label="Annual spend"
                value={sp}
                min={30000}
                max={200000}
                step={1000}
                format={(v) => fmtK(v) + "/yr"}
                onChange={setSp}
              />
              <Slider
                label="SS start age"
                value={ssAge}
                min={62}
                max={70}
                step={1}
                format={(v) => "Age " + v}
                onChange={setSsAge}
              />
              <Slider
                label="SS benefit"
                value={ssb}
                min={0}
                max={50000}
                step={500}
                format={(v) => fmtK(v) + "/yr"}
                onChange={setSsb}
              />
              <Slider
                label="Rental net"
                value={ab}
                min={0}
                max={50000}
                step={1000}
                format={(v) => fmtK(v) + "/yr"}
                onChange={setAb}
              />
            </div>
            <div className="sb-card">
              <div className="sb-title">Options</div>
              <Toggle
                val={smile}
                onChange={setSmile}
                label="🙂 Smile spending"
              />
              <Toggle
                val={tax}
                onChange={setTax}
                label="🏛 Tax drag"
                accent="#d97706"
              />
              <Toggle
                val={useAb}
                onChange={setUseAb}
                label="🏖 Rental income"
                accent="#059669"
              />
              <Toggle
                val={real}
                onChange={setReal}
                label="📉 Real dollars"
                accent="#0ea5e9"
              />
              <Toggle
                val={twoHousehold}
                onChange={setTwoHousehold}
                label="🏠🌴 Two households · Spouse 1 Out / Spouse 2 In State"
                accent="#a78bfa"
              />
              <div className="sb-card">
                <div className="sb-title">Withdrawal Strategy</div>
                <select
                  value={withdrawalStrategy}
                  onChange={(e) => setWithdrawalStrategy(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0d1b2a",
                    border: "1px solid #1e3a5f",
                    color: "#e2e8f0",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontFamily: "'Inter',sans-serif",
                  }}
                >
                  <option value="gk">Guyton‑Klinger (Dynamic)</option>
                  <option value="fixed">Fixed % of Portfolio</option>
                  <option value="vanguard">Vanguard Dynamic Spending</option>
                  <option value="risk">Risk‑Based Guardrails</option>
                  <option value="kitces">Kitces Ratcheting</option>
                  <option value="vpw">VPW (Variable Percentage)</option>
                  <option value="cape">CAPE‑Based</option>
                  <option value="endowment">Endowment (Yale) Model</option>
                  <option value="one_n">1/N (Remaining Years)</option>
                  <option value="ninety_five_rule">95% Rule (Cut Protection)</option>
                </select>
              </div>
            </div>
            <button
              className="run-btn"
              onClick={runSimulation}
              disabled={running}
              style={{
                background: stale
                  ? "linear-gradient(135deg,#b45309,#d97706)"
                  : undefined,
              }}
            >
              {running
                ? "Running 6,000 paths..."
                : stale
                ? "⚠ Inputs changed — Re-run"
                : "▶ Run Monte Carlo"}
            </button>
            
          </div>
          <div className="main">
            {mode === "user" && !assumptions.dob && (
              <div style={{ background:"rgba(14,165,233,0.1)", border:"2px solid rgba(14,165,233,0.3)", borderRadius:9, padding:"12px 16px" }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#38bdf8" }}>📂 No profile loaded</div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Click ⬆ Import in the header to load your AiRA_Profile.json, or go to 👤 Profile tab to enter data manually, then Export to save it.</div>
              </div>
            )}

            {mode === "demo" && (
                <div style={{
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  borderRadius: 8,
                  padding: "8px 16px",
                  marginBottom: 12,
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  color: "white",
                  boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}>
                  <span>🎬</span> DEMO MODE – Data is for illustration only <span>🎬</span>
                </div>
              )}  

            <div className="flag-i">
              🛡 GK active · WR {swr}% ·{" "}
              {twoHousehold ? "Both households" : "Solo"} · Rental 80%
              reliable · Healthcare shocks modeled
            </div>
            {stale && (
              <div
                style={{
                  background: "rgba(180,83,9,0.12)",
                  border: "1px solid rgba(217,119,6,0.4)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 12,
                  color: "#fbbf24",
                }}
              >
                ⚠ Inputs changed — success rates below are stale. Press Re-run
                to update.
              </div>
            )}
            <div className="metrics">
              <div className="met">
                <div className="ml">Success to 85</div>
                <div
                  className="mv"
                  style={{
                    color: r85
                      ? r85.rate >= 0.85
                        ? "#0d9488"
                        : r85.rate >= 0.7
                        ? "#f59e0b"
                        : "#ef4444"
                      : "#334155",
                  }}
                >
                  {r85 ? fmtPct(r85.rate) : "—"}
                </div>
                <div className="ms">3,000 paths · GK</div>
              </div>
              <div className="met">
                <div className="ml">Success to 90</div>
                <div
                  className="mv"
                  style={{
                    color: r90
                      ? r90.rate >= 0.85
                        ? "#0d9488"
                        : r90.rate >= 0.7
                        ? "#f59e0b"
                        : "#ef4444"
                      : "#334155",
                  }}
                >
                  {r90 ? fmtPct(r90.rate) : "—"}
                </div>
                <div className="ms">3,000 paths · GK</div>
              </div>
              <div className="met">
                <div className="ml">Portfolio at D-Day</div>
                <div className="mv" style={{ color: "#94a3b8", fontSize: 18 }}>
                  {r90 ? fmtM(r90.medR) : "—"}
                </div>
                <div className="ms">Median projected</div>
              </div>
              <div className="met">
                <div className="ml">Withdrawal rate</div>
                <div
                  className="mv"
                  style={{
                    color:
                      +swr <= 3
                        ? "#0d9488"
                        : +swr <= 4
                        ? "#34d399"
                        : +swr <= 5
                        ? "#f59e0b"
                        : "#ef4444",
                    fontSize: 20,
                  }}
                >
                  {swr}%
                </div>
                <div className="ms">4% = safe benchmark</div>
              </div>
            </div>
            {analogue && (
              <div
                className="analogue"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  {analogue.emoji} "{analogue.text}." — {fmtPct(r90.rate)} to
                  age {endAge}.
                </span>
                <SectorBadge age={prof.currentAge} />
              </div>
            )}
            {r90 &&
              (() => {
                const success = Math.round(r90.rate * 26);
                const fail = 26 - success;
                return (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 10,
                      padding: "12px 16px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#64748b",
                        marginBottom: 8,
                      }}
                    >
                      If 26 people had your exact plan — age {endAge} horizon
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginBottom: 8,
                      }}
                    >
                      {Array.from({ length: 26 }, (_, i) => (
                        <div
                          key={i}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: i < success ? "#0d9488" : "#ef4444",
                            opacity: i < success ? 1 : 0.4,
                            title: i < success ? "Survives" : "Depleted",
                          }}
                        />
                      ))}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        <span style={{ color: "#0d9488", fontWeight: 700 }}>
                          {success}
                        </span>{" "}
                        make it to {endAge}.{" "}
                        {fail > 0 && (
                          <>
                            {" "}
                            <span style={{ color: "#ef4444", fontWeight: 700 }}>
                              {fail}
                            </span>{" "}
                            run out.
                          </>
                        )}
                        {fail === 0 && (
                          <span style={{ color: "#34d399" }}>
                            {" "}
                            Everyone makes it.
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#334155",
                          fontStyle: "italic",
                        }}
                      >
                        100% doesn't exist — room for error IS the plan. —
                        Morgan Housel
                      </div>
                    </div>
                  </div>
                );
              })()}
            <div className="gk-bar">
              <strong style={{ color: "#5eead4" }}>GK Guardrails:</strong> Floor{" "}
              {fmtM(params.gkFloor)} (
              {twoHousehold ? "both households" : (assumptions.name || "solo")}) · Ceiling{" "}
              {fmtM(params.gkCeiling)} · Initial WR {swr}%. Rental modeled at
              80% reliability. Healthcare shocks 3.5%/yr from age 72. As Bill
              Perkins says — spend in the right life phase. 🌴
            </div>
            <div className="tabs">
              {TABS.map(([k, l]) => (
                <button
                  key={k}
                  className={`tab ${activeTab === k ? "on" : ""}`}
                  onClick={() => setTab(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            {needsMC.includes(activeTab) && !hasMC ? (
              <div
                className="chart-card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 260,
                  color: "#475569",
                }}
              >
                Press ▶ Run Monte Carlo to generate charts.
              </div>
            ) : (
              <>
                {activeTab === "fan" && r90 && (
                  <FanChart
                    pcts={r90.pcts}
                    retireAge={retAge}
                    ssAge={ssAge}
                    rmdAge={rmdAge}
                    inf={inf}
                    useReal={real}
                    title={`Portfolio fan · age ${endAge} · 3,000 paths`}
                  />
                )}
                {activeTab === "montecarlo" && (
                  <>
                    <MCTab
                      params={params}
                      r85={r85}
                      r90={r90}
                      stress={stress}
                      running={running}
                      onRun={runSimulation}
                    />
                    {r90 && (
                      <FanChart
                        pcts={r90.pcts}
                        retireAge={retAge}
                        ssAge={ssAge}
                        rmdAge={rmdAge}
                        inf={inf}
                        useReal={real}
                        title={`Portfolio fan · age ${endAge} · 3,000 paths`}
                      />
                    )}
                  </>
                )}
                {activeTab === "scenarios" && (
                  <ScenariosTab
                      baseParams={params}
                      r90={r90}
                      fmtPct={fmtPct}  
                      stress={stress}
                      retAge={retAge}           // ✅ Add this
                      ssAge={ssAge}             // ✅ Add this
                      rmdAge={rmdAge}
                      inf={inf}                 // ✅ Add this
                      real={real}               // ✅ Add this
                      FanChart={FanChart}
                      SEQ_2000_2012={SEQ_2000_2012}
                      DeterministicWithdrawalView={DeterministicWithdrawalView}
                      RothLadder={RothLadder}
                      BucketsTab={BucketsTab}
                      SmileChart={SmileChart}
                      withdrawalStrategy={withdrawalStrategy}
                    />
                )}
                {activeTab === "income" && <IncomeMap p={params} inf={inf} />}
                {activeTab === "mortgage" && (
                  <MortgageTab values={assumptions} onChange={updateAssumption} />
                )}
                {activeTab === "networth" && (
                  <NetWorthTab p={params} results90={r90} inf={inf} />
                )}
                {activeTab === "actionplan" && (
                    <ActionPlanTab
                      params={params}
                      r90={r90}
                      r85={r85}
                      assumptions={assumptions}
                      mortgagePayoffYear={mortgagePayoffYear}
                    />
                  )}
                {activeTab === "assumptions" && (
                  <ProfileWizard
                    values={{
                          ...assumptions,
                          currentAge: currentAge,
                          retireAge: retAge,
                          endAge: endAge,
                          port: port,
                          contrib: contrib,
                          sp: sp,
                          ssAge: ssAge,
                          ssb: ssb,
                          ab: ab,
                    }}
                    onChange={(k, v) => {
                      updateAssumption(k, v);
                      // also wire to main sliders
                      if (k === "retireAge") setRetAge(v);
                      if (k === "endAge") setEndAge(v);
                      if (k === "port") setPort(v);
                      if (k === "contrib") setContrib(v);
                      if (k === "sp") setSp(v);
                      if (k === "ssAge") setSsAge(v);
                      if (k === "ssb") setSsb(v);
                      if (k === "ab") setAb(v);
                    }}
                  />
                )}
              </>
            )}
            <div
              style={{
                fontSize: 9,
                color: "#1e3a5f",
                textAlign: "center",
                paddingTop: 4,
                lineHeight: 1.6,
              }}
            >
              AiRA Freedom Financial v{APP_VERSION} · This is not financial advice. Seek a professional fiduciary, CPA, or tax accountant. Use at your own risk. See full disclaimer in code.
              <br />
              "The best financial plan is the one you can stick with." — Morgan
              Housel
            </div>
          </div>
        </div>
      </div>
    </>
  );
}



/* ════════════════════════════════════════════════════════════════
   VERSION LOG
   ════════════════════════════════════════════════════════════════

   v9.2 — April 13, 2026 (Claude / this session)
   ─────────────────────────────────────────────
   • Property cards in MortgageTab — editable label, gross value,
     mortgage balance, annual income, net equity per property
   • First property auto-wires to primary mortgage calculator
   • Add/remove properties (2 default, max 5)
   • BLANK_PROFILE: replaced rePrimaryResidencce/reRentalUnit* with
     properties[] array
   • importProfile: migration converts old re* fields automatically
   • NetWorthTab: reTotal + reEquity now derived from properties[]
   • params useMemo: properties[] flows to all downstream tabs
   • exportProfile: properties[] included in JSON export
   • Expanded static rules engine in generateActions (35+ rules)
   • Premium AI analysis layer (credit code + Vercel proxy)
   • Dynamic AI payload with narrative + structured data
   • AI returns {diagnosis, actions} — diagnosis shown as header card
   • packageJson import replaced with hardcoded APP_VERSION = "9.2"

   v9.1 — April 13, 2026 (AiRA-DS + Claude Code + Gemini)
   ────────────────────────────────────────────────────────
   • BLANK_PROFILE + DEMO_PROFILE — no personal data hardcoded
   • ProfileWizard 6-step guided setup
   • Import/Export profile JSON
   • generateActions() dynamic rules engine
   • ActionPlanTab reads live MC results
   • Multiple withdrawal strategies: GK, Fixed 4%, Vanguard,
     Risk-based, Kitces
   • simulateDeterministic + simulateDeterministicWithStrategy
   • useJointRmdTable flag + JOINT_RMD_TABLE
   • guytonKlingerWithdrawal extracted as standalone function
   • calcYearTax function
   • GK floor/ceiling dynamic: sp × 0.65 / sp × 1.35
   • DualInput component (text + slider sync)
   • Feedback thumbs widget
   • APP_VERSION from package.json
   • ScenariosTab with sub-tabs
   • Assumptions tab → ProfileWizard panels

   v9.0-ds — April 8, 2026 (AiRA-DS)
   ────────────────────────────────────
   • DS variant — 5,375 lines
   • Account breakdown by category (pretax/roth/taxable/hsa/cash)
   • SavingsPanel with add/remove accounts
   • AssumptionsPanel with model parameter inputs
   • DOB-driven dynamic currentAge and DDAY_dynamic
   • useCountdown accepts dday param
   • Assumptions state (abReliability, hcProb, ssCola etc.)

   v8.0 — April 13, 2026 (Claude)
   ────────────────────────────────
   • Assumptions tab (standalone, pre-wizard)
   • MC engine: all hardcoded rates replaced with p.* params
   • currentAge derived live from DOB
   • DDAY_dynamic computed from DOB + retireAge
   • AssumptionsTab with Personal Profile + Model Parameters +
     Healthcare Shock sections

   v5.1 — April 2026 (Claude)
   ───────────────────────────
   • 6 MC engine bugs fixed
   • initWR uses net portfolio draw (not gross spend)
   • Airbnb modeled at 80% annual reliability
   • Healthcare shocks 3.5%/yr age 72+
   • GK floor/ceiling hardcoded (pre-dynamic)
   • twoHousehold toggle wired to sp and gkFloor
   • 11 tabs: Fan, Stress, Income, Roth, Buckets, Smile,
     Monte Carlo, Scenarios, Mortgage, Net Worth, Action Plan
   • 26-people visualization inline in headline panel
   • Stale results detection (amber Re-run button)

════════════════════════════════════════════════════════════════ */
export { runMC, mortgageSchedule };
/*Disclaimer and Terms of Use
Last Updated: April 11, 2026

1. Not Financial Advice
The Aira Freedom Financial application (the "App") is provided as a financial modeling and educational tool for informational purposes only. 
It does not constitute professional financial, investment, tax, or legal advice.  The developers of this app  are not acting as your financial advisor, fiduciary, or broker through the provision of this App.

All simulations, including Monte Carlo analyses and withdrawal strategies, are based on historical data and mathematical projections. 
Past performance is not indicative of future results. Financial markets are inherently volatile, and there is no guarantee that the assumptions used in the App will materialize.

2. "Use at Your Own Risk" & Accuracy
While the logic and methodologies used in this tool are utilized by the developer 
for personal planning, they are provided "as is" and "as available." 
We make no warranties, express or implied, regarding the accuracy, completeness, or reliability of the calculations. 
Financial planning involves complex variables that may not be fully captured by this software. 
You are solely responsible for verifying any output from the App with a qualified professional before making any financial decisions.

3. Limitation of Liability and Indemnification
By using this App, you agree to assume full responsibility for any financial decisions or "critical errors" made based on its output.

To the maximum extent permitted by law, you agree to indemnify, defend, and 
hold harmless the developers of this app, and any affiliates 
from and against any and all claims, losses, damages, liabilities, and expenses (including legal fees) arising from:

Your use or misuse of the App.

Any errors, omissions, or inaccuracies in the data or results generated.

Any financial loss, loss of profit, or "sequence of returns" failures resulting from reliance on the App.

4. User Responsibility
You acknowledge that financial planning is highly individualized. 
The "spending smiles," guardrails, or projections provided by Aira may not be suitable for your specific financial situation, risk tolerance, or time horizon.  Use at  your own risk and always
consult your fiduciary, CPA or tax accountant. 
*/