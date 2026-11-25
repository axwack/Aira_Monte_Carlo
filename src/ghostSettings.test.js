import { BLANK_PROFILE, runMC, runStress, simulateDeterministicWithStrategy, SAMPLE_START_YEAR, SAMPLE_END_YEAR } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { resolveGlidepathSwitchAge, glidepathEqPct, LEGACY_GLIDEPATH_SWITCH_AGE } from "./engine/glidepath.js";

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
  taxableYieldPct: 2.0,
  taxableYieldOrdinaryPct: 50,
  preRetireEq: 91,
  postRetireEq: 70,
  accounts: [
    { id: "g1", category: "pretax",  name: "401k",    balance: 1_200_000 },
    { id: "g2", category: "roth",    name: "Roth",    balance:   250_000 },
    { id: "g3", category: "taxable", name: "Taxable", balance:   400_000 },
    { id: "g4", category: "cash",    name: "Cash",    balance:   150_000 },
  ],
};

const INERT_BY_DESIGN = {
  name:                 "display only — report cover, not a calculation input",
  dobIsEstimate:        "display only — labels the sidebar countdown as approximate; the dob itself still drives the engines",
  b1Years:              "Buckets tab runway target; no engine reads it (see v1.2.129)",
  b2Years:              "Buckets tab runway target; no engine reads it (see v1.2.129)",
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
  real:                 "UI toggle: render figures in today's dollars. Presentation only.",
  tax:                  "UI toggle: show/hide the tax overlay. Presentation only.",
  portfolioGoal:        "Action Plan progress target; compared against, never fed in",
  earlyRetireTarget:    "Action Plan target age; compared against, never fed in",
  abReliability:        "stochastic (runMC-only) by design; see REQUIREMENTS §13.2 #11",
  ssTorpedoGuard:       "flags the landmine; does not alter draws",
};

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
  preRetireEq:             "runMC-only; proven by the equity glidepath block below",
  postRetireEq:            "runMC-only; proven by the equity glidepath block below",
  port:                    "waterfall derives balances from accounts[], not port",
  rothEmergencyReserve:    "this fixture never draws Roth, so the floor never binds",
  useAb:                   "gates rental; ab is already non-zero here",
  useJointRmdTable:        "needs a fixture that reaches RMD age with the joint gate open",
  ssPia:                   "only read when spouse.enabled; see the spousal SS block below",
  spouse:                  "object; exercised directly by the spousal SS block below (incl. dob, deathAge, survivorClaimAge, survivorBenefitAtClaim) and the per-person contributions block in contributions.test.js",
  glidepathSwitchAge:      "null by default; proven by the equity glidepath block below",
  ruleOf55:                "needs retireAge < 59.5; proven in earlyWithdrawal.test.js",
  sepp72t:                 "needs retireAge < 59.5; proven in earlyWithdrawal.test.js",
  sepp72tStartAge:         "null by default; proven in earlyWithdrawal.test.js",
  hcShockAge:              "runMC-only since v1.2.55; proven by the healthcare block below",
  hcProb:                  "runMC-only since v1.2.55; proven by the healthcare block below",
  hcMin:                   "runMC-only since v1.2.55; proven by the healthcare block below",
  hcMax:                   "runMC-only since v1.2.55; proven by the healthcare block below",
  mcPaths:                 "runMC-only; proven by the MC sampling block below",
  mcRangeStart:            "runMC-only; proven by the MC sampling block below",
  mcRangeEnd:              "runMC-only; proven by the MC sampling block below",
};

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

function perturb(key, value) {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") {
    if (/age/i.test(key)) return value > 0 ? value + 2 : 65;
    if (value === 0) return 5_000;
    return Math.round(value * 1.5) + 1;
  }
  return undefined;
}

describe("no ghost settings — every profile field must reach an engine", () => {
  const candidates = Object.keys(BLANK_PROFILE).filter((k) => {
    if (k in INERT_BY_DESIGN) return false;
    if (k in NEEDS_A_TARGETED_FIXTURE) return false;
    const v = BASE[k];
    return typeof v === "boolean" || typeof v === "number";
  });

  test("the detector is actually examining a meaningful number of fields", () => {
    expect(candidates.length).toBeGreaterThan(15);
  });

  test.each(candidates)("changing '%s' changes what the engines compute", (key) => {
    const before = fingerprint(BASE);
    const changed = { ...BASE, [key]: perturb(key, BASE[key]) };
    const after = fingerprint(changed);

    expect(Math.round(after)).not.toBe(Math.round(before));
  });
});

describe("no ghost settings — string/enum fields", () => {
  const enumCases = [
    ["taxFunding", "from_taxable", "from_conv"],
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
    const a = fingerprint({ ...COUPLE, ssPia: 30_000 });
    const b = fingerprint({ ...COUPLE, ssPia: 60_000 });
    expect(Math.round(a)).not.toBe(Math.round(b));
  });

  test("spouse.enabled = false reproduces the single-person result exactly", () => {
    const single = fingerprint(BASE);
    const disabled = fingerprint({
      ...BASE, ssPia: 30_000,
      spouse: { enabled: false, ssb: 99_000, ssAge: 62, ssPia: 99_000 },
    });
    expect(Math.round(disabled)).toBe(Math.round(single));
  });

  test("spouse.survivorClaimAge moves the result once a death is modelled", () => {
    const primaryDob = `${new Date().getFullYear() - 62}-01-01`;
    const base = {
      ...COUPLE, dob: primaryDob,
      spouse: { ...COUPLE.spouse, dob: primaryDob, ssAge: 62, deathAge: 63 },
    };
    const early = fingerprint({ ...base, spouse: { ...base.spouse, survivorClaimAge: 60 } });
    const atFra = fingerprint({ ...base, spouse: { ...base.spouse, survivorClaimAge: 67 } });
    expect(Math.round(early)).not.toBe(Math.round(atFra));

    expect(early).toBeGreaterThan(atFra);
  });

  test("delaying to FRA collects MORE lifetime Social Security when the survivor benefit is the big one", () => {
    const { computeHouseholdSS } = require("./engine/buildRothExplorer.js");
    const primaryDob = `${new Date().getFullYear() - 62}-01-01`;
    const base = {
      ssCola: 0,
      dob: primaryDob,
      ssAge: 62, ssb: 9_000, ssPia: 9_000,
      spouse: {
        enabled: true, dob: primaryDob,
        ssAge: 62, ssb: 48_000, ssPia: 48_000,
        deathAge: 62,
      },
    };
    const lifetime = (claimAge) => {
      let total = 0;
      for (let age = 62; age <= 92; age++) {
        total += computeHouseholdSS(
          { ...base, spouse: { ...base.spouse, survivorClaimAge: claimAge } },
          age
        );
      }
      return total;
    };
    expect(lifetime(67)).toBeGreaterThan(lifetime(62));
    const at62 = computeHouseholdSS({ ...base, spouse: { ...base.spouse, survivorClaimAge: 62 } }, 62);
    expect(at62).toBeLessThan(48_000);
    expect(at62).toBeGreaterThan(48_000 * 0.715);
  });

  test("spouse.survivorBenefitAtClaim overrides the derived amount", () => {
    const primaryDob = `${new Date().getFullYear() - 62}-01-01`;
    const base = {
      ...COUPLE, dob: primaryDob,
      spouse: { ...COUPLE.spouse, dob: primaryDob, ssAge: 62, deathAge: 63 },
    };
    const derived = fingerprint(base);
    const quoted  = fingerprint({ ...base, spouse: { ...base.spouse, survivorBenefitAtClaim: 60_000 } });
    expect(Math.round(derived)).not.toBe(Math.round(quoted));
  });

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

describe("equity glidepath reaches runMC", () => {
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
    const p50 = (eq) => {
      const r = runMC({ ...GLIDE, preRetireEq: eq, postRetireEq: eq }, GLIDE.endAge, 150, 42, true);
      return r.pcts?.[r.pcts.length - 1]?.p50 ?? 0;
    };
    expect(p50(85)).toBeGreaterThan(p50(25));
  });
});

describe("glidepathSwitchAge — one switch age, honoured by every engine", () => {
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
    expect(glidepathEqPct(67, 90, 40, sw)).toBe(40);
    expect(glidepathEqPct(68, 90, 40, sw)).toBe(40);
  });

  test("REGRESSION LOCK: null reproduces the retireAge behaviour exactly, in all three engines", () => {
    expect(mcPrint({ ...LATE, glidepathSwitchAge: null })).toBe(mcPrint({ ...LATE, glidepathSwitchAge: LATE.retireAge }));
    expect(stressPrint({ ...LATE, glidepathSwitchAge: null })).toBe(stressPrint({ ...LATE, glidepathSwitchAge: LATE.retireAge }));
    expect(detPrint({ ...LATE, glidepathSwitchAge: null })).toBe(detPrint({ ...LATE, glidepathSwitchAge: LATE.retireAge }));
  });

  test("THE BUG: the stress path honours the switch age (it used to hardcode 62)", () => {
    expect(stressPrint({ ...LATE, glidepathSwitchAge: 75 }))
      .not.toBe(stressPrint({ ...LATE, glidepathSwitchAge: null }));
  });

  test("runMC and the deterministic schedule both honour it too", () => {
    expect(mcPrint({ ...LATE, glidepathSwitchAge: 75 })).not.toBe(mcPrint({ ...LATE, glidepathSwitchAge: null }));
    expect(detPrint({ ...LATE, glidepathSwitchAge: 75 })).not.toBe(detPrint({ ...LATE, glidepathSwitchAge: null }));
  });

  test("direction: staying at the higher equity weight longer grows the portfolio more", () => {
    const end = (switchAge) => {
      const { schedule } = simulateDeterministicWithStrategy({ ...LATE, glidepathSwitchAge: switchAge }, LATE.inf, "gk");
      return schedule[schedule.length - 1]?.portfolioEnd ?? 0;
    };
    expect(end(80)).toBeGreaterThan(end(null));
  });
});

describe("Monte Carlo sampling window and path count reach runMC", () => {
  const rate = (over, n = 800) => runMC({ ...BASE, ...over }, 92, n, 42, true);

  test("mcRangeStart / mcRangeEnd change which history is sampled", () => {
    const full   = rate({ mcRangeStart: SAMPLE_START_YEAR, mcRangeEnd: SAMPLE_END_YEAR });
    const modern = rate({ mcRangeStart: 1980, mcRangeEnd: SAMPLE_END_YEAR });
    const older  = rate({ mcRangeStart: SAMPLE_START_YEAR, mcRangeEnd: 1979 });
    expect(modern.term.p50 !== full.term.p50 || older.term.p50 !== full.term.p50).toBe(true);
  });

  test("mcPaths changes the sample size the engine reports back", () => {
    expect(runMC({ ...BASE, mcPaths: 900 }, 92, 900, 42, true).N).toBe(900);
    expect(runMC({ ...BASE, mcPaths: 300 }, 92, 300, 42, true).N).toBe(300);
  });

  test("an unset window is the full history — results identical to an explicit full range", () => {
    const unset = rate({});
    const explicitFull = rate({ mcRangeStart: SAMPLE_START_YEAR, mcRangeEnd: SAMPLE_END_YEAR });
    expect(explicitFull.rate).toBe(unset.rate);
    expect(explicitFull.term.p50).toBe(unset.term.p50);
  });

  test("and they are NOT read by the deterministic waterfall", () => {
    const a = buildWithdrawalWaterfall({ ...BASE, mcRangeStart: SAMPLE_START_YEAR, mcRangeEnd: SAMPLE_END_YEAR });
    const b = buildWithdrawalWaterfall({ ...BASE, mcRangeStart: 1990, mcRangeEnd: 2000, mcPaths: 500 });
    expect(b.smart.rows.at(-1).totalPort).toBe(a.smart.rows.at(-1).totalPort);
  });
});

describe("healthcare shock params reach runMC", () => {
  const HC = {
    ...BASE,
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
    expect(rate({ hcShockAge: 65 })).toBeLessThan(rate({ hcShockAge: 85 }));
  });

  test("and they are NOT charged to the deterministic plan", () => {
    const calm  = buildWithdrawalWaterfall({ ...HC, hcProb: 0 });
    const rough = buildWithdrawalWaterfall({ ...HC, hcProb: 40, hcMin: 300_000, hcMax: 500_000 });
    expect(rough.smart.rows.at(-1).totalPort).toBe(calm.smart.rows.at(-1).totalPort);
  });
});

describe("taxable yield tax drag (taxableYieldPct) reaches runMC", () => {
  const YT = {
    ...BASE,
    accounts: [
      { id: "yt1", category: "taxable", name: "Taxable", balance: 1_500_000 },
      { id: "yt2", category: "cash",    name: "Cash",    balance:   100_000 },
    ],
  };
  const median = (over) => runMC({ ...YT, ...over }, 92, 500, 42, true).term.p50;

  test("taxableYieldPct moves runMC's median terminal value", () => {
    expect(median({ taxableYieldPct: 4, taxableYieldOrdinaryPct: 60 }))
      .toBeLessThan(median({ taxableYieldPct: 0 }));
  });

  test("taxableYieldPct: 0 reproduces the same result as the default (regression lock)", () => {
    const { taxableYieldPct, taxableYieldOrdinaryPct, ...ytWithoutYield } = YT;
    expect(median({ taxableYieldPct: 0 })).toBe(runMC(ytWithoutYield, 92, 500, 42, true).term.p50);
  });
});
