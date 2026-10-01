# DeepSeek lane status for Claude

Updated: 2026-10-01 · DeepSeek branch: `ux/ds-support`

## Current state

The next DeepSeek work packages are implemented in the separate lane and are ready for Claude to mount. DeepSeek did not edit `src/App.jsx`.

- DeepSeek checkout: `/home/nono/Projects/aira-ds`
- Claude checkout: `/home/nono/Projects/Aira_Monte_Carlo`
- Claude owns all `src/App.jsx` integration and mount points.
- DeepSeek owns the new component files listed below.

## Work packages ready to mount

### WP-D — Countdown behavior

Files:

- `src/CountdownCard.jsx`
- `src/countdownCard.test.js`

Behavior:

- Real DOB + non-estimated DOB: normal countdown.
- Missing DOB or estimated/synthetic DOB: compact card saying `Add your date of birth to see a meaningful retirement countdown.`
- Optional `onConfigure` callback renders an `Add date of birth →` button.
- Timer is not created while the countdown is hidden.

Mount request: pass `onConfigure={() => navigateToTab("assumptions")}` at the existing CountdownCard mount. See `docs/ds/APP_JSX_REQUESTS.md#5`.

### WP-C — Spouse DOB field

Files:

- `src/SpouseDobField.jsx`
- `src/spouseDobField.test.js`

Behavior:

- Reuses the guarded `DateField` component.
- Uses the existing date-field styling.
- Limits the date to the local current day.
- Controlled props: `value`, `onSet`, optional `hint`.

Mount request: replace the raw spouse date input with `SpouseDobField`. See `APP_JSX_REQUESTS.md#6`.

### WP-E — Bucket legend/reset

Files:

- `src/BucketLegend.jsx`
- `src/bucketLegend.test.js`

Behavior:

- Visible legend for Bucket 1 cash cushion, Bucket 2 income bridge, Bucket 3 growth/long-term.
- `BucketResetButton` delegates default assignment to `engine/buckets.js` rather than copying rules.

Mount request: render the legend above the accounts list and reset control beside B1/B2/B3. See `APP_JSX_REQUESTS.md#7`.

### WP-A — Real Estate & Debt editor

Files:

- `src/planInputs/RealEstateSection.jsx`
- `src/realEstateSection.test.js`

Behavior:

- Controlled property list with value, mortgage balance, and annual income.
- Primary mortgage editor with balance, rate, start month, original term, and extra payment.
- Primary-property mortgage balance synchronizes through callbacks.
- Property totals and equity are visible.
- No engine or mortgage math is duplicated.

Mount request: add it to Plan Inputs as the canonical editor and make Analysis → Real Estate read-only with an Edit in Plan Inputs action. See `APP_JSX_REQUESTS.md#8`.

### WP-B — Inline detailed budget editor

Files:

- `src/planInputs/BudgetEditor.jsx`
- `src/budgetEditor.test.js`

Behavior:

- Controlled line-item editor for category, frequency, Must Spend, and Like to Spend.
- Validates category, nonnegative values, and Like to Spend ≥ Must Spend.
- Preserves the exclusion explanation for mortgage/rent, debt, medical, LTC, and income tax.
- Exports parser-compatible CSV through `budgetLinesToCsv`.
- Does not duplicate `parseExpenseCsv` or change engine behavior.

Mount request: add under Plan Inputs → Spending & Expenses. See `APP_JSX_REQUESTS.md#9`.

## Existing helper work

Already merged in the lane and available for mounting:

- `src/engine/bucketColors.js`
- `src/engine/incomeLabels.js`
- `src/bucketColors.test.js`
- `src/incomeLabels.test.js`
- `src/tzDates.test.js`

## Validation

Latest validation before final commit:

- Scope guard: passed.
- Work-package tests: **14 passed**.
- Full suite: **71 suites passed, 1 skipped; 1,211 tests passed, 14 skipped**.
- Production build: compiled successfully.

Existing console output includes the app's normal build-attribution logs, Browserslist notice, and timer/test warnings; there were no test failures.

## Merge/sync process

DeepSeek will commit these additions on `ux/ds-support`. Claude should merge from the main checkout:

```bash
cd /home/nono/Projects/Aira_Monte_Carlo
git checkout ux/configure-and-countdown
git status
git merge --no-ff ux/ds-support
```

Then Claude should mount each work package in separate commits, run the full suite/build, and update its own completion status.

If Claude commits more work before the merge, DeepSeek should sync first:

```bash
cd /home/nono/Projects/aira-ds
git merge ux/configure-and-countdown
bash docs/ds/check-scope.sh
```

Do not rebase or force-push. Do not edit `src/App.jsx` from the DeepSeek lane.
