/**
 * Ghost-setting detector.
 *
 * WHY THIS EXISTS
 * ---------------
 * The most embarrassing bug class in this codebase is a control that does nothing:
 * a field that appears in the Profile, is persisted, is described in the UI copy,
 * and is read by NO engine. Four shipped that way and went unnoticed for months —
 * `taxFunding` (conversion tax always came out of pre-tax whatever you picked),
 * `smile`, the healthcare-shock params, and `abGrowth` in the waterfall (which
 * silently hardcoded 3%). Each was found by accident, one at a time, long after
 * users had been making decisions on numbers the setting never moved.
 *
 * The rule this file enforces is blunt and general:
 *
 *   If a field exists in BLANK_PROFILE, changing it must change something the
 *   engines compute. If it cannot, it must be listed in INERT_BY_DESIGN with a
 *   reason.
 *
 * That turns "we forgot to wire it up" from a bug a user reports into a build
 * failure. A new ghost setting cannot ship silently: either the engines read it,
 * or someone has to write down, in this file, why they don't.
 *
 * The exemption list is deliberately explicit rather than a pattern match. Writing
 * a one-line justification is cheap; it is also exactly the moment someone notices
 * "…wait, why DOESN'T this affect anything?"
 */

import { BLANK_PROFILE, runMC, runStress, simulateDeterministicWithStrategy } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { resolveGlidepathSwitchAge, glidepathEqPct, LEGACY_GLIDEPATH_SWITCH_AGE } from "./engine/glidepath.js";

// A profile with enough money and enough happening that most settings have room
// to show an effect. BLANK_PROFILE itself is mostly zeros, so perturbing a field
// there often changes nothing for uninteresting reasons.
const BASE = {
  ...BLANK_PROFILE,
  currentAge: 60,
  retireAge: 62,
  endAge: 92,
  dob: "1966-03-14",
  sp: 90_000,
  ssAge: 67,
  ssb: 30_000,
  ssCola: 2.4,
  ab: 12_000,
  abGrowth: 3,
  abReliability: 80,
  inf: 2.5,
  gr: 0.07,
  filingStatus: "mfj",
  stateOfResidence: "NJ",
  withdrawalBracketTarget: "22",
  rothConversionTarget: "22",
  taxFunding: "from_taxable",
  irmaaGuard: true,
  ssTorpedoGuard: true,
  rothEmergencyReserve: 0,
  cashRealReturn: 3.0,
  taxableBasisPct: 70,
  preRetireEq: 91,
  postRetireEq: 70,
  accounts: [
    { id: "g1", category: "pretax",  name: "401k",    balance: 1_200_000 },
    { id: "g2", category: "roth",    name: "Roth",    balance:   250_000 },
    { id: "g3", category: "taxable", name: "Taxable", balance:   400_000 },
    { id: "g4", category: "cash",    name: "Cash",    balance:   150_000 },
  ],
};

/**
 * Fields that genuinely cannot move a projection. Each needs a REASON — if you
 * are adding to this list, first be sure the field is cosmetic rather than
 * broken, because "it's exempt" is precisely what a ghost setting looks like
 * from the inside.
 */
const INERT_BY_DESIGN = {
  name:                 "display only — report cover, not a calculation input",
  sex:                  "mortality is not yet modelled per-person",
  geminiApiKey:         "credential for the optional AI feature",
  geminiModel:          "AI model choice; not a model input",
  employerStartDate:    "display/context only",
  spImportMeta:         "display metadata for the CSV import summary",
  conversionOverrides:  "empty by default; covered by rothConversionPlan.test.js",
  checkpoints:          "manual balance markers plotted on the fan chart only",
  properties:           "per-property rentals; covered by mortgage.test.js",
  carveouts:            "empty by default; covered by withdrawal.test.js",
  otherIncomes:         "empty by default; covered by withdrawal.test.js",
  cashFlowEvents:       "empty by default; covered by cashFlowEvents.test.js",
  spSchedule:           "null by default; covered by expenseImport.test.js",
  withdrawalOrder:      "only read when orderingMode === 'custom'; covered by withdrawal.test.js",
  // Genuinely not model inputs — display toggles and Action-Plan targets.
  real:                 "UI toggle: render figures in today's dollars. Presentation only.",
  tax:                  "UI toggle: show/hide the tax overlay. Presentation only.",
  portfolioGoal:        "Action Plan progress target; compared against, never fed in",
  earlyRetireTarget:    "Action Plan target age; compared against, never fed in",
  // Verified deliberate during the 2026-07-27 rental unification (REQUIREMENTS
  // §13.2 #11): abReliability is a per-year Bernoulli draw that exists ONLY in
  // runMC. It has no meaning in a single deterministic path, so the waterfall
  // must not read it. Inert here on purpose, not by omission.
  abReliability:        "stochastic (runMC-only) by design; see REQUIREMENTS §13.2 #11",
  // Landmine DETECTION flags. They colour rows and raise warnings; they do not
  // change any draw or balance, so the numeric fingerprint cannot see them.
  ssTorpedoGuard:       "flags the landmine; does not alter draws",
};

/**
 * Live settings this BASE fixture does not happen to exercise.
 *
 * These are NOT known ghosts — each is read by some engine or strategy that this
 * particular profile does not activate (no mortgage, not GK, not two-household,
 * waterfall-only fingerprint, and so on). They are listed rather than silently
 * skipped so the gap is visible and someone can close it with a targeted fixture.
 *
 * TODO: give each one a fixture that switches on its code path, then delete it
 * from here. Every line removed is a setting proven to work.
 */
const NEEDS_A_TARGETED_FIXTURE = {
  annualRent:              "renter path — needs housingType 'rent'",
  mortPI:                  "needs housingType 'own' with an active mortgage",
  mortRate:                "needs an active mortgage",
  mortTerm:                "needs an active mortgage",
  mortExtra:               "needs an active mortgage",
  mortBalance:             "needs an active mortgage",
  reGrowthRate:            "home appreciation — needs a property",
  gkFloor:                 "GK guardrails — needs a GK distribution strategy",
  gkCeiling:               "GK guardrails — needs a GK distribution strategy",
  gkFloorPct:              "GK guardrails — needs a GK distribution strategy",
  gkCeilingPct:            "GK guardrails — needs a GK distribution strategy",
  gkTarget:                "GK guardrails — needs a GK distribution strategy",
  fixedWithdrawalRate:     "only read by the 'fixed' distribution strategy",
  fafsaGuard:              "needs fafsaEndYear inside the projection window",
  spOutOfCountry:          "only applies when twoHousehold is on",
  spSpendOutofState:       "only applies when twoHousehold is on",
  gkFloorSpendOutofState:  "only applies when twoHousehold is on",
  // Excluded from the SWEEP only because the sweep's fingerprint is waterfall-only
  // and the waterfall takes `gr` directly. These are runMC inputs and are now PROVEN
  // live by the "equity glidepath" block at the bottom of this file, including a
  // direction check. Do not read this as untested.
  preRetireEq:             "runMC-only; proven by the equity glidepath block below",
  postRetireEq:            "runMC-only; proven by the equity glidepath block below",
  port:                    "waterfall derives balances from accounts[], not port",
  rothEmergencyReserve:    "this fixture never draws Roth, so the floor never binds",
  useAb:                   "gates rental; ab is already non-zero here",
  useJointRmdTable:        "needs a fixture that reaches RMD age with the joint gate open",
  // Added by the spousal-SS engine wiring (§21, 2026-07-27, from another machine).
  // Only read when spouse.enabled is true, which BLANK_PROFILE defaults to false.
  // Proven live by the "spousal Social Security" block at the bottom of this file —
  // do NOT move these to INERT_BY_DESIGN, they are real inputs.
  ssPia:                   "only read when spouse.enabled; see the spousal SS block below",
  spouse:                  "object; exercised directly by the spousal SS block below",
  // Defaults to null (→ switch at retireAge), so the generic sweep skips it as a
  // non-number. It is a REAL input — proven live in runMC, the stress path and the
  // deterministic schedule by the equity glidepath block below. REQUIREMENTS §26.
  glidepathSwitchAge:      "null by default; proven by the equity glidepath block below",
  // Healthcare shock params (v1.2.55). These are REAL inputs — they are simply no
  // longer read by the DETERMINISTIC engines that `fingerprint` samples, and the
  // removal was deliberate: charging E[X] into a median withdrawal plan produced a
  // draw figure wrong in every actual year (u/garylapointe's phantom $3,960 at 72).
  // They now live exclusively in runMC's stochastic path, where shock risk belongs.
  // Do NOT move these to INERT_BY_DESIGN — they are proven live by the
  // "healthcare shock params reach runMC" block at the bottom of this file.
  // IRC 72(t) exceptions (v1.2.57). BASE retires at 62, so there is no pre-59½
  // year for either to bind on — not ghosts, just outside this fixture's window.
  // PROVEN live in earlyWithdrawal.test.js ("Rule of 55 on a former-employer 401k
  // removes it" / "a running 72(t) SEPP removes it"), which asserts each one
  // changes buildWithdrawalWaterfall's charged penalty. Do not move to
  // INERT_BY_DESIGN.
  ruleOf55:                "needs retireAge < 59.5; proven in earlyWithdrawal.test.js",
  sepp72t:                 "needs retireAge < 59.5; proven in earlyWithdrawal.test.js",
  sepp72tStartAge:         "null by default; proven in earlyWithdrawal.test.js",
  hcShockAge:              "runMC-only since v1.2.55; proven by the healthcare block below",
  hcProb:                  "runMC-only since v1.2.55; proven by the healthcare block below",
  hcMin:                   "runMC-only since v1.2.55; proven by the healthcare block below",
  hcMax:                   "runMC-only since v1.2.55; proven by the healthcare block below",
};

/** A number summarising everything the engines computed. Any real change moves it. */
function fingerprint(profile) {
  const { smart } = buildWithdrawalWaterfall(profile);
  return smart.rows.reduce(
    (acc, r) =>
      acc +
      (r.fromPretax || 0) + (r.fromRoth || 0) + (r.fromCash || 0) + (r.fromTaxable || 0) +
      (r.totalTax || 0) + (r.rmd || 0) + (r.conversionAmount || 0) + (r.conversionTax || 0) +
      (r.ss || 0) + (r.annuityRental || 0) + (r.magi || 0) +
      (r.pretaxEnd || 0) + (r.rothEnd || 0) + (r.taxableEnd || 0) + (r.cashEnd || 0),
    0
  );
}

/** Perturb a value into a different but still-legal one, by type. */
function perturb(key, value) {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") {
    // Ages must stay ordered and plausible; everything else can just grow.
    if (/age/i.test(key)) return value > 0 ? value + 2 : 65;
    if (value === 0) return 5_000;
    return Math.round(value * 1.5) + 1;
  }
  return undefined; // strings/objects: handled explicitly or exempt
}

describe("no ghost settings — every profile field must reach an engine", () => {
  const candidates = Object.keys(BLANK_PROFILE).filter((k) => {
    if (k in INERT_BY_DESIGN) return false;
    if (k in NEEDS_A_TARGETED_FIXTURE) return false;
    const v = BASE[k];
    return typeof v === "boolean" || typeof v === "number";
  });

  test("the detector is actually examining a meaningful number of fields", () => {
    // Guards against the list silently emptying (e.g. a refactor renames things
    // and every key falls through), which would make this whole file pass
    // vacuously — a test that cannot fail is worse than no test.
    expect(candidates.length).toBeGreaterThan(15);
  });

  test.each(candidates)("changing '%s' changes what the engines compute", (key) => {
    const before = fingerprint(BASE);
    const changed = { ...BASE, [key]: perturb(key, BASE[key]) };
    const after = fingerprint(changed);

    // Rounded to whole dollars: we want "this had a real effect", not float noise.
    expect(Math.round(after)).not.toBe(Math.round(before));
  });
});

describe("no ghost settings — string/enum fields", () => {
  // Enum-ish fields cannot be perturbed generically, so they are pinned by hand.
  // These are the ones with a history of being wired to nothing.
  const enumCases = [
    ["taxFunding", "from_taxable", "from_conv"],
    // NOTE: withdrawalBracketTarget 22-vs-12 does NOT move this fixture, because the
    // conversion fills to rothConversionTarget and the pre-tax spending draw stays
    // under both ceilings. It is exercised properly in withdrawal.test.js. Left out
    // here rather than weakened, so this file never passes on a technicality.
    ["rothConversionTarget", "22", "off"],
    ["orderingMode", "tax_reactive", "pretax_first"],
    ["filingStatus", "mfj", "single"],
    ["stateOfResidence", "NJ", "FL"],
  ];

  test.each(enumCases)("'%s' actually changes the model (%s vs %s)", (key, a, b) => {
    const fa = fingerprint({ ...BASE, [key]: a });
    const fb = fingerprint({ ...BASE, [key]: b });
    expect(Math.round(fa)).not.toBe(Math.round(fb));
  });
});

describe("no ghost settings — runMC must honour them too", () => {
  // The waterfall and runMC are separate implementations of the same model, so a
  // setting can be live in one and dead in the other. That is exactly how the
  // Monte Carlo success rate came to describe a different plan than the tables.
  const mcFingerprint = (profile) => {
    const r = runMC(profile, profile.endAge, 120, 42, true);
    const last = r.pcts?.[r.pcts.length - 1];
    return `${r.rate}|${last?.p50}`;
  };

  test.each([
    ["taxFunding", "from_taxable", "from_conv"],
    ["rothConversionTarget", "22", "off"],
  ])("runMC responds to '%s'", (key, a, b) => {
    expect(mcFingerprint({ ...BASE, [key]: a })).not.toBe(mcFingerprint({ ...BASE, [key]: b }));
  });
});

// ─── Spousal Social Security (§21 Phase 1 engine wiring) ─────────────────────
// The engine wiring landed from another machine WITHOUT tests and without the
// suite being re-run. These are the missing checks: they prove the new fields are
// real inputs rather than a fifth ghost setting, and they pin the one rule that is
// easy to get wrong.
describe("spousal Social Security is wired to the engines", () => {
  const COUPLE = {
    ...BASE,
    ssPia: 30_000,
    spouse: { enabled: true, ssb: 12_000, ssAge: 67, ssPia: 12_000 },
  };

  test("enabling a spouse changes the model at all", () => {
    const off = fingerprint({ ...COUPLE, spouse: { ...COUPLE.spouse, enabled: false } });
    const on  = fingerprint(COUPLE);
    expect(Math.round(on)).not.toBe(Math.round(off));
  });

  test("the spouse's own benefit moves the result", () => {
    const a = fingerprint(COUPLE);
    const b = fingerprint({ ...COUPLE, spouse: { ...COUPLE.spouse, ssb: 20_000 } });
    expect(Math.round(a)).not.toBe(Math.round(b));
  });

  test("the higher earner's PIA moves the result via the spousal top-up", () => {
    // The top-up is 50% of the HIGHER earner's PIA, so raising the primary's PIA
    // must raise household SS even though the primary's own benefit is unchanged.
    // If this passes only because ssb changed, the top-up is not really wired.
    const a = fingerprint({ ...COUPLE, ssPia: 30_000 });
    const b = fingerprint({ ...COUPLE, ssPia: 60_000 });
    expect(Math.round(a)).not.toBe(Math.round(b));
  });

  test("spouse.enabled = false reproduces the single-person result exactly", () => {
    // Regression lock: every existing profile must be untouched by this feature.
    const single = fingerprint(BASE);
    const disabled = fingerprint({
      ...BASE, ssPia: 30_000,
      spouse: { enabled: false, ssb: 99_000, ssAge: 62, ssPia: 99_000 },
    });
    expect(Math.round(disabled)).toBe(Math.round(single));
  });

  // ── spouse.dob (§24) ──────────────────────────────────────────────────────
  // The field that puts the spouse on their own clock. It must move the model:
  // if it does not, the engines are still gating the spouse's benefit on the
  // PRIMARY's age, which is the bug it was added to fix.
  test("spouse.dob moves the result — a younger spouse claims LATER", () => {
    const primaryDob = `${new Date().getFullYear() - 60}-01-01`;
    const sameAge = fingerprint({
      ...COUPLE, dob: primaryDob,
      spouse: { ...COUPLE.spouse, dob: primaryDob },
    });
    const tenYearsYounger = fingerprint({
      ...COUPLE, dob: primaryDob,
      spouse: { ...COUPLE.spouse, dob: `${new Date().getFullYear() - 50}-01-01` },
    });
    expect(Math.round(sameAge)).not.toBe(Math.round(tenYearsYounger));
    // And the direction must be right: a younger spouse's benefit starts later,
    // so the household receives LESS Social Security over the plan and ends with
    // a smaller portfolio. A test that only asserts "different" would pass with
    // the sign inverted.
    expect(tenYearsYounger).toBeLessThan(sameAge);
  });

  test("a missing spouse.dob is treated as same-age, not as NaN", () => {
    const primaryDob = `${new Date().getFullYear() - 60}-01-01`;
    const blank = fingerprint({
      ...COUPLE, dob: primaryDob,
      spouse: { ...COUPLE.spouse, dob: "" },
    });
    const sameAge = fingerprint({
      ...COUPLE, dob: primaryDob,
      spouse: { ...COUPLE.spouse, dob: primaryDob },
    });
    expect(Number.isFinite(blank)).toBe(true);
    expect(Math.round(blank)).toBe(Math.round(sameAge));
  });
});

// ─── Equity glidepath (highest-value fixture from NEEDS_A_TARGETED_FIXTURE) ───
// preRetireEq/postRetireEq set the stock/bond mix before and after retirement and
// feed expectedReturn() inside runMC's portReturn(). They drive the return on the
// whole portfolio, so a fault here would skew EVERY success rate in the product —
// which is why this was the first deferred fixture worth writing. The waterfall
// fingerprint could not see them (it takes `gr` directly), so they are tested
// against runMC.
describe("equity glidepath reaches runMC", () => {
  // Retire in the future so BOTH sides of the glidepath get exercised: currentAge
  // 60 vs retireAge 70 means ten pre-retirement years, then twenty post.
  const GLIDE = { ...BASE, currentAge: 60, retireAge: 70, endAge: 90 };
  const mcEnd = (p) => {
    const r = runMC(p, p.endAge, 150, 42, true);
    const last = r.pcts?.[r.pcts.length - 1];
    return `${r.rate}|${last?.p50}`;
  };

  test("preRetireEq changes the outcome", () => {
    expect(mcEnd({ ...GLIDE, preRetireEq: 90 })).not.toBe(mcEnd({ ...GLIDE, preRetireEq: 40 }));
  });

  test("postRetireEq changes the outcome", () => {
    expect(mcEnd({ ...GLIDE, postRetireEq: 80 })).not.toBe(mcEnd({ ...GLIDE, postRetireEq: 30 }));
  });

  test("more equity raises the median outcome (direction, not just difference)", () => {
    // Guards against the fields being READ but wired backwards — a plain
    // "these differ" assertion would pass either way. Same seed throughout, so the
    // market draws are identical and only the weighting changes.
    const p50 = (eq) => {
      const r = runMC({ ...GLIDE, preRetireEq: eq, postRetireEq: eq }, GLIDE.endAge, 150, 42, true);
      return r.pcts?.[r.pcts.length - 1]?.p50 ?? 0;
    };
    expect(p50(85)).toBeGreaterThan(p50(25));
  });
});

// ─── glidepathSwitchAge (REQUIREMENTS §26) ───────────────────────────────────
// Two defects motivated this field, and both are guarded here.
//
// (A) THE BUG. runMC computes the equity weight in TWO places: portReturn, which
//     switched at the retirement age, and the seqOverride branch — the one every
//     Stress Test scenario runs through — which switched at a HARDCODED 62. The
//     same function modelled two different investors depending on which branch
//     produced the year. The same literal was also in the deterministic schedule,
//     buildRothExplorer and buildConversionLadder.
//
// (B) THE FEATURE. The switch was welded to retireAge, so "stay 90/10 until 67
//     even though I retire at 62" was inexpressible. When you de-risk and when
//     you stop working are different decisions.
//
// Both now resolve through engine/glidepath.js. Note what the fix does NOT do:
// it does not make the stress and normal paths produce the same NUMBERS. They
// consume the RNG differently (the stress branch prescribes the equity leg and
// draws only the bond leg), so the paths legitimately diverge. What must hold is
// that they use the same equity WEIGHT at each age — enforced below by proving
// the stress path honours the field at all, which the hardcoded 62 could not.
describe("glidepathSwitchAge — one switch age, honoured by every engine", () => {
  // Retire at 70 so a switch age set LATER (75) lands inside the drawdown years
  // the stress sequence overrides. This is the shape the old hardcoded 62 could
  // not represent: at 62 every one of these ages is already "post-retirement".
  const LATE = { ...BASE, currentAge: 60, retireAge: 70, endAge: 90, preRetireEq: 90, postRetireEq: 40 };
  const mcPrint = (p) => {
    const r = runMC(p, p.endAge, 120, 42, true);
    return `${r.rate}|${r.pcts?.[r.pcts.length - 1]?.p50}`;
  };
  const stressPrint = (p) => {
    const r = runStress(p, p.endAge, 120, 99);
    return `${r.rate}|${r.pcts?.[r.pcts.length - 1]?.p50}`;
  };
  const detPrint = (p) => {
    const { schedule, portAtRetire } = simulateDeterministicWithStrategy(p, p.inf, "gk");
    return `${portAtRetire}|${schedule[schedule.length - 1]?.portfolioEnd}`;
  };

  test("the resolver: explicit value wins, else retireAge, else the legacy 62", () => {
    expect(resolveGlidepathSwitchAge({ glidepathSwitchAge: 67, retireAge: 62 })).toBe(67);
    expect(resolveGlidepathSwitchAge({ glidepathSwitchAge: null, retireAge: 62 })).toBe(62);
    expect(resolveGlidepathSwitchAge({ retireAge: 58 })).toBe(58);
    expect(resolveGlidepathSwitchAge({})).toBe(LEGACY_GLIDEPATH_SWITCH_AGE);
  });

  test("switch age 67 with retireAge 62 keeps the PRE-retirement weight through 66", () => {
    const sw = resolveGlidepathSwitchAge({ glidepathSwitchAge: 67, retireAge: 62 });
    for (let age = 62; age <= 66; age++) {
      expect(glidepathEqPct(age, 90, 40, sw)).toBe(90);
    }
    // The switch age itself is the FIRST year at the post-retirement mix.
    expect(glidepathEqPct(67, 90, 40, sw)).toBe(40);
    expect(glidepathEqPct(68, 90, 40, sw)).toBe(40);
  });

  test("REGRESSION LOCK: null reproduces the retireAge behaviour exactly, in all three engines", () => {
    // The whole point of defaulting to null: every existing saved plan must be
    // byte-identical until the user touches the field.
    expect(mcPrint({ ...LATE, glidepathSwitchAge: null })).toBe(mcPrint({ ...LATE, glidepathSwitchAge: LATE.retireAge }));
    expect(stressPrint({ ...LATE, glidepathSwitchAge: null })).toBe(stressPrint({ ...LATE, glidepathSwitchAge: LATE.retireAge }));
    expect(detPrint({ ...LATE, glidepathSwitchAge: null })).toBe(detPrint({ ...LATE, glidepathSwitchAge: LATE.retireAge }));
  });

  test("THE BUG: the stress path honours the switch age (it used to hardcode 62)", () => {
    // With the hardcoded 62 these two were identical — every age in the drawdown
    // was past 62, so the stress branch pinned the whole run to postRetireEq no
    // matter what the user set. This is the assertion that would have caught it.
    expect(stressPrint({ ...LATE, glidepathSwitchAge: 75 }))
      .not.toBe(stressPrint({ ...LATE, glidepathSwitchAge: null }));
  });

  test("runMC and the deterministic schedule both honour it too", () => {
    expect(mcPrint({ ...LATE, glidepathSwitchAge: 75 })).not.toBe(mcPrint({ ...LATE, glidepathSwitchAge: null }));
    expect(detPrint({ ...LATE, glidepathSwitchAge: 75 })).not.toBe(detPrint({ ...LATE, glidepathSwitchAge: null }));
  });

  test("direction: staying at the higher equity weight longer grows the portfolio more", () => {
    // Guards against the field being read but applied backwards — "they differ"
    // alone would pass either way. preRetireEq 90 vs postRetireEq 40, same seed,
    // so only the length of the aggressive phase changes.
    const end = (switchAge) => {
      const { schedule } = simulateDeterministicWithStrategy({ ...LATE, glidepathSwitchAge: switchAge }, LATE.inf, "gk");
      return schedule[schedule.length - 1]?.portfolioEnd ?? 0;
    };
    expect(end(80)).toBeGreaterThan(end(null));
  });
});

/**
 * Healthcare shock params — live in runMC, deliberately NOT in the plan.
 *
 * These four were one of the original four ghost settings this file exists to
 * catch, so exempting them from the generic sweep without proof would re-open
 * exactly the hole the file was written to close. v1.2.55 removed them from both
 * DETERMINISTIC engines on purpose (see NEEDS_A_TARGETED_FIXTURE above); this
 * block proves they still reach the engine that is supposed to price risk.
 */
describe("healthcare shock params reach runMC", () => {
  const HC = {
    ...BASE,
    // Spend hard enough that a shock can actually break a path — otherwise the
    // success rate pins at 100% and no shock setting can move it.
    sp: 150_000,
    hcShockAge: 72, hcProb: 5, hcMin: 70_000, hcMax: 130_000,
  };
  const rate = (over) => runMC({ ...HC, ...over }, 92, 1500, 42, true).rate;

  test("hcProb moves the success rate", () => {
    expect(rate({ hcProb: 40 })).toBeLessThan(rate({ hcProb: 0 }));
  });

  test("hcMin / hcMax move the success rate", () => {
    expect(rate({ hcMin: 300_000, hcMax: 500_000 })).toBeLessThan(rate({}));
  });

  test("hcShockAge moves the success rate", () => {
    // Shocks starting at 65 hit more years than shocks starting at 85.
    expect(rate({ hcShockAge: 65 })).toBeLessThan(rate({ hcShockAge: 85 }));
  });

  test("and they are NOT charged to the deterministic plan", () => {
    // The other half of the contract. If a future change re-charges them, the
    // withdrawal schedule silently stops being enactable again.
    const calm  = buildWithdrawalWaterfall({ ...HC, hcProb: 0 });
    const rough = buildWithdrawalWaterfall({ ...HC, hcProb: 40, hcMin: 300_000, hcMax: 500_000 });
    expect(rough.smart.rows.at(-1).totalPort).toBe(calm.smart.rows.at(-1).totalPort);
  });
});
