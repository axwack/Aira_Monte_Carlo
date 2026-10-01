/**
 * User-facing labels and provenance copy for the Income/Expenses view.
 *
 * This module deliberately contains no React and no engine math. It exists so
 * the chart legend, row labels, and future "not entered" state do not drift.
 */
export const INCOME_LABELS = Object.freeze({
  savingsDrawdown: "Savings & 401(k)/IRA Drawdown",
  socialSecurity: "Social Security",
  rentalPassive: "Rental/Passive Income",
  pensionOther: "Pension/Other",
  oneOffIncome: "One-Off Income",
  rothConversion: "Roth Conversion",
});

export const EXPENSE_LABELS = Object.freeze({
  generalLiving: "General/Living",
  mortgageHousing: "Mortgage/Housing",
  medical: "Medical",
  longTermCare: "Long-Term Care",
  otherExpenses: "Other Expenses",
  incomeTax: "Income Tax",
  capitalGainsTax: "Capital Gains Tax",
});

export const INCOME_TOOLTIPS = Object.freeze({
  savingsDrawdown: "Portfolio withdrawals, including pre-tax 401(k)/403(b)/457(b)/IRA draws, taxable-account draws, cash, and Roth. Edit balances in Plan Inputs → Accounts & Savings.",
  socialSecurity: "Social Security benefits entered in Plan Inputs → Income → Social Security.",
  rentalPassive: "Rental or passive/annuity income entered in Plan Inputs → Income. Retirement-account withdrawals are not included here.",
  pensionOther: "Pensions and other recurring income entered in Plan Inputs → Income.",
  oneOffIncome: "One-time inflows entered in Plan Inputs → Income → One-Off Income & Windfalls.",
  rothConversion: "Roth conversions scheduled by the selected strategy and tax settings; edit the strategy in Plan Inputs → Tax & Household Settings or Forecast → Simulation Settings.",
});

export const EXPENSE_TOOLTIPS = Object.freeze({
  generalLiving: "Core after-tax spending entered in Plan Inputs → Spending & Expenses.",
  mortgageHousing: "Mortgage payments or rent modeled from Plan Inputs → Real Estate & Debt. If housing is already included in core spending, this may be shown as included rather than an additional expense.",
  medical: "Medical carveouts entered in Plan Inputs → Spending & Expenses. A blank value means no medical carveout was entered; it does not mean medical care costs nothing.",
  longTermCare: "Long-term-care carveouts entered in Plan Inputs → Spending & Expenses. A blank value means no LTC carveout was entered; it does not mean LTC costs nothing.",
  otherExpenses: "Other planned expense carveouts entered in Plan Inputs → Spending & Expenses.",
  incomeTax: "Federal, state, IRMAA, and conversion-related tax amounts calculated by the model.",
  capitalGainsTax: "Capital gains tax is not separately modeled in this chart; realized taxable-account gains are included in Income Tax.",
});

/**
 * Display a value without implying that an omitted input is a real zero.
 * Callers should pass entered=true when the user explicitly entered zero.
 */
export function displayRow(label, amount, { entered = amount !== null && amount !== undefined } = {}) {
  if (!entered && (amount === null || amount === undefined || Number(amount) === 0)) {
    return "—";
  }
  return String(amount);
}

export function incomeTooltip(key) {
  return INCOME_TOOLTIPS[key] || null;
}

export function expenseTooltip(key) {
  return EXPENSE_TOOLTIPS[key] || null;
}
