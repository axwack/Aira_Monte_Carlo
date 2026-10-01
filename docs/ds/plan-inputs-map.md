# Plan Inputs information architecture map

Goal: one obvious destination for household facts, organized into sections rather than one giant form. Each field has one editable source of truth. Read-only analysis surfaces link back to the source.

| Proposed section | Existing editor/location | Representative fields | Read-only consumers / requested link |
|---|---|---|---|
| About You | Profile → About You / `AboutYouPanel` (App.jsx:14686+) | DOB, current age derivation, employer start date, state, filing status, spouse | Countdown, Forecast, tax panels |
| Accounts & Savings | Profile → Current Savings / `SavingsPanel` (App.jsx:14450+) | Account names, balances, tax categories, bucket tags/splits, taxable basis/yield | Sidebar donut, Net Worth, Forecast inputs, Withdrawal Plan |
| Spending & Expenses | Profile → Spending & Expenses / `ExpensesPanel` (App.jsx:16517+) | Domestic/out-of-country spending, planned carveouts, detailed-budget import | Forecast, Income/Expenses, Action Plan |
| Income | Profile contribution/income panels (`ContribPanel` App.jsx:15471+, Social Security around 15659+, rental around 15973+, pensions/other around 16006+) | Contributions, Social Security, rental/passive income, pensions, other income, windfalls | Income chart, withdrawal plan, tax views |
| Real Estate & Debt | Currently Analysis → Real Estate / `MortgageTab` (App.jsx:12481+) plus profile housing assumptions around 15172+ | Property value, mortgage balance, original term, rate, start date, extra payment, housing type, rent | Net Worth, Mortgage summary, Income/Expenses, Action Plan |
| Tax & Household Settings | Profile `AssumptionsPanel` (App.jsx:15110+) | Filing/tax settings, Roth conversion settings, FAFSA/CSS caps, withdrawal order, healthcare shocks, AI settings | Forecast and tax analysis |
| Simulation Settings | Forecast → Advanced Settings / `MCAdvancedSettings` (App.jsx:11306+) | Path count, historical range, inflation/cash assumptions, simulation-only controls | Forecast run controls and audit disclosures |

## Migration rule

Move or expose household editors under Plan Inputs incrementally. Do not create duplicate state or duplicate mortgage controls. Existing Analysis/Net Worth cards should become read-only summaries with an `Edit in Plan Inputs` action that navigates to the canonical editor.

Simulation Settings remains separate because it describes how the model runs, not facts about the household. Label it explicitly so users do not confuse it with personal input.

## Highest-priority navigation fix

Mortgage/Real Estate is the most damaging discovery failure from the screenshots: a user can see mortgage-derived results in Net Worth but must hunt in Analysis to find the editor. Make `Plan Inputs → Real Estate & Debt` the canonical destination first, then add links from Net Worth, Analysis, and Income/Expenses explanations.
