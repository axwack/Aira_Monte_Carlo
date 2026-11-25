export const SURVIVOR_MIN_CLAIM_AGE = 60;

export const SURVIVOR_MIN_FACTOR = 0.715;

export function survivorFra(birthYear) {
  const by = Number(birthYear);
  if (!Number.isFinite(by) || by <= 0) return 67;
  if (by <= 1956) return 66;
  if (by >= 1962) return 67;
  const monthsByYear = { 1957: 2, 1958: 4, 1959: 6, 1960: 8, 1961: 10 };
  return 66 + (monthsByYear[by] || 0) / 12;
}

export function survivorReductionFactor(claimAge, survivorFraAge) {
  const a = Number(claimAge);
  const fra = Number(survivorFraAge);
  if (!Number.isFinite(a) || !Number.isFinite(fra) || fra <= SURVIVOR_MIN_CLAIM_AGE) return 1;
  if (a >= fra) return 1;
  if (a <= SURVIVOR_MIN_CLAIM_AGE) return SURVIVOR_MIN_FACTOR;
  const span = fra - SURVIVOR_MIN_CLAIM_AGE;
  const waited = a - SURVIVOR_MIN_CLAIM_AGE;
  return SURVIVOR_MIN_FACTOR + (1 - SURVIVOR_MIN_FACTOR) * (waited / span);
}

export function survivorBasis({ deceasedCheck = 0, deceasedPia = 0, deceasedHadClaimed = false }) {
  if (deceasedHadClaimed && deceasedCheck > 0) return deceasedCheck;
  return deceasedPia > 0 ? deceasedPia : deceasedCheck;
}

export function resolveSurvivorClaimAge(requested, survivorAgeAtDeath) {
  const earliest = Math.max(SURVIVOR_MIN_CLAIM_AGE, Number(survivorAgeAtDeath) || 0);
  const r = Number(requested);
  if (!Number.isFinite(r) || r <= 0) return earliest;
  return Math.max(earliest, r);
}

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

  const paid = Math.max(own, survivor);
  const source = paid <= 0 ? "none" : (survivor > own ? "survivor" : "own");
  return { own, survivor, paid, source };
}
