export const FPL_BASE_YEAR = 2025;
export const FPL_TABLE = {
  contiguous: { first: 15_650, additional: 5_500 },
  AK:         { first: 19_550, additional: 6_870 },
  HI:         { first: 17_990, additional: 6_320 },
};

export const ACA_BANDS_ENHANCED = [
  [0,   150, 0.000, 0.000],
  [150, 200, 0.000, 0.020],
  [200, 250, 0.020, 0.040],
  [250, 300, 0.040, 0.060],
  [300, 400, 0.060, 0.085],
  [400, Infinity, 0.085, 0.085],
];

export const ACA_BANDS_STATUTORY = [
  [0,   133, 0.0210, 0.0210],
  [133, 150, 0.0314, 0.0419],
  [150, 200, 0.0419, 0.0660],
  [200, 250, 0.0660, 0.0844],
  [250, 300, 0.0844, 0.0996],
  [300, 400, 0.0996, 0.0996],
];

export const MEDICAID_FLOOR_PCT = 100;
export const CLIFF_PCT = 400;

export function federalPovertyLevel(householdSize, state = null, year = FPL_BASE_YEAR, inflationPct = 2.5) {
  const size = Math.max(1, Math.floor(Number(householdSize) || 1));
  const key = state === "AK" ? "AK" : state === "HI" ? "HI" : "contiguous";
  const { first, additional } = FPL_TABLE[key];
  const base = first + additional * (size - 1);
  const yrs = Math.max(0, (Number(year) || FPL_BASE_YEAR) - FPL_BASE_YEAR);
  return base * Math.pow(1 + (inflationPct || 0) / 100, yrs);
}

export function applicablePercentage(fplPct, cliffReturns = true) {
  const bands = cliffReturns ? ACA_BANDS_STATUTORY : ACA_BANDS_ENHANCED;
  if (cliffReturns && fplPct > CLIFF_PCT) return null;
  for (const [lo, hi, pLo, pHi] of bands) {
    if (fplPct >= lo && fplPct <= hi) {
      if (!Number.isFinite(hi) || hi === lo) return pHi;
      const t = (fplPct - lo) / (hi - lo);
      return pLo + t * (pHi - pLo);
    }
  }
  const last = bands[bands.length - 1];
  return last[3];
}

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

export function acaMagiCeiling({ householdSize = 1, state = null, year = FPL_BASE_YEAR + 1, cliffReturns = true, inflationPct = 2.5 } = {}) {
  if (!cliffReturns) return Infinity;
  return federalPovertyLevel(householdSize, state, year, inflationPct) * (CLIFF_PCT / 100);
}

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
