/**
 * survivorBenefit.js — the survivor (widow/widower) benefit, and the one
 * place Social Security gives a claimant real strategic flexibility.
 *
 * The widow's-penalty work modeled the benefit side as max(ownCheck,
 * deceasedCheck) from the death year. That's the right shape — "the
 * household loses the smaller check" — but as a dollar amount it was wrong
 * in two opposite directions at once:
 *
 *   1. Overstated for a survivor below survivor FRA. It paid 100% of the
 *      deceased's check the moment they died. A survivor claiming at 62
 *      actually gets about 81%; at 60, 71.5%. The reduction is permanent.
 *   2. Understated badly when the deceased died before claiming. The
 *      inherited check was gated on the deceased's own claim age, so it paid
 *      $0 until the year they would have filed. In reality the survivor
 *      benefit derives from the deceased's PIA and is claimable from 60
 *      whether or not the deceased ever filed. That's exactly the
 *      early-death case this feature exists to explore, so it was wrong in
 *      the worst possible place.
 *
 * Those don't cancel out — they hit different households.
 *
 * The rules (constants cited in TAX_REFERENCE.md → "Survivor benefits"):
 *
 * - Survivor benefits start at 60; an own retirement benefit can't start
 *   before 62.
 * - Deemed filing does not apply to survivor benefits. The own benefit and
 *   the survivor benefit are independent — claim either first, switch to the
 *   other later. This is the only place in Social Security where that's
 *   true, and it's why "take the reduced survivor benefit at 60 and let my
 *   own grow to 70" (or the reverse) is a real decision worth modeling.
 * - Claiming a survivor benefit before survivor FRA reduces it permanently:
 *   71.5% at 60, rising linearly to 100% at survivor FRA.
 * - Survivor FRA is not retirement FRA (66 to 67 on a different schedule).
 * - A survivor benefit stops growing at survivor FRA — no reason to delay
 *   past it, unlike an own benefit, which grows to 70.
 * - The deceased's delayed retirement credits do pass through. (The spousal
 *   top-up is the opposite: 50% of PIA, no DRCs. Don't mix these up.)
 *
 * Not modeled on purpose: the earnings test ($1 per $2 above $24,480 under
 * FRA). The engine doesn't model wage income at all, so there's nothing to
 * withhold against.
 */

/** Earliest possible survivor claim (SSA). Own retirement benefit is 62. */
export const SURVIVOR_MIN_CLAIM_AGE = 60;

/** Reduction floor: a survivor claiming at exactly 60 receives 71.5%. */
export const SURVIVOR_MIN_FACTOR = 0.715;

/**
 * Survivor full retirement age by birth year — TAX_REFERENCE.md → "Survivor
 * benefits". Kept as a fractional age (66 + n/12) on purpose rather than
 * rounded: the reduction is computed in months, and rounding 66+8mo to 67
 * would misprice every early claim for anyone born 1957-1961.
 */
export function survivorFra(birthYear) {
  const by = Number(birthYear);
  if (!Number.isFinite(by) || by <= 0) return 67;   // safe default: the modern value
  if (by <= 1956) return 66;
  if (by >= 1962) return 67;
  const monthsByYear = { 1957: 2, 1958: 4, 1959: 6, 1960: 8, 1961: 10 };
  return 66 + (monthsByYear[by] || 0) / 12;
}

/**
 * Permanent reduction factor applied to a survivor benefit claimed at claimAge.
 *
 * Straight line from SURVIVOR_MIN_FACTOR at 60 to 1.0 at survivor FRA, flat
 * at 1.0 after — a survivor benefit earns nothing by waiting past its own FRA.
 *
 * @param {number} claimAge     age the survivor claims the SURVIVOR benefit
 * @param {number} survivorFraAge  from survivorFra(birthYear)
 * @returns {number} 0.715 … 1.0
 */
export function survivorReductionFactor(claimAge, survivorFraAge) {
  const a = Number(claimAge);
  const fra = Number(survivorFraAge);
  if (!Number.isFinite(a) || !Number.isFinite(fra) || fra <= SURVIVOR_MIN_CLAIM_AGE) return 1;
  if (a >= fra) return 1;                                  // no delay credit past FRA
  if (a <= SURVIVOR_MIN_CLAIM_AGE) return SURVIVOR_MIN_FACTOR;
  const span = fra - SURVIVOR_MIN_CLAIM_AGE;
  const waited = a - SURVIVOR_MIN_CLAIM_AGE;
  return SURVIVOR_MIN_FACTOR + (1 - SURVIVOR_MIN_FACTOR) * (waited / span);
}

/**
 * The survivor benefit basis — 100% of what the deceased was receiving or was
 * entitled to, before any early-claim reduction.
 *
 * deceasedHadClaimed decides which figure applies, and getting this wrong was
 * exactly the bug this function was written to kill:
 *   - had claimed: their actual check, DRCs included (delaying raises this)
 *   - had not claimed: their PIA / full-retirement amount. Not zero.
 *     Eligibility doesn't depend on the deceased having filed.
 *
 * @param {object} a
 * @param {number} a.deceasedCheck  their claimed annual benefit (0 if never claimed)
 * @param {number} a.deceasedPia    their annual FRA/PIA amount
 * @param {boolean} a.deceasedHadClaimed
 */
export function survivorBasis({ deceasedCheck = 0, deceasedPia = 0, deceasedHadClaimed = false }) {
  if (deceasedHadClaimed && deceasedCheck > 0) return deceasedCheck;
  // Fall back to the check only if no PIA was given — better than returning 0,
  // which was the bug. The UI asks for both, so PIA is normally present.
  return deceasedPia > 0 ? deceasedPia : deceasedCheck;
}

/**
 * Resolve the survivor's claim age.
 *
 * Can't be earlier than 60, can't precede the death. If a user leaves it
 * blank we assume they claim as soon as they're able — which is what
 * actually happens when a household needs the income, and matches what the
 * old max(...) assumed implicitly.
 *
 * @param {number|null} requested       user-entered survivor claim age
 * @param {number} survivorAgeAtDeath   the survivor's own age when the death occurs
 */
export function resolveSurvivorClaimAge(requested, survivorAgeAtDeath) {
  const earliest = Math.max(SURVIVOR_MIN_CLAIM_AGE, Number(survivorAgeAtDeath) || 0);
  const r = Number(requested);
  if (!Number.isFinite(r) || r <= 0) return earliest;
  return Math.max(earliest, r);
}

/**
 * What the survivor actually receives in the year they are survivorAge.
 *
 * Returns both candidate benefits and which one gets paid, because the
 * household receives the larger of the two claimed — never the sum — and the
 * UI needs to show why a number changed in a given year. Reporting only the
 * total is how "the components don't add up to the total" complaints happen.
 *
 * Since deemed filing doesn't apply, ownClaimAge and survivorClaimAge are
 * independent, and that's the whole switching strategy: claim one early, let
 * the other grow, take whichever is larger once both are available.
 *
 * @returns {{own: number, survivor: number, paid: number, source: "own"|"survivor"|"none"}}
 */
export function survivorYearBenefit({
  survivorAge,
  ownClaimAge,
  ownBenefitAtClaim = 0,
  survivorClaimAge,
  survivorBasisAtFra = 0,
  survivorFraAge = 67,
  cola = 0,
}) {
  const g = 1 + (Number(cola) || 0);
  const own = (survivorAge >= ownClaimAge && ownBenefitAtClaim > 0)
    ? ownBenefitAtClaim * Math.pow(g, survivorAge - ownClaimAge)
    : 0;

  let survivor = 0;
  if (survivorAge >= survivorClaimAge && survivorBasisAtFra > 0) {
    const factor = survivorReductionFactor(survivorClaimAge, survivorFraAge);
    survivor = survivorBasisAtFra * factor * Math.pow(g, survivorAge - survivorClaimAge);
  }

  // You don't collect both. SSA pays the own benefit plus the excess of the
  // survivor benefit over it, which nets to the larger of the two.
  const paid = Math.max(own, survivor);
  const source = paid <= 0 ? "none" : (survivor > own ? "survivor" : "own");
  return { own, survivor, paid, source };
}
