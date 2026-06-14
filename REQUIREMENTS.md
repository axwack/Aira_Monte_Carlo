# AiRA Monte Carlo — Requirements & Audit Log

Living document tracking the business-logic requirements of the forecaster, what has
been fixed, and the open backlog from the June 2026 code review. Update this file
whenever engine rules change.

Last updated: **2026-06-13** (branch `main`)

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
2. ✅ **DONE** — **Delete dead code** (~590 lines removed from App.jsx):
   `simulateDeterministic` (old copy), `generateActions`, `Bucket1Panel`
   (+ `_B1_KEY`/`_loadB1`), `ActionTile`, `countdownDays`
   (referenced nonexistent `DDAY`), unreachable `"fan"` tab branch.
   `PeopleViz` was already gone in `main`. Deleted `src/ai/gemini.local.js`
   and `netlify/functions/analyze.js` (and `netlify.toml`); dropped
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
6. **(partial)** **Memoize** `evaluateRulesEngine` / `solveRetirementDate` in
   ActionPlanTab; hoist `InputsPanel` (RothLadder) and `Header`
   (WithdrawalPlanCombined) out of render bodies (remount every render; causes
   input focus loss). ✅ `Header` hoisted to module-scope
   `WithdrawalSectionHeader`. Still open: `InputsPanel` + the two memoizations.
7. ✅ **DONE** — **Prune package.json**: removed unused `moment`, `claude`,
   `@vercel/analytics`, `typescript`, `@types/react`, `@types/react-dom`;
   moved `wrangler` → devDependencies; fixed `"main": "src/index.tsx"` →
   `"src/index.js"`. NOTE: `react-is` is **kept** — the audit listed it as
   unused, but `recharts` imports it and npm does not hoist it here, so
   removing it breaks the build.
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

## 6. Withdrawal logic — 2026-06-13 session

### Fixed

| # | What | Commit |
|---|------|--------|
| ✅ ENG-3 | `simulateDeterministicWithStrategy` reuses `buildWithdrawalWaterfall`'s source-aware tax via an age→tax lookup map. Before: Withdrawal Analysis treated every portfolio draw as ordinary income (overstated fed tax on taxable / Roth draws). After: Waterfall tab and Withdrawal Analysis tab agree on per-year fed/state tax. Also exposed the State Tax column that the waterfall engine already computed. | `1bff6e8` (prior) |
| ✅ ENG-4 | New **Bengen 4% Rule** strategy: inflation-adjusted constant spending that does NOT react to portfolio. Can fail. Honest model of late-stage risk for fixed-budget retirees. Exposed in Profile → Withdrawal dropdown. | `1bff6e8` |
| ✅ ENG-5 | **Smart Waterfall hybrid**: `yearsRemaining > 15` uses GK guardrails; `yearsRemaining ≤ 15` uses Bengen. Split point matches GK's own longevity-clause threshold so we hand off exactly where the safety brake would otherwise be disabled. Pure GK strategy is untouched — pick it directly for paper-faithful behavior including the longevity bug. | `1bff6e8` |
| ✅ UX-5 | Withdrawal Plan tab: consolidated former Waterfall + Withdrawal Analysis subtabs into one tab with two collapsible question-framed sections ("Where does each year's spending come from?" + "How does my chosen strategy pace spending year by year?"). | `1bff6e8` |
| ✅ ENG-6 | **MC respects Plan-to-Age slider.** Previously `runMC` was hardcoded to ages 85 and 90; the slider only affected Smart Waterfall's internal strategy split, not the simulation horizon. Now a single MC run keyed off `params.endAge`. Removed `r85`/`r90` state in favor of a single `mc`. Updated `rulesEngine.js` (8 rules) to read `ctx.mc`. UI no longer shows "To age 85" reference pill. | `9fc512e` |
| ✅ DOC-2 | About page card: "Why Smart Waterfall switches strategies at year 15 (the GK paradox)". Documents the published GK behavior, the short-horizon paradox, AiRA's hybrid fix, and an honest framing that the short-horizon paradox is logically derivable from the paper but less discussed in the SWR community. | `1bff6e8` |
| ✅ ENG-7 | Step 6.5 Roth conversion sizing in `buildWithdrawalWaterfall.js`: (a) under-filled the target bracket by ~one standard deduction when pre-conversion income was floored at 0 — `room` is now `ceilingConv + sd - totInc` instead of `ceilingConv - taxableIncome`; (b) all-or-nothing affordability check zeroed the entire conversion if it couldn't fully self-fund its own tax, producing a "big conversion / 7 years of $0 / big conversion" pattern — replaced with a 5-iteration shrink loop that converges to the largest self-fundable conversion (≥$500 floor). | (this session) |
| ✅ ENG-9 | Conversion Plan tab showed a different "convert $X" number than the Withdrawal Schedule tab's "Roth Conv" column for the same year (e.g. $190,435 vs $268,889) because `buildRothExplorer` (2-bucket pretax/Roth model) and `buildWithdrawalWaterfall` (full cash/taxable/pretax/Roth/HSA waterfall) size conversions differently. New `src/engine/rothConversionPlan.js::buildConversionPlan()` wraps `buildWithdrawalWaterfall` as the single source of truth and exposes `needs_schedule` (true if headroom < 20% of Traditional balance, conversion tax can't be paid from cash/taxable, or projected RMDs raise the bracket), `recommendedSchedule` (year-by-year `min(headroom, remaining)` until remaining < $10k or RMD age), and `checkRothWithdrawalPenalty()` (per-conversion 5-year/10% penalty clock). Wired into the Conversion Plan tab as a reconciliation banner whose Year-1 amount matches the Withdrawal Schedule tab exactly. 14 new tests in `src/rothConversionPlan.test.js` (288/288 total pass). | (this session) |
| ✅ ENG-12 | Follow-up to ENG-9: the reconciliation banner wasn't enough — the Conversion Plan tab's ladder *table* (the thing the user actually reads year-by-year) was still rendered from `buildRothExplorer`'s own `convRows`, so the table itself still disagreed with the Withdrawal Schedule tab. New `rothConversionPlan.js::buildConversionLadder(params, rothMode)` builds the ladder table/bar-chart rows directly from `buildWithdrawalWaterfall` (mapping `rothMode` → `rothConversionTarget`, e.g. `fill_22` → `"22"`, `irmaa_safe` → `"22"` + `irmaaGuard`). `App.jsx`'s `RothLadder` now sources `convRows` from this function instead of `ex.convRows`, so every row's Conversion/Fed Tax/State Tax/Roth Balance column is identical to the Withdrawal Schedule tab by construction. Existing pin/override mechanism (`conversionOverrides`) works unchanged — it's the same per-year "incorporate this conversion or not" toggle the user asked for. The "current vs optimized" comparison metrics (Lifetime Tax Delta, RMD Reduction, Lifetime Eff. Rate cards, and the Taxes/RMD comparison views) still come from `buildRothExplorer` and are NOT yet reconciled — see ENG-14. 3 new tests in `src/rothConversionPlan.test.js` (291/291 total pass). | (this session) |
| ✅ ENG-14 | Final piece of the ENG-9/ENG-12 reconciliation: the Conversion Plan tab's summary cards (Lifetime Tax Delta, RMD Reduction, Lifetime Eff. Rate) and the Taxes/RMD/Table/Scenarios comparison views still came from `buildRothExplorer`'s separate `opt`/`cur` scenarios, so they could describe a different model than the ladder table. New `rothConversionPlan.js::buildWaterfallComparison(params, rothMode)` runs `buildWithdrawalWaterfall` twice — once with the selected mode's `rothConversionTarget` ("opt"), once with `rothConversionTarget: "off"` ("cur") — both using the same bracket-capped smart strategy, and maps each scenario's rows through a shared `classifyRow()` helper (also used by `buildConversionLadder`) onto the field names the existing charts/tables expect (`fedT/stT/totT/effR/margR/irmaa/rmd/ss/abn/pretaxSpend/conv/totInc/pT/ro/nw/label/conv10-37/bracketUsed`, plus `cTax/cConv/cIrmaa/cRmd` aggregates). `App.jsx`'s `RothLadder` now sources `ex`/`exNoTax` from `buildWaterfallComparison` instead of `buildRothExplorer` — no UI restructuring needed since the field shapes line up exactly. Removed the now-unused `buildRothExplorer`/`buildRothLadder` imports from `App.jsx` (still exported/used directly by `src/roth.test.js`'s 76+ tests). 291/291 tests pass, lint clean. | (this session) |
| ✅ ENG-16 | Two more "two values describing the same thing" gaps: (a) the Tax Room tab's "Cash/Treasury/Short Term cash for Taxes" (`cySGOV`) was a standalone manual input, completely disconnected from the profile's account balances — so it could (and did) disagree with the Withdrawal Plan tab's cash figure for the same person. Now `cySGOV` defaults from `params.accounts` (sum of all non-pretax/roth/taxable categories — the same "cash" bucket `buildWithdrawalWaterfall` sources from), with an explicit "↺ reset to profile" override for one-off refinement, so the two tabs start from the same number by construction. (b) The Conversion Plan tab's bracket-fill selector (`rothMode`, local `useState`) and the Profile's "Bracket-fill target" dropdown (`params.rothConversionTarget`) were two unsynced settings for the same "which bracket to convert to" decision — the Withdrawal Plan tab / Monte Carlo read the profile value while the Conversion Plan tab's ladder used its own local selection, so they could recommend different conversion amounts for the same profile. `rothMode` is now derived from and persisted to `params.rothConversionTarget` via new `PROFILE_TO_ROTHMODE`/`ROTHMODE_TO_PROFILE` maps (also added a "Off" button to the Conversion Plan tab so `"off"` is representable). Removed the duplicate dropdown from Profile's Roth Conversion Strategy card, replaced with a pointer to the Conversion Plan tab (same pattern as the existing Withdrawal Order pointer). 291/291 tests pass, lint clean, build succeeds. | (this session) |
| ✅ ENG-18 | Follow-up to ENG-16(a): the Tax Room's "Cash Available for Taxes" still didn't match the Withdrawal Plan's Bucket 1 figure, because the category filter (`!pretax/roth/taxable`) ignores the user's actual Bucket 1 assignment/splits (`accounts[].bucket`/`splits`, set on the Bucket Strategy tab). `profileCashForTaxes` now uses `expandAccountBuckets(accounts).filter(bucket===1)` — the same allocation `BucketCard`'s `b1Actual` reads — so both tabs report the same number by construction. | (this session) |
| ✅ ENG-19 | `buildWithdrawalWaterfall`'s `need` (and therefore Step 6.5's Roth-conversion headroom) only accounted for base spending net of SS/annuity — it ignored mortgage P&I, rent, "Other Expenses" carveouts (e.g. college costs), rental/`propIncome`, and "Other Income" streams, all of which `runMC` already includes via `need = max(0, sp - ss - effectiveAb - otherIncTotal) + housingCost + carveoutCost`. This meant the Conversion Plan could recommend a conversion sized as if those real obligations didn't exist. Extracted `mortgageSchedule`/`computeOtherIncome` out of `App.jsx` into new shared `src/engine/expenses.js` (single source of truth for both `runMC` and the waterfall — no duplicated logic), and updated `buildWithdrawalWaterfall` to: compute `housingCost` (mortgage P&I while active, or inflation-adjusted rent) and `carveoutCost` per year, add `propIncome` to `annuity`, add `otherIncomes` totals to `need`/`fixedIncome`, and feed `otherIncTaxable` into `yearTax`'s ordinary income (and thus the bracket-room/SS-torpedo/IRMAA calcs) — so conversions are sized only from headroom left **after** the year's real expenses. New row fields: `housingCost`, `carveoutCost`, `otherIncome`. 4 new tests in `src/withdrawal.test.js` (295/295 total pass), lint clean, build succeeds. | (this session) |

### Open

| # | Severity | Where | Finding | Suggested fix |
|---|----------|-------|---------|---------------|
| ENG-8 | MEDIUM | `buildWithdrawalWaterfall.js` Step 6.5 vs Step 5 | `irmaaGuard` only constrains the Step-5 pretax withdrawal ceiling (`irmaaCap`), not the Step-6.5 Roth conversion amount. A large conversion sized to the income-tax bracket ceiling can still push MAGI (`totInc`) across an IRMAA tier even with `irmaaGuard` enabled. | When `irmaaGuard` is on, also cap `ceilingConv`'s effective room at the IRMAA tier-1 MAGI ceiling (mirroring the `irmaaCap` logic already used for Step 5), so conversions never trigger IRMAA the guard is meant to prevent. |
| ENG-13 | LOW | `buildWithdrawalWaterfall.js::BRACKET_CEILINGS_MFJ/SINGLE` + `rothConversionPlan.js::buildConversionLadder` | Only 10/12/22/24% bracket ceilings are defined; the Conversion Plan tab's `fill_32`/`fill_35`/`fill_37` mode buttons map to `rothConversionTarget` values ("32"/"35"/"37") that `bracketCeiling()` doesn't recognize and silently falls back to the 22% ceiling — so those modes currently render identically to `fill_22`. | Add `"32"`, `"35"`, `"37"` (and their inflation-adjusted ceilings) to `BRACKET_CEILINGS_MFJ`/`BRACKET_CEILINGS_SINGLE`. |
| ENG-15 | LOW | `rothConversionPlan.js::buildConversionLadder` vs `buildRothExplorer`'s FAFSA/CSS guards | `buildWithdrawalWaterfall` (and therefore the new ladder) doesn't implement the `fafsaEndYear`/`cssEndYear` college-aid conversion caps that `buildRothExplorer` had. Profiles using those guards will see a different (uncapped) conversion amount in the ladder during the FAFSA/CSS window. | Port the FAFSA/CSS bracket-ceiling overrides from `buildRothExplorer` (lines ~472-478) into `buildWithdrawalWaterfall`'s Step 6.5 `rothConversionTarget` ceiling calculation. |
| ENG-10 | LOW | Account model (`accounts[].category === "pretax"`) | No basis tracking for "pretax" accounts — every dollar converted is assumed 100% taxable. The IRS pro-rata rule (Form 8606) requires that if a Traditional IRA holds *any* after-tax (non-deductible) contributions, each conversion is taxed proportionally (taxable % = pretax balance / total balance across all Traditional IRAs). For 401(k)/most IRAs with no after-tax basis (the common case), the current 100%-taxable assumption is already correct, so this has not caused incorrect numbers yet. | If/when a user reports after-tax (non-deductible) contributions to a Traditional IRA, add an optional `afterTaxBasis` field per pretax account, sum it across all pretax accounts to get total basis, and have `buildWithdrawalWaterfall`'s conversion-tax step multiply `conversionAmount` by `(totalPretaxBalance - totalBasis) / totalPretaxBalance` to get the taxable portion (with the remainder reducing total basis pro-rata). |
| ENG-11 | LOW | `rothConversionPlan.js::checkRothWithdrawalPenalty` | Implements only the per-conversion 5-year/10% penalty clock (IRC §408A(d)(3)(F)), per the spec given. It does NOT implement the separate "forever" 5-year clock (IRC §408A(d)(2)(B)) that governs whether *earnings* can be withdrawn federal-income-tax-free — that clock starts on Jan 1 of the year of a taxpayer's first-ever Roth contribution/conversion (any Roth IRA) and never resets. Distinguishing "contributions/conversions" (always penalty/tax-free to withdraw, subject to the 5-yr clock above) from "earnings" (taxable AND penalized until both the forever-clock and age 59½ are satisfied) requires tracking a running lifetime Roth balance broken into contribution-basis vs. earnings, which AiRA does not currently model. | If users need an "is this Roth withdrawal fully tax-free" answer (not just the penalty), add `firstRothContributionYear` to the profile and a second check `qualifiedDistribution = ageAtWithdrawal >= 59.5 && (currentYear - firstRothContributionYear) >= 5`; gate earnings-taxability on that flag separately from `checkRothWithdrawalPenalty`'s per-conversion result. |
| ENG-17 | LOW | Profile (Assumptions) — `taxFunding`, `fafsaEndYear`, `cssEndYear` in the "Roth Conversion Strategy" card | After ENG-16, audit whether these remaining Roth-conversion fields are "basic life configuration" (stay in Profile) or "calculation tuning" (belongs on the Conversion Plan / Tax Room tabs, per the design principle established by ENG-16 and the existing Withdrawal Order pointer). `taxFunding` ("how conversion taxes are paid") looks like tuning similar to `rothConversionTarget`; `fafsaEndYear`/`cssEndYear` are arguably life-timeline facts (when a child's college aid window is) so may be fine to keep. Also note ENG-15 (FAFSA/CSS caps not yet wired into `buildWithdrawalWaterfall`) is a prerequisite for `fafsaEndYear`/`cssEndYear` to have any effect on the new ladder. | Review each field against "basic parameter vs. calculation tuning"; move `taxFunding` to the Conversion Plan tab (same pointer pattern) if confirmed as tuning, or leave with a documented rationale if it's genuinely a global default. |

### Known finding (preserved as a video idea)

**The GK Longevity Paradox** — Guyton-Klinger's 2006 Capital Preservation Rule cuts spending 10% when WR exceeds 1.2× initial WR, BUT skips the cut when `yearsRemaining ≤ 15` (the Longevity Rule). When the entire planning horizon is ≤ 15 years, the safety brake is never armed → counterintuitive result that shorter retirements can have LOWER MC success than longer ones at the same draw level. The hybrid in ENG-5 sidesteps this; the pure GK strategy still exhibits it for users who want paper-faithful behavior. See `src/about.js` "gk-longevity-paradox" card for full writeup. Candidate YT video.

## 7. Stripe Billing Audit & Fixes — 2026-06-13

Auditor (general-purpose agent) reviewed the billing path as if `BILLING_ENABLED=true`. **Verdict: was RED; CRITICAL fixes shipped; HIGH and below still open. Do NOT flip the flag until the HIGH backlog is cleared.**

### ✅ Fixed (commit `587b99b`)

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| C1 | CRITICAL | `src/ai/ai-analysis.js` | `BILLING_ENABLED && !values?.geminiApiKey?.trim()` meant any user with a personal Gemini key bypassed the billing proxy entirely. Free calls, credits never deducted, revenue model broken. | Gate now reads `BILLING_ENABLED && getStoredJWT()`. JWT presence = paid user → always proxy. |
| C2 | CRITICAL | `functions/api/webhook.js` | Webhook accepted ANY unsigned payload; "defense" was re-fetching the session id via Stripe API, but session ids leak. Replay-able. | Verify `Stripe-Signature` against raw body before JSON.parse. Reject 400 on mismatch. Added per-`event.id` idempotency via new `webhook_events` D1 table (also resolves H1). |
| C3 | CRITICAL | `functions/_shared/jwt.js` | Two bugs in `verifyStripeWebhook`: (1) `whsec_` secret was base64-decoded — wrong, it's raw UTF-8; (2) hex-string comparison was timing-attack vulnerable. Real Stripe signatures would NEVER validate. | Use UTF-8 bytes of post-prefix secret as HMAC key. Use `crypto.subtle.verify` (constant-time at WebCrypto layer) instead of `sign` + string-compare. |
| C4 | CRITICAL | `functions/api/analyze.js` | Read-balance → call Gemini → `UPDATE credits = MAX(0, credits − ?)`. Two concurrent requests both pass pre-check, both deduct, balance silently clamped to 0. **Free-credit race exploit.** | Atomic `UPDATE … WHERE credits >= ?`. Check `meta.changes`; on race-loss write an `'overdraft'` audit row so reconciliation can detect drift. Raised `MIN_CREDITS_GUARD` from 5 → 50 to bound parallel overdraft to ~1 call. |
| C5 | CRITICAL | `functions/api/admin.js` | `authHeader.slice(7) !== env.ADMIN_SECRET` is JS short-circuit string equality — timing leak. Combined with no rate limit + admin actions like `grant-credits` and `issue-jwt`, full takeover via secret recovery. | New `constantTimeEqual` helper (XORs all bytes regardless of mismatch). Added randomized 80-120ms delay on failure to mask residual signal. |

Schema migration shipped: `db/schema.sql` adds `webhook_events` table + extends `credit_transactions.type` CHECK to allow `'overdraft'`. Run:

```bash
wrangler d1 execute aira-credits --file=db/schema.sql --remote
```

### 🔴 Pre-launch BLOCKERS — still open (HIGH)

| # | Severity | File | Issue | Recommended Fix |
|---|----------|------|-------|-----------------|
| H1 | ~~HIGH~~ ✅ | `webhook.js` | No `event.id` idempotency → async-payment edge case could double-credit. | ✅ Fixed alongside C2 via new `webhook_events` table. |
| H2 | HIGH | `webhook.js` | `charge.refunded` / `charge.dispute.created` events not handled. User buys $15, spends $0.50, files chargeback → keeps credits + merchant pays dispute fee. Permanent profit leak. | Listen for these event types. On refund: SET credits = MAX(0, credits − amount). On dispute: lock customer (`status='disputed'`) and require manual re-enable. Add `'refund'` to txn type CHECK. |
| H3 | ~~HIGH~~ ✅ | `checkout.js`, `verify-session.js`, `credits.js` | Session_id leak → JWT theft / account takeover. | ✅ Fixed in `c9bbe59`. `/api/checkout` generates a random UUID nonce, stores in new `pending_checkouts` D1 table (30-min TTL), embeds in success_url alongside Stripe's `{CHECKOUT_SESSION_ID}` placeholder. `/api/verify-session` requires both params and atomically consumes the nonce via conditional UPDATE (single-use + race-safe via `meta.changes === 1`). Defense-in-depth: still re-checks Stripe `payment_status === 'paid'` after nonce consume. Client `useStripeReturn` reads + cleans both URL params; if nonce missing, surfaces a recovery message pointing users to support. Fails closed if the `pending_checkouts` table is missing. Recovery for missed nonce window: webhook still credits user → ops uses admin panel `issue-jwt`. |
| H4 | HIGH | `admin.js` | No rate limiting; no audit log of who issued grants. Compromise of ADMIN_SECRET = invisible drain. | Cloudflare WAF rate-limit `/api/admin` (e.g. 10/min/IP). Add `admin_actor` + `admin_ip` to audit trail. |
| H5 | ~~HIGH~~ ✅ | `analyze.js` | `MAX(0, credits − ?)` masked deduction failures. | ✅ Fixed alongside C4 via conditional UPDATE + overdraft row. |

### 🟡 Recommended within 2 weeks of launch (MEDIUM)

| # | File | Issue |
|---|------|-------|
| M1 | `credits.js` | `CACHED_BALANCE_KEY` in localStorage is user-mutable. Display-only cache is fine; ensure no spend-decision branch reads from it. |
| M2 | `_shared/jwt.js` | Minimum `JWT_SECRET` length not enforced. Add `if (secret.length < 32) throw …` in sign + verify. |
| M3 | `_shared/jwt.js` | `verifyJWT` doesn't validate `header.alg === "HS256"` (alg-confusion gadget if multi-alg support is ever added). Add explicit check. |
| M4 | `_shared/jwt.js` | Stripe 5-min replay window was correct but dead code; now wired up via C2 fix. ✅ Resolved by C2. |
| M5 | All `functions/api/*.js` | Error responses leak D1 / Stripe internals (`e.message` passed verbatim). Log server-side, return generic to client. |
| M6 | `checkout.js` | `customer_creation: "always"` creates a new Stripe customer per checkout — same email gets multiple D1 rows + multiple JWTs + fragmented balances. Use `customer_creation: "if_required"` with email lookup, or key D1 on email and aggregate. |

### 🟢 LOW priority

| # | File | Issue |
|---|------|-------|
| L1 | `credits.js` | Stub mode is dead code when `BILLING_ENABLED=true`; add a `console.warn` if it ever runs in production. |
| L2 | `credits.js` | `verifyStripeSession` polls 6× over 12s, then silently gives up. User has paid → 0 credits → no error. Show recovery UI with manual retry. |
| L3 | `credits.js` | `purchaseCreditPack` doesn't pass email to `/api/checkout`. Minor UX friction — user re-types at Stripe. |

### ✅ Verified correct (no action)

- Pre-call balance guard returns 402 (not 500). [`analyze.js:415`]
- JWT sign/verify symmetry: HS256 round-trip works. [`_shared/jwt.js`]
- JWT `exp` claim checked; expired tokens rejected. [`_shared/jwt.js:72`]
- D1 deduction skipped when Gemini errors (no usage metadata → no deduction). [`analyze.js:444-453`]
- Per-session idempotency on `stripe_session_id` prevents Stripe retry double-credit. [`webhook.js:71-77`]
- Admin panel never ships `ADMIN_SECRET` to clients — entered by admin into password input. [`admin-panel.js`]
- `useStripeReturn` cleans `?session_id=` query param after one-time use. [`credits.js:262-266`]

### Hidden admin panel — for ops / sandbox testing

Append **`?aira_admin=1`** to the app URL. Floating overlay (bottom-right). Requires the `ADMIN_SECRET` env var (set in Cloudflare Pages or `.dev.vars`). Available actions: `ping`, `stripe-ping`, `grant-credits`, `simulate-purchase` (fakes the webhook flow end-to-end — best sandbox-test tool while real webhook setup is incomplete), `inspect`, `issue-jwt`.

### Pre-launch checklist (before flipping `BILLING_ENABLED=true`)

- [x] C1: invert billing gate
- [x] C2: wire up Stripe signature verification
- [x] C3: correct HMAC key encoding + constant-time verify
- [x] C4: atomic credit deduction + overdraft audit row
- [x] C5: constant-time `ADMIN_SECRET` compare
- [x] H1: webhook event.id idempotency (resolved alongside C2)
- [ ] H2: refund / dispute / chargeback handling
- [x] H3: bind `verify-session` to a one-time purchase nonce (`c9bbe59`)
- [ ] H4: rate-limit `/api/admin` + admin audit trail
- [ ] Schema migration applied: `wrangler d1 execute aira-credits --file=db/schema.sql --remote`
- [ ] Env vars set in Cloudflare Pages: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `GEMINI_API_KEY`, `JWT_SECRET` (32+ hex), `ADMIN_SECRET` (32+ chars)
- [ ] Stripe webhook configured: `POST https://<domain>/api/webhook` listening for `checkout.session.completed` (and once H2 lands: `charge.refunded`, `charge.dispute.created`)
- [ ] Sandbox tested via `simulate-purchase` admin action
- [ ] Sandbox tested via Stripe CLI: `stripe trigger checkout.session.completed`

## 8. Security note — Crestline MCP injection (2026-06-13)

A claude.ai-side MCP server "Alpha Ops Intelligence" (Crestline) was loaded during this session and injected a `system-reminder` mid-tool-output attempting to redirect the auditor agent into a "reconciliation analyst" role. The agent correctly ignored it and surfaced the attempt.

**Action for operator:** disconnect at https://claude.ai/settings/connectors. This is a prompt-injection vector against your dev environment regardless of how it got connected. Not a vulnerability in AiRA itself — but worth knowing because any code-context that flows through the same Claude session is exposed to the same injection.
