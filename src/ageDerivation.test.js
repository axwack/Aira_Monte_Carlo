/**
 * Age derivation — one implementation, used everywhere.
 *
 * Bug this locks down (reported 2026-07-26: "when I changed my birthdate the mc
 * portfolio fan has the old age"): age was computed FOUR different ways, and
 * several views read a stored `currentAge` field that nothing updated when `dob`
 * changed. Editing a birthday therefore changed the simulation while the fan
 * chart, its "you are here" dot, the survival curve, and the MC band table's
 * calendar-year column all kept rendering the old age.
 *
 * Two of the old implementations divided elapsed milliseconds by 365.25 days —
 * off by a full year near a birthday. The other two compared month-day as
 * STRINGS, where "9-5" < "10-1" is true lexically but false as a date.
 *
 * `dob` is the input of record; everything derives from it via ageFromDob.
 */

import { ageFromDob } from "./App";

// Fixed "now" so these never break on a real birthday boundary.
const NOW = new Date("2026-07-26T12:00:00Z");
let realNow;
beforeAll(() => {
  realNow = Date.now;
  Date.now = () => NOW.getTime();
  // ageFromDob uses `new Date()` for the default asOf, so freeze the clock.
  jest.useFakeTimers().setSystemTime(NOW);
});
afterAll(() => {
  jest.useRealTimers();
  Date.now = realNow;
});

describe("ageFromDob — calendar birthday semantics", () => {
  test("returns null for missing or unparseable input", () => {
    expect(ageFromDob(null)).toBeNull();
    expect(ageFromDob("")).toBeNull();
    expect(ageFromDob(undefined)).toBeNull();
    expect(ageFromDob("not-a-date")).toBeNull();
  });

  test("birthday not yet reached this year ⇒ age is NOT incremented", () => {
    // Born 1970-12-25; as of 2026-07-26 they are still 55.
    expect(ageFromDob("1970-12-25")).toBe(55);
  });

  test("birthday already passed this year ⇒ age IS incremented", () => {
    // Born 1970-01-05; as of 2026-07-26 they are 56.
    expect(ageFromDob("1970-01-05")).toBe(56);
  });

  test("on the exact birthday the age increments that day", () => {
    expect(ageFromDob("1970-07-26")).toBe(56);
  });

  test("the day before the birthday it has not yet incremented", () => {
    expect(ageFromDob("1970-07-27")).toBe(55);
  });

  // A date-only string parses as UTC midnight but is read back with local
  // getters, so west of UTC it lands on the PREVIOUS day. For a Jan-1 birthday
  // that rolls into the prior year and shifts the age by a full year.
  test("a date-only dob is treated as a local calendar day, not UTC midnight", () => {
    // Born 1970-01-01. As of 2026-07-26 this person is 56. If the string were
    // read as UTC and rendered locally it would become 1969-12-31 → 57.
    expect(ageFromDob("1970-01-01")).toBe(56);
  });

  test("a birthday on the 1st of a month is not shifted into the prior month", () => {
    // Born 2000-08-01; as of 2026-07-26 the birthday has NOT arrived → 25.
    // A UTC-parsed dob becomes 2000-07-31, which would wrongly return 26.
    expect(ageFromDob("2000-08-01")).toBe(25);
  });

  describe("age as of an arbitrary date (checkpoints)", () => {
    test("computes age on a given past date, not today", () => {
      expect(ageFromDob("1970-01-01", "2020-06-01")).toBe(50);
      expect(ageFromDob("1970-01-01", "2020-01-01")).toBe(49);
    });

    test("month-day comparison is numeric, not lexical", () => {
      // Born September 5th, checkpoint October 1st of the same year: the
      // birthday HAS passed, so the age must have incremented. The old code
      // compared "9-4" vs "8-1" as strings — "9-4" < "8-1" is false, which
      // happened to work here, but the reverse case below broke.
      expect(ageFromDob("1970-09-05", "2020-10-01")).toBe(50);
      // Born October 1st, checkpoint September 5th: birthday has NOT passed.
      // Lexically "8-4" < "9-0" is true, so this one needs real date math.
      expect(ageFromDob("1970-10-01", "2020-09-05")).toBe(49);
    });

    test("an unparseable asOf yields null rather than a wrong number", () => {
      expect(ageFromDob("1970-01-01", "garbage")).toBeNull();
    });
  });

  test("changing the birthday changes the derived age (the reported bug)", () => {
    const before = ageFromDob("1970-01-05");
    const after  = ageFromDob("1980-01-05");
    expect(before).toBe(56);
    expect(after).toBe(46);
    expect(after).not.toBe(before);
  });
});
