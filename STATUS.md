# AiRA Project Status
**Date:** 2026-05-05  
**Branch:** main

---

## Current State: READY

| Milestone | Status |
|---|---|
| Engine extraction (`buildRothExplorer` → `src/engine/`) | ✅ COMPLETE |
| Logic audit (LOGIC_AUDIT.md) | ✅ APPROVED |
| All four FAIL/FLAG items patched | ✅ COMPLETE |
| Test suite | ✅ 76 tests passing (added 10 Alex Mercer invariant tests in `roth.test.js`) |
| BUILD_SPEC.md | ✅ Updated |
| Roth Explorer — pinned row ✏ edit + × delete buttons | ✅ COMPLETE |
| Roth Explorer — delete-after-import bug | ✅ FIXED (buttons embedded per-row, not dependent on cyYear state) |
| Roth Explorer — 3-scenario table column separators | ✅ COMPLETE |
| Roth Explorer — year-by-year table column separators | ✅ COMPLETE |

---

## What Was Done

### Roth Explorer UX — Sprint 2026-05-05

**Bug fix — delete-after-import:** Pinned conversion override rows couldn't be deleted after saving/reimporting a profile because the × button was conditioned on `cyYear` matching the pin year, and `cyYear` resets to current year on load. Fixed by embedding ✏ (edit) and × (delete) buttons directly inside the Source cell of each pinned row in the convRows table — no dependency on page-level state.

**Feature — edit pinned row:** ✏ button on each pinned row calls `setCyYear(r.yr)` + `setView("thisyear")`, navigating the calculator to that year so the user can change the amount and re-save via the normal upsert flow.

**Design — column separators:** Color-banded left-border separators added to both Roth Explorer tables:
- *3-Scenario Comparison* — vertical separators between No Conversion (red), State + Convert (teal), and No-Tax State + Convert (green) groups; applied to banner headers, sub-headers, data rows, and totals row.
- *Year-by-Year Comparison* — vertical separators between Rate pair (indigo), Tax pair (red), and RMD pair (green) metric groups; headers relabeled OPT/CUR for clarity.

**Tests — engine invariants (`roth.test.js`):** New describe block "14. ALEX MERCER FULL PROFILE" adds 10 tests (76 total, all passing):
- pT and ro balance update equations verified within $2 rounding tolerance
- Year-to-year continuity: `rows[i+1].pTStart === rows[i].pT` and same for ro
- Orphaned override detection: pinned year with pT=0 produces conv=0 and is absent from convRows
- Confirmed engine correctly computes 270,217 Roth balance for the reported "bug" — value is correct given prior-year auto-fill growth

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

---

## Roadmap — Housing & Real Estate


### 2. Property sale — current guidance (no feature needed)
Aira is designed around current-state snapshots that users keep up to date. When a home is sold, the user:
1. Deletes the property from the Real Estate section
2. Calculates net proceeds (sale price − remaining mortgage − capital gains tax, applying the $250k/$500k primary residence exclusion where applicable)
3. Adds net proceeds to their taxable/cash portfolio field
4. Re-runs the simulation

Because users update their profile to reflect actual current balances, timing accuracy is preserved — there is no "future injection" problem. A dedicated `saleAge` engine feature is not needed.
