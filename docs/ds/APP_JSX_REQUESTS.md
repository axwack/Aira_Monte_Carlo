# App.jsx integration requests for Claude

These requests are intentionally not implemented in the DeepSeek lane because Claude owns `src/App.jsx`.

## #1 — imports near the existing engine imports — use shared bucket color helpers

Import:

```js
import { bucketColor, BUCKET_HORIZONS, BUCKET_LABELS } from "./engine/bucketColors.js";
```

Use the shared table in true bucket surfaces, especially `BucketsTab` around App.jsx:10406-10414. Replace the three hard-coded bucket colors with `bucketColor(1)`, `bucketColor(2)`, and `bucketColor(3)`. Keep account-category colors in `ACCOUNT_CATEGORIES` unchanged; tax category and time-horizon bucket are separate dimensions.

Add the exported labels/horizons to the visible bucket legend or card descriptions so B1/B2/B3 are not unexplained abbreviations.

Tests: `src/bucketColors.test.js`; add/extend the relevant UI smoke test if the existing BucketsTab render test covers these strings.

## #2 — imports near chart label constants — use shared income/expense labels

Import:

```js
import {
  EXPENSE_LABELS,
  INCOME_LABELS,
  incomeTooltip,
  expenseTooltip,
} from "./engine/incomeLabels.js";
```

In `IncomeExpensesChart` around App.jsx:5955-5976 and the `INCOME_CATS`/`EXPENSE_CATS` constants around 5931-5947:

- Rename the displayed `Annuity/Rental` row to `Rental/Passive Income`.
- Rename `Savings Drawdown` to `Savings & 401(k)/IRA Drawdown`.
- Do not change the underlying row values (`r.annuityRental`, `r.fromCash`, `r.fromTaxable`, `r.fromPretax`, `r.fromRoth`). This is a label/provenance change only.
- Add an accessible tooltip or adjacent help text using the helper copy, especially clarifying that retirement-account draws are not rental income.
- For rows that are zero because no relevant input was entered, do not display a confident `$0`; use the existing chart's display path to show `—`/`Not entered` plus a short provenance note. Do not mark calculated tax rows as “not entered.”

Tests: `src/incomeLabels.test.js`; add a render assertion in the existing Income/Forecast test surface if available.

## #3 — real-estate navigation — Plan Inputs is the single editor

The canonical mortgage/real-estate editor should be Plan Inputs → Real Estate & Debt. Analysis → Real Estate and Net Worth remain read-only summaries and should expose an `Edit in Plan Inputs` action that calls the existing navigation callback rather than creating a second editor.

Do not duplicate mortgage state. Preserve the current source of truth and route to it.

Tests: extend the relevant navigation/UI test; manually verify with and without a mortgage.

## #4 — contrast tokens — apply the approved audit cautiously

The DeepSeek contrast audit is in `docs/ds/contrast-audit.md`. The recommended dark-theme replacements are:

```css
--text-muted: #7f8b9c;
--text-faint: #778395;
```

Apply only after checking the current CSS location and light-theme behavior. Verify Forecast labels and Show/Hide controls at reduced brightness. Do not globally replace hard-coded chart category colors.

Tests: visual QA at 1024/1280/1440px; no math test required.

## #5 — WP-D mount: countdown configuration callback

`src/CountdownCard.jsx` now accepts `onConfigure`.

At the existing CountdownCard mount in the sidebar, pass:

```jsx
onConfigure={() => navigateToTab("assumptions")}
```

The component renders its normal countdown only when `dob` is real and `dobIsEstimate` is false. Missing or estimated DOB renders an `Add your date of birth →` button instead. Keep the existing `dobIsEstimate` source of truth from the landing flow.

## #6 — WP-C mount: spouse DOB

Import:

```js
import SpouseDobField from "./SpouseDobField";
```

Replace the raw spouse `<input type="date">` in the spouse block around App.jsx:15743-15756 with:

```jsx
<SpouseDobField
  value={sp.dob || ""}
  onSet={(dob) => setSpouse({ dob })}
  hint="Their own birthday drives their age and milestone timing."
/>
```

Do not change spouse state shape or age calculations. `SpouseDobField` is controlled and uses the existing guarded `DateField`.

## #7 — WP-E mount: bucket legend and reset

Import:

```js
import { BucketLegend, BucketResetButton } from "./BucketLegend";
```

In `SavingsPanel` around App.jsx:14519, render `<BucketLegend />` above the account category list. Beside each account's B1/B2/B3 controls, render:

```jsx
<BucketResetButton
  account={acct}
  onReset={(id, bucket) => setBucket(id, bucket)}
/>
```

The reset helper delegates the category default to `engine/buckets.js`; do not copy the default rules into App.jsx.

## #8 — WP-A mount: Plan Inputs Real Estate & Debt

Import:

```js
import RealEstateSection from "./planInputs/RealEstateSection";
```

Mount it in the Plan Inputs/Profile flow with these controlled props:

```jsx
<RealEstateSection
  properties={values.properties || []}
  mortgage={{
    balance: values.mortBalance,
    rate: values.mortRate,
    start: values.mortStart,
    term: values.mortTerm,
    extra: values.mortExtra,
  }}
  onUpdateProperty={(id, field, value) => {
    // use the existing properties updater/source of truth
  }}
  onAddProperty={/* existing add-property callback */}
  onRemoveProperty={/* existing remove-property callback */}
  onMortgageChange={(field, value) => {
    // map balance→mortBalance, rate→mortRate, start→mortStart,
    // term→mortTerm, extra→mortExtra through onChange
  }}
/>
```

The component synchronizes the primary property's mortgage balance with the primary mortgage editor. Do not create a second mortgage state object. Analysis → Real Estate should become a read-only summary with an `Edit in Plan Inputs` navigation action.

## #9 — WP-B mount: inline detailed budget

Import:

```js
import BudgetEditor from "./planInputs/BudgetEditor";
```

Mount it under Plan Inputs → Spending & Expenses with a controlled line-array value. The component's output shape is:

```js
{
  category: string,
  frequency: "Monthly" | "Quarterly" | "Annually" | "One-time",
  mustSpend: string | number,
  likeToSpend: string | number,
}
```

Use `budgetLinesToCsv(lines)` from the component if the existing engine path requires CSV parsing. Do not duplicate `parseExpenseCsv`; keep the existing import path as the canonical validation/normalization path. Preserve the exclusion note for mortgage/rent, debt, medical, LTC, and income tax.
