# Inline detailed-budget editor proposal

This is a follow-up feature, not required for the first UX cleanup. It should replace or complement CSV upload without changing the engine's annualized budget model.

## User experience

Under `Plan Inputs → Spending & Expenses → Detailed Expense Budget`:

- Add a button: `Add budget line`.
- Each line has: category, recurring frequency, Must Spend, Like to Spend, optional end year, and delete.
- Provide a yearly/monthly toggle only for input convenience; normalize to annual values before engine use.
- Show an annualized preview beside each line.
- Keep the existing CSV import/export path for power users.
- Explain that mortgage/rent, debt, medical, long-term care, and income tax are modeled in their dedicated sections, not in the general CSV budget.

## Proposed fields

| Field | Required | Notes |
|---|---|---|
| Category | yes | Free text or a controlled category list; preserve imported category names. |
| Frequency | yes | Monthly, quarterly, or annually. One-off expenses belong in Planned One-Off Expenses, not this recurring budget. |
| Must Spend | yes | Essential annualized floor. |
| Like to Spend | yes | Desired annualized ceiling; must be ≥ Must Spend. |
| Starts | optional | Defaults to the current plan year. |
| Ends | optional | Blank means through the planning horizon. |
| Inflation treatment | optional | Default to existing app convention; expose only after the basic editor is stable. |

## Validation

- Reject negative amounts.
- Require Like to Spend ≥ Must Spend.
- Show a row-level error rather than silently dropping invalid rows.
- Preserve imported data when switching between editor and CSV export.
- Do not add mortgage, medical, LTC, or tax rows to the general budget automatically; link to their dedicated inputs instead.

## Open decisions before implementation

1. Whether the editor stores monthly/annual raw values or only normalized annual values.
2. Whether `Must Spend`/`Like to Spend` should feed the current GK floor/ceiling exactly as the importer does.
3. Whether one-off events belong here or remain under One-Off Income & Windfalls / Planned One-Off Expenses.
4. Whether a category taxonomy is worth the migration cost for existing free-text imports.

One-off events are intentionally excluded from this recurring editor because the existing `parseExpenseCsv` fallback treats unknown frequencies as annual. Use Planned One-Off Expenses for costs that should occur once.
