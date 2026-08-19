/**
 * ages.js — the ONE age/date implementation. Every engine and every view derives
 * age from here.
 *
 * Extracted from App.jsx in the spouse-DOB work (§24). It had to move because the
 * engines cannot import from App.jsx (App imports them — that is a cycle), and
 * the alternative was a second copy of `ageFromDob` inside
 * buildRothExplorer.js. Age was ALREADY computed four different ways once
 * (see ageDerivation.test.js: two divided milliseconds by 365.25 and were off by
 * a year near a birthday, two compared month-day as strings where "9-5" < "10-1"
 * is lexically true and calendrically false). That bug shipped. Re-splitting the
 * implementation to add a spouse would have re-created it with a second person's
 * birthday to get wrong.
 *
 * App.jsx re-exports `ageFromDob` so existing callers and ageDerivation.test.js
 * are unaffected.
 */

/**
 * Parse a date that represents a CALENDAR day (a birthday, a checkpoint date) —
 * not an instant in time.
 *
 * `new Date("1970-07-27")` is specified to parse as UTC midnight, but every
 * getFullYear/getMonth/getDate call reads it back in LOCAL time. West of UTC
 * that lands on the previous day: for a US user the birthday above becomes
 * July 26th, and a dob of "1970-01-01" becomes 1969-12-31 — shifting the derived
 * age by a full year for the whole year. Date-only strings are therefore split
 * and rebuilt with the local-time constructor. Values that already carry a time
 * (or are Date objects) are passed through untouched.
 */
export function parseCalendarDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(value);
}

/**
 * Whole years between `dob` and `asOf` (default: now), with calendar-birthday
 * semantics — the birthday must have been REACHED to count.
 *
 * `ageFromDob(dob)` is "age now"; `ageFromDob(dob, someDate)` is "age on that
 * date". Returns null for missing/unparseable input so callers can fall back
 * explicitly rather than silently treating a bad date as age 0.
 */
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

/**
 * A person's age today, from whichever field they have.
 *
 * Precedence is `dob` first — it is the input of record (ageDerivation.test.js
 * locks this down: a stored `currentAge` that nothing refreshes when the birthday
 * changes is exactly how the "I changed my birthdate and the fan chart kept the
 * old age" bug happened). `currentAge`/`birthYear` are load-migration fallbacks
 * for profiles saved before `dob` existed.
 */
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

/**
 * How many of the household's filers have reached `minAge` in the modeled year.
 *
 * Exists because several tax amounts are PER PERSON but the engines carry one
 * age: the age-65 standard-deduction add-on ($1,650 each) and the OBBBA senior
 * bonus ($6,000 each). Both used to read `age >= 65 && mfj` as "both spouses are
 * 65", granting two people's benefit the moment the PRIMARY turned 65 — worth up
 * to $7,650/yr of deductions the couple is not entitled to, for as many years as
 * the age gap. Exactly the same defect as the spouse's Social Security clock.
 *
 * `spouseAge == null` (spouse age unknown) reproduces the old both-at-once
 * behaviour deliberately, so no saved profile changes until a spouse DOB exists.
 *
 * @param {number} age        primary's modeled age
 * @param {number|null} spouseAge  spouse's modeled age, or null if unknown
 * @param {boolean} mfj       filing jointly
 * @param {number} minAge     the age threshold being tested (65 for both uses today)
 * @returns {0|1|2}
 */
export function personsAtLeastAge(age, spouseAge, mfj, minAge) {
  const selfQualifies = age >= minAge ? 1 : 0;
  if (!mfj) return selfQualifies;
  if (spouseAge == null || !Number.isFinite(spouseAge)) {
    // Legacy shape: one age stood for both filers.
    return selfQualifies ? 2 : 0;
  }
  return selfQualifies + (spouseAge >= minAge ? 1 : 0);
}

/**
 * How many years OLDER the primary is than their spouse. Positive ⇒ the spouse
 * is younger. This is the whole reason `spouse.dob` exists (§24): every engine
 * walks ONE `age` variable, which is the PRIMARY's age, so anything keyed to the
 * spouse — their Social Security claim, their Medicare start, their own RMD age —
 * has to be shifted onto that clock by this offset.
 *
 * Returns 0 when the spouse's age is unknown, which reproduces the pre-spouse-DOB
 * behaviour exactly (both people implicitly the same age). That fallback is a
 * REGRESSION LOCK, not a modelling choice — see spousalSS.test.js.
 */
export function spouseAgeOffset(p = {}, asOf) {
  const sp = p.spouse || {};
  const primary = personAgeNow(p, asOf);
  const spouse  = personAgeNow(sp, asOf);
  if (primary == null || spouse == null) return 0;
  const off = primary - spouse;
  return Number.isFinite(off) ? off : 0;
}

/**
 * The spouse's age in the modeled year where the primary is `primaryAge`, or
 * `null` when it is not known.
 *
 * THE conversion between the one clock the engines walk and the second person.
 * Every per-person amount (age-65 deduction add-on, OBBBA senior bonus, their own
 * Medicare start, their own RMD age) should take its age from here rather than
 * re-deriving the offset, so there is one place to be wrong.
 *
 * Returns null unless the spouse is BOTH enabled and has a known age. Gating on
 * `enabled` is deliberate: a stored DOB left behind by a user who then switched
 * the spouse off must not keep changing their numbers — the "spouse.enabled =
 * false reproduces the single-person result exactly" lock in
 * ghostSettings.test.js depends on it.
 */
/**
 * The PRIMARY's age in the year the spouse dies, or Infinity when a first death
 * is not being modelled.
 *
 * `spouse.deathAge` is the SPOUSE's own age — that is the natural way to state it
 * ("model my spouse dying at 80") — so it has to be shifted onto the primary's
 * clock, which is the only clock the engines walk.
 */
export function spouseDeathOnPrimaryClock(p, asOf) {
  return firstDeathOnPrimaryClock(p, asOf);
}

/**
 * WHICH of the two people dies first. `spouse.deathAge` is always expressed as the
 * DECEDENT's own age, so this says whose age it is.
 *
 * Default "spouse" is the pre-existing behaviour: the spouse dies, the primary
 * survives. "primary" is the case the model could not express at all — and it is
 * the more commonly asked one, because the higher earner is often the older
 * partner. Getting it wrong is not cosmetic: with the wrong survivor, the plan
 * horizon, the Medicare start, the age-65 deduction and the RMD clock are all keyed
 * to a person who is dead.
 */
export function firstToDie(p) {
  return (p?.spouse?.firstToDie === "primary") ? "primary" : "spouse";
}

/** True when the PRIMARY is the one who survives (i.e. the spouse dies first). */
export function survivorIsPrimary(p) {
  return firstToDie(p) !== "primary";
}

/**
 * The PRIMARY's age in the year of the first death — Infinity when not modelled.
 *
 * Everything downstream is measured on the primary's clock because that is the only
 * clock the engines walk, so the decedent's own age has to be translated onto it.
 */
export function firstDeathOnPrimaryClock(p, asOf) {
  const sp = p?.spouse || {};
  if (!sp.enabled) return Infinity;
  const deathAge = Number(sp.deathAge);
  if (!(deathAge > 0)) return Infinity;
  // The spouse's age + the gap = the primary's age that year. The primary's own age
  // needs no translation.
  return survivorIsPrimary(p) ? deathAge + spouseAgeOffset(p, asOf) : deathAge;
}

/**
 * The SURVIVOR's own age in the year the primary would be `primaryAge`.
 *
 * When the primary survives this is just `primaryAge`. When the SPOUSE survives it
 * is shifted by the age gap — and that shift is what every per-person amount after
 * the death depends on: their Medicare start, their age-65 deduction, their own RMD
 * age, their survivor FRA. Keeping the primary's age here would apply a dead
 * person's milestones to a living one.
 */
export function survivorAgeOnPrimaryClock(p, primaryAge, asOf) {
  if (survivorIsPrimary(p)) return primaryAge;
  return primaryAge - spouseAgeOffset(p, asOf);
}

/**
 * The last age on the PRIMARY's clock that the projection must cover.
 *
 * `endAge` is one profile field and it means "the age I plan through". When the
 * primary dies first and a YOUNGER spouse survives, the money still has to last
 * until the SURVIVOR reaches that age — so the projection has to run past the age
 * the primary would have reached, by the age gap.
 *
 * Owner decision, 2026-07-30: the horizon follows whoever is alive. It lowers
 * the success rate for anyone with a younger spouse, which is correct — their money
 * genuinely has to last longer, and the previous behaviour (stopping at the dead
 * partner's end age) flattered every such plan.
 *
 * An older surviving spouse shortens the horizon symmetrically, and the result is
 * never allowed to fall below the death year itself.
 */
export function planEndAgeOnPrimaryClock(p, endAge, asOf) {
  const end = Number(endAge);
  if (!Number.isFinite(end)) return endAge;
  if (survivorIsPrimary(p)) return end;
  const death = firstDeathOnPrimaryClock(p, asOf);
  if (!Number.isFinite(death)) return end;
  // Survivor reaches `end` when the primary's clock reads end + offset.
  const extended = end + spouseAgeOffset(p, asOf);
  return Math.max(Math.ceil(death), Math.round(extended));
}

/**
 * Does the household file jointly in the year the primary is `primaryAge`?
 *
 * THE WIDOW'S PENALTY (§22). Filing status was nowhere time-varying, so the
 * survivor's tax bill could not be modelled — even though on a first death the
 * tax hit usually EXCEEDS the benefit lost: brackets narrow, the standard
 * deduction roughly halves, IRMAA tiers halve, and the OBBBA senior bonus halves,
 * all against a barely-reduced RMD on an unchanged portfolio.
 *
 * MFJ is kept THROUGH the year of death; Single applies from the year after. A
 * surviving spouse may file jointly for the tax year in which their spouse died
 * (IRS Pub 501), so flipping in the death year itself would overstate tax by a
 * year. Qualifying-surviving-spouse status (which extends MFJ rates two more
 * years) requires a dependent child and is deliberately not modelled — it does
 * not apply to the retiree case this tool serves.
 *
 * No `deathAge` ⇒ constant, which is the pre-feature behaviour for every profile.
 */
export function filesJointlyAt(p, primaryAge, asOf) {
  if ((p?.filingStatus || "mfj") === "single") return false;
  return primaryAge <= spouseDeathOnPrimaryClock(p, asOf);
}

/** `filesJointlyAt` as the string the tax helpers take. */
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

/**
 * The PRIMARY's age in the year the spouse's contributions stop (§24.1 Phase A).
 *
 * `spouse.retireAge` is the SPOUSE's own age — the only natural way to state it
 * ("my wife retires at 60") — and the accumulation loops walk the PRIMARY's age,
 * so it has to be shifted onto that clock. Getting this wrong is not cosmetic:
 * the identical mistake against `spouse.ssAge` once started a younger spouse's
 * Social Security years early (§24 item 1). A spouse ten years younger who
 * retires at 60 stops contributing when the PRIMARY is 70, not 60.
 *
 * Returns Infinity — "never stops early" — when the spouse is disabled, has no
 * contributions, or has no explicit retireAge. Infinity is deliberate: every
 * caller clamps against the primary's own retirement date anyway, so Infinity
 * reproduces the pre-feature behaviour (both streams run the full accumulation)
 * without the caller needing a null branch.
 *
 * PHASE A LIMIT: a spouse retiring AFTER the primary is clamped by the caller at
 * the primary's retirement date, because the retirement loop has no concept of
 * contributions. That is exactly today's behaviour — no regression, no fix — and
 * the UI must disclose it rather than imply the later date was modelled.
 */
export function contribStopOnPrimaryClock(p, asOf) {
  const sp = p?.spouse || {};
  if (!sp.enabled) return Infinity;
  const stop = Number(sp.retireAge);
  if (!Number.isFinite(stop) || stop <= 0) return Infinity;
  return stop + spouseAgeOffset(p, asOf);
}
