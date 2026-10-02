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

---

## #10 — [DeepSeek] Help/About topics: give the help body the info-modal format

**APPLIED by Claude in `fca4964` (2026-10-02), both edits. Nothing further needed.**

**Status: I had already applied this directly in `src/App.jsx` — my mistake, the lane rule is that I never edit that file. I have reverted my two hunks so `App.jsx` is yours alone again. Please apply the two edits below, or tell me to.**

Why it is needed: `src/about.js` now dresses all 28 ❓ Help topics in the info-modal rhythm (a bold lede, supporting paragraphs, tinted note callouts). Those topics render as authored HTML through `dangerouslySetInnerHTML`, so they cannot use the JSX kit (`ModalLede` / `ModalP` / `Em` / `ModalNote`) and need the equivalent in CSS. Until edit 1 lands, the `help-lede` / `help-note` classes written into `about.js` render unstyled.

### Edit 1 — CSS: the `.help-*` classes (values mirror the JSX kit exactly)

**Where:** `src/App.jsx`, inside the `const CSS = \`` template literal, immediately after the `.flag-i` rule.

**Old:**

```css
  .flag-i { border-left:3px solid #38bdf8; background:rgba(56,189,248,0.08); color:#bae6fd; border-radius:0 8px 8px 0; padding:7px 12px; font-size:12px; margin-bottom:4px; font-weight:500; }
```

**New (keep that line, append these after it):**

```css
  /* ── Help / About body — the info-modal kit's rhythm, authored in HTML ──
     The ❓ Help modal and its cards render authored HTML from about.js via
     dangerouslySetInnerHTML, so they cannot use the JSX kit directly
     (ModalLede / ModalP / Em / ModalNote). These classes ARE that kit, in
     CSS, at the same values: change them together, or the help copy grows a
     second body style — the drift this block exists to prevent. */
  .help-body { font-size:13px; color:var(--text-secondary); line-height:1.75; }
  .help-body p { margin:0 0 10px; }
  .help-body > *:last-child { margin-bottom:0; }
  .help-lede { font-size:14.5px; font-weight:700; color:var(--text-primary); line-height:1.5; margin:0 0 10px; }
  .help-sub { font-size:13px; font-weight:700; color:var(--text-primary); line-height:1.5; margin:16px 0 7px; }
  .help-body strong { color:var(--text-primary); font-weight:700; }
  .help-body em { font-style:italic; }
  .help-body ul { margin:0 0 10px; padding-left:20px; }
  .help-body li { margin-bottom:4px; }
  .help-body code { font-family:var(--font-mono); font-size:12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); border-radius:4px; padding:1px 5px; }
  /* The ModalNote look. Accent comes from --note-accent so a risk-toned note
     is a modifier, not a second rule that can fall out of step. */
  .help-note { --note-accent: var(--accent-gold); display:flex; gap:9px;
    background:rgba(245,166,35,0.07); border:1px solid rgba(245,166,35,0.2);
    border-left:3px solid var(--note-accent); border-radius:8px; padding:10px 12px;
    margin:0 0 10px; font-size:12.5px; color:var(--text-secondary); line-height:1.6; }
  .help-note--risk { --note-accent: var(--negative); background:rgba(248,113,113,0.07);
    border-top-color:rgba(248,113,113,0.2); border-right-color:rgba(248,113,113,0.2);
    border-bottom-color:rgba(248,113,113,0.2); border-left:3px solid var(--note-accent); }
  .help-note--method { --note-accent: var(--accent-teal); background:rgba(20,184,166,0.07);
    border-top-color:rgba(20,184,166,0.2); border-right-color:rgba(20,184,166,0.2);
    border-bottom-color:rgba(20,184,166,0.2); border-left:3px solid var(--note-accent); }
  .help-note-icon { color:var(--note-accent); font-weight:800; flex-shrink:0; line-height:1.6; }
```

The two modifiers set the three plain sides individually instead of using the `border-color` shorthand: that shorthand also overwrites the 3px `border-left` accent and flattens the callout.

### Edit 2 — render: let the CSS govern the help body

**Where:** `src/App.jsx`, `CollapsibleAboutCard`, the body div.

**Old:**

```jsx
      {open && (
        <div style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.7,
          padding:"0 15px 13px" }}
          dangerouslySetInnerHTML={{ __html: entry.body }} />
      )}
```

**New:**

```jsx
      {open && (
        <div className="help-body" style={{ padding:"0 15px 13px" }}
          dangerouslySetInnerHTML={{ __html: entry.body }} />
      )}
```

**Covered by:** `src/helpFormat.test.js` (asserts every topic has exactly one lede and balanced `<p>` tags). It passes today and does not depend on these two edits — it reads `about.js` only.

### What lands with this

- `src/about.js` — all 28 topics restructured; the prose was verified identical to the previous revision after tag-stripping (only markup and the note's `!` glyph were added).
- `src/helpFormat.test.js` — new guard, 3 tests.
- `src/help/tax_treatment_by_account_type.html` — converted off the light-theme tokens that do not exist in this app (`--color-text-primary`, pale `#E1F5EE`) onto the real dark palette and this same rhythm. This file is **imported nowhere**; it is inert until something wires it up.

I will commit those three paths by name — not `git add -A` — once these two edits land, or hold them if you would rather sequence it differently.

---

## #11 — [DeepSeek] WP-F: name the dollar basis with the retirement year

**APPLIED by Claude (2026-10-02), items 1–5. Item 6 still open.**

**Status: the engine side is DONE in my lane.** `src/engine/mcSelectors.js` now has:

```js
export function retirementBasisYear(currentAge, retireAge, currentYear) // -> 2041 | null
export const dollarBasisLabel = (useReal, basisYear)                    // -> "2041 dollars" | "Future dollars"
```

`dollarBasisLabel(true)` used to return **"Today's Dollars"** while its own comment says the Real-$ basis is the FIRST SIMULATED RETIREMENT YEAR. That is why the Forecast tab can show "2041 dollars", "Today's Dollars" and "future $" for one figure. Covered by `src/dollarBasisLabel.test.js` (11 tests).

Because two call sites currently pass an **age** (`pcts[0].age`), the label refuses any value outside 1900–2200 and falls back to the honest `"Retirement-year dollars"`. So nothing prints "50 dollars" in the meantime — but those two sites will read "Retirement-year dollars" until you apply items 2 and 3 below.

### 1. Import the helper (App.jsx:96)

```js
import { dollarBasisLabel, deflate, mcMedianAtAge, selectPortfolioAtAge, selectTerminalMeanAtAge } from "./engine/mcSelectors.js";
```

becomes

```js
import { dollarBasisLabel, retirementBasisYear, deflate, mcMedianAtAge, selectPortfolioAtAge, selectTerminalMeanAtAge } from "./engine/mcSelectors.js";
```

### 2. App.jsx:3433 — `MCBandTable` title (currently passes an AGE)

Old:
```jsx
          📊 Age-by-Age Projection Bands · {dollarBasisLabel(useReal, pcts?.[0]?.age)}
```
New:
```jsx
          📊 Age-by-Age Projection Bands · {dollarBasisLabel(useReal, retirementBasisYear(currentAge, retireAge, CURRENT_YEAR))}
```
`currentAge` and `retireAge` are already props of `MCBandTable`.

### 3. App.jsx:11805 — `MCTab` (also passes an AGE)

Old:
```jsx
  const dollarBasis = dollarBasisLabel(real, mc?.pcts?.[0]?.age ?? effRetireAge);
```
New:
```jsx
  const dollarBasis = dollarBasisLabel(real, retirementBasisYear(params.currentAge, effRetireAge, CURRENT_YEAR));
```

**Also delete the `eslint-disable-next-line no-restricted-properties` on line 11804** — it existed only because the old line touched `mc.pcts`. The new line does not, and `noRawMcAccess.test.js` treats a stale disable comment as a defect.

### 4. App.jsx:12911 — `NetWorthTab` (passes nothing today)

Old:
```jsx
            {showRE ? "Incl." : "Excl."} real estate · {dollarBasisLabel(real)}
```
New:
```jsx
            {showRE ? "Incl." : "Excl."} real estate · {dollarBasisLabel(real, retirementBasisYear(p.currentAge, p.retireAge, CURRENT_YEAR))}
```

### 5. App.jsx:12997 — `NetWorthTab` chart subtitle (passes nothing today)

Old:
```jsx
                Typical outcome, every 5 years to age {lastDataAge ?? planAge} · {dollarBasisLabel(real)}{showRE ? "" : " · excludes real estate"}
```
New:
```jsx
                Typical outcome, every 5 years to age {lastDataAge ?? planAge} · {dollarBasisLabel(real, retirementBasisYear(p.currentAge, p.retireAge, CURRENT_YEAR))}{showRE ? "" : " · excludes real estate"}
```

### 6. Optional, but it is the "single" half of the brief

`VerdictHeader` and `MCOverviewCards` each compute `CURRENT_YEAR + Math.max(0, retAge - (currentAge ?? retAge))` inline. Folding both onto `retirementBasisYear(...)` leaves one expression instead of three. `verdictHeader.test.js` and `mcOverviewCards.test.js` already assert the retirement year, so they should stay green.

---

## #12 — [DeepSeek] WP-H: stale strings, verified against the file

**APPLIED by Claude (2026-10-02): 12.1, 12.3, 12.5 in full; 12.2 except the two stress-scenario lines; 12.4 prose lines only.**

**Every line below is quoted from the current file** (`ux/ds-support` @ `8489d5b`). I verified each rather than transcribing the list you sent — see 12.6 for the two places your list did not hold, and the extras I found.

### 12.1 Hard-coded data facts that are now wrong (highest value: they are claims)

Verified: `SAMPLE_START_YEAR = 1928`, `SAMPLE_END_YEAR = 2025` (App.jsx:258-260), and `SP500`, `BONDS`, `INFL` are **98 entries each** (`engine/expectedReturn.js`). Line 3149 already gets this right via `{SAMPLE_YEARS}`.

| Line | Old | Problem |
|---|---|---|
| 12307 | `["Equity data", "99yr S&P 500 (1928–2026)"]` | wrong twice — 98 years, ends 2025 |
| 12308 | `["Inflation source", "2000–2024 actual CPI"]` | `INFL` is the same 98-year 1928–2025 series, aligned to stocks/bonds and unclamped — not 2000–2024 |
| 18543 | `📈 <span style={{ color: "var(--accent-teal)" }}>Equity:</span> 99yr S&P bootstrap [-30 / +30%]` | 99yr → 98yr |
| 18544 | `📊 <span style={{ color: "var(--accent-purple)" }}>Bonds:</span> 50yr Bloomberg [-15 / +20%]` | `BONDS` is also 98 entries, not 50yr |

Suggested direction: derive the year span from `SAMPLE_START_YEAR`/`SAMPLE_END_YEAR` (or `SAMPLE_YEARS`) so these cannot drift again, and describe the inflation source as what it is — the CPI series paired to the same sampled years. These four are the ones a careful reader can catch today.

### 12.2 `MC_PATHS_LABEL` where the RUN's own count belongs

`MC_PATHS_LABEL` is the DEFAULT ("3,000"). It is correct where a default is described — leave 3149, 11442 (`Default {MC_PATHS_LABEL}`) and 3475 (`totalPaths ? … : MC_PATHS_LABEL`, the pattern to copy) alone. But it is wrong where a finished or in-flight RESULT is described, because the user can set a different count:

| Line | Old | Should name |
|---|---|---|
| 18771 | `` {running ? `Running ${MC_PATHS_LABEL} paths...` : …} `` | the count actually being run (sidebar run button — **not on your list**) |
| 11009 | `{" "}{MC_PATHS_LABEL}-path result.` | the run's own `N` |
| 11142 | `{measured ? `✓ ${MC_PATHS_LABEL} paths` : …}` | the measured run's `N` |
| 12088 | `` …success rate across ${MC_PATHS_LABEL} simulated markets… `` | `mc.N` |
| 12145 | `…fully simulated — {MC_PATHS_LABEL} paths across all {planHorizon} years,` | `mc.N` |
| 12299 | `["Applied to", `All ${MC_PATHS_LABEL} paths + the year-by-year plan`],` | `mc.N` |

### 12.3 `endAge` printed as "Retirement Age"

Line 19087:
```jsx
                        title={`Forecast Portfolio · Retirement Age ${endAge} · ${MC_PATHS_LABEL} Scenarios`}
```
`endAge` is the PLAN-END age. Suggested: `Forecast Portfolio · Plan age ${endAge} · ${mc.N} scenarios`. (`14201`'s `Projected Retirement Age ${values.retireAge}` is correct — leave it.)

### 12.4 References to a tab that is now called Forecast

| Line | Old | Note |
|---|---|---|
| 9849 | `are set on the Monte Carlo tab's ⚙ Advanced Settings.` | tab is Forecast |
| 11578 | `both applied on the next run from the Monte Carlo tab.` | same, and pairs with 12.2 |
| 221, 222, 3107, 9576, 9593, 12188 | comments saying "the Monte Carlo tab" | comments only, lower priority |

### 12.5 "Check-in" vs "Checkpoint" — they are two different features

Traced the data flow, and this is a real collision rather than a style choice:

- **`checkIns`** (`LS_CHECKINS_KEY`) — a journal of run snapshots `{ts, successRate, stressRate}`. Shown on the **Progress tab** (`ProgressTab checkIns={…}`, 11347) and written by the year-end modal (`handleSaveCheckIn`, 17443) and the top-bar button (18106). Called **"Check-in"** in the toolbar and the Progress heading.
- **`assumptions.checkpoints`** — the user's *actual* portfolio value on a date `{date, value, note}`, compared against the forecast. Written only at 19047/19050 (`onUpdateCheckpoints` → `updateAssumption("checkpoints", …)`). Called **"Checkpoint"** in the Forecast panel.

**Proposal: `checkIns` → "Check-in" everywhere; `assumptions.checkpoints` → "Checkpoint" everywhere.** The one feature that is misnamed is the **year-end modal**, which writes a check-in but says checkpoint in three places:

| Line | Old | New |
|---|---|---|
| 7889 | `2 &middot; Record a checkpoint` | `2 &middot; Record a check-in` |
| 7892 | `A year-end snapshot of your real balances and success rate. Checkpoints anchor the` | `… A check-in anchors the` |
| 7903 | `{saved ? "Checkpoint saved" : "Save checkpoint"}` | `{saved ? "Check-in saved" : "Save check-in"}` |

That leaves each name meaning exactly one thing, and it matches what the toolbar and Progress tab already say.

### 12.6 Where your list did not hold

- **"Run Monte Carlo from the sidebar" (11692, 11999) is ACCURATE — do not change it.** `MCTab` renders no run control; the only run button is the sidebar's at 18771, labelled `▶ Run Monte Carlo`. The same goes for 13082, 13551, 18303, 18991, which all point at that button by name. Only "the Monte Carlo **tab**" is stale.
- **`MC_PATHS_LABEL` is correct in more places than not** (12.2): it describes a default at 3149/11442, and 3475 already prefers the real count. Changing "Run Monte Carlo" in a *button label* would be wrong too — that is the action's name.

### 12.7 Extras your list did not include

- 18771 sidebar run button counts the default while running (12.2) — user-visible during every non-default run.
- 18544 "50yr Bloomberg" (12.1).
- The stale `eslint-disable` at 11804 in #11.

If any item is wrong, say so and I will re-grep rather than argue — this list is evidence, not opinion.

---

## #13 — [DeepSeek] WP-G mount: `CheckpointsPanel`

**APPLIED by Claude (2026-10-02): mounted, old block and dead state removed.**

**Ready to mount.** `src/forecast/CheckpointsPanel.jsx` + `src/checkpointsPanel.test.js` (9 tests). Props in, callbacks out; it imports only `../engine/ages.js` and `../engine/mcSelectors.js`, never `App.jsx`. It holds no source of truth.

### 1. Import

```js
import CheckpointsPanel from "./forecast/CheckpointsPanel";
```

### 2. Replace the current panel (App.jsx:12322-12488, the whole `<div className="chart-card">` block under the "Track against reality" GroupHeading)

Delete that block and mount:

```jsx
      <CheckpointsPanel
        checkpoints={checkpoints}
        mc={mc}
        retireAge={effRetireAge}
        dob={dob}
        currentPort={params?.port || 0}
        fmtDollar={fmtDollar}
        onUpdate={onUpdateCheckpoints}
        onDelete={onDeleteCheckpoint}
        onSetBaseline={onSetBaselineFromCheckpoint}
      />
```

Keep the `<GroupHeading label="Track against reality" … />` immediately above it — that heading is the tab's, not the panel's.

**`fmtDollar` is a required prop on purpose.** The panel has only a plain fallback; passing App's own keeps one formatter instead of two that can round differently.

### 3. The panel now owns its own header

It renders the collapse control itself (a real `<button>` with `aria-expanded`, styled to match `SectionHeader`). So `MCTab` no longer needs `showCheckpoints` / `setShowCheckpoints` (11770, 12326-12327) for this panel.

### 4. These become dead once the block is gone — safe to delete

`startEdit` (11911), `cancelEdit` (11919), `handleSaveCheckpoint` (11927), and the state they used: `showAddCheckpoint`, `editingId`, `newCpDate`, `newCpValue`, `newCpNote`, `expandedId`/`expandedCpId`. Grep each before deleting; some names are also used by other panels.

### What the move fixed (each was a defect, not taste)

1. **Emoji-only actions.** `✏️ 🗑️ 📍` now read `Edit` / `Delete` / `Set baseline`, each with an `aria-label` naming the row. `📍` had no accessible name at all.
2. **"Set baseline" now confirms** and states the consequence — it rewrites every account balance, so it should not sit one click from Delete. Cancel is available.
3. **Save explains itself.** It used to `return` silently on an empty date or value; now it says which field is missing. A non-existent date (`2020-13-99`) is refused too — the old shape check accepted it.
4. **The table says when it is truncated**: "Showing the 6 most recent of 9 checkpoints."

Behaviour is otherwise identical: same columns, same `real: false` comparison against the median for that age (with the original reasoning kept in a comment), same expansion narrative, same `selectPortfolioAtAge` route.

### One thing I did NOT change, and why

The panel still lists the 6 most recent rather than paginating. Adding a pager is a design decision, not a defect; the count line makes the truncation honest in the meantime. Say the word if you would rather it paginate.

---

## #14 — [DeepSeek] The mortality curve is an empty shell on the Stress test chart

**Reported by the owner after deploying v1.2.148:** toggling **Mortality** on Analysis → Stress Test adds a chart at the bottom with axes and a grid but **no curve**.

### Cause: the Stress mount never passes `currentAge`

`App.jsx:11313-11327` mounts `FanChart` for the stress test with `pcts, retireAge, ssAge, rmdAge, inf, useReal, title, checkpoints, portfolioGoal, earlyRetireTarget, dob, sex` — but **no `currentAge` and no `currentPort`**. `computeSurvivalCurve` bails on a falsy age:

```js
const mortalityData = useMemo(() => {
  if (!currentAge) return [];        // stress chart lands here

const mortByAge = useMemo(() => { … }, [mortalityData]);   // {}
const dataWithMortality = … mortByAge[d.age] ?? null       // every row null
```

So every `survival` value is `null` and `<Line dataKey="survival">` has nothing to draw.

**Why the chart still appears:** the legend strip is correctly gated twice —

```jsx
{showMortality && medianDeathAge && (   // hidden here: medianDeathAge is null
```

— but the chart itself is gated only on the toggle:

```jsx
{showMortality && (                     // renders anyway, empty
  <ResponsiveContainer width="100%" height={140}>
```

That asymmetry is what makes it look like a new, broken graph instead of a toggle that quietly did nothing. It is a defect in its own right, independent of the missing prop.

### Fix 1 — pass the props (App.jsx:11313)

Add to the stress `FanChart`:

```jsx
                        currentAge={currentAge}
                        currentPort={params.port}
```

That is what the Forecast mount at `18988` already does, with a comment explaining `currentAge` must be the DERIVED age rather than `assumptions.currentAge`. The same omission also disables the accumulation ramp and the "you are here" dot on that chart, since `accumData` returns `[]` without `currentPort`.

### Fix 2 — never render an empty survival chart

Gate the second chart on having data, so this class of bug cannot look like a feature:

```jsx
{showMortality && dataWithMortality.some((d) => d.survival != null) && (
```

Cheap, and it means a future missing prop shows nothing at all rather than a hollow chart.

### Design question for the owner, not for me to decide

The separate chart below the fan is **deliberate**, not new behaviour — see the comment at `App.jsx:5918-5921`: a shared age x-axis is used *"without faking a dual-axis alignment between dollars and probability."* So the curve is meant to sit underneath, not overlay the fan.

Two consequences worth a decision:

1. If the owner expected the curve to **overlay** the fan chart, that is a change of design, not a bug fix, and it reopens the dual-axis question that comment settled.
2. On the **Stress test** chart the curve is identical to the Forecast one (it depends only on the user's age and sex, not on the sampled sequence), so it may be redundant there. Dropping the Mortality toggle from the stress chart is a defensible alternative to Fix 1.

I have not applied any of this — `src/App.jsx` is yours. Say which of Fix 1 / Fix 2 / drop-the-toggle you want and I will stop asking.
