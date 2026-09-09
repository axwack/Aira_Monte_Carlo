import { contribStopOnPrimaryClock } from "./ages.js";

/**
 * contributions.js — one home for "who is still contributing this year."
 *
 * Three separate loops add contributions during accumulation — runMC and
 * simulateDeterministicWithStrategy in App.jsx, and accumulateToRetirement in
 * buildWithdrawalWaterfall.js. Drift between exactly those three is the most
 * repeated bug in this codebase (the VPW formula was wrong in two of them,
 * taxFunding was read by none). A per-person stop date is exactly the kind of
 * rule that gets fixed in one loop and forgotten in the others, so it lives
 * here and all three call it.
 *
 * Scope: job-bound streams only — the 401(k)/403(b)/457(b) deferral, the
 * employer match, and the Roth IRA. Those stop when that person stops working.
 *
 * Not here on purpose:
 *   - Brokerage / after-tax savings — household money, no employment link, no
 *     statutory cap. Splitting it out would be data entry with no effect.
 *   - HSA — its stop rule is Medicare enrollment (65), not retirement, and the
 *     limit is family-coverage, not per person. Each engine's existing HSA
 *     handling stays untouched; this module doesn't change it.
 */

/**
 * The household's job-bound contributions for ONE accumulation year, by
 * destination bucket.
 *
 * @param {object} p          profile/params (needs contrib, employerContrib,
 *                            rothContrib, and optionally spouse{})
 * @param {number} primaryAge the PRIMARY's age during this accumulation year —
 *                            the clock every engine loop already walks
 * @returns {{pretax:number, roth:number, spouseActive:boolean}}
 *
 * The caller's loop bound already stops the primary at their own retirement
 * (accYrs = retireAge - currentAge), so this only has to decide the spouse.
 *
 * A spouse retiring after the primary is clamped by that same loop bound —
 * we don't model contributions past the primary's retirement date, since the
 * retirement loop has no concept of them. That's a known limit, not a bug.
 */
export function jobContributionsForYear(p = {}, primaryAge) {
  const sp = p.spouse || {};
  // contribStopOnPrimaryClock returns Infinity when the spouse is disabled or
  // has no explicit retireAge, so this just means "always on" — which, with a
  // spouse whose contribution fields default to 0, gives the same old numbers.
  const spouseActive = !!sp.enabled
    && Number.isFinite(primaryAge)
    && primaryAge < contribStopOnPrimaryClock(p);

  const pretax = (p.contrib || 0) + (p.employerContrib || 0)
    + (spouseActive ? (sp.contrib || 0) + (sp.employerContrib || 0) : 0);
  const roth = (p.rothContrib || 0)
    + (spouseActive ? (sp.rothContrib || 0) : 0);

  return { pretax, roth, spouseActive };
}

/**
 * Household annual total across every stream, for display and for the
 * "total savings" figures. Takes the same per-year view as the engines so a
 * headline number can't claim a stream the simulation already stopped.
 *
 * primaryAge omitted = "as of today," both people still contributing, which
 * is what a static summary card wants.
 */
export function householdAnnualContribution(p = {}, primaryAge) {
  const age = Number.isFinite(primaryAge) ? primaryAge : (p.currentAge ?? 0);
  const { pretax, roth } = jobContributionsForYear(p, age);
  const hsa = p.hsaContrib != null ? p.hsaContrib : (p.hsaMonthly || 0) * 12;
  return pretax + roth + hsa + (p.taxableContrib || 0);
}

/**
 * Rough annualized retirement income for display (Profile "Money In" subtitle).
 *
 * Sums the recurring streams that show up while retired: Social Security
 * (primary + spouse FRA when enabled), blanket rental, and every entry under
 * Other Incomes (both pension and non-pension streams store `.annual`).
 * Skips one-off cashFlowEvents on purpose (an inheritance isn't a per-year
 * figure) and skips reliability discounts / growth / start-year gating — the
 * subtitle just needs a snapshot of what's in this step, not an engine
 * projection.
 */
export function totalRetirementIncome(p = {}) {
  const ss = Number(p.ssb) || 0;
  const spouseSs = p.spouse && p.spouse.enabled
    ? (Number(p.spouse.ssPia) || 0) * 12
    : 0;
  const rental = Number(p.ab) || 0;
  const otherIncomes = (p.otherIncomes || []).reduce(
    (sum, x) => sum + (Number(x && x.annual) || 0),
    0,
  );
  return ss + spouseSs + rental + otherIncomes;
}
