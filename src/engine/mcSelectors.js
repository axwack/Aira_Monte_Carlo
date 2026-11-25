const numericOrNaN = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

const isPlausibleYear = (y) => Number.isFinite(y) && y >= 1900 && y <= 2200;

export function retirementBasisYear(currentAge, retireAge, currentYear) {
  const year = numericOrNaN(currentYear);
  const ret = numericOrNaN(retireAge);
  if (!Number.isFinite(year) || !Number.isFinite(ret)) return null;
  const cur = numericOrNaN(currentAge);
  const basis = Math.round(year + Math.max(0, ret - (Number.isFinite(cur) ? cur : ret)));
  return isPlausibleYear(basis) ? basis : null;
}

export const dollarBasisLabel = (useReal, basisYear) => {
  if (!useReal) return "Future dollars";
  const year = numericOrNaN(basisYear);
  return isPlausibleYear(year) ? `${Math.round(year)} dollars` : "Retirement-year dollars";
};

export function deflate(data, inf, useReal) {
  if (!useReal) return data;
  return data.map((d, i) => ({
    ...d,
    p10: Math.round(d.p10 / Math.pow(1 + inf / 100, i)),
    p25: Math.round(d.p25 / Math.pow(1 + inf / 100, i)),
    p50: Math.round(d.p50 / Math.pow(1 + inf / 100, i)),
    p75: Math.round(d.p75 / Math.pow(1 + inf / 100, i)),
    p90: Math.round(d.p90 / Math.pow(1 + inf / 100, i)),
  }));
}

export function mcMedianAtAge(pcts, age, retireAge, pct = "p50") {
  if (!Array.isArray(pcts) || pcts.length === 0) return null;
  let row = pcts.find((d) => d && d.age === age);
  if (!row && !Number.isFinite(pcts[0]?.age)) {
    const i = age - retireAge;
    row = i >= 0 && i < pcts.length ? pcts[i] : null;
  }
  return row && Number.isFinite(row[pct]) ? row[pct] : null;
}

export function selectPortfolioAtAge(mc, age, { retireAge, real = false, inf = 0, pct = "p50" } = {}) {
  // eslint-disable-next-line no-restricted-properties -- this IS the selector; see this file's header.
  if (!mc?.pcts) return null;
  // eslint-disable-next-line no-restricted-properties -- this IS the selector; see this file's header.
  const pcts = real ? deflate(mc.pcts, inf, true) : mc.pcts;
  return mcMedianAtAge(pcts, age, retireAge, pct);
}

export function pctRowIndexAtAge(pcts, age, retireAge) {
  if (!Array.isArray(pcts) || pcts.length === 0) return -1;
  const byAge = pcts.findIndex((d) => d && d.age === age);
  if (byAge >= 0) return byAge;
  if (!Number.isFinite(pcts[0]?.age) && Number.isFinite(age) && Number.isFinite(retireAge)) {
    const i = age - retireAge;
    return i >= 0 && i < pcts.length ? i : -1;
  }
  return -1;
}

export function selectTerminalMeanAtAge(mc, age, { retireAge, real = false, inf = 0 } = {}) {
  // eslint-disable-next-line no-restricted-properties -- this IS the selector; see this file's header.
  const mean = mc?.term?.mean;
  if (!Number.isFinite(mean)) return null;
  if (!real) return mean;
  // eslint-disable-next-line no-restricted-properties -- this IS the selector; see this file's header.
  const i = pctRowIndexAtAge(mc?.pcts, age, retireAge);
  if (i < 0) return mean;
  return Math.round(mean / Math.pow(1 + inf / 100, i));
}
