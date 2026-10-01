# DeepSeek brief — AiRA UX Round 2 support lane

You are working in a **git worktree**: `/home/nono/Projects/aira-ds`, branch `ux/ds-support`.
Claude owns the main checkout (`/home/nono/Projects/Aira_Monte_Carlo`, branch `ux/configure-and-countdown`).
Read `CLAUDE_CODE_ROUND2_UX_SPEC.md` (in the main checkout) for context.

## The one rule
**You never edit `src/App.jsx`** (or any existing file). Claude is the only person who edits it.
You may only ADD these files:

| You may create | Purpose |
|---|---|
| `docs/ds/*.md` | reports and proposals (commit with `git add -f`; `*.md` is gitignored) |
| `src/engine/bucketColors.js` + `src/bucketColors.test.js` | single bucket-color table |
| `src/engine/incomeLabels.js` + `src/incomeLabels.test.js` | income/expense row labels, tooltips, "not entered" rule |
| `src/tzDates.test.js` | TZ=America/New_York regression test for `parseCalendarDate` |

Run `docs/ds/check-scope.sh` before every commit. If it prints OUT OF LANE, undo that change.

## Deliverables (in priority order)
1. `docs/ds/color-inventory.md` — table: each headline figure (VerdictHeader, result cards, summary grid, Net Worth metrics, stress grid, income legend) -> current color -> approved category (spec 4.1). **Flag the conflict:** success green and the accent are both teal (~#5BB5A2), so "teal = user input" and "green = good outcome" are indistinguishable. Propose two distinct hue pairs.
2. `docs/ds/contrast-audit.md` — measured contrast ratios for `--text-faint`, `--text-muted`, `--text-secondary` vs `--card-bg` and `#0d1b2a`; proposed replacement values meeting 4.5:1 (body) / 3:1 (9-11px labels) as ready-to-paste CSS lines.
3. `src/engine/bucketColors.js` (+ test) — export one table `{ b1, b2, b3 }` plus a `bucketColor(n)` helper. Map where each surface currently gets its colors and list drift in `docs/ds/bucket-colors.md`.
4. `src/engine/incomeLabels.js` (+ test) — export: renamed labels ("Rental/Passive Income", "Savings & 401(k)/IRA Drawdown"), a one-sentence tooltip per row saying which input feeds it and where that input lives, and `displayRow(label, amount, {entered})` returning `"—"`/"not entered" when nothing was entered. Pure functions, no React.
5. `docs/ds/engine-factcheck.md` — verify in `src/engine/buildWithdrawalWaterfall.js` (~569-581, 830-832) when the mortgage is netted out of the spend target, so "Mortgage/Housing" can be labeled truthfully. Cite file:line. Do not change the engine.
6. `docs/ds/plan-inputs-map.md` — every user-editable input: current location (tab/section/line), proposed Plan Inputs section, single source of truth.
7. `docs/ds/budget-editor-spec.md` — field set for an inline detailed-budget editor (spec only).
8. `src/tzDates.test.js` — `parseCalendarDate("2018-09-14")` renders Sep 14 under `TZ=America/New_York`.

## Needing a change in App.jsx?
Write it to `docs/ds/APP_JSX_REQUESTS.md` as numbered items:
`#N — file:line — what to change — exact replacement snippet — which test covers it`.
Claude applies them. Do not apply them yourself.

## Corrections to your Round 2 spec (verified by Claude)
- Item 5 is NOT refuted: Advanced Settings From/Through use `ANumInput`, which formats unfocused values with `Intl.NumberFormat('en-US')` (-> "1,928"). Not an OCR artifact.
- "Annuity/Rental" in Isis's data most likely comes from the property "Annual income" field ($200,000 visible in her mortgage-calculator screenshot), not the annuity field. Defaults are 0.
- Baseline is now `c572584`, not `6dc346c`.

## Staying current
Claude may add commits on `ux/configure-and-countdown`. Pull them in with:
`git merge ux/configure-and-countdown` (never rebase; never force-push).

## Handing back
Commit small, with clear messages, and tell the user "ready to merge". Claude merges.
