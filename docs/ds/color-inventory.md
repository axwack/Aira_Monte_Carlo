# Color inventory and approved semantic mapping

Baseline: `ux/configure-and-countdown` at `c572584`.

## Approved semantic model

- Green/amber/red are outcome-status colors only.
- Blue/teal identify editable user inputs.
- Neutral white/slate identify calculated financial values.
- Stable category palettes identify accounts, buckets, and chart series.

The important conflict is that the current positive token (`--positive: #14b8a6`) and the app's teal accents (`--accent-teal: #4fd1ae`) are both perceived as green/teal. They cannot simultaneously mean “good outcome” and “editable input.” Choose distinct hue pairs before applying a broad re-theme.

## Current inventory

| Surface / figure | Current rule | Current visual meaning inferred | Approved category | Concern |
|---|---|---|---|---|
| VerdictHeader withdrawal rate | `var(--positive)` ≤3%; `#34d399` ≤4%; amber ≤5%; `var(--negative)` >5% (App.jsx:11645-11648) | heuristic withdrawal-risk verdict | outcome status | Uses several greens/amber thresholds; document thresholds in one helper. |
| VerdictHeader money outlives you | `rateColor(outlives)` (11651-11655) | probability/status | outcome status | Correct category; should use the same status scale as Success Rate. |
| VerdictHeader worst case | gold if positive, red if ≤0 (11658-11662) | dollar figure plus risk | calculated value + outcome status | Gold currently reads as a second “good” color; use neutral value text and a separate risk indicator if needed. |
| VerdictHeader runs out | green when `Never`, gold for an age (11665-11669) | outcome status | outcome status | Amber is reasonable for a failure age; clarify that age is not automatically a crisis when few paths fail. |
| Success-rate hero | `rateColor(mc.rate)` (11960) | success probability | outcome status | Keep green/amber/red. |
| Median Final Balance | `var(--accent-teal)` / blue InfoModal accent (11977-11984) | calculated dollar value | neutral calculated value | Teal currently implies success/input; use neutral white/slate. |
| Forecast mean/best/median summary | `INFO_ACCENT.money`, `INFO_ACCENT.positive`, etc. (11560-11582) | mixed dollar/category colors | neutral calculated values | Remove status colors from ordinary dollar figures. |
| Net Worth peak liquid | `var(--positive)` (12971+) | asset dollar | neutral calculated value | Green implies the amount itself is favorable. |
| Mortgage values/equity/interest | teal/gold/purple per metric (12993-13005; 12656+) | category-specific | neutral calculated value | Use neutral values; reserve amber/red for debt/risk callouts. |
| Income legend | Savings teal, Social Security purple, Annuity/Rental blue, Pension/Other gold, one-off pink, Roth gold (5931-5938) | data series | stable category palette | Keep distinct colors, but rename Annuity/Rental and ensure legend is consistent across charts. |
| Expense legend | core accent, mortgage orange, medical green, LTC purple, other gray, tax red (5940-5947) | data series | stable category palette | Medical green must not be mistaken for favorable status; chart legend context is required. |
| Bucket cards | B1 `#0ea5e9`, B2 `var(--accent-purple)`, B3 `var(--positive)` (10406-10414) | time horizon | stable bucket palette | Export a single table and use it in cards, chips, keys, and charts. |
| User-editable controls | `--accent-teal`, `--accent`, blue borders, assorted accents | editable/input | input accent | Choose one primary input hue; do not reuse the positive-status token. |

## Proposed hue pair options

### Recommended

- Outcome status: green `#22c55e`, amber `#f59e0b`, red `#ef4444`.
- Editable inputs: blue `#60a5fa` / blue border `#3b82f6`.
- Calculated values: `var(--text-primary)` or slate `#cbd5e1`.
- Categories/buckets: retain dedicated palette, but never use those colors to imply good/bad.

This is the easiest for users to interpret and separates the current teal collision.

### Alternative

- Outcome status: teal `#14b8a6`, amber `#f59e0b`, red `#ef4444`.
- Editable inputs: purple `#a78bfa`.
- Calculated values: neutral.

This preserves more of the current theme but makes green/teal success less conventionally obvious.

Do not implement the alternative without owner approval. The approved direction is the recommended pair unless the owner says otherwise.
