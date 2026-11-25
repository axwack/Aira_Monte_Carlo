import { spouseAgeOffset, personsAtLeastAge, survivorIsPrimary, firstDeathOnPrimaryClock } from "./ages.js";
import { survivorFra, survivorBasis, resolveSurvivorClaimAge, survivorYearBenefit } from "./survivorBenefit.js";
import { STATE_BRACKETS } from "../data/stateBrackets.js";
import { irmaaTableFor } from "../data/irmaa2027.js";


function getStateBrackets(state, isMFJ) {
  const entry = STATE_BRACKETS[state];
  if (!entry) return null;
  return isMFJ ? entry.mfj : entry.single;
}

const FED_BRACKETS_2026_MFJ = [
  { lo: 0,       hi: 24800,  rate: 0.10 },
  { lo: 24800,   hi: 100800, rate: 0.12 },
  { lo: 100800,  hi: 211400, rate: 0.22 },
  { lo: 211400,  hi: 403550, rate: 0.24 },
  { lo: 403550,  hi: 512450, rate: 0.32 },
  { lo: 512450,  hi: 768700, rate: 0.35 },
  { lo: 768700,  hi: Infinity, rate: 0.37 },
];

const FED_BRACKETS_2026_SINGLE = [
  { lo: 0,      hi: 12400,  rate: 0.10 },
  { lo: 12400,  hi: 50400,  rate: 0.12 },
  { lo: 50400,  hi: 105700, rate: 0.22 },
  { lo: 105700, hi: 201775, rate: 0.24 },
  { lo: 201775, hi: 256225, rate: 0.32 },
  { lo: 256225, hi: 640600, rate: 0.35 },
  { lo: 640600, hi: Infinity, rate: 0.37 },
];

const LTCG_BRACKETS_2026_MFJ = [
  { lo: 0,       hi: 98_900,  rate: 0.00 },
  { lo: 98_900,  hi: 613_700, rate: 0.15 },
  { lo: 613_700, hi: Infinity, rate: 0.20 },
];
const LTCG_BRACKETS_2026_SINGLE = [
  { lo: 0,       hi: 49_450,  rate: 0.00 },
  { lo: 49_450,  hi: 545_500, rate: 0.15 },
  { lo: 545_500, hi: Infinity, rate: 0.20 },
];

const NIIT_THRESHOLD_MFJ = 250_000;
const NIIT_THRESHOLD_SINGLE = 200_000;
const NIIT_RATE = 0.038;

const OBBBA_SENIOR_PER_PERSON = 6_000;
const OBBBA_SENIOR_PHASEOUT_START_MFJ = 150_000;
const OBBBA_SENIOR_PHASEOUT_START_SINGLE = 75_000;
const OBBBA_SENIOR_PHASEOUT_RATE = 0.06;
const OBBBA_SENIOR_MIN_AGE = 65;
const OBBBA_SENIOR_FIRST_YEAR = 2025;
const OBBBA_SENIOR_LAST_YEAR = 2028;

function getSeniorBonusDeduction(age, filingStatus, magi, yr, spouseAge = null) {
  if (yr < OBBBA_SENIOR_FIRST_YEAR || yr > OBBBA_SENIOR_LAST_YEAR) return 0;
  const mfj = filingStatus !== "single";
  const persons = personsAtLeastAge(age, spouseAge, mfj, OBBBA_SENIOR_MIN_AGE);
  if (persons === 0) return 0;
  const threshold = mfj ? OBBBA_SENIOR_PHASEOUT_START_MFJ : OBBBA_SENIOR_PHASEOUT_START_SINGLE;
  const excess = Math.max(0, (magi || 0) - threshold);
  const gross = OBBBA_SENIOR_PER_PERSON * persons;
  const reduction = OBBBA_SENIOR_PHASEOUT_RATE * excess * persons;
  return Math.round(Math.max(0, gross - reduction));
}

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

function irmaaCost(magi, yr, infR = 0.025, isMFJ = true, beneficiaries = null) {
  const rate = isNaN(infR) ? 0.025 : infR;
  const { rows: T, baseYear } = irmaaTableFor(yr);
  const f = Math.pow(1 + rate, yr - baseYear);
  const n = beneficiaries != null ? Math.max(0, beneficiaries) : (isMFJ ? 2 : 1);
  if (n === 0) return 0;
  for (let i = T.length - 1; i >= 0; i--) {
    const thresh = isMFJ ? T[i].m
      : (i === T.length - 1 ? 500_000 : T[i].m / 2);
    const cost = (T[i].f / 2) * n;
    if (magi >= thresh * f) return Math.round(cost * f);
  }
  return 0;
}

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

function survivorHouseholdSS(p, age, ctx) {
  const { offset, cola, ssAge, deathAge } = ctx;
  const sp = p.spouse || {};

  const primarySurvives = survivorIsPrimary(p);

  const survivorAge      = primarySurvives ? age : age - offset;
  const ownClaimAge      = primarySurvives ? ssAge : (Number(sp.ssAge) || 67);
  const ownBenefit       = primarySurvives ? (Number(p.ssb) || 0) : (Number(sp.ssb) || 0);
  const decCheck         = primarySurvives ? (Number(sp.ssb) || 0) : (Number(p.ssb) || 0);
  const decPia           = primarySurvives ? (Number(sp.ssPia) || 0) : (Number(p.ssPia) || 0);
  const decOwnClaimAge   = primarySurvives ? (Number(sp.ssAge) || 67) : ssAge;
  const survivorAgeAtDeath = primarySurvives ? deathAge + offset : deathAge - offset;

  const deceasedHadClaimed = deathAge >= decOwnClaimAge;

  const basisToday = survivorBasis({
    deceasedCheck: decCheck,
    deceasedPia:   decPia,
    deceasedHadClaimed,
  });

  const survivorClaimAge = resolveSurvivorClaimAge(sp.survivorClaimAge, survivorAgeAtDeath);

  const refAgeOnSurvivorClock = deceasedHadClaimed
    ? (primarySurvives ? decOwnClaimAge + offset : decOwnClaimAge - offset)
    : survivorAgeAtDeath;
  const growYears  = Math.max(0, survivorClaimAge - refAgeOnSurvivorClock);
  const basisAtClaim = basisToday * Math.pow(cola, growYears);

  const quoted = Number(sp.survivorBenefitAtClaim) || 0;
  const useQuoted = quoted > 0;

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

  const offset = spouseAgeOffset(p);
  const spouseSsAge = p.spouse.ssAge || 67;
  const spouseClaimOnPrimaryClock = spouseSsAge + offset;

  const deathAge = Number(p.spouse.deathAge) > 0 ? Number(p.spouse.deathAge) : null;
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
  const bothFiledAge = Math.max(ssAge, spouseClaimOnPrimaryClock);

  let topUp = 0;
  if (age >= bothFiledAge) {
    const raw = primaryIsHigher
      ? Math.max(0, 0.5 * primaryPia - spousePia)
      : Math.max(0, 0.5 * spousePia - primaryPia);
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
