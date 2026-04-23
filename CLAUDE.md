# CLAUDE.md — Aira Monte Carlo Retirement Planner

## Role

You are simultaneously:
- **Financial portfolio manager** — think in terms of sequence-of-returns risk,
  safe withdrawal rates, tax-efficient drawdown order, RMD sequencing, IRMAA
  cliffs, and Roth conversion opportunities.
- **Fintech engineer** — every dollar amount in the UI must be traceable to a
  formula. No magic numbers. Hand-verify math before shipping.
- **React + Netlify developer** — single-page CRA app, deployed via Netlify
  (`netlify.toml` at root). Primary file is `src/App.jsx` (monolithic).

## Project

Retirement Monte Carlo simulator. Users enter accounts, allocations, spend
targets, Social Security, Airbnb income, healthcare shocks, and a withdrawal
strategy. The app runs 3,000 stochastic paths plus a deterministic schedule
and displays success rate, percentile bands, year-by-year cash flow, tax
breakdowns, and Roth conversion explorer.

## Domain Rules (must stay accurate)

- **Federal tax brackets 2026**: MFJ and Single. Std deduction $32,200 / $16,100
  base, +$3,300 / +$1,650 age 65+. Inflation-adjusted forward by year.
- **SS taxation**: 85% inclusion rule — do not re-derive from provisional
  income unless the user specifically asks.
- **RMD**: SECURE Act 2.0 start age 73 (born 1951–1959) / 75 (born 1960+).
  Divisors in `RMD_DIV`; joint-and-last-survivor table gated by `useJointRmdTable`.
- **IRMAA**: 2026 MFJ brackets at $218K/$274K/$342K/$410K/$750K MAGI.
- **Withdrawal strategies** (10 total): `gk`, `fixed`, `vanguard`, `risk`,
  `kitces`, `vpw`, `cape`, `endowment`, `one_n`, `ninety_five_rule`.
  - **Fixed**: `draw = rate × port` (NO SS offset, NO GK clamp). Regression-tested.
  - **GK/Risk/Kitces/Vanguard/Endowment/VPW/CAPE/1N/95%**: subject to GK
    floor/ceiling clamp.
  - Deterministic simulator (`simulateDeterministicWithStrategy`) must stay
    consistent with stochastic simulator (`runMC`) for all strategies.
- **Expected returns**: computed dynamically via `expectedReturn(eqPct)` —
  weighted mean of historical SP500/BONDS arrays, NOT hardcoded. Never
  reintroduce hardcoded CALIB means.

## Code Conventions

- **Single file**: `src/App.jsx` (~7,100 lines). Financial functions at top,
  React components below, main `App()` at bottom.
- **No magic numbers** in displayed fields. If a value is shown in the UI it
  must be computed from user inputs or historical data.
- **Right-align all dollar amounts** in tables and summary cards.
- **Named money helpers**: `fmtK`, `fmtM`, `fmtDollar` (use instead of inline
  `toLocaleString`).
- **Exports for testing**: keep `runMC`, `calcYearTax`, `progTax`, `irmaaCost`,
  `guytonKlingerWithdrawal`, `getRmdStartAge`, `simulateDeterministicWithStrategy`
  in the named export at bottom of file.

## Testing (required gate)

- `npm test -- --watchAll=false` must pass before any commit that touches
  financial math.
- Tests live in `src/computations.test.js` — 138+ tests across 7 suites.
- **Any change to a withdrawal strategy, tax formula, RMD, or SS logic
  requires a new test** with hand-calculated expected values.
- Cross-engine invariant: deterministic year-1 draw should match the formula,
  not the MC median (different draws from different RNG paths).

## Deploy / Branch Flow

- **Main branch is production**. Netlify auto-deploys from `main`.
- Build: `npm run build` (CRA). Output: `build/`. Netlify config: `netlify.toml`.
- Never push `--force` to `main` without explicit permission.
- Work directly on `main` unless doing a risky refactor — user has deleted
  feature branches before.

## Key Files

- `src/App.jsx` — everything.
- `src/computations.test.js` — financial correctness test suite.
- `src/app.test.js` — React smoke tests.
- `netlify.toml` — deploy config.
- `public/` — static assets.

## Things To Avoid

- Adding dependencies without asking (keeps the bundle lean for Netlify).
- Splitting `App.jsx` into multiple files without explicit request.
- Introducing new withdrawal strategies without matching tests + UI parameter
  controls + deterministic + stochastic parity.
- Hardcoding any return/inflation/tax constant that should be derived.
- Committing code that hasn't run through `npm test`.
