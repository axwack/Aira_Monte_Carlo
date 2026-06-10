# AiRA Monte Carlo — Requirements & Audit Log

Living document tracking the business-logic requirements of the forecaster, what has
been fixed, and the open backlog from the June 2026 code review. Update this file
whenever engine rules change.

Last updated: **2026-06-10** (branch `feature/ai-action-plan-cloudflare`)

---

## 1. Tax & Retirement Logic Requirements

These are the rules every engine (`runMC`, `simulateDeterministicWithStrategy`,
`buildWithdrawalWaterfall`, `buildRothExplorer`) must follow. Status reflects the
codebase as of the date above.

| # | Requirement | Status |
|---|-------------|--------|
| R1 | RMD start age follows SECURE 2.0 by birth year: pre-1951 → 72, 1951–1959 → 73, 1960+ → 75. User override (`rmdStartAge`) wins. Never hardcode 73. | ✅ Implemented |
| R2 | Default RMD divisors use IRS Pub 590-B **Table III (Uniform Lifetime)**, 2022+ values (26.5 at 73). `useJointRmdTable` switches to Table II (spouse >10y younger). | ✅ Implemented |
| R3 | Social Security taxed per **IRC §86 provisional-income tiers**: provisional = other ordinary income + ½ SS; 0% below $32K/$25K (MFJ/single), up to 50% between thresholds, up to 85% above $44K/$34K. Thresholds are statutory and NOT inflation-indexed. Single shared helper: `taxableSocialSecurity()` in `src/engine/buildRothExplorer.js`. | ✅ Implemented |
| R4 | Federal brackets, standard deduction, and IRMAA tiers index forward at the user's assumed long-run inflation rate (`p.inf`), compounded from 2026 — never a single bootstrapped year's draw raised to a multi-year power. | ✅ Implemented |
| R5 | IRMAA MAGI = AGI (which already contains only the *taxable* portion of SS) + tax-exempt interest. The untaxed SS portion is **not** added back (that's an ACA-MAGI rule, not Medicare). | ✅ Implemented |
| R6 | IRMAA tier-1 2026: **$218K MFJ / $109K single**. Single tiers = half the MFJ thresholds except the top tier ($500K vs $750K); surcharge is per person (single pays half the two-person MFJ amount). One value everywhere — no 212K/218K drift. | ✅ Implemented |
| R7 | Withdrawal waterfall order: fixed income → RMD → cash → taxable → pretax (bracket-ceiling-capped in smart mode, IRMAA guard at 63+) → Roth (emergency reserve respected). | ✅ Implemented (pre-existing) |
| R8 | SS torpedo landmine flags years where provisional income exceeds the **lower** IRC §86 threshold and some SS is actually being taxed. | ✅ Implemented |
| R9 | Renters' housing cost and fixed carveouts inflate at **cumulative** inflation from 2026, not a single year's draw. | ✅ Implemented |
| R10 | Roth conversion bracket-fill: conversion income raises provisional income and drags more SS into taxation; explorer recomputes taxable SS with the conversion included. | ✅ Implemented |

## 2. Fixed 2026-06-10 (this change)

All six WRONG findings from the logic audit, plus two bugs found during the fix:

1. **RMD age hardcoded to 73 in `runMC`** (`src/App.jsx`) — now uses
   `getRmdStartAge({dob, birthYear, currentAge})` with `p.rmdStartAge` override.
   `buildWithdrawalWaterfall` also gained the same override for engine consistency.
2. **SS always taxed at 85%** in `calcYearTax`, waterfall `yearTax`, Roth explorer,
   and the Current-Year Conversion calculator — all four now use the shared
   `taxableSocialSecurity()` IRC §86 helper.
3. **Wrong RMD table**: the default `RMD_DIV` was a Joint & Last Survivor (Table II,
   ~9-year gap) table mislabeled as Uniform. Replaced with true Uniform Lifetime
   Table III values, extended to age 105 (both `App.jsx` and the engine copy).
4. **MC bracket indexing compounded a single bootstrapped inflation draw**
   (`(1+inflY)^(yr-2026)`) for tax brackets, the smart-waterfall cap, and the
   bracket-fill conversion ceiling — now all index at `p.inf` (constant assumed rate).
5. **MAGI drift between engines**: waterfall added untaxed SS back into IRMAA MAGI;
   App.jsx didn't. Standardized on the IRS-correct definition (no add-back).
6. **IRMAA ceiling drift**: 212,000 (`getBracketCeiling`) vs 218,000 (`runMC`,
   waterfall). Unified at 218K MFJ / 109K single; `irmaaCost()` is now
   filing-status-aware and takes the user's inflation rate (was hardcoded 1.025 in
   App.jsx only).
7. **(new find)** Renters' housing cost was `annualRent × inflY` (≈3% of actual rent —
   renters were nearly free) and carveouts likewise. Both now use cumulative inflation.
8. **SS torpedo detection** only fired above the upper threshold; now flags from the
   lower threshold whenever SS is actually being taxed.

Tests: suite updated where it encoded the old behavior; 256 passing
(`computations.test.js` gained 0%-tier and 50%-tier SS cases).

## 3. Known Limitations (accepted simplifications — revisit)

- **No LTCG / cost-basis model.** Taxable-brokerage withdrawals are invisible to the
  tax calc (treated as 100% return of basis) and excluded from provisional income.
  Biases results optimistic for taxable-heavy portfolios. Candidate fix: user-set
  "% of taxable account that is unrealized gains," taxed at 0/15/20% LTCG brackets
  and included in provisional income + MAGI.
- **IRMAA 2-year lookback** is ignored — surcharge applies to same-year MAGI.
- **Bracket-cap "income so far" estimates** (smart waterfall, both engines) assume
  85% SS inclusion deliberately: the pretax draw being sized affects provisional
  income, so worst-case inclusion keeps the cap conservative (never overshoots).
- **Conversion room** in the Roth explorer is computed against pre-conversion taxable
  income; the SS dragged in by the conversion itself can push slightly past the
  bracket top (exact solution requires iteration).
- **BETR is referenced in UI copy but not computed** anywhere. Either implement
  Vanguard's `1 − afterTaxValue_conversion / futurePreTaxValue` or remove the copy.
- **AI-context SS summaries** (`App.jsx` Roth explorer export, ~line 4230) still
  approximate lifetime taxable SS at a flat 85% for display only.
- `runStress` uses the simpler `taxDragRate` model, not `calcYearTax`.

## 4. Backlog — Code Size & Performance (from 2026-06 review)

Prioritized; estimated ~2,500–3,000 lines removable from `src/App.jsx` (10.5K lines).

1. **Countdown re-renders the whole app at 1 Hz** — `useCountdown` ticks state in the
   root component and nothing is memoized. Move into a self-contained component.
2. **Delete dead code** (~640 lines in App.jsx): `simulateDeterministic` (old copy),
   `generateActions`, `Bucket1Panel`, `ActionTile`, `PeopleViz`, `countdownDays`
   (references nonexistent `DDAY`), unreachable `"fan"` tab branch. Plus
   `src/ai/gemini.local.js` (273 lines, never imported) and
   `netlify/functions/analyze.js` (316 lines, stale Anthropic-SDK fork no client
   calls; live target is `functions/api/` on Cloudflare) → also drop
   `@anthropic-ai/sdk` from package.json.
3. **Deduplicate App.jsx against `src/engine/buildRothExplorer.js` exports** (~280
   lines): `STATE_BRACKETS`, `getStateBrackets`, fed brackets, `progTax`, `idxB`,
   `irmaaCost`, `getRmdStartAge`, RMD tables, `guytonKlingerWithdrawal`. The
   212K/218K drift fixed above came from exactly this duplication.
4. **Withdrawal-strategy switch implemented 3×** (`runMC`,
   `simulateDeterministicWithStrategy`, dead copy) — extract one
   `nextSpending(strategy, ctx)` helper (~150 lines, kills observed drift).
5. **Run `runMC`/`runStress` in a Web Worker** (currently freezes UI for 5,000 paths)
   and hoist bracket-array construction out of `calcYearTax` (called ~105K times/run).
6. **Memoize** `evaluateRulesEngine` / `solveRetirementDate` in ActionPlanTab; hoist
   `InputsPanel` (RothLadder) and `Header` (WithdrawalPlanCombined) out of render
   bodies (remount every render; causes input focus loss).
7. **Prune package.json**: `moment`, `claude`, `react-is`, `@vercel/analytics`,
   `typescript`/`@types/*` unused; `wrangler` → devDependencies; fix
   `"main": "src/index.tsx"` (file doesn't exist).
8. **Make the AI module genuinely lazy**: App.jsx statically imports
   `ai/ai-analysis.js` (line ~68) which defeats the dynamic `import()` in
   ActionPlanTab; ~650 dormant AiraAITab lines ship in the main bundle.
9. **Consolidate UI primitives**: 4 near-identical chart tooltips, ⓘ info-badge
   repeated 14×, duplicate `fmtN`/`fmtM` formatters, 13 `useState`s mirroring
   `assumptions` with manual sync (live bug source).

## 5. Backlog — UI/UX (from design audit)

1. **Single point of control**: retire age, plan-to age, contributions, spend, SS
   age/benefit editable in BOTH sidebar and Profile tab with manual two-way sync.
   Make sidebar authoritative; Profile becomes read-only summary + "edit in sidebar".
2. **Styling**: ~1,085 inline `style={{}}` objects; `styles.css` is 4 unused lines
   while the real stylesheet is a template literal (`CSS`, App.jsx ~1677). Extract
   `.card`, section-label, and color tokens; move CSS into the real stylesheet.
3. **Magic display numbers**: "3,000 paths"/"2,000 scenarios" retyped in six UI
   strings independent of the `runMC(…, 3000…)` call; GK 65/135 defaults hardcoded
   in engine + two inputs + prose. Define `MC_PATHS`, `STRESS_PATHS`,
   `GK_FLOOR_DEFAULT_PCT`, etc. once and interpolate.
4. Tab font-size 18px vs 13px body (looks like a typo); "MC Engine" diagnostics card
   should be an info-modal link, not a permanent sidebar card; header mixes
   export/import, donation, about, feedback in one undifferentiated row.
