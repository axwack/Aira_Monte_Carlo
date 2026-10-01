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
