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
