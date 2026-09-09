/**
 * Equity glidepath switch age — one source of truth.
 *
 * The portfolio holds preRetireEq% equity up to a switch age and postRetireEq%
 * after. That age used to be answered in five different places and they
 * didn't agree: portReturn used the user's actual retirement age, but runMC's
 * stress-sequence branch, simulateDeterministicWithStrategy, buildRothExplorer,
 * and buildConversionLadder all hardcoded 62. So the same profile got modeled
 * as two different investors depending on which engine produced the number —
 * every Stress Test scenario de-risked a 67-year-old five years early, and the
 * deterministic table disagreed with the Monte Carlo sitting right next to it.
 *
 * Separately, tying the switch to retireAge can't express a common plan: "stay
 * 90/10 until 67 even though I retire at 62." When you de-risk and when you
 * stop working are different decisions — a bridge job, a pension, or just risk
 * tolerance can justify staying aggressive past retirement. glidepathSwitchAge
 * is that separate control.
 *
 * Defaults to null, which falls back to retireAge, so no existing plan changes
 * until someone actually sets the field.
 */

// Old pre-existing behavior, kept only for a caller that gives neither a
// switch age nor a retirement age. Every real call site passes a retirement
// age so this never actually fires in the app — it's here so a bare-object
// unit test doesn't produce NaN comparisons (age < undefined is always false,
// which would silently pin the portfolio to postRetireEq).
export const LEGACY_GLIDEPATH_SWITCH_AGE = 62;

/**
 * @param {object} p — profile/params. Reads `glidepathSwitchAge` then `retireAge`.
 * @returns {number} the age at which the mix shifts from preRetireEq to postRetireEq.
 */
export function resolveGlidepathSwitchAge(p = {}) {
  const explicit = Number(p.glidepathSwitchAge);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const retireAge = Number(p.retireAge);
  if (Number.isFinite(retireAge) && retireAge > 0) return retireAge;
  return LEGACY_GLIDEPATH_SWITCH_AGE;
}

// Mirrors BLANK_PROFILE.preRetireEq / .postRetireEq in App.jsx.
export const GLIDEPATH_EQ_FALLBACK = { pre: 91, post: 70 };

/**
 * Equity allocation in percent (0-100) for a given age. The one place the `<`
 * comparison lives, so no call site can drift on whether the switch year
 * itself counts as pre or post — the switch age is the first year at the
 * post-retirement mix.
 */
export function glidepathEqPct(age, preRetireEq, postRetireEq, switchAge) {
  const pre = Number.isFinite(Number(preRetireEq)) ? Number(preRetireEq) : GLIDEPATH_EQ_FALLBACK.pre;
  const post = Number.isFinite(Number(postRetireEq)) ? Number(postRetireEq) : GLIDEPATH_EQ_FALLBACK.post;
  return age < switchAge ? pre : post;
}

/** Same thing as a 0–1 weight, for the bootstrap draw in portReturn. */
export function glidepathEquityWeight(age, preRetireEq, postRetireEq, switchAge) {
  return glidepathEqPct(age, preRetireEq, postRetireEq, switchAge) / 100;
}
