import { parseCalendarDate } from "./engine/ages.js";

describe("calendar-date parsing", () => {
  test("date-only strings stay on the entered calendar day in New York", () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const d = parseCalendarDate("2018-09-14");
      expect(d.getFullYear()).toBe(2018);
      expect(d.getMonth()).toBe(8);
      expect(d.getDate()).toBe(14);
      expect(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))
        .toBe("Sep 14, 2018");
    } finally {
      if (previousTZ === undefined) delete process.env.TZ;
      else process.env.TZ = previousTZ;
    }
  });
});
