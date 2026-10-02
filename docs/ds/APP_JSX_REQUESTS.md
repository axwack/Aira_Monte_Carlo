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
