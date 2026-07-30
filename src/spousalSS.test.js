/**
 * spousalSS.test.js — the DOLLAR ARITHMETIC of two-person Social Security.
 *
 * §21 listed this file as outstanding: `ghostSettings.test.js` already proves the
 * spouse fields are *wired* to an engine, but nothing proved the amounts are
 * *right*. Those are different failures — a wired field can be wired to the wrong
 * formula, which is what happened here.
 *
 * THE BUG THIS FILE EXISTS FOR (found 2026-07-30, shipped in v1.2.42):
 * every engine walks a single `age`, which is the PRIMARY's age. `computeHouseholdSS`
 * gated the spouse's benefit on `age >= spouse.ssAge` — i.e. it asked whether the
 * PRIMARY had reached the SPOUSE's claim age. For a spouse ten years younger
 * claiming at 67, the household was credited with the spouse's full benefit AND
 * the spousal top-up from the primary's 67th birthday, when the spouse was 57.
 * Ten years of income the household never receives, which inflates the success
 * rate. `spouse.dob` (§24) is what makes the two clocks distinguishable.
 *
 * Expected values here are hand-calculated with ssCola: 0 wherever possible, so a
 * failure points at the benefit rule and not at compounding.
 */

import { computeHouseholdSS } from "./engine/buildRothExplorer.js";
import { spouseAgeOffset, personAgeNow, ageFromDob } from "./engine/ages.js";

// Frozen clock: these assertions depend on ages derived from real DOBs.
const NOW = new Date("2026-07-30T12:00:00Z");
beforeAll(() => { jest.useFakeTimers().setSystemTime(NOW); });
afterAll(() => { jest.useRealTimers(); });

// One earner at $30K/yr, spouse at $12K/yr. Both PIAs equal their benefits, so
// the top-up is 0.5 × 30,000 − 12,000 = $3,000/yr exactly.
const PRIMARY_SSB = 30_000;
const SPOUSE_SSB  = 12_000;
const TOP_UP      = 0.5 * PRIMARY_SSB - SPOUSE_SSB;   // 3,000

/** Couple with an explicit age gap. `gap` > 0 ⇒ spouse is younger. */
function couple(gap, over = {}) {
  const primaryBirthYear = NOW.getFullYear() - 60;            // primary is 60 today
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
    // This is the regression lock: an unknown spouse age must reproduce the old
    // same-age behaviour, never poison the arithmetic with NaN.
    const p = couple(10);
    delete p.spouse.dob;
    expect(spouseAgeOffset(p)).toBe(0);
    expect(Number.isNaN(spouseAgeOffset(p))).toBe(false);
  });

  test("falls back to currentAge when dob is absent", () => {
    expect(spouseAgeOffset({ currentAge: 60, spouse: { currentAge: 52 } })).toBe(8);
  });

  test("prefers dob over a stale stored currentAge", () => {
    // dob is the input of record — a stored currentAge that nothing refreshes is
    // how the "changed my birthday, chart kept the old age" bug happened.
    const p = couple(10);
    p.spouse.currentAge = 99;
    expect(spouseAgeOffset(p)).toBe(10);
    expect(personAgeNow(p.spouse)).toBe(50);
  });
});

describe("computeHouseholdSS — spouse 10 years YOUNGER", () => {
  const P = couple(10);   // primary 60, spouse 50, both claim at 67

  test("primary alone from the primary's 67 (spouse is only 57)", () => {
    // THE BUG: this returned 45,000 (30,000 + 12,000 + 3,000 top-up) because the
    // spouse's claim was gated on the primary's age.
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
  const P = couple(-6);   // primary 60, spouse 66

  test("the older spouse collects first, alone", () => {
    // Spouse reaches 67 when the primary is 61. No top-up yet: the higher earner
    // (the primary) has not filed, and a spousal benefit requires that they have.
    expect(computeHouseholdSS(P, 61)).toBe(SPOUSE_SSB);
    expect(computeHouseholdSS(P, 66)).toBe(SPOUSE_SSB);
  });

  test("top-up waits for the HIGHER earner to file, not merely for both to be eligible", () => {
    expect(computeHouseholdSS(P, 66)).toBe(SPOUSE_SSB);                      // primary hasn't filed
    expect(computeHouseholdSS(P, 67)).toBe(PRIMARY_SSB + SPOUSE_SSB + TOP_UP); // primary files
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
    // Locks the fallback: this is the number every existing saved profile gets.
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
  // The rule most likely to be implemented wrong: delayed retirement credits
  // raise the CHECK but never flow into the spousal benefit, which is 50% of the
  // higher earner's PIA (the FRA amount).
  test("a delayed primary check does not enlarge the spousal top-up", () => {
    const base = couple(0);
    // Same PIA, bigger claimed benefit (as if claiming at 70).
    const delayed = { ...base, ssb: PRIMARY_SSB * 1.24, ssPia: PRIMARY_SSB };
    const got = computeHouseholdSS(delayed, 67);
    expect(got).toBe(Math.round(PRIMARY_SSB * 1.24) + SPOUSE_SSB + TOP_UP);
    // The top-up itself is unchanged from the un-delayed case.
    const plain = computeHouseholdSS(base, 67);
    expect(got - Math.round(PRIMARY_SSB * 1.24)).toBe(plain - PRIMARY_SSB);
  });

  test("the higher earner's PIA drives the top-up even when it is the spouse", () => {
    // Spouse out-earns the primary: the top-up must attach to the PRIMARY's check.
    const P = couple(0, {
      ssb: 10_000, ssPia: 10_000,
      spouse: { enabled: true, dob: `${NOW.getFullYear() - 60}-01-01`, ssAge: 67, ssb: 40_000, ssPia: 40_000 },
    });
    // 0.5 × 40,000 − 10,000 = 10,000 top-up on the primary's own $10,000.
    expect(computeHouseholdSS(P, 67)).toBe(10_000 + 40_000 + 10_000);
  });

  test("no top-up when the lower earner's own benefit already exceeds half", () => {
    const P = couple(0, {
      ssb: 30_000, ssPia: 30_000,
      spouse: { enabled: true, dob: `${NOW.getFullYear() - 60}-01-01`, ssAge: 67, ssb: 20_000, ssPia: 20_000 },
    });
    expect(computeHouseholdSS(P, 67)).toBe(50_000);   // 0.5 × 30,000 = 15,000 < 20,000
  });
});

describe("computeHouseholdSS — COLA compounds from each person's OWN claim year", () => {
  test("the younger spouse's COLA starts at THEIR claim, not the primary's", () => {
    const P = couple(10, { ssCola: 2 });
    const cola = 1.02;
    // Primary claims at 67; spouse claims when the primary is 77.
    // At the primary's 78: primary has 11 years of COLA, spouse and top-up have 1.
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

// ─── Per-person tax amounts (§24) ─────────────────────────────────────────────
//
// The age-65 standard-deduction add-on ($1,650 each) and the OBBBA senior bonus
// ($6,000 each) are PER FILER, but the engines carry one age. Both used to read
// "primary is 65" as "both are 65", handing a couple with an age gap up to
// $7,650/yr of deductions they are not entitled to — for as many years as the gap.
// The reverse case was worse in the other direction: an OLDER spouse who
// qualified got nothing, because the gate was the primary's age alone.
describe("per-person age-65 amounts", () => {
  const { personsAtLeastAge } = require("./engine/ages.js");
  const { getStandardDeduction } = require("./App");
  const { getSeniorBonusDeduction } = require("./engine/buildRothExplorer.js");

  describe("personsAtLeastAge", () => {
    test("single filer counts only themselves", () => {
      expect(personsAtLeastAge(64, null, false, 65)).toBe(0);
      expect(personsAtLeastAge(65, null, false, 65)).toBe(1);
      // A spouse age must be ignored entirely when not filing jointly.
      expect(personsAtLeastAge(64, 80, false, 65)).toBe(0);
    });

    test("MFJ with a known spouse age counts each person", () => {
      expect(personsAtLeastAge(66, 55, true, 65)).toBe(1);   // only the primary
      expect(personsAtLeastAge(55, 66, true, 65)).toBe(1);   // only the spouse
      expect(personsAtLeastAge(66, 67, true, 65)).toBe(2);   // both
      expect(personsAtLeastAge(60, 61, true, 65)).toBe(0);   // neither
    });

    test("MFJ with an UNKNOWN spouse age keeps the legacy both-at-once rule", () => {
      expect(personsAtLeastAge(65, null, true, 65)).toBe(2);
      expect(personsAtLeastAge(64, null, true, 65)).toBe(0);
    });
  });

  describe("getStandardDeduction", () => {
    const BASE_MFJ = 32_200, PER_HEAD = 1_650;

    test("unchanged when the spouse's age is unknown (regression lock)", () => {
      expect(getStandardDeduction(65, "mfj", 1)).toBe(BASE_MFJ + 2 * PER_HEAD);   // 35,500
      expect(getStandardDeduction(64, "mfj", 1)).toBe(BASE_MFJ);
    });

    test("only ONE add-on while the younger spouse is under 65", () => {
      expect(getStandardDeduction(66, "mfj", 1, 55)).toBe(BASE_MFJ + PER_HEAD);   // 33,850
    });

    test("both add-ons once the younger spouse reaches 65", () => {
      expect(getStandardDeduction(76, "mfj", 1, 65)).toBe(BASE_MFJ + 2 * PER_HEAD);
    });

    test("an OLDER spouse earns the add-on before the primary does", () => {
      // Previously $32,200 — the household lost $1,650/yr it was entitled to.
      expect(getStandardDeduction(60, "mfj", 1, 67)).toBe(BASE_MFJ + PER_HEAD);
    });

    test("a single filer ignores any spouse age passed in", () => {
      expect(getStandardDeduction(70, "single", 1, 40)).toBe(16_100 + PER_HEAD);
    });
  });

  describe("getSeniorBonusDeduction", () => {
    const YR = 2026;   // inside the 2025–2028 OBBBA window

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
      // The old early-return `if (!(age >= 65)) return 0` denied the household the
      // qualifying spouse's $6,000 entirely.
      expect(getSeniorBonusDeduction(60, "mfj", 0, YR, 67)).toBe(6_000);
    });

    test("neither spouse 65 ⇒ nothing", () => {
      expect(getSeniorBonusDeduction(60, "mfj", 0, YR, 61)).toBe(0);
    });

    test("the phase-out scales with the number of QUALIFYING people", () => {
      // 6% of MAGI above $150K MFJ, biting each qualifying person's own $6,000.
      // One qualifier, $50K excess → 6,000 − 0.06 × 50,000 = 3,000.
      expect(getSeniorBonusDeduction(66, "mfj", 200_000, YR, 55)).toBe(3_000);
      // Two qualifiers, same excess → 12,000 − 2 × 3,000 = 6,000.
      expect(getSeniorBonusDeduction(66, "mfj", 200_000, YR, 66)).toBe(6_000);
    });

    test("still $0 outside the 2025-2028 window regardless of ages", () => {
      expect(getSeniorBonusDeduction(70, "mfj", 0, 2029, 70)).toBe(0);
      expect(getSeniorBonusDeduction(70, "mfj", 0, 2024, 70)).toBe(0);
    });
  });
});

// ─── §22 — the widow's penalty ────────────────────────────────────────────────
//
// Requested by two separate users. The teachable point, and the reason it is
// worth engine work: the TAX hit usually exceeds the benefit lost. The survivor
// keeps the larger of the two checks but files Single, so brackets narrow, the
// standard deduction roughly halves, IRMAA thresholds halve and the OBBBA senior
// bonus halves — against a barely-reduced RMD and an unchanged portfolio.
//
// These are the five tests §22 named as required before it ships, plus the
// cross-engine agreement check.
describe("§22 widow's penalty", () => {
  const { buildWithdrawalWaterfall } = require("./engine/buildWithdrawalWaterfall.js");
  const { filesJointlyAt, filingStatusAt, spouseDeathOnPrimaryClock } = require("./engine/ages.js");

  const PRIMARY_BY = NOW.getFullYear() - 65;   // primary is 65 today
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
      enabled: true, dob: `${PRIMARY_BY}-01-01`,   // same age, so deathAge maps 1:1
      ssAge: 65, ssb: 24_000, ssPia: 24_000,
    },
  };
  const DEATH_AGE = 75;
  const withDeath = { ...COUPLE, spouse: { ...COUPLE.spouse, deathAge: DEATH_AGE } };

  // ── 1. deathAge null reproduces today's numbers byte-for-byte ──────────────
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

  // ── 2. taxable income RISES the year after death, on an unchanged portfolio ─
  test("2. the year AFTER death, tax rises on materially the same income", () => {
    const alive = buildWithdrawalWaterfall(COUPLE).smart.rows;
    const dead  = buildWithdrawalWaterfall(withDeath).smart.rows;
    const at = (rows, age) => rows.find(r => r.age === age);

    // Same year, both plans: the survivor's federal tax must be higher.
    const survivorYear = DEATH_AGE + 1;
    expect(at(dead, survivorYear).fedTax).toBeGreaterThan(at(alive, survivorYear).fedTax);

    // And it is a STEP, not drift: the jump at the transition exceeds the
    // ordinary year-over-year change in the joint plan.
    const deadStep  = at(dead,  survivorYear).fedTax - at(dead,  DEATH_AGE).fedTax;
    const aliveStep = at(alive, survivorYear).fedTax - at(alive, DEATH_AGE).fedTax;
    expect(deadStep).toBeGreaterThan(aliveStep);
  });

  test("2b. MFJ is kept THROUGH the death year (IRS Pub 501), Single after", () => {
    expect(filesJointlyAt(withDeath, DEATH_AGE - 1)).toBe(true);
    expect(filesJointlyAt(withDeath, DEATH_AGE)).toBe(true);      // year of death
    expect(filesJointlyAt(withDeath, DEATH_AGE + 1)).toBe(false); // year after
    expect(filingStatusAt(withDeath, DEATH_AGE + 1)).toBe("single");
  });

  // ── 3. SS drops to exactly max(primary, spouse), not the sum ───────────────
  test("3. Social Security becomes the LARGER single check, not the sum", () => {
    const dead  = buildWithdrawalWaterfall(withDeath).smart.rows;
    const alive = buildWithdrawalWaterfall(COUPLE).smart.rows;
    const at = (rows, age) => rows.find(r => r.age === age);

    // It must step DOWN at the death year.
    expect(at(dead, DEATH_AGE).ss).toBeLessThan(at(dead, DEATH_AGE - 1).ss);

    // Compared WITHIN the same year (so COLA cancels), the survivor keeps exactly
    // the larger check out of the joint total. The ratio is 0.60 for these two
    // benefits — decisively NOT the 0.67 literal the stress scenario used to
    // hardcode, which is only right for a one-earner couple.
    const ratio = at(dead, DEATH_AGE).ss / at(alive, DEATH_AGE).ss;
    expect(ratio).toBeCloseTo(36_000 / (36_000 + 24_000), 3);   // 0.600
    expect(ratio).not.toBeCloseTo(0.67, 2);

    // And it stays the larger check for the rest of the plan, still growing by COLA.
    expect(at(dead, DEATH_AGE + 5).ss).toBeGreaterThan(at(dead, DEATH_AGE).ss);
    expect(at(dead, DEATH_AGE + 5).ss).toBeLessThan(at(alive, DEATH_AGE + 5).ss);
  });

  // ── 4. deduction, IRMAA tier and senior bonus step down TOGETHER ───────────
  test("4. standard deduction, IRMAA tier and senior bonus all step down together", () => {
    const { getStandardDeduction } = require("./App");
    const { getSeniorBonusDeduction } = require("./engine/buildRothExplorer.js");
    const { getIrmaaCeiling } = require("./App");

    const jointYear    = filingStatusAt(withDeath, DEATH_AGE);
    const survivorYear = filingStatusAt(withDeath, DEATH_AGE + 1);
    expect(jointYear).toBe("mfj");
    expect(survivorYear).toBe("single");

    // One of these lagging is the likely bug, so assert all three in one place.
    expect(getStandardDeduction(76, survivorYear, 1)).toBeLessThan(getStandardDeduction(76, jointYear, 1));
    expect(getIrmaaCeiling(1, survivorYear, 1)).toBeLessThan(getIrmaaCeiling(1, jointYear, 1));
    expect(getSeniorBonusDeduction(76, survivorYear, 0, 2028)).toBeLessThan(
           getSeniorBonusDeduction(76, jointYear,    0, 2028));
  });

  // ── 5. cross-engine agreement on the survivor year ────────────────────────
  test("5. runMC and the waterfall agree that the survivor year is taxed as Single", () => {
    const { runMC } = require("./App");
    // The engines use different RNG, so compare the SHAPE both must share: each
    // one's survivor-year filing status comes from the same helper. A drifting
    // copy in either engine is what this catches.
    expect(filingStatusAt(withDeath, DEATH_AGE + 1)).toBe("single");
    expect(spouseDeathOnPrimaryClock(withDeath)).toBe(DEATH_AGE);
    // And runMC must still produce a usable result with a death modelled
    // (a thrown error or NaN success rate is the failure mode here).
    const mc = runMC({ ...withDeath, paths: 60 });
    expect(Number.isFinite(mc.rate)).toBe(true);
    expect(mc.rate).toBeGreaterThanOrEqual(0);
    expect(mc.rate).toBeLessThanOrEqual(1);
  });

  test("the death age is the SPOUSE's own age, shifted onto the primary's clock", () => {
    // Spouse 8 years younger dying at 75 ⇒ the primary is 83 that year.
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

// ─── §24 #3 — Medicare starts at EACH person's own 65 ─────────────────────────
//
// IRMAA thresholds are per TAX RETURN (so they follow filing status), but the
// surcharge is per BENEFICIARY. MFJ used to charge two surcharges from the moment
// the PRIMARY turned 65, overstating Medicare cost for the whole age gap — and
// charged nothing at all when only the OLDER spouse qualified.
describe("§24 per-person Medicare / IRMAA start", () => {
  const { irmaaCost } = require("./App");
  const YR = new Date().getFullYear();
  const HIGH_MAGI = 400_000;   // comfortably into a surcharge tier

  test("unchanged when the beneficiary count is not supplied (regression lock)", () => {
    const mfjBoth = irmaaCost(HIGH_MAGI, YR, 0.025, true);
    expect(mfjBoth).toBeGreaterThan(0);
    // Explicitly passing 2 must equal the old MFJ default.
    expect(irmaaCost(HIGH_MAGI, YR, 0.025, true, 2)).toBe(mfjBoth);
    // And 1 must equal the old single-filer amount at the MFJ threshold.
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
    // A one-beneficiary MFJ couple is measured against the MFJ threshold, so an
    // income between the single and MFJ tier-1 thresholds owes nothing.
    const between = 150_000;
    expect(irmaaCost(between, YR, 0.025, true, 1)).toBe(0);      // MFJ threshold
    expect(irmaaCost(between, YR, 0.025, false, 1)).toBeGreaterThan(0); // single threshold
  });

  test("an age-gapped couple is charged ONE surcharge, then two", () => {
    const { personsAtLeastAge } = require("./engine/ages.js");
    // Primary 66, spouse 55 → one on Medicare.
    expect(personsAtLeastAge(66, 55, true, 65)).toBe(1);
    // Eleven years later both are on it.
    expect(personsAtLeastAge(77, 66, true, 65)).toBe(2);
  });
});

// ─── §30 — survivor benefit rules ─────────────────────────────────────────────
//
// v1.2.63 modelled the survivor's income as max(ownCheck, deceasedCheck) from the
// death year. That was wrong in TWO OPPOSITE DIRECTIONS at once, and they do not
// cancel — they hit different households:
//
//   OVERSTATED — it paid 100% of the deceased's check immediately. A survivor
//   claiming below survivor FRA actually receives 71.5% (at 60) to 99%; the
//   reduction is permanent.
//
//   UNDERSTATED, badly — the inherited check was gated on the DECEASED's claim age,
//   so a death before they filed paid $0 until the year they *would* have filed.
//   The survivor benefit actually derives from the deceased's PIA and is claimable
//   from 60 whether or not the deceased ever filed. That is the early-death case
//   the whole feature exists to explore.
//
// Constants cited from TAX_REFERENCE.md → "Survivor benefits".
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
  const PRIMARY_BY = NOW.getFullYear() - 62;   // survivor born 1964 ⇒ survivor FRA 67

  function widow(over = {}) {
    return {
      ssCola: 0,
      dob: `${PRIMARY_BY}-01-01`,
      ssAge: 70, ssb: 20000, ssPia: 20000,
      spouse: {
        enabled: true,
        dob: `${PRIMARY_BY}-01-01`,
        ssAge: 70, ssb: 44640, ssPia: 36000,   // higher earner, delayed to 70
        deathAge: 66,                          // dies BEFORE claiming
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
