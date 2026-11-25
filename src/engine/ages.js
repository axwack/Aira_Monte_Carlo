export function parseCalendarDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(value);
}

export function ageFromDob(dob, asOf) {
  if (!dob) return null;
  try {
    const d = parseCalendarDate(dob);
    const ref = asOf ? parseCalendarDate(asOf) : new Date();
    if (!d || !ref || isNaN(d.getTime()) || isNaN(ref.getTime())) return null;
    let age = ref.getFullYear() - d.getFullYear();
    const m = ref.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
    return age;
  } catch { return null; }
}

export function personAgeNow({ dob, currentAge, birthYear } = {}, asOf) {
  const fromDob = ageFromDob(dob, asOf);
  if (fromDob != null && Number.isFinite(fromDob)) return fromDob;
  if (typeof currentAge === "number" && currentAge > 0) return currentAge;
  if (typeof birthYear === "number" && birthYear > 0) {
    const ref = asOf ? parseCalendarDate(asOf) : new Date();
    return ref.getFullYear() - birthYear;
  }
  return null;
}

export function personsAtLeastAge(age, spouseAge, mfj, minAge) {
  const selfQualifies = age >= minAge ? 1 : 0;
  if (!mfj) return selfQualifies;
  if (spouseAge == null || !Number.isFinite(spouseAge)) {
    return selfQualifies ? 2 : 0;
  }
  return selfQualifies + (spouseAge >= minAge ? 1 : 0);
}

export function spouseAgeOffset(p = {}, asOf) {
  const sp = p.spouse || {};
  const primary = personAgeNow(p, asOf);
  const spouse  = personAgeNow(sp, asOf);
  if (primary == null || spouse == null) return 0;
  const off = primary - spouse;
  return Number.isFinite(off) ? off : 0;
}

export function spouseDeathOnPrimaryClock(p, asOf) {
  return firstDeathOnPrimaryClock(p, asOf);
}

export function firstToDie(p) {
  return (p?.spouse?.firstToDie === "primary") ? "primary" : "spouse";
}

export function survivorIsPrimary(p) {
  return firstToDie(p) !== "primary";
}

export function firstDeathOnPrimaryClock(p, asOf) {
  const sp = p?.spouse || {};
  if (!sp.enabled) return Infinity;
  const deathAge = Number(sp.deathAge);
  if (!(deathAge > 0)) return Infinity;
  return survivorIsPrimary(p) ? deathAge + spouseAgeOffset(p, asOf) : deathAge;
}

export function survivorAgeOnPrimaryClock(p, primaryAge, asOf) {
  if (survivorIsPrimary(p)) return primaryAge;
  return primaryAge - spouseAgeOffset(p, asOf);
}

export function planEndAgeOnPrimaryClock(p, endAge, asOf) {
  const end = Number(endAge);
  if (!Number.isFinite(end)) return endAge;
  if (survivorIsPrimary(p)) return end;
  const death = firstDeathOnPrimaryClock(p, asOf);
  if (!Number.isFinite(death)) return end;
  const extended = end + spouseAgeOffset(p, asOf);
  return Math.max(Math.ceil(death), Math.round(extended));
}

export function filesJointlyAt(p, primaryAge, asOf) {
  if ((p?.filingStatus || "mfj") === "single") return false;
  return primaryAge <= spouseDeathOnPrimaryClock(p, asOf);
}

export function filingStatusAt(p, primaryAge, asOf) {
  return filesJointlyAt(p, primaryAge, asOf) ? "mfj" : "single";
}

export function spouseAgeAt(p, primaryAge, asOf) {
  const sp = p?.spouse || {};
  if (!sp.enabled) return null;
  if (personAgeNow(sp, asOf) == null) return null;
  const at = primaryAge - spouseAgeOffset(p, asOf);
  return Number.isFinite(at) ? at : null;
}

export function contribStopOnPrimaryClock(p, asOf) {
  const sp = p?.spouse || {};
  if (!sp.enabled) return Infinity;
  const stop = Number(sp.retireAge);
  if (!Number.isFinite(stop) || stop <= 0) return Infinity;
  return stop + spouseAgeOffset(p, asOf);
}
