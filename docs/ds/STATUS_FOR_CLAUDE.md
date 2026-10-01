# DeepSeek lane status for Claude

Updated: 2026-10-01

## Current state

The DeepSeek support lane is complete and clean.

- Working directory: `/home/nono/Projects/aira-ds`
- Branch: `ux/ds-support`
- Claude's main checkout: `/home/nono/Projects/Aira_Monte_Carlo`
- Claude's branch: `ux/configure-and-countdown`
- DeepSeek did **not** edit `src/App.jsx` or any existing source file.
- DeepSeek's working tree is clean.

## Commits ready to merge

The lane has two DeepSeek commits:

```text
7b90880 docs(ds): add App.jsx integration requests
e28a0bc docs(ds): add UX support audits and pure helpers
```

The branch already includes Claude's base through:

```text
b569975 chore(marks): re-stamp mc-advanced-settings after intentional year-input change
```

## What was added

### Reports and specifications

- `docs/ds/color-inventory.md`
  - Current color usage mapped to the approved semantic model.
  - Identifies the teal/green collision between input accents and positive outcomes.
  - Recommends distinct outcome and input hue pairs.

- `docs/ds/contrast-audit.md`
  - WCAG contrast calculations for dark and light theme text tokens.
  - Current dark-mode failures for `--text-muted` and `--text-faint`.
  - Recommended dark values:

    ```css
    --text-muted: #7f8b9c;
    --text-faint: #778395;
    ```

- `docs/ds/bucket-colors.md`
  - Maps existing bucket color drift.
  - Documents the proposed single source of truth.

- `docs/ds/engine-factcheck.md`
  - Explains when Mortgage/Housing is modeled and why a bare `$0` is misleading.
  - No engine code was changed.

- `docs/ds/plan-inputs-map.md`
  - Maps current editable fields into the approved Plan Inputs architecture.
  - Identifies the canonical source for each input.

- `docs/ds/budget-editor-spec.md`
  - Proposal for a future inline detailed-budget editor.
  - This remains a separate follow-up feature.

- `docs/ds/APP_JSX_REQUESTS.md`
  - Exact integration requests for Claude, since Claude owns `src/App.jsx`.

### Pure helpers and tests

- `src/engine/bucketColors.js`
- `src/bucketColors.test.js`
- `src/engine/incomeLabels.js`
- `src/incomeLabels.test.js`
- `src/tzDates.test.js`

The helpers are intentionally not wired into `App.jsx` yet. Claude should integrate them using `docs/ds/APP_JSX_REQUESTS.md`.

## Validation completed

- Scope guard: passed.
- Targeted tests after syncing the latest Claude base: **17 passed**.
- Full test suite before the final base synchronization: **1,192 passed, 14 skipped**.
- Production build: compiled successfully.
- No Monte Carlo, withdrawal, tax, RMD, mortgage, or bucket-accounting math was changed.

## Merge instructions

From Claude's checkout:

```bash
cd /home/nono/Projects/Aira_Monte_Carlo
git checkout ux/configure-and-countdown
git status
git merge --no-ff ux/ds-support
```

The merge should be clean because DeepSeek added only new files and Claude owns `src/App.jsx`.

After merging:

```bash
npm test -- --watchAll=false --runInBand
npm run build
```

## Claude's remaining work

1. Read `docs/ds/APP_JSX_REQUESTS.md`.
2. Wire `bucketColors.js` into true bucket surfaces while keeping tax-category colors separate.
3. Wire `incomeLabels.js` into the Income/Expenses chart.
4. Add truthful provenance and “not entered” states for zero rows.
5. Route Real Estate/Mortgage editing through the canonical Plan Inputs location.
6. Add `Edit in Plan Inputs` links from read-only Analysis/Net Worth surfaces.
7. Apply the approved color semantics selectively; do not perform an unreviewed app-wide re-theme.
8. Apply the contrast recommendations after visual verification.
9. Reproduce and fix the two screenshot-based layout issues at 1024/1280/1440px.
10. Run the full suite and production build on the merged result.

## Important scope rule

DeepSeek's lane is not a second editor for `src/App.jsx`. If further App.jsx changes are needed, Claude should implement them directly or record them in `docs/ds/APP_JSX_REQUESTS.md` for review. If Claude adds commits to `ux/configure-and-countdown` before merging, DeepSeek should sync with:

```bash
cd /home/nono/Projects/aira-ds
git merge ux/configure-and-countdown
bash docs/ds/check-scope.sh
```

Do not rebase or force-push either lane.
