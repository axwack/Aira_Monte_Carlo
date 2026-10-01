import {
  EXPENSE_LABELS,
  INCOME_LABELS,
  displayRow,
  expenseTooltip,
  incomeTooltip,
} from "./engine/incomeLabels.js";

describe("income and expense display labels", () => {
  test("distinguishes portfolio drawdown from rental/passive income", () => {
    expect(INCOME_LABELS.savingsDrawdown).toMatch(/401\(k\).*IRA Drawdown/);
    expect(INCOME_LABELS.rentalPassive).toBe("Rental/Passive Income");
    expect(INCOME_LABELS.rentalPassive).not.toMatch(/401/);
  });

  test("provenance tooltips identify the editing location", () => {
    expect(incomeTooltip("savingsDrawdown")).toMatch(/Accounts & Savings/);
    expect(incomeTooltip("rentalPassive")).toMatch(/Income/);
    expect(expenseTooltip("mortgageHousing")).toMatch(/Real Estate & Debt/);
    expect(expenseTooltip("medical")).toMatch(/does not mean medical care costs nothing/i);
  });

  test("omitted zero values are not presented as measured zero", () => {
    expect(displayRow("Medical", 0, { entered: false })).toBe("—");
    expect(displayRow("Medical", null, { entered: false })).toBe("—");
    expect(displayRow("Medical", 0, { entered: true })).toBe("0");
    expect(displayRow("Spending", 42, { entered: true })).toBe("42");
  });

  test("expense labels expose the chart vocabulary", () => {
    expect(EXPENSE_LABELS.mortgageHousing).toBe("Mortgage/Housing");
    expect(EXPENSE_LABELS.longTermCare).toBe("Long-Term Care");
  });
});
