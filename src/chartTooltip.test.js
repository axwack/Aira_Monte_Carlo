/**
 * The shared chart tooltip must not label a calendar year as an age.
 *
 * Reported 2026-08-05 with a screenshot: hovering the Income/Expenses chart at
 * 2044 showed "Age 2044".
 *
 * Cause: `Tip` is shared by TEN charts that do not agree on their x-axis key.
 * Most use dataKey="age"; the Income/Expenses chart uses dataKey="yr". The
 * heading was a hardcoded `Age {label}`, so the year-keyed charts printed a year
 * behind the word "Age".
 *
 * tipHeading() reads the data ROW instead of the axis label. Tested as a pure
 * function rather than by rendering, so this needs no new test dependency.
 */

import { tipHeading } from "./App";

const row = (r) => [{ name: "Savings Drawdown", value: 99138, payload: r }];

describe("tipHeading", () => {
  test("row with both age and yr shows the age, with the year for orientation", () => {
    expect(tipHeading(row({ age: 71, yr: 2044 }), 2044)).toBe("Age 71 \u00b7 2044");
  });

  test("THE REPORTED BUG: a year-keyed chart never prints 'Age <year>'", () => {
    expect(tipHeading(row({ age: 71, yr: 2044 }), 2044)).not.toContain("Age 2044");
  });

  test("age-only row shows just the age", () => {
    expect(tipHeading(row({ age: 66 }), 66)).toBe("Age 66");
  });

  test("year-only row shows the year WITHOUT the word Age", () => {
    expect(tipHeading(row({ yr: 2044 }), 2044)).toBe("2044");
  });

  test("no row data: an age-magnitude label is treated as an age", () => {
    expect(tipHeading(row({}), 66)).toBe("Age 66");
  });

  test("no row data: a year-magnitude label is NOT called an age", () => {
    const h = tipHeading(row({}), 2044);
    expect(h).toBe("2044");
    expect(h).not.toContain("Age");
  });

  test("survives missing/empty payload without throwing", () => {
    expect(tipHeading(undefined, 66)).toBe("Age 66");
    expect(tipHeading([], 2044)).toBe("2044");
    expect(tipHeading(null, undefined)).toBe("");
  });

  test("a non-numeric label passes through unchanged", () => {
    expect(tipHeading(row({}), "Retirement")).toBe("Retirement");
  });
});
