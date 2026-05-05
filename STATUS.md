# AiRA Project Status
**Date:** 2026-05-04  
**Branch:** main

---

## Current State: READY FOR VIDEO DEMO

| Milestone | Status |
|---|---|
| Engine extraction (`buildRothExplorer` → `src/engine/`) | ✅ COMPLETE |
| Logic audit (LOGIC_AUDIT.md) | ✅ APPROVED |
| All four FAIL/FLAG items patched | ✅ COMPLETE |
| Test suite | ✅ `banner.test.js` passing; other suite failures are pre-existing ESM transform issues, not regressions |
| BUILD_SPEC.md | ✅ Updated |

---

## What Was Done

### Engine Extraction
`buildRothExplorer` and `buildRothLadder` extracted from `App.jsx` into `src/engine/buildRothExplorer.js`. The file is self-contained: state brackets, federal brackets, IRMAA table, RMD tables, Guyton-Klinger, and the full explorer logic.

### Logic Fixes (patch 2026-05-04)
All five items from the LOGIC_AUDIT were applied and re-verified:

1. **`useJointRmdTable` honored** — param now destructured; `JOINT_RMD_DIV` (Table II, spouse >10 yrs younger) added and selected when flag is true. Matches `runMC` in App.jsx exactly.
2. **RMD comment corrected** — `RMD_DIV` comment no longer says "Uniform Lifetime"; accurately describes Table II approximation for Vin & Mira.
3. **rmdStartAge guard** — `Math.max(override, getRmdStartAge(...))` enforces the 75-minimum for Vin (born 1970) structurally. Override cannot go below statutory.
4. **IRMAA inflation unified** — `irmaaCost` and `irmaaCeiling` now use `params.inf` via `infR`; hardcoded 1.025 eliminated from the live calculation path.
5. **Withdrawal-order limitation documented** — 3-line comment block above `buildRothExplorer` discloses the 60/40 spending-split simplification and its impact on effective-rate figures.

### Audit Result
`LOGIC_AUDIT.md` re-audit verdict: **APPROVED** — 17 of 19 checklist items PASS; 2 standing flags (outside_cash exhaustion edge case, BETR not implemented in this engine) are acknowledged limitations, not regressions.

---

## Standing Known Limitations (non-blocking)
- Spending withdrawals use a fixed 60/40 pretax/Roth split — pre-tax draw not added to taxable income. Conversion tax *deltas* remain valid; absolute effective rates are understated.
- `outside_cash` mode: if taxable pool is exhausted mid-scenario, the remaining tax shortfall is not tracked.
- BETR metric is not computed inside `buildRothExplorer`; it is referenced in the UI but is a planned feature.
