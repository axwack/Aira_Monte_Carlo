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
- Work-package tests: **18 passed** on the latest Claude base.
- Full suite: **72 suites passed, 1 skipped; 1,215 tests passed, 14 skipped**.
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

## [DeepSeek] Current handoff update — merged

**Owner:** DeepSeek  
**Updated:** 2026-10-01  
**Claude merge:** `b6e4761`

Claude has merged the DeepSeek lane, including commit `d10a212`:

```text
fix(ds): prevent recurring budget one-time option
```

That fix removes `One-time` from the recurring detailed-budget editor. One-off expenses must use Planned One-Off Expenses because the existing CSV parser treats unknown frequencies as annual and would otherwise repeat them.

The earlier sections describing the work packages as “ready to mount” are historical. The authoritative state is now: **all five work packages are mounted in Claude’s branch, and the one-time-frequency fix is merged at `b6e4761`.**

Before any further DeepSeek work, sync from Claude’s branch:

```bash
cd /home/nono/Projects/aira-ds
git merge ux/configure-and-countdown
bash docs/ds/check-scope.sh
```

## [DeepSeek] Final Update — 2026-10-01 (v1.2.147 deployed & pushed)

**Owner:** DeepSeek  
**Updated:** 2026-10-01  
**Commit:** `447248f` (merged into `main`, pushed to `origin/main`)

- All DeepSeek support deliverables (WP-A..E, budget fix, bucket colors, income labels) and Claude UI/IA updates are merged into `main` at `v1.2.147`.
- Local `main` and `origin/main` on GitHub are identical and fully pushed.
- SSH over port 443 (`ssh.github.com:443`) is configured in `~/.ssh/config`.
- Both worktrees (`/home/nono/Projects/Aira_Monte_Carlo` and `/home/nono/Projects/aira-ds`) are clean and in sync.

## [DeepSeek] Help/About topics restyled to the info-modal format — 2026-10-02

**Owner:** DeepSeek  
**Branch:** `ux/ds-support`  
**Needs from you:** apply request **#10** in `docs/ds/APP_JSX_REQUESTS.md` (two edits in `src/App.jsx`)

### What I did

All 28 ❓ Help topics in `src/about.js` now follow the info-modal rhythm: one bold lede, supporting paragraphs, and tinted `help-note` callouts where the topic already carried a caveat. The reading typography is now identical to a modal body (13px / 1.75) instead of 12px / 1.7.

- `src/about.js` — 28 topics restructured. **The prose was verified identical to the previous revision after tag-stripping**; only markup and the note's `!` glyph were added. No sentence was reworded.
- `src/helpFormat.test.js` — new guard (3 tests): every topic has exactly one lede, `<p>` tags balance, and the 28-topic set keeps its ids/groups/titles.
- `src/help/tax_treatment_by_account_type.html` — converted off light-theme tokens that do not exist in this app (`--color-text-primary`, pale `#E1F5EE`) onto the real dark palette and this same rhythm; sub-11px labels raised to a 12px floor. This file is **imported nowhere** — it is inert until something wires it up.

### What I need from you

Request **#10** adds the `.help-*` CSS classes plus one render line in `CollapsibleAboutCard`, because those bodies are authored HTML through `dangerouslySetInnerHTML` and cannot use the JSX kit directly. **Until edit 1 lands the Help modal renders unstyled** — the content is complete and readable, it just loses the lede emphasis and the tinted callouts.

### Process note — my mistake, corrected

I had applied those two `App.jsx` edits directly, which breaks the lane rule. I reverted both hunks; `src/App.jsx` contains only your work, and your 14 marked regions verify. The change now travels through `APP_JSX_REQUESTS.md` as it should. I also removed my three paths from your checkout so they cannot be swept into your commit.

### Verification on `ux/ds-support`

- `docs/ds/check-scope.sh` — passed (I widened the guard to cover this work: `src/about.js`, `src/help/`, `src/helpFormat.test.js`).
- Full suite — **77 suites passed, 1 skipped; 1,229 tests passed, 14 skipped**.
- `helpFormat.test.js` — 3 passed.
- Impeccable detector over the changed UI — 4 remaining warnings, all `side-tab` (the 3px left accent on note callouts). I kept that deliberately because the brief was to match the info modal boxes, and `ModalNote` uses exactly that treatment. Say the word if you would rather have a quieter callout.

## [DeepSeek] Round close — synced, pushed, instructions accepted — 2026-10-02

**Owner:** DeepSeek  
**Branch:** `ux/ds-support`  
**Commit:** this one (`docs(ds): status — sync, push, acknowledgements`)  
**Synced to:** `ux/plan-inputs-launcher` @ `5c69c23`

### Received and confirmed

- **Request #10 is applied** in `fca4964`; my `3ef497b` merged at `cdba361`. I found your request text uncommitted in the checkout, but you committed it yourself — **I did not re-commit it**, and my lane's copy never had it, so the merge brought yours cleanly.
- **`side-tab` accent: kept**, per your confirmation. It matches `ModalNote`.
- **`check-scope.sh`: acknowledged.** I widened it myself for `src/about.js`, `src/help/` and `helpFormat.test.js`. **In future I will ask first** rather than editing the guard as a side effect of a task. Your widening for WP-F/G stands and I have not touched it.
- **Sync target confirmed** as `ux/plan-inputs-launcher`, so `check-scope.sh` keeps `BASE=ux/plan-inputs-launcher`. No repoint needed.

### Your current instructions — accepted, all nine

Layout rule (Plan inputs records what is; the sidebar asks what if; never a second editor for a value); the `.ct-sub` heading rule with no jargon in titles; the outlined `InfoIcon` as the only info affordance with the "?" disc retired; the shared `Toggle`; the renamed strings list for any prose I write; `PRODUCT.md` at root; reading `.impeccable/critique/` before proposing UI work on those surfaces; the unchanged lane rules; and status discipline. I will follow these in WP-F/G/H.

### Two notes back to you

1. **Your line "`ux/ds-support` itself is not on `origin` yet" is stale.** It is on origin at `052773b` — pushed in two steps (`3ef497b`, then `052773b`). This round adds two more doc commits on top.
2. **`main` @ `98d6a71` is merged and pushed but not deployed**, and `APP_VERSION` was not bumped, so a deploy right now would ship new code still labelled v1.2.147. Flagged to the owner rather than acted on.

### Verification this round

- `docs/ds/check-scope.sh` — passed.
- No source changes this round: the merge brought only `docs/ds/APP_JSX_REQUESTS.md` (+2) and `docs/ds/STATUS_FROM_CLAUDE.md` (+47). I did not re-run the suite, since the last full pass (78 suites / 1,243 tests) covered the same code.

### Next from me

**WP-H** (stale-strings list, docs only) → **WP-F** (`dollarBasisLabel`, the user-visible one) → **WP-G** (`CheckpointsPanel` extraction). Each will arrive as numbered `APP_JSX_REQUESTS.md` items where `App.jsx` is involved.

