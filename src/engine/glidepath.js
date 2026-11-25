export const LEGACY_GLIDEPATH_SWITCH_AGE = 62;

export function resolveGlidepathSwitchAge(p = {}) {
  const explicit = Number(p.glidepathSwitchAge);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const retireAge = Number(p.retireAge);
  if (Number.isFinite(retireAge) && retireAge > 0) return retireAge;
  return LEGACY_GLIDEPATH_SWITCH_AGE;
}

export const GLIDEPATH_EQ_FALLBACK = { pre: 91, post: 70 };

export function glidepathEqPct(age, preRetireEq, postRetireEq, switchAge) {
  const pre = Number.isFinite(Number(preRetireEq)) ? Number(preRetireEq) : GLIDEPATH_EQ_FALLBACK.pre;
  const post = Number.isFinite(Number(postRetireEq)) ? Number(postRetireEq) : GLIDEPATH_EQ_FALLBACK.post;
  return age < switchAge ? pre : post;
}

export function glidepathEquityWeight(age, preRetireEq, postRetireEq, switchAge) {
  return glidepathEqPct(age, preRetireEq, postRetireEq, switchAge) / 100;
}
