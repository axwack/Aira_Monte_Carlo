/**
 * Per-person contributions — §24.1 Phase A.
 *
 * WHAT THIS FEATURE ACTUALLY FIXES
 * --------------------------------
 * Splitting contribution AMOUNTS per person changes nothing: all three engines
 * sum into buckets, so 24,500 + 18,000 in one field is identical to two fields.
 * The bug is the STOP DATE — every stream ran for `retireAge - currentAge`, one
 * retirement date for two people. A partner retiring at 62 while the other works
 * to 67 lost, or invented, five years of one salary's savings.
 *
 * So the tests that matter are the arithmetic ones (3, 4a, 4b), not the wiring
 * one. A wiring test proves a field REACHES an engine; it cannot prove the
 * engine does the right thing with it. That gap is exactly how the spousal-SS
 * age-gap bug shipped: the field was wired, and compared against the wrong
 * person's clock for years.
 */

import { contribStopOnPrimaryClock } from "./engine/ages.js";
import { jobContributionsForYear, householdAnnualContribution } from "./engine/contributions.js";
import { accumulateToRetirement } from "./engine/buildWithdrawalWaterfall.js";
import { runMC, simulateDeterministicWithStrategy } from "./App";

// Zero growth everywhere makes every expected value hand-countable:
// balance = start + Σ contributions. `gr: 0` covers the invested buckets and
// `cashRealReturn: 0` covers the cash/HSA bucket, which grows on its own rate.
const FLAT = {
  currentAge: 50,
  retireAge: 60,          // ⇒ 10 accumulation years, primary contributes ages 50..59
  endAge: 90,
  gr: 0,
  cashRealReturn: 0,
  inf: 2.5,
  taxableBasisPct: 100,
  port: 100_000,          // aggregate mirror of `accounts` — the deterministic engine reads this
  sp: 40_000,
  ssb: 0,
  ssAge: 67,
  accounts: [{ id: "p1", category: "pretax", name: "401k", balance: 100_000 }],
  contrib: 10_000,        // primary pre-tax deferral
  employerContrib: 0,
  rothContrib: 0,
  taxableContrib: 0,
  hsaContrib: 0,
};

const withSpouse = (over = {}) => ({
  ...FLAT,
  spouse: {
    enabled: true,
    dob: "",              // unknown age ⇒ offset 0 ⇒ spouse shares the primary's clock
    ssb: 0, ssAge: 67, ssPia: 0, deathAge: null, firstToDie: "spouse",
    survivorClaimAge: null, survivorBenefitAtClaim: 0,
    retireAge: null, contrib: 0, employerContrib: 0, rothContrib: 0,
    ...over,
  },
});

// ─── 1. Regression: the aggregate result is unchanged ────────────────────────

describe("§24.1 — existing profiles are untouched", () => {
  test("no spouse block at all ⇒ pre-feature arithmetic (start + 10 × contrib)", () => {
    const r = accumulateToRetirement(FLAT);
    expect(r.pretax0).toBe(100_000 + 10 * 10_000);
  });

  test("spouse enabled but contributing nothing changes no balance", () => {
    const solo = accumulateToRetirement(FLAT);
    const withEmptySpouse = accumulateToRetirement(withSpouse({ retireAge: 55 }));
    expect(withEmptySpouse.pretax0).toBe(solo.pretax0);
  });

  test("MIGRATION: a saved profile with no spouse key is byte-identical", () => {
    // The literal shape of a pre-§24.1 stored profile — no spouse object.
    const legacy = { ...FLAT };
    delete legacy.spouse;
    expect(accumulateToRetirement(legacy)).toEqual(accumulateToRetirement(FLAT));
  });

  test("spouse.enabled=false ignores their streams even when filled in", () => {
    const off = accumulateToRetirement(withSpouse({ enabled: false, contrib: 50_000, retireAge: 55 }));
    expect(off.pretax0).toBe(100_000 + 10 * 10_000);
  });
});

// ─── 2. The arithmetic that is the whole point ───────────────────────────────

describe("§24.1 — a spouse who retires first stops contributing first", () => {
  test("spouse stops 5 years early ⇒ exactly 5 × their streams, not 10", () => {
    // Primary: ages 50..59 = 10 yrs × 10,000        = 100,000
    // Spouse:  retires at 55 ⇒ ages 50..54 = 5 yrs × 5,000 = 25,000
    // Start 100,000 ⇒ 225,000
    const r = accumulateToRetirement(withSpouse({ retireAge: 55, contrib: 5_000 }));
    expect(r.pretax0).toBe(225_000);
  });

  test("same spouse retiring WITH the primary contributes all 10 years", () => {
    const r = accumulateToRetirement(withSpouse({ retireAge: 60, contrib: 5_000 }));
    expect(r.pretax0).toBe(100_000 + 10 * 10_000 + 10 * 5_000);
  });

  test("the difference is exactly the 5 missing years — no rounding drift", () => {
    const early = accumulateToRetirement(withSpouse({ retireAge: 55, contrib: 5_000 })).pretax0;
    const full  = accumulateToRetirement(withSpouse({ retireAge: 60, contrib: 5_000 })).pretax0;
    expect(full - early).toBe(5 * 5_000);
  });

  test("employer money follows the same job, so it stops on the same date", () => {
    // Spouse: 5 yrs × (4,000 deferral + 3,000 employer) = 35,000
    const r = accumulateToRetirement(withSpouse({ retireAge: 55, contrib: 4_000, employerContrib: 3_000 }));
    expect(r.pretax0).toBe(100_000 + 100_000 + 5 * 7_000);
  });
});

// ─── 3. The age-gap trap that already shipped once against spouse.ssAge ──────

describe("§24.1 — spouse.retireAge is on the SPOUSE's clock", () => {
  const primaryIs50SpouseIs40 = {
    ...FLAT,
    currentAge: 50,
    spouse: {
      enabled: true,
      // 10 years younger than the primary.
      dob: `${new Date().getFullYear() - 40}-01-01`,
      retireAge: 60, contrib: 5_000, employerContrib: 0, rothContrib: 0,
      ssb: 0, ssAge: 67, ssPia: 0, deathAge: null, firstToDie: "spouse",
      survivorClaimAge: null, survivorBenefitAtClaim: 0,
    },
  };

  test("a spouse 10 yrs younger retiring at 60 stops when the PRIMARY is 70", () => {
    // The bug this guards: reading 60 as if it were the primary's age.
    expect(contribStopOnPrimaryClock(primaryIs50SpouseIs40)).toBe(70);
  });

  test("a spouse 10 yrs OLDER retiring at 60 stops when the primary is 50", () => {
    const older = {
      ...primaryIs50SpouseIs40,
      spouse: { ...primaryIs50SpouseIs40.spouse, dob: `${new Date().getFullYear() - 60}-01-01` },
    };
    expect(contribStopOnPrimaryClock(older)).toBe(50);
  });

  test("the older spouse's earlier stop really removes years from the balance", () => {
    // Spouse is 60 today and retires at 60 ⇒ stops immediately (primary age 50),
    // so none of their 5,000 lands, even though the field is filled in.
    const older = {
      ...primaryIs50SpouseIs40,
      spouse: { ...primaryIs50SpouseIs40.spouse, dob: `${new Date().getFullYear() - 60}-01-01` },
    };
    expect(accumulateToRetirement(older).pretax0).toBe(100_000 + 10 * 10_000);
  });

  test("unknown spouse age falls back to the primary's clock (regression lock)", () => {
    expect(contribStopOnPrimaryClock(withSpouse({ retireAge: 55 }))).toBe(55);
  });

  test("no explicit retireAge ⇒ Infinity ⇒ runs the whole accumulation", () => {
    expect(contribStopOnPrimaryClock(withSpouse({ retireAge: null }))).toBe(Infinity);
    const r = accumulateToRetirement(withSpouse({ retireAge: null, contrib: 5_000 }));
    expect(r.pretax0).toBe(100_000 + 10 * 10_000 + 10 * 5_000);
  });
});

// ─── 4. Phase A's disclosed limit ────────────────────────────────────────────

describe("§24.1 — Phase A clamps a spouse who works past the primary", () => {
  test("spouse retiring after the primary is clamped, never double-counted", () => {
    // Spouse retires at 70, primary at 60. Phase A models contributions only to
    // the primary's date, so the spouse contributes exactly the 10 accumulation
    // years — not 20, and not zero.
    const r = accumulateToRetirement(withSpouse({ retireAge: 70, contrib: 5_000 }));
    expect(r.pretax0).toBe(100_000 + 10 * 10_000 + 10 * 5_000);
  });
});

// ─── 5. Bucket routing ───────────────────────────────────────────────────────

describe("§24.1 — the spouse's money lands in the right buckets", () => {
  const p = {
    ...FLAT,
    accounts: [
      { id: "a", category: "pretax",  balance: 100_000 },
      { id: "b", category: "roth",    balance:  50_000 },
      { id: "c", category: "taxable", balance:  10_000 },
    ],
    spouse: {
      enabled: true, dob: "", retireAge: 60,
      contrib: 5_000, employerContrib: 2_000, rothContrib: 3_000,
      ssb: 0, ssAge: 67, ssPia: 0, deathAge: null, firstToDie: "spouse",
      survivorClaimAge: null, survivorBenefitAtClaim: 0,
    },
  };

  test("their 401(k) + employer money goes to pre-tax", () => {
    expect(accumulateToRetirement(p).pretax0).toBe(100_000 + 10 * (10_000 + 7_000));
  });

  test("their Roth IRA goes to Roth, not pre-tax", () => {
    expect(accumulateToRetirement(p).roth0).toBe(50_000 + 10 * 3_000);
  });

  test("nothing leaks into the taxable bucket", () => {
    expect(accumulateToRetirement(p).taxable0).toBe(10_000);
  });
});

// ─── 6. Cross-engine parity — the recurring defect class here ────────────────

describe("§24.1 — all three accumulation engines agree", () => {
  const p = withSpouse({ retireAge: 55, contrib: 5_000, employerContrib: 1_000 });

  test("runMC and the deterministic engine both apply the spouse's stop date", () => {
    const stops = { ...p };
    const runsOn = { ...p, spouse: { ...p.spouse, retireAge: 60 } };

    // Deterministic: a later spouse stop must mean a bigger portfolio.
    const detStops  = simulateDeterministicWithStrategy(stops,  2.5, "gk");
    const detRunsOn = simulateDeterministicWithStrategy(runsOn, 2.5, "gk");
    expect(detRunsOn.portAtRetire).toBeGreaterThan(detStops.portAtRetire);

    // Monte Carlo: same seed, so the draws are identical and the only
    // difference is the five extra years of the spouse's contributions.
    //
    // Measured at RETIREMENT (pcts[0]), not at the terminal balance. Guyton-
    // Klinger reacts to a bigger portfolio by permitting more spending, so a
    // household that saved MORE can legitimately die with LESS — the terminal
    // value is not monotonic in contributions and asserting on it would be
    // testing the guardrails, not the accumulation this feature changes.
    const mcStops  = runMC(stops,  90, 200, 42, true);
    const mcRunsOn = runMC(runsOn, 90, 200, 42, true);
    expect(mcRunsOn.pcts[0].p50).toBeGreaterThan(mcStops.pcts[0].p50);
  });

  test("the waterfall and the deterministic engine land on the same balance", () => {
    // `gr` is deliberately OMITTED here: accumulateToRetirement honours a gr
    // override but simulateDeterministicWithStrategy does not — it always
    // derives its rate from the equity glide. Forcing gr:0 would compare two
    // different growth models and prove nothing. With gr absent both use
    // expectedReturn(glide), so any gap is a real disagreement about
    // CONTRIBUTIONS, which is what this test is for.
    const glideP = { ...p, preRetireEq: 91, postRetireEq: 70 };
    delete glideP.gr;
    const acc = accumulateToRetirement(glideP);
    const det = simulateDeterministicWithStrategy(glideP, 2.5, "gk");
    // Deterministic rounds once at the end; the waterfall does not.
    expect(Math.abs(det.portAtRetire - acc.total)).toBeLessThanOrEqual(1);
  });
});

// ─── 7. The shared helper itself ─────────────────────────────────────────────

describe("§24.1 — jobContributionsForYear / householdAnnualContribution", () => {
  test("spouse counted before their stop age, dropped from it on", () => {
    const p = withSpouse({ retireAge: 55, contrib: 5_000 });
    expect(jobContributionsForYear(p, 54)).toMatchObject({ pretax: 15_000, spouseActive: true });
    expect(jobContributionsForYear(p, 55)).toMatchObject({ pretax: 10_000, spouseActive: false });
  });

  test("household total includes HSA and brokerage, which never split", () => {
    const p = { ...withSpouse({ retireAge: 60, contrib: 5_000 }), hsaContrib: 4_000, taxableContrib: 6_000 };
    expect(householdAnnualContribution(p, 50)).toBe(10_000 + 5_000 + 4_000 + 6_000);
  });

  test("household total drops the spouse once they have retired", () => {
    const p = { ...withSpouse({ retireAge: 55, contrib: 5_000 }), hsaContrib: 4_000 };
    expect(householdAnnualContribution(p, 56)).toBe(10_000 + 4_000);
  });
});
