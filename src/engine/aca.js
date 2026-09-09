/**
 * ACA Premium Tax Credit model.
 *
 * In the pre-Medicare bridge years (retireAge to 64) a lot of early retirees
 * buy insurance on the ACA marketplace, where the subsidy shrinks as MAGI
 * rises. The conversion planner already caps against tax brackets and IRMAA,
 * but IRMAA doesn't start until 63 — so for a 55-year-old the real constraint
 * is the ACA subsidy, and the engine couldn't see it. It would happily
 * recommend a conversion that destroyed more subsidy than it saved in tax.
 *
 * The benchmark (second-lowest-cost Silver) premium varies by state, by ~500
 * sub-state rating areas, by age and tobacco use, and gets republished every
 * year. Hardcoding it nationally would be a big dataset that's stale within a
 * year — and we don't actually need it for the parts that matter. Given
 *
 *     PTC = max(0, benchmark − applicablePct(MAGI/FPL) × MAGI)
 *
 * the marginal subsidy lost per extra dollar of MAGI only depends on the
 * applicable-percentage schedule, and the cliff sits at 400% FPL, which only
 * depends on household size and state. The benchmark premium just scales the
 * magnitude, and that's one user-entered number.
 *
 * So: no premium database, one profile field defaulted from an age curve.
 *
 * Constants come from TAX_REFERENCE.md → "ACA Premium Tax Credit". Exported
 * individually so tests can check them against the documented table instead
 * of against a copy of the implementation.
 */

/** 2025 HHS poverty guidelines — used for the 2026 coverage year. */
export const FPL_BASE_YEAR = 2025;
export const FPL_TABLE = {
  contiguous: { first: 15_650, additional: 5_500 },
  AK:         { first: 19_550, additional: 6_870 },
  HI:         { first: 17_990, additional: 6_320 },
};

/**
 * Applicable-percentage bands. Each entry is [fplLowerPct, fplUpperPct, pctAtLower,
 * pctAtUpper]; the percentage moves linearly across the band — that's how the
 * statute defines it. A step function would invent cliffs that aren't real and
 * make the "marginal cost of the next dollar" number meaningless.
 */
export const ACA_BANDS_ENHANCED = [   // ARPA/IRA regime — no cliff
  [0,   150, 0.000, 0.000],
  [150, 200, 0.000, 0.020],
  [200, 250, 0.020, 0.040],
  [250, 300, 0.040, 0.060],
  [300, 400, 0.060, 0.085],
  [400, Infinity, 0.085, 0.085],
];

export const ACA_BANDS_STATUTORY = [  // pre-ARPA shape — cliff above 400%
  [0,   133, 0.0210, 0.0210],
  [133, 150, 0.0314, 0.0419],
  [150, 200, 0.0419, 0.0660],
  [200, 250, 0.0660, 0.0844],
  [250, 300, 0.0844, 0.0996],
  [300, 400, 0.0996, 0.0996],
];

/** Below this share of FPL, Medicaid generally applies and PTC is unavailable. */
export const MEDICAID_FLOOR_PCT = 100;
export const CLIFF_PCT = 400;

/** Federal poverty level for a household. `state` only matters for AK and HI. */
export function federalPovertyLevel(householdSize, state = null, year = FPL_BASE_YEAR, inflationPct = 2.5) {
  const size = Math.max(1, Math.floor(Number(householdSize) || 1));
  const key = state === "AK" ? "AK" : state === "HI" ? "HI" : "contiguous";
  const { first, additional } = FPL_TABLE[key];
  const base = first + additional * (size - 1);
  // Indexed forward from the published year rather than hardcoding future tables.
  const yrs = Math.max(0, (Number(year) || FPL_BASE_YEAR) - FPL_BASE_YEAR);
  return base * Math.pow(1 + (inflationPct || 0) / 100, yrs);
}

/** Applicable percentage at a given % of FPL, interpolated within its band. */
export function applicablePercentage(fplPct, cliffReturns = true) {
  const bands = cliffReturns ? ACA_BANDS_STATUTORY : ACA_BANDS_ENHANCED;
  if (cliffReturns && fplPct > CLIFF_PCT) return null;   // null = no credit at all
  for (const [lo, hi, pLo, pHi] of bands) {
    if (fplPct >= lo && fplPct <= hi) {
      if (!Number.isFinite(hi) || hi === lo) return pHi;
      const t = (fplPct - lo) / (hi - lo);
      return pLo + t * (pHi - pLo);
    }
  }
  // Above the last band with no cliff (enhanced regime) — flat top rate.
  const last = bands[bands.length - 1];
  return last[3];
}

/**
 * The subsidy for one year.
 *
 * @returns {{
 *   ptc: number,              // annual premium tax credit, dollars
 *   fpl: number,              // this household's federal poverty level
 *   fplPct: number,           // MAGI as a % of FPL
 *   applicablePct: number|null,
 *   eligible: boolean,
 *   reason: string,           // why not eligible, when applicable
 *   overCliff: boolean,
 *   netPremium: number,       // what the household actually pays
 * }}
 */
export function computeAcaSubsidy({
  magi,
  householdSize = 1,
  state = null,
  benchmarkPremium = 0,
  year = FPL_BASE_YEAR + 1,
  cliffReturns = true,
  inflationPct = 2.5,
} = {}) {
  const m   = Math.max(0, Number(magi) || 0);
  const bp  = Math.max(0, Number(benchmarkPremium) || 0);
  const fpl = federalPovertyLevel(householdSize, state, year, inflationPct);
  const fplPct = fpl > 0 ? (m / fpl) * 100 : 0;

  const base = { fpl, fplPct, netPremium: bp, ptc: 0, applicablePct: null, eligible: false, reason: "", overCliff: false };

  // Below 100% FPL the household is generally Medicaid-eligible and gets no PTC.
  // Report this instead of silently zeroing it — a retiree keeping income low
  // on purpose can genuinely hit this and should be told.
  if (fplPct < MEDICAID_FLOOR_PCT) {
    return { ...base, reason: "below_medicaid_floor" };
  }

  const pct = applicablePercentage(fplPct, cliffReturns);
  if (pct === null) {
    return { ...base, reason: "over_cliff", overCliff: true };
  }

  const applicableAmount = pct * m;
  const ptc = Math.max(0, bp - applicableAmount);
  return {
    ...base,
    ptc,
    applicablePct: pct,
    eligible: ptc > 0,
    reason: ptc > 0 ? "" : "premium_below_contribution",
    netPremium: Math.max(0, bp - ptc),
  };
}

/**
 * MAGI headroom before the subsidy takes a real hit — what the conversion sizer
 * needs.
 *
 * Under the statutory regime the cliff is real: the ceiling is exactly 400%
 * FPL, one dollar over costs the whole remaining credit. Under the enhanced
 * regime there's no cliff, so there's no hard ceiling to give back — the cost
 * is smooth, and the caller should price it with marginalSubsidyCost() instead
 * of capping. Returning Infinity there is intentional: inventing a ceiling the
 * law doesn't have would under-convert for no reason.
 */
export function acaMagiCeiling({ householdSize = 1, state = null, year = FPL_BASE_YEAR + 1, cliffReturns = true, inflationPct = 2.5 } = {}) {
  if (!cliffReturns) return Infinity;
  return federalPovertyLevel(householdSize, state, year, inflationPct) * (CLIFF_PCT / 100);
}

/**
 * Subsidy lost by adding `delta` of MAGI — the actual marginal cost of the
 * next conversion dollar, which is what `conversionRoomAllCliffs` needs.
 * Computed by differencing the real subsidy rather than differentiating the
 * schedule, so a band boundary or the cliff gets captured exactly.
 */
export function marginalSubsidyCost(params, delta = 1000) {
  const before = computeAcaSubsidy(params);
  const after  = computeAcaSubsidy({ ...params, magi: (Number(params?.magi) || 0) + delta });
  const lost   = Math.max(0, before.ptc - after.ptc);
  return {
    subsidyLost: lost,
    costPerDollar: delta > 0 ? lost / delta : 0,
    crossesCliff: !before.overCliff && after.overCliff,
    before, after,
  };
}
