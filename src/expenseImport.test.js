/**
 * Tests for the detailed-expense CSV importer.
 * Hand-verified totals; no magic numbers beyond the literal CSV fixtures
 * (which ARE the inputs under test).
 */
import {
  parseExpenseCsv,
  scheduleSpendForYear,
  resolveSpendGuardrails,
  SINGLE_YEAR_TEMPLATE,
  MULTI_YEAR_TEMPLATE,
} from "./engine/expenseImport";

describe("parseExpenseCsv — single-year budgets", () => {
  test("Layout A: Category,Amount with header sums to total", () => {
    const csv = "Category,Annual Amount\nGroceries,12000\nUtilities,4800\nTravel,15000\n";
    const r = parseExpenseCsv(csv);
    expect(r.mode).toBe("single");
    expect(r.total).toBe(12000 + 4800 + 15000); // 31800
    expect(r.lineItems).toHaveLength(3);
    expect(r.lineItems[0]).toEqual({ label: "Groceries", amount: 12000 });
  });

  test("Layout D: bare single amount column, no header", () => {
    const csv = "12000\n4800\n15000\n";
    const r = parseExpenseCsv(csv);
    expect(r.mode).toBe("single");
    expect(r.total).toBe(31800);
  });

  test("tolerates $, thousands commas (quoted), and parentheses negatives", () => {
    const csv = 'Category,Amount\nGroceries,"$12,000"\nRefund,(2000)\nUtilities,$4800\n';
    const r = parseExpenseCsv(csv);
    expect(r.total).toBe(12000 - 2000 + 4800); // 14800
  });

  test("skips non-numeric rows and records a warning", () => {
    const csv = "Category,Amount\nGroceries,12000\nNotes,n/a\nTravel,8000\n";
    const r = parseExpenseCsv(csv);
    expect(r.total).toBe(20000);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test("single year present in a long-format file collapses to single mode", () => {
    const csv = "Year,Category,Amount\n2026,Groceries,12000\n2026,Travel,8000\n";
    const r = parseExpenseCsv(csv);
    expect(r.mode).toBe("single");
    expect(r.total).toBe(20000);
  });

  test("Boldin-style: Frequency column normalizes monthly to annual", () => {
    const csv =
      "Label,Frequency,Amount\n" +
      "Groceries,Monthly,1000\n" +   // 12000/yr
      "Property Tax,Annually,20000\n" + // 20000/yr
      "Utilities,Monthly,500\n";     // 6000/yr
    const r = parseExpenseCsv(csv);
    expect(r.total).toBe(12000 + 20000 + 6000); // 38000
  });

  test("Boldin-style: Must Spend / Like to Spend → total uses Like, essential uses Must", () => {
    const csv =
      "Label,Frequency,Must Spend,Like to Spend\n" +
      "Groceries,Monthly,400,600\n" +   // must 4800, like 7200
      "Travel,Annually,5000,15000\n";   // must 5000, like 15000
    const r = parseExpenseCsv(csv);
    expect(r.total).toBe(7200 + 15000);        // 22200 (Like to Spend)
    expect(r.essentialTotal).toBe(4800 + 5000); // 9800 (Must Spend)
  });

  test("bundled single-year template parses with Must/Like split", () => {
    const r = parseExpenseCsv(SINGLE_YEAR_TEMPLATE);
    expect(r.mode).toBe("single");
    // Like to Spend (annualized): 12000+4800+6000+2400+20000+8400+3600+4800
    expect(r.total).toBe(62000);
    // Must Spend (annualized): 9600+4200+4800+1440+8000+3600+1200+3000
    expect(r.essentialTotal).toBe(35840);
  });
});

describe("parseExpenseCsv — multi-year budgets", () => {
  test("Layout B: wide (one column per year) sums each year column", () => {
    const csv =
      "Category,2026,2027,2028\n" +
      "Groceries,12000,12300,12600\n" +
      "Travel,15000,5000,5000\n";
    const r = parseExpenseCsv(csv);
    expect(r.mode).toBe("multi");
    expect(r.schedule).toEqual([
      { year: 2026, amount: 27000 },
      { year: 2027, amount: 17300 },
      { year: 2028, amount: 17600 },
    ]);
  });

  test("Layout C: long (Year,Category,Amount) groups by year", () => {
    const csv =
      "Year,Category,Amount\n" +
      "2026,Groceries,12000\n" +
      "2026,Travel,15000\n" +
      "2027,Groceries,12300\n";
    const r = parseExpenseCsv(csv);
    expect(r.mode).toBe("multi");
    expect(r.schedule).toEqual([
      { year: 2026, amount: 27000 },
      { year: 2027, amount: 12300 },
    ]);
  });

  test("year columns out of order come back sorted ascending", () => {
    const csv = "Category,2028,2026,2027\nTotal,3,1,2\n";
    const r = parseExpenseCsv(csv);
    expect(r.schedule.map((s) => s.year)).toEqual([2026, 2027, 2028]);
  });

  test("bundled multi-year template parses to 5 years", () => {
    const r = parseExpenseCsv(MULTI_YEAR_TEMPLATE);
    expect(r.mode).toBe("multi");
    expect(r.schedule).toHaveLength(5);
    // 2026 column: 12000+4800+6000+9000+20000+8000+5000 = 64800
    expect(r.schedule[0]).toEqual({ year: 2026, amount: 64800 });
  });
});

describe("parseExpenseCsv — error handling", () => {
  test("empty input throws", () => {
    expect(() => parseExpenseCsv("")).toThrow();
    expect(() => parseExpenseCsv("   \n  \n")).toThrow();
  });

  test("no numeric data throws", () => {
    expect(() => parseExpenseCsv("Category,Notes\nGroceries,weekly\n")).toThrow();
  });
});

describe("scheduleSpendForYear", () => {
  const sched = [
    { year: 2026, amount: 50000 },
    { year: 2027, amount: 60000 },
    { year: 2030, amount: 40000 },
  ];

  test("exact year returns the listed nominal amount", () => {
    expect(scheduleSpendForYear(sched, 2026, 2.5)).toBe(50000);
    expect(scheduleSpendForYear(sched, 2027, 2.5)).toBe(60000);
    expect(scheduleSpendForYear(sched, 2030, 2.5)).toBe(40000);
  });

  test("year before the schedule uses the first amount (no back-inflation)", () => {
    expect(scheduleSpendForYear(sched, 2024, 2.5)).toBe(50000);
  });

  test("gap year carries the prior amount forward, inflation-adjusted", () => {
    // 2028, 2029 carry 2027's 60000 forward at 2.5%
    expect(scheduleSpendForYear(sched, 2028, 2.5)).toBe(Math.round(60000 * 1.025));
    expect(scheduleSpendForYear(sched, 2029, 2.5)).toBe(Math.round(60000 * Math.pow(1.025, 2)));
  });

  test("year past the last entry inflates the last amount forward", () => {
    expect(scheduleSpendForYear(sched, 2032, 2.5)).toBe(Math.round(40000 * Math.pow(1.025, 2)));
  });

  test("empty/missing schedule returns 0", () => {
    expect(scheduleSpendForYear([], 2030, 2.5)).toBe(0);
    expect(scheduleSpendForYear(null, 2030, 2.5)).toBe(0);
  });
});

describe("resolveSpendGuardrails", () => {
  test("Must/Like import drives floor (essential) and ceiling (full), source=import", () => {
    const g = resolveSpendGuardrails({
      sp: 62000, spOutOfCountry: 0,
      gkFloorPct: 60, gkCeilingPct: 115,
      spImportMeta: { mode: "single", total: 62000, essentialTotal: 35840 },
    });
    expect(g).toEqual({ gkFloor: 35840, gkCeiling: 62000, source: "import" });
  });

  test("out-of-country spend is added to both import-driven bounds", () => {
    const g = resolveSpendGuardrails({
      sp: 50000, spOutOfCountry: 10000,
      gkFloorPct: 60, gkCeilingPct: 115,
      spImportMeta: { mode: "single", total: 50000, essentialTotal: 30000 },
    });
    expect(g.gkFloor).toBe(40000);   // 30000 + 10000
    expect(g.gkCeiling).toBe(60000); // 50000 + 10000
  });

  test("import without an essential (Must) total falls back to percent path", () => {
    const g = resolveSpendGuardrails({
      sp: 80000, spOutOfCountry: 0,
      gkFloorPct: 60, gkCeilingPct: 115,
      spImportMeta: { mode: "single", total: 80000, essentialTotal: null },
    });
    expect(g.source).toBe("percent");
    expect(g.gkFloor).toBe(48000);   // 80000 × 0.60
    expect(g.gkCeiling).toBe(92000); // 80000 × 1.15
  });

  test("multi-year import uses percent path (schedule overrides spend directly)", () => {
    const g = resolveSpendGuardrails({
      sp: 80000, spOutOfCountry: 0, gkFloorPct: 60, gkCeilingPct: 115,
      spImportMeta: { mode: "multi", years: 5 },
    });
    expect(g.source).toBe("percent");
  });

  test("no import → percent of combined core spend", () => {
    const g = resolveSpendGuardrails({ sp: 70000, spOutOfCountry: 30000, gkFloorPct: 60, gkCeilingPct: 115 });
    expect(g.gkFloor).toBe(60000);    // 100000 × 0.60
    expect(g.gkCeiling).toBe(115000); // 100000 × 1.15
  });
});
