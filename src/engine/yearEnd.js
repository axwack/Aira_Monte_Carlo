const DECEMBER = 11;

export function isYearEndWindow(now = new Date()) {
  return now.getMonth() === DECEMBER;
}

export function daysLeftInTaxYear(now = new Date()) {
  const end = new Date(now.getFullYear(), DECEMBER, 31, 23, 59, 59, 999);
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

export function yearEndTaxRoom(rows, { year, bracketCeiling, irmaaCeiling, filingStatus, target } = {}) {
  const row = (rows || []).find((r) => r.yr === year);
  if (!row) {
    return {
      hasData: false,
      reason: "no projected row for this year — AiRA does not model wage income, so it cannot see your current bracket while you are still working",
    };
  }
  const INFL_FACTOR_NOW = 1;
  const bracketTop = bracketCeiling(target, filingStatus, INFL_FACTOR_NOW);
  const irmaaTop   = irmaaCeiling(1, filingStatus, INFL_FACTOR_NOW);

  const taxableIncome = row.taxableIncome || 0;
  const magi = row.magi || 0;

  const bracketRoom = bracketTop === Infinity ? Infinity : Math.max(0, bracketTop - taxableIncome);
  const irmaaRoom   = Math.max(0, irmaaTop - magi);

  return {
    hasData: true,
    bracketTop, irmaaTop,
    taxableIncome, magi,
    bracketRoom,
    irmaaRoom,
    conversionRoom: Math.max(0, Math.min(bracketRoom, irmaaRoom)),
    bindingConstraint: irmaaRoom < bracketRoom ? "irmaa" : "bracket",
    alreadyConverted: row.conversionAmount || 0,
    marginalBracket: row.marginalBracket ?? null,
  };
}
