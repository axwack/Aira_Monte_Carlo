# AiRA Monte Carlo — Requirements & Audit Log

> **SINGLE SOURCE OF TRUTH.** This is the one requirements file for the project —
> git-tracked, so every collaborating agent gets it. The old, gitignored
> `src/Requirements.md` (stuck at v1.0.1.18 / Netlify / pre-billing) was **deleted
> as redundant on 2026-07-25**; its still-open, non-duplicated items were merged
> into §15 below. Do not re-create a second requirements file — add to this one.

Living document tracking the business-logic requirements of the forecaster, what has
been fixed, and the open backlog from the June 2026 code review. Update this file
whenever engine rules change.

Last updated: **2026-07-31** — v1.2.70, 821 tests. **§29 = what shipped. §32 = what is open.**
**NEXT SESSION (2026-07-31): §31** — the death model is authored in two places that disagree.

Previous update: **2026-07-27** (branch `main`; **read §0 SESSION HANDOFF first**; Slate A engine fixes shipped v1.2.28 — §13.1 #6, §13.2 #11/#15/#16, ENG-8; new §21 spousal Social Security scoped; new ENG-25 opened)

---

## 0. SESSION HANDOFF — 2026-07-27 (SUPERSEDED — read §29 first, then §32 for what's open)

Written for whoever picks this up next, possibly on a different machine/account.
Everything below is verified against the code, not remembered.

### 🔴 OPEN PRODUCTION INCIDENT — customers cannot see or spend credits

**This is not one person's browser problem. Real customers have paid and cannot use
what they bought.** Treat as the top priority ahead of any feature work.

#### Do these in order

1. **Rotate `ADMIN_SECRET` — it was pasted into a chat transcript on 2026-07-27.**
   `openssl rand -hex 32` → Cloudflare → Pages → `aira-monte-carlo` → Settings → Env
   vars → **Production** (Preview is a separate list) → save → **redeploy** (env var
   changes do not apply to already-built deployments).

2. **Confirm the money is really there** (needs only a `wrangler` login — no
   `ADMIN_SECRET`, no deployed Functions):
   ```bash
   wrangler d1 execute aira-credits --remote \
     --command "SELECT stripe_customer_id, email, credits, status FROM customers ORDER BY updated_at DESC LIMIT 20"
   ```
   Then check whether anyone has ever successfully SPENT:
   ```bash
   wrangler d1 execute aira-credits --remote \
     --command "SELECT type, COUNT(*) n, SUM(amount) total FROM credit_transactions GROUP BY type"
   ```
   As of 2026-07-26 there were **zero `deduct` rows**. If that is still true, nobody has
   ever spent a credit — which points at the root cause below rather than at the meter.

3. **Verify the Functions are even deployed** (no auth needed):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://aira.tiredtoretire.com/api/report-capability
   ```
   200 = deployed. 404 = no billing backend at all, which would explain everything.

4. **Restore an affected customer:** live site `?aira_admin=1` → `issue-restore-link`
   (it resolves the real `email` column) → send them the `?restore=…` URL.

#### ⚠️ CORRECTION (2026-07-27, later the same day)

The root-cause paragraph below is **WRONG about the trigger** and is kept only so the
reasoning is traceable. Verified afterwards against the live database:

- **The live host is `aira.tiredtoretire.com`.** `www.tiredtoretire.com` 301-redirects
  and its `/api/*` does not serve the Functions. The API is healthy (200).
- **`pending_checkouts` has 4 rows and only 1 consumed.** So `/api/verify-session`
  never completed for 3 of the 4 purchases and **the JWT was never minted at all**.
  It was not a TTL expiry — those customers bought on 2026-07-26, one day earlier,
  so nothing had expired. The failure is at MINT time, not expiry time.
- v1.2.29's sliding refresh is still correct and worth having, but it renews an
  existing token and therefore **could not have prevented this**.
- v1.2.33 instruments every `verify-session` exit with a distinct `reason` code
  (grep production logs for `[verify-session]`), including which of
  nonce_not_found / already_consumed / expired occurred. **The next purchase will
  name the cause** — stop hypothesising until there is one real log line.
- Restore tokens were minted manually on 2026-07-27 for the 3 affected customers and
  the mechanism is confirmed working (uses incremented 0→1 on each).
- Also confirmed: the client's 6×2s poll (§7/L2) runs only AFTER verify-session has
  already succeeded — it waits on the webhook, so it is a real bug but NOT this one.

#### Root cause — one bug produces all three symptoms

A customer's only proof of ownership is a JWT in one browser's `localStorage`, minted
once at the Stripe redirect. With no valid JWT:
- `fetchCreditBalance()` returns `null` → the panel falls back to a cached 0 → **"AIRA
  CREDITS 0"**, indistinguishable from never having paid;
- `ai-analysis.js` gates on `BILLING_ENABLED && getStoredJWT()`, so it **never calls the
  paid proxy** — it silently returns non-AI output;
- because the proxy is never called, **credits never deplete**. "Credits don't deplete"
  and "credits don't show" are the SAME bug, not two.

v1.2.29 added sliding refresh so a *valid* session now renews indefinitely. It cannot
recover a session that is already gone — that is what restore links are for.

#### How it is SUPPOSED to work (verified in code, so the meter itself is sound)

Purchase → Stripe webhook credits D1 → redirect mints a JWT → client stores it →
`/api/balance` shows the balance and (v1.2.29+) rolls the session forward → an AI call
goes through `/api/analyze` with the JWT → server checks balance, refuses below
`MIN_CREDITS_GUARD = 50` with a 402, calls Gemini, then deducts
`ceil(tokens / RAW_TOKENS_PER_CREDIT)` via an **atomic** `UPDATE … WHERE credits >= ?`
(race-safe; a lost race writes an `overdraft` audit row), refunds via `refundD1Credits`
if the result was empty, and returns `_credits_remaining` which the client syncs
without a second round-trip. The report is a flat `REPORT_COST_CREDITS = 250`.

That whole chain is implemented and unit-tested. The failure is upstream of it: no JWT
means it never runs.

#### Bugs to fix, highest value first

1. **The credit panel must distinguish "no session on this device" from "zero credits."**
   Today both render `0` next to a **Buy Credits** button, so a paying customer is
   invited to pay twice. When `BILLING_ENABLED && !getStoredJWT()`, render "No credits
   found on this device — restore access", not a number. *This is the one customers hit.*
2. **`inspect` and `issue-jwt` cannot find real Stripe customers.** Both derive a
   synthetic `cus_ADMIN_<local-part>` from an email (`fakeCustomerId`), so they only ever
   match `simulate-purchase` test rows. Make them resolve against the `email` column the
   way `issue-restore-link` already does (`admin.js:289`).
3. **`admin.js` returns an identical 401 whether the secret is wrong OR
   `env.ADMIN_SECRET` is unset.** Return a distinct 500 "ADMIN_SECRET not configured"
   when it is falsy, before the compare — leaks nothing, and removes a genuinely
   confusing dead end. (Note: 10 req/60s per-IP rate limit returns 429, so repeated
   failed attempts stop being 401s — wait a minute between tests.)
4. **Self-serve restore.** `customers.email` is already populated from Stripe; there is
   no email-sending capability yet. Until then every recovery is manual admin work.
5. **No low-balance warning, no depletion notification, no reconciliation** that
   `customers.credits == SUM(credit_transactions.amount)`.

#### End-to-end test that must pass before trusting any of this

Standing lesson: these endpoints return plausible statuses while broken — during the
2026-07-26 outage a correctly-signed AND an unsigned webhook POST both returned 400,
which hid the bug for months. So do not probe; transact.

1. Real purchase (or `simulate-purchase`) → balance appears in the UI.
2. Run an AI analysis → balance **drops** → a `deduct` row appears in
   `credit_transactions` → `_credits_remaining` matches the D1 value.
3. Force an empty AI result → a `refund` row appears and the balance is restored.
4. Drain below 50 → next call returns 402 and the buy modal opens.
5. Unlock the report → one 250-credit `report_unlock` row, and re-opening within 24h
   does **not** charge again.
6. Reload the app → `/api/balance` returns a `token` and `localStorage.airaJWT.v1`
   changes (this is the v1.2.29 fix actually working).
7. Clear `localStorage` → confirm the UI says "restore access" rather than `0` (after
   fix 1 lands), and that a restore link recovers the balance.

### ⭐ NEXT UP (set 2026-07-27, by Vincent): dual Social Security + NIIT bracket fill

Two priorities named at the end of the session. Both were already scoped; this
records the ordering and what today's work changed about the cost.

**1. NIIT-aware bracket fill (§19) — DO THIS FIRST. It is now much cheaper than when
it was scoped.**
ENG-8 (shipped today, v1.2.28) added the IRMAA cap to the Step-6.5 conversion ceiling
and — deliberately — built it in a `min(...)`-absorbing shape with a named
`convCapReason` ("bracket" | "irmaa_ceil" | "manual" | "affordability"). Adding NIIT is
now: compute the NIIT room, add it to that same `min(...)`, and add an `"niit"` reason
code. The constants already exist and need no new source — `NIIT_THRESHOLD_MFJ` /
`NIIT_THRESHOLD_SINGLE` / `NIIT_RATE` in `buildRothExplorer.js`, statutory and NOT
inflation-indexed.
Two things to get right:
- NIIT is charged on the LESSER of net investment income and MAGI over the threshold,
  so the binding quantity is MAGI headroom, exactly like the IRMAA cap — and, per the
  ENG-8 lesson, the realized gain must be subtracted from the MAGI base or the room is
  overstated by the year's gain.
- It must apply to the Step-5 pre-tax draw ceiling as well, not only the conversion,
  or the same asymmetry ENG-25 already records will repeat.
The user-facing ask was a "NII-Safe" fill mode; decide with design-authority whether
that is a new mode button or simply always-on behaviour of the existing guards —
a third mode button next to fill_10/12/22/24 risks the mode/guard confusion that
§12's naming verdict already had to untangle once.

**2. Dual Social Security entry (§21) — bigger, genuinely multi-session.**
Full scope is in §21. The honest blocker is NOT the UI: it is that **filing status is
nowhere time-varying** in this codebase. A real spousal/survivor model needs a first
death that flips MFJ → Single mid-projection, which changes brackets, the standard
deduction, IRMAA tiers AND (new as of today) the OBBBA senior bonus from 2 persons to
1. That is the structural work; two benefit amounts and two claim ages are the easy
part.
Recommended: ship §21 Phase 1 alone first — two-person entry + the spousal top-up
(50% of the HIGHER earner's PIA, which earns no delayed credits) + the combined gross
feeding the existing `taxableSocialSecurity()`. That makes the base case correct for
every couple and immediately kills the hardcoded `× 0.67` survivor haircut in the
stress scenario, without touching filing-status timing. Phase 2 (survivor step-up +
time-varying filing status) can follow.

### Shipped this session (all on `main`)

| Version | Commit | What |
|---|---|---|
| v1.2.28 | `6853e17` | Five engine-correctness fixes ("Slate A") |
| v1.2.29 | `94deaaa` | Billing: sliding session refresh — stops silent credit loss |
| v1.2.30 | (this) | Report tests skip loudly instead of failing; handoff notes |

**Suite is fully green: 593 pass, 13 skipped, 0 fail.** Lint clean, production build
compiles. 35 new tests this session, plus one new file `src/rulesEngine.test.js`.

**Slate A (v1.2.28)** — see the marked-up entries for detail: §13.1 #6 (OBBBA senior
deduction, absent entirely — a single 65-year-old drawing $40K in FL was charged
$2,422 federal tax instead of $1,702), ENG-8 (IRMAA guard now caps Roth conversions,
not just pre-tax draws), §13.2 #11 (rental was modeled three ways and silently stopped
at age 80), §13.2 #16 (Action Plan RMD age ignored dob precision AND the user override;
divisor was hardcoded 24.0), §13.2 #15 (Roth tab summary cards went stale while the
table below them updated).

Four entries were found to be **already fixed** by earlier work and are now marked so
they stop reading as open: §13.1 #7 (Kitces ratchet), §13.2 #10 (SS COLA anchor),
§13.2 #13 (HSA dropped from runMC), §13.2 #18 (waterfall cash growth).

**Billing (v1.2.29)** — a customer's session JWT was minted exactly once, at the Stripe
redirect, and never renewed. `signJWT` existed in only four places and `/api/balance`
(hit on essentially every app open) verified tokens without re-issuing them. So every
paying customer lost access to credits they still owned once the TTL elapsed — same
browser, nothing done wrong — and it failed **silently**: 401 → client clears the token
→ `ai-analysis.js` gates on `BILLING_ENABLED && getStoredJWT()` → it never calls the
paid proxy and quietly returns non-AI output. Reads as a worse product, not a bug.
`/api/balance` now returns a fresh `token` once the current one is past halfway
through its life; TTL raised 30 → 90 days; the three duplicate TTL constants collapsed
into one shared `mintCustomerJWT()` in `functions/_shared/jwt.js`.

### ⚠️ MUST DO BEFORE ANY DEPLOY — the paid report is missing

`src/report/PrintReport.jsx` in this working copy is the **55-line public placeholder**,
not the real 651-line paid report, and `git ls-files -v` shows the `skip-worktree` flag
is **NOT** set here. Verified: the built bundle literally contains the string
"Report module not included".

**Consequence: a deploy from this working copy ships the placeholder to paying
customers.** This predates this session's work (it is the state committed in `9f4d4ad`)
but it gates any deploy.

To resolve:
1. Restore the real `PrintReport.jsx` from the private copy (per §20 it is kept on local
   disk only, so it lives on whichever machine last had it — it is NOT in git and never
   will be).
2. Then run `git update-index --skip-worktree src/report/PrintReport.jsx` so local edits
   to it stay invisible to git and can never be committed by accident.
3. `report.test.js` will then run in full automatically — it keys off the placeholder's
   `IS_PLACEHOLDER` export, which the private file deliberately does not have. Until
   then it skips with a console warning naming this exact problem.

### ⚠️ Files that do NOT travel via git

`aira-forecaster-agents/` is gitignored in its entirety, so **two fixes from this
session exist only on the machine that made them** and must be Drive-synced:

1. `knowledge/TAX_REFERENCE.md` — new "OBBBA Senior Bonus Deduction" section with all
   constants and the four sources they were verified against.
2. `knowledge/RMD_TABLES.md` — **age-89 divisor corrected 13.0 → 12.9.** The IRS Uniform
   Lifetime Table says 12.9 and both in-code tables already had it; only the doc was
   wrong. Left unsynced, a stale copy will reintroduce a real RMD bug the next time
   someone ports doc values into code.

`CLAUDE.md` is also gitignored and Drive-synced. Note it is **stale** in places: it says
"Netlify auto-deploys" (migrated to Cloudflare) and lists flipping `BILLING_ENABLED` as
the next step (it shipped 2026-06-19; billing takes real money).

### Not verified — do not trust without testing

**The billing fix has not been exercised end-to-end against live Stripe.** The standing
lesson on this codebase is that these endpoints return plausible statuses while broken
(during the 2026-07-26 outage, a correctly-signed and an unsigned webhook POST both
returned 400, which hid the bug for months). Before trusting the refresh:
1. Run locally: `npm run build && npx wrangler pages dev build` (plain `npm start` 404s
   on `/api/*`). Secrets live in `.dev.vars`.
2. Make a real purchase, confirm the balance appears.
3. Re-open the app and confirm `/api/balance` returns a `token` and localStorage
   `airaJWT.v1` changes — that is the actual fix working.

**Recovering a session that is ALREADY lost** (this is what Vincent hit — credits bought
and present in D1, but invisible in the browser): the sliding refresh cannot help,
because it only renews a token that still exists. Use the admin panel: open the app with
`?aira_admin=1`, then `inspect` to confirm the D1 balance, then `issue-restore-link`, then
open the resulting `?restore=<token>` URL. That mints a fresh JWT and the balance appears.

### Open, nothing blocking

- **ENG-25 (new, MEDIUM)** — Step 5's `irmaaCap` and `runMC`'s `irmaaRoom` have the same
  LTCG-in-MAGI gap that ENG-8 just fixed on the conversion path: they compare a MAGI
  ceiling against an income base that excludes realized gains, so the pre-tax draw can
  still breach an IRMAA tier. Deliberately left alone — the gain is not converged at that
  point in the fixed-point loop, so it needs a real ordering decision, not a copy-paste.
- **Hero landing sliders** — design-authority approved (verdict in-session, not yet
  written into a section): add a dual-bound editable number field beside each slider, and
  replace the `999_000_000_000` maxes with a named `LANDING_SLIDER_LIMITS` block. Three of
  the four sliders currently have a **$999B max with a $25K step**, so hitting a real value
  like $850,000 by dragging is impossible. It also ruled AGAINST a second "sensitivity
  slider" bank — that need is already scoped as the backlogged Smart Moves goal-stacker.
- **§21** — spousal & survivor Social Security, scoped this session, not started.
- **§22** — user feedback from OneHourRetiring was triaged in-session but deferred before
  being written up. The one finding worth not losing: **Roth 401(k) contributions are
  currently routed to PRE-TAX.** The 401(k) field's helper text says "Total employee
  deferral (pre-tax + Roth)" while that field feeds the pretax bucket, so a Roth 401(k)
  saver gets inflated projected RMDs, overstated tax, and a too-small Roth bucket. Small
  fix, real consequence. Of that user's six asks, three are already shipped (withdrawal
  order v1.2.8, Roth conversion incl. `conversionOverrides` for a self-plotted schedule,
  and LTC via `cashFlowEvents`/carveouts/stress), one is half-shipped (needs-vs-wants
  exists via the CSV Must/Like split but has no manual entry), and one is a genuine gap
  (per-bucket expected returns — the Bucket Strategy tab currently implies per-bucket risk
  while the engine models a single blended portfolio return).
- **Billing gaps** — no low-balance warning, no notification on depletion, no
  reconciliation that `customers.credits == SUM(credit_transactions.amount)`, and no
  self-serve email restore (feasible: `customers.email` is already populated from Stripe,
  but there is no email-sending capability).

### Process notes worth keeping

Both agent reviews were useful and both needed hand-verification, which is the standing
rule here and it earned its keep twice this session: design-authority initially BLOCKED
ENG-8 over a two-engine drift that ENG-12/ENG-14 had already resolved (it withdrew when
shown the line refs, then surfaced something genuinely useful —
`rothConversionPlan.js` already ORs the guard flags). And the two agents flatly
contradicted each other on `abReliability`: design-authority wanted the
"Rental net (80% reliable)" label propagated everywhere, logic-validator said reliability
must never enter the deterministic engine. The code settled it — it is a per-year
all-or-nothing Bernoulli draw in `runMC` only, so there is no "net" figure anywhere and
that label was itself a mislabel over a gross number.

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

- ✅ **IMPLEMENTED 2026-07-18** — ~~No LTCG / cost-basis model.~~ Taxable-brokerage
  draws now carry average-cost basis tracking: new profile field `taxableBasisPct`
  (default 70) sets what % of TODAY's taxable balance is cost basis; the rest is
  unrealized gain, realized proportionally (`g = draw × (1 − basis/balance)`) on
  every draw and left flat (not grown) between draws — reinvested `rmdExcess` adds
  fresh basis dollar-for-dollar. Realized gains are taxed via 2026 LTCG brackets
  ($98,700/$613,700 MFJ, $49,350/$566,700 single — IRS Rev. Proc. 2025-32), stacked
  ON TOP of ordinary income (the standard deduction soaks into gains first if
  ordinary income didn't use it all), plus NIIT (3.8% on the lesser of the gain or
  MAGI over the non-inflation-indexed $250K MFJ/$200K single threshold). States tax
  gains as ordinary income (added to the state taxable base). Realized gains are
  now included in both IRC §86 provisional income (SS taxability) and MAGI
  (IRMAA) — closing the two related gaps this entry used to call out. Implemented
  in `calcYearTax` (App.jsx, new `ltcgAmount` param), `runMC` (per-path
  `taxableBasis`, mutated once per year after the tax↔draw fixed point converges),
  and `buildWithdrawalWaterfall`'s `yearTax`/`runScenario` (new `taxableBasis0`
  from `accumulateToRetirement`, one basis per smart/naive scenario). New shared
  constants `LTCG_BRACKETS_2026_MFJ/SINGLE`, `NIIT_THRESHOLD_MFJ/SINGLE`,
  `NIIT_RATE` live in `buildRothExplorer.js` (single source, imported by both
  App.jsx and the waterfall engine — same pattern as `FED_BRACKETS_2026_*`).
  12 new tests (`computations.test.js`, `withdrawal.test.js`); all 383 pre-existing
  tests still pass unchanged (395 total) — the directional/relative nature of the
  existing suite meant no expected values needed updating.
  **Remaining sub-gaps (out of scope for this pass):** average-cost basis only —
  no per-lot tax-lot selection or tax-loss harvesting; the Roth Explorer tab
  (`buildRothExplorer.js`'s own 2-bucket pretax/Roth model) still ignores LTCG
  entirely, since it has no taxable-bucket concept at all. IRMAA's 2-year lookback
  (next entry below) is a separate, later pass — not touched here.
- ✅ **IMPLEMENTED 2026-07-18** — ~~IRMAA 2-year lookback is ignored.~~ Medicare
  charges year T's IRMAA surcharge off the tax return filed two years prior
  (MAGI[T-2]), not the current year's income — a big Roth conversion at 63 now
  raises Medicare premiums at 65 (not at 63), and income dropping at retirement
  takes 2 years to flow through to lower premiums. `calcYearTax` (App.jsx) and
  `yearTax` (`buildWithdrawalWaterfall.js`) both gain an optional trailing
  `magiLookback` param: when supplied, `irmaaCost()` uses that 2-years-ago MAGI
  instead of the current year's own MAGI (the current year `yr` still selects
  the bracket table). `null` (default) preserves the old same-year-MAGI
  behavior for every caller that hasn't threaded history through — the
  purely-`calcYearTax`-level tests above are unaffected. The tax↔draw fixed
  point actually converges a step FASTER now: IRMAA is sourced from an
  already-known, fixed 2-years-ago MAGI instead of the current pass's draws, so
  it's a per-year constant rather than part of the step function the loop had
  to converge through. Threaded through both engines' year loops:
  `buildWithdrawalWaterfall`'s `runScenario` keeps a per-scenario (smart/naive
  diverge) `magiByAge` Map, storing each year's FINAL (post-conversion, since a
  conversion raises MAGI) MAGI and looking up `age-2`; `runMC` keeps cheaper
  rolling `magiOneYearAgo`/`magiTwoYearsAgo` variables per path, rolled forward
  after the Roth-conversion block (using the post-conversion MAGI when a
  conversion executed that year). **Pre-retirement fallback:** neither engine
  models pre-retirement wages, so the first two retirement years (whose
  lookback would reach `age-2 < retireAge`, into unmodeled working years) fall
  back to `null` → same-year MAGI, the old approximation, for those two years
  only. Every row now also exposes `magi` (this year's own MAGI, feeding the
  UI and the next engine's history) alongside the existing `irmaa`/
  `irmaaTriggered` fields; `irmaaTriggered` continues to mean "surcharge
  CHARGED this year" (now correctly sourced from 2-years-ago income).
  Roth-conversion delta costing needed NO change: `convTax = tax.totalTax -
  taxNoConv.totalTax` was always fed+state only (IRMAA excluded, reported
  separately via `irmaaFull`), so a same-year conversion's cost was never
  polluted by IRMAA and still isn't — IRMAA simply can't move within the
  conversion's own year anymore, full stop. `simulateDeterministicWithStrategy`
  inherits the lookback automatically via its `smartTaxByAge` map (sourced from
  `buildWithdrawalWaterfall`); its legacy no-waterfall-row fallback still calls
  `calcYearTax` with no lookback arg (`null` default, old same-year behavior),
  unchanged, out of scope.
  **Remaining sub-gap (out of scope for this pass):** `buildRothExplorer.js`'s
  own `irmaaCost`/`irmaaCeiling` (the Conversion Plan tab) still charges IRMAA
  on same-year MAGI — same category of gap as that tab's pre-existing
  LTCG-ignorance noted above (it has no taxable-bucket concept, and now no
  lookback history either).
  10 new tests (`computations.test.js`, `withdrawal.test.js`); all pre-existing
  tests pass unchanged.
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
| ✅ ENG-20 | "How does my chosen strategy pace spending year by year?" (`DeterministicWithdrawalView`) used a standalone single-bucket model (`simulateDeterministicWithStrategy`) that didn't reflect Roth conversions, mortgage payoff, or carveouts — so its "Portfolio End" wasn't the real, lived-in portfolio value the Withdrawal Plan tab implies. When `withdrawalStrategy === "smart"` (the default), the schedule is now built directly from `buildWithdrawalWaterfall(p).smart.rows` — same conversions, housing, carveouts, and source-aware tax as the Sourcing section above, by construction. New `accumulateToRetirement()` exported from `buildWithdrawalWaterfall.js` (replacing its inline bucket-growth block) supplies "Portfolio at Retirement" from the same per-bucket growth rates. For the other pacing strategies (GK, Bengen, etc., which don't have bucket-level logic), `need` now also adds `housingCost`/`carveoutCost` for ENG-19 parity. The Year-by-Year Schedule table gained Housing, Carveouts, and Roth Conv. columns. | (this session) |
| ✅ ENG-21 | New "Income & Expenses" charts on the 💵 Income tab, modeled on Boldin's stacked-bar + lifetime-totals layout: two stacked bar charts (Income/Drawdowns/Roth Conversions, and Expenses) by calendar year, each with a side panel showing category totals — "Lifetime" by default, or the hovered year's breakdown (`onMouseMove`'s `activeLabel` drives both panels together). Sourced from `buildWithdrawalWaterfall(p).smart.rows` (same engine as ENG-20), so conversions/mortgage/carveouts are visible here too. Expense categories: General/Living, Mortgage/Housing, Medical, Long-Term Care, Other Expenses (Medical/LTC/Other split from `carveouts[].label` via new `categorizeCarveouts()`), Income Tax (fed+state+IRMAA), and Capital Gains Tax (placeholder $0 — not yet modeled, noted in-UI). Income categories: Savings Drawdown, Social Security, Rental/Passive, Other Income, Roth Conversion. | (this session) |
| ✅ ENG-22 | Follow-up to ENG-20/21: the Withdrawal Plan tab's "Annual Withdrawals by Source" stacked-bar chart (Cash/Taxable/Pre-Tax/Roth/Tax) didn't show the Roth conversion at all — it only appeared in the Year-by-Year table's "Roth Conv" column. Added "Roth Conversion" as its own stacked segment (purple, matches the table column) sourced from `r.conversionAmount`. Also added two Boldin-style decision metrics to the summary cards (now 6, in a 3-col grid): **Avg. Withdrawal Rate** (mean of `totalWithdrawal / prior-year totalPort` across the plan, using new `accumulateToRetirement(p)` for year 1's starting balance) and **Portfolio Depletion** (first age where `totalPort <= 0`, or "Never"). | (this session) |

### Open

| # | Severity | Where | Finding | Suggested fix |
|---|----------|-------|---------|---------------|
| ~~ENG-8~~ ✅ | ~~MEDIUM~~ | `buildWithdrawalWaterfall.js` Step 6.5 | ~~`irmaaGuard` only constrains the Step-5 pretax withdrawal ceiling, not the Step-6.5 Roth conversion amount.~~ | **✅ FIXED v1.2.28 (2026-07-27).** `ceilingConv` is now capped at the IRMAA tier-1 MAGI ceiling whenever `irmaaGuard && age >= 63`, mirroring Step 5. Four things to understand before editing it: **(a)** `dedConv` is subtracted only to express the MAGI threshold in the same taxable-income space as `ceilingConv` — it cancels out of `room` algebraically and does NOT reduce true MAGI (rule 3 intact). **(b)** `realizedGain` is ALSO subtracted, because MAGI includes realized gains while `taxNoConv.totInc` (the base `room` is measured against) excludes them — without it the room is overstated by the year's gain and the conversion can still breach the tier. NOTE: Step 5's own `irmaaCap` does not yet do this; that pre-existing LTCG-in-MAGI gap is left unchanged rather than silently widening this fix's scope — see the new ENG-25 below. **(c)** The `age >= 63` gate is deliberately identical to Step 5's and is correct for conversions too: IRMAA runs on a 2-year lookback, so a conversion at 63+ first bites at 65+, exactly when Medicare premiums begin (converting at 62 → lookback lands at 64, pre-Medicare → correctly exempt). **(d)** It caps against the CURRENT year's ceiling even though the MAGI is charged in yr+2 against a higher, inflation-indexed ceiling — making the cap slightly STRICT. It can only under-convert, never let a conversion slip past the real future cliff, which is the correct failure direction for a guardrail. Do NOT "fix" (d) into an off-by-2-years bug. New `convCapReason` row field (bracket / irmaa_ceil / manual / affordability) mirrors `pretaxCapReason` so §17's planned `conversionRoomAllCliffs()` can append ACA/LTCG/NIIT rooms to the same `min(...)` without a rewrite. Propagates to BOTH the Withdrawal Plan tab and the Conversion Plan ladder by construction, since ENG-12/ENG-14 already route both through `buildWithdrawalWaterfall`. 5 new tests. |
| ENG-13 | LOW | `buildWithdrawalWaterfall.js::BRACKET_CEILINGS_MFJ/SINGLE` + `rothConversionPlan.js::buildConversionLadder` | Only 10/12/22/24% bracket ceilings are defined; the Conversion Plan tab's `fill_32`/`fill_35`/`fill_37` mode buttons map to `rothConversionTarget` values ("32"/"35"/"37") that `bracketCeiling()` doesn't recognize and silently falls back to the 22% ceiling — so those modes currently render identically to `fill_22`. | Add `"32"`, `"35"`, `"37"` (and their inflation-adjusted ceilings) to `BRACKET_CEILINGS_MFJ`/`BRACKET_CEILINGS_SINGLE`. |
| ENG-15 | LOW | `rothConversionPlan.js::buildConversionLadder` vs `buildRothExplorer`'s FAFSA/CSS guards | `buildWithdrawalWaterfall` (and therefore the new ladder) doesn't implement the `fafsaEndYear`/`cssEndYear` college-aid conversion caps that `buildRothExplorer` had. Profiles using those guards will see a different (uncapped) conversion amount in the ladder during the FAFSA/CSS window. | Port the FAFSA/CSS bracket-ceiling overrides from `buildRothExplorer` (lines ~472-478) into `buildWithdrawalWaterfall`'s Step 6.5 `rothConversionTarget` ceiling calculation. |
| ENG-10 | LOW | Account model (`accounts[].category === "pretax"`) | No basis tracking for "pretax" accounts — every dollar converted is assumed 100% taxable. The IRS pro-rata rule (Form 8606) requires that if a Traditional IRA holds *any* after-tax (non-deductible) contributions, each conversion is taxed proportionally (taxable % = pretax balance / total balance across all Traditional IRAs). For 401(k)/most IRAs with no after-tax basis (the common case), the current 100%-taxable assumption is already correct, so this has not caused incorrect numbers yet. | If/when a user reports after-tax (non-deductible) contributions to a Traditional IRA, add an optional `afterTaxBasis` field per pretax account, sum it across all pretax accounts to get total basis, and have `buildWithdrawalWaterfall`'s conversion-tax step multiply `conversionAmount` by `(totalPretaxBalance - totalBasis) / totalPretaxBalance` to get the taxable portion (with the remainder reducing total basis pro-rata). |
| ENG-11 | LOW | `rothConversionPlan.js::checkRothWithdrawalPenalty` | Implements only the per-conversion 5-year/10% penalty clock (IRC §408A(d)(3)(F)), per the spec given. It does NOT implement the separate "forever" 5-year clock (IRC §408A(d)(2)(B)) that governs whether *earnings* can be withdrawn federal-income-tax-free — that clock starts on Jan 1 of the year of a taxpayer's first-ever Roth contribution/conversion (any Roth IRA) and never resets. Distinguishing "contributions/conversions" (always penalty/tax-free to withdraw, subject to the 5-yr clock above) from "earnings" (taxable AND penalized until both the forever-clock and age 59½ are satisfied) requires tracking a running lifetime Roth balance broken into contribution-basis vs. earnings, which AiRA does not currently model. | If users need an "is this Roth withdrawal fully tax-free" answer (not just the penalty), add `firstRothContributionYear` to the profile and a second check `qualifiedDistribution = ageAtWithdrawal >= 59.5 && (currentYear - firstRothContributionYear) >= 5`; gate earnings-taxability on that flag separately from `checkRothWithdrawalPenalty`'s per-conversion result. |
| ENG-17 | LOW | Profile (Assumptions) — `taxFunding`, `fafsaEndYear`, `cssEndYear` in the "Roth Conversion Strategy" card | After ENG-16, audit whether these remaining Roth-conversion fields are "basic life configuration" (stay in Profile) or "calculation tuning" (belongs on the Conversion Plan / Tax Room tabs, per the design principle established by ENG-16 and the existing Withdrawal Order pointer). `taxFunding` ("how conversion taxes are paid") looks like tuning similar to `rothConversionTarget`; `fafsaEndYear`/`cssEndYear` are arguably life-timeline facts (when a child's college aid window is) so may be fine to keep. Also note ENG-15 (FAFSA/CSS caps not yet wired into `buildWithdrawalWaterfall`) is a prerequisite for `fafsaEndYear`/`cssEndYear` to have any effect on the new ladder. | Review each field against "basic parameter vs. calculation tuning"; move `taxFunding` to the Conversion Plan tab (same pointer pattern) if confirmed as tuning, or leave with a documented rationale if it's genuinely a global default. |
| ENG-25 | MEDIUM | `buildWithdrawalWaterfall.js` Step 5 `irmaaCap`; `App.jsx` `runMC` bracket-room block | **Found while fixing ENG-8.** Step 5's IRMAA cap (and `runMC`'s equivalent) compares a MAGI ceiling against an ordinary-income floor that EXCLUDES realized capital gains, so the room is overstated by the year's gain and the pretax draw can still push MAGI over an IRMAA tier that `irmaaGuard` is supposed to protect. `runMC`'s own comment already concedes this ("LTCG from the taxable draw is not yet folded into the MAGI base here"). ENG-8 fixed the identical defect on the Step-6.5 conversion path by subtracting `realizedGain`; the two paths are now asymmetric. | Subtract the year's realized gain from the MAGI base in Step 5's `irmaaCap` and in `runMC`'s `irmaaRoom`, exactly as Step 6.5 now does. Ordering caveat: in Step 5 the gain is not yet converged when the ceiling is computed (the cascade solves draw ⇄ tax by fixed point), so either use the prior pass's gain or move the cap inside the fixed-point loop — decide deliberately and comment it. |

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
| H2 | ~~HIGH~~ ⚠️✅ | `webhook.js`, `analyze.js`, `db/schema.sql`, `db/migrations/` | `charge.refunded` / `charge.dispute.created` events not handled. User buys $15, spends $0.50, files chargeback → keeps credits + merchant pays dispute fee. Permanent profit leak. | **⚠️✅ Fixed 2026-06-15, audited + downgraded 2026-06-16.** Core handling shipped `c74eadf`: `charge.refunded` deducts credits proportional to the `previous_attributes.amount_refunded` delta (partial-refund safe); `charge.dispute.created` fetches the charge, sets `status='disputed'`, writes a `dispute_lock` row; `analyze.js` returns 403 for disputed accounts. **General-purpose auditor (2026-06-16) verdict: PARTIAL** — three gaps, all now fixed: (1) `analyze.js` 403/402 ordering reversed so a disputed+drained account sees "suspended" not "insufficient credits"; (2) `webhook_events` idempotency table lived only in `schema.sql`, never a migration → migration-only DBs lacked it and the dedup soft-fails open (double-deduction risk on Stripe retry); added `db/migrations/003_h2_followups.sql` to create it, PLUS a per-event idempotency guard (`alreadyProcessed`) on refund/dispute audit rows so they're safe even without that table; (3) `status='disputed'` was terminal → added `charge.dispute.closed` handler that reactivates accounts whose dispute is **won** (writes `dispute_release` audit row; CHECK + schema + migration 003 updated). Refund-delta math extracted to dependency-free `functions/_shared/billing-math.js` and unit-tested (9 cases incl. partial/incremental/idempotent/negative). **Remaining caveat (why not full ✅):** only the pure refund math is unit-tested; the D1 batch writes, dispute resolution, and the 403 path still have NO automated integration test (no D1/Stripe mock harness exists). Pre-launch ops MUST (a) subscribe the Stripe webhook to `charge.dispute.closed`, and (b) apply migration 003. 302/302 unit tests pass. |
| H3 | ~~HIGH~~ ✅ | `checkout.js`, `verify-session.js`, `credits.js` | Session_id leak → JWT theft / account takeover. | ✅ Fixed in `c9bbe59`. `/api/checkout` generates a random UUID nonce, stores in new `pending_checkouts` D1 table (30-min TTL), embeds in success_url alongside Stripe's `{CHECKOUT_SESSION_ID}` placeholder. `/api/verify-session` requires both params and atomically consumes the nonce via conditional UPDATE (single-use + race-safe via `meta.changes === 1`). Defense-in-depth: still re-checks Stripe `payment_status === 'paid'` after nonce consume. Client `useStripeReturn` reads + cleans both URL params; if nonce missing, surfaces a recovery message pointing users to support. Fails closed if the `pending_checkouts` table is missing. Recovery for missed nonce window: webhook still credits user → ops uses admin panel `issue-jwt`. |
| H4 | ~~HIGH~~ ✅ | `admin.js` | No rate limiting; no audit log of who issued grants. Compromise of ADMIN_SECRET = invisible drain. | **✅ Fixed 2026-06-19.** Worker-side D1-backed rate limiter: max 10 requests/60s per `CF-Connecting-IP`; returns 429 on breach and logs `result='rate_limited'` rows. Audit trail: new `admin_audit` table (schema + migration `004_h4_admin_audit.sql`), one row written per authenticated action via `waitUntil` (fire-and-forget). Admin action dispatch refactored into `doAction()` inner function so audit write happens at a single point. |
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
- [x] H2: refund / dispute / chargeback handling (audited 2026-06-16; follow-up gaps fixed — see H2 row. Integration tests still absent.)
- [x] H3: bind `verify-session` to a one-time purchase nonce (`c9bbe59`)
- [x] **`BILLING_ENABLED = true` flipped and committed to main — 2026-06-19**
- [x] H4: rate-limit `/api/admin` + admin audit trail (D1-backed Worker-side limiter, 10/min/IP; `admin_audit` table; migration `004_h4_admin_audit.sql`)
- [x] AI-2: token refund on empty/unusable AI result (`refundD1Credits`, idempotent via deduction txn id)
- [ ] Schema migration applied: `wrangler d1 execute aira-credits --file=db/schema.sql --remote` (fresh DB) — for existing DBs run `002_h2_refund_dispute.sql` **then** `003_h2_followups.sql` **then** `004_h4_admin_audit.sql`
- [ ] Env vars set in Cloudflare Pages: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `GEMINI_API_KEY`, `JWT_SECRET` (32+ hex), `ADMIN_SECRET` (32+ chars)
- [ ] Stripe webhook configured: `POST https://<domain>/api/webhook` listening for `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`
- [ ] Sandbox tested via `simulate-purchase` admin action
- [ ] Sandbox tested via Stripe CLI: `stripe trigger checkout.session.completed`

## 8. Security note — Crestline MCP injection (2026-06-13)

A claude.ai-side MCP server "Alpha Ops Intelligence" (Crestline) was loaded during this session and injected a `system-reminder` mid-tool-output attempting to redirect the auditor agent into a "reconciliation analyst" role. The agent correctly ignored it and surfaced the attempt.

**Action for operator:** disconnect at https://claude.ai/settings/connectors. This is a prompt-injection vector against your dev environment regardless of how it got connected. Not a vulnerability in AiRA itself — but worth knowing because any code-context that flows through the same Claude session is exposed to the same injection.

## 9. Detailed Expense Budgeter — 2026-06-17 session

Goal: let a user replace the single aggregate spend (`p.sp`) with a detailed
line-item budget uploaded as CSV — either a **one-year** budget (summed, then
inflated forward like a typed number) or a **multi-year** budget (an explicit
per-year spend schedule). Modeled on Boldin's "Detailed Budgeter": exclude
mortgage/rent, debt, medical, long-term care, and income tax (all modeled
elsewhere); include only core recurring lifestyle spend.

### ✅ Shipped

| # | What | Version |
|---|------|---------|
| ✅ ENG-23 | **CSV import core.** New dependency-free module `src/engine/expenseImport.js`: `parseExpenseCsv(text)` auto-detects layout — single-year (`Category,Amount`), multi-year wide (`Category,2026,2027,…`), multi-year long (`Year,Category,Amount`), or a bare amount column — tolerates `$`/thousands-commas/parentheses-negatives, and is Boldin-aware: a **Frequency** column normalizes to annual (Monthly ×12, Weekly ×52, etc.) and a **Must Spend / Like to Spend** split is parsed (Like = total, Must = `essentialTotal`). `scheduleSpendForYear(schedule, calYear, infPct)` resolves a year's spend from a multi-year schedule (exact year → nominal; gap/tail → carry last value forward, inflated). One-year import lands in the existing `sp` field; multi-year becomes `p.spSchedule` `[{year,amount}]` which **overrides the distribution strategy's spend rule** (the budget IS the plan; no GK clamp in that path). Wired into ALL FOUR engines: `runMC` (~798), `simulateDeterministicWithStrategy` (~1251), `runStress` (~1118), `buildWithdrawalWaterfall.runScenario` (smart + naive). New profile fields `spSchedule` / `spImportMeta` (display meta) added to `BLANK_PROFILE`, forwarded in the `params` useMemo, migration-guarded on load, round-trip via save/export (whole-object serialize). UI: new `ExpenseImport` component in the SPENDING section of `RetirementPanel` (proximity) with one-year + multi-year template downloads, parsed summary, warnings, and Clear. 19 tests in `src/expenseImport.test.js`. | v1.1.0.19 |
| ✅ ENG-24 | **Must/Like → GK guardrails.** New pure `resolveSpendGuardrails({sp, spOutOfCountry, gkFloorPct, gkCeilingPct, spImportMeta})`: when a one-year import carried a Must/Like split (`essentialTotal` present), the budget drives the guardrails — floor = Must Spend (essentials, never cut), ceiling = Like to Spend (full desired budget) — overriding the `gkFloorPct`/`gkCeilingPct` sliders; otherwise the legacy % path applies. Out-of-country spend added to both bounds. Wired into the `params` useMemo (replaces the inline `gkFloor`/`gkCeiling` math) and the GK card in `RetirementPanel` (shows dollar Must/Like figures + a note that the % sliders are overridden when import-driven). Single-year template upgraded to the Boldin `Category,Frequency,Must Spend,Like to Spend` format. 5 tests. **326/326 pass, build clean (+3.6 kB gzip, no new dependency).** | v1.1.0.20 |

### ⏳ Open — what's left on the budgeter

| # | Severity | Finding | Suggested fix |
|---|----------|---------|---------------|
| BUD-1 | MEDIUM | **AI engine ignores the detailed budget.** The AI Action Plan context (`src/ai/ai-analysis.js`) is built from aggregate `sp` / waterfall rows and does NOT yet see `spSchedule` or the Must/Like split — so AI advice still reasons about a single flat spend even when a detailed/multi-year budget is loaded. (Part of the broader "fix the AI portion of the engine" item — see §10.) | Thread `spImportMeta` + a compact year/essential/total summary into the AI context payload; have the prompt acknowledge per-year and essential-vs-discretionary spend. |
| BUD-2 | MEDIUM | **Per-line Start/End not supported (the big Boldin feature).** Boldin rows carry Start/End (age like `54y10m`, date like `Mar 2030`, or `Lifetime`). We only accept an explicit per-year schedule or a single year; we don't expand dated line items into a year-by-year schedule. | Parse Start/End columns (age→calendar via `birthYear`, date, `Lifetime`); expand each active line per year (frequency-normalized, today's-$ inflated or nominal — needs a decision) into `spSchedule`. Est. ~40–65K tokens; product decision needed on age/date formats + inflation basis. |
| BUD-3 | LOW | **Multi-year mode has no Must/Like floor band.** `spSchedule` stores only the total per year; essentials aren't carried, so a multi-year budget can't drop to "Must Spend" in bad markets — each year is a fixed number. | Capture an `essentialSchedule` alongside `spSchedule` and feed it as the per-year floor when guardrail strategies run on a multi-year budget. |
| BUD-4 | LOW | **Category detail not surfaced in charts.** Import is "total only" (per the agreed scope); category labels (Travel, Groceries, …) and the Medical/LTC split are not pushed into the 📉 Income & Expenses chart (ENG-21) or carveouts. | Optionally map import categories → the existing `categorizeCarveouts` buckets so the breakdown chart reflects the uploaded detail. |
| BUD-5 | LOW | **No render smoke test for the import UI**, and the feature has not been clicked through in a browser (tests + build pass only). Same gap class that let the RothLadder crash slip past the engine suite. | Add a shallow render test of `ExpenseImport` (+ the Withdrawal/Roth tabs) and manually verify an upload end-to-end. |
| BUD-6 | LOW | `$`/comma formatting on the Roth-reserve and other plain number inputs (carried over P2 polish). | Route through `ANumInput` formatting. |

## 10. Open — AI engine + token refund (2026-06-17, flagged by Vincent)

Captured for the backlog; not yet scoped into tasks.

| # | Severity | Area | Finding | Direction |
|---|----------|------|---------|-----------|
| AI-1 | MEDIUM | `src/ai/ai-analysis.js` context build | "Fix the AI portion of the engine." The AI Action Plan context is assembled from a subset of engine outputs and does not reflect recent engine changes (detailed budget per BUD-1; verify it also picks up Roth-conversion reconciliation ENG-9/12/14, source-aware tax, housing/carveouts ENG-19/20). Risk: AI narrates numbers that disagree with the tabs. | Audit exactly which fields the AI prompt receives vs. what the engines now compute; build the context from `buildWithdrawalWaterfall` rows (single source of truth) the same way the charts do. |
| AI-2 | ~~HIGH~~ ✅ | `functions/api/analyze.js` | **Token refund on empty/unusable AI result.** Credits are deducted post-call from Gemini usage metadata, but there was no refund path when the response contained no usable structured data (empty function call args, empty text response, zero timesensitive cards). | **✅ Fixed 2026-06-19.** `deductD1Credits` now returns `txnId` (D1 `last_row_id`). New `isEmptyResult(type, result)` detects empty returns per call type (health/narrative/roth/withdrawal/chat/timesensitive). New `refundD1Credits(db, customerId, creditCost, deductTxnId)` issues a compensating `type='refund'` credit_transaction row, keyed to the deduction txn id via `stripe_session_id` — idempotent (checks for existing refund row before inserting). Response includes `_refunded: true` and `_credits_used: 0` when a refund fires so the client's cached balance stays accurate. |
| AI-3 | MEDIUM | AI ↔ expenses | The AI should reason about the detailed/multi-year expenses and the essential-vs-discretionary (Must/Like) split once BUD-1 lands, e.g. "your discretionary travel in 2029 is what pushes you into IRMAA." | Depends on BUD-1; add prompt guidance + a worked example once the context carries the budget. |

## 11. Session pickup — 2026-06-17 EOD

State at end of evening; resume here next session.

### Shipped & pushed
- **Detailed Expense Budgeter** (ENG-23/ENG-24, app `v1.1.0.20`) is committed and
  pushed to `main` (commit `192e11d` "Created Detail expense budgeter version 1.0.0"
  — note: commit message says 1.0.0, in-app `BUILD_TAG`/`APP_VERSION` is `v1.1.0.20`).
  326/326 tests green, build clean. See §9.
- **This `REQUIREMENTS.md`** (§9, §10, §11) — commit on next push (was uncommitted at EOD).

### Local billing/Stripe test env — NOW WORKING (do not re-derive)
- Billing/admin/AI functions only run under the Cloudflare runtime. Use
  `npm run build && npx wrangler pages dev build` (local, ~`localhost:8788`).
  Plain `npm start` 404s on `/api/*` — UI only.
- Secrets live in **`.dev.vars`** (gitignored, created this session): real test-mode
  `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (`whsec_…`), three
  `STRIPE_PRICE_*`, `JWT_SECRET`, `ADMIN_SECRET`. `ADMIN_SECRET` = the admin-panel
  password (open app with `?aira_admin=1`).
- Local **D1 seeded**: `npx wrangler d1 execute aira-credits --local --file=db/schema.sql`
  created `customers`, `credit_transactions`, `webhook_events`, `pending_checkouts`.
- **Verified working:** Cloudflare runtime serves functions; admin auth passes;
  D1 tables exist. (`ping` + admin actions return instead of 404 / no-such-table.)

### Pick up here (test + cleanup)
1. **Finish the end-to-end billing test** (still `BILLING_ENABLED = false`): admin
   `simulate-purchase` → `inspect` to confirm the buy→credit→balance path. Then test
   refund/dispute, which needs the extra columns — run
   `npx wrangler d1 execute aira-credits --local --file=db/migrations/003_h2_followups.sql`
   (and `002_h2_refund_dispute.sql`).
2. **`.dev.vars` caveat:** the three `STRIPE_PRICE_*` currently all point to ONE
   $15 price. Credits are granted by `packId` (not price), so checkout still works,
   but Starter/Value won't charge their real amounts. Set the correct per-product
   `price_…` IDs before any realistic pricing test.
3. **Roll the `sk_test_` key** in Stripe (appeared in a chat transcript; test-mode, low risk).
4. Archive the 3 throwaway "AiRA …Pack" test products created via API this session
   (only if you want a tidy Stripe test catalog).

### "Update the stuff soon" — priority backlog (from §10)
- **AI-1** (MEDIUM): fix the AI portion of the engine — audit which fields the AI
  Action Plan prompt receives vs. what engines now compute; build context from
  `buildWithdrawalWaterfall` (single source of truth) like the charts do.
- **AI-2** (HIGH, billing): **token refund** — no refund path when an AI call fails /
  returns empty after credits were deducted. Add idempotent compensating credit
  (`type='refund'`) before flipping `BILLING_ENABLED=true`.
- **BUD-1** (MEDIUM): thread the detailed/multi-year budget + Must/Like split into the
  AI context (depends on / pairs with AI-1).
- Pre-launch billing blockers still open: **H4** (rate-limit `/api/admin` + audit trail).
  See §7 checklist before `BILLING_ENABLED=true`.

## 12. User-Configurable Withdrawal Order ("Custom Order" wizard) — scoped 2026-06-29

Requested by Vincent. **Comparable:** Boldin's custom withdrawal-order list. **Priority:** P1.
**Status:** ✅ **SHIPPED v1.2.8 (2026-07-25).** Built via one shared `resolveDrawOrder`/`WITHDRAWAL_BUCKETS`/`NAIVE_DRAW_ORDER` exported from `buildWithdrawalWaterfall.js` and used by BOTH engines (no drift). Profile keys `orderingMode` ("tax_reactive"|"custom"|"pretax_first") + `withdrawalOrder` added to `BLANK_PROFILE` + `params`. UI: `AccountDrawOrder` radio + reorderable up/down list above the guardrails strip in the Sourcing section. **Naming resolved per design-authority BLOCKED verdict:** modes are "Tax-reactive/Custom/Pre-tax first" (NOT "Smart/Traditional" — that collided with the distribution strategy 3×); the waterfall View toggle renamed to "Your plan" / "No plan (pre-tax first, uncapped)"; Section-1 subtitle + Profile pointer templated from the live order. logic-validator: APPROVE-WITH-CHANGES (no logic bugs; naive-invariance + NAIVE_DRAW_ORDER constant added per its non-blocking flags). **6 new tests** (resolver sanitize, default==tax_reactive deep-equal incl. naive-invariance, taxable-first, Roth-reserve-honored-first, bracket-cap-binds-when-pretax-first, runMC honors order) — 445 total pass.
**Engine insertion point (line ref corrected — was stale "290-345"):** `buildWithdrawalWaterfall.js` `runScenario` draw loop ≈ lines 525-582 (`drawCash`/`drawTaxable`/`drawPretax`/`drawRoth` closures + `drawFns` map + `for (const bucket of drawSeq)`); `runMC` mirror in `App.jsx` ≈ lines 1331-1343.

_Original scope (for history) below:_

### Problem
Account drawdown order is **hardcoded** `cash → taxable → pre-tax (bracket-capped) → Roth` in
three places, with no user control over *which bucket drains first*:
- `runMC` — `src/App.jsx:999-1034`
- `buildWithdrawalWaterfall` (smart + naive) — `src/engine/buildWithdrawalWaterfall.js:290-345`
  (already uses named `drawCash()/drawTaxable()/drawPretax()` closures + a smart-vs-naive branch
  at 331-337 — the clean insertion point)
- `simulateDeterministicWithStrategy` sources from the waterfall, so no separate edit.

The `withdrawalStrategy` dropdown (`src/App.jsx:4802`) only sets *distribution* (how much). The
guardrails strip (`src/App.jsx:4659`) caps pre-tax *depth*, not order. Users who want explicit
control (advisors, power users) have no lever; the "source matters" story can only be told today
by flipping the existing Smart / "Without planning" View toggle (`src/App.jsx:4944`), not by
setting an arbitrary order.

### Goal
Let a user choose **how accounts are drained** while keeping today's tax-reactive **Smart** order
as the default. Distribution stays orthogonal and untouched.

### Profile keys (add to `BLANK_PROFILE`, `src/App.jsx:480`)
```jsonc
"orderingMode": "smart",   // "smart" | "custom" | "traditional" — default "smart" = today's behavior
"withdrawalOrder": ["cash","taxable","pretax","roth"]   // used only when orderingMode === "custom"
```
Defaults preserve current behavior exactly. Generic-first: no user-specific values.

### Behavior
- **smart** — current engine, tax-reactive (cash → taxable → pre-tax capped → Roth).
- **custom** — drain in the user's `withdrawalOrder`. **Invariants that hold regardless of order:**
  RMDs are Step 1 (legal, never reorderable); bracket cap / IRMAA guard attach to the `pretax`
  step *wherever it sits*; `rothEmergencyReserve` floor honored even if Roth is dragged to the top.
- **traditional** — taxable → pre-tax → Roth, no bracket cap (the existing naive baseline).

### UI (📋 Withdrawal Plan tab, Sourcing section, above the guardrails strip)
Radio: ○ Smart (recommended) · ○ Custom order · ○ Traditional. Custom reveals a reorderable
4-bucket list. **Up/down arrows, no drag library** (no new npm dependency — project rule).
Helper: "Earlier = drained first. RMDs are always taken first by law; the bracket cap and Roth
reserve still apply."

### Engine change
Replace the hardcoded sequence with an array-driven loop in **both** engines: map bucket name → its
existing `drawX()` closure, iterate `withdrawalOrder`. Roth keeps its reserve-floor special-casing
wherever it lands. Mirror the same loop in `runMC:1004-1034`.

### Tests (additive, `src/computations.test.js`)
1. Default `smart` ⇒ byte-identical year-1 draws to current engine (regression lock).
2. Custom `["taxable","cash","pretax","roth"]` drains taxable before cash; sum invariant holds.
3. Roth-first custom still respects `rothEmergencyReserve`.
4. Pre-tax bracket cap still binds when pre-tax moved to position 1.
5. `traditional` matches the documented naive path.
6. Cross-engine parity: `runMC` y1 and `buildWithdrawalWaterfall` agree on draw shape for a custom order.

### Process
Bump `APP_VERSION` / `BUILD_TIME` / `BUILD_TAG` (lead `[main]`). `npm test -- --watchAll=false`
green (326 → ~332) before commit. Work on `main`.

### Out of scope (v2)
Per-year order overrides; tax-lot selection within taxable; separate Roth-conversion ordering.

### Effort
Small-to-medium. Waterfall engine pre-structured for it; the `runMC` edit is the delicate part
(bracket-cap block is inline). ~1 focused session.

### Demo workaround until built (2026-06-29 "source matters" video)
Both paths live in the 📋 Withdrawal Plan tab → "Where does each year's spending come from?" via
the **View** toggle (`src/App.jsx:4944`):
- **Path 1 (ordinary income):** `Without planning (pretax first)` → the draw is a pre-tax IRA
  withdrawal, taxed as ordinary income. (Naive scenario never runs Roth conversions, so it's clean.)
- **Path 2 (0% LTCG):** `📋 Smart Waterfall`, with two setup steps so the 0%-bracket story holds:
  1. **Roth conversions → Off** (Conversion Plan tab → mode "Off" → `rothConversionTarget = "off"`).
     The smart scenario's Step 6.5 conversion (`buildWithdrawalWaterfall.js:16`) otherwise stacks
     ordinary income that pushes total income past the LTCG-0% ceiling.
  2. **Cash bucket ≈ $0**, so the draw lands on the taxable brokerage (smart drains cash before
     taxable at `src/App.jsx:999`). NOTE: per §3, taxable draws are currently modeled as 100%
     return-of-basis — the engine shows $0 federal tax on the taxable draw, which happens to match
     the 0%-LTCG narrative, but for the right reason only by coincidence (LTCG/cost-basis not yet
     modeled).

## 13. Full-Codebase Audit — 2026-07-11 (v1.1.0.28)

Three parallel reviews: logic/IRS currency, cross-screen calculation drift, fonts/UI.
Regression check: **R1–R10 all still hold** — no June fixes were lost. Constants tables
(brackets, IRMAA, RMD, state) verified byte-identical between App.jsx and engine. New
findings below, most severe first. Verdict: **BLOCKED** on §13.1 items.

### 13.1 Logic — WRONG (screens disagree or math is wrong today)

1. ✅ **FIXED v1.1.0.29 (2026-07-11)** — runMC taxed every draw as ordinary income
   AND double-counted RMDs (in the tax base *and* the portfolio outflow). Now
   source-aware: ordinary income = RMD + discretionary pretax draw only, solved by
   fixed-point iteration (draw size ⇄ tax, ≤4 passes). RMD proceeds fund spending
   first; excess RMD is reinvested in the taxable bucket (was vaporized AND
   double-drawn from pretax).
2. ✅ **FIXED v1.1.0.29 (2026-07-11)** — the Waterfall never funded its income tax
   from any bucket. The cascade now raises need + fed + state + IRMAA (same
   fixed-point pattern as runMC); conversion tax remains separately self-funded
   from pretax. RMD proceeds offset need with excess swept to taxable, matching
   runMC. `totalWithdrawal` row = gross outflow (rmd + all draws); tax is no
   longer added on top since the draws already include it.
   Remaining nuance: `calcYearTax.totalTax` includes IRMAA while the waterfall's
   `totalTax` excludes it (reported via `irmaaFull`) — reporting conventions still
   differ, but both engines now FUND fed+state+IRMAA identically.
   Tests recalibrated (success rates legitimately rose): RMD pretax-vs-Roth test
   compares median terminal wealth; $266K fixed-4% median now grows past start;
   SINGLE_FL stress re-tensioned to $48K spend (~87% at seed 42). 338 passing.
3. ✅ **FIXED v1.1.0.30 (2026-07-11)** — the Waterfall's spend adjustment now uses
   the smart GK/Bengen hybrid (GK guardrails while >15 years remain, inflation-only
   inside the final 15), matching runMC. Since the deterministic "smart" schedule
   sources from the waterfall, MC and Withdrawal Plan spending agree again.
4. ✅ **FIXED v1.1.0.30 (2026-07-11)** — full bracket-target coverage in BOTH
   engines: "10"/"32"/"35"/"37" ceilings added to `getBracketCeiling` (App) and
   `BRACKET_CEILINGS_*` (waterfall); "37" = Infinity. Prerequisite: the 35%
   (512,450–768,700 MFJ / 256,225–640,600 single) and 37% (above) federal brackets
   were added to both copies of FED_BRACKETS_2026 — income above $512K/$256K was
   previously untaxed beyond the 32% tier. ENG-13 comment in rothConversionPlan.js
   updated.
5. ✅ **FIXED v1.1.0.30 (2026-07-11)** — `PROFILE_TO_ROTHMODE` now maps the
   un-prefixed values ("10".."37") the params memo produces, so stored
   fill_10/12/24/32/35 targets no longer silently become fill_22 in the Roth tab.
6. ✅ **FIXED v1.2.28 (2026-07-27)** — ~~OBBBA $6,000/person senior bonus deduction
   (2025–2028) absent.~~ Verified against IRS newsroom guidance + Tax Foundation +
   Fidelity (sources recorded in `TAX_REFERENCE.md` → "OBBBA Senior Bonus Deduction"):
   $6,000 per qualifying person 65+, tax years **2025–2028 only** ($0 from 2029, a hard
   cliff), available to itemizers AND non-itemizers, stacking on top of both the regular
   standard deduction and the existing age-65 add-on, MFJ must file jointly, MAGI
   phase-out from **$75K single / $150K MFJ at 6% of the excess** (fully gone at
   $175K/$250K), and **NOT inflation-indexed** (so it is deliberately exempt from this
   project's 2.5%/yr indexing convention — `getSeniorBonusDeduction()` takes no
   inflFactor by design).
   Implemented as a **separate additive term**, NOT folded into `getStandardDeduction()`
   — OBBBA is available to itemizers, so merging it would foreclose an itemizer model.
   Lives in `buildRothExplorer.js` (the only shared leaf module with no circular-import
   risk) and is threaded into every LIVE reader, which turned out to be five, not one:
   `calcYearTax`, `runMC`'s bracket-room sizing, and the waterfall's `yearTax` +
   Step-5 pretax ceiling + Step-6.5 conversion ceiling. In the two ceiling paths the
   bonus is estimated at the **high end** of plausible MAGI (floor + pre-bonus room) so
   the phase-out is worst-cased and the cap can under-fill but never overshoot the
   bracket — same conservative direction as the existing 85%-SS-inclusion estimate.
   **Reduces taxable income only**; `magi` is now computed structurally *ahead* of every
   deduction line in both engines, with a regression test pinning that MAGI is identical
   with and without the bonus (rule 3 — a deduction must never move the IRMAA base).
   Impact: a single 65-year-old drawing $40K in FL was charged **$2,422** federal tax
   instead of **$1,702** — a 30% overstatement, which understated success rate and safe
   spending for every 65+ user below the phase-out; roughly double for MFJ both-65+.
   **Adjacent bug fixed in the same pass:** the "This Year" Roth-headroom panel
   (`App.jsx`, `view === "thisyear"`) computed its own `(isMFJ ? 32200 : 16100) * f`
   with **no age-65 add-on at all** — a third-generation standard-deduction copy that
   understated the deduction (and so overstated tax / understated conversion headroom)
   for every 65+ user, independent of OBBBA. Now routed through the canonical helpers.
   9 new tests + 3 pre-OBBBA expectations recalibrated with the derivations written out.
7. ✅ **ALREADY FIXED** (verified in code 2026-07-27) — ~~Kitces ratchet broken in
   deterministic engine.~~ `startingPort` is hoisted outside the year loop in BOTH
   engines (`App.jsx:1149` in `runMC`, `~1763` in `simulateDeterministicWithStrategy`,
   the latter carrying an explicit comment about why it must stay hoisted).
8. **"95% rule" is not Clyatt's rule** (App.jsx:915-923, 1298-1305) — never reads
   portfolio value (canonical: max(0.95×prior, 4%×current port)); behaves as plain
   Bengen. **"CAPE-based" hardcodes CAPE=20** (App.jsx:893, 1278) → permanently 4%
   flat; UI copy claims Shiller-CAPE reactivity.
9. **Ghost models**: `smile` (Blanchett curve) and healthcare-shock params
   (hcShockAge/hcProb/hcMin/hcMax) are configurable, persisted, and described as
   active in Forecast copy — but no engine reads them anymore.

### 13.2 Cross-screen drift (same profile, different numbers)

10. ✅ **ALREADY FIXED** (verified 2026-07-27) — ~~SS COLA anchor drift.~~ Both engines
    now grow SS from the CLAIM age (`Math.pow(1 + ssCola/100, age - ssAge)`) —
    `App.jsx:1210`/`:1805` and `buildWithdrawalWaterfall.js:545`.
11. ✅ **FIXED v1.2.28 (2026-07-27)** — ~~Rental/annuity models differ ×3.~~ The
    waterfall now uses the same model as runMC/simulateDeterministicWithStrategy:
    ab + propIncome are **summed first, then grown once** at the user's abGrowth
    (default 3.0, newly added to the params destructure — its absence is why the engine
    silently hardcoded 1.03), capped at 20 years of compounding as both other engines
    already did, and abEndYear is honored. The separate CPI track on propIncome is gone,
    including in the ab0 baseline that calibrates initWR.
    **The age-80 hard stop is deleted, not relabeled** — it existed only in this engine,
    had no basis in any user input, directly contradicted the user's own abEndYear, and
    silently understated rental income (thereby overstating pretax/Roth draws and tax) for
    every profile planning past 80. logic-validator found no defensible reading of it as
    intentional.
    **abReliability is deliberately NOT applied here.** It is a per-year all-or-nothing
    Bernoulli draw (rand() < abReliability/100, App.jsx:1410) that only has meaning across
    runMC's many paths — rental is paid in FULL or not at all in a given simulated year,
    never multiplied by 0.8. Adding an expected-value haircut to a single deterministic
    path would have invented a FOURTH model. (design-authority initially asked for the
    opposite; the code settled it.)
    **Consequent labeling fix:** the Income Offsets card read "Rental net (80% reliable)"
    while displaying the **gross** params.ab — it labeled a gross number "net". Now just
    "Rental income", with the deterministic-vs-stochastic difference disclosed in the one
    existing home for that mechanic ("How the Simulation Works"). 4 new tests: age-81
    rental > 0, abGrowth honored vs hardcoded, single combined growth basis, abEndYear
    still stops the stream.
12. **"Portfolio at Retirement" computed 5 ways** — waterfall's (waterfall:76-99)
    ignores ALL future contributions; NetWorth omits employer/HSA contrib; sidebar
    uses real return. Contributing households see a materially smaller waterfall.
13. ✅ **ALREADY FIXED** (verified 2026-07-27) — ~~HSA dropped from runMC buckets.~~
    `hsa` and unrecognized categories now fall through to the cash bucket in `runMC`
    (`App.jsx:~1103`), matching `accumulateToRetirement`; the in-code comment records
    that BLANK_PROFILE ships an HSA account, so every HSA user previously lost it.
14. **GK in 3 non-identical copies**: App has 6% inflation cap + longevity rule;
    waterfall gkWithdraw has neither; floor/ceiling inflation anchored at retirement
    (App) vs today (waterfall:231-233) → ~28% band gap for retire-in-10-yrs.
15. ✅ **FIXED v1.2.28 (2026-07-27)** — ~~Roth tab useMemos stale.~~ All **four**
    memos in `RothLadder` (`ex`, `exNoTax`, `convRows`, `conversionPlan`) carried their
    own hand-maintained field list and each omitted something different. The sharpest
    symptom: `convRows` tracked `sp`/`gkFloor`/`gkCeiling`/`irmaaGuard` but `ex` did not,
    and `ex` feeds the summary cards rendered directly ABOVE the `convRows` table — so
    editing spend in the sidebar refreshed the ladder while the Lifetime Tax Delta / RMD
    Reduction / Eff. Rate cards above it still described the previous profile. All four
    now depend on `params` itself (a parent `useMemo`, so referentially stable between
    real edits — correct AND cheap, and it cannot rot as new fields are added). Verified
    zero enumerated `params?.x` dependency entries remain anywhere in `App.jsx`.
    design-authority explicitly ruled AGAINST a staleness badge here: unlike the
    genuinely expensive 3,000-path Monte Carlo, these are cheap memoized deterministic
    calls, so once the deps are right there is no window in which "stale" is a real
    state — a badge would be permanent noise. The countermeasure is a render smoke test
    (still open — see §9/BUD-5).
16. ✅ **FIXED v1.2.28 (2026-07-27)** — ~~RMD age ×3 + hardcoded divisor 24.0.~~
    `rulesEngine.js`'s local `getRMDAge(currentAge, currentYear)` is deleted. New
    `resolveRmdAge(params)` honors the user's `rmdStartAge` override first, else calls the
    **shared** `getRmdStartAge({dob, birthYear, currentAge})` — so Action Plan cards and
    the engines can no longer name different RMD ages. New `rmdDivisorAt(params, age)`
    replaces the hardcoded `24.0` (which corresponded to no age in either IRS table) with
    real `RMD_DIV`/`JOINT_RMD_DIV` lookups plus the engines' joint-table gate
    (`useJointRmdTable && filingStatus !== "single"`, so a stale toggle after widowhood
    cannot select the wrong table). The divisor is taken at the **RMD start age**, not
    today's age — the IRS tables are not defined below 72, so `RMD_DIV[currentAge]` would
    be `undefined` → `NaN` for exactly the pre-retirement users this card targets.
    Imports come from `buildRothExplorer.js`, the one shared leaf module (its only import
    is `expectedReturn.js`), so there is no cycle with `App.jsx → rulesEngine.js` and no
    fourth copy of the SECURE 2.0 ladder.
    **Labeling:** the projection still uses TODAY's pre-tax balance — deliberately, since
    every other quantity in this file reads raw current params, and adding growth here
    would create a fourth place reimplementing portfolio compounding. So the copy states
    its basis instead of implying a forecast: *"If your pre-tax balance stayed at today's
    $X, your first RMD at age Y would be ~$Z/yr. The actual RMD will be larger if the
    account keeps growing."* 9 new tests in `src/rulesEngine.test.js`.
17. **Conversion tax funding differs**: runMC flat marginal-rate approx from pretax
    (App.jsx:1058-1070, no irmaaGuard check) vs waterfall's exact iterative recompute.
18. ✅ **ALREADY FIXED** (verified 2026-07-27) — ~~waterfall hardcodes 4.5% cash
    growth.~~ Both `accumulateToRetirement` and `runScenario` read
    `(cashRealReturn ?? 3.0)/100`; the in-code comment records that the old hardcoded
    `0.045` silently ignored the user's setting.
19. **Latent**: bracket-index anchor 2026 literal (App) vs getFullYear() (engines) —
    skews on 2027-01-01. buildRothExplorer() dead in UI but exported + tested with
    stale physics — mark deprecated. Duplicated constants byte-identical today.

### 13.3 Fonts & UI (full details in 2026-07-11 design audit)

20. **Systemic**: all ~30 chart axis ticks use #475569 @9px (2.5:1 contrast — fails
    WCAG hard). Fix once: shared `AXIS_TICK = { fill:"#94a3b8", fontSize:10 }`.
21. **Two monospace fonts** render numbers side-by-side (JetBrains Mono in CSS
    classes vs ~100 inline 'DM Mono') — standardize on JetBrains, drop DM request.
22. **Data in near-invisible gray**: B1-End column (5099), optimizer cells
    (4899-4900), bucket detail rows, "Hide/Show" toggles, mobile tab bar 9px+#64748b.
    Token plan: text-secondary #94a3b8 (readable), text-tertiary ~#7d8fa6 (dividers),
    #475569/#334155 decorative-only.
23. **Year-by-Year table ~20 columns** — cut the `=`/`+` operator columns; fold
    Fed/State/IRMAA/Eff%/WR into one "Tax & Risk" column with hover detail.
24. **5 duplicate sidebar/Profile sliders remain** (retireAge, endAge, sp, ssAge,
    contrib) — apply the read-only-pointer pattern already used for
    withdrawalStrategy in RetirementPanel:8796.
25. Passes: first-run Profile-first flow, Forecast progressive disclosure, Action
    Plan/AI-credits UI, guardrails selector placement, Net Worth tab density.

## 14. Progress Check-ins — 2026-07-19 (v1.2.3)

Journal feature modeled on "save check-in / progress trend" trackers:

- **✓ Check-in button** (header toolbar, next to Export/Import) snapshots the
  current plan: success rate, stress rate, portfolio, spending, retire/plan-to
  ages, median terminal, app version. Disabled until an MC run exists (the
  snapshot must carry a real success rate). Flashes "✓ Saved!" on save.
- **Analysis → 📈 Progress sub-tab** (`ProgressTab`): empty state ("Start your
  journey") pointing at the button; with entries, a 3-metric strip (latest
  success, pp-change since first, portfolio change), a dual-axis trend chart
  (success % + portfolio $, ≥2 points), and a history table with per-row delete.
- **Storage**: `aira_checkins_v1` localStorage key, deliberately OUTSIDE the
  profile — check-ins are a running journal and are never loaded back into the
  planner (unlike Export/Import). Not included in profile export; device-local.
- Distinct from §MCTab "Portfolio Checkpoints" (manual actual-balance entries
  plotted on the fan chart) — different data, different purpose; no duplication.
- Tests: storage round-trip/corruption guards + empty-state and history
  rendering (`features.test.js`). 436 passing after rebase onto v1.2.2.

### §14 addendum — v1.2.4 (2026-07-19)

- **History as cards**: each check-in is a card with an inline-editable name,
  date badge, × delete, and metric chips (Success, Stress SR, Portfolio,
  Spending, Legacy, Retire/Plan-to ages). Table removed.
- **Export/Import progress**: JSON backup of the journal (`⬇/⬆` links on the
  history card and empty state). Import merges by id — local entries win —
  then sorts by timestamp (`mergeCheckIns`, exported + tested).
- **Plan Shape radar** (`planShapeScores`, exported + tested): five absolute
  0–100 axes — Confidence (MC success), Retire by (age 50→100pts … 75→0),
  Spend (4%×port vs target), Legacy (p50 ending, $1M=100), Resilience (stress
  success). First check-in (gray) vs today (blue), stability banner (≤5-point
  moves = stable, else biggest shift named), per-axis explainer legend.
  Deliberately NO "median cohort" overlay — no real cohort data exists, and a
  fabricated benchmark would violate the no-hardcoded-values principle.
- 439 tests passing.

## 15. AI Provider & Monetization Backlog (merged from `src/Requirements.md`, 2026-07-25)

The old `src/Requirements.md` (last real update 2026-05-13, stuck at v1.0.1.18 /
Netlify / `BILLING_ENABLED=false` on branch `feature/ai-action-plan-cloudflare`) was
**deleted as redundant**. Everything in it about the Stripe/D1 billing *setup* is now
DONE and superseded by §7 (billing shipped, `BILLING_ENABLED=true` since 2026-06-19,
platform migrated Netlify → Cloudflare Pages). Its still-open, non-duplicated items:

### 15.1 Open — not built

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| PROV-1 | **Multi-provider AI switcher** — let users pick Claude / OpenAI alongside Gemini. | High | Add `assumptions.aiProvider` + `assumptions.aiModel` to `BLANK_PROFILE`; provider + model selectors in Profile → Assumptions; Anthropic + OpenAI routing branches in `functions/api/analyze.js` (both need the Cloudflare proxy — CORS; Gemini stays browser-direct); per-provider token-cost constants in `src/ai/ai-analysis.js`. Build on existing exports (do not duplicate): `GEMINI_MODELS`, `DEFAULT_GEMINI_MODEL` (`"gemini-2.5-flash"`), `AiUsageBadge`, `BILLING_ENABLED`. Provider defaults: Gemini `gemini-2.5-flash` (free tier, direct); Claude `claude-haiku-4-5-20251001` (~$0.80/M, proxy); OpenAI `gpt-4o-mini` (~$0.15/M, proxy). |
| MON-1 | **BMC Phase 2 redemption codes** — manual monetization for early adopters. | Medium | User pays on Buy Me a Coffee → you email a code → user enters it in-app → unlocks N credits. No backend beyond a code list in localStorage. Simple bridge that predates/complements the live Stripe path. |
| AI-CHAT | **Q&A chat session** (1 credit / exchange). | Medium | The `analyze.js` `"chat"` handler already exists; needs the conversational UI + credit-per-exchange wiring. |
| AI-CARD | **AI card system, phases 2–4** (opt-in cards). | High | Always-on: Plan Survivability, RMD Trajectory. User-selectable: IRMAA Risk, Roth Conversion Opportunity, Tax Bracket Management, Pre-65 Healthcare Exposure, Social Security Timing, Estate/Legacy Balance. Plus a catch-all Summary card that always fires last (cross-card conflicts → one priority action). Full spec: `aira-forecaster-agents/specs/AI_ANALYSIS_SPEC.md`. Overlaps with AI-1/§10 (build the context from `buildWithdrawalWaterfall`). |

### 15.2 Operational config (values live in the deploy platform, NOT here)

- **Cloudflare Pages env vars** for billing/AI/admin: see §7 checklist (`STRIPE_*`,
  `JWT_SECRET`, `ADMIN_SECRET`, server-side `GEMINI_API_KEY`, `DB` binding).
- **Feedback form (EmailJS)** build-time vars: `REACT_APP_EMAILJS_SERVICE_ID`,
  `REACT_APP_EMAILJS_TEMPLATE_ID`, `REACT_APP_EMAILJS_USER_ID` (+ the legacy
  `NETLIFY_EMAILS_*` pair, now unused post-Cloudflare-migration). **Secret values are
  intentionally NOT recorded in this git-tracked file** — they live in the Cloudflare
  Pages / deploy dashboard. Rotate any key that ever appears in plaintext anywhere.

## 16. ACA-Aware Roth Conversions (subsidy-preserving) — requested 2026-07-25

**Requested by a user (Reddit) and flagged by Vincent as "the biggest deal for me."**
**Priority: P1 (next major feature).** **Status: scoped, NOT started.**

### Problem
In the pre-Medicare bridge years (retireAge → 64), many early retirees buy health
insurance on the ACA marketplace, where the **Premium Tax Credit (PTC)** subsidy shrinks
as **MAGI** rises. A Roth conversion (or a large pre-tax draw) raises MAGI and can silently
destroy thousands of dollars of subsidy — often more than the conversion's tax benefit.
AiRA models the **IRMAA** cliff (65+) but has **no ACA subsidy model at all** (grep: the only
"ACA" reference is a cosmetic Action-Plan tip at `App.jsx` ~8000). So the Conversion Plan /
Withdrawal Plan can recommend a conversion that looks tax-smart but nukes the user's subsidy.

### Goal
Model the ACA PTC during bridge years and add an **"ACA subsidy guard"** (sibling to the
existing IRMAA guard) so conversion + pre-tax draw sizing accounts for subsidy lost — and
surface the tradeoff (subsidy $ lost per conversion $, cliff proximity) the way IRMAA is shown.

### Modeling components
1. **PTC as a function of MAGI ÷ Federal Poverty Level (FPL).** The benchmark (2nd-lowest
   silver) plan premium is capped at an income-based "applicable percentage" of MAGI; PTC =
   benchmark premium − that cap. Inputs: **household size** (FPL lookup), **state** (AK/HI have
   higher FPL tables), and a **benchmark annual premium** estimate (user-entered, or a rough
   age-scaled default). FPL tables + applicable-percentage schedule are dated constants → live
   in `TAX_REFERENCE.md`, inflation/annual-update indexed, NOT hardcoded in engine (Rule 6).
2. **⚠️ Policy-date nuance (a differentiator to get right).** The ARPA/IRA enhancement
   (2021–2025) REMOVED the 400%-FPL "subsidy cliff" (capped premium at 8.5% of income with no
   upper income limit). **Absent Congressional extension, the cliff RETURNS in 2026**: above
   400% FPL the subsidy drops to $0. Model both regimes behind a user assumption
   (`acaCliffReturns2026: true/false`, default = current law) so the plan is honest about the
   discontinuity. This is the crux of "convert while keeping subsidies."
3. **ACA subsidy guard** — new profile toggle (default per user's situation). When on AND a
   household member is pre-65 AND on the marketplace, cap the Step-6.5 Roth conversion (and the
   Step-5 pre-tax draw) so MAGI stays under the chosen ACA ceiling (e.g., just under 400% FPL,
   or an optimized point on the phase-out). Mirror the `irmaaGuard`/`irmaaCap` pattern in
   `buildWithdrawalWaterfall` Step 6.5 + `runMC`. The conversion **sweet spot** becomes
   `min(bracket room, IRMAA room, ACA room, LTCG 0%-cliff room)` — extends §15/ENG-8's list.
4. **Display / cliff proximity.** Show ACA subsidy $ lost per conversion dollar and a
   cliff-proximity indicator (like the IRMAA surcharge surfacing), on the Conversion Plan tab
   and/or a bridge-year healthcare card. Pairs with gain-harvesting (both use the low-income
   bridge window and both raise MAGI — competing for the same headroom).
5. **Profile inputs**: `onAcaMarketplace` (bool, pre-65), `householdSize` (int, for FPL),
   `acaBenchmarkPremium` (annual $, or estimate), `acaCliffReturns2026` (bool). Generic-first —
   no user-specific values in code.

### Interactions / gotchas
- ACA guard active **retireAge→64**; IRMAA guard active **63+/65+**. Both can bind in the 63–64
  overlap. Order: ACA and IRMAA rooms both feed the conversion `min(...)` ceiling.
- The engine already threads MAGI per year (ENG lookback work) — reuse that MAGI, don't recompute.
- Depends on the same single-source `buildWithdrawalWaterfall` used by the Conversion Plan tab so
  the recommended conversion and the ladder agree (avoid the ENG-9/12/14 class of drift).

### Effort
**Medium-large.** ~1–2 focused sessions: FPL/PTC constants + a `computeAcaSubsidy(magi, size, state, year, cliff)` helper (single source, exported), the guard wiring in both engines' conversion/draw sizing, profile inputs, a display, and tests (subsidy math, cliff on/off, guard binds pre-65 not at 65+, sweet-spot = min of all rooms). Gate through logic-validator (IRS/HHS currency) + design-authority (where the inputs + cliff toggle live) + tester.

### Reddit-update summary (plain language)
"Coming soon: AiRA will model your ACA health-insurance subsidy in the pre-65 years and size Roth
conversions to keep it — showing exactly how much subsidy each conversion dollar costs, and
warning you before a conversion pushes you over the subsidy cliff."

## 17. Full Roth-Conversion Recommendation Engine — requested 2026-07-25

**Requested by a user (Reddit), verbatim:** *"I am looking for a product that will recommend how
much to convert to Roth each year (taking into account ACA subsidies, IRMAA, NIIT and all other tax
factors that go into a Roth analysis; and a recommendation on from which bucket of money to pay the
Roth taxes and my living expenses."* **Priority: P1 (headline feature). Status: scoped, NOT started.**
§16 (ACA) is a prerequisite component of this — build them together.

### What it must recommend, per year
1. **How much to convert to Roth** — sized against ALL cliffs at once, not just a bracket.
2. **Which bucket pays the conversion tax** — taxable / cash / pre-tax (paying from taxable/cash
   preserves the conversion's full value; paying from pre-tax shrinks it).
3. **Which bucket funds living expenses** — the account draw order (already shipped v1.2.8) tied
   into the same recommendation.
Output: a year-by-year plan — *"Convert $X (fills to the Y ceiling), pay the $Z tax from Taxable,
fund living from Cash→Taxable→…"* — with the marginal cost/benefit shown.

### What AiRA already has (~70% of the pieces — do NOT rebuild)
- Conversion **sweet-spot + ladder** (`src/engine/rothConversionPlan.js` `buildConversionLadder`/
  `buildWaterfallComparison`), reconciled to the waterfall (ENG-9/12/14).
- The **waterfall** self-funds conversion tax from pre-tax today; `taxFunding` profile field exists.
- **Account draw order** for living expenses (v1.2.8, §12).
- In `yearTax`/`calcYearTax`: bracket tops, **IRMAA** (2-yr lookback), **NIIT**, **LTCG 0/15/20
  stacking**, **SS provisional/torpedo** — all already computed per year.

### The gaps (what to build)
- **ACA subsidy model** (§16) — the missing cliff. Prerequisite.
- **BETR** — referenced in UI but never computed (§3). The "should I convert?" answer needs the
  break-even tax rate: convert only while marginal conversion cost < BETR-implied future cost.
- **Unified "conversion room across ALL cliffs"** — one per-year helper returning the true marginal
  cost of the next converted dollar = fed + state + IRMAA surcharge + **ACA subsidy lost** + NIIT +
  any LTCG-0%→15% spill + SS-torpedo step, and the binding ceiling =
  `min(bracket, IRMAA, ACA, LTCG-cliff)`. Extends ENG-8's `min(...)` list.
- **Tax-payment-source optimizer** — recommend paying conversion tax from taxable/cash vs. pre-tax
  by comparing lifetime outcomes (currently self-funded from pre-tax only).
- **Synthesis UI** — present all three recommendations as ONE year-by-year plan (not three tabs).

### Phased plan — ⭐ THE FIRST THING TO DO
**Phase 1 (foundation): the ACA model (§16) + a single `conversionRoomAllCliffs(year, state)` helper**
that folds ACA into the existing bracket/IRMAA/NIIT/LTCG/SS math and returns `{ceiling, marginalCostOfNextDollar, bindingCliff }`. Every downstream recommendation depends on knowing the
true marginal cost of the next conversion dollar, so this is the keystone. Single exported source
(no drift), gated by logic-validator (IRS/HHS currency) + tester.
- **Phase 2:** BETR (§3) + wire "convert while marginalCost < BETR benefit" into `buildConversionLadder`.
- **Phase 3:** tax-payment-source optimizer (taxable/cash vs pre-tax).
- **Phase 4:** synthesis UI — the single year-by-year "convert $X, pay tax from A, fund living from B" plan.

### Effort
Large (multi-session, phased above). Each phase ships independently and is Reddit-announceable.

### Reddit-update summary (plain language)
"We're building the big one: a year-by-year Roth conversion advisor that tells you exactly how much
to convert — accounting for ACA subsidies, IRMAA, NIIT, capital-gains and Social-Security tax
cliffs together — plus which account to pay the conversion tax from and which to live on. Rolling
out in phases; the ACA-subsidy piece is first."

## 18. Profile Information-Architecture Overhaul — scoped 2026-07-25 (design-authority: APPROVE-WITH-CHANGES)

**Priority: P1 (recurring user pain — "profile is hard to work with, income is all over").**
**Status: design-authority blueprint approved, NOT started.** Also closes REQUIREMENTS §5.1 (single
point of control) + §13.3 #24 (duplicate sliders).

### Why (verified findings)
Income is scattered because fields were added to whichever panel was open, not by a content model:
contributions + pensions → step 4 `ContribPanel`; **Social Security** (`ssb`/`ssAge`) + **rental/Airbnb**
(`ab`/`abGrowth`/`abReliability`/`abEndYear`) → step 6 `RetirementPanel` (a step whose real job is
withdrawal strategy); per-property rental → `MortgageTab` (separate tab, legitimately different object).
`ProfileWizard` `step` index is UI-only (`App.jsx` ~8749-8984) — **reordering/regrouping steps is pure
JSX, zero engine risk** (every panel is a pure function of the flat `values`/`assumptions` object).

### Approved step blueprint
| # | Step | Contains |
|---|------|----------|
| 1 | **You** 👤 | Identity: name, DOB, state, filing status, sex (AboutYouPanel + the "Personal Profile" identity fields currently stranded in AssumptionsPanel) |
| 2 | **Money In** 💵 | Two `sectionCard` sub-cards: **While Working** (401k/HSA/employer) + **In Retirement** (Social Security, blanket rental/Airbnb, Pensions & Other Income). Split by *when it applies* — NOT a flat dump. This is the consolidation the user asked for. |
| 3 | **What You Have** 💰 | Accounts by category (SavingsPanel, unchanged) |
| 4 | **Money Out** 💸 | Spending (US + out-of-country), CSV budget import, Housing & Fixed Obligations carveouts (moved out of AssumptionsPanel) |
| 5 | **Strategy** 🎯 | Withdrawal strategy + GK guardrails, Roth Conversion Strategy (FAFSA/CSS/tax-funding, moved out of AssumptionsPanel), Withdrawal Order pointer |
| 6 | **Advanced** ⚙️ | Pure "set once" tuning: cash return, taxable cost basis, RE growth, joint-RMD toggle, Gemini key/model, MC params (SS COLA, equity glidepath), Healthcare Shock Model. Last step, optionally collapsed with a "most users don't need this" note. |

### Findings → build tasks (most important first)
1. **Single point of control (VIOLATION).** Retire age, end age, US spend, annual contribution, SS start age are live-editable in BOTH the main sidebar (`App.jsx:11342-11402`) AND the wizard, synced by a fragile hand-maintained 7-key fan-out (`11798-11823`) — same failure class as the real guardrail-forwarding bug in CLAUDE.md's handoff notes. **Fix:** sidebar authoritative; wizard shows read-only value + "Set live in the sidebar →" pointer (pattern already used for DOB `9262` and Withdrawal Order `9668-9679`); delete the fan-out. (`ssb` is already correctly single-sourced in the wizard — proof the split works.)
2. **Proximity (VIOLATION).** Consolidate income into the "Money In" step per the blueprint, split while-working vs in-retirement (that distinction already exists in ContribPanel's two cards — extend, don't flatten).
3. **Card system (VIOLATION — 4 patterns coexist).** Promote `ContribPanel`'s `sectionCard`/`sectionTitle`/`sectionDesc` to a shared module-level component (like `WFieldRow`); reskin AssumptionsPanel, AboutYouPanel, ExpensesPanel, RetirementPanel onto it. Keep `SavingsPanel`'s color-strip account-category cards as the ONE deliberate exception (encodes a taxonomy, not a topic). The `WFieldRow` field row is already uniform — don't touch it.
4. **Assumptions-as-step-1 (VIOLATION).** Move pure tuning to the last "Advanced" step (behind disclosure); front-loading tuning knobs before any of the user's own data is why the profile reads as intimidating.
5. **Safety: PASS** — moving SS/rental JSX between panels is a cut-paste (panels don't own state). Follow-up: update `STEPS[].sub` subtitle strings (8749-8763) + the existing cross-ref pointers (e.g. RetirementPanel's "Edit in 💸 Spending & Expenses →" at 10207) to point at the new steps.
6. **Minor cleanup:** dead `abReliability`/`abGrowth` reads in `AssumptionsPanel` (9422-9423, leftover) — delete when that panel is touched.

### Suggested build phasing (each ships independently, low risk)
- **Phase A (safest, pure visual):** promote `sectionCard` to shared + reskin all panels onto one card system. No data movement.
- **Phase B (the headline):** step reorder + "Money In" consolidation (move SS + rental into it, split while-working/in-retirement). Pure JSX moves + `STEPS`/`PANELS` reorder + subtitle/pointer updates.
- **Phase C (correctness):** single-point-of-control — wizard pointers for the 5 duplicated fields, delete the 7-key fan-out shim.
- **Phase D:** move Housing/carveouts → Money Out, Roth-strategy → Strategy, tuning → Advanced (behind disclosure).

#### Phase D — partially DONE 2026-07-26 (v1.2.16): AssumptionsPanel regrouped
Vincent (2026-07-26): *"can you move any tax stuff to somewhere else… HOME/RE Growth should go into
Housing and Fixed Obligations. The AI line items should have its own section. Everything should be
naturally grouped together."* Done **within** AssumptionsPanel (the step-level moves in Phase B/D are
still open):
- **"Personal Profile" is now identity only** — name, DOB, state, federal filing status, employer start
  date — and **collapsed by default** (set-once data shouldn't cost vertical space every visit). It was a
  grab bag of 9 unrelated fields, the clearest instance of finding #2 (proximity).
- New **`ACard`** component (module-level, `collapsible`/`defaultOpen`) — the first step of Phase A's
  shared card system, applied to the cards this change touched. Reskinning the *other* panels onto it is
  still outstanding.
- **Evicted to topic-matching cards:** taxable cost basis + joint-RMD toggle → new **Tax Settings**;
  Home/RE growth → **Housing & Fixed Obligations** (it's an appreciation rate for the housing inputs it
  applies to); cash return → **Monte Carlo Model Parameters** (it's a return assumption); Gemini key +
  model → new collapsed **AI Assistant** card (credentials for an optional feature, unrelated to the
  retirement model).
- Closed finding #6: deleted the dead `abReliability`/`abGrowth` destructures (and `ab`/`ssb`, also unused).
- Gate: production build compiles + App render smoke test. Pure JSX, no engine change, so the full Jest
  suite was not re-run (per standing preference for UI-only work).
**Still open on §18:** the step reorder + Money In consolidation (Phase B), the shared card system across
all panels (Phase A), single-point-of-control (Phase C), and moving Housing→Money Out /
Roth-strategy→Strategy at the *step* level.
Gate each through a render smoke-test (the RothLadder-crash class of bug) + design-authority re-verdict on the final layout.

### Reddit-update summary (plain language)
"We're reorganizing the planner so everything about your money lives where you'd expect: one 'Money In'
section for all your income (paychecks-era contributions, plus Social Security, pension, and rental in
retirement), a clean 'What You Have' for accounts, 'Money Out' for spending — with the advanced tuning
tucked at the end. Same math, far easier to fill in."

## 19. NII-Safe bracket-fill option — requested 2026-07-26

**Priority: unscoped idea, not started.**

### Problem
Today's bracket-fill conversion targets (10/12/22/24%, §6/ENG-13) fill straight to a bracket
ceiling with no awareness of the NIIT (Net Investment Income Tax) MAGI threshold. For someone
retiring before 65 and living on capital gains, a conversion (or draw) that crosses the NIIT
threshold adds a 3.8% surtax on investment income that a naive bracket-fill doesn't account for.

### Idea (from user testing)
Add a new fill mode — **"NII-Safe"** — that fills to the 24% bracket normally, but auto-throttles
the fill amount as MAGI approaches the NIIT threshold (same shape as the existing IRMAA guard,
§16's ACA guard). User reports this outperformed simple bracket-filling in their own testing, for
the specific case of early retirees (pre-65) drawing from taxable/capital-gains income.

### Notes
- NIIT threshold + rate constants already exist (`NIIT_THRESHOLD_MFJ/SINGLE`, `NIIT_RATE` in
  `buildRothExplorer.js`, per §3) — this would reuse them rather than add new ones.
- Natural sibling to the IRMAA guard and the ACA subsidy guard (§16) — same "guard rail near a
  MAGI cliff" pattern, third instance.
- Not yet scoped: needs a design pass on where the mode selector lives (Conversion Plan tab's
  existing `fill_10`/`fill_12`/`fill_22`/`fill_24` buttons, per §6) and validation against the
  user's test case before implementation.

## 20. Extract the Paid Report as a module excluded from the OSS repo — requested 2026-07-26

**Priority: high. Phase 1 done this session (2026-07-26 11pm); history-rewrite decision still open.**

### Done this session
The plan below (git-ignore + `git rm --cached` + separate stub/dynamic-import) turned out to have a
real blocker: webpack (react-scripts) resolves `import()`/`require()` targets **at compile time** even
when the call is wrapped in `try/catch` or `.catch()` — a missing file fails the *build*, not just the
runtime, so untracking `PrintReport.jsx` outright would break `npm run build` for every future OSS
clone (and could break this repo's own build on a fresh checkout on another machine). Used a different,
simpler mechanism instead:

1. **`src/report/PrintReport.jsx` now holds a public placeholder component** (same default-export +
   `formatMoney` named-export shape App.jsx and `report.test.js` expect — no other file needed to
   change) that renders "Report module not included" and nothing else. This is what ships in the repo
   and what any OSS clone builds against — `npm run build` stays green for downloaders, the feature is
   just visibly absent.
2. The real 651-line implementation is kept on **local disk only**, restored immediately after the stub
   was committed, and the path was marked `git update-index --skip-worktree src/report/PrintReport.jsx`
   — git now treats local edits to this file as invisible (won't show in `git status`/`git diff`, won't
   get picked up by `git add -A`). This is what "stop commits for that code" actually means in git terms:
   the committed blob is permanently the stub from this point forward; the real file keeps working
   locally (and for `wrangler pages deploy`, which builds from local disk, not from a git checkout) with
   zero risk of it slipping back into a future commit by accident.
   **Caveat for future you:** if the real report ever needs a code change, `git update-index
   --no-skip-worktree src/report/PrintReport.jsx` first, or the edit will sit invisibly on disk forever
   without you noticing git isn't tracking it.
3. **Added a second, independent layer** (Vincent's idea, same session): a fail-closed capability gate
   so that even someone who copies the *billing/report-unlock plumbing* (which stayed public — see below)
   into their own app can't get a free unlock just by finding and flipping `BILLING_ENABLED` to `false`
   in their local copy (that flag is a source-level constant, not a real secret, and used to
   unconditionally unlock the report in "dev mode"). New `GET /api/report-capability`
   (`functions/api/report-capability.js`) returns `{ available: !!env.GEMINI_API_KEY }` — no auth, no
   secret revealed, just a presence check. `useReportCapability()` (`src/billing/credits.js`) defaults to
   **false** (fail-closed, unlike the balance/unlock hooks which fail open for paying customers) and
   `App.jsx`'s `locked` prop is now `!reportCapable || (BILLING_ENABLED && !reportUnlocked)` — the report
   cannot unlock on any deployment lacking the operator's real `GEMINI_API_KEY`, full stop, regardless of
   what a cloner does to client-side flags.
4. **Scope was narrowed from the original plan below**: `src/billing/credits.js`'s report-unlock
   functions (`REPORT_COST_CREDITS`, `unlockReport`, `isReportUnlocked`, etc.) and
   `functions/api/report-unlock.js` were **left public/tracked** — they're generic flat-fee-credit-
   deduction plumbing, the same shape as the rest of the already-public billing backend
   (`checkout.js`, `analyze.js`, `webhook.js`), with no report-specific business logic in them. The
   actual proprietary asset was always the report's *content/layout* (`PrintReport.jsx`), which is now
   the only thing given the stub treatment.

### Still open — needs your call, not attempted
**Does the existing public git history get scrubbed?** The stub-swap above only changes what ships
*from this commit forward*. Every commit before it (all of git history up to today) still has the full
`PrintReport.jsx` source, and it's already public — confirmed via `curl
https://api.github.com/repos/axwack/Aira_Monte_Carlo` → `"private": false`. Anyone can `git log -p` or
check out an old commit and pull the real file out of history. Fully purging it requires a destructive
rewrite (`git filter-repo` or BFG) + **force-push to `origin/main`**, which breaks every existing
clone/fork's ability to fast-forward pull — confirmed acceptable for now ("someone can go into the
history and pull it" — yes, accepted 2026-07-26; revisit only if this becomes a real problem).

### Original plan (superseded by "Done this session" above, kept for context)

### ⚠️ Important finding first
`origin` (`github.com/axwack/Aira_Monte_Carlo`) is confirmed **public** right now
(`curl https://api.github.com/repos/axwack/Aira_Monte_Carlo` → `"private": false`). The paid-report
code below is **already tracked and already public** — this isn't prep for a future open-sourcing,
it's removing something already exposed. Untracking the files only stops *future* commits/clones
from carrying them; the code remains visible in the existing public git history (every past commit)
unless history is rewritten. See "Open decision" below.

### Scope — what "the paid report" actually is
| File | Lines | What's paid vs. shared |
|---|---|---|
| `src/report/PrintReport.jsx` | 651 | **Entire file is report-specific.** Cover + Assumptions sections render unlocked always (they're just the user's own inputs); `MonteCarloSection`/`StressTestSection`/`WithdrawalScheduleSection`/`RothConversionSection`/`LifetimeTaxSection` + `LockedSectionsTeaser` + `UnlockPanel` are the paywalled content. |
| `src/billing/credits.js` | 636 | **Mixed** — most of the file (JWT storage, balance, credit packs, Stripe checkout/verify/restore) is shared plumbing also used by the AI-analysis credit system (`ai/ai-analysis.js`), which is staying in the OSS build. Only the "Report unlock" block (`REPORT_COST_CREDITS`, `unlockReport`, `isReportUnlocked`, `fetchReportUnlockStatus`, `useReportUnlocked`, the `REPORT_UNLOCK_KEY` constant — roughly lines 48-56 and 224-330) is report-specific and needs to move out. |
| `functions/api/report-unlock.js` | 217 | Backend Cloudflare Pages Function, report-specific. Only matters for the deployed backend, not the static OSS repo — Cloudflare builds from whatever is in `functions/` on deploy, regardless of what's git-tracked, as long as the file still exists on disk locally. |
| `src/App.jsx` | ~2 call sites | Line 79 static `import PrintReport from "./report/PrintReport.jsx"`; line 12700-12701 `{showReport && mc && <PrintReport ... locked={...} />}`. Needs to become a dynamic import with a graceful "not available" fallback so an OSS clone without the file still builds and runs. |

### Recommended approach (open-core pattern, non-destructive, build stays green)
1. Split `credits.js`'s report-unlock block out into a new `src/billing/reportUnlock.js` (report-specific
   billing logic only — the rest of `credits.js` stays public/tracked, it's shared with AI billing).
2. Move `src/report/PrintReport.jsx` and the new `src/billing/reportUnlock.js` into `.gitignore`, then
   `git rm --cached` them (removes from tracking going forward; leaves the files on local disk untouched,
   so `npm run build` / `wrangler pages deploy` keep working exactly as today — nothing about the live
   deploy depends on git tracking).
3. Commit a tiny always-tracked **stub** at the same path (or a `.example.jsx`/`.example.js` sibling) that
   exports a no-op "Report unlock isn't available in this build" component/functions, so a fresh OSS clone
   still compiles even though the real file is absent for them.
4. `App.jsx` switches the static import to `React.lazy(() => import("./report/PrintReport.jsx").catch(() =>
   ({ default: ReportUnavailableStub })))` (or an equivalent try/catch dynamic import) so the app degrades
   instead of failing to build when the real module is missing.
5. Also gitignore `functions/api/report-unlock.js` the same way (untrack + local stub) since it's a paid-tier
   backend endpoint too.
6. Update `src/report/report.test.js` — it currently imports `PrintReport` directly; once the real file is
   gitignored, this test only runs in the private working copy (document that in the test file), or gate it
   behind a file-existence check so it skips cleanly in an OSS checkout.

### Open decision — needs your call before executing
**Does the existing public git history get scrubbed?** `git rm --cached` does NOT remove the files from
past commits — anyone can still `git log` / check out an old commit / download a release tarball from
before this change and get the paid-report source. Fully purging it requires a destructive history rewrite
(`git filter-repo` or BFG) + **force-push to `origin/main`**, which breaks every existing clone/fork's
ability to fast-forward pull. That is a call only you should make — not attempted here. Two options:
- **(a) Accept it** — common open-core reality: stop future disclosure, treat the already-public history as
  sunk (anyone who wanted the code already had the chance to grab it).
- **(b) Rewrite history** — coordinate a force-push window, warn any collaborators/forks, and treat it as a
  one-time hard reset of the public repo.

### Why deferred to a fresh session
Touches revenue-critical billing code (`credits.js` is mid-way through the Stripe go-live in §7/the memory
index), requires a build-safety change in `App.jsx` (dynamic import fallback) that should be tested against
an actual `npm run build` with the files removed to prove the OSS path really compiles, and has the
history-rewrite decision above that's the user's call, not something to default into at 11pm. Estimated
~1,500 lines touched across 4 files plus a new stub + a `npm run build` verification pass.

## 21. Spousal & Survivor Social Security — requested 2026-07-27

**Status: ✅ SHIPPED (v1.2.42 UI, v1.2.62 correctness, v1.2.64–65 survivor rules).** The
2026-07-27 "PAUSED — do not continue without fresh direction" note is SUPERSEDED; Vincent
directed the work on 2026-07-30. Phase 1 and Phase 2 are both done, plus the per-person age
model (§24 #1/#3) and the survivor claiming rules (§30). Note that the shipped v1.2.42
version had a real age-gap bug — see §29.** Requested after comparing
Boldin's Social Security entry UI (screenshot: separate "You" / "Your Spouse" cards, each
with a monthly benefit and a *month/year* start date, plus a "Model a benefit reduction in
the future" toggle and a COLA rate).

### ✅ CROSS-MACHINE STATUS (RED-DRAGON, 2026-07-28) — engine wiring VERIFIED

Vincent pulled on RED-DRAGON and flagged a discrepancy between this section and the
code. Resolved. Three machines share this repo (RED-DRAGON main, WHITE-GAMING, T14),
and the spousal engine wiring was committed from another one in `8c1986b` **without
tests and without the suite being re-run** — its own note said so.

**Verified on RED-DRAGON:**
- The `ghostSettings` detector (added the day before) immediately failed on `ssPia`,
  which is exactly the job it was written for: a new profile field that reached no
  engine. It turned out to be conditionally inert (only read when `spouse.enabled`),
  not dead — but nothing had proven that either way.
- Added a **spousal Social Security block to `src/ghostSettings.test.js`** which now
  proves the wiring is real: enabling a spouse changes the model; the spouse's own
  benefit moves it; **the higher earner's PIA moves it via the top-up** (the rule most
  likely to be implemented wrong, since the top-up keys off PIA and not the claimed
  benefit); and `spouse.enabled === false` reproduces the single-person result exactly,
  so no existing profile is disturbed.
- **Full suite green on the merged state: 639 pass, 13 skipped, 0 fail.** Production
  build compiles. That is the check the originating session did not run.

**So the engine half of Phase 1 is DONE and now proven.** Still outstanding for Phase 1:
1. **UI** — no "Add my spouse's Social Security" toggle or spouse benefit/claim-age/PIA
   inputs exist in `RetirementPanel`. Without them the feature is unreachable by users,
   which is why it must not be announced yet.
2. A dedicated `spousalSS.test.js` for the benefit arithmetic itself (the ghost-detector
   block proves the fields are *wired*, not that the dollar amounts are *right*).
3. logic-validator review of the top-up rule and the COLA-per-person choice.

### ⏸️ Session status (2026-07-27 evening) — engine wiring done, UI/tests NOT done

Phase 1 (below) was **partially implemented on one machine this session, then explicitly
halted** before finishing. What exists right now, on that machine only, uncommitted:

- `BLANK_PROFILE` gained `ssPia` (primary FRA amount) and a nested `spouse: { enabled:
  false, ssb, ssAge, ssPia }` object (`src/App.jsx`).
- New `computeHouseholdSS(p, age)` helper in `src/engine/buildRothExplorer.js` (exported
  alongside `taxableSocialSecurity`) — computes combined two-person gross SS including the
  spousal top-up, WITH its own COLA growth applied per-person (see note below on why this
  differs from the original plan).
- Every engine call site that used to gate/grow `ssb`/`ssAge` directly now calls
  `computeHouseholdSS(...)` instead: `runMC`, `simulateDeterministicWithStrategy`,
  `computeInitialWR` (all `App.jsx`), `buildWithdrawalWaterfall.js`, and
  `buildRothExplorer.js`'s own `runScenario`.
- The `runStress` "SPOUSE PASSES EARLY" scenario's hardcoded `ssb × 0.67` now branches:
  exact `max(primary, spouse)` when `spouse.enabled`, unchanged `× 0.67` fallback otherwise
  (preserves today's behavior for every profile that hasn't entered spousal data).
- `ssPia`/`spouse` are threaded through the `params` `useMemo`.

**What is deliberately NOT done:** no UI fields (the "Add my spouse's Social Security"
toggle + spouse benefit/age/PIA inputs were never added to `RetirementPanel`), no
`spousalSS.test.js`, and **the full build/test suite has NOT been re-run since these
edits**. Since `spouse.enabled` defaults to `false` everywhere and every new code path is
gated on it, this should be inert/dormant (byte-for-byte same behavior as before) — but
that is an unverified claim until the regression-lock test from the plan actually runs.
**Do not deploy or merge this machine's `App.jsx` / `buildRothExplorer.js` /
`buildWithdrawalWaterfall.js` without either finishing Phase 1 (UI + tests + verification)
or reverting these specific edits** — treat it as a half-finished branch, not a shippable
state, if you're the other machine looking at this file.

**One real design deviation from the original plan below, worth knowing about before
resuming:** the plan originally said `computeHouseholdSS` would return a pre-COLA-growth
gross and each caller would keep applying its own growth formula. That breaks once two
people can claim at different ages (you can't compound one combined number off a single
age). Fixed by moving COLA growth inside the helper, applied per-person from each
person's own claim age, then summed. Side effect: this also fixes a pre-existing,
unrelated bug in `buildRothExplorer.js` where SS growth was hardcoded to 2.4% and ignored
the user's actual `ssCola` input — that bug is now gone as a byproduct, not a separate fix.

### Reinforced principle (Vincent, same session): favor manual entry over derived calculation

Restating/generalizing the "ask the user, don't derive it" call already made below for SS
specifically: the broader lesson from this session is that **too much in-app calculation
to solve a hard problem has been a repeated source of bugs** (see the FRA/claim-age
adjustment math this section already opted out of, and the general pattern of drift
between App.jsx/buildWithdrawalWaterfall.js/buildRothExplorer.js duplicating the same
formula slightly differently — §4 item 3, §6 ENG-9/12/14, the `ssCola` bug just found
above). Going forward, when a feature could either (a) ask the user for a number they can
read off an authoritative source (SSA statement, brokerage statement, mortgage
paperwork), or (b) derive/project that number ourselves from other inputs — **prefer (a)**
unless the derivation is simple, well-tested, and low-risk. This isn't a new rule so much
as naming a pattern this project keeps re-discovering the hard way; apply it when scoping
future features, not just Social Security.

### ✅ AGREED APPROACH (Vincent, 2026-07-27): ask the user, don't derive it

**This is the decided shape for shipping §21. It supersedes the "model everything"
framing below, which is kept for reference.** Rationale: dual Social Security is
genuinely missing from the product today, and a couple cannot model their real plan
without it. Shipping a correct, smaller version beats a perfect one that never lands.

The insight is that most of the expensive machinery exists only to derive numbers the
user can already read off their SSA statement.

| Instead of computing | Ask for |
|---|---|
| PIA → claim-age adjustment (FRA-by-birth-year table, 5/9 of 1% per month for the first 36, 5/12 of 1% beyond, 8%/yr delayed credits) | **"Your estimated monthly benefit at the age you plan to claim"** — ssa.gov quotes exactly this, per person |
| Survivor benefit derivation | Nothing. With both benefits on file it is `max(personA, personB)` |
| Mortality-drawn first death | **"Model the first death at age ___"** — one number |

That deletes an entire category of currency risk: no FRA table, no reduction/credit
schedule, no new `TAX_REFERENCE.md` constants to keep in sync with SSA. Fewer numbers
we can be wrong about.

**The one real trap — the spousal top-up.** It is 50% of the higher earner's **PIA**
(the FRA amount), NOT 50% of their claimed benefit, and delayed credits never flow
into it. So claim-age-adjusted figures alone are not sufficient to derive it. Decision:
**collect the FRA amount as well** (SSA shows both), making the top-up exact — one extra
field, and it keeps the app able to tell the user something they did not already know,
which is the point of the tool. The alternative (asking "enter the spousal amount SSA
quoted") needs no math but leans on the user knowing, and silently produces nothing
for the people most likely to benefit.

**What data entry cannot avoid:** time-varying filing status. On first death the
survivor files Single — brackets narrow, the standard deduction roughly halves, IRMAA
tiers halve, and (as of v1.2.28) the OBBBA senior bonus drops from two persons to one.
That is engine work regardless. But a user-supplied death age makes it a deterministic,
explainable event in a known year rather than a stochastic draw threaded through 3,000
Monte Carlo paths — a contained change instead of a structural one. This is the whole
reason the phasing below now works.

#### Revised phases

- **Phase 1 — no engine restructuring.** Inputs: two benefits at claim age, two claim
  ages, plus each person's FRA amount for the top-up. Apply the spousal top-up, sum to
  a household gross, feed the existing `taxableSocialSecurity()`. This alone makes the
  base case correct for every couple and lets the "SPOUSE PASSES EARLY" stress scenario
  compute its haircut exactly — retiring the hardcoded `× 0.67` (a rule-6 violation that
  is only right for a one-earner couple; two similar earners keep ~50%, not 67%).
- **Phase 2 — one more input (`firstDeathAge`) plus the filing-status switch.** Survivor
  steps up to `max(own, deceased)`; filing status flips to Single the following year.
  Now a contained feature.
- **Phase 3+** — as originally scoped (delay-the-higher-earner survivor advice, etc.).

**Ship Phase 1 on its own.** It is the release that closes the actual gap.

### Current state — verified in code 2026-07-27

AiRA models **one** Social Security beneficiary. There is no spouse benefit anywhere.

| What exists | Where |
|---|---|
| `ssb` (annual benefit), `ssAge` (claim age), `ssCola` | `BLANK_PROFILE` `App.jsx:534/535/593` — all scalars, one person |
| SS growth from claim age | `App.jsx:1210`/`:1805`, `buildWithdrawalWaterfall.js:545` |
| IRC §86 provisional-income taxation | shared `taxableSocialSecurity()` — already correct, takes ONE `ssGross` |
| Joint & Last Survivor RMD table | `useJointRmdTable` (spouse >10 yrs younger) — the only genuinely spouse-aware engine input today |
| "SPOUSE PASSES EARLY" stress scenario | `App.jsx:~7003` — the closest thing to a survivor model |

**The stress scenario is an approximation with a hardcoded literal.** It runs
`ssb × 0.67` + `filingStatus: "single"`. The `0.67` is a **rule-6 violation** and it
silently hardcodes one household shape: it is only right for a one-earner couple where the
spouse draws a 50% spousal benefit (lose the 0.5, keep the 1.0 → 67% survives). For two
similar earners the survivor keeps ~50%, not 67%. With two real benefits on file the
haircut becomes exact arithmetic — `max(ssbA, ssbB)` — and the literal disappears. Its
*tax* half (survivor files Single) is already modeled and is the genuinely valuable part;
keep that.

### What Boldin does (and where its description is subtly incomplete)

Boldin's guidance — enter the spouse's own FRA benefit even if it's $1, and the planner
auto-applies the spousal benefit "up to 50% of your FRA amount" if that is higher — is the
right **UX** (one number per person, no separate "are you claiming spousal?" question) and
we should copy it. Two things it glosses over that we must get right:

1. **The spousal benefit is 50% of the higher earner's PIA — the FRA amount — NOT 50% of
   their actual (possibly delayed) check.** Delayed retirement credits do **not** flow into
   the spousal benefit. Boldin's own wording says "50% of your FRA amount", which is
   correct, but it is easy to implement as 50% of the claimed benefit and be wrong by up to
   ~12% for a 70-claimer. Model against PIA.
2. **Delaying the higher earner's claim raises the SURVIVOR benefit, not the spousal one.**
   The survivor steps up to 100% of the deceased's benefit *including* DRCs. This is the
   real reason "the higher earner should delay" — and it is exactly the alert Boldin
   surfaced to Vincent. Our Action Plan should be able to make the same recommendation, but
   it needs both benefits and both claim ages to compute it.

### Rules to model (each needs a `TAX_REFERENCE.md` entry — no literals in engine)

1. **Own benefit** per person, from PIA, adjusted for claim age.
2. **Early-claim reduction / delayed credits**: reduction of 5/9 of 1% per month for the
   first 36 months before FRA, then 5/12 of 1% per month beyond that; delayed credits of
   2/3 of 1% per month (8%/yr) from FRA to 70. FRA itself is birth-year dependent (66–67
   for anyone AiRA plans for). **Spousal benefits earn NO delayed credits** — they max out
   at the spouse's FRA.
3. **Spousal top-up**: `spousalBenefit = max(0, 0.50 × higherEarnerPIA − ownPIA)`, reduced
   if the *spouse* claims before their own FRA, and **payable only once the higher earner
   has filed**. So the household total can step up in a later year than the spouse's own
   claim — a timing subtlety a naive model misses entirely.
4. **Survivor benefit**: on first death the survivor's benefit becomes
   `max(ownBenefit, deceasedBenefit)` — 100% of the deceased's, *including* DRCs, reduced
   if the survivor claims survivor benefits before their own survivor-FRA. The smaller
   check simply stops. This replaces the `× 0.67` literal above.
5. **Widow's penalty (already half-built)**: from the year after first death the survivor
   files **Single** — standard deduction roughly halves, brackets narrow sharply, IRMAA
   tiers halve, and (new, per §13.1 #6) the OBBBA senior bonus goes from 2 persons to 1 —
   against a barely-reduced RMD and an unchanged portfolio. The tax cliff, not the lost
   check, is what blindsides people.
6. **Deemed filing**: for anyone born after 1953-01-01, filing for one benefit deems filing
   for all you're eligible for. "File and suspend" and "restricted application" are gone.
   Do NOT build a UI that implies those strategies are available.
7. **Earnings test** before FRA (benefits withheld above an annual exempt amount, restored
   after FRA). Only matters for users working while claiming early — relevant because AiRA
   supports part-time `otherIncomes`.
8. **WEP / GPO**: repealed by the Social Security Fairness Act (signed Jan 2025), so
   government-pension recipients no longer take a haircut. **[VERIFY before coding]** —
   flagged rather than asserted, per the discipline that caught the OBBBA constants.
9. **Divorced-spouse benefits** (marriage ≥ 10 years, currently unmarried) — same 50%
   math, does not require the ex to have filed. Likely out of scope for v1; note it.

### Separate ask from the same screenshot — trust-fund benefit reduction

Boldin has a **"Model a benefit reduction in the future"** toggle. AiRA has **nothing**
equivalent — no base-case haircut assumption and not even a stress scenario for it (the
stress tab has crash / LTC / live-to-100 / survivor only). Given the OASI trust-fund
depletion date and the statutory ~20–25% across-the-board cut that follows if Congress does
nothing, this is a credible-and-cheap honesty feature and a natural sibling of §16's
`acaCliffReturns2026` legislative-uncertainty toggle. Profile keys: `ssBenefitCutPct`,
`ssBenefitCutYear` (both default off/0 = current law). **Design note:** design-authority
has already ruled once (§13.1 #6, the OBBBA 2029 sunset) that one-off speculative-extension
toggles should not proliferate ad hoc — so this and the ACA cliff toggle should be designed
together as ONE "legislative uncertainty" surface, not two unrelated switches.

### Profile keys (additive; every default preserves today's single-person behavior)

```jsonc
"spouse": {
  "enabled": false,          // false => engines behave exactly as today
  "dob": null,               // drives FRA, RMD age, mortality, and the 65+ deduction
  "ssPia": 0,                // own benefit at FRA (annual). "$1 means none" per Boldin UX
  "ssClaimAge": 67,          // 62..70, independent of the primary's
  "sex": null                // mortality table selection, matching the existing primary field
},
"ssBenefitCutPct": 0,        // trust-fund haircut, 0 = current law
"ssBenefitCutYear": null
```

### Engine work (the honest part — this is NOT just a UI change)

Every place that reads `ssb`/`ssAge` as a scalar must become a two-person household total,
and `taxableSocialSecurity()` must receive the **combined** gross. Touch points:
`runMC` (`App.jsx:~1210`), `simulateDeterministicWithStrategy` (`~1805`),
`buildWithdrawalWaterfall` (`:545`), `runStress`'s survivor scenario (`~7003`),
`rulesEngine` SS cards, and the `params` memo. Additionally:

- **A survivor event needs a date.** Today's stress scenario applies widowhood from year 1.
  A real model needs a first-death age (deterministic assumption, or mortality-drawn per
  path in `runMC`) and must switch `filingStatus` to `single` from the following year —
  which means filing status becomes **time-varying**, and it currently is not anywhere. This
  is the single biggest structural change and the main reason to phase this.
- **Two mortality curves.** The existing mortality-weighted success rate assumes one life.
- Golden-window / conversion logic (§16, §17) reads `min(ssAge, rmdStartAge)`; with two
  claim ages that becomes the min across both people.

### Suggested phasing

- **Phase 1 (biggest value / lowest risk):** two-person SS entry + spousal top-up + combined
  gross into the existing tax path. No survivor timing, no time-varying filing status.
  Immediately makes the base case right for every couple and kills the `× 0.67` literal by
  giving the stress scenario real numbers.
- **Phase 2:** survivor step-up + time-varying filing status (the widow's penalty as a
  *scheduled* event with a user-set first-death age, not just a stress toggle).
- **Phase 3:** the "delay the higher earner to buy survivor insurance" Action Plan
  recommendation — the Boldin alert Vincent saw. Needs Phases 1–2 to compute.
- **Phase 4:** trust-fund reduction toggle, designed jointly with §16's ACA cliff toggle.
- Earnings test / divorced-spouse: backlog unless a user asks.

### Gate

logic-validator on every rule above (SSA currency — FRA table, reduction/credit fractions,
deemed filing, WEP/GPO repeal status), design-authority on where the second person's fields
live (this lands squarely in §18 Phase B's "Money In → In Retirement" card, so build it
with that, not before), and tester. Hand-calc tests: spousal top-up when own PIA < 50% of
higher PIA; no top-up when own PIA is larger; top-up deferred until the higher earner files;
spousal gets no DRCs past FRA; survivor keeps the larger check; survivor filing-status
switch raises tax on an unchanged portfolio; `spouse.enabled = false` reproduces today's
numbers byte-for-byte (regression lock).

### Reddit-update summary (plain language)

"Coming soon: real spousal Social Security. Enter each person's benefit and claiming age and
AiRA will apply the spousal top-up automatically, show what happens to the survivor when one
of you dies — including the tax hit from filing Single — and tell you whether the higher
earner delaying to 70 is worth it as survivor insurance."

## 23. Roth conversion tax funded from "unlimited outside cash" — requested 2026-07-27

**Priority: P2 — downgraded.** **Status: the "INERT" finding below is STALE.** Verified
2026-07-31: `taxFunding` IS now read by the live engine — 3 references in
`buildWithdrawalWaterfall.js`, the `withholdConvMC` branch in `runMC` (App.jsx ~1721), and it
is actively swept in `ghostSettings.test.js` (from_taxable vs from_conv must change the
result). So it is no longer a ghost setting. What REMAINS open is narrower: `outside_cash` is
a behavioural duplicate of `from_taxable` and should be removed with a profile migration
(§25 cheap items). Ghost-setting analysis below kept for the reasoning.

### ⚠️ FINDING THAT CHANGES THIS ENTIRELY — `taxFunding` is a GHOST SETTING (2026-07-27)

Verified by grep before scoping the fix: **`taxFunding` is never read by the live
engine.** It appears only in `buildRothExplorer.js` (~630, ~696), which is dead in the
UI — `RothLadder` sources from `buildWaterfallComparison` / `buildConversionLadder`,
and both wrap `buildWithdrawalWaterfall`, which contains **no `taxFunding` handling at
all**. That engine unconditionally does:

```js
pretax = Math.max(0, pretax - fromPretax - convAmt - convTax) * (1 + gr);
```

So conversion tax is **always** taken from PRE-TAX, whichever option the user picks.

This inverts the original complaint. The worry was that "outside cash" models infinite
money and flatters the result. In the live engine it does not model anything — and the
behaviour it silently falls back to (funding from pre-tax) is the *most punitive*
option, the one that shrinks the conversion's value most. The dropdown, the
"recommended" label on From taxable, and the v1.2.27 warning banner all describe
behaviour that does not exist. Same class as the `smile` / healthcare-shock ghost
models (§13.1 #9): configurable, persisted, described as active, read by nothing.

**Vincent's instruction (2026-07-27), which is the right design:** conversion tax
should draw from **taxable first, then cash, then deplete the others**. That removes
the fiction rather than sizing it — there is no imaginary pot to bound, because every
dollar comes from a bucket the simulation already tracks and can run out of.

**So the fix is NOT the `outsideCashBalance` field proposed below.** It is:
1. Implement `taxFunding` in `buildWithdrawalWaterfall` for real — the one live engine.
2. Fund `convTax` through an ordered draw: `taxable → cash → pretax` (Roth last or never
   — paying Roth-conversion tax out of the Roth defeats the point).
3. Reuse the existing `resolveDrawOrder` / `WITHDRAWAL_BUCKETS` machinery from §12
   rather than writing a second ordering mechanism — the drift risk is the whole reason
   that resolver exists.
4. When the funding buckets are exhausted, shrink the conversion (the Step-6.5
   affordability loop already does exactly this for the pre-tax case) and report it via
   `convCapReason`, so the UI can say why.
5. Then either delete the "outside cash" option or redefine it as a real, finite,
   user-entered balance — but only if a user actually needs it. Deleting is cleaner.

**Consequence to expect:** every existing conversion projection changes, because today
they are all silently funded from pre-tax. That is a correction, not a regression, but
it must be called out. Needs a regression lock and logic-validator sign-off.

### The problem

`taxFunding = "outside_cash"` pays each year's Roth-conversion tax from a pot the
simulation **never tracks and never depletes**. Consequences:

- Every converted dollar lands in the Roth intact, so the conversion looks strictly
  better than it can actually perform.
- The pot is infinite, so the strategy never runs out no matter how large or how
  long the conversion ladder is — there is no failure mode, which is not a property
  any real funding source has.
- It competes directly against `from_taxable` in the Conversion Plan comparison, and
  wins on numbers it did not have to earn. A user comparing funding sources is being
  shown an unfair race.

v1.2.27 (`3876a2f`) added an inline warning, moved the option off first position, and
marked "From taxable" as recommended. **That is disclosure, not a fix** — the engine
still models infinite money, and the number the user reads is still wrong.

### The fix

Make outside cash a real, finite, depleting balance.

1. New profile field `outsideCashBalance` (default **0**, so the current default
   behaviour is "you have none" rather than "you have infinite"). Generic-first: no
   user-specific value in code.
2. Track it as a real bucket through the year loop in `buildWithdrawalWaterfall`:
   each year's `convTax` (and only the conversion tax — this pot is not a spending
   source) is drawn from it and the balance carries forward, growing at the same rate
   the cash bucket uses (`cashRealReturn`), not at the equity rate.
3. **Define the exhaustion behaviour explicitly** — this is the part that needs a
   decision, not a default:
   - preferred: fall back to `from_taxable` for the remainder of that year's tax and
     every subsequent year, and flag the year it happened, or
   - shrink the conversion to what the remaining outside cash can fund (mirrors the
     existing Step-6.5 affordability shrink loop), or
   - hard-stop conversions once exhausted.
   Whichever is chosen, the row must carry a reason field so the UI can say
   "conversions stopped/shrank at age N — outside cash exhausted", exactly as
   `convCapReason` now does for the bracket/IRMAA cap.
4. Once it is finite, the warning copy can soften from "this overstates your benefit"
   to a plain statement of the modelled balance — the honesty problem goes away
   because the model becomes honest.

### Notes

- Same defect class as `abReliability` (§13.2 #11) and the age-80 rental stop: a
  modelling shortcut the UI presents as a real strategy. The pattern to watch for is
  any input that cannot fail.
- Interacts with the tax-payment-source optimizer in §17 Phase 3, which is supposed to
  compare paying conversion tax from taxable / cash / pre-tax by lifetime outcome. That
  comparison is **meaningless while one of the sources is infinite** — so this is a
  prerequisite for §17 Phase 3, not an independent nicety.
- Needs a regression lock: `outsideCashBalance = 0` with `taxFunding = "outside_cash"`
  must behave sensibly (immediately fall back), and existing profiles that selected
  outside cash will change numbers — that is the point, but it should be called out in
  the build note so it is not mistaken for a regression.
- Gate through logic-validator (does the pot belong in MAGI/provisional income? it is
  after-tax money being spent, so it should not be income — confirm) and
  design-authority (where the balance input lives, and the exhausted-state copy).

## 22. ✅ Widow's penalty — SHIPPED v1.2.65 (was: derived 2026-07-28, NOT built)

**Status: DONE.** `spouse.deathAge` + `spouse.firstToDie`, time-varying filing status via
`filesJointlyAt` across ALL THREE engines, survivor SS = max(own, deceased) retiring the
×0.67 literal, joint-RMD table off after death, horizon following the survivor. Survivor
benefit RULES are §30; the stress-scenario reconciliation is §31. All five tests this
section required exist in `spousalSS.test.js`. Plan below kept for the reasoning.

Requested by a second user: *"I'd also like ability to predict the effect of an early
passing of one partner."* Last piece of §21. Route recorded so it is not re-derived.

**The blocker, precisely.** `isMFJ` is a closure CONSTANT in both engines
(`buildWithdrawalWaterfall.js:331` and the `runMC` mirror), read by ~24 sites: federal
brackets, `stdDed`, `bracketCeiling`, `taxableSocialSecurity`, LTCG brackets, the NIIT
threshold, the IRMAA tier, the OBBBA senior bonus, the joint-RMD gate, and state
brackets. Filing status is nowhere time-varying.

**The insight that makes it small:** `yearTax(age, yr, …)` already receives `age`, and so
does every draw step — so filing status needs no new plumbing through call signatures. It
can be derived from the age already in scope:

```js
const isMFJBase    = filingStatus !== "single";
const survivorFrom = (spouse?.enabled && spouse?.deathAge) ? spouse.deathAge : Infinity;
const mfjAt = (age) => isMFJBase && age < survivorFrom;   // Single from the death year on
```

Replace `isMFJ` with `mfjAt(age)` at those sites and make `fedBase` / `stateBr0` per-age
lookups instead of hoisted constants. Mechanical — but it is TAX MATH across ~24 sites in
two engines, so it wants a dedicated session, not the tail of one.

**Also required in the same change:**
- SS becomes `max(primary, spouse)` from `deathAge`: the survivor keeps the larger check,
  the smaller one stops.
- The OBBBA senior bonus drops from 2 persons to 1 — automatic, since v1.2.28 made it
  person-count aware.
- `useJointRmdTable` must switch off: the joint table is only valid while the
  much-younger spouse is alive (the guard already exists, keyed on filing status).

**Profile field:** `spouse.deathAge` (null = not modelled). Deliberately ONE user-entered
age, not a mortality draw — per §21's agreed approach. That is what keeps this a
deterministic event in a known year instead of a variable threaded through 3,000 Monte
Carlo paths, and it is the reason the change is contained at all.

**Tests that must exist before it ships:**
1. `deathAge = null` reproduces today's numbers byte-for-byte (regression lock).
2. In the death year + 1, taxable income RISES on an unchanged portfolio — the penalty
   itself, and the entire point of the feature.
3. SS drops to exactly `max(primary, spouse)`, not the sum.
4. Standard deduction, IRMAA tier and senior bonus all step down together — one of them
   lagging is the likely bug.
5. Cross-engine: `runMC` and the waterfall agree on the survivor year.

**UI:** the input belongs directly under the spouse SS block shipped in v1.2.42, replacing
the "Not modelled yet" note currently sitting there.

**About page:** worth a short entry once built. The teachable point is that the tax hit
usually exceeds the lost benefit — the survivor keeps the larger of the two checks but
files Single, so brackets narrow, the standard deduction roughly halves, IRMAA tiers halve,
and the senior bonus halves, against a barely-reduced RMD and an unchanged portfolio.

## 24. Per-person (You / Spouse) modelling — raised 2026-07-28

Vincent, comparing against Boldin: *"in Boldin each income has a YOU and a SPOUSE, like
Pension. Same with Work and income. The same is with Medicare and medical."* Screenshots
show Medicare expenses and Long-Term Care split per person, each with its own lifetime
cost and its own strategy.

### The root cause — AiRA has ONE age

Verified: `spouse.ssAge` (added v1.2.42) is a **claim** age, not the spouse's actual age.
There is **no spouse date of birth anywhere in the codebase**. Every engine walks a single
`age` from `retireAge` to `endAge`.

That one fact blocks everything on Boldin's per-person list, because what makes per-person
modelling matter financially is almost always an **age difference**:
- Medicare starts at each person's own 65 — a 4-year gap means 4 years of one premium.
- RMDs start at each person's own SECURE 2.0 age, off their own pre-tax balance.
- The age-65 standard-deduction add-on and the OBBBA senior bonus apply per person
  (v1.2.28 already made the bonus person-count aware, so that half is ready).
- A realistic first-death age is usually the older or less healthy partner.

So `spouse.dob` is the enabler. Per-person UI without it just computes the same thing
twice in two columns.

### Priority by financial impact, NOT by Boldin's layout

1. **✅ DONE v1.2.62 — `spouse.dob`** — the enabler. Also fixed the age-gap bug it exposed
   in spousal SS, and made the age-65 deduction add-on + OBBBA senior bonus per-filer.
2. **Long-term care, per person.** The scenario that actually bankrupts couples is
   ASYMMETRIC: one spouse in memory care at ~$110k/yr while the other still runs a
   household. AiRA models LTC only as a household-level stress scenario
   (`LTC_ANNUAL_COST`, `LTC_YEARS` at `App.jsx:~7077`), so it cannot express "one of us,
   not both". Boldin also lets each person hold a different STRATEGY (deferred annuity vs
   spend-down to Medicaid) — a real modelling difference, not a label.
3. **✅ DONE v1.2.62 — Medicare / IRMAA start age per person.** IRMAA is charged per beneficiary and
   `irmaaCost` is already filing-status aware (MFJ = 2× the single per-person amount), so
   the AMOUNT is roughly right — but the START is not: both people are assumed to reach 65
   together, so an age gap overstates early-retirement Medicare cost.
4. **Pension per person + survivor percentage.** `otherIncomes` entries carry no owner, so
   a joint-and-survivor election (typically 50% or 100% continuing to the survivor) cannot
   be expressed. Pairs naturally with §22's widow's penalty — both fire on the same event.
5. **Work income per person.** Lowest impact: no pre-retirement wages are modelled at all
   today, so "one of us keeps working part-time" is already approximated by `otherIncomes`.

### What should stay household-level

**Account balances.** Splitting them doubles data entry to produce the same answer — the
household draws from one pool. The one real exception is RMDs, which key off each person's
own pre-tax balance; that matters only with a large age gap and is better served by an
optional owner tag on pre-tax accounts than by splitting the whole account model.

### Sequencing warning

Do NOT build the two-column UI first. Honest order: `spouse.dob` → §22's `mfjAt(age)`
time-varying filing status (the same refactor unlocks per-person age logic) → then LTC and
Medicare per person. Building the columns ahead of the age model produces a screen full of
controls that compute nothing — the ghost-setting failure mode at feature scale.

### §24.1 — Per-person CONTRIBUTIONS (Phase A) — scoped 2026-08-03

Sharpens item 5 above. That item said "no pre-retirement wages are modelled", which is true
of *income* but not of *contributions*: `contrib` / `employerContrib` / `rothContrib` /
`taxableContrib` / `hsaMonthly` are all modelled, summed into buckets, and run for
`accYrs = retireAge - currentAge` — **one retirement date for the whole household**.

#### The single numerical error

The aggregation is NOT wrong. `$24,500 + $18,000` in one field produces exactly the same
projection as two fields, because all three engines sum into buckets. Nothing is lost by
combining amounts, and a two-column UI that only splits amounts changes no number at all.

What IS wrong is that both streams stop on the same day. One person retiring at 62 while
the other works to 67 loses (or invents) five years of one salary's savings, compounded to
retirement. That is the entire numerical case for this work.

#### Why NOT two profiles

Considered and rejected: telling a couple to run two single-person plans and add the
results. Every threshold that matters is joint and not 2× the single value —

| Rule | MFJ | Single | Two singles merged | Error |
|---|---:|---:|---:|---|
| SS torpedo (`buildWithdrawalWaterfall.js` ~1119) | 32,000 | 25,000 | 50,000 | 18,000 of provisional income escapes tax |
| NIIT (`buildRothExplorer.js` ~199) | 250,000 | 200,000 | 400,000 | 150,000 of fake headroom |
| IRMAA tier 1 (`App.jsx` ~1091) | 218,000 | 109,000 | 218,000 | additive only if income splits evenly — it never does |

Two of the three landmines this app exists to catch would be silently disarmed, and every
error runs in the flattering direction. Also unmergeable: progressive tax is not additive;
bracket-fill would double-count the same bracket space (the §6.3 warning); success rates do
not add, and separate sims wrongly forbid one spouse's surplus from rescuing the other's
shortfall; and the widow's penalty (§22) vanishes entirely. One household, one model.

#### Data model — extend `spouse{}`, do not add flat fields

Follows the `enabled:false` / blank-means-same-as-primary idiom already used by §21/§24.

```js
spouse: {
  retireAge: null,      // null ⇒ same as primary ⇒ today's behaviour
  contrib: 0,           // their pre-tax deferral
  employerContrib: 0,   // their match / profit sharing
  rothContrib: 0,       // their Roth IRA
}
```

| Field | Split? | Why |
|---|---|---|
| 401(k) deferral | Yes | Tied to one job, stops when that job stops |
| Employer contribution | Yes | Follows the same job |
| Roth IRA | Yes | Per-person cap and per-person catch-up age |
| Brokerage / after-tax | **No** | Household money, no employment link, no cap |
| HSA | **No — own rule** | Stops at *Medicare enrolment* (65), not retirement; limit is family-coverage |

Defaults of `null`/`0` ⇒ every saved profile computes byte-identically. That is the
acceptance bar for the migration.

#### Engines

`spouse.retireAge` is on the SPOUSE's clock; every loop walks the PRIMARY's age. This is the
shape of the age-gap bug §24 item 1 already had to fix once. Add to `engine/ages.js`,
beside `planEndAgeOnPrimaryClock` / `survivorAgeOnPrimaryClock`:

    contribStopOnPrimaryClock(p)   // → primary-clock age at which spouse contributions end

Three accumulation loops consume contributions and must change together (cross-engine drift
is the recurring defect class here): `runMC` (`App.jsx` ~1231),
`simulateDeterministicWithStrategy` (`App.jsx` ~1907), `accumulateToRetirement`
(`buildWithdrawalWaterfall.js` ~217). Plus display sites that read `contrib` directly and
would otherwise show the primary's number as the household total.

#### Phase B — deliberately NOT in Phase A

Spouse retires AFTER the primary. Contributions would land past the end of the accumulation
loop, and the retirement loop has no concept of contributions or of the wages funding them.
Phase A **clamps** that case at the primary's retirement date — no regression (it is exactly
today's behaviour), but no fix either, and the UI must SAY so rather than imply otherwise.
Partial workaround that exists today: model the spouse's ongoing wages via `otherIncomes`
as income, though not as contributions to accounts.

#### Caps — decision required before lowering any max

Today's 401(k) field maxes at 80,000, ~2× one person's limit, because it holds a couple.
Splitting invites dropping each field to the individual limit — but `ANumInput` clamps to
`max` on blur, so a lowered cap silently rewrites a saved number. Migrate the aggregate into
the primary and leave the cap generous for one release, OR replace clamping with a
non-destructive warning. Never both in one release.

#### Tests (gate)

1. Regression — both stop at the same age ⇒ identical to today's aggregate.
2. Migration — old profile with only `contrib` ⇒ byte-identical.
3. Arithmetic — spouse stops 5 years early ⇒ exactly 5 × their streams less, compounded.
4. Age gap — spouse 10 yrs younger, `spouse.retireAge` 60 ⇒ stops when primary is 70.
5. Bucket routing — spouse 401(k) → pretax, spouse Roth → roth, no leakage.
6. Cross-engine parity — all three engines agree on the balance at retirement.
7. Ghost settings — registered in `ghostSettings.test.js`, proven to move an engine output.
8. Clamp — spouse retiring after the primary is clamped, not dropped or double-counted.

Test 7 proves the field REACHES the engine; only 3 and 4 prove the arithmetic is right.
Both are required — a wiring test alone is what let the spousal-SS age-gap bug ship.

## 25. HANDOFF TO THE HIGH-BUDGET ACCOUNT — 2026-07-28

Vincent is doing cheap items on the low-budget account and the heavy work elsewhere.
This is the split. **Shipped through v1.2.43** (639 tests pass, deployed).

### Done today (do not redo)
- v1.2.42 spouse Social Security UI — toggle, spouse benefit, spouse claim age, both FRA
  amounts, live spousal top-up panel. Off by default.
- v1.2.43 three small fixes: the 401(k) label that was routing Roth deferrals into pre-tax,
  restore-link errors that conflated unknown/expired/used-up, and admin auth returning the
  same 401 whether the secret was wrong or simply unset.
- Spousal engine wiring (from another machine) **verified** by new tests in
  `ghostSettings.test.js` — including that the top-up keys off the HIGHER earner's PIA.

### Heavy items, in the order they unblock each other
1. **§22 widow's penalty** — `mfjAt(age)` time-varying filing status, ~24 sites × 2 engines.
   Plan and required tests already written in §22. **This is the highest-value single item**:
   two separate users have now asked for it, and the tax hit exceeds the lost benefit.
2. **§24 `spouse.dob`** — the enabler for all per-person modelling. Same refactor as (1)
   touches the same code, so do them together or back-to-back.
3. **§24 LTC per person** — the asymmetric case (one spouse in memory care, the other at
   home) is what actually bankrupts couples and cannot be expressed today.
4. **§19 NIIT-aware bracket fill** — cheap now: ENG-8 built the `min(...)`/`convCapReason`
   shape specifically so more cliffs could be appended. Constants already exist.
5. **§22.2 per-bucket returns** — the Bucket Strategy tab currently implies per-bucket risk
   while the engine models one blended return. Correlation warning is in §22.2: do NOT draw
   independently per bucket or diversification is fabricated.
6. **§22.1 `roth401kContrib`** — v1.2.43 fixed the misleading label; the real field is still
   missing. Needs the shared elective-deferral limit from TAX_REFERENCE (VERIFY first).

### Cheap items still open (fine for the low-budget account)
- `inspect` / `issue-jwt` resolve a synthetic `cus_ADMIN_*` id from an email instead of
  querying the `email` column the way `issue-restore-link` already does — which is why the
  admin panel could not find a real Stripe customer.
- ENG-25: Step 5's `irmaaCap` omits realized gains from the MAGI base (ENG-8 fixed the
  same defect on the conversion path; the two are now asymmetric).
- Second-order gains: a taxable draw taken to PAY conversion tax realizes gains that are
  not themselves taxed this pass. Documented in `buildWithdrawalWaterfall.js`.
- `outside_cash` is now a behavioural duplicate of `from_taxable` — remove with a migration.
- The 23 entries in `ghostSettings.test.js`'s `NEEDS_A_TARGETED_FIXTURE` — roughly 6
  fixtures covers them. Start with `preRetireEq`/`postRetireEq`, since a fault there skews
  every success rate.
- Hero landing sliders: typed entry + `LANDING_SLIDER_LIMITS` (three have a $999B max with
  a $25K step). design-authority already approved the dual-bound approach.

### Not code — Vincent only
- **`PrintReport.jsx` is the public placeholder on RED-DRAGON.** The real file is on
  another machine and is not in git by design (§20). Production currently serves the
  placeholder. Restore it, then `git update-index --skip-worktree src/report/PrintReport.jsx`.
- **Drive-sync `aira-forecaster-agents/`** — gitignored, so the OBBBA section added to
  `TAX_REFERENCE.md` and the `RMD_TABLES.md` age-89 correction (13.0 → 12.9) exist on one
  machine only. The RMD one is a live trap for whoever ports doc values into code next.
- **Check `[verify-session]` logs after the next sale** — v1.2.33 instrumented every exit
  with a distinct reason. That names the credits root cause instead of a fourth guess.

## 26. ✅ SHIPPED v1.2.45 — Equity glidepath: hardcoded 62 bug + user-set switch age

**Status: DONE 2026-07-28.** 648 tests pass, production build compiles. Answer to
*"I plan on 90/10 until 67 — can we do that?"* is now yes: Profile → Assumptions →
"Switch to the post-retirement mix at age".

**What shipped, vs what this section originally scoped:**
- New `src/engine/glidepath.js` — `resolveGlidepathSwitchAge()` / `glidepathEqPct()` /
  `glidepathEquityWeight()`. Single source of truth; every engine imports it.
- The hardcoded 62 was in **five** places, not two. §26 found the `runMC` pair; the same
  literal was also in `simulateDeterministicWithStrategy`, `buildRothExplorer` and
  `buildConversionLadder`, none of them agreeing with `portReturn`. All five fixed.
- `glidepathSwitchAge` added to `BLANK_PROFILE` (null), forwarded through the `params`
  memo, and given a UI row directly under the two equity-weight inputs it arbitrates
  between (blank = "shift at your retirement age").
- `accumulateToRetirement` grows per-age rather than at a pinned `preGr`, so a switch age
  set BEFORE retirement is honoured in the accumulation phase too.

**Correction to this section's Part A framing:** the claim that a 67-year-old retiree was
"de-risked five years early in every stress run" is wrong in that direction. The
`seqOverride` branch only covers RETIREMENT years, so with `retireAge` 67 every year in it
is past 62 and the old code and the fix agree. The bug actually bit (a) anyone retiring
BEFORE 62 — ages `retireAge`..61 got the accumulation weight in stress runs but the
retirement weight in the headline run — and (b) every user of the new later switch age.
The regression test is written against case (b) and was verified to FAIL against the old
line before being kept.

**Behaviour change to know about:** for profiles retiring before 62, the Roth Explorer and
the deterministic schedule previously grew the first drawdown years at the ACCUMULATION
rate while the Monte Carlo beside them used the retirement rate. They now agree. This is
why `roth.test.js` §14 (ALEX_FULL, retireAge 60) needed its `grForAge` helper updated — it
now derives from `ALEX_FULL.retireAge` instead of a literal 62. The `glidepathSwitchAge =
null` regression lock holds in all three engines.

**Tests:** six, in `ghostSettings.test.js` → `describe("glidepathSwitchAge …")`.

---

### Original entry (kept for context)

Vincent: *"I plan on 90/10 until 67 — can we do that?"* Answer today: no. And while
checking, found a real bug in the same code.

### Part A — THE BUG (fix regardless of the feature)

The glidepath exists in **two places in `runMC` and they disagree**:

| Site | Switch condition | |
|---|---|---|
| `App.jsx:823` (`portReturn`) | `age < switchAge`, derived from `retireAge` | ✅ correct |
| `App.jsx:1222` (stress-sequence branch) | **`age < 62` — HARDCODED** | ❌ wrong |

Line 1222 is inside `runMC`'s `seqOverride` path — the branch used whenever a prescribed
market sequence is applied, i.e. **every Stress Test scenario**. So stress results use a
glidepath that flips at 62 no matter what the user set: someone retiring at 67 is
de-risked five years early in every stress run, someone retiring at 60 stays aggressive
two years too long. The two branches of the SAME function model different investors.

Same defect class as everything else this week — `portReturn` was fixed to honour
`retireAge` and the copy 400 lines below was missed — plus a bare literal, so it is also a
CLAUDE.md rule-6 violation.

### Part B — THE FEATURE

The switch age is welded to `retireAge`; there is no separate control. "Stay 90/10 until
67" is only expressible by someone retiring exactly at 67. **When you de-risk and when you
retire are different decisions** — a bridge, a pension, or plain risk tolerance all justify
staying aggressive past retirement, and the model cannot say so.

**Fix (one change covers both parts):**
1. New profile field `glidepathSwitchAge`, **default `null` → falls back to `retireAge`**, so
   every existing plan is byte-identical until the user touches it.
2. Use it at BOTH sites. Delete the `62`.
3. Thread through the `params` memo (the classic miss — engines read `params`, not
   `assumptions`).
4. UI: next to the existing pre/post equity inputs, labelled so the distinction from
   retirement age is obvious, e.g. "Shift to my post-retirement mix at age ___
   (default: my retirement age)".

**Tests required:**
- The two sites agree: for the same profile, the stress path and the normal path use the
  same equity weight at every age. This is the test that would have caught the bug and it
  is the one that matters most.
- `glidepathSwitchAge = null` reproduces today's numbers exactly (regression lock).
- Setting it to 67 with `retireAge` 62 keeps `preRetireEq` weighting through age 66.
- Add `glidepathSwitchAge` to `ghostSettings.test.js` — it is a runMC-only input, so it
  belongs with the equity-glidepath block, not the waterfall sweep.

**Effort: small.** One field, two call sites, four tests. The only care needed is that the
`params` memo actually forwards it.

## 27. Marketing site / web portal — design brief, 2026-07-28 (NOT built)

**Status: design only. Build scheduled ~2026-07-31 on the high-budget account.**
Written now so that session starts warm. Nothing in this section has been coded.

### Origin

Vincent supplied the complete saved HTML of `retirementscenario.com` — a competitor
and colleague — and asked for something similar, branded for AiRA, explicitly *not* a
copy. This section is the review plus the plan.

**Boundary that must hold:** his stylesheet, his copy, and his JSON-LD text are his
work. Take the *strategy* and the *information architecture* — those are ideas, and
they are learnable. Write original CSS and original words. Beyond the legal point, a
near-clone is immediately obvious to a colleague who has read every line of his page.

### What he actually built (facts, for reference)

- **One static HTML file.** No framework, no build step. Inline `<style>`, vanilla JS
  in IIFEs. Marketing on the apex domain, app on an `app.` subdomain.
- **Heavy JSON-LD**: Organization, WebSite, SoftwareApplication (with featureList and
  priced offers), and an ~18-question FAQPage. This is the AI-answer-engine bid, and
  it is the highest-leverage thing on the page.
- **Content-in-`<template>`**: long-form legal/methodology/comparison documents live
  in `<template>` elements in the page source — crawlable — and are cloned into a
  single modal shell on demand, with URL-hash sync (`#methodology/monte-carlo`) so
  every document and section is deep-linkable. One shell serves a dozen documents.
- **Trust as a first-class surface**: its own nav item, its own modal with internal
  chip nav and scrollspy, plus a changelog, a glossary, and an explicit "what we
  cannot model" section.
- **An eight-scene animated walkthrough** with an auto-tour that advances as each
  scene's animation completes and cancels on any real scroll input.
- Every animated scene has a `prefers-reduced-motion` snapshot fallback.
- Pricing: free calculator, one-time paid tier, no subscription — the anti-SaaS
  posture is itself a marketing pillar.

### THE POSITIONING WEDGE — the one decision everything else follows from

His hero answers **"what is my success rate?"** and shows a percentage ring. Every
retirement calculator ever built answers that question. It is a commodity number.

AiRA's engine is best at a question he does not ask:

> **What order should you withdraw in, and what does the wrong order cost you?**

That is `buildWithdrawalWaterfall`'s smart-vs-naive comparison, the SS torpedo guard,
the IRMAA guard, the bracket-limited pre-tax draw, and Roth-last. The lifetime-tax
delta is **already computed** and already rendered as a summary card (§4 "Lifetime Tax
Savings"). It is a dollar figure, it is large, it is specific to the visitor, and
nobody else's landing page shows it.

**So: lead with the lifetime-tax delta. Success rate is supporting evidence, not the
headline.** This is not a style preference — it is the only hero that is simultaneously
true, differentiated, and computed by code that already exists.

### What AiRA can claim that he cannot

Verify each against the code before it ships as marketing copy:

- 3,000 Monte Carlo paths (his page states 1,000).
- 10 distribution strategies × 3 sourcing modes, orthogonal — distribution decides how
  much, sourcing decides which bucket.
- Named landmine guards: SS tax torpedo (provisional income), IRMAA (MAGI, 2-year
  lookback), RMD bomb.
- Roth conversion explorer with bracket-fill targets and per-year manual overrides.
- SECURE 2.0 RMD ages driven by birth year; joint table when the spouse is much younger.
- Real per-state tax structure, not a single blended percentage.
- Cash-flow events, mortgage modelling with extra payments, healthcare shock,
  spousal SS with the top-up keyed off the higher earner's PIA.
- **Privacy**: no login, plan data stays in the browser, and the AI runs on the user's
  own Gemini key if they supply one. "Your numbers never touch our server" is a
  stronger claim than his, and it is architecturally true.
- A real person behind it — the DIYer identity and the YouTube channel.

### Brand and voice

Not "professional software without the professional" — that is his lane. AiRA's is the
existing footer line: *a simple DIYer's guide*. The nearest honest description is **the
spreadsheet you would have built yourself, if you had a tax engine.** Peer-to-peer, not
advisor-to-client. Show the math rather than asserting authority.

Visual direction must diverge from his dark-slate + blue/green + DM Serif palette. Pick
AiRA's own type pairing and accent before any CSS is written.

### Information architecture

1. **Nav** — How it works · The math · Pricing · Answers · About
2. **Hero** — the lifetime-tax delta. One number, smart order vs. no plan, with the
   inputs that produced it visible and editable. The existing landing hero (§project
   hero concept, shipped v1.2.6) is the seed; this is its marketing-page sibling.
3. **The problem** — three landmines, named: SS torpedo, IRMAA cliff, RMD bomb. This
   section is where AiRA is most obviously not a toy.
4. **How it works** — the withdrawal waterfall, step 0 through step 5, as the spine.
   Animation optional; correctness is the point. Reduced-motion fallback required.
5. **The math** — methodology surface citing `TAX_REFERENCE.md`, SECURE 2.0 ages, the
   bootstrap return model, and an explicit limits section.
6. **Answers** — the long-term asset. Real questions, real prose. Pure content, no
   copying involved. Start with 6–8 and grow.
7. **Comparison** — name Boldin, ProjectionLab, an advisor, **and him**, honestly. He
   is genuinely better at "a clear first answer in five minutes." AiRA is the
   withdrawal-order and tax engine. Different job; say so plainly. An honest table that
   concedes his strength is more persuasive than one that does not.
8. **Pricing** — mirror the existing credit model. Keep the anti-subscription stance.
9. **Closing CTA**, then a footer with the trust/legal/contact cluster.

### Technical shape

- **Static HTML + CSS + vanilla JS.** No framework. The marketing page must not import
  the CRA bundle — it should load in well under a second.
- Lives beside the app, not inside `src/`. Apex serves marketing, existing app path
  stays where it is. Confirm the Cloudflare Pages routing before building.
- **JSON-LD from day one** — Organization, SoftwareApplication, FAQPage. Cheapest, highest-
  return item on this entire list.
- Reuse the `<template>` + one-modal-shell + hash-deep-link pattern for the long-form
  documents. It is a good pattern; implement it from scratch.
- `prefers-reduced-motion` fallbacks are not optional.

### Build order for the 2026-07-31 session

1. Pick type + palette. Write the hero. Everything else follows from the hero number.
2. Static shell: nav, hero, problem, footer. Ship that.
3. JSON-LD + methodology + trust content.
4. Answers library (6–8 entries).
5. Comparison table.
6. Animation last, and only where it explains something.

### Open questions for Vincent

- Domain: apex for marketing with the app on a subdomain, or a path?
- Does the hero compute live from visitor input, or show a worked example?
- Name the four comparison columns — is he in the table?

---

## 29. ✅ FRIDAY BUILD 2026-07-30 — SHIPPED (v1.2.62 + v1.2.63)

**Suite: 771 pass, 28 suites, 0 fail** (from 705/26). Production build compiles and
the bundle contains the REAL `PrintReport.jsx` (verified: no "Report module not
included" string). Two commits on `main`.

### ⚠️ Read this first: REQUIREMENTS.md is NOT git-tracked

This file's own header says it is "git-tracked, so every collaborating agent gets
it." **That is false.** `git ls-files` returns only `README.md`,
`aira-forecaster-agents/knowledge/TAX_REFERENCE.md` and `RMD_TABLES.md` — the
`*.md` rule in `.gitignore` (line 69) catches this file. So it does **not** travel
between machines, and the §0 handoff protocol silently depends on something that
does not happen. Either `git add -f REQUIREMENTS.md` or accept that it is
Drive-sync-only and correct the header. Flagged, not changed — Vincent's call.

### 🔴 §21/§24 — a REAL BUG in the shipped spousal SS feature

v1.2.42 shipped two-person Social Security. `ghostSettings.test.js` proved the
fields were *wired*; nothing proved the amounts were *right*. They were not.

`computeHouseholdSS` gated the spouse's benefit on `age >= spouse.ssAge`, where
`age` is the **primary's** age — i.e. it asked whether the PRIMARY had reached the
SPOUSE's claim age. A spouse ten years younger claiming at 67 was paid their full
benefit **and** the spousal top-up from the primary's 67th birthday, when the
spouse was 57. Ten years of income the household never receives, **inflating the
success rate for every couple with an age gap.**

Fixed, with `src/spousalSS.test.js` (49 tests) locking the arithmetic.

**The same bug class was in the deductions**, and is also fixed:
- The age-65 standard-deduction add-on ($1,650 each) and the OBBBA senior bonus
  ($6,000 each) are PER FILER, but both were granted for two people the moment the
  primary turned 65 — and the senior bonus returned **$0** when only the OLDER
  spouse qualified (`if (!(age >= 65)) return 0`). Now counted by
  `personsAtLeastAge`.
- Medicare/IRMAA (§24 #3): thresholds stay per tax return; the **surcharge** is now
  per beneficiary, so an age-gapped couple pays one until the younger reaches 65.

**New `src/engine/ages.js`** — the one age/date implementation. `ageFromDob` and
`parseCalendarDate` moved out of `App.jsx` because the engines cannot import from it
(cycle) and the alternative was a second copy. Age was already computed four
different ways here once, two of them wrong; that bug shipped. Exports:
`ageFromDob`, `parseCalendarDate`, `personAgeNow`, `spouseAgeOffset`, `spouseAgeAt`,
`personsAtLeastAge`, `spouseDeathOnPrimaryClock`, `filesJointlyAt`, `filingStatusAt`.

**New profile field `spouse.dob`.** Blank ⇒ same age ⇒ byte-identical to before, so
no saved profile moves until it is filled in. The UI states the derived gap and the
year the spouse's benefit actually starts on the primary's clock.

### ✅ §22 — widow's penalty, SHIPPED

All five required tests written and passing, plus cross-engine agreement.

- New `spouse.deathAge` (the SPOUSE's own age, shifted onto the primary's clock).
- `filesJointlyAt` replaces the `isMFJ` closure constant at ~24 sites in **all
  three** engines — `runMC`, `buildWithdrawalWaterfall` **and** `buildRothExplorer`.
  §22 scoped two; the Roth Explorer was the third, and it advises on conversions, so
  leaving it constant would have recommended filling brackets the survivor does not
  have.
- **MFJ is kept THROUGH the death year, Single from the year after** (IRS Pub 501 —
  a survivor may file jointly for the year of death). §22's sketch flipped in the
  death year itself, which overstates tax by one year.
- Survivor SS = `max(primary, spouse)`, retiring the hardcoded `× 0.67`.
- Joint & Last Survivor RMD table now switches off after the death.
- UI replaces the "Not modelled yet" note with the real control, stating BOTH
  consequences — the benefit lost and the larger tax increase.

### ✅ §28 — display-provenance audit, all three deliverables

**D1 — audit finished.** All 36 metric cards traced (the 18 that compute across
multiple lines never had been). **One real mismatch:** "Portfolio at Retirement"
was captioned **"Median accumulation"**, but the value is `accumulateToRetirement()`
— a single deterministic projection at the expected return. No distribution exists,
so there is no median to take. Same class as "safe spend" and "GK guardrails".
Also fixed: the conversion "Savings at Age X" cards are larger than the two bars
charted above them (they hold all four buckets) with nothing saying so — composition
now disclosed; and one card formatted money with an inline `toLocaleString`.
**Verified NOT bugs** (do not "fix" these): `nw` really is `r.totalPort`, so the
"Savings" scope is right; and "Peak liquid (median)*" really is `max(mc.pcts.p50)`
with its asterisk footnoted below the card.

**D2 — `src/provenance.test.js`.** A registry of every card: label, exact source
expression, and kind (`computed` | `echoed` | `point-in-time` | `count`). The
App.jsx card count is asserted against the registry size, so **adding a card
without declaring its provenance turns the build red.** `point-in-time` entries must
also record WHICH age — that is the `mc.medR` bug in assertable form. Modelled on
`ghostSettings.test.js`. Note the phrase assertions run against a comment-stripped
copy of App.jsx: the file explains its own history and has to quote the wrong
captions to do so.

**D3 — `aira-forecaster-agents/specs/UI_DESIGN_SPEC.md`** (new): the provenance
rule, the three disclosure tiers, the "one concept, one name" vocabulary, and the
conventions not to re-derive. ⚠️ That folder is gitignored, so **Drive-sync it** —
the enforcement half survives in `src/provenance.test.js`, which is tracked.

### ✅ §28.1 — Gary's four items closed

1. **OPEN 1 done** — the after-tax basis is now stated at the spending **input**, in
   the same words as the results bar and the About card.
2. **OPEN 2 done** — one income vocabulary everywhere: `Social Security` /
   `Pension/Other` / `Annuity/Rental`, aggregating to `Income`, which now names its
   three components in a click-open modal. The schedule table's
   `SS`/`Rental`/`Other Inc` headers were renamed to match.
3. **OPEN 3 done** — "Smile spending" → "Spending curve (go-go / slow-go)" with a
   click-open explanation carrying the plan's OWN computed percentages, a read-only
   pointer on the Spending tab (where he looked), and the exact per-year percentage
   now visible in the Spend column. The engine publishes `smileFactor`/`smileBase`
   so the display cannot drift from the curve.
4. **VERIFY resolved — his Roth-draw observation is NOT an engine bug.** Three
   tests: income-covered years draw no Roth, and Roth is never touched while cash or
   taxable remain. He was reading the pre-v1.2.52 columns that omitted his pension.

### ✅ §28.2 — hover-only disclosure

- `Toggle`'s `hint` now opens an `InfoModal` on **click** instead of rendering
  `title=`. One component, every toggle in the app.
- New `ThInfo` component; **20 table headers converted** from hover-only `title=` to
  a visible marker that opens on click. `title=` does not exist on touch devices at
  all, so every column explanation was unreachable on phones.
- Regression locks in `provenance.test.js`: no `<th title=`, `ThInfo` still in use,
  and `Toggle` cannot revert to a native tooltip.

### ✅ Owner report preview (no upsell nag)

`?aira_admin=1` **plus** a server-verified `ADMIN_SECRET` suppresses the purchase
prompt (`useOwnerVerified` in `src/billing/admin-panel.js`, set only when
`/api/admin` answers ok to a `ping`). The query param alone grants nothing — it
ships in the bundle, the secret does not. A purple badge states why the report is
unlocked, so an owner preview can never be mistaken for the customer view.

### Still open (deliberately not started)

- **§30 survivor CLAIMING STRATEGY** — §22 shipped the tax half and the `max(own, deceased)` drop. It does NOT model the independent survivor benefit, the switching strategy, claiming from 60, or the survivor reduction schedule. Two real defects listed there. **Read §30 before telling anyone survivor benefits are done.**
- §24 #2 **LTC per person** — the asymmetric case (one spouse in memory care) is
  what actually bankrupts couples and still cannot be expressed. `spouse.dob` is now
  in place, so this is unblocked.
- §24 #4 pension owner + survivor percentage; §24 #5 work income per person.
- §19 NIIT-aware bracket fill.
- §22.2 per-bucket returns; §22.1 `roth401kContrib`.
- The remaining ~100 `title=` sites are tier-3 (optional colour) or already carry a
  visible marker; the 20 that changed how a number is READ were the load-bearing set.


---

---

## 33. ✅ Bracket cap starved funded households — FIXED 2026-08-05 (v1.2.84)

**User-reported: 3.3% success on a plan whose true figure is ~100%.**

Profile (real, exported v1.2.80): single filer, 52, retires at 54, plan to 90,
spends $60k/yr. $1.75M in a 401(k), $20k Roth, $40k HSA — **no taxable, no cash**.
$93,000/yr property income growing 3%/yr. `withdrawalBracketTarget: "22"`.

### Mechanism

By his early 60s the property income ALONE exceeds the single-filer 22% bracket
top. The pre-tax draw step computes `room = ceiling - taxSoFar`, which became
**zero**, so it drew nothing. With 97% of assets in pre-tax and the small
Roth/HSA quickly spent, the funding need stayed permanently unfunded and every
path was flagged `survived = false` — **while holding $3–4M**.

The diagnostic that exposed it: `mc.pcts` showed **59% `alive` at age 66 against a
$3.98M median balance**. Paths were dying rich. Any future report of an
implausible success rate should check that curve first.

**The defect in one line: a tax preference was enforced as a hard constraint.**
Offered "pay 24% instead of 22%" or "fail the plan", the engine starved.

### Fix

An essential-spending override in **both** capping engines
(`buildWithdrawalWaterfall` and `runMC`): after the bucket sequence, if the need
is still unfunded and pre-tax money remains, draw it regardless of the
bracket/IRMAA cap. `simulateDeterministicWithStrategy` needed no change — it has
no bracket cap at all (0 references to `withdrawalBracketTarget`), which is why
its schedule stayed healthy while the MC collapsed, and is itself a separate
inconsistency worth closing later.

The override is **reported, not silent**: `pretaxCapReason =
"bracket_exceeded_to_fund_spending"` on the row, and `runMC` now returns
`bracketOverrideRate` (share of paths that had to break the target at least once).
A high value means the chosen target is unreachable for that household.

The Roth emergency reserve is deliberately NOT overridden — a separate explicit
user instruction, and widening the fix would change behaviour nobody reported.

### Tests — `src/bracketCapSoft.test.js`

The class-level invariant matters more than the case: **no path may be scored as
failed while it still holds drawable assets.** Seven extreme shapes (rental far
above spend at a 10% target, rental equal to spend, MFJ, IRMAA guard, SS torpedo
guard, all-pre-tax portfolio) plus a no-cliff test across the income level that
fills the bracket, and a "must not fire when there is room" test so the override
cannot silently discard the optimisation the user asked for.

## 34. ✅ Surplus income evaporated while its tax was charged — FIXED 2026-08-05 (v1.2.85)

Found by the invariant test added with the §33 bracket-cap fix, **not** by a user.

### The defect

Every engine computes the funding need as:

    need = Math.max(0, spend - ss - rental - otherIncome) + housingCost + ...

The `Math.max(0, …)` throws away every dollar of income above spending. But the
**tax on that income is still charged to the portfolio**. So income the household
actually receives vanishes, and the portfolio pays the bill for it.

Reproduced: the §33 profile with `propIncome` raised to $400,000 and spending at
$60,000. The household discards $340k/yr, then draws roughly $100k/yr from the
401(k) to pay tax on income it received, and depletes. Monte Carlo success comes
back **under 50% for a household with 6.7× its spending in income.**

Pinned as a failing-by-design test in `src/bracketCapSoft.test.js`
("OPEN: huge income still fails because surplus evaporates while its tax does
not"). Flip that assertion when this is fixed.

### Why it matters at ordinary scale too

It is not only an extreme-case bug. The reported §33 profile has $93k of income
against $60k of spending, so it loses ~$33k/yr of surplus AND pays the tax on it
from the portfolio. That is why it scores ~90% after the §33 fix rather than the
~100% the cash flows actually support.

### Same family as a bug already fixed once

v1.2.73 fixed exactly this shape for `cashFlowEvents` inflows: netting an
inheritance against one year's spending discarded everything beyond that year.
The fix there was to DEPOSIT the inflow into a bucket so the surplus compounds.
Rental, property and pension income still net-and-discard.

### Fix as shipped (v1.2.85)

Surplus income should be **deposited into the taxable bucket** (with basis, since
it is after-tax money once its tax is paid) rather than discarded — the same
treatment `computeCashFlowEvents` inflows now get. Requires:

1. Compute gross income and spending separately; stop collapsing them with `max(0, …)`.
2. Route `surplus = income - spendNeed` into `taxable` + `taxableBasis`.
3. Pay the income's tax from that surplus FIRST, before touching the portfolio.
4. All three engines together (runMC, simulateDeterministicWithStrategy,
   buildWithdrawalWaterfall) or they will disagree about survival — the drift
   class this codebase keeps relearning.
5. Tests: a household with income > spending must END RICHER, not poorer; and
   the surplus must appear in the taxable balance rather than nowhere.

## 35. ✅ Deterministic tax columns belong to a different plan — FIXED 2026-08-06 (v1.2.89)

Flagged by the tester agent, then measured. The Year-by-Year table shows a draw
computed by the chosen distribution strategy alongside a tax computed from a
DIFFERENT spending trajectory.

### Mechanism

`simulateDeterministicWithStrategy` (App.jsx ~2104) borrows its tax columns from
`buildWithdrawalWaterfall(p).smart.rows`, keyed by age. The intent is sound and
should be preserved: the waterfall is account-aware, so only pre-tax draws are
ordinary income, whereas `calcYearTax` on an aggregate draw would treat every
dollar as ordinary income and overstate tax badly.

The flaw is that the waterfall computes that tax against ITS OWN spend path (the
GK/Bengen hybrid). For any other distribution strategy the displayed draw and the
displayed tax describe different plans.

### Measured (mfj, retire 60, $1.5M: 900k pretax / 400k taxable / 200k roth)

| strategy | lifetime draws shown | lifetime tax shown |
|---|---:|---:|
| gk      | $2,245,173 | $210,686 |
| bengen  | $2,142,441 | $210,686 |
| cape    | $2,152,769 | $210,686 |
| one_n   | $2,942,508 | $210,686 |
| vpw     | $2,964,202 | $210,686 |
| **fixed** | **$6,137,802** | **$777** |

Five strategies with materially different withdrawals display IDENTICAL lifetime
tax, because they all read the same rows. `fixed` shows $777 of tax against $6.1M
of withdrawals — arithmetically impossible and plainly visible to any user who
looks.

### Agreed fix (NOT built)

Two-pass, keeping the waterfall as the tax authority:

1. Wrap the existing year loop in `runPass(taxByAge)` — mutable state is only
   `port`, `sp`, `lastReturn`, `startingPort`, `schedule`, so it wraps cleanly.
2. Pass 1 with today's borrowed tax, purely to obtain the strategy's spend path.
3. Re-run `buildWithdrawalWaterfall({ ...p, spSchedule })` with that path, so the
   waterfall taxes THIS strategy's spending.
4. Pass 2 with the resulting per-age tax.

Single iteration: pass 2's slightly different tax changes the portfolio, which
changes spend for portfolio-linked strategies (fixed/vpw/one_n). Second-order,
and vastly better than today, but document it rather than imply exactness.

### Two traps that will produce silently wrong numbers

- **Smile double-apply.** `spSmiled = sp * smileFactor` (buildWithdrawalWaterfall
  ~856) runs AFTER the `spSchedule` override (~807). Feed back the PRE-smile `sp`
  from pass 1, never `schedule[].spending`, which is already smiled.
- **Inflation double-apply.** Check `scheduleSpendForYear(spSchedule, yr, inf)`
  before feeding it: pass-1 spend is already nominal (GK inflates it internally).
  If that helper inflates too, the schedule must be de-inflated first.

Both were found by reading before editing. Verify each empirically, not by
inspection — this file has a long history of plausible-but-wrong readings.

### Why it was not built on 2026-08-05

Diagnosed and specced at the end of a very long session that had already produced
two build breaks from hurried scripted edits. A restructure of a live financial
engine, with two known double-application traps, is not something to start in that
state. Everything else from the session is deployed and green.

### Built 2026-08-06 (v1.2.89) — as specced, with both traps measured

Two-pass, exactly as agreed. The year loop is wrapped in `runPass(taxByAge)`;
pass 1 discovers the strategy's spend path, `buildWithdrawalWaterfall` is re-run
with that path as `spSchedule`, pass 2 replays with the resulting per-age tax.

**Re-measured on the same profile** (mfj, retire 60, $1.5M: 900k pretax / 400k
taxable / 200k roth). The figures differ from the 2026-08-05 table because the
strategy cull (v1.2.88) landed first and the earlier run predates it:

| strategy | lifetime tax before | after |
|---|---:|---:|
| gk      | $210,686 | $210,686 |
| bengen  | $210,686 | $210,686 |
| fixed   | $210,686 | **$249,751** |
| ninety_five_rule | $210,686 | **$215,498** |
| vpw     | $210,686 | **$281,695** |

**gk and bengen legitimately coincide on this profile** — checked, not assumed.
Their spend paths are identical to the dollar through age 82, and the later
divergence (~$11k/yr) is funded from buckets that add no taxable income while RMD
and SS dominate ordinary income. Identical tax there is arithmetic, not a
leftover bug. On a portfolio where the marginal draw hits pre-tax money they
separate.

### The two traps — verified empirically, as §35 demanded

- **Smile double-apply: REAL.** Feeding the post-smile `spending` field back
  produces $20,913 too little at age 80 (the factor squared). Feeding pre-smile
  `sp` matches pass 1 to $0 at every age. The engine feeds pre-smile.
- **Inflation double-apply: DOES NOT FIRE.** `scheduleSpendForYear` inflates only
  *beyond* its last entry — covered years come back verbatim. Since the engine
  emits one entry per plan year, no de-inflation is needed. The negative case
  (a sparse schedule, which *does* inflate) is pinned too, so the first
  assertion cannot rot into a tautology.

Reading the code alone would have got the smile right and the inflation wrong.

### Known residual — single iteration, documented not hidden

Pass 2's tax differs slightly from pass 1's, which moves the portfolio, which
moves next year's spend for the portfolio-linked strategies. Measured at **0.5%
of lifetime tax for VPW** (the most portfolio-linked) and ~0.08% for `fixed`.
The tax column is now computed against this strategy's spending; it is not
proven to be its exact fixed point. Do not describe it as exact.

A user-supplied `spSchedule` short-circuits pass 2 — the budget already overrides
the strategy in both engines, so the waterfall is taxing that exact path already.

Tests: `src/deterministicTaxPath.test.js` (15). Suite 893 → 908, 38 suites.

## 32. 📋 WHAT IS ACTUALLY OPEN — index as of 2026-07-31 (v1.2.70)

Written because the status markers had drifted: §21 still said "PAUSED, do not
continue", §22 said "NOT built", §28 said "🔴 P0", and §23 said its setting was inert —
all four were stale. Corrected in place. **This section is the entry point for open
work; §29 is the entry point for what shipped.**

Suite baseline: **821 tests, 28 suites, 0 fail.** Production build compiles.

### Tier 1 — correctness, and cheap now

| Item | Why now | Size |
|---|---|---|
| **§24 #2 LTC per person** | The asymmetric case (one spouse in memory care at ~$110k/yr while the other runs a household) is what actually bankrupts couples and STILL cannot be expressed — LTC is a household-level stress scenario only. `spouse.dob` and the survivor machinery now exist, so this is unblocked and the hard part is already built. **Highest financial impact of anything open.** | M |
| **§19 NIIT-aware bracket fill** | ENG-8 deliberately built the Step-6.5 ceiling as a `min(...)` with a named `convCapReason` so more cliffs could be appended. Constants (`NIIT_THRESHOLD_MFJ/SINGLE`, `NIIT_RATE`) already exist. Two traps recorded in §0: the binding quantity is MAGI headroom, and it must apply to the Step-5 pre-tax draw too or ENG-25's asymmetry repeats. | S |
| **ENG-25** | Step 5's `irmaaCap` omits realized gains from the MAGI base. ENG-8 fixed the identical defect on the conversion path, so the two are now asymmetric — one of them is wrong. | S |
| **§23 remainder** | `outside_cash` is a behavioural duplicate of `from_taxable`; remove with a profile migration. The ghost-setting part is already fixed. | S |

### Tier 2 — the product gap I'd argue is the real one

| Item | Why | Size |
|---|---|---|
| **Claim-age comparison** (new, from the 2026-07-31 discussion) | The app can now EVALUATE a Social Security claiming plan but cannot RECOMMEND one. There is a retirement-*date* solver and no claim-age solver, and no side-by-side view — the user changes an age and re-runs by hand, one combination at a time. For most couples the rule of thumb ("delay the higher earner") is right and this just confirms it; it earns its keep on the cases the rule gets wrong — big age gap, large pre-tax balance where SS timing collides with RMDs and conversions, short life expectancy on the higher earner. Same shape as §16/§17. | M |
| **§16 ACA-aware conversions → §17 recommendation engine** | Vincent's long-standing P1. §16 (the ACA subsidy cliff model) is the prerequisite for §17. Pre-65 retirees converting into a subsidy clawback is a real and common own-goal. | L |

### Tier 3 — consistency and hygiene (mechanical, no decisions needed)

Per the standing instruction: these fit established patterns, so they get finished in
one sweep rather than presented for approval.

- **Results-tab card chrome.** `ProgressTab` (4), `MCTab` (3), `MCBandTable` (1) still
  use inline copies of `ACard`'s chrome. The Profile is now 0. These are results
  surfaces coexisting with a separate `.sb-card` sidebar pattern, so Rule 5 should not
  be assumed to transfer unexamined — worth one design-authority look first, unlike the
  Profile sweep.
- **§18 remaining IA phases.** Money-In consolidation was the original Phase B. Landing
  hero sliders still need typed entry + `LANDING_SLIDER_LIMITS` (three have a $999B max
  with a $25K step; the dual-bound approach is already approved).
- **`ghostSettings.test.js` `NEEDS_A_TARGETED_FIXTURE`** — ~23 entries, roughly 6
  fixtures covers them. Start with `preRetireEq`/`postRetireEq`: a fault there skews
  every success rate.
- **Typography scale.** ~310 inline `fontSize` values under 12px (172 at 11, 112 at 10,
  26 at 9). A blanket bump breaks chart ticks and dense table cells — needs a deliberate
  scale (data / label / prose / caption), not find-and-replace. Deferred in §28 for this
  reason; still true.

### Tier 4 — bigger, and genuinely optional

- **§27 Marketing site / web portal** — design brief written 2026-07-28, nothing coded.
- **§12 Custom Order wizard** — user-configurable withdrawal order; scoped 2026-06-29.
- **§24 #4/#5** — pension owner + survivor percentage (pairs with §22, both fire on the
  same event); work income per person (lowest impact, nothing models wages today).
- **§20** — extract the paid report as an OSS-excluded module. The `skip-worktree`
  protection is in place; the module split is not.
- **In-app AI chat, requested 2026-07-31 (Vincent)** — a conversational help surface,
  not a canned About page: answers questions about how the app itself works ("how does
  Monte Carlo run 3,000 paths so fast?") in addition to questions about the user's own
  plan. No new hosting needed — extends the existing Gemini plumbing
  (`ai/ai-analysis.js`, the dormant `AiraAITab`, the Cloudflare Pages Function proxy
  used for billed calls). The real cost is design, not infrastructure: a multi-turn
  conversation resends history every call, so token/credit usage per session is well
  above the current one-shot analysis calls — needs a cost model before it ships, not
  after.

### Known limitations that are NOT bugs — do not "fix" these

Consolidated so they stop being re-discovered (details in §3 and §28):

- The earnings test is not modelled — no wage income exists in the engine (§30).
- Only the SPOUSE or the PRIMARY can die, one first death, user-specified age — a
  mortality draw was deliberately rejected to keep it a deterministic, explainable event.
- Average-cost basis, not per-lot; no tax-loss harvesting.
- The Analysis strategy dropdown is a PREVIEW by design. Do not convert it to
  write-through — Vincent rejected that explicitly.
- Hero dollar figures are nominal; do not add a real/nominal suffix to a hero scalar.
- The success rate varies market returns, inflation, rental reliability and healthcare
  shocks only. Spending, claim ages, retirement age and any modelled death are held at
  what the user entered. Now stated in the UI (§31).

### ⚠️ Cross-machine

`REQUIREMENTS.md` is now git-tracked (forced 2026-07-30) so it travels. Still
Drive-sync-only: the whole `aira-forecaster-agents/` folder, including
`specs/UI_DESIGN_SPEC.md` (Rules 1–5, five design rulings) and the OBBBA/survivor
sections of `TAX_REFERENCE.md`. The `.claude/.../memory/` directory does not sync at all.

## 30. ✅ Survivor benefit CLAIMING STRATEGY — FIXED in v1.2.64

**Status: shipped 2026-07-30, 803 tests green.** New `src/engine/survivorBenefit.js`;
constants in TAX_REFERENCE.md → "Survivor benefits"; tests in `spousalSS.test.js`
(§30 blocks) and two ghost-setting proofs. Both defects below are fixed and the
switching strategy is now expressible via `spouse.survivorClaimAge` +
`spouse.survivorBenefitAtClaim`.

**Defect 2 also FIXED, v1.2.65.** New `spouse.firstToDie` ("spouse" default | "primary").
Four things now follow whoever is ALIVE: the PLAN HORIZON (Vincent's call — the money must
last until the SURVIVOR reaches `endAge`, so a 10-year-younger survivor extends the
projection by 10 years and the success rate correctly DROPS; the old behaviour stopped at
the dead partner's end age and flattered every such plan), Medicare + the age-65 add-on,
the RMD clock (a surviving spouse may treat an inherited IRA as their own), and the
survivor's own FRA. Also fixed: the survivor branch GATE used `deathAge + offset`, correct
only when the spouse dies — so for a primary-dies plan the branch never ran at all and both
benefits kept being paid for `offset` more years.

**Still NOT modelled, by decision:** the earnings test — the engine models no wage income,
so there is nothing to withhold against (§24 #5). Stated in the UI.

**One thing worth knowing that the tests surfaced:** whether claiming early or at FRA
is better depends on the measure. On CUMULATIVE Social Security, delaying to survivor
FRA wins when the survivor benefit is the larger lifetime benefit. On the PORTFOLIO,
claiming early can win anyway, because money received at 62 stays invested and
compounds for thirty years. Both are legitimate answers to different questions. Do not
"fix" a test that shows early claiming helping the portfolio.

### Original entry (the gap, kept for the reasoning)

**Raised by Vincent 2026-07-30, immediately after §22 shipped.** He is right, and
this section exists so nobody reads §22 as "survivor benefits are done."

### What v1.2.63 actually models

`computeHouseholdSS` (buildRothExplorer.js), from the death year onward:

```js
return Math.round(Math.max(primaryCheck, spouseCheck));
```

That is **one** number per year — the larger of the two claimed checks, each grown
by COLA from its own claim age. It captures exactly one consequence: the household
loses the smaller check. Combined with the filing-status flip, that is the *tax*
half of the widow's penalty, which is what §22 was scoped to deliver.

**It models none of the claiming strategy.**

### Rule-by-rule status

| Real rule | Modelled? |
|---|---|
| DRCs the deceased earned pass through to the survivor benefit | ✅ **Yes** — deliberately. The code compares the grown CLAIMED checks (`ssb`, which the UI asks for as "what SSA estimates at the age they plan to claim"), not the PIAs. A higher earner who delayed to 70 leaves the larger survivor benefit. Contrast the spousal top-up directly above it, which correctly uses PIA because DRCs do **not** flow there. |
| Own benefit and survivor benefit are INDEPENDENT — deemed filing does not apply | ❌ No. There is one amount, `max(...)`. No separate survivor benefit exists in the model. |
| The switching strategy (take reduced survivor at 60, let own grow to 70 — or the reverse) | ❌ No. This is the single largest omission: it is the highest-value flexibility a survivor has, and the app cannot express it. |
| Survivor benefit claimable from **60** (50 if disabled; any age caring for a child <16) | ❌ No. `AGE_LIMITS.ss = { min: 62, max: 70 }` gates every claim-age input, and there is no survivor claim age field. |
| Sliding reduction: 71.5% at 60 → 100% at survivor FRA | ❌ No. No haircut is applied to the inherited check for an early survivor claim, so **early claiming is currently overstated**. |
| Survivor FRA ≠ retirement FRA | ❌ No. No FRA concept for survivors. |
| Survivor benefit stops growing at survivor FRA; own benefit grows to 70 | ❌ No growth mechanics at all — §21 chose to ask for the claimed amount instead of deriving it. |
| Earnings test: $1 withheld per $2 above $24,480 (2026) under FRA | ❌ No. Nothing in the app models wage income (see §24 #5). |

### Two genuine DEFECTS in what shipped, not just missing refinements

1. **Death before the deceased had claimed ⇒ survivor gets nothing from them.**
   `spouseCheck` is gated on `age >= spouseClaimOnPrimaryClock`, so if the death
   age precedes the claim age the inherited check is **$0** until the year the
   deceased *would have* claimed. The real rule: the survivor benefit derives from
   the deceased's PIA (plus DRCs actually earned) and is claimable from 60
   regardless of whether the deceased ever filed. **This understates survivor
   income for exactly the early-death case the feature was built to explore** —
   the worst possible place to be wrong. Fix independently of the strategy work.

2. **Only the SPOUSE can die.** `spouse.deathAge` flips filing status and drops SS,
   but the engines keep walking the PRIMARY's age to `endAge`. Vincent's scenario
   is the *higher earner* dying, with the spouse surviving. `max()` is symmetric so
   the SS amount happens to come out right, but everything else keyed to the
   primary — the age-65 deduction count, Medicare beneficiary count, the RMD clock,
   the plan horizon — still assumes the primary lives. A first death of the primary
   is not expressible.

### The design tension to resolve BEFORE building

§21's agreed approach is **"ask the user, don't derive it"** — explicitly no FRA
tables, no reduction schedules, no claim-age adjustment math, because that is a
category of currency risk the app chose not to carry. Implementing 71.5%→100% and
a survivor FRA table reverses that decision.

**There is a way to have the strategy WITHOUT the tables.** SSA will quote a
survivor benefit at a chosen age. So ask for the number instead of deriving it:

- `spouse.survivorBenefitAtClaim` — "the survivor benefit SSA quotes you at the age
  you would claim it"
- `spouse.survivorClaimAge` — allowed from 60, independent of the own-benefit claim age
- keep the existing own-benefit amount and claim age

Then the switching strategy falls out as arithmetic: each year, pay the own benefit
if claimed, the survivor benefit if claimed, and — because deemed filing does not
apply — allow the two claim ages to differ, taking whichever is payable. The
reduction schedule stays SSA's problem, exactly as §21 intended. The engine change
is small; the UI cost is two more fields, shown only when a first death is modelled.

**Recommended sequencing:** fix defect 1 first (it is wrong today, cheaply), then
the two-independent-claim-ages model, then a "compare survivor claiming strategies"
view. Defect 2 (which spouse dies) is a bigger structural change and pairs with
§24's per-person work.

### Do not ship a strategy recommendation without a disclaimer

This is among the highest-stakes, most nuanced claiming decisions in Social
Security, and it turns on the relative benefit sizes, two different FRAs, health and
life expectancy, and whether the survivor is still working. Model it and show the
comparison; point at SSA for the actual quoted figures and recommend a fee-only
advisor before anyone files. AiRA's existing disclaimer language covers the app, but
this surface deserves an explicit pointer of its own.

---

## 31. ✅ Two doors to the same room — FIXED in v1.2.66

**Status: shipped 2026-07-31, 821 tests green.** Both deliverables done in one pass.

**Deliverable 1 — one death model.** The stress scenario is now a VARIATION on the
authored death: it moves `spouse.deathAge` `STRESS_DEATH_SOONER_YEARS` (10) earlier and
lets the engine apply every rule it already applies — `filesJointlyAt` for the filing flip,
the survivor reduction and PIA basis, and `planEndAgeOnPrimaryClock` for the horizon. The
tab now answers *"how much worse if the timing is bad?"*. Profiles with no death modelled
keep the day-one bound, **relabelled** as a worst-case bound rather than a forecast, with
the ×0.67 fallback intact for profiles carrying no spousal data. The death age is floored
at the decedent's current age + 1 — a death already in the past is not a scenario.

**Deliverable 2 — the widow's-penalty card** (Stress Test tab, above the scenario grid).
The base plan already contains the modelled death, so the grid's "vs baseline" could never
show what the death costs. The card runs the user's own plan twice — with and without the
death — at the **same seed and path count**, which is load-bearing: with a different seed
part of the "penalty" would be RNG noise and the label would be claiming a derivation the
number never got (§28). It self-gates on a death being modelled, so it costs nothing for
the profiles that don't use the feature. A read-only pointer in the Profile death panel
points at it; the control stays a single point of control.

**Related item, also done:** the Stress tab now states what the simulation actually varies
(market returns, inflation, rental reliability, healthcare shocks) and what it holds fixed
(spending, claim ages, retirement age, any modelled death). The success rate is widely read
as *"the odds my retirement works"* and it is narrower than that.

**Tests:** `spousalSS.test.js` → `§31 stress death scenario reuses the authored model`. The
one that matters asserts the two surfaces cannot disagree about the household — same filing
rule, same horizon rule, and the authored death is no longer discarded. One fixture note:
the counterfactual test needs a financially TIGHT plan, because a comfortable one succeeds
on every path both ways and the difference, while real, is invisible in the success rate.

### Original entry (the gap, kept for the reasoning)

**Found 2026-07-30 while explaining the intended workflow to Vincent. Scheduled to
fix 2026-07-31.** Not a wrong number — a design defect that will become a wrong
number the first time someone edits one door and not the other.

### The two doors

| | Stress Test → "Spouse passes early" | Profile → death fields (v1.2.62–65) |
|---|---|---|
| When the death happens | **Day one of retirement**, always | at `spouse.deathAge`, the age you entered |
| Filing status | `single` from the first projected year | MFJ **through** the death year, Single after (IRS Pub 501) |
| Survivor SS | `max(own, spouse)`, or the legacy `× 0.67` when no spousal data | reduced per the survivor schedule, PIA basis, independent claim ages |
| Who dies | always the spouse | `spouse.firstToDie` — either partner |
| Plan horizon | unchanged | follows the survivor (extends for a younger one) |
| Persists? | no, one-off | yes, part of the base plan |

`App.jsx` ~7997. The stress scenario spreads `...p` and then sets
`spouse.enabled: false`, which makes `firstDeathOnPrimaryClock` return Infinity —
so it **neutralises** whatever the user authored in the Profile rather than
double-counting it. That is the correct outcome, but it happens by accident, not by
design, and nothing in either surface says so.

### Why it matters

- It violates this project's own **single point of control** rule
  (`specs/UI_DESIGN_SPEC.md`, Rule 3): one concept, two controls, silently
  different models behind them.
- A user who carefully models a death at 78 and then clicks the stress scenario
  gets an answer computed from a *different* death (day one) and a *different*
  survivor rule, with no indication that their setting was discarded.
- The stress version is now the LESS accurate of the two on every axis except one
  — it is harsher on filing status (single immediately) but softer on the horizon
  (no extension for a younger survivor). So it is not even reliably conservative.

### The fix (decided direction, not yet built)

**Make the stress scenario a VARIATION on the authored model, not a second model.**

- If the user has modelled a death: run *their* death, moved earlier — e.g.
  "10 years sooner than you planned" — reusing `firstToDie`, the survivor benefit
  rules, and the horizon logic. The stress tab then answers the question a user
  actually has, which is *"how much worse if the timing is bad?"*, rather than
  re-answering *"what if there were a death at all?"*.
- If the user has NOT modelled a death: keep something like today's behaviour as
  the day-one bound, but **label it as that** — it is a worst case, not a forecast.
- Either way the scenario must stop silently discarding `spouse.deathAge`.

Preserve the legacy `× 0.67` fallback for profiles with no spousal data (it is what
those profiles have always seen), and keep the existing `runStress` seed handling so
the scenario stays comparable run to run.

### Test to write with it

The one that would have caught this: for a profile WITH a modelled death, the
stress scenario's survivor year must use the same filing status, the same survivor
benefit and the same horizon rule as the base plan — i.e. the two surfaces must not
be able to disagree about the household. Same shape as the cross-engine agreement
test in `spousalSS.test.js` §22.

### Related, and worth doing in the same pass

While explaining the workflow it became clear the app never states what the success
rate actually varies. `runMC` randomises **four** things — market returns,
inflation, rental reliability and healthcare-shock incidence — and holds everything
else (spending, claim ages, death age, retirement age) fixed at what the user typed.
So the number answers *"how much market-sequence risk can this plan absorb?"*, not
*"how likely is my retirement to work?"*. That is a §28-class provenance issue: the
figure is read as a probability of success in life. One visible sentence near the
success rate would fix it.

## 28. ✅ Display-provenance audit + regression test — SHIPPED v1.2.63 (see §29)

**Status: DONE.** All 36 cards traced (one real mismatch: "Median accumulation"), registry
enforcement in `src/provenance.test.js` (undeclared card = red build), and the rules written
into `specs/UI_DESIGN_SPEC.md`. §28.1 and §28.2 below are also closed — see §29 for what
shipped. Original brief kept because it defines the defect class.

**Do this in the SAME session as §22 / §24 (Social Security), 2026-07-31.** Vincent's
instruction: not optional polish, must not be dropped to make room for the SS feature.
It is the higher-trust item of the two.

**You are picking this up cold, from a different account.** Everything needed is here.

### Why this exists

In one session Vincent found FOUR figures in the UI that were mislabelled or wired to the
wrong source. He found them by looking at his own screen and reporting them one at a time.
Each fix addressed only the instance reported; the fourth was still there after three
rounds of "fixed it."

His words: *"figures are not tied or wired together… This is an end user application where
people make decisions on their money. Me as well."* He uses this tool for his own
retirement decisions.

**The engine math was correct every time.** Every defect was display-layer. That is what
makes the class dangerous: the tests pass, the math is right, and the number still
misleads. No existing test can see it.

### The defect class

> **A label asserts a derivation, a time point, or an authority the value never got.**

| Figure | Label claimed | Value actually was |
|---|---|---|
| "$X/mo safe spend" (results bar) | a computed, certified safe amount | `params.sp / 12` — the user's typed input |
| "$X at age {endAge}" (results bar) | balance at the plan horizon | `mc.medR` — balance at the START of retirement |
| "Real $ / Nominal $" | — | correct, but unreadable to the app's own author |
| "SAFE SPENDING TARGET / GK guardrails" | GK produced this | `p.sp / 12`; GK never touched it |

### Already fixed — do NOT redo

- **v1.2.47** (shipped, `bdb1b41`): results-bar spend label; `mc.medR` → `mc.term.p50`;
  real/nominal → today's/future dollars; two About cards (after-tax; today's vs future $).
- **v1.2.50** (check `git log` — likely shipped by now): Net Worth card split into three
  self-describing branches; strategy-preview state banner + tooltip + primary commit
  button; helper prose 11px → 12px.

### NOT done — your job

**Deliverable 1 — finish the audit.** 36 metric cards exist (`className="ml"/"mv"/"ms"`).
Every card whose label names an AGE was traced and is correct — `medR` was the only bad
one of that kind. **But 18 of the 36 compute their value across multiple lines and were
never traced.** They are UNVERIFIED, not verified-clean. For each: record the label, the
exact expression, and whether it is **computed**, **echoed** (user input played back), or
**point-in-time** (record which age/year). Fix every mismatch. Report the count honestly,
including zero.

**Deliverable 2 — the regression test.** A promise to be careful is worthless; Vincent has
heard it. Model it on `src/ghostSettings.test.js`, the working precedent in this repo that
stopped ghost settings by making "we forgot to wire it up" a BUILD FAILURE and forcing
anyone claiming a field is inert to write down why. Same shape: a registry declaring every
summary figure (label, source expression, kind), and a test asserting the metric-card count
in `App.jsx` equals the registry size. **Adding a card without declaring it → red build.**
The point is not the count — it is that the author must answer "computed or echoed?" at
authoring time, which is exactly the question nobody asked when "safe spend" and "GK
guardrails" were written.

**Deliverable 3 — the rule, in `specs/UI_DESIGN_SPEC.md`.** Vincent's formulation; it
catches all four instances:

> **Any figure that has been transformed — divided, deflated, grossed up, or echoed from
> user input — must state so where it is displayed, not only in a tooltip.**

### Backlog — considered and DEFERRED, with reasons (do not "improve" these blind)

- **Strategy dropdown write-through ("Option A").** The Analysis strategy dropdown is a
  PREVIEW: it redraws the schedule without saving. Vincent explicitly **rejected** making
  it save on change, because that deletes the ability to compare strategies without
  committing the plan and forces a full Monte Carlo re-run on every change. v1.2.50 instead
  made the preview/saved split unmissable (Option B). If you revisit it, the intended
  direction is **Option C**: a real strategy setting in the Profile tab, with the Analysis
  dropdown remaining an explicit compare tool. **Do NOT convert preview→write-through.**
- **Typography pass.** Helper prose went to 12px in v1.2.50. There remain ~310 inline
  `fontSize` values under 12 (172 at 11px, 112 at 10px, 26 at 9px). A blanket bump would
  break chart ticks, dense table cells and badges. Needs a deliberate scale (define sizes
  for data / label / prose / caption) rather than a find-and-replace.

### Conventions confirmed — cite, do not re-derive

- **Spending figures are AFTER TAX.** `runMC` sizes the draw as `need + totalTax`
  (App.jsx ~1538, fixed-point loop); tax is an additional draw on top of the target, never
  netted out of it. Verified in code.
- **Hero dollar figures are nominal.** `deflate()` takes an ARRAY of band objects, not a
  scalar — do NOT apply a `real ? "Real $" : "Nominal $"` suffix to a hero scalar or you
  will label a nominal number as real whenever that toggle is on. design-authority
  recommended this; it was rejected on inspection. Do not reintroduce.
- **`p={params}` in `NetWorthTab`**, so `fixedWithdrawalRate` arrives normalized to a
  decimal (params memo ~11833: `r < 1 ? r : r / 100`). No 100× error. Do not "fix" it.
- **Only ONE line in the app writes `withdrawalStrategy`** — the commit button in
  `WithdrawalPlanCombined`. The Profile tab displays it but has no selector.

### Do not

- Do not fix only the instance you are shown. That is the failure mode that produced this.
- Do not mark the 18 untraced cards clean without tracing them.
- Do not ship the SS feature and defer this. Vincent named that explicitly.
- **Not every report is a bug.** One of the four turned out to be correct behaviour with a
  weak affordance. Verify against the code before changing anything.

### §28.1 — Gary's report (u/garylapointe), 2026-07-28 — remaining items for Friday

A pension-holding user ran the plan and reported four things. **One is fixed (v1.2.52);
three are open.** He is credited in the About → Special Thanks section (`ABOUT_THANKS` in
`src/about.js`). His framing is worth quoting because it names the defect class exactly:

> *"the total is correct, but all the numbers that make the total aren't there."*

**FIXED in v1.2.52 — pension invisible in the funding table.**
`buildWithdrawalWaterfall` line ~593 computes `fixedIncome = ss + annuity`, excluding
`otherIncomes` (where pensions live). The engine was always right — `otherIncTotal` is
netted from need at ~702 — but the Fixed Income column rendered only `fixedIncomeTotal`,
so a $44,668 pension appeared nowhere and the plan looked short by that amount. Fixed in
the DISPLAY layer only. **Do not "finish the job" by folding otherIncome into the engine's
`fixedIncome` or into `fixedIncomeTotal`**: `withdrawal.test.js:272` asserts the funding
identity as `fixedIncomeTotal + otherIncome + rmd + ...`, and `buildWithdrawalWaterfall:663`
already does `incomeOffset: fixedIncome + otherIncTotal`. Changing either double-counts.

**OPEN 1 — Profile spending input does not state the after-tax basis.**
Gary: *"the Profile page where you enter your spending is still a little vague on the
after-tax part. Looking at the success banner and doing the math makes it clear."* v1.2.47
and v1.2.50 stated the after-tax convention on the RESULTS surfaces and in the About tab,
but not at the INPUT, which is where the user forms their mental model. The spending field
in Profile must say that the figure is money to spend after tax and that the engine draws
the tax bill on top of it. Same wording as the About card so the two agree.

**OPEN 2 — one concept, two names across surfaces.**
Gary: *"When looking at the charts on the Income tab, you don't call it fixed income, you
call it SS on that chart (so that wouldn't map well unless that was renamed)."* The
withdrawal table now says **Fixed Income** and means SS + pension/other + annuity/rental.
The Income tab chart labels the same money **SS**. Pick ONE vocabulary and apply it to
every surface — table, chart series, legend, tooltips. This is the naming half of the
provenance rule: a label must mean the same thing everywhere it appears.

**OPEN 3 — the spending-smile (go-go / slow-go) control is unfindable.**
Gary: *"That could be getting padded because of the go go/slow go year stuff (but there are
a LOT of tabs with sub tabs and I'll be darned if I can find that one)."* A user who
suspects a setting is inflating his numbers could not locate it. Two problems: the control's
discoverability, and the fact that its effect is not disclosed where the affected number is
shown. If the smile is adjusting spending in a given year, the spending cell should say so.

**TO VERIFY, not yet diagnosed — Gary's Roth-draw observation.**
He states that with the pension counted, income is ~$81,400, *"which is more than enough to
cover the taxes listed there and does not need to take the Roth."* Since the engine nets
`otherIncTotal` from need, the draw is PROBABLY correct and he was reading columns that
omitted his pension — but that was never verified. **Verify before answering him.** If the
Roth draw is real, it is an engine bug and outranks everything else in §28.

### §28.2 — Hover-only disclosure is unreachable — FRIDAY, bundle with §28

**Vincent, 2026-07-28:** *"how do people know to hover over things? I wouldn't know to do that."*

He is right, and it undercuts several fixes shipped this week. Measured in `src/App.jsx`:

| | count |
|---|---|
| `title=` attributes (hover-only, invisible) | **109** |
| visible info markers before this change | **7** |

So ~94% of the app's explanation was invisible until a user happened to hover. Worse:
**`title=` does not exist on touch devices at all.** Every phone and tablet user has been
unable to reach any of it. The after-tax basis, the income composition, the bracket-cap
reasoning — all unreachable on mobile.

**Partial fix shipped (v1.2.54):** a visible ⓘ marker appended to 18 table headers that
carried a tooltip and showed no cue. This SIGNALS that an explanation exists. It does not
solve touch — hovering is still required to read it.

### The policy to adopt (add to specs/UI_DESIGN_SPEC.md, enforce via design-authority)

| Tier | Rule | Mechanism |
|---|---|---|
| **Must be visible** | Anything that changes how the number is READ — after-tax basis, today's vs future dollars, what a total contains, computed-vs-echoed | inline text, never a tooltip |
| **Visible affordance, opens on CLICK** | Supporting detail — component splits, formulas, why a guard fired | `InfoModal` (already exists, App.jsx ~3128, has a `trigger` prop) |
| **`title=` acceptable** | Genuinely optional colour | leave as-is |

The load-bearing tier is the middle one: **a visible marker that opens on click, not hover.**
That fixes discoverability AND touch in one move, and the component already exists — it is
simply barely used (7 sites vs 109).

### Friday work

1. Triage all 109 `title=` sites against the three tiers above. Expect most to be tier 2.
2. Promote every tier-1 item to inline visible text. **Priority: the Profile spending input
   (§28.1 OPEN 1) — the after-tax basis is currently stated only on results surfaces.**
3. Convert tier-2 sites to `InfoModal` triggers so they work on touch.
4. Verify on a real phone viewport, not just a narrow desktop window. The failure mode here
   is specifically touch, and it will not reproduce with a mouse.
5. Same root cause as §28: **the app knows something the screen does not say.** Do these
   together — the provenance registry answers "is this figure what its label claims?", this
   answers "can the user actually find out?"
