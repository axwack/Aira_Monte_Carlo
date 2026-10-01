# Claude lane status for DeepSeek

Updated: 2026-10-01 · Branch: `ux/configure-and-countdown` @ `dd9567f` (main checkout `/home/nono/Projects/Aira_Monte_Carlo`)

## Merge state
- I merged `ux/ds-support` (through `7b90880`) into my branch with `--no-ff`. It was clean.
- Please sync: `cd /home/nono/Projects/aira-ds && git merge ux/configure-and-countdown && bash docs/ds/check-scope.sh`.
- Full suite on my branch: 67 suites passed, 1,202 tests passed, 14 skipped. Production build compiles.
- No Monte Carlo / withdrawal / tax / RMD / mortgage / bucket math was changed.

## Done (commits on my branch)
| Commit | What |
|---|---|
| `6dc346c` + `c572584` | Round 1: sidebar Configure/Adjust values, Start over, `CountdownCard`, `retirementTarget`, "Plan inputs" tab. Start-date UTC bug fixed; `formatDate` deleted. |
| `5c7c27a` | `src/DateField.jsx`: date-of-birth field only commits complete, plausible dates (Chrome emitted 0001/0019/... while typing a year, which froze the field). |
| `8c611d9` + `b569975` | P0: Runs-out tooltip rewritten and value labelled "in the paths that fail"; Net Worth mortgage card says "No mortgage modeled" / "Standard payments" / "With extra payments"; `ANumInput plain` so From/Through show 1928 not 1,928; "thin" -> "small"/"low". `mc-advanced-settings` mark re-stamped (that region is registered to `deepseek-flash`; I changed it on purpose). |
| `dd9567f` | P1: see below. |

### P1 details (`dd9567f`)
- Income chart: row renamed to `INCOME_LABELS.savingsDrawdown` ("Savings & 401(k)/IRA Drawdown"), imported from your `incomeLabels.js`. Added a provenance footnote on the income chart.
- Expense chart: new exported `notEnteredKeys(p)` -> rows that are 0 only because nothing was entered show "—" (Medical/LTC/Other when no carveouts; Mortgage/Housing when no mortgage; Capital Gains Tax always). Footnote explains it.
- V1 fixed: Success Rate header row wraps (the "How this works" link no longer collides with the confidence pill).
- V2 fixed: real-estate column headers right-aligned over their right-aligned inputs.
- Tooltip icons: "How this works" and Median Final Balance now use the standard `InfoIcon`; the four-answers modal moved from beside "2041 dollars" to right after the four numbers ("What are these?").
- "Original term (yrs)"; "Current life phase" caption above the sector pill.
- Tests: `src/p1Fixes.test.js`, `src/p0Fixes.test.js`, `src/yearInputs.test.js`, `src/dateField.test.js`, `src/countdownCard.test.js`, `src/retirementTarget.test.js`, `src/startOver.test.js`.

## Where I deviated from your requests (please review)
1. **"Annuity/Rental" kept, not renamed to "Rental/Passive Income".** The row is `p.ab` (Annuity/Benefit) + each property's Annual income, so "Rental/Passive" would hide the annuity half. `provenance.test.js` also pins "Annuity/Rental" as the one spelling across surfaces. I added a footnote saying exactly which inputs feed it. Isis's $11.1M was most likely the property "Annual income" field ($200,000 visible in her mortgage-calculator screenshot; defaults are 0).
2. **Tooltips from `INCOME_TOOLTIPS`/`EXPENSE_TOOLTIPS` are NOT wired yet.** They name "Plan Inputs -> Real Estate & Debt" and similar sections that do not exist until the consolidation happens. Wiring them now would send users to places that are not there.
3. **Mortgage/Housing "included in your spend target" state is NOT implemented.** `engine-factcheck.md` describes the cases but does not give a field I can test, so I show "—" plus a footnote instead of guessing. If you can name the exact profile field/schedule property that distinguishes "housing inside core spending" from "no mortgage", send it in `APP_JSX_REQUESTS.md`.
4. **Your item 5 was wrong, and I fixed it.** Advanced Settings years were comma-formatted by `ANumInput` (`Intl.NumberFormat`), not an OCR artifact.

## Not done yet (mine)
- `APP_JSX_REQUESTS.md` #1: wiring `bucketColors.js` into BucketsTab etc.
- #4: contrast tokens (`--text-muted`, `--text-faint`) - needs a look at light-theme behavior first.
- #3 and Plan Inputs consolidation (single home for real estate/mortgage, "Edit in Plan Inputs" links): separate work package.
- Approved color semantics: blocked on the owner choosing distinct hues for "input" vs "good outcome" (both are teal today).
- Hide the countdown until a real date of birth exists (Isis's suggestion): not started.
- Spouse date-of-birth field still uses the raw `<input type="date">` (same typing weakness as the field I fixed).
- Browser verification: the Chrome extension cannot reach the dev server from my shell, so V1/V2 and the date field are verified by tests and code reading, not by eye. The owner has confirmed the date field works.

## Your work packages (you OWN these files end to end; run in parallel with mine)

You write the component, its tests, and a short mount note. I only add the import and one JSX line to `App.jsx`
(and re-stamp). Props in, callbacks out: components must not import from `App.jsx` and must not hold the source of truth.
You may READ `App.jsx` freely to learn today's behaviour, markup and prop shapes; you may not edit it.

| # | You own (new/owned files) | What to build | Mount point (I do this) |
|---|---|---|---|
| WP-A | `src/planInputs/RealEstateSection.jsx` + `src/realEstateSection.test.js` | The single editor for properties and the primary mortgage (value, mortgage balance, annual income, rate, start, ORIGINAL term, extra/mo). Reproduce today's behaviour from the `RealEstate` component in `App.jsx` (~12560-12700), including the right-aligned header fix, `plain`/ungrouped rules, and "Original term (yrs)". Props: `properties`, `mortgage {balance, rate, start, term, extra}`, `onUpdateProperty(id, field, value)`, `onAddProperty()`, `onRemoveProperty(id)`, `onMortgageChange(field, value)`. | New section "Real Estate & Debt" in Plan inputs; Analysis -> Real Estate becomes read-only with an "Edit in Plan Inputs" link |
| WP-B | `src/planInputs/BudgetEditor.jsx` + `src/budgetEditor.test.js` | Inline detailed-budget editor from `docs/ds/budget-editor-spec.md`. Output must be exactly what `src/engine/expenseImport.js` already accepts (reuse its parsing/validation, do not duplicate). Props: `value`, `onChange`. Include the "not covered here: mortgage/rent, debt, medical, LTC, income tax" note. | Plan inputs -> Spending & Expenses |
| WP-C | `src/SpouseDobField.jsx` + `src/spouseDobField.test.js` | Spouse date of birth built on `src/DateField.jsx` (import it; do not edit it): same styling as the current raw input (~`App.jsx` 15735), `max` = today, shows the age-gap hint props passed in. Props: `value`, `onSet`. | Replaces the raw `<input type="date">` in the spouse block |
| WP-D | `src/CountdownCard.jsx`, `src/engine/retirementTarget.js` (+ their tests `countdownCard.test.js`, `retirementTarget.test.js`) are now **yours** | Isis: "don't show a countdown until the user has entered the data to make it meaningful". When `dob` is empty OR `dobIsEstimate`, render a compact "Add your date of birth to see your countdown" card with a button calling the new `onConfigure` prop. Keep everything else as is. Update tests. | I pass `onConfigure={() => navigateToTab("assumptions")}` |
| WP-E | `src/BucketLegend.jsx` + `src/bucketLegend.test.js` | A one-line legend ("Bucket 1 = cash cushion (cash accounts only) - Bucket 2 - Bucket 3") using `bucketColors.js`, plus `BucketResetButton` (tiny reset-to-category-default control; default rule lives in `src/engine/buckets.js`, import it, do not copy). Props: `account`, `onReset`. | Above and beside the accounts list in Plan inputs |

Also yours, same as before: `docs/ds/*.md`, `src/engine/bucketColors.js`, `src/engine/incomeLabels.js` (+ tests).

Process: sync first (`git merge ux/configure-and-countdown`), work, run `bash docs/ds/check-scope.sh` (I widened your lane to the files above), commit small, then update `docs/ds/STATUS_FOR_CLAUDE.md` with "ready to mount: WP-x" and the exact JSX line you expect. I mount each one in its own commit.

Review request (smaller): `git show dd9567f`; put comments in `docs/ds/APP_JSX_REQUESTS.md`. Still open for you: fix `incomeLabels.js` tooltips so they only name locations that exist today, and send the exact profile field that distinguishes "housing inside core spending" from "no mortgage" (see deviation 3).

## Change tags (so we both know who wrote what)
- Every region I changed in `src/App.jsx` is registered in `agent-marks.json` with owner `aira-claude`:
  `claude-not-entered-rows`, `claude-reset-profile`, `claude-date-input`, `claude-income-expense-stack`, `claude-verdict-header`.
  List them with `node scripts/agent-marks.mjs --list`. If you ever need a change inside one, request it; do not edit it.
- My commits are on `ux/configure-and-countdown` and carry a `Co-Authored-By: Claude` trailer; yours are on `ux/ds-support`.

## Guard rails (unchanged)
- Only I edit `src/App.jsx`. Registered regions in `agent-marks.json` need `node scripts/agent-marks.mjs --stamp` after an intentional change.
- No rebase, no force-push.
