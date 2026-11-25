import { contribStopOnPrimaryClock } from "./engine/ages.js";
import { jobContributionsForYear, householdAnnualContribution, totalRetirementIncome } from "./engine/contributions.js";
import { accumulateToRetirement } from "./engine/buildWithdrawalWaterfall.js";
import { runMC, simulateDeterministicWithStrategy } from "./App";

const FLAT = {
  currentAge: 50,
  retireAge: 60,
  endAge: 90,
  gr: 0,
  cashRealReturn: 0,
  inf: 2.5,
  taxableBasisPct: 100,
  port: 100_000,
  sp: 40_000,
  ssb: 0,
  ssAge: 67,
  accounts: [{ id: "p1", category: "pretax", name: "401k", balance: 100_000 }],
  contrib: 10_000,
  employerContrib: 0,
  rothContrib: 0,
  taxableContrib: 0,
  hsaContrib: 0,
};

const withSpouse = (over = {}) => ({
  ...FLAT,
  spouse: {
    enabled: true,
    dob: "",
    ssb: 0, ssAge: 67, ssPia: 0, deathAge: null, firstToDie: "spouse",
    survivorClaimAge: null, survivorBenefitAtClaim: 0,
    retireAge: null, contrib: 0, employerContrib: 0, rothContrib: 0,
    ...over,
  },
});

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
    const legacy = { ...FLAT };
    delete legacy.spouse;
    expect(accumulateToRetirement(legacy)).toEqual(accumulateToRetirement(FLAT));
  });

  test("spouse.enabled=false ignores their streams even when filled in", () => {
    const off = accumulateToRetirement(withSpouse({ enabled: false, contrib: 50_000, retireAge: 55 }));
    expect(off.pretax0).toBe(100_000 + 10 * 10_000);
  });
});

describe("§24.1 — a spouse who retires first stops contributing first", () => {
  test("spouse stops 5 years early ⇒ exactly 5 × their streams, not 10", () => {
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
    const r = accumulateToRetirement(withSpouse({ retireAge: 55, contrib: 4_000, employerContrib: 3_000 }));
    expect(r.pretax0).toBe(100_000 + 100_000 + 5 * 7_000);
  });
});

describe("§24.1 — spouse.retireAge is on the SPOUSE's clock", () => {
  const primaryIs50SpouseIs40 = {
    ...FLAT,
    currentAge: 50,
    spouse: {
      enabled: true,
      dob: `${new Date().getFullYear() - 40}-01-01`,
      retireAge: 60, contrib: 5_000, employerContrib: 0, rothContrib: 0,
      ssb: 0, ssAge: 67, ssPia: 0, deathAge: null, firstToDie: "spouse",
      survivorClaimAge: null, survivorBenefitAtClaim: 0,
    },
  };

  test("a spouse 10 yrs younger retiring at 60 stops when the PRIMARY is 70", () => {
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

describe("§24.1 — Phase A clamps a spouse who works past the primary", () => {
  test("spouse retiring after the primary is clamped, never double-counted", () => {
    const r = accumulateToRetirement(withSpouse({ retireAge: 70, contrib: 5_000 }));
    expect(r.pretax0).toBe(100_000 + 10 * 10_000 + 10 * 5_000);
  });
});

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

describe("§24.1 — all three accumulation engines agree", () => {
  const p = withSpouse({ retireAge: 55, contrib: 5_000, employerContrib: 1_000 });

  test("runMC and the deterministic engine both apply the spouse's stop date", () => {
    const stops = { ...p };
    const runsOn = { ...p, spouse: { ...p.spouse, retireAge: 60 } };

    const detStops  = simulateDeterministicWithStrategy(stops,  2.5, "gk");
    const detRunsOn = simulateDeterministicWithStrategy(runsOn, 2.5, "gk");
    expect(detRunsOn.portAtRetire).toBeGreaterThan(detStops.portAtRetire);

    const mcStops  = runMC(stops,  90, 200, 42, true);
    const mcRunsOn = runMC(runsOn, 90, 200, 42, true);
    expect(mcRunsOn.pcts[0].p50).toBeGreaterThan(mcStops.pcts[0].p50);
  });

  test("the waterfall and the deterministic engine land on the same balance", () => {
    const glideP = { ...p, preRetireEq: 91, postRetireEq: 70 };
    delete glideP.gr;
    const acc = accumulateToRetirement(glideP);
    const det = simulateDeterministicWithStrategy(glideP, 2.5, "gk");
    expect(Math.abs(det.portAtRetire - acc.total)).toBeLessThanOrEqual(1);
  });
});

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

describe("totalRetirementIncome — annual figures stay annual", () => {
  test("adds the spouse's annual benefit once, with no month-to-year conversion", () => {
    const p = { ssb: 24_000, spouse: { enabled: true, ssb: 36_000, ssAge: 67, ssPia: 30_000 } };
    expect(totalRetirementIncome(p)).toBe(60_000);
  });

  test("a disabled spouse contributes nothing", () => {
    const p = { ssb: 24_000, spouse: { enabled: false, ssb: 36_000, ssAge: 67, ssPia: 30_000 } };
    expect(totalRetirementIncome(p)).toBe(24_000);
  });
});
