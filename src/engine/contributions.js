import { contribStopOnPrimaryClock } from "./ages.js";

/**
 * contributions.js — one home for "who is still contributing this year" (§24.1).
 *
 * WHY THIS IS A MODULE AND NOT THREE COPIES
 * -----------------------------------------
 * Three separate loops add contributions during accumulation — `runMC` and
 * `simulateDeterministicWithStrategy` in App.jsx, and `accumulateToRetirement`
 * in buildWithdrawalWaterfall.js. Cross-engine drift between exactly those three
 * is the most repeated defect class in this codebase (the VPW formula was wrong
 * in two of them; `taxFunding` was read by none). A per-person stop date is
 * precisely the kind of rule that gets fixed in one loop and forgotten in the
 * others, so it lives here and all three call it.
 *
 * SCOPE: job-bound streams only — the 401(k)/403(b)/457(b) deferral, the
 * employer match, and the Roth IRA. Those stop when that person stops working.
 *
 * Deliberately NOT here:
 *   • Brokerage / after-tax savings — household money with no employment link
 *     and no statutory cap. Splitting it would be data entry with no effect.
 *   • HSA — its stop rule is Medicare enrolment (65), not retirement, and the
 *     limit is family-coverage rather than per person. Each engine keeps its
 *     existing HSA handling untouched; this module must not change it.
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
 * The caller's loop bound already stops the PRIMARY at their own retirement
 * (accYrs = retireAge - currentAge), so this only has to decide the spouse.
 *
 * A spouse retiring AFTER the primary is therefore clamped by that same loop
 * bound — Phase A does not model contributions past the primary's retirement
 * date, because the retirement loop has no concept of them. That is exactly the
 * pre-feature behaviour, so it is not a regression; it is a disclosed limit.
 */
export function jobContributionsForYear(p = {}, primaryAge) {
  const sp = p.spouse || {};
  // `contribStopOnPrimaryClock` returns Infinity when the spouse is disabled or
  // has no explicit retireAge, so this reduces to "always on" — which, with a
  // spouse whose contribution fields default to 0, reproduces the old numbers.
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
 * Household annual total across every stream, for DISPLAY and for the
 * "total savings" figures. Takes the same per-year view as the engines so a
 * headline number can never claim a stream the simulation has already stopped.
 *
 * `primaryAge` omitted ⇒ "as of today", i.e. both people still contributing,
 * which is what a static summary card wants.
 */
export function householdAnnualContribution(p = {}, primaryAge) {
  const age = Number.isFinite(primaryAge) ? primaryAge : (p.currentAge ?? 0);
  const { pretax, roth } = jobContributionsForYear(p, age);
  const hsa = p.hsaContrib != null ? p.hsaContrib : (p.hsaMonthly || 0) * 12;
  return pretax + roth + hsa + (p.taxableContrib || 0);
}

/**
 * Rough annualized retirement income for DISPLAY (Profile "Money In" subtitle).
 *
 * Sums the recurring streams that show up while retired: Social Security (primary
 * + spouse FRA when enabled), blanket rental, and every entry under Other
 * Incomes (monthly pensions and non-pension streams — both are `.annual` in that
 * store). Deliberately excludes one-off cashFlowEvents (an inheritance is not a
 * per-year figure) and skips reliability discounts / growth / start-year gating.
 * The subtitle needs a snapshot of "what this step contains", not an engine
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
