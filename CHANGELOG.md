# Changelog

Release notes for Aira. Newest first. Kept in GitHub only; not part of the deployed site.

## 1.3.0 — Home screen: the inputs come first

- CHANGED: Plan basics is at the top of the left side, right under Configure. The five main inputs show next to your answer on a first run.
- CHANGED: The Net Worth chart is shorter (320px, was 540px), so the cards under the tabs stay on screen.
- FIXED: The info icon on the Portfolio projection chart did nothing when clicked. It opens a short explanation now.

## 1.2.150 — design pass: colors and sizes come from theme tokens, status dots, Stress Lab fixes

- CHANGED: type sizes use --fs-* tokens; about 750 hard-coded colors now use theme tokens (--chart-N, --tint-*, --text-*), so a theme change is one edit. Eight low-contrast text colors now pass 4.5:1.
- CHANGED: emoji removed from headings, buttons and sub-tabs; status marks are a small colored dot or plain words; labels are sentence case; main and nav landmarks added.
- STRESS LAB: Run is blocked and explained for out-of-range years; a severity change says it cleared the precise result; a pasted list longer than 10 years says it was cut; deltas show in pp.
- ENGINE: a $0-spend plan no longer draws the Guyton-Klinger floor every year.

## 1.2.149 — runMC audit fixes: income nets against total outlay; dead code removed

- FIXED: retirement 'need' now nets SS + rental + other income against base spend AND fixed costs together (max(0, spend+fixedCosts-income)). The old form offset income against base spend only, so a household whose income exceeded base spend still sold assets to cover housing/carveouts/events/healthcare — biasing the success rate DOWN. need / incomeSurplus / remaining-draw now net the same quantity.
- REMOVED dead code in runMC: unused gg/sg/ng growth draws and the unused initWR calibration block (GK uses gkReferenceWR, not initWR). Dropping gg/sg/ng removes 6 rand() draws/path, so headline numbers re-baseline by RNG shift (not a logic change).
- NEXT (audit backlog, not yet done): (1) per-path RNG seed so changing spend by $1 doesn't re-roll later paths / stabilize property tests [mulberry32(seed + i*0x9E3779B1)]; (2) || vs ?? zero-input bug (p.inf=0, abGrowth=0, mortRate=0 fall back to defaults); (3) cash return label-vs-math (cashRealReturn applied nominally; cash earns equity return in accumulation); (4) cost inflation uses deterministic p.inf while spend tracks path inflY; (5) consider block/stationary bootstrap vs current single-year i.i.d. sampling; (6) verify ninety_five_rule y===1 reset, mwRate single-life for couples, RMD_DIV ||15 fallback.

## 1.2.148 — Clearer first run and Forecast: facts live in Plan inputs, what-if sliders in the sidebar; plain headings; keyboard access

- Standalone Configure / Adjust values launcher; Retirement Age, Planning Horizon, US Spending and SS Start Age are edited by the sidebar sliders only
- After the quick estimate, a "We assumed" card lists what was filled in, and the app opens on the retire age the estimate showed
- Forecast tab reordered: chart first, then why and what to do, the age table, assumptions, and checkpoints; the "not covered" warning is one line with details on click
- Checkpoints panel rebuilt (labelled actions, confirm before set baseline); one dollar-basis label naming the retirement year
- Top bar grouped and de-cluttered; Options card uses one toggle and one info icon; switches and pop-ups work from the keyboard; Help opens one topic at a time

## 1.2.147 — Plan inputs consolidation: sidebar Configure button, Start over, and stale Profile pointers now link to the right Plan inputs step

- Sidebar Configure button and Start over (with confirm); countdown shows honest years/months and hides until a real date of birth exists
- Plan inputs gains the Real Estate & Debt step and an inline budget editor in Spending & Expenses; the Analysis view is read-only
- Edit accounts / Edit split open the Current Savings step; Mortgage/Housing row says why it is empty

## 1.2.146 — Life-phase Sector badge is now a clickable InfoModal (all five sectors, current phase marked "You are here"), and the sector age windows are contiguous

- SectorBadge opens the shared InfoModal explaining every sector (age window + tax-and-access regime); the active phase carries a "You are here" pill instead of a wrapping em-dash suffix
- Fixed dead age ranges: sectors now partition the whole age line with no gaps/overlaps (Escape <59½ · Gap 59½-65 · Maneuver 65-73 · Torpedo 73-80 · Legacy 80+). Previously ages 63-65 and 73+ matched no sector and mislabeled as "Sector 1: The Escape"

## 1.2.145 — Guardrails view rebuilt as tabs (Spending Path · Adjustment Events · Across All Scenarios)

- <GuardrailsView>: cross-scenario headline strip stays persistent; sub-tabs split the crowded stack. Spending Path adds the Portfolio line on a 2nd (right) axis for more info; Adjustment Events lists every cut/raise (age, from→to, why); Across All Scenarios expands mc.gkStats into stat cards. Median-path emptiness is explained, not hidden (bad sequences live in the cross-scenario tab)
- Prominent cut/raise triangles (~17x13px)

## 1.2.144 — Uniform info-modal styling + semantic accent palette (INFO_ACCENT) + modal body-text kit (ModalLede/ModalP/Em/ModalNote)

- ONE header template for EVERY info modal, in the shared InfoModal shell: an accent icon badge + the title carrying a 2.5px accent underline over a faint accent hairline. Fix all of them at the source, not per modal
- Semantic accent palette INFO_ACCENT (colors for ideas): method=teal, money=blue, tax=purple, positive=green, risk=amber. Applied to Success-rate method modal (teal), Median Final Balance (blue/money), the Tax Modeling + Non-Resident State Tax modals (purple)
- Fixed the shell's "Got it" button hex-alpha concat bug (accent+"22" produced invalid CSS for var() tokens - the v1.2.112 class of bug) → withAlpha()
- Guardrail cut/raise triangles made prominent (~17x13px, offset clear of the spend line)

## 1.2.143 — Guardrails chart surfaced on the Monte Carlo tab + info-modal cleanup

- Guardrails "Spending Path with Guardrail Adjustments" chart (+ cross-scenario strip) is now discoverable on the Monte Carlo tab, not buried 4 levels deep in Scenarios → Withdrawal Plan. Extracted DeepSeek's chart verbatim into one shared <GuardrailsSpendingPath> rendered by BOTH tabs (rule 8 - one source, no drift); gated via isGuardrailStrategy()
- Fixed a dead MEDIAN FINAL BALANCE ⓘ (was a title=-only span, dead on touch) → real click InfoModal
- Moved the MC-tab "Not financial advice" banner from mid-page (between inputs and the fan chart) to the true bottom, after the chart + band table
- Rich "How this simulation works" modal on the Success Rate ⓘ
- The Success Rate card's "ⓘ How this works" link opens a Chance-of-Success method modal: what it is, the 4-phase method, why probability beats a single projection, a "what the simulation draws from" pool-stats box (real 1928-2025 Damodaran arrays), and the data source
- Describes AiRA's ACTUAL engine: a bootstrap Monte Carlo that draws random years WITH REPLACEMENT, order reshuffled - NOT a sequential historical replay (the past won't repeat in order). Removed the competitor-style filter-by-year table that implied a replay method we don't use
- design-authority verdict (2026-09-24): deleted the duplicate inline "View method & data" card (opened the same modal as the ⓘ - single point of control); kept "Simulation inputs & assumptions" inline as the per-run audit trail (Rule 5)

## 1.2.141 — Guyton-Klinger guardrails Spending Path with Adjustment Events

- New "Spending Path with Guardrail Adjustments" chart on the Withdrawal Plan tab: floor/ceiling bands, prior-vs-actual spend, and a per-year cut/raise marker for every year the guardrail rule fired (deflated to retirement-year dollars). Every series is an engine output on the schedule row (spEntering / spAfterGK / gkFloor / gkCeiling / gkEvent) - the UI applies no guardrail arithmetic of its own (Rule 8)
- runMC now returns mc.gkStats (cutRate / raiseRate / avgCutsPerPath / spend range) counted per path, for the cross-scenario summary
- Added an agent attribution + tamper-evidence registry (agent-marks.json + src/agentMarks.js + scripts/agent-marks.mjs), enforced by src/agentMarks.test.js, so an edit to another agent's region fails the build instead of sliding in
- Added a render smoke test for the guardrails chart (guardrailsChartRender.test.js) - the RothLadder-class gap that engine tests can't catch
