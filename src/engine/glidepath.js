/**
 * Equity glidepath switch age — SINGLE SOURCE OF TRUTH.
 *
 * The portfolio holds `preRetireEq` % equity up to a switch age and
 * `postRetireEq` % from that age on. Which age that is used to be answered in
 * five different places, and they did not agree:
 *
 *   - `portReturn` (App.jsx)                 → the user's retirement age  ✅
 *   - `runMC`'s stress-sequence branch       → a hardcoded 62             ❌
 *   - `simulateDeterministicWithStrategy`    → a hardcoded 62             ❌
 *   - `buildRothExplorer`                    → a hardcoded 62             ❌
 *   - `buildConversionLadder`                → a hardcoded 62             ❌
 *
 * So the SAME profile was modelled as two different investors depending on
 * which engine (or which branch of one engine) produced the number: every
 * Stress Test scenario de-risked a 67-year-old retiree five years early, and
 * the deterministic table disagreed with the Monte Carlo it sits next to.
 *
 * Separately, welding the switch to `retireAge` makes one common plan
 * inexpressible: "stay 90/10 until 67, even though I retire at 62". When you
 * de-risk and when you stop working are different decisions — a bridge job, a
 * pension, or plain risk tolerance all justify staying aggressive past
 * retirement. `glidepathSwitchAge` is that separate control.
 *
 * Default is null → falls back to `retireAge`, so every existing plan is
 * unchanged until the user sets the field.
 */

// Pre-v1.2.45 behaviour, kept ONLY for a caller that supplies neither a switch
// age nor a retirement age. Every engine call site passes a retirement age, so
// this is unreachable in the app — it exists so a bare-object unit test can't
// produce NaN comparisons (`age < undefined` is always false, which would
// silently pin the portfolio to postRetireEq).
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
 * Equity allocation IN PERCENT (0–100) for a given age. The one place the `<`
 * comparison lives, so no call site can drift on whether the switch year itself
 * is pre or post: the switch age is the FIRST year at the post-retirement mix.
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
