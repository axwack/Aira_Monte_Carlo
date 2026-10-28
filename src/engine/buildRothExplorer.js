/**
 * buildRothExplorer.js — shared tax reference module
 *
 * The filename is historical. `buildRothExplorer()` and `buildRothLadder()` used
 * to live here and got deleted: a second, disconnected ~350-line conversion
 * model that no UI path ever called. App.jsx only ever imported constants from
 * this file, and the live Roth Conversion tab runs on buildWithdrawalWaterfall
 * via rothConversionPlan.js. The dead pair had ~100 tests in roth.test.js
 * (deleted with them) and were actively misleading — someone would check here
 * to answer "is this rule implemented?" and get the wrong answer, because the
 * engine the app actually runs had already implemented it.
 *
 * What's left: federal / state / LTCG / NIIT / IRMAA / OBBBA constants, the RMD
 * divisor tables, and the shared Social Security helpers (taxableSocialSecurity,
 * computeHouseholdSS, survivorHouseholdSS). Imported by App.jsx,
 * buildWithdrawalWaterfall.js, rothConversionPlan.js, and rulesEngine.js.
 *
 * New engine logic goes somewhere else — this file is a reference table, not a model.
 */
import { spouseAgeOffset, personsAtLeastAge, survivorIsPrimary, firstDeathOnPrimaryClock } from "./ages.js";
import { survivorFra, survivorBasis, resolveSurvivorClaimAge, survivorYearBenefit } from "./survivorBenefit.js";
import { STATE_BRACKETS } from "../data/stateBrackets.js";
import { IRMAA_2026 } from "../data/irmaa2026.js";


function getStateBrackets(state, isMFJ) {
  const entry = STATE_BRACKETS[state];
  if (!entry) return null;
  return isMFJ ? entry.mfj : entry.single;
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

// 2026 LTCG/qualified-dividend taxable-income breakpoints (IRS Rev. Proc. 2025-32),
// inflation-indexed forward in calcYearTax / buildWithdrawalWaterfall via idxB(),
// exactly like the ordinary federal brackets above. Single source of truth for
// both engines — do not re-declare these literals elsewhere.
const LTCG_BRACKETS_2026_MFJ = [
  { lo: 0,       hi: 98_900,  rate: 0.00 },
  { lo: 98_900,  hi: 613_700, rate: 0.15 },
  { lo: 613_700, hi: Infinity, rate: 0.20 },
];
const LTCG_BRACKETS_2026_SINGLE = [
  { lo: 0,       hi: 49_350,  rate: 0.00 },
  { lo: 49_350,  hi: 566_700, rate: 0.15 },
  { lo: 566_700, hi: Infinity, rate: 0.20 },
];

// Net Investment Income Tax (IRC §1411) — 3.8% surtax on the lesser of net
// investment income (LTCG here) or the excess of MAGI over the threshold.
// Thresholds are statutory and Congress has never indexed them for inflation
// (unlike the ordinary brackets/IRMAA/standard deduction above) — don't apply
// idxB()/inflFactor to these two numbers.
const NIIT_THRESHOLD_MFJ = 250_000;
const NIIT_THRESHOLD_SINGLE = 200_000;
const NIIT_RATE = 0.038;

// OBBBA senior bonus deduction. See TAX_REFERENCE.md → "OBBBA Senior Bonus
// Deduction" for the source. It's a third, independent below-the-line
// deduction (2025–2028 only), on top of the standard deduction and its age-65
// add-on. It's not folded into getStandardDeduction() on purpose: OBBBA
// applies to itemizers too, not just standard-deduction filers, and merging
// it in would make modeling itemizers later impossible.
//
// Like NIIT's thresholds, these are statutory and flat — the law doesn't
// index the $6,000 or the phase-out thresholds for 2025–2028, so
// getSeniorBonusDeduction() takes no inflFactor parameter. That's on purpose,
// don't add one.
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
 * This only reduces taxable income — never subtract it from AGI / MAGI /
 * totalIncome / totInc. IRMAA is computed on MAGI with no deduction taken
 * out, so netting this against MAGI would quietly move people under IRMAA
 * tiers they actually breach.
 *
 * `magi` is the year's own MAGI (ordinary income + realized gains), and both
 * engines compute it independently of any deduction, so there's no circular
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
  // Counted per person, not per household. This used to be `mfj ? 2 : 1`
  // gated on the primary's age alone, which gave a couple $12,000 the year
  // the older one turned 65 while the younger was still 55, and gave them $0
  // in the reverse case, where the older spouse qualifies but the primary
  // doesn't. personsAtLeastAge is shared with getStandardDeduction so the two
  // deductions can't disagree about household composition.
  const persons = personsAtLeastAge(age, spouseAge, mfj, OBBBA_SENIOR_MIN_AGE);
  if (persons === 0) return 0;
  const threshold = mfj ? OBBBA_SENIOR_PHASEOUT_START_MFJ : OBBBA_SENIOR_PHASEOUT_START_SINGLE;
  const excess = Math.max(0, (magi || 0) - threshold);
  // The phase-out hits each person's own $6,000 at 6% of the household's
  // excess MAGI, so one person is fully phased out at threshold + $100,000 —
  // $175K single / $250K MFJ. Scaling the reduction by `persons` reproduces that.
  const gross = OBBBA_SENIOR_PER_PERSON * persons;
  const reduction = OBBBA_SENIOR_PHASEOUT_RATE * excess * persons;
  return Math.round(Math.max(0, gross - reduction));
}

// IRS Pub 590-B Table III (Uniform Lifetime) divisors, 2022+ table.
// Default table for owners whose sole-beneficiary spouse is not >10 years younger.
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
 * `beneficiaries` = how many people in the household are actually on Medicare
 * (65+) this year. Thresholds are per tax return so they follow filing
 * status; the surcharge is per beneficiary, so an age-gapped couple pays one
 * surcharge against the MFJ threshold until the younger reaches 65.
 *
 * App.jsx keeps its own copy until request #19.
 */
function irmaaCost(magi, yr, infR = 0.025, isMFJ = true, beneficiaries = null) {
  // A blank inflation field arrives as NaN; use the 2.5% default rather than propagate it.
  const rate = isNaN(infR) ? 0.025 : infR;
  // Anchored to ROTH_BASE_YEAR (today), not a hardcoded 2026, so this stays
  // consistent with the rest of the file as real time passes.
  const f = Math.pow(1 + rate, yr - ROTH_BASE_YEAR);
  // IRMAA_2026[i].f is the two-person MFJ surcharge; half of it is one person's.
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
 * Thresholds are statutory and not inflation-indexed (unchanged since 1984/1994).
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
 * included. Growth has to happen inside this helper rather than in each
 * caller: with two people able to claim at different ages, there's no single
 * "age - claimAge" exponent a caller could apply to an already-combined
 * number, so each component grows from its own start age and the pieces get
 * summed after.
 *
 * `p.spouse.enabled === false` (the default) returns exactly the primary's own
 * grown benefit — byte-for-byte identical to every call site's old
 * single-person behavior, so existing profiles are unaffected.
 *
 * Spousal top-up: 50% of the higher earner's PIA (FRA amount) minus the lower
 * earner's own PIA, floored at 0. Payable only once both have filed (deemed
 * filing means filing for your own benefit and any spousal top-up happen
 * together), growing with COLA from that point. Delayed retirement credits
 * never flow into it — it's capped at the FRA amount regardless of either
 * person's actual claim age. `ssPia` falls back to `ssb` when not entered
 * (claiming at exactly FRA, where the two amounts are equal).
 */
/**
 * Household Social Security after the first death, with the survivor's own
 * benefit and the survivor benefit treated as the independent benefits they
 * legally are.
 *
 * Exported (via the barrel at the bottom of this file) because the UI needs
 * the `own` / `survivor` / `source` breakdown, not just the total — a number
 * that jumps because the household switched from one benefit to the other
 * needs to be able to say so. Returning only the total is how "the
 * components don't add up" bug reports happen.
 *
 * Everything here runs on the survivor's own clock. `spouse.deathAge` is the
 * decedent's own age, and `spouse.firstToDie` says whose age that is; the
 * engines walk the primary's age, so the two get translated exactly once, at
 * the top. An earlier version mixed the clocks — it floored a survivor claim
 * age at 60 against the primary's age, which silently shifted the survivor's
 * claim by the age gap.
 */
function survivorHouseholdSS(p, age, ctx) {
  const { offset, cola, ssAge, deathAge } = ctx;
  const sp = p.spouse || {};

  // Which of the two survives decides whose benefit is "own" and whose is inherited,
  // and whose birthday every milestone after the death belongs to.
  const primarySurvives = survivorIsPrimary(p);

  // Translate onto the survivor's own clock, once.
  const survivorAge      = primarySurvives ? age : age - offset;
  const ownClaimAge      = primarySurvives ? ssAge : (Number(sp.ssAge) || 67);
  const ownBenefit       = primarySurvives ? (Number(p.ssb) || 0) : (Number(sp.ssb) || 0);
  const decCheck         = primarySurvives ? (Number(sp.ssb) || 0) : (Number(p.ssb) || 0);
  const decPia           = primarySurvives ? (Number(sp.ssPia) || 0) : (Number(p.ssPia) || 0);
  const decOwnClaimAge   = primarySurvives ? (Number(sp.ssAge) || 67) : ssAge;
  // The survivor's own age in the year of the death.
  const survivorAgeAtDeath = primarySurvives ? deathAge + offset : deathAge - offset;

  // Did the deceased ever start their benefit? Both sides of this comparison
  // are the decedent's own ages, so no translation is needed — and this is
  // the question the old code got wrong: it paid $0 until the deceased's
  // claim age, when the survivor benefit actually derives from their PIA and
  // is claimable from 60 whether or not they ever filed.
  const deceasedHadClaimed = deathAge >= decOwnClaimAge;

  // Basis = 100% of what the deceased was receiving or was entitled to.
  const basisToday = survivorBasis({
    deceasedCheck: decCheck,
    deceasedPia:   decPia,
    deceasedHadClaimed,
  });

  // Survivor claim age, on the survivor's clock: never before 60, never before the
  // death, and honouring a later chosen age (the delay strategy).
  const survivorClaimAge = resolveSurvivorClaimAge(sp.survivorClaimAge, survivorAgeAtDeath);

  // Grow the basis by COLA from where it was quoted to the survivor's claim,
  // so the reduction applies to a same-year amount. Both ages below are the
  // decedent's, converted to elapsed years, which is clock-independent.
  const refAgeOnSurvivorClock = deceasedHadClaimed
    ? (primarySurvives ? decOwnClaimAge + offset : decOwnClaimAge - offset)
    : survivorAgeAtDeath;
  const growYears  = Math.max(0, survivorClaimAge - refAgeOnSurvivorClock);
  const basisAtClaim = basisToday * Math.pow(cola, growYears);

  // An explicit SSA-quoted survivor amount is used as quoted: SSA's figure
  // already bakes in the early-claim reduction, so applying ours on top
  // would double-count it. That's the "ask, don't derive" path.
  const quoted = Number(sp.survivorBenefitAtClaim) || 0;
  const useQuoted = quoted > 0;

  // The survivor's birth year — whichever of the two is still alive. Using
  // the primary's unconditionally would price the benefit off a dead
  // person's FRA.
  const survivorBirthYear = (() => {
    const who = primarySurvives ? p : sp;
    if (typeof who.dob === "string" && who.dob.length >= 4) {
      const y = parseInt(who.dob.slice(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    if (typeof who.birthYear === "number") return who.birthYear;
    if (typeof who.currentAge === "number") return ROTH_BASE_YEAR - who.currentAge;
    return null;
  })();
  const survivorFraAge = survivorFra(survivorBirthYear);

  const res = survivorYearBenefit({
    survivorAge,
    ownClaimAge,
    ownBenefitAtClaim: ownBenefit,
    survivorClaimAge,
    survivorBasisAtFra: useQuoted ? quoted : basisAtClaim,
    // Neutralise our reduction when the amount was quoted (factor === 1).
    survivorFraAge: useQuoted ? survivorClaimAge : survivorFraAge,
    cola: cola - 1,
  });
  return {
    ...res, survivorClaimAge, survivorFraAge, deceasedHadClaimed, basisAtClaim,
    survivorIsPrimary: primarySurvives,
  };
}

function computeHouseholdSS(p, age) {
  const cola = 1 + (p.ssCola ?? 2.4) / 100;
  const ssAge = p.ssAge || 67;
  const own = age >= ssAge ? (p.ssb || 0) * Math.pow(cola, age - ssAge) : 0;
  if (!p.spouse?.enabled) return Math.round(own);

  // `age` is the primary's age — it's the only clock the engines walk. Every
  // spouse milestone has to be expressed on that clock, shifted by the age
  // gap. Without this, `age >= spouse.ssAge` was asking "has the primary
  // reached the spouse's claim age", which starts a younger spouse's benefit
  // early by exactly the gap: a spouse 10 years younger claiming at 67 got
  // paid starting at the primary's 67 (spouse actually 57) — ten years of
  // benefits, plus the spousal top-up, the household never actually gets. It
  // inflated the success rate for every couple with an age gap.
  //
  // offset > 0 means the spouse is younger, so their milestones land later on
  // the primary's clock. Unknown spouse age means offset 0, identical to the
  // old behavior (regression lock in spousalSS.test.js).
  const offset = spouseAgeOffset(p);
  const spouseSsAge = p.spouse.ssAge || 67;
  const spouseClaimOnPrimaryClock = spouseSsAge + offset;

  /* Survivor benefit. On the first death the household keeps the larger of
   * the two checks and loses the smaller, plus the spousal top-up, which a
   * survivor benefit replaces. This is what retired the hardcoded `x 0.67`
   * haircut in the stress scenario: 0.67 is only right for a one-earner
   * couple (lose the 0.5 spousal, keep the 1.0) — two similar earners keep
   * about 50%. With both benefits on file it's exact arithmetic and no
   * literal is needed.
   *
   * The survivor benefit is 100% of the deceased's check including any
   * delayed retirement credits, which is why this compares the grown checks
   * rather than the PIAs (delaying the higher earner raises the survivor
   * benefit — the one place DRCs do flow through, unlike the spousal top-up
   * above).
   *
   * Modeled from the death year itself, at this engine's one-year
   * granularity. Benefits stop the month of death, so a partial year is
   * unavoidable either way; stepping down in the death year understates
   * income slightly rather than overstating it, which is the right direction
   * for a plan's safety margin. (Filing status is separate and correctly
   * stays MFJ for that year — see mfjAt in buildWithdrawalWaterfall.js.)
   */
  const deathAge = Number(p.spouse.deathAge) > 0 ? Number(p.spouse.deathAge) : null;
  // The death year on the primary's clock. `deathAge + offset` was only
  // correct when the spouse was the one who dies; when the primary dies,
  // `deathAge` is already their own age and needs no shift. Getting this gate
  // wrong meant the survivor branch never ran at all for a "primary dies
  // first" plan — it silently kept paying both benefits for `offset` more
  // years.
  if (deathAge != null && age >= firstDeathOnPrimaryClock(p)) {
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
  // A spousal benefit requires both that the claimant has filed and that the
  // higher earner has filed, so it starts at the later of the two — on one
  // clock.
  const bothFiledAge = Math.max(ssAge, spouseClaimOnPrimaryClock);

  let topUp = 0;
  if (age >= bothFiledAge) {
    const raw = primaryIsHigher
      ? Math.max(0, 0.5 * primaryPia - spousePia)  // tops up the spouse's check
      : Math.max(0, 0.5 * spousePia - primaryPia); // tops up the primary's check
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

export {
  progTax, idxB, irmaaCost, taxableSocialSecurity, computeHouseholdSS, survivorHouseholdSS, getStateBrackets, getRmdStartAge,
  FED_BRACKETS_2026_MFJ, FED_BRACKETS_2026_SINGLE,
  LTCG_BRACKETS_2026_MFJ, LTCG_BRACKETS_2026_SINGLE,
  NIIT_THRESHOLD_MFJ, NIIT_THRESHOLD_SINGLE, NIIT_RATE,
  getSeniorBonusDeduction,
  OBBBA_SENIOR_PER_PERSON, OBBBA_SENIOR_PHASEOUT_START_MFJ,
  OBBBA_SENIOR_PHASEOUT_START_SINGLE, OBBBA_SENIOR_PHASEOUT_RATE,
  OBBBA_SENIOR_FIRST_YEAR, OBBBA_SENIOR_LAST_YEAR,
  STATE_BRACKETS, RMD_DIV,
};
