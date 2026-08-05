/**
 * earlyWithdrawal.js — IRC §72(t) 10% additional tax on early distributions.
 *
 * WHY THIS EXISTS
 * ---------------
 * Neither withdrawal engine charged the 10% penalty on a pre-tax distribution
 * before age 59½. The smart waterfall would happily draw from an IRA to fill the
 * 12%/22% bracket for a 56-year-old and bill income tax only, understating the
 * real cost of those dollars by a tenth. For anyone modeling retirement before
 * 59½ that is not a rounding error — it is a recommendation that is wrong.
 *
 * WHAT IS AND IS NOT A "DISTRIBUTION"
 * -----------------------------------
 * A Roth CONVERSION is not subject to the 10% penalty. It is taxable as ordinary
 * income but it is not an early distribution — the money never leaves the
 * retirement system. So `convAmt` is NOT part of the penalty base.
 *
 * But pre-tax dollars used to PAY the conversion tax never make it into the Roth,
 * which makes them an ordinary early distribution — penalty and all. That is
 * exactly why paying conversion tax out of pre-tax is such a poor choice under
 * 59½, and the engine must show it. `convTaxFromPretax` IS part of the base.
 *
 * (Separately, converted dollars WITHDRAWN within five years carry their own
 * penalty under the conversion 5-year rule, IRC §408A(d)(3)(F). That is modeled
 * in rothConversionPlan.js's checkRothWithdrawalPenalty, not here.)
 */

/** IRC §72(t)(1) additional tax rate. */
export const EARLY_PENALTY_RATE = 0.10;
/** Distributions on or after this age are never subject to §72(t)(1). */
export const EARLY_PENALTY_AGE = 59.5;
/** Separation must occur in or after the year the employee turns this age. */
export const RULE_OF_55_MIN_AGE = 55;
/** §72(t)(4): a SEPP must run at least this many years. */
export const SEPP_MIN_YEARS = 5;

/**
 * Does the SEPARATION DATE qualify for the Rule of 55?
 *
 * §72(t)(2)(A)(v) turns on separation from service "after attainment of age 55",
 * which the IRS applies by CALENDAR YEAR: separation in or after the year the
 * employee turns 55 qualifies. Someone who leaves in January while still 54 and
 * turns 55 that October is covered.
 *
 * This existed only as `retireAge >= 55`, which is a stricter rule than the law.
 * It denied the exception to every plan whose separation age rounds to 54 —
 * charging a 10% penalty on years 54 to 59.5 that the taxpayer does not owe. On a
 * mostly-pre-tax portfolio that is a large, entirely fictional cost. The constant
 * above always described the correct rule; only the comparison was wrong.
 *
 * Uses the app's own year convention: separationYear = thisYear + (retireAge -
 * currentAge), matching how every engine derives calendar years from ages.
 *
 * Falls back to `retireAge >= 55` when the birth year is unknown. That is the
 * conservative direction — it can under-claim the exception but never invent it —
 * and it reproduces the previous behaviour exactly for profiles without a DOB.
 */
export function ruleOf55SeparationQualifies({
  dob, birthYear, currentAge, retireAge, asOfYear,
} = {}) {
  if (!Number.isFinite(retireAge)) return false;
  let by = Number.isFinite(birthYear) ? birthYear : null;
  if (by == null && typeof dob === "string" && dob.length >= 4) {
    const parsed = parseInt(dob.slice(0, 4), 10);
    if (Number.isFinite(parsed)) by = parsed;
  }
  if (by == null || !Number.isFinite(currentAge)) {
    return retireAge >= RULE_OF_55_MIN_AGE;
  }
  const nowYear = Number.isFinite(asOfYear) ? asOfYear : new Date().getFullYear();
  const separationYear = nowYear + (retireAge - currentAge);
  return separationYear >= by + RULE_OF_55_MIN_AGE;
}

/**
 * Does this profile hold a former-employer plan that could qualify for the
 * Rule of 55? The account model has no 401k/IRA subtype — only a free-text
 * `name` — so detection is name-based by design. A user who files a rollover
 * IRA under the name "401k" will get the wrong answer, which is an accepted
 * tradeoff rather than a new required field on every account.
 *
 * @param {Array} accounts
 * @returns {{ hasEmployerPlan: boolean, employerPlanBalance: number,
 *             pretaxBalance: number, share: number, matches: string[] }}
 */
export function detectEmployerPlan(accounts = []) {
  // 401(k) / 401k / 403(b) / 457 — the plan types §72(t)(2)(A)(v) reaches.
  const RE = /\b(401\s*\(?\s*k\s*\)?|403\s*\(?\s*b\s*\)?|457)\b/i;
  let employerPlanBalance = 0, pretaxBalance = 0;
  const matches = [];
  for (const a of accounts) {
    if (a?.category !== "pretax") continue;
    const bal = a.balance || 0;
    pretaxBalance += bal;
    if (RE.test(a.name || "")) {
      employerPlanBalance += bal;
      matches.push(a.name);
    }
  }
  return {
    hasEmployerPlan: employerPlanBalance > 0,
    employerPlanBalance,
    pretaxBalance,
    // Fraction of pre-tax money sitting in an employer plan. The engines track a
    // single aggregated `pretax` bucket, so a Rule-of-55 exemption can only be
    // applied pro-rata — there is no per-account draw to attribute.
    share: pretaxBalance > 0 ? employerPlanBalance / pretaxBalance : 0,
    matches,
  };
}

/**
 * The age a SEPP started at `startAge` may first be stopped safely.
 *
 * §72(t)(4) "recapture": payments must continue for the LONGER of five years or
 * until age 59½. Stopping earlier retroactively penalizes every prior payment,
 * with interest — which is why the series start age is a real planning input and
 * not a checkbox.
 */
export function seppMustRunUntil(startAge) {
  return Number.isFinite(startAge)
    ? Math.max(startAge + SEPP_MIN_YEARS, EARLY_PENALTY_AGE)
    : null;
}

/** Is a SEPP running in this year? (Exempts that year's distributions.) */
export function seppActive(age, startAge) {
  return Number.isFinite(age) && Number.isFinite(startAge) && age >= startAge;
}

/**
 * The §72(t)(1) additional tax on this year's pre-tax distributions.
 *
 * @param {object}  o
 * @param {number}  o.age                 age during the distribution year
 * @param {number}  o.pretaxDistribution  pre-tax dollars actually distributed
 *                                        (spending draw + RMD + pre-tax-funded
 *                                        conversion tax; NOT the conversion itself)
 * @param {boolean} o.ruleOf55            user asserts a former-employer plan,
 *                                        separated in/after the year they turned 55
 * @param {number}  o.ruleOf55Share       fraction of pre-tax in that plan (0..1)
 * @param {number}  o.retireAge           separation age — Rule of 55 needs ≥ 55
 * @param {boolean} o.sepp72t             a §72(t) SEPP is running
 * @param {number}  o.sepp72tStartAge     age the series began
 * @returns {{ penalty: number, exemptAmount: number, reason: string }}
 */
export function earlyWithdrawalPenalty({
  age,
  pretaxDistribution = 0,
  ruleOf55 = false,
  ruleOf55Share = 0,
  retireAge = null,
  separationQualifies = undefined,
  sepp72t = false,
  sepp72tStartAge = null,
} = {}) {
  if (!(pretaxDistribution > 0) || !Number.isFinite(age)) {
    return { penalty: 0, exemptAmount: 0, reason: "" };
  }
  if (age >= EARLY_PENALTY_AGE) {
    return { penalty: 0, exemptAmount: pretaxDistribution, reason: "age 59.5+" };
  }

  // A running SEPP exempts the whole distribution — the series IS the exception.
  if (sepp72t && seppActive(age, sepp72tStartAge)) {
    return {
      penalty: 0,
      exemptAmount: pretaxDistribution,
      reason: `72(t) SEPP active since age ${sepp72tStartAge} — must continue to age ${seppMustRunUntil(sepp72tStartAge)}`,
    };
  }

  // Rule of 55 reaches only the separated employer's plan, never an IRA, and only
  // if separation happened in or after the year the employee turned 55. Applied
  // pro-rata: the engines hold one aggregated pre-tax bucket.
  // `separationQualifies` carries the calendar-year test (see
  // ruleOf55SeparationQualifies). When a caller does not supply it we fall back to
  // the old age comparison, which keeps every existing caller and fixture
  // behaving exactly as before — but it is STRICTER than the law, so engines
  // should pass it.
  const separationOk = typeof separationQualifies === "boolean"
    ? separationQualifies
    : (Number.isFinite(retireAge) && retireAge >= RULE_OF_55_MIN_AGE);
  const ruleOf55Applies = ruleOf55 && separationOk && ruleOf55Share > 0;
  const exemptShare = ruleOf55Applies ? Math.min(1, Math.max(0, ruleOf55Share)) : 0;
  const exemptAmount = pretaxDistribution * exemptShare;
  const taxableBase = pretaxDistribution - exemptAmount;
  const penalty = Math.round(taxableBase * EARLY_PENALTY_RATE);

  let reason;
  if (penalty <= 0 && exemptShare >= 1) reason = "Rule of 55 — former-employer plan";
  else if (exemptShare > 0) {
    reason = `Rule of 55 covers ${Math.round(exemptShare * 100)}% (employer plan); ` +
      `the IRA remainder is penalized`;
  } else {
    reason = `under 59.5 — 10% early-distribution tax`;
  }
  return { penalty, exemptAmount: Math.round(exemptAmount), reason };
}
