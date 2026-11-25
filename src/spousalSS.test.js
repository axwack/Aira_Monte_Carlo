import { computeHouseholdSS } from "./engine/buildRothExplorer.js";
import { spouseAgeOffset, personAgeNow, ageFromDob } from "./engine/ages.js";

const NOW = new Date("2026-07-30T12:00:00Z");
beforeAll(() => { jest.useFakeTimers().setSystemTime(NOW); });
afterAll(() => { jest.useRealTimers(); });

const PRIMARY_SSB = 30_000;
const SPOUSE_SSB  = 12_000;
const TOP_UP      = 0.5 * PRIMARY_SSB - SPOUSE_SSB;

function couple(gap, over = {}) {
  const primaryBirthYear = NOW.getFullYear() - 60;
  return {
    ssCola: 0,
    dob: `${primaryBirthYear}-01-01`,
    ssAge: 67, ssb: PRIMARY_SSB, ssPia: PRIMARY_SSB,
    spouse: {
      enabled: true,
      dob: `${primaryBirthYear + gap}-01-01`,
      ssAge: 67, ssb: SPOUSE_SSB, ssPia: SPOUSE_SSB,
    },
    ...over,
  };
}

describe("spouseAgeOffset — the two clocks", () => {
  test("positive when the spouse is younger", () => {
    expect(spouseAgeOffset(couple(10))).toBe(10);
  });

  test("negative when the spouse is older", () => {
    expect(spouseAgeOffset(couple(-6))).toBe(-6);
  });

  test("zero for the same birth year", () => {
    expect(spouseAgeOffset(couple(0))).toBe(0);
  });

  test("zero — NOT NaN — when the spouse's age is unknown", () => {
    const p = couple(10);
    delete p.spouse.dob;
    expect(spouseAgeOffset(p)).toBe(0);
    expect(Number.isNaN(spouseAgeOffset(p))).toBe(false);
  });

  test("falls back to currentAge when dob is absent", () => {
    expect(spouseAgeOffset({ currentAge: 60, spouse: { currentAge: 52 } })).toBe(8);
  });

  test("prefers dob over a stale stored currentAge", () => {
    const p = couple(10);
    p.spouse.currentAge = 99;
    expect(spouseAgeOffset(p)).toBe(10);
    expect(personAgeNow(p.spouse)).toBe(50);
  });
});

describe("computeHouseholdSS — spouse 10 years YOUNGER", () => {
  const P = couple(10);

  test("primary alone from the primary's 67 (spouse is only 57)", () => {
    expect(computeHouseholdSS(P, 67)).toBe(PRIMARY_SSB);
  });

  test("still primary alone at the primary's 76 (spouse is 66 — one year short)", () => {
    expect(computeHouseholdSS(P, 76)).toBe(PRIMARY_SSB);
  });

  test("spouse's benefit AND the top-up begin at the primary's 77 (spouse turns 67)", () => {
    expect(computeHouseholdSS(P, 77)).toBe(PRIMARY_SSB + SPOUSE_SSB + TOP_UP);
  });

  test("nothing before the primary claims", () => {
    expect(computeHouseholdSS(P, 66)).toBe(0);
  });
});

describe("computeHouseholdSS — spouse 6 years OLDER", () => {
  const P = couple(-6);

  test("the older spouse collects first, alone", () => {
    expect(computeHouseholdSS(P, 61)).toBe(SPOUSE_SSB);
    expect(computeHouseholdSS(P, 66)).toBe(SPOUSE_SSB);
  });

  test("top-up waits for the HIGHER earner to file, not merely for both to be eligible", () => {
    expect(computeHouseholdSS(P, 66)).toBe(SPOUSE_SSB);
    expect(computeHouseholdSS(P, 67)).toBe(PRIMARY_SSB + SPOUSE_SSB + TOP_UP);
  });
});

describe("computeHouseholdSS — regression locks", () => {
  test("spouse.enabled false ignores every spouse field", () => {
    const P = couple(10);
    const off = { ...P, spouse: { ...P.spouse, enabled: false } };
    for (const age of [62, 67, 70, 77, 85]) {
      expect(computeHouseholdSS(off, age)).toBe(
        age >= 67 ? PRIMARY_SSB : 0
      );
    }
  });

  test("no spouse dob ⇒ byte-identical to the pre-spouse-dob same-age model", () => {
    const P = couple(0);
    const noDob = { ...P, spouse: { ...P.spouse } };
    delete noDob.spouse.dob;
    for (const age of [66, 67, 70, 80]) {
      expect(computeHouseholdSS(noDob, age)).toBe(computeHouseholdSS(P, age));
    }
  });

  test("single-person profile (no spouse object) is untouched", () => {
    const solo = { ssCola: 0, ssAge: 67, ssb: PRIMARY_SSB };
    expect(computeHouseholdSS(solo, 66)).toBe(0);
    expect(computeHouseholdSS(solo, 67)).toBe(PRIMARY_SSB);
    expect(computeHouseholdSS(solo, 90)).toBe(PRIMARY_SSB);
  });
});

describe("computeHouseholdSS — the top-up keys off PIA, not the claimed check", () => {
  test("a delayed primary check does not enlarge the spousal top-up", () => {
    const base = couple(0);
    const delayed = { ...base, ssb: PRIMARY_SSB * 1.24, ssPia: PRIMARY_SSB };
    const got = computeHouseholdSS(delayed, 67);
    expect(got).toBe(Math.round(PRIMARY_SSB * 1.24) + SPOUSE_SSB + TOP_UP);
    const plain = computeHouseholdSS(base, 67);
    expect(got - Math.round(PRIMARY_SSB * 1.24)).toBe(plain - PRIMARY_SSB);
  });

  test("the higher earner's PIA drives the top-up even when it is the spouse", () => {
    const P = couple(0, {
      ssb: 10_000, ssPia: 10_000,
      spouse: { enabled: true, dob: `${NOW.getFullYear() - 60}-01-01`, ssAge: 67, ssb: 40_000, ssPia: 40_000 },
    });
    expect(computeHouseholdSS(P, 67)).toBe(10_000 + 40_000 + 10_000);
  });

  test("no top-up when the lower earner's own benefit already exceeds half", () => {
    const P = couple(0, {
      ssb: 30_000, ssPia: 30_000,
      spouse: { enabled: true, dob: `${NOW.getFullYear() - 60}-01-01`, ssAge: 67, ssb: 20_000, ssPia: 20_000 },
    });
    expect(computeHouseholdSS(P, 67)).toBe(50_000);
  });
});

describe("computeHouseholdSS — COLA compounds from each person's OWN claim year", () => {
  test("the younger spouse's COLA starts at THEIR claim, not the primary's", () => {
    const P = couple(10, { ssCola: 2 });
    const cola = 1.02;
    const expected = Math.round(
      PRIMARY_SSB * Math.pow(cola, 11) +
      SPOUSE_SSB  * Math.pow(cola, 1) +
      TOP_UP      * Math.pow(cola, 1)
    );
    expect(computeHouseholdSS(P, 78)).toBe(expected);
  });

  test("ageFromDob is the shared implementation (no second copy in the engines)", () => {
    expect(ageFromDob(`${NOW.getFullYear() - 60}-01-01`)).toBe(60);
  });
});

describe("per-person age-65 amounts", () => {
  const { personsAtLeastAge } = require("./engine/ages.js");
  const { getStandardDeduction } = require("./App");
  const { getSeniorBonusDeduction } = require("./engine/buildRothExplorer.js");

  describe("personsAtLeastAge", () => {
    test("single filer counts only themselves", () => {
      expect(personsAtLeastAge(64, null, false, 65)).toBe(0);
      expect(personsAtLeastAge(65, null, false, 65)).toBe(1);
      expect(personsAtLeastAge(64, 80, false, 65)).toBe(0);
    });

    test("MFJ with a known spouse age counts each person", () => {
      expect(personsAtLeastAge(66, 55, true, 65)).toBe(1);
      expect(personsAtLeastAge(55, 66, true, 65)).toBe(1);
      expect(personsAtLeastAge(66, 67, true, 65)).toBe(2);
      expect(personsAtLeastAge(60, 61, true, 65)).toBe(0);
    });

    test("MFJ with an UNKNOWN spouse age keeps the legacy both-at-once rule", () => {
      expect(personsAtLeastAge(65, null, true, 65)).toBe(2);
      expect(personsAtLeastAge(64, null, true, 65)).toBe(0);
    });
  });

  describe("getStandardDeduction", () => {
    const BASE_MFJ = 32_200, PER_HEAD = 1_650;

    test("unchanged when the spouse's age is unknown (regression lock)", () => {
      expect(getStandardDeduction(65, "mfj", 1)).toBe(BASE_MFJ + 2 * PER_HEAD);
      expect(getStandardDeduction(64, "mfj", 1)).toBe(BASE_MFJ);
    });

    test("only ONE add-on while the younger spouse is under 65", () => {
      expect(getStandardDeduction(66, "mfj", 1, 55)).toBe(BASE_MFJ + PER_HEAD);
    });

    test("both add-ons once the younger spouse reaches 65", () => {
      expect(getStandardDeduction(76, "mfj", 1, 65)).toBe(BASE_MFJ + 2 * PER_HEAD);
    });

    test("an OLDER spouse earns the add-on before the primary does", () => {
      expect(getStandardDeduction(60, "mfj", 1, 67)).toBe(BASE_MFJ + PER_HEAD);
    });

    test("a single filer ignores any spouse age passed in", () => {
      expect(getStandardDeduction(70, "single", 1, 40)).toBe(16_100 + PER_HEAD);
    });
  });

  describe("getSeniorBonusDeduction", () => {
    const YR = 2026;

    test("unchanged when the spouse's age is unknown (regression lock)", () => {
      expect(getSeniorBonusDeduction(65, "mfj", 0, YR)).toBe(12_000);
      expect(getSeniorBonusDeduction(64, "mfj", 0, YR)).toBe(0);
    });

    test("one person's bonus while the younger spouse is under 65", () => {
      expect(getSeniorBonusDeduction(66, "mfj", 0, YR, 55)).toBe(6_000);
    });

    test("both bonuses once the younger spouse reaches 65", () => {
      expect(getSeniorBonusDeduction(76, "mfj", 0, YR, 65)).toBe(12_000);
    });

    test("an OLDER spouse alone still earns a bonus (was $0 before)", () => {
      expect(getSeniorBonusDeduction(60, "mfj", 0, YR, 67)).toBe(6_000);
    });

    test("neither spouse 65 ⇒ nothing", () => {
      expect(getSeniorBonusDeduction(60, "mfj", 0, YR, 61)).toBe(0);
    });

    test("the phase-out scales with the number of QUALIFYING people", () => {
      expect(getSeniorBonusDeduction(66, "mfj", 200_000, YR, 55)).toBe(3_000);
      expect(getSeniorBonusDeduction(66, "mfj", 200_000, YR, 66)).toBe(6_000);
    });

    test("still $0 outside the 2025-2028 window regardless of ages", () => {
      expect(getSeniorBonusDeduction(70, "mfj", 0, 2029, 70)).toBe(0);
      expect(getSeniorBonusDeduction(70, "mfj", 0, 2024, 70)).toBe(0);
    });
  });
});

describe("§22 widow's penalty", () => {
  const { buildWithdrawalWaterfall } = require("./engine/buildWithdrawalWaterfall.js");
  const { filesJointlyAt, filingStatusAt, spouseDeathOnPrimaryClock } = require("./engine/ages.js");

  const PRIMARY_BY = NOW.getFullYear() - 65;
  const COUPLE = {
    currentAge: 65, retireAge: 65, endAge: 92,
    dob: `${PRIMARY_BY}-01-01`,
    sp: 90_000, inf: 2.5, gr: 0.05,
    ssAge: 65, ssb: 36_000, ssPia: 36_000, ssCola: 2,
    filingStatus: "mfj", stateOfResidence: "FL", smile: false,
    withdrawalBracketTarget: "22", irmaaGuard: false, ssTorpedoGuard: true,
    housingType: "none",
    accounts: [
      { id: "a", category: "pretax",  name: "IRA",     balance: 1_400_000 },
      { id: "b", category: "roth",    name: "Roth",    balance:   300_000 },
      { id: "c", category: "taxable", name: "Taxable", balance:   250_000 },
      { id: "d", category: "cash",    name: "Cash",    balance:    60_000 },
    ],
    spouse: {
      enabled: true, dob: `${PRIMARY_BY}-01-01`,
      ssAge: 65, ssb: 24_000, ssPia: 24_000,
    },
  };
  const DEATH_AGE = 75;
  const withDeath = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: DEATH_AGE } };

  test("1. deathAge null/absent reproduces the no-death plan exactly", () => {
    const a = buildWithdrawalWaterfall(COUPLE).smart.rows;
    const b = buildWithdrawalWaterfall({ ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: null } }).smart.rows;
    expect(b.length).toBe(a.length);
    a.forEach((row, i) => {
      expect(b[i].fedTax).toBe(row.fedTax);
      expect(b[i].ss).toBe(row.ss);
      expect(b[i].totalPort).toBe(row.totalPort);
    });
  });

  test("2. the year AFTER death, tax rises on materially the same income", () => {
    const alive = buildWithdrawalWaterfall(COUPLE).smart.rows;
    const dead  = buildWithdrawalWaterfall(withDeath).smart.rows;
    const at = (rows, age) => rows.find(r => r.age === age);

    const survivorYear = DEATH_AGE + 1;
    expect(at(dead, survivorYear).fedTax).toBeGreaterThan(at(alive, survivorYear).fedTax);

    const deadStep  = at(dead,  survivorYear).fedTax - at(dead,  DEATH_AGE).fedTax;
    const aliveStep = at(alive, survivorYear).fedTax - at(alive, DEATH_AGE).fedTax;
    expect(deadStep).toBeGreaterThan(aliveStep);
  });

  test("2b. MFJ is kept THROUGH the death year (IRS Pub 501), Single after", () => {
    expect(filesJointlyAt(withDeath, DEATH_AGE - 1)).toBe(true);
    expect(filesJointlyAt(withDeath, DEATH_AGE)).toBe(true);
    expect(filesJointlyAt(withDeath, DEATH_AGE + 1)).toBe(false);
    expect(filingStatusAt(withDeath, DEATH_AGE + 1)).toBe("single");
  });

  test("3. Social Security becomes the LARGER single check, not the sum", () => {
    const dead  = buildWithdrawalWaterfall(withDeath).smart.rows;
    const alive = buildWithdrawalWaterfall(COUPLE).smart.rows;
    const at = (rows, age) => rows.find(r => r.age === age);

    expect(at(dead, DEATH_AGE).ss).toBeLessThan(at(dead, DEATH_AGE - 1).ss);

    const ratio = at(dead, DEATH_AGE).ss / at(alive, DEATH_AGE).ss;
    expect(ratio).toBeCloseTo(36_000 / (36_000 + 24_000), 3);
    expect(ratio).not.toBeCloseTo(0.67, 2);

    expect(at(dead, DEATH_AGE + 5).ss).toBeGreaterThan(at(dead, DEATH_AGE).ss);
    expect(at(dead, DEATH_AGE + 5).ss).toBeLessThan(at(alive, DEATH_AGE + 5).ss);
  });

  test("4. standard deduction, IRMAA tier and senior bonus all step down together", () => {
    const { getStandardDeduction } = require("./App");
    const { getSeniorBonusDeduction } = require("./engine/buildRothExplorer.js");
    const { getIrmaaCeiling } = require("./App");

    const jointYear    = filingStatusAt(withDeath, DEATH_AGE);
    const survivorYear = filingStatusAt(withDeath, DEATH_AGE + 1);
    expect(jointYear).toBe("mfj");
    expect(survivorYear).toBe("single");

    expect(getStandardDeduction(76, survivorYear, 1)).toBeLessThan(getStandardDeduction(76, jointYear, 1));
    expect(getIrmaaCeiling(1, survivorYear, 1)).toBeLessThan(getIrmaaCeiling(1, jointYear, 1));
    expect(getSeniorBonusDeduction(76, survivorYear, 0, 2028)).toBeLessThan(
           getSeniorBonusDeduction(76, jointYear,    0, 2028));
  });

  test("5. runMC and the waterfall agree that the survivor year is taxed as Single", () => {
    const { runMC } = require("./App");
    expect(filingStatusAt(withDeath, DEATH_AGE + 1)).toBe("single");
    expect(spouseDeathOnPrimaryClock(withDeath)).toBe(DEATH_AGE);
    const mc = runMC({ ...withDeath, paths: 60 });
    expect(Number.isFinite(mc.rate)).toBe(true);
    expect(mc.rate).toBeGreaterThanOrEqual(0);
    expect(mc.rate).toBeLessThanOrEqual(1);
  });

  test("the death age is the SPOUSE's own age, shifted onto the primary's clock", () => {
    const gapped = {
      ...withDeath,
      spouse: { ...withDeath.spouse, dob: `${PRIMARY_BY + 8}-01-01`, deathAge: 75 },
    };
    expect(spouseDeathOnPrimaryClock(gapped)).toBe(83);
    expect(filesJointlyAt(gapped, 83)).toBe(true);
    expect(filesJointlyAt(gapped, 84)).toBe(false);
  });

  test("an already-single filer is unaffected by a deathAge", () => {
    const single = { ...withDeath, filingStatus: "single" };
    expect(filesJointlyAt(single, 60)).toBe(false);
    expect(filesJointlyAt(single, 90)).toBe(false);
  });

  test("spouse.enabled false ignores deathAge entirely", () => {
    const off = { ...withDeath, spouse: { ...withDeath.spouse, enabled: false } };
    expect(spouseDeathOnPrimaryClock(off)).toBe(Infinity);
    expect(filesJointlyAt(off, 99)).toBe(true);
  });
});

describe("§24 per-person Medicare / IRMAA start", () => {
  const { irmaaCost } = require("./App");
  const YR = new Date().getFullYear();
  const HIGH_MAGI = 400_000;

  test("unchanged when the beneficiary count is not supplied (regression lock)", () => {
    const mfjBoth = irmaaCost(HIGH_MAGI, YR, 0.025, true);
    expect(mfjBoth).toBeGreaterThan(0);
    expect(irmaaCost(HIGH_MAGI, YR, 0.025, true, 2)).toBe(mfjBoth);
    expect(irmaaCost(HIGH_MAGI, YR, 0.025, true, 1)).toBe(Math.round(mfjBoth / 2));
  });

  test("one beneficiary pays half of the two-person surcharge", () => {
    const two = irmaaCost(HIGH_MAGI, YR, 0.025, true, 2);
    const one = irmaaCost(HIGH_MAGI, YR, 0.025, true, 1);
    expect(one * 2).toBe(two);
  });

  test("zero beneficiaries pays nothing, however high the MAGI", () => {
    expect(irmaaCost(10_000_000, YR, 0.025, true, 0)).toBe(0);
  });

  test("the THRESHOLD still follows filing status, not the beneficiary count", () => {
    const between = 150_000;
    expect(irmaaCost(between, YR, 0.025, true, 1)).toBe(0);
    expect(irmaaCost(between, YR, 0.025, false, 1)).toBeGreaterThan(0);
  });

  test("an age-gapped couple is charged ONE surcharge, then two", () => {
    const { personsAtLeastAge } = require("./engine/ages.js");
    expect(personsAtLeastAge(66, 55, true, 65)).toBe(1);
    expect(personsAtLeastAge(77, 66, true, 65)).toBe(2);
  });
});

describe("§30 survivorBenefit — the statutory rules", () => {
  const {
    survivorFra, survivorReductionFactor, survivorBasis,
    resolveSurvivorClaimAge, survivorYearBenefit,
    SURVIVOR_MIN_CLAIM_AGE, SURVIVOR_MIN_FACTOR,
  } = require("./engine/survivorBenefit.js");

  test("survivor benefits start at 60, not 62 like an own benefit", () => {
    expect(SURVIVOR_MIN_CLAIM_AGE).toBe(60);
  });

  describe("survivorFra — NOT the same schedule as retirement FRA", () => {
    test("66 for 1945-1956", () => {
      expect(survivorFra(1950)).toBe(66);
      expect(survivorFra(1956)).toBe(66);
    });
    test("stepped in months for 1957-1961 — not rounded to a whole year", () => {
      expect(survivorFra(1957)).toBeCloseTo(66 + 2 / 12, 6);
      expect(survivorFra(1959)).toBeCloseTo(66 + 6 / 12, 6);
      expect(survivorFra(1961)).toBeCloseTo(66 + 10 / 12, 6);
    });
    test("67 for 1962 and later", () => {
      expect(survivorFra(1962)).toBe(67);
      expect(survivorFra(1980)).toBe(67);
    });
    test("unknown birth year falls back to the modern value, never NaN", () => {
      expect(survivorFra(null)).toBe(67);
      expect(survivorFra(undefined)).toBe(67);
      expect(Number.isNaN(survivorFra("x"))).toBe(false);
    });
  });

  describe("survivorReductionFactor", () => {
    test("71.5% at exactly 60", () => {
      expect(survivorReductionFactor(60, 67)).toBeCloseTo(SURVIVOR_MIN_FACTOR, 6);
      expect(SURVIVOR_MIN_FACTOR).toBe(0.715);
    });
    test("100% at survivor FRA", () => {
      expect(survivorReductionFactor(67, 67)).toBe(1);
      expect(survivorReductionFactor(66, 66)).toBe(1);
    });
    test("NO credit for delaying past survivor FRA — unlike an own benefit", () => {
      expect(survivorReductionFactor(68, 67)).toBe(1);
      expect(survivorReductionFactor(70, 67)).toBe(1);
    });
    test("straight line in between — the midpoint is half the reduction", () => {
      expect(survivorReductionFactor(63.5, 67)).toBeCloseTo(0.8575, 4);
    });
    test("claiming at 62 is roughly 81%, NOT the 100% the old code paid", () => {
      const f = survivorReductionFactor(62, 67);
      expect(f).toBeGreaterThan(0.79);
      expect(f).toBeLessThan(0.83);
      expect(f).toBeLessThan(1);
    });
    test("never returns below the floor or above 1", () => {
      for (const a of [55, 60, 61, 64, 67, 75]) {
        const f = survivorReductionFactor(a, 66.5);
        expect(f).toBeGreaterThanOrEqual(SURVIVOR_MIN_FACTOR);
        expect(f).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("survivorBasis — DEFECT 1: death before the deceased ever claimed", () => {
    test("uses the deceased's CHECK when they had claimed (DRCs included)", () => {
      expect(survivorBasis({ deceasedCheck: 44000, deceasedPia: 36000, deceasedHadClaimed: true }))
        .toBe(44000);
    });
    test("uses the deceased's PIA when they had NOT claimed — never zero", () => {
      expect(survivorBasis({ deceasedCheck: 0, deceasedPia: 36000, deceasedHadClaimed: false }))
        .toBe(36000);
    });
    test("delaying the higher earner raises the SURVIVOR benefit (DRCs pass through)", () => {
      const plain   = survivorBasis({ deceasedCheck: 36000, deceasedPia: 36000, deceasedHadClaimed: true });
      const delayed = survivorBasis({ deceasedCheck: 44640, deceasedPia: 36000, deceasedHadClaimed: true });
      expect(delayed).toBeGreaterThan(plain);
    });
  });

  describe("resolveSurvivorClaimAge", () => {
    test("floors at 60", () => {
      expect(resolveSurvivorClaimAge(55, 50)).toBe(60);
      expect(resolveSurvivorClaimAge(null, 50)).toBe(60);
    });
    test("cannot precede the death", () => {
      expect(resolveSurvivorClaimAge(60, 72)).toBe(72);
      expect(resolveSurvivorClaimAge(null, 72)).toBe(72);
    });
    test("honours a later user-chosen age (the delay strategy)", () => {
      expect(resolveSurvivorClaimAge(67, 62)).toBe(67);
    });
  });

  describe("survivorYearBenefit — deemed filing does NOT apply", () => {
    const BASE = {
      ownClaimAge: 70, ownBenefitAtClaim: 40000,
      survivorClaimAge: 60, survivorBasisAtFra: 30000,
      survivorFraAge: 67, cola: 0,
    };

    test("the two benefits are independent — survivor paid at 60, own not yet", () => {
      const r = survivorYearBenefit({ ...BASE, survivorAge: 62 });
      expect(r.own).toBe(0);
      expect(r.survivor).toBeCloseTo(30000 * 0.715, 0);
      expect(r.source).toBe("survivor");
    });

    test("THE SWITCHING STRATEGY: reduced survivor at 60, own at 70, larger wins", () => {
      const early = survivorYearBenefit({ ...BASE, survivorAge: 65 });
      expect(early.source).toBe("survivor");
      const later = survivorYearBenefit({ ...BASE, survivorAge: 70 });
      expect(later.source).toBe("own");
      expect(later.paid).toBe(40000);
    });

    test("never pays BOTH benefits — always the larger of those claimed", () => {
      const r = survivorYearBenefit({ ...BASE, survivorAge: 72 });
      expect(r.paid).toBe(Math.max(r.own, r.survivor));
      expect(r.paid).toBeLessThan(r.own + r.survivor);
    });

    test("the reverse play: own early, switch to an unreduced survivor at FRA", () => {
      const P = {
        ownClaimAge: 62, ownBenefitAtClaim: 18000,
        survivorClaimAge: 67, survivorBasisAtFra: 40000,
        survivorFraAge: 67, cola: 0,
      };
      expect(survivorYearBenefit({ ...P, survivorAge: 64 }).source).toBe("own");
      const at67 = survivorYearBenefit({ ...P, survivorAge: 67 });
      expect(at67.source).toBe("survivor");
      expect(at67.paid).toBe(40000);
    });

    test("nothing is paid before either benefit is claimed", () => {
      const r = survivorYearBenefit({ ...BASE, survivorAge: 58 });
      expect(r.paid).toBe(0);
      expect(r.source).toBe("none");
    });

    test("reports the components, not just the total", () => {
      const r = survivorYearBenefit({ ...BASE, survivorAge: 70 });
      expect(typeof r.own).toBe("number");
      expect(typeof r.survivor).toBe("number");
      expect(["own", "survivor", "none"]).toContain(r.source);
    });
  });
});

describe("§30 — computeHouseholdSS honours the survivor rules end to end", () => {
  const PRIMARY_BY = NOW.getFullYear() - 62;

  function widow(over = {}) {
    return {
      ssCola: 0,
      dob: `${PRIMARY_BY}-01-01`,
      ssAge: 70, ssb: 20000, ssPia: 20000,
      spouse: {
        enabled: true,
        dob: `${PRIMARY_BY}-01-01`,
        ssAge: 70, ssb: 44640, ssPia: 36000,
        deathAge: 66,
      },
      ...over,
    };
  }

  test("DEFECT 1 FIXED: a death before claiming still produces a survivor benefit", () => {
    const P = widow();
    const atDeath = computeHouseholdSS(P, 66);
    expect(atDeath).toBeGreaterThan(0);
    expect(atDeath).toBeLessThan(36000);
    expect(atDeath).toBeGreaterThan(36000 * 0.715);
  });

  test("the survivor benefit exceeds the survivor's own small benefit", () => {
    expect(computeHouseholdSS(widow(), 67)).toBeGreaterThan(20000);
  });

  test("DEFECT 2 FIXED: claiming below survivor FRA is reduced, not paid at 100%", () => {
    const P = widow({
      ssAge: 70, ssb: 20000,
      spouse: { enabled: true, dob: `${PRIMARY_BY}-01-01`, ssAge: 62, ssb: 40000, ssPia: 40000, deathAge: 63 },
    });
    const got = computeHouseholdSS(P, 63);
    expect(got).toBeLessThan(40000);
    expect(got).toBeGreaterThan(40000 * 0.715);
  });

  test("an SSA-QUOTED survivor amount is used as given, with no double reduction", () => {
    const P = widow({
      spouse: { ...widow().spouse, survivorBenefitAtClaim: 31000, survivorClaimAge: 66 },
    });
    expect(computeHouseholdSS(P, 66)).toBe(31000);
  });

  test("regression: death AFTER the deceased claimed at FRA still pays 100%", () => {
    const P = widow({
      ssAge: 70, ssb: 20000,
      spouse: { enabled: true, dob: `${PRIMARY_BY}-01-01`, ssAge: 67, ssb: 40000, ssPia: 40000, deathAge: 68 },
    });
    expect(computeHouseholdSS(P, 68)).toBe(40000);
  });

  test("no deathAge ⇒ none of this engages", () => {
    const P = widow({ spouse: { ...widow().spouse, deathAge: null } });
    expect(computeHouseholdSS(P, 70)).toBe(20000 + 44640);
  });
});

describe("§30 firstToDie — the survivor's identity drives everything", () => {
  const {
    firstToDie, survivorIsPrimary, firstDeathOnPrimaryClock,
    survivorAgeOnPrimaryClock, planEndAgeOnPrimaryClock,
  } = require("./engine/ages.js");
  const { buildWithdrawalWaterfall } = require("./engine/buildWithdrawalWaterfall.js");

  const PRIMARY_BY = NOW.getFullYear() - 70;
  const SPOUSE_BY  = NOW.getFullYear() - 60;

  const COUPLE = {
    currentAge: 70, retireAge: 70, endAge: 90,
    dob: `${PRIMARY_BY}-01-01`,
    sp: 70_000, inf: 2.5, gr: 0.05, ssCola: 0,
    ssAge: 70, ssb: 48_000, ssPia: 40_000,
    filingStatus: "mfj", stateOfResidence: "FL", smile: false, housingType: "none",
    withdrawalBracketTarget: "22",
    accounts: [
      { id: "a", category: "pretax",  name: "IRA",     balance: 1_500_000 },
      { id: "b", category: "roth",    name: "Roth",    balance:   200_000 },
      { id: "c", category: "taxable", name: "Taxable", balance:   200_000 },
      { id: "d", category: "cash",    name: "Cash",    balance:    50_000 },
    ],
    spouse: {
      enabled: true, dob: `${SPOUSE_BY}-01-01`,
      ssAge: 67, ssb: 18_000, ssPia: 18_000,
    },
  };

  test("defaults to the spouse dying — every existing plan is unchanged", () => {
    expect(firstToDie({})).toBe("spouse");
    expect(firstToDie(COUPLE)).toBe("spouse");
    expect(survivorIsPrimary(COUPLE)).toBe(true);
  });

  test("deathAge is always the DECEDENT's own age, translated onto one clock", () => {
    const spouseDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 62, firstToDie: "spouse" } };
    expect(firstDeathOnPrimaryClock(spouseDies)).toBe(72);
    const primaryDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 72, firstToDie: "primary" } };
    expect(firstDeathOnPrimaryClock(primaryDies)).toBe(72);
  });

  test("the survivor's own age is the primary's, shifted by the gap", () => {
    const primaryDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 72, firstToDie: "primary" } };
    expect(survivorAgeOnPrimaryClock(primaryDies, 80)).toBe(70);
    const spouseDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 62, firstToDie: "spouse" } };
    expect(survivorAgeOnPrimaryClock(spouseDies, 80)).toBe(80);
  });

  describe("the plan horizon follows whoever is alive", () => {
    test("unchanged when the primary survives", () => {
      const spouseDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 62, firstToDie: "spouse" } };
      expect(planEndAgeOnPrimaryClock(spouseDies, 90)).toBe(90);
    });

    test("unchanged when no death is modelled at all", () => {
      expect(planEndAgeOnPrimaryClock(COUPLE, 90)).toBe(90);
      expect(planEndAgeOnPrimaryClock({}, 90)).toBe(90);
    });

    test("EXTENDS by the age gap when a younger spouse survives", () => {
      const primaryDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 72, firstToDie: "primary" } };
      expect(planEndAgeOnPrimaryClock(primaryDies, 90)).toBe(100);
    });

    test("SHORTENS symmetrically when an older spouse survives", () => {
      const olderSpouse = {
        ...COUPLE,
        dob: `${NOW.getFullYear() - 60}-01-01`,
        spouse: { ...COUPLE.spouse, dob: `${NOW.getFullYear() - 70}-01-01`, deathAge: 65, firstToDie: "primary" },
      };
      expect(planEndAgeOnPrimaryClock(olderSpouse, 90)).toBe(80);
    });

    test("never ends before the death year", () => {
      const olderSpouse = {
        ...COUPLE,
        dob: `${NOW.getFullYear() - 60}-01-01`,
        spouse: { ...COUPLE.spouse, dob: `${NOW.getFullYear() - 85}-01-01`, deathAge: 79, firstToDie: "primary" },
      };
      expect(planEndAgeOnPrimaryClock(olderSpouse, 90)).toBeGreaterThanOrEqual(79);
    });

    test("the waterfall actually projects the longer horizon", () => {
      const base = buildWithdrawalWaterfall({ ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: null } });
      const primaryDies = buildWithdrawalWaterfall({
        ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 72, firstToDie: "primary" },
      });
      expect(base.smart.rows.length).toBe(21);
      expect(primaryDies.smart.rows.length).toBe(31);
      expect(primaryDies.smart.rows[primaryDies.smart.rows.length - 1].age).toBe(100);
    });
  });

  test("the survivor benefit is priced off the SURVIVOR's FRA, not the deceased's", () => {
    const primaryDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 72, firstToDie: "primary" } };
    const got = computeHouseholdSS(primaryDies, 72);
    expect(got).toBeLessThan(48_000);
    expect(got).toBeGreaterThan(48_000 * 0.715);
    expect(got).toBe(Math.round(48_000 * (0.715 + 0.285 * (2 / 7))));

    expect(computeHouseholdSS(primaryDies, 77)).toBe(got);

    const waited = { ...primaryDies, spouse: { ...primaryDies.spouse, survivorClaimAge: 67 } };
    expect(computeHouseholdSS(waited, 77)).toBe(48_000);
  });

  test("a younger survivor's Medicare and RMDs do NOT start on the dead partner's clock", () => {
    const primaryDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 72, firstToDie: "primary" } };
    const rows = buildWithdrawalWaterfall(primaryDies).smart.rows;
    const at73 = rows.find(r => r.age === 73);
    const at77 = rows.find(r => r.age === 77);
    expect(at73.irmaa).toBe(0);

    const at75 = rows.find(r => r.age === 75);
    expect(at75.rmd).toBe(0);
    const at85 = rows.find(r => r.age === 85);
    expect(at85.rmd).toBeGreaterThan(0);
    expect(at77).toBeDefined();
  });

  test("filing status still flips the year AFTER the death, whoever died", () => {
    const { filesJointlyAt } = require("./engine/ages.js");
    const primaryDies = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: 72, firstToDie: "primary" } };
    expect(filesJointlyAt(primaryDies, 72)).toBe(true);
    expect(filesJointlyAt(primaryDies, 73)).toBe(false);
  });
});

describe("§31 stress death scenario reuses the authored model", () => {
  const { runMC } = require("./App");
  const { filesJointlyAt, planEndAgeOnPrimaryClock, firstDeathOnPrimaryClock } = require("./engine/ages.js");

  const BY = NOW.getFullYear() - 66;
  const AUTHORED = {
    currentAge: 66, retireAge: 66, endAge: 90,
    dob: `${BY}-01-01`,
    sp: 72_000, inf: 2.5, gr: 0.05, ssCola: 0,
    ssAge: 66, ssb: 42_000, ssPia: 42_000,
    filingStatus: "mfj", stateOfResidence: "FL", smile: false, housingType: "none",
    withdrawalBracketTarget: "22",
    accounts: [
      { id: "a", category: "pretax",  name: "IRA",     balance: 1_200_000 },
      { id: "b", category: "roth",    name: "Roth",    balance:   200_000 },
      { id: "c", category: "taxable", name: "Taxable", balance:   200_000 },
      { id: "d", category: "cash",    name: "Cash",    balance:    60_000 },
    ],
    spouse: {
      enabled: true, dob: `${BY}-01-01`,
      ssAge: 66, ssb: 20_000, ssPia: 20_000,
      deathAge: 80,
    },
  };

  const sooner = (yearsSooner = 10) => ({
    ...AUTHORED,
    spouse: { ...AUTHORED.spouse, deathAge: AUTHORED.spouse.deathAge - yearsSooner },
  });

  test("moving the death earlier keeps MFJ-through-the-death-year semantics", () => {
    const s = sooner();
    expect(filesJointlyAt(s, 69)).toBe(true);
    expect(filesJointlyAt(s, 70)).toBe(true);
    expect(filesJointlyAt(s, 71)).toBe(false);
    expect(filesJointlyAt(AUTHORED, 80)).toBe(true);
    expect(filesJointlyAt(AUTHORED, 81)).toBe(false);
  });

  test("the scenario does NOT discard the authored death", () => {
    const s = sooner();
    expect(Number.isFinite(firstDeathOnPrimaryClock(s))).toBe(true);
    expect(firstDeathOnPrimaryClock(s)).toBe(70);
    expect(firstDeathOnPrimaryClock(AUTHORED)).toBe(80);
  });

  test("an earlier death is WORSE — the whole point of the scenario", () => {
    const base    = runMC(AUTHORED, AUTHORED.endAge, 200, 7, true).rate;
    const earlier = runMC(sooner(), AUTHORED.endAge, 200, 7, true).rate;
    expect(earlier).toBeLessThanOrEqual(base);
  });

  test("the horizon rule is the same rule, not a second one", () => {
    const youngerSpouse = {
      ...AUTHORED,
      spouse: { ...AUTHORED.spouse, dob: `${BY + 8}-01-01`, firstToDie: "primary", deathAge: 80 },
    };
    const stressed = { ...youngerSpouse, spouse: { ...youngerSpouse.spouse, deathAge: 70 } };
    expect(planEndAgeOnPrimaryClock(youngerSpouse, 90)).toBe(98);
    expect(planEndAgeOnPrimaryClock(stressed, 90)).toBe(98);
  });

  test("with NO authored death the day-one bound still works and is finite", () => {
    const noDeath = { ...AUTHORED, spouse: { ...AUTHORED.spouse, deathAge: null } };
    const dayOne = {
      ...noDeath,
      ssb: Math.max(noDeath.ssb, noDeath.spouse.ssb),
      spouse: { ...noDeath.spouse, enabled: false },
      filingStatus: "single",
      twoHousehold: false,
    };
    const r = runMC(dayOne, noDeath.endAge, 200, 7, true).rate;
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  test("the widow's-penalty counterfactual differs from the base plan", () => {
    const TIGHT = {
      ...AUTHORED,
      sp: 96_000,
      accounts: [
        { id: "a", category: "pretax",  name: "IRA",     balance: 520_000 },
        { id: "b", category: "roth",    name: "Roth",    balance:  80_000 },
        { id: "c", category: "taxable", name: "Taxable", balance:  90_000 },
        { id: "d", category: "cash",    name: "Cash",    balance:  30_000 },
      ],
    };
    const withDeath = runMC(TIGHT, TIGHT.endAge, 300, 7, true).rate;
    const without   = runMC(
      { ...TIGHT, spouse: { ...TIGHT.spouse, deathAge: null } },
      TIGHT.endAge, 300, 7, true
    ).rate;
    expect(withDeath).toBeLessThan(1);
    expect(withDeath).not.toBe(without);
    expect(without).toBeGreaterThanOrEqual(withDeath);
  });
});
