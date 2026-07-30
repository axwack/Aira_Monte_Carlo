import { expectedReturn } from "./expectedReturn.js";
import { resolveGlidepathSwitchAge } from "./glidepath.js";
import { spouseAgeOffset, personsAtLeastAge, spouseAgeAt, filesJointlyAt } from "./ages.js";
import { survivorFra, survivorBasis, resolveSurvivorClaimAge, survivorYearBenefit } from "./survivorBenefit.js";

// Progressive state income tax brackets (2025). null = no state income tax.
// Brackets are inflation-indexed in calcYearTax / buildRothExplorer via idxB().
const STATE_BRACKETS = {
  AL: { single: [{lo:0,hi:500,rate:.02},{lo:500,hi:3000,rate:.04},{lo:3000,hi:Infinity,rate:.05}],
         mfj:   [{lo:0,hi:1000,rate:.02},{lo:1000,hi:6000,rate:.04},{lo:6000,hi:Infinity,rate:.05}] },
  AK: null,
  AZ: { single: [{lo:0,hi:Infinity,rate:.025}], mfj: [{lo:0,hi:Infinity,rate:.025}] },
  AR: { single: [{lo:0,hi:4500,rate:.02},{lo:4500,hi:Infinity,rate:.039}],
         mfj:   [{lo:0,hi:4500,rate:.02},{lo:4500,hi:Infinity,rate:.039}] },
  CA: {
    single: [{lo:0,hi:10756,rate:.01},{lo:10756,hi:25499,rate:.02},{lo:25499,hi:40245,rate:.04},{lo:40245,hi:55866,rate:.06},{lo:55866,hi:70606,rate:.08},{lo:70606,hi:360659,rate:.093},{lo:360659,hi:432787,rate:.103},{lo:432787,hi:721314,rate:.113},{lo:721314,hi:1000000,rate:.123},{lo:1000000,hi:Infinity,rate:.133}],
    mfj:    [{lo:0,hi:21512,rate:.01},{lo:21512,hi:50998,rate:.02},{lo:50998,hi:80490,rate:.04},{lo:80490,hi:111732,rate:.06},{lo:111732,hi:141732,rate:.08},{lo:141732,hi:721318,rate:.093},{lo:721318,hi:865574,rate:.103},{lo:865574,hi:1000000,rate:.113},{lo:1000000,hi:1442628,rate:.123},{lo:1442628,hi:Infinity,rate:.133}],
  },
  CO: { single: [{lo:0,hi:Infinity,rate:.044}], mfj: [{lo:0,hi:Infinity,rate:.044}] },
  CT: {
    single: [{lo:0,hi:10000,rate:.02},{lo:10000,hi:50000,rate:.045},{lo:50000,hi:100000,rate:.055},{lo:100000,hi:200000,rate:.06},{lo:200000,hi:250000,rate:.065},{lo:250000,hi:500000,rate:.069},{lo:500000,hi:Infinity,rate:.0699}],
    mfj:    [{lo:0,hi:20000,rate:.02},{lo:20000,hi:100000,rate:.045},{lo:100000,hi:200000,rate:.055},{lo:200000,hi:400000,rate:.06},{lo:400000,hi:500000,rate:.065},{lo:500000,hi:1000000,rate:.069},{lo:1000000,hi:Infinity,rate:.0699}],
  },
  DE: { single: [{lo:0,hi:2000,rate:0},{lo:2000,hi:5000,rate:.022},{lo:5000,hi:10000,rate:.039},{lo:10000,hi:20000,rate:.048},{lo:20000,hi:25000,rate:.052},{lo:25000,hi:60000,rate:.0555},{lo:60000,hi:Infinity,rate:.066}],
         mfj:   [{lo:0,hi:2000,rate:0},{lo:2000,hi:5000,rate:.022},{lo:5000,hi:10000,rate:.039},{lo:10000,hi:20000,rate:.048},{lo:20000,hi:25000,rate:.052},{lo:25000,hi:60000,rate:.0555},{lo:60000,hi:Infinity,rate:.066}] },
  FL: null,
  GA: { single: [{lo:0,hi:Infinity,rate:.0539}], mfj: [{lo:0,hi:Infinity,rate:.0539}] },
  HI: {
    single: [{lo:0,hi:9600,rate:.014},{lo:9600,hi:14400,rate:.032},{lo:14400,hi:19200,rate:.055},{lo:19200,hi:24000,rate:.064},{lo:24000,hi:36000,rate:.068},{lo:36000,hi:48000,rate:.072},{lo:48000,hi:125000,rate:.076},{lo:125000,hi:175000,rate:.079},{lo:175000,hi:225000,rate:.0825},{lo:225000,hi:275000,rate:.09},{lo:275000,hi:325000,rate:.10},{lo:325000,hi:Infinity,rate:.11}],
    mfj:    [{lo:0,hi:19200,rate:.014},{lo:19200,hi:28800,rate:.032},{lo:28800,hi:38400,rate:.055},{lo:38400,hi:48000,rate:.064},{lo:48000,hi:72000,rate:.068},{lo:72000,hi:96000,rate:.072},{lo:96000,hi:250000,rate:.076},{lo:250000,hi:350000,rate:.079},{lo:350000,hi:450000,rate:.0825},{lo:450000,hi:550000,rate:.09},{lo:550000,hi:650000,rate:.10},{lo:650000,hi:Infinity,rate:.11}],
  },
  ID: { single: [{lo:0,hi:4673,rate:0},{lo:4673,hi:Infinity,rate:.05695}],
         mfj:   [{lo:0,hi:9346,rate:0},{lo:9346,hi:Infinity,rate:.05695}] },
  IL: { single: [{lo:0,hi:Infinity,rate:.0495}], mfj: [{lo:0,hi:Infinity,rate:.0495}] },
  IN: { single: [{lo:0,hi:Infinity,rate:.03}],   mfj: [{lo:0,hi:Infinity,rate:.03}] },
  IA: { single: [{lo:0,hi:Infinity,rate:.038}],   mfj: [{lo:0,hi:Infinity,rate:.038}] },
  KS: { single: [{lo:0,hi:23000,rate:.052},{lo:23000,hi:Infinity,rate:.0558}],
         mfj:   [{lo:0,hi:46000,rate:.052},{lo:46000,hi:Infinity,rate:.0558}] },
  KY: { single: [{lo:0,hi:Infinity,rate:.04}], mfj: [{lo:0,hi:Infinity,rate:.04}] },
  LA: { single: [{lo:0,hi:Infinity,rate:.03}], mfj: [{lo:0,hi:Infinity,rate:.03}] },
  ME: {
    single: [{lo:0,hi:26800,rate:.058},{lo:26800,hi:63450,rate:.0675},{lo:63450,hi:Infinity,rate:.0715}],
    mfj:    [{lo:0,hi:53600,rate:.058},{lo:53600,hi:126900,rate:.0675},{lo:126900,hi:Infinity,rate:.0715}],
  },
  MD: {
    single: [{lo:0,hi:1000,rate:.02},{lo:1000,hi:2000,rate:.03},{lo:2000,hi:3000,rate:.04},{lo:3000,hi:100000,rate:.0475},{lo:100000,hi:125000,rate:.05},{lo:125000,hi:150000,rate:.0525},{lo:150000,hi:250000,rate:.055},{lo:250000,hi:Infinity,rate:.0575}],
    mfj:    [{lo:0,hi:1000,rate:.02},{lo:1000,hi:2000,rate:.03},{lo:2000,hi:3000,rate:.04},{lo:3000,hi:150000,rate:.0475},{lo:150000,hi:175000,rate:.05},{lo:175000,hi:225000,rate:.0525},{lo:225000,hi:300000,rate:.055},{lo:300000,hi:Infinity,rate:.0575}],
  },
  MA: { single: [{lo:0,hi:1083150,rate:.05},{lo:1083150,hi:Infinity,rate:.09}],
         mfj:   [{lo:0,hi:1083150,rate:.05},{lo:1083150,hi:Infinity,rate:.09}] },
  MI: { single: [{lo:0,hi:Infinity,rate:.0425}], mfj: [{lo:0,hi:Infinity,rate:.0425}] },
  MN: {
    single: [{lo:0,hi:32570,rate:.0535},{lo:32570,hi:106990,rate:.068},{lo:106990,hi:198630,rate:.0785},{lo:198630,hi:Infinity,rate:.0985}],
    mfj:    [{lo:0,hi:47620,rate:.0535},{lo:47620,hi:189180,rate:.068},{lo:189180,hi:330410,rate:.0785},{lo:330410,hi:Infinity,rate:.0985}],
  },
  MS: { single: [{lo:0,hi:10000,rate:0},{lo:10000,hi:Infinity,rate:.044}],
         mfj:   [{lo:0,hi:10000,rate:0},{lo:10000,hi:Infinity,rate:.044}] },
  MO: {
    single: [{lo:0,hi:1313,rate:0},{lo:1313,hi:2626,rate:.02},{lo:2626,hi:3939,rate:.025},{lo:3939,hi:5252,rate:.03},{lo:5252,hi:6565,rate:.035},{lo:6565,hi:7878,rate:.04},{lo:7878,hi:9191,rate:.045},{lo:9191,hi:Infinity,rate:.047}],
    mfj:    [{lo:0,hi:1313,rate:0},{lo:1313,hi:2626,rate:.015},{lo:2626,hi:3939,rate:.025},{lo:3939,hi:5252,rate:.03},{lo:5252,hi:6565,rate:.035},{lo:6565,hi:7878,rate:.04},{lo:7878,hi:9191,rate:.045},{lo:9191,hi:Infinity,rate:.047}],
  },
  MT: { single: [{lo:0,hi:21100,rate:.047},{lo:21100,hi:Infinity,rate:.059}],
         mfj:   [{lo:0,hi:42200,rate:.047},{lo:42200,hi:Infinity,rate:.059}] },
  NE: {
    single: [{lo:0,hi:4030,rate:.0246},{lo:4030,hi:24120,rate:.0351},{lo:24120,hi:38870,rate:.0501},{lo:38870,hi:Infinity,rate:.052}],
    mfj:    [{lo:0,hi:8040,rate:.0246},{lo:8040,hi:48250,rate:.0351},{lo:48250,hi:77730,rate:.0501},{lo:77730,hi:Infinity,rate:.052}],
  },
  NV: null,
  NH: null,
  NJ: {
    single: [{lo:0,hi:20000,rate:.014},{lo:20000,hi:35000,rate:.0175},{lo:35000,hi:40000,rate:.035},{lo:40000,hi:75000,rate:.05525},{lo:75000,hi:500000,rate:.0637},{lo:500000,hi:1000000,rate:.0897},{lo:1000000,hi:Infinity,rate:.1075}],
    mfj:    [{lo:0,hi:20000,rate:.014},{lo:20000,hi:50000,rate:.0175},{lo:50000,hi:70000,rate:.0245},{lo:70000,hi:80000,rate:.035},{lo:80000,hi:150000,rate:.05525},{lo:150000,hi:500000,rate:.0637},{lo:500000,hi:1000000,rate:.0897},{lo:1000000,hi:Infinity,rate:.1075}],
  },
  NM: {
    single: [{lo:0,hi:5500,rate:.015},{lo:5500,hi:16500,rate:.032},{lo:16500,hi:33500,rate:.043},{lo:33500,hi:66500,rate:.047},{lo:66500,hi:210000,rate:.049},{lo:210000,hi:Infinity,rate:.059}],
    mfj:    [{lo:0,hi:8000,rate:.015},{lo:8000,hi:25000,rate:.032},{lo:25000,hi:50000,rate:.043},{lo:50000,hi:100000,rate:.047},{lo:100000,hi:315500,rate:.049},{lo:315500,hi:Infinity,rate:.059}],
  },
  NY: {
    single: [{lo:0,hi:8500,rate:.04},{lo:8500,hi:11700,rate:.045},{lo:11700,hi:13900,rate:.0525},{lo:13900,hi:80650,rate:.055},{lo:80650,hi:215400,rate:.06},{lo:215400,hi:1077550,rate:.0685},{lo:1077550,hi:5000000,rate:.0965},{lo:5000000,hi:25000000,rate:.103},{lo:25000000,hi:Infinity,rate:.109}],
    mfj:    [{lo:0,hi:17150,rate:.04},{lo:17150,hi:23600,rate:.045},{lo:23600,hi:27900,rate:.0525},{lo:27900,hi:161550,rate:.055},{lo:161550,hi:323200,rate:.06},{lo:323200,hi:2155350,rate:.0685},{lo:2155350,hi:5000000,rate:.0965},{lo:5000000,hi:25000000,rate:.103},{lo:25000000,hi:Infinity,rate:.109}],
  },
  NC: { single: [{lo:0,hi:Infinity,rate:.0425}], mfj: [{lo:0,hi:Infinity,rate:.0425}] },
  ND: {
    single: [{lo:0,hi:48475,rate:0},{lo:48475,hi:244825,rate:.0195},{lo:244825,hi:Infinity,rate:.025}],
    mfj:    [{lo:0,hi:80975,rate:0},{lo:80975,hi:298075,rate:.0195},{lo:298075,hi:Infinity,rate:.025}],
  },
  OH: { single: [{lo:0,hi:26050,rate:0},{lo:26050,hi:Infinity,rate:.0275}],
         mfj:   [{lo:0,hi:26050,rate:0},{lo:26050,hi:Infinity,rate:.0275}] },
  OK: {
    single: [{lo:0,hi:1000,rate:.0025},{lo:1000,hi:2500,rate:.0075},{lo:2500,hi:3750,rate:.0175},{lo:3750,hi:4900,rate:.0275},{lo:4900,hi:7200,rate:.0375},{lo:7200,hi:Infinity,rate:.0475}],
    mfj:    [{lo:0,hi:2000,rate:.0025},{lo:2000,hi:5000,rate:.0075},{lo:5000,hi:7500,rate:.0175},{lo:7500,hi:9800,rate:.0275},{lo:9800,hi:14400,rate:.0375},{lo:14400,hi:Infinity,rate:.0475}],
  },
  OR: {
    single: [{lo:0,hi:4400,rate:.0475},{lo:4400,hi:11050,rate:.0675},{lo:11050,hi:125000,rate:.0875},{lo:125000,hi:Infinity,rate:.099}],
    mfj:    [{lo:0,hi:8800,rate:.0475},{lo:8800,hi:22100,rate:.0675},{lo:22100,hi:250000,rate:.0875},{lo:250000,hi:Infinity,rate:.099}],
  },
  PA: { single: [{lo:0,hi:Infinity,rate:.0307}], mfj: [{lo:0,hi:Infinity,rate:.0307}] },
  RI: { single: [{lo:0,hi:79900,rate:.0375},{lo:79900,hi:181650,rate:.0475},{lo:181650,hi:Infinity,rate:.0599}],
         mfj:   [{lo:0,hi:79900,rate:.0375},{lo:79900,hi:181650,rate:.0475},{lo:181650,hi:Infinity,rate:.0599}] },
  SC: { single: [{lo:0,hi:3560,rate:0},{lo:3560,hi:17830,rate:.03},{lo:17830,hi:Infinity,rate:.062}],
         mfj:   [{lo:0,hi:3560,rate:0},{lo:3560,hi:17830,rate:.03},{lo:17830,hi:Infinity,rate:.062}] },
  SD: null,
  TN: null,
  TX: null,
  UT: { single: [{lo:0,hi:Infinity,rate:.0455}], mfj: [{lo:0,hi:Infinity,rate:.0455}] },
  VT: {
    single: [{lo:0,hi:47900,rate:.0335},{lo:47900,hi:116000,rate:.066},{lo:116000,hi:242000,rate:.076},{lo:242000,hi:Infinity,rate:.0875}],
    mfj:    [{lo:0,hi:79950,rate:.0335},{lo:79950,hi:193300,rate:.066},{lo:193300,hi:294600,rate:.076},{lo:294600,hi:Infinity,rate:.0875}],
  },
  VA: { single: [{lo:0,hi:3000,rate:.02},{lo:3000,hi:5000,rate:.03},{lo:5000,hi:17000,rate:.05},{lo:17000,hi:Infinity,rate:.0575}],
         mfj:   [{lo:0,hi:3000,rate:.02},{lo:3000,hi:5000,rate:.03},{lo:5000,hi:17000,rate:.05},{lo:17000,hi:Infinity,rate:.0575}] },
  WA: null,
  WV: { single: [{lo:0,hi:10000,rate:.0222},{lo:10000,hi:25000,rate:.0296},{lo:25000,hi:40000,rate:.0333},{lo:40000,hi:60000,rate:.0444},{lo:60000,hi:Infinity,rate:.0482}],
         mfj:   [{lo:0,hi:10000,rate:.0222},{lo:10000,hi:25000,rate:.0296},{lo:25000,hi:40000,rate:.0333},{lo:40000,hi:60000,rate:.0444},{lo:60000,hi:Infinity,rate:.0482}] },
  WI: {
    single: [{lo:0,hi:14680,rate:.035},{lo:14680,hi:29370,rate:.044},{lo:29370,hi:323290,rate:.053},{lo:323290,hi:Infinity,rate:.0765}],
    mfj:    [{lo:0,hi:19580,rate:.035},{lo:19580,hi:39150,rate:.044},{lo:39150,hi:431060,rate:.053},{lo:431060,hi:Infinity,rate:.0765}],
  },
  WY: null,
  DC: { single: [{lo:0,hi:10000,rate:.04},{lo:10000,hi:40000,rate:.06},{lo:40000,hi:60000,rate:.065},{lo:60000,hi:250000,rate:.085},{lo:250000,hi:500000,rate:.0925},{lo:500000,hi:1000000,rate:.0975},{lo:1000000,hi:Infinity,rate:.1075}],
         mfj:   [{lo:0,hi:10000,rate:.04},{lo:10000,hi:40000,rate:.06},{lo:40000,hi:60000,rate:.065},{lo:60000,hi:250000,rate:.085},{lo:250000,hi:500000,rate:.0925},{lo:500000,hi:1000000,rate:.0975},{lo:1000000,hi:Infinity,rate:.1075}] },
};

function getStateBrackets(state, isMFJ) {
  const entry = STATE_BRACKETS[state];
  if (!entry) return null;
  return isMFJ ? entry.mfj : entry.single;
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
    if (isNaN(portfolioValue) || portfolioValue <= 0) return floor || 0;
    if (isNaN(lastWithdrawal)) lastWithdrawal = floor || 0;
    if (isNaN(lastReturn)) lastReturn = 0;
    if (isNaN(inflationRate)) inflationRate = 0.02;
    if (isNaN(initialWR)) initialWR = 0.04;

    let w =
      lastReturn >= 0 ? lastWithdrawal * (1 + inflationRate) : lastWithdrawal;
    const currentWR = portfolioValue !== 0 ? w / portfolioValue : 0;

    if (currentWR <= initialWR * 0.8) w *= 1.1;
    else if (currentWR >= initialWR * 1.2) w *= 0.9;

    return Math.max(floor || 0, Math.min(ceiling || Infinity, w));
}

// 2026 MFJ federal brackets (inflation-adjusted from 2025)
const FED_BRACKETS_2026_MFJ = [
  { lo: 0,       hi: 24800,  rate: 0.10 },
  { lo: 24800,   hi: 100800, rate: 0.12 },
  { lo: 100800,  hi: 211400, rate: 0.22 },
  { lo: 211400,  hi: 403550, rate: 0.24 },
  { lo: 403550,  hi: 512450, rate: 0.32 },
  { lo: 512450,  hi: 768700, rate: 0.35 },
  { lo: 768700,  hi: Infinity, rate: 0.37 },
];

// 2026 Single filer federal brackets
const FED_BRACKETS_2026_SINGLE = [
  { lo: 0,      hi: 12400,  rate: 0.10 },
  { lo: 12400,  hi: 50400,  rate: 0.12 },
  { lo: 50400,  hi: 105700, rate: 0.22 },
  { lo: 105700, hi: 201800, rate: 0.24 },
  { lo: 201800, hi: 256225, rate: 0.32 },
  { lo: 256225, hi: 640600, rate: 0.35 },
  { lo: 640600, hi: Infinity, rate: 0.37 },
];

const IRMAA_2026 = [
  { m: 218000, f: 0 },
  { m: 274000, f: 2160 },
  { m: 342000, f: 5470 },
  { m: 410000, f: 8300 },
  { m: 750000, f: 11130 },
];

// 2026 LTCG/qualified-dividend taxable-income breakpoints (IRS Rev. Proc. 2025-32),
// inflation-indexed forward in calcYearTax / buildWithdrawalWaterfall via idxB(),
// exactly like the ordinary federal brackets above. Single source of truth for
// both engines — do not re-declare these literals elsewhere.
const LTCG_BRACKETS_2026_MFJ = [
  { lo: 0,       hi: 98_700,  rate: 0.00 },
  { lo: 98_700,  hi: 613_700, rate: 0.15 },
  { lo: 613_700, hi: Infinity, rate: 0.20 },
];
const LTCG_BRACKETS_2026_SINGLE = [
  { lo: 0,       hi: 49_350,  rate: 0.00 },
  { lo: 49_350,  hi: 566_700, rate: 0.15 },
  { lo: 566_700, hi: Infinity, rate: 0.20 },
];

// Net Investment Income Tax (IRC §1411) — 3.8% surtax on the lesser of net
// investment income (LTCG here) or the excess of MAGI over the threshold.
// Thresholds are STATUTORY and Congress has never indexed them for inflation
// (unlike the ordinary brackets/IRMAA/standard deduction above) — do not
// apply idxB()/inflFactor to these two numbers.
const NIIT_THRESHOLD_MFJ = 250_000;
const NIIT_THRESHOLD_SINGLE = 200_000;
const NIIT_RATE = 0.038;

// ── OBBBA senior bonus deduction ──────────────────────────────────────────────
// Canonical source: TAX_REFERENCE.md → "OBBBA Senior Bonus Deduction".
// A THIRD, independent below-the-line deduction (2025–2028 only), separate from
// the standard deduction and its age-65 add-on. Deliberately NOT folded into
// getStandardDeduction(): OBBBA is available to itemizers as well as
// non-itemizers, so merging it would make an itemizer model impossible later.
//
// Like NIIT's thresholds these are STATUTORY and flat — the statute does not
// index the $6,000 or the phase-out thresholds during 2025–2028, so
// getSeniorBonusDeduction() takes NO inflFactor parameter, by design. Do not
// "helpfully" add one.
const OBBBA_SENIOR_PER_PERSON = 6_000;
const OBBBA_SENIOR_PHASEOUT_START_MFJ = 150_000;
const OBBBA_SENIOR_PHASEOUT_START_SINGLE = 75_000;
const OBBBA_SENIOR_PHASEOUT_RATE = 0.06;   // 6% of MAGI above the threshold
const OBBBA_SENIOR_MIN_AGE = 65;
const OBBBA_SENIOR_FIRST_YEAR = 2025;
const OBBBA_SENIOR_LAST_YEAR = 2028;       // $0 from 2029 — hard cliff, not a phase-down

/**
 * OBBBA senior bonus deduction for one tax year.
 *
 * IMPORTANT — this reduces TAXABLE INCOME ONLY. It must never be subtracted from
 * AGI / MAGI / totalIncome / totInc. IRMAA is computed on MAGI with no deduction
 * subtracted (CLAUDE.md rule 3), so netting this against MAGI would silently
 * move users under IRMAA tiers they actually breach.
 *
 * `magi` is the year's own MAGI (ordinary income + realized gains), which in both
 * engines is computed independently of any deduction — so there is no circular
 * dependency between this phase-out and the deduction it produces.
 *
 * @param {number} age        modeled age in the tax year
 * @param {string} filingStatus  "single" → 1 person, anything else → MFJ
 * @param {number} magi       the year's MAGI, for the phase-out
 * @param {number} yr         calendar tax year (gates the 2025–2028 window)
 * @returns {number} deduction in nominal dollars, 0 outside the window
 */
function getSeniorBonusDeduction(age, filingStatus, magi, yr, spouseAge = null) {
  if (yr < OBBBA_SENIOR_FIRST_YEAR || yr > OBBBA_SENIOR_LAST_YEAR) return 0;
  const mfj = filingStatus !== "single";
  // PER PERSON, counted per person. This used to be `mfj ? 2 : 1` gated on the
  // primary's age alone, which both (a) gave a couple $12,000 the year the older
  // one turned 65 while the younger was still 55, and (b) gave them $0 in the
  // reverse case, where the OLDER spouse qualifies but the primary does not.
  // personsAtLeastAge is shared with getStandardDeduction so the two deductions
  // can never disagree about household composition.
  const persons = personsAtLeastAge(age, spouseAge, mfj, OBBBA_SENIOR_MIN_AGE);
  if (persons === 0) return 0;
  const threshold = mfj ? OBBBA_SENIOR_PHASEOUT_START_MFJ : OBBBA_SENIOR_PHASEOUT_START_SINGLE;
  const excess = Math.max(0, (magi || 0) - threshold);
  // The phase-out bites EACH person's own $6,000 at 6% of the household's excess
  // MAGI, so one person is fully phased out at threshold + $100,000 — $175K
  // single / $250K MFJ. Scaling the reduction by `persons` reproduces that.
  const gross = OBBBA_SENIOR_PER_PERSON * persons;
  const reduction = OBBBA_SENIOR_PHASEOUT_RATE * excess * persons;
  return Math.round(Math.max(0, gross - reduction));
}

// IRS Pub 590-B Table III (Uniform Lifetime) divisors, 2022+ table.
// Default table for owners whose sole-beneficiary spouse is NOT >10 years younger.
const RMD_DIV = {
  72: 27.4,
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
};

// IRS Pub 590-B Table II (Joint & Last Survivor) — owner with sole beneficiary spouse >10 yrs younger
const JOINT_RMD_DIV = {
  73: 25.3, 74: 24.6, 75: 24.0, 76: 23.4, 77: 22.8,
  78: 22.3, 79: 21.8, 80: 21.3, 81: 20.9, 82: 20.5,
  83: 20.1, 84: 19.7, 85: 19.3, 86: 19.0, 87: 18.7,
  88: 18.4, 89: 18.1, 90: 17.8,
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

/**
 * `beneficiaries` = how many people in the household are actually ON Medicare
 * (65+) this year. Thresholds are per TAX RETURN so they follow filing status;
 * the surcharge is per BENEFICIARY, so an age-gapped couple pays ONE surcharge
 * against the MFJ threshold until the younger reaches 65 (§24). Must stay
 * byte-identical to App.jsx's irmaaCost — the two are a known duplication.
 */
function irmaaCost(magi, yr, infR = 0.025, isMFJ = true, beneficiaries = null) {
  // Anchored to ROTH_BASE_YEAR (today), not a hardcoded 2026, so this stays
  // consistent with the rest of this file as real calendar time passes.
  const f = Math.pow(1 + infR, yr - ROTH_BASE_YEAR);
  // IRMAA_2026[i].f is the TWO-person MFJ surcharge; half of it is one person's.
  const n = beneficiaries != null ? Math.max(0, beneficiaries) : (isMFJ ? 2 : 1);
  if (n === 0) return 0;
  for (let i = IRMAA_2026.length - 1; i >= 0; i--) {
    // Single tiers are half the MFJ thresholds, except the top tier ($500,000 vs $750,000).
    const thresh = isMFJ ? IRMAA_2026[i].m
      : (i === IRMAA_2026.length - 1 ? 500_000 : IRMAA_2026[i].m / 2);
    const cost = (IRMAA_2026[i].f / 2) * n;
    if (magi >= thresh * f) return Math.round(cost * f);
  }
  return 0;
}

/**
 * Taxable portion of Social Security per IRC §86 provisional-income tiers.
 * Thresholds are statutory and NOT inflation-indexed (unchanged since 1984/1994).
 * @param {number} ssGross    — gross SS benefits for the year
 * @param {number} otherIncome — other ordinary income counted in provisional income
 *                               (pretax draws, RMDs, conversions, rental, etc.)
 * @param {boolean} isMFJ
 * @returns {number} taxable amount of SS (0 … 0.85 × ssGross)
 */
function taxableSocialSecurity(ssGross, otherIncome, isMFJ = true) {
  if (!ssGross || ssGross <= 0) return 0;
  const base1 = isMFJ ? 32_000 : 25_000;
  const base2 = isMFJ ? 44_000 : 34_000;
  const provisional = (otherIncome || 0) + ssGross * 0.5;
  if (provisional <= base1) return 0;
  if (provisional <= base2) {
    return Math.min(0.5 * (provisional - base1), 0.5 * ssGross);
  }
  return Math.min(
    0.85 * (provisional - base2) + Math.min(0.5 * (base2 - base1), 0.5 * ssGross),
    0.85 * ssGross
  );
}

/**
 * Combined household gross Social Security for a given age, COLA growth
 * included — Phase 1 of §21 (REQUIREMENTS.md). Growth must live INSIDE this
 * helper rather than in each caller: with two people able to claim at
 * different ages, there is no single "age - claimAge" exponent a caller could
 * apply to an already-combined number, so each component grows from its own
 * start age and the pieces are summed after.
 *
 * `p.spouse.enabled === false` (the default) returns exactly the primary's own
 * grown benefit — byte-for-byte identical to every call site's pre-existing
 * single-person behavior, so existing profiles are unaffected.
 *
 * Spousal top-up: 50% of the HIGHER EARNER's PIA (FRA amount) minus the lower
 * earner's own PIA, floored at 0. Payable only once BOTH have filed (deemed
 * filing means filing for your own benefit and any spousal top-up happen
 * together — see §21 rule 6), growing with COLA from that point. Delayed
 * retirement credits never flow into it — it is capped at the FRA amount
 * regardless of either person's actual claim age. `ssPia` falls back to `ssb`
 * when not entered (claiming at exactly FRA, where the two amounts are equal).
 */
/**
 * Household Social Security AFTER the first death, with the survivor's own benefit
 * and the survivor benefit treated as the INDEPENDENT benefits they legally are.
 *
 * Exported (via the barrel at the bottom of this file) because the UI needs the
 * `own` / `survivor` / `source` breakdown, not just the total: a number that jumps
 * because the household switched from one benefit to the other has to be able to say
 * so. Returning only the total is how "the components don't add up" reports happen.
 *
 * `p.spouse.deathAge` is the DECEASED's age; the survivor here is the primary, whose
 * age is the clock every engine walks. See REQUIREMENTS §30 for the remaining
 * limitation (which of the two people can be the one who dies).
 */
function survivorHouseholdSS(p, age, ctx) {
  const { offset, cola, ssAge, spouseClaimOnPrimaryClock, deathAge } = ctx;
  const sp = p.spouse || {};

  // The survivor's own age when the death happens, on the primary's clock.
  const deathOnPrimaryClock = deathAge + offset;

  // Did the deceased ever start their benefit? This single question is what the old
  // implementation got wrong: it paid $0 until the deceased's claim age, when in
  // fact the survivor benefit derives from the deceased's PIA and is claimable from
  // 60 whether or not the deceased ever filed.
  const deceasedHadClaimed = deathOnPrimaryClock >= spouseClaimOnPrimaryClock;

  // Basis = 100% of what the deceased was receiving or entitled to, in TODAY's terms
  // as the user entered it. DRCs are included when they had claimed, because the
  // user's `ssb` is "what SSA estimates at the age they plan to claim".
  const basisToday = survivorBasis({
    deceasedCheck: Number(sp.ssb) || 0,
    deceasedPia:   Number(sp.ssPia) || 0,
    deceasedHadClaimed,
  });

  const survivorClaimAge = resolveSurvivorClaimAge(sp.survivorClaimAge, deathOnPrimaryClock);

  // Grow the basis by COLA from the point at which it was quoted up to the survivor's
  // claim age, so the reduction applies to a same-year amount.
  const basisRefAge = deceasedHadClaimed ? spouseClaimOnPrimaryClock : deathOnPrimaryClock;
  const growYears = Math.max(0, survivorClaimAge - basisRefAge);
  const basisAtClaim = basisToday * Math.pow(cola, growYears);

  // An explicit SSA-quoted survivor amount wins and is used AS QUOTED: SSA's figure
  // already has the early-claim reduction in it, so applying our factor on top would
  // double-count it. That is the §21 "ask, don't derive" path.
  const quoted = Number(sp.survivorBenefitAtClaim) || 0;
  const useQuoted = quoted > 0;

  const survivorFraAge = survivorFra(
    // The SURVIVOR's birth year — here the primary, whose dob drives the plan.
    (typeof p.dob === "string" && p.dob.length >= 4) ? parseInt(p.dob.slice(0, 4), 10)
      : (typeof p.birthYear === "number" ? p.birthYear
        : (typeof p.currentAge === "number" ? ROTH_BASE_YEAR - p.currentAge : null))
  );

  const res = survivorYearBenefit({
    survivorAge: age,
    ownClaimAge: ssAge,
    ownBenefitAtClaim: Number(p.ssb) || 0,
    survivorClaimAge,
    // When quoted, hand in the already-reduced figure and neutralise our factor by
    // passing the survivor's own claim age as the FRA (factor === 1).
    survivorBasisAtFra: useQuoted ? quoted : basisAtClaim,
    survivorFraAge: useQuoted ? survivorClaimAge : survivorFraAge,
    cola: cola - 1,
  });
  return { ...res, survivorClaimAge, survivorFraAge, deceasedHadClaimed, basisAtClaim };
}

function computeHouseholdSS(p, age) {
  const cola = 1 + (p.ssCola ?? 2.4) / 100;
  const ssAge = p.ssAge || 67;
  const own = age >= ssAge ? (p.ssb || 0) * Math.pow(cola, age - ssAge) : 0;
  if (!p.spouse?.enabled) return Math.round(own);

  // `age` is the PRIMARY's age — it is the only clock the engines walk. Every
  // spouse milestone must therefore be expressed on that clock, shifted by the
  // age gap. Without this, `age >= spouse.ssAge` asked "has the PRIMARY reached
  // the SPOUSE's claim age", which starts a younger spouse's benefit early by
  // exactly the gap: a spouse 10 years younger claiming at 67 was paid from the
  // primary's 67 (spouse aged 57) — ten years of benefits, plus the spousal
  // top-up, that the household will not actually receive. It inflated the
  // success rate for every couple with an age gap.
  //
  // offset > 0 ⇒ the spouse is younger ⇒ their milestones land LATER on the
  // primary's clock. Unknown spouse age ⇒ offset 0 ⇒ identical to the old
  // behaviour (regression lock in spousalSS.test.js).
  const offset = spouseAgeOffset(p);
  const spouseSsAge = p.spouse.ssAge || 67;
  const spouseClaimOnPrimaryClock = spouseSsAge + offset;

  /* ── Survivor benefit (§22) ────────────────────────────────────────────────
   * On the first death the household keeps the LARGER of the two checks and
   * loses the smaller — plus the spousal top-up, which a survivor benefit
   * replaces. This is what retires the hardcoded `× 0.67` haircut in the stress
   * scenario: 0.67 is only right for a one-earner couple (lose the 0.5 spousal,
   * keep the 1.0), whereas two similar earners keep ~50%. With both benefits on
   * file it is exact arithmetic and no literal is needed.
   *
   * The survivor benefit is 100% of the deceased's check INCLUDING any delayed
   * retirement credits, which is why this compares the grown checks rather than
   * the PIAs (delaying the higher earner raises the SURVIVOR benefit — the one
   * place DRCs do flow through, unlike the spousal top-up above).
   *
   * Modelled from the death year itself, at this engine's one-year granularity.
   * Benefits stop the month of death, so a partial year is unavoidable either
   * way; stepping down in the death year understates income slightly rather than
   * overstating it, which is the right direction for a plan's safety margin.
   * (Filing status is separate and correctly stays MFJ for that year — see
   * mfjAt in buildWithdrawalWaterfall.js.)
   */
  const deathAge = Number(p.spouse.deathAge) > 0 ? Number(p.spouse.deathAge) : null;
  if (deathAge != null && age >= deathAge + offset) {
    return Math.round(survivorHouseholdSS(p, age, {
      offset, cola, ssAge, spouseClaimOnPrimaryClock, deathAge,
    }).paid);
  }
  const spouseOwn = age >= spouseClaimOnPrimaryClock
    ? (p.spouse.ssb || 0) * Math.pow(cola, age - spouseClaimOnPrimaryClock)
    : 0;

  const primaryPia = p.ssPia || p.ssb || 0;
  const spousePia = p.spouse.ssPia || p.spouse.ssb || 0;
  const primaryIsHigher = primaryPia >= spousePia;
  // A spousal benefit requires BOTH that the claimant has filed and that the
  // higher earner has filed, so it starts at the later of the two — on one clock.
  const bothFiledAge = Math.max(ssAge, spouseClaimOnPrimaryClock);

  let topUp = 0;
  if (age >= bothFiledAge) {
    const raw = primaryIsHigher
      ? Math.max(0, 0.5 * primaryPia - spousePia)  // tops up the SPOUSE's check
      : Math.max(0, 0.5 * spousePia - primaryPia); // tops up the PRIMARY's check
    topUp = raw * Math.pow(cola, age - bothFiledAge);
  }

  return Math.round(own + spouseOwn + topUp);
}

const ROTH_BASE_YEAR = new Date().getFullYear();

function getRmdStartAge({ dob, birthYear, currentAge } = {}) {
  let by = null;
  if (typeof birthYear === "number" && birthYear > 0) by = birthYear;
  else if (typeof dob === "string" && dob.length >= 4) {
    const y = parseInt(dob.slice(0, 4), 10);
    if (!isNaN(y)) by = y;
  } else if (typeof currentAge === "number" && currentAge > 0) {
    by = ROTH_BASE_YEAR - currentAge;
  }
  if (by === null) return 73;
  if (by >= 1960) return 75;
  if (by >= 1951) return 73;
  return 72;
}

function buildRothExplorer(params = {}) {
  console.log("[buildRothExplorer] taxFunding =", params.taxFunding);
  const {
    currentAge,
    retireAge,
    ssAge,   // primary's own claim age — still used for the Golden Year label and summary; combined gross now comes from computeHouseholdSS(params, age)
    ab,
    useAb,
    inf,
    endAge = 90,
    port,
    twoHousehold,
    rothMode = "fill_22",           // keep default for mode only
    filingStatus = "mfj",
    stateOfResidence = "NJ",
    dob,
    birthYear,
    rmdStartAge,
    taxFunding = "from_taxable",
    fafsaGuard = false,
    fafsaEndYear = null,
    cssEndYear = null,
    conversionOverrides = [],
    useJointRmdTable = false,
    preRetireEq = 91,
    postRetireEq = 70,
    gr: grParam,
  } = params;
  // Build a fast year→amount lookup from the overrides array
  const overrideMap = {};
  for (const o of conversionOverrides) {
    if (o.year && o.amount != null) overrideMap[Number(o.year)] = Number(o.amount);
  }

  // Safeguard: if critical numbers are missing, return empty or throw a helpful error
  if (currentAge == null || retireAge == null || port == null) {
    console.warn("buildRothExplorer missing required params:", { currentAge, retireAge, port });
    return { opt: { rows: [], cTax: 0, cConv: 0 }, cur: { rows: [], cTax: 0, cConv: 0 }, convRows: [] };
  }


  const isMFJ = filingStatus !== "single";
  /* §22 — time-varying filing status, the SAME rule the other two engines use
   * (engine/ages.js). This engine advises on Roth conversions, and a survivor's
   * narrower brackets change that advice materially: converting into what looks
   * like 12% headroom while filing jointly can land in 22% for the survivor. All
   * three engines must agree about the household or the tabs contradict one
   * another — the recurring defect class in this codebase. */
  const mfjAt = (a) => filesJointlyAt(params, a);
  const spAgeAt = (a) => spouseAgeAt(params, a);
  const fedBaseAt = (a) => (mfjAt(a) ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE);
  const stdDedBaseAt = (a) => (mfjAt(a) ? 32200 : 16100);
  // Per FILER, not per household (§24): counted by personsAtLeastAge below.
  const STD_DED_AGE_BONUS_PER_HEAD = 1650;
  const _statutoryRmdAge = getRmdStartAge({ dob, birthYear, currentAge });
  const rmdAge = Math.max(
    typeof rmdStartAge === "number" && rmdStartAge > 0 ? rmdStartAge : _statutoryRmdAge,
    _statutoryRmdAge
  );

  const stateBrAt = (a) => getStateBrackets(stateOfResidence, mfjAt(a));
  // Retained for the no-tax-state test below, which is filing-status independent.
  const stateBr0 = getStateBrackets(stateOfResidence, isMFJ);
  const infR = inf / 100,
    retireYear = ROTH_BASE_YEAR + (retireAge - currentAge),
    isNoTaxState = twoHousehold || !stateBr0;

  const _pretaxSum = (params.accounts || []).filter(a => a.category === "pretax").reduce((s, a) => s + (a.balance || 0), 0);
  const _rothSum = (params.accounts || []).filter(a => a.category === "roth").reduce((s, a) => s + (a.balance || 0), 0);
  const _otherSum = (params.accounts || []).filter(a => !["pretax","roth"].includes(a.category)).reduce((s, a) => s + (a.balance || 0), 0);
  const _totalFromAccounts = _pretaxSum + _rothSum + _otherSum;
  const pretaxBal = _totalFromAccounts > 0 ? _pretaxSum : port * 0.6,
    rothBal = _totalFromAccounts > 0 ? _rothSum : port * 0.4,
    taxBal0 = _totalFromAccounts > 0 ? _otherSum : 0;
  // Expected growth now derives from the same equity-glide formula runMC's
  // portReturn uses (expectedReturn(eqPct), shared via ./expectedReturn.js)
  // instead of a hardcoded flat 7% that ignored preRetireEq/postRetireEq.
  // This engine has no separate pre-retirement accumulation phase (it starts
  // from `port`/accounts as-of retirement), but the per-year retirement loop
  // below still mirrors runMC's portReturn glidepath switch (preRetireEq below
  // glideSwitchAge, postRetireEq from it on). The switch age was hardcoded to
  // 62 here while portReturn switched at the retirement age, so a profile
  // retiring at 60 was grown at the ACCUMULATION rate for its first two
  // drawdown years in this tab and the post-retirement rate in the Monte
  // Carlo. An explicit gr override (grParam) still wins for both phases.
  const preGr  = grParam ?? (expectedReturn(preRetireEq) / 100);
  const postGr = grParam ?? (expectedReturn(postRetireEq) / 100);
  const glideSwitchAge = resolveGlidepathSwitchAge({ ...params, retireAge });

  function irmaaCeiling(yr, age = null) {
    const f = Math.pow(1 + infR, yr - ROTH_BASE_YEAR);
    const mfj = age == null ? isMFJ : mfjAt(age);
    return Math.round((mfj ? 218_000 : 109_000) * f);
  }

  const gkF = params.gkFloor || 48000;
  const gkC = params.gkCeiling || 115000;
  const baseSp = params.sp || 100000;

  function runScenario(doConvert) {
    let pT = pretaxBal,
      ro = rothBal,
      taxBal = taxBal0,
      cTax = 0,
      cConv = 0,
      cIrmaa = 0,
      cRmd = 0;
    const rows = [];
    let sp = baseSp,
      lastReturn = retireAge < glideSwitchAge ? preGr : postGr;
    const totalPort0 = pretaxBal + rothBal;
    const ss0 = computeHouseholdSS(params, retireAge);
    const ab0 = ab > 0 ? ab : 0;
    const initDraw0 = Math.max(0, baseSp - ss0 - ab0);
    const initWR = totalPort0 > 0 ? initDraw0 / totalPort0 : 0.04;

    for (let age = retireAge; age <= endAge; age++) {
      const yr = retireYear + (age - retireAge),
        f = Math.pow(1 + infR, yr - ROTH_BASE_YEAR);
      // Per-year growth rate — mirrors runMC's portReturn glidepath switch
      // (preRetireEq below glideSwitchAge, postRetireEq from it on).
      const gr = age < glideSwitchAge ? preGr : postGr;
      const fB = idxB(fedBaseAt(age), f);
      const stBr = stateBrAt(age);
      const nB = stBr ? idxB(stBr, f) : [];

      // Age-65 add-on is PER FILER (§24) — counted, not granted wholesale the
      // moment the primary turns 65.
      const stdD = Math.round(stdDedBaseAt(age) * f)
        + personsAtLeastAge(age, spAgeAt(age), mfjAt(age), 65) * Math.round(STD_DED_AGE_BONUS_PER_HEAD * f);
      const b10t = fB.find((b) => b.rate === 0.10)?.hi || Math.round((mfjAt(age) ? 24800 : 12400) * f);
      const b12t = fB.find((b) => b.rate === 0.12)?.hi || Math.round((mfjAt(age) ? 100800 : 50400) * f);
      const b22t = fB.find((b) => b.rate === 0.22)?.hi || Math.round((mfjAt(age) ? 211400 : 105700) * f);
      const b24t = fB.find((b) => b.rate === 0.24)?.hi || Math.round((mfjAt(age) ? 403550 : 201800) * f);
      const b32t = fB.find((b) => b.rate === 0.32)?.hi || Math.round((mfjAt(age) ? 512450 : 256225) * f);
      const b35t = fB.find((b) => b.rate === 0.35)?.hi || Math.round((mfjAt(age) ? 768700 : 384350) * f);
      const b37t = Infinity; // top bracket has no ceiling

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

      const ss = computeHouseholdSS(params, age);
      const abn = ab > 0 && age <= 80
        ? Math.round(ab * Math.pow(1.03, Math.min(age - retireAge, 20)))
        : 0;
      const portDraw = Math.max(0, sp - ss - abn);

      // RMD calculation — table selected by useJointRmdTable param
      let rmd = 0;
      if (age >= rmdAge && pT > 0) {
        // Joint table only applies when actually filing jointly — a stale
        // useJointRmdTable=true left over from switching filingStatus to
        // "single" must fall back to the standard Uniform Lifetime table,
        // matching runMC's `useJointTable` gate.
        const rmdTable = (useJointRmdTable && mfjAt(age)) ? JOINT_RMD_DIV : RMD_DIV;
        const divisor = rmdTable[age] || 15.0;
        rmd = Math.round(pT / divisor);
      }
      // Dynamic withdrawal ratio: derive pretax/Roth split from actual balances each year.
      // As Roth grows from conversions the ratio naturally shifts toward tax-free draws.
      const pretaxShare = totalPort > 0 ? pT / totalPort : 0;
      const additionalNeeded = Math.max(0, portDraw - rmd);
      const additionalPretax = Math.min(
        Math.round(additionalNeeded * pretaxShare),
        Math.max(0, pT - rmd)
      );
      const additionalRoth = additionalNeeded - additionalPretax;
      // Pre-tax draws beyond the forced RMD are ordinary income (traditional IRA/401k withdrawals)
      const pretaxSpend = additionalPretax;
      // IRC §86: taxable SS depends on provisional income (other ordinary income + ½ SS)
      const otherOrdInc = abn + rmd + pretaxSpend;
      const ssT = Math.round(taxableSocialSecurity(ss, otherOrdInc, mfjAt(age)));
      const incBC = ssT + otherOrdInc;
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
        if (overrideMap[yr] !== undefined) {
          conv = Math.round(Math.min(Math.max(0, overrideMap[yr]), pT));
          capReason = overrideMap[yr] === 0 ? "manual $0" : "manual override";
        } else {
          let targetTop;
          if (rothMode === "fill_10") { targetTop = b10t; capReason = "mode 10%"; }
          else if (rothMode === "fill_12") { targetTop = b12t; capReason = "mode 12%"; }
          else if (rothMode === "fill_22") { targetTop = b22t; capReason = "mode 22%"; }
          else if (rothMode === "fill_24") { targetTop = b24t; capReason = "mode 24%"; }
          else if (rothMode === "fill_32") { targetTop = b32t; capReason = "mode 32%"; }
          else if (rothMode === "fill_35") { targetTop = b35t; capReason = "mode 35%"; }
          else if (rothMode === "fill_37") { targetTop = b37t; capReason = "mode 37%"; }
          else if (rothMode === "irmaa_safe") {
            const irmaaTop = irmaaCeiling(yr, age) + stdD;
            if (irmaaTop < b22t) { targetTop = irmaaTop; capReason = "IRMAA ceiling"; }
            else { targetTop = b22t; capReason = "mode 22%"; }
          } else { targetTop = b22t; capReason = "mode 22%"; }

          // IRMAA lookback guard: ages 60-65 — cap at 22% for aggressive brackets
          if (age >= 60 && age <= 65 && ["fill_24","fill_32","fill_35","fill_37"].includes(rothMode) && b22t < targetTop) {
            targetTop = b22t; capReason = "IRMAA lookback (age 60–65)";
          }
          // FAFSA/CSS college-aid guards — year values alone are the trigger (no toggle required)
          if (fafsaEndYear && yr <= fafsaEndYear && b12t < targetTop) {
            targetTop = b12t; capReason = `FAFSA guard (≤${fafsaEndYear})`;
          }
          if (cssEndYear && yr <= cssEndYear && (!fafsaEndYear || yr > fafsaEndYear) && b22t < targetTop) {
            targetTop = b22t; capReason = `CSS Profile guard (≤${cssEndYear})`;
          }
          // room is sized so post-conversion taxable income lands exactly on targetTop,
          // even when pre-conversion income (incBC) was below stdD and txBC got floored at 0.
          const room = Math.max(0, targetTop + stdD - incBC);
          const preCap = Math.min(room, Math.max(0, pT));
          conv = Math.round(preCap);
          if (pT < room) capReason = "pretax exhausted";
        }
      }

      // Conversion income raises provisional income, dragging more SS into taxation
      const ssTConv = conv > 0
        ? Math.round(taxableSocialSecurity(ss, otherOrdInc + conv, mfjAt(age)))
        : ssT;
      const totInc = ssTConv + otherOrdInc + conv,
        txInc = Math.max(0, totInc - stdD);
      const fedT = Math.round(progTax(txInc, fB));
      const stT = isNoTaxState ? 0 : Math.round(progTax(Math.max(0, txInc), nB));
      const totT = fedT + stT,
        effR = totInc > 0 ? totT / totInc : 0;
      // IRMAA MAGI = AGI + tax-exempt interest; the untaxed portion of SS is NOT added back
      const magi = totInc;
      const medicareHeads = personsAtLeastAge(age, spAgeAt(age), mfjAt(age), 65);
      const irmaa = medicareHeads > 0 ? irmaaCost(magi, yr, infR, mfjAt(age), medicareHeads) : 0;

      let margR = 0;
      if (conv > 0) {
        const txIncNo = Math.max(0, incBC - stdD);
        const fedTNo = Math.round(progTax(txIncNo, fB));
        const stTNo = isNoTaxState ? 0 : Math.round(progTax(txIncNo, nB));
        const magiNo = incBC;
        const irmaaNo = medicareHeads > 0 ? irmaaCost(magiNo, yr, infR, mfjAt(age), medicareHeads) : 0;
        const dTax = (fedT + stT + irmaa) - (fedTNo + stTNo + irmaaNo);
        margR = dTax / conv;
      }

      let roAdd = conv;
      let taxFromTaxable = 0;
      if (doConvert && conv > 0 && totT > 0) {
        if (taxFunding === "from_conv") {
          roAdd = Math.max(0, conv - totT);
        } else if (taxFunding === "from_taxable") {
          taxFromTaxable = Math.min(taxBal, totT);
          if (taxFromTaxable < totT) {
            roAdd = Math.max(0, conv - (totT - taxFromTaxable));
          }
        } else if (taxFunding === "outside_cash") {
          taxFromTaxable = Math.min(taxBal, totT);
        }
      }
      const pTStart = pT, roStart = ro;
      taxBal = Math.max(0, taxBal - taxFromTaxable) * (1 + gr);
      pT = Math.max(0, pT - rmd - conv - additionalPretax) * (1 + gr);
      ro = Math.max(0, ro + roAdd - additionalRoth) * (1 + gr);
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

      const convByBr = { conv10: 0, conv12: 0, conv22: 0, conv24: 0, conv32: 0, conv35: 0, conv37: 0 };
      if (conv > 0) {
        fB.forEach((b) => {
          const inBr = Math.max(0, Math.min(txInc, b.hi) - Math.max(txBC, b.lo));
          const key = `conv${Math.round(b.rate * 100)}`;
          if (key in convByBr) convByBr[key] = Math.round(inBr);
        });
      }
      rows.push({
        yr, age, ss, abn, rmd, pretaxSpend, conv, baseInc: incBC, totInc, txInc,
        fedT, stT, totT, effR, margR, irmaa, magi,
        pTStart: Math.round(pTStart), roStart: Math.round(roStart),
        pT: Math.round(pT), ro: Math.round(ro), nw: Math.round(pT + ro),
        label,
        bracketUsed: conv > 0
          ? txInc <= b12t ? "12%" : txInc <= b22t ? "22%" : txInc <= b24t ? "24%" : txInc <= b32t ? "32%" : txInc <= b35t ? "35%" : "37%"
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
  // from_conv: taxes sourced from within the conversion amount → deduct from net
  // outside_cash / from_taxable: taxes paid separately → full conversion reaches Roth
  const isTaxFromConv = (params.taxFunding || "from_taxable") === "from_conv";
  return ex.convRows.map((r) => ({
    yr: r.yr,
    age: r.age,
    label: r.label,
    otherInc: r.abn,
    conv: r.conv,
    fedTax: r.fedT,
    stateTax: r.stT,
    effFed: r.conv > 0 ? ((r.fedT / r.conv) * 100).toFixed(1) : "0.0",
    effTotal: r.conv > 0 ? (((r.fedT + r.stT) / r.conv) * 100).toFixed(1) : "0.0",
    netRoth: isTaxFromConv
      ? Math.round(Math.max(0, r.conv - r.fedT - (params.twoHousehold ? 0 : r.stT)))
      : r.conv,
  }));
}

export {
  buildRothExplorer, buildRothLadder,
  progTax, idxB, irmaaCost, taxableSocialSecurity, computeHouseholdSS, survivorHouseholdSS, getStateBrackets, getRmdStartAge,
  FED_BRACKETS_2026_MFJ, FED_BRACKETS_2026_SINGLE,
  LTCG_BRACKETS_2026_MFJ, LTCG_BRACKETS_2026_SINGLE,
  NIIT_THRESHOLD_MFJ, NIIT_THRESHOLD_SINGLE, NIIT_RATE,
  getSeniorBonusDeduction,
  OBBBA_SENIOR_PER_PERSON, OBBBA_SENIOR_PHASEOUT_START_MFJ,
  OBBBA_SENIOR_PHASEOUT_START_SINGLE, OBBBA_SENIOR_PHASEOUT_RATE,
  OBBBA_SENIOR_FIRST_YEAR, OBBBA_SENIOR_LAST_YEAR,
  STATE_BRACKETS, RMD_DIV, JOINT_RMD_DIV,
};
