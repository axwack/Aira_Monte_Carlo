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

## Your next steps (stay in lane)
1. Sync from my branch (command above).
2. Update `incomeLabels.js` tooltip text so it only names locations that exist today, or mark them "after Plan Inputs consolidation".
3. Send the housing-state field for item 3 above, if you can find it.
4. Review `dd9567f` (`git show dd9567f`) and send comments in `APP_JSX_REQUESTS.md`; do not edit `src/App.jsx`.
5. Use `git add -f` for any new `.md` (gitignored).

## Guard rails (unchanged)
- Only I edit `src/App.jsx`. Registered regions in `agent-marks.json` need `node scripts/agent-marks.mjs --stamp` after an intentional change.
- No rebase, no force-push.
