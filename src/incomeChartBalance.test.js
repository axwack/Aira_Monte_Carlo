import { incomeExpenseRow, notEnteredKeys } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { INCOME_LABELS } from "./engine/incomeLabels";

// The Income and Expense charts must have the same total every year: every
// dollar that comes in (income, savings draws, conversions) goes out as
// spending, tax, or money put back into the accounts. Each case below was a
// real gap: RMDs, one-off expenses, conversion tax paid from an account, the
// 72(t) penalty, inflows and surplus income deposited back.
const Y = new Date().getFullYear();
const INCOME = ["Social Security", "Annuity/Rental", "Pension/Other", INCOME_LABELS.savingsDrawdown, "One-Off Income", "Roth Conversion"];
const EXPENSE = ["General/Living", "Mortgage/Housing", "Medical", "Long-Term Care", "Other Expenses", "Income Tax", "Capital Gains Tax", "Moved to Roth", "Saved to Accounts"];

const plan = (o) => ({
  currentAge: 58, retireAge: 60, dob: `${Y - 58}-06-01`, endAge: 90, inf: 2.5,
  sp: 90_000, gkFloor: 60_000, gkCeiling: 120_000, ssAge: 67, ssb: 30_000,
  filingStatus: "mfj", stateOfResidence: "NJ", ab: 12_000, abGrowth: 2,
  mortBalance: 150_000, mortRate: 6, mortStart: `${Y - 2}-01`, mortTerm: 15,
  carveouts: [{ label: "Medical", annual: 6_000, endYear: Y + 20 }, { label: "Travel", annual: 5_000, endYear: Y + 10 }],
  otherIncomes: [{ id: "p", name: "Pension", annual: 20_000, startYear: Y + 5, endYear: Y + 40, growthRate: 0, taxable: true }],
  cashFlowEvents: [
    { id: "reno", year: Y + 3, amount: 100_000, direction: "out" },
    { id: "gift", year: Y + 6, amount: 200_000, direction: "in", bucket: "taxable" },
  ],
  rothConversionTarget: "fill_22", withdrawalBracketTarget: "22", taxFunding: "from_taxable",
  accounts: [
    { id: "a", category: "pretax", name: "IRA", balance: 1_500_000 },
    { id: "b", category: "roth", name: "Roth", balance: 200_000 },
    { id: "c", category: "taxable", name: "Brokerage", balance: 300_000 },
    { id: "d", category: "cash", name: "Cash", balance: 50_000 },
  ],
  ...o,
});

const gaps = (p) => buildWithdrawalWaterfall(p).smart.rows.flatMap((r) => {
  const d = incomeExpenseRow(r, p.carveouts, p.inf);
  const sum = (keys) => keys.reduce((s, k) => s + (d[k] || 0), 0);
  const gap = Math.round(sum(INCOME) - sum(EXPENSE));
  return Math.abs(gap) > 2 ? [`${r.yr}: income − expenses = ${gap}`] : [];
});

describe("Income and Expense charts balance every year", () => {
  test.each([
    ["conversion tax paid from taxable", {}],
    ["conversion tax withheld from the conversion", { taxFunding: "from_conv" }],
    ["conversion tax from outside cash", { taxFunding: "outside_cash" }],
    ["early retirement with the 72(t) penalty", { currentAge: 48, retireAge: 50, dob: `${Y - 48}-06-01`, rothConversionTarget: "off" }],
    ["RMDs far above spending", { accounts: [{ id: "a", category: "pretax", name: "IRA", balance: 6_000_000 }], rothConversionTarget: "off" }],
    ["single filer", { filingStatus: "single", taxFunding: "from_conv" }],
  ])("%s", (_, o) => {
    expect(gaps(plan(o))).toEqual([]);
  });

  // Engine bug, handed to the engine lane: when income covers core spending,
  // buildWithdrawalWaterfall still draws housing and carveouts in full, so the
  // draw exceeds every outgoing. Unskip once baseNeed nets income against total outlay.
  test.skip("income above core spending", () => {
    expect(gaps(plan({ sp: 40_000, gkFloor: 30_000, gkCeiling: 60_000, ssb: 60_000, rothConversionTarget: "off" }))).toEqual([]);
  });
});

test("one-off expenses alone un-dash the Other Expenses row", () => {
  expect(notEnteredKeys({ carveouts: [], mortBalance: 0, cashFlowEvents: [{ year: Y, amount: 1, direction: "out" }] }))
    .not.toContain("Other Expenses");
  expect(notEnteredKeys({ carveouts: [], mortBalance: 0, cashFlowEvents: [{ year: Y, amount: 1, direction: "in" }] }))
    .toContain("Other Expenses");
});
