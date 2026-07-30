/**
 * survivorBenefit.js — the survivor (widow/widower) benefit, and the one place
 * where Social Security gives a claimant real strategic flexibility.
 *
 * WHY THIS FILE EXISTS
 *
 * v1.2.63 shipped §22's widow's penalty and modelled the benefit side as
 * `max(ownCheck, deceasedCheck)` from the death year. That captures "the household
 * loses the smaller check", which is the right shape, but as a dollar amount it was
 * wrong in two opposite directions at once:
 *
 *   1. OVERSTATED for a survivor below survivor FRA. It paid 100% of the deceased's
 *      check the moment they died. A survivor claiming at 62 actually receives about
 *      81%; at 60, 71.5%. The reduction is permanent.
 *   2. UNDERSTATED — badly — when the deceased died before claiming. The inherited
 *      check was gated on the deceased's own claim age, so it paid $0 until the year
 *      they *would* have filed. In reality the survivor benefit derives from the
 *      deceased's PIA and is claimable from 60 regardless of whether the deceased
 *      ever filed. That is exactly the early-death case the feature exists to
 *      explore, so it was wrong in the worst possible place.
 *
 * Those do not cancel out — they hit different households.
 *
 * THE RULES (all constants cited in TAX_REFERENCE.md → "Survivor benefits")
 *
 * • Survivor benefits start at 60; an OWN retirement benefit cannot start before 62.
 * • DEEMED FILING DOES NOT APPLY to survivor benefits. The own benefit and the
 *   survivor benefit are INDEPENDENT: claim either first, switch to the other later.
 *   This is the only place in Social Security where that is true, and it is why
 *   "take the reduced survivor benefit at 60 and let my own grow to 70" — or the
 *   reverse — is a real decision worth modelling.
 * • Claiming a survivor benefit before survivor FRA reduces it permanently, 71.5% at
 *   60 rising linearly to 100% at survivor FRA.
 * • Survivor FRA is NOT retirement FRA (66 → 67 on a different schedule).
 * • A survivor benefit stops growing at survivor FRA. There is never a reason to
 *   delay past it — unlike an own benefit, which grows to 70.
 * • The deceased's delayed retirement credits DO pass through. (The spousal top-up
 *   is the opposite: 50% of PIA, no DRCs. Don't mix the two up.)
 *
 * NOT MODELLED, deliberately: the earnings test ($1 per $2 above $24,480 under FRA).
 * The engine models no wage income at all, so there is nothing to withhold against.
 * See REQUIREMENTS §30.
 */

/** Earliest possible survivor claim (SSA). Own retirement benefit is 62. */
export const SURVIVOR_MIN_CLAIM_AGE = 60;

/** Reduction floor: a survivor claiming at exactly 60 receives 71.5%. */
export const SURVIVOR_MIN_FACTOR = 0.715;

/**
 * Survivor full retirement age by birth year — TAX_REFERENCE.md → "Survivor
 * benefits". Deliberately a fractional age (66 + n/12) rather than rounded: the
 * reduction is computed over MONTHS, and rounding 66+8mo to 67 would misprice
 * every early claim for anyone born 1957–1961.
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
 * Permanent reduction factor applied to a survivor benefit claimed at `claimAge`.
 *
 * Straight line from SURVIVOR_MIN_FACTOR at 60 to 1.0 at survivor FRA, and flat at
 * 1.0 thereafter — a survivor benefit earns nothing by waiting past its own FRA.
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
 * ENTITLED to, before any early-claim reduction.
 *
 * `deceasedHadClaimed` decides which figure applies, and getting this wrong is the
 * defect this function was written to kill:
 *   • had claimed  → their actual check, DRCs included (delaying raises this)
 *   • had NOT claimed → their PIA / full-retirement amount. NOT zero. Eligibility
 *     does not depend on the deceased having filed.
 *
 * @param {object} a
 * @param {number} a.deceasedCheck  their claimed annual benefit (0 if never claimed)
 * @param {number} a.deceasedPia    their annual FRA/PIA amount
 * @param {boolean} a.deceasedHadClaimed
 */
export function survivorBasis({ deceasedCheck = 0, deceasedPia = 0, deceasedHadClaimed = false }) {
  if (deceasedHadClaimed && deceasedCheck > 0) return deceasedCheck;
  // Fall back to the check only if no PIA was collected — better than returning 0,
  // which is the bug. The UI asks for both, so PIA is normally present.
  return deceasedPia > 0 ? deceasedPia : deceasedCheck;
}

/**
 * Resolve the survivor's claim age.
 *
 * Cannot be earlier than 60, and cannot precede the death. A user who leaves it
 * blank is assumed to claim as soon as they are able — which is what actually
 * happens when a household needs the income, and is the same assumption the old
 * `max(...)` made implicitly.
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
 * What the survivor actually receives in the year they are `survivorAge`.
 *
 * Returns BOTH candidate benefits and which one is paid, because the household
 * receives the larger of the two it has claimed — never the sum — and the UI has to
 * be able to show WHY a number changed in a given year. Reporting only the total is
 * how "the components don't add up to the total" complaints happen.
 *
 * Because deemed filing does not apply, `ownClaimAge` and `survivorClaimAge` are
 * independent, and that is the whole switching strategy: claim one early, let the
 * other grow, take whichever is larger once both are available.
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

  // You do not collect both. SSA pays the own benefit plus the excess of the
  // survivor benefit over it, which nets to the larger of the two.
  const paid = Math.max(own, survivor);
  const source = paid <= 0 ? "none" : (survivor > own ? "survivor" : "own");
  return { own, survivor, paid, source };
}
