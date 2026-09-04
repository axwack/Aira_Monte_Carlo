/**
 * mcSelectors.js — the ONE place any surface reads a dollar figure out of a
 * runMC() result. Pure, dependency-free (no React, no App.jsx internals) so
 * App.jsx, the rules engine, the score explainer, and the printable report
 * can all import it directly without a circular import back into App.jsx.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Reported 2026-09-04: the same run, same age, showed two different median
 * portfolio values in two tabs (~1.9x apart). Investigating turned up FOUR
 * independent reimplementations of "look up the simulated portfolio value at
 * age X" across the codebase (App.jsx's NetWorthTab, MCTab's hero card and
 * its termAt() helper, the Checkpoints table) plus THREE MORE once an
 * eslint rule (no-restricted-properties on mc.pcts/mc.term, see .eslintrc.json)
 * was pointed at the rest of src/: engine/explainScore.js, engine/rulesEngine.js,
 * and report/PrintReport.jsx. Every one disagreed on at least one of: whether
 * to deflate for the Real $ toggle, which aggregate to trust (mc.term vs the
 * matching row in mc.pcts), or how to treat missing data (several used `|| 0`,
 * silently turning "no figure for this age" into a confident $0).
 *
 * Route every new "show a simulated portfolio value" UI through
 * selectPortfolioAtAge() instead of touching `mc.pcts` / `mc.term` directly.
 * See CLAUDE.md rule 8 and src/noRawMcAccess.test.js (App.jsx's own guard)
 * plus the `no-restricted-properties` ESLint rule (all of src/).
 */

// Real $ restates every figure in the purchasing power of the FIRST SIMULATED
// RETIREMENT YEAR — not of today. deflate() discounts row i by (1+inf)^i and
// row 0 IS retirement, so that is what the numbers have always meant.
//
// That is deliberate, and it matches the engine's own inputs: the spend figure
// the user types is consumed as-is in retirement year one (runMC, `y === 0`) and
// is never inflated forward from today. Balances and spending therefore share
// one yardstick, and the pre-retirement years stay what they are — a forecast of
// how big the pile gets, not a claim about what a dollar buys along the way.
export const dollarBasisLabel = (useReal) =>
  useReal ? "Today's Dollars" : "Future Dollars";

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

/**
 * The Monte Carlo median portfolio for one age, or `null` when there is no
 * figure for that age.
 *
 * `null`, never 0. The Net Worth chart used to do:
 *
 *   const pctIndex = Math.min(age - retireAge, pcts.length - 1);
 *   port = pcts[pctIndex]?.p50 || 0;
 *
 * which produced a confident $0 in three unrelated situations — genuinely zero,
 * no data for this age, and NaN (falsy, so `|| 0` swallowed it). A user reported
 * a plan the engine scores at 99.2% success, median $4.05M at 68 and $10.9M at
 * 90, rendered as $0 from 68 through 90. Nothing on screen distinguished that
 * from a portfolio that had actually died.
 *
 * The clamp was the other half: `Math.min` repeated the final row for every age
 * past the end of the data, so a run whose horizon was shorter than `endAge`
 * grew a flat tail of fabricated years — which the "net worth at age" card then
 * reported as a forecast.
 *
 * Rows are matched on the `age` they carry themselves, falling back to
 * positional arithmetic only for older result objects that predate that field.
 * Positional indexing silently mis-aligns whenever `mc` is stale — computed at a
 * different retireAge than the one now being charted.
 *
 * @param {Array<{age?:number, p50:number}>} pcts  runMC's percentile rows
 * @param {number} age                             the age wanted
 * @param {number} retireAge                       fallback origin for legacy rows
 * @param {"p10"|"p25"|"p50"|"p75"|"p90"} [pct]     which percentile column (default p50/median)
 * @returns {number|null}
 */
export function mcMedianAtAge(pcts, age, retireAge, pct = "p50") {
  if (!Array.isArray(pcts) || pcts.length === 0) return null;
  let row = pcts.find((d) => d && d.age === age);
  if (!row && !Number.isFinite(pcts[0]?.age)) {
    // Legacy rows without `age`: derive the index, but do NOT clamp — an index
    // past the end means "not modelled", which is exactly what null says.
    const i = age - retireAge;
    row = i >= 0 && i < pcts.length ? pcts[i] : null;
  }
  return row && Number.isFinite(row[pct]) ? row[pct] : null;
}

/**
 * THE single place any UI reads "the simulated portfolio value at age X" from
 * an `mc` (runMC) result. See this file's header comment for why it exists.
 *
 * @param {object} mc            runMC's result (or null/undefined — returns null)
 * @param {number} age           the age wanted
 * @param {object} [opts]
 * @param {number}  opts.retireAge  fallback origin for legacy rows without `age`
 * @param {boolean} [opts.real=false]  true = deflate to the retirement-year basis
 *   ("Today's Dollars" — see deflate()'s own doc comment for why the anchor is
 *   the retirement year, not today). Only meaningful with `opts.inf` set.
 * @param {number}  [opts.inf=0]     inflation rate (%), used only when real=true
 * @param {"p10"|"p25"|"p50"|"p75"|"p90"} [opts.pct="p50"]
 * @returns {number|null}
 */
export function selectPortfolioAtAge(mc, age, { retireAge, real = false, inf = 0, pct = "p50" } = {}) {
  // eslint-disable-next-line no-restricted-properties -- this IS the selector; see this file's header.
  if (!mc?.pcts) return null;
  // eslint-disable-next-line no-restricted-properties -- this IS the selector; see this file's header.
  const pcts = real ? deflate(mc.pcts, inf, true) : mc.pcts;
  return mcMedianAtAge(pcts, age, retireAge, pct);
}
