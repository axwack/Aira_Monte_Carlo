import { ageFromDob } from "./App";

const NOW = new Date("2026-07-26T12:00:00Z");
let realNow;
beforeAll(() => {
  realNow = Date.now;
  Date.now = () => NOW.getTime();
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
    expect(ageFromDob("1970-12-25")).toBe(55);
  });

  test("birthday already passed this year ⇒ age IS incremented", () => {
    expect(ageFromDob("1970-01-05")).toBe(56);
  });

  test("on the exact birthday the age increments that day", () => {
    expect(ageFromDob("1970-07-26")).toBe(56);
  });

  test("the day before the birthday it has not yet incremented", () => {
    expect(ageFromDob("1970-07-27")).toBe(55);
  });

  test("a date-only dob is treated as a local calendar day, not UTC midnight", () => {
    expect(ageFromDob("1970-01-01")).toBe(56);
  });

  test("a birthday on the 1st of a month is not shifted into the prior month", () => {
    expect(ageFromDob("2000-08-01")).toBe(25);
  });

  describe("age as of an arbitrary date (checkpoints)", () => {
    test("computes age on a given past date, not today", () => {
      expect(ageFromDob("1970-04-22", "2020-06-01")).toBe(50);
      expect(ageFromDob("1970-04-22", "2020-01-01")).toBe(49);
    });

    test("month-day comparison is numeric, not lexical", () => {
      expect(ageFromDob("1970-09-05", "2020-10-01")).toBe(50);
      expect(ageFromDob("1970-10-01", "2020-09-05")).toBe(49);
    });

    test("an unparseable asOf yields null rather than a wrong number", () => {
      expect(ageFromDob("1970-04-22", "garbage")).toBeNull();
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
