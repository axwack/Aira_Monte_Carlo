import { retirementTarget, formatRemaining, describeCountdown } from "./engine/retirementTarget";

const at = (y, m, d) => new Date(y, m - 1, d, 15, 30); // afternoon, local

describe("retirementTarget", () => {
  test("real dob → day precision on the birthday at retireAge", () => {
    const t = retirementTarget({ dob: "1975-03-10", retireAge: 62 });
    expect(t.precision).toBe("day");
    expect([t.date.getFullYear(), t.date.getMonth(), t.date.getDate()]).toEqual([2037, 2, 10]);
  });
  test("estimated dob → year precision", () => {
    expect(retirementTarget({ dob: "1975-06-15", retireAge: 62, dobIsEstimate: true }).precision).toBe("year");
  });
  test("missing / invalid dob or age → null", () => {
    expect(retirementTarget({ dob: "", retireAge: 62 })).toBeNull();
    expect(retirementTarget({ dob: "garbage", retireAge: 62 })).toBeNull();
    expect(retirementTarget({ dob: "1975-03-10", retireAge: undefined })).toBeNull();
  });
  test("date-only dob is not shifted a day west of UTC", () => {
    const t = retirementTarget({ dob: "1975-07-27", retireAge: 60 });
    expect(t.date.getDate()).toBe(27);
  });
  test("Feb 29 birthday rolls to Mar 1 in a non-leap target year", () => {
    const t = retirementTarget({ dob: "1976-02-29", retireAge: 61 }); // 2037
    expect([t.date.getMonth(), t.date.getDate()]).toEqual([2, 1]);
  });
});

describe("formatRemaining", () => {
  const t = (y, m, d) => ({ date: new Date(y, m - 1, d) });
  test("years, months, days", () => {
    expect(formatRemaining(t(2041, 6, 15), at(2026, 10, 1))).toMatchObject({ years: 14, months: 8, days: 14 });
  });
  test("day borrow uses the month before the target", () => {
    expect(formatRemaining(t(2027, 3, 5), at(2027, 2, 20))).toMatchObject({ years: 0, months: 0, days: 13, totalDays: 13 });
  });
  test("total days across a DST change is exact", () => {
    expect(formatRemaining(t(2026, 11, 5), at(2026, 3, 1)).totalDays).toBe(249);
  });
  test("same day and past targets are 'past'", () => {
    expect(formatRemaining(t(2026, 10, 1), at(2026, 10, 1)).past).toBe(true);
    expect(formatRemaining(t(2020, 1, 1), at(2026, 10, 1)).past).toBe(true);
  });
  test("null target → null", () => expect(formatRemaining(null)).toBeNull());
});

describe("describeCountdown", () => {
  test("exact date shows y/m/d and no seconds-level precision", () => {
    const d = describeCountdown({ precision: "day", date: new Date(2041, 5, 15) }, at(2026, 10, 1));
    expect(d.heading).toBe("Jun 15, 2041");
    expect(d.detail).toBe("14 years, 8 months, 14 days");
    expect(d.approx).toBe(false);
  });
  test("estimated date shows only the year and is labelled an estimate", () => {
    const d = describeCountdown({ precision: "year", year: 2041, date: new Date(2041, 5, 15) }, at(2026, 10, 1));
    expect(d.heading).toBe("Retirement year: 2041");
    expect(d.heading).not.toMatch(/Jun/);
    expect(d.detail).toMatch(/estimate/);
    expect(d.approx).toBe(true);
  });
  test("pluralization and past", () => {
    expect(describeCountdown({ precision: "day", date: new Date(2026, 10, 2) }, at(2026, 10, 1)).detail).toBe("1 month, 1 day");
    expect(describeCountdown({ precision: "day", date: new Date(2020, 0, 1) }, at(2026, 10, 1)).detail).toBe("Target date reached");
  });
  test("no target prompts for dob", () => expect(describeCountdown(null).heading).toMatch(/date of birth/));
});
