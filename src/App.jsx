/*
 *AiRA Freedom Financial
Copyright (C) 2026 

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

---------------------------------------------------------------------
ADDITIONAL TERMS (Dual Licensing):
If the terms of the AGPL v3 are incompatible with your use of the software, 
alternative commercial licensing terms are available. 
Please contact us in the feedback section of the app for proprietary licensing options 
including distribution rights and royalty arrangements.
---------------------------------------------------------------------

/*Disclaimer and Terms of Use
Last Updated: April 11, 2026

1. Not Financial Advice
The Aira Freedom Financial application (the "App") is provided as a financial modeling and educational tool for informational purposes only. 
It does not constitute professional financial, investment, tax, or legal advice.  The developers of this app  are not acting as your financial advisor, fiduciary, or broker through the provision of this App.

All simulations, including Monte Carlo analyses and withdrawal strategies, are based on historical data and mathematical projections. 
Past performance is not indicative of future results. Financial markets are inherently volatile, and there is no guarantee that the assumptions used in the App will materialize.

2. "Use at Your Own Risk" & Accuracy
While the logic and methodologies used in this tool are utilized by the developer 
for personal planning, they are provided "as is" and "as available." 
We make no warranties, express or implied, regarding the accuracy, completeness, or reliability of the calculations. 
Financial planning involves complex variables that may not be fully captured by this software. 
You are solely responsible for verifying any output from the App with a qualified professional before making any financial decisions.

3. Limitation of Liability and Indemnification
By using this App, you agree to assume full responsibility for any financial decisions or "critical errors" made based on its output.

To the maximum extent permitted by law, you agree to indemnify, defend, and 
hold harmless the developers of this app, and any affiliates 
from and against any and all claims, losses, damages, liabilities, and expenses (including legal fees) arising from:

Your use or misuse of the App.

Any errors, omissions, or inaccuracies in the data or results generated.

Any financial loss, loss of profit, or "sequence of returns" failures resulting from reliance on the App.

4. User Responsibility
You acknowledge that financial planning is highly individualized. 
The "spending smiles," guardrails, or projections provided by Aira may not be suitable for your specific financial situation, risk tolerance, or time horizon.  Use at  your own risk and always
consult your fiduciary, CPA or tax accountant. 

 * ============================================================ */
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import ReactDOM from "react-dom";
import { ABOUT_ME, ABOUT_THANKS, ABOUT_PRODUCT, ABOUT_FEATURES } from "./about.js";
import {
  taxableSocialSecurity,
  computeHouseholdSS,
  LTCG_BRACKETS_2026_MFJ, LTCG_BRACKETS_2026_SINGLE,
  NIIT_THRESHOLD_MFJ, NIIT_THRESHOLD_SINGLE, NIIT_RATE,
  getSeniorBonusDeduction, OBBBA_SENIOR_LAST_YEAR,
} from "./engine/buildRothExplorer.js";
import { buildWithdrawalWaterfall, accumulateToRetirement, resolveDrawOrder, effectiveRetireAge, gkReferenceWR } from "./engine/buildWithdrawalWaterfall.js";
import { expectedReturn, SP500, BONDS, INFL } from "./engine/expectedReturn.js";
import { resolveGlidepathSwitchAge, glidepathEquityWeight, glidepathEqPct } from "./engine/glidepath.js";
import { jobContributionsForYear, householdAnnualContribution, totalRetirementIncome } from "./engine/contributions.js";
import { explainScore } from "./engine/explainScore.js";
import { buildConversionPlan, buildConversionLadder, buildWaterfallComparison } from "./engine/rothConversionPlan.js";
import { mortgageSchedule, mortgageAnnualPayments, computeOtherIncome, computeCashFlowEvents, spendingSmileFactor, healthcareShockDraw, expectedHealthcareShock } from "./engine/expenses.js";
import { scheduleSpendForYear, parseExpenseCsv, resolveSpendGuardrails, SINGLE_YEAR_TEMPLATE, MULTI_YEAR_TEMPLATE } from "./engine/expenseImport.js";
import { evaluateRules as evaluateRulesEngine } from "./engine/rulesEngine.js";
import { earlyWithdrawalPenalty, detectEmployerPlan, ruleOf55SeparationQualifies, EARLY_PENALTY_AGE } from "./engine/earlyWithdrawal.js";
import { isYearEndWindow, daysLeftInTaxYear, yearEndTaxRoom } from "./engine/yearEnd.js";
import { ageFromDob, parseCalendarDate, personAgeNow, spouseAgeOffset, spouseAgeAt, personsAtLeastAge, filesJointlyAt, filingStatusAt, spouseDeathOnPrimaryClock, planEndAgeOnPrimaryClock, survivorAgeOnPrimaryClock, survivorIsPrimary, firstToDie, contribStopOnPrimaryClock } from "./engine/ages.js";
import { survivorFra, survivorReductionFactor, survivorBasis, resolveSurvivorClaimAge } from "./engine/survivorBenefit.js";
import { STRATEGY_LABELS, resolveStrategy, migrateWithdrawalStrategy, migrationNotice } from "./engine/withdrawalStrategies.js";
// One declaration of every figure's arithmetic, rendered here and enforced by
// provenance.test.js. Never inline a formula string — it would drift from the test.
import { formulaFor } from "./provenance.js";
import { solveRetirementDate, GEMINI_MODELS, DEFAULT_GEMINI_MODEL, AiUsageBadge, BILLING_ENABLED /*, AiraAITab — hidden pending test */ } from "./ai/ai-analysis.js";
import { CreditBalanceBadge, CreditPackModal, RecoveryLinkModal, RestoreAccessModal, useStripeReturn, useRestoreReturn, useCreditBalance, useReportUnlocked, useReportCapability , getStoredJWT, MIN_CREDITS_TO_RUN, LOW_BALANCE_WARN_AT, getStoredRecoveryLink } from "./billing/credits.js";
import { AdminPanel, useOwnerVerified } from "./billing/admin-panel.js";
import PrintReport from "./report/PrintReport.jsx";

import { ComposedChart,Area,BarChart,Bar,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,ReferenceLine,ReferenceDot,Legend,RadarChart,PolarGrid,PolarAngleAxis,PolarRadiusAxis,Radar,} from "recharts";

// §37 Phase A (v1.2.106) — DM Sans / DM Mono removed. The app now uses one
// text family (Inter) and one mono family (JetBrains Mono), both imported
// through the same @import in the CSS constant below. Prior state had two
// text families and two mono families loaded from two @font-face requests
// for the same typographic role (body text and numeric readout), which is a
// single-point-of-control violation at the font layer. Landing hero classes
// `.lp-age` and `.lp-val` were the only in-tree consumers of DM Mono; both
// switch to JetBrains Mono in the CSS below.

/** This application is  Aira - Freedom Financial Forecaster
 * Here is some reference information: 
 * IRS Publication 590‑B (PDF) – see Appendix B (pages 46‑60)  https://www.irs.gov/pub/irs-pdf/p590b.pdf
 * Capital Group's joint life table – excerpt for ages 55‑80 https://www.capitalgroup.com/individual/service-and-support/rmd/how-to-calculate/irs-joint-life-table.html

🔢 Please see the disclaimer below. This is an app to help you with retirement planning but not financial advice.
 * 
 */


/**
 * Age from a date of birth, by calendar birthday. `asOf` defaults to today, so
 * `ageFromDob(dob)` is "age now" and `ageFromDob(dob, someDate)` is "age on that
 * date". Returns null for a missing/unparseable input so callers choose their
 * own fallback.
 *
 * SINGLE SOURCE OF TRUTH — do not inline this again. There were FOUR separate
 * implementations. Two divided elapsed milliseconds by 365.25 days, which
 * disagrees with the calendar answer by a full year for anyone near their
 * birthday, so the engine and the Profile panel could report different ages for
 * the same person. The other two hand-rolled the birthday adjustment for
 * checkpoint dates, one of them comparing "month-day" as STRINGS
 * ("9-5" < "10-1" is true lexically but false as a date).
 *
 * Worse, several views read the STORED `currentAge` field rather than deriving
 * from `dob`, so editing a birthday updated the simulation while the portfolio
 * fan chart and MC band table kept rendering the old age — including the band
 * table's calendar-year column, which was silently shifted by the difference.
 *
 * `dob` is the input of record. Always derive from it. Treat stored
 * `currentAge` purely as a fallback for imported profiles that have no dob.
 */
/* Implementation moved to src/engine/ages.js — the engines need it too and they
 * cannot import from App.jsx (that would be a cycle). Re-exported at the bottom
 * of this file, so every existing caller and ageDerivation.test.js are
 * unaffected. Do NOT reintroduce a local copy: age was once computed four
 * different ways here and two of them were wrong. */

/**
 * Parse a date that represents a CALENDAR day (a birthday, a checkpoint date) —
 * not an instant in time.
 *
 * `new Date("1970-07-27")` is specified to parse as UTC midnight, but every
 * getFullYear/getMonth/getDate call reads it back in LOCAL time. West of UTC
 * that lands on the previous day: for a US user the birthday above becomes
 * July 26th, and a dob of "1970-01-01" becomes 1969-12-31 — shifting the derived
 * age by a full year for the whole year. Date-only strings are therefore split
 * and rebuilt with the local-time constructor. Values that already carry a time
 * (or are Date objects) are passed through untouched.
 *
 * Implementation now lives in src/engine/ages.js — same reason as ageFromDob.
 */

/**
 * Age input bounds — ONE definition, used by every age control.
 *
 * These were hardcoded separately in three places and disagreed: the sidebar
 * retire-age slider allowed 50–68 while the wizard's input for the SAME value
 * allowed 50–100, so typing 70 in the Profile and then touching the slider
 * silently snapped it back to 68 — meaning you could not model delaying
 * retirement to 70, the most common Social Security optimization. The landing
 * hero separately capped current age at 62, locking out anyone already retired.
 *
 * Ranges cover real users at both ends: FIRE at 45, delayed SS at 70+, and
 * people who are already retired and want to know how it's going.
 */
const AGE_LIMITS = {
  current: { min: 25, max: 85 },   // was 30–62 on the landing hero
  // 35, not 45. The floor was never protecting anyone: every engine here is
  // age-parameterised, §72(t)/SEPP and the Rule-of-55 exemptions are modelled,
  // and the Monte Carlo genuinely bootstraps the full horizon — so a 50-year
  // retirement is simulated honestly. What the floor actually did was refuse to
  // answer, and push FIRE users to fake their birth date instead. That is
  // strictly worse: birth year drives RMD start, Medicare/IRMAA, SS claiming and
  // the early-withdrawal penalty simultaneously, so a fictional DOB corrupts four
  // correct calculations to work around one arbitrary bound.
  //
  // What a long horizon DOES break is disclosed, not hidden — see the
  // long-horizon notice in MCTab (ACA/pre-65 healthcare is unmodelled, and the
  // Blanchett smile is extrapolated well past the data it was fitted on).
  retire:  { min: 35, max: 80 },   // was 45; earlier still: 50–68 (slider) vs 50–100 (wizard)
  end:     { min: 60, max: 105 },
  // Social Security claiming window is statutory, not a UI preference: 62 is the
  // earliest possible claim and 70 is the last age that earns delayed retirement
  // credits (8%/yr past FRA — waiting past 70 gains nothing). Listed here rather
  // than inline so the sidebar slider and the wizard input cannot drift apart the
  // way the retire-age controls did; a cap below 70 would hide the single
  // highest-value decision this app exists to model.
  ss:      { min: 62, max: 70 },
};

/**
 * Where feedback goes.
 *
 * Replaced an EmailJS integration that broke twice in one week for the same
 * structural reason: its three REACT_APP_EMAILJS_* keys are inlined by CRA at
 * BUILD time, and `.env*` is gitignored, so the values existed on exactly one
 * machine. A fresh clone and production both shipped `undefined` and the button
 * failed — once telling the user to open a browser console.
 *
 * A mailto has no keys, no build-time configuration, no npm dependency and no
 * public key sitting in the bundle for anyone to spam through. It cannot break
 * on a new machine because there is nothing to configure. The tradeoff is real
 * and accepted: mailto depends on the visitor having a mail client, so the
 * address is also shown as selectable text in the dialog for anyone on webmail.
 */
const FEEDBACK_EMAIL = "tiredtoretire@gmail.com";

const APP_VERSION = "1.2.116";
export const BUILD_TAG = "[main] v1.2.116 - PRINT REPORT PRINTED A BLANK PAGE (user-reported, reproduced in production). The paywall was not the cause; the report renders fine on screen. The bug was the @media print block in src/report/PrintReport.jsx, which hides the rest of the SPA with body-star display:none and then re-shows the report with display:revert on .aira-print-overlay / .pr-report-wrap / .print-report. But body-star matches EVERY descendant of body, and that includes #root - the overlay is a SIBLING of .app inside #root, because App.jsx returns a fragment. display:none on an ancestor removes the whole subtree from layout, and display:revert on a descendant CANNOT bring it back, so the rule hid the very report it was written to reveal - every browser, every time. The in-code comment claimed it restored \"this overlay's own known ancestor chain\" but never listed a single ancestor. FIX: restore that chain explicitly, ABOVE the overlay rule - #root plus :has(.aira-print-overlay) so a future provider wrapper at any depth cannot re-break it, #root being the fallback where :has() is unsupported. VERIFIED IN REAL CHROME, not by reading: the same DOM chain printed headless is 1 empty page / 1,047 bytes before and 2 pages / 56,123 bytes after, with a 2,400px app body still correctly excluded. ALSO FIXED: BUILD_TIME was referenced in the startup console.log but its declaration was gone as of 11d900f, an undeclared identifier at module scope - restored below.";
export const BUILD_TIME = "2026-08-30T00:00:00Z";
if (typeof window !== "undefined" && !window.__AIRA_BUILD_LOGGED__) {
  window.__AIRA_BUILD_LOGGED__ = true;
  // eslint-disable-next-line no-console
  console.log(`[AiRA] build ${BUILD_TAG} · ${BUILD_TIME} · v${APP_VERSION}`);
}

/* ════ SIMULATION + GUARDRAIL CONSTANTS ════
 * Single source of truth. UI prose interpolates these — never retype the
 * digits. Changing a value here changes the engine AND every label at once. */
export const MC_PATHS = 3000;            // Monte Carlo stochastic paths
export const STRESS_PATHS = 2000;        // 2000–2012 sequence-risk stress paths
export const MC_PATHS_LABEL = MC_PATHS.toLocaleString();      // "3,000"
export const STRESS_PATHS_LABEL = STRESS_PATHS.toLocaleString(); // "2,000"
// Monte Carlo score bands. rateColor() and riskLabel() both switched on these
// four numbers as inline literals, and the explainer sentence carried a fifth,
// unrelated one — five copies of "what counts as a good score" in JSX strings
// is how they drift apart. Values unchanged; only the ownership moved.
export const MC_BAND_LOW_RISK  = 0.90;
export const MC_BAND_MODERATE  = 0.80;
export const MC_BAND_ELEVATED  = 0.70;
export const MC_BAND_HIGH      = 0.60;
// Deliberately NOT a band edge: the "generally considered a solid plan"
// rule-of-thumb from the planning literature, not this app's severity cutoff.
export const MC_SOLID_PLAN_RATE = 0.85;
// Guyton-Klinger guardrails, as % of core spend
export const GK_FLOOR_DEFAULT_PCT = 65;
export const GK_CEILING_DEFAULT_PCT = 135;
// Dollar fallbacks used only when a profile predates the % fields
export const GK_FLOOR_FALLBACK = 48_000;
export const GK_CEILING_FALLBACK = 115_000;
// "Today" as a calendar year, for age→year conversion and inflation-factor
// indexing (e.g. Math.pow(1+rate, yr - CURRENT_YEAR)). Matches the exact
// pattern buildWithdrawalWaterfall.js's BASE_YEAR / buildRothExplorer.js's
// ROTH_BASE_YEAR already use — computed dynamically so it never goes stale,
// unlike a hardcoded literal year. Do NOT use this for the FED_BRACKETS_2026_*
// / IRMAA_2026 table names or their literal dollar data — those represent the
// real IRS 2026 bracket figures and must stay pinned to 2026.
const CURRENT_YEAR = new Date().getFullYear();

// ── Theme system (§37 Phase A + B, v1.2.106) ────────────────────────────────
// Runtime accessor for chart series colors. Recharts wants literal color
// strings on props (`stroke="var(--accent)"`), so a chart that hardcodes those
// literals ignores the CSS token system entirely. `CHART_PALETTE.accent`
// reads the current value of `--accent` from the document root at call time,
// so once Phase D swaps `stroke="var(--accent)"` → `stroke={CHART_PALETTE.accent}`
// the chart follows the theme. Reading `getComputedStyle` on every render is
// cheap (native, cached by the browser). Guarded for SSR / test.
export const CHART_PALETTE = {
  get accent()       { return readCssVar('--accent'); },
  get teal()         { return readCssVar('--accent-teal'); },
  get purple()       { return readCssVar('--accent-purple'); },
  get ai()           { return readCssVar('--accent-ai'); },
  get gold()         { return readCssVar('--accent-gold'); },
  get positive()     { return readCssVar('--positive'); },
  get negative()     { return readCssVar('--negative'); },
  get textPrimary()  { return readCssVar('--text-primary'); },
  get textSecondary(){ return readCssVar('--text-secondary'); },
  get textMuted()    { return readCssVar('--text-muted'); },
  get gridLine()     { return readCssVar('--divider'); },
};
function readCssVar(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Theme persistence. `aira_theme` is a DISPLAY preference — it lives in
// localStorage ONLY, NEVER in `profile.json`, NEVER in `params`, NEVER
// consumed by any engine function. Hard constraint per §37.6 #1 of the
// design-authority verdict: the theme must not touch the financial
// computation path in any way.
export const THEME_STORAGE_KEY = 'aira_theme';
export function resolveInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { /* localStorage blocked (private window / etc.) — fall through */ }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}
export function applyTheme(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
}

// SP500 / BONDS moved to engine/expectedReturn.js (v1.2.104) — single source
// of truth for the historical bootstrap. Both arrays are now Damodaran's
// year-aligned 1928-2025 series (98 pairs), so portReturn() can draw ONE
// shared random index and preserve the empirical stock/bond correlation,
// including flight-to-quality in crashes (2008 SP -36.55% pairs with Bond
// +20.10%). The prior arrays had a length mismatch (99 vs 51) and were
// duplicated across files — see engine/expectedReturn.js header.
// SP500 and BONDS are imported at the top of this file alongside expectedReturn().

// INFL now imported from engine/expectedReturn.js — extended to 1928-2025 (98
// entries, aligned to SP500/BONDS), and no longer winsorized. The prior clamp
// `Math.max(0.5, Math.min(7.0, r))` was censoring both real deflations
// (1932: -9.9%) and real inflation spikes (1974: 11%, 1980: 13.5%, 2022: 8%).
// See file header for source. Winsorization removed for the same accuracy
// reasons documented on the stock/bond arrays.

// GK paper: cap CPI pass-through in Guyton-Klinger withdrawal adjustments at 6%.
// Distinct from the INFL data clamp above (which bounds the historical CPI bootstrap).
const GK_INFLATION_CAP = 0.06;

const SEQ_2000_2012 = [
  -0.091, -0.119, -0.221, 0.287, 0.109, 0.048, 0.158, 0.055, -0.37, 0.265,
  0.151, 0.021, 0.16,
];

// expectedReturn() (expected-VALUE helper, used by computeInitialWR/the
// deterministic schedule/Fan Chart) now lives in ./engine/expectedReturn.js so
// buildWithdrawalWaterfall.js/buildRothExplorer.js/rothConversionPlan.js can
// import the exact same formula instead of hardcoding a flat 7%. SP500/BONDS
// above are kept here (unchanged) because they still feed the STOCHASTIC
// bootstrap draws in portReturn/bootstrapDraw below, a different consumer.

/**
 * Initial withdrawal rate diagnostic.
 * Projects portfolio to retirement using REAL return (so result stays in today's dollars).
 * initDrawEst is the NET PORTFOLIO NEED at retirement — gross spend minus SS/
 * rental/other income, plus housing/carveouts — the same quantity the GK
 * engines (runMC/simulateDeterministicWithStrategy/buildWithdrawalWaterfall)
 * calibrate their own initWR against, so this sidebar diagnostic matches what
 * the engines actually use. Housing/carveout/otherIncome terms are evaluated
 * at the retirement calendar year but left un-inflated (today's-dollars mortgage
 * map value / raw carveout annual amounts), consistent with the rest of this
 * helper's today's-dollars framing.
 * Returns { initWRpct, projectedPort, initDrawEst, baseSpend, ssAtRetire, rentalAtRetire,
 * annualAdds, accumRate, nominalRate, inflRate, yrsToRetire } so callers can show the math.
 * Accepts either a profile shape (values from RetirementPanel) or the assembled params shape.
 */
function computeInitialWR(p) {
  const currentAge = p.currentAge || 35;
  const retireAge = p.retireAge || 65;
  const yrsToRetire = Math.max(0, retireAge - currentAge);
  const eqPct = p.preRetireEq ?? 91;
  const nominalRate = expectedReturn(eqPct) / 100;
  const inflRate = (p.inf || 2.5) / 100;
  const accumRate = nominalRate - inflRate;
  const hsaAnnual = p.hsaContrib != null ? p.hsaContrib : (p.hsaMonthly || 0) * 12;
  const annualAdds = (p.contrib || 0) + (p.employerContrib || 0) + hsaAnnual
    + (p.taxableContrib || 0) + (p.rothContrib || 0);
  const growth = (yrs) => Math.pow(1 + accumRate, yrs);
  const projectedPort = (p.port || 0) * growth(yrsToRetire) +
    (yrsToRetire > 0 && accumRate > 0
      ? annualAdds * (growth(yrsToRetire) - 1) / accumRate
      : annualAdds * yrsToRetire);
  // p.sp must be the total combined household spending (US + out-of-country).
  // The params useMemo already sums these; raw-profile callers must sum before calling.
  const baseSpend = p.sp || 0;
  const ssAtRetire = computeHouseholdSS(p, retireAge);
  const rentalAtRetire = (p.ab > 0 ? p.ab : 0) + (p.propIncome || 0);
  const retireCalYear = CURRENT_YEAR + (retireAge - currentAge);
  const { total: otherIncAtRetire } = computeOtherIncome(p.otherIncomes, retireCalYear);
  const housingType = p.housingType || "own";
  let housingAtRetire = 0;
  if (housingType === "own" && p.mortBalance > 0) {
    const ms = mortgageSchedule(p.mortBalance, p.mortRate || 6.5, p.mortStart || "2020-01", p.mortTerm || 30, p.mortExtra || 0);
    housingAtRetire = mortgageAnnualPayments(ms).get(retireCalYear) || 0;
  } else if (housingType === "rent") {
    housingAtRetire = p.annualRent || 0;
  }
  const carveoutAtRetire = (p.carveouts || []).reduce((sum, c) => {
    return sum + (retireCalYear <= (c.endYear || 9999) ? (c.annual || 0) : 0);
  }, 0);
  const initDrawEst = Math.max(0, baseSpend - ssAtRetire - rentalAtRetire - otherIncAtRetire) + housingAtRetire + carveoutAtRetire;
  const initWRpct = projectedPort > 0 ? (initDrawEst / projectedPort) * 100 : 0;
  return { initWRpct, projectedPort, initDrawEst, baseSpend, ssAtRetire, rentalAtRetire,
    annualAdds, accumRate, nominalRate, inflRate, yrsToRetire };
}

const JOINT_RMD_TABLE = {
  // Joint & Last Survivor — assumes spouse is 10 years younger (IRS Pub 590-B Table II excerpt)
  73: 25.3, 74: 24.6, 75: 24.0, 76: 23.4, 77: 22.8,
  78: 22.3, 79: 21.8, 80: 21.3, 81: 20.9, 82: 20.5,
  83: 20.1, 84: 19.7, 85: 19.3, 86: 19.0, 87: 18.7,
  88: 18.4, 89: 18.1, 90: 17.8,
};

// Progressive state income tax brackets (2025). null = no state income tax.
// Brackets are inflation-indexed in calcYearTax / buildRothExplorer via idxB().
const STATE_BRACKETS = {
  AL: { single: [{lo:0,hi:500,rate:.02},{lo:500,hi:3000,rate:.04},{lo:3000,hi:Infinity,rate:.05}],
         mfj:   [{lo:0,hi:1000,rate:.02},{lo:1000,hi:6000,rate:.04},{lo:6000,hi:Infinity,rate:.05}] },
  AK: null,
  AZ: { single: [{lo:0,hi:Infinity,rate:.025}], mfj: [{lo:0,hi:Infinity,rate:.025}] },
  AR: { single: [{lo:0,hi:4500,rate:.02},{lo:4500,hi:Infinity,rate:.039}],
         mfj:   [{lo:0,hi:4500,rate:.02},{lo:4500,hi:Infinity,rate:.039}] },
  CA: {
    single: [{lo:0,hi:10756,rate:.01},{lo:10756,hi:25499,rate:.02},{lo:25499,hi:40245,rate:.04},{lo:40245,hi:55866,rate:.06},{lo:55866,hi:70606,rate:.08},{lo:70606,hi:360659,rate:.093},{lo:360659,hi:432787,rate:.103},{lo:432787,hi:721314,rate:.113},{lo:721314,hi:1000000,rate:.123},{lo:1000000,hi:Infinity,rate:.133}],
    mfj:    [{lo:0,hi:21512,rate:.01},{lo:21512,hi:50998,rate:.02},{lo:50998,hi:80490,rate:.04},{lo:80490,hi:111732,rate:.06},{lo:111732,hi:141732,rate:.08},{lo:141732,hi:721318,rate:.093},{lo:721318,hi:865574,rate:.103},{lo:865574,hi:1000000,rate:.113},{lo:1000000,hi:1442628,rate:.123},{lo:1442628,hi:Infinity,rate:.133}],
  },
  CO: { single: [{lo:0,hi:Infinity,rate:.044}], mfj: [{lo:0,hi:Infinity,rate:.044}] },
  CT: {
    single: [{lo:0,hi:10000,rate:.02},{lo:10000,hi:50000,rate:.045},{lo:50000,hi:100000,rate:.055},{lo:100000,hi:200000,rate:.06},{lo:200000,hi:250000,rate:.065},{lo:250000,hi:500000,rate:.069},{lo:500000,hi:Infinity,rate:.0699}],
    mfj:    [{lo:0,hi:20000,rate:.02},{lo:20000,hi:100000,rate:.045},{lo:100000,hi:200000,rate:.055},{lo:200000,hi:400000,rate:.06},{lo:400000,hi:500000,rate:.065},{lo:500000,hi:1000000,rate:.069},{lo:1000000,hi:Infinity,rate:.0699}],
  },
  DE: { single: [{lo:0,hi:2000,rate:0},{lo:2000,hi:5000,rate:.022},{lo:5000,hi:10000,rate:.039},{lo:10000,hi:20000,rate:.048},{lo:20000,hi:25000,rate:.052},{lo:25000,hi:60000,rate:.0555},{lo:60000,hi:Infinity,rate:.066}],
         mfj:   [{lo:0,hi:2000,rate:0},{lo:2000,hi:5000,rate:.022},{lo:5000,hi:10000,rate:.039},{lo:10000,hi:20000,rate:.048},{lo:20000,hi:25000,rate:.052},{lo:25000,hi:60000,rate:.0555},{lo:60000,hi:Infinity,rate:.066}] },
  FL: null,
  GA: { single: [{lo:0,hi:Infinity,rate:.0539}], mfj: [{lo:0,hi:Infinity,rate:.0539}] },
  HI: {
    single: [{lo:0,hi:9600,rate:.014},{lo:9600,hi:14400,rate:.032},{lo:14400,hi:19200,rate:.055},{lo:19200,hi:24000,rate:.064},{lo:24000,hi:36000,rate:.068},{lo:36000,hi:48000,rate:.072},{lo:48000,hi:125000,rate:.076},{lo:125000,hi:175000,rate:.079},{lo:175000,hi:225000,rate:.0825},{lo:225000,hi:275000,rate:.09},{lo:275000,hi:325000,rate:.10},{lo:325000,hi:Infinity,rate:.11}],
    mfj:    [{lo:0,hi:19200,rate:.014},{lo:19200,hi:28800,rate:.032},{lo:28800,hi:38400,rate:.055},{lo:38400,hi:48000,rate:.064},{lo:48000,hi:72000,rate:.068},{lo:72000,hi:96000,rate:.072},{lo:96000,hi:250000,rate:.076},{lo:250000,hi:350000,rate:.079},{lo:350000,hi:450000,rate:.0825},{lo:450000,hi:550000,rate:.09},{lo:550000,hi:650000,rate:.10},{lo:650000,hi:Infinity,rate:.11}],
  },
  ID: { single: [{lo:0,hi:4673,rate:0},{lo:4673,hi:Infinity,rate:.05695}],
         mfj:   [{lo:0,hi:9346,rate:0},{lo:9346,hi:Infinity,rate:.05695}] },
  IL: { single: [{lo:0,hi:Infinity,rate:.0495}], mfj: [{lo:0,hi:Infinity,rate:.0495}] },
  // Indiana SB 1 scheduled cuts: 3.05% (2024) -> 3.00% (2025) -> 2.95% (2026) -> 2.90% (2027).
  // Engine is on a 2026 basis (2026 brackets/std deduction/IRMAA) — use the 2026 rate.
  IN: { single: [{lo:0,hi:Infinity,rate:.0295}], mfj: [{lo:0,hi:Infinity,rate:.0295}] },
  IA: { single: [{lo:0,hi:Infinity,rate:.038}],   mfj: [{lo:0,hi:Infinity,rate:.038}] },
  KS: { single: [{lo:0,hi:23000,rate:.052},{lo:23000,hi:Infinity,rate:.0558}],
         mfj:   [{lo:0,hi:46000,rate:.052},{lo:46000,hi:Infinity,rate:.0558}] },
  KY: { single: [{lo:0,hi:Infinity,rate:.04}], mfj: [{lo:0,hi:Infinity,rate:.04}] },
  LA: { single: [{lo:0,hi:Infinity,rate:.03}], mfj: [{lo:0,hi:Infinity,rate:.03}] },
  ME: {
    single: [{lo:0,hi:26800,rate:.058},{lo:26800,hi:63450,rate:.0675},{lo:63450,hi:Infinity,rate:.0715}],
    mfj:    [{lo:0,hi:53600,rate:.058},{lo:53600,hi:126900,rate:.0675},{lo:126900,hi:Infinity,rate:.0715}],
  },
  MD: {
    single: [{lo:0,hi:1000,rate:.02},{lo:1000,hi:2000,rate:.03},{lo:2000,hi:3000,rate:.04},{lo:3000,hi:100000,rate:.0475},{lo:100000,hi:125000,rate:.05},{lo:125000,hi:150000,rate:.0525},{lo:150000,hi:250000,rate:.055},{lo:250000,hi:Infinity,rate:.0575}],
    mfj:    [{lo:0,hi:1000,rate:.02},{lo:1000,hi:2000,rate:.03},{lo:2000,hi:3000,rate:.04},{lo:3000,hi:150000,rate:.0475},{lo:150000,hi:175000,rate:.05},{lo:175000,hi:225000,rate:.0525},{lo:225000,hi:300000,rate:.055},{lo:300000,hi:Infinity,rate:.0575}],
  },
  MA: { single: [{lo:0,hi:1083150,rate:.05},{lo:1083150,hi:Infinity,rate:.09}],
         mfj:   [{lo:0,hi:1083150,rate:.05},{lo:1083150,hi:Infinity,rate:.09}] },
  MI: { single: [{lo:0,hi:Infinity,rate:.0425}], mfj: [{lo:0,hi:Infinity,rate:.0425}] },
  MN: {
    single: [{lo:0,hi:32570,rate:.0535},{lo:32570,hi:106990,rate:.068},{lo:106990,hi:198630,rate:.0785},{lo:198630,hi:Infinity,rate:.0985}],
    mfj:    [{lo:0,hi:47620,rate:.0535},{lo:47620,hi:189180,rate:.068},{lo:189180,hi:330410,rate:.0785},{lo:330410,hi:Infinity,rate:.0985}],
  },
  MS: { single: [{lo:0,hi:10000,rate:0},{lo:10000,hi:Infinity,rate:.044}],
         mfj:   [{lo:0,hi:10000,rate:0},{lo:10000,hi:Infinity,rate:.044}] },
  MO: {
    single: [{lo:0,hi:1313,rate:0},{lo:1313,hi:2626,rate:.02},{lo:2626,hi:3939,rate:.025},{lo:3939,hi:5252,rate:.03},{lo:5252,hi:6565,rate:.035},{lo:6565,hi:7878,rate:.04},{lo:7878,hi:9191,rate:.045},{lo:9191,hi:Infinity,rate:.047}],
    mfj:    [{lo:0,hi:1313,rate:0},{lo:1313,hi:2626,rate:.015},{lo:2626,hi:3939,rate:.025},{lo:3939,hi:5252,rate:.03},{lo:5252,hi:6565,rate:.035},{lo:6565,hi:7878,rate:.04},{lo:7878,hi:9191,rate:.045},{lo:9191,hi:Infinity,rate:.047}],
  },
  MT: { single: [{lo:0,hi:21100,rate:.047},{lo:21100,hi:Infinity,rate:.059}],
         mfj:   [{lo:0,hi:42200,rate:.047},{lo:42200,hi:Infinity,rate:.059}] },
  NE: {
    single: [{lo:0,hi:4030,rate:.0246},{lo:4030,hi:24120,rate:.0351},{lo:24120,hi:38870,rate:.0501},{lo:38870,hi:Infinity,rate:.052}],
    mfj:    [{lo:0,hi:8040,rate:.0246},{lo:8040,hi:48250,rate:.0351},{lo:48250,hi:77730,rate:.0501},{lo:77730,hi:Infinity,rate:.052}],
  },
  NV: null,
  NH: null,
  NJ: {
    single: [{lo:0,hi:20000,rate:.014},{lo:20000,hi:35000,rate:.0175},{lo:35000,hi:40000,rate:.035},{lo:40000,hi:75000,rate:.05525},{lo:75000,hi:500000,rate:.0637},{lo:500000,hi:1000000,rate:.0897},{lo:1000000,hi:Infinity,rate:.1075}],
    mfj:    [{lo:0,hi:20000,rate:.014},{lo:20000,hi:50000,rate:.0175},{lo:50000,hi:70000,rate:.0245},{lo:70000,hi:80000,rate:.035},{lo:80000,hi:150000,rate:.05525},{lo:150000,hi:500000,rate:.0637},{lo:500000,hi:1000000,rate:.0897},{lo:1000000,hi:Infinity,rate:.1075}],
  },
  NM: {
    single: [{lo:0,hi:5500,rate:.015},{lo:5500,hi:16500,rate:.032},{lo:16500,hi:33500,rate:.043},{lo:33500,hi:66500,rate:.047},{lo:66500,hi:210000,rate:.049},{lo:210000,hi:Infinity,rate:.059}],
    mfj:    [{lo:0,hi:8000,rate:.015},{lo:8000,hi:25000,rate:.032},{lo:25000,hi:50000,rate:.043},{lo:50000,hi:100000,rate:.047},{lo:100000,hi:315500,rate:.049},{lo:315500,hi:Infinity,rate:.059}],
  },
  NY: {
    single: [{lo:0,hi:8500,rate:.04},{lo:8500,hi:11700,rate:.045},{lo:11700,hi:13900,rate:.0525},{lo:13900,hi:80650,rate:.055},{lo:80650,hi:215400,rate:.06},{lo:215400,hi:1077550,rate:.0685},{lo:1077550,hi:5000000,rate:.0965},{lo:5000000,hi:25000000,rate:.103},{lo:25000000,hi:Infinity,rate:.109}],
    mfj:    [{lo:0,hi:17150,rate:.04},{lo:17150,hi:23600,rate:.045},{lo:23600,hi:27900,rate:.0525},{lo:27900,hi:161550,rate:.055},{lo:161550,hi:323200,rate:.06},{lo:323200,hi:2155350,rate:.0685},{lo:2155350,hi:5000000,rate:.0965},{lo:5000000,hi:25000000,rate:.103},{lo:25000000,hi:Infinity,rate:.109}],
  },
  NC: { single: [{lo:0,hi:Infinity,rate:.0425}], mfj: [{lo:0,hi:Infinity,rate:.0425}] },
  ND: {
    single: [{lo:0,hi:48475,rate:0},{lo:48475,hi:244825,rate:.0195},{lo:244825,hi:Infinity,rate:.025}],
    mfj:    [{lo:0,hi:80975,rate:0},{lo:80975,hi:298075,rate:.0195},{lo:298075,hi:Infinity,rate:.025}],
  },
  OH: { single: [{lo:0,hi:26050,rate:0},{lo:26050,hi:Infinity,rate:.0275}],
         mfj:   [{lo:0,hi:26050,rate:0},{lo:26050,hi:Infinity,rate:.0275}] },
  OK: {
    single: [{lo:0,hi:1000,rate:.0025},{lo:1000,hi:2500,rate:.0075},{lo:2500,hi:3750,rate:.0175},{lo:3750,hi:4900,rate:.0275},{lo:4900,hi:7200,rate:.0375},{lo:7200,hi:Infinity,rate:.0475}],
    mfj:    [{lo:0,hi:2000,rate:.0025},{lo:2000,hi:5000,rate:.0075},{lo:5000,hi:7500,rate:.0175},{lo:7500,hi:9800,rate:.0275},{lo:9800,hi:14400,rate:.0375},{lo:14400,hi:Infinity,rate:.0475}],
  },
  OR: {
    single: [{lo:0,hi:4400,rate:.0475},{lo:4400,hi:11050,rate:.0675},{lo:11050,hi:125000,rate:.0875},{lo:125000,hi:Infinity,rate:.099}],
    mfj:    [{lo:0,hi:8800,rate:.0475},{lo:8800,hi:22100,rate:.0675},{lo:22100,hi:250000,rate:.0875},{lo:250000,hi:Infinity,rate:.099}],
  },
  PA: { single: [{lo:0,hi:Infinity,rate:.0307}], mfj: [{lo:0,hi:Infinity,rate:.0307}] },
  RI: { single: [{lo:0,hi:79900,rate:.0375},{lo:79900,hi:181650,rate:.0475},{lo:181650,hi:Infinity,rate:.0599}],
         mfj:   [{lo:0,hi:79900,rate:.0375},{lo:79900,hi:181650,rate:.0475},{lo:181650,hi:Infinity,rate:.0599}] },
  SC: { single: [{lo:0,hi:3560,rate:0},{lo:3560,hi:17830,rate:.03},{lo:17830,hi:Infinity,rate:.062}],
         mfj:   [{lo:0,hi:3560,rate:0},{lo:3560,hi:17830,rate:.03},{lo:17830,hi:Infinity,rate:.062}] },
  SD: null,
  TN: null,
  TX: null,
  UT: { single: [{lo:0,hi:Infinity,rate:.0455}], mfj: [{lo:0,hi:Infinity,rate:.0455}] },
  VT: {
    single: [{lo:0,hi:47900,rate:.0335},{lo:47900,hi:116000,rate:.066},{lo:116000,hi:242000,rate:.076},{lo:242000,hi:Infinity,rate:.0875}],
    mfj:    [{lo:0,hi:79950,rate:.0335},{lo:79950,hi:193300,rate:.066},{lo:193300,hi:294600,rate:.076},{lo:294600,hi:Infinity,rate:.0875}],
  },
  VA: { single: [{lo:0,hi:3000,rate:.02},{lo:3000,hi:5000,rate:.03},{lo:5000,hi:17000,rate:.05},{lo:17000,hi:Infinity,rate:.0575}],
         mfj:   [{lo:0,hi:3000,rate:.02},{lo:3000,hi:5000,rate:.03},{lo:5000,hi:17000,rate:.05},{lo:17000,hi:Infinity,rate:.0575}] },
  WA: null,
  WV: { single: [{lo:0,hi:10000,rate:.0222},{lo:10000,hi:25000,rate:.0296},{lo:25000,hi:40000,rate:.0333},{lo:40000,hi:60000,rate:.0444},{lo:60000,hi:Infinity,rate:.0482}],
         mfj:   [{lo:0,hi:10000,rate:.0222},{lo:10000,hi:25000,rate:.0296},{lo:25000,hi:40000,rate:.0333},{lo:40000,hi:60000,rate:.0444},{lo:60000,hi:Infinity,rate:.0482}] },
  WI: {
    single: [{lo:0,hi:14680,rate:.035},{lo:14680,hi:29370,rate:.044},{lo:29370,hi:323290,rate:.053},{lo:323290,hi:Infinity,rate:.0765}],
    mfj:    [{lo:0,hi:19580,rate:.035},{lo:19580,hi:39150,rate:.044},{lo:39150,hi:431060,rate:.053},{lo:431060,hi:Infinity,rate:.0765}],
  },
  WY: null,
  DC: { single: [{lo:0,hi:10000,rate:.04},{lo:10000,hi:40000,rate:.06},{lo:40000,hi:60000,rate:.065},{lo:60000,hi:250000,rate:.085},{lo:250000,hi:500000,rate:.0925},{lo:500000,hi:1000000,rate:.0975},{lo:1000000,hi:Infinity,rate:.1075}],
         mfj:   [{lo:0,hi:10000,rate:.04},{lo:10000,hi:40000,rate:.06},{lo:40000,hi:60000,rate:.065},{lo:60000,hi:250000,rate:.085},{lo:250000,hi:500000,rate:.0925},{lo:500000,hi:1000000,rate:.0975},{lo:1000000,hi:Infinity,rate:.1075}] },
};

function getStateBrackets(state, isMFJ) {
  const entry = STATE_BRACKETS[state];
  if (!entry) return null; // no state income tax
  return isMFJ ? entry.mfj : entry.single;
}



// One label map for the whole app, including the print report — see
// engine/withdrawalStrategies.js. It covers the RETIRED ids too, so a migration
// notice or an old checkpoint can still name what the user used to have. Only
// LIVE_STRATEGIES is offered in the picker.
export const getStrategyLabel = (strategy) => STRATEGY_LABELS[strategy] || strategy;

export const getStrategyDescription = (strategy) => {
  const descriptions = {
    smart: "Smart Waterfall — tax-optimal bucket sequencing with a horizon-aware spending rule: Guyton-Klinger guardrails when more than 15 years remain (adaptive), Bengen 4% inflation-only when 15 or fewer years remain (steady). The split matches GK's own longevity-clause threshold so we hand off exactly where GK's safety brake would otherwise be disabled. Bucket sourcing: cash → taxable → pre-tax (bracket-capped) → Roth last.",
    gk: "Guyton‑Klinger guardrails — your spending adapts each year based on portfolio performance, so the simulation reflects how a real retiree would behave, not a robot spending a fixed amount no matter what.",
    bengen: "Bengen 4% Rule (1994) — set your initial spend, then inflation-adjust it every year and ignore the portfolio. Does NOT react to market moves. The portfolio CAN run out, making this an honest model of late-stage risk for fixed-budget retirees.",
    fixed: "Fixed Percentage Withdrawal — you withdraw a constant percentage of your portfolio each year, adjusting automatically with market movements.",
    ninety_five_rule: "95% Rule — spending can only decrease to 95% of last year's amount, otherwise tracks inflation.",
    vpw: "Variable Percentage Withdrawal (VPW) — spending is recalculated each year based on remaining portfolio and life expectancy, so the plan spends down to roughly zero by your plan-to age.",
  };
  return descriptions[resolveStrategy(strategy)] || descriptions.gk;
};

/* ════ PROFILES ════ */
/* Personal data lives in AiRA_Profile.json — never hardcoded here */
/* Use Export button to save your data. Use Import to load it back. */

// Default bucket assignment by account category (user can override per account)
export function _defaultBucket(category) {
  if (category === "cash")    return 1;
  if (category === "taxable") return 2;
  if (category === "pretax")  return 2;
  if (category === "hsa")     return 3;
  if (category === "roth")    return 3;
  return 2;
}

// A single account can distribute its balance across buckets (Quicken-style
// split): `account.splits` = [{ bucket, pct }] with pct summing to 100. When
// absent, the whole balance sits in the single `account.bucket`. These helpers
// expand an account into per-bucket "pieces" so every consumer can treat a
// split account as several bucket-tagged slices that still roll up to one
// balance (the rollup is just the untouched `account.balance`).
export function accountBucketPieces(a) {
  const bal = a.balance || 0;
  const splits = Array.isArray(a.splits) ? a.splits.filter(s => s && s.pct > 0) : null;
  if (splits && splits.length) {
    const totalPct = splits.reduce((s, x) => s + x.pct, 0) || 1;
    return splits.map(s => ({ ...a, balance: bal * (s.pct / totalPct), bucket: s.bucket, _splitPct: s.pct }));
  }
  return [{ ...a, bucket: a.bucket ?? _defaultBucket(a.category) }];
}

export function expandAccountBuckets(accounts) {
  return (accounts || []).flatMap(accountBucketPieces);
}

export const BLANK_PROFILE = {
  label: "My Plan",
  name: "",
  dob: "",
  sex: "blended",              // "male" | "female" | "blended"
  stateOfResidence: "",
  currentAge: 50,
  retireAge: 60,
  endAge: 85,
  port: 1_000_000,
  contrib: 20,
  employerContrib: 0,           // annual employer contribution (fixed dollar amount, e.g. 401k match + profit sharing)
  // Savings that are NOT tax-advantaged. Kept separate from `contrib` because the
  // destination bucket changes the tax outcome decades later: taxable dollars are
  // drawn at LTCG rates against a cost basis (waterfall Step 3), whereas pre-tax
  // dollars are ordinary income AND enlarge the RMD base at rmdStartAge. Folding
  // brokerage savings into the 401(k) field silently converts one into the other.
  taxableContrib: 0,            // annual after-tax brokerage/savings contribution ($/yr)
  rothContrib: 0,               // annual Roth IRA contribution ($/yr, direct or backdoor)
  inf: 2.5,
  sp: 10_000,                   // US-domestic annual spending (subject to state tax when applicable)
  spOutOfCountry: 0,            // additive out-of-country annual spending (never state-taxed)
  spSpendOutofState: 0,         // legacy field — kept for profile-load migration; superseded by spOutOfCountry
  portfolioGoal: 1_000_000,
  ssAge: 67,
  ssb: 24_000,
  ssPia: 0,                    // own FRA/PIA annual amount — only needed if claiming before/after FRA; see §21
  // Spousal Social Security (Phase 1, §21 REQUIREMENTS): additive, off by default so every
  // existing single-person profile computes identically to before this feature existed.
  spouse: {
    enabled: false,
    // Spouse's date of birth (§24). THE enabler for per-person modelling: every
    // engine walks one `age`, which is the primary's, so without this the
    // spouse's Social Security claim age was compared against the PRIMARY's age
    // and a younger spouse started collecting years early. Blank ⇒ the spouse is
    // assumed to be the same age as the primary, which is exactly the old
    // behaviour, so no saved profile changes until this is filled in.
    dob: "",
    ssb: 0,                    // spouse's own annual benefit at THEIR claim age
    ssAge: 67,                 // spouse's own claim age, independent of the primary's
    ssPia: 0,                  // spouse's own FRA/PIA annual amount, for the spousal top-up
    // The spouse's OWN age at a modelled first death (§22 widow's penalty).
    // null = not modelled, which leaves filing status constant exactly as before.
    // Deliberately one user-entered age rather than a mortality draw: that keeps
    // it a deterministic event in a known year instead of a variable threaded
    // through 3,000 Monte Carlo paths.
    deathAge: null,
    // WHOSE age `deathAge` is. "spouse" (default) = the spouse dies and the primary
    // survives, which was the only case the model could express. "primary" = the
    // higher earner dies first, often the more realistic scenario since they are
    // frequently the older partner. This is not a label: the survivor's identity
    // decides the plan horizon, the Medicare start, the age-65 add-on, the RMD clock
    // and the survivor's own FRA. Default preserves every existing plan.
    firstToDie: "spouse",
    // ── Survivor benefit (§30) ───────────────────────────────────────────────
    // Deemed filing does NOT apply to survivor benefits, so the survivor's OWN
    // retirement benefit and the survivor benefit are independent: either can be
    // claimed first and switched later. That flexibility exists nowhere else in
    // Social Security, and it is only expressible with a separate claim age.
    // null ⇒ claim as soon as eligible (60, or the death year if later).
    survivorClaimAge: null,
    // Optional: the survivor benefit as SSA QUOTES it at that claim age — already
    // reduced. Supplying it bypasses our reduction schedule entirely (§21 "ask,
    // don't derive"). 0/blank ⇒ derive from the deceased's check or PIA.
    survivorBenefitAtClaim: 0,
    // ── Per-person contributions (§24.1 Phase A) ─────────────────────────────
    // The household used to have ONE set of contribution fields running for
    // `retireAge - currentAge` — one retirement date for two people. Splitting
    // the AMOUNTS changes nothing (all three engines sum into buckets, so
    // 24,500 + 18,000 in one field is identical to two fields); splitting the
    // STOP DATE is the entire point. One partner retiring at 62 while the other
    // works to 67 previously lost — or invented — five years of one salary's
    // savings, compounded to retirement.
    //
    // Only job-bound streams live here. Brokerage savings stay household-level
    // (no employment link, no statutory cap) and the HSA stays household-level
    // because its stop rule is Medicare enrolment, not retirement.
    //
    // null/0 defaults reproduce the pre-feature result exactly for every saved
    // profile — the same regression-lock idiom as spouse.dob above.
    retireAge: null,        // THEIR retirement age, on THEIR clock. null ⇒ same as primary
    contrib: 0,             // their pre-tax 401(k)/403(b)/457(b) deferral
    employerContrib: 0,     // their employer match / profit sharing
    rothContrib: 0,         // their Roth IRA
  },
  ab: 0,
  useAb: true,
  smile: true,
  tax: true,
  real: true,
  twoHousehold: false,
  employerStartDate: "",
  gkFloor: 48_000,
  gkFloorSpendOutofState: 48_000,
  gkFloorPct: GK_FLOOR_DEFAULT_PCT,    // floor as % of core spend
  gkTarget: 72_000,
  gkCeiling: 100_000,
  gkCeilingPct: GK_CEILING_DEFAULT_PCT, // ceiling as % of core spend
  // Mortgage
  mortBalance: 0,
  mortRate: 5.0,
  mortStart: "2020-01",
  mortTerm: 30,
  mortExtra: 0,
  mortPI: 0,
  // Real estate (not in liquid portfolio)
  properties: [
    { id:"p1", label:"Primary Residence", value:0, mortgage:0, income:0 },
    { id:"p2", label:"Property 2",        value:0, mortgage:0, income:0 },
  ],
  // NEW:
  filingStatus: "mfj",          // "mfj" | "single" — drives federal brackets & std deduction
  reGrowthRate: 3.0,            // annual home/RE appreciation rate (%)
  useJointRmdTable: false,      // default: use Uniform Lifetime table
  cashRealReturn: 3.0,          // default return for cash/HYSA (percent)
  taxableBasisPct: 70,          // % of TODAY's taxable-brokerage balance that is cost basis (rest = unrealized LTCG)
  // Expense model
  housingType: "own",           // "own" | "rent" | "none"
  annualRent: 0,                // annual rent if housingType === "rent" (today's dollars)
  carveouts: [],                // [{id, label, annual, endYear}] Other Expenses (HOA, Insurance, etc.) in today's dollars; endYear = null for indefinite
  // Planned one-off / periodic costs — see computeCashFlowEvents in engine/expenses.js.
  // [{id, label, year, amount, recurEveryYears, recurUntilYear, inflate, deferrable}]
  cashFlowEvents: [],
  spSchedule: null,             // [{year, amount}] explicit per-year core spend from a detailed CSV import; null = use sp + strategy
  spImportMeta: null,           // { mode, fileName, importedAt, total|years, essentialTotal } — display only, for the import summary card
  rothConversionTarget: "off",  // "off" | "12" | "22" | "24" | "irmaa"
  fafsaGuard: false,            // cap Roth conversions during college aid years — set true + fafsaEndYear to activate
  fafsaEndYear: null,           // last year to cap at 12% (FAFSA lookback window); e.g. 2034
  cssEndYear: null,             // last year to cap at 22% (CSS Profile window)
  conversionOverrides: [],      // [{id, year, amount}] manual per-year conversion amounts — populated in user's exported JSON
  // Account breakdown (feeds port total)
  accounts: [
    { id: "1", category: "pretax", name: "401(k)",      balance: 0, bucket: 2 },
    { id: "2", category: "roth",   name: "Roth IRA",    balance: 0, bucket: 3 },
    { id: "3", category: "taxable",name: "Brokerage",   balance: 0, bucket: 2 },
    { id: "4", category: "hsa",    name: "HSA",         balance: 0, bucket: 3 },
    { id: "5", category: "cash",   name: "Cash/Savings",balance: 0, bucket: 1 },
  ],
  // MC assumptions
  abReliability: 80,
  otherIncomes: [],   // [{ id, name, annual, startYear, endYear, growthMode:"pct"|"fixed", growthRate, growthAmount, growthCapYears, taxable }]
  abGrowth: 3.0,
  ssCola: 2.4,
  preRetireEq: 91,
  postRetireEq: 70,
  // null → the glidepath shifts at retireAge (previous behaviour). Set it to
  // separate "when I de-risk" from "when I stop working" — e.g. 90/10 until 67
  // while retiring at 62. See engine/glidepath.js.
  glidepathSwitchAge: null,
  fixedWithdrawalRate: 4.0,
  hcShockAge: 72,
  hcProb: 3.5,
  hcMin: 70_000,
  hcMax: 130_000,
  checkpoints: [],          // each: { id, date, value, note }
  earlyRetireTarget: 2_000_000,
  withdrawalStrategy: "gk",
  withdrawalBracketTarget: "22",  // "10"|"12"|"22"|"24"|"irmaa"|"off" — pretax ceiling in smart mode
  irmaaGuard: false,              // cap pretax draws below IRMAA tier-1 ceiling (ages 63+)
  ssTorpedoGuard: false,          // show SS torpedo landmine warnings in Withdrawal Plan tab
  rothEmergencyReserve: 0,        // never draw Roth below this $ floor
  // IRC 72(t) exceptions to the 10% early-distribution tax. Both default OFF:
  // the penalty is the law, and an exception is something the user must affirm.
  // Only asked when retireAge < 59.5 (see the Early Retirement card).
  ruleOf55: false,                // separated from employer at 55+, plan NOT rolled over
  sepp72t: false,                 // a 72(t) SEPP is running
  sepp72tStartAge: null,          // series start age; must run to max(start+5, 59.5)
  orderingMode: "tax_reactive",   // "tax_reactive"|"custom"|"pretax_first" — which bucket drains first (orthogonal to strategy + guardrails)
  withdrawalOrder: ["cash", "taxable", "pretax", "roth"], // used only when orderingMode === "custom"
  geminiApiKey: "",
  geminiModel: "",  // empty = use ai-analysis.js DEFAULT_GEMINI_MODEL
};

/* Real-world probability analogies, grouped into success-rate bands (min = band
 * floor in %). Several entries per band feed the revolving display so users get
 * varied context for what their number actually means. Every `stat` is the
 * analogy's own real-world probability, stated approximately and defensibly:
 * users should be able to sanity-check the comparison, not just take the vibe.
 * (Two earlier entries were factually wrong and are replaced: "calling heads
 * three times in a row" is 12.5% — it's NOT flipping three heads that's 87.5% —
 * and the 4-year college graduation rate is ~46%, nowhere near 80%.) */
const ANALOGUES = [
  {
    min: 95,
    text: "As reliable as a commercial flight landing safely",
    emoji: "✈️",
    color: "var(--positive)",
  },
  {
    min: 95,
    text: "A tour pro sinking a three-foot putt",
    stat: "≈99%",
    emoji: "⛳",
    color: "var(--positive)",
  },
  {
    min: 95,
    text: "A next-day weather forecast being right",
    stat: "≈95%",
    emoji: "☀️",
    color: "var(--positive)",
  },
  {
    min: 90,
    text: "Odds a 50-year-old reaches age 65 — F-You Money territory",
    stat: "≈9 in 10",
    emoji: "💪",
    color: "#34d399",
  },
  {
    min: 90,
    text: "An NFL kicker making an extra point",
    stat: "≈94%",
    emoji: "🏈",
    color: "#34d399",
  },
  {
    min: 90,
    text: "A full year of driving without a collision claim",
    stat: "≈94%",
    emoji: "🚗",
    color: "#34d399",
  },
  {
    min: 85,
    text: "Not flipping three heads in a row",
    stat: "87.5%",
    emoji: "🪙",
    color: "#6ee7b7",
  },
  {
    min: 85,
    text: "A U.S. high-school freshman graduating on time",
    stat: "≈87%",
    emoji: "🎓",
    color: "#6ee7b7",
  },
  {
    min: 85,
    text: "No ace showing up in two dealt cards",
    stat: "≈85%",
    emoji: "🃏",
    color: "#6ee7b7",
  },
  {
    min: 80,
    text: "Avoiding a 1 on a single die roll",
    stat: "≈83%",
    emoji: "🎲",
    color: "var(--accent-gold)",
  },
  {
    min: 80,
    text: "Staying dry when the forecast says 20% chance of rain",
    stat: "80%",
    emoji: "☔",
    color: "var(--accent-gold)",
  },
  {
    min: 75,
    text: "About the odds an NBA player makes a free throw",
    stat: "≈78%",
    emoji: "🏀",
    color: "var(--accent-gold)",
  },
  {
    min: 75,
    text: "A U.S. flight arriving on time",
    stat: "≈78%",
    emoji: "🛫",
    color: "var(--accent-gold)",
  },
  {
    min: 75,
    text: "Not drawing a spade from a full deck",
    stat: "75%",
    emoji: "♠️",
    color: "var(--accent-gold)",
  },
  {
    min: 70,
    text: "Odds a new business survives its first two years",
    stat: "≈70%",
    emoji: "🏢",
    color: "#f97316",
  },
  {
    min: 70,
    text: "Not flipping two heads in a row",
    stat: "75%",
    emoji: "🪙",
    color: "#f97316",
  },
  {
    min: 60,
    text: "Graduating college within six years of starting",
    stat: "≈64%",
    emoji: "🎓",
    color: "#fb923c",
  },
  {
    min: 60,
    text: "Rolling 3 or higher on a single die",
    stat: "≈67%",
    emoji: "🎲",
    color: "#fb923c",
  },
  {
    min: 50,
    text: "A literal coin flip — retirement shouldn't be one",
    stat: "50%",
    emoji: "🪙",
    color: "#f87171",
  },
  {
    min: 50,
    text: "Guessing a card's color correctly",
    stat: "50%",
    emoji: "🎴",
    color: "#f87171",
  },
  {
    min: 0,
    text: "Worse than a coin flip — plan needs structural changes, not luck",
    emoji: "😰",
    color: "var(--negative)",
  },
  {
    min: 0,
    text: "Lower spending, later retirement, or different allocation beat hoping for good markets",
    emoji: "⚠️",
    color: "var(--negative)",
  },
];


/* ════ MATH CORE ════ */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalDraw(mean, vol, rand) {
  const u = Math.max(rand(), 1e-10);
  return (
    mean + vol * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
  );
}
function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function bootstrapDraw(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}
function portReturn(age, rand, preRetireEq, postRetireEq, switchAge) {
  // The glidepath switches at `glidepathSwitchAge`, defaulting to the user's
  // RETIREMENT age. Callers pass the already-resolved age from
  // resolveGlidepathSwitchAge — see engine/glidepath.js for why this is
  // single-sourced (four call sites had drifted onto a hardcoded 62).
  const eqW = glidepathEquityWeight(age, preRetireEq, postRetireEq, switchAge);
  // PAIRED bootstrap sampling (v1.2.104). One shared random index draws the
  // same calendar year's stock AND bond return, so the historical stock/bond
  // correlation is preserved — including the flight-to-quality flip in crashes
  // (2008: SP500[i]=-36.55%, BONDS[i]=+20.10%) and the rare double-down
  // (2022: SP500[i]=-18.04%, BONDS[i]=-17.83%). The prior implementation drew
  // stocks and bonds independently, effectively forcing cov(stocks, bonds) = 0
  // and inventing year combinations that never occurred. Requires SP500 and
  // BONDS to be equal-length and year-aligned; engine/expectedReturn.js
  // guarantees both (Damodaran 1928-2025, 98 pairs).
  const i = Math.floor(rand() * SP500.length);
  return eqW * SP500[i] + (1 - eqW) * BONDS[i];
}
// Paired return + inflation for one retirement year (v1.2.105). Same shared
// index selects SP500[i], BONDS[i], AND INFL[i], so a year like 1974 draws
// stocks (-25.9%), bonds (+1.99%) and inflation (+11.0%) together — the
// canonical stagflation-year triple. The prior code drew INFL independently
// via a second rand() call, so a bootstrap could pair 2008's crash with
// 2015's 0.1% CPI, understating the compound damage of stagflation on
// retirement spending power.
//
// RNG-PRESERVATION SHIM: the second `rand()` below is consumed and thrown
// away. Its ONLY purpose is to keep the rand() call count per retirement
// year identical to the prior (independent-INFL) version, so downstream
// draws in the same seed produce the same sequence and the test suite does
// not have to be rebalanced for an RNG-order shift. If the RNG discipline
// is ever formally dropped (see the comment above `netNeed offset` in
// runMC), this shim can be removed.
function drawYearBundle(age, rand, preRetireEq, postRetireEq, switchAge) {
  const eqW = glidepathEquityWeight(age, preRetireEq, postRetireEq, switchAge);
  const i = Math.floor(rand() * SP500.length);
  rand(); // rand()-count shim — see comment above
  return {
    ret: eqW * SP500[i] + (1 - eqW) * BONDS[i],
    inflY: INFL[i],
  };
}


function guytonKlingerWithdrawal(
    portfolioValue,
    initialWR,
    lastWithdrawal,
    lastReturn,
    inflationRate,
    floor,
    ceiling,
    yearsRemaining = Infinity,
    incomeOffset = 0,
    fixedCosts = 0
  ) {
    // NaN guards – fall back to safe values if any parameter is invalid
    if (isNaN(portfolioValue) || portfolioValue <= 0) return floor || 0;
    if (isNaN(lastWithdrawal)) lastWithdrawal = floor || 0;
    if (isNaN(lastReturn)) lastReturn = 0;
    if (isNaN(inflationRate)) inflationRate = 0.02;
    if (isNaN(initialWR)) initialWR = 0.04;
    if (isNaN(incomeOffset)) incomeOffset = 0;
    if (isNaN(fixedCosts)) fixedCosts = 0;

    // GK Rule: Withdrawal/Inflation — adjust by CPI only when prior-year return ≥ 0,
    // and cap the inflation pass-through per the original paper.
    const cappedInfl = Math.min(GK_INFLATION_CAP, inflationRate);
    let w =
      lastReturn >= 0 ? lastWithdrawal * (1 + cappedInfl) : lastWithdrawal;

    // Guard: if the baseline draw is already fully covered by income at
    // retirement (initialWR <= 0), skip the band adjustments entirely —
    // otherwise currentWR <= 0.8*0 is always true and fires a meaningless
    // +10% raise every year regardless of portfolio health.
    if (initialWR > 0) {
      // The tracked ratio must be the SAME quantity the baseline initialWR was
      // calibrated against — NET portfolio need (gross withdrawal minus SS/
      // annuity/otherIncome, plus housing/carveouts), not gross withdrawal `w`.
      // Otherwise a retiree whose SS starts at retirement has currentWR far
      // above initialWR every year, triggering a bogus capital-preservation
      // cut regardless of portfolio health.
      const netNeed = Math.max(0, w - incomeOffset) + fixedCosts;
      const currentWR = portfolioValue !== 0 ? netNeed / portfolioValue : 0;

      // GK Prosperity Rule: WR drops 20% below initial → +10%
      if (currentWR <= initialWR * 0.8) w *= 1.1;
      // GK Capital Preservation Rule: WR rises 20% above initial → -10%.
      // GK Longevity Rule: skip the cut when ≤15 years remaining.
      else if (currentWR >= initialWR * 1.2 && yearsRemaining > 15) w *= 0.9;
    }

    // Custom safety belt (not from the GK paper): clamp to floor/ceiling.
    return Math.max(floor || 0, Math.min(ceiling || Infinity, w));
}

/**
 * Realized capital gain from a taxable-brokerage draw, using average-cost
 * basis tracking (not per-lot). g = draw × (1 − basis/balance) — the fraction
 * of the account that is unrealized gain. Guards balance<=0 and basis>=balance
 * (fully-basis accounts realize $0 gain). Shared by runMC and the deterministic
 * conversion-delta helper; buildWithdrawalWaterfall.js keeps its own copy since
 * it does not import from App.jsx.
 */
function realizedGainFromDraw(draw, balance, basis) {
  if (!draw || draw <= 0 || !balance || balance <= 0) return 0;
  const frac = Math.max(0, 1 - (basis || 0) / balance);
  return draw * frac;
}

function calcYearTax(
  age,
  yr,
  withdrawalAmount,
  ssIncome,
  RentalIncome,
  rmdIncome,
  conversionAmount,
  isTwoHousehold,
  inflationRate,
  filingStatus = "mfj",
  stateOfResidence = "NJ",
  ltcgAmount = 0,
  // IRMAA 2-year lookback: MAGI from two years ago (SSA charges year T's premium
  // off the tax return filed two years prior). When the caller has that history
  // it passes it here; the CURRENT year `yr` still selects the bracket table —
  // only the MAGI used to walk the table changes. `null` (default) preserves the
  // pre-lookback same-year-MAGI behavior for every caller that hasn't threaded
  // history through yet (backward compatible).
  magiLookback = null,
  // Spouse's age in this same tax year, or null when unknown. Only the PER-PERSON
  // amounts read it: the age-65 standard-deduction add-on and the OBBBA senior
  // bonus. null reproduces the previous behaviour (one age standing for both
  // filers), so every caller that has not threaded a spouse age is unchanged.
  spouseAge = null
) {
  // Replace any NaN arguments with 0
  withdrawalAmount = isNaN(withdrawalAmount) ? 0 : withdrawalAmount;
  ssIncome = isNaN(ssIncome) ? 0 : ssIncome;
  RentalIncome = isNaN(RentalIncome) ? 0 : RentalIncome;
  rmdIncome = isNaN(rmdIncome) ? 0 : rmdIncome;
  conversionAmount = isNaN(conversionAmount) ? 0 : conversionAmount;
  inflationRate = isNaN(inflationRate) ? 0.025 : inflationRate;
  ltcgAmount = isNaN(ltcgAmount) ? 0 : Math.max(0, ltcgAmount || 0);

  const isMFJ = filingStatus !== "single";
  const otherIncome =
    (withdrawalAmount || 0) +
    (RentalIncome || 0) +
    (rmdIncome || 0) +
    (conversionAmount || 0);
  // IRC §86 provisional-income tiers: 0% / 50% / 85% of SS taxable by income level.
  // Realized capital gains count in provisional income (they're part of MAGI),
  // so they're added to the "other income" side of the SS-taxability test even
  // though they are NOT part of ordinary `otherIncome`/`totalIncome` below.
  const taxableSS = taxableSocialSecurity(ssIncome, otherIncome + ltcgAmount, isMFJ);
  const totalIncome = taxableSS + otherIncome; // ordinary income total (excludes LTCG)
  const inflationFactor = Math.pow(1 + inflationRate, Math.max(0, yr - CURRENT_YEAR));

  // IRMAA MAGI = AGI + tax-exempt interest; untaxed SS is NOT added back.
  // AGI includes the full realized gain (pre-deduction), unlike taxableIncome
  // below. Computed HERE, ahead of every deduction, for two reasons: it genuinely
  // does not depend on deductions, and the OBBBA senior bonus deduction's
  // phase-out is keyed to MAGI, so MAGI has to exist first. Keeping it above the
  // deduction lines is also the structural guard against anyone ever netting a
  // deduction out of MAGI (CLAUDE.md rule 3 — IRMAA takes no deduction).
  const magi = totalIncome + ltcgAmount;

  // Standard deduction (incl. age-65+ add-on), inflation-adjusted forward.
  // Single source: getStandardDeduction → TAX_REFERENCE.md (CLAUDE.md Rule 6).
  const stdDeduction = getStandardDeduction(age, filingStatus, inflationFactor, spouseAge);
  // OBBBA senior bonus deduction (2025–2028 only, $0 from 2029) — a separate,
  // additive, deliberately NON-inflation-indexed deduction stacked on top of the
  // standard deduction and its age-65 add-on. Taxable income only; `magi` above
  // is already fixed and is never reduced by it.
  const seniorBonus = getSeniorBonusDeduction(age, filingStatus, magi, yr, spouseAge);
  const totalDeduction = stdDeduction + seniorBonus;
  const taxableIncome = Math.max(0, totalIncome - totalDeduction);
  // LTCG stacks ON TOP of ordinary income (IRS stacking rule): gains occupy the
  // taxable-income band from `taxableIncome` up to `taxableIncome + gainTaxable`.
  // If ordinary income didn't fully use the deductions, gains soak up
  // whatever's left of them first.
  const gainTaxable = Math.max(0, totalIncome + ltcgAmount - totalDeduction) - taxableIncome;

  // Select federal brackets by filing status
  const rawBrackets = isMFJ ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE;
  const fedBrackets = idxB(rawBrackets, inflationFactor);
  const fedTaxOrdinary = progTax(taxableIncome, fedBrackets);

  // LTCG bracket walk over the stacked interval [taxableIncome, taxableIncome+gainTaxable).
  const ltcgBrackets = idxB(isMFJ ? LTCG_BRACKETS_2026_MFJ : LTCG_BRACKETS_2026_SINGLE, inflationFactor);
  const ltcgTax = Math.round(
    progTax(taxableIncome + gainTaxable, ltcgBrackets) - progTax(taxableIncome, ltcgBrackets)
  );

  // NIIT (IRC §1411): 3.8% of the lesser of net investment income (LTCG here)
  // or the excess of MAGI over the statutory (non-inflation-indexed) threshold.
  const niitThreshold = isMFJ ? NIIT_THRESHOLD_MFJ : NIIT_THRESHOLD_SINGLE;
  const niit = ltcgAmount > 0
    ? Math.round(NIIT_RATE * Math.min(ltcgAmount, Math.max(0, magi - niitThreshold)))
    : 0;

  // LTCG tax + NIIT fold into the federal total so downstream funding-identity
  // math (totalTax = fedTax + stateTax + irmaa) keeps working unchanged; the
  // components are also returned separately (ltcgTax, niit) for UI surfacing.
  const fedTax = fedTaxOrdinary + ltcgTax + niit;
  let stateTax = 0;

  if (!isTwoHousehold) {
    const stateBr = getStateBrackets(stateOfResidence, isMFJ);
    // States generally tax capital gains as ordinary income (no LTCG preferential
    // rate) — add the realized gain to the state taxable base.
    if (stateBr) stateTax = Math.round(progTax(taxableIncome + ltcgAmount, idxB(stateBr, inflationFactor)));
  }
      // IRMAA charge uses the 2-year-old MAGI when the caller supplied one;
      // otherwise falls back to this year's own MAGI (pre-lookback behavior).
      const irmaaMagi = (typeof magiLookback === "number" && !isNaN(magiLookback)) ? magiLookback : magi;
      // Medicare starts at EACH person's own 65 (§24). `medicareHeads` is 0
      // before either qualifies, 1 during an age gap, 2 once both are on
      // Medicare — so an age-gapped couple is no longer charged two surcharges
      // from the older one's 65th birthday.
      const medicareHeads = personsAtLeastAge(age, spouseAge, isMFJ, 65);
      const irmaa = medicareHeads > 0
        ? irmaaCost(irmaaMagi, yr, inflationRate, isMFJ, medicareHeads)
        : 0;
      const totalTax = fedTax + stateTax + irmaa;
      const effectiveRate = (totalIncome + ltcgAmount) > 0 ? totalTax / (totalIncome + ltcgAmount) : 0;
      let marginalBracket = 0;

  for (const b of fedBrackets) {
    if (taxableIncome > b.lo) marginalBracket = b.rate;
    else break;
  }
  return {
    fedTax, stateTax, irmaa, totalTax, effectiveRate, marginalBracket, taxableIncome,
    ltcgTax, niit, realizedGain: Math.round(ltcgAmount),
    // Deduction components, surfaced separately so the UI can explain the
    // 2028→2029 jump when the OBBBA senior bonus sunsets.
    stdDeduction, seniorBonus,
    // This year's OWN MAGI (never the lookback substitution) — callers store
    // this in a per-age history so it becomes the magiLookback input two years
    // from now.
    magi,
  };
}

/**
 * Standard deduction (MFJ/Single), with the age-65+ add-on, inflated forward.
 * Canonical source: TAX_REFERENCE.md → "Standard Deduction (MFJ 2026)".
 * Single source of truth — calcYearTax and the sourcing waterfall both call this
 * instead of re-declaring the literals (CLAUDE.md Rule 6).
 */
function getStandardDeduction(age, filingStatus, inflFactor, spouseAge = null) {
  const mfj = filingStatus !== "single";
  let sd = mfj ? 32_200 : 16_100;          // base, 2026
  // The age-65 add-on is PER FILER ($1,650 each). It used to be granted for both
  // spouses as soon as the primary reached 65, which overstated the deduction by
  // $1,650/yr for the whole age gap. `spouseAge = null` keeps the old behaviour
  // for profiles with no spouse birthdate. See engine/ages.js.
  const seniors = personsAtLeastAge(age, spouseAge, mfj, 65);
  sd += seniors * 1_650;
  return Math.round(sd * inflFactor);
}

/**
 * IRMAA MAGI ceiling for a given tier, inflated forward.
 * Canonical source: TAX_REFERENCE.md → "IRMAA Thresholds (MFJ 2026)".
 * tier 1 = base tier below which there is no Medicare surcharge.
 */
function getIrmaaCeiling(tier, filingStatus, inflFactor) {
  const mfj = filingStatus !== "single";
  const base = mfj ? 218_000 : 109_000;    // tier-1 MAGI ceiling, 2026
  return Math.round(base * inflFactor);
}

/**
 * Returns the TAXABLE INCOME ceiling (after std deduction) for a given bracket target.
 * Values are 2026 estimates, inflated by inflFactor for future years.
 * The "irmaa" target delegates to getIrmaaCeiling so the threshold has one home.
 */
function getBracketCeiling(target, filingStatus, inflFactor) {
  if (target === "irmaa") return getIrmaaCeiling(1, filingStatus, inflFactor);
  const mfj = filingStatus !== "single";
  const ceilings = mfj
    ? { "10": 24_800, "12": 100_800, "22": 211_400, "24": 403_550, "32": 512_450, "35": 768_700, "37": Infinity }
    : { "10": 12_400, "12":  50_400, "22": 105_700, "24": 201_800, "32": 256_225, "35": 640_600, "37": Infinity };
  const base = ceilings[target] ?? ceilings["22"];
  return base === Infinity ? Infinity : Math.round(base * inflFactor);
}

// seqOverride: optional array of equity returns (decimals) prescribed for the first
// N retirement years — used by the Stress Test to force the 2000–2012 sequence at
// retirement. When supplied, year y's equity component is seqOverride[y] (blended with
// a bootstrapped bond draw at the same age-based equity weight portReturn uses); past
// the array length, returns fall back to the normal bootstrap. Everything else — tax
// (calcYearTax, incl. the non-resident/state toggle), RMDs, bucket sourcing, strategy —
// is IDENTICAL to a normal run, so the stress pivot can never diverge from the MC.
function runMC(p, endAge, N = MC_PATHS, seed = 42, useGK = true, seqOverride = null) {
  const rand = mulberry32(seed);
  // "Tax drag" master toggle. OFF (p.tax === false) zeroes ALL tax — federal, state,
  // IRMAA, and Roth-conversion cost — for a pure pre-tax view of portfolio dynamics.
  // calcYearTax still runs (its taxableIncome / marginalBracket feed sourcing and
  // conversion sizing), but no tax dollars are withdrawn. Because the Stress Test
  // delegates to runMC, the toggle now governs MC and Stress identically. Only an
  // explicit boolean false disables it — a numeric/true value (default) keeps tax on.
  const taxEnabled = p.tax !== false;
  // Account draw order (which bucket drains first) — constant for the whole run.
  // Default "tax_reactive" resolves to cash → taxable → pretax → roth, the
  // historical hardcoded sequence. Shared resolver keeps this in lock-step with
  // buildWithdrawalWaterfall's smart scenario.
  const drawOrderMC = resolveDrawOrder(p.orderingMode, p.withdrawalOrder);
  // Already-retired users enter the age they actually retired at, which is in
  // the past. Balances are always TODAY's, so starting the drawdown there would
  // replay years that already happened. See effectiveRetireAge.
  const retAgeMC = effectiveRetireAge(p.retireAge, p.currentAge);
  // Equity glidepath switch age — resolved ONCE here so the accumulation loop,
  // the normal drawdown draw, and the stress-sequence branch below cannot
  // disagree (the stress branch used to hardcode 62). Uses the EFFECTIVE
  // retirement age as the fallback, matching every other age in this engine.
  // Share of pre-tax sitting in a former-employer plan — the only slice Rule of
  // 55 can reach. Constant for the run (detected off starting balances).
  const ruleOf55ShareMC = detectEmployerPlan(p.accounts).share;
  // Calendar-year Rule-of-55 test, computed ONCE per run. Separation in or after
  // the year the employee turns 55 qualifies — `retireAge >= 55` was stricter
  // than the statute. See ruleOf55SeparationQualifies.
  const ruleOf55OkMC = ruleOf55SeparationQualifies({
    dob: p.dob, birthYear: p.birthYear, currentAge: p.currentAge, retireAge: retAgeMC,
  });
  const glideSwitchAgeMC = resolveGlidepathSwitchAge({ ...p, retireAge: retAgeMC });
  const accYrs = Math.max(0, retAgeMC - p.currentAge);
  // §30 — the horizon follows whoever is alive. When the primary dies first and a
  // younger spouse survives, the money must last until the SURVIVOR reaches endAge,
  // so the projection runs past the age the primary would have reached. Identical to
  // endAge whenever no first death is modelled or the primary is the survivor, so no
  // existing plan changes length.
  const planEndMC = planEndAgeOnPrimaryClock(p, endAge);
  const retYrs = planEndMC - retAgeMC;
  const results = [];
  const gkFloor = p.gkFloor || GK_FLOOR_FALLBACK;
  const gkCeiling = p.gkCeiling || GK_CEILING_FALLBACK;
  // resolveStrategy, not `|| "gk"`. A retired id (an old saved profile) or a
  // typo would otherwise match no branch in the chain below and leave `sp`
  // unassigned for the whole run — spending never inflation-adjusts and the
  // smile deflates it ~1%/yr, silently, with no error. See
  // engine/withdrawalStrategies.js.
  const withdrawalStrategy = resolveStrategy(p.withdrawalStrategy);

  // User settings for cash return and RMD table
  const cashRealReturn = (p.cashRealReturn ?? 3.0) / 100;
  // Joint & Last Survivor is only legal while the much-younger spouse is ALIVE
  // and is the sole beneficiary, so this has to be a per-year test once a first
  // death is modelled (§22) — a hoisted constant would keep using the longer
  // divisors, understating every post-death RMD. filesJointlyAt carries both
  // conditions (filing status AND the death year).
  const useJointTableAt = (age) => (p.useJointRmdTable ?? false) && filesJointlyAt(p, age);
  const UNIFORM_TABLE = RMD_DIV;

  // SECURE 2.0 RMD start age (72/73/75 by birth year), user override wins
  const rmdStartAge = (typeof p.rmdStartAge === "number" && p.rmdStartAge > 0)
    ? p.rmdStartAge
    : getRmdStartAge({ dob: p.dob, birthYear: p.birthYear, currentAge: p.currentAge });

  // Expected inflation for tax-bracket/IRMAA indexing. Brackets must compound at the
  // assumed long-run rate, not a single bootstrapped year's draw (see inflY below).
  const taxInfl = (p.inf ?? 2.5) / 100;

  // Percent of TODAY's taxable-brokerage balance that is cost basis (user reads
  // this off their brokerage statement). The rest is unrealized gain, realized
  // proportionally (average-cost basis, not per-lot) as the account is drawn down.
  const taxableBasisPct = Math.max(0, Math.min(100, p.taxableBasisPct ?? 70));

  // Pre-compute the actual annual mortgage cash cost per calendar year (incl.
  // extra payments and the partial payoff year), constant across all paths —
  // the mortgage is path-independent.
  let mortByYear = new Map();
  if (p.mortBalance > 0) {
    const ms = mortgageSchedule(
      p.mortBalance,
      p.mortRate || 6.5,
      p.mortStart || "2020-01",
      p.mortTerm || 30,
      p.mortExtra || 0
    );
    mortByYear = mortgageAnnualPayments(ms);
  }

  // One-off INFLOWS (inheritance, home sale, pension lump sum) landing during
  // the ACCUMULATION years, precomputed once — they are path-independent, like
  // the mortgage. Previously only the retirement loop processed cashFlowEvents,
  // so a lump sum arriving before retirement was silently dropped from every
  // path — a user testing a $1M future inheritance saw the numbers not move.
  // Accumulation year y is calendar year CURRENT_YEAR + y; the retirement loop
  // starts at CURRENT_YEAR + accYrs, so an event fires in exactly one phase.
  const accInflowByYear = [];
  for (let y = 0; y < accYrs; y++) {
    accInflowByYear.push(computeCashFlowEvents(p.cashFlowEvents, CURRENT_YEAR + y, p.inf ?? 2.5, CURRENT_YEAR));
  }

  for (let i = 0; i < N; i++) {
    // Initialize buckets from p.accounts for this path
    let pretax = 0, roth = 0, taxable = 0, cash = 0;
    for (const acct of (p.accounts || [])) {
      const bal = acct.balance || 0;
      if (acct.category === "pretax") pretax += bal;
      else if (acct.category === "roth") roth += bal;
      else if (acct.category === "taxable") taxable += bal;
      // "hsa" and any unrecognized category fall through to cash. This used to
      // be `else if (category === "cash")`, which silently DROPPED every
      // hsa-category balance from the simulation — BLANK_PROFILE ships an HSA
      // account by default, so any user with an HSA had it vanish from their
      // portfolio. accumulateToRetirement() already bucketed hsa into cash via
      // a catch-all else, so the two engines disagreed. Now they match.
      else cash += bal;
    }
    // Basis is a % of TODAY's taxable balance, fixed in dollars from here on —
    // accumulation-phase growth (below) increases the balance but not the
    // basis (growth is unrealized gain), so the basis fraction shrinks by
    // retirement even though no draw has happened yet.
    let taxableBasis = taxable * (taxableBasisPct / 100);
    let totalPort = pretax + roth + taxable + cash;

    // Accumulation phase
    for (let y = 0; y < accYrs; y++) {
      const ret = portReturn(p.currentAge + y, rand, p.preRetireEq, p.postRetireEq, glideSwitchAgeMC);
      pretax   = Math.max(0, pretax   * (1 + ret));
      roth     = Math.max(0, roth     * (1 + ret));
      taxable  = Math.max(0, taxable  * (1 + ret));
      cash     = Math.max(0, cash     * (1 + ret));
      // Contributions land in the bucket they actually belong to. Previously ALL
      // of them were added to `pretax`, which mispriced every later withdrawal:
      // brokerage savings became ordinary income instead of LTCG-with-basis, and
      // inflated the RMD base at rmdStartAge.
      // Job-bound streams come from one shared helper (§24.1) so this loop,
      // simulateDeterministicWithStrategy and accumulateToRetirement cannot
      // disagree about whose contributions have stopped. A spouse who retires
      // before the primary stops contributing on THEIR date, not the primary's.
      const jc = jobContributionsForYear(p, p.currentAge + y);
      pretax  += jc.pretax;
      cash    += (p.hsaContrib || 0);          // HSA balances live in the cash bucket
      roth    += jc.roth;
      taxable += (p.taxableContrib || 0);
      // Brokerage contributions are already-taxed dollars, so they add basis
      // one-for-one. Only market growth is unrealized gain.
      taxableBasis += (p.taxableContrib || 0);
      // Pre-retirement one-off inflows are deposited into their bucket, like
      // contributions (no return in the arrival year). Outflow events stay
      // retirement-only — pre-retirement spending is presumed paid from wages,
      // which this engine does not model. See accInflowByYear above.
      const evAcc = accInflowByYear[y];
      if (evAcc && evAcc.inflow > 0) {
        pretax += evAcc.byBucket.pretax || 0;
        roth   += evAcc.byBucket.roth   || 0;
        cash   += evAcc.byBucket.cash   || 0;
        const taxableIn = evAcc.byBucket.taxable || 0;
        taxable += taxableIn;
        taxableBasis += taxableIn;   // already-taxed money arrives as basis
      }
      totalPort = pretax + roth + taxable + cash;
    }

    const portAtRetire = Math.round(totalPort);

    const gg = clip(normalDraw(0.03, 0.005, rand), 0.005, 0.08);
    const sg = clip(normalDraw(0.015, 0.005, rand), 0.002, 0.05);
    const ng = clip(normalDraw(0.025, 0.005, rand), 0.005, 0.08);

    const path = [portAtRetire];
    let survived = true, exhaustAge = null;
    // How many years this path had to exceed the bracket target to stay funded.
    // Aggregated below so the UI can eventually SAY that a tax preference was
    // yielded, instead of the user wondering why their marginal rate exceeds the
    // target they chose.
    let bracketOverrideYears = 0;
    let rothReserveBrokenYears = 0;
    let sp = p.sp;
    let lastReturn = 0;

    // Baseline initWR = NET PORTFOLIO NEED at retirement / portfolio — NO tax
    // (matches the ratio the GK call tracks each year: netNeed = gross spend
    // minus SS/rental/otherIncome, plus housing/carveouts — see the Step 1
    // block inside the retirement loop below). ab0 includes propIncome to
    // match the yearly `totalRental` term. calYear0/otherInc0/housing0/
    // carveout0 mirror the exact formulas the retirement loop applies for
    // age === p.retireAge (y === 0), so this engine's own year-0 netNeed is
    // what initWR is calibrated against.
    const ss0 = computeHouseholdSS(p, retAgeMC);
    const ab0 = (p.ab > 0 ? p.ab : 0) + (p.propIncome || 0);
    const calYear0 = CURRENT_YEAR + (retAgeMC - p.currentAge);
    const { total: otherInc0 } = computeOtherIncome(p.otherIncomes, calYear0);
    const housingType0 = p.housingType || "own";
    let housing0 = 0;
    if (housingType0 === "own") {
      housing0 = mortByYear.get(calYear0) || 0;
    } else if (housingType0 === "rent") {
      housing0 = Math.round(p.annualRent || 0);
    }
    const carveout0 = (p.carveouts || []).reduce((sum, c) => {
      return sum + (calYear0 <= (c.endYear || 9999) ? Math.round(c.annual || 0) : 0);
    }, 0);
    const initNeed0 = Math.max(0, p.sp - ss0 - ab0 - otherInc0) + housing0 + carveout0;
    const initWR = portAtRetire > 0 ? initNeed0 / portAtRetire : 0.04;

    // IRMAA 2-year lookback history for this path — rolled forward at the end
    // of each retirement year below. Pre-retirement wage income isn't modeled
    // (this engine only knows portfolio/SS/rental income), so the first two
    // retirement years (y === 0, 1) have no usable 2-years-ago figure; those
    // years fall back to same-year MAGI (the pre-lookback approximation) via
    // the `y >= 2` gate below.
    let magiOneYearAgo = null, magiTwoYearsAgo = null;

    for (let y = 0; y < retYrs; y++) {
      const age = retAgeMC + y;
      const calYear = CURRENT_YEAR + (age - p.currentAge);
      // Stress sequence override: prescribe the equity leg for the first
      // seqOverride.length retirement years; bond leg stays bootstrapped at the
      // same age-based equity weight portReturn uses. No override → normal draw.
      //
      // The seqOverride branch draws bonds AND inflation independently (two
      // rand() calls) because the SEQ_2000_2012 array has no year labels to
      // pair against. The normal branch uses drawYearBundle() which returns a
      // paired (stock, bond, inflation) triple from ONE historical year — see
      // its definition for the rand()-count shim that keeps this branch
      // matching the seqOverride branch's rand() consumption.
      let r, inflY;
      if (seqOverride && y < seqOverride.length) {
        // Same weight portReturn would have used at this age. This line had a
        // hardcoded 62 while portReturn switched at the retirement age, so every
        // Stress Test scenario modelled a DIFFERENT investor than the headline
        // run: a 67 retiree was de-risked five years early, a 60 retiree stayed
        // aggressive two years too long.
        const eqW = glidepathEquityWeight(age, p.preRetireEq, p.postRetireEq, glideSwitchAgeMC);
        r = eqW * seqOverride[y] + (1 - eqW) * bootstrapDraw(BONDS, rand);
        inflY = bootstrapDraw(INFL, rand);
      } else {
        const bundle = drawYearBundle(age, rand, p.preRetireEq, p.postRetireEq, glideSwitchAgeMC);
        r = bundle.ret;
        inflY = bundle.inflY;
      }

      const cumInfl = Math.pow(1 + (p.inf || 2.5) / 100, y);
      const adjFloor = gkFloor * cumInfl;
      const adjCeiling = gkCeiling * cumInfl;

      // Deterministic income/fixed-cost pieces needed both by this year's GK
      // netNeed offset (below) and by `need` after the strategy block — moved
      // ABOVE the strategy switch WITHOUT touching the rand() call order: none
      // of these consume rand(), so r/inflY/abReliable's draw sequence is
      // unaffected. abReliable itself stays in its original position (right
      // after `lastReturn = r`) — only these deterministic values move earlier.
      const ss = computeHouseholdSS(p, age);
      const growthFactor = Math.pow(1 + (p.abGrowth || 3) / 100, Math.min(y, 20));
      const totalRental = Math.round(((p.propIncome || 0) + (p.ab > 0 ? p.ab : 0)) * growthFactor);
      // Deterministic expected rental (abEndYear cutoff applied, but NOT the
      // abReliability coin-flip below) — used only to offset GK's netNeed.
      // The actual reliability draw still gates `effectiveAb`, the real
      // income used in the real `need` afterward, exactly as before.
      const rentalForGK = (p.abEndYear && calYear > p.abEndYear) ? 0 : totalRental;

      // Housing cost (own = mortgage cash cost while active, rent = inflation-adjusted rent, none = 0)
      const housingType = p.housingType || "own";
      let housingCost = 0;
      if (housingType === "own") {
        housingCost = mortByYear.get(calYear) || 0;
      } else if (housingType === "rent") {
        housingCost = Math.round((p.annualRent || 0) * cumInfl);
      }

      // Active fixed carveouts
      const carveoutCost = (p.carveouts || []).reduce((sum, c) => {
        return sum + (calYear <= (c.endYear || 9999) ? Math.round((c.annual || 0) * cumInfl) : 0);
      }, 0);

      const { total: otherIncTotal, totalTaxable: otherIncTaxable } = computeOtherIncome(p.otherIncomes, calYear);

      // GK's netNeed income offset — same NET PORTFOLIO NEED quantity initWR
      // was calibrated against: SS + expected rental + other income offset
      // gross spend; housing + carveouts add to it.
      // Planned one-off / periodic expenses (roof, car, wedding). Additive, so
      // the distribution strategy still governs the recurring base — unlike a
      // multi-year CSV, which replaces the spend rule and disables guardrails.
      const ev = computeCashFlowEvents(p.cashFlowEvents, calYear, p.inf ?? 2.5, CURRENT_YEAR);
      const eventCost = ev.total;

      // INFLOWS (lump-sum pension, cash-balance rollover, inheritance, home
      // sale) are DEPOSITED into their bucket so they compound. They must not
      // be netted against spending — `need` is Math.max(0, sp - income), which
      // discards everything past one year's need.
      if (ev.inflow > 0) {
        pretax  += ev.byBucket.pretax  || 0;
        roth    += ev.byBucket.roth    || 0;
        cash    += ev.byBucket.cash    || 0;
        const taxableIn = ev.byBucket.taxable || 0;
        taxable += taxableIn;
        taxableBasis += taxableIn;   // already-taxed money arrives as basis
        totalPort = pretax + roth + taxable + cash;
      }

      // Healthcare shock — stochastic per path, inflated to this year. Treated
      // as a committed cost: a medical bill is not discretionary spending the
      // guardrails may trim.
      const hcShock = healthcareShockDraw(age, rand, p, cumInfl);

      const gkIncomeOffset = ss + rentalForGK + otherIncTotal;
      // Only COMMITTED events are shielded from the guardrails; a deferrable one
      // (a big travel year) is discretionary and may be trimmed like base spend.
      const gkFixedCosts = housingCost + carveoutCost + ev.committed + hcShock;

      // ========== WITHDRAWAL STRATEGY ==========
      if (p.spSchedule && p.spSchedule.length) {
        // A detailed year-by-year budget IS the spending plan: it overrides the
        // distribution strategy's spend rule. Values are nominal for each listed
        // year; beyond the last year the last value carries forward, inflated.
        sp = scheduleSpendForYear(p.spSchedule, calYear, p.inf || 2.5);
      } else if (y === 0) {
        // First year: use target spend (p.sp)
      } else {
        if (withdrawalStrategy === "gk") {
          // Years remaining uses the horizon being simulated (`endAge`), NOT p.endAge —
          // so the GK longevity rule stays consistent with this run's survival test.
          // Reference re-based on THIS year's income so a scheduled pension
          // raise can't masquerade as portfolio outperformance. See gkReferenceWR.
          const refWR = gkReferenceWR({ plannedSpend: p.sp, cumInfl, incomeOffset: gkIncomeOffset, fixedCosts: gkFixedCosts, portAtRetire });
          sp = guytonKlingerWithdrawal(totalPort, refWR, sp, lastReturn, inflY, adjFloor, adjCeiling, endAge - age, gkIncomeOffset, gkFixedCosts);
        }
        else if (withdrawalStrategy === "fixed") {
          // Pure fixed %: draw = rate × port. No GK clamp — that defeats the purpose.
          const fixedRate = p.fixedWithdrawalRate ?? 0.04;
          sp = totalPort * fixedRate;
        }
        else if (withdrawalStrategy === "vpw") {
          // VPW = portfolio amortized over remaining years at an assumed return.
          // Canonical PMT payout rate: r / (1 - (1+r)^(-n)), n = years of payments
          // left. r is a fixed assumption (VPW's defining feature), profile-overridable.
          const rVPW = p.vpwRealReturn ?? 0.0376;
          // Deplete by the PLAN-TO age, not a separate hardcoded 100. vpwEndAge
          // was its own field defaulting to 100, so setting "Plan to age 105"
          // still amortized to 100 — the spend-to-zero answer was five years off
          // and nothing in the UI said so. An explicit vpwEndAge still wins.
          const n = Math.max(1, (p.vpwEndAge ?? endAge ?? 100) - age);
          const rateVPW = rVPW === 0 ? 1 / n : rVPW / (1 - Math.pow(1 + rVPW, -n));
          const newSp = totalPort * Math.min(0.10, rateVPW);
          sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
        }
        else if (withdrawalStrategy === "ninety_five_rule") {
          if (y === 1) {
            sp = p.sp;
          } else {
            const inflated = sp * (1 + inflY);
            const floor95 = sp * 0.95;
            sp = Math.max(floor95, inflated);
          }
          sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
        }
        else if (withdrawalStrategy === "bengen") {
          // Bengen 4% rule (1994): inflation-adjusted constant spending.
          // Does NOT react to portfolio moves — that's the defining feature.
          // Can fail (portfolio depletes). Honest about late-stage risk.
          sp = sp * (1 + inflY);
        }
        else if (withdrawalStrategy === "smart") {
          // Smart Waterfall hybrid:
          //   yearsRemaining > 15  → GK guardrails (adaptive, paper-faithful)
          //   yearsRemaining ≤ 15  → Bengen (inflation-only, no portfolio reaction)
          // The split point matches GK's own longevity-clause threshold so we
          // exit GK exactly where its safety brake would have been disabled.
          // Years remaining uses the simulated horizon (`endAge`), not p.endAge — see gk note above.
          // Bucket sourcing is handled below regardless.
          const yrsRemaining = endAge - age;
          if (yrsRemaining > 15) {
            const refWR2 = gkReferenceWR({ plannedSpend: p.sp, cumInfl, incomeOffset: gkIncomeOffset, fixedCosts: gkFixedCosts, portAtRetire });
            sp = guytonKlingerWithdrawal(totalPort, refWR2, sp, lastReturn, inflY, adjFloor, adjCeiling, yrsRemaining, gkIncomeOffset, gkFixedCosts);
          } else {
            sp = sp * (1 + inflY);
          }
        }
        else {
          // Unreachable while `withdrawalStrategy` comes from resolveStrategy,
          // and deliberately here anyway: an unmatched id used to leave `sp`
          // untouched, which reads as a 1%/yr spending cut rather than an error.
          // Inflation-adjusting is the least-surprising fallback.
          sp = sp * (1 + inflY);
        }
      }
      lastReturn = r;

      // Income from SS and rental/AB. COLA compounds from the claiming age
      // (p.ssAge), not the retirement-year loop counter `y` — someone who
      // retires before claiming SS would otherwise get bogus pre-claim COLA
      // compounding baked into their very first check (matches
      // buildWithdrawalWaterfall.js's `age - ssAge` pattern). ss/totalRental
      // are already computed above (before the strategy block); only the
      // reliability coin-flip and the real effectiveAb need computing here.
      const abReliable = rand() < (p.abReliability || 80) / 100;
      const effectiveAb = (p.abEndYear && calYear > p.abEndYear) ? 0 :
        (abReliable ? totalRental : 0);

      // Blanchett spending smile — a REAL lifestyle curve applied to this
      // year's spend. Deliberately not fed back into `sp`, which is the
      // withdrawal strategy's running state: multiplying that would compound
      // the smile year over year and corrupt GK's own inflation logic. This is
      // an overlay on what the strategy decided, not a change to the strategy.
      const spSmiled = sp * spendingSmileFactor(age, retAgeMC, p.smile !== false);
      const need = Math.max(0, spSmiled - ss - effectiveAb - otherIncTotal) + housingCost + carveoutCost + eventCost + hcShock;
      // §34 — income above spending was DISCARDED by the max(0, …) above while the
      // tax on it was still charged to the portfolio, so received money vanished
      // and assets were sold to pay its bill. Surplus now funds the tax first and
      // the remainder is deposited (see the long note in buildWithdrawalWaterfall).
      const incomeSurplus = Math.max(0,
        (ss + effectiveAb + otherIncTotal) - (spSmiled + housingCost + carveoutCost + eventCost + hcShock));

      // RMD calculation
      let rmd = 0;
      if (age >= rmdStartAge && pretax > 0) {
        let divisor;
        if (useJointTableAt(age) && JOINT_RMD_TABLE[age]) {
          divisor = JOINT_RMD_TABLE[age];
        } else {
          divisor = UNIFORM_TABLE[age] || 15.0;
        }
        rmd = Math.round(pretax / divisor);
      }
      // ── Tax + withdrawal sizing (source-aware, fixed-point) ──────────────
      // Ordinary income = RMD + discretionary pretax draw only; cash/taxable/Roth
      // draws are not ordinary income (LTCG on taxable draws is a documented gap).
      // Taxes depend on the pretax draw, which depends on the total draw size
      // (need + taxes), which depends on taxes — iterate to convergence.
      // RMD proceeds fund spending first; any excess is reinvested in taxable.
      const yr = CURRENT_YEAR + (age - p.currentAge);
      // §22 — TIME-VARYING filing status. This was `p.filingStatus || "mfj"`, a
      // constant, so the survivor's tax bill could not be modelled: on a first
      // death the brackets narrow, the standard deduction roughly halves, the
      // IRMAA tiers halve and the senior bonus halves. Single rule, shared with
      // buildWithdrawalWaterfall via engine/ages.js, or the two engines would
      // describe different households.
      const filingStatus = filingStatusAt(p, age);

      // Sourcing guardrails (bracket cap, IRMAA guard, Roth reserve) are ORTHOGONAL
      // to the distribution strategy — they apply to any strategy once the user has
      // chosen a bracket target. "off" opts out to naive (pretax-first, uncapped).
      // The rooms don't depend on the draw size, so compute them once.
      let bracketRoomMC = Infinity;
      // Either constraint binds INDEPENDENTLY. The IRMAA guard used to sit inside
      // this bracket-target check, so it did nothing whenever the target was
      // "off" — a ghost setting (verified byte-identical with the guard on and
      // off). Decoupled here and in buildWithdrawalWaterfall together, or the two
      // engines disagree, which is the drift class this codebase keeps relearning.
      const bracketSetMC = !!(p.withdrawalBracketTarget && p.withdrawalBracketTarget !== "off");
      const irmaaOnMC    = !!p.irmaaGuard && age >= 63;
      if (bracketSetMC || irmaaOnMC) {
        const inflFactorMC = Math.pow(1 + taxInfl, Math.max(0, yr - CURRENT_YEAR));
        const sdMC = getStandardDeduction(age, filingStatus, inflFactorMC, spouseAgeAt(p, age));
        // 85% SS inclusion is a deliberate worst-case estimate so the cap never overshoots.
        const ordinaryFloorMC = Math.round(ss * 0.85) + rmd + (effectiveAb + otherIncTaxable);
        // Infinity when only the IRMAA guard is on: the min() below then makes the
        // IRMAA tier the sole binding ceiling.
        const ceilingMC = bracketSetMC
          ? getBracketCeiling(p.withdrawalBracketTarget, filingStatus, inflFactorMC)
          : Infinity;
        // The OBBBA senior bonus shelters ordinary income exactly as the standard
        // deduction does, so the bracket room must include it or sourcing will
        // under-fill the bracket that calcYearTax now actually grants. Its
        // phase-out is MAGI-keyed and MAGI rises with the very draw being sized,
        // so estimate the bonus at the HIGH end of this year's plausible MAGI
        // (floor + the room before the bonus) → worst-case phase-out → smallest
        // bonus. Same conservative spirit as the 85% SS inclusion above: the cap
        // can under-fill the bracket but must never overshoot it.
        // The bonus estimate needs a finite ceiling; with no bracket target the
        // IRMAA tier is the only thing that can bind, so use it as the proxy.
        const ceilingForBonusMC = Number.isFinite(ceilingMC)
          ? ceilingMC
          : Math.max(0, getIrmaaCeiling(1, filingStatus, inflFactorMC) - sdMC);
        const roomBeforeBonusMC = Math.max(0, ceilingForBonusMC - Math.max(0, ordinaryFloorMC - sdMC));
        const seniorBonusMC = getSeniorBonusDeduction(
          age, filingStatus, ordinaryFloorMC + roomBeforeBonusMC, yr, spouseAgeAt(p, age)
        );
        const taxableSoFarMC = Math.max(0, ordinaryFloorMC - (sdMC + seniorBonusMC));
        // Bracket room lives in taxable-income space (ceiling is post-deduction).
        bracketRoomMC = Number.isFinite(ceilingMC)
          ? Math.max(0, ceilingMC - taxableSoFarMC)
          : Infinity;
        // IRMAA room lives in MAGI space — do NOT subtract the std deduction. A pretax
        // draw raises taxable income and MAGI by the same dollar, so both rooms cap the
        // same incremental draw; take the tighter. (LTCG from the taxable draw is not
        // yet folded into the MAGI base here — tracked as a known modeling gap.)
        if (irmaaOnMC) {
          const irmaaRoom = Math.max(0, getIrmaaCeiling(1, filingStatus, inflFactorMC) - ordinaryFloorMC);
          bracketRoomMC = Math.min(bracketRoomMC, irmaaRoom);
        }
      }

      const rothFloorMC = p.rothEmergencyReserve || 0;
      // IRMAA 2-year lookback for THIS year's charge: the MAGI from age-2,
      // rolled forward at the bottom of the previous two iterations. The first
      // two retirement years (y < 2) have no pre-retirement wage history to
      // look back on (this engine doesn't model wages), so they fall back to
      // null → calcYearTax uses same-year MAGI, matching the pre-lookback
      // approximation for those two years only.
      const magiLookbackMC = (y >= 2 && typeof magiTwoYearsAgo === "number") ? magiTwoYearsAgo : null;
      let taxResult = null;
      let totalTax = 0;
      let fromCash = 0, fromTaxable = 0, fromPretax = 0, fromRoth = 0;
      let shortfall = 0;
      let earlyPenMC = { penalty: 0, exemptAmount: 0, reason: "" };
      // 12 passes, not 4 — the tax↔draw fixed point converges geometrically at
      // ~the marginal rate (≈0.3×/pass); 4 passes exited ~$100-350 short of the
      // true tax bill every year. The <$1 break makes extra passes free once
      // converged. Matches buildWithdrawalWaterfall's pass cap exactly.
      for (let pass = 0; pass < 12; pass++) {
        // Withdraw from buckets in the user's chosen order (default tax_reactive =
        // cash → taxable → pretax capped → roth). The bracket/IRMAA cap stays on the
        // pretax step and the reserve floor on the roth step wherever each lands.
        // Surplus income funds the tax bill before any asset is sold (§34).
        let remaining = Math.max(0, need + totalTax - rmd - incomeSurplus);
        fromCash = fromTaxable = fromPretax = fromRoth = 0;
        const drawMC = {
          cash:    () => { fromCash    = Math.min(remaining, cash);                                             remaining -= fromCash;    },
          taxable: () => { fromTaxable = Math.min(remaining, taxable);                                          remaining -= fromTaxable; },
          pretax:  () => { fromPretax  = Math.min(Math.min(remaining, bracketRoomMC), Math.max(0, pretax - rmd)); remaining -= fromPretax;  },
          roth:    () => { fromRoth    = Math.min(remaining, Math.max(0, roth - rothFloorMC));                  remaining -= fromRoth;    },
        };
        for (const bucket of drawOrderMC) drawMC[bucket]();

        // ── Essential-spending override (the bracket cap is SOFT) ───────────
        // Mirrors buildWithdrawalWaterfall's override exactly — see the long
        // rationale there. Short version: `bracketRoomMC` decides WHICH dollars
        // to draw, never WHETHER the household eats. A household whose rental /
        // pension income fills the target bracket by itself had zero room, so a
        // mostly-pre-tax portfolio could not be drawn at all, `shortfall` stayed
        // positive, and the path below was marked `survived = false` while
        // holding millions. That is how a ~100% plan reported 3.3%.
        //
        // This MUST live in both engines or they disagree about survival, which
        // is the cross-engine drift this codebase keeps relearning.
        if (remaining > 0.01) {
          const pretaxAvail = Math.max(0, pretax - rmd) - fromPretax;
          if (pretaxAvail > 0) {
            const extra = Math.min(remaining, pretaxAvail);
            fromPretax += extra;
            remaining  -= extra;
            bracketOverrideYears++;
          }
        }
        // Roth emergency reserve, same principle — see the long note in
        // buildWithdrawalWaterfall. A reserve that cannot be reached in an
        // emergency is a vault, and holding it past the point of failure
        // protects the money from its own purpose. Measured before this: a $1.9M
        // reserve on a $2.05M portfolio took success from 100% to 47% while the
        // reserve sat untouched. STRICTLY last, after uncapped pre-tax.
        if (remaining > 0.01 && rothFloorMC > 0) {
          const reserveLeft = Math.max(0, roth - fromRoth);
          if (reserveLeft > 0) {
            const extra = Math.min(remaining, reserveLeft);
            fromRoth  += extra;
            remaining -= extra;
            rothReserveBrokenYears++;
          }
        }
        shortfall = remaining;

        // Realized LTCG on this pass's taxable draw — READ-ONLY off the current
        // (pre-draw) taxable balance/basis; the real `taxableBasis` is mutated
        // exactly once below, after the fixed point converges, using the final
        // fromTaxable (not accumulated pass-by-pass).
        const gPass = realizedGainFromDraw(fromTaxable, taxable, taxableBasis);
        taxResult = calcYearTax(
          age, yr, fromPretax, ss, effectiveAb + otherIncTaxable, rmd, 0,
          p.twoHousehold || false, taxInfl, filingStatus, p.stateOfResidence || "NJ", gPass, magiLookbackMC,
          spouseAgeAt(p, age)
        );
        // IRC §72(t) additional tax on pre-59½ distributions. Inside the fixed
        // point for the same reason as the rest of the bill: a bigger pretax draw
        // owes a bigger penalty, which widens the need, which grows the draw.
        // Without this the MC's success rate rated an early-retirement plan as
        // cheaper than it is, while the waterfall (which does charge it) said
        // otherwise — the two engines must price the same dollars.
        earlyPenMC = earlyWithdrawalPenalty({
          separationQualifies: ruleOf55OkMC,
          age, pretaxDistribution: fromPretax + rmd,
          ruleOf55: p.ruleOf55, ruleOf55Share: ruleOf55ShareMC, retireAge: retAgeMC,
          sepp72t: p.sepp72t, sepp72tStartAge: p.sepp72tStartAge ?? retAgeMC,
        });
        const newTax = taxEnabled ? taxResult.totalTax + earlyPenMC.penalty : 0;
        if (Math.abs(newTax - totalTax) < 1) { totalTax = newTax; break; }
        totalTax = newTax;
      }

      if (shortfall > 0.01) {
        survived = false;
        exhaustAge = age;
        break;
      }

      // Realized gain for the YEAR (final, converged fromTaxable) — the single
      // authoritative value used both to mutate taxableBasis below and to feed
      // the Roth-conversion delta-tax helper further down, so a pure conversion
      // cost isn't polluted by a second, different gain estimate.
      const realizedGainMC = realizedGainFromDraw(fromTaxable, taxable, taxableBasis);

      // Update bucket balances. Excess RMD (forced out beyond what spending and
      // taxes consumed) is reinvested in the taxable bucket, not vaporized.
      const rmdExcess = Math.max(0, rmd - (need + totalTax));
      // Basis consumed by the draw = draw − realized gain (the non-gain, return-of-
      // basis portion); reinvested rmdExcess is fresh money → fresh basis dollar-for-dollar.
      const consumedBasisMC = fromTaxable - realizedGainMC;
      // §34 — surplus left after this year's tax is deposited as basis (already
      // taxed money); only later growth is gain. Mirrors the waterfall exactly.
      const surplusToTaxableMC = Math.max(0, incomeSurplus - Math.max(0, totalTax - rmd));
      taxableBasis = Math.max(0, taxableBasis - consumedBasisMC) + rmdExcess + surplusToTaxableMC;
      cash    = Math.max(0, cash    - fromCash);
      taxable = Math.max(0, taxable - fromTaxable) + rmdExcess + surplusToTaxableMC;
      pretax  = Math.max(0, pretax  - fromPretax - rmd);
      roth    = Math.max(0, roth    - fromRoth);

      // NaN-proof buckets before growth (just in case)
      cash    = isNaN(cash)    ? 0 : cash;
      taxable = isNaN(taxable) ? 0 : taxable;
      pretax  = isNaN(pretax)  ? 0 : pretax;
      roth    = isNaN(roth)    ? 0 : roth;

      // IRMAA lookback history: this year's MAGI, used two years from now.
      // Defaults to the no-conversion taxResult.magi; overwritten below with
      // the post-conversion MAGI when a conversion actually executes (a
      // conversion raises MAGI, so the age+2 IRMAA charge must see it — the
      // conversion CANNOT affect its own year's charge under the lookback).
      let finalMagiMC = taxResult.magi;

      // Bracket-fill Roth conversion (after spending withdrawals, before growth).
      // Bracket ceilings index at the assumed long-run inflation rate, not inflY:
      // compounding a single bootstrapped year's draw over the whole horizon would
      // swing the ceiling wildly with RNG noise.
      if (p.rothConversionTarget && p.rothConversionTarget !== "off" && pretax > 1000) {
        const inflFactor = Math.pow(1 + taxInfl, Math.max(0, yr - CURRENT_YEAR));
        const bracketCeiling = getBracketCeiling(p.rothConversionTarget, filingStatus, inflFactor);
        const room = Math.max(0, bracketCeiling - (taxResult.taxableIncome || 0));
        if (room > 500) {
          let convAmt = Math.min(room, pretax);
          let lastWithConv = null;
          // True conversion cost = the DELTA in total tax vs. the no-conversion tax
          // (correct progressive bracket stacking), not a flat marginal-rate estimate —
          // a single bracket's rate understates cost whenever `room` spans intervening
          // brackets. Mirrors buildWithdrawalWaterfall.js's Step 6.5/7 exactly: recompute
          // full tax with the conversion stacked as ordinary income via calcYearTax's own
          // `conversionAmount` parameter, then take the delta. NOTE: `totalTax` (and
          // `withConv.totalTax`) exclude IRMAA (calcYearTax.totalTax = fedTax+stateTax),
          // so this delta was already a pure fed+state conversion cost before the
          // lookback landed and needs no change now that IRMAA is a fixed, lookback-
          // driven constant for the year — a same-year conversion can't move it.
          const convTaxFor = (amt) => {
            if (!taxEnabled || amt <= 0) return 0;
            // Same realizedGainMC as the spending-draw tax call above — the delta
            // must isolate the conversion's own cost, not a different LTCG estimate.
            // Same magiLookbackMC too, so the (fixed) IRMAA component agrees with
            // taxResult's — it's this year's charge, unaffected by convAmt.
            const withConv = calcYearTax(
              age, yr, fromPretax, ss, effectiveAb + otherIncTaxable, rmd, amt,
              p.twoHousehold || false, taxInfl, filingStatus, p.stateOfResidence || "NJ", realizedGainMC, magiLookbackMC,
              spouseAgeAt(p, age)
            );
            lastWithConv = withConv;
            return Math.max(0, withConv.totalTax - totalTax);
          };
          let convTax = convTaxFor(convAmt);

          // Shrink (rather than all-or-nothing skip) when pretax can't self-fund the
          // conversion plus its incremental tax — converge on the largest amount the
          // remaining pretax balance can afford, mirroring the waterfall's own loop.
          // Who pays the conversion tax — must match buildWithdrawalWaterfall exactly,
          // or the Monte Carlo success rate describes a different plan than the
          // Withdrawal/Conversion tabs. This block used to do `pretax -= convAmt +
          // convTax` unconditionally, ignoring the setting entirely.
          const withholdConvMC = p.taxFunding === "from_conv" || p.taxFunding === "from_conversion";
          const outsideForConvMC = withholdConvMC ? 0 : Math.max(0, taxable) + Math.max(0, cash);

          for (let i = 0; i < 5 && convAmt > 0; i++) {
            const taxOnPretaxMC = withholdConvMC ? 0 : Math.max(0, convTax - outsideForConvMC);
            const needMC = withholdConvMC ? convAmt : convAmt + taxOnPretaxMC;
            const shortfall = needMC - pretax;
            if (shortfall <= 0) break;
            convAmt = Math.max(0, convAmt - shortfall);
            convTax = convTaxFor(convAmt);
          }

          if (convAmt > 500) {
            if (withholdConvMC) {
              // Withheld out of the transfer: gross leaves pretax, net reaches Roth.
              pretax -= convAmt;
              roth   += Math.max(0, convAmt - convTax);
            } else {
              // Real buckets, same order the waterfall uses: taxable -> cash -> pretax.
              let owed = convTax;
              const fromTaxConv  = Math.min(owed, Math.max(0, taxable)); owed -= fromTaxConv;
              const fromCashConv = Math.min(owed, Math.max(0, cash));    owed -= fromCashConv;
              taxable = Math.max(0, taxable - fromTaxConv);
              cash    = Math.max(0, cash    - fromCashConv);
              pretax -= (convAmt + Math.max(0, owed));
              roth   += convAmt;
            }
            if (lastWithConv) finalMagiMC = lastWithConv.magi;
          }
        }
      }

      // Roll the 2-year IRMAA lookback history forward: this year's final MAGI
      // (post-conversion when one executed) becomes "two years ago" once we
      // reach year y+2.
      magiTwoYearsAgo = magiOneYearAgo;
      magiOneYearAgo = finalMagiMC;

      // Apply growth
      cash    = Math.max(0, cash    * (1 + cashRealReturn));
      pretax  = Math.max(0, pretax  * (1 + r));
      roth    = Math.max(0, roth    * (1 + r));
      taxable = Math.max(0, taxable * (1 + r));

      totalPort = pretax + roth + taxable + cash;
      path.push(Math.round(totalPort));

      if (totalPort <= 0 && survived) {
        survived = false;
        exhaustAge = age;
      }
    }
    results.push({ path, survived, exhaustAge, portAtRetire, bracketOverrideYears, rothReserveBrokenYears });
  }

  // Aggregate results
  const pcts = [];
  for (let t = 0; t <= retYrs; t++) {
    // Use ?? 0 so exhausted paths count as $0, not undefined
    const vals = results.map(r => r.path[t] ?? 0).sort((a, b) => a - b);
    const q = pct => vals[Math.floor(pct * (vals.length - 1))];
    // Clamped, matching the drawdown loop that produced `path` — otherwise the
    // fan chart's age axis (and every calendar year derived from it) would start
    // before today for an already-retired user.
    const ageT = retAgeMC + t;
    // Fraction of paths not yet exhausted at this age — feeds the per-age
    // band table under the fan chart. A path counts as funded at ageT if it
    // never exhausted, or exhausted at a later age.
    const alive = results.filter(r => r.exhaustAge == null || r.exhaustAge > ageT).length / N;
    pcts.push({
      age: ageT,
      p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9),
      alive,
    });
  }
  const nS = results.filter(r => r.survived).length;
  // Share of paths that had to break the bracket target at least once to stay
  // funded. A high value means the chosen target is unreachable for this
  // household — usually because non-portfolio income already fills it.
  const bracketOverrideRate = results.filter(r => r.bracketOverrideYears > 0).length / N;
  // Median age at which money ran out, ACROSS FAILING PATHS ONLY. The single most
  // useful number for explaining a low score: "it fails" is not actionable,
  // "it typically fails at 78" is. null when nothing failed.
  const exhaustAges = results.filter(r => !r.survived && Number.isFinite(r.exhaustAge))
    .map(r => r.exhaustAge).sort((a, b) => a - b);
  const medianExhaustAge = exhaustAges.length
    ? exhaustAges[Math.floor(exhaustAges.length / 2)]
    : null;
  const rothReserveBrokenRate = results.filter(r => r.rothReserveBrokenYears > 0).length / N;
  const rV = results.map(r => r.portAtRetire).sort((a, b) => a - b);
  const medR = rV[Math.floor(rV.length / 2)];
  const tV = results.map(r => r.path[r.path.length - 1]).sort((a, b) => a - b);
  const qt = p => tV[Math.floor(p * (tV.length - 1))];
  // Mortality-weighted success: a failed path only fails YOU if you're alive
  // to experience it. Weight each failure by P(alive at its exhaust age),
  // from the same SSA table the fan chart's mortality overlay uses. The raw
  // `rate` is the conservative "live to the horizon" number; `mwRate` is the
  // actuarial "chance the money outlives you" number (Blanchett/Kitces-style).
  // mwRate >= rate always, since each failure's weight is <= 1.
  const failSurvivalSum = results.reduce(
    (s, r) => s + (r.survived ? 0 : survivalToAge(p.currentAge, r.exhaustAge ?? endAge, p.sex)),
    0
  );
  const mwRate = 1 - failSurvivalSum / N;
  return {
    rate: nS / N,
    bracketOverrideRate,
    rothReserveBrokenRate,
    medianExhaustAge,
    mwRate,
    pcts,
    medR,
    term: { p10: qt(0.1), p25: qt(0.25), p50: qt(0.5), p75: qt(0.75), p90: qt(0.9) },
    N,
  };
}

// Stress Test = the SAME engine as runMC, with the 2000–2012 equity sequence forced
// at retirement (sequence-of-returns risk). Delegating to runMC — rather than carrying
// a parallel implementation — guarantees one tax model, one sourcing waterfall, and one
// RMD/strategy code path across the Monte Carlo, the deterministic schedule, and the
// stress pivot. The non-resident/state-tax toggle, IRMAA, SS torpedo, and bracket caps
// now propagate to the stress number automatically; no field can read differently here
// than anywhere else. (Previously this used a flat taxDragRate heuristic that ignored
// p.twoHousehold, so the toggle had no effect on the stress success rate.)
function runStress(p, endAge, N = STRESS_PATHS, seed = 99) {
  return runMC(p, endAge, N, seed, true, SEQ_2000_2012);
}

/* ════ DETERMINISTIC WITHDRAWAL SCHEDULE (median returns) ════ */

function simulateDeterministicWithStrategy(p, inf, strategyArg) {
  // The strategy arrives as an ARGUMENT here (the Withdrawal tab passes its
  // preview selection, not p.withdrawalStrategy), so it needs its own guard —
  // migrating the saved profile is not enough to protect this entry point.
  const withdrawalStrategy = resolveStrategy(strategyArg ?? p.withdrawalStrategy);
  // Smart Waterfall: source the schedule directly from buildWithdrawalWaterfall's
  // "smart" scenario — the single source of truth for bucket draws, Roth
  // conversions, mortgage/carveout costs, and source-aware tax. This is the
  // real-life year-by-year plan, not a re-derived approximation.
  if (withdrawalStrategy === "smart") {
    const wf = buildWithdrawalWaterfall(p);
    const { total: portAtRetire } = accumulateToRetirement(p);
    const schedule = (wf?.smart?.rows ?? []).map((r) => ({
      age: r.age, yr: r.yr,
      spending: r.spending,
      ss: r.ss, Rental: r.annuityRental, OtherIncome: r.otherIncome,
      portfolioDraw: r.needFromPort,
      housingCost: r.housingCost,
      carveoutCost: r.carveoutCost,
      healthcareRisk: r.healthcareRisk,
      conversionAmount: r.conversionAmount,
      // Carried so this table can disclose the same reconciliation the Withdrawal
      // Plan table does. It shows the identical conversion figure, so it invites
      // the identical (wrong) comparison against a nominal published bracket top.
      bracketTopYr: r.bracketTopYr, stdDedYr: r.stdDedYr,
      taxableIncome: r.taxableIncome, totInc: r.totInc,
      marginalBracket: r.marginalBracket, convCapReason: r.convCapReason,
      fedTax: r.fedTax,
      stateTax: r.stateTax,
      irmaa: r.irmaa,
      totalTax: r.totalTax,
      totalWithdrawal: r.totalWithdrawal,
      portfolioEnd: r.totalPort,
    }));
    const initWR = portAtRetire > 0 ? Math.max(0, p.sp - (schedule[0]?.ss || 0) - (schedule[0]?.Rental || 0) - (schedule[0]?.OtherIncome || 0)) / portAtRetire : 0.04;
    return { schedule, portAtRetire: Math.round(portAtRetire), initWR };
  }

  // Clamped for already-retired users — see effectiveRetireAge.
  const retAgeDet = effectiveRetireAge(p.retireAge, p.currentAge);
  // Same resolved switch age runMC uses, so the deterministic table and the
  // Monte Carlo it sits beside model the same investor (this engine used to
  // hardcode 62 in its retirement loop).
  const glideSwitchAgeDet = resolveGlidepathSwitchAge({ ...p, retireAge: retAgeDet });
  const accYrs = Math.max(0, retAgeDet - p.currentAge);
  // §30 — same horizon rule as runMC.
  const planEndDet = planEndAgeOnPrimaryClock(p, p.endAge);
  const retYrs = planEndDet - retAgeDet;
  let port = p.port;

  // Accumulation using median returns
  for (let y = 0; y < accYrs; y++) {
    const ret = expectedReturn(glidepathEqPct(p.currentAge + y, p.preRetireEq, p.postRetireEq, glideSwitchAgeDet)) / 100;
    // Aggregate portfolio here (no per-bucket split in this engine), but the
    // total must include every contribution stream runMC applies or the two
    // engines report different portfolio-at-retirement figures.
    // Job-bound streams via the shared §24.1 helper — same per-person stop rule
    // runMC applies, or the two engines report different portfolio-at-retirement
    // figures the moment a spouse retires first.
    const jcDet = jobContributionsForYear(p, p.currentAge + y);
    port = port * (1 + ret)
      + jcDet.pretax + jcDet.roth + (p.hsaContrib || 0)
      + (p.taxableContrib || 0);
    // Pre-retirement one-off inflows (inheritance, lump-sum pension) are
    // deposited like contributions — same fix as runMC's accumulation loop;
    // this engine tracks one aggregate portfolio, so the inflow simply adds.
    const evAccDet = computeCashFlowEvents(p.cashFlowEvents, CURRENT_YEAR + y, p.inf ?? 2.5, CURRENT_YEAR);
    if (evAccDet.inflow > 0) port += evAccDet.inflow;
  }

  const portAtRetire = port;
  // Precompute the actual annual mortgage cash cost per calendar year (incl.
  // extra payments and the partial payoff year, same model as
  // buildWithdrawalWaterfall/runMC — Fix 1).
  let mortByYear = new Map();
  if (p.mortBalance > 0) {
    const ms = mortgageSchedule(p.mortBalance, p.mortRate || 6.5, p.mortStart || "2020-01", p.mortTerm || 30, p.mortExtra || 0);
    mortByYear = mortgageAnnualPayments(ms);
  }
  const gkFloor = p.gkFloor || GK_FLOOR_FALLBACK;
  const gkCeiling = p.gkCeiling || GK_CEILING_FALLBACK;
  // Baseline initWR = NET PORTFOLIO NEED at retirement / portfolio — NO tax,
  // same quantity the yearly loop's GK netNeed offset computes (mirrors
  // runMC/buildWithdrawalWaterfall's calibration). ab0 includes propIncome to
  // match this engine's own `ab` term in the yearly loop below.
  const ss0 = computeHouseholdSS(p, retAgeDet);
  const ab0 = (p.ab > 0 ? p.ab : 0) + (p.propIncome || 0);
  const calYear0 = CURRENT_YEAR + (retAgeDet - p.currentAge);
  const { total: otherInc0 } = computeOtherIncome(p.otherIncomes, calYear0);
  const housingType0 = p.housingType || "own";
  let housing0 = 0;
  if (housingType0 === "own") {
    housing0 = mortByYear.get(calYear0) || 0;
  } else if (housingType0 === "rent") {
    housing0 = Math.round(p.annualRent || 0);
  }
  const carveout0 = (p.carveouts || []).reduce((sum, c) => {
    return sum + (calYear0 <= (c.endYear || 9999) ? Math.round(c.annual || 0) : 0);
  }, 0);
  const initNeed0 = Math.max(0, p.sp - ss0 - ab0 - otherInc0) + housing0 + carveout0;
  const initWR = portAtRetire > 0 ? initNeed0 / portAtRetire : 0.04;
  // Source-aware tax: reuse the Smart Waterfall engine so the tax column here
  // matches what the Waterfall tab shows for the same age. The waterfall knows
  // each account type (cash / taxable / pretax / roth) and only treats pretax
  // draws as ordinary income — without this override, calcYearTax would treat
  // every portfolio draw as ordinary income, overstating fed tax dramatically
  // for years that draw from taxable brokerage or Roth.
  const smartTaxByAge = new Map();
  try {
    const wf = buildWithdrawalWaterfall(p);
    for (const row of wf?.smart?.rows ?? []) {
      smartTaxByAge.set(row.age, {
        fedTax: row.fedTax || 0,
        stateTax: row.stateTax || 0,
        irmaa: row.irmaa || 0,
        totalTax: row.totalTax || 0,
      });
    }
  } catch { /* fall back to calcYearTax below */ }

  // Same "Tax drag" master toggle as runMC — OFF zeroes all tax so the deterministic
  // table matches the MC/Stress pivots under a pre-tax view (CLAUDE.md uniformity).
  const taxEnabled = p.tax !== false;

  // ── §35: the year loop runs TWICE ─────────────────────────────────────────
  // The tax columns are borrowed from buildWithdrawalWaterfall, which is right
  // — the waterfall is account-aware, so only pre-tax draws are ordinary
  // income, whereas calcYearTax on an aggregate draw treats every dollar as
  // ordinary and overstates tax badly. The bug was that the waterfall taxed ITS
  // OWN spend path (the GK/Bengen hybrid) no matter which strategy was
  // selected, so the draw on screen and the tax beside it described different
  // plans. Measured before this fix: five strategies drawing between $2.28M and
  // $3.45M over a lifetime all displayed the same $210,686 of tax.
  //
  // So: pass 1 discovers THIS strategy's spend path, the waterfall is re-run
  // against that path, and pass 2 uses the resulting per-age tax.
  //
  // Everything the loop mutates (`port`, `sp`, `lastReturn`, `schedule`) is
  // declared inside runPass, so a second call starts from the same state as the
  // first. `portAtRetire` is the accumulation result and is read-only here.
  const runPass = (taxByAge) => {
  let port = portAtRetire;
  let sp = p.sp;
  let lastReturn = 0;
  const schedule = [];
  // Pre-smile spend per calendar year — the input to pass 2's waterfall.
  // PRE-smile is load-bearing: buildWithdrawalWaterfall applies
  // spendingSmileFactor AFTER its spSchedule override, so feeding back the
  // post-smile `spending` field would apply the smile twice. Measured on a
  // $1.5M/$80k profile: $20,913 too little at age 80.
  const spByYear = [];

  for (let y = 0; y < retYrs; y++) {
    const age = retAgeDet + y;
    const yr = CURRENT_YEAR + (age - p.currentAge);
    const ret = expectedReturn(glidepathEqPct(age, p.preRetireEq, p.postRetireEq, glideSwitchAgeDet)) / 100;
    const inflY = inf / 100;
    const cumInfl = Math.pow(1 + inflY, y);
    const adjFloor = gkFloor * cumInfl;
    const adjCeiling = gkCeiling * cumInfl;

    // Deterministic income/fixed-cost pieces — moved above the strategy switch
    // so GK's netNeed offset can use this year's own figures (no rand() in
    // this engine, so there's no draw-order concern to preserve here).
    // COLA compounds from the claiming age (p.ssAge), not the retirement-year
    // loop counter `y` — see runMC's identical fix above.
    const ss = computeHouseholdSS(p, age);
    const growthFactor = Math.pow(1 + (p.abGrowth || 3)/100, Math.min(y, 20));
    const rawAb = Math.round(((p.ab > 0 ? p.ab : 0) + (p.propIncome || 0)) * growthFactor);
    const ab = (p.abEndYear && yr > p.abEndYear) ? 0 : rawAb;
    const { total: otherIncTotal } = computeOtherIncome(p.otherIncomes, yr);

    // Housing cost: mortgage cash cost while active, or inflation-adjusted rent
    // — same model as buildWithdrawalWaterfall's Step 1 (ENG-19).
    let housingCost = 0;
    if ((p.housingType || "own") === "own") {
      housingCost = mortByYear.get(yr) || 0;
    } else if (p.housingType === "rent") {
      housingCost = Math.round((p.annualRent || 0) * cumInfl);
    }
    const carveoutCost = (p.carveouts || []).reduce((sum, c) => {
      return sum + (yr <= (c.endYear || 9999) ? Math.round((c.annual || 0) * cumInfl) : 0);
    }, 0);

    // GK's netNeed income offset — same NET PORTFOLIO NEED quantity initWR
    // was calibrated against.
    const evDet = computeCashFlowEvents(p.cashFlowEvents, yr, p.inf ?? 2.5, CURRENT_YEAR);
    const eventCostDet = evDet.total;
    // This engine tracks one aggregate portfolio, so an inflow simply adds to
    // it; the per-bucket routing that matters for tax lives in runMC and
    // buildWithdrawalWaterfall.
    if (evDet.inflow > 0) port += evDet.inflow;

    // ADVISORY ONLY — deliberately NOT charged to this year's draw. See the
    // matching note in buildWithdrawalWaterfall: this is E[X] on a MEDIAN path,
    // and this table is what a real person enacts. At the default 3.5%/yr the
    // median shock is $0, so charging $3,500 produced a withdrawal figure that
    // is wrong in every actual year. runMC still draws it stochastically, so
    // the success rate beside this table continues to price the risk.
    const hcRiskDet = expectedHealthcareShock(age, p, cumInfl);

    const gkIncomeOffset = ss + ab + otherIncTotal;
    const gkFixedCosts = housingCost + carveoutCost + evDet.committed;

    // Apply withdrawal strategy (deterministic version)
    if (p.spSchedule && p.spSchedule.length) {
      // Detailed budget overrides the distribution strategy (see runMC note).
      sp = scheduleSpendForYear(p.spSchedule, yr, p.inf || 2.5);
    } else if (y === 0) {
      // first year: use target spend
    } else {
      if (withdrawalStrategy === "gk") {
        const refWRd = gkReferenceWR({ plannedSpend: p.sp, cumInfl, incomeOffset: gkIncomeOffset, fixedCosts: gkFixedCosts, portAtRetire });
        sp = guytonKlingerWithdrawal(port, refWRd, sp, lastReturn, inflY, adjFloor, adjCeiling, p.endAge - age, gkIncomeOffset, gkFixedCosts);
      }
      else if (withdrawalStrategy === "fixed") {
        // Pure fixed %: draw = rate × port. No GK clamp.
        const fixedRate = p.fixedWithdrawalRate ?? 0.04;
        sp = port * fixedRate;
      }
      else if (withdrawalStrategy === "vpw") {
        // VPW PMT payout rate: r / (1 - (1+r)^(-n)). Must match runMC exactly.
        const rVPW = p.vpwRealReturn ?? 0.0376;
        // Follows Plan-to age — see the matching note in runMC.
        const n = Math.max(1, (p.vpwEndAge ?? p.endAge ?? 100) - age);
        const rate = rVPW === 0 ? 1 / n : rVPW / (1 - Math.pow(1 + rVPW, -n));
        const newSp = port * Math.min(0.10, rate);
        sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
      }
      else if (withdrawalStrategy === "ninety_five_rule") {
        if (y === 1) sp = p.sp;
        else {
          const inflated = sp * (1 + inflY);
          const floor95 = sp * 0.95;
          sp = Math.max(floor95, inflated);
        }
        sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
      }
      else if (withdrawalStrategy === "bengen") {
        // Bengen 4% rule: inflation-adjusted constant. Does not react to portfolio.
        sp = sp * (1 + inflY);
      }
      else if (withdrawalStrategy === "smart") {
        // Smart Waterfall hybrid: GK when yearsRemaining > 15, Bengen when ≤ 15.
        // The split matches GK's longevity-clause threshold so we exit GK
        // exactly where its safety brake would otherwise be disabled.
        const yrsRemaining = p.endAge - age;
        if (yrsRemaining > 15) {
          const refWRd2 = gkReferenceWR({ plannedSpend: p.sp, cumInfl, incomeOffset: gkIncomeOffset, fixedCosts: gkFixedCosts, portAtRetire });
          sp = guytonKlingerWithdrawal(port, refWRd2, sp, lastReturn, inflY, adjFloor, adjCeiling, yrsRemaining, gkIncomeOffset, gkFixedCosts);
        } else {
          sp = sp * (1 + inflY);
        }
      }
      else {
        // Unreachable via resolveStrategy; see the matching note in runMC.
        sp = sp * (1 + inflY);
      }
    }
    lastReturn = ret;

    // Blanchett spending smile — a REAL lifestyle curve applied to this
    // year's spend. Deliberately not fed back into `sp`, which is the
    // withdrawal strategy's running state: multiplying that would compound
    // the smile year over year and corrupt GK's own inflation logic. This is
    // an overlay on what the strategy decided, not a change to the strategy.
    const spSmiledDet = sp * spendingSmileFactor(age, retAgeDet, p.smile !== false);
    // hcRiskDet is NOT in this sum — see its declaration above. Every term here
    // is a cash obligation the user actually pays this year.
    const need = Math.max(0, spSmiledDet - ss - ab - otherIncTotal) + housingCost + carveoutCost + eventCostDet;
    // §34 — this engine tracks ONE aggregate portfolio, so surplus income simply
    // stays invested rather than evaporating. Same rule as the other two engines
    // or they disagree about the balance, which is the drift class this codebase
    // keeps relearning.
    const incomeSurplusDet = Math.max(0,
      (ss + ab + otherIncTotal) - (spSmiledDet + housingCost + carveoutCost + eventCostDet));

    // Prefer the Smart Waterfall's source-aware tax (matches the Waterfall tab) —
    // this path automatically carries LTCG/cost-basis AND the IRMAA 2-year lookback
    // since buildWithdrawalWaterfall now models both. Fall back to the legacy "treat
    // everything as ordinary income" calc only when no waterfall row exists for this
    // age (e.g. accounts not configured); that fallback has no taxable-bucket split
    // (ltcgAmount defaults to 0) and no lookback history to thread through (magiLookback
    // defaults to null → same-year MAGI, the pre-lookback approximation) — both left
    // unchanged, out of scope here.
    const wfTax = taxByAge.get(age);
    const taxResult = wfTax ?? calcYearTax(age, yr, need, ss, ab, 0, 0, p.twoHousehold || false, inflY, filingStatusAt(p, age), p.stateOfResidence || "NJ", 0, null, spouseAgeAt(p, age));
    const totalTax = taxEnabled ? taxResult.totalTax : 0;
    const totalDraw = need + totalTax;
    // §34 — surplus income stays invested instead of evaporating. `totalDraw`
    // already includes this year's tax, so a household whose income covers both
    // its spending and its tax bill now ENDS RICHER, as it should.
    port = port * (1 + ret) - totalDraw + incomeSurplusDet;

    // PRE-smile, and one entry for EVERY plan year. Full coverage is the other
    // half of the trap: scheduleSpendForYear carries the last entry forward
    // INFLATED, so a sparse schedule would inflate an already-nominal figure a
    // second time. With an entry per year, `elapsed` is always 0 and each value
    // comes back verbatim (verified in deterministicTaxPath.test.js).
    spByYear.push({ year: yr, amount: Math.round(sp) });

    schedule.push({
      age, yr,
      spending: Math.round(spSmiledDet),
      ss, Rental: ab, OtherIncome: Math.round(otherIncTotal),
      portfolioDraw: Math.round(need),
      housingCost: Math.round(housingCost),
      carveoutCost: Math.round(carveoutCost),
      // Advisory, NOT included in portfolioDraw/totalWithdrawal above.
      healthcareRisk: Math.round(hcRiskDet),
      conversionAmount: 0,
      fedTax: taxEnabled ? taxResult.fedTax : 0,
      stateTax: taxEnabled ? taxResult.stateTax : 0,
      irmaa: taxEnabled ? taxResult.irmaa : 0,
      totalTax,
      totalWithdrawal: Math.round(totalDraw),
      portfolioEnd: Math.max(0, Math.round(port)),
    });
    if (port <= 0) break;
  }
  return { schedule, spByYear };
  };

  // Pass 1 — the strategy's own spend path, still carrying the waterfall's
  // default-path tax. Its DRAWS are already correct; only its tax is borrowed
  // from the wrong plan.
  const pass1 = runPass(smartTaxByAge);

  // When the user has supplied a detailed budget, that budget already overrides
  // the distribution strategy in BOTH engines — the waterfall is taxing this
  // exact spend path already, so a second pass would recompute the same numbers
  // and risk clobbering the user's own schedule. Nothing to reconcile.
  if (p.spSchedule && p.spSchedule.length) {
    return { schedule: pass1.schedule, portAtRetire: Math.round(portAtRetire), initWR };
  }

  // Re-run the waterfall against THIS strategy's spending, then replay the year
  // loop with the tax that produces.
  //
  // Single iteration, deliberately. Pass 2's tax differs slightly from pass 1's,
  // which changes the portfolio, which changes next year's spend for the
  // portfolio-linked strategies (fixed, vpw). That residual is second-order and
  // far smaller than the defect being fixed, but it is a residual: the tax
  // column is now computed against this strategy's spending, not proven to be
  // its exact fixed point.
  let pass2 = null;
  try {
    const wf2 = buildWithdrawalWaterfall({ ...p, spSchedule: pass1.spByYear });
    const taxByAge2 = new Map();
    for (const row of wf2?.smart?.rows ?? []) {
      taxByAge2.set(row.age, {
        fedTax: row.fedTax || 0,
        stateTax: row.stateTax || 0,
        irmaa: row.irmaa || 0,
        totalTax: row.totalTax || 0,
      });
    }
    // Only accept the second pass if it actually produced tax rows. An empty
    // map would silently drop every row back to the calcYearTax fallback, which
    // treats all draws as ordinary income — worse than the bug being fixed.
    if (taxByAge2.size > 0) pass2 = runPass(taxByAge2);
  } catch { /* keep pass 1 */ }

  const finalSchedule = (pass2?.schedule?.length ? pass2 : pass1).schedule;
  return { schedule: finalSchedule, portAtRetire: Math.round(portAtRetire), initWR };
}

/* ════ ROTH CONVERSION EXPLORER ════ */
// 2026 MFJ federal brackets (inflation-adjusted from 2025)
const FED_BRACKETS_2026_MFJ = [
  { lo: 0,       hi: 24800,  rate: 0.10 },
  { lo: 24800,   hi: 100800, rate: 0.12 },
  { lo: 100800,  hi: 211400, rate: 0.22 },
  { lo: 211400,  hi: 403550, rate: 0.24 },
  { lo: 403550,  hi: 512450, rate: 0.32 },
  { lo: 512450,  hi: 768700, rate: 0.35 },
  { lo: 768700,  hi: Infinity, rate: 0.37 },
];
// 2026 Single filer federal brackets (~half the MFJ thresholds)
const FED_BRACKETS_2026_SINGLE = [
  { lo: 0,      hi: 12400,  rate: 0.10 },
  { lo: 12400,  hi: 50400,  rate: 0.12 },
  { lo: 50400,  hi: 105700, rate: 0.22 },
  { lo: 105700, hi: 201800, rate: 0.24 },
  { lo: 201800, hi: 256225, rate: 0.32 },
  { lo: 256225, hi: 640600, rate: 0.35 },
  { lo: 640600, hi: Infinity, rate: 0.37 },
];
const IRMAA_2026 = [
  { m: 218000, f: 0 },
  { m: 274000, f: 2160 },
  { m: 342000, f: 5470 },
  { m: 410000, f: 8300 },
  { m: 750000, f: 11130 },
];
// IRS Pub 590-B Table III (Uniform Lifetime) divisors, 2022+ table.
// Default table for owners whose sole-beneficiary spouse is NOT >10 years younger.
// (The >10-years-younger Joint & Last Survivor case uses JOINT_RMD_TABLE above.)
const RMD_DIV = {
  72: 27.4,
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
};

function progTax(ti, br) {
  let t = 0;
  for (const b of br) {
    if (ti <= b.lo) break;
    t += Math.max(0, Math.min(ti, b.hi) - b.lo) * b.rate;
  }
  return t;
}
function idxB(br, f) {
  return br.map((b) => ({
    lo: Math.round(b.lo * f),
    hi: b.hi === Infinity ? Infinity : Math.round(b.hi * f),
    rate: b.rate,
  }));
}
/**
 * @param {number|null} beneficiaries  How many people in the household are
 *   actually ON Medicare this year (i.e. 65+). IRMAA thresholds are per TAX
 *   RETURN — they stay keyed to filing status — but the surcharge is per
 *   BENEFICIARY, so a couple where only one has reached 65 pays one surcharge
 *   against the MFJ threshold. Previously MFJ always charged two, which
 *   overstated Medicare cost for the whole age gap. `null` keeps the old
 *   assumption (2 for MFJ, 1 for single) for callers with no spouse age.
 */
function irmaaCost(magi, yr, infR = 0.025, isMFJ = true, beneficiaries = null) {
  const f = Math.pow(1 + (isNaN(infR) ? 0.025 : infR), yr - CURRENT_YEAR);
  // IRMAA_2026[i].f is the TWO-person MFJ surcharge, so half of it is one person's.
  const n = beneficiaries != null ? Math.max(0, beneficiaries) : (isMFJ ? 2 : 1);
  if (n === 0) return 0;
  for (let i = IRMAA_2026.length - 1; i >= 0; i--) {
    // Single tiers are half the MFJ thresholds, except the top tier ($500,000 vs $750,000).
    const thresh = isMFJ ? IRMAA_2026[i].m
      : (i === IRMAA_2026.length - 1 ? 500_000 : IRMAA_2026[i].m / 2);
    const cost = (IRMAA_2026[i].f / 2) * n;
    if (magi >= thresh * f) return Math.round(cost * f);
  }
  return 0;
}

const ROTH_BASE_YEAR = new Date().getFullYear();

/**
 * SECURE Act 2.0 RMD start age.
 * Born before 1951 → 72 (pre-SECURE 2.0 transition)
 * Born 1951–1959  → 73
 * Born 1960+      → 75
 * Accepts either a birth year (number) or an ISO dob string ("YYYY-MM-DD").
 */
function getRmdStartAge({ dob, birthYear, currentAge } = {}) {
  let by = null;
  if (typeof birthYear === "number" && birthYear > 0) by = birthYear;
  else if (typeof dob === "string" && dob.length >= 4) {
    const y = parseInt(dob.slice(0, 4), 10);
    if (!isNaN(y)) by = y;
  } else if (typeof currentAge === "number" && currentAge > 0) {
    by = ROTH_BASE_YEAR - currentAge;
  }
  if (by === null) return 73; // safe default
  if (by >= 1960) return 75;
  if (by >= 1951) return 73;
  return 72;
}

/* ════ DISCLAIMERS ════ */
/**
 * Section-level "this is a projection, not advice" notice.
 *
 * The footer disclaimer covers the app, but a user who lands on a results tab,
 * reads a success rate or a year-by-year withdrawal table, and acts on it may
 * never scroll to the footer at all. The two surfaces that most resemble advice
 * — a probability of success, and a schedule saying how much to take from which
 * account — carry it inline, next to the number rather than a page away.
 *
 * One component, not a retyped string, so the wording cannot drift between
 * sections. Deliberately always visible: a disclaimer behind a hover tooltip is
 * unreachable on touch, which is the same defect documented for help text.
 */
function SectionDisclaimer({ children }) {
  return (
    <div
      role="note"
      style={{
        fontSize: 11,
        lineHeight: 1.6,
        color: "#94a3b8",
        background: "rgba(251,191,36,0.06)",
        border: "1px solid rgba(251,191,36,0.22)",
        borderRadius: 8,
        padding: "9px 12px",
      }}
    >
      <strong style={{ color: "#fbbf24" }}>Not financial advice.</strong> {children}
    </div>
  );
}

/* ════ ICONS ════ */
/**
 * Info icon, drawn as SVG rather than the Unicode "ⓘ" (U+24D8) it replaces.
 *
 * The glyph looked wrong for reasons no amount of CSS could fix: its shape comes
 * from whatever font happens to resolve it, so the circle's weight, diameter and
 * baseline offset all changed between platforms and between the app's two
 * typefaces. At the 10–11px it was used at, the ring rendered hairline-thin and
 * sat a pixel or two above the text it annotated. A vector draws identically
 * everywhere, stays crisp at any size, and lines up on the text baseline.
 *
 * Inherits color through `currentColor`, so callers keep styling it with plain
 * `color` — including hover transitions — exactly as they did the glyph.
 */
function InfoIcon({ size = 14, title, style }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      fill="none" aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      style={{ flexShrink: 0, verticalAlign: "-0.15em", ...style }}
    >
      {title && <title>{title}</title>}
      <circle cx="8" cy="8" r="6.9" stroke="currentColor" strokeWidth="1.3" opacity="0.75" />
      <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
      <path d="M8 7.15v4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The standard hoverable info affordance: an InfoIcon in a muted circular well
 * that brightens on hover, with the explanation as a native tooltip. Replaces
 * the hand-rolled `infoDot` style object that was retyped at each call site.
 */
function InfoDot({ title, size = 14, color = "var(--text-secondary)", hoverColor = "#e2e8f0" }) {
  const [hover, setHover] = useState(false);
  return (
    <span
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size + 6, height: size + 6, borderRadius: "50%",
        background: hover ? "rgba(255,255,255,0.16)" : "var(--card-border)",
        color: hover ? hoverColor : color,
        cursor: "help", transition: "background 0.15s, color 0.15s",
      }}
    >
      <InfoIcon size={size} />
    </span>
  );
}

/* ════ FORMATTERS ════ */
/* The one money formatter. Whole dollars, grouped, no abbreviation — ever.
 * There used to be `fmtK` and `fmtM` alongside this, byte-identical to it and
 * to each other. Three names implying three formats invited exactly one bug:
 * something that actually abbreviated (`landingMoney`, v1.2.37) reading as
 * normal because "we have a K formatter". Retirement numbers are compared, not
 * skimmed — $1,049,999 shown as "$1.0M" hides $50K. One name, one format. */
const fmtDollar = (v) => `$${Math.round(v).toLocaleString()}`;
/* Upper bound for any typed DOLLAR field. ANumInput clamps to `max` on blur, so
 * a tight max silently rewrites what the user entered — the $10M cap on the
 * portfolio target turned a $100M plan into a $10M one with no warning. Input
 * validation must not encode an assumption about how rich the user is; that is a
 * presentation concern, not a data one. Deliberately not applied to fields with
 * a statutory ceiling (401k/Roth/HSA contributions, SS benefit) or to rates,
 * percentages and ages, where the bound is real domain validation. */
const MAX_MONEY_INPUT = 1_000_000_000;
/* Gutter for a Y axis labelled in whole dollars. The per-chart widths used to be
 * 46–58px, which clipped seven-figure ticks by 4–6px ("$2,184,596" measures 57px
 * at fontSize 9) — a silently truncated axis number is worse than a wide gutter.
 * Sized for nine figures, since portfolios up to $250M are now enterable. */
const MONEY_AXIS_WIDTH = 78;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;

// Appending hex alpha to a colour (`${c}44`) works only when `c` is a hex
// literal. The §37 token migration turned many colour sources into design
// tokens, and "var(--positive)44" is not a colour — the browser drops the whole
// declaration, so the tint and border silently vanish. Because several of these
// sources are ternaries that return a token on one branch and a raw hex on
// another (rateColor, wrColor), the SAME card renders bordered at one value and
// borderless at another, which is how this survived: it looks like a theme quirk,
// not a bug. color-mix handles tokens; hex inputs keep their exact prior string.
export const withAlpha = (color, hexAlpha) => {
  if (typeof color !== "string" || !color.includes("var(")) return `${color}${hexAlpha}`;
  const pct = Math.round((parseInt(hexAlpha, 16) / 255) * 1000) / 10;
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
};

/* ════ NUMERIC ENTRY ════
 * The one parser every typed number field uses. People paste what they see —
 * "$1,250,000" — and type shorthand — "1.25M", "750k". Raw `Number()` returns
 * NaN for all of those, and a field that drops NaN on the floor silently
 * discards the entry and snaps back to the old value on blur. That reads as
 * the app eating your data, with no error to explain it.
 *
 * Returns null when the text genuinely isn't a number, so the caller can leave
 * the existing value alone. Finiteness is checked explicitly because
 * `Number("1e999")` is Infinity and PASSES `!isNaN` — Infinity in a balance
 * renders as "∞" and poisons every projection downstream of it. */
function parseNumericEntry(text) {
  const cleaned = String(text).trim().replace(/[$,%\s]/g, "");
  if (!cleaned) return null;
  const suffix = /[mk]$/i.test(cleaned);
  const mult = suffix ? (/m$/i.test(cleaned) ? 1e6 : 1e3) : 1;
  const n = Number(suffix ? cleaned.slice(0, -1) : cleaned);
  return Number.isFinite(n) ? n * mult : null;
}
/* Whole dollars at or above `min`. Returns null when the text isn't a number,
 * so the caller leaves the existing value untouched. */
function parseMoneyInput(text, min) {
  const n = parseNumericEntry(text);
  return n === null ? null : Math.max(min, Math.round(n));
}
/* All analogies in the band the rate falls into (band = highest `min` ≤ rate).
 * Exported for tests. The array is ordered highest-band-first, so the first
 * match's `min` identifies the band. */
export function getAnalogues(rate) {
  const pct = rate * 100;
  const first = ANALOGUES.find((a) => pct >= a.min) || ANALOGUES[ANALOGUES.length - 1];
  return ANALOGUES.filter((a) => a.min === first.min);
}

function getAnalogue(rate) {
  return getAnalogues(rate)[0];
}

/* Revolving analogy card — cycles through every analogy in the current band so
 * users see several independent real-world reference points for the same
 * number, each with its own (approximate, defensible) probability. Click
 * advances immediately; auto-advances every 7s. */
function RotatingAnalogue({ rate, endAge }) {
  const pool = getAnalogues(rate);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [rate]);
  useEffect(() => {
    if (pool.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % pool.length), 7000);
    return () => clearInterval(t);
  }, [pool.length, rate]);
  const a = pool[idx % pool.length];
  return (
    <div
      className="analogue"
      onClick={() => pool.length > 1 && setIdx((i) => (i + 1) % pool.length)}
      style={{ cursor: pool.length > 1 ? "pointer" : "default" }}
      title={pool.length > 1 ? "Click for another comparison" : undefined}
    >
      <span key={idx} className="analogue-fade" style={{ display: "inline" }}>
        {a.emoji} “{a.text}{a.stat ? ` (${a.stat})` : ""}.” — your plan: {fmtPct(rate)} to age {endAge}.
      </span>
      {pool.length > 1 && (
        <span style={{ marginLeft: 8, whiteSpace: "nowrap" }}>
          {pool.map((_, i) => (
            <span key={i} style={{ color: i === idx % pool.length ? "var(--text-secondary)" : "#334155", fontSize: 9, marginRight: 3 }}>●</span>
          ))}
        </span>
      )}
    </div>
  );
}

function useCountdown(dday, startDate) {
  const calc = () => {
    const diff = Math.max(0, dday - new Date());
    const start = new Date(startDate);
    const now = new Date();
    let pct = 0;

    if (start < dday && now > start) {
      const total = dday - start;
      const elapsed = now - start;
      pct = Math.min(100, (elapsed / total) * 100);
    }

    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      mins: Math.floor((diff % 3600000) / 60000),
      secs: Math.floor((diff % 60000) / 1000),
      pct: pct.toFixed(1),
    };
  };
  const [cd, setCd] = useState(calc);

  useEffect(() => {
    const t = setInterval(() => setCd(calc()), 1000);
    return () => clearInterval(t);
  }, [dday, startDate]);

  return cd;
}

// Real $ restates every figure in the purchasing power of the FIRST SIMULATED
// RETIREMENT YEAR — not of today. deflate() discounts row i by (1+inf)^i and
// row 0 IS retirement, so that is what the numbers have always meant.
//
// That is deliberate, and it matches the engine's own inputs: the spend figure
// the user types is consumed as-is in retirement year one (runMC, `y === 0`) and
// is never inflated forward from today. Balances and spending therefore share
// one yardstick, and the pre-retirement years stay what they are — a forecast of
// how big the pile gets, not a claim about what a dollar buys along the way.
//
// The only thing ever wrong here was the label "today's dollars", which promised
// a basis the math does not use. Derived from pcts[0].age so the words can never
// drift away from the arithmetic again.
const dollarBasisLabel = (useReal) =>
  useReal ? "Today's Dollars" : "Future Dollars";

function deflate(data, inf, useReal) {
  if (!useReal) return data;
  return data.map((d, i) => ({
    ...d,
    p10: Math.round(d.p10 / Math.pow(1 + inf / 100, i)),
    p25: Math.round(d.p25 / Math.pow(1 + inf / 100, i)),
    p50: Math.round(d.p50 / Math.pow(1 + inf / 100, i)),
    p75: Math.round(d.p75 / Math.pow(1 + inf / 100, i)),
    p90: Math.round(d.p90 / Math.pow(1 + inf / 100, i)),
  }));
}

/* Per-age band table under the Monte Carlo fan chart — the same percentile
 * data the chart plots (deflated identically when Real $ is on), one row per
 * age, plus the share of simulated paths still funded at that age. Milestone
 * rows (SS claiming, RMD start) are flagged so the table reads like the
 * chart's reference lines. */
function MCBandTable({ pcts, inf, useReal, ssAge, rmdAge, currentAge, endAge, hoveredAge, onHoverAge }) {
  const [show, setShow] = useState(false);
  // ℹ️ "What do these numbers mean?" — an inline, mobile-readable explainer
  // (not a browser tooltip) condensing the About page's "still-funded-percent"
  // card. Independent of `show` so it's reachable even with the table collapsed.
  const [showExplainer, setShowExplainer] = useState(false);
  const data = useMemo(() => deflate(pcts, inf, useReal), [pcts, inf, useReal]);
  if (!data || data.length === 0) return null;
  const fundedColor = (a) => (a >= 0.9 ? "#34d399" : a >= 0.75 ? "var(--accent-gold)" : "#f87171");
  return (
    <div className="chart-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: show || showExplainer ? 8 : 0, flexWrap: "wrap", gap: 6 }}>
        <div className="ct" style={{ marginBottom: 0 }}>
          📊 Age-by-Age Projection Bands · {dollarBasisLabel(useReal, pcts?.[0]?.age)}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setShowExplainer(!showExplainer)}
            className="mbtn"
            style={{ fontSize: 12, padding: "3px 8px" }}
          >
            ℹ️ What do these numbers mean?
          </button>
          <button onClick={() => setShow(!show)} className="mbtn" style={{ fontSize: 12, padding: "3px 8px" }}>
            {show ? "Hide Table" : "Show Table"}
          </button>
        </div>
      </div>
      {showExplainer && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6, background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
          <strong style={{ color: "var(--text-secondary)" }}>Still Funded</strong> is the share of simulated retirement
          histories where your accounts still had money at that age — not a literal forecast, and not a
          chance of zero income. Social Security, rental, and pension income keep paying even in "failed"
          paths; a failure just means living on those guaranteed streams alone from that age onward.
          Read Still Funded together with the <strong style={{ color: "var(--text-secondary)" }}>10th percentile</strong> column
          for fragility: a high Still Funded % paired with a thin 10th percentile is one bad market
          sequence away from joining the failures, while a high 10th percentile means real margin.
          <br /><br />
          Full explanation: ❓ Help → Reading the Charts → "What does Still Funded % actually mean?"
        </div>
      )}
      {show && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 8px", lineHeight: 1.5 }}>
            Each row is one age from the fan chart above: the percentile spread of {MC_PATHS_LABEL} simulated
            portfolios and the share of paths still funded. 10th %ile = pessimistic (90% of outcomes were better);
            90th %ile = optimistic. 🏛️ Social Security starts · 📋 RMDs begin.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="nw-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Age</th><th>Year</th>
                  <ThInfo tip={"Share of simulated paths whose portfolio has not run out by this age"}>Still Funded</ThInfo>
                  <ThInfo tip={"Pessimistic — 90% of simulated outcomes were better than this"}>10th %ile</ThInfo>
                  <th>25th %ile</th>
                  <ThInfo tip={"The median outcome — half of paths above, half below"}>Median</ThInfo>
                  <th>75th %ile</th>
                  <ThInfo tip={"Optimistic — only 10% of simulated outcomes were better than this"}>90th %ile</ThInfo>
                </tr>
              </thead>
              <tbody>
                {data.map((d, i) => {
                  const yr = CURRENT_YEAR + (d.age - (currentAge ?? d.age));
                  const isSS = d.age === ssAge, isRMD = d.age === rmdAge;
                  const isHovered = hoveredAge === d.age;
                  return (
                    <tr
                      key={d.age}
                      onMouseEnter={onHoverAge ? () => onHoverAge(d.age) : undefined}
                      onMouseLeave={onHoverAge ? () => onHoverAge(null) : undefined}
                      style={{
                        background: isHovered
                          ? "rgba(56,189,248,0.14)"
                          : isSS || isRMD
                          ? "rgba(94,234,212,0.06)"
                          : undefined,
                        boxShadow: isHovered ? "inset 3px 0 0 #38bdf8" : undefined,
                        cursor: onHoverAge ? "pointer" : undefined,
                        transition: "background 0.1s",
                      }}
                    >
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                        {d.age}{isSS && " 🏛️"}{isRMD && " 📋"}
                      </td>
                      <td>{currentAge != null ? yr : "—"}</td>
                      <td style={{ color: fundedColor(d.alive ?? 1), fontWeight: 600 }}>
                        {d.alive != null ? `${(d.alive * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ color: "#f87171" }}>{fmtDollar(d.p10)}</td>
                      <td style={{ color: "var(--accent-gold)" }}>{fmtDollar(d.p25)}</td>
                      <td style={{ color: "var(--accent-teal)", fontWeight: 700 }}>{fmtDollar(d.p50)}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{fmtDollar(d.p75)}</td>
                      <td style={{ color: "#34d399" }}>{fmtDollar(d.p90)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SectorBadge({ age }) {
  const sectors = [
    { n: "Sector 1: The Escape", color: "var(--negative)", active: age < 59.5 },
    {
      n: "Sector 2: The Gap",
      color: "#0ea5e9",
      active: age >= 59.5 && age < 63,
    },
    {
      n: "Sector 3: The Maneuver",
      color: "var(--accent-gold)",
      active: age >= 65 && age < 72,
    },
    {
      n: "Sector 4: The Torpedo",
      color: "#f97316",
      active: age >= 72 && age < 73,
    },
    { n: "Sector 5: Legacy", color: "var(--accent-purple)", active: false },
  ];
  const cur = sectors.find((s) => s.active) || sectors[0];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: `${withAlpha(cur.color, "18")}`,
        border: `1px solid ${withAlpha(cur.color, "44")}`,
        borderRadius: 12,
        padding: "2px 10px",
        fontSize: 10,
        color: cur.color,
        fontWeight: 600,
      }}
    >
      ⚡ {cur.n}
    </span>
  );
}

/* ════ CSS ════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  /* ── Design tokens ── single source for the palette. Reference as var(--x)
     in both CSS rules and inline styles (style={{ color: "var(--text-muted)" }}).
     §37 Phase A (v1.2.106): added semantic-status tokens, spacing scale, an
     --accent-ai alias (purple, promoted from an ambient chart color into a
     named AI-branding role), and a --divider token. Also added the
     [data-theme="light"] override block right below — the theme system flips
     ONLY these token values, so once every inline color literal is converted
     to var(--x) (Phase C), the whole app follows the theme. Spacing and
     radius tokens are theme-invariant. */
  :root {
    /* Institutional Calm palette (v1.2.108) — deep neutral ink (less blue-cast),
       one indigo trust anchor, teal/gold/violet held to strict semantic roles.
       See §37 holistic-direction verdict (2026-08-21). */
    --bg-base: #0a0c12;
    --bg-hdr: rgba(10,12,18,0.96);
    --card-bg: rgba(255,255,255,0.035);
    --card-bg-raised: rgba(255,255,255,0.07);
    --card-border: rgba(255,255,255,0.07);
    --divider: rgba(255,255,255,0.06);
    --card-shadow: 0 1px 2px rgba(0,0,0,0.4), 0 8px 20px rgba(0,0,0,0.2);
    --text-primary: #eef1f6;
    --text-secondary: #9aa4b2;
    --text-muted: #626d7d;
    --text-faint: #3f4753;
    --accent: #5b8def;
    --accent-teal: #4fd1ae;
    --accent-purple: #a78bfa;
    --accent-ai: #a78bfa;
    --accent-gold: #f5a623;
    --positive: #14b8a6;
    --negative: #f87171;
    /* Semantic status backgrounds — accent hue at 8-10% alpha, recomputed off
       the new palette so a theme flip re-tints them correctly. */
    --bg-info:     rgba(91,141,239,0.10);
    --bg-success:  rgba(20,184,166,0.10);
    --bg-warning:  rgba(245,166,35,0.10);
    --bg-danger:   rgba(248,113,113,0.10);
    --row-highlight: rgba(255,255,255,0.045);
    --chart-band: rgba(148,163,184,0.15);
    /* Spacing scale — dense numeric-table app; loosening broadly costs
       rows-per-screen. xs and 2xl added for badges/pills and hero breaks
       that were hardcoded ad hoc. */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 14px;
    --space-lg: 20px;
    --space-xl: 32px;
    --space-2xl: 48px;
    /* Typography scale — sizes were scattered literals across the app; formalize
       so a display/small tweak is one edit. */
    --fs-display: 32px;
    --fs-h1: 22px;
    --fs-h2: 16px;
    --fs-body: 13px;
    --fs-small: 11px;
    --fs-mono: 13px;
    --radius-card: 14px;
    --radius-btn: 8px;
    --radius-pill: 999px;
  }
  /* Light-mode overrides. Redefines every color token; leaves spacing alone.
     Toggle by setting data-theme="light" on <html>. See applyStoredTheme()
     below (in JS) for the mount-time selector. Accents shifted from the dark
     palette because #5eead4 teal and #38bdf8 sky both fail WCAG AA on
     white — the deeper #0d9488 / #0284c7 meet contrast. */
  html[data-theme="light"] :root,
  :root[data-theme="light"] {
    /* Light mode — retuned again after "cards blend into the page" feedback.
       The prior light palette inverted the dark-mode surface logic: dark mode
       put cards LIGHTER than the base (add white tint), but light mode put
       them DARKER than a near-white base (5% ink on #f7f8fa). Cards ended up
       barely one tick off page. Now matched to the standard "grouped iOS"
       pattern: soft grey PAGE with WHITE cards, so demarcation comes from
       tone step, not just a faint border.
         - Page base darkened #f7f8fa -> #eef1f5 (softer, less glaring, less
           bright per user).
         - Cards flipped to translucent white, matching how dark mode adds
           white tint (dark mode adds white to a dark base; light mode adds
           white to a grey base — same direction). Cards now visually SIT
           ABOVE the page in both themes.
         - Borders softened slightly (0.14 -> 0.09) because the white-on-grey
           tone step is doing most of the demarcation work; a heavier border
           would fight it. */
    --bg-base: #eef1f5;
    --bg-hdr: rgba(238,241,245,0.94);
    --card-bg: rgba(255,255,255,0.90);
    --card-bg-raised: #ffffff;
    /* Borders and dividers pushed noticeably darker — user reported the
       previous 0.09 outline as "too dull." Now 0.22 for card frames, 0.14
       for inner dividers. Still tinted with the text-primary hue so it
       matches the palette instead of looking like flat pen ink. */
    --card-border: rgba(15,23,42,0.22);
    --divider: rgba(15,23,42,0.14);
    --card-shadow: 0 1px 2px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.08);
    --text-primary: #0f1420;
    --text-secondary: #334155;
    /* Muted / faint text also pushed darker — the prior #64748b / #94a3b8
       pair sat right at the WCAG floor and read as "dull" against a page
       this bright. Both moved one step darker (#475569 / #64748b) so the
       ramp still reads as three distinct tiers of muting but every tier is
       clearly legible on the white card fill. */
    --text-muted: #475569;
    --text-faint: #64748b;
    --accent: #2f5fd6;
    --accent-teal: #0d9488;
    --accent-purple: #7c3aed;
    --accent-ai: #7c3aed;
    --accent-gold: #b45309;
    --positive: #0f766e;
    --negative: #dc2626;
    --bg-info:     rgba(47,95,214,0.10);
    --bg-success:  rgba(13,148,136,0.10);
    --bg-warning:  rgba(180,83,9,0.12);
    --bg-danger:   rgba(220,38,38,0.10);
    --row-highlight: rgba(15,23,42,0.04);
    --chart-band: rgba(100,116,139,0.14);
  }
  * { box-sizing:border-box; }
  /* ── Reusable surfaces / labels ── prefer these over re-typing the card and
     uppercase-label inline style objects. */
  .card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:var(--radius-card); padding:13px; }
  .section-label { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.1em; }
  body { margin:0; font-family:'Inter',sans-serif; background:var(--bg-base); color:var(--text-primary); font-size:13px; line-height:1.5; }
  .app { min-height:100vh; background:var(--bg-base); }
  .hdr { background:var(--bg-hdr); border-bottom:1px solid var(--divider); padding:10px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:100; backdrop-filter:blur(16px); }
  .logo { font-size:25px; font-weight:800; letter-spacing:-0.03em; color:var(--text-primary); }
  .logo-sub { color:var(--accent); font-weight:400; font-size:16px; margin-left:6px; }
  .mbtn { padding:5px 13px; border-radius:7px; border:1px solid var(--card-border); cursor:pointer; font-size:11px; font-family:'Inter',sans-serif; font-weight:500; transition:all 0.2s; background:transparent; color:var(--text-secondary); }
  .mbtn:hover { color:var(--text-primary); border-color:var(--divider); }
  .mbtn.on { background:var(--accent); border-color:transparent; color:white; box-shadow:0 0 16px rgba(91,141,239,0.35); }
  .mbtn:disabled { opacity:0.4; cursor:not-allowed; }
  /* Thin divider separating the utility buttons from the support CTA. */
  .hdiv { width:1px; height:20px; background:var(--divider); margin:0 3px; flex-shrink:0; }
  /* Buy-me-a-coffee — the one prominent, filled support CTA in the header. */
  .coffee-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 15px; border-radius:8px; border:none; background:linear-gradient(135deg,#f59e0b,#fbbf24); color:#231603; font-size:12px; font-weight:800; font-family:'Inter',sans-serif; letter-spacing:-0.01em; text-decoration:none; cursor:pointer; white-space:nowrap; box-shadow:0 3px 12px rgba(245,158,11,0.35); transition:transform 0.15s, box-shadow 0.15s, filter 0.15s; }
  .coffee-btn:hover { filter:brightness(1.07); transform:translateY(-1px); box-shadow:0 5px 16px rgba(245,158,11,0.5); }
  /* ── Visitor landing (first-screen hero) ── */
  .landing { min-height:100vh; background:var(--bg-base); display:flex; flex-direction:column; align-items:center; padding:clamp(26px,6vw,60px) 20px 60px; overflow-y:auto; }
  .lp-wrap { width:100%; max-width:760px; }
  .lp-brand { display:flex; align-items:center; justify-content:space-between; margin-bottom:clamp(30px,6vw,52px); }
  .lp-eyebrow { font-size:12px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:var(--accent); margin-bottom:16px; }
  .lp-answer { font-size:clamp(29px,6vw,50px); font-weight:800; line-height:1.05; letter-spacing:-0.03em; color:var(--text-primary); margin:0; }
  .lp-age { color:var(--accent-teal); font-family:'JetBrains Mono',monospace; }
  .lp-answer.short .lp-age { color:var(--accent-gold); }
  .lp-sub { margin-top:16px; font-size:16px; color:var(--text-secondary); max-width:54ch; line-height:1.55; }
  .lp-panel { margin-top:28px; background:var(--card-bg); border:1px solid var(--card-border); border-radius:16px; padding:22px; }
  .lp-row { display:grid; grid-template-columns:1fr auto; align-items:baseline; }
  .lp-label { font-size:14px; color:var(--text-secondary); font-weight:600; }
  .lp-val { font-size:16px; font-weight:800; color:var(--text-primary); font-family:'JetBrains Mono',monospace; }
  /* Typed hero readout. A fixed 14ch width + right alignment keeps the grid's
     right edge steady as the value grows — $250,000,000 must not shove the label. */
  .lp-val-input { width:14ch; text-align:right; background:transparent; border:1px solid transparent; border-radius:6px; padding:2px 6px; cursor:text; }
  .lp-val-input:hover { border-color:var(--card-border); background:var(--row-highlight); }
  .lp-val-input:focus { outline:none; border-color:var(--accent); background:var(--bg-info); color:var(--text-primary); }
  /* Scoped under .landing so it beats the global input[type=range] display:none. */
  .landing input[type=range].lp-range { -webkit-appearance:none; appearance:none; display:block; width:100%; height:6px; border-radius:100px; background:var(--divider); outline:none; margin:7px 0 18px; cursor:pointer; }
  .landing input[type=range].lp-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:22px; height:22px; border-radius:50%; background:var(--accent); border:3px solid var(--bg-base); box-shadow:0 2px 8px rgba(91,141,239,0.5); cursor:pointer; }
  .landing input[type=range].lp-range::-moz-range-thumb { width:20px; height:20px; border-radius:50%; background:var(--accent); border:3px solid var(--bg-base); cursor:pointer; }
  .lp-cta { display:inline-flex; align-items:center; gap:9px; margin-top:26px; padding:15px 30px; border:none; border-radius:12px; background:var(--accent); color:#fff; font-size:17px; font-weight:700; font-family:'Inter',sans-serif; letter-spacing:-0.01em; cursor:pointer; box-shadow:0 10px 26px -8px rgba(91,141,239,0.55); transition:transform 0.15s, box-shadow 0.15s; }
  .lp-cta:hover { transform:translateY(-1px); box-shadow:0 14px 32px -8px rgba(91,141,239,0.7); }
  .lp-skip { display:block; margin-top:15px; background:none; border:none; color:var(--text-muted); font-size:13px; cursor:pointer; font-family:'Inter',sans-serif; text-decoration:underline; padding:0; }
  .lp-skip:hover { color:var(--text-secondary); }
  .layout { display:grid; grid-template-columns:340px 1fr; height:calc(100vh - 56px); overflow:hidden; }
  .sidebar { border-right:1px solid rgba(255, 255, 255, 0.08); padding:14px 12px; overflow-y:auto; background:rgba(10,15,30,0.78); display:flex; flex-direction:column; gap:12px; min-height:0; }
  .sb-card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:var(--radius-card); padding:13px 12px; }
  .sb-title { font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:10px; }
  .sl-row { display:flex; flex-direction:column; gap:6px; margin-bottom:13px; }
  .sl-nudge-btn { width:24px; height:24px; border-radius:5px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.06); color:#cbd5e1; cursor:pointer; font-size:14px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; padding:0; transition:all 0.15s; flex-shrink:0; line-height:1; user-select:none; }
  .sl-nudge-btn:hover:not(:disabled) { background:rgba(255,255,255,0.18); color:#ffffff; border-color:rgba(255,255,255,0.28); transform:scale(1.06); }
  .sl-nudge-btn:active:not(:disabled) { transform:scale(0.94); }
  .sl-nudge-btn:disabled { opacity:0.22; cursor:not-allowed; }
  /* The value cell is now an editable input (typed entry can exceed the slider max). */
  .sl-val-input { width:auto; min-width:70px; max-width:120px; text-align:center; background:rgba(15,23,42,0.65); border:1px solid rgba(255,255,255,0.12); border-radius:5px; padding:2px 6px; cursor:text; }
  .sl-val-input:hover { border-color:rgba(255,255,255,0.22); background:rgba(255,255,255,0.08); }
  .sl-val-input:focus { outline:none; border-color:#14b8a6; background:rgba(20,184,166,0.12); color:#f1f5f9; box-shadow:0 0 0 2px rgba(20,184,166,0.25); }
  .sl-label { font-size:12px; color:#cbd5e1; font-weight:600; }
  .sl-val { font-size:12px; font-weight:700; text-align:right; color:#f1f5f9; font-family:'JetBrains Mono',monospace; }
  .tog-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; gap:8px; flex-wrap:nowrap; }
  .tog-label { font-size:12px; color:#cbd5e1; font-weight:500; display:inline-flex; align-items:center; gap:4px; flex:1; min-width:0; }
  .tog { width:34px; height:18px; border-radius:9px; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; }
  .tok { position:absolute; top:2px; width:14px; height:14px; border-radius:50%; background:white; transition:left 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.4); }
  .run-btn { width:100%; padding:10px; background:linear-gradient(135deg,#0ea5e9,#38bdf8); border:none; border-radius:9px; color:white; font-size:13px; font-weight:700; cursor:pointer; font-family:'Inter',sans-serif; transition:all 0.2s; letter-spacing:-0.01em; box-shadow:0 4px 14px rgba(14,165,233,0.25); flex-shrink:0; }
  .run-btn:hover { opacity:0.9; box-shadow:0 6px 20px rgba(14,165,233,0.35); }
  .run-btn:disabled { opacity:0.4; cursor:not-allowed; box-shadow:none; }
  .main { padding:16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; min-height:0; }
  .main > * { flex-shrink:0; }
  .flag-w { border-left:3px solid #f59e0b; background:rgba(245,158,11,0.1); padding:7px 12px; font-size:12px; color:#fde68a; border-radius:0 8px 8px 0; margin-bottom:4px; font-weight:500; }
  .flag-i { border-left:3px solid #38bdf8; background:rgba(56,189,248,0.08); color:#bae6fd; border-radius:0 8px 8px 0; padding:7px 12px; font-size:12px; margin-bottom:4px; font-weight:500; }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; }
  .met { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); border-radius:10px; padding:13px 15px; }
  .ml { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.09em; margin-bottom:7px; font-weight:600; }
  .mv { font-size:22px; font-weight:800; font-family:'JetBrains Mono',monospace; line-height:1; }
  .ms { font-size:12px; color:#64748b; margin-top:5px; }
  .analogue { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px 16px; font-size:13px; color:#cbd5e1; font-style:italic; }
  .analogue-fade { animation: analogueFade 0.6s ease; }
  @keyframes analogueFade { from { opacity: 0; } to { opacity: 1; } }
  .tabs { display:flex; gap:3px; background:rgba(255,255,255,0.04); border-radius:10px; padding:3px; flex-wrap:wrap; }
  .tab { flex:1; min-width:72px; padding:9px 6px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:13px; font-family:'Inter',sans-serif; color:#64748b; transition:all 0.15s; font-weight:500; white-space:nowrap; letter-spacing:-0.01em; }
  .tab:hover { color:#94a3b8; }
  .tab.on { background:rgba(255,255,255,0.09); color:#f1f5f9; border:1px solid rgba(255,255,255,0.12); font-weight:600; }
  .chart-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:11px; padding:15px 17px; }
  .ct { font-size:18px; color:#94a3b8; margin-bottom:12px; font-weight:500; }
  .leg { display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; }
  .li { display:flex; align-items:center; gap:5px; font-size:12px; color:#64748b; }
  .ll { width:18px; height:2px; border-radius:1px; }
  .ppl-grid { display:flex; flex-wrap:wrap; gap:4px; margin:8px 0; }
  .ppl-dot { width:18px; height:18px; border-radius:50%; }
  .roth-tbl { width:100%; border-collapse:collapse; font-size:12px; }
  .roth-tbl th { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; padding:7px 8px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.09); }
  .roth-tbl th:first-child { text-align:left; }
  .roth-tbl td { padding:9px 8px; border-bottom:1px solid rgba(255,255,255,0.05); text-align:right; font-family:'JetBrains Mono',monospace; font-size:12px; color:#e2e8f0; }
  .roth-tbl td:first-child { text-align:left; font-family:'Inter',sans-serif; color:#f1f5f9; }
  .gold { background:rgba(251,191,36,0.07); }
  .gk-bar { background:rgba(14,165,233,0.07); border:1px solid rgba(14,165,233,0.2); border-radius:9px; padding:11px 15px; font-size:12px; color:#bae6fd; }
  .countdown-grid { display:flex; gap:5px; }
  .cd-unit { text-align:center; background:rgba(255,255,255,0.05); border-radius:6px; padding:5px 8px; min-width:38px; }
  .cd-val { font-size:17px; font-weight:800; color:#f0fdfa; font-family:'JetBrains Mono',monospace; line-height:1; }
  .cd-lbl { font-size:9px; color:#64748b; letter-spacing:0.12em; margin-top:2px; }
  .progress-bar { height:5px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin-top:6px; }
  .progress-fill { height:100%; background:linear-gradient(90deg,#0ea5e9,#38bdf8); border-radius:3px; transition:width 1s; }
  .nw-table { width:100%; border-collapse:collapse; font-size:12px; }
  .nw-table th { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; padding:7px 8px; border-bottom:1px solid rgba(255,255,255,0.09); text-align:right; font-weight:700; }
  .nw-table th:first-child { text-align:left; }
  .nw-table td { padding:8px 8px; border-bottom:1px solid rgba(255,255,255,0.04); text-align:right; font-family:'JetBrains Mono',monospace; color:#e2e8f0; }
  .nw-table td:first-child { text-align:left; font-family:'Inter',sans-serif; color:#f1f5f9; }
  .wizard-mobile-steps { display:none; }
  .ap-col { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px; }
  .ap-hdr { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:11px; }
  .ap-item { font-size:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); color:#cbd5e1; }
  .ms-dot { width:11px; height:11px; border-radius:50%; flex-shrink:0; margin-top:2px; }
  .ms-line { width:2px; background:rgba(255,255,255,0.08); margin:0 4px; }
  .tip-box { background:rgba(10,15,30,0.98); border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:9px 12px; font-size:14px; color:#f1f5f9; }
  /* ── Scrollbars ──────────────────────────────────────────────────────────
     These were 3px wide at 12% opacity — invisible on every platform, and worse
     on macOS, where the OS uses overlay scrollbars that stay hidden until you
     actively scroll. Wide tables (the 15-column waterfall, the MC band table,
     the checkpoint table) therefore looked truncated rather than scrollable,
     and Mac users never discovered the columns to the right.

     Styling ::-webkit-scrollbar at all opts Chrome/Safari out of overlay mode,
     so the bar stays on screen; the size and contrast below make it actually
     visible once it is. Firefox uses the standard properties. */
  ::-webkit-scrollbar { width:10px; height:10px; }
  ::-webkit-scrollbar-track {
    background:rgba(255,255,255,0.04);
    border-radius:5px;
  }
  ::-webkit-scrollbar-thumb {
    background:rgba(148,163,184,0.45);
    border-radius:5px;
    border:2px solid transparent;
    background-clip:padding-box;
  }
  ::-webkit-scrollbar-thumb:hover {
    background:rgba(148,163,184,0.75);
    background-clip:padding-box;
  }
  ::-webkit-scrollbar-corner { background:transparent; }
  * { scrollbar-width:thin; scrollbar-color:rgba(148,163,184,0.45) rgba(255,255,255,0.04); }

  /* Horizontally scrollable regions get a right-edge fade so there is a visual
     cue that content continues past the viewport, independent of the bar. */
  .scroll-x {
    overflow-x:auto;
    background:
      linear-gradient(to right, var(--bg-base) 30%, rgba(10,15,30,0)) left center,
      linear-gradient(to left,  var(--bg-base) 30%, rgba(10,15,30,0)) right center;
    background-repeat:no-repeat;
    background-size:36px 100%, 36px 100%;
    background-attachment:local, local;
  }

  /* ── Mobile / Responsive ── */
  @media (max-width: 768px) {
    .hdr { padding:8px 12px; gap:6px; flex-wrap:wrap; }
    .logo-sub { display:none; }
    .mbtn { padding:4px 9px; font-size:10px; }
    .layout { grid-template-columns:1fr; height:auto; overflow:visible; }
    .sidebar { border-right:none; border-bottom:1px solid rgba(255,255,255,0.06); max-height:220px; overflow-y:auto; min-height:unset; padding:10px; flex-direction:row; flex-wrap:wrap; gap:8px; }
    .sb-card { padding:10px; }
    .main { padding:10px; overflow-y:visible; min-height:unset; }
    .main > * { flex-shrink:0; }
    .metrics { grid-template-columns:1fr 1fr; }
    .sl-row { grid-template-columns:1fr 88px; }
    .tabs { gap:2px; }
    .tab { min-width:56px; padding:6px 4px; font-size:10px; }
    .wizard-grid { grid-template-columns:1fr !important; }
    .wizard-sidebar { display:none !important; }
    .wizard-panel { border-radius:0 !important; }
    .wizard-mobile-steps { display:block !important; }
    .metrics .met { padding:10px 12px; }
    .metrics .mv { font-size:17px; }
    .roth-tbl { font-size:11px; }
    .roth-tbl th, .roth-tbl td { padding:6px 5px; }
    .nw-table { font-size:11px; }
    .nw-table th, .nw-table td { padding:6px 5px; }
  }
  @media (max-width: 480px) {
    .metrics { grid-template-columns:1fr; }
    .tabs { gap:1px; }
    .tab { min-width:44px; font-size:9px; padding:5px 3px; }
    .hdr { justify-content:center; }
  }
`;

// ─── Monte Carlo fan-chart palette ───────────────────────────────────────────
// Single source of truth for the percentile band colors so the chart lines/areas
// and the tooltip stay in lock-step. Distinct hue ramp (upside → downside):
//   90th indigo · 75th cyan · Median teal · 25th amber · 10th red.
// The Tip must resolve by series NAME — Recharts hands Area series their fill
// (a gradient url) as `p.color`, which would otherwise render as a broken swatch.
const FAN_COLORS = {
  "90th":   "#818cf8", // indigo
  "75th":   "#22d3ee", // cyan
  "Median": "var(--accent-teal)", // teal (bold anchor line)
  "25th":   "var(--accent-gold)", // amber
  "10th":   "#f87171", // red
};

/**
 * Heading for the shared chart tooltip.
 *
 * Pure and exported so it can be tested without a DOM: the bug it fixes is a
 * string-formatting decision, not a rendering one.
 *
 * `Tip` is shared by TEN charts and they do not agree on their x-axis key — most
 * use dataKey="age", two use dataKey="yr". The heading was a hardcoded
 * `Age {label}`, so on the year-keyed charts it printed "Age 2044", labelling a
 * calendar year as an age (reported with a screenshot, 2026-08-05).
 *
 * Reads the data ROW rather than the axis label: Recharts hands the whole row
 * back on payload[].payload, and these rows carry both `age` and `yr`. Falls back
 * to the label disambiguated by magnitude — nobody is 1900 years old, and no plan
 * year is below 130.
 */
/**
 * Headline for the first-death disclosure box.
 *
 * The true branch used to read "Your spouse survives" when `primarySurvives` is
 * TRUE — i.e. when the spouse dies and YOU survive. Exactly backwards, and
 * reported by a user who selected "My spouse" under "Who passes first" and was
 * told his spouse survives. The arithmetic beneath it was right all along (the
 * survivor benefit shown is the deceased spouse's, passing to the primary); only
 * the sentence was inverted.
 *
 * Pure and exported so the wording is covered by a test. A label that contradicts
 * the model is the most repeated defect in this codebase, and it is invisible to
 * every engine test.
 */
export function firstDeathHeadline(primarySurvives, deathAtYourAge, survAgeAtDeath) {
  return primarySurvives
    ? `Modelled from your age ${deathAtYourAge} — your spouse dies first and you survive.`
    : `Modelled from your age ${deathAtYourAge} — you die first and your spouse, then ${survAgeAtDeath}, survives.`;
}

export function tipHeading(payload, label) {
  const row = (Array.isArray(payload) && payload[0]?.payload) || {};
  const lblNum = Number(label);
  const age = Number.isFinite(row.age) ? row.age
    : (Number.isFinite(lblNum) && lblNum > 0 && lblNum < 130 ? lblNum : null);
  const yr = Number.isFinite(row.yr) ? row.yr
    : (Number.isFinite(lblNum) && lblNum >= 1900 ? lblNum : null);
  if (age != null && yr != null) return `Age ${age} · ${yr}`;
  if (age != null) return `Age ${age}`;
  if (yr != null) return `${yr}`;
  return String(label ?? "");
}

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  // Filter to keep only the first occurrence of each name
  const seen = new Set();
  const uniquePayload = payload.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  return (
    <div className="tip-box">
      <div style={{ color: "#4d5c72", marginBottom: 3 }}>{tipHeading(uniquePayload, label)}</div>
      {uniquePayload
        .filter((p) => p.value > 0)
        .map((p, i) => {
          const c = FAN_COLORS[p.name] || p.color;
          return (
            <div key={i} style={{ color: c, marginBottom: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: "var(--text-secondary)" }}>{p.name}: </span>
              {p.name === "P(alive)" ? `${Math.round(p.value * 100)}%` : fmtDollar(p.value)}
            </div>
          );
        })}
    </div>
  );
};
const RateTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip-box">
      <div style={{ color: "var(--text-muted)", marginBottom: 3 }}>Age {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 1 }}>
          <span style={{ color: "var(--text-secondary)" }}>{p.name}: </span>
          {(p.value * 100).toFixed(1)}%
        </div>
      ))}
    </div>
  );
};
const TaxYearTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const get = key => payload.find(p => p.dataKey === key)?.value || 0;
  const oF = get("opt_fed"), oS = get("opt_st"), oI = get("opt_irmaa");
  const cF = get("cur_fed"), cS = get("cur_st"), cI = get("cur_irmaa");
  const oTotal = oF + oS + oI, cTotal = cF + cS + cI;
  const delta = oTotal - cTotal;
  const hasState = oS > 0 || cS > 0;
  const hasIrmaa = oI > 0 || cI > 0;
  const N = v => `$${Math.round(v).toLocaleString()}`;
  const tipRow = (swatch, lbl, optV, curV, note) => (
    <tr key={lbl} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <td style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: swatch, display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{lbl}</span>
        </div>
      </td>
      <td style={{ padding: "4px 0 4px 12px", textAlign: "right", fontSize: 11, color: note ? "#374151" : "#e2e8f0" }}>
        {note ? <em style={{ fontSize: 10, color: "#334155" }}>{note}</em> : N(optV)}
      </td>
      <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontSize: 11, color: "var(--text-muted)" }}>
        {note ? "" : N(curV)}
      </td>
    </tr>
  );
  return (
    <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 14px", minWidth: 280, boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        Age {label} — Tax Breakdown
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "left", paddingBottom: 4, fontWeight: 500 }}>Type</th>
            <th style={{ fontSize: 10, color: "#6366f1", textAlign: "right", paddingBottom: 4, fontWeight: 500, paddingLeft: 12 }}>With Conv</th>
            <th style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "right", paddingBottom: 4, fontWeight: 500, paddingLeft: 8 }}>Without</th>
          </tr>
        </thead>
        <tbody>
          {tipRow("#6366f1", "Federal Income Tax", oF, cF)}
          {hasState && tipRow("#fb923c", "State Income Tax", oS, cS)}
          {hasIrmaa && tipRow("#f87171", "IRMAA Surcharge", oI, cI)}
          {tipRow("#334155", "FICA (payroll tax)", 0, 0, "not applicable — retired")}
          {tipRow("#334155", "Capital Gains Tax", 0, 0, "not modeled here")}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
            <td style={{ paddingTop: 5, fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>Total</td>
            <td style={{ paddingTop: 5, textAlign: "right", fontSize: 12, fontWeight: 700, paddingLeft: 12, color: delta > 0 ? "#fb923c" : delta < 0 ? "#34d399" : "var(--text-secondary)" }}>{N(oTotal)}</td>
            <td style={{ paddingTop: 5, textAlign: "right", fontSize: 12, fontWeight: 700, paddingLeft: 8, color: "var(--text-secondary)" }}>{N(cTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
const IncYearTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const get = key => payload.find(p => p.dataKey === key)?.value || 0;
  const oSS = get("opt_ss"), oAb = get("opt_ab"), oRmd = get("opt_rmd"), oConv = get("opt_conv"), oPxs = get("opt_pxs");
  const cSS = get("cur_ss"), cAb = get("cur_ab"), cRmd = get("cur_rmd"), cPxs = get("cur_pxs");
  const oTotal = oSS + oAb + oRmd + oConv + oPxs, cTotal = cSS + cAb + cRmd + cPxs;
  const N = v => `$${Math.round(v).toLocaleString()}`;
  const tipRow = (swatch, lbl, optV, curV) => (optV > 0 || curV > 0) ? (
    <tr key={lbl} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <td style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: swatch, display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{lbl}</span>
        </div>
      </td>
      <td style={{ padding: "4px 0 4px 12px", textAlign: "right", fontSize: 11, color: "#e2e8f0" }}>{N(optV)}</td>
      <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontSize: 11, color: "var(--text-muted)" }}>{N(curV)}</td>
    </tr>
  ) : null;
  return (
    <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 14px", minWidth: 280, boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        Age {label} — Taxable Income Sources
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "left", paddingBottom: 4, fontWeight: 500 }}>Source</th>
            <th style={{ fontSize: 10, color: "var(--accent-teal)", textAlign: "right", paddingBottom: 4, fontWeight: 500, paddingLeft: 12 }}>With Conv</th>
            <th style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "right", paddingBottom: 4, fontWeight: 500, paddingLeft: 8 }}>Without</th>
          </tr>
        </thead>
        <tbody>
          {tipRow("var(--accent-teal)", "Social Security (85%)", oSS, cSS)}
          {tipRow("var(--accent-gold)", "Annuity / Benefit", oAb, cAb)}
          {tipRow("var(--accent-purple)", "Required Min. Dist.", oRmd, cRmd)}
          {tipRow("#60a5fa", "Pretax Withdrawal", oPxs, cPxs)}
          {tipRow("#34d399", "Roth Conversion", oConv, 0)}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
            <td style={{ paddingTop: 5, fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>Total Taxable</td>
            <td style={{ paddingTop: 5, textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--accent-teal)", paddingLeft: 12 }}>{N(oTotal)}</td>
            <td style={{ paddingTop: 5, textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", paddingLeft: 8 }}>{N(cTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
/**
 * `hint` used to render as a native `title=` tooltip, which meant the
 * explanation was hover-only: undiscoverable to anyone who doesn't think to
 * hover, and NON-EXISTENT on touch devices (§28.2). It now opens an InfoModal on
 * CLICK via the existing InfoIcon affordance, which fixes discoverability and
 * touch in one move. `title` is kept on the icon only as harmless extra colour
 * for mouse users, never as the sole channel.
 *
 * `infoTitle` names the modal; it defaults to the toggle's own label so callers
 * that only pass `hint` get a correct heading for free.
 */
function Toggle({ val, onChange, label, accent = "var(--positive)", hint, infoTitle }) {
  return (
    <div className="tog-row">
      <span className="tog-label">
        {label}
        {hint && (
          <InfoModal
            title={infoTitle || (typeof label === "string" ? label : "About this option")}
            accent={accent}
            trigger={
              <span style={{ marginLeft: 5, color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex" }}
                    title="Tap or click for more info">
                <InfoIcon size={12} />
              </span>
            }
          >
            {/* Hints are authored as plain strings with \n\n paragraph breaks. */}
            {String(hint).split("\n\n").map((para, i) => (
              <p key={i} style={{ margin: i === 0 ? "0 0 10px" : "0 0 10px" }}>{para}</p>
            ))}
          </InfoModal>
        )}
      </span>
      <div
        className="tog"
        onClick={() => onChange(!val)}
        style={{ background: val ? accent : "rgba(255,255,255,0.1)" }}
      >
        <div className="tok" style={{ left: val ? 18 : 2 }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ABOUT PAGE CONTENT — edit everything below this line freely.
// No component changes needed: just update the objects and arrays.
// ═══════════════════════════════════════════════════════════════════════════

function CollapsibleAboutCard({ entry, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{ background:"var(--card-bg)",
      border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, overflow:"hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width:"100%", display:"flex", alignItems:"center",
          justifyContent:"space-between", gap:8, padding:"13px 15px",
          background:"transparent", border:"none", cursor:"pointer",
          fontSize:13, fontWeight:700, color:"#e2e8f0", textAlign:"left",
          fontFamily:"inherit" }}
        aria-expanded={open}
      >
        <span>{entry.icon} {entry.title}</span>
        <span style={{ color:"var(--text-muted)", fontSize:10, lineHeight:1,
          display:"inline-block", transition:"transform 0.15s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
      </button>
      {open && (
        <div style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.7,
          padding:"0 15px 13px" }}
          dangerouslySetInnerHTML={{ __html: entry.body }} />
      )}
    </div>
  );
}

function AboutButton() {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState(0);
  const TABS = ["👤 About Me", "📦 The App"];

  const tabBtn = (i) => ({
    flex:1, padding:"7px 4px", fontSize:11, fontWeight: tab===i ? 700 : 500,
    background: tab===i ? "rgba(96,165,250,0.18)" : "transparent",
    color: tab===i ? "#60a5fa" : "var(--text-muted)",
    border:"none", borderBottom: tab===i ? "2px solid #60a5fa" : "2px solid transparent",
    cursor:"pointer", transition:"all 0.15s",
  });

  const overlay = open ? ReactDOM.createPortal(
    <div
      onClick={() => setOpen(false)}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.70)", zIndex:99999,
        display:"flex", alignItems:"flex-start", justifyContent:"center",
        padding:"40px 16px 60px", overflowY:"auto" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#0f1729", border:"1px solid rgba(96,165,250,0.2)",
          borderRadius:14, padding:"24px 28px 28px", maxWidth:600, width:"100%",
          boxShadow:"0 24px 60px rgba(0,0,0,0.8)" }}
      >
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:"#e2e8f0", letterSpacing:"-0.3px" }}>
              {ABOUT_PRODUCT.name}
            </div>
            <div style={{ fontSize:11, color:"var(--text-faint)", marginTop:3 }}>v{APP_VERSION}</div>
          </div>
          <button onClick={() => setOpen(false)}
            style={{ background:"transparent", border:"none", color:"var(--text-muted)",
              cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 2px" }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.08)", marginBottom:22 }}>
          {TABS.map((t, i) => (
            <button key={i} style={tabBtn(i)} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>

        {/* Tab 0 — About Me */}
        {tab === 0 && (
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:"#e2e8f0" }}>{ABOUT_ME.name}</div>
            <div style={{ fontSize:11, color:"#60a5fa", marginTop:3, marginBottom:14, letterSpacing:"0.5px" }}>
              {ABOUT_ME.tagline}
            </div>
            <p style={{ fontSize:13, color:"var(--text-secondary)", lineHeight:1.75, margin:"0 0 20px" }}>
              {ABOUT_ME.bio}
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {ABOUT_ME.links.filter(l => l.url).map(l => (
                <a key={l.label} href={l.url} target={l.url.startsWith("mailto:") ? "_self" : "_blank"} rel="noreferrer"
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    background:"var(--row-highlight)", border:"1px solid rgba(255,255,255,0.08)",
                    borderRadius:9, color:"#e2e8f0", fontSize:13, fontWeight:600,
                    textDecoration:"none", transition:"background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background="rgba(96,165,250,0.12)"}
                  onMouseLeave={e => e.currentTarget.style.background="var(--row-highlight)"}
                >
                  <span style={{ fontSize:18 }}>{l.icon}</span>
                  <span>{l.label}</span>
                  <span style={{ marginLeft:"auto", color:"var(--text-faint)", fontSize:11 }}>↗</span>
                </a>
              ))}
            </div>

            {/* Special thanks. Credit belongs to the people who found a defect and
                described it precisely enough to fix — that is rarer and more useful
                than generic feedback, and naming it publicly is the only payment on
                offer. Content lives in about.js (ABOUT_THANKS) so adding someone
                needs no JSX. */}
            {ABOUT_THANKS?.people?.length > 0 && (
              <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-gold)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  ⭐ Special thanks
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 14 }}>
                  {ABOUT_THANKS.intro}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ABOUT_THANKS.people.map(pr => (
                    <div key={pr.handle} style={{
                      padding: "11px 14px", borderRadius: 9,
                      background: "rgba(251,191,36,0.06)",
                      border: "1px solid rgba(251,191,36,0.22)",
                    }}>
                      {pr.url ? (
                        <a href={pr.url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-gold)", textDecoration: "none" }}>
                          {pr.handle} <span style={{ fontSize: 10, color: "#78716c" }}>↗</span>
                        </a>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-gold)" }}>{pr.handle}</span>
                      )}
                      {pr.note ? (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55, marginTop: 5 }}>{pr.note}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 1 — The App */}
        {tab === 1 && (
          <div>
            <div style={{ fontSize:13, color:"#60a5fa", fontWeight:600, marginBottom:10 }}>
              {ABOUT_PRODUCT.tagline}
            </div>
            <p style={{ fontSize:13, color:"var(--text-secondary)", lineHeight:1.75, margin:"0 0 18px" }}>
              {ABOUT_PRODUCT.description}
            </p>
            <div style={{ fontSize:12, fontWeight:700, color:"#cbd5e1", marginBottom:10, letterSpacing:"0.5px", textTransform:"uppercase" }}>
              Key Capabilities
            </div>
            <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8 }}>
              {ABOUT_PRODUCT.bullets.map((b, i) => (
                <li key={i} style={{ display:"flex", gap:10, fontSize:13, color:"var(--text-secondary)" }}>
                  <span style={{ color:"#60a5fa", fontWeight:700, flexShrink:0 }}>✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={() => setOpen(false)}
          style={{ marginTop:22, width:"100%", background:"rgba(96,165,250,0.08)",
            border:"1px solid rgba(96,165,250,0.25)", borderRadius:8, padding:"9px 0",
            color:"#60a5fa", fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Close
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button className="mbtn" onClick={() => { setTab(0); setOpen(true); }}>
        📖 About
      </button>
      {overlay}
    </>
  );
}

// Searchable knowledge base — pulled out of AboutButton's old "How It Works"
// tab so it's reachable on its own (people look for help mid-task, not from
// an about-the-author screen) and so a search box actually has somewhere
// findable to live. Content stays in ABOUT_FEATURES (src/about.js); this is
// purely presentation + filtering.
function HelpButton() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const overlay = open ? ReactDOM.createPortal(
    <div
      onClick={() => setOpen(false)}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.70)", zIndex:99999,
        display:"flex", alignItems:"flex-start", justifyContent:"center",
        padding:"40px 16px 60px", overflowY:"auto" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#0f1729", border:"1px solid rgba(96,165,250,0.2)",
          borderRadius:14, padding:"24px 28px 28px", maxWidth:600, width:"100%",
          boxShadow:"0 24px 60px rgba(0,0,0,0.8)" }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div style={{ fontSize:18, fontWeight:800, color:"#e2e8f0", letterSpacing:"-0.3px" }}>
            ❓ Help &amp; How It Works
          </div>
          <button onClick={() => setOpen(false)}
            style={{ background:"transparent", border:"none", color:"var(--text-muted)",
              cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 2px" }}>✕</button>
        </div>

        <input
          type="text"
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search help topics… e.g. IRMAA, Roth, buckets, spending smile"
          style={{ width:"100%", boxSizing:"border-box", padding:"10px 14px", marginBottom:16,
            background:"var(--row-highlight)", border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:9, color:"#e2e8f0", fontSize:13, fontFamily:"inherit" }}
        />

        {ABOUT_PRODUCT.intro && !query.trim() && (
          <p style={{ fontSize:13, color:"var(--text-secondary)", lineHeight:1.75,
            margin:"0 0 18px", padding:"12px 14px", background:"rgba(96,165,250,0.06)",
            border:"1px solid rgba(96,165,250,0.15)", borderRadius:9 }}>
            {ABOUT_PRODUCT.intro}
          </p>
        )}

        {(() => {
          const q = query.trim().toLowerCase();
          const stripHtml = (html) => html.replace(/<[^>]+>/g, " ");
          const filtered = !q ? ABOUT_FEATURES : ABOUT_FEATURES.filter(e =>
            e.title.toLowerCase().includes(q) ||
            (e.group || "").toLowerCase().includes(q) ||
            stripHtml(e.body).toLowerCase().includes(q)
          );
          const groups = [...new Set(filtered.map(e => e.group).filter(Boolean))];
          const ungrouped = filtered.filter(e => !e.group);

          if (ABOUT_FEATURES.length === 0) {
            return (
              <div style={{ fontSize:12, color:"var(--text-faint)", textAlign:"center", padding:24 }}>
                No entries yet. Add items to ABOUT_FEATURES in src/about.js.
              </div>
            );
          }
          if (filtered.length === 0) {
            return (
              <div style={{ fontSize:12, color:"var(--text-faint)", textAlign:"center", padding:24 }}>
                No help topics match "{query.trim()}". Try a different word, or use 💬 Feedback to ask directly.
              </div>
            );
          }
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              {groups.map(g => (
                <div key={g}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--text-faint)", letterSpacing:"1px",
                    textTransform:"uppercase", marginBottom:9 }}>{g}</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                    {filtered.filter(e => e.group === g).map(e => (
                      <CollapsibleAboutCard key={e.id} entry={e} defaultOpen={!!q} />
                    ))}
                  </div>
                </div>
              ))}
              {ungrouped.map(e => (
                <CollapsibleAboutCard key={e.id} entry={e} defaultOpen={!!q} />
              ))}
            </div>
          );
        })()}

        <button onClick={() => setOpen(false)}
          style={{ marginTop:22, width:"100%", background:"rgba(96,165,250,0.08)",
            border:"1px solid rgba(96,165,250,0.25)", borderRadius:8, padding:"9px 0",
            color:"#60a5fa", fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Close
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button className="mbtn" onClick={() => { setQuery(""); setOpen(true); }} title="Look up how a feature or number works">
        ❓ Help
      </button>
      {overlay}
    </>
  );
}

// Small hover / click / focus info popover — replaces flaky native `title`
// tooltips so the (i) always reveals its explanation (works on touch + keyboard too).
function Hint({ text, width = 240 }) {
  const [show, setShow] = React.useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", marginLeft: 4 }}>
      <span
        role="button"
        tabIndex={0}
        aria-label="More information"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); setShow((s) => !s); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShow((s) => !s); } }}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 15, height: 15, borderRadius: "50%", background: "rgba(96,165,250,0.15)",
          color: "#60a5fa", fontSize: 10, fontWeight: 700, fontStyle: "normal", lineHeight: 1,
          cursor: "help", border: "1px solid rgba(96,165,250,0.4)",
        }}
      >
        i
      </span>
      {show && (
        <span
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
            width, background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8,
            padding: "9px 11px", fontSize: 11, color: "#cbd5e1", lineHeight: 1.55, fontWeight: 400,
            textAlign: "left", zIndex: 100001, boxShadow: "0 10px 30px rgba(0,0,0,0.6)", pointerEvents: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function InfoModal({ title, children, accent = "#60a5fa", trigger }) {
  const [open, setOpen] = React.useState(false);
  const overlay = open ? ReactDOM.createPortal(
    <div
      onClick={() => setOpen(false)}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:99999,
        display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#0f1729", border:`1px solid ${withAlpha(accent, "44")}`, borderRadius:12,
          padding:28, maxWidth:480, width:"100%", boxShadow:"0 24px 60px rgba(0,0,0,0.6)" }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:700, color:accent }}>{title}</div>
          <button onClick={() => setOpen(false)}
            style={{ background:"transparent", border:"none", color:"var(--text-muted)",
              cursor:"pointer", fontSize:18, lineHeight:1 }}>✕</button>
        </div>
        <div style={{ fontSize:13, color:"var(--text-secondary)", lineHeight:1.7 }}>{children}</div>
        <button onClick={() => setOpen(false)}
          style={{ marginTop:20, width:"100%", background:accent+"22",
            border:`1px solid ${withAlpha(accent, "44")}`, borderRadius:8, padding:"8px 0",
            color:accent, fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Got it
        </button>
      </div>
    </div>,
    document.body
  ) : null;
  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} style={{ cursor:"pointer", display:"inline-flex" }}>
          {trigger}
        </span>
      ) : (
        <span
          onClick={() => setOpen(true)}
          style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
            width:16, height:16, borderRadius:"50%", background:"var(--card-border)",
            border:`1px solid ${withAlpha(accent, "44")}`, color:accent, fontSize:10, fontWeight:700,
            cursor:"pointer", flexShrink:0 }}
          title="Click for more info"
        >?</span>
      )}
      {overlay}
    </>
  );
}

/**
 * A table header whose explanation opens on CLICK.
 *
 * §28.2. These were `<th title="…">Label <InfoIcon/></th>`: v1.2.54 added the
 * visible ⓘ marker, which fixed DISCOVERABILITY (you can see an explanation
 * exists) but not REACHABILITY — `title=` does not exist on touch devices at all,
 * so every phone and tablet user could see the marker and never read the text.
 * The explanation is what tells you how to read the column, which makes it the
 * load-bearing tier-2 case: visible affordance, opens on click.
 *
 * `tip` accepts the same plain strings the old `title=` used, including the
 * `&#10;&#10;` / "\n\n" paragraph breaks and "• " bullets they were written with.
 */
function ThInfo({ children, tip, style, accent = "#93c5fd", modalTitle }) {
  const paras = String(tip)
    .replace(/&#10;/g, "\n")
    .split(/\n\s*\n/)
    .filter(Boolean);
  return (
    <th style={style}>
      {children}{" "}
      <InfoModal
        title={modalTitle || (typeof children === "string" ? children.trim() : "About this column")}
        accent={accent}
        trigger={
          <span style={{ cursor: "pointer", display: "inline-flex", color: accent }}
                title="Tap or click for more info">
            <InfoIcon size={12} />
          </span>
        }
      >
        {paras.map((para, i) => {
          const bullets = para.split("\n").filter(l => l.trim().startsWith("•"));
          if (bullets.length) {
            const lead = para.split("\n").filter(l => !l.trim().startsWith("•")).join(" ").trim();
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                {lead && <p style={{ margin: "0 0 6px" }}>{lead}</p>}
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {bullets.map((b, j) => <li key={j}>{b.replace(/^\s*•\s*/, "")}</li>)}
                </ul>
              </div>
            );
          }
          return <p key={i} style={{ margin: "0 0 10px" }}>{para}</p>;
        })}
      </InfoModal>
    </th>
  );
}

function Slider({ label, value, min, max, step, stepNudge, format, onChange, quickPills, accent, titleHint }) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  const trackRef = useRef(null);

  // Stepper nudge increments
  const nudge = stepNudge || step;
  const handleDec = useCallback((e) => {
    e?.stopPropagation();
    const next = Math.max(min, Number((value - nudge).toFixed(4)));
    onChange(next);
  }, [value, min, nudge, onChange]);

  const handleInc = useCallback((e) => {
    e?.stopPropagation();
    const next = Math.min(max, Number((value + nudge).toFixed(4)));
    onChange(next);
  }, [value, max, nudge, onChange]);

const [draft, setDraft] = useState(null);
  const commitDraft = useCallback(() => {
    if (draft !== null) {
      const n = parseMoneyInput(draft, min); // "$1,250,000", "1.25M", spaces
      if (n !== null) onChange(n);
      setDraft(null);
    }
  }, [draft, min, onChange]);

  const handleClick = useCallback(
    (e) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const stepped = Math.round((min + ratio * (max - min)) / step) * step;
      const rounded = Number(Math.max(min, Math.min(max, stepped)).toFixed(4));
      onChange(rounded);
    },
    [min, max, step, onChange]
  );

  const handleDrag = useCallback(
    (e) => {
      e.preventDefault();
      const move = (ev) => {
        if (!trackRef.current) return;
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const rect = trackRef.current.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (clientX - rect.left) / rect.width)
        );
        const stepped = Math.round((min + ratio * (max - min)) / step) * step;
        const rounded = Number(Math.max(min, Math.min(max, stepped)).toFixed(4));
        onChange(rounded);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", up);
    },
    [min, max, step, onChange]
  );

  // If no label is passed (e.g. inside DualInput), render a compact full-width track directly.
  if (!label) {
    return (
      <div className="sl-row-compact" style={{ width: "100%", padding: "3px 0 6px" }}>
        <div
          ref={trackRef}
          onClick={handleClick}
          style={{
            position: "relative",
            height: 20,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none",
            width: "100%",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 6,
              borderRadius: 3,
              background: "rgba(255,255,255,0.12)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${pct}%`,
              height: 6,
              borderRadius: 3,
              background: accent || "linear-gradient(90deg,#0d9488,#14b8a6)",
            }}
          />
          <div
            onMouseDown={handleDrag}
            onTouchStart={handleDrag}
            style={{
              position: "absolute",
              left: `calc(${pct}% - 9px)`,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--positive, #10b981)",
              border: "2.5px solid #14b8a6",
              boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
              cursor: "grab",
              zIndex: 2,
              transition: "transform 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="sl-row">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="sl-label">{label}</span>
          {titleHint && <span style={{ fontSize: 10, color: "var(--text-faint)" }}>({titleHint})</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            className="sl-nudge-btn"
            onClick={handleDec}
            disabled={value <= min}
            title={`Decrease (${stepNudge ? `-${stepNudge}` : `-${step}`})`}
            aria-label={`Decrease ${label}`}
          >
            −
          </button>
          <input
            className="sl-val sl-val-input"
            type="text"
            inputMode="decimal"
            aria-label={label}
            value={draft !== null ? draft : format(value)}
            title="Click to type an exact value — you can enter more than the slider's range"
            onFocus={(e) => {
              setDraft(String(value));
              requestAnimationFrame(() => e.target.select());
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitDraft();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
          />
          <button
            type="button"
            className="sl-nudge-btn"
            onClick={handleInc}
            disabled={value >= max}
            title={`Increase (${stepNudge ? `+${stepNudge}` : `+${step}`})`}
            aria-label={`Increase ${label}`}
          >
            +
          </button>
        </div>
      </div>

      {/* Full-width interactive slider track */}
      <div
        ref={trackRef}
        onClick={handleClick}
        style={{
          position: "relative",
          height: 20,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          width: "100%",
          padding: "0 2px",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            background: "rgba(255,255,255,0.12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            height: 6,
            borderRadius: 3,
            background: accent || "linear-gradient(90deg,#0d9488,#14b8a6)",
            boxShadow: "0 0 10px rgba(20,184,166,0.3)",
          }}
        />
        <div
          onMouseDown={handleDrag}
          onTouchStart={handleDrag}
          style={{
            position: "absolute",
            left: `calc(${pct}% - 9px)`,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#ffffff",
            border: "2.5px solid #14b8a6",
            boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
            cursor: "grab",
            zIndex: 2,
            transition: "transform 0.12s, box-shadow 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.25)";
            e.currentTarget.style.boxShadow = "0 0 12px rgba(20,184,166,0.8)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.6)";
          }}
        />
      </div>

      {/* Quick selection pill chips (if provided) */}
      {Array.isArray(quickPills) && quickPills.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginTop: 1, flexWrap: "wrap" }}>
          {quickPills.map((pill) => {
            const isActive = Math.abs(value - pill.val) < 0.001;
            return (
              <button
                key={pill.lbl}
                type="button"
                onClick={() => onChange(pill.val)}
                style={{
                  background: isActive ? "rgba(20,184,166,0.22)" : "rgba(255,255,255,0.04)",
                  border: isActive ? "1px solid #14b8a6" : "1px solid rgba(255,255,255,0.08)",
                  color: isActive ? "#5eead4" : "#94a3b8",
                  borderRadius: 4,
                  padding: "2px 6px",
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {pill.lbl}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
/* ════ Helper UI Functions ════ */
function DualInput({ label, value, min, max, step, format, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
        <ANumInput
          value={value}
          onSet={onChange}
          min={min}
          max={max}
          step={step}
        />
      </div>
      <Slider label="" value={value} min={min} max={max} step={step} format={format} onChange={onChange} />
    </div>
  );
}

/* ════ IMPORT / EXPORT ════ */
const LS_PROFILE_KEY = "aira_profile_v1";

/* ════ PROGRESS CHECK-INS ════
   A running journal of plan snapshots (success rate, portfolio, spending, ages).
   Stored under their own key, OUTSIDE the profile: unlike Export/Import, check-ins
   are never loaded back into the planner — they only feed the Progress view. */
const LS_CHECKINS_KEY = "aira_checkins_v1";
function loadCheckIns() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_CHECKINS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveCheckIns(list) {
  try {
    localStorage.setItem(LS_CHECKINS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
function saveProfileToLocal(values) {
  try {
    const hasPropIncome = (values.properties || []).some(pr => Number(pr.income) > 0);
    const payload = {
      ...values,
      ab: hasPropIncome ? 0 : (values.ab || 0),
      // rothConversionTarget preserves its raw value (e.g. "fill_22") so the dropdown
      // round-trips correctly. Engine strips "fill_" at the params boundary.
      fafsaEndYear: values.fafsaEndYear || null,
      cssEndYear: values.cssEndYear || null,
      savedAt: new Date().toISOString(),
      buildTag: BUILD_TAG,
    };
    localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
function loadProfileFromLocal() {
  try {
    const raw = localStorage.getItem(LS_PROFILE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Migration: spSpendOutofState (legacy scenario-swap field) -> spOutOfCountry (additive).
    if (data && data.spOutOfCountry == null && data.spSpendOutofState) {
      data.spOutOfCountry = data.spSpendOutofState;
    }
    // Migration: legacy saves stripped the "fill_" prefix from rothConversionTarget.
    // Restore it so the dropdown matches an option again.
    if (data && data.rothConversionTarget && /^\d+$/.test(data.rothConversionTarget)) {
      data.rothConversionTarget = "fill_" + data.rothConversionTarget;
    }
    // Migration (v1.2.88): six distribution strategies were retired. A saved
    // profile still naming one would match no branch in either engine, which
    // reads as a silent ~1%/yr spending cut rather than an error — so remap
    // here, at the single point every saved profile enters the app, and stamp
    // `withdrawalStrategyMigratedFrom` so the UI can say it happened.
    return migrateWithdrawalStrategy(data);
  } catch {
    return null;
  }
}
function exportProfile(values, name = "AiRA_Profile") {
  const blob = new Blob([JSON.stringify(values, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
    a.href = url;
    a.download = `${name}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importProfile(onLoad) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        
        // Ensure accounts is always a valid array
        if (!Array.isArray(parsed.accounts)) {
          parsed.accounts = BLANK_PROFILE.accounts;
        }
        
        // Ensure properties is always a valid array
        if (!Array.isArray(parsed.properties)) {
          parsed.properties = BLANK_PROFILE.properties;
        } else {
            parsed.properties = parsed.properties.map((p, i) =>
              p.id ? { ...p, id: String(p.id) } : { ...p, id: "p" + (i + 1) }
            );
        }
        
        // Ensure checkpoints is always an array and all entries have string IDs
        if (!Array.isArray(parsed.checkpoints)) {
          parsed.checkpoints = [];
        } else {
          parsed.checkpoints = parsed.checkpoints.map(cp =>
            cp.id != null ? { ...cp, id: String(cp.id) } : { ...cp, id: Date.now().toString() + Math.random() }
          );
        }
        
        // Ensure otherIncomes is always a valid array
        if (!Array.isArray(parsed.otherIncomes)) {
          parsed.otherIncomes = [];
        }

        // Fix date format if needed
        if (parsed.dob && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.dob)) {
          const d = new Date(parsed.dob);
          if (!isNaN(d.getTime())) {
            parsed.dob = d.toISOString().slice(0, 10);
          }
        }
        
        onLoad(parsed);
      } catch {
        alert("Invalid profile file — must be a valid AiRA JSON export.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// SSA 2022 Period Life Table — annual death probability qx by single age
// Source: https://www.ssa.gov/oact/STATS/table4c6.html
// Index 0 = age 50, index 50 = age 100
const SSA_QX_MALE = [
  0.00520,0.00568,0.00619,0.00674,0.00733, // 50-54
  0.00796,0.00865,0.00940,0.01022,0.01112, // 55-59
  0.01213,0.01324,0.01446,0.01580,0.01729, // 60-64
  0.01892,0.02069,0.02263,0.02475,0.02706, // 65-69
  0.02960,0.03239,0.03548,0.03890,0.04267, // 70-74
  0.04685,0.05149,0.05661,0.06224,0.06840, // 75-79
  0.07514,0.08250,0.09054,0.09930,0.10882, // 80-84
  0.11915,0.13033,0.14237,0.15527,0.16903, // 85-89
  0.18359,0.19878,0.21432,0.22962,0.24419, // 90-94
  0.25855,0.27357,0.28997,0.30826,0.32870, // 95-99
  0.35148,                                  // 100
];
const SSA_QX_FEMALE = [
  0.00280,0.00304,0.00330,0.00359,0.00390, // 50-54
  0.00425,0.00463,0.00507,0.00556,0.00612, // 55-59
  0.00675,0.00746,0.00824,0.00909,0.01003, // 60-64
  0.01107,0.01222,0.01349,0.01490,0.01646, // 65-69
  0.01819,0.02012,0.02228,0.02469,0.02739, // 70-74
  0.03044,0.03388,0.03774,0.04205,0.04683, // 75-79
  0.05211,0.05793,0.06433,0.07134,0.07900, // 80-84
  0.08733,0.09637,0.10613,0.11664,0.12795, // 85-89
  0.14011,0.15315,0.16711,0.18203,0.19792, // 90-94
  0.21476,0.23238,0.25058,0.26894,0.28700, // 95-99
  0.30462,                                  // 100
];

/* P(alive at toAge | alive at fromAge) from the same SSA period life table
 * the fan chart's mortality overlay uses — single mortality source for the
 * whole app. Ages below 50 are treated as q=0 (negligible for this app's
 * planning ranges); ages past 100 hold the age-100 rate. Exported for tests. */
export function survivalToAge(fromAge, toAge, sex = "blended") {
  if (toAge <= fromAge) return 1;
  let survM = 1, survF = 1;
  for (let age = fromAge; age < toAge; age++) {
    const i = Math.min(age - 50, 50);
    if (i >= 0) {
      survM *= 1 - (SSA_QX_MALE[i] || 0);
      survF *= 1 - (SSA_QX_FEMALE[i] || 0);
    }
  }
  return sex === "male" ? survM : sex === "female" ? survF : (survM + survF) / 2;
}

function computeSurvivalCurve(startAge, endAge, sex = "blended") {
  const maleQx   = SSA_QX_MALE;
  const femaleQx = SSA_QX_FEMALE;
  const curve = [];
  let survM = 1, survF = 1;
  for (let age = startAge; age <= Math.min(endAge, 100); age++) {
    const i = Math.min(age - 50, 50);
    if (i >= 0) {
      survM *= (1 - (maleQx[i]   || 0));
      survF *= (1 - (femaleQx[i] || 0));
    }
    const surv = sex === "male" ? survM : sex === "female" ? survF : (survM + survF) / 2;
    curve.push({ age, survival: Math.max(0, surv) });
  }
  return curve;
}

function FanChart({ pcts, retireAge, ssAge, rmdAge, inf, useReal, title, checkpoints, earlyRetireTarget, dob, portfolioGoal, currentAge, currentPort, contrib, hhProfile, preRetireEq, sex, hoveredAge }) {
  const [showTargets, setShowTargets] = useState(true);
  const [showMortality, setShowMortality] = useState(false);

  const rawData = useMemo(() => deflate(pcts, inf, useReal), [pcts, inf, useReal]);

  // Deterministic accumulation path: current portfolio → retirement
  const accumData = useMemo(() => {
    if (!currentPort || currentAge == null || currentAge >= retireAge) return [];
    const ret = expectedReturn(preRetireEq ?? 91) / 100;
    let p = currentPort;
    const pts = [];
    for (let age = currentAge; age <= retireAge; age++) {
      pts.push({ age, accum: p });
      // Household total for THIS age when the full profile is available: the
      // 401(k) line alone understated every other stream, and a spouse who
      // retires first has to drop out on their own date (§24.1). Falls back to
      // the bare `contrib` prop so any other caller keeps working.
      const add = hhProfile ? householdAnnualContribution(hhProfile, age) : (contrib || 0);
      // One-off INFLOWS landing in this pre-retirement year. All three engines
      // deposit these during accumulation (runMC, simulateDeterministicWithStrategy,
      // accumulateToRetirement) but this line did not, so a windfall entered for a
      // year before retirement was invisible until the MC bands took over AT
      // retirement — the money appeared to arrive on the retirement date no matter
      // which year the user typed. Same year mapping the engines use: accumulation
      // year y is calendar year CURRENT_YEAR + y.
      //
      // Inflows only, matching the engines: pre-retirement one-off COSTS are
      // presumed paid from wages, which no engine models.
      const evIn = computeCashFlowEvents(
        hhProfile?.cashFlowEvents, CURRENT_YEAR + (age - currentAge), hhProfile?.inf ?? 2.5, CURRENT_YEAR,
      ).inflow;
      p = Math.round(p * (1 + ret) + add + evIn);
    }
    return pts;
  }, [currentPort, currentAge, retireAge, contrib, preRetireEq, hhProfile]);

  // Merge accumulation into chart data so XAxis spans both phases.
  // When toggle is OFF, revert to retirement-only range (rawData).
  const data = useMemo(() => {
    if (!showTargets || accumData.length === 0) return rawData;
    const preRetire = accumData.slice(0, -1).map(d => ({ age: d.age, accum: d.accum }));
    const atRetire = rawData[0] ? { ...rawData[0], accum: accumData[accumData.length - 1].accum } : null;
    return [...preRetire, ...(atRetire ? [atRetire] : []), ...rawData.slice(atRetire ? 1 : 0)];
  }, [accumData, rawData, showTargets]);

  // Interpolate which percentile a value falls at within the fan bands
  const calcPercentile = (value, row) => {
    if (!row || !row.p10 || !row.p90) return null;
    const { p10, p25, p50, p75, p90 } = row;
    if (value <= p10) return "≤10th";
    if (value <= p25) return `~${Math.round(10 + (value - p10) / (p25 - p10) * 15)}th`;
    if (value <= p50) return `~${Math.round(25 + (value - p25) / (p50 - p25) * 25)}th`;
    if (value <= p75) return `~${Math.round(50 + (value - p50) / (p75 - p50) * 25)}th`;
    if (value <= p90) return `~${Math.round(75 + (value - p75) / (p90 - p75) * 15)}th`;
    return "≥90th";
  };

  // "You Are Here" percentile (only meaningful if already in retirement)
  const nowPct = currentAge >= retireAge
    ? calcPercentile(currentPort, pcts.find(d => d.age === currentAge))
    : null;

  const maxY = useMemo(() => {
    if (!data || data.length === 0) return 5_000_000;
    const maxPortfolio = Math.max(...data.map(d => Math.max(d.p90 || 0, d.p75 || 0, d.p50 || 0, d.accum || 0)));
    return Math.max(maxPortfolio, portfolioGoal || 0, earlyRetireTarget || 0, currentPort || 0) * 1.05;
  }, [data, portfolioGoal, earlyRetireTarget, currentPort]);

  // Mortality overlay — survival probability merged into chart data
  const mortalityData = useMemo(() => {
    if (!currentAge) return [];
    return computeSurvivalCurve(currentAge, Math.max(...(data.map(d => d.age).filter(Boolean)), 100), sex || "blended");
  }, [currentAge, data, sex]);

  const mortByAge = useMemo(() => {
    const m = {};
    mortalityData.forEach(d => { m[d.age] = d.survival; });
    return m;
  }, [mortalityData]);

  // Median death age (50% survival) for the reference line
  const medianDeathAge = useMemo(() => {
    const pt = mortalityData.find(d => d.survival <= 0.5);
    return pt ? pt.age : null;
  }, [mortalityData]);

  const q25DeathAge = useMemo(() => {
    const pt = mortalityData.find(d => d.survival <= 0.25);
    return pt ? pt.age : null;
  }, [mortalityData]);

  // Merge survival into chart data for the secondary axis
  const dataWithMortality = useMemo(() =>
    data.map(d => ({ ...d, survival: mortByAge[d.age] ?? null })),
    [data, mortByAge]
  );

  return (
    <div className="chart-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div className="ct" style={{ margin: 0 }}>
          {title}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Toggle val={showMortality} onChange={setShowMortality} label="Mortality" accent="var(--negative)" />
          <Toggle val={showTargets} onChange={setShowTargets} label="Milestones" accent="#f59e0b" />
        </div>
      </div>
      {showMortality && medianDeathAge && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8, padding: "6px 10px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5" strokeDasharray="5 3"/></svg>
            <span style={{ fontSize: 11, color: "rgba(239,68,68,0.8)", fontWeight: 600 }}>P(alive) — chart below</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            SSA {sex === "male" ? "male" : sex === "female" ? "female" : "blended"} survival probability by age.
            50% of people your age have died by <strong style={{ color: "#e2e8f0" }}>age {medianDeathAge}</strong>
            {q25DeathAge ? <>, 75% by <strong style={{ color: "#e2e8f0" }}>age {q25DeathAge}</strong></> : ""}.
            For most retirees, dying before going broke is far more likely than running out of money.
          </span>
        </div>
      )}
      {showTargets && (() => {
        const currentYear   = new Date().getFullYear();
        const pctsData      = pcts || [];
        const reassessCross = pctsData.find(d => d.p50 >= portfolioGoal);
        const triggerCross  = pctsData.find(d => d.p50 >= earlyRetireTarget);

        const crossBadge = (cross, accentColor) => {
          if (!cross) return <span style={{ fontSize: 10, color: "var(--text-faint)", fontStyle: "italic" }}>Not reached on median path</span>;
          const crossYear = currentYear + (cross.age - (currentAge || 60));
          const diff = cross.age - (retireAge || 65);
          const timing = diff < 0
            ? <span style={{ color: "#34d399" }}>{Math.abs(diff)} yr{Math.abs(diff) !== 1 ? "s" : ""} before D‑Day (Retirement) ✅</span>
            : diff === 0
            ? <span style={{ color: "var(--accent-gold)" }}>At retirement ✅</span>
            : <span style={{ color: "#fb923c" }}>{diff} yr{diff !== 1 ? "s" : ""} after D‑Day</span>;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div style={{ background: `${withAlpha(accentColor, "22")}`, border: `1px solid ${withAlpha(accentColor, "55")}`, borderRadius: 6, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: accentColor, fontFamily: "'JetBrains Mono',monospace" }}>Age {cross.age} · {crossYear}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>·</span>
                <span style={{ fontSize: 11 }}>{timing}</span>
              </div>
            </div>
          );
        };

        return (
          <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 8, padding: "8px 12px", flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6", marginBottom: 3 }}>🚀 Trigger — ${Math.round(earlyRetireTarget).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Your early-exit number. If the median hits this before D-Day, the math says you're done — regardless of your original timeline.
              </div>
              {crossBadge(triggerCross, "#8b5cf6")}
            </div>
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8, padding: "8px 12px", flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", marginBottom: 3 }}>🎯 Reassess — ${Math.round(portfolioGoal).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Your minimum acceptable goal. When the median MC path crosses this line, your plan is already viable — anything above is upside.
              </div>
              {crossBadge(reassessCross, "#f59e0b")}
            </div>
          </div>
        );
      })()}
      <ResponsiveContainer width="100%" height={640}>
        <ComposedChart
          data={dataWithMortality}
          margin={{ top: 28, right: 48, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="g90v5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="g75v5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="var(--row-highlight)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          />
          <YAxis
            yAxisId="port"
            stroke="#1e3a5f"
            tick={{ fill: "var(--text-faint)", fontSize: 11 }}
            tickFormatter={(v) => fmtDollar(v)}
            width={MONEY_AXIS_WIDTH}
            domain={[0, maxY]}
          />
          <Tooltip content={<Tip />} />

          {/* Vertical reference lines (D-Day, SS, RMD) */}
          <ReferenceLine yAxisId="port" x={retireAge} stroke="var(--accent-gold)" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: "D-Day (Retirement Date)", fill: "var(--accent-gold)", fontSize: 10, position: "top" }} />
          <ReferenceLine yAxisId="port" x={ssAge} stroke="#c084fc" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: "SS", fill: "#c084fc", fontSize: 10, position: "top" }} />
          <ReferenceLine yAxisId="port" x={rmdAge} stroke="#34d399" strokeWidth={1} strokeDasharray="4 3" label={{ value: "RMD", fill: "#34d399", fontSize: 10, position: "top" }} />

          {/* Fan areas and percentile lines */}
          <Area yAxisId="port" type="monotone" dataKey="p90" stroke={FAN_COLORS["90th"]} strokeWidth={1} strokeDasharray="4 2" fill="url(#g90v5)" dot={false} name="90th" legendType="none" />
          <Area yAxisId="port" type="monotone" dataKey="p75" stroke={FAN_COLORS["75th"]} strokeWidth={1} strokeDasharray="3 2" fill="url(#g75v5)" dot={false} name="75th" legendType="none" />
          <Line yAxisId="port" type="monotone" dataKey="p50" stroke={FAN_COLORS["Median"]} strokeWidth={2.5} dot={false} name="Median" />
          <Line yAxisId="port" type="monotone" dataKey="p25" stroke={FAN_COLORS["25th"]} strokeWidth={1.5} dot={false} strokeDasharray="5 3" name="25th" />
          <Line yAxisId="port" type="monotone" dataKey="p10" stroke={FAN_COLORS["10th"]} strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="10th" />

          {/* Hover highlight — when a row in the age-band table below is hovered,
              spotlight that age column and mark its percentile values on the fan. */}
          {hoveredAge != null && (() => {
            const row = dataWithMortality.find((d) => d.age === hoveredAge);
            if (!row) return null;
            const dot = (val, color) =>
              val == null ? null : (
                <ReferenceDot yAxisId="port" x={hoveredAge} y={val} r={4} fill={color} stroke="var(--bg-base)" strokeWidth={1.5} isFront />
              );
            return (
              <>
                <ReferenceLine yAxisId="port" x={hoveredAge} stroke="rgba(56,189,248,0.5)" strokeWidth={2}
                  label={{ value: `Age ${hoveredAge}`, fill: "var(--accent)", fontSize: 10, position: "top" }} />
                {dot(row.p90, FAN_COLORS["90th"])}
                {dot(row.p75, FAN_COLORS["75th"])}
                {dot(row.p50, FAN_COLORS["Median"])}
                {dot(row.p25, FAN_COLORS["25th"])}
                {dot(row.p10, FAN_COLORS["10th"])}
              </>
            );
          })()}

          {/* Deterministic accumulation path (pre-retirement) */}
          {showTargets && accumData.length > 0 && (
            <Line yAxisId="port" type="monotone" dataKey="accum" stroke="#60a5fa" strokeWidth={2}
              strokeDasharray="6 3" dot={false} name="Expected path" connectNulls={false} />
          )}

          {/* You Are Here */}
          {showTargets && currentAge != null && currentPort != null && (
            <ReferenceDot
              yAxisId="port"
              x={currentAge} y={currentPort} r={7}
              fill="#60a5fa" stroke="#0f1729" strokeWidth={2}
              label={{ value: nowPct ? `▶ Now · ${nowPct} %ile` : "▶ Now", fill: "#60a5fa", fontSize: 10, position: "top" }}
            />
          )}

          {/* Checkpoint dots — color + percentile label, one label per age */}
          {(() => {
            if (!checkpoints || !dob) return null;
            const labeledAges = new Set();
            return checkpoints.map((cp) => {
              if (!cp.date) return null;
              // Shared helper. The hand-rolled version here compared month-day
              // as STRINGS, so e.g. "9-5" < "10-1" was true lexically but false
              // as a date — mis-aging checkpoints in some months.
              const age = ageFromDob(dob, cp.date);
              if (age == null) return null;

              const isPreRetire = age < retireAge;
              if (isPreRetire && !showTargets) return null;

              let color = "var(--text-muted)";
              let pctLabel = "";

              if (isPreRetire) {
                const accumAtAge = accumData.find(d => d.age === age)?.accum;
                if (accumAtAge) {
                  const ratio = cp.value / accumAtAge;
                  if (ratio >= 1)         { color = "var(--positive)"; pctLabel = `+${Math.round((ratio - 1) * 100)}%`; }
                  else if (ratio >= 0.85) { color = "var(--accent-gold)"; pctLabel = `${Math.round((ratio - 1) * 100)}%`; }
                  else                    { color = "var(--negative)"; pctLabel = `${Math.round((ratio - 1) * 100)}%`; }
                }
              } else {
                const fanRow = pcts.find(d => d.age === age);
                if (fanRow) {
                  if (cp.value >= fanRow.p50)      color = "var(--positive)";
                  else if (cp.value <= fanRow.p25) color = "var(--negative)";
                  else                             color = "var(--accent-gold)";
                  pctLabel = calcPercentile(cp.value, fanRow) || "";
                }
              }

              // Only the first checkpoint at each age gets a text label
              const showLabel = !labeledAges.has(age);
              if (showLabel) labeledAges.add(age);
              const labelText = showLabel
                ? ([cp.note, pctLabel].filter(Boolean).join(" · ") || "●")
                : "";

              return (
                <ReferenceDot
                  yAxisId="port"
                  key={cp.id}
                  x={age} y={cp.value} r={5}
                  fill={color} stroke="#fff" strokeWidth={1.5}
                  label={showLabel ? { value: labelText, fill: color, fontSize: 9, position: "top" } : undefined}
                />
              );
            });
          })()}

          {/* Target horizontal lines (toggled via showTargets) */}
          {showTargets && <ReferenceLine
            yAxisId="port"
            y={portfolioGoal}
            stroke="#f59e0b"
            strokeWidth={2.5}
            strokeDasharray="0"
            label={{
              value: `🎯 Reassess $${Math.round(portfolioGoal).toLocaleString()}`,
              fill: "var(--bg-base)",
              fontSize: 12,
              fontWeight: 700,
              position: "right",
              style: { background: "#f59e0b", padding: "4px 8px", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }
            }}
          />}
          {showTargets && <ReferenceLine
            yAxisId="port"
            y={earlyRetireTarget}
            stroke="#8b5cf6"
            strokeWidth={2.5}
            strokeDasharray="0"
            label={{
              value: `🚀 Trigger $${Math.round(earlyRetireTarget).toLocaleString()}`,
              fill: "#fff",
              fontSize: 12,
              fontWeight: 700,
              position: "right",
              style: { background: "#8b5cf6", padding: "4px 8px", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }
            }}
          />}
          {showTargets && (() => {
            const pctsForDots   = pcts || [];
            const reassessCross = pctsForDots.find(d => d.p50 >= portfolioGoal);
            const triggerCross  = pctsForDots.find(d => d.p50 >= earlyRetireTarget);
            return (
              <>
                {reassessCross && (
                  <ReferenceDot
                    yAxisId="port"
                    x={reassessCross.age} y={portfolioGoal}
                    r={6} fill="#f59e0b" stroke="var(--bg-base)" strokeWidth={2}
                    label={{ value: `Age ${reassessCross.age}`, fill: "#f59e0b", fontSize: 9, position: "top" }}
                  />
                )}
                {triggerCross && (
                  <ReferenceDot
                    yAxisId="port"
                    x={triggerCross.age} y={earlyRetireTarget}
                    r={6} fill="#8b5cf6" stroke="var(--bg-base)" strokeWidth={2}
                    label={{ value: `Age ${triggerCross.age}`, fill: "#8b5cf6", fontSize: 9, position: "top" }}
                  />
                )}
              </>
            );
          })()}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Survival probability — own chart, own axis (%), sharing the age x-axis
          with the portfolio chart above so the two still read together without
          a fabricated dual-axis alignment between dollars and probability. */}
      {showMortality && (
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={dataWithMortality} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 11 }} />
            <YAxis
              stroke="rgba(239,68,68,0.3)"
              tick={{ fill: "rgba(239,68,68,0.5)", fontSize: 10 }}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              domain={[0, 1]}
              tickCount={6}
              width={MONEY_AXIS_WIDTH}
            />
            <Tooltip content={<Tip />} />
            {medianDeathAge && (
              <ReferenceLine x={medianDeathAge} stroke="rgba(239,68,68,0.5)" strokeWidth={1} strokeDasharray="3 3"
                label={{ value: "50% alive", fill: "rgba(239,68,68,0.7)", fontSize: 9, position: "insideTopRight" }} />
            )}
            {q25DeathAge && (
              <ReferenceLine x={q25DeathAge} stroke="rgba(239,68,68,0.3)" strokeWidth={1} strokeDasharray="2 4"
                label={{ value: "25% alive", fill: "rgba(239,68,68,0.5)", fontSize: 9, position: "insideTopRight" }} />
            )}
            <Line type="monotone" dataKey="survival" stroke="rgba(239,68,68,0.6)"
              strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="P(alive)" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Unified Legend */}
      <div className="leg">
        {[
          ...(showTargets && accumData.length > 0 ? [{ c: "#60a5fa", l: "Expected path" }] : []),
          { c: FAN_COLORS["90th"], l: "90th %ile" },
          { c: FAN_COLORS["75th"], l: "75th %ile" },
          { c: FAN_COLORS["Median"], l: "Median" },
          { c: FAN_COLORS["25th"], l: "25th %ile" },
          { c: FAN_COLORS["10th"], l: "10th %ile" },
          ...(showTargets ? [
            { c: "#f59e0b", l: `🎯 Reassess $${Math.round(portfolioGoal).toLocaleString()}` },
            { c: "#8b5cf6", l: `🚀 Trigger $${Math.round(earlyRetireTarget).toLocaleString()}` },
          ] : []),
        ].map((i) => (
          <div key={i.l} className="li">
            <div className="ll" style={{ background: i.c }} />
            {i.l}
          </div>
        ))}
      </div>
    </div>
  );
}

// Splits a profile's "Other Expenses" carveouts by label into Medical /
// Long-Term Care / Other, for the Income & Expenses breakdown below. Carveouts
// are matched by keyword in their label so users can drive these categories
// just by naming a carveout "Medical" or "Long-Term Care".
function categorizeCarveouts(carveouts, yr, inf) {
  const iF = Math.pow(1 + (inf || 2.5) / 100, yr - new Date().getFullYear());
  let medical = 0, ltc = 0, other = 0;
  for (const c of carveouts || []) {
    if (yr > (c.endYear || 9999)) continue;
    const amt = Math.round((c.annual || 0) * iF);
    const label = (c.label || "").toLowerCase();
    if (/medical|health/.test(label)) medical += amt;
    else if (/long.?term|ltc|nursing/.test(label)) ltc += amt;
    else other += amt;
  }
  return { medical, ltc, other };
}

/* §28.1 OPEN 2 — ONE vocabulary for income, everywhere.
 *
 * Gary: "on the Income tab you don't call it fixed income, you call it SS on
 * that chart (so that wouldn't map well)." The same three streams were named
 * three ways across surfaces — "SS"/"Rental"/"Other Inc" in the schedule table,
 * "Social Security"/"Rental/Passive"/"Other Income" here, and enumerated as
 * "Social Security + Pension/Other + Annuity/Rental" in the withdrawal table's
 * own legend. A label must mean the same thing everywhere it appears, and the
 * component names must be recognisable as the parts of the "Income" aggregate.
 *
 * Canonical names (match the engine fields they render — r.ss, r.otherIncome,
 * r.annuityRental): "Social Security", "Pension/Other", "Annuity/Rental".
 * Aggregate of the three: "Income". Do not introduce a fourth spelling.
 */
/* "One-Off Income" is `r.eventInflow` — an inheritance, home sale or lump-sum
 * pension landing in a retirement year. It was missing from this list entirely,
 * so the one surface a user goes to for "where does my money come from" was the
 * only one that dropped it: the engine row carries it, and the Withdrawal Plan
 * table already marks it (+💰). It is NOT double-counted against Savings
 * Drawdown — the waterfall DEPOSITS an inflow into its bucket and computes the
 * year's draw separately, so the two are independent money-in figures. */
const INCOME_CATS = [
  ["Savings Drawdown", "var(--accent-teal)"],
  ["Social Security", "#7c3aedcc"],
  ["Annuity/Rental", "#295ff1cc"],
  ["Pension/Other", "#eab308cc"],
  ["One-Off Income", "#ec4899cc"],
  ["Roth Conversion", "#f59e0b"],
];

const EXPENSE_CATS = [
  ["General/Living", "var(--accent)"],
  ["Mortgage/Housing", "#fb923c"],
  ["Medical", "var(--positive)"],
  ["Long-Term Care", "var(--accent-purple)"],
  ["Other Expenses", "var(--text-secondary)"],
  ["Income Tax", "#f87171"],
  ["Capital Gains Tax", "var(--text-muted)"],
];

// "Income & Expenses" — a Boldin-style pair of stacked-bar charts sourced from
// the Smart Waterfall plan, so the figures shown here (including Roth
// conversions, mortgage payoff, and carveouts) match the Withdrawal Plan tab
// by construction. Hovering a year updates the side panel from "Lifetime"
// totals to that year's breakdown.
function IncomeExpensesChart({ p, inf }) {
  const rows = useMemo(() => buildWithdrawalWaterfall(p)?.smart?.rows ?? [], [p]);

  const data = useMemo(() => rows.map((r) => {
    const { medical, ltc, other } = categorizeCarveouts(p.carveouts, r.yr, inf);
    return {
      yr: r.yr, age: r.age,
      "Social Security": r.ss,
      "Annuity/Rental": r.annuityRental,
      "Pension/Other": r.otherIncome,
      "Savings Drawdown": r.fromCash + r.fromTaxable + r.fromPretax + r.fromRoth,
      "One-Off Income": r.eventInflow || 0,
      "Roth Conversion": r.conversionAmount,
      "General/Living": r.spending,
      "Mortgage/Housing": r.housingCost,
      "Medical": medical,
      "Long-Term Care": ltc,
      "Other Expenses": other,
      "Income Tax": r.fedTax + r.stateTax + r.irmaa,
      "Capital Gains Tax": 0,
    };
  }), [rows, p.carveouts, inf]);

  const [hoverYr, setHoverYr] = useState(null);
  const hoverRow = hoverYr != null ? data.find((d) => d.yr === hoverYr) : null;
  const onMove = (e) => { if (e && e.activeLabel != null) setHoverYr(e.activeLabel); };
  const onLeave = () => setHoverYr(null);

  if (!data.length) return null;

  return (
    <>
      <IncomeExpenseStack
        title="📊 Estimated Income, Drawdowns & Roth Conversions"
        /* The horizon is stated because its absence reads as a dropped entry. A
           user who enters a windfall for a pre-retirement year finds no trace of
           it here and concludes the chart is broken — it is not, the chart simply
           starts at retirement and that money is already inside the balances
           these years begin from. Silence was the defect. */
        subtitle={`Sourced from the Smart Waterfall plan — hover a year to see its breakdown on the right. Retirement years only (${data[0]?.yr} onward): money arriving before then is already inside the balances these years start from.`}
        data={data} categories={INCOME_CATS}
        hoverYr={hoverYr} hoverRow={hoverRow}
        onMove={onMove} onLeave={onLeave}
      />
      <IncomeExpenseStack
        title="📉 Estimated Expenses"
        subtitle="Living costs, housing, taxes, and carveouts (e.g. medical, long-term care) — hover a year for its breakdown"
        data={data} categories={EXPENSE_CATS}
        hoverYr={hoverYr} hoverRow={hoverRow}
        onMove={onMove} onLeave={onLeave}
        reconcile
        footnote="Capital Gains Tax is not yet separately modeled (shown as $0) — realized gains on taxable-account draws are folded into Income Tax. Roth conversion tax and IRMAA surcharges are funded directly from the pre-tax bucket, so totals here may differ slightly from the Income side."
      />
      {p.ssAge > p.retireAge && (
        <div className="flag-w" style={{ fontSize: 11 }}>
          ⚠ Social Security gap, ages {p.retireAge}–{p.ssAge - 1} — with no SS yet, your
          portfolio carries the full spending need (the green Savings Drawdown above is
          largest here). This is the highest sequence-of-returns risk window.
        </div>
      )}
    </>
  );
}

// One row of the portfolio-draw reconciliation panel. Negative values render with a
// leading minus and in the muted offset color; the dollar magnitude is always shown.
function ReconLine({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", fontSize: 11.5 }}>
      <div style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
        {label}
      </div>
      <div style={{ color: "#cbd5e1", fontFamily: "'JetBrains Mono',monospace" }}>
        {value < 0 ? `−${fmtDollar(Math.abs(value))}` : fmtDollar(value)}
      </div>
    </div>
  );
}

function IncomeExpenseStack({ title, subtitle, data, categories, hoverYr, hoverRow, onMove, onLeave, footnote, reconcile }) {
  const rows = categories.map(([key, color]) => ({
    key, color,
    value: hoverRow ? (hoverRow[key] || 0) : data.reduce((s, d) => s + (d[key] || 0), 0),
  }));
  const total = rows.reduce((s, r) => s + r.value, 0);

  // Portfolio-draw reconciliation (expense panel only). Pulls the SAME figures the
  // engine produces so the numbers match the green "Savings Drawdown" income bar
  // exactly. The draw covers spending + housing + carveouts net of guaranteed income;
  // taxes are funded separately from the pre-tax bucket (see footnote).
  const sumKey = (k) => hoverRow ? (hoverRow[k] || 0) : data.reduce((s, d) => s + (d[k] || 0), 0);
  const recon = reconcile ? (() => {
    const guaranteed   = sumKey("Social Security") + sumKey("Annuity/Rental") + sumKey("Pension/Other");
    const draw         = sumKey("Savings Drawdown");                 // true portfolio draw
    const coreSpend    = sumKey("General/Living");
    const housingCarve = sumKey("Mortgage/Housing") + sumKey("Medical") + sumKey("Long-Term Care") + sumKey("Other Expenses");
    const taxes        = sumKey("Income Tax") + sumKey("Capital Gains Tax");
    const spendNeed    = coreSpend + housingCarve;                   // before income offset
    return { guaranteed, draw, coreSpend, housingCarve, taxes, spendNeed };
  })() : null;

  return (
    <div className="chart-card">
      <div className="ct">{title}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{subtitle}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 12 }}>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onMouseMove={onMove} onMouseLeave={onLeave}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="yr" stroke="#1e3a5f" tick={{ fill: "#71a8f7", fontSize: 10 }} />
            <YAxis stroke="#1e3a5f" tick={{ fill: "#71a8f7", fontSize: 10 }} tickFormatter={(v) => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
            <Tooltip content={<Tip />} />
            {categories.map(([key, color], i) => (
              <Bar key={key} dataKey={key} stackId="a" fill={color} radius={i === categories.length - 1 ? [2, 2, 0, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 12, fontSize: 12, alignSelf: "start" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            {hoverYr != null ? `Year ${hoverYr}` : "Lifetime"}
          </div>
          {rows.map(({ key, color, value }) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#cbd5e1" }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: "inline-block" }} />
                {key}
              </div>
              <div style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(value)}</div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 8, paddingTop: 6, fontWeight: 700 }}>
            <div style={{ color: "#e2e8f0" }}>Total</div>
            <div style={{ color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(total)}</div>
          </div>

          {recon && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                What your portfolio must cover
              </div>
              <ReconLine label="Spending + housing + carveouts" value={recon.spendNeed} color="#cbd5e1" />
              <ReconLine label="− Covered by income (SS / rental / other)" value={-Math.min(recon.guaranteed, recon.spendNeed)} color="#7c3aed" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 6, paddingTop: 6, fontWeight: 700 }}>
                <div style={{ color: "#a9d1ac" }}>= Drawn from savings</div>
                <div style={{ color: "#a9d1ac", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(recon.draw)}</div>
              </div>
              <ReconLine label="Taxes (paid from pre-tax accounts)" value={recon.taxes} color="#f87171" />
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                “Drawn from savings” is the green <strong style={{ color: "#a9d1ac" }}>Savings Drawdown</strong> bar above — your spending plus housing &amp; carveouts, minus the income you already receive. Taxes are the <em>extra</em> the plan must produce on top, funded from your pre-tax accounts.
              </div>
            </div>
          )}
        </div>
      </div>
      {footnote && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>ℹ️ {footnote}</div>}
    </div>
  );
}

// Two-way mapping between the Conversion Plan tab's button vocabulary
// ("fill_22", "no_convert", "irmaa_safe" — matches rothConversionPlan.js's
// ROTH_MODE_TO_TARGET) and the persisted profile field params.rothConversionTarget
// ("fill_22", "off", "irmaa", plus the legacy un-prefixed "37"). This keeps the
// Conversion Plan tab's selector and the Withdrawal Plan / Monte Carlo's stored
// setting as a single value — no separate "rothMode" state.
const PROFILE_TO_ROTHMODE = {
  off: "no_convert",
  irmaa: "irmaa_safe",
  // Un-prefixed values: the params memo strips "fill_" for the engines'
  // getBracketCeiling lookups, so BOTH spellings must map here — otherwise a
  // stored fill_12/24/32/35 silently falls back to fill_22 in the Roth tab.
  "10": "fill_10", "12": "fill_12", "22": "fill_22", "24": "fill_24",
  "32": "fill_32", "35": "fill_35", "37": "fill_37",
  fill_10: "fill_10", fill_12: "fill_12", fill_22: "fill_22", fill_24: "fill_24",
  fill_32: "fill_32", fill_35: "fill_35", fill_37: "fill_37",
};
const ROTHMODE_TO_PROFILE = {
  no_convert: "off",
  irmaa_safe: "irmaa",
  fill_10: "fill_10", fill_12: "fill_12", fill_22: "fill_22", fill_24: "fill_24",
  fill_32: "fill_32", fill_35: "fill_35", fill_37: "fill_37",
};

function RothLadder({ params, onSaveConversionOverride, onRemoveConversionOverride, onAssumptionChange }) {

  const [showInputs, setShowInputs] = useState(false);
  const [view, setView] = useState("optimized");
  // Bracket-fill strategy is a single value, persisted to the profile as
  // params.rothConversionTarget — the Conversion Plan tab is where it's tuned,
  // but the Withdrawal Plan tab / Monte Carlo runs read the same stored value
  // (no separate, disconnected "rothMode" local setting).
  const rothMode = PROFILE_TO_ROTHMODE[params?.rothConversionTarget] ?? "fill_22";
  const setRothMode = (mode) => {
    if (onAssumptionChange) onAssumptionChange("rothConversionTarget", ROTHMODE_TO_PROFILE[mode] ?? "fill_22");
  };

  // ── Current-Year Calculator state ──────────────────────────────────────
  const currentCalYear = new Date().getFullYear() + 1; // plan for next year by default
  const [cyYear,   setCyYear]   = useState(currentCalYear);
  const [cyW2,     setCyW2]     = useState(0);
  const [cySS,     setCySS]     = useState(0);
  const [cyRental, setCyRental] = useState(0);
  const [cyOther,  setCyOther]  = useState(0);
  // Cash available for taxes defaults from the profile's Bucket 1 (Cash)
  // allocation — the same "pay bills now" reserve shown on the Withdrawal
  // Plan / Bucket Strategy tab, including any per-account splits the user
  // has assigned to Bucket 1. A one-off override lets the user refine it
  // for this analysis without creating a second, disconnected balance.
  const profileCashForTaxes = expandAccountBuckets(params?.accounts || [])
    .filter(a => a.bucket === 1)
    .reduce((s, a) => s + (a.balance || 0), 0);
  const [cySGOVOverride, setCySGOVOverride] = useState(null);
  const cySGOV = cySGOVOverride ?? profileCashForTaxes;
  // ───────────────────────────────────────────────────────────────────────

  // Depend on `params` ITSELF, never an enumerated subset of its fields.
  // These four memos each carried their own hand-maintained field list and each
  // list was missing something different: `ex` omitted sp / endAge / gkFloor /
  // gkCeiling / stateOfResidence / irmaaGuard while `convRows` (the table
  // rendered directly BELOW ex's summary cards) tracked them — so editing spend
  // in the sidebar refreshed the ladder table but left the Lifetime Tax Delta /
  // RMD Reduction / Eff. Rate cards above it showing the previous profile.
  // `params` is itself a useMemo in the parent, so it is referentially stable
  // between real edits; depending on it is both correct and cheap, and it can
  // never go stale as new profile fields are added.
  const ex = useMemo(
    () => buildWaterfallComparison(params ?? {}, rothMode),
    [params, rothMode]
  );

  // No-tax state scenario: same profile but state tax zeroed out (twoHousehold flag)
  const exNoTax = useMemo(
    () => buildWaterfallComparison({ ...(params ?? {}), twoHousehold: true }, rothMode),
    [params, rothMode]
  );

  const {
    opt,
    cur,
    taxD,
    estD,
    leOpt,
    leCur,
    rmdRed,
    isNoTaxState,
    retireYear,
    rmdAge,
    endAge,
    filingStatus,
  } = ex;

  // Conversion Plan ladder — built directly from buildWithdrawalWaterfall so the
  // "Conversion" column always equals the Withdrawal Schedule tab's "Roth Conv"
  // figure for the same year (see rothConversionPlan.js::buildConversionLadder).
  const convRows = useMemo(
    () => buildConversionLadder(params ?? {}, rothMode).rows,
    [params, rothMode]
  );

  // Reconciled conversion plan — single source of truth, matches the
  // Withdrawal Schedule tab's "Roth Conv" figures (see rothConversionPlan.js).
  const conversionPlan = useMemo(
    () => buildConversionPlan(params ?? {}),
    [params]
  );

const state = params.stateOfResidence || "NJ";   // fallback to your actual state
const domLabel = isNoTaxState
  ? "No Tax State Move or Out of Country"
  : `${state} Domicile (with tax)`;
  const domColor = isNoTaxState ? "#34d399" : "#fb923c";
  
  const modeLabels = {
      no_convert: "Off",
      fill_10: "Fill 10%",
      fill_12: "Fill 12%",
      fill_22: "Fill 22%",
      fill_24: "Fill 24%",
      fill_32: "Fill 32%",
      fill_35: "Fill 35%",
      fill_37: "Fill 37%",
      irmaa_safe: "IRMAA-Safe",
  };

const modeDescs = {
    no_convert: "No conversions — pretax stays pretax until RMDs force withdrawals.",
    fill_10: "Ultra‑conservative — stay in 10% bracket. Minimal tax, slowest conversion.",
    fill_12: "Conservative — stay in 12% bracket. Low tax, slower conversion.",
    fill_22: "Moderate — fill to top of 22%. IRMAA‑safe. AiRA default.",
    fill_24: "Aggressive — fill to 24%. ⚠️ IRMAA risk at 65 (2‑yr lookback).",
    fill_32: "Very aggressive — fill to 32%. 🚨 IRMAA and NIIT implications.",
    fill_35: "High income — fill to 35%. Only for large conversions.",
    fill_37: "Maximum — fill to 37%. Rarely optimal; consult CPA.",
    irmaa_safe: "Dynamic — fills 22% normally, auto‑throttles near IRMAA threshold.",
};

  const InputsPanel = () => (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: showInputs ? "12px" : "0",
        maxHeight: showInputs ? "600px" : "0",
        overflow: "hidden",
        transition: "all 0.3s ease",
        marginBottom: showInputs ? 10 : 0,
      }}
    >
      {showInputs && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px 20px",
            fontSize: 11,
          }}
        >
          {[
            ["Domicile", domLabel, domColor],
            ["Filing Status", filingStatus === "mfj" ? "MFJ" : "Single", "var(--text-secondary)"],
            ["Bracket Target", modeLabels[rothMode], "var(--accent-teal)"],
            [
              // Was two hardcoded literals ($32,200 / $16,100) — a rule-6
              // violation and a second copy of a TAX_REFERENCE constant that
              // would silently disagree with the engine the moment one changed.
              // Reads the engine's own helper at inflFactor 1 (today's dollars),
              // and states the age basis, which the old label never did.
              "Std Deduction (under 65)",
              fmtDollar(getStandardDeduction(64, filingStatus, 1)) +
                " (indexed " + params.inf + "%/yr; higher from 65)",
              "var(--text-secondary)",
            ],
            [
              // Was labelled "Other Income" while showing RENTAL, with a
              // hardcoded $20,000 fallback and a hardcoded "3% growth" that
              // ignored params.abGrowth. Three defects in five lines: wrong
              // name, invented value, asserted rate the plan may not use.
              "Annuity/Rental",
              (params.ab > 0
                ? fmtDollar(params.ab) + "/yr"
                : "Not set") +
                " (" + (params.abGrowth ?? 3) + "% growth)",
              "var(--text-secondary)",
            ],
            [
              "SS Start",
              "Age " +
                (params.ssAge ?? "—") +
                " / $" +
                (params.ssb || 0).toLocaleString() +
                "/yr",
              "var(--text-secondary)",
            ],
            [
              "Portfolio",
              (() => {
                const accts = params.accounts || [];
                const total = accts.reduce((s, a) => s + (a.balance || 0), 0);
                const pretax = accts
                  .filter((a) => a.category === "pretax")
                  .reduce((s, a) => s + (a.balance || 0), 0);
                const pct = total > 0 ? Math.round((pretax / total) * 100) : 0;
                return (
                  fmtDollar(params.port || 0) +
                  (total > 0 ? ` (${pct}% pre-tax)` : "")
                );
              })(),
              "var(--text-secondary)",
            ],
            ["Growth Assumption", "7% nominal (balance projection)", "var(--text-secondary)"],
            ["IRMAA Guard", "Ages 63-65 auto-throttled to 22%", "var(--accent-gold)"],
            ["FAFSA Guard", "Through 2029 · capped at 12%", "var(--accent-gold)"],
            [
              "Conversion Window",
              "Age " + (params.retireAge || 60) + "–" + (rmdAge - 1) + " (dynamic fill)",
              "var(--accent-teal)",
            ],
            [
              "RMD Start Age",
              rmdAge + " (SECURE Act 2.0)",
              "var(--text-secondary)",
            ],
            [
              "RMD Table",
              "Joint & Last Survivor (Spouse)",
              "var(--text-secondary)",
            ],
          ].map(([k, v, c]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>{k}</span>
              <span
                style={{
                  color: c,
                  fontFamily: "'JetBrains Mono',monospace",
                  fontWeight: 500,
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const barData = convRows.map((r) => ({
    yr: r.yr,
    age: r.age,
    conv: r.conv,
    label: r.label,
    "10%": r.conv10 || 0,
    "12%": r.conv12 || 0,
    "22%": r.conv22 || 0,
    "24%": r.conv24 || 0,
    "32%": r.conv32 || 0,
    "35%": r.conv35 || 0,
    "37%": r.conv37 || 0,
  }));
  const taxCompare = opt.rows
    .filter((_, i) => i % 2 === 0 || i < 10)
    .map((r, i) => {
      const c = cur.rows.find((cr) => cr.yr === r.yr);
      return {
        yr: r.yr,
        age: r.age,
        optRate: (r.effR * 100).toFixed(0),
        curRate: c ? (c.effR * 100).toFixed(0) : "0",
        optTax: r.totT,
        curTax: c ? c.totT : 0,
      };
    });
  const rmdYears = opt.rows
    .filter((r) => r.age >= rmdAge && r.age <= (params.endAge || 90))
    .map((r) => {
      const c = cur.rows.find((cr) => cr.yr === r.yr);
      return {
        age: r.age,
        optRmd: r.rmd,
        curRmd: c ? c.rmd : 0,
        optPT: r.pT,
        curPT: c ? c.pT : 0,
      };
    });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {["thisyear", "optimized", "taxes", "table", "scenarios"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: v === "thisyear"
                  ? (view === v ? "1px solid #f59e0b" : "1px solid rgba(245,158,11,0.3)")
                  : "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: 600,
                background: view === v
                  ? (v === "thisyear" ? "rgba(245,158,11,0.15)" : "rgba(13,148,136,0.2)")
                  : "transparent",
                color: view === v
                  ? (v === "thisyear" ? "var(--accent-gold)" : "var(--accent-teal)")
                  : "var(--text-muted)",
              }}
            >
              {v === "thisyear"   ? "💰 Tax Room"
               : v === "optimized"  ? "📊 Conversion Plan"
               : v === "taxes" ? "⚖️ Taxes"
               : v === "table"      ? "📋 Year-by-Year"
               :                      "🗺️ 3-Scenario"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowInputs(!showInputs)}
          style={{
            padding: "3px 8px",
            borderRadius: 5,
            border: "1px solid rgba(255,255,255,0.1)",
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "inherit",
            background: "transparent",
            color: "var(--text-muted)",
          }}
        >
          {showInputs ? "▲ Hide" : "▼ Show"} Assumptions
        </button>
      </div>
      <InputsPanel />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Bracket Fill Strategy
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>

          {Object.entries(modeLabels).map(([k, v]) => {
            const isHigh = ["fill_32","fill_35","fill_37"].includes(k);
            const isCaution = k === "fill_24";
            const isSafe = ["no_convert","fill_10","fill_12"].includes(k);
            const isDefault = k === "fill_22";

            let bgColor = "transparent";
            let textColor = "var(--text-muted)";
            let borderColor = "rgba(255,255,255,0.1)";

            if (rothMode === k) {
              if (isHigh) { bgColor = "rgba(239,68,68,0.15)"; textColor = "#f87171"; borderColor = "var(--negative)"; }
              else if (isCaution) { bgColor = "rgba(245,158,11,0.15)"; textColor = "var(--accent-gold)"; borderColor = "#f59e0b"; }
              else if (isSafe) { bgColor = "rgba(16,185,129,0.15)"; textColor = "#34d399"; borderColor = "var(--positive)"; }
              else { bgColor = "rgba(13,148,136,0.15)"; textColor = "var(--accent-teal)"; borderColor = "var(--positive)"; }
            }
            
            return (
              <button
                key={k}
                onClick={() => setRothMode(k)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 10,
                  fontFamily: "inherit",
                  fontWeight: 600,
                  border: `1px solid ${borderColor}`,
                  background: bgColor,
                  color: textColor,
                  transition: "all 0.15s",
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
          {modeDescs[rothMode]}
        </div>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: 4, background: domColor }}
        />
        <span style={{ color: domColor, fontWeight: 600 }}>
          Domicile: {domLabel}
        </span>
        <span style={{ color: "var(--text-faint)" }}>
          · {isNoTaxState
            ? "🌴 Solo mode (lower spend, no state tax)"
            : `🏠 Both in ${params.stateOfResidence || "your state"} (full spend, state tax applies)`}
        </span>
      </div>
      {(() => {
        const _cy = new Date().getFullYear();
        const _pinned   = convRows.filter(r => r.capReason?.startsWith("manual") && r.yr >= _cy).length;
        const _forecast = convRows.filter(r => !r.capReason?.startsWith("manual") && r.yr >= _cy).length;
        const _past     = convRows.filter(r => r.yr < _cy).length;
        return (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, display: "flex", gap: 16, alignItems: "center" }}>
            <span>📌 <strong style={{ color: "var(--accent-gold)" }}>{_pinned} pinned</strong> — anchored to real income data</span>
            <span>🔮 <strong style={{ color: "var(--accent-teal)" }}>{_forecast} forecasted</strong> — optimizer projection</span>
            {_past > 0 && <span>📅 <strong style={{ color: "var(--text-faint)" }}>{_past} past</strong> — historical</span>}
          </div>
        );
      })()}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5,1fr)",
          gap: 8,
        }}
      >
        <div className="met">
          <div className="ml">Conversions</div>
          <div className="mv" style={{ color: "var(--accent-teal)", fontSize: 20 }}>
            {convRows.length}
          </div>
          <div className="ms">during plan window</div>
        </div>
        <div className="met" style={{ border: convRows.filter(r => r.capReason?.startsWith("manual")).length > 0 ? "1px solid rgba(245,158,11,0.3)" : undefined }}>
          <div className="ml">📌 Pinned / 🔮 Forecast</div>
          <div className="mv" style={{ fontSize: 14 }}>
            <span style={{ color: "var(--accent-gold)" }}>{convRows.filter(r => r.capReason?.startsWith("manual") && r.yr >= new Date().getFullYear()).length}</span>
            <span style={{ color: "var(--text-faint)" }}> / </span>
            <span style={{ color: "var(--accent-teal)" }}>{convRows.filter(r => !r.capReason?.startsWith("manual") && r.yr >= new Date().getFullYear()).length}</span>
          </div>
          <div className="ms">real anchor vs optimizer</div>
        </div>
        <div className="met">
          <div className="ml">Lifetime Tax Delta</div>
          <div
            className="mv"
            style={{ color: taxD > 0 ? "#fb923c" : "#34d399", fontSize: 16 }}
          >
            {taxD > 0 ? "+" : ""}
            {fmtDollar(Math.abs(taxD))}
          </div>
          <div className="ms">
            {taxD > 0 ? "more" : "less"} with conversions
          </div>
        </div>
        <div className="met">
          <div className="ml">RMD Reduction</div>
          <div className="mv" style={{ color: "#34d399", fontSize: 20 }}>
            {rmdRed}%
          </div>
          <div className="ms">lower forced distributions</div>
        </div>
        <div className="met">
          <div className="ml">Lifetime Eff. Rate</div>
          <div className="mv" style={{ color: "var(--accent-teal)", fontSize: 16 }}>
            {(leOpt * 100).toFixed(1)}% vs {(leCur * 100).toFixed(1)}%
          </div>
          <div className="ms">optimized vs current</div>
        </div>
      </div>
      {conversionPlan.totalTraditional > 0 && (
        <div
          style={{
            background: "rgba(94,234,212,0.06)",
            border: "1px solid rgba(94,234,212,0.25)",
            borderRadius: 8,
            padding: "10px 12px",
            marginTop: 8,
            fontSize: 11,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-teal)" }}>
              ✅ Recommended Conversion — Year 1: {fmtDollar(conversionPlan.recommendedSchedule[0]?.amount || 0)}
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              Matches the "Roth Conv" figure for {conversionPlan.recommendedSchedule[0]?.year ?? "year 1"} on the Withdrawal Schedule tab
            </div>
          </div>
          {conversionPlan.needs_schedule ? (
            <>
              <div style={{ color: "var(--accent-gold)", marginTop: 6 }}>
                ⚠️ A multi-year conversion schedule is recommended because:
              </div>
              <ul style={{ margin: "4px 0 6px 18px", padding: 0, color: "var(--text-secondary)" }}>
                {conversionPlan.reasons.headroomTooSmall && (
                  <li>This year's conversion headroom ({fmtDollar(conversionPlan.headroomYear0)}) is less than 20% of your total Traditional balance ({fmtDollar(conversionPlan.totalTraditional)}) — converting it all at once would push you into much higher brackets.</li>
                )}
                {conversionPlan.reasons.cannotPayTaxFromCash && (
                  <li>The tax owed on this year's conversion can't be covered by cash/taxable savings alone.</li>
                )}
                {conversionPlan.reasons.rmdBracketIncrease && (
                  <li>Without conversions, projected RMDs at age {conversionPlan.rmdAge} would push you into a higher bracket than today.</li>
                )}
              </ul>
              <div style={{ color: "var(--text-muted)" }}>
                Recommended schedule (through age {conversionPlan.rmdAge}, {conversionPlan.recommendedSchedule.length} year{conversionPlan.recommendedSchedule.length === 1 ? "" : "s"}):{" "}
                {conversionPlan.recommendedSchedule.slice(0, 6).map((s, i) => (
                  <span key={s.year} style={{ color: "var(--accent-teal)" }}>
                    {i > 0 && ", "}
                    {s.year} (age {s.age}): {fmtDollar(s.amount)}
                  </span>
                ))}
                {conversionPlan.recommendedSchedule.length > 6 && <span style={{ color: "var(--text-faint)" }}> …</span>}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
              This year's headroom covers a large share of your Traditional balance — no multi-year schedule needed.
            </div>
          )}
        </div>
      )}
      {view === "thisyear" && (() => {
        const isMFJ   = (params?.filingStatus || "mfj") !== "single";
        const infRate = (params?.inf || 2.5) / 100;
        const f       = Math.pow(1 + infRate, cyYear - CURRENT_YEAR);
        const fedBase = isMFJ ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE;
        const fB      = idxB(fedBase, f);
        const b12t    = fB.find(b => b.rate === 0.12)?.hi ?? 0;
        const b22t    = fB.find(b => b.rate === 0.22)?.hi ?? 0;
        const b24t    = fB.find(b => b.rate === 0.24)?.hi ?? 0;
        const b32t    = fB.find(b => b.rate === 0.32)?.hi ?? 0;
        const b35t    = fB.find(b => b.rate === 0.35)?.hi ?? 0;
        const b37t    = fB.find(b => b.rate === 0.37)?.hi ?? 0;

        // SS provisional income → 0% / 50% / 85% taxable per IRC §86 tiers
        const ssTaxable = Math.round(taxableSocialSecurity(cySS, cyW2 + cyRental + cyOther, isMFJ));
        const grossInc  = cyW2 + ssTaxable + cyRental + cyOther;
        // Deduction for THIS panel's year. This used to be a bare
        // `(isMFJ ? 32200 : 16100) * f` with no age-65 add-on at all — a
        // third-generation copy of the standard deduction that understated the
        // deduction (and so overstated tax and understated conversion headroom)
        // for every 65+ user. Now routed through the same canonical helpers as
        // calcYearTax so all three can't drift: age-aware standard deduction plus
        // the OBBBA senior bonus, whose phase-out reads this year's own MAGI.
        const cyAge     = (params?.currentAge || 0) + (cyYear - CURRENT_YEAR);
        const stdD      = getStandardDeduction(cyAge, params?.filingStatus || "mfj", f);
        const cySeniorBonus = getSeniorBonusDeduction(
          cyAge, params?.filingStatus || "mfj", grossInc, cyYear
        );
        const dedD      = stdD + cySeniorBonus;
        const taxableBC = Math.max(0, grossInc - dedD);           // taxable before conversion
        const fedTaxBC  = Math.round(progTax(taxableBC, fB));

        // State tax on non-conversion income
        const stateBr   = getStateBrackets(params?.stateOfResidence || "NJ", isMFJ);
        const stTaxBC   = stateBr ? Math.round(progTax(taxableBC, stateBr)) : 0;

        // Bracket headroom
        const room12 = Math.max(0, b12t - taxableBC);
        const room22 = Math.max(0, b22t - taxableBC);
        const room24 = Math.max(0, b24t - taxableBC);
        const room32 = Math.max(0, b32t - taxableBC);
        const room35 = Math.max(0, b35t - taxableBC);
        const room37 = Math.max(0, b37t - taxableBC);

        // Tax cost for converting the full room at each bracket
        function convTax(convAmt) {
          const fedInc = Math.round(progTax(taxableBC + convAmt, fB)) - fedTaxBC;
          const stInc  = stateBr
            ? Math.round(progTax(taxableBC + convAmt, stateBr)) - stTaxBC
            : 0;
          return { fedInc, stInc, total: fedInc + stInc };
        }
        const tax12 = convTax(room12);
        const tax22 = convTax(room22);
        const tax24 = convTax(room24);
        const tax32 = convTax(room32);
        const tax35 = convTax(room35);
        const tax37 = convTax(room37);

        // Map rothMode to the bracket row that should be highlighted and recommended
        const modeHighlight = {
          fill_10: "12%", fill_12: "12%",
          fill_22: "22%", irmaa_safe: "22%",
          fill_24: "24%", fill_32: "32%", fill_35: "35%", fill_37: "37%",
        };
        const targetLabel = modeHighlight[rothMode] ?? "22%";
        const recRoom =
          targetLabel === "12%" ? room12 :
          targetLabel === "24%" ? room24 :
          targetLabel === "32%" ? room32 :
          targetLabel === "35%" ? room35 :
          targetLabel === "37%" ? room37 :
          room22;
        const recRoomTax =
          targetLabel === "12%" ? tax12 :
          targetLabel === "24%" ? tax24 :
          targetLabel === "32%" ? tax32 :
          targetLabel === "35%" ? tax35 :
          targetLabel === "37%" ? tax37 :
          tax22;

        // Recommended: fill to selected bracket, capped by available SGOV cash
        let recConv, recTax, recNote;
        if (recRoom === 0) {
          recConv = 0; recTax = convTax(0); recNote = `Already above ${targetLabel} bracket — no room`;
        } else if (cySGOV <= 0) {
          recConv = recRoom; recTax = recRoomTax; recNote = "Enter Cash/Treasury/Short Term cash balance to check cash constraint";
        } else if (recRoomTax.total <= cySGOV) {
          recConv = recRoom; recTax = recRoomTax; recNote = `Cash/Treasury/Short Term cash covers full ${targetLabel} fill ✅`;
        } else {
          // Scale down proportionally — linear approx within bracket
          const ratio = cySGOV / recRoomTax.total;
          recConv = Math.round(recRoom * ratio);
          recTax  = convTax(recConv);
          recNote = "Cash/Treasury/Short Term cash limits conversion — increase cash to fill full bracket";
        }

        const inputStyle = {
          width: "100%", background: "#0d1b2a", border: "1px solid #1e3a5f",
          color: "#e2e8f0", borderRadius: 6, padding: "5px 8px", fontSize: 12,
          fontFamily: "'JetBrains Mono',monospace", textAlign: "right",
        };
        const rowSep = { borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "5px 0" };
        const fmtN = (n) => n === 0 ? "$0" : `$${Math.round(n).toLocaleString()}`;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* ── Inputs ── */}
            <div className="chart-card">
              <div className="ct">🎯 Current Year Conversion Calculator</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 10 }}>
                    Enter your expected income for {cyYear}, then see how much bracket room remains 
                    for a Roth conversion. Give the recommended number to your CPA by December.
                  </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 12 }}>
                <div>
                  <div style={{ color: "var(--text-secondary)", marginBottom: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Tax Year & Income</div>
                  {[
                    ["Tax Year",          cyYear,   setCyYear,   false, 2026, 2060],
                    ["W-2 / SE Income",   cyW2,     setCyW2,     true],
                    ["Social Security",   cySS,     setCySS,     true],
                    ["Rental / Airbnb",   cyRental, setCyRental, true],
                    ["Other Income",      cyOther,  setCyOther,  true],
                  ].map(([lbl, val, setter, isDollar, mn, mx]) => (
                    <div key={lbl} style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8, alignItems: "center", ...rowSep }}>
                      <span style={{ color: "var(--text-secondary)" }}>{lbl}</span>
                      <input
                        type="number" value={val}
                        onChange={e => setter(Number(e.target.value) || 0)}
                        onFocus={e => e.target.select()}
                        min={mn ?? 0} max={mx ?? 9999999} step={isDollar ? 1000 : 1}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ color: "var(--text-secondary)", marginBottom: 6, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Cash Available for Taxes</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8, alignItems: "center", ...rowSep }}>
                    <span style={{ color: "var(--accent-gold)" }}>Cash/Treasury/Short Term cash for Taxes</span>
                    <input
                      type="number" value={cySGOV}
                      onChange={e => setCySGOVOverride(Number(e.target.value) || 0)}
                      min={0} step={1000} style={{ ...inputStyle, borderColor: "#f59e0b" }}
                onFocus={selectAllOnFocus}
              />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                    {cySGOVOverride != null
                      ? <>Overridden for this analysis · Bucket 1 (Cash) balance is {fmtN(profileCashForTaxes)}{" "}
                          <button
                            onClick={() => setCySGOVOverride(null)}
                            style={{ background: "none", border: "none", color: "var(--accent-teal)", cursor: "pointer", fontSize: 10, textDecoration: "underline", padding: 0, fontFamily: "inherit" }}
                          >↺ reset to profile</button>
                        </>
                      : <>From Bucket 1 — Cash ({fmtN(profileCashForTaxes)}) — edit to refine for this analysis only.</>}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                    Filing: {isMFJ ? "Married Filing Jointly" : "Single"} ·{" "}
                    State: {params?.stateOfResidence || "NJ"}{stateBr ? "" : " (no state tax)"}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Income Breakdown ── */}
            <div className="chart-card">
              <div className="ct">Income Breakdown — Tax Year {cyYear}</div>
              <table className="roth-tbl">
                <tbody>
                  {[
                    ["W-2 / SE income",       fmtN(cyW2),       "#e2e8f0"],
                    ["Social Security (taxable " + (cySS > 0 ? Math.round((ssTaxable / cySS) * 100) : 0) + "%)", fmtN(ssTaxable), "#e2e8f0"],
                    ["Rental / Airbnb net",   fmtN(cyRental),   "#e2e8f0"],
                    ["Other income",          fmtN(cyOther),    "#e2e8f0"],
                    ["Gross income",          fmtN(grossInc),   "var(--accent-teal)"],
                    ["Standard deduction",    `(${fmtN(stdD)})`, "#f87171"],
                    ["Taxable income before conversion", fmtN(taxableBC), "var(--accent-gold)"],
                  ].map(([lbl, val, col]) => (
                    <tr key={lbl}>
                      <td style={{ color: "var(--text-secondary)" }}>{lbl}</td>
                      <td style={{ color: col, textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Bracket Headroom ── */}
            <div className="chart-card">
              <div className="ct">Bracket Headroom — {cyYear} (inflation-indexed)</div>
              <table className="roth-tbl">
                <thead>
                  <tr>
                    <th>Bracket</th>
                    <th>Top of Bracket</th>
                    <th>Headroom</th>
                    <th>Fed Tax Cost</th>
                    <th>State Tax Cost</th>
                    <th>Total Tax Cost</th>
                    <th>Eff Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["12%", b12t, room12, tax12],
                    ["22%", b22t, room22, tax22],
                    ["24%", b24t, room24, tax24],
                    ...( ["32%","35%","37%"].includes(targetLabel) ? [["32%", b32t, room32, tax32]] : []),
                    ...( ["35%","37%"].includes(targetLabel) ? [["35%", b35t, room35, tax35]] : []),
                    ...( ["37%"].includes(targetLabel) ? [["37%", b37t, room37, tax37]] : []),
                  ].map(([bracket, top, room, tax]) => (
                    <tr key={bracket} style={{ background: bracket === targetLabel ? "rgba(13,148,136,0.08)" : undefined }}>
                      <td style={{ color: bracket === targetLabel ? "var(--accent-teal)" : "var(--text-secondary)", fontWeight: bracket === targetLabel ? 700 : 400 }}>{bracket}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace" }}>{fmtN(top)}</td>
                      <td style={{ color: room > 0 ? "#e2e8f0" : "var(--text-faint)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtN(room)}</td>
                      <td style={{ color: "#f87171", fontFamily: "'JetBrains Mono',monospace" }}>{fmtN(tax.fedInc)}</td>
                      <td style={{ color: stateBr ? "#fb923c" : "#34d399", fontFamily: "'JetBrains Mono',monospace" }}>{fmtN(tax.stInc)}</td>
                      <td style={{ color: "#f87171", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{fmtN(tax.total)}</td>
                      <td style={{ color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace" }}>
                        {room > 0 ? ((tax.total / room) * 100).toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Recommendation ── */}
            <div className="chart-card" style={{ border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.05)" }}>
              <div className="ct" style={{ color: "var(--accent-gold)" }}>✅ Recommended Conversion — {cyYear}</div>
              {(() => {
                const cyTaxFunding = params?.taxFunding || "from_taxable";
                const cyNetRoth = cyTaxFunding === "from_conv"
                  ? Math.max(0, recConv - recTax.total)
                  : recConv;
                const cyFundLabel = cyTaxFunding === "from_conv"
                  ? "From conversion (taxes deducted)"
                  : cyTaxFunding === "outside_cash"
                  ? "Outside cash"
                  : "From taxable / HSA bucket";
                const cyCpaTax = cyTaxFunding === "from_conv"
                  ? `Tax cost is ${fmtN(recTax.total)} — deducted from conversion; ${fmtN(cyNetRoth)} net reaches Roth.`
                  : `Tax cost is ${fmtN(recTax.total)} — pay from ${cyTaxFunding === "outside_cash" ? "outside cash (e.g. SGOV/HYSA)" : "your taxable / HSA bucket"}.`;
                return (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div className="met" style={{ border: "1px solid rgba(245,158,11,0.3)" }}>
                        <div className="ml">Convert This Amount</div>
                        <div className="mv" style={{ color: "var(--accent-gold)", fontSize: 22 }}>{fmtN(recConv)}</div>
                        <div className="ms">pretax → Roth</div>
                      </div>
                      <div className="met" style={{ border: "1px solid rgba(248,113,113,0.3)" }}>
                        <div className="ml">Total Tax Cost</div>
                        <div className="mv" style={{ color: "#f87171", fontSize: 22 }}>{fmtN(recTax.total)}</div>
                        <div className="ms">fed {fmtN(recTax.fedInc)} + state {fmtN(recTax.stInc)}</div>
                      </div>
                      <div className="met" style={{ border: "1px solid rgba(20,184,166,0.3)" }}>
                        <div className="ml">Net → Roth</div>
                        <div className="mv" style={{ color: "var(--accent-teal)", fontSize: 22 }}>{fmtN(cyNetRoth)}</div>
                        <div className="ms">{cyFundLabel}</div>
                      </div>
                    </div>
                    <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--accent-gold)", fontWeight: 600 }}>
                      📋 Give this to your CPA: Convert {fmtN(recConv)} from pretax to Roth in {cyYear}. {cyCpaTax}
                    </div>
                  </>
                );
              })()}
              {recNote && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>{recNote}</div>
              )}
              {(() => {
                const cyPin = (params?.conversionOverrides || []).find(o => Number(o.year) === cyYear);
                return (
                  <>
                    {cyPin && (
                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 8, padding: "8px 12px" }}>
                        <span style={{ fontSize: 12, color: "var(--accent-purple)", fontWeight: 600, flex: 1 }}>
                          📌 Pinned for {cyYear}: {fmtN(cyPin.amount)}
                        </span>
                        {onRemoveConversionOverride && (
                          <button
                            onClick={() => onRemoveConversionOverride(cyYear)}
                            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 5, cursor: "pointer", fontSize: 12, padding: "3px 10px", fontFamily: "inherit" }}
                          >× Remove pin</button>
                        )}
                      </div>
                    )}
                    {recConv > 0 && onSaveConversionOverride && (
                      <button
                        onClick={() => {
                          onSaveConversionOverride(cyYear, recConv, { w2: cyW2, ss: cySS, rental: cyRental, other: cyOther, sgov: cySGOV });
                          alert(`✅ Saved: Convert ${fmtN(recConv)} in ${cyYear} to your Lifetime Projection ladder.`);
                        }}
                        style={{
                          marginTop: 8, width: "100%", padding: "10px 0",
                          background: "rgba(245,158,11,0.2)", border: "1px solid #f59e0b",
                          color: "var(--accent-gold)", borderRadius: 8, cursor: "pointer",
                          fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                        }}
                      >
                        {cyPin ? "↺ Update Lifetime Ladder pin" : "→ Save to Lifetime Ladder"}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {/* ── How this works ── */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                ℹ️ How Tax Room and the Lifetime Ladder work together
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--text-secondary)" }}>Tax Room (this tab)</strong> is grounded in reality — you enter your actual known income
                for the year and get the exact conversion amount to hand your CPA. It reflects what you
                can actually do right now, not a forecast.
                <br /><br />
                <strong style={{ color: "var(--text-secondary)" }}>Lifetime Ladder (📊 Conversion Plan tab)</strong> projects conversions over every future year.
                For years where you have not saved a real number, it uses the bracket-fill optimizer —
                which does not know about your working income, Cash or Taxable/Brokerage balance, or IRMAA timing.
                <br /><br />
                <strong style={{ color: "var(--accent-gold)" }}>Press "Save to Lifetime Ladder" above</strong> to anchor the current year to your real number.
                The Ladder will then use the optimizer only for future years it does not have a pin for.
                Do this every December to keep the projection grounded year by year — the same way
                Monte Carlo checkpoints anchor the portfolio balance to reality.
              </div>
            </div>
          </div>
        );
      })()}

      {view === "optimized" && (
        <>
          <div className="chart-card">
            <div className="ct">
              Conversion Plan · Ages {convRows[0]?.age}–
              {convRows[convRows.length - 1]?.age} · {domLabel}
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={barData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="var(--row-highlight)"
                />
                <XAxis
                  dataKey="yr"
                  stroke="#1e3a5f"
                  tick={{ fill: "var(--text-faint)", fontSize: 9 }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "var(--text-faint)", fontSize: 9 }}
                  tickFormatter={(v) => fmtDollar(v)}
                  width={MONEY_AXIS_WIDTH}
                />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="10%" stackId="br" fill="#1d4ed8" name="10%" />
                <Bar dataKey="12%" stackId="br" fill="#0ea5e9" name="12%" />
                <Bar dataKey="22%" stackId="br" fill="var(--accent-teal)" name="22%" />
                <Bar dataKey="24%" stackId="br" fill="var(--accent-gold)" name="24%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="32%" stackId="br" fill="#f97316" name="32%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="35%" stackId="br" fill="var(--negative)" name="35%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="37%" stackId="br" fill="#991b1b" name="37%" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: "var(--text-faint)", margin: "8px 0 4px", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>📌 <span style={{ color: "var(--accent-gold)" }}>Amber</span> = pinned from Tax Room or manual entry</span>
              <span>🔮 <span style={{ color: "var(--accent-teal)" }}>Default</span> = optimizer projection</span>
              <span>📅 <span style={{ color: "#334155" }}>Gray</span> = historical (already past)</span>
              <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
                💰 Net→Roth basis:{" "}
                {params?.taxFunding === "from_conv"
                  ? <span style={{ color: "#f87171" }}>From conversion (Conv − total tax)</span>
                  : params?.taxFunding === "outside_cash"
                  ? <span style={{ color: "#34d399" }}>Outside cash (full conversion)</span>
                  : <span style={{ color: "var(--accent-teal)" }}>From taxable bucket (full conversion)</span>}
              </span>
            </div>
            <table className="roth-tbl" style={{ marginTop: 4 }}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Age</th>
                  <th>Label</th>
                  <th>Source</th>
                  <ThInfo tip={"Pre-tax IRA/401k balance at the start of this year, before the conversion"}>Pre-Tax (before)</ThInfo>
                  <th>Conversion</th>
                  <th>Fed Tax</th>
                  <th>State Tax</th>
                  <th>Bracket</th>
                  <ThInfo tip={"True marginal rate: Δ(fed+state+IRMAA) / conversion. Compare to BETR to decide convert vs defer."}>True Marg</ThInfo>
                  <th>Eff Rate</th>
                  <th>Net→Roth</th>
                  <ThInfo tip={"Cumulative Roth balance at end of this year (includes growth and withdrawals)"}>Roth Bal</ThInfo>
                </tr>
              </thead>
              <tbody>
                {convRows.map((r) => {
                  const isPast   = r.yr < new Date().getFullYear();
                  const isPinned = !isPast && r.capReason?.startsWith("manual");
                  const rowBg = isPast
                    ? "rgba(255,255,255,0.01)"
                    : isPinned
                    ? "rgba(245,158,11,0.07)"
                    : undefined;
                  const sourceLabel = isPast
                    ? <span style={{ color: "#334155", fontSize: 9 }}>📅 Past</span>
                    : isPinned
                    ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontSize: 9 }}>📌 Pinned</span>
                        <button
                          onClick={() => {
                            setCyYear(r.yr);
                            const pin = (params?.conversionOverrides || []).find(o => Number(o.year) === r.yr);
                            if (pin) {
                              if (pin.w2     !== undefined) setCyW2(pin.w2);
                              if (pin.ss     !== undefined) setCySS(pin.ss);
                              if (pin.rental !== undefined) setCyRental(pin.rental);
                              if (pin.other  !== undefined) setCyOther(pin.other);
                              if (pin.sgov   !== undefined) setCySGOV(pin.sgov);
                            }
                            setView("thisyear");
                          }}
                          title={`Edit pin for ${r.yr} in calculator`}
                          style={{ background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", color: "var(--accent-purple)", borderRadius: 4, cursor: "pointer", fontSize: 9, padding: "1px 5px", fontFamily: "inherit", lineHeight: 1.4 }}
                        >✏</button>
                        {onRemoveConversionOverride && (
                          <button
                            onClick={() => onRemoveConversionOverride(r.yr)}
                            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 4, cursor: "pointer", fontSize: 9, padding: "1px 5px", fontFamily: "inherit", lineHeight: 1.4 }}
                          >×</button>
                        )}
                      </span>
                    : <span style={{ color: "var(--text-faint)", fontSize: 9 }}>🔮 Forecast</span>;
                  return (
                  <tr
                    key={r.yr}
                    className={r.label === "Golden Year ★" ? "gold" : ""}
                    style={{ background: rowBg }}
                  >
                    <td style={{ color: isPast ? "#334155" : undefined }}>{r.yr}</td>
                    <td style={{ color: isPast ? "#334155" : "var(--text-secondary)" }}>{r.age}</td>
                    <td
                      style={{
                        color: isPast ? "#334155" : r.label.includes("Golden") ? "var(--accent-gold)" : "var(--text-secondary)",
                        fontWeight: r.label.includes("Golden") ? 700 : 400,
                      }}
                    >
                      {r.label}
                    </td>
                    <td>{sourceLabel}</td>
                    <td style={{ color: isPast ? "#334155" : "var(--text-muted)" }}>{fmtDollar(r.pTStart || 0)}</td>
                    <td style={{ color: isPast ? "#334155" : isPinned ? "var(--accent-gold)" : "#e2e8f0", fontWeight: isPinned ? 700 : 400 }}>{fmtDollar(r.conv)}</td>
                    <td style={{ color: isPast ? "#334155" : "#f87171" }}>{fmtDollar(r.fedT)}</td>
                    <td style={{ color: isPast ? "#334155" : isNoTaxState ? "#34d399" : "#fb923c" }}>
                      {isNoTaxState ? "$0" : fmtDollar(r.stT)}
                    </td>
                    <td
                      style={{
                        color: isPast ? "#334155"
                          : r.bracketUsed === "24%" ? "var(--accent-gold)"
                          : r.bracketUsed === "22%" ? "var(--accent-teal)"
                          : "var(--text-secondary)",
                        fontSize: 10,
                      }}
                    >
                      {r.bracketUsed}
                    </td>
                    <td
                      style={{
                        color: r.margR >= 0.32
                          ? "var(--negative)"
                          : r.margR >= 0.24
                          ? "var(--accent-gold)"
                          : r.margR >= 0.22
                          ? "var(--accent-teal)"
                          : "#34d399",
                        fontWeight: 600,
                      }}
                      title="Δ(fed+state+IRMAA) / conversion"
                    >
                      {((r.margR || 0) * 100).toFixed(1)}%
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {(r.effR * 100).toFixed(1)}%
                    </td>
                    <td style={{ color: isPast ? "#334155" : "var(--accent-teal)", fontWeight: 600 }}>
                      {fmtDollar(
                        params?.taxFunding === "from_conv"
                          ? Math.max(0, r.conv - r.fedT - (isNoTaxState ? 0 : r.stT))
                          : r.conv
                      )}
                    </td>
                    <td style={{ color: isPast ? "#334155" : "var(--accent-teal)" }} title={`Start of year: ${fmtDollar(r.roStart || 0)} → end of year: ${fmtDollar(r.ro || 0)}`}>
                      {fmtDollar(r.ro || 0)}
                    </td>
                  </tr>
                  );
                })}
                <tr style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                  <td style={{ fontWeight: 700 }} colSpan={4}>
                    Total
                  </td>
                  <td>—</td>
                  <td style={{ fontWeight: 700 }}>{fmtDollar(convRows.reduce((s, r) => s + r.conv, 0))}</td>
                  <td style={{ color: "#f87171", fontWeight: 700 }}>
                    {fmtDollar(convRows.reduce((s, r) => s + r.fedT, 0))}
                  </td>
                  <td
                    style={{
                      color: isNoTaxState ? "#34d399" : "#fb923c",
                      fontWeight: 700,
                    }}
                  >
                    {isNoTaxState
                      ? "$0"
                      : fmtDollar(convRows.reduce((s, r) => s + r.stT, 0))}
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td style={{ color: "var(--accent-teal)", fontWeight: 700 }}>
                    {fmtDollar(
                      convRows.reduce(
                        (s, r) => s + (params?.taxFunding === "from_conv"
                          ? Math.max(0, r.conv - r.fedT - (isNoTaxState ? 0 : r.stT))
                          : r.conv),
                        0
                      )
                    )}
                  </td>
                  <td style={{ color: "var(--accent-teal)", fontWeight: 700 }}
                    title="Final Roth balance at end of conversion window">
                    {fmtDollar(convRows[convRows.length - 1]?.ro || 0)}
                  </td>
                </tr>
              </tbody>
            </table>
            {(() => {
              const orphaned = (params?.conversionOverrides || []).filter(
                o => !convRows.some(r => r.yr === Number(o.year))
              );
              if (!orphaned.length) return null;
              return (
                <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    ⚠️ Stale Pins — producing $0 conversion
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.6 }}>
                    The pins below exist in your plan but result in <strong style={{ color: "#e2e8f0" }}>$0 converted</strong> — the pre-tax balance was likely exhausted before that year, or your income already exceeds the bracket ceiling. They have no effect and can be safely removed.
                  </div>
                  {orphaned.map(o => (
                    <div key={o.year} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace", flex: 1 }}>
                        📌 {o.year} — pinned at {fmtDollar(Number(o.amount))} → effective: $0
                      </span>
                      {onRemoveConversionOverride && (
                        <button
                          onClick={() => onRemoveConversionOverride(o.year)}
                          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 5, cursor: "pointer", fontSize: 11, padding: "2px 10px", fontFamily: "inherit" }}
                        >× Remove</button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="chart-card">
            <div className="ct">
              Projected Account Balances · Pre-Tax vs Roth
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={opt.rows.filter((_, i) => i % 2 === 0)}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="var(--row-highlight)"
                />
                <XAxis
                  dataKey="age"
                  stroke="#1e3a5f"
                  tick={{ fill: "var(--text-faint)", fontSize: 9 }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "var(--text-faint)", fontSize: 9 }}
                  tickFormatter={(v) => fmtDollar(v)}
                  width={MONEY_AXIS_WIDTH}
                />
                <Tooltip content={<Tip />} />
                <Bar dataKey="pT" name="Pre-Tax" stackId="a" fill="#1e3a5f" />
                <Bar
                  dataKey="ro"
                  name="Roth"
                  stackId="a"
                  fill="var(--positive)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
          {/* §28 D1 — traced, and the VALUE is correct: `nw` here is
              `r.totalPort` (rothConversionPlan.js ~225), i.e. all four buckets.
              But the chart directly above stacks only Pre-Tax and Roth, so these
              cards are legitimately LARGER than the bars a reader just looked at,
              with nothing saying why. Disclosing the composition rather than
              changing the number — an aggregate must name what it contains. */}
          <div className="met">
              <div className="ml">Savings at Age {params.endAge || 90} — Without</div>
              <div className="mv" style={{ color: "var(--text-secondary)", fontSize: 16 }}>
                {fmtDollar(cur.rows[cur.rows.length - 1]?.nw || 0)}
              </div>
              <div className="ms">All buckets: cash + taxable + pre-tax + Roth</div>
            </div>
            <div className="met">
              <div className="ml">Savings at Age {params.endAge || 90} — With Conversions</div>
              <div className="mv" style={{ color: "var(--accent-teal)", fontSize: 16 }}>
                {fmtDollar(opt.rows[opt.rows.length - 1]?.nw || 0)}
              </div>
              <div className="ms">All buckets — more than the two bars above</div>
            </div>
          </div>
          {rmdYears.length > 0 && (
            <div className="chart-card">
              <div className="ct">
                Required Minimum Distributions · Joint & Last Survivor Table
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div className="met">
                  <div className="ml">Lifetime RMDs — Without</div>
                  <div
                    className="mv"
                    style={{ color: "#f87171", fontSize: 16 }}
                  >
                    {fmtDollar(cur.cRmd)}
                  </div>
                  <div className="ms">{formulaFor("cmp-rmd-without")}</div>
                </div>
                <div className="met">
                  <div className="ml">Lifetime RMDs — With Conversions</div>
                  <div
                    className="mv"
                    style={{ color: "#34d399", fontSize: 16 }}
                  >
                    {fmtDollar(opt.cRmd)}
                  </div>
                  <div className="ms">{formulaFor("cmp-rmd-with")}</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart
                  data={rmdYears.filter((_, i) => i % 2 === 0)}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke="var(--row-highlight)"
                  />
                  <XAxis
                    dataKey="age"
                    stroke="#1e3a5f"
                    tick={{ fill: "var(--text-faint)", fontSize: 9 }}
                  />
                  <YAxis
                    stroke="#1e3a5f"
                    tick={{ fill: "var(--text-faint)", fontSize: 9 }}
                    tickFormatter={(v) => fmtDollar(v)}
                    width={MONEY_AXIS_WIDTH}
                  />
                  <Tooltip content={<Tip />} />
                  <Bar
                    dataKey="curRmd"
                    name="RMD — No Convert"
                    fill="rgba(239,68,68,0.4)"
                  />
                  <Bar
                    dataKey="optRmd"
                    name="RMD — With Convert"
                    fill="rgba(16,185,129,0.5)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {(() => {
            const g = convRows.find((r) => r.label === "Golden Year ★");
            return g ? (
              <div
                style={{
                  fontSize: 11,
                  color: "#7c3aed",
                  background: "rgba(124,58,237,0.08)",
                  borderRadius: 7,
                  padding: "7px 11px",
                  border: "1px solid rgba(124,58,237,0.2)",
                }}
              >
                ★ Golden year {g.yr} (age {g.age}): last year before Social
                Security begins. Maximum bracket room up to the 24% ceiling.
                Once SS starts, available space compresses — prioritize larger
                conversions here.
              </div>
            ) : null;
          })()}
        </>
      )}
      {view === "taxes" && (() => {
        const optFedTotal  = opt.rows.reduce((s, r) => s + (r.fedT  || 0), 0);
        const optStTotal   = opt.rows.reduce((s, r) => s + (r.stT   || 0), 0);
        const curFedTotal  = cur.rows.reduce((s, r) => s + (r.fedT  || 0), 0);
        const curStTotal   = cur.rows.reduce((s, r) => s + (r.stT   || 0), 0);
        const optAbTotal   = opt.rows.reduce((s, r) => s + (r.abn         || 0), 0);
        const curAbTotal   = cur.rows.reduce((s, r) => s + (r.abn         || 0), 0);
        const optSSTotal   = Math.round(opt.rows.reduce((s, r) => s + (r.ss || 0), 0) * 0.85);
        const curSSTotal   = Math.round(cur.rows.reduce((s, r) => s + (r.ss || 0), 0) * 0.85);
        const optPxsTotal  = opt.rows.reduce((s, r) => s + (r.pretaxSpend  || 0), 0);
        const curPxsTotal  = cur.rows.reduce((s, r) => s + (r.pretaxSpend  || 0), 0);
        const optTotInc    = opt.rows.reduce((s, r) => s + (r.totInc       || 0), 0);
        const curTotInc    = cur.rows.reduce((s, r) => s + (r.totInc       || 0), 0);

        const taxChartData = opt.rows
          .filter(r => r.age >= (params.retireAge || 60) && r.age <= (params.endAge || 90))
          .filter((_, i) => i % 2 === 0 || i < 6)
          .map(r => {
            const c = cur.rows.find(cr => cr.yr === r.yr) || {};
            return {
              age: r.age,
              opt_fed:   r.fedT   || 0,
              opt_st:    r.stT    || 0,
              opt_irmaa: r.irmaa  || 0,
              cur_fed:   c.fedT   || 0,
              cur_st:    c.stT    || 0,
              cur_irmaa: c.irmaa  || 0,
            };
          });

        const incChartData = opt.rows
          .filter(r => r.age >= (params.retireAge || 60) && r.age <= (params.endAge || 90))
          .filter((_, i) => i % 2 === 0 || i < 6)
          .map(r => {
            const c = cur.rows.find(cr => cr.yr === r.yr) || {};
            return {
              age: r.age,
              opt_ss:   Math.round((r.ss  || 0) * 0.85),
              opt_ab:   r.abn          || 0,
              opt_rmd:  r.rmd          || 0,
              opt_pxs:  r.pretaxSpend  || 0,
              opt_conv: r.conv         || 0,
              cur_ss:   Math.round((c.ss  || 0) * 0.85),
              cur_ab:   c.abn          || 0,
              cur_rmd:  c.rmd          || 0,
              cur_pxs:  c.pretaxSpend  || 0,
            };
          });

        const tblBox  = { flex: "0 0 250px", background: "var(--card-bg)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" };
        const tblHead = { padding: "7px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" };

        const ltRow = (color, label, optVal, curVal) => (
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <td style={{ padding: "5px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
              </div>
            </td>
            <td style={{ padding: "5px 8px", textAlign: "right", fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{fmtDollar(optVal)}</td>
            <td style={{ padding: "5px 8px", textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>{fmtDollar(curVal)}</td>
          </tr>
        );

        return (
          <>
            <div className="chart-card">
              <div className="ct">Estimated Taxes</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
                Annual tax by type — bright bars = with conversions (OPT), muted bars = without (CUR)
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={taxChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={2}>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
                      <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 9 }} />
                      <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 9 }} tickFormatter={v => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
                      <Tooltip content={<TaxYearTip />} />
                      <Bar dataKey="opt_fed"   stackId="opt" fill="#6366f1"                name="OPT Federal" />
                      <Bar dataKey="opt_st"    stackId="opt" fill="#fb923c"                name="OPT State" />
                      <Bar dataKey="opt_irmaa" stackId="opt" fill="#f87171"                name="OPT IRMAA"  radius={[2,2,0,0]} />
                      <Bar dataKey="cur_fed"   stackId="cur" fill="rgba(99,102,241,0.3)"   name="CUR Federal" />
                      <Bar dataKey="cur_st"    stackId="cur" fill="rgba(251,146,60,0.3)"   name="CUR State" />
                      <Bar dataKey="cur_irmaa" stackId="cur" fill="rgba(248,113,113,0.3)"  name="CUR IRMAA"  radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={tblBox}>
                  <div style={tblHead}>
                    <span>Lifetime</span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ color: "#6366f1" }}>With Conv</span>
                      <span style={{ color: "var(--text-faint)" }}>Without</span>
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {ltRow("#6366f1", "Federal Income Tax", optFedTotal, curFedTotal)}
                      {!isNoTaxState && ltRow("#fb923c", "State Income Tax", optStTotal, curStTotal)}
                      {ltRow("#f87171", "IRMAA Surcharges", opt.cIrmaa || 0, cur.cIrmaa || 0)}
                      <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "var(--card-bg)" }}>
                        <td style={{ padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>Total</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: taxD > 0 ? "#fb923c" : "#34d399" }}>{fmtDollar(opt.cTax)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{fmtDollar(cur.cTax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="chart-card">
              <div className="ct">Gross Taxable Income by Source</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
                What generates taxable income each year — bright bars = with conversions, muted = without
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={incChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={2}>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
                      <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 9 }} />
                      <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 9 }} tickFormatter={v => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
                      <Tooltip content={<IncYearTip />} />
                      <Bar dataKey="opt_ss"   stackId="opt" fill="var(--accent-teal)"                  name="OPT Social Sec." />
                      <Bar dataKey="opt_ab"   stackId="opt" fill="var(--accent-gold)"                  name="OPT Annuity" />
                      <Bar dataKey="opt_rmd"  stackId="opt" fill="var(--accent-purple)"                  name="OPT RMD" />
                      <Bar dataKey="opt_pxs"  stackId="opt" fill="#60a5fa"                  name="OPT Pretax Draw" />
                      <Bar dataKey="opt_conv" stackId="opt" fill="#34d399"                  name="OPT Conversion"  radius={[2,2,0,0]} />
                      <Bar dataKey="cur_ss"   stackId="cur" fill="rgba(94,234,212,0.3)"     name="CUR Social Sec." />
                      <Bar dataKey="cur_ab"   stackId="cur" fill="rgba(251,191,36,0.3)"     name="CUR Annuity" />
                      <Bar dataKey="cur_rmd"  stackId="cur" fill="rgba(167,139,250,0.3)"    name="CUR RMD" />
                      <Bar dataKey="cur_pxs"  stackId="cur" fill="rgba(96,165,250,0.3)"     name="CUR Pretax Draw" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={tblBox}>
                  <div style={tblHead}>
                    <span>Lifetime</span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ color: "var(--accent-teal)" }}>With Conv</span>
                      <span style={{ color: "var(--text-faint)" }}>Without</span>
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {ltRow("var(--accent-teal)", "Social Security (85%)", optSSTotal, curSSTotal)}
                      {(optAbTotal > 0 || curAbTotal > 0) && ltRow("var(--accent-gold)", "Annuity / Benefit", optAbTotal, curAbTotal)}
                      {ltRow("var(--accent-purple)", "Required Min. Dist.", opt.cRmd || 0, cur.cRmd || 0)}
                      {(optPxsTotal > 0 || curPxsTotal > 0) && ltRow("#60a5fa", "Pretax Withdrawals", optPxsTotal, curPxsTotal)}
                      {(opt.cConv || 0) > 0 && ltRow("#34d399", "Roth Conversions", opt.cConv || 0, 0)}
                      <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "var(--card-bg)" }}>
                        <td style={{ padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>Total Taxable Inc.</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--accent-teal)" }}>{fmtDollar(optTotInc)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{fmtDollar(curTotInc)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="chart-card">
              <div className="ct">Effective Tax Rate · Optimized vs Current Plan</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={opt.rows.filter((_, i) => i % 2 === 0).map(r => {
                    const c = cur.rows.find(cr => cr.yr === r.yr);
                    return { age: r.age, "OPT Rate": r.effR, "CUR Rate": c ? c.effR : 0 };
                  })}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
                  <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 9 }} />
                  <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 9 }} tickFormatter={v => (v * 100).toFixed(0) + "%"} width={36} />
                  <Tooltip content={<RateTip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="OPT Rate" stroke="var(--positive)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="CUR Rate" stroke="#f87171" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        );
      })()}
      {view === "table" && (
        <div className="chart-card" style={{ overflowX: "auto" }}>
          <div className="ct">Year-by-Year Comparison Table</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5, padding: "6px 8px", background: "var(--card-bg)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
            <strong style={{ color: "#e2e8f0" }}>OPT</strong> = With Roth conversion ladder &nbsp;|&nbsp; <strong style={{ color: "#e2e8f0" }}>CUR</strong> = Without conversions &nbsp;|&nbsp; <span style={{ color: "#f87171" }}>Red numbers</span> = you're paying more tax that year by choice to pay less at {rmdAge}
          </div>
          <table className="roth-tbl">
            <thead>
              <tr>
                <th>Year</th>
                <th>Age</th>
                <th style={{ borderLeft: "2px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }}>OPT Rate</th>
                <th style={{ color: "var(--text-secondary)" }}>CUR Rate</th>
                <th style={{ borderLeft: "2px solid rgba(239,68,68,0.4)", color: "#f87171" }}>OPT Tax</th>
                <th style={{ color: "var(--text-secondary)" }}>CUR Tax</th>
                <th style={{ borderLeft: "2px solid rgba(52,211,153,0.4)", color: "#34d399" }}>OPT RMD</th>
                <th style={{ color: "var(--text-secondary)" }}>CUR RMD</th>
              </tr>
            </thead>
            <tbody>
              {opt.rows
                .filter((r) => r.age >= (params.retireAge || 60) && r.age <= (params.endAge || 90))
                .filter((_, i) => i % 2 === 0 || i < 12)
                .map((r) => {
                  const c = cur.rows.find((cr) => cr.yr === r.yr);
                  return (
                    <tr key={r.yr} className={r.conv > 0 ? "gold" : ""}>
                      <td>{r.yr}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{r.age}</td>
                      <td style={{ borderLeft: "2px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.05)" }}>{(r.effR * 100).toFixed(0)}%</td>
                      <td style={{ background: "rgba(99,102,241,0.05)" }}>{c ? (c.effR * 100).toFixed(0) : "0"}%</td>
                      <td style={{ color: "#f87171", borderLeft: "2px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.05)" }}>{fmtDollar(r.totT)}</td>
                      <td style={{ color: "var(--text-secondary)", background: "rgba(239,68,68,0.05)" }}>
                        {c ? fmtDollar(c.totT) : "$0"}
                      </td>
                      <td style={{ color: "#34d399", borderLeft: "2px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.05)" }}>
                        {r.rmd > 0 ? fmtDollar(r.rmd) : "-"}
                      </td>
                      <td style={{ color: "#f87171", background: "rgba(52,211,153,0.05)" }}>
                        {c && c.rmd > 0 ? fmtDollar(c.rmd) : "-"}
                      </td>
                    </tr>
                  );
                })}
              <tr style={{ borderTop: "2px solid rgba(255,255,255,0.15)", background: "var(--card-bg)" }}>
                <td colSpan={2} style={{ fontWeight: 700, color: "#e2e8f0", textAlign: "left" }}>Lifetime Totals</td>
                <td colSpan={2} style={{ borderLeft: "2px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.05)" }} />
                <td style={{ color: "#f87171", fontWeight: 700, borderLeft: "2px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.05)" }}>{fmtDollar(opt.cTax)}</td>
                <td style={{ color: "var(--text-secondary)", fontWeight: 700, background: "rgba(239,68,68,0.05)" }}>{fmtDollar(cur.cTax)}</td>
                <td colSpan={2} style={{ color: cur.cTax - opt.cTax > 0 ? "#34d399" : "#f87171", fontWeight: 700, textAlign: "left", borderLeft: "2px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.05)" }}>
                  {cur.cTax - opt.cTax > 0 ? `✅ Saves ${fmtDollar(cur.cTax - opt.cTax)}` : `⚠️ Costs ${fmtDollar(opt.cTax - cur.cTax)} more`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {view === "scenarios" && (() => {
        const baseCur = cur;            // user's state, no conversions
        const baseOpt = opt;            // user's state, with conversions
        const noTaxOpt = exNoTax.opt;   // no-tax state, with conversions
        const userState = params.stateOfResidence || "Your State";
        const allYears = baseOpt.rows.filter(r => r.age >= (params.retireAge || 60));
        const stSave = baseCur.cTax - baseOpt.cTax;
        const ntSave = baseCur.cTax - noTaxOpt.cTax;
        return (
          <div className="chart-card" style={{ overflowX: "auto" }}>
            <div className="ct">3-Scenario Comparison · No Conversion | {userState} + Convert | No-Tax State + Convert</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5, padding: "6px 8px", background: "var(--card-bg)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
              <strong style={{ color: "#f87171" }}>No Conversion</strong> = stay put, do nothing &nbsp;|&nbsp;
              <strong style={{ color: "var(--accent-teal)" }}>{userState} + Convert</strong> = stay put, execute Roth ladder &nbsp;|&nbsp;
              <strong style={{ color: "#34d399" }}>No-Tax State + Convert</strong> = move to a no-income-tax state, execute Roth ladder
            </div>
            <table className="roth-tbl">
              <thead>
                {/* Row 1: scenario group banners */}
                <tr>
                  <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Year</th>
                  <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Age</th>
                  <th colSpan={3} style={{ color: "#f87171", background: "rgba(239,68,68,0.13)", textAlign: "center", borderBottom: "2px solid rgba(239,68,68,0.45)", borderLeft: "2px solid rgba(239,68,68,0.45)", paddingBottom: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
                    No Conversion
                  </th>
                  <th colSpan={3} style={{ color: "var(--accent-teal)", background: "rgba(20,184,166,0.13)", textAlign: "center", borderBottom: "2px solid rgba(20,184,166,0.45)", borderLeft: "2px solid rgba(20,184,166,0.45)", paddingBottom: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
                    {userState} + Convert
                  </th>
                  <th colSpan={3} style={{ color: "#34d399", background: "rgba(52,211,153,0.13)", textAlign: "center", borderBottom: "2px solid rgba(52,211,153,0.45)", borderLeft: "2px solid rgba(52,211,153,0.45)", paddingBottom: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
                    No-Tax State + Convert
                  </th>
                </tr>
                {/* Row 2: measure sub-headers */}
                <tr>
                  <th style={{ color: "#f87171", background: "rgba(239,68,68,0.07)", borderLeft: "2px solid rgba(239,68,68,0.35)" }}>Roth $</th>
                  <ThInfo style={{ color: "#f87171", background: "rgba(239,68,68,0.07)", cursor: "help" }} tip={`Total income tax owed this year = federal + ${userState} state tax combined. Hover any data cell for the federal / state split.`}>Total Tax</ThInfo>
                  <th style={{ color: "var(--text-secondary)", background: "rgba(239,68,68,0.07)" }}>IRA Bal</th>
                  <th style={{ color: "var(--accent-teal)", background: "rgba(20,184,166,0.07)", borderLeft: "2px solid rgba(20,184,166,0.35)" }}>Roth $</th>
                  <ThInfo style={{ color: "var(--accent-teal)", background: "rgba(20,184,166,0.07)", cursor: "help" }} tip={`Total income tax owed this year = federal + ${userState} state tax combined. Hover any data cell for the federal / state split.`}>Total Tax</ThInfo>
                  <th style={{ color: "var(--text-secondary)", background: "rgba(20,184,166,0.07)" }}>IRA Bal</th>
                  <th style={{ color: "#34d399", background: "rgba(52,211,153,0.07)", borderLeft: "2px solid rgba(52,211,153,0.35)" }}>Roth $</th>
                  <ThInfo style={{ color: "#34d399", background: "rgba(52,211,153,0.07)", cursor: "help" }} tip={"Federal income tax only — no state income tax applies in this scenario (no-tax state). Hover any data cell to confirm the $0 state split."}>Total Tax</ThInfo>
                  <th style={{ color: "var(--text-secondary)", background: "rgba(52,211,153,0.07)" }}>IRA Bal</th>
                </tr>
              </thead>
              <tbody>
                {allYears.map(r => {
                  const nc = baseCur.rows.find(x => x.yr === r.yr) || {};
                  const bo = baseOpt.rows.find(x => x.yr === r.yr) || {};
                  const nt = noTaxOpt.rows.find(x => x.yr === r.yr) || {};
                  const hasConv = bo.conv > 0 || nt.conv > 0;
                  return (
                    <tr key={r.yr} style={{ background: hasConv ? "rgba(13,148,136,0.06)" : undefined }}>
                      <td>{r.yr}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{r.age}</td>
                      {/* No Conversion columns */}
                      <td style={{ color: "#f87171", background: "rgba(239,68,68,0.07)", borderLeft: "2px solid rgba(239,68,68,0.25)" }}>{nc.conv > 0 ? fmtDollar(nc.conv) : "—"}</td>
                      <td style={{ color: "#f87171", background: "rgba(239,68,68,0.07)", cursor: "help" }} title={`Fed: ${fmtDollar(nc.fedT || 0)} | State: ${fmtDollar(nc.stT || 0)}`}>{fmtDollar(nc.totT || 0)}</td>
                      <td style={{ color: "var(--text-secondary)", background: "rgba(239,68,68,0.07)" }}>{fmtDollar(nc.pT || 0)}</td>
                      {/* {userState} + Convert columns */}
                      <td style={{ color: "var(--accent-teal)", fontWeight: bo.conv > 0 ? 600 : 400, background: "rgba(20,184,166,0.07)", borderLeft: "2px solid rgba(20,184,166,0.25)" }}>{bo.conv > 0 ? fmtDollar(bo.conv) : "—"}</td>
                      <td style={{ color: "var(--accent-teal)", background: "rgba(20,184,166,0.07)", cursor: "help" }} title={`Fed: ${fmtDollar(bo.fedT || 0)} | State: ${fmtDollar(bo.stT || 0)}`}>{fmtDollar(bo.totT || 0)}</td>
                      <td style={{ color: "var(--text-secondary)", background: "rgba(20,184,166,0.07)" }}>{fmtDollar(bo.pT || 0)}</td>
                      {/* No-Tax State + Convert columns */}
                      <td style={{ color: "#34d399", fontWeight: nt.conv > 0 ? 600 : 400, background: "rgba(52,211,153,0.07)", borderLeft: "2px solid rgba(52,211,153,0.25)" }}>{nt.conv > 0 ? fmtDollar(nt.conv) : "—"}</td>
                      <td style={{ color: "#34d399", background: "rgba(52,211,153,0.07)", cursor: "help" }} title={`Fed: ${fmtDollar(nt.fedT || 0)} | State: $0 (no-tax state)`}>{fmtDollar(nt.totT || 0)}</td>
                      <td style={{ color: "var(--text-secondary)", background: "rgba(52,211,153,0.07)" }}>{fmtDollar(nt.pT || 0)}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.15)", background: "var(--row-highlight)", fontWeight: 700 }}>
                  <td colSpan={2} style={{ color: "#e2e8f0" }}>Lifetime Totals</td>
                  <td style={{ color: "#f87171", background: "rgba(239,68,68,0.07)", borderLeft: "2px solid rgba(239,68,68,0.25)" }}>—</td>
                  <td style={{ color: "#f87171", background: "rgba(239,68,68,0.07)" }}>{fmtDollar(baseCur.cTax)}</td>
                  <td style={{ color: "var(--text-secondary)", background: "rgba(239,68,68,0.07)" }}>{fmtDollar(baseCur.rows[baseCur.rows.length-1]?.pT || 0)}</td>
                  <td style={{ color: "var(--accent-teal)", background: "rgba(20,184,166,0.07)", borderLeft: "2px solid rgba(20,184,166,0.25)" }}>{fmtDollar(baseOpt.cConv)}</td>
                  <td style={{ color: stSave > 0 ? "#34d399" : "#f87171", background: "rgba(20,184,166,0.07)" }}>{fmtDollar(baseOpt.cTax)} {stSave > 0 ? `(saves ${fmtDollar(stSave)})` : `(costs ${fmtDollar(-stSave)} more)`}</td>
                  <td style={{ color: "var(--text-secondary)", background: "rgba(20,184,166,0.07)" }}>{fmtDollar(baseOpt.rows[baseOpt.rows.length-1]?.pT || 0)}</td>
                  <td style={{ color: "#34d399", background: "rgba(52,211,153,0.07)", borderLeft: "2px solid rgba(52,211,153,0.25)" }}>{fmtDollar(noTaxOpt.cConv)}</td>
                  <td style={{ color: ntSave > 0 ? "#34d399" : "#f87171", background: "rgba(52,211,153,0.07)" }}>{fmtDollar(noTaxOpt.cTax)} {ntSave > 0 ? `(saves ${fmtDollar(ntSave)})` : `(costs ${fmtDollar(-ntSave)} more)`}</td>
                  <td style={{ color: "var(--text-secondary)", background: "rgba(52,211,153,0.07)" }}>{fmtDollar(noTaxOpt.rows[noTaxOpt.rows.length-1]?.pT || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}
      <div
        style={{
          fontSize: 9,
          color: "#334155",
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        This analysis is for planning purposes only. Consult a tax professional
        before executing Roth conversions. Progressive fed brackets (IRS Rev.
        Proc. 2025-32) · NJ graduated rates · Joint & Last Survivor RMD table ·
        7% growth assumption · Conversion tax default funded from your taxable /
        HSA / cash bucket (Vanguard BETR best practice — lowest effective rate).
        Override in Assumptions → Roth Conversion Strategy.
      </div>
    </div>
  );
}

/**
 * Year-end check — the December deadline.
 *
 * Every tax lever here is use-it-or-lose-it on Dec 31: a Roth conversion must
 * SETTLE (not merely be requested), harvesting must trade, a QCD must clear.
 * Unused bracket room does not roll over — you cannot go back and fill last
 * year's 12% bracket. The app modeled all of it and said nothing when it counted.
 *
 * Two surfaces, deliberately: a popup once per year so it cannot be missed, and a
 * persistent strip on the Net Worth card so dismissing the popup does not throw
 * the information away for the rest of the month.
 */
const LS_YEAREND_KEY = "aira_yearend_ack_v1";

function yearEndAcked(year) {
  try { return Number(localStorage.getItem(LS_YEAREND_KEY)) === year; } catch { return false; }
}
function ackYearEnd(year) {
  try { localStorage.setItem(LS_YEAREND_KEY, String(year)); } catch { /* private mode */ }
}

/** Shared body: the countdown, the room, and what to do about it. */
function YearEndBody({ room, days, year, compact }) {
  const money = (n) => (n === Infinity ? "no limit" : fmtDollar(n));
  return (
    <div style={{ fontSize: compact ? 10 : 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
      <div style={{ marginBottom: compact ? 4 : 8 }}>
        <strong style={{ color: days <= 10 ? "#f87171" : "var(--accent-gold)", fontSize: compact ? 11 : 13 }}>
          {days} day{days === 1 ? "" : "s"} left
        </strong>{" "}
        to act in {year}. Conversions must <strong>settle</strong> by Dec 31 — not just be requested.
      </div>
      {room.hasData ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>Room to top of {room.marginalBracket != null ? "your target" : ""} bracket</span>
            <strong style={{ color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{money(room.bracketRoom)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>Room before the IRMAA cliff (MAGI)</span>
            <strong style={{ color: "var(--accent-purple)", fontFamily: "'JetBrains Mono',monospace" }}>{money(room.irmaaRoom)}</strong>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4,
            paddingTop: 4, borderTop: "1px solid rgba(148,163,184,0.15)",
          }}>
            <span style={{ color: "#e2e8f0" }}>
              Convertible now{" "}
              <span style={{ color: "var(--text-muted)" }}>({room.bindingConstraint === "irmaa" ? "IRMAA binds" : "bracket binds"})</span>
            </span>
            <strong style={{ color: "#34d399", fontFamily: "'JetBrains Mono',monospace" }}>{money(room.conversionRoom)}</strong>
          </div>
          {room.alreadyConverted > 0 && (
            <div style={{ fontSize: compact ? 9 : 10, color: "var(--text-muted)", marginTop: 3 }}>
              {fmtDollar(room.alreadyConverted)} already converted this year — the figures above are what remains.
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: compact ? 9 : 11, color: "var(--text-muted)", fontStyle: "italic" }}>
          No tax-room figure: {room.reason}. Compare your own YTD taxable income against the
          ceilings on the Withdrawal Plan tab.
        </div>
      )}
    </div>
  );
}

/** Compact strip for the Net Worth card. Visible all December. */
function YearEndStrip({ room, days, year }) {
  return (
    <div style={{
      marginTop: 8, padding: "6px 8px", borderRadius: 6,
      background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-gold)", marginBottom: 3 }}>
        Year-end check
      </div>
      <YearEndBody room={room} days={days} year={year} compact />
    </div>
  );
}

/** Once-a-year popup. Portalled so no ancestor can clip it. */
function YearEndModal({ room, days, year, onClose, onSaveCheckIn, canCheckIn }) {
  const [saved, setSaved] = React.useState(false);
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(2,6,23,0.72)", zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f172a", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 12,
          padding: "18px 20px", maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.8)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-gold)", marginBottom: 4 }}>
          Year-end check &mdash; {year}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
          Shown once each December. Two things are worth doing before the 31st.
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
          1 &middot; Your remaining tax room
        </div>
        <YearEndBody room={room} days={days} year={year} />

        <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", margin: "14px 0 6px" }}>
          2 &middot; Record a checkpoint
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>
          A year-end snapshot of your real balances and success rate. Checkpoints anchor the
          projection to what actually happened, so next year&rsquo;s plan starts from fact
          rather than from last year&rsquo;s forecast.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="mbtn"
            disabled={!canCheckIn || saved}
            onClick={() => { onSaveCheckIn?.(); setSaved(true); }}
            style={{ fontSize: 12, padding: "5px 12px", opacity: (!canCheckIn || saved) ? 0.5 : 1 }}
          >
            {saved ? "Checkpoint saved" : "Save checkpoint"}
          </button>
          <button className="mbtn" onClick={onClose} style={{ fontSize: 12, padding: "5px 12px" }}>
            Close
          </button>
        </div>
        {!canCheckIn && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>
            Run the Monte Carlo first — a checkpoint stores the success rate alongside the balances.
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

const LANDMINE_TIP_W = 290;

/**
 * Landmine hover card.
 *
 * Rendered through a PORTAL to document.body rather than as an absolutely
 * positioned child. The table it lives in sits inside `overflowX: auto`, and per
 * CSS spec a scroll value on one axis forces the other to `auto` too — so the
 * old `position:absolute; bottom:100%` card was clipped by its own scroll
 * container the moment it extended above the first row. (Reported with a
 * screenshot: the §72(t) card was sheared off by the panel above it.)
 *
 * Portalling escapes every ancestor clip. Position is then computed in viewport
 * space from the trigger's rect, flipped below when there isn't room above, and
 * clamped horizontally so a landmine in the last column can't run off-screen.
 */
function LandmineTip({ emoji, label, detail, color }) {
  const [show, setShow] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const ref = React.useRef(null);

  const place = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Measured lazily: the card is ~1 line of title + wrapped detail. Estimating
    // high is the safe direction — it only decides flip, never final size.
    const estH = 150;
    const above = r.top;
    const flipDown = above < estH + 12;
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - LANDMINE_TIP_W / 2),
      window.innerWidth - LANDMINE_TIP_W - 8
    );
    setPos({
      left,
      top: flipDown ? r.bottom + 8 : undefined,
      bottom: flipDown ? undefined : window.innerHeight - r.top + 8,
    });
  }, []);

  const open = () => { place(); setShow(true); };
  const close = () => setShow(false);

  // A scroll or resize while open would strand the card away from its trigger.
  React.useEffect(() => {
    if (!show) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [show, place]);

  return (
    <span
      ref={ref}
      style={{ position: "relative", cursor: "help", marginRight: 3, display: "inline-block" }}
      onMouseEnter={open}
      onMouseLeave={close}
    >
      {emoji}
      {show && pos && typeof document !== "undefined" && ReactDOM.createPortal(
        <div style={{
          position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom,
          background: "#0f172a",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
          padding: "9px 13px", width: LANDMINE_TIP_W, maxWidth: "calc(100vw - 16px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.7)", zIndex: 9999, pointerEvents: "none",
          whiteSpace: "normal", textAlign: "left",
          maxHeight: "70vh", overflowY: "auto",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color || "#e2e8f0", marginBottom: 5 }}>
            {emoji} {label}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>{detail}</div>
        </div>,
        document.body
      )}
    </span>
  );
}

/**
 * Combined Withdrawal Plan tab — wraps the two views that answer the two
 * different planning questions, with each question called out prominently
 * and a twisty (collapsible) body. Both sections default to open so the
 * full plan is visible on first load; the user can collapse either to focus.
 */
// Sourcing guardrails — the "which bucket" controls, co-located with the waterfall
// they shape (design-authority: proximity). They persist to the profile via the same
// onAssumptionChange setter the Profile panel uses, so the MC stale-flag fires
// identically. Distribution strategy stays in Profile (it's global, drives MC).
// Plain-language names for the four drawable buckets (shared by the order control
// and the templated Section-1 subtitle).
const BUCKET_LABELS = { cash: "Cash / SGOV", taxable: "Taxable brokerage", pretax: "Pre-tax (IRA/401k)", roth: "Roth" };
const BUCKET_LABELS_SHORT = { cash: "cash", taxable: "taxable", pretax: "pre-tax", roth: "Roth" };

// "Account draw order" — which bucket drains first. Orthogonal to the distribution
// strategy (how much to spend) and to the guardrails (how deep to draw pre-tax/Roth).
function AccountDrawOrder({ p, onAssumptionChange }) {
  const set = onAssumptionChange ?? (() => {});
  const mode = p.orderingMode || "tax_reactive";
  const effective = resolveDrawOrder(mode, p.withdrawalOrder);          // shown for non-custom modes
  const customOrder = resolveDrawOrder("custom", p.withdrawalOrder);    // the editable list

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= customOrder.length) return;
    const next = customOrder.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set("withdrawalOrder", next);
  };

  const MODES = [
    ["tax_reactive", "Tax-reactive", true],
    ["custom",       "Custom",       false],
    ["pretax_first", "Pre-tax first", false],
  ];
  const radioLbl = { fontSize: 12, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", whiteSpace: "nowrap" };
  const arrow = (dis) => ({ background: dis ? "transparent" : "#0a1628", border: "1px solid #1e3a5f", color: dis ? "#334155" : "var(--accent-teal)", borderRadius: 4, width: 20, height: 18, cursor: dis ? "default" : "pointer", fontSize: 10, lineHeight: 1, padding: 0 });

  return (
    <div style={{
      background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.18)",
      borderRadius: 8, padding: "10px 14px", margin: "10px 0",
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Account draw order
        </span>
        {MODES.map(([val, name, rec]) => (
          <label key={val} style={radioLbl}>
            <input type="radio" name="orderingMode" checked={mode === val} onChange={() => set("orderingMode", val)} style={{ cursor: "pointer" }} />
            {name}{rec && <em style={{ color: "var(--text-muted)", fontStyle: "normal", fontSize: 11 }}>&nbsp;(recommended)</em>}
          </label>
        ))}
        {mode !== "custom" && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace" }}>
            {effective.map((b) => BUCKET_LABELS[b]).join(" → ")}
          </span>
        )}
      </div>

      {mode === "custom" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {customOrder.map((b, i) => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 7, padding: "5px 8px" }}>
              <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{i + 1}</span>
              <span style={{ fontSize: 12, color: "#e2e8f0" }}>{BUCKET_LABELS[b]}</span>
              <button style={arrow(i === 0)} disabled={i === 0} onClick={() => move(i, -1)} title="Move earlier">▲</button>
              <button style={arrow(i === customOrder.length - 1)} disabled={i === customOrder.length - 1} onClick={() => move(i, 1)} title="Move later">▼</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
        Earlier = drained first. RMDs are always taken first by law; the bracket cap, IRMAA guard, and Roth reserve below still apply to wherever pre-tax and Roth land.
      </div>
    </div>
  );
}

function SourcingGuardrails({ p, onAssumptionChange, summary }) {
  const set = onAssumptionChange ?? (() => {});
  const saved = summary?.taxSavings ?? 0;
  const ctl = { background: "#0a1628", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };
  const lbl = { fontSize: 11, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
      background: "rgba(94,234,212,0.05)", border: "1px solid rgba(94,234,212,0.18)",
      borderRadius: 8, padding: "10px 14px", margin: "10px 0",
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-teal)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Sourcing guardrails
      </span>
      <label style={lbl} title="Stop pre-tax (IRA/401k) draws when ordinary income would hit this tax bracket. Roth covers the rest. 'Off' = naive (pretax first, no ceiling).">
        Stop pre-tax draws at
        <select value={p.withdrawalBracketTarget || "22"} onChange={(e) => set("withdrawalBracketTarget", e.target.value)} style={ctl}>
          <option value="off">Off — pretax first</option>
          <option value="10">10% bracket</option>
          <option value="12">12% bracket</option>
          <option value="22">22% bracket (rec.)</option>
          <option value="24">24% bracket</option>
          <option value="irmaa">IRMAA-safe</option>
        </select>
      </label>
      <label style={lbl} title="IRMAA = income-based Medicare premium surcharge. Caps pre-tax draws below the Tier-1 income limit (ages 63+) so your Medicare premiums don't spike 2 years later.">
        <input type="checkbox" checked={p.irmaaGuard || false} onChange={(e) => set("irmaaGuard", e.target.checked)} style={{ cursor: "pointer", width: 15, height: 15 }} />
        Avoid Medicare (IRMAA) surcharges
      </label>
      <label style={lbl} title="AiRA will not draw your Roth below this balance — protects tax-free funds during market downturns.">
        Keep Roth above $
        <input type="number" value={p.rothEmergencyReserve ?? 0} onChange={(e) => set("rothEmergencyReserve", Number(e.target.value) || 0)} min={0} max={2_000_000} step={10_000}
          style={{ ...ctl, width: 110, fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
      </label>
      {/* ── IRC 72(t): only asked when it can actually apply ──────────────────
          Determined at the OUTSET from retireAge, not discovered mid-plan. The
          Rule of 55 option appears only when a former-employer plan is actually
          detected among the pretax accounts: it does NOT reach an IRA, so
          offering it to a pure-rollover holder would invite a wrong answer.
          Detection is name-based (the account model has no 401k/IRA subtype). */}
      {(p.retireAge ?? 99) < EARLY_PENALTY_AGE && (() => {
        const plan = detectEmployerPlan(p.accounts || []);
        return (
          <div style={{
            width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8,
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5", marginBottom: 4 }}>
              Retiring at {p.retireAge} — before 59.5
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>
              Pre-tax withdrawals before 59.5 owe a <strong>10% penalty</strong> on top of income tax
              (IRC 72(t)). AiRA charges it. Tick an exception only if it genuinely applies to you.
            </div>
            {plan.hasEmployerPlan ? (
              <label style={lbl} title="Rule of 55: penalty-free withdrawals from the plan of the employer you separated from, if you left in or after the year you turned 55. It does NOT apply to an IRA — rolling the 401k over forfeits it permanently.">
                <input type="checkbox" checked={p.ruleOf55 || false}
                  onChange={(e) => set("ruleOf55", e.target.checked)}
                  style={{ cursor: "pointer", width: 15, height: 15 }} />
                Rule of 55 — I left this employer at 55+ and did NOT roll it over
                <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: 4 }}>
                  ({plan.matches.join(", ")} = {Math.round(plan.share * 100)}% of pre-tax)
                </span>
              </label>
            ) : (
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 4 }}>
                No former-employer 401k/403b/457 found in your pre-tax accounts, so the Rule of 55
                is unavailable — it never applies to an IRA. If you still hold one, name the account
                so it contains "401k".
              </div>
            )}
            <label style={lbl} title="72(t) SEPP: substantially equal periodic payments. Penalty-free, but the series must continue for the LONGER of 5 years or until age 59.5 — breaking it early retroactively penalizes every payment.">
              <input type="checkbox" checked={p.sepp72t || false}
                onChange={(e) => set("sepp72t", e.target.checked)}
                style={{ cursor: "pointer", width: 15, height: 15 }} />
              72(t) SEPP starting at age
              <input type="number" value={p.sepp72tStartAge ?? p.retireAge ?? 55}
                onChange={(e) => set("sepp72tStartAge", Number(e.target.value) || null)}
                min={30} max={59} step={1} disabled={!p.sepp72t}
                style={{ ...ctl, width: 60, fontFamily: "'JetBrains Mono',monospace", textAlign: "right",
                         opacity: p.sepp72t ? 1 : 0.4 }}
                onFocus={selectAllOnFocus} />
              {p.sepp72t && (
                <span style={{ color: "var(--accent-gold)", fontSize: 10, marginLeft: 4 }}>
                  must run to age {Math.max((p.sepp72tStartAge ?? p.retireAge ?? 55) + 5, EARLY_PENALTY_AGE)}
                </span>
              )}
            </label>
          </div>
        );
      })()}
      <label style={lbl} title="The 'tax torpedo': as income rises, up to 85% of your Social Security becomes taxable. This flags the years where that happens (thresholds frozen since the 1980s).">
        <input type="checkbox" checked={p.ssTorpedoGuard ?? false} onChange={(e) => set("ssTorpedoGuard", e.target.checked)} style={{ cursor: "pointer", width: 15, height: 15 }} />
        Flag when Social Security gets taxed at 85%
      </label>
      {/* Live feedback: the effect of these controls, surfaced at the strip (design #3) */}
      <span
        style={{
          marginLeft: "auto", fontSize: 11, fontWeight: 700,
          color: saved > 0 ? "#34d399" : "var(--text-secondary)",
          background: saved > 0 ? "rgba(52,211,153,0.10)" : "transparent",
          borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap",
        }}
        title="Estimated lifetime tax saved by this sourcing plan vs. drawing pre-tax first with no guardrails. Updates as you change the controls."
      >
        {saved > 0 ? `≈ ${fmtDollar(saved)} lifetime tax saved vs no plan` : "No tax savings vs pretax-first at these settings"}
      </span>
    </div>
  );
}

// Hoisted out of WithdrawalPlanCombined so it isn't recreated on every render
// (a fresh component identity each render remounts the subtree and drops focus).
function WithdrawalSectionHeader({ open, onToggle, color, question, subtitle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${withAlpha(color, "44")}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: "16px 18px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 14,
        marginBottom: open ? 10 : 0,
      }}
    >
      <span style={{ color, fontSize: 18, lineHeight: 1, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▸</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0", fontStyle: "italic", lineHeight: 1.35 }}>
          “{question}”
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5 }}>{subtitle}</div>
      </div>
    </button>
  );
}

function WithdrawalPlanCombined({ p, inf, withdrawalStrategy, onAssumptionChange }) {
  const [openSourcing, setOpenSourcing] = useState(true);
  const [openStrategy, setOpenStrategy] = useState(true);
  // The Section-2 selector is PREVIEW-ONLY: it drives the year-by-year table below
  // without overwriting the Profile default (which drives the whole app + MC). A
  // separate "Set as default" action commits it. Seed from the global default and
  // re-sync if that default changes elsewhere (e.g. the Profile panel).
  const [previewStrategy, setPreviewStrategy] = useState(withdrawalStrategy);
  useEffect(() => { setPreviewStrategy(withdrawalStrategy); }, [withdrawalStrategy]);
  const previewIsDefault = previewStrategy === withdrawalStrategy;
  // Compute the waterfall once here so the guardrail strip (always visible) and the
  // table (when expanded) share it — no double compute, and the strip can show the
  // live "tax saved vs no plan" delta from the same summary.
  const waterfall = useMemo(() => buildWithdrawalWaterfall(p), [p]);
  // Set when this profile was loaded off a strategy retired in v1.2.88.
  const migrated = migrationNotice(p.withdrawalStrategyMigratedFrom);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionDisclaimer>
        This schedule is an illustration produced by a model — not a recommendation to
        withdraw from, convert, or roll over any specific account. It cannot see your full
        tax picture, and the tax, RMD, IRMAA, and penalty figures are estimates based on the
        assumptions you entered and on current law, both of which change. Do not act on
        these amounts without confirming them with a licensed tax adviser, CPA, or fiduciary.
      </SectionDisclaimer>
      {/* Retired-strategy notice. A saved plan silently changing which spending
          rule it runs is exactly the defect class this cull was meant to reduce,
          so the swap is stated, the replacement is named, and we say plainly
          whether the numbers moved. Dismissing clears the stamp for good. */}
      {migrated && (
        <div style={{
          background: migrated.fidelity === "changed" ? "rgba(251,191,36,0.08)" : "rgba(13,148,136,0.08)",
          border: `1px solid ${migrated.fidelity === "changed" ? "rgba(251,191,36,0.35)" : "rgba(13,148,136,0.35)"}`,
          borderRadius: 8, padding: "12px 14px", fontSize: 12,
          color: "#cbd5e1", lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: migrated.fidelity === "changed" ? "var(--accent-gold)" : "var(--accent-teal)", marginBottom: 4 }}>
            {migrated.fidelity === "changed" ? "⚠" : "✓"} Your saved strategy “{migrated.fromLabel}” was retired — this plan now uses{" "}
            {migrated.toLabel}.
          </div>
          <div>{migrated.basis}</div>
          <div style={{ marginTop: 6, color: migrated.fidelity === "changed" ? "var(--accent-gold)" : "var(--text-secondary)" }}>
            {migrated.impact}
          </div>
          <button
            className="mbtn"
            style={{ marginTop: 9, fontSize: 11 }}
            onClick={() => onAssumptionChange("withdrawalStrategyMigratedFrom", null)}
          >
            Got it — don't show this again
          </button>
        </div>
      )}

      {/* Orientation card — explains the two-question framing */}
      <div style={{
        background: "rgba(13,148,136,0.06)",
        border: "1px solid rgba(13,148,136,0.18)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 11,
        color: "var(--text-secondary)",
        lineHeight: 1.55,
      }}>
        This tab answers two questions. <strong style={{ color: "var(--accent-teal)" }}>(1) Which accounts should you draw from each year</strong> to
        pay the least tax over your lifetime — set the guardrails below and see the plan. <strong style={{ color: "var(--accent-gold)" }}>(2) How much
        does your chosen strategy plan to spend</strong> year by year. Start with the first question.
        <span style={{ display: "block", color: "var(--text-muted)", marginTop: 4 }}>
          Both use the same tax engine, so the per-year tax figures agree.
        </span>
      </div>

      {/* ── Global strategy control (design-authority ruling, v1.2.60) ──────
          This block used to render between Section 2's header and Section 2's
          collapsible body — a dead zone belonging to no visible container, and
          structurally inconsistent with Section 1 (which puts every control
          INSIDE its collapsible).

          It is hoisted to tab level rather than pushed into Section 2's
          collapsible because it writes `withdrawalStrategy` — the single global
          consumed by runMC, simulateDeterministicWithStrategy, the home Net Worth
          card, the MCTab InputCard row, the engine InfoModal and buildRothExplorer.
          Gating the app's ONLY strategy-write behind a twisty would re-create the
          exact failure the banner below was built to fix.

          RELOCATED ONLY: banner copy, button styling, tooltip and commit logic are
          untouched. ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {/* Persistent state banner. The commit affordance used to be an 11px amber
              line BELOW the dropdown, plus a subtitle in the collapsible header — and
              the app's own author read this screen as broken wiring, concluding the
              strategy "doesn't switch". It switches; it just does not SAVE, because
              this dropdown drives a preview. If the author misses that, everyone does.
              The state now sits directly above the control you are about to touch, and
              names the saved default at all times so the two screens visibly agree. */}
          <div
            title={
              "HOW THIS WORKS\n\n" +
              "The dropdown below is a PREVIEW. Changing it redraws the year-by-year table on this page so you can compare strategies — it does not change your plan, and it does not re-run the Monte Carlo.\n\n" +
              "TO ACTUALLY CHANGE YOUR PLAN: pick a strategy in the dropdown, then click the yellow \"Use ... in my plan\" button that appears just below it. That is the only place in the app that saves your strategy — there is no strategy setting in the Profile tab.\n\n" +
              "ONCE SAVED, it drives everything: the Monte Carlo success rate, the Net Worth summary card on the home page, and every projection tab. Until you click it, all of those keep using your saved strategy — which is why the home card can show a different strategy than this dropdown."
            }
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 8, flexWrap: "wrap", padding: "6px 10px", borderRadius: 6, cursor: "help",
              border: `1px solid ${previewIsDefault ? "rgba(52,211,153,0.35)" : "rgba(251,191,36,0.55)"}`,
              background: previewIsDefault ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.12)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", color: previewIsDefault ? "#34d399" : "var(--accent-gold)" }}>
              {previewIsDefault ? "✓ SAVED — USED EVERYWHERE" : "👁 PREVIEW ONLY — NOT SAVED"}
              <span style={{ marginLeft: 5, color: "var(--text-secondary)", display: "inline-flex" }}><InfoIcon size={12} /></span>
            </span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Your saved plan uses <strong style={{ color: "#e2e8f0" }}>{getStrategyLabel(withdrawalStrategy)}</strong>
            </span>
          </div>
          <select
            value={previewStrategy}
            onChange={(e) => setPreviewStrategy(e.target.value)}
            style={{
              width: "100%",
              background: "#0d1b2a",
              border: "1px solid #1e3a5f",
              color: "#e2e8f0",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 13,
              fontFamily: "'Inter',sans-serif",
            }}
          >
            <option value="smart">📋 Smart Waterfall (Tax-Optimal · GK→Bengen at 15yr)</option>
            <option value="gk">Guyton‑Klinger (Dynamic)</option>
            <option value="bengen">Bengen 4% Rule (fixed, inflation-adjusted)</option>
            <option value="fixed">Fixed % of Portfolio</option>
            <option value="ninety_five_rule">95% Rule (Cut Protection)</option>
            <option value="vpw">VPW (Variable Percentage · spends to zero)</option>
          </select>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{getStrategyDescription(previewStrategy)}</div>
          {/* Commit action — only shown when the preview differs from the saved default.
              This is the single, explicit path from "previewing" to "applied app-wide". */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 24 }}>
            {previewIsDefault ? (
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                ✓ Previewing your saved default — the whole app (including Monte Carlo) uses this strategy.
              </span>
            ) : (
              <>
                <span style={{ fontSize: 12, color: "var(--accent-gold)" }}>
                  Nothing has changed in your plan yet.
                </span>
                {/* Promoted from a ghost button to a solid primary. This is the ONLY
                    control in the entire app that writes withdrawalStrategy — verified
                    by grep; the Profile panel displays it but has no selector. A
                    single, conditional, low-contrast button being the sole commit path
                    is why the preview/saved split read as a bug. */}
                <button
                  onClick={() => {
                    onAssumptionChange("withdrawalStrategy", previewStrategy);
                    // Choosing a strategy deliberately answers the migration
                    // notice — leaving it up would keep telling the user about
                    // a swap they have now overridden.
                    if (p.withdrawalStrategyMigratedFrom) onAssumptionChange("withdrawalStrategyMigratedFrom", null);
                  }}
                  style={{
                    padding: "7px 16px", fontSize: 12, fontWeight: 800, borderRadius: 6,
                    border: "none", background: "var(--accent-gold)", color: "#0d1b2a",
                    cursor: "pointer", whiteSpace: "nowrap",
                    boxShadow: "0 2px 10px rgba(251,191,36,0.35)",
                  }}
                  title="Save this strategy to your plan. This re-runs the Monte Carlo simulation and updates every tab, including the Net Worth summary card."
                >
                  Use {getStrategyLabel(previewStrategy)} in my plan →
                </button>
                <button
                  onClick={() => setPreviewStrategy(withdrawalStrategy)}
                  style={{
                    padding: "4px 10px", fontSize: 11, borderRadius: 6,
                    border: "1px solid #1e3a5f", background: "transparent",
                    color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                  title="Discard the preview and go back to your saved default."
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>

      {/* ── Section 1: Sourcing ──────────────────────────────────────── */}
      <div>
        <WithdrawalSectionHeader
          open={openSourcing}
          onToggle={() => setOpenSourcing(v => !v)}
          color="var(--accent-teal)"
          question="Where does each year's spending come from?"
          subtitle={`Account-by-account sourcing — ${resolveDrawOrder(p.orderingMode, p.withdrawalOrder).map((b) => BUCKET_LABELS_SHORT[b]).join(" → ")} — with tax landmines flagged`}
        />
        {/* Guardrails live inside the collapsible now (design update): they're
            revealed only when the green sourcing section is expanded, alongside the
            waterfall table they shape. The order control sits above the guardrails
            strip — ordering is the outer sequence; the guardrails are inner caps. */}
        {openSourcing && (
          <div style={{ paddingLeft: 4 }}>
            <AccountDrawOrder p={p} onAssumptionChange={onAssumptionChange} />
            <SourcingGuardrails p={p} onAssumptionChange={onAssumptionChange} summary={waterfall.summary} />
            <WaterfallPlanView p={p} result={waterfall} />
          </div>
        )}
      </div>

      {/* ── Section 2: Strategy pacing ───────────────────────────────── */}
      <div>
        <WithdrawalSectionHeader
          open={openStrategy}
          onToggle={() => setOpenStrategy(v => !v)}
          color="var(--accent-gold)"
          question="How does my chosen strategy pace spending year by year?"
          subtitle={`Preview how ${getStrategyLabel(previewStrategy)} paces spending — expand for the full year-by-year schedule and chart.`}
        />
        {openStrategy && (
          <div style={{ paddingLeft: 4 }}>
            <DeterministicWithdrawalView p={p} inf={inf} withdrawalStrategy={previewStrategy} />
          </div>
        )}
      </div>
    </div>
  );
}

function WaterfallPlanView({ p, result }) {
  const [mode, setMode] = useState("smart");
  const { smart, naive, summary } = result;
  const rows = mode === "smart" ? smart.rows : naive.rows;

  // Bucket 1 may be composed of any account category — match the table column to it
  const b1Cats = new Set(
    expandAccountBuckets(p.accounts)
      .filter(piece => piece.bucket === 1)
      .map(piece => piece.category || "cash")
  );

  // Operator cells — visually wire the withdrawal columns into the equation they satisfy
  const opThStyle = { padding: "0 3px", color: "var(--text-faint)", fontWeight: 400, fontSize: 11, textAlign: "center" };
  const opTdStyle = { padding: "0 3px", color: "var(--text-faint)", fontWeight: 600, fontSize: 12, textAlign: "center" };

  const btnStyle = (active) => ({
    padding: "5px 14px", fontSize: 12, borderRadius: 6, border: "none",
    cursor: "pointer",
    background: active ? "rgba(13,148,136,0.25)" : "transparent",
    color: active ? "var(--accent-teal)" : "var(--text-faint)",
  });

  const chartData = rows.map(r => ({
    age: r.age,
    Cash:    Math.round(r.fromCash),
    Taxable: Math.round(r.fromTaxable),
    // Pre-Tax = TOTAL pretax outflow (forced RMD + discretionary draw). The RMD
    // funds spending like any other dollar, so omitting it left a hole in the
    // stack during RMD years even though the money was flowing out of the IRA.
    "Pre-Tax": Math.round(r.fromPretax + r.rmd),
    Roth:    Math.round(r.fromRoth),
    "Fed Tax":   Math.round(r.fedTax),
    "State Tax": Math.round(r.stateTax),
    "IRMAA":     Math.round(r.irmaa),
    "Roth Conversion": Math.round(r.conversionAmount),
  }));

  const anyLandmine = (r) => r.landmines.ssTorpedo || r.landmines.irmaaTriggered || r.landmines.rmdActive;
  const anyConversion = rows.some(r => r.conversionAmount > 0);
  /* ── Withdrawal rate — ONE definition ──────────────────────────────────────
   *
   * Reported by u/garylapointe: the WR column read 17.8% in a year whose actual
   * draw was $26K. He worked out why himself — 17.8% was his $100,000 SPENDING
   * over the portfolio, not his withdrawal.
   *
   * The column divided SPENDING by the END-of-year portfolio, wrong twice over
   *   • NUMERATOR was spending, not the withdrawal. For anyone with meaningful
   *     income (Gary has a pension covering ~$81K of a $100K spend) those differ
   *     enormously, and the column claimed to be "withdrawal rate vs portfolio".
   *     A plan drawing under 5% was displayed as drawing 17.8% — a number that
   *     reads as severe distress and could push someone into cutting spending
   *     they do not need to cut.
   *   • DENOMINATOR was `totalPort`, the END-of-year balance — after the year's
   *     draw came out. Dividing by the smaller, post-draw number inflates the
   *     rate further.
   *
   * Worse, the SAME tab already computed this correctly for the "Avg. Withdrawal
   * Rate" card (`totalWithdrawal / start-of-year port`), so one page carried two
   * different withdrawal rates that disagreed by a factor of four. Both now come
   * from `wrAt` below — a single definition cannot drift from itself.
   *
   * Numerator is `totalWithdrawal` = rmd + cash + taxable + pretax + roth: the
   * actual gross portfolio outflow, the same figure the "Total Draw" column shows.
   */
  const portAtRetire = accumulateToRetirement(p).total;
  const wrAt = (i) => {
    const r = rows[i];
    if (!r) return null;
    const startPort = i === 0 ? portAtRetire : rows[i - 1].totalPort;
    return startPort > 0 ? r.totalWithdrawal / startPort : null;
  };

  /* The GK guardrail band is ±20% around the FIRST year's actual withdrawal rate,
   * which is what Guyton-Klinger actually compares against — the initial WR. It
   * used to be anchored to `p.sp / p.port`, a SPENDING rate, so the band and the
   * value being banded were different quantities. Falls back to the user's own
   * safe-withdrawal-rate benchmark when year one has no draw at all. */
  const initialWR = wrAt(0) || (p.safeWithdrawalRate ?? 0.04);
  const rowWRColor = (i) => {
    const wr = wrAt(i);
    if (wr == null) return "var(--text-secondary)";
    return wr > initialWR * 1.2 ? "#f87171" : wr < initialWR * 0.8 ? "var(--accent-gold)" : "#34d399";
  };

  // "Average retirement withdrawal rate" / "Out of money date" — Boldin-style
  // decision metrics, computed from this scenario's own rows (no separate model).
  const wrSeries = rows.map((_, i) => wrAt(i)).filter(v => v != null);
  const avgWithdrawalRate = wrSeries.length ? wrSeries.reduce((a, b) => a + b, 0) / wrSeries.length : 0;
  const depletionRow = rows.find(r => r.totalPort <= 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        <div className="met">
          <div className="ml">Smart Lifetime Tax</div>
          <div className="mv" style={{ color: "#34d399", fontSize: 16 }}>{fmtDollar(summary.lifetimeTaxSmart)}</div>
          <div className="ms">tax-optimal waterfall</div>
        </div>
        <div className="met">
          <div className="ml">Tax Savings vs No Plan</div>
          <div className="mv" style={{ color: summary.taxSavings > 0 ? "#34d399" : "#f87171", fontSize: 16 }}>
            {summary.taxSavings >= 0 ? "+" : ""}{fmtDollar(summary.taxSavings)}
          </div>
          <div className="ms">vs pretax-first ordering</div>
        </div>
        <div className="met">
          <div className="ml">Roth at Age {p.endAge || 90}</div>
          <div className="mv" style={{ color: "var(--accent-purple)", fontSize: 16 }}>{fmtDollar(summary.finalRothSmart)}</div>
          <div className="ms">smart · {fmtDollar(summary.finalRothNaive)} without plan</div>
        </div>
        <div className="met">
          <div className="ml">IRMAA Years Triggered</div>
          <div className="mv" style={{ color: summary.irmaaYearsTriggered > 0 ? "#fb923c" : "#34d399", fontSize: 16 }}>
            {summary.irmaaYearsTriggered}
          </div>
          <div className="ms">{summary.ssTorpedoYears} SS torpedo yrs</div>
        </div>
        <div className="met">
          <div className="ml">Avg. Withdrawal Rate</div>
          <div className="mv" style={{ color: avgWithdrawalRate > initialWR * 1.2 ? "#f87171" : "var(--accent-teal)", fontSize: 16 }}>
            {(avgWithdrawalRate * 100).toFixed(1)}%
          </div>
          <div className="ms">total withdrawal ÷ prior-year portfolio</div>
        </div>
        <div className="met">
          <div className="ml">Portfolio Depletion</div>
          <div className="mv" style={{ color: depletionRow ? "#f87171" : "#34d399", fontSize: 16 }}>
            {depletionRow ? `Age ${depletionRow.age}` : "Never"}
          </div>
          <div className="ms">{depletionRow ? `(${depletionRow.yr})` : `lasts to age ${p.endAge || 90}`}</div>
        </div>
      </div>

      {/* Toggle */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-faint)", marginRight: 4 }}>View:</span>
        <button style={btnStyle(mode === "smart")} onClick={() => setMode("smart")}>📋 Your plan</button>
        <button style={btnStyle(mode === "naive")} onClick={() => setMode("naive")}>No plan (pretax first, uncapped)</button>
        {mode === "naive" && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8 }}>
            The common default — pretax drains first, no bracket ceiling, Roth used last
          </span>
        )}
      </div>

      {/* Stacked bar chart */}
      <div className="chart-card">
        <div className="ct">Annual Withdrawals by Source — {mode === "smart" ? "Your plan" : "No plan"}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
          Stacks show where each year's spending comes from; Fed Tax / State Tax / IRMAA sit on top (match the table columns exactly)
          {anyConversion && mode === "smart" && <> · Roth Conversion (purple) is a pretax→Roth transfer, not spending — shown for visibility</>}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 9 }} />
            <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 9 }} tickFormatter={v => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
            <Tooltip content={<Tip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Cash"     stackId="a" fill="var(--text-muted)" />
            <Bar dataKey="Taxable"  stackId="a" fill="#3b82f6" />
            <Bar dataKey="Pre-Tax"  stackId="a" fill="#f59e0b" />
            <Bar dataKey="Roth"     stackId="a" fill="var(--positive)" />
            <Bar dataKey="Fed Tax"   stackId="a" fill="var(--negative)" />
            <Bar dataKey="State Tax" stackId="a" fill="#ec4899" />
            <Bar dataKey="IRMAA"     stackId="a" fill="#f43f5e" />
            <Bar dataKey="Roth Conversion" stackId="a" fill="var(--accent-purple)" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Year-by-year table */}
      <div className="chart-card" style={{ overflowX: "auto" }}>
        <div className="ct">Year-by-Year Withdrawal Schedule</div>
          LEGEND:
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
         ⚡ SS Torpedo &nbsp;|&nbsp; 💊 IRMAA triggered &nbsp;|&nbsp; 📋 RMDs active &nbsp;|&nbsp;
          Bracket cap reason shown in Pre-Tax column
          <br />
          Columns read left→right in draw order. Funding identity each year: <strong>Income + Cash + Taxable + Pre-Tax (incl. RMD)  + Roth = Spending + Housing + Carveouts + Planned one-off expenses + Fed/State/IRMAA taxes</strong> (Income = Social Security + Pension/Other + Annuity/Rental — All of it offsets spending before any draw) (Any RMD forced out beyond that need is reinvested into Taxable — hover the Pre-Tax cell for the split). Hover the Spending cell for that year's full need breakdown.
        </div>
        <table className="roth-tbl">
          <thead>
            <tr>
              <th>Age</th>
              <ThInfo tip={"Target spending this year.\n\nOpen any row's Spending cell for the full need breakdown — housing, carveouts, planned one-off costs, other income and taxes."}>Spending</ThInfo>
              <ThInfo style={opThStyle} tip={"Spending is funded by the income + draw columns to the right — see the funding identity above the table."}>←</ThInfo>
              {/* §28.2 tier 2: this is the aggregate whose components Gary could
                  not find, and its explanation was hover-only — i.e. absent on
                  every phone. Click-open modal, visible affordance. */}
              <th>
                Income{" "}
                <InfoModal title="Income — what this column contains" accent="var(--accent-teal)"
                  trigger={<span style={{ cursor: "pointer", display: "inline-flex", color: "var(--accent-teal)" }}><InfoIcon size={12} /></span>}>
                  <p style={{ margin: "0 0 10px" }}>
                    Money that arrives whether or not you sell anything. It is used <strong style={{ color: "#e2e8f0" }}>first</strong>,
                    before any portfolio draw — only the shortfall becomes a withdrawal.
                  </p>
                  <p style={{ margin: "0 0 6px", color: "#e2e8f0" }}><strong>This column is the sum of exactly three things:</strong></p>
                  <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
                    <li><strong style={{ color: "#c4b5fd" }}>Social Security</strong> — your benefit, once claiming starts</li>
                    <li><strong style={{ color: "#fde047" }}>Pension/Other</strong> — any stream you added under Other Income (pensions, annuities, part-time work, royalties)</li>
                    <li><strong style={{ color: "#93c5fd" }}>Annuity/Rental</strong> — property and Airbnb income, after the reliability haircut</li>
                  </ul>
                  <p style={{ margin: 0 }}>
                    Those three names are used identically on the Income &amp; Expenses chart and in the
                    Year-by-Year Schedule, where they appear as separate columns instead of one total.
                  </p>
                </InfoModal>
              </th>
              <th style={opThStyle}>+</th>
              <ThInfo tip={"Step 3 — drawn first from the portfolio"}>Cash</ThInfo>
              <th style={opThStyle}>+</th>
              <ThInfo tip={"Step 4 — drawn after cash is exhausted"}>Taxable</ThInfo>
              <th style={opThStyle}>+</th>
              <ThInfo tip={"Step 5 — TOTAL pretax outflow this year: forced RMD + discretionary draw (capped at your bracket-ceiling target). This is the amount to actually withdraw from your IRA/401k."}>Pre-Tax</ThInfo>
              <th style={opThStyle}>+</th>
              <ThInfo tip={"Step 6 — last resort; emergency reserve floor maintained"}>Roth</ThInfo>
              <th style={opThStyle}>=</th>
              <ThInfo tip={"Total leaving your portfolio this year: Cash + Taxable + Pre-Tax (incl. RMD) + Roth. The single number to enact — it covers spending, housing, carveouts, and all taxes."}>Total Draw</ThInfo>
              {anyConversion && (
                <ThInfo tip={"Roth conversion this year (pinned in Conversion Plan, or bracket-fill if set in Withdrawal Order). Stacks on top of this year's spending withdrawal as ordinary income — Fed/State/IRMAA columns reflect the combined total."}>Roth Conv</ThInfo>
              )}
              <ThInfo style={{ borderLeft: "1px solid rgba(148,163,184,0.15)" }} tip={"Bucket 1 ending balance this year"}>B1 End</ThInfo>
              <th>Fed Tax</th><th>State Tax</th><th>IRMAA</th><th>Eff %</th>
              <ThInfo tip={"What share of the portfolio this year's DRAW represents: Total Draw ÷ the portfolio at the START of the year.\n\nNot your spending rate. If income covers most of your spending, this stays low even when spending is high — which is the point of the column.\n\nGreen means within ±20% of your first-year rate, the Guyton-Klinger guardrail band. Amber = well below it, red = well above."}>WR <span style={{ fontSize: 9, color: "var(--text-muted)" }}>(of draw)</span></ThInfo>
              <th>
                <LandmineTip
                  emoji="💣"
                  label="Tax Landmines"
                  color="#f87171"
                  detail="Hidden tax traps that quietly increase your bill. ⚡ SS Torpedo — too much income makes 85% of Social Security taxable. 💊 IRMAA — income above ~$218,000 MFJ triggers Medicare premium surcharges. 📋 RMD — forced pretax distributions create mandatory taxable income you cannot defer. Hover each row icon for year-specific details."
                />
                {" "}Landmines
              </th>
              <th>Port End</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rowIdx) => {
              const b1End = b1Cats.has("cash")    ? r.cashEnd
                          : b1Cats.has("taxable") ? r.taxableEnd
                          : b1Cats.has("pretax")  ? r.pretaxEnd
                          : b1Cats.has("roth")    ? r.rothEnd
                          : 0;
              return (
              <tr key={r.age} style={{ background: anyLandmine(r) ? "rgba(239,68,68,0.07)" : undefined }}>
                <td>{r.age}</td>
                <td style={{ textAlign: "right" }}
                    title={`Spending ${fmtDollar(r.spending)}`
                      // §28.1 OPEN 3: the smile silently re-scales this cell. Say so.
                      + (r.smileFactor != null && Math.abs(r.smileFactor - 1) >= 0.005
                          ? ` (spending-curve ${r.smileFactor > 1 ? "+" : "−"}${Math.abs(Math.round((r.smileFactor - 1) * 1000) / 10)}% applied to your ${fmtDollar(r.smileBase)} target)`
                          : "")
                      + (r.housingCost > 0 ? ` + housing ${fmtDollar(r.housingCost)}` : "")
                      + (r.carveoutCost > 0 ? ` + carveouts ${fmtDollar(r.carveoutCost)}` : "")
                      // Planned one-off / periodic expenses. These ARE charged to the
                      // draw, and until now appeared in no column and no tooltip — so a
                      // $40k roof spiked the withdrawal with nothing on screen to explain
                      // it. Same defect that produced u/garylapointe's phantom age-72 jump.
                      + (r.eventCost > 0
                          ? ` + planned expense${(r.eventLabels || []).length > 1 ? "s" : ""} ${fmtDollar(r.eventCost)}`
                            + ((r.eventLabels || []).length ? ` (${r.eventLabels.join(", ")})` : "")
                          : "")
                      + ` + taxes ${fmtDollar(r.fedTax + r.stateTax + r.irmaa)}`
                      + (r.otherIncome > 0 ? ` − other income ${fmtDollar(r.otherIncome)}` : "")
                      + ` = total need funded by the income + draw columns to the right`
                      // Healthcare shock is deliberately absent: it is a probability-
                      // weighted risk priced by the Monte Carlo, never charged here (v1.2.55).
                      }>
                  {fmtDollar(r.spending)}
                  {r.eventCost > 0 && (
                    // Visible cue — hover-only disclosure is unreachable on touch.
                    <span style={{ color: "#fb7185", fontSize: 10, marginLeft: 3 }}
                          title={`Includes ${fmtDollar(r.eventCost)} of planned one-off spending`}>+📌</span>
                  )}
                  {/* Visible, not hover-only: this cell is NOT the number the user
                      typed — the spending curve has re-scaled it. Gary suspected
                      exactly this and had no way to see it (§28.1 OPEN 3). */}
                  {r.smileFactor != null && Math.abs(r.smileFactor - 1) >= 0.005 && (
                    <span style={{ color: "var(--accent-purple)", fontSize: 10, marginLeft: 3, fontFamily: "'JetBrains Mono',monospace" }}
                          title={`Spending curve: your ${fmtDollar(r.smileBase)} target × ${r.smileFactor.toFixed(3)} for age ${r.age}. Turn it off with "Smile spending" in the sidebar Options.`}>
                      {r.smileFactor > 1 ? "+" : "−"}{Math.abs(Math.round((r.smileFactor - 1) * 1000) / 10)}%
                    </span>
                  )}
                </td>
                <td style={opTdStyle}>←</td>
                <td style={{ textAlign: "right", color: "var(--accent-teal)" }}
                    title={(() => {
                      // Reported by u/garylapointe: the components shown did not add up
                      // to the total. The engine was right — otherIncome (pensions,
                      // annuities, any user-defined stream) is netted from need at
                      // buildWithdrawalWaterfall ~702 — but this column rendered only
                      // `fixedIncomeTotal` (= SS + annuity/rental), so a pension simply
                      // never appeared. A retiree with a $44k pension saw a shortfall
                      // that did not exist.
                      //
                      // Fixed in the DISPLAY only. The engine field is deliberately
                      // untouched: withdrawal.test.js asserts the funding identity as
                      // `fixedIncomeTotal + otherIncome + rmd + ...`, so folding the
                      // pension into the engine's value would double-count it and break
                      // a real invariant.
                      const parts = [`Social Security ${fmtDollar(r.ss)}`];
                      if (r.annuityRental > 0) parts.push(`Annuity/Rental ${fmtDollar(r.annuityRental)}`);
                      if (r.otherIncome > 0)   parts.push(`Pension/Other ${fmtDollar(r.otherIncome)}`);
                      const total = (r.fixedIncomeTotal || 0) + (r.otherIncome || 0);
                      let t = parts.length > 1
                        ? `${parts.join(" + ")} = ${fmtDollar(total)}\n\nCovered first, before any portfolio draw.`
                        : `Social Security: ${fmtDollar(r.ss)}`;
                      // One-off money ARRIVING (inheritance, home sale, pension lump sum).
                      // It is DEPOSITED into an account bucket rather than netted against
                      // spending, so it never showed in this column — the balance simply
                      // jumped with nothing on screen accounting for it.
                      if (r.eventInflow > 0) {
                        t += `\n\nPLUS ${fmtDollar(r.eventInflow)} arriving this year`
                          + ((r.eventLabels || []).length ? ` (${r.eventLabels.join(", ")})` : "")
                          + ` — deposited into your accounts, not spent. It raises the balances`
                          + ` on the right rather than reducing this year's draw.`;
                      }
                      return t;
                    })()}>
                  {((r.fixedIncomeTotal || 0) + (r.otherIncome || 0)) > 0
                    ? fmtDollar((r.fixedIncomeTotal || 0) + (r.otherIncome || 0))
                    : "—"}
                  {/* The AMOUNT renders on screen, not only in the tooltip. This
                      was a bare "+💰" next to a "—", so a year in which six figures
                      arrived read as a year with no money in it, and the balance on
                      the right jumped with nothing on the row accounting for it.
                      A user reported exactly that: "the money isn't being calculated
                      here." It was — it is deposited into a bucket and its tax is
                      charged — but nothing said so without a hover, and `title=` is
                      dead on touch. Rendered as a separate annotation rather than
                      folded into the income figure because it is NOT income offsetting
                      this year's spend: it is a deposit, and the funding identity in
                      the header must keep reading true. */}
                  {r.eventInflow > 0 && (
                    <span style={{ color: "#34d399", fontSize: 10, marginLeft: 3, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}
                          title={`${fmtDollar(r.eventInflow)} one-off money arriving${(r.eventLabels || []).length ? ` (${r.eventLabels.join(", ")})` : ""} — deposited into your accounts, not spent. It raises the balances on the right rather than reducing this year's draw.`}>
                      💰+{fmtDollar(r.eventInflow)}
                    </span>
                  )}
                </td>
                <td style={opTdStyle}>+</td>
                <td style={{ textAlign: "right", color: "var(--text-muted)" }} title={fmtDollar(r.fromCash)}>{r.fromCash > 0 ? fmtDollar(r.fromCash) : "—"}</td>
                <td style={opTdStyle}>+</td>
                <td style={{ textAlign: "right", color: "#3b82f6" }} title={fmtDollar(r.fromTaxable)}>{r.fromTaxable > 0 ? fmtDollar(r.fromTaxable) : "—"}</td>
                <td style={opTdStyle}>+</td>
                <td style={{ textAlign: "right", color: "#f59e0b" }}
                    title={(() => {
                      // The displayed figure is the TOTAL pretax outflow the user must
                      // actually withdraw: forced RMD + discretionary bracket-capped draw.
                      // (The engine tracks them separately; showing only the discretionary
                      // part used to display "—" in RMD-funded years while six figures
                      // were actually leaving the IRA.)
                      const totalPretaxOut = r.fromPretax + r.rmd;
                      // Read the ENGINE's figure — it is the number that actually moved
                      // money into the taxable bucket. This used to be re-derived here as
                      // `rmd - (needFromPort + irmaaFull)`, which matched in ordinary
                      // years but double-subtracted the conversion tax in Roth conversion
                      // years (irmaaFull is with-conversion; the engine's offset is not),
                      // understating the reinvested surplus by up to five figures.
                      const rmdExcess = r.rmdSurplus || 0;
                      let t = `${fmtDollar(totalPretaxOut)} total from pretax`;
                      if (r.rmd > 0) t += ` = forced RMD ${fmtDollar(r.rmd)} + discretionary ${fmtDollar(r.fromPretax)}`;
                      t += ` — ${r.pretaxCapReason}`;
                      if (rmdExcess > 0) t += `. ${fmtDollar(rmdExcess)} of the RMD exceeds this year's need and is reinvested into Taxable.`;
                      return t;
                    })()}>
                  {r.rmd > 0 && <span style={{ fontSize: 9, color: "var(--accent-purple)", marginRight: 2 }}>RMD {fmtDollar(r.rmd)}</span>}
                  {(r.fromPretax + r.rmd) > 0 ? fmtDollar(r.fromPretax + r.rmd) : "—"}
                </td>
                <td style={opTdStyle}>+</td>
                <td style={{ textAlign: "right", color: "var(--positive)" }} title={fmtDollar(r.fromRoth)}>{r.fromRoth > 0 ? fmtDollar(r.fromRoth) : "—"}</td>
                <td style={opTdStyle}>=</td>
                <td style={{ textAlign: "right", color: "#e2e8f0", fontWeight: 600 }}
                    title={`${fmtDollar(r.totalWithdrawal)} leaves the portfolio this year (Cash ${fmtDollar(r.fromCash)} + Taxable ${fmtDollar(r.fromTaxable)} + Pre-Tax ${fmtDollar(r.fromPretax + r.rmd)} + Roth ${fmtDollar(r.fromRoth)}) — covers spending, housing, carveouts, and all taxes`}>
                  {r.totalWithdrawal > 0 ? fmtDollar(r.totalWithdrawal) : "—"}
                </td>
                {anyConversion && (
                  <td style={{ textAlign: "right", color: "var(--accent-purple)" }}
                      title={(() => {
                        if (!(r.conversionAmount > 0)) return "No conversion this year";
                        let t = `Converted ${fmtDollar(r.conversionAmount)} pretax → Roth`
                          + ` — adds ~${fmtDollar(r.conversionTax)} to this year's tax (included in Fed/State).`;
                        // WHERE THE CONVERSION TAX CAME FROM. The engine already routes it
                        // (taxable → cash → pretax, or withheld from the transfer) and
                        // records each source; none of it was ever displayed, so the user
                        // could not see which account actually paid — or whether that was
                        // the right account.
                        const src = [];
                        if (r.convTaxFromTaxable > 0) src.push(`Taxable ${fmtDollar(r.convTaxFromTaxable)}`);
                        if (r.convTaxFromCash > 0)    src.push(`Cash ${fmtDollar(r.convTaxFromCash)}`);
                        if (r.convTaxFromPretax > 0)  src.push(`Pre-Tax ${fmtDollar(r.convTaxFromPretax)}`);
                        if (src.length) t += `\n\nTax paid from: ${src.join(" + ")}.`;
                        // Withholding out of the transfer means less money lands in the Roth.
                        if (r.convToRoth > 0 && r.convToRoth < r.conversionAmount) {
                          t += `\n\nOnly ${fmtDollar(r.convToRoth)} actually reaches the Roth —`
                            + ` the tax was withheld from the transfer. Paying it from Taxable or Cash`
                            + ` instead would move the full ${fmtDollar(r.conversionAmount)} across.`;
                        } else if (r.convToRoth > 0) {
                          t += `\nFull ${fmtDollar(r.convToRoth)} reaches the Roth.`;
                        }
                        if (r.convTaxFromPretax > 0 && r.convToRoth >= r.conversionAmount) {
                          t += `\n\n⚠ Part of the tax came from Pre-Tax — that draw is itself`
                            + ` ordinary income. Taxable or Cash is the cheaper source.`;
                        }
                        // THE RECONCILIATION. A user compared this row's gross
                        // ordinary income against the 2026 nominal bracket top and
                        // concluded the plan had overshot into the next bracket. It
                        // had not: the deduction comes off first, and the ceiling is
                        // indexed forward to the row's own year. Both numbers were
                        // computed by the engine and neither was ever shown, so the
                        // only check the user could perform was one that had to fail.
                        if (r.bracketTopYr != null) {
                          const pct = Math.round((r.marginalBracket || 0) * 100);
                          t += `\n\nWhy this is still inside the ${pct}% bracket, in ${r.yr} dollars:`
                            + `\n  Ordinary income      ${fmtDollar(r.totInc)}`
                            + `\n  − Deductions         ${fmtDollar(r.stdDedYr)}`
                            + `\n  = Taxable income     ${fmtDollar(r.taxableIncome)}`
                            + `\n  ${pct}% bracket top      ${fmtDollar(r.bracketTopYr)}`
                            + `\n\nBracket tops are inflation-indexed, so the ${r.yr} ceiling is`
                            + ` higher than today's published figure. Compare TAXABLE income`
                            + ` (after deductions) against it — not the gross draw.`;
                          if (r.convCapReason === "irmaa_ceil") {
                            t += `\n\nThis year the IRMAA tier bound before the bracket did —`
                              + ` the ceiling shown is the IRMAA cap, which is lower.`;
                          }
                        }
                        return t;
                      })()}>
                    {r.conversionAmount > 0 ? fmtDollar(r.conversionAmount) : "—"}
                    {r.conversionAmount > 0 && r.convToRoth > 0 && r.convToRoth < r.conversionAmount && (
                      <span style={{ color: "var(--accent-gold)", fontSize: 9, marginLeft: 2 }}
                            title={`Only ${fmtDollar(r.convToRoth)} of the ${fmtDollar(r.conversionAmount)} reaches the Roth — tax withheld from the transfer`}>◑</span>
                    )}
                    {/* The ceiling the conversion was sized to, in THIS row's dollars.
                        On screen, not just in the tooltip above: the whole failure was
                        a user reaching for a number the UI never gave them, and a
                        tooltip is dead on touch. This is the figure their own
                        arithmetic needs. */}
                    {r.conversionAmount > 0 && r.bracketTopYr != null && (
                      <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap", marginTop: 1 }}>
                        {r.convCapReason === "irmaa_ceil"
                          ? `IRMAA cap ${fmtDollar(r.bracketTopYr)}`
                          : `${Math.round((r.marginalBracket || 0) * 100)}% top ${fmtDollar(r.bracketTopYr)}`}
                      </div>
                    )}
                  </td>
                )}
                <td style={{ textAlign: "right", color: b1End < (p.bucket1Floor || 0) && (p.bucket1Floor || 0) > 0 ? "#f87171" : "var(--text-faint)", fontSize: 11, borderLeft: "1px solid rgba(148,163,184,0.15)" }} title={fmtDollar(b1End)}>{b1End > 0 ? fmtDollar(b1End) : "—"}</td>
                <td style={{ textAlign: "right", color: "#f87171" }}
                    title={(() => {
                      // "Fed Tax" is a SUM of three separately-computed pieces, and the
                      // engine returns all three — they were simply never rendered.
                      // fedTax = ordinary + ltcgTax + niit (buildWithdrawalWaterfall ~464).
                      const ltcg = r.ltcgTax || 0, niit = r.niit || 0;
                      const ordinary = Math.max(0, (r.fedTax || 0) - ltcg - niit);
                      const parts = [`ordinary income ${fmtDollar(ordinary)}`];
                      if (ltcg > 0) parts.push(`long-term capital gains ${fmtDollar(ltcg)}`);
                      if (niit > 0) parts.push(`net investment income tax ${fmtDollar(niit)}`);
                      let t = `${fmtDollar(r.fedTax)} federal = ${parts.join(" + ")}`;
                      if (r.realizedGain > 0) t += `\n\nRealized gain on the taxable draw: ${fmtDollar(r.realizedGain)}.`;
                      if (r.earlyPenalty > 0) t += `\n\n⛔ PLUS ${fmtDollar(r.earlyPenalty)} early-withdrawal penalty (IRC 72(t), 10%) — a SEPARATE additional tax, NOT included in the federal figure above.`;
                      if (r.taxSS > 0) t += `\n${fmtDollar(r.taxSS)} of your Social Security is taxable this year`
                        + (r.ss > 0 ? ` (${Math.round(r.taxSS / r.ss * 100)}% of ${fmtDollar(r.ss)}).` : ".");
                      return t;
                    })()}>
                  {fmtDollar(r.fedTax)}
                  {(r.ltcgTax > 0 || r.niit > 0) && (
                    <span style={{ color: "#fca5a5", fontSize: 9, marginLeft: 2 }}
                          title="Includes capital-gains tax and/or net investment income tax — not just ordinary income">*</span>
                  )}
                </td>
                <td style={{ textAlign: "right", color: r.stateTax > 0 ? "#fb923c" : "var(--text-faint)" }} title={fmtDollar(r.stateTax)}>
                  {r.stateTax > 0 ? fmtDollar(r.stateTax) : "—"}
                </td>
                <td style={{ textAlign: "right", color: r.irmaa > 0 ? "#fb923c" : "var(--text-faint)" }} title={fmtDollar(r.irmaa)}>
                  {r.irmaa > 0 ? fmtDollar(r.irmaa) : "—"}
                </td>
                <td style={{ textAlign: "right" }}>{(r.effectiveRate * 100).toFixed(1)}%</td>
                <td style={{ textAlign: "right", color: rowWRColor(rowIdx), fontWeight: 600, fontSize: 11 }}
                    title={(() => {
                      const wr = wrAt(rowIdx);
                      if (wr == null) return "No portfolio at the start of this year.";
                      const startPort = rowIdx === 0 ? portAtRetire : rows[rowIdx - 1].totalPort;
                      return `${fmtDollar(r.totalWithdrawal)} drawn ÷ ${fmtDollar(startPort)} portfolio at the START of the year = ${(wr * 100).toFixed(1)}%.

This is the DRAW, not your spending — income covers the rest. Guardrail band is ±20% around your first-year rate of ${(initialWR * 100).toFixed(1)}%.`;
                    })()}>
                  {(() => { const wr = wrAt(rowIdx); return wr == null ? "—" : (wr * 100).toFixed(1) + "%"; })()}
                </td>
                <td style={{ textAlign: "center", fontSize: 14 }}>
                  {r.landmines.ssTorpedo && (() => {
                    const provisional = Math.round((r.ss || 0) * 0.5 + (r.rmd || 0) + (r.fromPretax || 0) + (r.annuityRental || 0));
                    const thresh = (p?.filingStatus || "mfj") !== "single" ? 44_000 : 34_000;
                    return (
                      <LandmineTip
                        emoji="⚡"
                        label="SS Torpedo"
                        color="var(--accent-gold)"
                        detail={`85% of your Social Security (${fmtDollar(r.ss)}/yr) is taxable because provisional income $${provisional.toLocaleString()} exceeds the $${thresh.toLocaleString()} threshold. Provisional = SS×50% + RMD + pretax draws + annuity. Consider drawing from Roth instead to keep provisional income below the threshold.`}
                      />
                    );
                  })()}
                  {r.landmines.irmaaTriggered && (() => {
                    return (
                      <LandmineTip
                        emoji="💊"
                        label="IRMAA Surcharge"
                        color="#fb923c"
                        detail={`This year's ${fmtDollar(r.irmaa)} surcharge is based on your ${r.yr - 2} income (IRMAA uses a 2-year lookback — the current Tier-1 threshold ~$218,000 MFJ was checked against that year's MAGI, not this year's). Income this year affects premiums in ${r.yr + 2}. Enable IRMAA Guard in Profile → Withdrawal Order to cap pretax draws before this threshold.`}
                      />
                    );
                  })()}
                  {r.earlyPenalty > 0 && (
                    <LandmineTip
                      emoji="⛔"
                      label="Early Withdrawal Penalty"
                      color="#f87171"
                      detail={`IRC 72(t): at age ${r.age} you are under 59.5, so the ${fmtDollar(r.fromPretax + r.rmd)} taken from pre-tax owes a 10% additional tax of ${fmtDollar(r.earlyPenalty)} ON TOP of income tax. Reason: ${r.earlyPenaltyReason}.${r.earlyPenaltyExempt > 0 ? ` ${fmtDollar(r.earlyPenaltyExempt)} was exempt.` : ""}\n\nWays out: fund spending from taxable / cash / Roth basis until 59.5; keep a former-employer 401k UNROLLED and use the Rule of 55; or start a 72(t) SEPP, which must then run to the LATER of 5 years or age 59.5.`}
                    />
                  )}
                  {r.landmines.rmdActive && (() => {
                    return (
                      <LandmineTip
                        emoji="📋"
                        label="RMDs Active"
                        color="var(--accent-purple)"
                        detail={`Required Minimum Distribution: ${fmtDollar(r.rmd)}/yr — forced withdrawal from your pretax account (IRS Pub 590-B). This is ordinary income you cannot defer or avoid. Roth conversions before RMD age reduce the pretax balance and shrink future RMDs.`}
                      />
                    );
                  })()}
                  {!anyLandmine(r) && <span style={{ color: "#34d399", fontSize: 10 }}>✓</span>}
                </td>
                <td style={{ textAlign: "right", color: "var(--text-secondary)" }} title={fmtDollar(r.totalPort)}>{fmtDollar(r.totalPort)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeterministicWithdrawalView({ p, inf, withdrawalStrategy }) {
  const [showTable, setShowTable] = useState(true);
  const data = useMemo(
    () => simulateDeterministicWithStrategy(p, inf, withdrawalStrategy),
    [p, inf, withdrawalStrategy]
  );
  const { schedule, portAtRetire, initWR } = data;
  const chartData = schedule.map((s) => ({
    age: s.age,
    "Total Withdrawal": s.totalWithdrawal,
    "Portfolio End": s.portfolioEnd,
    Spending: s.spending,
  }));

  if (!schedule || schedule.length === 0) {
    return <div className="chart-card">No data available. Run Monte Carlo first.</div>;
  }

  // One label map for the whole app (getStrategyLabel). A second copy here is
  // how the chart title once disagreed with the picker beside it.
  const strategyLabel = getStrategyLabel(resolveStrategy(withdrawalStrategy));

  return (
    <>
      <div className="chart-card">
        <div className="ct">
          📈 Deterministic Schedule – {strategyLabel} · Median historical returns
          ({expectedReturn(p.preRetireEq ?? 91).toFixed(2)}% before age {resolveGlidepathSwitchAge(p)} / {expectedReturn(p.postRetireEq ?? 70).toFixed(2)}% after) · Inflation {inf}%
        </div>
        {/* Portfolio Balance is a genuine running total — a line, one $ axis. */}
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 10 }} />
            <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 10 }} tickFormatter={(v) => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
            <Tooltip content={<Tip />} />
            <Line type="monotone" dataKey="Portfolio End" stroke="var(--accent-teal)" strokeWidth={2.5} dot={false} name="Portfolio Balance" />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="leg">
          <div className="li"><div className="ll" style={{ background: "var(--accent-teal)" }} />Portfolio Balance</div>
        </div>

        {/* Spending/Withdrawal are each year's OWN number, not a flow between
            years — bars, not lines, sharing the same age x-axis as the chart
            above instead of a fabricated second $ scale on one plot. */}
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: 10 }} />
            <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-muted)", fontSize: 9 }} tickFormatter={(v) => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
            <Tooltip content={<Tip />} />
            <Bar dataKey="Spending" fill="var(--accent-gold)" name="Spending" />
            <Bar dataKey="Total Withdrawal" fill="#f87171" name="Total Withdrawal (inc. tax)" />
          </BarChart>
        </ResponsiveContainer>
        <div className="leg">
          <div className="li"><div className="ll" style={{ background: "var(--accent-gold)" }} />Spending</div>
          <div className="li"><div className="ll" style={{ background: "#f87171" }} />Total Withdrawal (inc. tax)</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {/* §28 D1 — PROVENANCE FIX. This said "Median accumulation", which claims
            the figure is the 50th percentile of the Monte Carlo distribution. It
            is not: `simulateDeterministicWithStrategy` gets it from
            `accumulateToRetirement(p)`, a single deterministic compound-growth
            projection at the expected return (App.jsx ~1818). No distribution is
            involved and there is no median to take. Same defect class as the
            "safe spend" and "GK guardrails" labels: the caption asserted an
            authority the number never got. The whole view is deterministic, so
            the caption now says that. */}
        <div className="met"><div className="ml">Portfolio at Retirement</div><div className="mv" style={{ color: "var(--accent-teal)" }}>{fmtDollar(portAtRetire)}</div><div className="ms">Single projection at the expected return — not a median</div></div>
        <div className="met"><div className="ml">Initial Withdrawal Rate</div><div className="mv" style={{ color: "var(--accent-gold)" }}>{(initWR * 100).toFixed(1)}%</div><div className="ms">Net portfolio draw / portfolio</div></div>
        <div className="met"><div className="ml">Final Portfolio (Age {schedule[schedule.length - 1]?.age})</div><div className="mv" style={{ color: schedule[schedule.length - 1]?.portfolioEnd > 0 ? "#34d399" : "var(--negative)" }}>{fmtDollar(schedule[schedule.length - 1]?.portfolioEnd || 0)}</div><div className="ms">{schedule[schedule.length - 1]?.portfolioEnd > 0 ? "Survives" : "Exhausted"}</div></div>
      </div>

      <div className="chart-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="ct">📋 Year‑by‑Year Schedule</div>
          <button onClick={() => setShowTable(!showTable)} className="mbtn" style={{ fontSize: 12, padding: "3px 8px" }}>{showTable ? "Hide Table" : "Show Table"}</button>
        </div>
        {showTable && (
          <div style={{ overflowX: "auto" }}>
            <table className="nw-table" style={{ fontSize: 12 }}>
              {/* §28.1 OPEN 2: these three were "SS" / "Rental" / "Other Inc"
                  here and three other things elsewhere. Canonical names only —
                  see INCOME_CATS. Together they are the "Income" aggregate the
                  Withdrawal Plan table shows as one column. */}
              <thead><tr><th>Age</th><th>Year</th><th>Spending</th><th>Social Security</th><th>Annuity/Rental</th><th>Pension/Other</th><th>Housing</th><th>Carveouts</th><th>Portfolio Draw</th><th>Roth Conv.</th><th>Fed Tax</th><th>State Tax</th><th>IRMAA</th><th>Total Withdrawal</th><th>Portfolio End</th></tr></thead>
              <tbody>
                {schedule.map((s) => (
                  <tr key={s.age}>
                    <td style={{ textAlign: "left" }}>{s.age}</td><td>{s.yr}</td>
                    <td style={{ color: "var(--accent-gold)",fontSize: 16, fontWeight: 'bold'  }}>{fmtDollar(s.spending)}</td>
                    <td>{fmtDollar(s.ss)}</td><td>{fmtDollar(s.Rental)}</td><td style={{ color: "#eab308" }}>{fmtDollar(s.OtherIncome)}</td>
                    <td style={{ color: "#fb7185" }}>{fmtDollar(s.housingCost || 0)}</td>
                    <td style={{ color: "#fb7185" }}>{fmtDollar(s.carveoutCost || 0)}</td>
                    <td>{fmtDollar(s.portfolioDraw)}</td>
                    <td style={{ color: "var(--accent-teal)" }}
                        title={s.bracketTopYr != null && s.conversionAmount > 0
                          ? `Sized to fill the bracket, in ${s.yr} dollars:\n`
                            + `  Ordinary income   ${fmtDollar(s.totInc)}\n`
                            + `  − Deductions      ${fmtDollar(s.stdDedYr)}\n`
                            + `  = Taxable income  ${fmtDollar(s.taxableIncome)}\n`
                            + `  Ceiling           ${fmtDollar(s.bracketTopYr)}\n\n`
                            + `Bracket tops are inflation-indexed, so the ${s.yr} ceiling is higher `
                            + `than today's published figure. Compare TAXABLE income against it, `
                            + `not the gross draw.`
                          : undefined}>
                      {fmtDollar(s.conversionAmount || 0)}
                      {s.conversionAmount > 0 && s.bracketTopYr != null && (
                        <div style={{ fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {s.convCapReason === "irmaa_ceil"
                            ? `IRMAA cap ${fmtDollar(s.bracketTopYr)}`
                            : `${Math.round((s.marginalBracket || 0) * 100)}% top ${fmtDollar(s.bracketTopYr)}`}
                        </div>
                      )}
                    </td>
                    <td style={{ color: "#f87171" }}>{fmtDollar(s.fedTax)}</td>
                    <td style={{ color: "#fb923c" }}>{fmtDollar(s.stateTax)}</td>
                    <td style={{ color: "var(--accent-purple)" }}>{fmtDollar(s.irmaa)}</td>
                    <td style={{ color: "#8fcfa8",fontSize: 16, fontWeight: 'bold' }}>{fmtDollar(s.totalWithdrawal)}</td>
                    <td style={{ color: "var(--accent-teal)", fontWeight: 600 }}>{fmtDollar(s.portfolioEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flag-i" style={{ fontSize: 12 }}>
        ℹ️ Deterministic (median) path – shows how the {strategyLabel} strategy would behave in a single "typical" sequence of returns. Actual outcomes will vary.
      </div>
    </>
  );
}

const _BCFG_KEY = "aira_buckets_cfg.v1";
function _loadBCfg() {
  try { return JSON.parse(localStorage.getItem(_BCFG_KEY) || "null") || {}; } catch { return {}; }
}

// ── Bucket status card — hoisted to module scope so React doesn't unmount it on
// every BucketsTab re-render (which would kill the tooltip hover state). ─────
function BucketCard({ num, color, label, horizon, actual, floor, target, accounts: acctList, role, holdings, monthly }) {
  const [showInfo, setShowInfo] = useState(false);
  const hideTimer = useRef(null);
  const openTip = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setShowInfo(true);
  };
  const closeTipSoon = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowInfo(false), 180);
  };
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const barPct = target > 0 ? Math.min(100, actual / target * 100) : 0;
  const status = actual < floor ? "below" : actual < target ? "ok" : "full";
  const barClr = status === "below" ? "#f87171" : status === "full" ? "#34d399" : color;
  const runway = monthly > 0 && num === 1 ? (actual / monthly).toFixed(1) : null;
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${withAlpha(color, "33")}`, borderLeft: `3px solid ${color}`, borderRadius: 9, padding: 14, flex: 1, position: "relative" }}>
      {(role || holdings) && (
        <div
          onMouseEnter={openTip}
          onMouseLeave={closeTipSoon}
          style={{ position: "absolute", top: 0, right: 0, paddingTop: 6, paddingRight: 6, paddingLeft: 10, paddingBottom: showInfo ? 8 : 4, cursor: "help" }}
          aria-label="Bucket role and recommended holdings"
        >
          <span style={{ color: showInfo ? color : "var(--text-secondary)", userSelect: "none", transition: "color 0.15s", display: "inline-flex" }}><InfoIcon size={13} /></span>
          {showInfo && (
            <div
              onMouseEnter={openTip}
              onMouseLeave={closeTipSoon}
              style={{ position: "absolute", top: "100%", right: 0, background: "rgba(15,23,42,0.98)", border: `1px solid ${withAlpha(color, "66")}`, borderRadius: 6, padding: 10, fontSize: 11, color: "#cbd5e1", zIndex: 20, width: 240, lineHeight: 1.5, boxShadow: "0 6px 16px rgba(0,0,0,0.5)", cursor: "default" }}
            >
              {role && (
                <>
                  <div style={{ color, fontWeight: 600, marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Role</div>
                  <div style={{ marginBottom: holdings ? 8 : 0 }}>{role}</div>
                </>
              )}
              {holdings && (
                <>
                  <div style={{ color, fontWeight: 600, marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Recommended holdings</div>
                  <div>{holdings}</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color }}>{label}</div>
          <div style={{ fontSize: 9, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{horizon}</div>
        </div>
        <div style={{ textAlign: "right", paddingRight: role || holdings ? 16 : 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: barClr, fontFamily: "'JetBrains Mono',monospace" }}>{actual > 0 ? fmtDollar(actual) : "—"}</div>
          {runway && <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{runway} mo runway</div>}
        </div>
      </div>
      {(floor > 0 || target > 0) && (
        <>
          <div style={{ height: 6, background: "var(--card-border)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ height: "100%", width: `${barPct}%`, background: barClr, borderRadius: 3, transition: "width 0.4s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-faint)" }}>
            <span>Floor {fmtDollar(floor)}</span>
            <span>Target {fmtDollar(target)}</span>
          </div>
        </>
      )}
      {acctList.length > 0 && (
        <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
          {acctList.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>
              <span>{a.name}</span>
              <span style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(a.balance || 0)}</span>
            </div>
          ))}
        </div>
      )}
      {acctList.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: "#334155", fontStyle: "italic" }}>No accounts assigned — use B{num} chips in Profile → Savings</div>
      )}
    </div>
  );
}

function BucketsTab({ params = {} }) {
  const [bCfg, setBCfg] = useState(_loadBCfg);
  const saveBCfg = (patch) => {
    const next = { ..._loadBCfg(), ...patch };
    try { localStorage.setItem(_BCFG_KEY, JSON.stringify(next)); } catch {}
    setBCfg(next);
  };
  const b1Years  = bCfg.b1Years ?? 3;       // user-adjustable, default 3yr
  const b2Years  = bCfg.b2Years ?? 5;       // user-adjustable, default 5yr
  const drawMode = bCfg.drawMode ?? "net";  // 'net' (default) or 'gross'

  // ── Core params ───────────────────────────────────────────────────────────
  const sp         = params.sp        || 0;
  const port       = params.port      || 0;
  const retireAge  = params.retireAge || 60;
  const currentAge = params.currentAge|| 50;
  const ssAge      = params.ssAge     || 67;
  const gkFloor    = params.gkFloor   || 0;
  const yrsToRetire = Math.max(0, retireAge - currentAge);
  const retireYear  = new Date().getFullYear() + yrsToRetire;

  // ── Net draw: gross spend + mortgage P&I − rental/property income ─────────
  const mortAnnualPI = (() => {
    if (!params.mortBalance || params.mortBalance <= 0) return 0;
    const ms = mortgageSchedule(params.mortBalance, params.mortRate || 6.5, params.mortStart || "2020-01", params.mortTerm || 30, params.mortExtra || 0);
    return ms.pmt * 12;
  })();
  const propIncome  = params.propIncome || 0;
  const netDraw     = Math.max(0, sp + mortAnnualPI - propIncome);
  const spendBasis  = drawMode === "gross" ? sp : netDraw;   // what bucket targets sit on
  const monthly     = spendBasis > 0 ? Math.round(spendBasis / 12) : 0;

  // ── Actual balances from designated accounts ──────────────────────────────
  // Expand split accounts into per-bucket pieces so a single account can feed
  // more than one bucket (each piece carries its allocated slice of the balance).
  const accts  = expandAccountBuckets(params.accounts);
  const b1Accts = accts.filter(a => a.bucket === 1);
  const b2Accts = accts.filter(a => a.bucket === 2);
  const b3Accts = accts.filter(a => a.bucket === 3);
  const b1Actual = b1Accts.reduce((s, a) => s + (a.balance || 0), 0);
  const b2Actual = b2Accts.reduce((s, a) => s + (a.balance || 0), 0);
  const b3Actual = b3Accts.reduce((s, a) => s + (a.balance || 0), 0);
  const hasAccounts = (b1Actual + b2Actual + b3Actual) > 0;

  // ── Thresholds ────────────────────────────────────────────────────────────
  // Thresholds driven by user-configured year targets (b1Years, b2Years) and
  // the active spend basis (net draw by default; gross spend if user opts in).
  const b1Floor    = spendBasis;                                       // 1yr — always the replenish trigger
  const b1Target   = spendBasis * b1Years;                             // user-set (default 3yr)
  const ssGapYears = Math.max(b2Years, ssAge - retireAge);             // at least b2Years bridge
  const b2Floor    = spendBasis * b2Years;
  const b2Target   = Math.max(b2Floor, Math.round(ssGapYears * spendBasis));

  // ── Simulation row for tax guidance ──────────────────────────────────────
  const simRow = useMemo(() => {
    if (!sp || !port) return null;
    try { return buildWithdrawalWaterfall(params)?.smart?.rows?.[0] ?? null; }
    catch { return null; }
  }, [params]);
  const marginalRate = simRow?.marginalBracket ?? 12;
  const irmaaRisk    = simRow?.landmines?.irmaaTriggered ?? false;

  // ── Directive logic ───────────────────────────────────────────────────────
  const directive = useMemo(() => {
    if (!hasAccounts || !sp) return { type: "setup" };

    const b2Taxable = b2Accts.filter(a => a.category === "taxable");
    const b2Pretax  = b2Accts.filter(a => a.category === "pretax");
    const b3All     = b3Accts;

    // Dynamic label: single account → its name; multiple → comma list
    const acctLabel = (pool, fallback) =>
      pool.length === 1 ? pool[0].name
      : pool.length > 1 ? pool.map(a => a.name).join(" + ")
      : fallback;

    function buildSteps(needed, taxablePool, pretaxPool, rothPool) {
      const steps = [];
      let rem = needed;
      const taxAvail = taxablePool.reduce((s, a) => s + (a.balance || 0), 0);
      if (taxAvail > 0 && rem > 0) {
        const amt = Math.min(rem, taxAvail);
        steps.push({ label: `Sell from ${acctLabel(taxablePool, "taxable accounts")} (B2)`, accounts: taxablePool, amount: amt, tax: "0% LTCG estimated", note: "Lowest-tax source — use first" });
        rem -= amt;
      }
      const preAvail = pretaxPool.reduce((s, a) => s + (a.balance || 0), 0);
      if (preAvail > 0 && rem > 0) {
        const amt = Math.min(rem, preAvail);
        const taxCost = Math.round(amt * marginalRate / 100);
        steps.push({ label: `Withdraw from ${acctLabel(pretaxPool, "pre-tax accounts")} (B2)`, accounts: pretaxPool, amount: amt, tax: `${marginalRate}% ordinary income (~${fmtDollar(taxCost)} tax)`, note: irmaaRisk ? "⚠ Monitor MAGI — IRMAA risk" : `Stays within ${marginalRate}% bracket` });
        rem -= amt;
      }
      if (rem > 0 && rothPool.length > 0) {
        const rothAvail = rothPool.reduce((s, a) => s + (a.balance || 0), 0);
        const amt = Math.min(rem, rothAvail);
        steps.push({ label: `⚠ Emergency — draw from ${acctLabel(rothPool, "Roth accounts")} (B3)`, accounts: rothPool, amount: amt, tax: "Tax-free", note: "Last resort — Roth grows tax-free, avoid if possible" });
      }
      return steps;
    }

    if (b1Actual < b1Floor) {
      const needed = b1Target - b1Actual;
      const b1Empty  = b1Accts.length === 0;
      const title    = b1Empty
        ? `Bucket 1 is empty — create a cash account and fund it with ${fmtDollar(needed)}`
        : `Bucket 1 has ${fmtDollar(b1Actual)} — below ${fmtDollar(b1Floor)} floor, replenish now`;
      return { type: "critical", title, needed, b1Actual, b1Empty, steps: buildSteps(needed, b2Taxable, b2Pretax, b3All) };
    }
    if (b1Actual < b1Target) {
      const needed = b1Target - b1Actual;
      return { type: "warning", title: `Bucket 1 has ${fmtDollar(b1Actual)} — ${fmtDollar(needed)} below ${b1Years}-yr target of ${fmtDollar(b1Target)}`, needed, optional: true, steps: buildSteps(needed, b2Taxable, b2Pretax, []) };
    }
    if (b2Actual < b2Floor) {
      const needed = b2Target - b2Actual;
      const b3Pretax = b3All.filter(a => a.category === "pretax");
      const b3Roth   = b3All.filter(a => a.category === "roth");
      const steps = [];
      let rem = needed;
      const preAvail = b3Pretax.reduce((s, a) => s + (a.balance || 0), 0);
      if (preAvail > 0) {
        const amt = Math.min(rem, preAvail);
        steps.push({ label: `Withdraw from ${acctLabel(b3Pretax, "pre-tax accounts")} (B3)`, accounts: b3Pretax, amount: amt, tax: `${marginalRate}% ordinary income`, note: `Within ${marginalRate}% bracket — move proceeds into bonds/balanced fund in taxable (B2)` });
        rem -= amt;
      }
      if (rem > 0 && b3Roth.length > 0) {
        const amt = Math.min(rem, b3Roth.reduce((s, a) => s + (a.balance || 0), 0));
        steps.push({ label: `Sell equity in ${acctLabel(b3Roth, "Roth accounts")} — transfer cash to B2`, accounts: b3Roth, amount: amt, tax: "Tax-free", note: "Sell equity holdings inside Roth; move the cash proceeds to your B2 bond/stable-value account" });
      }
      // Canonical rule: only replenish B2 from B3 when markets are favorable.
      return { type: "warning", title: "Bucket 2 below floor — replenish from Bucket 3", needed, steps, marketWarning: true };
    }
    const monthsToFloor = monthly > 0 ? Math.round((b1Actual - b1Floor) / monthly) : null;
    return { type: "ok", title: "All buckets healthy — no action needed", nextReview: monthsToFloor };
  }, [b1Actual, b2Actual, b1Floor, b1Target, b2Floor, b2Target, b2Accts, b3Accts, marginalRate, irmaaRisk, hasAccounts, sp, monthly]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const DC = { critical: "#f87171", warning: "var(--accent-gold)", ok: "#34d399", setup: "var(--text-faint)" };
  const DI = { critical: "🔴", warning: "🟡", ok: "✅", setup: "⚙" };
  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "long" });


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Monthly directive ─────────────────────────────────────────── */}
      <div className="chart-card" style={{ borderLeft: `3px solid ${DC[directive.type]}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>📋 {monthName} {now.getFullYear()} — Retirement Directive</div>
            <div style={{ fontSize: 12, color: DC[directive.type], fontWeight: 600, marginTop: 3 }}>
              {DI[directive.type]} {directive.title}
            </div>
          </div>
          {directive.type === "ok" && directive.nextReview && (
            <div style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "right" }}>
              Next review<br/>~{directive.nextReview} mo
            </div>
          )}
        </div>

        {directive.type === "setup" && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
            To get a directive:<br/>
            1. Enter your account balances in <strong style={{ color: "#e2e8f0" }}>Profile → Savings</strong><br/>
            2. Use the <strong style={{ color: "#e2e8f0" }}>[B1] [B2] [B3]</strong> buttons to assign each account to a bucket<br/>
            3. Enter your annual spending in <strong style={{ color: "#e2e8f0" }}>Profile → Spending</strong>
          </div>
        )}

        {directive.marketWarning && (
          <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: "var(--accent-gold)", lineHeight: 1.5 }}>
            ⚠ <strong>Market condition check required:</strong> Only move money from Bucket 3 into Bucket 2 when markets are <em>up or neutral</em>. If stocks are down significantly (&gt;15%), wait — let Bucket 2 cover you until markets recover. Selling growth assets in a downturn defeats the purpose of the bucket strategy.
          </div>
        )}
        {directive.b1Empty && (
          <div style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.25)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: "#7dd3fc", lineHeight: 1.6 }}>
            <strong>No B1 account assigned yet.</strong> Bucket 1 currently holds <strong>$0</strong>. To receive this transfer you need a cash account (HYSA, money market, SGOV) tagged as B1 in <strong>Profile → Savings</strong>. The steps below show which B2 accounts to sell — the proceeds go into that new B1 account.
          </div>
        )}
        {directive.steps?.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
              {directive.optional
                ? `Optional top-up — Bucket 1 currently has ${fmtDollar(directive.b1Actual ?? 0)}, target is ${fmtDollar(directive.needed + (directive.b1Actual ?? 0))}:`
                : `Transfer ${fmtDollar(directive.needed)} from Bucket 2 → into your Bucket 1 cash account:`}
            </div>
            {directive.steps.map((step, i) => (
              <div key={i} style={{ background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>Step {i + 1} — {step.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#34d399", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(step.amount)}</span>
                </div>
                {step.accounts.map(a => (
                  <div key={a.id} style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 1 }}>
                    → {a.name}: {fmtDollar(a.balance || 0)} available
                  </div>
                ))}
                <div style={{ fontSize: 11, marginTop: 5, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Tax: {step.tax}</span>
                  {step.note && <span style={{ color: step.note.startsWith("⚠") ? "var(--accent-gold)" : "var(--text-faint)" }}>{step.note}</span>}
                </div>
              </div>
            ))}
          </>
        )}

        {directive.type === "ok" && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.6 }}>
            Bucket 1 will approach floor in ~{directive.nextReview ?? "?"} months at current draw rate.<br/>
            Check back then — or sooner if spending increases or markets fall significantly.
          </div>
        )}
      </div>

      {/* ── Buffer + draw-mode controls ──────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "6px 2px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Buffer targets:</span>
        {[
          { label: "B1 years", key: "b1Years", val: b1Years, min: 1, max: 7, hint: "3–5 recommended" },
          { label: "B2 years", key: "b2Years", val: b2Years, min: 3, max: 12, hint: "5–10 recommended" },
        ].map(({ label, key, val, min, max, hint }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}:</span>
            <button onClick={() => saveBCfg({ [key]: Math.max(min, val - 1) })} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-secondary)", borderRadius: 4, width: 20, height: 20, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>−</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", minWidth: 14, textAlign: "center" }}>{val}</span>
            <button onClick={() => saveBCfg({ [key]: Math.min(max, val + 1) })} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-secondary)", borderRadius: 4, width: 20, height: 20, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>+</button>
            <span style={{ fontSize: 9, color: "#334155" }}>{hint}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <span
            style={{ fontSize: 11, color: "var(--text-muted)", cursor: "help" }}
            title={`Net (${fmtDollar(netDraw)}/yr) = spending + mortgage P&I − rental income — what the portfolio actually has to fund.\nGross (${fmtDollar(sp)}/yr) = headline spend, ignoring rental offsets and mortgage.`}
          >Draw basis:</span>
          {[
            { val: "net",   label: `Net ${fmtDollar(netDraw)}/yr` },
            { val: "gross", label: `Gross ${fmtDollar(sp)}/yr` },
          ].map(opt => {
            const active = drawMode === opt.val;
            return (
              <button
                key={opt.val}
                onClick={() => saveBCfg({ drawMode: opt.val })}
                style={{
                  background: active ? "rgba(14,165,233,0.18)" : "var(--row-highlight)",
                  border: `1px solid ${active ? "#0ea5e9" : "rgba(255,255,255,0.1)"}`,
                  color: active ? "#0ea5e9" : "var(--text-secondary)",
                  borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontWeight: active ? 600 : 400,
                }}
              >{opt.label}</button>
            );
          })}
        </div>
      </div>

      {/* ── Bucket status cards ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10 }}>
        <BucketCard num={1} color="#0ea5e9" label="Bucket 1 — Cash" horizon={`0–${b1Years} years · pay bills now`}
          actual={b1Actual} floor={b1Floor} target={b1Target} accounts={b1Accts} monthly={monthly}
          role={`${b1Years}-year runway at ${fmtDollar(spendBasis)}/yr ${drawMode === "net" ? "net draw" : "gross spend"}. Pays bills now — NEVER dual-purpose.`}
          holdings="HYSA · Money market · T-bills · CDs" />
        <BucketCard num={2} color="var(--accent-purple)" label="Bucket 2 — Income" horizon={`${b1Years}–${b1Years + b2Years} years · refills B1`}
          actual={b2Actual} floor={b2Floor} target={b2Target} accounts={b2Accts} monthly={monthly}
          role={`Bridges ${ssGapYears}-yr SS gap (age ${retireAge}→${ssAge}). Refills Bucket 1 as it depletes.`}
          holdings="30–50% Equities · 50–70% Bonds · REITs" />
        <BucketCard num={3} color="var(--positive)" label="Bucket 3 — Growth" horizon={`${b1Years + b2Years}+ years · last resort`}
          actual={b3Actual} floor={0} target={0} accounts={b3Accts} monthly={monthly}
          role="Protects against inflation & grows wealth for a decade or more."
          holdings="50–100% Equities · Broad-market equity · International" />
      </div>
    </div>
  );
}
/* ════ PROGRESS TAB — check-in journal ════ */
const CHECKIN_TICK = { fill: "var(--text-secondary)", fontSize: 10 };

// Five absolute 0–100 scores describing the "shape" of a plan snapshot.
// Absolute (not cohort-relative) so the same snapshot always scores the same:
//   confidence — MC success rate
//   retireBy   — planned retirement age, 50 → 100 pts down to 75 → 0 (lower age = better)
//   spend      — how comfortably the 4% rule covers the target: 4% × port vs sp
//   legacy     — median ending portfolio (p50); $1M+ scores 100
//   resilience — success rate under the 2000–2012 stress sequence
// Median ending portfolio that earns a full legacy score. Named because the
// help copy below quotes it — a literal in both places lets the number the user
// reads drift from the number the score uses.
const LEGACY_FULL_SCORE_PORT = 1_000_000;
function planShapeScores(c) {
  const clamp = (v) => Math.max(0, Math.min(100, v));
  return {
    confidence: clamp((c.successRate ?? 0) * 100),
    retireBy:   c.retireAge != null ? clamp(((75 - c.retireAge) / 25) * 100) : 0,
    spend:      c.sp > 0 && c.port != null ? clamp(((c.port * 0.04) / c.sp) * 100) : 0,
    legacy:     clamp(((c.medianTerminal ?? 0) / LEGACY_FULL_SCORE_PORT) * 100),
    resilience: clamp((c.stressRate ?? 0) * 100),
  };
}

// Merge imported check-ins into the existing journal: entries whose id already
// exists locally are skipped (local wins), result sorted by timestamp.
function mergeCheckIns(existing, imported) {
  const base = Array.isArray(existing) ? existing : [];
  const inc  = Array.isArray(imported) ? imported : [];
  const seen = new Set(base.map((c) => c.id));
  const merged = [...base];
  for (const c of inc) {
    if (!c || typeof c !== "object" || !c.id || !c.ts) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    merged.push(c);
  }
  return merged.sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

const PLAN_SHAPE_AXES = [
  { key: "confidence", label: "Confidence", color: "var(--accent)",
    what: "Odds your money outlasts you",
    how: "Monte Carlo success rate across all simulated paths" },
  { key: "retireBy", label: "Retire by", color: "#34d399",
    what: "How early your plan retires you",
    how: "Planned retirement age on an absolute scale (50 scores 100, 75 scores 0 — lower is better)" },
  { key: "spend", label: "Spend", color: "#a3e635",
    what: "How comfortably the plan funds your spending target",
    how: "4% of today's portfolio vs your planned annual spend (at or above target scores 100)" },
  { key: "legacy", label: "Legacy", color: "#818cf8",
    what: "What's left at end of plan",
    how: `Median ending portfolio (p50) — ${fmtDollar(LEGACY_FULL_SCORE_PORT)} or more scores 100` },
  { key: "resilience", label: "Resilience", color: "#fb923c",
    what: "How well the plan weathers market stress",
    how: "Success rate with the 2000–2012 sequence forced at retirement" },
];

/* `exportCheckInsFile` was deleted here. Check-ins now ride in the ONE profile
 * export (see the ⬇ Export button's payload — `checkIns` is part of it), so a
 * second button emitting a second file shape was a second thing to remember to
 * click, and the file it produced was the one a user was most likely to be
 * holding when they had lost everything else.
 *
 * IMPORT is deliberately kept, and stays tolerant of both shapes: the old
 * `AiRA_Progress_*.json` ({kind:"aira_checkins", checkIns:[…]}) and a full
 * profile export both expose `.checkIns`, and a bare array is accepted too.
 * Removing an export is safe; removing the only way to read files users already
 * have on disk is not.
 */

function ProgressTab({ checkIns, onDelete, onRename, onImport }) {
  const fmtDate = (ts) => {
    const d = new Date(ts);
    return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }).toUpperCase();
  };
  const isToday = (ts) => {
    const d = new Date(ts), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const arr = Array.isArray(data) ? data : data?.checkIns;
        if (Array.isArray(arr)) onImport(arr);
      } catch {}
    };
    reader.readAsText(file);
  };

  if (!checkIns || checkIns.length === 0) {
    return (
      <div style={{ background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>📈</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Start your journey</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 460, margin: "0 auto 14px" }}>
          Save your first check-in to start tracking how your plan changes over time.
          The <strong style={{ color: "var(--accent-teal)" }}>✓ Check-in</strong> button in the top toolbar snapshots
          today's plan — success rate, portfolio, and spending — as a point on your timeline.
          They travel with your profile export, but importing one never overwrites your plan
          inputs — a check-in is a running journal entry, shown here as a trend once you've
          saved a few.
        </div>
        <label style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>
          ⬆ Import progress from a previous export
          <input type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: "none" }} />
        </label>
      </div>
    );
  }

  const sorted = [...checkIns].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const first = sorted[0], latest = sorted[sorted.length - 1];
  const chartData = sorted.map((c) => ({
    date: fmtDate(c.ts),
    successPct: c.successRate != null ? +(c.successRate * 100).toFixed(1) : null,
    port: c.port ?? null,
  }));
  const ratePP = latest.successRate != null && first.successRate != null
    ? (latest.successRate - first.successRate) * 100 : null;
  const portDelta = latest.port != null && first.port != null ? latest.port - first.port : null;

  // ── Plan shape (radar) ──
  const sFirst = planShapeScores(first);
  const sToday = planShapeScores(latest);
  const hasTwo = sorted.length >= 2;
  const radarData = PLAN_SHAPE_AXES.map(({ key, label }) => ({
    axis: label, first: +sFirst[key].toFixed(0), today: +sToday[key].toFixed(0),
  }));
  const deltas = PLAN_SHAPE_AXES.map(({ key, label }) => ({ label, d: sToday[key] - sFirst[key] }));
  const maxShift = deltas.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a), { label: "", d: 0 });
  const shapeStable = !hasTwo || Math.abs(maxShift.d) <= 5;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div className="met">
          <div className="ml">Latest success rate</div>
          <div className="mv" style={{ color: "var(--accent-teal)" }}>{latest.successRate != null ? `${(latest.successRate * 100).toFixed(1)}%` : "—"}</div>
          <div className="ms">{fmtDate(latest.ts)}</div>
        </div>
        <div className="met">
          <div className="ml">Since first check-in</div>
          <div className="mv" style={{ color: ratePP == null ? "var(--text-secondary)" : ratePP >= 0 ? "var(--positive)" : "var(--negative)" }}>
            {ratePP == null ? "—" : `${ratePP >= 0 ? "+" : ""}${ratePP.toFixed(1)}pp`}
          </div>
          <div className="ms">{fmtDate(first.ts)} → today</div>
        </div>
        <div className="met">
          <div className="ml">Portfolio change</div>
          <div className="mv" style={{ color: portDelta == null ? "var(--text-secondary)" : portDelta >= 0 ? "var(--positive)" : "var(--negative)" }}>
            {portDelta == null ? "—" : `${portDelta >= 0 ? "+" : "−"}${fmtDollar(Math.abs(portDelta))}`}
          </div>
          <div className="ms">{sorted.length} check-in{sorted.length === 1 ? "" : "s"}</div>
        </div>
      </div>

      {/* ── Plan shape over time (radar) ── */}
      <div style={{ background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div className="ct">Plan shape over time</div>
        <div style={{
          fontSize: 12, lineHeight: 1.5, padding: "8px 12px", borderRadius: 8, marginBottom: 10,
          background: shapeStable ? "rgba(56,189,248,0.06)" : "rgba(251,146,60,0.08)",
          border: `1px solid ${shapeStable ? "rgba(56,189,248,0.18)" : "rgba(251,146,60,0.25)"}`,
          color: "#e2e8f0",
        }}>
          {shapeStable
            ? "Your plan shape has been stable — no axis has moved by more than 5 points."
            : `Biggest shift since your first check-in: ${maxShift.label} ${maxShift.d > 0 ? "+" : ""}${maxShift.d.toFixed(0)} points.`}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ flex: "1 1 300px", minWidth: 260 }}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="rgba(255,255,255,0.12)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "#e2e8f0", fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "var(--text-secondary)", fontSize: 9 }} tickCount={5} angle={90} />
                {hasTwo && (
                  <Radar name={`First check-in (${fmtDate(first.ts)})`} dataKey="first"
                    stroke="var(--text-secondary)" fill="var(--text-secondary)" fillOpacity={0.12} strokeWidth={1.5} />
                )}
                <Radar name={`Today (${fmtDate(latest.ts)})`} dataKey="today"
                  stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 250, display: "flex", flexDirection: "column", gap: 8 }}>
            {PLAN_SHAPE_AXES.map(({ key, label, color, what, how }) => (
              <div key={key} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
                <div style={{ fontSize: 12 }}>
                  <strong style={{ color: "#e2e8f0" }}>{label}</strong>
                  <span style={{ color: "var(--text-secondary)" }}> {what}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{how}</div>
                <div style={{ fontSize: 11, color, fontFamily: "'JetBrains Mono',monospace" }}>
                  {hasTwo ? `${sFirst[key].toFixed(0)} → ${sToday[key].toFixed(0)}` : sToday[key].toFixed(0)} / 100
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
          Each axis scores 0–100 on an absolute scale — higher is better on every axis.
          Goal: <strong style={{ color: "var(--accent-teal)" }}>expand the polygon over time</strong>.
        </div>
      </div>

      {sorted.length >= 2 ? (
        <div style={{ background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div className="ct">Plan trend</div>
          {/* Success rate (%) and Portfolio ($) are unrelated scales — two
              single-axis charts sharing the same date x-axis instead of one
              dual-axis plot whose alignment would be arbitrary. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--row-highlight)" />
                <XAxis dataKey="date" tick={CHECKIN_TICK} />
                <YAxis domain={[0, 100]} tick={CHECKIN_TICK} tickFormatter={(v) => `${v}%`} width={42} />
                <Tooltip
                  contentStyle={{ background: "#0f1729", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [`${value}%`, name]}
                />
                <Line type="monotone" dataKey="successPct" name="Success rate" stroke="var(--accent-teal)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--row-highlight)" />
                <XAxis dataKey="date" tick={CHECKIN_TICK} />
                <YAxis tick={CHECKIN_TICK} tickFormatter={(v) => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
                <Tooltip
                  contentStyle={{ background: "#0f1729", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [fmtDollar(value), name]}
                />
                <Line type="monotone" dataKey="port" name="Portfolio" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="leg">
            <div className="li"><div className="ll" style={{ background: "var(--accent-teal)" }} />Success rate</div>
            <div className="li"><div className="ll" style={{ background: "#0ea5e9" }} />Portfolio</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", background: "rgba(94,234,212,0.05)", border: "1px solid rgba(94,234,212,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
          Save another check-in later to see your trend here — one point doesn't make a line yet.
        </div>
      )}

      {/* ── Check-in history (cards) ── */}
      <div style={{
      background: "var(--card-bg)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: 16,
    }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="ct" style={{ marginBottom: 0 }}>Check-in history</div>
          <div style={{ fontSize: 11, display: "flex", gap: 12, alignItems: "center" }}>
            {/* Says where the export went rather than leaving a gap where a
                button used to be — a user who has clicked "Export progress"
                before needs to be told it is now part of the profile export,
                not left to conclude the feature was removed. */}
            <span style={{ color: "var(--text-muted)" }}>
              ⬇ Included in <strong style={{ color: "var(--text-secondary)" }}>Export</strong> (top toolbar)
            </span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            <label style={{ color: "var(--accent)", cursor: "pointer" }}>
              ⬆ Import progress
              <input type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: "none" }} />
            </label>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {[...sorted].reverse().map((c) => (
            <div key={c.id} style={{ background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                  {fmtDate(c.ts)}{isToday(c.ts) ? " · TODAY" : ""}
                </span>
                <input
                  defaultValue={c.name || ""}
                  placeholder="Name this check-in…"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.name || "")) onRename(c.id, v); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  style={{
                    flex: 1, minWidth: 80, background: "transparent", border: "none", outline: "none",
                    color: "#e2e8f0", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  }}
                />
                <button onClick={() => onDelete(c.id)} title="Delete this check-in"
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {[
                  ["SUCCESS RATE", c.successRate != null ? `${(c.successRate * 100).toFixed(0)}%` : "—", "var(--accent-teal)"],
                  ["STRESS SR",    c.stressRate  != null ? `${(c.stressRate  * 100).toFixed(0)}%` : "—", "#fb923c"],
                  ["PORTFOLIO",    c.port           != null ? fmtDollar(c.port)           : "—", "#e2e8f0"],
                  ["SPENDING",     c.sp             != null ? fmtDollar(c.sp)             : "—", "#e2e8f0"],
                  ["LEGACY",       c.medianTerminal != null ? fmtDollar(c.medianTerminal) : "—", "#818cf8"],
                  ["RETIRE / PLAN TO", c.retireAge != null ? `${c.retireAge} / ${c.endAge ?? "—"}` : "—", "#e2e8f0"],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background: "var(--row-highlight)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, padding: "6px 10px", minWidth: 86 }}>
                    <div style={{ fontSize: 8.5, color: "var(--text-secondary)", letterSpacing: "0.08em" }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Stress-scenario constants ────────────────────────────────────────────────
// Scenario knobs (not tax constants): a memory-care shock and its duration.
// Crash severity is user-driven via the buttons below.
const STRESS_QUICK_PATHS = 200;
const STRESS_QUICK_PATHS_LABEL = STRESS_QUICK_PATHS.toLocaleString();                 // fast, noisy estimate
// How much earlier the stress tab moves an authored first death (§31). Named so the
// scenario label and the mutation cannot drift apart.
const STRESS_DEATH_SOONER_YEARS = 10;
const LTC_ANNUAL_COST = 110000;                 // memory care ≈ $110k/yr, today's $
const LTC_YEARS = 3;

// Success-rate → traffic-light color, shared by the gauge ring and the pp delta.
function stressRateColor(rate) {
  if (rate == null) return "var(--text-muted)";
  if (rate >= 0.85) return "#34d399";
  if (rate >= 0.70) return "var(--accent-gold)";
  return "#f87171";
}

// Small donut gauge showing a scenario's surviving-plans percentage.
function ScenarioGauge({ pct, color }) {
  const r = 24, circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(100, pct)) / 100;
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" style={{ flexShrink: 0 }}>
      <circle cx="29" cy="29" r={r} fill="none" stroke="var(--card-border)" strokeWidth="5" />
      <circle cx="29" cy="29" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform="rotate(-90 29 29)" />
      <text x="29" y="34" textAnchor="middle" fill={color} fontSize="16" fontWeight="700"
        fontFamily="'JetBrains Mono',monospace">{pct == null ? "—" : Math.round(pct)}</text>
    </svg>
  );
}

// Card grid of "what if" stress scenarios. Each card shows a quick low-path
// estimate immediately, with a "Run full" button that re-runs the real engine
// (MC_PATHS) for that one scenario. Deltas are computed against a like-for-like
// baseline: estimate-vs-estimate, or (once run) full-vs-full using the app's mc.
function StressScenarioGrid({ p, baseRate, fmtPct }) {
  const [severity, setSeverity] = useState(-0.40);
  const [est, setEst] = useState(null);        // { base, [id]: rate } low-path
  const [full, setFull] = useState({});        // { [id]: rate } full-path
  const [running, setRunning] = useState(null);
  const endAge = p.endAge || 90;

  /* §31 — has the user AUTHORED a first death in their Profile? If so the stress
   * scenario varies their model rather than inventing one. */
  const authoredDeath = !!(p.spouse?.enabled && Number(p.spouse?.deathAge) > 0);
  /* The decedent's own age when the death is moved earlier. Floored at their
   * current age + 1: a death already in the past is not a scenario. */
  const soonerDeathAge = useMemo(() => {
    if (!authoredDeath) return null;
    const decedentIsPrimary = p.spouse?.firstToDie === "primary";
    const nowAge = decedentIsPrimary
      ? (personAgeNow(p) ?? p.currentAge ?? 0)
      : (personAgeNow(p.spouse) ?? p.currentAge ?? 0);
    return Math.max((nowAge || 0) + 1, Number(p.spouse.deathAge) - STRESS_DEATH_SOONER_YEARS);
  }, [authoredDeath, p]);

  const scenarios = useMemo(() => [
    {
      id: "crash", emoji: "📉", label: "MARKET CRASHES EARLY",
      sub: `One-year ${Math.round(severity * 100)}% equity shock right at retirement`,
      run: (N, seed) => runMC(p, endAge, N, seed, true, [severity]),
    },
    {
      id: "ltc", emoji: "🏥", label: "LONG-TERM CARE EVENT",
      sub: `${LTC_YEARS} years of memory care ≈ ${fmtDollar(LTC_ANNUAL_COST)}/yr`,
      run: (N, seed) => runMC(
        { ...p, carveouts: [...(p.carveouts || []), {
          id: "_ltc_shock", label: "LTC shock",
          // 3-year care cost absorbed across the remaining plan (engine carveouts
          // run from retirement; amortizing keeps the total real without a
          // start-year lever the engine doesn't have).
          annual: Math.round(LTC_ANNUAL_COST * LTC_YEARS / Math.max(1, endAge - p.retireAge)),
          endYear: null,
        }] },
        endAge, N, seed, true),
    },
    {
      id: "live100", emoji: "🎂", label: "LIVE TO 100",
      sub: `${Math.max(0, 100 - endAge)} extra years of withdrawals`,
      run: (N, seed) => runMC(p, 100, N, seed, true),
    },
    {
      id: "survivor",
      emoji: "🕊️",
      // §31 — this scenario used to be a SECOND death model: it forced
      // filingStatus "single" from day one of retirement, applied its own SS
      // haircut, ignored spouse.deathAge entirely (by setting enabled: false) and
      // never extended the horizon. So a user who carefully modelled a death at 78
      // clicked here and got an answer computed from a different death and a
      // different survivor rule, with nothing saying their setting was discarded.
      //
      // It is now a VARIATION on the model the user authored. When a first death is
      // on file we move THAT death earlier and let the engine do everything else —
      // filesJointlyAt handles the filing-status flip (MFJ through the death year),
      // the survivor benefit rules apply the permanent reduction and the PIA basis,
      // and planEndAgeOnPrimaryClock extends the horizon for a younger survivor. The
      // tab then answers the question a user actually has — "how much worse if the
      // timing is bad?" — instead of re-answering "what if there were a death at all",
      // which the base plan already covers and the widow's-penalty card above reports.
      label: authoredDeath ? `FIRST DEATH ${STRESS_DEATH_SOONER_YEARS} YEARS SOONER` : "SPOUSE PASSES EARLY",
      sub: authoredDeath
        ? `Your modelled first death at ${soonerDeathAge} instead of ${p.spouse.deathAge} — same survivor rules, worse timing`
        : "Survivor keeps the larger SS check AND files Single, from day one — a worst-case bound, not a forecast",
      run: (N, seed) => runMC(
        authoredDeath
          // Only the timing changes. Every other survivor rule is inherited.
          ? { ...p, spouse: { ...p.spouse, deathAge: soonerDeathAge } }
          // No death on file, so there is nothing to move. Keep the long-standing
          // day-one bound (relabelled above so it is not mistaken for a forecast).
          // The 0.67 fallback stays for profiles with no spousal data: it is only
          // right for a one-earner couple, but it is what those profiles have always
          // seen here, and regressing them to "no haircut at all" would be worse.
          : {
              ...p,
              ssb: p.spouse?.enabled
                ? Math.max(p.ssb || 0, p.spouse.ssb || 0)
                : Math.round((p.ssb || 0) * 0.67),
              spouse: { ...(p.spouse || {}), enabled: false },
              filingStatus: "single",
              twoHousehold: false,
            },
        endAge, N, seed, true
      ),
    },
  ], [p, endAge, severity]);

  // Quick estimates — deferred a tick so the tab paints before the run.
  useEffect(() => {
    let cancelled = false;
    setEst(null);
    const t = setTimeout(() => {
      const out = { base: runMC(p, endAge, STRESS_QUICK_PATHS, 7, true).rate };
      scenarios.forEach((s) => { out[s.id] = s.run(STRESS_QUICK_PATHS, 7).rate; });
      // The widow's-penalty counterfactual: the SAME plan with the modelled first
      // death removed. Deliberately the same seed and path count as `base` above —
      // with a different seed part of the "penalty" would be RNG noise, and a card
      // labelled "what this death costs" would be reporting randomness (§28).
      // Only computed when a death is actually modelled, so this costs nothing for
      // the profiles that don't use the feature.
      out.noDeath = authoredDeath
        ? runMC({ ...p, spouse: { ...p.spouse, deathAge: null } }, endAge, STRESS_QUICK_PATHS, 7, true).rate
        : null;
      if (!cancelled) setEst(out);
    }, 30);
    return () => { cancelled = true; clearTimeout(t); };
  }, [scenarios, p, endAge, authoredDeath]);

  const runFull = (s) => {
    setRunning(s.id);
    setTimeout(() => {
      const rate = s.run(MC_PATHS, 43).rate;
      setFull((f) => ({ ...f, [s.id]: rate }));
      setRunning(null);
    }, 30);
  };

  const setSev = (v) => {
    setSeverity(v);
    setFull((f) => { const n = { ...f }; delete n.crash; return n; }); // crash result now stale
  };

  const worst = est
    ? scenarios.reduce((lo, s) => Math.min(lo, full[s.id] ?? est[s.id] ?? 1), 1)
    : null;

  return (
    <div className="chart-card" style={{ marginBottom: 12 }}>
      <div className="ct" style={{ marginBottom: 4 }}>🔶 Stress scenarios against your plan</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Each card re-runs the full engine with one thing gone wrong. The number is the share of
        simulated plans still funded; <b style={{ color: "var(--text-secondary)" }}>pp</b> is the drop vs your
        baseline. Cards show a fast estimate — press <b style={{ color: "var(--text-secondary)" }}>Run full</b> for
        the precise {MC_PATHS_LABEL}-path result.
        {/* §31 related item — provenance. The success rate is widely read as "the chance
            my retirement works". It is narrower than that, and saying so is a §28 tier-1
            disclosure: it changes how the number should be READ. */}
        <div style={{ marginTop: 6, color: "var(--text-faint)" }}>
          What the simulation varies: <b style={{ color: "var(--text-secondary)" }}>market returns, inflation,
          rental reliability and healthcare shocks</b>. Your spending, claim ages, retirement age and
          any modelled death are held at what you entered — so this measures how much
          <em> market</em> risk the plan absorbs, not the overall odds your retirement works out.
          Those assumptions are the scenarios; that is what these cards are for.
        </div>
      </div>

      {/* §31 deliverable 2 — the widow's-penalty delta.
          The base plan ALREADY contains the modelled death, so the scenario grid's
          "vs baseline" cannot show what that death costs — it compares against a
          baseline that includes it. This card is the missing comparison: the same
          plan with the death removed. Without it a user sets a death age, watches
          the success rate change, and has no way to attribute the change. */}
      {authoredDeath && est?.noDeath != null && (() => {
        const withDeath = est.base;
        const without   = est.noDeath;
        const pp        = (withDeath - without) * 100;      // negative = it costs you
        const col       = pp <= -10 ? "var(--negative)" : pp <= -3 ? "#f59e0b" : "var(--positive)";
        const whoDies   = p.spouse?.firstToDie === "primary" ? "your" : "your spouse's";
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10, marginBottom: 12 }}>
            <div className="met" style={{ background: `${withAlpha(col, "0d")}`, border: `1px solid ${withAlpha(col, "33")}` }}>
              <div className="ml">Widow's penalty</div>
              <div className="mv" style={{ color: col }}>
                {`${pp > 0 ? "+" : ""}${pp.toFixed(1)}pp`}
              </div>
              <div className="ms">
                {fmtPct(without)} without {whoDies} death → {fmtPct(withDeath)} with it, at age {p.spouse.deathAge}
              </div>
            </div>
            <div className="met">
              <div className="ml">What this figure is</div>
              <div className="mv" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                Your own plan, run twice
              </div>
              <div className="ms">
                Same {STRESS_QUICK_PATHS_LABEL} market paths and the same random seed both times, so the
                gap is the death alone — not luck. It is the lost benefit plus the tax
                increase from filing Single, net of one person's costs.
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }}>
        {scenarios.map((s) => {
          const real = full[s.id];
          const measured = real != null;
          const rate = measured ? real : est ? est[s.id] : null;         // 0..1
          const baseline = measured ? (baseRate ?? est?.base) : est?.base;
          const deltaPP = rate != null && baseline != null ? (rate - baseline) * 100 : null;
          const color = stressRateColor(rate);
          const isRunning = running === s.id;
          return (
            <div key={s.id} style={{
              background: `${withAlpha(color, "0d")}`, border: `1px solid ${withAlpha(color, "33")}`,
              borderRadius: 12, padding: "13px 15px",
            }}>
              <div style={{ display: "flex", gap: 12 }}>
                <ScenarioGauge pct={rate == null ? null : rate * 100} color={color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    {s.emoji} {s.label}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "3px 0 1px" }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>
                      {deltaPP == null ? "—" : `${deltaPP > 0 ? "+" : ""}${deltaPP.toFixed(0)}`}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>pp</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    drops to <b style={{ color, fontFamily: "'JetBrains Mono',monospace" }}>{rate == null ? "—" : fmtPct(rate)}</b>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 9, lineHeight: 1.45 }}>{s.sub}</div>

              {s.id === "crash" && (
                <div style={{ marginTop: 9 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 5 }}>
                    Crash severity
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[-0.10, -0.25, -0.40].map((v) => (
                      <button key={v} onClick={() => setSev(v)}
                        style={{
                          flex: 1, padding: "3px 0", fontSize: 11, borderRadius: 5, cursor: "pointer",
                          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                          border: `1px solid ${severity === v ? "#f87171" : "rgba(255,255,255,0.12)"}`,
                          background: severity === v ? "rgba(248,113,113,0.15)" : "transparent",
                          color: severity === v ? "#f87171" : "var(--text-muted)",
                        }}>
                        {Math.round(v * 100)}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <span style={{ fontSize: 10, color: measured ? "#34d399" : "var(--text-faint)", fontWeight: 600 }}>
                  {measured ? `✓ ${MC_PATHS_LABEL} paths` : est ? "fast estimate" : "estimating…"}
                </span>
                <button onClick={() => runFull(s)} disabled={isRunning || !est} className="mbtn"
                  style={{ fontSize: 11, padding: "3px 10px", opacity: isRunning || !est ? 0.5 : 1 }}>
                  {isRunning ? "Running…" : measured ? "Re-run" : "Run full"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic", marginTop: 12 }}>
        {worst == null ? "Estimating worst case…"
          : worst >= 0.70
          ? "Even the worst case here stays in the recoverable range."
          : "At least one scenario pushes the plan into fragile territory — worth a mitigation."}
      </div>
    </div>
  );
}

function ScenariosTab({
  initialSubTab,
  onSubTabConsumed,
  baseParams,
  mc,
  stress,
  checkIns,
  onDeleteCheckIn,
  onRenameCheckIn,
  onImportCheckIns,
  retireAge,
  ssAge,
  rmdAge,
  inf,
  real,
  fmtPct,
  FanChart,
  SEQ_2000_2012,
  DeterministicWithdrawalView,
  RothLadder,
  BucketsTab,
  withdrawalStrategy,
  checkpoints,
  earlyRetireTarget,
  portfolioGoal,
  dob,
  sex,
  assumptions,
  onAssumptionChange,
  onSaveConversionOverride,
  onRemoveConversionOverride,
}) {

  const [scenarioSubTab, setScenarioSubTab] = useState(initialSubTab || "roth");

  // Consume a pending cross-tab navigation request once, on arrival — a
  // pointer elsewhere in the app (e.g. RetirementPanel's Withdrawal Strategy
  // card) asked to land on a specific sub-tab here. Cleared immediately so a
  // later manual visit to Analysis isn't silently redirected.
  useEffect(() => {
    if (initialSubTab) {
      setScenarioSubTab(initialSubTab);
      onSubTabConsumed && onSubTabConsumed();
    }
  }, [initialSubTab]); // onSubTabConsumed intentionally omitted — see comment above

  const SCENARIO_SUBTABS = [
    ["roth",        "🔄 ROTH CONVERSIONS"],
    ["withdrawals", "💸 WITHDRAWAL PLAN"],
    ["stress",      "🔶 STRESS TEST"],
    ["buckets",     "🪣 BUCKETS"],
    ["income",      "💵 INCOME"],
    ["realestate",  "🏠 REAL ESTATE"],
    ["progress",    "📈 PROGRESS"],
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 12,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          paddingBottom: 8,
        }}
      >
        {SCENARIO_SUBTABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setScenarioSubTab(key)}
            style={{
              padding: "5px 12px",
              fontSize: 13,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background:
                scenarioSubTab === key
                  ? "rgba(255,255,255,0.1)"
                  : "transparent",
              color: scenarioSubTab === key ? "#e2e8f0" : "var(--text-faint)",
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {scenarioSubTab === "stress" && (
        <div>
          <StressScenarioGrid p={baseParams} baseRate={mc?.rate ?? null} fmtPct={fmtPct} />
          {stress && (
            <>
          <FanChart
            pcts={stress.pcts}
            retireAge={retireAge}
            ssAge={ssAge}
            rmdAge={rmdAge}
            inf={inf}
            useReal={real}
            title="Stress test: 2000–2012 actual S&P sequence at retirement"
            checkpoints={checkpoints}
            portfolioGoal={portfolioGoal}
            earlyRetireTarget={earlyRetireTarget}
            dob={dob}
            sex={sex}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 10,
            }}
          >
            <div className="met">
              <div className="ml">Stress success</div>
              <div
                className="mv"
                style={{ color: stress.rate >= 0.85 ? "var(--positive)" : "#f59e0b" }}
              >
                {fmtPct(stress.rate)}
              </div>
              <div className="ms">{formulaFor("stress-success")}</div>
            </div>
            <div className="met">
              <div className="ml">Delta vs base</div>
              <div
                className="mv"
                style={{
                  color: mc && stress.rate >= mc.rate ? "var(--positive)" : "var(--negative)",
                }}
              >
                {mc ? `${((stress.rate - mc.rate) * 100).toFixed(1)}pp` : "—"}
              </div>
              <div className="ms">{formulaFor("stress-delta")}</div>
            </div>
          </div>
          <div
            style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}
          >
            {SEQ_2000_2012.map((r, i) => (
              <span
                key={i}
                style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono',monospace",
                  background:
                    r < 0 ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.12)",
                  color: r < 0 ? "#f87171" : "#34d399",
                  border: `1px solid ${
                    r < 0 ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.25)"
                  }`,
                }}
              >
                {2000 + i}: {r > 0 ? "+" : ""}
                {(r * 100).toFixed(1)}%
              </span>
            ))}
          </div>
            </>
          )}
        </div>
      )}

      {scenarioSubTab === "withdrawals" && (
        <WithdrawalPlanCombined p={baseParams} inf={inf} withdrawalStrategy={withdrawalStrategy} onAssumptionChange={onAssumptionChange} />
      )}

      {scenarioSubTab === "roth" && <RothLadder params={baseParams} onSaveConversionOverride={onSaveConversionOverride} onRemoveConversionOverride={onRemoveConversionOverride} onAssumptionChange={onAssumptionChange} />}
      {scenarioSubTab === "buckets"    && <BucketsTab params={baseParams} />}
      {scenarioSubTab === "income"     && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <IncomeExpensesChart p={baseParams} inf={inf} />
        </div>
      )}
      {scenarioSubTab === "realestate" && <MortgageTab values={assumptions ?? baseParams} onChange={onAssumptionChange ?? (() => {})} />}
      {scenarioSubTab === "progress"   && <ProgressTab checkIns={checkIns} onDelete={onDeleteCheckIn} onRename={onRenameCheckIn} onImport={onImportCheckIns} />}
    </div>
  );
}

function MCTab({ params, mc, stress, running, onRun, checkpoints, onUpdateCheckpoints, onDeleteCheckpoint, portfolioGoal, earlyRetireTarget, dob, sex, onSetBaselineFromCheckpoint, withdrawalStrategy, inf = 0, real = false }) {
  // Every top-level panel on this tab is a twisty, and every one starts shut.
  // The tab had grown to five full-height explainer panels stacked above the
  // result cards, so the number the user actually came for sat a screen and a
  // half below the fold. Collapsed-by-default puts the answer first and leaves
  // the reasoning one click away.
  const [showWhy, setShowWhy] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  // "Full assumptions ↓" on the AT A GLANCE card is a pointer, not a second
  // source: it opens and scrolls to the one panel that owns the full list,
  // rather than restating a subset of it next to the result.
  const inputsRef = useRef(null);
  const openInputs = () => {
    setShowInputs(true);
    requestAnimationFrame(() =>
      inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };
  const [showAddCheckpoint, setShowAddCheckpoint] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedCpId, setExpandedCpId] = useState(null);
  const [newCpDate, setNewCpDate] = useState("");
  const [newCpValue, setNewCpValue] = useState("");
  const [newCpNote, setNewCpNote] = useState("");

  // Clamped the same way runMC/simulateDeterministicWithStrategy clamp their own
  // start age (see effectiveRetireAge) — a user who enters a retireAge in the past
  // relative to currentAge (already retired) actually gets simulated starting
  // TODAY, not at the stale entered age. Without this, accPhase showed a backwards
  // range ("Age 65 → 55") and retPhase named a phase start (55) the engine never
  // actually uses (it starts at 65) — both were describing a simulation that
  // wasn't the one being run.
  const effRetireAge = effectiveRetireAge(params.retireAge, params.currentAge);
  const accPhase = effRetireAge > params.currentAge
    ? `Age ${params.currentAge} → ${effRetireAge}`
    : "already retired — no accumulation phase";
  const retPhase = `Age ${effRetireAge} → ${params.endAge}`;

  // The fan chart and band table run their percentile rows through deflate()
  // when Real $ is on; these summary cards read mc.term.* straight off runMC,
  // which is nominal. So the toggle appeared to do nothing on the number most
  // people read FIRST, and the card silently disagreed with the chart directly
  // below it — same quantity, two different bases, neither labelled.
  // Deflated on the chart's own basis: deflate() divides row i by (1+inf)^i
  // where i counts from pcts[0].age === effRetireAge, so the terminal row is
  // (endAge - effRetireAge) years out. Matching that keeps card and chart equal.
  const termYears  = Math.max(0, (params.endAge || 0) - effRetireAge);
  const termDivisor = real ? Math.pow(1 + (inf || 0) / 100, termYears) : 1;
  const termAt = (k) => (mc?.term?.[k] ?? 0) / termDivisor;
  const dollarBasis = dollarBasisLabel(real, mc?.pcts?.[0]?.age ?? effRetireAge);
  const mortSched = params.mortBalance > 0
    ? mortgageSchedule(params.mortBalance, params.mortRate || 6.5, params.mortStart || "2020-01", params.mortTerm || 30, params.mortExtra || 0)
    : null;
  const mortAnnual = mortSched ? mortSched.pmt * 12 : 0;
  const mortPayoffAge = mortSched
    ? params.currentAge + (mortSched.payoffYr - new Date().getFullYear())
    : 0;
  // One-off cash flows (windfalls IN, planned lump costs OUT). These move the
  // plan as much as any return assumption — a $1M inheritance landing at 68
  // shifts every downstream percentile — but this panel disclosed only the
  // recurring inputs, so nothing on screen told the user whether the run
  // actually included the event they had just entered. Same list the engines
  // read (params.cashFlowEvents), so what is shown is what was simulated.
  const cfEvents   = params.cashFlowEvents || [];
  const cfIsLive   = (e) => Number.isFinite(Number(e.year)) && (Number(e.amount) || 0) !== 0;
  const cfInflows  = cfEvents.filter((e) => e.direction === "in"  && cfIsLive(e));
  const cfOutflows = cfEvents.filter((e) => e.direction !== "in" && cfIsLive(e));
  const cfAgeAt    = (yr) => params.currentAge + (Number(yr) - CURRENT_YEAR);
  const cfWhen     = (ev, fallback) => {
    const every = Number(ev.recurEveryYears) || 0;
    return `${(ev.label || "").trim() || fallback} · ${ev.year} (age ${cfAgeAt(ev.year)})`
      + (every > 0 ? ` · every ${every} yr` : "");
  };
  // `inflate !== false` is the engine's default (see computeCashFlowEvents) —
  // report the treatment that will actually be applied, not the raw field.
  const cfBasis    = (ev) => ev.inflate !== false ? `today's $ · +${params.inf ?? 2.5}%/yr` : "as entered (nominal)";
  const cfInflowRows = cfInflows.flatMap((ev) => [
    [cfWhen(ev, "Windfall"), "+" + fmtDollar(Number(ev.amount) || 0)],
    [`↳ into ${BUCKET_LABELS_SHORT[ev.bucket || "taxable"]}`,
      `${ev.taxable ? "taxed as income" : "not taxed"} · ${cfBasis(ev)}`],
  ]);
  const cfOutflowRows = cfOutflows.flatMap((ev) => [
    [cfWhen(ev, "One-off cost"), "−" + fmtDollar(Number(ev.amount) || 0)],
    [`↳ ${ev.deferrable ? "discretionary" : "committed"}`, cfBasis(ev)],
  ]);

  const rateColor = (r) =>
    r >= MC_BAND_LOW_RISK ? "var(--positive)" : r >= MC_BAND_MODERATE ? "#34d399" : r >= MC_BAND_ELEVATED ? "var(--accent-gold)" : r >= MC_BAND_HIGH ? "#f97316" : "var(--negative)";
  const riskLabel = (r) =>
    r >= MC_BAND_LOW_RISK ? "Low risk — strong plan. As JL Collins would say — F-You Money."
    : r >= MC_BAND_MODERATE ? "Moderate risk — solid foundation. Consider small adjustments."
    : r >= MC_BAND_ELEVATED ? "Elevated risk — plan needs some work."
    : "High risk — most scenarios deplete savings before target age.";

  // `hint` is what stays visible while a panel is shut — the one fact that tells
  // the user whether opening it is worth a click (how many score drivers, how
  // many saved checkpoints). Without it, collapsing hides not just the detail
  // but the fact that there is any.
  // Group headings for the tab's two panel clusters. These needed their own
  // tier: the first pass reused `.section-label`, which is 11px/700/uppercase
  // — byte-identical to the twisty headers below them, so a "group" heading
  // rendered as a sibling of the things it was supposed to contain. Hierarchy
  // here is carried by three things at once (size + rail + brightness), because
  // letter-spacing alone at 11px reads as another label, not a level up:
  //   GROUP    13px / 800 / --text-primary / accent rail   ← this
  //   twisty   11px / 700 / accent hue                     ← SectionHeader
  //   card     9px  / 600 / --text-faint                   ← InputCard
  // Rail colour also ranks the two groups: teal on the result cluster (the one
  // the user came for), muted on the supporting cluster.
  const GroupHeading = ({ label, sub, accent = "var(--accent-teal)" }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "var(--space-lg)", marginBottom: "calc(var(--space-xs) * -1)" }}>
      <div aria-hidden="true" style={{ width: 3, alignSelf: "stretch", minHeight: 30, borderRadius: 2, background: accent, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.16em", lineHeight: 1.25 }}>{label}</h3>
        {sub && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
      </div>
      <div aria-hidden="true" style={{ flex: 1, height: 1, minWidth: 12, background: "linear-gradient(90deg, var(--divider), transparent)" }} />
    </div>
  );

  const SectionHeader = ({ label, open, onToggle, color = "var(--accent-teal)", hint }) => (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: open ? 14 : 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}>▶</span>
        <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
        {hint && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{open ? "Hide" : "Show"}</div>
    </div>
  );

  const InputCard = ({ title, rows }) => (
    <div style={{ background: "var(--row-highlight)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>{title}</div>
      {/* Index in the key: rows are now generated per cash-flow event, and two
          events can legitimately produce the same label ("↳ into taxable"). */}
      {rows.map(([label, val], i) => (
        <div key={`${label}|${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>{label}</span>
          <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace", fontWeight: 500, textAlign: "right" }}>{val}</span>
        </div>
      ))}
    </div>
  );

  const strategyHowItWorks = {
  gk: "Guyton‑Klinger guardrails — Every year, if the current withdrawal rate exceeds 120% of the initial rate, spending cuts 10% (never below floor). If it falls below 80%, spending increases 10% (never above ceiling).",
  fixed: "Fixed Percentage — You withdraw a constant percentage of the current portfolio each year, automatically adjusting with market value.",
  vpw: "Variable Percentage Withdrawal (VPW) — Spending is recalculated annually as the portfolio amortized over your remaining years, so the plan is designed to spend down to roughly zero by your plan-to age.",
  ninety_five_rule: "95% Rule — Spending can drop to 95% of last year's amount during downturns, otherwise tracks inflation.",
  bengen: "Bengen 4% Rule — Withdraw a fixed percentage of the STARTING portfolio value in year one, then increase that dollar amount with inflation every year after. Spending never reacts to portfolio performance, for better or worse — an honest model of late-stage risk for fixed-budget retirees.",
  smart: "Smart Waterfall (hybrid) — Guyton‑Klinger guardrails while more than 15 years remain in the plan, then switches to the Bengen 4% Rule for the final 15 years — the split matches GK's own longevity-safety-brake threshold, so the switch happens exactly where GK's brake would otherwise be disabled."
};

  const startEdit = (cp) => {
    setEditingId(cp.id);
    setNewCpDate(cp.date);
    setNewCpValue(cp.value.toString());
    setNewCpNote(cp.note || "");
    setShowAddCheckpoint(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewCpDate("");
    setNewCpValue("");
    setNewCpNote("");
    setShowAddCheckpoint(false);
  };

  const handleSaveCheckpoint = () => {
    if (!newCpDate || !newCpValue) return;
    const cpData = {
      date: newCpDate,
      value: Number(newCpValue),
      note: newCpNote || "",
    };
    let updatedCheckpoints;
    if (editingId) {
      updatedCheckpoints = checkpoints.map(cp => cp.id === editingId ? { ...cp, ...cpData } : cp);
    } else {
      const newCp = { id: Date.now().toString(), ...cpData };
      updatedCheckpoints = [...checkpoints, newCp];
    }
    onUpdateCheckpoints(updatedCheckpoints);
    setEditingId(null);
    setNewCpDate("");
    setNewCpValue("");
    setNewCpNote("");
    setShowAddCheckpoint(false);
  };


  // A 40+ year retirement runs past the evidence behind two of this model's
  // defaults. The simulation itself is honest — it bootstraps returns across the
  // whole horizon — but a success rate is only as good as the spending path and
  // the costs fed into it, and both weaken the earlier you retire. Said plainly
  // and up front, because the failure mode is a confident number that is
  // optimistic for reasons the user cannot see.
  const planHorizon  = Math.max(0, (params.endAge || 0) - effRetireAge);
  const longHorizon  = planHorizon >= 40;
  const preMedicare  = Math.max(0, 65 - effRetireAge);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionDisclaimer>
        These are hypothetical projections generated by a model, not a prediction and not a
        recommendation to buy, sell, or hold any investment. A success rate is the share of
        simulated scenarios in which the portfolio survived — it is not a probability that
        your actual retirement will succeed, and past market results do not guarantee future
        ones. Discuss any decision with a licensed financial, tax, or legal professional who
        knows your full circumstances.
      </SectionDisclaimer>

      {/* ── The answer, first ──────────────────────────────────────────
          The results grid used to render LAST, under five collapsed twisties.
          Collapsing them (v1.1.x) shrank the wall but did not promote the
          summary — the number the user came for still sat below every panel
          that explains it. Grid first, then the panels that interpret it,
          then the panels it was built from. (design-authority, 2026-08-23) */}
      {/* Results panel */}
      {!mc && <div style={{ textAlign: "center", padding: "20px", color: "var(--text-faint)", fontSize: 13 }}>{running ? `Running ${MC_PATHS_LABEL} paths...` : "Run Monte Carlo from the sidebar to see results here."}</div>}
      {mc && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={{ background: `${withAlpha(rateColor(mc.rate), "12")}`, border: `1.5px solid ${withAlpha(rateColor(mc.rate), "44")}`, borderRadius: 10, padding: 18 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>SUCCESS RATE <span role="img" aria-label="information" title={`Of your ${MC_PATHS_LABEL} Monte Carlo simulations, the share where the portfolio still has money at age ${params.endAge}. This is the conservative headline number — it assumes you live all the way to the plan age. The purple "…outlives you" figure below re-weights it by your odds of actually being alive at each failure age, so it's always a touch higher.`} style={{ color: "#60a5fa", cursor: "help" }}>ℹ️</span></div>
            <div style={{ fontSize: 48, fontWeight: 900, color: rateColor(mc.rate), fontFamily: "'JetBrains Mono',monospace", lineHeight: 1, marginBottom: 6 }}>{fmtPct(mc.rate)}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>of {MC_PATHS_LABEL} simulations last to age {params.endAge}</div>
            {mc.mwRate != null && (
              <div
                style={{ fontSize: 12, color: "var(--accent-purple)", marginBottom: 10, fontWeight: 600 }}
                title={`Mortality-weighted success. The headline rate assumes you live all the way to ${params.endAge} — but a path that runs out of money at, say, 88 only fails you if you're alive at 88. This weights each failed path by the SSA probability (${params.sex || "blended"} setting, Profile → Personal) of being alive at its failure age. It answers the actuarial question "what's the chance my money outlives me?" — always ≥ the headline rate, which remains the conservative planning number.`}
              >
                ◐ {fmtPct(mc.mwRate)} chance your money outlives you
              </div>
            )}
            <div style={{ fontSize: 12, color: rateColor(mc.rate), marginBottom: 14, lineHeight: 1.5 }}>{riskLabel(mc.rate)}</div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10, display: "flex", gap: 12 }}>
              <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 9, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Plan age</div><div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace" }}>Age {params.endAge}</div></div>
              <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.07)" }}><div style={{ fontSize: 9, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Stress test (2000–2012)</div><div style={{ fontSize: 18, fontWeight: 700, color: rateColor(stress?.rate || 0), fontFamily: "'JetBrains Mono',monospace" }}>{stress ? fmtPct(stress.rate) : "—"}</div></div>
            </div>
          </div>
          <div style={{ background: "var(--row-highlight)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 18 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>MEDIAN FINAL BALANCE <span role="img" aria-label="information" title={`The middle outcome: the 50th-percentile portfolio value remaining at age ${params.endAge}. Half of all simulations finish above this and half below — the typical leftover, not a floor or a guarantee. The 10th–90th percentile spread beneath shows how wide the range of outcomes really is.`} style={{ color: "#60a5fa", cursor: "help" }}>ℹ️</span></div>
            <div style={{ fontSize: 42, fontWeight: 900, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1, marginBottom: 6 }}>{fmtDollar(termAt("p50"))}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>50th percentile at age {params.endAge} · {dollarBasis}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 14 }}>Half of all simulations end above this. A higher balance cushions against sequence-of-returns risk.</div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
              {[{ l: "10th (near-worst)", v: termAt("p10"), c: "#f87171" }, { l: "25th (cautious)", v: termAt("p25"), c: "var(--accent-gold)" }, { l: "75th (good case)", v: termAt("p75"), c: "#34d399" }, { l: "90th (best 10%)", v: termAt("p90"), c: "var(--accent-teal)" }].map(({ l, v, c }) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
                  <span style={{ color: "var(--text-faint)" }}>{l}</span><span style={{ color: c, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{fmtDollar(v)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--row-highlight)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 18 }}>
            {/* Was "MODEL ASSUMPTIONS" — a full second copy of the assumption
                list that already lives in "Simulation inputs & assumptions"
                below. Paths, rental reliability and the strategy label were
                stated verbatim in both places with neither marked as the
                source of record. Cut to the three flags most likely to explain
                a surprising number, plus a pointer to the one authoritative
                list. (design-authority, 2026-08-23) */}
            <div className="section-label" style={{ marginBottom: 12 }}>AT A GLANCE</div>
            {[
              [`${getStrategyLabel(resolveStrategy(withdrawalStrategy))} each path`, "var(--accent-purple)"],
              [params.smile !== false ? "Blanchett smile spending (not flat)" : "Flat real spending (smile curve off)", "var(--accent-purple)"],
              [params.tax !== false ? "Full tax model: brackets, SS torpedo, IRMAA, state" : "Tax OFF — pre-tax view (no tax anywhere)", "var(--text-secondary)"],
            ].map(([text, color]) => (
              <div key={text} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 7, fontSize: 11 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, marginTop: 5, flexShrink: 0 }} />
                <span style={{ color: "var(--text-muted)", lineHeight: 1.4 }}>{text}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={openInputs}
              style={{ marginTop: 10, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--accent-teal)", textAlign: "left" }}
            >
              Full assumptions ↓
            </button>
          </div>
          </div>
      )}

      {/* ── Group 1: analysis — panels ABOUT this result ─────────────── */}
      <GroupHeading
        label="Explanation of Your Outcome"
        sub="What is driving the number above, and how you are tracking against it"
        accent="var(--accent-teal)"
      />
      {/* ── Why this score ─────────────────────────────────────────────────
          Every engine defect found on 2026-08-05 was invisible on screen: the
          user saw a percentage and nothing else, so neither he nor we could
          sanity-check it. A number that cannot explain itself cannot be
          questioned, which is how four bugs survived. */}
      {mc && (() => {
        const ex = explainScore(params, mc);
        if (!ex.drivers.length) return null;
        const tone = {
          risk:  { bg: "rgba(239,68,68,0.07)",  bd: "rgba(239,68,68,0.3)",  fg: "#f87171", tag: "Biggest risk" },
          watch: { bg: "rgba(251,146,60,0.07)", bd: "rgba(251,146,60,0.28)", fg: "#fdba74", tag: "Worth knowing" },
          good:  { bg: "rgba(16,185,129,0.06)", bd: "rgba(16,185,129,0.25)", fg: "#34d399", tag: "Working for you" },
        };
        // Shut, this panel still has to say whether there is anything alarming
        // inside it — so the header takes the colour of the top-ranked driver
        // and counts the ones flagged as risk. A red twisty reading "2 flagged
        // as risk" is the click prompt; a teal one saying "3 drivers" is not.
        const riskCount = ex.drivers.filter((d) => d.severity === "risk").length;
        const headTone = tone[ex.drivers[0].severity] || tone.watch;
        return (
          <div style={{ background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16 }}>
            <SectionHeader
              label={`Why your score is ${fmtPct(mc.rate)}`}
              open={showWhy}
              onToggle={() => setShowWhy(!showWhy)}
              color={headTone.fg}
              hint={`${ex.drivers.length} driver${ex.drivers.length === 1 ? "" : "s"}${riskCount ? ` · ${riskCount} flagged as risk` : ""}`}
            />
            {showWhy && (<>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 14 }}>
              {ex.headline} Ranked by how much each one moves the outcome.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ex.drivers.map((d) => {
                const t = tone[d.severity];
                return (
                  <div key={d.id} style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 9, padding: "11px 13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#e2e8f0" }}>{d.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: t.fg, fontFamily: "'JetBrains Mono',monospace" }}>{d.value}</span>
                    </div>
                    <div style={{ fontSize: 9, color: t.fg, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{t.tag}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.55, marginTop: 6 }}>{d.detail}</div>
                    <div style={{ fontSize: 11.5, color: "#cbd5e1", lineHeight: 1.55, marginTop: 5 }}>
                      <strong style={{ color: t.fg }}>What moves it: </strong>{d.lever}
                    </div>
                  </div>
                );
              })}
            </div>
            </>)}
          </div>
        );
      })()}

      {/* Checkpoint panel */}
      <div className="chart-card" style={{ marginBottom: 12 }}>
        <SectionHeader
          label="Portfolio checkpoints (actual vs. forecast)"
          open={showCheckpoints}
          onToggle={() => setShowCheckpoints(!showCheckpoints)}
          color="var(--accent-teal)"
          hint={checkpoints?.length ? `${checkpoints.length} saved` : "none saved yet"}
        />
        {showCheckpoints && (<>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
          Add real portfolio values at specific dates to compare against the simulation's projected median path. This helps you see if you're ahead or behind your retirement goals.
        </div>
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => {
              if (showAddCheckpoint) cancelEdit();
              else {
                setEditingId(null);
                setNewCpDate("");
                setNewCpValue("");
                setNewCpNote("");
                setShowAddCheckpoint(true);
              }
            }}
            style={{ background: "rgba(13,148,136,0.2)", border: "1px solid #0d9488", borderRadius: 6, padding: "4px 12px", color: "var(--accent-teal)", cursor: "pointer" }}
          >
            {showAddCheckpoint ? "− Hide Form" : "+ Add Checkpoint"}
          </button>
        </div>
        {showAddCheckpoint && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <input type="date" value={newCpDate} onChange={e => setNewCpDate(e.target.value)} style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "6px 8px" }} />
            <input type="number" placeholder="Portfolio value ($)" value={newCpValue} onChange={e => setNewCpValue(e.target.value)} style={{ width: 140, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "6px 8px" }}
                onFocus={selectAllOnFocus}
              />
            <input type="text" placeholder="Note (optional)" value={newCpNote} onChange={e => setNewCpNote(e.target.value)} style={{ width: 240, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "6px 8px" }} />
            <button onClick={handleSaveCheckpoint} style={{ background: "var(--positive)", border: "none", borderRadius: 6, padding: "6px 16px", color: "white", cursor: "pointer" }}>
              {editingId ? "Update Checkpoint" : "Save Checkpoint"}
            </button>
            {editingId && (
              <button onClick={cancelEdit} style={{ background: "transparent", border: "1px solid #f87171", borderRadius: 6, padding: "6px 12px", color: "#f87171", cursor: "pointer" }}>
                Cancel
              </button>
            )}
          </div>
        )}
        {checkpoints && checkpoints.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="nw-table" style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th>Date</th><th>Actual</th><th>MC Median</th><th>vs Forecast</th>
                  <th>Growth Since</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {[...checkpoints].reverse().slice(0, 6).map(cp => {
                  // Shared helper — same string-compared month-day bug as the
                  // checkpoint dots in FanChart had.
                  const age = ageFromDob(dob, cp.date);
                  const p50AtAge  = (age !== null && mc?.pcts) ? (mc.pcts.find(d => d.age === age)?.p50 || 0) : 0;
                  const delta     = p50AtAge > 0 ? cp.value - p50AtAge : null;
                  const status    = p50AtAge > 0 ? (delta > 0 ? "Ahead" : delta < 0 ? "Behind" : "On track") : "Pre‑retirement";
                  const deltaColor = delta > 0 ? "#34d399" : delta < 0 ? "#f87171" : "var(--text-secondary)";

                  // Growth from this checkpoint to NOW
                  const currentPort  = params?.port || 0;
                  const growthAbs    = currentPort - cp.value;
                  const growthPct    = cp.value > 0 ? growthAbs / cp.value : 0;
                  const growthColor  = growthAbs >= 0 ? "#34d399" : "#f87171";

                  const isExpanded = expandedCpId === cp.id;

                  // Auto-generated narrative
                  const narrativeAge  = age !== null ? `age ${age}` : "that date";
                  const vsText        = delta !== null
                    ? `${Math.abs(delta / cp.value * 100).toFixed(1)}% ${delta >= 0 ? "ahead of" : "behind"} the median forecast (${fmtDollar(p50AtAge)})`
                    : "before the retirement simulation begins";
                  const growthText    = `Since this snapshot, the portfolio has ${growthAbs >= 0 ? "grown" : "declined"} ${growthAbs >= 0 ? "+" : ""}${fmtDollar(growthAbs)} (${growthAbs >= 0 ? "+" : ""}${(growthPct * 100).toFixed(1)}%) to today's ${fmtDollar(currentPort)}.`;
                  const noteText      = cp.note ? ` Note: "${cp.note}".` : "";
                  const narrative     = `At ${narrativeAge} on ${cp.date ? new Date(cp.date + "T00:00:00").toLocaleDateString() : "—"}, your portfolio was ${fmtDollar(cp.value)} — ${vsText}.${noteText} ${growthText}`;

                  return (
                    <React.Fragment key={cp.id}>
                      <tr
                        onClick={() => setExpandedCpId(isExpanded ? null : cp.id)}
                        style={{ cursor: "pointer", background: isExpanded ? "rgba(99,102,241,0.08)" : undefined }}
                      >
                        <td>
                          <span style={{ marginRight: 4, fontSize: 10, color: "var(--text-faint)" }}>{isExpanded ? "▼" : "▶"}</span>
                          {cp.date ? new Date(cp.date + "T00:00:00").toLocaleDateString() : "—"}
                          {cp.note && <span style={{ marginLeft: 6, fontSize: 14, color: "var(--text-muted)" }}>· {cp.note}</span>}
                        </td>
                        <td style={{ fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(cp.value)}</td>
                        <td style={{ color: "var(--text-muted)" }}>{p50AtAge > 0 ? fmtDollar(p50AtAge) : "—"}</td>
                        <td style={{ color: deltaColor, fontFamily: "'JetBrains Mono',monospace" }}>
                          {delta !== null ? (delta >= 0 ? "+" : "") + fmtDollar(delta) : "—"}
                          {delta !== null && p50AtAge > 0 && (
                            <span style={{ fontSize: 10, marginLeft: 4 }}>
                              ({delta >= 0 ? "+" : ""}{(delta / p50AtAge * 100).toFixed(1)}%)
                            </span>
                          )}
                        </td>
                        <td style={{ color: growthColor, fontFamily: "'JetBrains Mono',monospace" }}>
                          {(growthAbs >= 0 ? "+" : "") + fmtDollar(growthAbs)}
                          <span style={{ fontSize: 10, marginLeft: 4 }}>
                            ({growthAbs >= 0 ? "+" : ""}{(growthPct * 100).toFixed(1)}%)
                          </span>
                        </td>
                        <td style={{ color: deltaColor }}>{status}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <button onClick={() => startEdit(cp)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", marginRight: 4 }}>✏️</button>
                          <button onClick={() => onDeleteCheckpoint(cp.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>🗑️</button>
                          <button onClick={() => onSetBaselineFromCheckpoint(cp.value)} style={{ background: "none", border: "none", color: "var(--accent-teal)", cursor: "pointer", marginLeft: 4 }} title="Roll forward to this value">📍</button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: "rgba(99,102,241,0.05)" }}>
                          <td colSpan={7} style={{ padding: "10px 16px" }}>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, fontStyle: "italic", borderLeft: "3px solid rgba(99,102,241,0.4)", paddingLeft: 12 }}>
                              {narrative}
                            </div>
                            <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                              <div style={{ background: "var(--card-bg)", borderRadius: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Snapshot value</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(cp.value)}</div>
                              </div>
                              {p50AtAge > 0 && (
                                <div style={{ background: "var(--card-bg)", borderRadius: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>vs Median forecast</div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: deltaColor, fontFamily: "'JetBrains Mono',monospace" }}>
                                    {delta >= 0 ? "+" : ""}{fmtDollar(delta)} ({delta >= 0 ? "+" : ""}{(delta / p50AtAge * 100).toFixed(1)}%)
                                  </div>
                                </div>
                              )}
                              <div style={{ background: "var(--card-bg)", borderRadius: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Growth since snapshot</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: growthColor, fontFamily: "'JetBrains Mono',monospace" }}>
                                  {growthAbs >= 0 ? "+" : ""}{fmtDollar(growthAbs)} ({growthAbs >= 0 ? "+" : ""}{(growthPct * 100).toFixed(1)}%)
                                </div>
                              </div>
                              <div style={{ background: "var(--card-bg)", borderRadius: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Current portfolio</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(currentPort)}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </>)}
      </div>


      {/* ── Group 2: assumptions — panels the result was BUILT FROM ──── */}
      <GroupHeading
        label="What this is based on"
        sub="The method behind the simulation and every input it was given"
        accent="var(--text-muted)"
      />
      <div style={{ background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16 }}>
        <SectionHeader label="How this simulation works" open={showHow} onToggle={() => setShowHow(!showHow)} color="var(--text-muted)" />
        {showHow && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              A Monte Carlo simulation tests your retirement plan against <strong style={{ color: "#e2e8f0" }}>{MC_PATHS_LABEL} different market scenarios</strong> using randomized annual returns drawn from 99 years of actual S&P 500 history. Instead of assuming a single fixed growth rate, it models the real-world uncertainty of markets — some years boom, some years crash — and tells you how often your savings last through retirement. <strong style={{ color: "var(--accent-teal)" }}>A success rate above {Math.round(MC_SOLID_PLAN_RATE * 100)}% is generally considered a solid plan.</strong>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
              AiRA also applies <strong style={{ color: "var(--accent-gold)" }}>{getStrategyDescription(withdrawalStrategy)}</strong>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <div><div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>1. Accumulation (ages {params.currentAge}–{params.retireAge})</div>Each of {MC_PATHS_LABEL} paths independently draws a random S&P 500 year and a random bond year, blended by glide path weight. Contributions are added annually. The result is a unique portfolio value at retirement for each path.</div>
            <div><div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>2. Retirement spending</div>Each path draws fresh random returns year by year. {params.smile !== false ? "Spending follows the Blanchett smile curve." : "Spending stays flat in real terms (smile curve off)."} SS{params.ab > 0 ? " and Rental" : ""} income offset draws.{params.ab > 0 ? ` Rental fails ${Math.round(100 - (params.abReliability ?? 80))}% of years randomly.` : ""}{(params.hcProb ?? 3.5) > 0 ? ` Healthcare shocks hit ${params.hcProb ?? 3.5}% of years after age ${params.hcShockAge ?? 72}.` : ""}</div>
            <div><div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>3. {getStrategyLabel(resolveStrategy(withdrawalStrategy))} {resolveStrategy(withdrawalStrategy) === "gk" ? "guardrails" : "strategy"}</div>{strategyHowItWorks[resolveStrategy(withdrawalStrategy)] || strategyHowItWorks.gk}</div>
            <div><div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>4. Survival check</div>A path "succeeds" if the portfolio balance stays above $0 through the target age. The success rate is the percentage of paths that survive. The fan chart shows the 10th–90th percentile spread of all outcomes.</div>
            </div>
          </>
        )}
      </div>

      {/* Inputs collapsible — source of record for every model assumption. */}
      <div ref={inputsRef} style={{ background: "var(--card-bg)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16, scrollMarginTop: 16 }}>
        <SectionHeader label="Simulation inputs & assumptions" open={showInputs} onToggle={() => setShowInputs(!showInputs)} />
        {showInputs && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#0ea5e9", marginBottom: 10 }}>ACCUMULATION PHASE ({accPhase})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                <InputCard title="Starting Balances" rows={[...(params.accounts || []).filter(a => (a.balance || 0) > 0).map(a => [a.name || a.category, fmtDollar(a.balance || 0)]), ["Total liquid", fmtDollar(params.port)]]} />
                {/* "Total savings" used to print `params.contrib` alone — the
                    401(k) deferral — while calling itself the total, silently
                    omitting employer money, HSA, Roth and brokerage. It now
                    discloses every component, and the spouse's own streams and
                    stop age when they have them (§24.1). */}
                <InputCard title="Annual Contributions" rows={(() => {
                  const yrs = Math.max(0, params.retireAge - params.currentAge);
                  const spX = params.spouse || {};
                  const spTotal = spX.enabled ? (spX.contrib || 0) + (spX.employerContrib || 0) + (spX.rothContrib || 0) : 0;
                  const spStop = spX.enabled ? contribStopOnPrimaryClock(params) : Infinity;
                  const hsaY = params.hsaContrib != null ? params.hsaContrib : (params.hsaMonthly || 0) * 12;
                  const yourTotal = (params.contrib || 0) + (params.employerContrib || 0) + (params.rothContrib || 0);
                  const household = yourTotal + hsaY + (params.taxableContrib || 0) + spTotal;
                  return [
                    ["Your 401(k) + employer + Roth", fmtDollar(yourTotal) + "/yr"],
                    ...(spTotal > 0 ? [["Spouse 401(k) + employer + Roth", fmtDollar(spTotal) + "/yr"]] : []),
                    ...(hsaY > 0 ? [["HSA", fmtDollar(hsaY) + "/yr"]] : []),
                    ...(params.taxableContrib > 0 ? [["Brokerage", fmtDollar(params.taxableContrib) + "/yr"]] : []),
                    ["Total savings", fmtDollar(household) + "/yr"],
                    ["Years contributing", yrs + " yrs"],
                    ...(spTotal > 0 && Number.isFinite(spStop)
                      ? [["Spouse contributes until", `you are ${Math.round(Math.min(spStop, params.retireAge))}`]]
                      : []),
                    ["Projected added", fmtDollar(household * yrs)],
                  ];
                })()} />
                <InputCard title="Plan Parameters" rows={[["Current age", "Age " + params.currentAge], ["Retire age", "Age " + params.retireAge], ["Years to retirement", Math.max(0, params.retireAge - params.currentAge) + " yrs"], ["Pre-retirement glide", `${params.preRetireEq ?? 91}% equity / ${100 - (params.preRetireEq ?? 91)}% bonds`], ["Post-retirement glide", `${params.postRetireEq ?? 70}% equity / ${100 - (params.postRetireEq ?? 70)}% bonds`]]} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-purple)", marginBottom: 10 }}>WITHDRAWAL PHASE ({retPhase})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {/* Reports the smile curve the engine actually runs. This used
                    to claim fixed bands ("115% until 74, then 85%") that were
                    never implemented — and which would imply a 26% spending
                    cliff on a single birthday. The real model is a compounding
                    real rate; see spendingSmileFactor in engine/expenses.js. */}
                <InputCard title="Living Expenses" rows={[
                  ["Base annual spend", fmtDollar(params.sp) + "/yr"],
                  ["Spending model", params.smile !== false ? "Blanchett smile" : "Flat (real)"],
                  ...(params.smile !== false ? [
                    [`Age ${Math.min(80, params.endAge)}`, `${Math.round(spendingSmileFactor(Math.min(80, params.endAge), params.retireAge) * 100)}% of base (real)`],
                    [`Age ${Math.min(90, params.endAge)}`, `${Math.round(spendingSmileFactor(Math.min(90, params.endAge), params.retireAge) * 100)}% of base (real)`],
                  ] : []),
                ]} />
                <InputCard title="Income Offsets" rows={[["Social Security", `$${(params.ssb || 0).toLocaleString()}/yr @ ${params.ssAge || "—"}`], ["SS COLA", `${params.ssCola ?? 2.4}%/yr`], ["Rental income", params.ab > 0 ? `$${(params.ab || 0).toLocaleString()}/yr` : "Not set"], ["SS gap", `Ages ${params.retireAge}–${(params.ssAge || params.retireAge) - 1}: $0`]]} />
                <InputCard title="Additional Costs" rows={[[`Healthcare (age ${params.hcShockAge ?? 72}+)`, `${params.hcProb ?? 3.5}% shock prob/yr`], ["Shock range", `${fmtDollar(params.hcMin ?? 70000)}–${fmtDollar(params.hcMax ?? 130000)}`], ["Mortgage annual", mortAnnual > 0 ? fmtDollar(mortAnnual) + "/yr" : "Paid off"], ["Mortgage payoff", mortPayoffAge > 0 ? "~" + mortPayoffAge : "—"]]} />
              </div>
            </div>
            {/* One-off cash flows — rendered only when the user has entered at
                least one, so the panel does not grow an empty section for the
                common case. Inflows and outflows are separate cards because
                they are separate mechanics: a windfall is DEPOSITED into a
                bucket and compounds, a one-off cost is ADDED to that year's
                spend. Showing them in one list is what let a $1M inheritance
                read as a $1M expense. */}
            {(cfInflows.length > 0 || cfOutflows.length > 0) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-gold)", marginBottom: 10 }}>
                  ONE-OFF CASH FLOWS ({cfInflows.length + cfOutflows.length} event{cfInflows.length + cfOutflows.length === 1 ? "" : "s"})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {cfInflows.length > 0 && (
                    <InputCard title={`Income & Windfalls (${cfInflows.length})`} rows={[
                      ...cfInflowRows,
                      ["Total as entered", "+" + fmtDollar(cfInflows.reduce((s, e) => s + (Number(e.amount) || 0), 0))],
                    ]} />
                  )}
                  {cfOutflows.length > 0 && (
                    <InputCard title={`Planned One-Off Expenses (${cfOutflows.length})`} rows={[
                      ...cfOutflowRows,
                      ["Total as entered", "−" + fmtDollar(cfOutflows.reduce((s, e) => s + (Number(e.amount) || 0), 0))],
                    ]} />
                  )}
                  <InputCard title="How AiRA models these" rows={[
                    ["Windfalls", "Deposited to the account you chose, then compound"],
                    ["One-off costs", "Added on top of that year's spend"],
                    ["Timing", "Fires in one year only, accumulation or retirement"],
                    ["Applied to", `All ${MC_PATHS_LABEL} paths + the year-by-year plan`],
                  ]} />
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#34d399", marginBottom: 10 }}>MARKET & STATISTICAL MODEL</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                <InputCard title="Return Distribution" rows={[["Model", "Historical bootstrap"], ["Equity data", "99yr S&P 500 (1928–2026)"], [`Pre-retire mix (${params.preRetireEq ?? 91}/${100 - (params.preRetireEq ?? 91)})`, "Equity / Bonds"], [`Post-retire mix (${params.postRetireEq ?? 70}/${100 - (params.postRetireEq ?? 70)})`, "Equity / Bonds"]]} />
                <InputCard title="Inflation & Guardrails" rows={[["Inflation", "Historical bootstrap"], ["Inflation source", "2000–2024 actual CPI"], ["GK floor", fmtDollar(params.gkFloor) + "/yr"], ["GK ceiling", fmtDollar(params.gkCeiling) + "/yr"]]} />
                <InputCard title="Simulation Parameters" rows={[["Simulations", `${MC_PATHS_LABEL} paths`], ["Horizon", `Age ${params.endAge || 90} (your plan age)`], ["Withdrawal", getStrategyLabel(params.withdrawalStrategy || "smart")], ["Rental reliability", `${params.abReliability ?? 80}% per year`]]} />
              </div>
            </div>
          {(longHorizon || preMedicare > 0) && (
            <div style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.32)", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-gold)", marginBottom: 8 }}>
                ⚠ {longHorizon ? `${planHorizon}-YEAR RETIREMENT — ` : ""}WHAT THIS MODEL DOES NOT COVER
              </div>
              <div style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.65, marginBottom: 10 }}>
                Retiring at {effRetireAge} is fully simulated — {MC_PATHS_LABEL} paths across all {planHorizon} years,
                with the early-withdrawal penalty, the bridge to Social Security, and bracket-capped
                drawdown all modelled. What follows is not modelled, and it makes the plan look{" "}
                <strong style={{ color: "#e2e8f0" }}>better</strong> than it is:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {preMedicare > 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <strong style={{ color: "var(--accent-gold)" }}>Health insurance before Medicare is not modelled.</strong>{" "}
                    You have {preMedicare} years to cover before 65. AiRA models catastrophic healthcare
                    shocks but not ACA marketplace premiums — you must include them in your annual
                    spending yourself. Related: the Roth conversion planner optimises against tax
                    brackets and IRMAA, and IRMAA does not begin until 63. It does not know about ACA
                    premium subsidies, which phase out on income — so before 65 a conversion it
                    recommends can cost more in lost subsidy than it saves in tax.
                  </div>
                )}
                {longHorizon && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--accent-gold)" }}>The spending curve is extrapolated.</strong>{" "}
                  The Blanchett smile measures retirees in their 60s and 70s; applied from age {effRetireAge} it
                  assumes your real spending drifts down to about{" "}
                  {Math.round(spendingSmileFactor(Math.min(80, params.endAge), effRetireAge) * 100)}% of today's by 80.
                  That is well past the data it was fitted on. Turn off <strong>Smile spending</strong> in
                  the sidebar for a flat-real plan — a stricter and, over {planHorizon} years, more defensible test.
                </div>
                )}
                {longHorizon && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--accent-gold)" }}>4% is a 30-year rule.</strong>{" "}
                  Bengen and Guyton-Klinger were derived for ~30-year retirements. Over {planHorizon} years the
                  sustainable rate is materially lower — commonly cited near 3.0–3.5%. The success rate
                  above is computed honestly for the rate you chose; it is the <em>rule of thumb</em>, not
                  the simulation, that does not transfer.
                </div>
                )}
              </div>
            </div>
          )}
          </>
        )}
      </div>

    </div>
  );
}

function MortgageTab({ values, onChange }) {
  const bal   = values.mortBalance || 0;
  const rate  = values.mortRate    || 6.5;
  const extra = values.mortExtra   || 0;
  const start = values.mortStart   || "2020-01";
  const term  = values.mortTerm    || 30;

  const sched   = useMemo(() => mortgageSchedule(bal, rate, start, term, extra),  [bal, rate, start, term, extra]);
  const schedNE = useMemo(() => mortgageSchedule(bal, rate, start, term, 0),       [bal, rate, start, term]);
  const chartData = useMemo(() => {
    const maxLen = Math.max(sched.years.length, schedNE.years.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      yr: new Date().getFullYear() + i,
      "With extra": sched.years[i]?.bal ?? 0,
      Original:     schedNE.years[i]?.bal ?? 0,
    }));
  }, [sched, schedNE]);

  // Properties state — sourced from assumptions via values
  const properties = values.properties || [
    { id:"p1", label:"Primary Residence", value:0, mortgage:0, income:0 },
    { id:"p2", label:"Property 2",        value:0, mortgage:0, income:0 },
  ];

  const updateProp = (id, field, val) => {
    const updated = properties.map(p => p.id === id ? { ...p, [field]: val } : p);
    onChange("properties", updated);
    // Keep primary mortgage in sync with mortgage calculator
    if (id === properties[0]?.id && field === "mortgage") {
      onChange("mortBalance", val);
    }
  };

  const updateLabel = (id, label) => {
    onChange("properties", properties.map(p => p.id === id ? { ...p, label } : p));
  };

  const addProperty = () => {
    if (properties.length >= 5) return;
    onChange("properties", [
      ...properties,
      { id:"p"+Date.now(), label:`Property ${properties.length + 1}`, value:0, mortgage:0, income:0 },
    ]);
  };

  const removeProperty = (id) => {
    if (properties.length <= 1) return;
    onChange("properties", properties.filter(p => p.id !== id));
  };

  const totalValue    = properties.reduce((s, p) => s + (p.value||0), 0);
  const totalMortgage = properties.reduce((s, p) => s + (p.mortgage||0), 0);
  const totalEquity   = totalValue - totalMortgage;
  const totalIncome   = properties.reduce((s, p) => s + (p.income||0), 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      {/* ── PROPERTY CARDS ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0" }}>Properties</div>
          {properties.length < 5 && (
            <button onClick={addProperty}
              style={{ padding:"4px 12px", borderRadius:6,
                border:"1px dashed rgba(13,148,136,0.4)", background:"transparent",
                color:"var(--positive)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
              + Add property
            </button>
          )}
        </div>

        {properties.map((prop, idx) => {
          const equity  = (prop.value||0) - (prop.mortgage||0);
          const isFirst = idx === 0;
          return (
            <div key={prop.id} style={{
              background: isFirst ? "rgba(13,148,136,0.05)" : "var(--card-bg)",
              border:`1px solid ${isFirst ? "rgba(13,148,136,0.25)" : "var(--card-border)"}`,
              borderRadius:10, padding:14,
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <input type="text" value={prop.label}
                  onChange={e => updateLabel(prop.id, e.target.value)}
                  style={{ fontSize:13, fontWeight:600, color:"#e2e8f0",
                    background:"transparent", border:"none", outline:"none",
                    borderBottom:"1px solid rgba(255,255,255,0.12)",
                    padding:"2px 0", width:180, fontFamily:"'DM Sans',sans-serif" }}/>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {isFirst && (
                    <span style={{ fontSize:9, color:"var(--positive)",
                      background:"rgba(13,148,136,0.1)", border:"1px solid rgba(13,148,136,0.3)",
                      borderRadius:8, padding:"2px 7px" }}>
                      Primary · wired to mortgage calc
                    </span>
                  )}
                  {properties.length > 1 && (
                    <button onClick={() => removeProperty(prop.id)}
                      style={{ background:"transparent", border:"none", color:"var(--text-faint)",
                        cursor:"pointer", fontSize:13, padding:"2px 4px", transition:"color 0.15s" }}
                      onMouseEnter={e=>e.currentTarget.style.color="#f87171"}
                      onMouseLeave={e=>e.currentTarget.style.color="var(--text-faint)"}>
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:10, color:"var(--text-muted)", marginBottom:4 }}>Gross value</div>
                  {/* `max` bounds the DRAG range only — DualInput's typed field
                      accepts values above it (see Slider.commitDraft). A 999B max
                      here made one pixel of travel worth ~$1.4B, so the slider
                      could not land on any real house price. */}
                  <DualInput label="" value={prop.value||0} min={0} max={10_000_000} step={5_000}
                    format={v=>`$${Math.round(v).toLocaleString()}`} onChange={v=>updateProp(prop.id,"value",v)}/>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"var(--text-muted)", marginBottom:4 }}>Mortgage balance</div>
                  <DualInput label="" value={prop.mortgage||0} min={0} max={10_000_000} step={1_000}
                    format={v=>`$${Math.round(v).toLocaleString()}`} onChange={v=>updateProp(prop.id,"mortgage",v)}/>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"var(--text-muted)", marginBottom:4 }}>Annual income (opt)</div>
                  <DualInput label="" value={prop.income||0} min={0} max={200_000} step={1_000}
                    format={v=>`$${Math.round(v).toLocaleString()}/yr`} onChange={v=>updateProp(prop.id,"income",v)}/>
                </div>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:10, color:"var(--text-muted)" }}>Net equity:</span>
                <span style={{ fontSize:13, fontWeight:700,
                  fontFamily:"'JetBrains Mono',monospace",
                  color: equity >= 0 ? "var(--positive)" : "#f87171" }}>
                  {equity < 0 ? "-" : ""}{fmtDollar(Math.abs(equity))}
                </span>
                {(prop.income||0) > 0 && (
                  <span style={{ fontSize:10, color:"#059669" }}>
                    · {fmtDollar(prop.income)}/yr income
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Totals row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {[
            { l:"Total value",    v:totalValue,    c:"#0ea5e9" },
            { l:"Total mortgage", v:totalMortgage, c:"#f87171" },
            { l:"Total equity",   v:totalEquity,   c:"var(--positive)" },
            { l:"Annual income",  v:totalIncome,   c:"var(--accent-purple)" },
          ].map(m => (
            <div key={m.l} className="met">
              <div className="ml">{m.l}</div>
              <div className="mv" style={{ color:m.c, fontSize:16 }}>{fmtDollar(m.v)}</div>
              <div className="ms">{formulaFor("bucket-metrics")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PRIMARY MORTGAGE CALCULATOR ── */}
      <div className="chart-card">
        <div className="ct">{properties[0]?.label || "Primary Residence"} · Mortgage calculator</div>

        <div className="metrics" style={{ marginBottom:12 }}>
          <div className="met">
            <div className="ml">Current balance</div>
            <div className="mv" style={{ color:"#0ea5e9", fontSize:18 }}>{fmtDollar(bal)}</div>
          </div>
          <div className="met">
            <div className="ml">Payoff year</div>
            <div className="mv" style={{ color:"var(--positive)", fontSize:18 }}>{sched.payoffYr}</div>
            <div className="ms">With ${extra}/mo extra</div>
          </div>
          <div className="met">
            <div className="ml">Interest saved</div>
            <div className="mv" style={{ color:"#34d399", fontSize:18 }}>{fmtDollar(sched.interestSaved)}</div>
            <div className="ms">vs no extra</div>
          </div>
          <div className="met">
            <div className="ml">Monthly P&I</div>
            <div className="mv" style={{ color:"var(--text-secondary)", fontSize:18 }}>{fmtDollar(sched.pmt)}</div>
            <div className="ms">At {rate}% fixed</div>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
          <DualInput label="Balance" value={bal} min={0} max={1_500_000} step={1_000}
            format={v=>fmtDollar(v)}
            onChange={v=>{ onChange("mortBalance",v); updateProp(properties[0]?.id,"mortgage",v); }}/>
          <DualInput label="Rate %" value={rate} min={0} max={12} step={0.125}
            format={v=>v.toFixed(3)+"%"} onChange={v=>onChange("mortRate",v)}/>
          <DualInput label="Term (yrs)" value={term} min={10} max={30} step={1}
            format={v=>v+" yrs"} onChange={v=>onChange("mortTerm",v)}/>
          <DualInput label="Extra/mo" value={extra} min={0} max={5_000} step={50}
            format={v=>"$"+v.toLocaleString()+"/mo"} onChange={v=>onChange("mortExtra",v)}/>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:11, color:"var(--text-secondary)", minWidth:70 }}>Start date</span>
            <MonthYearSelect value={start} onSet={v=>onChange("mortStart",v)}/>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top:8, right:8, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)"/>
            <XAxis dataKey="yr" stroke="#1e3a5f" tick={{ fill:"var(--text-faint)", fontSize:9 }}/>
            <YAxis stroke="#1e3a5f" tick={{ fill:"var(--text-faint)", fontSize:9 }}
              tickFormatter={v=>fmtDollar(v)} width={MONEY_AXIS_WIDTH}/>
            <Tooltip content={<Tip/>}/>
            <Line type="monotone" dataKey="With extra" stroke="var(--positive)" strokeWidth={2.5} dot={false}/>
            <Line type="monotone" dataKey="Original" stroke="var(--text-faint)" strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── AMORTIZATION TABLE ── */}
      <div className="chart-card">
        <div className="ct">Amortization — first 10 years with extra payments</div>
        <table className="nw-table">
          <thead>
            <tr><th>Year</th><th>Principal</th><th>Interest</th><th>Extra</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {sched.years.slice(0,10).map(r => (
              <tr key={r.yr}>
                <td style={{ textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>{r.yr}</td>
                <td>{fmtDollar(r.pPaid)}</td>
                <td style={{ color:"#f87171" }}>{fmtDollar(r.iPaid)}</td>
                <td style={{ color:"#34d399" }}>{fmtDollar(r.ePaid)}</td>
                <td style={{ color:"#0ea5e9" }}>{fmtDollar(r.bal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The Monte Carlo median portfolio for one age, or `null` when there is no
 * figure for that age.
 *
 * `null`, never 0. The Net Worth chart used to do:
 *
 *   const pctIndex = Math.min(age - retireAge, pcts.length - 1);
 *   port = pcts[pctIndex]?.p50 || 0;
 *
 * which produced a confident $0 in three unrelated situations — genuinely zero,
 * no data for this age, and NaN (falsy, so `|| 0` swallowed it). A user reported
 * a plan the engine scores at 99.2% success, median $4.05M at 68 and $10.9M at
 * 90, rendered as $0 from 68 through 90. Nothing on screen distinguished that
 * from a portfolio that had actually died.
 *
 * The clamp was the other half: `Math.min` repeated the final row for every age
 * past the end of the data, so a run whose horizon was shorter than `endAge`
 * grew a flat tail of fabricated years — which the "net worth at age" card then
 * reported as a forecast.
 *
 * Rows are matched on the `age` they carry themselves, falling back to
 * positional arithmetic only for older result objects that predate that field.
 * Positional indexing silently mis-aligns whenever `mc` is stale — computed at a
 * different retireAge than the one now being charted.
 *
 * @param {Array<{age?:number, p50:number}>} pcts  runMC's percentile rows
 * @param {number} age                             the age wanted
 * @param {number} retireAge                       fallback origin for legacy rows
 * @returns {number|null}
 */
function mcMedianAtAge(pcts, age, retireAge) {
  if (!Array.isArray(pcts) || pcts.length === 0) return null;
  let row = pcts.find((d) => d && d.age === age);
  if (!row && !Number.isFinite(pcts[0]?.age)) {
    // Legacy rows without `age`: derive the index, but do NOT clamp — an index
    // past the end means "not modelled", which is exactly what null says.
    const i = age - retireAge;
    row = i >= 0 && i < pcts.length ? pcts[i] : null;
  }
  return row && Number.isFinite(row.p50) ? row.p50 : null;
}

function NetWorthTab({ p, mc, inf }) {
  const [showRE, setShowRE] = useState(false);
  const props    = p.properties || [];
  const reTotal   = props.reduce((s, pr) => s + (pr.value||0), 0);
  const reMortgs  = props.reduce((s, pr) => s + (pr.mortgage||0), 0);
  const reEquity  = reTotal - reMortgs;
  const mortSched = useMemo(
    () =>
      mortgageSchedule(
        p.mortBalance,
        p.mortRate,
        p.mortStart,
        p.mortTerm,
        p.mortExtra
      ),
    [p]
  );

  const nwData = useMemo(() => {
    if (!mc) return [];

    // Current liquid portfolio from accounts (matches home page sidebar)
    const currentPort = (p.accounts || []).reduce((s, a) => s + (a.balance || 0), 0) || p.port || 0;
    const preReturnRate = expectedReturn(p.preRetireEq ?? 91) / 100;

    const maxChartAge = p.endAge;
    const step = 1;
    const ages = [];
    for (let age = p.currentAge; age <= maxChartAge; age += step) {
      ages.push(age);
    }

    return ages.map((age, idx) => {
      const yr = new Date().getFullYear() + idx * step;

      let port;
      if (age < p.retireAge) {
        // Accumulation phase: grow from current portfolio deterministically
        const yearsToAge = age - p.currentAge;
        let acc = currentPort;
        for (let y = 0; y < yearsToAge; y++) {
          // Household total per year, not the 401(k) line alone — and it drops
          // the spouse's streams on their own retirement date (§24.1), so this
          // projection tracks the engines instead of drifting from them.
          // Grow, then add the year's contributions AND any one-off inflow that
          // lands in it — the same order and the same year mapping the engines
          // use (accumulation year y = CURRENT_YEAR + y). Without the inflow term
          // this curve ignored windfalls until retirement, then handed over to the
          // MC median which HAD counted them: the jump landed on the retirement
          // year regardless of the year the user entered. Inflows only, matching
          // the engines — pre-retirement one-off costs are presumed paid from wages.
          acc = acc * (1 + preReturnRate) + householdAnnualContribution(p, p.currentAge + y)
              + computeCashFlowEvents(p.cashFlowEvents, CURRENT_YEAR + y, p.inf ?? 2.5, CURRENT_YEAR).inflow;
        }
        port = Number.isFinite(acc) ? Math.round(acc) : null;
      } else {
        // Retirement phase: the MC median for THIS age.
        //
        // Looked up BY AGE, not by array position. This used to be
        //   pctIndex = Math.min(age - p.retireAge, pcts.length - 1)
        //   port     = pcts[pctIndex]?.p50 || 0
        // which had two failure modes, both of which drew a confident $0:
        //
        //   1. `Math.min` CLAMPED past the end of the data, so every age beyond
        //      the Monte Carlo horizon repeated the final entry. A plan whose
        //      horizon is shorter than `endAge` got a flat line of fabricated
        //      years, and the "net worth at age" card below read that fabricated
        //      value as though it were a forecast.
        //   2. `|| 0` collapsed THREE different states into one number —
        //      genuinely zero, no data, and NaN. NaN is falsy, so a single
        //      broken input rendered as $0 from the poisoned year onward,
        //      indistinguishable from a real answer. A user reported exactly
        //      that: a plan the engine scores at 99.2% success, with a median
        //      of $4.05M at 68 and $10.9M at 90, drawn as $0 from 68 to 90.
        //
        // Positional indexing also silently mis-aligned whenever `mc` was stale
        // (computed at a different retireAge than the one being charted); the
        // rows carry their own `age`, so use it.
        port = mcMedianAtAge(mc.pcts, age, p.retireAge);
      }

      const mortEntry = mortSched.years.find((y) => y.yr === yr);
      const mortBal = mortEntry ? mortEntry.bal : 0;
      const yearsFromNow = yr - new Date().getFullYear();
      const reGrow = Math.pow(1 + (p.reGrowthRate ?? 3.0) / 100, yearsFromNow);
      const re = showRE ? Math.round(reTotal * reGrow) : 0;
      // null (not 0) where there is no portfolio figure: Recharts breaks the
      // line on null, which is the honest rendering of "not modelled". Net
      // Worth has to break with it, or the chart would keep drawing
      // `re - mortBal` as if it were a projection.
      return {
        age,
        "Liquid Portfolio": port,
        "Mortgage Debt": -mortBal,
        "Real Estate": re,
        "Net Worth": port == null ? null : port + re - mortBal,
      };
    });
  }, [p, mc, showRE, mortSched, reTotal]);

  // Peak liquid portfolio (median). Both of these read the row's OWN age rather
  // than deriving it from `retireAge + index`, and both ignore non-finite p50s —
  // one NaN used to turn the headline figure into NaN via Math.max.
  const finitePcts = useMemo(
    () => (mc ? mc.pcts.filter((d) => Number.isFinite(d.p50)) : []),
    [mc]
  );
  const peakRow = finitePcts.reduce(
    (best, d) => (best == null || d.p50 > best.p50 ? d : best),
    null
  );
  const peakPort = peakRow ? peakRow.p50 : 0;
  const peakAge = peakRow ? (peakRow.age ?? p.retireAge + finitePcts.indexOf(peakRow)) : 0;

  // The last age the chart actually HAS a figure for, and the final value there.
  // Reporting `p.endAge` when the data stops earlier is what let the summary card
  // announce "$0 at age 90" for a plan that was never modelled to 90.
  const lastRealRow = [...nwData].reverse().find((d) => d["Net Worth"] != null);
  const finalNW = lastRealRow ? lastRealRow["Net Worth"] : 0;
  const lastDataAge = lastRealRow ? lastRealRow.age : null;
  const planAge = p.endAge;
  const dataStopsEarly = lastDataAge != null && lastDataAge < planAge;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="metrics">
        <div className="met">
          <div className="ml">Peak liquid (median)*</div>
          <div className="mv" style={{ color: "var(--positive)", fontSize: 18 }}>
            {fmtDollar(peakPort)}
          </div>
          <div className="ms">Age {peakAge}</div>
        </div>
        {/* Names the age the number is actually FOR. It used to always say
            `planAge` (the age you typed) even when the projection stopped
            earlier, so a missing-data $0 was presented as "net worth at 90". */}
        <div className="met">
          <div className="ml">Net worth at age {lastDataAge ?? planAge}</div>
          <div className="mv" style={{ color: dataStopsEarly ? "var(--accent-gold)" : "#0ea5e9", fontSize: 18 }}>
            {fmtDollar(finalNW)}
          </div>
          <div className="ms">
            {showRE ? "Incl." : "Excl."} real estate
            {dataStopsEarly && (
              <span style={{ color: "var(--accent-gold)" }}> · projection stops here, not {planAge}</span>
            )}
          </div>
        </div>
        <div className="met">
          <div className="ml">Mortgage‑free</div>
          <div className="mv" style={{ color: "var(--accent-purple)", fontSize: 18 }}>
            {mortSched.payoffYr}
          </div>
          <div className="ms">With extra payments</div>
        </div>
        <div className="met">
          <div className="ml">Real estate equity</div>
          <div className="mv" style={{ color: "var(--accent-gold)", fontSize: 18 }}>
            {fmtDollar(reEquity)}
          </div>
          <div className="ms">NOT in liquid total</div>
        </div>
        {/* This card rendered THREE different quantities under one label
            ("Safe spending target") and one strategy caption. Only two of the
            three are computed; the middle branch — by far the most common,
            since it fires for every strategy except `fixed` once a target is
            entered — just echoes the user's own number back. Captioning that
            "GK guardrails" attributed the figure to a strategy that had not
            touched it. Each branch now states what it actually is, and all
            three disclose the after-tax basis (runMC draws tax on top of the
            target, never out of it — see the fixed-point loop in runMC). */}
        {(() => {
          const port     = (p.accounts||[]).reduce((s,a)=>s+(a.balance||0),0) || p.port || 0;
          const strategy = resolveStrategy(p.withdrawalStrategy);
          const rate     = p.fixedWithdrawalRate || 0.04; // always decimal in params (normalized in the params memo)
          // No literal fallback rate: the benchmark the rest of the app shows
          // is the user's own safeWithdrawalRate, so this card uses the same one.
          const benchRate = p.safeWithdrawalRate ?? 0.04;
          const pctOf     = (r) => (r * 100).toFixed(1).replace(/\.0$/, "");
          const STRAT = { gk:"Guyton-Klinger guardrails", fixed:"Fixed %", vpw:"VPW", ninety_five_rule:"95% rule", bengen:"Bengen 4% rule", smart:"Smart Waterfall" };

          let monthly, label, note, hint;
          if (strategy === "fixed") {
            monthly = Math.round(port * rate / 12);
            label   = "Spending target";
            note    = `${pctOf(rate)}% of portfolio · per month · after tax`;
            hint    = `Computed: ${pctOf(rate)}% of your ${fmtDollar(port)} portfolio, divided by 12. This is money to spend after tax — the engine withdraws extra to cover the tax bill on top of it.`;
          } else if (p.sp > 0) {
            monthly = Math.round(p.sp / 12);
            label   = "Your spending target";
            note    = `what you entered · per month · after tax`;
            hint    = `The annual spending target you entered (${fmtDollar(p.sp)}), shown monthly. This is not a figure AiRA computed — the success rate is what tells you whether it holds. ${STRAT[strategy] || strategy} adjusts it year to year during the simulation. Money to spend after tax: the engine withdraws extra to cover the tax bill on top of it.`;
          } else {
            monthly = Math.round(port * benchRate / 12);
            label   = "Estimated spending target";
            note    = `${pctOf(benchRate)}% of portfolio · no target set · after tax`;
            hint    = `You have not entered a spending target, so this is a placeholder: ${pctOf(benchRate)}% of your ${fmtDollar(port)} portfolio, divided by 12. Enter your real target in Profile → Spending. Money to spend after tax.`;
          }

          return (
            <div className="met" title={hint}>
              <div className="ml">{label}</div>
              {/* fmtDollar, not an inline toLocaleString — one money helper
                  (CLAUDE.md). Inline formatting is how an abbreviator slipped in
                  unnoticed once already. */}
              <div className="mv" style={{ color: "#4ade80", fontSize: 18 }}>{fmtDollar(monthly)}</div>
              <div className="ms">{note}</div>
            </div>
          );
        })()}
      </div>

      <div className="chart-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="ct" style={{ margin: 0 }}>
              {showRE ? "Net Worth Projection" : "Portfolio Projection (ex. Real Estate)"} · 5‑year Intervals to Age {lastDataAge ?? planAge} · Median MC Path
            </div>
            <span
              style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 12 }}
              title="Liquid Portfolio = investments (excl. real estate). Mortgage Debt shown as negative (dashed red line). Net Worth = Liquid + Real Estate - Mortgage Debt."
            >
              <span role="img" aria-label="information" style={{ color: "#60a5fa" }}>ℹ️</span>
            </span>
          </div>
          <Toggle
            val={showRE}
            onChange={setShowRE}
            label="Include Real Estate In Projection"
            accent="var(--accent-gold)"
          />
        </div>

        <ResponsiveContainer width="100%" height={540}>
          <LineChart
            data={nwData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis
              dataKey="age"
              stroke="#1e3a5f"
              tick={{ fill: "var(--text-faint)", fontSize: 9 }}
            />
            <YAxis
              stroke="#1e3a5f"
              tick={{ fill: "var(--text-faint)", fontSize: 9 }}
              tickFormatter={(v) => fmtDollar(v)}
              width={MONEY_AXIS_WIDTH}
            />
            <Tooltip content={<Tip />} />
            <Line
              type="monotone"
              dataKey="Liquid Portfolio"
              stroke="#0ea5e9"
              strokeWidth={2.5}
              dot={false}
            />
            {showRE && (
              <Line
                type="monotone"
                dataKey="Real Estate"
                stroke="var(--accent-gold)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="Mortgage Debt"
              stroke="#f87171"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Net Worth"
              stroke="var(--positive)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* A break in the line now means "no figure for these years" and says so.
            Before, those years were drawn as $0 — a plan the engine scores at 99%
            success could appear to end broke. Silence is better than a wrong
            number, but a stated reason is better than silence. */}
        {dataStopsEarly && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "rgba(251,146,60,0.10)", border: "1px solid rgba(251,146,60,0.35)",
            fontSize: 11, color: "#fdba74", lineHeight: 1.55,
          }}>
            <strong>The line stops at age {lastDataAge}.</strong> The last Monte Carlo run covers
            ages {p.retireAge}–{lastDataAge}, not through {planAge}, so ages {lastDataAge + 1}–{planAge} are
            left blank rather than guessed. If you changed your retirement or planning age since the
            last run, press <strong>▶ Run Monte Carlo</strong> to refresh. If it keeps stopping short,
            one of your inputs is producing an invalid number for those years — a one-off cash-flow
            event or income entry with a blank or malformed amount is the usual cause.
          </div>
        )}

        {/* Legend */}
        <div className="leg" style={{ marginTop: 8, justifyContent: "center" }}>
          <div className="li"><div className="ll" style={{ background: "#0ea5e9" }} />Liquid Portfolio</div>
          <div className="li"><div className="ll" style={{ background: "#f87171", borderTop: "1px dashed #f87171", height: 2 }} />Mortgage Debt (dashed)</div>
          {showRE && <div className="li"><div className="ll" style={{ background: "var(--accent-gold)" }} />Real Estate</div>}
          <div className="li"><div className="ll" style={{ background: "var(--positive)" }} />{showRE ? "Net Worth" : "Portfolio (ex. RE)"}</div>
        </div>

        {/* Footnote about peak age */}
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>
          * Peak liquid based on the full Monte Carlo horizon (your plan age, {p.endAge}).
        </div>
      </div>

      {!mc && (
        <div className="flag-i">
          ℹ Run Monte Carlo first to see net worth projections.
        </div>
      )}
    </div>
  );
}

// ─── Priority colors ──────────────────────────────────────────────────────────
const PRIORITY_COLOR = {
  red:    { border: "var(--negative)", bg: "rgba(239,68,68,0.07)",  label: "#f87171", dot: "🔴" },
  yellow: { border: "#f59e0b", bg: "rgba(245,158,11,0.07)", label: "var(--accent-gold)", dot: "🟡" },
  green:  { border: "var(--positive)", bg: "rgba(16,185,129,0.07)", label: "#34d399", dot: "🟢" },
};

// ─── Milestone timeline ───────────────────────────────────────────────────────
function buildMilestones(params, rmdAge) {
  const age       = params?.currentAge  || 56;
  const retireAge = params?.retireAge   || 65;
  const ssAge     = params?.ssAge       || 67;
  const yr        = new Date().getFullYear();
  const hasPreTax = (params?.accounts || []).some(a => a.category === "pretax" && (a.balance || 0) > 0);
  const rmd       = rmdAge || getRmdStartAge({ currentAge: age });

  const all = [
    {
      age: age, label: "Now", year: yr,
      items: [
        "Review your withdrawal rate — target below 4%",
        "Ensure emergency fund covers 6 months of expenses",
        "Verify beneficiary designations on all accounts",
      ],
    },
    age < 50 && {
      age: 50, label: "Catch-Up Contributions", year: yr + (50 - age),
      items: [
        "401k limit increases by $7,500/yr (catch-up)",
        "IRA limit increases by $1,000/yr",
        "Review asset allocation — consider gradual de-risking",
      ],
    },
    age < 55 && {
      age: 55, label: "Age 55 Benefits", year: yr + (55 - age),
      items: [
        "HSA catch-up increases by $1,000/yr",
        "Rule of 55 — penalty-free 401k withdrawals if retiring this year",
        "Start projecting Medicare bridge costs if retiring before 65",
      ],
    },
    age < 60 && {
      age: 60, label: "Super Catch-Up (SECURE 2.0)", year: yr + (60 - age),
      items: [
        "401k limit rises to $34,750/yr for ages 60–63 only",
        "Maximize this 4-year window — largest single tax-shelter opportunity",
        "Consider Roth conversion ladder if retiring at 60",
      ],
    },
    {
      age: retireAge, label: "Retirement", year: yr + (retireAge - age),
      items: [
        "Begin tax-optimal withdrawal: HSA first (medical) → taxable → pre-tax → Roth last",
        "Shift to inflation-adjusted withdrawal strategy",
        retireAge < 65 ? `Bridge to Medicare — budget for ACA marketplace until age 65` : "Enroll in Medicare Parts A and B",
        `Social Security: ${ssAge > retireAge ? `consider delaying to age ${ssAge} for higher benefit` : "claim at retirement"}`,
      ],
    },
    retireAge < 65 && {
      age: 65, label: "Medicare Enrollment", year: yr + (65 - age),
      items: [
        "Enroll during 7-month Initial Enrollment Period (3 months before 65)",
        "IRMAA surcharge if income >$103,000 single or >$206,000 MFJ",
        "Stop HSA contributions at 65 (Medicare makes you ineligible)",
        "Compare Original Medicare vs Medicare Advantage",
      ],
    },
    ssAge !== retireAge && {
      age: ssAge, label: `Social Security — Age ${ssAge}`, year: yr + (ssAge - age),
      items: [
        `Claim SS benefit — delayed past FRA earns +8%/yr in higher lifetime income`,
        "Coordinate SS timing with Roth conversions to minimize IRMAA",
        "File for Medicare 3 months before 65 even if delaying SS",
      ],
    },
    hasPreTax && age < rmd && {
      age: rmd, label: "Required Minimum Distributions", year: yr + (rmd - age),
      items: [
        `RMDs begin at age ${rmd} — distributions from 401k/IRA are fully taxable ordinary income`,
        "25% penalty on any missed RMD amount",
        `Do Roth conversions before age ${rmd} to shrink the pre-tax balance`,
        "QCDs (qualified charitable distributions) offset RMDs tax-free if charitably inclined",
      ],
    },
  ].filter(Boolean).sort((a, b) => a.age - b.age);

  return all;
}

function MilestonesSection({ params, rmdAge }) {
  const [open, setOpen] = useState(false);
  const milestones = buildMilestones(params, rmdAge);
  if (!milestones.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%",
          marginBottom: open ? 12 : 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#6366f1", transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6366f1" }}>
          📅 Age Milestones
        </span>
        <span style={{ fontSize: 10, color: "var(--text-faint)", marginLeft: 4 }}>({milestones.length} milestones)</span>
      </button>
      {open && (
      <div style={{ position: "relative" }}>
        {milestones.map((m, idx) => (
          <div key={m.age} style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            {/* Timeline spine */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(99,102,241,0.15)", border: "2px solid rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#818cf8", flexShrink: 0,
              }}>
                {m.age === (params?.currentAge || 56) ? "Now" : m.age}
              </div>
              {idx < milestones.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 16, background: "rgba(99,102,241,0.2)", marginTop: 4 }} />
              )}
            </div>
            {/* Milestone card */}
            <div style={{
              flex: 1, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)",
              borderRadius: 9, padding: "10px 14px", marginBottom: 2,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", marginBottom: 6 }}>
                {m.label}
                <span style={{ fontWeight: 400, color: "var(--text-faint)", marginLeft: 8 }}>{m.year}</span>
              </div>
              {m.items.map((item, j) => (
                <div key={j} style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3, display: "flex", gap: 6 }}>
                  <span style={{ color: "#6366f1", flexShrink: 0 }}>•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// ─── Card step lookup ─────────────────────────────────────────────────────────
function getCardSteps(card) {
  if (card.steps?.length) return card.steps;
  const a = (card.action   || "").toLowerCase();
  const c = (card.category || "").toLowerCase();
  if (a.includes("roth") || c.includes("roth")) return [
    "Calculate your current marginal tax bracket for this year",
    "Convert up to the top of your bracket — stop before jumping to the next",
    "Model the conversion in AiRA's Tax Room tab to see the IRMAA impact",
    "Pay the conversion tax from taxable cash, not from the IRA itself",
  ];
  if (a.includes("withdrawal rate") || a.includes("swr") || a.includes("spending")) return [
    "Target a sustainable rate — 3.5–4% is the historical safe zone",
    "Switch to a dynamic strategy (Guardrails, VPW) to flex with markets",
    "Build a 1–2 year cash buffer so you never sell equities in a downturn",
    "Re-run Monte Carlo in AiRA after any spending or portfolio change",
  ];
  if (a.includes("social security") || c.includes("social security")) return [
    "Get your personalized estimate at SSA.gov → my Social Security",
    "Each year of delay past 62 adds roughly 6–8% to your monthly benefit",
    "Run the breakeven analysis — typically breaks even around age 79–82",
    "Coordinate timing with your spouse to maximize survivor benefit",
  ];
  if (a.includes("rmd") || a.includes("required minimum")) return [
    "Calculate this year's RMD using the IRS Uniform Lifetime Table",
    "Do Roth conversions now to reduce the pre-tax balance before RMDs begin",
    "Set up automatic distributions so you never miss the year-end deadline",
    "Consider QCDs (Qualified Charitable Distributions) to offset RMD income tax-free",
  ];
  if (a.includes("irmaa") || a.includes("medicare")) return [
    "Check the IRMAA brackets — Medicare uses your MAGI from 2 years ago",
    "Keep MAGI below the first cliff ($103,000 single / $206,000 MFJ) when possible",
    "Roth conversions this year affect Medicare premiums in two years — plan ahead",
    "If income dropped (retirement, death of spouse), file for IRMAA appeal (SSA-44)",
  ];
  if (a.includes("emergency") || a.includes("cash reserve") || a.includes("liquidity")) return [
    "Target 6 months of essential expenses in a high-yield savings account",
    "Current HYSA rates are 4%+ — don't leave this in a checking account",
    "Keep this separate from your investment portfolio — don't count brokerage cash",
    "Replenish immediately after any large withdrawal",
  ];
  if (a.includes("beneficiar")) return [
    "Log into each account (401k, IRA, life insurance) and check current beneficiaries",
    "Ensure primary and contingent beneficiaries are named — don't leave it blank",
    "Update after major life events: marriage, divorce, death, new children",
    "Confirm beneficiary designations override your will — they're separate legal documents",
  ];
  return [];
}

// ─── Action plan row ──────────────────────────────────────────────────────────
function ActionPlanRow({ card, isSelected, onClick }) {
  const C = PRIORITY_COLOR[card.priority] || PRIORITY_COLOR.yellow;
  return (
    <div
      onClick={onClick}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        padding:      "10px 14px",
        borderRadius: 8,
        background:   isSelected ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
        border:       `1px solid ${isSelected ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
        cursor:       "pointer",
        transition:   "all 0.12s",
        marginBottom: 4,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--row-highlight)"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.border, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.label, marginBottom: 1, display: "flex", alignItems: "center", gap: 5 }}>
          {card.category}
          {card.isLiveData  && <span style={{ color: "#22d3ee",  fontSize: 9 }}>🌐 LIVE</span>}
          {card.aiGenerated && !card.isLiveData && <span style={{ color: "var(--accent-purple)", fontSize: 9 }}>✦ AI</span>}
          {card.aiChecked && (
            <span style={{
              background: card.aiNote ? "rgba(99,102,241,0.15)" : "rgba(71,85,105,0.18)",
              color:      card.aiNote ? "#818cf8"                : "var(--text-muted)",
              border:     `1px solid ${card.aiNote ? "rgba(99,102,241,0.3)" : "rgba(71,85,105,0.3)"}`,
              borderRadius: 4, padding: "1px 5px", fontSize: 8, fontWeight: 700,
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              🤖 {card.aiNote ? "AI insight" : "AI reviewed"}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.action}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0, whiteSpace: "nowrap" }}>{card.deadline}</div>
      <div style={{ fontSize: 14, color: isSelected ? "#818cf8" : "#334155", flexShrink: 0 }}>›</div>
    </div>
  );
}

// ─── Card detail panel ────────────────────────────────────────────────────────
function CardDetailPanel({ card, onClose }) {
  const C     = PRIORITY_COLOR[card.priority] || PRIORITY_COLOR.yellow;
  const steps = getCardSteps(card);
  const label = card.priority === "red" ? "CRITICAL" : card.priority === "yellow" ? "IMPORTANT" : "ON TRACK";

  return (
    <div style={{
      background:   "rgba(15,23,42,0.98)",
      border:       `1px solid ${withAlpha(C.border, "40")}`,
      borderTop:    `3px solid ${C.border}`,
      borderRadius: 10,
      padding:      "20px",
      position:     "sticky",
      top:          8,
      maxHeight:    "80vh",
      overflowY:    "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{
              background: C.bg, border: `1px solid ${C.border}`, color: C.label,
              borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
            }}>{label}</span>
            <span style={{
              background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)",
              borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600,
            }}>{card.category}</span>
            {card.isLiveData  && <span style={{ background: "rgba(6,182,212,0.1)", color: "#22d3ee", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>🌐 LIVE</span>}
            {card.aiGenerated && !card.isLiveData && <span style={{ background: "rgba(167,139,250,0.1)", color: "var(--accent-purple)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>✦ AI</span>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.4 }}>{card.action}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 20, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      {/* Details */}
      {card.reason && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--text-faint)", marginBottom: 6 }}>DETAILS</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65 }}>{card.reason}</div>
        </div>
      )}

      {/* What to do */}
      {steps.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--text-faint)", marginBottom: 8 }}>WHAT TO DO</div>
          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#818cf8",
              }}>{i + 1}</div>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.55, paddingTop: 2 }}>{step}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI insight */}
      {card.aiNote ? (
        <div style={{
          background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#818cf8", marginBottom: 4 }}>🤖 AI INSIGHT</div>
          <div style={{ fontSize: 12, color: "var(--accent-purple)", lineHeight: 1.55 }}>{card.aiNote}</div>
        </div>
      ) : card.aiChecked ? (
        <div style={{
          background: "rgba(71,85,105,0.08)", border: "1px solid rgba(71,85,105,0.2)",
          borderRadius: 8, padding: "8px 14px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>✓</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>AI reviewed — this card is already comprehensive, nothing to add.</span>
        </div>
      ) : null}

      {/* Source */}
      {card.source && (
        <div style={{ fontSize: 11, color: "#22d3ee", marginBottom: 12 }}>📡 Source: {card.source}</div>
      )}

      {/* Deadline */}
      <div style={{ fontSize: 12, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 6, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        ⏱ <span style={{ color: "var(--text-muted)" }}>{card.deadline}</span>
      </div>
    </div>
  );
}

// ─── ActionPlanTab ────────────────────────────────────────────────────────────
function ActionPlanTab({ params, mc, assumptions, mortgagePayoffYear, rmdAge: rmdAgeProp }) {
  const currentYear = new Date().getFullYear();
  const retireYear = currentYear + ((params?.retireAge || 60) - (params?.currentAge || 56));
  const daysToRetire = Math.max(0,
    Math.floor((new Date(`${retireYear}-03-15`) - new Date()) / 86400000)
  );

  const [cards, setCards]               = useState(null);
  const [loadingAI, setLoadingAI]       = useState(false);
  const [aiError, setAiError]           = useState(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  // Re-open the recovery link later. Shown once at purchase, but a user who
  // clicked past it then has no way back to the only thing that protects their
  // purchase — so it stays reachable from the panel that shows the balance.
  const [showRecovery, setShowRecovery] = useState(false);
  const [showRestore, setShowRestore]   = useState(false);
  const [liveCards, setLiveCards]       = useState(null);
  const [loadingLive, setLoadingLive]   = useState(false);
  const [liveError, setLiveError]       = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [filterPriority, setFilter]     = useState("all");
  const creditBalance                    = useCreditBalance();

  const runAI = async (baseCards) => {
    const { runAIActionPlan, profileIsComplete } = await import("./ai/ai-analysis.js");
    console.log("[AI] runAI called. profileIsComplete:", profileIsComplete(params, mc));
    console.log("[AI] geminiApiKey present:", !!assumptions?.geminiApiKey, "model:", assumptions?.geminiModel || "default");
    console.log("[AI] baseCards count:", baseCards?.length, "ids:", baseCards?.map(c => c.id));
    if (!profileIsComplete(params, mc)) {
      console.warn("[AI] Profile incomplete — runAI exiting silently. Need: port>50K, sp>0, mcResults.rate>0, ≥1 funded account.");
      return;
    }
    // Pre-flight credit check. The server refuses below MIN_CREDITS_TO_RUN and
    // returns 402, which used to be the FIRST time a user learned they were
    // short: the button looked available, the spinner ran, and the buy modal
    // appeared as the result of a failure. Checking here turns that into an
    // offer made before the attempt.
    //
    // Only when billing is actually in play — a user on their own Gemini key
    // never touches credits, so their balance is irrelevant to whether they can
    // run (ai-analysis.js routes on `getStoredJWT()`, not on the balance).
    if (BILLING_ENABLED && getStoredJWT() && creditBalance < MIN_CREDITS_TO_RUN) {
      console.warn(`[AI] pre-flight: ${creditBalance} credits < ${MIN_CREDITS_TO_RUN} minimum — prompting instead of failing.`);
      setAiError(`AI analysis needs at least ${MIN_CREDITS_TO_RUN.toLocaleString()} credits and you have ${creditBalance.toLocaleString()}. Top up to continue — nothing was charged.`);
      setShowBuyModal(true);
      return;
    }

    setLoadingAI(true);
    setAiError(null);
    try {
      console.log("[AI] Calling runAIActionPlan…");
      const merged = await runAIActionPlan({ ...params, geminiApiKey: assumptions?.geminiApiKey, geminiModel: assumptions?.geminiModel }, mc, baseCards);
      console.log("[AI] Merged result:", merged);
      console.log("[AI] Cards with aiNote:", merged?.filter(c => c.aiNote).length, "/ total:", merged?.length);
      console.log("[AI] AI-generated new cards:", merged?.filter(c => c.aiGenerated).length);
      setCards(merged);
    } catch (e) {
      console.error("[AI] action plan error:", e);
      if (BILLING_ENABLED && e.message?.toLowerCase().includes("credit")) {
        setShowBuyModal(true);
      } else {
        setAiError(e.message || "AI unavailable — check that your Gemini API_KEY is set in the UI in the Profile Section.");
      }
    } finally {
      setLoadingAI(false);
    }
  };

  const runLiveSearch = async () => {
    const { generateTimeSensitiveCards } = await import("./ai/ai-analysis.js");
    setLoadingLive(true);
    setLiveError(null);
    try {
      const found = await generateTimeSensitiveCards(
        { ...params, geminiApiKey: assumptions?.geminiApiKey, geminiModel: assumptions?.geminiModel },
        mc
      );
      setLiveCards(found);
    } catch (e) {
      setLiveError(e.message);
    } finally {
      setLoadingLive(false);
    }
  };

  if (!params || !mc) {
    return (
      <div className="chart-card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>🎲 Monte Carlo not run yet</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Press ▶ Run Monte Carlo to generate your personalized action plan.</div>
      </div>
    );
  }

  // Evaluate declarative rules engine
  const baseCards = evaluateRulesEngine({
    params, mc, assumptions,
    currentYear, retireYear, daysToRetire,
  });

  // Display AI-annotated cards if available, else base cards
  const displayCards = cards || baseCards;

  // Gate: AI button only enabled when profile has real data AND either credits (billing) or Gemini key (BYOK)
  const hasGeminiKey = !!(assumptions?.geminiApiKey?.trim());
  const profileReady = (params.port || 0) > 50_000 &&
    (params.sp  || 0) > 0 &&
    mc?.rate > 0 &&
    (params.accounts || []).some(a => (a.balance || 0) > 0);
  // Was `creditBalance >= 5` — a bare literal that enabled the button at a
  // balance the SERVER rejects (its floor is MIN_CREDITS_GUARD = 50). Anyone
  // between 5 and 49 credits got an enabled button and a guaranteed failure.
  const hasAiAccess  = BILLING_ENABLED ? (creditBalance >= MIN_CREDITS_TO_RUN || hasGeminiKey) : hasGeminiKey;
  const canRunAI     = !loadingAI && !cards && profileReady && hasAiAccess;
  const aiDisabledReason = !profileReady
    ? "Complete your profile and run Monte Carlo first"
    : !hasAiAccess
    ? "Buy AiRA credits or add a free Gemini API key in Profile → Assumptions"
    : "Run AI analysis on your plan";

  const COLORS = {
    red:    { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   label: "#f87171", badge: "🔴 Critical" },
    yellow: { bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)",  label: "var(--accent-gold)", badge: "🟡 Important" },
    green:  { bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)",  label: "#34d399", badge: "🟢 On Track" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── AI controls ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>

        {/* Left — action button + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <button
            onClick={() => runAI(baseCards)}
            disabled={!canRunAI}
            title={aiDisabledReason}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none", flexShrink: 0,
              background: canRunAI ? "linear-gradient(135deg, #7c3aed, #a78bfa)" : "var(--row-highlight)",
              color: canRunAI ? "white" : "var(--text-faint)",
              fontSize: 13, fontWeight: 600,
              cursor: canRunAI ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: canRunAI ? "0 2px 8px rgba(124,58,237,0.3)" : "none",
              transition: "all 0.2s",
            }}
          >
            {loadingAI ? "Analyzing…" : cards ? "✓ AI Applied" : "🤖 Run AI Analysis"}
          </button>

          {loadingAI && (
            <span style={{ color: "var(--accent-purple)", fontSize: 12 }}>Aira is thinking…</span>
          )}
          {!loadingAI && !cards && profileReady && !hasAiAccess && !BILLING_ENABLED && (
            <span style={{ fontSize: 11, color: "var(--accent-gold)" }}>
              🔒 Add a free Gemini key in Profile → Assumptions ·{" "}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)", textDecoration: "underline" }}>
                Get one here
              </a>
            </span>
          )}
          {(cards || aiError) && !loadingAI && (
            <button
              onClick={() => { setCards(null); setAiError(null); }}
              style={{ fontSize: 11, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Right — credit panel (BILLING_ENABLED), or Coming Soon stub */}
        {BILLING_ENABLED ? (
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          16,
            background:   creditBalance < LOW_BALANCE_WARN_AT ? "rgba(239,68,68,0.06)" : "rgba(124,58,237,0.06)",
            border:       `1px solid ${creditBalance < LOW_BALANCE_WARN_AT ? "rgba(239,68,68,0.25)" : "rgba(124,58,237,0.2)"}`,
            borderRadius: 10,
            padding:      "10px 16px",
            flexShrink:   0,
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-purple)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                AiRA Credits
              </div>
              {/* "You have 0 credits" and "this browser has no session" are completely
                  different situations, and showing a bare 0 for both told paying
                  customers they had nothing — right next to a Buy Credits button, so
                  the natural response was to pay a second time. Credits live in the
                  database against a Stripe customer; the browser's only claim on them
                  is a JWT in localStorage, which does not travel between browsers,
                  devices, or origins, and is not part of a profile export. With no
                  token we genuinely do not know the balance, so say that instead of
                  asserting zero. */}
              {!getStoredJWT() ? (
                <div style={{ maxWidth: 230 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-gold)", lineHeight: 1.25 }}>
                    No credits found on this device
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.35 }}>
                    Already bought credits? They're safe — this browser just isn't linked
                    to your purchase.
                  </div>
                  {/* The state told the user to "use your restore link" and then gave
                      them nowhere to put one: the only button on this panel was Buy
                      Credits, so the path of least resistance was paying twice for
                      credits they already owned. redeemRestoreToken existed but was
                      reachable only by loading a ?restore= URL — no use if the link is
                      in a password manager, an email, or on another screen. */}
                  <button
                    onClick={() => setShowRestore(true)}
                    style={{
                      marginTop: 6, background: "rgba(13,148,136,0.18)",
                      border: "1px solid rgba(94,234,212,0.45)", color: "var(--accent-teal)",
                      borderRadius: 6, padding: "5px 12px", fontSize: 12,
                      fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    🔑 Restore my credits
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 22, fontWeight: 700, color: creditBalance < LOW_BALANCE_WARN_AT ? "#f87171" : "#e2e8f0", lineHeight: 1 }}>
                  {creditBalance.toLocaleString()}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowBuyModal(true)}
              style={{
                background:   "linear-gradient(135deg, #7c3aed, #a78bfa)",
                border:       "none", color: "white",
                borderRadius: 8, padding: "8px 16px",
                fontSize:     13, fontWeight: 600, cursor: "pointer",
                boxShadow:    "0 2px 8px rgba(124,58,237,0.3)",
                whiteSpace:   "nowrap",
              }}
            >
              💳 Buy Credits
            </button>
            {getStoredRecoveryLink() && (
              <button
                onClick={() => setShowRecovery(true)}
                title="The link that restores these credits in another browser or on a new computer"
                style={{
                  background: "none", border: "none", color: "var(--text-muted)",
                  fontSize: 10, cursor: "pointer", textDecoration: "underline dotted",
                  textUnderlineOffset: 3, whiteSpace: "nowrap", padding: 0, marginLeft: 4,
                }}
              >
                🔑 recovery link
              </button>
            )}
          </div>
        ) : (
          <div
            title="The AiRA Credits billing system is built and audited but not yet live. While in development, all AI calls use your personal Gemini API key (BYOK)."
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              background:   "rgba(251,191,36,0.06)",
              border:       "1px solid rgba(251,191,36,0.3)",
              borderRadius: 10,
              padding:      "10px 16px",
              flexShrink:   0,
              cursor:       "help",
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1 }}>🚧</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-gold)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                AiRA Credits
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fde68a", lineHeight: 1.15 }}>
                Coming Soon
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                BYOK active · in development
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Session token usage — shown for BYOK users after any AI call */}
      <AiUsageBadge style={{ marginBottom: 4 }} />

      {showBuyModal && <CreditPackModal onClose={() => setShowBuyModal(false)} />}
      {showRecovery && (() => {
        const rec = getStoredRecoveryLink();
        return rec ? (
          <RecoveryLinkModal url={rec.url} expiresAt={rec.expiresAt} onClose={() => setShowRecovery(false)} />
        ) : null;
      })()}
      {showRestore && <RestoreAccessModal onClose={() => setShowRestore(false)} />}

      {aiError && (
        <div style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 12,
          color: "#f87171",
        }}>
          ⚠ AI unavailable: {aiError}
        </div>
      )}

      {/* Retirement Date Solver */}
      {(() => {
        const solver = solveRetirementDate(params);
        const { target, currentPort, currentAge, results } = solver;
        const retireAge = params.retireAge || 60;
        const rowColor = (age) => {
          if (age == null) return "#f87171";
          if (age <= retireAge) return "#34d399";
          if (age <= retireAge + 3) return "var(--accent-gold)";
          return "#f87171";
        };
        return (
          <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 9, padding: "12px 15px", marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#818cf8", marginBottom: 8 }}>
              🎯 Retirement Date Solver — Target {fmtDollar(target)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
              Portfolio today: <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(currentPort)}</span>
              &nbsp;·&nbsp;Planned retirement: <span style={{ color: "#e2e8f0" }}>age {retireAge}</span>
              {/* Household total (§24.1) — this drives a retirement-DATE answer,
                  so quoting the 401(k) line alone understated the saving that
                  gets the user there, and ignored a working spouse entirely. */}
              &nbsp;·&nbsp;Annual contrib: <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(householdAnnualContribution(params))}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th style={{ textAlign: "left", color: "var(--text-faint)", fontWeight: 600, paddingBottom: 4 }}>Scenario</th>
                  <th style={{ textAlign: "center", color: "var(--text-faint)", fontWeight: 600, paddingBottom: 4 }}>Return</th>
                  <th style={{ textAlign: "right", color: "var(--text-faint)", fontWeight: 600, paddingBottom: 4 }}>Hits {fmtDollar(target)}</th>
                  <th style={{ textAlign: "right", color: "var(--text-faint)", fontWeight: 600, paddingBottom: 4 }}>vs. Plan</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const diff = r.crossoverAge != null ? r.crossoverAge - retireAge : null;
                  const color = rowColor(r.crossoverAge);
                  return (
                    <tr key={r.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ color: "#cbd5e1", padding: "4px 0" }}>{r.label}</td>
                      <td style={{ textAlign: "center", color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace" }}>{(r.rate * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: "right", color, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>
                        {r.crossoverAge != null ? `Age ${r.crossoverAge}` : "> 80"}
                      </td>
                      <td style={{ textAlign: "right", color, fontFamily: "'JetBrains Mono',monospace" }}>
                        {diff == null ? "—" : diff === 0 ? "On target" : diff < 0 ? `${Math.abs(diff)}yr early` : `${diff}yr late`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
              Update your portfolio balance in the profile to keep this projection current.
            </div>
          </div>
        );
      })()}

      {/* ── Summary bar + filter ─────────────────────────────────────────────── */}
      {(() => {
        const allCards     = [...displayCards, ...(liveCards || [])];
        const counts       = { all: allCards.length, red: 0, yellow: 0, green: 0 };
        allCards.forEach(c => { if (counts[c.priority] !== undefined) counts[c.priority]++; });
        const filtered     = filterPriority === "all" ? allCards : allCards.filter(c => c.priority === filterPriority);
        const canLive      = !loadingLive && (!!(assumptions?.geminiApiKey?.trim()) || BILLING_ENABLED);

        const FILTER_OPTS = [
          { key: "all",    label: `All`,       count: counts.all,    color: "var(--text-muted)",  active: "#e2e8f0" },
          { key: "red",    label: `Critical`,  count: counts.red,    color: "#f87171",  active: "#fca5a5" },
          { key: "yellow", label: `Important`, count: counts.yellow, color: "var(--accent-gold)",  active: "#fde68a" },
          { key: "green",  label: `On Track`,  count: counts.green,  color: "#34d399",  active: "#6ee7b7" },
        ];

        return (
          <div>
            {/* Filter row */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {FILTER_OPTS.map(f => (
                <button
                  key={f.key}
                  onClick={() => { setFilter(f.key); setSelectedCard(null); }}
                  style={{
                    background:   filterPriority === f.key ? "var(--card-border)" : "transparent",
                    border:       `1px solid ${filterPriority === f.key ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)"}`,
                    color:        filterPriority === f.key ? (f.key === "all" ? "#e2e8f0" : f.active) : f.color,
                    borderRadius: 6, padding: "4px 12px",
                    fontSize:     12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {f.label} <span style={{ opacity: 0.7, fontSize: 11 }}>{f.count}</span>
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                onClick={runLiveSearch}
                disabled={!canLive}
                title={canLive ? "Search the web for current IRS limits, SS COLA, Medicare premiums, and more" : "Add a Gemini API key to enable live search"}
                style={{
                  background:   !canLive ? "var(--card-bg)" : loadingLive ? "var(--row-highlight)" : "linear-gradient(135deg, #0e7490, #22d3ee)",
                  border:       "none", color: !canLive || loadingLive ? "var(--text-faint)" : "white",
                  borderRadius: 7, padding: "5px 14px",
                  fontSize:     12, fontWeight: 600, cursor: canLive && !loadingLive ? "pointer" : "not-allowed",
                  whiteSpace:   "nowrap",
                  boxShadow:    canLive && !loadingLive ? "0 2px 8px rgba(6,182,212,0.25)" : "none",
                }}
              >
                {loadingLive ? "Searching…" : liveCards ? "🔄 Refresh Live" : "🌐 Live Updates"}
              </button>
            </div>

            {liveError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>⚠ {liveError}</div>}

            {!liveError && liveCards && liveCards.length === 0 && (
              <div style={{ fontSize: 11, color: "#34d399", marginBottom: 8 }}>
                ✓ Live search complete — no new time-sensitive updates found. Your plan figures look current.
              </div>
            )}
            {!liveError && liveCards && liveCards.length > 0 && (
              <div style={{ fontSize: 11, color: "#22d3ee", marginBottom: 8 }}>
                🌐 Found {liveCards.length} live update{liveCards.length > 1 ? "s" : ""} — see below.
              </div>
            )}

            {/* Master-detail layout */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

              {/* Left — list of rows */}
              <div style={{ flex: selectedCard ? "0 0 46%" : 1, minWidth: 0, transition: "flex 0.2s" }}>
                {filtered.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "20px 0", textAlign: "center" }}>
                    No cards for this filter.
                  </div>
                )}

                {/* Regular cards */}
                {filtered.filter(c => !c.isLiveData).map((card, i) => (
                  <ActionPlanRow
                    key={card.id || i}
                    card={card}
                    isSelected={selectedCard?.id === card.id}
                    onClick={() => setSelectedCard(prev => prev?.id === card.id ? null : card)}
                  />
                ))}

                {/* Live cards — separated with a label */}
                {filtered.some(c => c.isLiveData) && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#22d3ee", margin: "12px 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                      🌐 Live Updates
                    </div>
                    {filtered.filter(c => c.isLiveData).map((card, i) => (
                      <ActionPlanRow
                        key={card.id || i}
                        card={card}
                        isSelected={selectedCard?.id === card.id}
                        onClick={() => setSelectedCard(prev => prev?.id === card.id ? null : card)}
                      />
                    ))}
                  </>
                )}

                {/* Milestones — inside the list column */}
                <div style={{ marginTop: 16 }}>
                  <MilestonesSection params={params} rmdAge={rmdAgeProp} />
                </div>
              </div>

              {/* Right — detail panel */}
              {selectedCard && (
                <div style={{ flex: "0 0 51%", minWidth: 0 }}>
                  <CardDetailPanel
                    card={selectedCard}
                    onClose={() => setSelectedCard(null)}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

function ProfileWizard({ values, onChange, onNavigateTab, autosavedAt }) {
  const [step, setStep] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");

  const flashStatus = (msg) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(""), 2000);
  };

  const handleSave = () => {
    const ok = saveProfileToLocal(values);
    flashStatus(ok ? "✓ Saved to this browser" : "✗ Save failed (localStorage blocked)");
  };

  const handleReload = () => {
    const saved = loadProfileFromLocal();
    if (!saved) {
      flashStatus("No saved profile found");
      return;
    }
    if (!window.confirm("Restore your last saved profile? Unsaved changes will be overwritten.")) return;
    Object.entries(saved).forEach(([k, v]) => {
      if (k === "savedAt" || k === "buildTag") return;
      onChange(k, v);
    });
    flashStatus("✓ Restored saved profile");
  };

  const savedMeta = (() => {
    const s = loadProfileFromLocal();
    if (!s || !s.savedAt) return null;
    try {
      return new Date(s.savedAt).toLocaleString();
    } catch {
      return s.savedAt;
    }
  })();

  /* Order per design-authority, 2026-07-31 (APPROVE WITH CHANGES).
   *
   * Personal identity first, then money in, money out, the plan — and global
   * configuration LAST. About You is the dependency root: `values.dob` drives
   * ageFromDob(), which several later subtitles and the engine derive from, so
   * asking for it first matches what the data actually needs.
   *
   * Assumptions used to be step 1 while ALSO holding five identity fields (name,
   * dob, state, employer start date, filing status). Those moved to About You, so
   * this panel is now purely engine configuration — returns, inflation, tax
   * toggles, API key. Owner's framing: it is the phone's Settings app, not part
   * of telling us about yourself.
   *
   * `isSettings` marks it as a GLOBAL surface rather than a workflow step. The
   * sidebar reads it to drop the row out of the progress-dot language: a settings
   * panel is never "completed", so showing a filled step dot for it asserts
   * something false (design principle 4, global vs workflow actions).
   */
  const STEPS = [
    { label: "About You", icon: "👤", sub: `You are ${ageFromDob(values.dob) ?? values.currentAge} yrs old` },
    { label: "Current Savings", icon: "💰", sub: `Net worth of ${fmtDollar(values.port)} saved. Congratulations!` },
    {
      label: "Money In", icon: "💵",
      // Money In holds BOTH the working-years contributions and every recurring
      // retirement stream (SS, rental, pensions, other income). §18 Phase B
      // design-authority tie-break (2026-08-20): the old subtitle read only the
      // contribution figure, so a retired user with a $50K pension saw
      // "Contributing $0/yr while working" — a step-relevance signal that was
      // exactly backwards. Show both halves; fall back to a static label only
      // when the household has neither, so the string is never
      // "$0/yr saving · $0/yr in retirement" for a brand-new profile.
      sub: (() => {
        const saving = householdAnnualContribution(values);
        const retInc = totalRetirementIncome(values);
        if (saving === 0 && retInc === 0) return "Income & contributions";
        return `${fmtDollar(saving)}/yr saving · ${fmtDollar(retInc)}/yr in retirement`;
      })(),
    },
    {
      label: "Spending & Expenses", icon: "💸",
      sub: values.spImportMeta
        ? (values.spImportMeta.mode === "multi"
            ? `Multi-year budget · ${values.spImportMeta.years} yrs`
            : `Budget loaded · ${fmtDollar(values.spImportMeta.total)}/yr`)
        : `Spending ${fmtDollar((values.sp || 0) + (values.spOutOfCountry != null ? values.spOutOfCountry : (values.spSpendOutofState || 0)))}/yr`,
    },
    { label: "Retirement Plan", icon: "🎯", sub: `Projected Retirement Age ${values.retireAge}` },
    { label: "Settings", icon: "⚙️", sub: "Calculation & app settings", isSettings: true },
  ];

  const PANELS = [
    <AboutYouPanel values={values} onChange={onChange} />,
    <SavingsPanel values={values} onChange={onChange} />,
    <ContribPanel values={values} onChange={onChange} onNavigateStep={setStep} />,
    <ExpensesPanel values={values} onChange={onChange} />,
    <RetirementPanel values={values} onChange={onChange} onNavigateStep={setStep} onNavigateTab={onNavigateTab} />,
    <AssumptionsPanel values={values} onChange={onChange} />,
  ];

  useEffect(() => {
    if (step >= STEPS.length) setStep(STEPS.length - 1);
  }, [step]);

  const goNext = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const currentStepData = STEPS[step];
  const currentPanel = PANELS[step];

  return (
    <div
      className="wizard-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        alignItems: "start",
        flexShrink: 0,
      }}
    >
      {/* LEFT SIDEBAR – unchanged */}
      <div className="wizard-sidebar" style={{ borderRight: "1px solid rgba(255,255,255,0.06)", padding: 16 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
          {/* Visual separation for the global-settings surface. Position alone did
              not express it: everything in this list shares one progress-dot
              language, which implies a linear sequence you complete. */}
          {s.isSettings && (
            <div style={{
              marginTop: 14, marginBottom: 6, paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-faint)",
            }}>
              App Settings
            </div>
          )}
          <div
            onClick={() => setStep(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              marginBottom: 4,
              cursor: "pointer",
              background: i === step ? "rgba(13,148,136,0.15)" : "transparent",
              border: i === step ? "1px solid rgba(13,148,136,0.3)" : "1px solid transparent",
            }}
          >
            {/* A settings panel is never "done", so it gets a static marker instead
                of a progress dot that fills in as you pass it. */}
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: s.isSettings ? 3 : "50%",
                flexShrink: 0,
                background: s.isSettings
                  ? (i === step ? "rgba(148,163,184,0.35)" : "rgba(255,255,255,0.07)")
                  : (i < step ? "var(--positive)" : i === step ? "var(--accent-teal)" : "rgba(255,255,255,0.1)"),
                border: s.isSettings
                  ? "2px solid rgba(148,163,184,0.4)"
                  : `2px solid ${i <= step ? "var(--positive)" : "rgba(255,255,255,0.15)"}`,
                boxShadow: (!s.isSettings && i === step) ? "0 0 8px #0d948866" : "none",
              }}
            />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: i === step ? "#e2e8f0" : "var(--text-muted)" }}>
                {s.icon} {s.label}
              </div>
              <div style={{ fontSize: 14, color: "#4174bd" }}>{s.sub}</div>
            </div>
          </div>
          </React.Fragment>
        ))}
      </div>

      {/* RIGHT PANEL */}
      <div className="wizard-panel" style={{ padding: 24 }}>
        {/* Save bar – unchanged */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            marginBottom: 16,
            background: "rgba(13,148,136,0.08)",
            border: "1px solid rgba(13,148,136,0.25)",
            borderRadius: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-teal)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34d399", display: "inline-block", boxShadow: "0 0 6px #34d399" }} />
              Auto-save on
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {autosavedAt
                ? `Auto-saved ${autosavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — your work is kept in this browser`
                : savedMeta
                  ? `Last saved to this browser: ${savedMeta}`
                  : "Changes save automatically as you edit"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {saveStatus && <span style={{ fontSize: 11, color: "var(--accent-teal)" }}>{saveStatus}</span>}
            <button
              onClick={handleReload}
              disabled={!savedMeta}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: savedMeta ? "var(--text-secondary)" : "#334155",
                cursor: savedMeta ? "pointer" : "not-allowed",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              🔁 Reload Saved
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "6px 14px",
                borderRadius: 7,
                border: "none",
                background: "linear-gradient(135deg,#0d9488,#14b8a6)",
                color: "white",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
                fontWeight: 600,
              }}
            >
              💾 Save
            </button>
          </div>
        </div>

        {/* Mobile step selector – unchanged */}
        <div className="wizard-mobile-steps" style={{ marginBottom: 16 }}>
          <select
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            style={{
              width: "100%",
              background: "#0d1b2a",
              border: "1px solid #1e3a5f",
              color: "#e2e8f0",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: "'Inter',sans-serif",
            }}
          >
            {STEPS.map((s, i) => (
              <option key={i} value={i}>
                {s.icon} {s.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
          {currentStepData.icon} {currentStepData.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20 }}>
          {currentStepData.sub}
        </div>

        {/* Panel content */}
        {currentPanel}

        {/* Navigation – unchanged */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={goPrev}
            disabled={step === 0}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              background: step === 0 ? "var(--row-highlight)" : "linear-gradient(135deg,#0d9488,#14b8a6)",
              color: step === 0 ? "#334155" : "white",
              cursor: step === 0 ? "not-allowed" : "pointer",
              fontSize: 12,
              fontFamily: "inherit",
              fontWeight: 600,
              opacity: step === 0 ? 0.4 : 1,
            }}
          >
            ← Previous
          </button>

          <div style={{ fontSize: 11, color: "#334155" }}>{step + 1} / {STEPS.length}</div>

          <button
            onClick={goNext}
            disabled={step === STEPS.length - 1}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              background: step === STEPS.length - 1 ? "var(--row-highlight)" : "linear-gradient(135deg,#0d9488,#14b8a6)",
              color: step === STEPS.length - 1 ? "#334155" : "white",
              cursor: step === STEPS.length - 1 ? "not-allowed" : "pointer",
              fontSize: 12,
              fontFamily: "inherit",
              fontWeight: 600,
              opacity: step === STEPS.length - 1 ? 0.4 : 1,
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Stable module-level FieldRow for all ProfileWizard panels ─────────────
   Defined OUTSIDE panel components so the reference never changes between
   renders — prevents React from unmounting/remounting inputs on each keystroke.
*/
function WFieldRow({ label, helper, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", marginBottom: 2 }}>{label}</div>
        {helper && <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{helper}</div>}
      </div>
      <div style={{ marginLeft: 16, minWidth: 130, textAlign: "right" }}>
        {children}
      </div>
    </div>
  );
}

// Quicken-style split editor: one account, several bucket allocations by %.
// The account keeps its single rolled-up balance; this just edits how that
// balance is distributed across B1/B2/B3. Hoisted to module scope so it isn't
// recreated each render (which would drop input focus while typing).
function AccountSplitEditor({ acct, color, onChangeSplits, onClose }) {
  const splits = acct.splits || [];
  const bal = acct.balance || 0;
  const total = splits.reduce((s, x) => s + (Number(x.pct) || 0), 0);
  const remaining = 100 - total;
  const clampPct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const update = (i, patch) => onChangeSplits(splits.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div style={{ marginLeft: 106, marginBottom: 8, padding: "8px 10px", background: "rgba(255,255,255,0.025)", border: `1px solid ${withAlpha(color, "33")}`, borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 6 }}>
        Split <strong style={{ color: "#e2e8f0" }}>{acct.name}</strong> across buckets · rolls up to {fmtDollar(bal)}
      </div>
      {splits.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          {[1, 2, 3].map(b => (
            <button key={b} onClick={() => update(i, { bucket: b })} title={`Bucket ${b}`} style={{
              background: s.bucket === b ? color + "33" : "transparent",
              border: `1px solid ${s.bucket === b ? color : "rgba(255,255,255,0.1)"}`,
              color: s.bucket === b ? color : "#334155",
              borderRadius: 4, padding: "2px 6px", fontSize: 9, fontWeight: 700, cursor: "pointer", lineHeight: 1.4,
            }}>B{b}</button>
          ))}
          <input
            type="number" min={0} max={100} value={s.pct}
            onChange={e => update(i, { pct: clampPct(e.target.value) })}
            style={{ width: 52, fontSize: 11, color: "#e2e8f0", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 6px", textAlign: "right", outline: "none", fontFamily: "'JetBrains Mono',monospace" }}
                onFocus={selectAllOnFocus}
              />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>%</span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace", minWidth: 78, textAlign: "right" }}>{fmtDollar(bal * (Number(s.pct) || 0) / 100)}</span>
          <button onClick={() => onChangeSplits(splits.filter((_, j) => j !== i))} title="Remove this slice"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, opacity: 0.6 }}>✕</button>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <button onClick={() => onChangeSplits([...splits, { bucket: 2, pct: Math.max(0, remaining) }])}
          style={{ background: "transparent", border: `1px dashed ${withAlpha(color, "55")}`, borderRadius: 4, color, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>+ Add slice</button>
        <span style={{ fontSize: 10, fontWeight: 700, color: total === 100 ? "#34d399" : "var(--accent-gold)" }}>
          {total === 100 ? "100% assigned ✓" : `${total}% assigned · ${remaining > 0 ? remaining + "% left" : Math.abs(remaining) + "% over"}`}
        </span>
        <button onClick={() => { onChangeSplits([]); onClose(); }}
          style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 10, cursor: "pointer", textDecoration: "underline" }}>↩ use one bucket</button>
      </div>
    </div>
  );
}

function SavingsPanel({ values, onChange }) {
  const GOAL = values.earlyRetireTarget || 1_000_000;
  const accounts = values.accounts || BLANK_PROFILE.accounts;
  const [splitEditId, setSplitEditId] = useState(null);

  const CATEGORIES = [
    { key: "pretax",  label: "Pre-Tax",        color: "#0ea5e9", defaultName: "401(k)" },
    { key: "roth",    label: "Roth",           color: "var(--accent-purple)", defaultName: "Roth IRA" },
    { key: "taxable", label: "Taxable",        color: "var(--accent-gold)", defaultName: "Brokerage" },
    { key: "hsa",     label: "HSA",            color: "#34d399", defaultName: "HSA" },
    { key: "cash",    label: "Cash / Savings", color: "var(--text-secondary)", defaultName: "Savings" },
  ];

  const catSum = (cat) => accounts.filter(a => a.category === cat).reduce((s, a) => s + (a.balance || 0), 0);
  const autoTotal = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const percentToGoal = Math.min(100, (autoTotal / GOAL) * 100);
  const remaining = Math.max(0, GOAL - autoTotal);

  const updateAccounts = (newAccounts) => {
    onChange("accounts", newAccounts);
    const total = newAccounts.reduce((s, a) => s + (a.balance || 0), 0);
    onChange("port", total);
  };

  const handleBalance = (id, bal) => {
    const newAccounts = accounts.map(a => a.id === id ? { ...a, balance: bal } : a);
    updateAccounts(newAccounts);
  };

  const handleName = (id, name) => {
    const newAccounts = accounts.map(a => a.id === id ? { ...a, name } : a);
    onChange("accounts", newAccounts);
  };

  const addAccount = (cat) => {
    const def = CATEGORIES.find(c => c.key === cat);
    const newAccounts = [...accounts, { id: Date.now().toString(), category: cat, name: def ? def.defaultName : cat, balance: 0, bucket: _defaultBucket(cat) }];
    onChange("accounts", newAccounts);
  };

  const setBucket = (id, b) => onChange("accounts", accounts.map(a => a.id === id ? { ...a, bucket: b } : a));

  // Persist a split. Empty array reverts the account to a single bucket
  // (strips the `splits` key) so the data model stays clean.
  const setSplits = (id, newSplits) => onChange("accounts", accounts.map(a => {
    if (a.id !== id) return a;
    if (!newSplits || newSplits.length === 0) { const { splits, ...rest } = a; return rest; }
    return { ...a, splits: newSplits };
  }));

  const toggleSplit = (id) => {
    if (splitEditId === id) { setSplitEditId(null); return; }
    const acct = accounts.find(a => a.id === id);
    if (acct && !(Array.isArray(acct.splits) && acct.splits.length)) {
      setSplits(id, [{ bucket: acct.bucket ?? _defaultBucket(acct.category), pct: 100 }]);
    }
    setSplitEditId(id);
  };

  const removeAccount = (id) => {
    const newAccounts = accounts.filter(a => a.id !== id);
    updateAccounts(newAccounts);
  };



  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ACard title="💰 Accounts" accent="var(--accent-teal)" desc="Every balance the plan draws from, grouped by tax treatment — the grouping is what decides the withdrawal order and the tax on each dollar.">
      {CATEGORIES.map(cat => {
        const catAccounts = accounts.filter(a => a.category === cat.key);
        return (
          <div key={cat.key} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, borderLeft: `3px solid ${cat.color}`, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, color: cat.color, fontWeight: 600, marginBottom: 8 }}>{cat.label}</div>
            {catAccounts.map(acct => {
              const hasSplits = Array.isArray(acct.splits) && acct.splits.length > 0;
              const editing = splitEditId === acct.id;
              return (
              <div key={acct.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: (hasSplits || editing) ? 2 : 6 }}>
                  <input
                    type="text"
                    value={acct.name}
                    onChange={e => handleName(acct.id, e.target.value)}
                    style={{ width: 100, fontSize: 11, color: "#e2e8f0", background: "transparent", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, padding: "2px 6px", fontFamily: "'DM Sans',sans-serif", outline: "none" }}
                    onFocus={e => e.target.style.borderColor = cat.color + "66"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
                  />
                  <div style={{ flex: 1 }}>
                    <ANumInput value={acct.balance || 0} onSet={(v) => handleBalance(acct.id, v)} min={0} max={999_000_000_000} step={5000} />
                  </div>
                  {hasSplits ? (
                    <span title="Split across buckets — click 🔀 to edit" style={{ fontSize: 9, fontWeight: 700, color: cat.color, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
                      {acct.splits.map(s => `${s.pct}%·B${s.bucket}`).join("  ")}
                    </span>
                  ) : (
                    [1,2,3].map(b => {
                      const active = (acct.bucket ?? _defaultBucket(acct.category)) === b;
                      return (
                        <button key={b} onClick={() => setBucket(acct.id, b)} title={`Assign to Bucket ${b}`} style={{
                          background: active ? cat.color + "33" : "transparent",
                          border: `1px solid ${active ? cat.color : "rgba(255,255,255,0.1)"}`,
                          color: active ? cat.color : "#334155",
                          borderRadius: 4, padding: "2px 6px", fontSize: 9, fontWeight: 700, cursor: "pointer", lineHeight: 1.4,
                        }}>B{b}</button>
                      );
                    })
                  )}
                  <button onClick={() => toggleSplit(acct.id)} title="Split this account across buckets" style={{
                    background: (hasSplits || editing) ? cat.color + "33" : cat.color + "14",
                    border: `1px solid ${(hasSplits || editing) ? cat.color : cat.color + "55"}`,
                    borderRadius: 4, padding: "2px 7px", fontSize: 14, cursor: "pointer", lineHeight: 1.4,
                    filter: (hasSplits || editing) ? "none" : "opacity(0.85)",
                  }}
                    onMouseEnter={e => { if (!(hasSplits || editing)) { e.currentTarget.style.background = cat.color + "33"; e.currentTarget.style.filter = "none"; } }}
                    onMouseLeave={e => { if (!(hasSplits || editing)) { e.currentTarget.style.background = cat.color + "14"; e.currentTarget.style.filter = "opacity(0.85)"; } }}
                  >🔀</button>
                  <button
                    onClick={() => removeAccount(acct.id)}
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: "2px 4px", opacity: 0.5 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "#f87171"; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    ✕
                  </button>
                </div>
                {editing && (
                  <AccountSplitEditor
                    acct={acct}
                    color={cat.color}
                    onChangeSplits={(ns) => setSplits(acct.id, ns)}
                    onClose={() => setSplitEditId(null)}
                  />
                )}
              </div>
              );
            })}
            <button
              onClick={() => addAccount(cat.key)}
              style={{ background: "transparent", border: `1px dashed ${withAlpha(cat.color, "33")}`, borderRadius: 4, color: cat.color, fontSize: 11, padding: "2px 8px", cursor: "pointer", opacity: 0.6, marginTop: 2 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
            >
              + Add
            </button>
          </div>
        );
      })}
      </ACard>

      <ACard title="🎯 Early-Retirement Target" accent="var(--positive)" desc="Your goal number, and how the accounts above track against it.">
        <WFieldRow label="🎯 Target Portfolio for Early Retirement" helper={`Goal: ${fmtDollar(GOAL)}`}>
          <ANumInput value={values.earlyRetireTarget || 0} onSet={(v) => onChange("earlyRetireTarget", v)} min={0} max={MAX_MONEY_INPUT} step={50_000} />
        </WFieldRow>
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#e2e8f0" }}>Progress</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{percentToGoal.toFixed(1)}%</span>
          </div>
          <div style={{ height: 10, background: "rgba(255,255,255,0.1)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${percentToGoal}%`, height: "100%", background: "linear-gradient(90deg,#0d9488,#14b8a6)", borderRadius: 5 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginTop: 12 }}>
            {[
              { label: "Pre-Tax", val: catSum("pretax"),  color: "#0ea5e9" },
              { label: "Roth",    val: catSum("roth"),     color: "var(--accent-purple)" },
              { label: "Taxable", val: catSum("taxable"),  color: "var(--accent-gold)" },
              { label: "HSA",     val: catSum("hsa"),      color: "#34d399" },
              { label: "Cash",    val: catSum("cash"),     color: "var(--text-secondary)" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{s.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(s.val)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
            <span>Total: <strong style={{ color: "#e2e8f0" }}>{fmtDollar(autoTotal)}</strong></span>
            <span>Remaining: <strong style={{ color: "#f87171" }}>{fmtDollar(remaining)}</strong></span>
          </div>
        </div>
      </ACard>
    </div>
  );
}

function AboutYouPanel({ values, onChange }) {
  const derivedAge = ageFromDob(values.dob);
  const currentAgeForCalc = derivedAge ?? values.currentAge;
  // Retirement age is a DECIMAL (63.6 for a mid-year D-Day), so subtracting a whole
  // age produced 1.6000000000000014 on screen — binary floating point, shown raw.
  // Rounded to one decimal at the point of display; the ENGINES keep the full
  // precision value, so this changes nothing a projection depends on.
  const round1 = (n) => Math.round(n * 10) / 10;
  const yearsToRetire = round1(Math.max(0, values.retireAge - currentAgeForCalc));
  const yearsInRetire = round1(Math.max(0, values.endAge - values.retireAge));
  const totalHorizon = round1(yearsToRetire + yearsInRetire);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* These five were in "Assumptions → Model Parameters", which is where a user
          looking for their own details would never think to look — and About You
          carried a pointer sending them there. Name, birthday, home state, employer
          start date and filing status are WHO YOU ARE, not model parameters; the
          returns, inflation and tax assumptions that belong under that heading stayed
          behind. One category, one place (REQUIREMENTS §18). */}
      <ACard title="Who You Are" accent="#0ea5e9" desc="Who you are. Your birthday is the input of record — age, D-Day and every accumulation year derive from it.">
        <ARow label="Name" desc="Appears on the printable report and in the exported JSON filename (AiRA_Profile_&lt;name&gt;_YYYY-MM-DD.json). Not used in any calculation.">
          <input
            type="text"
            value={values.name || ""}
            placeholder="Full Name"
            onChange={(e) => onChange("name", e.target.value)}
            style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}
          />
        </ARow>
        <ARow
          label="Date of Birth"
          desc={`Current age: ${derivedAge} · Used to derive D-Day (Day of Retirement) and accumulation years`}
        >
          <ADateInput value={values.dob} onSet={(v) => onChange("dob", v)} />
        </ARow>
        <ARow
          label="State of Residence at Retirement"
          desc="State where RMD taxes will be applied. Use the Two Household toggle for out-of-country scenarios."
        >
          <AStateSelect value={values.stateOfResidence} onSet={(v) => onChange("stateOfResidence", v)} />
        </ARow>
        <ARow label="Employer Start Date (Countdown to D-Day)" desc="Used for D-Day (Day of Retirement) progress bar (when you started your last job) and counting days until D-Day">
          <ADateInput value={values.employerStartDate} onSet={(v) => onChange("employerStartDate", v)} />
        </ARow>
        <ARow label="Federal Filing Status" desc="Your marital status for federal taxes only — unrelated to the Solo Mode state-tax toggle. MFJ (married): $32,200 std deduction, wider brackets. Single (unmarried): $16,100 deduction, narrower brackets.">
          <select
            value={values.filingStatus || "mfj"}
            onChange={(e) => onChange("filingStatus", e.target.value)}
            style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
          >
            <option value="mfj">Married Filing Jointly (MFJ)</option>
            <option value="single">Single (unmarried)</option>
          </select>
        </ARow>
        {/* ── The one spouse switch (§24.1 follow-up) ─────────────────────────
            `spouse.enabled` lived inside the Social Security card, labelled "Add
            my spouse's Social Security", because SS was the only thing it gated.
            It now also gates per-person contributions — a step EARLIER in the
            wizard — so a user had to jump forward to a card about Social
            Security, tick a box that never mentions savings, and come back.

            It belongs here: it is a statement about WHO THE HOUSEHOLD IS, next
            to filing status, and ahead of both features that read it. The
            Social Security and Contributions cards now point at this control
            rather than duplicating it — one flag, one switch (§31, "two doors to
            the same room"). */}
        <ARow label="Include a spouse or partner" desc="Model two people instead of one. Turns on your spouse's own Social Security (their benefit, their claim age, survivor benefits) and lets their retirement contributions stop on their own retirement date. Off leaves your plan exactly as it is today.">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#cbd5e1" }}>
            <input
              type="checkbox"
              checked={!!values.spouse?.enabled}
              onChange={(e) =>
                onChange("spouse", { ...(values.spouse || { ssb: 0, ssAge: 67, ssPia: 0 }), enabled: e.target.checked })
              }
              style={{ width: 15, height: 15, accentColor: "var(--accent-teal)", cursor: "pointer" }}
            />
            {values.spouse?.enabled ? "Included" : "Not included"}
          </label>
        </ARow>
      </ACard>
      <ACard title="Retirement Timeline" accent="var(--accent-teal)" desc="When you stop working and how long the plan must last.">
        <WFieldRow label="Retirement Age" helper="Age at which you plan to retire (D‑Day).">
          <ANumInput value={values.retireAge} onSet={(v) => onChange("retireAge", v)} min={AGE_LIMITS.retire.min} max={AGE_LIMITS.retire.max} step={1} />
        </WFieldRow>
        <WFieldRow label="Planning Horizon" helper="Age through which you want the plan to last.">
          <ANumInput value={values.endAge} onSet={(v) => onChange("endAge", v)} min={40} max={100} step={1} />
        </WFieldRow>
        <WFieldRow label="Sex" helper="Used for SSA mortality overlay on the fan chart (male/female life expectancy tables, or blended average).">
          <select
            value={values.sex || "blended"}
            onChange={(e) => onChange("sex", e.target.value)}
            style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
          >
            <option value="blended">Blended (avg)</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </WFieldRow>
      </ACard>

      <ACard title="📅 Plan Horizon At A Glance" accent="var(--accent-teal)" desc="Derived from your birthday and the two ages above — nothing to edit here.">
        {[
          { label: "Years to retirement", val: yearsToRetire, color: "var(--accent-teal)" },
          { label: "Years in retirement", val: yearsInRetire, color: "var(--accent-purple)" },
          { label: "Total horizon", val: `${totalHorizon} yrs`, color: "#e2e8f0" },
        ].map((m) => (
          <div key={m.label}>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.2 }}>
              {m.val}
            </div>
          </div>
        ))}
      </ACard>
    </div>
  );
}

/* ── Stable module-level helpers for AssumptionsPanel ──────────────────
   Defined OUTSIDE the component so their reference never changes between
   renders — prevents React from unmounting/remounting inputs on each keystroke.
*/
function ARow({ label, desc, children }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
      <div>
        <div style={{ fontSize:12, color:"#e2e8f0", fontWeight:500 }}>{label}</div>
        {desc && <div style={{ fontSize:12, color:"var(--text-secondary)", marginTop:2 }}>{desc}</div>}
      </div>
      <div style={{ marginLeft:16, flexShrink:0 }}>{children}</div>
    </div>
  );
}

/**
 * Select a numeric field's contents when it gains focus, so typing REPLACES the
 * value instead of appending to it.
 *
 * Reported by a user: a field pre-filled with 0, clicked at the left edge, then
 * typing "40000" left the original zero on the end — the plan silently used
 * $400,000. Every Profile field ships with a default (often 0), so this hit any
 * value the caret happened to land in front of, and produced a 10x error with
 * no visible sign anything was wrong.
 *
 * Deferred a frame because focusing swaps the displayed text (formatted
 * "40,000" -> raw "40000"); selecting synchronously would be undone by that
 * re-render.
 */
function selectAllOnFocus(e) {
  const el = e.target;
  requestAnimationFrame(() => { try { el.select(); } catch { /* detached */ } });
}

function ANumInput({ value, onSet, min, max, step, suffix = "" }) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState("");
  // A fractional step (0.1, 0.5) means this field takes decimals — hint the
  // decimal keypad on mobile (type=text already allows "." on desktop).
  const allowDecimals = step != null && !Number.isInteger(step);
  // Absent bounds are unbounded, NOT NaN. See handleBlur.
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  const inputRef = useRef(null);
  // Set by the first keystroke after focus. The auto-select is deferred to the
  // next frame (it has to run AFTER the focus re-render swaps the display from
  // "6,126" to "6126", or the render wipes the selection) — but a deferred
  // select() that lands once typing has begun selects what was just typed, and
  // the following keystroke replaces the whole field. That is how an edit ends
  // up as a single digit. This flag makes the late select a no-op.
  const typedSinceFocus = useRef(false);

  // Sync local value when prop changes (e.g., after import or external update)
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value != null && !isNaN(value) ? value.toString() : "");
    }
  }, [value, isFocused]);

  const handleChange = (e) => {
    const raw = e.target.value;
    typedSinceFocus.current = true;
    setLocalValue(raw);            // show exactly what was typed; don't fight the caret
    // Clearing the field means zero — preserved from the original `Number("")`
    // behaviour so wiping a value still sets it to 0 rather than silently
    // restoring the old one.
    const num = raw.trim() === "" ? 0 : parseNumericEntry(raw);
    if (num !== null) {
      // `min` is deliberately NOT enforced here — en route to "50" you pass "5",
      // and snapping that up would fight the typist. `max` is, because you never
      // need to pass THROUGH a too-large number to reach a valid one, and
      // deferring it to blur loses the clamp whenever the parent re-render
      // remounts this input mid-edit: handleBlur never fires and the
      // out-of-range value stays committed (a 100%-max equity field kept
      // 100,000,000). Clamping here survives that, blur still applies `min`.
      onSet(max != null ? Math.min(max, num) : num);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Clamp what the user actually TYPED, not the `value` prop.
    //
    // Two bugs lived in the old `Math.max(min, Math.min(max, value))`:
    //
    // 1. Absent bounds became NaN. `Math.max(undefined, 75)` is NaN, and that
    //    went straight back out through onSet — one blur on a field whose caller
    //    omitted `min` or `max` destroyed the value. Every current call site
    //    passes both, so this was latent, but it is one forgotten prop away from
    //    silently zeroing a balance. `lo`/`hi` remove the trap at the source.
    //
    // 2. It clamped the PROP. The prop is one render behind whenever the parent
    //    has not yet applied the last keystroke, so blurring could clamp a stale
    //    number and write it back — the final digits of an edit vanishing on
    //    click-away. What the user typed is in `localValue`; that is the thing
    //    to commit.
    const typed  = localValue.trim() === "" ? 0 : parseNumericEntry(localValue);
    const fallbk = value != null && !isNaN(value) ? value : null;
    const base   = typed !== null ? typed : fallbk;
    if (base === null) return;              // unparseable and no prop to fall back on
    const clamped = Math.max(lo, Math.min(hi, base));
    if (!Number.isFinite(clamped)) return;  // never commit NaN/±Infinity
    if (clamped !== value) onSet(clamped);
    setLocalValue(clamped.toString());
  };

  const displayValue = isFocused
    ? localValue
    : (value != null && !isNaN(value)
        ? new Intl.NumberFormat('en-US').format(value)
        : "");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        ref={inputRef}
        type="text"
        inputMode={allowDecimals ? "decimal" : "numeric"}
        value={displayValue}
        onChange={handleChange}
        onFocus={() => {
          setIsFocused(true);
          typedSinceFocus.current = false;
          // Deliberately not the shared `selectAllOnFocus`: this field needs the
          // "has the user started typing?" guard, and the shared helper has no
          // way to know. Still deferred a frame so it runs after the display
          // swaps from formatted to raw.
          requestAnimationFrame(() => {
            const el = inputRef.current;
            if (!el || typedSinceFocus.current) return;
            if (typeof document !== "undefined" && document.activeElement !== el) return;
            try { el.select(); } catch { /* detached */ }
          });
        }}
        onBlur={handleBlur}
        style={{
          width: "120px",
          maxWidth: "100%",
          background: "#0d1b2a",
          border: "1px solid #1e3a5f",
          color: "#e2e8f0",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 12,
          fontFamily: "'JetBrains Mono',monospace",
          textAlign: "right",
        }}
      />
      {suffix && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{suffix}</span>}
    </div>
  );
}

function AStateSelect({ value, onSet }) {
  return (
    <select
      value={value || "NJ"}
      onChange={(e) => onSet(e.target.value)}
      style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'JetBrains Mono',monospace" }}
    >
      {Object.entries(STATE_BRACKETS).map(([state, entry]) => {
        const br = entry?.mfj ?? entry?.single;
        const top = br ? br[br.length - 1].rate : 0;
        const label = top === 0 ? "no tax" : `${(top * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
        return <option key={state} value={state}>{state} ({label})</option>;
      })}
    </select>
  );
}

function ADateInput({ value, onSet }) {
  return (
    <input
      type="date"
      value={value || ""}
      onChange={(e) => onSet(e.target.value)}
      style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:12, fontFamily:"'JetBrains Mono',monospace" }}
    />
  );
}

/**
 * THE section container for a Profile panel. One card = one topic.
 *
 * `collapsible` is decided by FREQUENCY, not length: set-once groups (identity,
 * API keys, tax mechanics) get `collapsible defaultOpen={false}` so they don't
 * occupy vertical space every visit; anything a user revisits most sessions
 * (spending, contributions, Social Security, pensions) stays open. A long panel is
 * fixed by splitting it into more cards, NOT by collapsing one giant one — those
 * are different problems and conflating them is what turned this into four
 * competing patterns.
 *
 * Heading treatment: 14px near-white with a muted description. This deliberately
 * REPLACED an 11px uppercase accent-coloured title. `ContribPanel` had privately
 * reimplemented this card — byte-identical chrome under local `sectionCard` /
 * `sectionTitle` / `sectionDesc` objects — and its heading was the more legible of
 * the two. The owner pointed at one of those cards ("Pensions") and said he liked it,
 * so the canonical component adopted the better treatment rather than the
 * duplicate being flattened down to the weaker one. `accent` now draws a thin left
 * border, keeping the colour-coding without tinting the title.
 *
 * NESTING RULE: the neutral card chrome below is reserved for the OUTER section
 * wrapper. Anything inside it — disclosure strips, totals rows, per-entry rows —
 * must use a lighter hairline or a coloured tint, never a second instance of this
 * same grey bordered box, or the panel becomes boxes inside boxes and scanability
 * drops. See specs/UI_DESIGN_SPEC.md.
 */
/**
 * Month + year selects for a "YYYY-MM" value.
 *
 * Replaces `<input type="month">`, whose year is a bare spinner: there is no visible
 * range, you cannot see what is selectable, and reaching a start date 20 years back
 * means clicking an arrow 240 times. Reported by the owner — "the year does not show a
 * range of years in the mortgage drop down".
 *
 * The year range is DERIVED, never a literal: `MORT_START_YEARS_BACK` covers an
 * existing mortgage already part-paid, and `_FORWARD` covers a purchase you are
 * planning. Anchored to the current year so it can never go stale.
 *
 * Emits the same "YYYY-MM" string the native control did, so `mortgageSchedule` and
 * every stored profile are unaffected.
 */
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const MORT_START_YEARS_BACK = 40;   // a 30-yr mortgage taken out a decade before that
const MORT_START_YEARS_FWD  = 10;   // a purchase you are still planning

function MonthYearSelect({ value, onSet }) {
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(value || "");
  const year  = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  const first = now.getFullYear() - MORT_START_YEARS_BACK;
  const last  = now.getFullYear() + MORT_START_YEARS_FWD;
  // A stored value outside the range must still be selectable, or opening the
  // control would silently rewrite the user's date.
  const years = [];
  for (let y = Math.min(first, year); y <= Math.max(last, year); y++) years.push(y);
  const emit = (yy, mm) => onSet(`${yy}-${String(mm).padStart(2, "0")}`);
  const sel = {
    background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0",
    borderRadius: 4, padding: "4px 6px", fontSize: 11,
    fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
  };
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <select style={sel} value={month} onChange={(e) => emit(year, Number(e.target.value))}>
        {MONTH_NAMES.map((nm, i) => <option key={nm} value={i + 1}>{nm}</option>)}
      </select>
      <select style={sel} value={year} onChange={(e) => emit(Number(e.target.value), month)}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </span>
  );
}

function ACard({ title, accent, desc, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;
  const heading = (
    <div style={{
      fontSize: 14, fontWeight: 700, color: "#e2e8f0",
      marginBottom: desc || !isOpen ? 5 : 12,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span>{title}</span>
      {collapsible && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{isOpen ? "▾" : "▸"}</span>}
    </div>
  );

  return (
    <div style={{
      background: "var(--card-bg)",
      border: "1px solid rgba(255,255,255,0.08)",
      // `accent` is a thin left edge, not a tinted title — it keeps the colour
      // coding while every card's heading stays the same legible near-white.
      borderLeft: accent ? `3px solid ${accent}` : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: 16,
    }}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{ background: "none", border: "none", padding: 0, margin: 0, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
        >
          {heading}
        </button>
      ) : heading}
      {desc && isOpen && (
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>{desc}</div>
      )}
      {isOpen && children}
    </div>
  );
}

function AssumptionsPanel({ values, onChange }) {
  // Live model list for the AI Model dropdown. Debounced because this reads a
  // key the user is still typing — firing per keystroke would send a stream of
  // half-keys to Google and rate-limit the one request that matters.
  const [liveModels, setLiveModels] = useState([]);
  const geminiKey = values.geminiApiKey || "";
  useEffect(() => {
    if (!geminiKey.trim()) { setLiveModels([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      import("./ai/ai-analysis.js")
        .then(({ fetchAvailableModels }) => fetchAvailableModels(geminiKey))
        .then((ids) => { if (alive) setLiveModels(ids); })
        .catch(() => { if (alive) setLiveModels([]); });
    }, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [geminiKey]);
  // Live list wins; the shipped constant is the fallback before a key exists.
  // Labels come from the shipped list where we have one, so familiar models keep
  // their "(recommended)" / cost notes instead of becoming bare ids.
  const modelOptions = liveModels.length
    ? liveModels.map((id) => ({ id, label: GEMINI_MODELS.find(m => m.id === id)?.label || id }))
    : GEMINI_MODELS.map(({ id, label }) => ({ id, label }));

  const {
    dob,
    ssCola,
    preRetireEq,
    postRetireEq,
    hcShockAge,
    hcProb,
    hcMin,
    hcMax,
  } = values;

  // Shared helper — this used to divide elapsed ms by 365.25 days, so it could
  // report a different age than the About You panel for the same birthday.
  const derivedAge = ageFromDob(dob) ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── TAX SETTINGS ────────────────────────────────────────────────────
          The two tax knobs that were buried in Personal Profile. Both are
          genuinely tax mechanics, and the joint-RMD toggle keys off filing
          status, so it belongs beside the cost-basis field rather than next to
          someone's name. */}
      <ACard title="Tax Settings" accent="var(--accent)"
        desc="How AiRA taxes your withdrawals. Defaults are fine for most people.">
        <ARow label="Taxable cost basis" desc="Percent of your taxable brokerage balance that is cost basis (from your brokerage statement). The rest is unrealized gain — selling realizes it as LTCG income, taxed at 0/15/20% federal (plus state, plus NIIT above the MAGI threshold) and counted toward Social Security's provisional income and Medicare IRMAA.">
          <ANumInput value={values.taxableBasisPct ?? 70} onSet={(v) => onChange("taxableBasisPct", v)} min={0} max={100} step={5} suffix="%" />
        </ARow>
        {(values.filingStatus || "mfj") !== "single" && (
          <Toggle
            val={values.useJointRmdTable}
            onChange={(v) => onChange("useJointRmdTable", v)}
            label="👥 Use Joint & Last Survivor RMD Table (spouse >10 yrs younger)"
            accent="var(--accent-purple)"
          />
        )}
      </ACard>

      {/* EXPENSE MODEL CARD */}
      <ACard title="Housing & Fixed Obligations" accent="#f59e0b" collapsible defaultOpen={false}>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 12 }}>
          Separate housing &amp; fixed obligations from core lifestyle spend. The MC engine adds each carveout to the portfolio draw automatically.
        </div>
        {/* Moved here from Personal Profile: an appreciation rate for real
            estate belongs with the housing inputs it applies to, not beside
            the user's date of birth. */}
        <ARow label="Home / RE Annual Growth" desc="Annual appreciation rate applied to real estate values in the Net Worth projection.">
          <ANumInput value={values.reGrowthRate} onSet={(v) => onChange("reGrowthRate", v)} min={0} max={10} step={0.5} suffix="%" />
        </ARow>
        <ARow label="Housing type" desc="Own = mortgage P&I drawn from portfolio until payoff. Rent = inflation-adjusted annual rent. None = housing already in core spend.">
          <select
            value={values.housingType || "own"}
            onChange={(e) => onChange("housingType", e.target.value)}
            style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
          >
            <option value="own">Own (mortgage)</option>
            <option value="rent">Rent</option>
            <option value="none">None / already in spend</option>
          </select>
        </ARow>
        {(values.housingType || "own") === "rent" && (
          <ARow label="Annual rent" desc="Today's dollars — inflated each year in simulation">
            {/* ✅ Fixed: Now correctly uses annualRent field */}
            <ANumInput value={values.annualRent} onSet={(v) => onChange("annualRent", v)} min={0} max={MAX_MONEY_INPUT} step={500} />
          </ARow>
        )}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 8 }}>
            Other Expenses or One Time Obligations (HOA fees, subscriptions, etc. )
          </div>
          {(values.carveouts || []).map((c, idx) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px 28px", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input
                type="text"
                value={c.label}
                placeholder="Label"
                onChange={(e) => {
                  const updated = [...(values.carveouts || [])];
                  updated[idx] = { ...c, label: e.target.value };
                  onChange("carveouts", updated);
                }}
                style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}
              />
              <input
                type="number"
                value={c.annual}
                min={0}
                step={100}
                placeholder="$/yr"
                onChange={(e) => {
                  const updated = [...(values.carveouts || [])];
                  updated[idx] = { ...c, annual: Number(e.target.value) };
                  onChange("carveouts", updated);
                }}
                style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
              <input
                type="number"
                value={c.endYear}
                min={2025}
                max={2080}
                step={1}
                placeholder="End yr"
                onChange={(e) => {
                  const updated = [...(values.carveouts || [])];
                  updated[idx] = { ...c, endYear: Number(e.target.value) };
                  onChange("carveouts", updated);
                }}
                style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
              <button
                onClick={() => onChange("carveouts", (values.carveouts || []).filter((_, i) => i !== idx))}
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 5, cursor: "pointer", fontSize: 13, padding: "2px 6px" }}
              >×</button>
            </div>
          ))}
          <div style={{ fontSize: 9, color: "#334155", marginBottom: 6 }}>Label · $/yr · End year (calendar year when obligation ends)</div>
          <button
            onClick={() => onChange("carveouts", [...(values.carveouts || []), { id: Date.now().toString(), label: "", annual: 0, endYear: new Date().getFullYear() + 5 }])}
            style={{ fontSize: 11, background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.25)", color: "var(--accent)", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
          >+ Add obligation</button>
        </div>
      </ACard>

      {/* ROTH CONVERSION CARD */}
      <ACard title="Roth Conversion Strategy" accent="var(--accent-purple)">
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 12 }}>
          After each year's spending withdrawal, AiRA converts additional pretax → Roth to fill up to your target bracket. Tax on conversion is funded from the pretax bucket.
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5, marginBottom: 12 }}>
          The bracket-fill target is set on <strong style={{ color: "var(--accent-purple)" }}>Scenarios → 📊 Conversion Plan</strong>,
          right above the ladder it shapes — it's saved here in your profile so the Withdrawal Plan
          and Monte Carlo runs use the same setting.
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, marginTop: 4 }}>
          🎓 FAFSA / CSS College-Aid Protection — enter a year to cap Roth conversions during your child's college aid window. Leave blank to disable.
        </div>
        <div style={{ display: "flex", gap: 16, marginLeft: 4 }}>
          <ARow label="FAFSA cap through year" desc="Cap conversions at 12% bracket through this year (FAFSA uses 2-yr prior income). Leave blank to skip.">
            <input
              type="number"
              value={values.fafsaEndYear || ""}
              onChange={(e) => onChange("fafsaEndYear", e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g. 2031"
              min={2026} max={2060}
              style={{ width: 100, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}
                onFocus={selectAllOnFocus}
              />
          </ARow>
          <ARow label="CSS Profile cap through year" desc="Cap conversions at 22% bracket through this year (CSS Profile period). Leave blank to skip.">
            <input
              type="number"
              value={values.cssEndYear || ""}
              onChange={(e) => onChange("cssEndYear", e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g. 2033"
              min={2026} max={2060}
              style={{ width: 100, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}
                onFocus={selectAllOnFocus}
              />
          </ARow>
        </div>
        {/* Paying conversion tax from money the plan never tracks is the single
            biggest way to flatter a Roth strategy — every dollar converted lands
            in the Roth untouched, funded from a pot the simulation never
            depletes. A user put it well: "unlimited outside funds should come
            with a warning: do you have a money tree?" It stays available because
            some people genuinely hold cash outside the modeled accounts, but it
            no longer passes as a neutral default. */}
        <ARow label="Tax funding source" desc="Who pays the tax on each conversion. 'From taxable' debits your real taxable / HSA / cash buckets — the honest default for most people. 'From the conversion' withholds the tax out of the amount transferred, so less lands in the Roth. 'Outside cash' is kept only so older saved profiles still load — it now behaves exactly like 'From taxable'.">
          <select
            value={values.taxFunding || "from_taxable"}
            onChange={(e) => onChange("taxFunding", e.target.value)}
            style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
          >
            <option value="from_taxable">From taxable / HSA / cash bucket (recommended)</option>
            <option value="from_conv">From the conversion (withhold)</option>
            <option value="outside_cash">Outside cash (legacy — same as From taxable)</option>
          </select>
        </ARow>
        {(values.taxFunding === "outside_cash") && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "rgba(251,146,60,0.10)", border: "1px solid rgba(251,146,60,0.35)",
            fontSize: 11, color: "#fdba74", lineHeight: 1.55,
          }}>
            <strong>Legacy setting — now identical to 'From taxable'.</strong> This option used to
            pay conversion tax from an unlimited outside pot the simulation never tracked, which
            overstated the benefit. AiRA no longer models money you have not entered.
            <div style={{ marginTop: 6, color: "#fcd9b6" }}>
              Conversion tax is now drawn from your real balances — taxable first, then cash, then
              pre-tax only if those run out — so the plan can genuinely run short paying it. Switch to
              <strong> From taxable</strong> when convenient; the numbers will not change.
            </div>
          </div>
        )}

      </ACard>

      {/* WITHDRAWAL ORDER — sourcing controls moved to the Withdrawal Plan tab
          (design-authority: single point of control + proximity to the waterfall
          they shape). Profile keeps a read-only pointer for discoverability. */}
      <ACard title="Withdrawal Order" accent="var(--accent-teal)">
        <div style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5 }}>
          The <strong style={{ color: "var(--accent)" }}>account draw order</strong> (which bucket drains first —
          tax-reactive, custom, or pre-tax first) and the sourcing guardrails — pre-tax bracket ceiling,
          IRMAA guard, Roth reserve, and SS-torpedo warnings — are set on{" "}
          <strong style={{ color: "var(--accent-teal)" }}>Scenarios → 📋 Withdrawal Plan</strong>, right above the
          waterfall they shape. The distribution strategy stays here in Profile.
        </div>
      </ACard>

      {/* MONTE CARLO MODEL PARAMETERS CARD */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#34d399",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          Monte Carlo Model Parameters
        </div>
        <ARow label="Target Portfolio Value for Early Retirement" desc="This is your retirement goal. This is the number that answers, What number do I need to retire? What is my retirement $$$ where no matter what, I RETIRE!!.">
          <ANumInput value={values.earlyRetireTarget} onSet={(v) => onChange("earlyRetireTarget", v)} min={0} max={MAX_MONEY_INPUT} step={50000} />
        </ARow>
        <ARow label="Reassess Portfolio Target" desc="Portfolio value at which to start seriously planning exit. This number is a number where, if you hit this, would reconsider your target goal? This is a number that is a secondary decision. If you hit this, would you be ok with this goal if something caused a change in your plan,">
          <ANumInput value={values.portfolioGoal} onSet={(v) => onChange("portfolioGoal", v)} min={0} max={MAX_MONEY_INPUT} step={50000} />
        </ARow>
        {/* Moved here from Personal Profile: it's a return assumption, so it
            belongs with the other return/market assumptions. */}

        <ARow label="Inflation (CPI)" desc="Annual inflation rate used for spending indexing, Monte Carlo real-dollar deflation, and Social Security COLA adjustments.">
          <ANumInput value={values.inf ?? 2.5} onSet={(v) => onChange("inf", v)} min={0} max={15} step={0.1} suffix="%" />
        </ARow>

        <ARow label="Cash return" desc="Annual return on cash/savings (HYSA, SGOV, money market). Drives the cash bucket in the Monte Carlo AND the Withdrawal Plan tab.">
          <ANumInput value={values.cashRealReturn} onSet={(v) => onChange("cashRealReturn", v)} min={0} max={8} step={0.1} suffix="%" />
        </ARow>
        <ARow label="SS COLA / yr" desc="Social Security cost-of-living adjustment (default 2.4%)">
          <ANumInput value={values.ssCola} onSet={(v) => onChange("ssCola", v)} min={0} max={6} step={0.1} suffix="%" />
        </ARow>
        <ARow label="Pre-retirement equity weight" desc="Stock share while you're still saving, up to your retirement age. Higher = more growth and bigger swings, which you can absorb because you aren't withdrawing yet. Sets both the average return AND the volatility in the Monte Carlo. Default 91%.">
          <ANumInput value={values.preRetireEq} onSet={(v) => onChange("preRetireEq", v)} min={50} max={100} step={1} suffix="%" />
        </ARow>
        <ARow label="Post-retirement equity weight" desc="Stock share once you retire. This is your sequence-of-returns dial: raising it lifts the median outcome but widens the downside, so success rate can FALL even as the median rises. Lower it if an early crash would end the plan. Default 70%.">
          <ANumInput value={values.postRetireEq} onSet={(v) => onChange("postRetireEq", v)} min={30} max={100} step={1} suffix="%" />
        </ARow>
        {/* Sits directly under the two weights it arbitrates between — this
            field answers "which one applies this year?", so it belongs beside
            them, not with the retirement-age inputs it is deliberately NOT
            tied to. Blank = the default, so the row reads as optional. */}
        <ARow
          label="Switch to the post-retirement mix at age"
          desc={`When you shift from the pre- to the post-retirement stock share. Leave blank to shift at your retirement age (${values.retireAge}) — the default. Set it LATER to stay aggressive into early retirement (a bridge job or pension can fund the gap), or EARLIER to de-risk before you stop working. This is a separate decision from when you retire.`}
        >
          <input
            type="number"
            value={values.glidepathSwitchAge ?? ""}
            onChange={(e) => onChange("glidepathSwitchAge", e.target.value ? parseInt(e.target.value) : null)}
            placeholder={`${values.retireAge ?? ""}`}
            min={AGE_LIMITS.retire.min}
            max={AGE_LIMITS.retire.max}
            style={{ width: 100, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}
            onFocus={selectAllOnFocus}
          />
        </ARow>
      </div>

      {/* HEALTHCARE SHOCK CARD */}
      <ACard title="Healthcare Shock Model" accent="#f87171" collapsible defaultOpen={false}>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 12 }}>
          In each simulation year after the shock age, there is a random probability of a large one-time healthcare cost.
        </div>
        <ARow label="Shock start age" desc="Age after which annual healthcare shocks can occur (default 72)">
          <ANumInput value={values.hcShockAge} onSet={(v) => onChange("hcShockAge", v)} min={60} max={85} step={1} />
        </ARow>
        <ARow label="Annual shock probability" desc="Chance of a shock in any given year (default 3.5%)">
          <ANumInput value={values.hcProb} onSet={(v) => onChange("hcProb", v)} min={0} max={20} step={0.5} suffix="%" />
        </ARow>
        <ARow label="Shock cost — minimum" desc="Low end of randomized healthcare shock cost (default $70,000)">
          <ANumInput value={values.hcMin} onSet={(v) => onChange("hcMin", v)} min={0} max={MAX_MONEY_INPUT} step={5000} />
        </ARow>
        <ARow label="Shock cost — maximum" desc="High end of randomized healthcare shock cost (default $130,000)">
          <ANumInput value={values.hcMax} onSet={(v) => onChange("hcMax", v)} min={0} max={MAX_MONEY_INPUT} step={5000} />
        </ARow>
      </ACard>
      <div
        style={{
          fontSize: 10,
          color: "#334155",
          fontStyle: "italic",
          textAlign: "right",
        }}
      >
        Changes take effect on next Monte Carlo run · These replace all hardcoded simulation values
      </div>

      {/* ── AI ASSISTANT ────────────────────────────────────────────────────
          Its own card, per request. These are credentials/config for an
          optional feature — nothing to do with the retirement model — so
          mixing them in with identity fields made both harder to scan.
          Collapsed by default: set once, or never (AI also works on credits
          without a key). */}
      <ACard title="AI Assistant" accent="#c4b5fd" collapsible defaultOpen={false}
        desc="Optional. Bring your own free Gemini key to run AI analysis without spending AiRA credits.">
        <ARow label="Gemini API Key" desc="Bring your own free key from Google AI Studio to unlock AI analysis.">
          <input
            type="password"
            value={values.geminiApiKey || ''}
            onChange={(e) => onChange('geminiApiKey', e.target.value)}
            placeholder="AIza..."
            style={{ width: "260px", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}
          />
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#60a5fa", marginLeft: 8 }}>Get free key →</a>
        </ARow>
        {/* The list is fetched from Google when a key is present, because a
            hardcoded one is guaranteed to rot: ids are retired per-audience, so
            "gemini-2.5-flash is no longer available to NEW users" keeps working
            for the developer's own project and 404s for everyone else — invisible
            in testing, and the user's first sign of it is a raw Gemini 404 at the
            moment they click Analyse. The shipped list is only the fallback for
            when there is no key yet or the probe fails. */}
        <ARow label="AI Model" desc="Fetched live from Google using your key, so a model Google retires disappears from this list instead of failing mid-analysis.">
          <select
            value={values.geminiModel || DEFAULT_GEMINI_MODEL}
            onChange={(e) => onChange('geminiModel', e.target.value)}
            style={{ width: "260px", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
          >
            {modelOptions.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
            {/* A saved model that Google no longer lists must still render, or the
                select would silently show a DIFFERENT model than the one stored. */}
            {!modelOptions.some(m => m.id === (values.geminiModel || DEFAULT_GEMINI_MODEL)) && (
              <option value={values.geminiModel || DEFAULT_GEMINI_MODEL}>
                {values.geminiModel || DEFAULT_GEMINI_MODEL} (not offered by your key)
              </option>
            )}
          </select>
          <span style={{ fontSize: 10, color: liveModels.length ? "var(--accent-teal)" : "var(--text-muted)", marginLeft: 8 }}>
            {liveModels.length
              ? `${liveModels.length} models available to your key`
              : (GEMINI_MODELS.find(m => m.id === (values.geminiModel || DEFAULT_GEMINI_MODEL))?.note
                 || "Enter your API key to load the live model list")}
          </span>
        </ARow>
      </ACard>
    </div>
  );
}

function ContribPanel({ values, onChange, onNavigateStep }) {
  const annual401k = values.contrib || 0;
  const hsaMonthly = values.hsaMonthly || 0;
  const employerContrib = values.employerContrib || 0;
  const rothContrib = values.rothContrib || 0;
  const taxableContrib = values.taxableContrib || 0;
  const hsaAnnual = hsaMonthly * 12;

  // ── Per-person contributions (§24.1) ────────────────────────────────────
  // Only the job-bound streams are per person. Brokerage savings are household
  // money with no employment link, and the HSA stops at Medicare enrolment
  // rather than at retirement — splitting either would model the wrong rule.
  const sp = values.spouse || {};
  const spouseOn = !!sp.enabled;
  const setSpouse = (patch) => onChange("spouse", { ...sp, ...patch });
  const sp401k    = sp.contrib || 0;
  const spEmp     = sp.employerContrib || 0;
  const spRoth    = sp.rothContrib || 0;
  const spouseTotal = spouseOn ? sp401k + spEmp + spRoth : 0;
  const totalSavings = annual401k + hsaAnnual + employerContrib + rothContrib + taxableContrib + spouseTotal;

  // Phase A models contributions only up to the PRIMARY's retirement date,
  // because the retirement loop has no concept of them. When the spouse's own
  // date lands later, the plan silently uses the primary's — which is exactly
  // what it did before this feature, but the user must be told rather than left
  // to assume the later date was honoured.
  const spouseStopOnPrimaryClock = spouseOn ? contribStopOnPrimaryClock(values) : Infinity;
  const spouseWorksPastPrimary = Number.isFinite(spouseStopOnPrimaryClock)
    && spouseStopOnPrimaryClock > (values.retireAge || 0)
    && spouseTotal > 0;

  // Shared "profile section card" chrome — one consistent look so sections read
  // as a uniform, logically-ordered stack instead of scattered mismatched blocks.
  // Section chrome comes from <ACard> — this panel used to define its own
  // byte-identical copy (sectionCard/sectionTitle/sectionDesc), which is how the
  // Profile ended up with four competing section styles. One implementation.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* §18 Phase B — section headers split Money In by WHEN each stream applies.
          A retired user skips "While Working" immediately (progressive disclosure);
          a still-working user knows the retirement half is a plan, not something
          to fill in today. Cards inside each group are the pre-existing ACards —
          this is a grouping label, not a nested chrome. */}
      <div style={{
        marginBottom: 2,
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--text-faint)",
      }}>
        While Working
      </div>

      {/* ── Income card 1: Annual Contributions (inputs + savings total together) ── */}
      <ACard title="💰 Annual Contributions" desc="Still working? Enter your annual retirement-account contributions — leave at 0 if you're already retired.">
        <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 10, lineHeight: 1.4 }}>⚠ Employer Contribution and Brokerage/After-Tax Savings aren't capped by the tool — the IRS doesn't set a hard per-field limit on either, but real-world amounts are still bounded by your actual plan and income. 401(k), HSA, and Roth IRA below stay capped at their real legal limits.</div>
        <WFieldRow label="401(k) / 403(b) / 457(b) — pre-tax only" helper="Your PRE-TAX employee deferral. Roth 401(k)/403(b) money does NOT belong here — this field is taxed as ordinary income on withdrawal and drives your future RMDs. Put Roth deferrals in the Roth line below until a dedicated Roth 401(k) field exists (REQUIREMENTS §22.1).">
          <ANumInput value={annual401k} onSet={(v) => onChange("contrib", v)} min={0} max={250_000} step={500} suffix="/yr" />
        </WFieldRow>
        <WFieldRow label="HSA Monthly Contribution" helper="Family limit $8,550 + $1,000 catch‑up (2026).">
          <ANumInput value={hsaMonthly} onSet={(v) => onChange("hsaMonthly", v)} min={0} max={2_000} step={50} suffix="/mo" />
        </WFieldRow>
        <WFieldRow label="Employer Contribution ($/yr)" helper="Fixed annual employer money in dollars — 401(k) match + profit sharing. Compounds in the Monte Carlo accumulation until your retirement age.">
          <ANumInput value={employerContrib} onSet={(v) => onChange("employerContrib", v)} min={0} max={999_000_000_000} step={500} suffix="/yr" />
        </WFieldRow>
        <WFieldRow label="Roth IRA Contribution" helper="Direct or backdoor Roth. Grows tax‑free and is drawn last, so it never triggers IRMAA or the SS torpedo.">
          <ANumInput value={rothContrib} onSet={(v) => onChange("rothContrib", v)} min={0} max={250_000} step={500} suffix="/yr" />
        </WFieldRow>
        <WFieldRow label="Brokerage / After‑Tax Savings" helper="Money you invest OUTSIDE a retirement account. Keep it here rather than adding it to your 401(k) — these dollars are withdrawn at long‑term capital-gains rates against their cost basis, and they don't raise your RMDs at 75.">
          <ANumInput value={taxableContrib} onSet={(v) => onChange("taxableContrib", v)} min={0} max={999_000_000_000} step={1_000} suffix="/yr" />
        </WFieldRow>

        {/* Pointer, not a toggle. The one spouse switch lives in About You
            (§24.1 follow-up): it was previously buried in the Social Security
            card, which meant discovering per-person contributions required
            visiting a later step and a card about a different subject. */}
        {!spouseOn && (
          <div style={{ padding: "10px 12px", marginTop: 4, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.28)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span>Two of you saving? Enter your spouse's contributions separately so they stop on <strong style={{ color: "#c4b5fd" }}>their</strong> retirement date, not yours.</span>
            {/* Index 0 is AboutYouPanel in ProfileWizard's PANELS array. */}
            <button
              type="button"
              onClick={() => onNavigateStep && onNavigateStep(0)}
              style={{
                fontSize: 11, color: "#c4b5fd", background: "none", border: "none",
                padding: 0, cursor: onNavigateStep ? "pointer" : "default",
                textDecoration: onNavigateStep ? "underline" : "none",
              }}
              disabled={!onNavigateStep}
            >
              Add a spouse in About You →
            </button>
          </div>
        )}

        {/* ── Spouse's job-bound contributions (§24.1) ────────────────────────
            Shown only when the spouse is enabled, so a single-person profile is
            visually unchanged. Splitting the AMOUNTS alone would change no
            number — all three engines sum into buckets — so the field that
            earns this section is "Their retirement age": it is the only input
            here that moves a dollar. */}
        {spouseOn && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-purple)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Your spouse
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Only the contributions tied to <em>their</em> job go here — they stop when your spouse stops
              working, which may not be when you do. Brokerage savings and the HSA above stay
              household-wide: brokerage money isn't tied to a job, and HSA contributions stop at
              Medicare enrolment rather than at retirement.
            </div>
            {/* Plain input, NOT ANumInput: this field must stay nullable, and
                ANumInput clamps a blank to `min` on blur — which would silently
                write a retirement age the user never entered. Same pattern the
                other nullable fields (fafsaEndYear/cssEndYear) already use. */}
            <WFieldRow label="Their retirement age" helper="Their OWN age when they stop working — not yours. This is the field that changes your projection: it decides how many more years their contributions keep landing. Leave blank to use your retirement age.">
              <input
                type="number"
                value={sp.retireAge ?? ""}
                onChange={(e) => setSpouse({ retireAge: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
                placeholder="same as you"
                min={AGE_LIMITS.retire.min} max={AGE_LIMITS.retire.max}
                style={{ width: 120, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
            </WFieldRow>
            <WFieldRow label="Their 401(k) / 403(b) / 457(b) — pre-tax only" helper="Their PRE-TAX employee deferral, entered separately from yours so it can stop on their date.">
              <ANumInput value={sp401k} onSet={(v) => setSpouse({ contrib: v })} min={0} max={250_000} step={500} suffix="/yr" />
            </WFieldRow>
            <WFieldRow label="Their employer contribution ($/yr)" helper="Their match + profit sharing. Follows the same job, so it stops on the same date.">
              <ANumInput value={spEmp} onSet={(v) => setSpouse({ employerContrib: v })} min={0} max={999_000_000_000} step={500} suffix="/yr" />
            </WFieldRow>
            <WFieldRow label="Their Roth IRA contribution" helper="Direct or backdoor. Separate from yours because the annual limit and the catch-up age are per person.">
              <ANumInput value={spRoth} onSet={(v) => setSpouse({ rothContrib: v })} min={0} max={250_000} step={500} suffix="/yr" />
            </WFieldRow>

            {spouseWorksPastPrimary && (
              <div style={{
                marginTop: 4, padding: "10px 12px", borderRadius: 8,
                background: "rgba(251,146,60,0.10)", border: "1px solid rgba(251,146,60,0.35)",
                fontSize: 11, color: "#fdba74", lineHeight: 1.55,
              }}>
                <strong>Not yet modelled past your retirement.</strong> Your spouse keeps working until
                you are {Math.round(spouseStopOnPrimaryClock)}, but AiRA currently stops all
                contributions when <em>you</em> retire at {values.retireAge}. Their last{" "}
                {Math.round(spouseStopOnPrimaryClock - (values.retireAge || 0))} year(s) of saving are
                NOT in the projection — the plan is conservative here, not optimistic.
                <div style={{ marginTop: 6, color: "#fed7aa" }}>
                  In the meantime you can enter their ongoing pay under <strong>Other Income</strong>,
                  which does model income after you retire — it just won't add to an account balance.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Total belongs WITH the contributions that make it up (logical flow). */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>💰 Total annual savings <span style={{ color: "var(--text-faint)" }}>
            {spouseTotal > 0
              ? `(you ${fmtDollar(annual401k + employerContrib + rothContrib)} + spouse ${fmtDollar(spouseTotal)} + HSA ${fmtDollar(hsaAnnual)} + brokerage ${fmtDollar(taxableContrib)})`
              : "(incl. employer, HSA, Roth & brokerage)"}
          </span></span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(totalSavings)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>/yr</span></span>
        </div>
      </ACard>

      {/* §18 Phase B — second section header. Border-top separates the two
          groups; the shipped 6-card flat list read as peer streams, which
          buried the timing distinction. */}
      <div style={{
        marginTop: 4, marginBottom: 2, paddingTop: 12,
        borderTop: "1px solid rgba(255,255,255,0.10)",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--text-faint)",
      }}>
        In Retirement
      </div>

      {/* ── Income card 2: SOCIAL SECURITY (moved from Retirement Plan step) ──
          §18 Phase B: SS is money coming IN, not a withdrawal setting. Moved
          here so every income source lives in the same step. The primary +
          spouse + widow's-penalty block moved as one unit; every field,
          helper, and disclosure is unchanged from where it lived before. */}
      <ACard title="Social Security" accent="#7c3aed">
        <WFieldRow label="Social Security Benefit" helper="Monthly benefit at your SS start age. (Per Month)">
          <ANumInput value={Math.round((values.ssb || 0) / 12)} onSet={(v) => onChange("ssb", Math.round(v * 12))} min={0} max={10_000} step={50} suffix="/mo" />
        </WFieldRow>
        <WFieldRow label="SS Start Age" helper="Age you plan to claim Social Security.">
          <ANumInput value={values.ssAge || 67} onSet={(v) => onChange("ssAge", v)} min={AGE_LIMITS.ss.min} max={AGE_LIMITS.ss.max} step={1} suffix=" yrs"/>
        </WFieldRow>

        {/* ── Spouse Social Security (§21 Phase 1) ────────────────────────────
            Everything here is a number the user reads off ssa.gov. We deliberately
            do NOT derive benefits from a PIA + claim-age schedule: SSA's own
            estimate beats our reconstruction of it, and it cannot drift out of
            date on us. See REQUIREMENTS §21 "agreed approach".

            Only fields the engine actually reads are shown. There is no
            "when does my spouse die" input yet, because the engine does not model
            that event — shipping the control first would create exactly the kind of
            dead setting src/ghostSettings.test.js exists to catch. */}
        {/* Read-only pointer, NOT a second checkbox. `spouse.enabled` is one
            household fact with one switch, in About You — see the note there.
            Duplicating the toggle here is the pattern §31 removed. */}
        {!values.spouse?.enabled && (
          <div style={{ padding: "10px 12px", marginBottom: 16, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.28)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span>Modelling one benefit. Add a spouse to include <strong style={{ color: "#c4b5fd" }}>their</strong> benefit, claim age and survivor benefits.</span>
            {/* Index 0 is AboutYouPanel in ProfileWizard's PANELS array. */}
            <button
              type="button"
              onClick={() => onNavigateStep && onNavigateStep(0)}
              style={{
                fontSize: 11, color: "#c4b5fd", background: "none", border: "none",
                padding: 0, cursor: onNavigateStep ? "pointer" : "default",
                textDecoration: onNavigateStep ? "underline" : "none",
              }}
              disabled={!onNavigateStep}
            >
              Add a spouse in About You →
            </button>
          </div>
        )}

        {values.spouse?.enabled && (() => {
          const sp = values.spouse || {};
          const setSpouse = (patch) => onChange("spouse", { ...sp, ...patch });
          // The spousal top-up is 50% of the HIGHER earner's PIA (the full-retirement-age
          // amount) — not 50% of whatever they actually claim, and delayed credits never
          // raise it. So we have to ask for the FRA amount separately; it is the one
          // number that cannot be inferred from what someone is receiving.
          const primaryPia = Number(values.ssPia) || 0;
          const spousePia  = Number(sp.ssPia) || 0;
          const higherPia  = Math.max(primaryPia, spousePia);
          const topUp      = Math.max(0, higherPia * 0.5 - spousePia);
          // Per-person clock (§24). The engines walk ONE age — the primary's — so
          // the gap is what places the spouse's milestones on that timeline.
          const gap        = spouseAgeOffset(values);
          const spouseAge  = personAgeNow(sp);
          const yourAge    = personAgeNow(values);
          const spouseClaimAtYourAge = (sp.ssAge || 67) + gap;
          return (
            <>
              {/* §24 #1 — THE enabler. Without it the spouse's claim age was
                  compared against the PRIMARY's age, so a younger spouse started
                  collecting early by exactly the age gap (see spousalSS.test.js).
                  Asked for first, because every other spouse figure below is
                  interpreted against it. */}
              <WFieldRow
                label="Spouse's date of birth"
                helper="Their own age drives when their benefit starts, when they reach Medicare at 65, and their own RMD age. Leave blank to assume they are the same age as you."
              >
                <input
                  type="date"
                  value={sp.dob || ""}
                  onChange={(e) => setSpouse({ dob: e.target.value })}
                  style={{
                    background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0",
                    borderRadius: 6, padding: "5px 8px", fontSize: 12,
                    fontFamily: "'JetBrains Mono',monospace", width: 130,
                  }}
                />
              </WFieldRow>
              {/* Disclose the derivation where it is entered: a date field that
                  silently shifts ten years of income needs to show its own effect. */}
              <div style={{
                margin: "-8px 0 16px", padding: "8px 12px", borderRadius: 8, fontSize: 11, lineHeight: 1.55,
                background: sp.dob ? "rgba(124,58,237,0.08)" : "rgba(148,163,184,0.07)",
                border: `1px solid ${sp.dob ? "rgba(167,139,250,0.28)" : "rgba(148,163,184,0.2)"}`,
                color: sp.dob ? "#c4b5fd" : "var(--text-secondary)",
              }}>
                {sp.dob && spouseAge != null && yourAge != null ? (
                  <>
                    Your spouse is <strong>{spouseAge}</strong> and you are <strong>{yourAge}</strong> —
                    {gap === 0 ? " the same age" : ` a ${Math.abs(gap)}-year gap (${gap > 0 ? "they are younger" : "they are older"})`}.
                    {" "}Their benefit therefore starts when <strong>you</strong> are {spouseClaimAtYourAge},
                    since the plan is drawn on your age.
                  </>
                ) : (
                  <>
                    No spouse birthdate entered, so the plan assumes you are the <strong>same age</strong>.
                    If there is a real gap this matters: a younger spouse's benefit would otherwise be
                    counted years before it actually starts.
                  </>
                )}
              </div>
              <WFieldRow label="Spouse's benefit" helper="What SSA estimates your spouse will receive at the age they plan to claim. (Per Month)">
                <ANumInput value={Math.round((sp.ssb || 0) / 12)} onSet={(v) => setSpouse({ ssb: Math.round(v * 12) })} min={0} max={10_000} step={50} suffix="/mo" />
              </WFieldRow>
              <WFieldRow label="Spouse's SS start age" helper="Their own age when they claim — can differ from yours, since each of you claims independently.">
                <ANumInput value={sp.ssAge || 67} onSet={(v) => setSpouse({ ssAge: v })} min={AGE_LIMITS.ss.min} max={AGE_LIMITS.ss.max} step={1} suffix=" yrs" />
              </WFieldRow>
              <WFieldRow label="Your benefit at full retirement age" helper="From your SSA statement — the amount at FRA, not at the age you plan to claim. Used only for the spousal top-up. (Per Month)">
                <ANumInput value={Math.round(primaryPia / 12)} onSet={(v) => onChange("ssPia", Math.round(v * 12))} min={0} max={10_000} step={50} suffix="/mo" />
              </WFieldRow>
              <WFieldRow label="Spouse's benefit at full retirement age" helper="Same, for your spouse. Enter it even if they never worked — a $0 here still earns the spousal top-up. (Per Month)">
                <ANumInput value={Math.round(spousePia / 12)} onSet={(v) => setSpouse({ ssPia: Math.round(v * 12) })} min={0} max={10_000} step={50} suffix="/mo" />
              </WFieldRow>

              {higherPia > 0 && (
                <div style={{
                  margin: "2px 0 14px", padding: "9px 12px", borderRadius: 8, fontSize: 11, lineHeight: 1.55,
                  background: topUp > 0 ? "rgba(20,184,166,0.09)" : "rgba(148,163,184,0.08)",
                  border: `1px solid ${topUp > 0 ? "rgba(20,184,166,0.3)" : "rgba(148,163,184,0.22)"}`,
                  color: topUp > 0 ? "var(--accent-teal)" : "var(--text-secondary)",
                }}>
                  {topUp > 0 ? (
                    <>
                      <strong>Spousal top-up: {fmtDollar(Math.round(topUp / 12))}/mo</strong> — your spouse's own
                      benefit is below half of the higher earner's full-retirement amount, so Social Security
                      tops it up to that level. Already included in your plan.
                    </>
                  ) : (
                    <>No spousal top-up: your spouse's own benefit already exceeds half of the higher
                    earner's full-retirement amount, so they simply receive their own.</>
                  )}
                </div>
              )}

              {/* §22 — the widow's penalty, now modelled. Replaces the
                  "Not modelled yet" note that sat here. One user-entered age, not
                  a mortality draw, so the event lands in a known year and can be
                  explained rather than merely averaged. */}
              {/* §30 — WHO dies first. Not cosmetic: it decides whose age drives the
                  plan horizon, Medicare, the age-65 add-on, the RMD clock and the
                  survivor's own FRA. Asked before the age, because the age below is
                  read as belonging to whoever is selected here. */}
              <WFieldRow
                label="Who passes first"
                helper="The higher earner is often the older partner, so this is frequently the more realistic case — and it changes far more than the benefit: the plan then has to fund the survivor's whole life, not yours."
              >
                <div style={{ display: "flex", gap: 6 }}>
                  {[["spouse", "My spouse"], ["primary", "Me"]].map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSpouse({ firstToDie: val })}
                      style={{
                        background: (sp.firstToDie || "spouse") === val ? "rgba(251,146,60,0.18)" : "transparent",
                        border: `1px solid ${(sp.firstToDie || "spouse") === val ? "rgba(251,146,60,0.55)" : "#1e3a5f"}`,
                        color: (sp.firstToDie || "spouse") === val ? "#fdba74" : "var(--text-secondary)",
                        borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600,
                      }}
                    >{lbl}</button>
                  ))}
                </div>
              </WFieldRow>
              <WFieldRow
                label={(sp.firstToDie === "primary") ? "Model my death at my age" : "Model the first death at spouse's age"}
                helper="Optional. Leave blank to skip. This is the hardest thing for a couple to plan for and the easiest to underestimate — the tax increase is usually larger than the benefit lost."
              >
                <ANumInput
                  value={sp.deathAge ?? 0}
                  onSet={(v) => setSpouse({ deathAge: v > 0 ? v : null })}
                  min={0} max={AGE_LIMITS.end.max} step={1}
                  suffix={sp.deathAge ? " yrs" : ""}
                />
              </WFieldRow>
              {sp.deathAge > 0 ? (() => {
                // §30 — everything here depends on WHO dies. `deathAge` is always the
                // decedent's OWN age, so translate once and derive the rest from the
                // survivor's perspective, exactly as the engine does.
                const primarySurvives = (sp.firstToDie || "spouse") !== "primary";
                const deathAtYourAge = primarySurvives ? sp.deathAge + gap : sp.deathAge;
                const survivorDob = primarySurvives ? values.dob : sp.dob;
                const survFraAge = survivorFra(
                  survivorDob ? parseInt(String(survivorDob).slice(0, 4), 10) : null
                );
                // The survivor's own age in the death year.
                const survAgeAtDeath = primarySurvives ? deathAtYourAge : sp.deathAge - gap;
                const survClaim = resolveSurvivorClaimAge(sp.survivorClaimAge, survAgeAtDeath);
                const decOwnClaimAge = primarySurvives ? (sp.ssAge || 67) : (values.ssAge || 67);
                const deceasedHadClaimed = sp.deathAge >= decOwnClaimAge;
                const basis = survivorBasis({
                  deceasedCheck: primarySurvives ? (Number(sp.ssb) || 0) : (Number(values.ssb) || 0),
                  deceasedPia:   primarySurvives ? (Number(sp.ssPia) || 0) : (Number(values.ssPia) || 0),
                  deceasedHadClaimed,
                });
                const quoted = Number(sp.survivorBenefitAtClaim) || 0;
                const factor = quoted > 0 ? 1 : survivorReductionFactor(survClaim, survFraAge);
                const survAmt = quoted > 0 ? quoted : basis * factor;
                const ownAmt = primarySurvives ? (Number(values.ssb) || 0) : (Number(sp.ssb) || 0);
                const jointTotal = ownAmt + (Number(sp.ssb) || 0) + topUp;
                return (
                  <>
                    {/* §30 — the survivor's own benefit and the survivor benefit are
                        INDEPENDENT (deemed filing does not apply), so this needs its
                        own claim age. It is the only real flexibility a survivor has
                        and the app could not express it before. */}
                    <WFieldRow
                      label="Survivor claims the survivor benefit at age"
                      helper={`Survivor benefits can start at 60 — earlier than the 62 floor on your own benefit — and they are a SEPARATE benefit, so this age is independent of your own claim age. Blank = claim as soon as eligible (${survClaim}).`}
                    >
                      <ANumInput
                        value={sp.survivorClaimAge ?? 0}
                        onSet={(v) => setSpouse({ survivorClaimAge: v > 0 ? v : null })}
                        min={0} max={AGE_LIMITS.ss.max} step={1}
                        suffix={sp.survivorClaimAge ? " yrs" : ""}
                      />
                    </WFieldRow>
                    <WFieldRow
                      label="Survivor benefit SSA quotes at that age"
                      helper="Optional. If SSA has given you a figure, enter it and AiRA uses it as-is. Leave blank and AiRA derives it from the deceased's benefit, reduced for claiming before survivor full retirement age. (Per Month)"
                    >
                      <ANumInput
                        value={Math.round(quoted / 12)}
                        onSet={(v) => setSpouse({ survivorBenefitAtClaim: Math.round(v * 12) })}
                        min={0} max={10_000} step={50} suffix="/mo"
                      />
                    </WFieldRow>

                    <div style={{
                      margin: "-8px 0 16px", padding: "10px 12px", borderRadius: 8, fontSize: 11, lineHeight: 1.6,
                      background: "rgba(251,146,60,0.09)", border: "1px solid rgba(251,146,60,0.3)", color: "#fdba74",
                    }}>
                      <strong>
                        {firstDeathHeadline(primarySurvives, deathAtYourAge, survAgeAtDeath)}
                      </strong>{" "}
                      {!primarySurvives && gap > 0 && (
                        <span>
                          The plan now runs {gap} year{gap === 1 ? "" : "s"} longer, because the money has to
                          last until <em>your spouse</em> reaches your planning age — not until you would have.
                          That is why the success rate drops.{" "}
                        </span>
                      )}
                      Three things change, and the last is the one people miss:
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        <li>
                          The survivor benefit is{" "}
                          <strong>{fmtDollar(Math.round(survAmt / 12))}/mo</strong>
                          {quoted > 0 ? " (as you entered it, SSA-quoted)" : (
                            <>
                              {" "}— {Math.round(factor * 1000) / 10}% of the{" "}
                              {deceasedHadClaimed ? "benefit they were receiving" : "full-retirement amount they were entitled to"}
                              {factor < 1
                                ? `, permanently reduced for claiming at ${survClaim}, before the survivor full retirement age of ${Math.round(survFraAge * 12) / 12 === survFraAge ? survFraAge : survFraAge.toFixed(2)}`
                                : ", unreduced"}
                            </>
                          )}.
                          {!deceasedHadClaimed && " They died before claiming, so it is based on their FRA amount — eligibility does not depend on them having filed."}
                        </li>
                        <li>
                          Household Social Security falls from{" "}
                          <strong>{fmtDollar(Math.round(jointTotal / 12))}/mo</strong> to the larger of the
                          survivor benefit and the survivor's own{" "}
                          <strong>{fmtDollar(Math.round(ownAmt / 12))}/mo</strong> — never both.
                          {ownAmt > 0 && survAmt > ownAmt && (values.ssAge || 67) > survClaim
                            ? " Because the two are independent, the survivor benefit can be drawn now while your own keeps growing, then switched when yours is larger."
                            : ""}
                        </li>
                        <li>
                          You file <strong>Single</strong> from the following year: narrower brackets, roughly
                          half the standard deduction, halved IRMAA thresholds and half the senior bonus —
                          on a portfolio and an RMD that barely changed.
                        </li>
                      </ul>
                      <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(251,146,60,0.25)", color: "#fcd9b6" }}>
                        <strong>See what it costs:</strong> the <em>Stress Test</em> tab shows a
                        <strong> Widow&apos;s penalty</strong> card — your plan run twice, with and without this
                        death, on the same market paths — so the change in success rate is attributable to
                        the death alone.
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(251,146,60,0.25)", color: "#fcd9b6" }}>
                        Survivor claiming is one of the highest-stakes decisions in Social Security and it
                        turns on both benefit amounts, two different full-retirement ages, health, and whether
                        the survivor is still working. AiRA does not model the earnings test. Get both figures
                        from SSA and have a fee-only advisor check the sequence before anyone files.
                      </div>
                    </div>
                  </>
                );
              })() : (
                <div style={{
                  margin: "-8px 0 16px", padding: "9px 12px", borderRadius: 8, fontSize: 11, lineHeight: 1.55,
                  background: "rgba(148,163,184,0.07)", border: "1px solid rgba(148,163,184,0.2)", color: "var(--text-secondary)",
                }}>
                  No first death modelled — the plan assumes you both live to the end of it and file jointly
                  throughout. The <em>Spouse passes early</em> scenario on the Stress Test tab is a one-off
                  version of the same question.
                </div>
              )}
            </>
          );
        })()}
      </ACard>

      {/* ── Income card 3: RENTAL / AIRBNB (moved from Retirement Plan step) ──
          §18 Phase B: blanket rental income is money coming IN, so it belongs in
          the same step as SS and pensions. Per-property rental stays on the
          Housing tab (that's a separate object with its own fields); this card
          is the household-level fallback the engine uses when no property has
          its own income set. */}
      <ACard title="Rental Income" accent="#295ff1" collapsible defaultOpen={false}>
        <WFieldRow
          label="Rental Net Income (annual)"
          helper={(values.properties || []).some((pr) => Number(pr.income) > 0)
            ? "Ignored — a property below has its own income set, which takes precedence."
            : "Net rental / Airbnb income. Drives the “Rental/Passive” bar in the Income & Expenses chart."}
        >
          <ANumInput value={values.ab || 0} onSet={(v) => onChange("ab", v)} min={0} max={MAX_MONEY_INPUT} step={1000} suffix="/yr" />
        </WFieldRow>
        <WFieldRow label="Rental Growth Rate" helper="Annual growth rate for rental income (default 3%).">
          <ANumInput value={values.abGrowth || 3} onSet={(v) => onChange("abGrowth", v)} min={0} max={10} step={0.5} suffix="%" />
        </WFieldRow>
        <WFieldRow label="Rental Reliability" helper="Probability rental income is received each year (default 80%).">
          <ANumInput value={values.abReliability || 80} onSet={(v) => onChange("abReliability", v)} min={0} max={100} step={5} suffix="%" />
        </WFieldRow>
         <WFieldRow label="Rental Income Ends (year)" helper="Year when rental income is expected to end.">
          <input type="number" value={values.abEndYear || ''} min={2026} max={2100} step={1} onChange={(e) => onChange("abEndYear", Number(e.target.value))} style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"#e2e8f0",
            borderRadius:6, padding:"6px 8px", fontSize:12, fontFamily:"'JetBrains Mono',monospace",
            width:80, textAlign:"right" }}
                onFocus={selectAllOnFocus}
              /> year
        </WFieldRow>
      </ACard>

      {/* ── Income card 4: PENSIONS ────────────────────────────────────────
          Split from Other Income because a pension is a distinct object with a
          TYPE, and the three types behave completely differently in the engine:
          a monthly pension is a recurring stream that offsets spending, while a
          lump sum or cash balance is a deposit into an account that compounds
          from the year it arrives. The type selector is embedded per pension —
          people commonly have more than one, and each can be a different kind.
          Switching type migrates the entry between the two stores. */}
      <ACard title="🏦 Pensions">
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>
          Defined-benefit income. Pick the type for each one — AiRA models them differently, and
          getting it wrong is the most common source of bad numbers here.
        </div>

        {/* Monthly pensions live in otherIncomes; lump/cash live in cashFlowEvents. */}
        {(values.otherIncomes || []).filter(x => x.kind === "pension").map((inc) => (
          <PensionEntry
            key={inc.id}
            type="monthly"
            onTypeChange={(t) => convertPension(values, onChange, inc, "monthly", t)}
            onRemove={() => onChange("otherIncomes", (values.otherIncomes || []).filter((x) => x.id !== inc.id))}
          >
            <OtherIncomeCard
              inc={inc}
              onChange={(updated) => onChange("otherIncomes", (values.otherIncomes || []).map((x) => x.id === inc.id ? updated : x))}
              onRemove={() => onChange("otherIncomes", (values.otherIncomes || []).filter((x) => x.id !== inc.id))}
            />
          </PensionEntry>
        ))}

        {(values.cashFlowEvents || []).filter(e => e.direction === "in" && e.source === "pension").map((ev) => {
          const upd = (patch) => onChange("cashFlowEvents", (values.cashFlowEvents || []).map(x => x.id === ev.id ? { ...x, ...patch } : x));
          const type = ev.bucket === "pretax" && !ev.taxable ? "cash" : "lump";
          return (
            <PensionEntry
              key={ev.id}
              type={type}
              onTypeChange={(t) => convertPension(values, onChange, ev, type, t)}
              onRemove={() => onChange("cashFlowEvents", (values.cashFlowEvents || []).filter(x => x.id !== ev.id))}
            >
              <LumpPensionFields ev={ev} upd={upd} />
            </PensionEntry>
          );
        })}

        <button
          onClick={() => onChange("otherIncomes", [...(values.otherIncomes || []), {
            id: Date.now().toString(), kind: "pension", name: "", annual: 0,
            startYear: new Date().getFullYear(), endYear: null,
            growthMode: "pct", growthRate: 0, growthAmount: 0, growthCapYears: null, taxable: true,
          }])}
          style={{ background: "rgba(14,165,233,0.1)", border: "1px dashed rgba(14,165,233,0.45)", borderRadius: 6, color: "var(--accent)", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", marginTop: 8 }}
        >+ Add pension</button>
      </ACard>

      {/* ── Income card 3: OTHER INCOME ─────────────────────────────────── */}
      <ACard title="💵 Other Income">
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>
          Everything that isn't a pension — part-time work, an annuity, royalties, alimony. Recurring
          amounts paid <em>to</em> you, not balances you draw down.
        </div>
        {(values.otherIncomes || []).filter(x => x.kind !== "pension").map((inc, idx) => (
          <OtherIncomeCard
            key={inc.id}
            inc={inc}
            autoFocus={idx === (values.otherIncomes || []).filter(x => x.kind !== "pension").length - 1 && !inc.annual}
            onChange={(updated) => onChange("otherIncomes", (values.otherIncomes || []).map((x) => x.id === inc.id ? updated : x))}
            onRemove={() => onChange("otherIncomes", (values.otherIncomes || []).filter((x) => x.id !== inc.id))}
          />
        ))}
        <button
          onClick={() => onChange("otherIncomes", [...(values.otherIncomes || []), { id: Date.now().toString(), name: "", annual: 0, startYear: new Date().getFullYear(), endYear: null, growthMode: "pct", growthRate: 0, growthAmount: 0, growthCapYears: null, taxable: true }])}
          style={{ background: "rgba(14,165,233,0.1)", border: "1px dashed rgba(14,165,233,0.45)", borderRadius: 6, color: "var(--accent)", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", marginTop: 8 }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(14,165,233,0.18)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(14,165,233,0.1)"}
        >+ Add another income source</button>
      </ACard>

      {/* ── Income card 4: ONE-OFF INCOME & WINDFALLS ─────────────────────
          A single future inflow — an inheritance, a home sale, a business
          exit. Stored as a cashFlowEvents INFLOW (direction:"in") so the
          engines DEPOSIT it into the chosen account bucket in the year it
          arrives and it compounds from there. It must never be entered as
          recurring Other Income: need = max(0, sp − income) nets a stream
          against ONE year's spending and silently discards the rest — the
          trap this card exists to avoid. Before this card existed the only
          way to enter an inheritance was to disguise it as a lump-sum
          pension. */}
      <ACard title="💰 One-Off Income & Windfalls">
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>
          Money you expect <em>once</em> — an inheritance, a home or business sale. AiRA deposits it into
          the account you pick in the year it arrives, and it compounds from there. It is income, not
          spending — it will never appear under Planned One-Off Expenses.
        </div>
        {(values.cashFlowEvents || []).filter(e => e.direction === "in" && e.source !== "pension").map((ev) => {
          const upd = (patch) => onChange("cashFlowEvents", (values.cashFlowEvents || []).map(x => x.id === ev.id ? { ...x, ...patch } : x));
          return (
            <div key={ev.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, marginBottom: 10, background: "rgba(255,255,255,0.02)", position: "relative" }}>
              <button onClick={() => onChange("cashFlowEvents", (values.cashFlowEvents || []).filter(x => x.id !== ev.id))}
                title="Remove this windfall"
                style={{ position: "absolute", top: 8, right: 8, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 5, cursor: "pointer", fontSize: 12, padding: "2px 8px" }}>×</button>
              <LumpPensionFields ev={ev} upd={upd} placeholder="Inheritance"
                taxHint="(most inheritances are NOT ordinary income — leave unchecked unless it's an inherited pre-tax IRA distribution or similar)" />
            </div>
          );
        })}
        <button
          onClick={() => onChange("cashFlowEvents", [...(values.cashFlowEvents || []), {
            id: Date.now().toString(), source: "windfall", label: "", amount: 0,
            year: new Date().getFullYear() + 5, direction: "in",
            bucket: "taxable", taxable: false, inflate: false,
          }])}
          style={{ background: "rgba(14,165,233,0.1)", border: "1px dashed rgba(14,165,233,0.45)", borderRadius: 6, color: "var(--accent)", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer", marginTop: 8 }}
        >+ Add a windfall</button>
      </ACard>

    </div>
  );
}

const PENSION_TYPES = [
  { id: "monthly", icon: "📅", label: "Monthly / Annual", desc: "Paid every year from a start age" },
  { id: "lump",    icon: "💰", label: "Lump Sum",         desc: "One payment at a set age" },
  { id: "cash",    icon: "🏦", label: "Cash Balance",     desc: "Balance you'll roll over" },
];

/**
 * Moves a pension between the two storage models when its type changes.
 *
 * A monthly pension is a recurring stream (`otherIncomes`), while a lump sum or
 * cash balance is a one-time inflow event (`cashFlowEvents`). They are stored
 * separately because the engines treat them completely differently — one offsets
 * spending each year, the other is deposited into an account and compounds — so
 * switching type has to migrate the record rather than flip a flag.
 *
 * Destination defaults are chosen so most users never touch them: a cash-balance
 * plan is almost always rolled to an IRA (no tax on receipt, becomes RMD-able),
 * whereas a lump sum taken as cash is ordinary income that year and the net
 * proceeds land liquid.
 */
function convertPension(values, onChange, entry, fromType, toType) {
  if (fromType === toType) return;
  const incomes = values.otherIncomes  || [];
  const events  = values.cashFlowEvents || [];
  const label   = entry.name || entry.label || "Pension";
  const amount  = entry.annual || entry.amount || 0;
  const year    = entry.startYear || entry.year || new Date().getFullYear() + 5;

  if (toType === "monthly") {
    onChange("cashFlowEvents", events.filter(x => x.id !== entry.id));
    onChange("otherIncomes", [...incomes.filter(x => x.id !== entry.id), {
      id: entry.id, kind: "pension", name: label, annual: amount,
      startYear: year, endYear: null,
      growthMode: "pct", growthRate: 0, growthAmount: 0, growthCapYears: null, taxable: true,
    }]);
    return;
  }

  const isCash = toType === "cash";
  onChange("otherIncomes", incomes.filter(x => x.id !== entry.id));
  onChange("cashFlowEvents", [...events.filter(x => x.id !== entry.id), {
    id: entry.id, source: "pension", label,
    amount, year, direction: "in",
    bucket: isCash ? "pretax" : "cash",
    taxable: !isCash,
    inflate: false,
  }]);
}

/** Wraps one pension with its embedded type selector. */
function PensionEntry({ type, onTypeChange, onRemove, children }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, marginBottom: 10, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {PENSION_TYPES.map(t => {
          const on = t.id === type;
          return (
            <button key={t.id} onClick={() => onTypeChange(t.id)} title={t.desc}
              style={{
                background: on ? "rgba(14,165,233,0.22)" : "transparent",
                border: `1px solid ${on ? "rgba(56,189,248,0.55)" : "rgba(255,255,255,0.10)"}`,
                color: on ? "#e0f2fe" : "var(--text-muted)",
                borderRadius: 6, padding: "4px 10px", fontSize: 11,
                fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit",
              }}>{t.icon} {t.label}</button>
          );
        })}
        <button onClick={onRemove} title="Remove this pension"
          style={{ marginLeft: "auto", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 5, cursor: "pointer", fontSize: 12, padding: "2px 8px" }}>×</button>
      </div>
      {children}
    </div>
  );
}

/** Fields for a one-time inflow (lump-sum / cash-balance pension, or a
 *  windfall like an inheritance — the One-Off Income card reuses this). */
function LumpPensionFields({ ev, upd, placeholder = "Cash balance pension", taxHint = "(uncheck for a direct rollover)" }) {
  const cell = { background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", width: "100%" };
  const lbl  = { fontSize: 10, color: "var(--text-muted)", marginBottom: 3, display: "block" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr 1.1fr", gap: 8 }}>
      <label><span style={lbl}>Label</span>
        <input type="text" value={ev.label || ""} placeholder={placeholder}
          onChange={(e) => upd({ label: e.target.value })} style={cell} /></label>
      <label><span style={lbl}>Amount</span>
        <input type="number" value={ev.amount || 0} min={0} step={1000}
          onChange={(e) => upd({ amount: Number(e.target.value) })} style={{ ...cell, textAlign: "right" }}
                onFocus={selectAllOnFocus}
              /></label>
      <label><span style={lbl}>Year</span>
        <input type="number" value={ev.year} min={new Date().getFullYear()} max={2090}
          onChange={(e) => upd({ year: Number(e.target.value) })} style={{ ...cell, textAlign: "right" }}
                onFocus={selectAllOnFocus}
              /></label>
      <label><span style={lbl}>Deposit into</span>
        <select value={ev.bucket || "cash"} onChange={(e) => upd({ bucket: e.target.value })} style={{ ...cell, cursor: "pointer" }}>
          <option value="pretax">Pre-tax (IRA rollover)</option>
          <option value="cash">Cash</option>
          <option value="taxable">Taxable brokerage</option>
          <option value="roth">Roth</option>
        </select></label>
      <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
        <input type="checkbox" checked={!!ev.taxable} onChange={(e) => upd({ taxable: e.target.checked })} />
        Taxable as ordinary income in {ev.year}
        <span style={{ color: "var(--text-faint)" }}>{taxHint}</span>
      </label>
    </div>
  );
}

function OtherIncomeCard({ inc, autoFocus, onChange, onRemove }) {
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    if (autoFocus && nameRef.current) nameRef.current.focus();
  }, [autoFocus]);

  const onFocusCard = () => { clearTimeout(blurTimer.current); setFocused(true); };
  const onBlurCard = () => { blurTimer.current = setTimeout(() => setFocused(false), 150); };

  const upd = (patch) => onChange({ ...inc, ...patch });

  return (
    <div
      onFocus={onFocusCard}
      onBlur={onBlurCard}
      style={{
        background: focused ? "rgba(14,165,233,0.05)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${focused ? "rgba(14,165,233,0.4)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 8,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: focused ? 8 : 0 }}>
        <input
          ref={nameRef}
          type="text"
          value={inc.name}
          placeholder="Income source name"
          onChange={(e) => upd({ name: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            color: "#e2e8f0",
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${focused ? "rgba(14,165,233,0.4)" : "rgba(255,255,255,0.1)"}`,
            outline: "none",
            padding: "2px 0",
            fontFamily: "'DM Sans',sans-serif",
            transition: "border-color 0.15s",
          }}
        />
        {!focused && (
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
            {inc.annual ? <span style={{ color: "var(--accent-teal)", fontWeight: 700 }}>{`$${Math.round(inc.annual).toLocaleString()}/yr`}</span> : ""}
            <span style={{ color: "var(--text-muted)" }}>
              {inc.startYear ? ` · ${inc.startYear}` : ""}
              {inc.endYear ? `–${inc.endYear}` : inc.startYear ? "+" : ""}
              {inc.growthMode === "fixed" && inc.growthAmount ? ` · +$${Math.round(inc.growthAmount).toLocaleString()}/yr` : ""}
              {inc.growthMode !== "fixed" && inc.growthRate ? ` · +${inc.growthRate}%/yr` : ""}
            </span>
          </span>
        )}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRemove}
          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: "2px 4px", opacity: 0.5 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "#f87171"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = "var(--text-muted)"; }}
        >✕</button>
      </div>
      {focused && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px 108px 60px auto", gap: 6, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Annual ($)</div>
            <ANumInput value={inc.annual || 0} onSet={(v) => upd({ annual: v })} min={0} max={MAX_MONEY_INPUT} step={1000} suffix="/yr" />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Start yr</div>
            <input type="number" value={inc.startYear || ""} min={2025} max={2100}
              onChange={(e) => upd({ startYear: e.target.value ? Number(e.target.value) : null })}
              style={{ width: "100%", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>End yr</div>
            <input type="number" value={inc.endYear || ""} min={2025} max={2100}
              onChange={(e) => upd({ endYear: e.target.value ? Number(e.target.value) : null })}
              placeholder="∞"
              style={{ width: "100%", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 3 }}>Grows by</div>
            {/* Segmented control — both units visible so it's obvious you can switch. */}
            <div style={{ display: "flex", border: "1px solid #1e3a5f", borderRadius: 5, overflow: "hidden", marginBottom: 4 }}>
              {[["pct", "% /yr"], ["fixed", "$ /yr"]].map(([m, lbl]) => {
                const on = (inc.growthMode || "pct") === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => upd({ growthMode: m })}
                    title={m === "pct" ? "Percentage increase each year (compounds)" : "Fixed dollar increase each year — many pensions raise by a set $ amount"}
                    style={{ flex: 1, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "3px 0", lineHeight: 1, background: on ? "#0ea5e9" : "transparent", color: on ? "#fff" : "var(--text-muted)" }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            {inc.growthMode === "fixed"
              ? <ANumInput value={inc.growthAmount || 0} onSet={(v) => upd({ growthAmount: v })} min={0} max={MAX_MONEY_INPUT} step={100} suffix="/yr" />
              : <ANumInput value={inc.growthRate || 0} onSet={(v) => upd({ growthRate: v })} min={0} max={20} step={0.5} suffix="%" />}
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Cap yrs</div>
            <input type="number" value={inc.growthCapYears || ""} min={1} max={50}
              onChange={(e) => upd({ growthCapYears: e.target.value ? Number(e.target.value) : null })}
              placeholder="∞"
              style={{ width: "100%", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 14 }}>
            <Toggle val={inc.taxable} onChange={(v) => upd({ taxable: v })} accent="#0ea5e9" />
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Taxable</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Trigger a client-side download of CSV text (used for the budget templates).
function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Detailed-expense CSV import. Sits inside the SPENDING section, beside the
 * core-spend inputs (proximity). A one-year budget sums to the US Spending
 * field (inflated forward like a typed number); a multi-year budget becomes an
 * explicit per-year spend schedule that overrides the withdrawal-strategy
 * spend rule. Follows the Boldin "Detailed Budgeter" exclusion convention:
 * mortgage/rent, debt, medical, long-term care, and income tax are modeled
 * elsewhere and must NOT be in the uploaded file.
 */
function ExpenseImport({ values, onChange }) {
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const fileRef = useRef(null);
  const meta = values.spImportMeta || null;

  const handleFile = (file) => {
    if (!file) return;
    setError(""); setWarnings([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const r = parseExpenseCsv(String(e.target.result || ""));
        setWarnings(r.warnings || []);
        const importedAt = new Date().toISOString();
        if (r.mode === "multi") {
          onChange("spSchedule", r.schedule);
          onChange("spImportMeta", {
            mode: "multi", fileName: file.name, importedAt,
            years: r.schedule.length,
            firstYear: r.schedule[0].year, lastYear: r.schedule[r.schedule.length - 1].year,
          });
        } else {
          // Single-year budget lands in the US Spending field; clear any prior schedule.
          onChange("sp", r.total);
          onChange("spSchedule", null);
          onChange("spImportMeta", {
            mode: "single", fileName: file.name, importedAt,
            total: r.total, essentialTotal: r.essentialTotal ?? null,
            lineCount: r.lineItems.length,
          });
        }
      } catch (err) {
        setError(err.message || "Could not read that file.");
      }
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  };

  const clearImport = () => {
    onChange("spSchedule", null);
    onChange("spImportMeta", null);
    setError(""); setWarnings([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#c4b5fd", marginBottom: 4 }}>📄 Import detailed expenses (CSV)</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 8 }}>
        Replace the typed spend above with a line-item budget. <strong style={{ color: "#cbd5e1" }}>Exclude</strong> mortgage/rent,
        debt, medical, long-term care, and income tax — those are modeled separately (Expense Model, carveouts, tax engine).
        Upload <strong style={{ color: "#cbd5e1" }}>one year</strong> (summed and inflated forward) or
        <strong style={{ color: "#cbd5e1" }}> multiple years</strong> (one column or row per year — used as the spend plan for those years).
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => handleFile(e.target.files && e.target.files[0])}
        style={{ display: "none" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => fileRef.current && fileRef.current.click()}
          style={{ fontSize: 12, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#d8b4fe", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}
        >⬆ Choose CSV file</button>
        <button
          onClick={() => downloadCsv("AiRA_budget_template_one_year.csv", SINGLE_YEAR_TEMPLATE)}
          style={{ fontSize: 11, background: "transparent", border: "1px solid #334155", color: "var(--text-secondary)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
        >↓ One-year template</button>
        <button
          onClick={() => downloadCsv("AiRA_budget_template_multi_year.csv", MULTI_YEAR_TEMPLATE)}
          style={{ fontSize: 11, background: "transparent", border: "1px solid #334155", color: "var(--text-secondary)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
        >↓ Multi-year template</button>
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#fca5a5", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "6px 10px" }}>
          ⚠ {error}
        </div>
      )}

      {meta && (
        <div style={{ marginTop: 10, fontSize: 11, color: "#cbd5e1", background: "rgba(94,234,212,0.06)", border: "1px solid rgba(94,234,212,0.2)", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ lineHeight: 1.5 }}>
            {meta.mode === "multi" ? (
              <>
                <strong style={{ color: "var(--accent-teal)" }}>✓ Multi-year budget loaded</strong> — {meta.years} years
                ({meta.firstYear}–{meta.lastYear}) from <em>{meta.fileName}</em>.
                <div style={{ color: "var(--accent-gold)", fontSize: 10, marginTop: 2 }}>
                  This overrides the withdrawal-strategy spend rule. After the last year, the final amount inflates forward.
                </div>
              </>
            ) : (
              <>
                <strong style={{ color: "var(--accent-teal)" }}>✓ One-year budget loaded</strong> — {fmtDollar(meta.total)}/yr
                from {meta.lineCount} line item(s) in <em>{meta.fileName}</em>.
                {meta.essentialTotal != null && (
                  <div style={{ color: "var(--text-secondary)", fontSize: 10, marginTop: 2 }}>
                    Essential (Must Spend): {fmtDollar(meta.essentialTotal)}/yr · Total (Like to Spend) set as US Spending above.
                  </div>
                )}
              </>
            )}
          </div>
          <button
            onClick={clearImport}
            style={{ flexShrink: 0, fontSize: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}
          >Clear</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: "var(--accent-gold)" }}>
          {warnings.map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}
    </div>
  );
}

/**
 * Spending & Expenses tab — the typed spending fields AND the detailed-budget
 * CSV uploader live together (user request: they're two ways of expressing the
 * same thing, so they belong on one screen — type a number, or upload a budget
 * that replaces/overrides it, with the interaction visible in place). The
 * uploaded budget drives the same fields it always did (sp / spSchedule /
 * spImportMeta); the Retirement Plan tab keeps a compact spending summary.
 */
function ExpensesPanel({ values, onChange }) {
  const meta = values.spImportMeta || null;
  const usSp = values.sp || 0;
  const outOfCountrySp = values.spOutOfCountry != null ? values.spOutOfCountry : (values.spSpendOutofState || 0);
  const combinedSp = usSp + outOfCountrySp;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <ACard title="Spending" accent="var(--accent-teal)">
        {/* §28.1 OPEN 1 (Gary): the after-tax basis was stated on the RESULTS
            surfaces and in the About tab, but not HERE — which is where the user
            forms their mental model of what number to type. Wording deliberately
            matches the results-bar tooltip and the About card so the three agree.
            Inline and visible, not a tooltip: per §28.2 this is tier-1 (it changes
            how the number is READ), and `title=` does not exist on touch. */}
        <div style={{
          marginBottom: 16, padding: "9px 12px", borderRadius: 8,
          background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.28)",
          fontSize: 12, color: "#cbd5e1", lineHeight: 1.55,
        }}>
          <strong style={{ color: "var(--accent-gold)" }}>Enter what you want to spend — after tax.</strong>{" "}
          This is money that reaches your household. AiRA withdraws extra from the portfolio
          to pay the tax bill <em>on top of</em> this figure, so do not add taxes in yourself
          and do not reduce it for them.
        </div>
        <WFieldRow label="US Spending (annual)" helper="Domestic household spending in today's dollars, after tax. Subject to state income tax when residing in-state.">
          <ANumInput value={values.sp || 0} onSet={(v) => onChange("sp", v)} min={0} max={MAX_MONEY_INPUT} step={1000} suffix="/yr" />
        </WFieldRow>
        <WFieldRow label="Out-of-Country Spending (annual)" helper="Spending that occurs abroad in today's dollars, after tax. Always drawn from the portfolio but never subject to US state tax.">
          <ANumInput value={values.spOutOfCountry != null ? values.spOutOfCountry : (values.spSpendOutofState || 0)} onSet={(v) => onChange("spOutOfCountry", v)} min={0} max={MAX_MONEY_INPUT} step={1000} suffix="/yr" />
        </WFieldRow>
        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(94,234,212,0.06)", border: "1px solid rgba(94,234,212,0.2)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Total combined annual spending, after tax (used for portfolio draw)</span>
          <strong style={{ color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", fontSize: 14 }}>{fmtDollar(combinedSp)}/yr</strong>
        </div>
        {/* §28.1 OPEN 3, discoverability half. The spending curve is the one
            setting that silently changes the number typed above, and it lives in
            the sidebar — so a user who suspects his spending is being padded looks
            HERE and finds nothing. Read-only pointer, not a second control: the
            toggle stays a single point of control (design principle 1). */}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {values.smile !== false ? (
            <>
              <span style={{ color: "var(--accent-purple)" }}>Spending curve is ON</span> — this target is re-scaled
              per year (down through the active years, up again in late retirement), so year-by-year
              spending will not equal the figure above. The Withdrawal Plan table shows the exact
              percentage each year. Turn it off under <strong style={{ color: "#cbd5e1" }}>Options → Spending curve</strong> in the sidebar.
            </>
          ) : (
            <>
              <span style={{ color: "var(--text-muted)" }}>Spending curve is OFF</span> — this target stays flat
              in real terms for every year of the plan. Enable it under <strong style={{ color: "#cbd5e1" }}>Options → Spending curve</strong> in the sidebar.
            </>
          )}
        </div>
      </ACard>

      <ACard title="Detailed Expense Budget" accent="#c4b5fd" desc="Optional. Upload a real line-item budget instead of typing one number." collapsible defaultOpen={false}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
          Instead of typing a single spending number above, upload your real line-item budget.
          A <strong style={{ color: "#cbd5e1" }}>one-year</strong> budget is summed into the US Spending field
          above and inflated forward like a typed number.
          A <strong style={{ color: "#cbd5e1" }}>multi-year</strong> budget becomes an explicit per-year spending
          plan that overrides your withdrawal strategy's spend rule for those years — the Monte Carlo,
          Withdrawal Plan, and deterministic schedule all follow it.
        </div>
        <ExpenseImport values={values} onChange={onChange} />
        {!meta && (
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            No budget loaded — the plan currently uses the typed spending numbers above.
          </div>
        )}
      </ACard>

      {/* ── PLANNED ONE-OFF EXPENSES ───────────────────────────────────────
          Distinct from the recurring spend above: this is the roof-in-10-years
          / car-every-7 case, a cost that lands in one future year rather than
          running continuously. Additive on top of the base spend, so the
          withdrawal strategy still governs the recurring plan. */}
      <ACard title="Planned One-Off Expenses" accent="#fb923c"
        desc="Big costs you can see coming — a new roof, a car, a wedding, a heavy travel year. Enter today's price; AiRA inflates it to the year it happens.">
        {/* OUTFLOWS ONLY. cashFlowEvents also stores inflows (pension lump
            sums, inheritances — direction:"in"), which are deposits into an
            account, not spending. Rendering the whole array here made a $1M
            inheritance appear as a $1M planned EXPENSE, so users reasonably
            concluded their windfall was being cancelled out. Inflows are
            managed from the Income step (Pensions / One-Off Income cards). */}
        {(values.cashFlowEvents || []).filter(e => e.direction !== "in").length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 70px 78px 28px", gap: 6, marginBottom: 4, fontSize: 9, color: "var(--text-faint)" }}>
            <span>What</span><span style={{ textAlign: "right" }}>Cost</span><span style={{ textAlign: "right" }}>Year</span>
            <span style={{ textAlign: "right" }}>Every</span><span style={{ textAlign: "right" }}>Until</span><span />
          </div>
        )}
        {(values.cashFlowEvents || []).filter(e => e.direction !== "in").map((ev) => {
          // Patch/remove by id, not index — the render list is filtered, so an
          // index into it does not address the same element in the full array.
          const upd = (patch) => onChange("cashFlowEvents",
            (values.cashFlowEvents || []).map(x => x.id === ev.id ? { ...x, ...patch } : x));
          const cell = { background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" };
          const num = { ...cell, textAlign: "right" };
          return (
            <div key={ev.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 70px 78px 28px", gap: 6, alignItems: "center" }}>
                <input type="text" value={ev.label} placeholder="New roof"
                  onChange={(e) => upd({ label: e.target.value })} style={cell} />
                <input type="number" value={ev.amount} min={0} step={1000} placeholder="$"
                  onChange={(e) => upd({ amount: Number(e.target.value) })} style={num}
                onFocus={selectAllOnFocus}
              />
                <input type="number" value={ev.year} min={new Date().getFullYear()} max={2090} step={1}
                  onChange={(e) => upd({ year: Number(e.target.value) })} style={num}
                onFocus={selectAllOnFocus}
              />
                {/* Blank = one-time. */}
                <input type="number" value={ev.recurEveryYears || ""} min={0} max={50} step={1} placeholder="—"
                  title="Repeat every N years. Leave blank for a one-time cost."
                  onChange={(e) => upd({ recurEveryYears: Number(e.target.value) || 0 })} style={num}
                onFocus={selectAllOnFocus}
              />
                <input type="number" value={ev.recurUntilYear || ""} min={new Date().getFullYear()} max={2090} step={1} placeholder="—"
                  title="Stop repeating after this year. Leave blank to repeat for the whole plan."
                  disabled={!ev.recurEveryYears}
                  onChange={(e) => upd({ recurUntilYear: Number(e.target.value) || null })}
                  style={{ ...num, opacity: ev.recurEveryYears ? 1 : 0.35 }}
                onFocus={selectAllOnFocus}
              />
                <button
                  onClick={() => onChange("cashFlowEvents", (values.cashFlowEvents || []).filter(x => x.id !== ev.id))}
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 5, cursor: "pointer", fontSize: 13, padding: "2px 6px" }}
                >×</button>
              </div>
              {/* Committed vs deferrable decides whether the guardrails may trim
                  this in a bad market — the same idea as Must Spend vs Like to
                  Spend for recurring costs. A roof can't wait; a trip can. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 10, color: "var(--text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!ev.deferrable} onChange={(e) => upd({ deferrable: e.target.checked })} />
                I could delay this in a bad market <span style={{ color: "var(--text-faint)" }}>(guardrails may trim it)</span>
              </label>
            </div>
          );
        })}
        <button
          onClick={() => onChange("cashFlowEvents", [
            ...(values.cashFlowEvents || []),
            { id: Date.now().toString(), label: "", amount: 0, year: new Date().getFullYear() + 5, recurEveryYears: 0, recurUntilYear: null, deferrable: false, direction: "out" },
          ])}
          style={{ fontSize: 11, background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.25)", color: "#fb923c", borderRadius: 6, padding: "5px 12px", cursor: "pointer", marginTop: 4 }}
        >+ Add planned expense</button>
        <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>
          Leave <strong style={{ color: "var(--text-muted)" }}>Every</strong> blank for a one-time cost. Set it to 7 for a car
          every seven years, and use <strong style={{ color: "var(--text-muted)" }}>Until</strong> to stop it (e.g. when you'd stop driving).
        </div>
      </ACard>
    </div>
  );
}

function RetirementPanel({ values, onChange, onNavigateStep, onNavigateTab }) {
  const usSp = values.sp || 0;
  const outOfCountrySp = values.spOutOfCountry != null ? values.spOutOfCountry : (values.spSpendOutofState || 0);
  const combinedSp = usSp + outOfCountrySp;
  const twoHousehold = values.twoHousehold ?? false;   // toggle ONLY controls state tax now
  const baseSpend = combinedSp || 100000;
  const floorPct = values.gkFloorPct ?? GK_FLOOR_DEFAULT_PCT;
  const ceilingPct = values.gkCeilingPct ?? GK_CEILING_DEFAULT_PCT;
  // An imported Must/Like budget drives the floor/ceiling; else % of core spend
  // (keep the 100k display fallback for the percent path when no spend is set yet).
  const guard = resolveSpendGuardrails({ sp: usSp, spOutOfCountry: outOfCountrySp, gkFloorPct: floorPct, gkCeilingPct: ceilingPct, spImportMeta: values.spImportMeta });
  const guardFromImport = guard.source === "import";
  const floor = guardFromImport ? guard.gkFloor : Math.round(baseSpend * (floorPct / 100));
  const ceiling = guardFromImport ? guard.gkCeiling : Math.round(baseSpend * (ceilingPct / 100));
  const strategy = resolveStrategy(values.withdrawalStrategy);

  // Initial WR diagnostic — pass combined sp so the helper, the GK card, the metrics WR
  // badge, and the gk-bar strategy strap all show the same number.
  const wr = computeInitialWR({ ...values, sp: combinedSp });
  const { initWRpct, projectedPort, initDrawEst, ssAtRetire, rentalAtRetire,
    annualAdds, accumRate, nominalRate, inflRate, yrsToRetire } = wr;
  const retireAge = values.retireAge || 65;
  const inSafeBand = initWRpct >= 5.0 && initWRpct <= 5.5;
  const wrColor = inSafeBand ? "#34d399" : (initWRpct > 5.5 ? "#f87171" : "var(--accent-gold)");

  const activeScenario = twoHousehold
    ? "🌴 Claiming non-residency — no state income tax"
    : `🏠 Resident of ${values.stateOfResidence || "your state"} — state tax applies`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7dd3fc" }}>
        <strong>State tax:</strong> {activeScenario} · Sidebar toggle → "Non-resident (no state tax)"
      </div>

      <ACard title="Withdrawal Strategy" accent="var(--accent-purple)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            width: "100%",
            background: "#0d1b2a",
            border: "1px solid #1e3a5f",
            color: "#e2e8f0",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            fontFamily: "'Inter',sans-serif",
          }}>
            {getStrategyLabel(strategy)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{getStrategyDescription(strategy)}</div>
          {/* Real navigation: jumps to 📋 Analysis and lands directly on its
              💸 WITHDRAWAL PLAN sub-tab (ScenariosTab's own sub-tab state is
              seeded from AiRAForecaster's pendingScenarioSubTab — see
              navigateToTab). There is no "Withdrawal Schedule" tab; that was
              the original bug — this pointer named a tab that never existed. */}
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab("scenarios", "withdrawals")}
            style={{
              fontSize: 11, color: "var(--accent-teal)", background: "none", border: "none",
              padding: 0, cursor: onNavigateTab ? "pointer" : "default",
              textDecoration: onNavigateTab ? "underline" : "none", textAlign: "left",
            }}
            disabled={!onNavigateTab}
          >
            Change this on the 💸 Withdrawal Plan tab →
          </button>
        </div>
      </ACard>

      {/* Spending inputs + the budget uploader live together in the 💸 Spending
          & Expenses tab now. This compact summary keeps the number visible here
          (the WR diagnostic and guardrails below are calibrated to it). */}
      <ACard title="Spending" accent="var(--accent-teal)">
        <div style={{ padding: "10px 12px", background: "rgba(94,234,212,0.06)", border: "1px solid rgba(94,234,212,0.2)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>
            Combined annual spending <span style={{ color: "var(--accent-gold)" }}>(after tax)</span>{values.spImportMeta ? (
              <> · 📄 <strong style={{ color: "#c4b5fd" }}>{values.spImportMeta.mode === "multi" ? "multi-year budget active" : "budget-driven"}</strong></>
            ) : null}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", fontSize: 14 }}>{fmtDollar(combinedSp)}/yr</strong>
            {/* Same wizard, different step — index 3 is ExpensesPanel in
                ProfileWizard's PANELS array (see the "Spending & Expenses"
                STEPS entry it's paired with). */}
            <button
              type="button"
              onClick={() => onNavigateStep && onNavigateStep(3)}
              style={{
                fontSize: 11, color: "#c4b5fd", background: "none", border: "none",
                padding: 0, cursor: onNavigateStep ? "pointer" : "default",
                textDecoration: onNavigateStep ? "underline" : "none",
              }}
              disabled={!onNavigateStep}
            >
              Edit in 💸 Spending &amp; Expenses →
            </button>
          </span>
        </div>
      </ACard>

      {/* §18 Phase B: Social Security moved to the 💵 Money In step, alongside
          contributions and pensions. Everything about it (primary + spouse +
          widow's penalty) lives there now — this card is a pointer, kept so
          users who learned to find SS here are not left staring at a blank. */}
      <ACard title="Social Security" accent="#7c3aed">
        <div style={{ padding: "10px 12px", background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.28)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>Now in the <strong style={{ color: "#c4b5fd" }}>💵 Money In</strong> step — SS is income, not a withdrawal setting.</span>
          {/* Index 2 is ContribPanel in ProfileWizard's PANELS array. */}
          <button
            type="button"
            onClick={() => onNavigateStep && onNavigateStep(2)}
            style={{
              fontSize: 11, color: "#c4b5fd", background: "none", border: "none",
              padding: 0, cursor: onNavigateStep ? "pointer" : "default",
              textDecoration: onNavigateStep ? "underline" : "none",
            }}
            disabled={!onNavigateStep}
          >
            Edit in 💵 Money In →
          </button>
        </div>
      </ACard>

      {/* §18 Phase B: rental / Airbnb moved to the 💵 Money In step alongside
          SS and pensions. Pointer left in place so the field's old home still
          says where to find it. */}
      <ACard title="Rental Income" accent="#295ff1" collapsible defaultOpen={false}>
        <div style={{ padding: "10px 12px", background: "rgba(41,95,241,0.08)", border: "1px solid rgba(41,95,241,0.28)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>Now in the <strong style={{ color: "#c4b5fd" }}>💵 Money In</strong> step — it is income, same as SS and pensions.</span>
          {/* Index 2 is ContribPanel in ProfileWizard's PANELS array. */}
          <button
            type="button"
            onClick={() => onNavigateStep && onNavigateStep(2)}
            style={{
              fontSize: 11, color: "#c4b5fd", background: "none", border: "none",
              padding: 0, cursor: onNavigateStep ? "pointer" : "default",
              textDecoration: onNavigateStep ? "underline" : "none",
            }}
            disabled={!onNavigateStep}
          >
            Edit in 💵 Money In →
          </button>
        </div>
      </ACard>

      <ACard title="📐 Strategy Detail" accent="var(--accent-purple)" desc="The parameters the strategy you picked above actually uses.">
        {strategy === "gk" && (
          <>
            <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 12 }}>🛡️ Guyton‑Klinger Guardrails</div>
            <div style={{
              marginBottom: 14,
              padding: "10px 12px",
              background: inSafeBand ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)",
              border: `1px solid ${withAlpha(wrColor, "40")}`,
              borderRadius: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>Initial portfolio draw rate</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: wrColor, fontFamily: "'JetBrains Mono',monospace" }}>{initWRpct.toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", fontStyle: "italic" }}>
                  {inSafeBand ? "in 5–5.5% safe band" : initWRpct > 5.5 ? "above safe band — consider lower spend or later retirement" : "below safe band — room to spend more or retire earlier"}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.5 }}>
                spend {fmtDollar(baseSpend)} − SS {fmtDollar(ssAtRetire)} − rental {fmtDollar(rentalAtRetire)} = portfolio draw {fmtDollar(initDrawEst)}<br/>
                projected portfolio at age {retireAge} (today's dollars): {fmtDollar(projectedPort)}<br/>
                = current {fmtDollar(values.port || 0)} grown {yrsToRetire}yr @ {(accumRate * 100).toFixed(1)}% real ({(nominalRate * 100).toFixed(1)}% nominal − {(inflRate * 100).toFixed(1)}% infl) + {fmtDollar(annualAdds)}/yr contrib<br/>
                ⇒ {fmtDollar(initDrawEst)} ÷ {fmtDollar(projectedPort)} = <strong style={{ color: wrColor }}>{initWRpct.toFixed(1)}%</strong>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
              {guardFromImport
                ? <>Floor = <strong style={{ color: "#cbd5e1" }}>Must Spend</strong> · Ceiling = <strong style={{ color: "#cbd5e1" }}>Like to Spend</strong> (from your imported budget — the slider %s below are ignored)</>
                : <>Floor = {floorPct}% of core spend · Ceiling = {ceilingPct}% of core spend</>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Floor</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-gold)", fontFamily: "'JetBrains Mono',monospace" }}>{guardFromImport ? fmtDollar(floor) : `${floorPct}%`}</div><div style={{ fontSize: 10, color: "#334155" }}>{guardFromImport ? "essentials / yr" : `${fmtDollar(floor)} / yr`}</div></div>
              <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.1)" }} />
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Ceiling</div><div style={{ fontSize: 28, fontWeight: 700, color: "#34d399", fontFamily: "'JetBrains Mono',monospace" }}>{guardFromImport ? fmtDollar(ceiling) : `${ceilingPct}%`}</div><div style={{ fontSize: 10, color: "#334155" }}>{guardFromImport ? "full budget / yr" : `${fmtDollar(ceiling)} / yr`}</div></div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 16, justifyContent: "center" }}>
              <WFieldRow label="Floor %" helper="Hard floor on real spending. Spending will never drop below this even after multiple GK cuts. Lower % = willing to belt-tighten more in bad markets.">
                <ANumInput value={values.gkFloorPct ?? GK_FLOOR_DEFAULT_PCT} onSet={(v) => onChange("gkFloorPct", v)} min={50} max={95} step={5} suffix="%" />
              </WFieldRow>
              <WFieldRow label="Ceiling %" helper="Cap on lifestyle creep. Spending will never rise above this even after multiple GK raises. Higher % = willing to spend more freely in bull markets.">
                <ANumInput value={values.gkCeilingPct ?? GK_CEILING_DEFAULT_PCT} onSet={(v) => onChange("gkCeilingPct", v)} min={105} max={200} step={5} suffix="%" />
              </WFieldRow>
            </div>
            <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(14,165,233,0.06)", border: "1px solid rgba(14,165,233,0.18)", borderRadius: 8, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <div style={{ fontWeight: 700, color: "#7dd3fc", marginBottom: 6 }}>Guyton‑Klinger — the 5 rules</div>
              <div style={{ marginLeft: 8, marginBottom: 6 }}>
                <strong>1. Initial draw.</strong> Derived from your spending ÷ portfolio at retirement. Safe range is 5–5.5%.<br/>
                <strong>2. Capital Preservation.</strong> If WR rises 20% above initial → cut spending 10%.<br/>
                <strong>3. Prosperity.</strong> If WR falls 20% below initial → raise spending 10%.<br/>
                <strong>4. Inflation rule.</strong> Adjust spending by CPI only after positive-return years, capped at 6%.<br/>
                <strong>5. Longevity rule.</strong> Skip the −10% cut when ≤15 years remain to your end-age.
              </div>
              <div style={{ marginBottom: 4 }}>The <strong style={{ color: "var(--accent-gold)" }}>Floor</strong> and <strong style={{ color: "#34d399" }}>Ceiling</strong> sliders above are a safety belt on top of the 5 rules — spending can drift within those bands but never past them.</div>
              <div style={{ fontStyle: "italic", color: "var(--text-muted)" }}>Defaults: 65 / 135. Tighten (e.g. 80 / 120) to keep spending closer to plan; widen (e.g. 55 / 150) to allow larger swings.</div>
            </div>
          </>
        )}
        {strategy === "fixed" && (
          <>
            <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 12 }}>📊 Fixed Percentage Withdrawal</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>Each year, withdraw a fixed percentage of the current portfolio balance.</div>
            <div style={{ textAlign: "center", marginBottom: 14 }}><div style={{ fontSize: 11, color: "var(--text-faint)" }}>Withdrawal Rate</div><div style={{ fontSize: 32, fontWeight: 700, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{values.fixedWithdrawalRate || 4.0}%</div><div style={{ fontSize: 10, color: "#334155" }}>of portfolio balance each year</div></div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <WFieldRow label="Withdrawal Rate" helper="Annual percentage of portfolio to withdraw (default 4%).">
                <ANumInput value={values.fixedWithdrawalRate ?? 4.0} onSet={(v) => onChange("fixedWithdrawalRate", v)} min={2} max={10} step={0.1} suffix="%" />
              </WFieldRow>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16, fontStyle: "italic", textAlign: "center" }}>Spending will fluctuate with portfolio value.</div>
          </>
        )}
        {strategy === "vpw" && (
          <>
            <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 12 }}>📉 Variable Percentage Withdrawal</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>Each year, the portfolio is amortized over the years remaining to your plan-to age — so the plan is designed to spend down to roughly zero, not to leave an estate.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "var(--text-faint)" }}>Assumed real return</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-gold)", fontFamily: "'JetBrains Mono',monospace" }}>{(((values.vpwRealReturn ?? 0.0376)) * 100).toFixed(2)}%</div></div>
              <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.1)" }} />
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "var(--text-faint)" }}>Amortized to age</div><div style={{ fontSize: 28, fontWeight: 700, color: "#34d399", fontFamily: "'JetBrains Mono',monospace" }}>{values.vpwEndAge ?? values.endAge ?? 100}</div></div>
            </div>
          </>
        )}
        {!["gk", "fixed", "vpw"].includes(strategy) && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>{getStrategyLabel(strategy)} strategy active — see documentation for details.</div>
        )}
      </ACard>
    </div>
  );
}

function formatDate(dateString) {
  if (!dateString) return "Start date";
    const d = new Date(dateString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}


// ── Landing quick-estimate ───────────────────────────────────────────────────
// A deliberately simple heuristic used ONLY on the visitor landing so the sliders
// feel alive. The real 3,000-path engine takes over the moment they enter the app.
const LANDING_SS_ANNUAL = 30000;      // rough real Social Security from 67
const LANDING_REAL_RETURN = 0.045;    // real, after inflation
const LANDING_TARGET = 0.85;          // confidence goal

function landingProject(retireAge, s) {
  const n = Math.max(0, retireAge - s.curAge);
  const grow = Math.pow(1 + LANDING_REAL_RETURN, n);
  const port = s.savings * grow + (n > 0 ? s.contrib * (grow - 1) / LANDING_REAL_RETURN : 0);
  const ss = retireAge >= 67 ? LANDING_SS_ANNUAL : LANDING_SS_ANNUAL * 0.55;
  const need = Math.max(0, s.spend - ss);
  const wr = port > 0 ? need / port : 1;
  const conf = 1 / (1 + Math.exp((wr - 0.042) / 0.006));
  return { port, conf: Math.max(0.02, Math.min(0.985, conf)) };
}
// Search runs to the top of the retire-age range, not a hardcoded 72, so the
// hero can still answer for someone planning to work past 72.
function landingEarliestAge(s) {
  for (let a = Math.max(s.curAge + 1, 50); a <= AGE_LIMITS.retire.max; a++) {
    if (landingProject(a, s).conf >= LANDING_TARGET) return a;
  }
  return null;
}

// Past the normal retirement window the "when can you retire" question is the
// wrong one — the user is already retired (or about to be), and what they want
// to know is whether the money lasts. The hero flips to that framing rather
// than searching future ages that don't apply. `landingProject(curAge, …)` is
// exactly "retire now", which is the right projection for someone drawing down
// today.
const LANDING_ALREADY_RETIRED_AGE = 66;
function landingIsRetired(s) {
  return s.curAge >= LANDING_ALREADY_RETIRED_AGE;
}

// Age at which the drawdown path hits zero, for the already-retired headline.
// Walks the same path the chart draws, so the number and the curve agree.
// "95+" is the cap because the landing model is a teaser, not the real engine —
// anything beyond that should be answered by the actual Monte Carlo.
function landingLastsToAge(s) {
  const pts = landingPath(s, s.curAge);
  const dead = pts.find((p) => p.age > s.curAge && p.val <= 0);
  return dead ? dead.age : "95+";
}
function landingPath(s, retireAge) {
  const pts = [];
  let p = s.savings;
  for (let a = s.curAge; a <= 90; a++) {
    pts.push({ age: a, val: Math.max(0, p) });
    if (a < (retireAge ?? 65)) p = p * (1 + LANDING_REAL_RETURN) + s.contrib;
    else {
      const ss = a >= 67 ? LANDING_SS_ANNUAL : LANDING_SS_ANNUAL * 0.55;
      p = p * (1 + LANDING_REAL_RETURN) - Math.max(0, s.spend - ss);
    }
  }
  return pts;
}
/* ── Landing input scale ──────────────────────────────────────────────────
 * The hero has to serve someone with $200K and someone with $200M on the same
 * 700px track. A LINEAR range cannot: at a $999B max each pixel was worth
 * ~$1.4B, so the smallest possible nudge threw savings into the billions and
 * the readout leapt from "$850K" to "$40000M". Lowering the max just recreates
 * the original complaint — that nobody could enter more than $5M.
 *
 * Two independent fixes, because they solve two different problems:
 *   1. The slider is LOGARITHMIC. Pixels buy percentage change, not dollars, so
 *      one step moves ~0.8% wherever you are: $853K → $860K, $40.1M → $40.4M.
 *      The whole range stays reachable AND every part of it stays precise.
 *   2. The readout is a TYPED FIELD, so the slider's ceiling is a convenience
 *      bound, not a limit. Type $400M and it takes it; the thumb just pins at
 *      the end. Same contract as the `Slider` component above.
 * Values snap to 3 significant figures so dragging yields $1,250,000 rather
 * than $1,253,881 — a number a person would actually say out loud. */
const LANDING_LIMITS = {
  savings: { min: 50_000, max: 250_000_000 },
  contrib: { min:      0, max:   5_000_000 },
  spend:   { min: 40_000, max:   5_000_000 },
};
const LANDING_SLIDER_STEPS = 1000;   // thumb positions, not dollars
const LANDING_LOG_FLOOR = 1_000;     // log(0) is -Infinity; curve starts here

function roundSig(v, digits) {
  if (!(v > 0)) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - (digits - 1));
  return Math.round(v / mag) * mag;
}
function landingPosToVal(pos, min, max) {
  if (pos <= 0) return min;
  const lo = Math.log(Math.max(LANDING_LOG_FLOOR, min));
  const hi = Math.log(max);
  return roundSig(Math.exp(lo + (hi - lo) * (pos / LANDING_SLIDER_STEPS)), 3);
}
function landingValToPos(val, min, max) {
  // A typed value may exceed `max` — pin the thumb rather than reject the number.
  const v = Math.max(min, Math.min(max, val || 0));
  if (v <= 0) return 0;
  const lo = Math.log(Math.max(LANDING_LOG_FLOOR, min));
  const hi = Math.log(max);
  return Math.round(((Math.log(Math.max(LANDING_LOG_FLOOR, v)) - lo) / (hi - lo)) * LANDING_SLIDER_STEPS);
}

/* The hero readout, typed. This is what lets someone enter $180M without the
 * slider needing a $180M-wide linear range: the field is the source of truth
 * and the slider is a fast approximate control over the COMMON range. A typed
 * value above `max` is accepted and the thumb pins at the end. `min` is still
 * enforced — a negative portfolio is meaningless, not merely unusual. */
function LandingMoneyField({ row }) {
  // `draft` is non-null only while focused: during editing we show exactly what
  // was typed so the formatter doesn't fight the caret, and on commit we go back
  // to the formatted display.
  //
  // The draft is mirrored in a ref because Escape must beat the blur that
  // follows it. Escape clears the draft and blurs; blur then fires `commit`,
  // which would still see the pre-Escape draft in React state and commit the
  // very edit Escape just cancelled. The ref is already null by then, so commit
  // correctly no-ops. (`Slider` above solves the same race with a functional
  // setState updater; a ref does it without calling a parent setter from inside
  // an updater function.)
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const put = (v) => { draftRef.current = v; setDraft(v); };
  const commit = () => {
    const d = draftRef.current;
    if (d === null) return;
    put(null);
    const n = parseMoneyInput(d, row.min);
    if (n !== null) row.set(n);   // unparseable text leaves the value untouched
  };
  return (
    <input
      className="lp-val lp-val-input"
      type="text"
      inputMode="decimal"
      aria-label={row.label}
      title="Click to type an exact value — you can enter more than the slider's range"
      value={draft !== null ? draft : row.fmt(row.val)}
      onFocus={(e) => { put(String(row.val)); selectAllOnFocus(e); }}
      onChange={(e) => put(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { commit(); e.currentTarget.blur(); }
        else if (e.key === "Escape") { put(null); e.currentTarget.blur(); }
      }}
    />
  );
}

// First-screen landing shown to visitors with no saved profile. Answers the one
// question — "when can I retire?" — then routes into the full app via onEnter.
function RetirementLanding({ onEnter }) {
  const [curAge, setCurAge] = useState(45);
  const [savings, setSavings] = useState(850000);
  const [contribL, setContribL] = useState(40000);
  const [spend, setSpend] = useState(90000);
  const canvasRef = useRef(null);
  const s = { curAge, savings, contrib: contribL, spend };
  const retired = landingIsRetired(s);
  // Already retired ⇒ the projection IS "drawing down from today", so the
  // reference age is their current age rather than a future retirement date.
  const age = retired ? s.curAge : landingEarliestAge(s);
  const conf = (age != null
    ? landingProject(age, s)
    : landingProject(AGE_LIMITS.retire.max, s)).conf;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth || 700, H = 120;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const pts = landingPath(s, age);
    const pad = 6, maxV = Math.max(...pts.map((p) => p.val), 1);
    const x = (i) => pad + (W - pad * 2) * i / (pts.length - 1);
    const y = (v) => H - pad - (H - pad * 2) * (v / maxV);
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, H - pad); ctx.lineTo(W - pad, H - pad); ctx.stroke();
    if (age != null) {
      const idx = pts.findIndex((p) => p.age === age);
      if (idx >= 0) {
        const rx = x(idx);
        ctx.strokeStyle = "var(--text-faint)"; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(rx, pad); ctx.lineTo(rx, H - pad); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(94,234,212,0.28)"); g.addColorStop(1, "rgba(94,234,212,0.02)");
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(x(i), y(p.val)) : ctx.lineTo(x(i), y(p.val)));
    ctx.lineTo(x(pts.length - 1), H - pad); ctx.lineTo(x(0), H - pad); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(x(i), y(p.val)) : ctx.lineTo(x(i), y(p.val)));
    ctx.strokeStyle = "var(--accent-teal)"; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
  }, [curAge, savings, contribL, spend, age]);

  // `money: false` keeps the age row on a plain linear slider with no typed
  // field — an age is two digits and the range is 25–85, so neither fix applies.
  const rows = [
    { key: "age", label: "Current age", val: curAge, set: setCurAge,
      min: AGE_LIMITS.current.min, max: AGE_LIMITS.current.max, money: false, fmt: (v) => v },
    { key: "savings", label: "What you've saved so far", val: savings, set: setSavings,
      ...LANDING_LIMITS.savings, money: true, fmt: fmtDollar },
    { key: "contrib", label: "Adding each year", val: contribL, set: setContribL,
      ...LANDING_LIMITS.contrib, money: true, fmt: fmtDollar },
    { key: "spend", label: "Spending in retirement", val: spend, set: setSpend,
      ...LANDING_LIMITS.spend, money: true, fmt: (v) => fmtDollar(v) + "/yr" },
  ];

  return (
    <div className="landing">
      <div className="lp-wrap">
        <div className="lp-brand">
          <div className="logo">AiRA <span className="logo-sub">Freedom Financial</span></div>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>v{APP_VERSION}</div>
        </div>

        <div className="lp-eyebrow">Your one-number answer</div>
        <h1 className={"lp-answer" + (age != null && conf < 0.9 ? " short" : "")}>
          {retired
            ? <>Your money lasts to <span className="lp-age">{landingLastsToAge(s)}</span></>
            : age != null
              ? <>You can retire at <span className="lp-age">{age}</span></>
              : <>Let's find your <span className="lp-age">number</span></>}
        </h1>
        <p className="lp-sub">
          {age != null
            ? <>Based on your savings and spending, the math says you reach financial independence{" "}
                <b style={{ color: "var(--text-primary)" }}>{age - curAge <= 0 ? "right now" : `${age - curAge} year${age - curAge === 1 ? "" : "s"} from now`}</b>
                {conf >= 0.92 ? " — with real margin." : " — with a modest cushion."}</>
            : <>No age up to {AGE_LIMITS.retire.max} clears 85% confidence at these numbers yet — try saving more, or trimming the spend.</>}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 38, fontWeight: 800, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{Math.round(conf * 100)}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>% confident<br />at that age</span>
          </div>
          <div style={{ flex: 1, minWidth: 200, height: 10, borderRadius: 100, background: "rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -3, bottom: -3, left: "85%", width: 2, background: "var(--text-faint)" }} />
            <div style={{ height: "100%", borderRadius: 100, width: `${Math.min(100, Math.round(conf * 100))}%`, background: "linear-gradient(90deg,#0d9488,#5eead4)", transition: "width 0.35s" }} />
          </div>
        </div>

        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Median portfolio path</div>
          <canvas ref={canvasRef} style={{ width: "100%", height: 120, display: "block" }} />
        </div>

        <div className="lp-panel">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="lp-row">
                <span className="lp-label">{r.label}</span>
                {r.money
                  ? <LandingMoneyField row={r} />
                  : <span className="lp-val">{r.fmt(r.val)}</span>}
              </div>
              {r.money ? (
                <input className="lp-range" type="range" min={0} max={LANDING_SLIDER_STEPS} step={1}
                  aria-label={r.label}
                  value={landingValToPos(r.val, r.min, r.max)}
                  onChange={(e) => r.set(landingPosToVal(+e.target.value, r.min, r.max))} />
              ) : (
                <input className="lp-range" type="range" min={r.min} max={r.max} step={1}
                  aria-label={r.label}
                  value={r.val} onChange={(e) => r.set(+e.target.value)} />
              )}
            </div>
          ))}
        </div>

        <button className="lp-cta" onClick={() => onEnter(s)}>Take me to the app! →</button>
        <button className="lp-skip" onClick={() => onEnter(null)}>Skip — I'll enter my own details</button>

        <p style={{ marginTop: 32, fontSize: 12, color: "var(--text-faint)", lineHeight: 1.6, maxWidth: "62ch" }}>
          This is a 60-second estimate. The full app runs {MC_PATHS_LABEL} market simulations across your real
          accounts, taxes, Social Security, and withdrawal order — that's where your true plan lives.
        </p>
      </div>
    </div>
  );
}

/**
 * Show a toast and auto-dismiss it. Returns the timer id so the caller's effect
 * can clear it on unmount/re-fire. Errors get a longer dwell than successes —
 * a failed purchase or restore is something the user may need to read twice or
 * copy into a support email.
 */
function setToastTimed(setter, toast, ms) {
  setter(toast);
  return setTimeout(() => setter(null), ms);
}

export default function AiRAForecaster() {
  const [activeTab, setTab] = useState(() =>
    loadProfileFromLocal() ? "networth" : "assumptions"
  );
  // Cross-tab "Edit this on the X tab" pointers (e.g. RetirementPanel's
  // Withdrawal Strategy card) need to land on a specific sub-tab inside
  // ScenariosTab, not just the top-level tab. ScenariosTab's own sub-tab state
  // is local and resets on mount, so it reads this as its initial value —
  // set right before switching activeTab, consumed once, then cleared so a
  // later manual visit to Analysis doesn't get silently redirected.
  const [pendingScenarioSubTab, setPendingScenarioSubTab] = useState(null);
  const navigateToTab = useCallback((tab, subTab = null) => {
    if (subTab) setPendingScenarioSubTab(subTab);
    setTab(tab);
  }, []);
  // The visitor landing is the homepage for anyone without a saved profile —
  // not a one-time splash. It used to be gated on a `aira_welcomed_v1` flag as
  // well, so the moment a visitor clicked through (or hit Skip) the page became
  // permanently unreachable: no link anywhere returns to it. A visitor who
  // bounced and came back tomorrow never saw it again despite never having
  // entered a single number. Gating on the saved profile alone means unregistered
  // visitors always land here, while anyone who has saved a profile goes straight
  // to their dashboard and never sees it. Dismissal still holds for the session
  // (React state), so entering the app is a one-click, non-repeating action.
  const [showWelcome, setShowWelcome] = useState(() => !loadProfileFromLocal());
  const [running, setRunning] = useState(false);
  const [stale, setStale] = useState(false);
  const [mc, setMc] = useState(null);
  const [stress, setStress] = useState(null);
  // Shared hover state so hovering a row in the age-band table highlights the
  // matching age column on the fan chart above (FanChart + MCBandTable are siblings).
  const [hoveredAge, setHoveredAge] = useState(null);

  // §37 Phase B (v1.2.106) — theme state. Display preference only. NEVER
  // forwarded into `params`, NEVER read by any engine. See applyTheme /
  // resolveInitialTheme at module top.
  //
  // TEMPORARILY FORCED TO 'dark' (v1.2.109) — light-mode palette contrast is
  // still WIP after user review found "cards blend into the page" / "font
  // and outline still too dull." Rather than ship a broken light mode, the
  // toggle button is hidden below and initial state is hardcoded to dark.
  // TO RE-ENABLE: swap the initializer back to `resolveInitialTheme` and
  // uncomment the toggle button in the header (search for THEME_TOGGLE).
  const [theme, setTheme] = useState('dark');
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Progress check-ins: a journal of plan snapshots (see LS_CHECKINS_KEY).
  // Requires a completed MC run so the snapshot carries a real success rate.
  const [checkIns, setCheckIns] = useState(loadCheckIns);
  const [checkInFlash, setCheckInFlash] = useState(false);

  const handleSaveCheckIn = () => {
    if (!mc) return;
    const entry = {
      id: `ci_${Date.now()}`,
      ts: new Date().toISOString(),
      successRate: mc.rate,
      stressRate: stress?.rate ?? null,
      port,
      sp,
      retireAge: retAge,
      endAge,
      medianTerminal: mc.term?.p50 ?? null,
      appVersion: APP_VERSION,
    };
    const next = [...checkIns, entry];
    setCheckIns(next);
    saveCheckIns(next);
    setCheckInFlash(true);
    setTimeout(() => setCheckInFlash(false), 2000);
  };
  const handleDeleteCheckIn = (id) => {
    const next = checkIns.filter((c) => c.id !== id);
    setCheckIns(next);
    saveCheckIns(next);
  };
  const handleRenameCheckIn = (id, name) => {
    const next = checkIns.map((c) => (c.id === id ? { ...c, name } : c));
    setCheckIns(next);
    saveCheckIns(next);
  };
  const handleImportCheckIns = (imported) => {
    const next = mergeCheckIns(checkIns, imported);
    setCheckIns(next);
    saveCheckIns(next);
  };

  const [showInterpretation, setShowInterpretation] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [showReport, setShowReport] = useState(false);
  // Re-checked from the server each time the report is opened, so a window that
  // expired (or was unlocked on another device) is picked up without a reload.
  const reportUnlocked = useReportUnlocked(showReport ? 1 : 0);
  // Fail-closed capability probe (GEMINI_API_KEY presence) — see
  // functions/api/report-capability.js. Independent of BILLING_ENABLED so
  // flipping that source-level flag can no longer unlock the report for free
  // on a deployment that isn't actually the operator's own.
  const reportCapable = useReportCapability();
  // Owner preview: true only after /api/admin verified ADMIN_SECRET server-side
  // this session (see admin-panel.js). Lets the operator read the real report
  // without the purchase prompt end users see. `?aira_admin=1` on its own does
  // NOT grant this — the param is in the bundle, the secret is not.
  const ownerVerified = useOwnerVerified();
  // { msg, tone: "ok" | "err" }. Failures must be visible: a silent failure on
  // a paid return or a restore link leaves the customer stuck with no idea why,
  // and no way to tell us what went wrong. Errors persist longer than successes.
  const [stripeToast, setStripeToast] = useState(null);
  const stripeReturn  = useStripeReturn();
  const restoreReturn = useRestoreReturn();
  // Recovery link: opened once on a successful purchase, and re-openable from the
  // credit panel. `null` = closed; an object = showing that link.
  const [recoveryLink, setRecoveryLink] = useState(null);
  useEffect(() => {
    if (stripeReturn?.success && stripeReturn.restoreUrl) {
      setRecoveryLink({ url: stripeReturn.restoreUrl });
    }
  }, [stripeReturn]);
  useEffect(() => {
    if (!stripeReturn) return;
    // A report buyer is granted ZERO credits by design, so the credits wording
    // told someone who had just paid $9 that they received "0 credits added to
    // your account" — the most alarming possible sentence at that moment.
    // Branch on what was actually bought.
    const reportBuy = stripeReturn.packId === "report";
    // The poll above already waited ~12s for the entitlement. If it still is not
    // there the webhook has not landed, and a cheerful "unlocking shortly" leaves
    // someone who has just paid staring at a paywall with no idea what to do —
    // the one failure mode worth designing for, because it is the only one that
    // takes money and delivers nothing. Stripe retries, and the grant is
    // idempotent, so it usually self-heals; say that, and give them a route out
    // if it does not. Amber, not green: this is not a completed transaction yet.
    const stalled = reportBuy && !stripeReturn.reportUnlocked;
    const okMsg = reportBuy
      ? (stripeReturn.reportUnlocked
          // Names the next step, because Stripe's redirect is a full page load:
          // the entitlement and the saved profile both survive it, but `mc` does
          // not, so the 📄 Report button lands DISABLED. A buyer seeing "unlocked"
          // beside a greyed-out button concludes they paid for nothing — and the
          // only existing hint is a title= on a disabled button, which most
          // browsers never render.
          ? "✓ Report unlocked — it's yours permanently. Press ▶ Run Monte Carlo, then 📄 Report."
          : `Payment received — your report is taking longer than usual to unlock. Reload this page in a minute. If it is still locked, email ${FEEDBACK_EMAIL} with your Stripe receipt and we will open it straight away.`)
      : `✓ ${(stripeReturn.credits || 0).toLocaleString()} credits added to your account`;
    const t = stripeReturn.success
      ? setToastTimed(setStripeToast, { msg: okMsg, tone: stalled ? "warn" : "ok" }, stalled ? 20000 : 5000)
      : setToastTimed(setStripeToast, { msg: `⚠ ${stripeReturn.error}`, tone: "err" }, 15000);
    return () => clearTimeout(t);
  }, [stripeReturn]);
  useEffect(() => {
    if (!restoreReturn) return;
    const t = restoreReturn.success
      ? setToastTimed(setStripeToast, { msg: `✓ Account restored — ${restoreReturn.credits.toLocaleString()} credits available`, tone: "ok" }, 6000)
      : setToastTimed(setStripeToast, { msg: `⚠ ${restoreReturn.error}`, tone: "err" }, 15000);
    return () => clearTimeout(t);
  }, [restoreReturn]);
  const isFirst = useRef(true);
  // Set true when the visitor enters from the landing so the next params update
  // (after seeding) triggers one real Monte Carlo run with their numbers.
  const pendingRunRef = useRef(false);

  // Slider states – initialized from BLANK_PROFILE
  const [port, setPort] = useState(BLANK_PROFILE.port);
  const [contrib, setContrib] = useState(BLANK_PROFILE.contrib);
  const [inf, setInf] = useState(BLANK_PROFILE.inf);
  const [retAge, setRetAge] = useState(BLANK_PROFILE.retireAge);
  const [endAge, setEndAge] = useState(BLANK_PROFILE.endAge);
  const [sp, setSp] = useState(BLANK_PROFILE.sp);
  const [ssb, setSsb] = useState(BLANK_PROFILE.ssb);
  const [ab, setAb] = useState(BLANK_PROFILE.ab);
  const [smile, setSmile] = useState(BLANK_PROFILE.smile);
  const [tax, setTax] = useState(BLANK_PROFILE.tax);
  const [useAb, setUseAb] = useState(BLANK_PROFILE.useAb);
  const [real, setReal] = useState(BLANK_PROFILE.real);
  const [withdrawalStrategy, setWithdrawalStrategy] = useState(BLANK_PROFILE.withdrawalStrategy || "gk");

  // Assumptions state – all user data lives here
  const [assumptions, setAssumptions] = useState(() => {
    // Try to load saved profile on initialization
    const saved = loadProfileFromLocal();
    if (saved) {
      return {
        ...BLANK_PROFILE,
        ...saved,
        accounts: saved.accounts || BLANK_PROFILE.accounts,
        properties: saved.properties || BLANK_PROFILE.properties,
        checkpoints: saved.checkpoints || BLANK_PROFILE.checkpoints,
        carveouts: saved.carveouts || BLANK_PROFILE.carveouts,
        otherIncomes: saved.otherIncomes || BLANK_PROFILE.otherIncomes,
      };
    }
    return { ...BLANK_PROFILE };
  });

  const dismissWelcome = () => {
    setShowWelcome(false);
  };

  const updateAssumption = useCallback(
    (key, val) => setAssumptions((prev) => ({ ...prev, [key]: val })),
    []
  );

  // Auto‑load saved profile on mount (already handled in useState initializer, but sync sliders)
  useEffect(() => {
    const saved = loadProfileFromLocal();
    if (!saved) return;

    if (saved.retireAge !== undefined) setRetAge(saved.retireAge);
    if (saved.endAge !== undefined) setEndAge(saved.endAge);
    if (saved.port !== undefined) setPort(saved.port);
    if (saved.contrib !== undefined) setContrib(saved.contrib);
    if (saved.inf !== undefined) setInf(saved.inf);
    if (saved.sp !== undefined) setSp(saved.sp);
    if (saved.ssb !== undefined) setSsb(saved.ssb);
    if (saved.ab !== undefined) setAb(saved.ab);
    if (saved.useAb !== undefined) setUseAb(saved.useAb);
    if (saved.smile !== undefined) setSmile(saved.smile);
    if (saved.tax !== undefined) setTax(saved.tax);
    if (saved.real !== undefined) setReal(saved.real);
    if (saved.withdrawalStrategy !== undefined) setWithdrawalStrategy(saved.withdrawalStrategy);

    setStale(true);
  }, []);

  // ── Current age: ONE value, everywhere ────────────────────────────────────
  // `dob` is the only input of record. This derives from it, and the effect
  // below writes the result back into assumptions.currentAge so that every
  // consumer — the engines via params, every Profile panel via `values`, the AI
  // context builders, the exported JSON — reads the same number. Nothing should
  // compute its own age from dob, and nothing should read a stored age that
  // could disagree with the birthday on file (REQUIREMENTS §5.1, single point of
  // control). The stored field survives only so dob-less imported profiles keep
  // working.
  const currentAge = useMemo(
    () => ageFromDob(assumptions.dob) ?? assumptions.currentAge ?? BLANK_PROFILE.currentAge,
    [assumptions.dob, assumptions.currentAge]
  );

  // The complete profile exactly as persisted: `assumptions` merged with the
  // slider states that live outside it (port, sp, retAge, …). Single source of
  // truth for BOTH the manual Save button (ProfileWizard) and the autosave
  // effect below — so a forgotten manual save and an autosave can never write
  // different snapshots, and sliders that call setPort/setSp without touching
  // assumptions still get captured.
  const liveProfile = useMemo(() => ({
    ...assumptions,
    currentAge,
    retireAge: retAge,
    endAge,
    port,
    contrib,
    sp,
    ssAge: assumptions.ssAge,
    ssb,
    ab,
    withdrawalStrategy: assumptions.withdrawalStrategy,
  }), [assumptions, currentAge, retAge, endAge, port, contrib, sp, ssb, ab]);

  // ── Silent autosave ────────────────────────────────────────────────────────
  // Debounced persistence of the full profile so a user who forgets to hit Save
  // never loses their work — it auto-restores on next load via
  // loadProfileFromLocal(). Reuses the proven saveProfileToLocal() path (same
  // key, same schema, same private-mode guard) that the manual Save uses.
  //   • Skips the initial hydration render so mount doesn't redundantly re-save.
  //   • Stays dormant on the visitor welcome screen, so an untouched blank
  //     profile never creates a phantom "saved profile" that would suppress the
  //     landing page on the next visit.
  const autosaveReady = useRef(false);
  const [lastAutosaveAt, setLastAutosaveAt] = useState(null);
  useEffect(() => {
    if (!autosaveReady.current) { autosaveReady.current = true; return; }
    if (showWelcome) return;
    const t = setTimeout(() => {
      if (saveProfileToLocal(liveProfile)) setLastAutosaveAt(new Date());
    }, 1000);
    return () => clearTimeout(t);
  }, [liveProfile, showWelcome]);

  // Keep the stored field reconciled with dob. Without this, editing a birthday
  // updated the simulation (which reads the derived value) while every panel and
  // chart reading assumptions.currentAge kept showing the old age. Guarded by
  // the inequality so it settles in one pass.
  useEffect(() => {
    const derived = ageFromDob(assumptions.dob);
    if (derived != null && derived !== assumptions.currentAge) {
      updateAssumption("currentAge", derived);
    }
  }, [assumptions.dob, assumptions.currentAge]);

  const rmdAge = useMemo(() => {
    const override = assumptions.rmdStartAge;
    if (typeof override === "number" && override > 0) return override;
    return getRmdStartAge({ dob: assumptions.dob, currentAge });
  }, [assumptions.dob, assumptions.rmdStartAge, currentAge]);

  const DDAY_dynamic = useMemo(() => {
    try {
      const d = new Date(assumptions.dob);
      if (isNaN(d)) return new Date("2030-03-14T00:00:00");
      return new Date(d.getFullYear() + retAge, d.getMonth(), d.getDate());
    } catch {
      return new Date("2030-03-14T00:00:00");
    }
  }, [assumptions.dob, retAge]);

  const days = Math.max(0, Math.floor((DDAY_dynamic - new Date()) / 86400000));
  const countdown = useCountdown(DDAY_dynamic, assumptions.employerStartDate);

  // Main params object for simulations – uses assumptions, NOT BLANK_PROFILE
  const params = useMemo(
    () => ({
      dob: assumptions.dob || "",
      rmdStartAge: assumptions.rmdStartAge,
      currentAge,
      retireAge: retAge,
      endAge,
      ssAge: assumptions.ssAge,
      ssPia: assumptions.ssPia || 0,
      // Spread wholesale so newly-added spouse fields (dob, and deathAge below)
      // cannot be silently dropped here — this memo is where ghost settings are
      // born. `dob` in the default keeps the shape identical to BLANK_PROFILE.
      spouse: assumptions.spouse || {
        enabled: false, dob: "", ssb: 0, ssAge: 67, ssPia: 0,
        deathAge: null, firstToDie: "spouse",
        survivorClaimAge: null, survivorBenefitAtClaim: 0,
        // §24.1 — kept in the fallback purely so this object stays shape-identical
        // to BLANK_PROFILE.spouse, as the comment above requires. The engines
        // already default these to 0 via jobContributionsForYear.
        retireAge: null, contrib: 0, employerContrib: 0, rothContrib: 0,
      },
      port,
      contrib,
      employerContrib: assumptions.employerContrib || 0,
      hsaContrib: Math.round((assumptions.hsaMonthly || 0) * 12),
      // MUST be forwarded here or the Profile inputs are a no-op — the engines
      // read `params`, not `assumptions`. (Same trap the sourcing guardrails hit.)
      taxableContrib: assumptions.taxableContrib || 0,
      rothContrib: assumptions.rothContrib || 0,
      accounts: assumptions.accounts,
      // Portfolio draw = US + out-of-country (always combined). State-tax toggle is now
      // independent: twoHousehold ON means "claiming non-residency" and skips state tax,
      // but does NOT swap the spending value.
      sp: (sp || 0) + (assumptions.spOutOfCountry || assumptions.spSpendOutofState || 0),
      spOutOfCountry: assumptions.spOutOfCountry || assumptions.spSpendOutofState || 0,
      spSpendOutofState: assumptions.spSpendOutofState,   // legacy passthrough
      // Floor/ceiling: an imported Must/Like budget drives these; else % of core spend.
      ...resolveSpendGuardrails({
        sp,
        spOutOfCountry: assumptions.spOutOfCountry || assumptions.spSpendOutofState || 0,
        gkFloorPct: assumptions.gkFloorPct ?? GK_FLOOR_DEFAULT_PCT,
        gkCeilingPct: assumptions.gkCeilingPct ?? GK_CEILING_DEFAULT_PCT,
        spImportMeta: assumptions.spImportMeta,
      }),
      ssb,
      propIncome: (() => {
         const raw = (assumptions.properties || []).reduce((s, pr) => s + (Number(pr.income) || 0), 0);
          return isNaN(raw) ? 0 : raw;
        })(),
      ab: (assumptions.properties || []).some(pr => Number(pr.income) > 0) ? 0 : (assumptions.ab || 0),
      useAb,
      abReliability: assumptions.abReliability,
      abGrowth: assumptions.abGrowth,
      ssCola: assumptions.ssCola,
      inf,
      smile,
      tax,
      real,
      filingStatus: assumptions.filingStatus || "mfj",
      stateOfResidence: assumptions.stateOfResidence,
      twoHousehold: assumptions.twoHousehold,
      mortBalance: assumptions.mortBalance || 0,
      mortRate: assumptions.mortRate || 6.5,
      mortStart: assumptions.mortStart || "2020-01",
      mortTerm: assumptions.mortTerm || 30,
      mortExtra: assumptions.mortExtra || 0,
      properties: assumptions.properties || [],
      reGrowthRate: assumptions.reGrowthRate ?? 3.0,
      housingType: assumptions.housingType || "own",
      annualRent: assumptions.annualRent || 0,
      carveouts: assumptions.carveouts || [],
      // MUST be forwarded — the engines read `params`, not `assumptions`.
      cashFlowEvents: assumptions.cashFlowEvents || [],
      spSchedule: (assumptions.spSchedule && assumptions.spSchedule.length) ? assumptions.spSchedule : null,
      rothConversionTarget: (() => { const r = assumptions.rothConversionTarget || "off"; return r.startsWith("fill_") ? r.replace("fill_", "") : r; })(),
      taxFunding: assumptions.taxFunding || "from_taxable",
      fafsaGuard: assumptions.fafsaGuard || false,
      fafsaEndYear: assumptions.fafsaEndYear || null,
      cssEndYear: assumptions.cssEndYear || null,
      conversionOverrides: assumptions.conversionOverrides || [],
      preRetireEq: assumptions.preRetireEq,
      postRetireEq: assumptions.postRetireEq,
      // MUST be forwarded — the engines read `params`, not `assumptions`.
      // null keeps the default (switch at retireAge).
      glidepathSwitchAge: assumptions.glidepathSwitchAge ?? null,
      hcShockAge: assumptions.hcShockAge,
      hcProb: assumptions.hcProb,
      hcMin: assumptions.hcMin,
      hcMax: assumptions.hcMax,
      cashRealReturn: assumptions.cashRealReturn ?? 3.0,
      // Mortality weighting for runMC's "money outlives you" metric — same
      // sex setting the fan chart's SSA survival overlay uses.
      sex: assumptions.sex || "blended",
      taxableBasisPct: assumptions.taxableBasisPct ?? 70,
      useJointRmdTable: assumptions.useJointRmdTable || false,
      withdrawalStrategy: assumptions.withdrawalStrategy,
      // Set when a retired strategy was remapped on load. Forwarded so the
      // Withdrawal tab can SAY the plan changed — a silent remap would be the
      // same "app knew something the screen didn't" defect as the strategy
      // deletion itself.
      withdrawalStrategyMigratedFrom: assumptions.withdrawalStrategyMigratedFrom ?? null,
      // Sourcing guardrails — MUST be forwarded here or runMC + the Withdrawal Plan
      // tab never see them (they live in `assumptions`, but the engine reads `params`).
      // Defaults mirror BLANK_PROFILE.
      withdrawalBracketTarget: assumptions.withdrawalBracketTarget || "22",
      irmaaGuard: assumptions.irmaaGuard || false,
      rothEmergencyReserve: assumptions.rothEmergencyReserve || 0,
      ruleOf55: assumptions.ruleOf55 || false,
      sepp72t: assumptions.sepp72t || false,
      sepp72tStartAge: assumptions.sepp72tStartAge ?? null,
      ssTorpedoGuard: assumptions.ssTorpedoGuard || false,
      // Account draw order (which bucket drains first) — orthogonal to strategy + guardrails.
      orderingMode: assumptions.orderingMode || "tax_reactive",
      withdrawalOrder: assumptions.withdrawalOrder || ["cash", "taxable", "pretax", "roth"],
      fixedWithdrawalRate: (() => { const r = assumptions.fixedWithdrawalRate || 4.0; return r < 1 ? r : r / 100; })(), // normalize: stored as % (4) or decimal (0.04) → always decimal
      // VPW's two inputs. This memo is an allowlist, not a spread — before
      // v1.2.88 neither was forwarded, so `vpwRealReturn` could be set in the
      // profile and the engine would still use its own 3.76% default. That
      // matters now: the 1/N → VPW migration writes vpwRealReturn: 0, and
      // without these two lines it would be a ghost setting.
      // `?? null` (not `||`) so a deliberate 0 survives.
      vpwRealReturn: assumptions.vpwRealReturn ?? null,
      vpwEndAge: assumptions.vpwEndAge ?? null,
      safeWithdrawalRate: 0.04,
      checkpoints: assumptions.checkpoints || [],
      earlyRetireTarget: assumptions.earlyRetireTarget,
      portfolioGoal: assumptions.portfolioGoal,
      abEndYear: assumptions.abEndYear ?? null,   // rental income stops after this year
      otherIncomes: assumptions.otherIncomes || [],
    }),
    [
      retAge, endAge, port, contrib, inf, sp, ssb, ab, useAb, smile, tax, real,
      assumptions, currentAge,
    ]
  );

  const mortgageSched = useMemo(
    () =>
      mortgageSchedule(
        assumptions.mortBalance || 0,
        assumptions.mortRate || 6.5,
        assumptions.mortStart || "2020-01",
        assumptions.mortTerm || 30,
        assumptions.mortExtra || 0
      ),
    [assumptions.mortBalance, assumptions.mortRate, assumptions.mortStart, assumptions.mortTerm, assumptions.mortExtra]
  );

const mortgagePayoffYear = mortgageSched.payoffYr;

  const runSimulation = useCallback(() => {
    setRunning(true);
    setStale(false);
    setTimeout(() => {
      // Single horizon: every simulation is graded to the profile's own plan age
      // (params.endAge). No hardcoded reference ages. A shorter runway with the same
      // funds correctly scores HIGHER, and the stress test shares the same horizon.
      const planAge = params.endAge || 90;
      const rEnd_ = runMC(params, planAge, MC_PATHS, 43, true);
      const str = runStress(params, planAge, STRESS_PATHS, 99);
      setMc(rEnd_);
      setStress(str);
      setRunning(false);
    }, 40);
  }, [params]);

  // Auto-run simulation with debouncing when params change
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      runSimulation();
      return;
    }
    setStale(true);
    const timer = setTimeout(() => {
      runSimulation();
    }, 350);
    return () => clearTimeout(timer);
  }, [params, runSimulation]);

  // Year-end deadline prompt. Reads the BROWSER clock (this app has no server), so
  // a PC with a wrong system date sees it at the wrong time — accepted, versus
  // adding a network dependency for a reminder. Placed AFTER `params` because it
  // reads it; hoisting it above would be a temporal-dead-zone error.
  //
  // The waterfall is built inside the December branch only, so eleven months of
  // the year this memo costs one getMonth() call and nothing else.
  const yearEndInfo = useMemo(() => {
    const now = new Date();
    // ?yearend=1 forces the December view year-round. A seasonal feature is
    // otherwise unreviewable for eleven months, and "change your PC clock" is a
    // terrible way to QA something that writes to localStorage.
    let forced = false;
    try { forced = new URLSearchParams(window.location.search).get("yearend") === "1"; } catch { /* SSR/test */ }
    if (!forced && !isYearEndWindow(now)) return { show: false };
    const year = now.getFullYear();
    let rows = [];
    try { rows = buildWithdrawalWaterfall(params)?.smart?.rows || []; } catch { rows = []; }
    return {
      show: true,
      year,
      days: daysLeftInTaxYear(now),
      room: yearEndTaxRoom(rows, {
        year,
        bracketCeiling: getBracketCeiling,
        irmaaCeiling: getIrmaaCeiling,
        filingStatus: params.filingStatus || "mfj",
        // Prefer the conversion target — this prompt is mostly about conversions —
        // and fall back to the sourcing bracket cap, then the 22% default.
        target: params.rothConversionTarget && params.rothConversionTarget !== "off"
          ? params.rothConversionTarget
          : (params.withdrawalBracketTarget && params.withdrawalBracketTarget !== "off"
              ? params.withdrawalBracketTarget
              : "22"),
      }),
    };
  }, [params]);
  // Popup fires once per calendar year; the Net Worth strip stays all December.
  const [showYearEndModal, setShowYearEndModal] = useState(() => {
    let forced = false;
    try { forced = new URLSearchParams(window.location.search).get("yearend") === "1"; } catch { /* SSR/test */ }
    if (forced) return true;   // preview always opens, ignoring the once-a-year ack
    return isYearEndWindow() && !yearEndAcked(new Date().getFullYear());
  });

 const swr = computeInitialWR(params).initWRpct.toFixed(1);
 const analogue = mc ? getAnalogue(mc.rate) : null;

  // Auto-run simulation with debouncing when params change
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      runSimulation();
      return;
    }
    setStale(true);
    const timer = setTimeout(() => {
      runSimulation();
    }, 350);
    return () => clearTimeout(timer);
  }, [params, runSimulation]);


  const TABS = [
    ["networth", "📊 Net Worth"],
    ["montecarlo", "🎲 Forecast"],
    ["scenarios", "📋 Analysis"],
    ["actionplan", "✅ Action Plan"],
    ["assumptions", "💵 Profile"],
  ];

  const needsMC = ["montecarlo", "networth"];
  const hasMC = !!mc;

  const handleSendFeedback = () => {
    if (!feedbackType) {
      alert("Please select a feedback type.");
      return;
    }
    // Hands off to the visitor's own mail client. Deliberately does NOT close the
    // dialog or clear the fields: if no mail client is configured nothing visible
    // happens, and closing would silently destroy what they wrote. Leaving it
    // open keeps both the text and the address on screen.
    const subject = `AiRA feedback — ${feedbackType}`;
    const body = [
      feedbackText || "(no details entered)",
      "",
      "—",
      feedbackName  ? `From: ${feedbackName}`   : null,
      feedbackEmail ? `Reply to: ${feedbackEmail}` : null,
      `AiRA v${APP_VERSION}`,
    ].filter(Boolean).join("\n");
    window.location.href =
      `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // After a landing "Take me to the app!" seed, run one real MC on the fresh params.
  useEffect(() => {
    if (pendingRunRef.current) {
      pendingRunRef.current = false;
      runSimulation();
    }
  }, [params, runSimulation]);

  // Seed the profile from the landing's quick-estimate inputs, then enter the app.
  const enterFromLanding = (inp) => {
    if (inp) {
      const yr = new Date().getFullYear();
      setPort(inp.savings);
      updateAssumption(
        "accounts",
        (assumptions.accounts || BLANK_PROFILE.accounts).map((a) =>
          a.id === "1" ? { ...a, balance: inp.savings } : { ...a, balance: 0 }
        )
      );
      setContrib(inp.contrib);
      setSp(inp.spend);
      updateAssumption("dob", `${yr - inp.curAge}-06-15`);
      setStale(true);
      pendingRunRef.current = true;
    }
    dismissWelcome();
    setTab(inp ? "networth" : "assumptions");
  };

  // --- RENDER ---
  if (showWelcome) {
    return (
      <>
        <style>{CSS}</style>
        <RetirementLanding onEnter={enterFromLanding} />
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="hdr">
          <div>
            <div className="logo">
              AiRA <span className="logo-sub">Freedom Financial</span>
            </div>
            <div style={{ fontSize: 12, color: "#6e8099" }}>
              v{APP_VERSION} · A Simple DiYer's Guide to Retirement Planning with an AI‑Powered Financial Forecaster built for the modern retiree. 
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {/* THEME_TOGGLE — hidden v1.2.109 pending light-mode contrast
                completion. Re-enable by removing the `false &&` guard. See
                the theme useState above for the paired forced-dark change. */}
            {false && (
              <>
                <button
                  className="mbtn"
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label="Toggle color theme"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  style={{ fontSize: 14, lineHeight: 1, padding: "5px 9px" }}
                >
                  {theme === 'dark' ? '☀' : '☾'}
                </button>
                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />
              </>
            )}
            <button
              className="mbtn"
              disabled={!mc}
              title={mc ? "Generate a printable CFP/CPA-ready report" : "Run Monte Carlo first"}
              onClick={() => setShowReport(true)}
            >
              📄 Report
            </button>
            <button
              className="mbtn"
              title="Export profile to JSON"
              onClick={() =>
                exportProfile(
                  {
                    // Spread all assumptions fields so nothing is ever silently omitted
                    ...assumptions,
                    // Override with the separate state variables — these are the live source of truth
                    retireAge: retAge,
                    endAge,
                    port,
                    contrib,
                    inf,
                    sp,
                    ssb,
                    ab: (assumptions.properties || []).some(pr => Number(pr.income) > 0) ? 0 : ab,
                    useAb,
                    smile,
                    tax,
                    real,
                    rothConversionTarget: assumptions.rothConversionTarget || "off",
                    fafsaEndYear: assumptions.fafsaEndYear || null,
                    cssEndYear: assumptions.cssEndYear || null,
                    geminiApiKey: assumptions.geminiApiKey || "",
                    // Progress check-ins ride along with the profile. They are NOT
                    // part of `assumptions` — they live in their own localStorage key
                    // (LS_CHECKINS_KEY), so the "spread everything so nothing is
                    // silently omitted" comment above was not true of them. A user who
                    // exported their profile, moved machines and imported it lost the
                    // entire journal with no warning, because the only export that
                    // carried it was a second button on the Progress tab.
                    checkIns,
                    // Bucket Strategy tab settings (b1Years/b2Years/drawMode) are also
                    // NOT part of `assumptions` — BucketsTab owns them in its own
                    // localStorage key (_BCFG_KEY) instead of lifted root state, same
                    // gap the checkIns comment above already describes. Read fresh here
                    // rather than threading bCfg through root state for one export call.
                    bCfg: _loadBCfg(),
                    savedAt: new Date().toISOString(),
                    exportedAt: new Date().toISOString(),
                    appVersion: APP_VERSION,
                  },
                  assumptions.name
                    ? `AiRA_Profile_${assumptions.name.trim().replace(/[^A-Za-z0-9_-]+/g, "_")}`
                    : "AiRA_Profile"
                )
              }
            >
              ⬇ Export
            </button>
            <button
              className="mbtn"
              title="Import profile from JSON"
              onClick={() =>
                importProfile((rawData) => {
                  // Same retired-strategy migration the localStorage path gets.
                  // An exported JSON is the other way a pre-v1.2.88 profile
                  // enters the app, and it must not take a different route.
                  const data = migrateWithdrawalStrategy(rawData);
                  // MERGED, never replaced — same rule the Progress tab's own import
                  // uses (handleImportCheckIns). Importing a profile onto a machine
                  // that already has a journal must not delete history that only
                  // exists there; mergeCheckIns dedupes by id and re-sorts by date.
                  if (Array.isArray(data.checkIns)) handleImportCheckIns(data.checkIns);
                  // Merged into existing local config, never replaced wholesale — same
                  // rule as checkIns above, so an older export missing a newer bCfg
                  // field (e.g. drawMode) can't reset it back to default on import.
                  if (data.bCfg && typeof data.bCfg === "object") {
                    try { localStorage.setItem(_BCFG_KEY, JSON.stringify({ ..._loadBCfg(), ...data.bCfg })); } catch {}
                  }
                  if (data.retireAge !== undefined) setRetAge(data.retireAge);
                  if (data.endAge !== undefined) setEndAge(data.endAge);
                  if (data.port !== undefined) setPort(data.port);
                  if (data.contrib !== undefined) setContrib(data.contrib);
                  if (data.inf !== undefined) setInf(data.inf);
                  if (data.sp !== undefined) setSp(data.sp);
                  if (data.ssAge !== undefined) updateAssumption("ssAge", data.ssAge);
                  if (data.ssb !== undefined) setSsb(data.ssb);
                  if (data.ab !== undefined) {
                    const hasPropIncome = (data.properties || []).some(pr => Number(pr.income) > 0);
                    setAb(hasPropIncome ? 0 : data.ab);
                  }
                  if (data.useAb !== undefined) setUseAb(data.useAb);
                  if (data.smile !== undefined) setSmile(data.smile);
                  if (data.tax !== undefined) setTax(data.tax);
                  if (data.real !== undefined) setReal(data.real);
                  if (data.withdrawalStrategy !== undefined) setWithdrawalStrategy(data.withdrawalStrategy);

                  // Migrate old account fields if needed
                  // Legacy import migration. The KEYS below are the wire format of profiles
                  // saved before the accounts array existed — renaming them would stop
                  // those files importing. The display NAMES are deliberately generic:
                  // labelling an account with its custodian tells anyone reading this
                  // public repo where the author's money is held.
                  if (data.solo401k !== undefined && !data.accounts) {
                    data.accounts = [
                      ...(data.solo401k ? [{ id: "m1", category: "pretax", name: "Pre-Tax 401k", balance: data.solo401k }] : []),
                      ...(data.alpha401k ? [{ id: "m2", category: "pretax", name: "Pre-Tax 401k (2)", balance: data.alpha401k }] : []),
                      ...(data.rothFid ? [{ id: "m3", category: "roth", name: "Roth IRA", balance: data.rothFid }] : []),
                      ...(data.rothVgd ? [{ id: "m4", category: "roth", name: "Roth IRA (2)", balance: data.rothVgd }] : []),
                      ...(data.hsaBal ? [{ id: "m5", category: "hsa", name: "HSA", balance: data.hsaBal }] : []),
                      ...(data.taxable ? [{ id: "m6", category: "taxable", name: "Taxable", balance: data.taxable }] : []),
                    ];

                    delete data.solo401k;
                    delete data.alpha401k;
                    delete data.rothFid;
                    delete data.rothVgd;
                    delete data.hsaBal;
                    delete data.taxable;
                  }
                  if (!Array.isArray(data.accounts)) data.accounts = BLANK_PROFILE.accounts;
                  if (data.port === undefined) {
                    const acctTotal = data.accounts.reduce((s, a) => s + (a.balance || 0), 0);
                    if (acctTotal > 0) setPort(acctTotal);
                  }
                  if (data.mortStart && !data.mortStart.includes("-01")) data.mortStart = data.mortStart + "-01";
                 
                  if (!Array.isArray(data.properties)){
                     data.properties = BLANK_PROFILE.properties;
                  } else {
                      data.properties = data.properties.map((p, i) =>
                      p.id ? { ...p, id: String(p.id) } : { ...p, id: "p" + (i + 1) }
                 );
                }
                // --Carveouts and checkpoints should always be arrays, and checkpoints should have string IDs for React keys--
                  if (!Array.isArray(data.carveouts)) data.carveouts = [];
                  if (!Array.isArray(data.otherIncomes)) data.otherIncomes = [];
                  // Detailed-expense import: schedule must be a non-empty [{year,amount}] array or null.
                  if (!Array.isArray(data.spSchedule) || data.spSchedule.length === 0) {
                    data.spSchedule = null;
                    if (data.spImportMeta && data.spImportMeta.mode === "multi") data.spImportMeta = null;
                  }
                  if (!Array.isArray(data.checkpoints)) {
                    data.checkpoints = [];
                  } else {
                    data.checkpoints = data.checkpoints.map(cp =>
                      cp.id != null ? { ...cp, id: String(cp.id) } : { ...cp, id: Date.now().toString() + Math.random() }
                    );
                  }

                  // Migrate old "otherInc" field to "otherIncomes"
                  if (data.otherInc && !data.otherIncomes) {
                    data.otherIncomes = data.otherInc;
                  }
                  // Ensure otherIncomes is always an array
                  if (!Array.isArray(data.otherIncomes)) {
                    data.otherIncomes = [];
                  }

                  const hasPropIncome = (data.properties || []).some(pr => Number(pr.income) > 0);
                  // rothConversionTarget round-trips as "fill_22"/"off"/"irmaa". Legacy exports
                  // (pre-fix) stripped to bare bracket numbers like "22" -- re-prefix them so
                  // the dropdown finds a matching option.
                  const rawRct = data.rothConversionTarget || "off";
                  const restoredRct = /^\d+$/.test(rawRct) ? "fill_" + rawRct : rawRct;
                  setAssumptions((prev) => ({
                    ...prev,
                    ...data,
                    name: data.name || "",
                    dob: data.dob || "",
                    stateOfResidence: data.stateOfResidence || "NJ",
                    filingStatus: data.filingStatus || "mfj",
                    // Match BLANK_PROFILE's fresh-profile default (false) so an
                    // older export missing this field doesn't silently flip to
                    // zero state tax vs. a hand-entered profile with identical data.
                    twoHousehold: data.twoHousehold ?? false,
                    portfolioGoal: data.portfolioGoal ?? 3_200_000,
                    earlyRetireTarget: data.earlyRetireTarget ?? 3_500_000,
                    accounts: data.accounts,
                    properties: data.properties,
                    checkpoints: data.checkpoints,
                    carveouts: data.carveouts,
                    otherIncomes: data.otherIncomes,
                    ab: hasPropIncome ? 0 : (data.ab || 0),
                    rothConversionTarget: restoredRct,
                    fafsaEndYear: data.fafsaEndYear || null,
                    cssEndYear: data.cssEndYear || null,
                    // Preserve existing API key if imported file has empty/missing key
                    geminiApiKey: data.geminiApiKey || prev.geminiApiKey || "",
                  }));

                  setStale(true);
                  dismissWelcome();
                  setTab("networth");
                  alert(`✅ Profile loaded${data.name ? ` for ${data.name}` : ""}. Press ▶ Run Monte Carlo to update.`);
                })
              }
            >
              ⬆ Import
            </button>
            <button
              className="mbtn"
              title={mc
                ? "Snapshot today's plan (success rate, portfolio, spending) to your Progress journal — Analysis → Progress"
                : "Run Monte Carlo first — a check-in snapshots your current success rate"}
              onClick={handleSaveCheckIn}
              disabled={!mc}
              style={!mc ? { opacity: 0.45, cursor: "default" } : checkInFlash ? { color: "var(--accent-teal)" } : undefined}
            >
              {checkInFlash ? "✓ Saved!" : "✓ Check-in"}
            </button>
            <AboutButton />
            <HelpButton />
            <div style={{ position: "relative", display: "inline-flex" }}>
              <button
                className="mbtn"
                onClick={() => setShowFeedback((prev) => !prev)}
                title="Send feedback"
              >
                💬 Feedback
              </button>
              {showFeedback && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 6,
                    background: "#0f2138",
                    border: "1px solid #1e3a5f",
                    borderRadius: 10,
                    padding: 14,
                    width: 300,
                    zIndex: 999,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, marginBottom: 10 }}>
                    How's AiRA working for you?
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {[
                      { emoji: "👍", label: "Great", type: "praise" },
                      { emoji: "💡", label: "Idea", type: "suggestion" },
                      { emoji: "🐛", label: "Bug", type: "bug" },
                      { emoji: "👎", label: "Issue", type: "issue" },
                    ].map((fb) => (
                      <button
                        key={fb.type}
                        onClick={() => setFeedbackType(fb.type)}
                        style={{
                          flex: 1,
                          padding: "6px 4px",
                          borderRadius: 6,
                          cursor: "pointer",
                          border: feedbackType === fb.type ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.08)",
                          background: feedbackType === fb.type ? "rgba(167,139,250,0.15)" : "var(--card-bg)",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ fontSize: 18 }}>{fb.emoji}</div>
                        <div style={{ fontSize: 9, color: feedbackType === fb.type ? "var(--accent-purple)" : "var(--text-muted)", marginTop: 2 }}>
                          {fb.label}
                        </div>
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Tell us more (optional)..."
                    rows={3}
                    style={{
                      width: "100%",
                      background: "#0a1628",
                      border: "1px solid #1e3a5f",
                      color: "#e2e8f0",
                      borderRadius: 6,
                      padding: "8px 10px",
                      fontSize: 11,
                      fontFamily: "'DM Sans',sans-serif",
                      resize: "vertical",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent-purple)")}
                    onBlur={(e) => (e.target.style.borderColor = "#1e3a5f")}
                  />
                  {/* Optional contact fields */}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {[
                      { val: feedbackName, set: setFeedbackName, placeholder: "Name (optional)" },
                      { val: feedbackEmail, set: setFeedbackEmail, placeholder: "Email (optional)" },
                    ].map(({ val, set, placeholder }) => (
                      <input
                        key={placeholder}
                        type="text"
                        value={val}
                        onChange={e => set(e.target.value)}
                        placeholder={placeholder}
                        style={{
                          flex: 1, background: "#0a1628", border: "1px solid #1e3a5f",
                          color: "#e2e8f0", borderRadius: 6, padding: "6px 8px",
                          fontSize: 11, fontFamily: "'DM Sans',sans-serif", outline: "none",
                        }}
                        onFocus={e => e.target.style.borderColor = "var(--accent-purple)"}
                        onBlur={e => e.target.style.borderColor = "#1e3a5f"}
                      />
                    ))}
                  </div>
                  {/* Shown, not just linked: a mailto does nothing on a machine
                      with no mail client, and a visitor should never be left with
                      a dead button and no address. */}
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                    Opens your email app. Or write to{" "}
                    <span style={{ color: "var(--accent-purple)", fontFamily: "'JetBrains Mono',monospace", userSelect: "all" }}>
                      {FEEDBACK_EMAIL}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <button
                      onClick={() => setShowFeedback(false)}
                      style={{ background: "transparent", border: "none", color: "var(--text-faint)", fontSize: 11, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendFeedback}
                      style={{
                        padding: "5px 16px",
                        borderRadius: 6,
                        border: "none",
                        background: "linear-gradient(135deg,#7c3aed,#a78bfa)",
                        color: "white",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'DM Sans',sans-serif",
                      }}
                    >
                      Open email
                    </button>
                  </div>
                </div>
              )}
            </div>
            <a
              href="https://buymeacoffee.com/axwacki"
              target="_blank"
              rel="noopener noreferrer"
              className="coffee-btn"
              title="Support the app — buy me a coffee"
            >
              ☕ Buy me a coffee
            </a>
          </div>
          {/* Header day-counter deleted v1.2.109 — the same figure lives inside
              the D-Day Countdown Panel in the sidebar (bottom of this file),
              so showing it twice was redundant. With this block gone, .hdr's
              justify-content:space-between pushes the buttons flush right. */}
        </div>

        <div className="layout">
          <div className="sidebar">
            <div className="sb-card">
              <div className="sb-title">D-Day (Retirement) Countdown</div>
              {/* Target-date label (v1.2.109) — the days figure is redundant
                  with the ticking DD/HH/MM/SS grid immediately below, so this
                  line names the target once (the date) and leaves the counting
                  to the grid. */}
              <div style={{
                fontSize: 12, color: "var(--text-secondary)", marginTop: 4, marginBottom: 10,
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
              }}>
                <span>Retirement Date</span>
                <span style={{ color: "var(--accent-teal)", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
                  {DDAY_dynamic.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <div className="countdown-grid">
                {[
                  { v: countdown.days, l: "DAYS" },
                  { v: countdown.hours, l: "HRS" },
                  { v: countdown.mins, l: "MIN" },
                  { v: countdown.secs, l: "SEC" },
                ].map((u) => (
                  <div key={u.l} className="cd-unit">
                    <div className="cd-val">{String(u.v).padStart(2, "0")}</div>
                    <div className="cd-lbl">{u.l}</div>
                  </div>
                ))}
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${countdown.pct}%` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#334155", marginTop: 3 }}>
                <span>{formatDate(assumptions.employerStartDate)} (Start date)</span>
                <span style={{ color: "var(--accent-teal)", fontWeight: 600 }}>{countdown.pct}%</span>
              </div>
              {assumptions.name && (
                <div style={{ fontSize: 18, color: "var(--accent-teal)", textAlign: "right", marginTop: 8, fontWeight: 600, letterSpacing: "0.01em" }}>
                  📋 {assumptions.name}
                </div>
              )}
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Liquid Portfolio</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "-0.5px" }}>
                  {fmtDollar(port)}
                </span>
              </div>
              {(() => {
                const props = assumptions.properties || [];
                const propValue = props.reduce((s, pr) => s + (pr.value || 0), 0);
                const propDebt  = props.reduce((s, pr) => s + (pr.mortgage || 0), 0);
                const netWorth  = port + propValue - propDebt;
                if (propValue === 0) return null;
                return (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Net Worth <span style={{ color: "#334155" }}>(+RE equity)</span></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-purple)", fontFamily: "'JetBrains Mono',monospace" }}>
                      {fmtDollar(netWorth)}
                    </span>
                  </div>
                );
              })()}
              {yearEndInfo.show && (
                <YearEndStrip room={yearEndInfo.room} days={yearEndInfo.days} year={yearEndInfo.year} />
              )}
            </div>
            {yearEndInfo.show && showYearEndModal && (
              <YearEndModal
                room={yearEndInfo.room} days={yearEndInfo.days} year={yearEndInfo.year}
                canCheckIn={!!mc}
                onSaveCheckIn={handleSaveCheckIn}
                onClose={() => { ackYearEnd(yearEndInfo.year); setShowYearEndModal(false); }}
              />
            )}
            <div style={{ textAlign: "center", padding: "2px 0" }}>
              <InfoModal
                title={`MC Engine — v${APP_VERSION}`}
                accent="var(--accent-teal)"
                trigger={
                  <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.04em", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                    ⚙ Engine &amp; assumptions · v{APP_VERSION}
                  </span>
                }
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>
                  <div>
                    📈 <span style={{ color: "var(--accent-teal)" }}>Equity:</span> 99yr S&P bootstrap [-30 / +30%]
                  </div>
                  <div>
                    📊 <span style={{ color: "var(--accent-purple)" }}>Bonds:</span> 50yr Bloomberg [-15 / +20%]
                  </div>
                  <div>
                    📉  <span style={{ color: "var(--accent-gold)" }}>{getStrategyLabel(assumptions.withdrawalStrategy)}</span>{" "}
                    {(() => {
                      const s = resolveStrategy(assumptions.withdrawalStrategy);
                      if (s === "gk") return `Floor: ${fmtDollar(params.gkFloor)} · Ceiling ${fmtDollar(params.gkCeiling)}`;
                      if (s === "fixed") return `Rate: ${((params.fixedWithdrawalRate || 0.04) * 100).toFixed(1)}%`;
                      if (s === "vpw") return `Amortized to age ${params.vpwEndAge ?? params.endAge ?? 100} at ${((params.vpwRealReturn ?? 0.0376) * 100).toFixed(2)}% real`;
                      return "";
                    })()}
                  </div>
                  <div>
                    🏖 <span style={{ color: "#059669" }}>Rental:</span> {assumptions.abReliability || 80}% reliability per year
                  </div>
                  <div>
                    🏥 <span style={{ color: "#f87171" }}>Healthcare:</span> {assumptions.hcProb || 3.5}% shock risk age {assumptions.hcShockAge || 72}+
                  </div>
                  {/* One-off events read from `params` — the object the engines
                      actually receive — so this line can never claim an event
                      the simulation did not run. Full per-event breakdown lives
                      in Simulation Inputs & Assumptions on the MC tab. */}
                  {(() => {
                    const evs  = (params.cashFlowEvents || []).filter((e) => Number.isFinite(Number(e.year)) && (Number(e.amount) || 0) !== 0);
                    if (evs.length === 0) return null;
                    const sum  = (list) => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
                    const ins  = evs.filter((e) => e.direction === "in");
                    const outs = evs.filter((e) => e.direction !== "in");
                    return (
                      <div>
                        💰 <span style={{ color: "var(--accent-gold)" }}>One-off events:</span>{" "}
                        {ins.length > 0 && `${ins.length} in +${fmtDollar(sum(ins))}`}
                        {ins.length > 0 && outs.length > 0 && " · "}
                        {outs.length > 0 && `${outs.length} out −${fmtDollar(sum(outs))}`}
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "var(--accent-teal)" }}>💹 Phase 1 ({assumptions.preRetireEq ?? 91}/{100 - (assumptions.preRetireEq ?? 91)}):</span> {expectedReturn(assumptions.preRetireEq ?? 91).toFixed(2)}% μ
                    <Hint
                      text={`Pre‑retirement expected return. "μ" (mu) is the mean annual return of a ${assumptions.preRetireEq ?? 91}% stocks / ${100 - (assumptions.preRetireEq ?? 91)}% bonds mix — the weighted average of the S&P 500 and bond history the engine bootstraps from. Individual simulated years vary widely around this average; it is not a guaranteed rate.`}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "#fb923c" }}>💹 Phase 2 ({assumptions.postRetireEq ?? 70}/{100 - (assumptions.postRetireEq ?? 70)}):</span> {expectedReturn(assumptions.postRetireEq ?? 70).toFixed(2)}% μ
                    <Hint
                      text={`Post‑retirement expected return. "μ" (mu) is the mean annual return of a ${assumptions.postRetireEq ?? 70}% stocks / ${100 - (assumptions.postRetireEq ?? 70)}% bonds mix. The lower equity weight vs. Phase 1 means less volatility and a slightly lower average return once you're drawing down.`}
                    />
                  </div>
                </div>
              </InfoModal>
            </div>

            <div className="sb-card">
              <div className="sb-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Retirement Core</span>
                <span style={{ fontSize: 10, color: "var(--accent-teal)", fontWeight: 600, textTransform: "none" }}>Primary</span>
              </div>
              <Slider
                label="Retire age"
                value={retAge}
                min={AGE_LIMITS.retire.min}
                max={AGE_LIMITS.retire.max}
                step={1}
                stepNudge={1}
                format={(v) => "Age " + v}
                onChange={setRetAge}
              />
              <Slider
                label="Plan to age"
                value={endAge}
                min={AGE_LIMITS.end.min}
                max={AGE_LIMITS.end.max}
                step={1}
                stepNudge={1}
                format={(v) => "Age " + v}
                onChange={setEndAge}
              />
              <Slider
                label="US annual spend"
                value={sp}
                min={0}
                max={300000}
                step={1000}
                stepNudge={5000}
                format={(v) => fmtDollar(v) + "/yr"}
                onChange={setSp}
              />
              {assumptions.twoHousehold && (
                <Slider
                  label="Out-of-country"
                  value={assumptions.spOutOfCountry ?? 0}
                  min={0}
                  max={150000}
                  step={1000}
                  stepNudge={2500}
                  format={(v) => fmtDollar(v) + "/yr"}
                  onChange={(v) => updateAssumption("spOutOfCountry", v)}
                />
              )}
              <Slider
                label="Annual savings"
                value={contrib}
                min={0}
                max={100000}
                step={500}
                stepNudge={1000}
                format={(v) => fmtDollar(v) + "/yr"}
                onChange={setContrib}
              />
              <Slider
                key={`ssAge-${assumptions.ssAge}`}
                label="SS claim age"
                value={assumptions.ssAge}
                min={AGE_LIMITS.ss.min}
                max={AGE_LIMITS.ss.max}
                step={1}
                stepNudge={1}
                quickPills={[
                  { lbl: "62 (Early)", val: 62 },
                  { lbl: "67 (FRA)", val: 67 },
                  { lbl: "70 (Max)", val: 70 },
                ]}
                format={(v) => "Age " + v}
                onChange={(v) => updateAssumption("ssAge", v)}
              />
            </div>
            <div className="sb-card">
              <div className="sb-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Macro &amp; Sensitivity</span>
                <span style={{ fontSize: 10, color: "var(--accent-gold)", fontWeight: 600, textTransform: "none" }}>⚡ Sensitivity</span>
              </div>
              <Slider
                label="Inflation (CPI)"
                value={inf}
                min={1.0}
                max={8.0}
                step={0.1}
                stepNudge={0.5}
                quickPills={[
                  { lbl: "2.0% (Low)", val: 2.0 },
                  { lbl: "2.5% (Fed Baseline)", val: 2.5 },
                  { lbl: "3.5% (Elevated)", val: 3.5 },
                  { lbl: "5.0% (Stagflation)", val: 5.0 },
                ]}
                format={(v) => Number(v).toFixed(1) + "%/yr"}
                onChange={(v) => {
                  const val = Number(Number(v).toFixed(2));
                  setInf(val);
                  updateAssumption("inf", val);
                }}
              />
              <Slider
                label="Phase 1 Stocks (Pre-Retire)"
                value={assumptions.preRetireEq ?? 91}
                min={20}
                max={100}
                step={5}
                stepNudge={5}
                quickPills={[
                  { lbl: "60/40", val: 60 },
                  { lbl: "80/20", val: 80 },
                  { lbl: "90/10", val: 90 },
                  { lbl: "100%", val: 100 },
                ]}
                format={(v) => `${v}% stocks (${expectedReturn(v).toFixed(1)}% μ)`}
                onChange={(v) => updateAssumption("preRetireEq", v)}
              />
              <Slider
                label="Phase 2 Stocks (Post-Retire)"
                value={assumptions.postRetireEq ?? 70}
                min={20}
                max={100}
                step={5}
                stepNudge={5}
                quickPills={[
                  { lbl: "40/60", val: 40 },
                  { lbl: "60/40", val: 60 },
                  { lbl: "70/30", val: 70 },
                  { lbl: "80/20", val: 80 },
                ]}
                format={(v) => `${v}% stocks (${expectedReturn(v).toFixed(1)}% μ)`}
                onChange={(v) => updateAssumption("postRetireEq", v)}
              />
              <Slider
                label="Social Security COLA"
                value={assumptions.ssCola ?? 2.4}
                min={0.0}
                max={6.0}
                step={0.1}
                stepNudge={0.5}
                quickPills={[
                  { lbl: "0% (Frozen)", val: 0.0 },
                  { lbl: "2.4% (Historical)", val: 2.4 },
                  { lbl: "3.5% (High)", val: 3.5 },
                ]}
                format={(v) => Number(v).toFixed(1) + "%/yr"}
                onChange={(v) => updateAssumption("ssCola", Number(Number(v).toFixed(2)))}
              />
            </div>

            <div className="sb-card">
              <div className="sb-title">Retirement</div>
              <Slider
                label="Retire age"
                value={retAge}
                min={AGE_LIMITS.retire.min}
                max={AGE_LIMITS.retire.max}
                step={1}
                format={(v) => "Age " + v}
                onChange={setRetAge}
              />
              <Slider
                label="Plan to age"
                value={endAge}
                min={AGE_LIMITS.end.min}
                max={AGE_LIMITS.end.max}
                step={1}
                format={(v) => "Age " + v}
                onChange={setEndAge}
              />
              <Slider
                label="US spend"
                value={sp}
                min={0}
                max={300000}
                step={1000}
                format={(v) => fmtDollar(v) + "/yr"}
                onChange={setSp}
              />
              {assumptions.twoHousehold && (
                <Slider
                  label="Out-of-country"
                  value={assumptions.spOutOfCountry ?? 0}
                  min={0}
                  max={150000}
                  step={1000}
                  format={(v) => fmtDollar(v) + "/yr"}
                  onChange={(v) => updateAssumption("spOutOfCountry", v)}
                />
              )}
              <Slider
                key={`ssAge-${assumptions.ssAge}`}
                label="SS start age"
                value={assumptions.ssAge}
                min={AGE_LIMITS.ss.min}
                max={AGE_LIMITS.ss.max}
                step={1}
                format={(v) => "Age " + v}
                onChange={(v) => updateAssumption("ssAge", v)}
              />
            </div>

            <div className="sb-card">
              <div className="sb-title">Options</div>
              {/* §28.1 OPEN 3 (Gary): "there are a LOT of tabs with sub tabs and
                  I'll be darned if I can find that one." The control was findable
                  only if you already knew the word "smile", and nothing said what
                  it did to your numbers. Renamed to what it IS, and the effect is
                  now stated with the engine's own factors (no second copy of the
                  curve — spendingSmileFactor is the single source). The matching
                  per-year disclosure is the badge in the Spend column. */}
              <Toggle
                val={smile} onChange={setSmile} accent="var(--accent-purple)"
                label="🙂 Spending curve (go-go / slow-go)"
                infoTitle="🙂 Spending curve — go-go, slow-go, no-go"
                hint={
                  "ON (default): your spending target is re-scaled each year to follow the "
                  + "Blanchett retirement-spending curve — real spending drifts down through the "
                  + "active 'go-go' years, flattens in the 'slow-go' 80s, then rises again in the "
                  + "'no-go' late 80s as health and care costs take over.\n\n"
                  + `On YOUR plan (retiring at ${retAge}), that means spending of `
                  + `${Math.round(spendingSmileFactor(Math.min(80, endAge), retAge) * 100)}% of your target at age ${Math.min(80, endAge)} and `
                  + `${Math.round(spendingSmileFactor(Math.min(90, endAge), retAge) * 100)}% at age ${Math.min(90, endAge)}. `
                  + "Year one is always 100% — the number you enter is what you spend when you stop working, not a lifetime average.\n\n"
                  + "OFF: spending stays flat in real terms for the whole plan. That is the more "
                  + "conservative assumption and it will lower your success rate.\n\n"
                  + "Where to see it: the Spend column of the Withdrawal Plan table shows the exact "
                  + "percentage applied in each year, so you can tell curve effects from your own target."
                }
              />

              <div className="tog-row">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="tog-label">🏛 Tax</span>
                  <InfoModal title="🏛 Tax Modeling — How It Works" accent="#d97706">
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"#e2e8f0" }}>What it does:</strong> When ON, every year's withdrawal is grossed up by a full tax calculation so the <em>after-tax</em> amount you keep matches your spending target. Without it, the engine would draw exactly your spend number and silently underfund you by whatever taxes are owed.</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"#e2e8f0" }}>What's modeled each year:</strong> federal brackets with the standard deduction, the Social Security tax torpedo (provisional-income inclusion), IRMAA Medicare surcharges, and your state's brackets (skipped when Non-resident is on). Tax rises naturally over retirement as Social Security starts and RMDs force pre-tax draws.</p>
                    <p style={{ margin:"0 0 10px" }}>Single filers owe more than MFJ at the same income because of halved brackets and standard deduction.</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"#e2e8f0" }}>Toggle ON (default):</strong> Full tax model applied. The same calculation drives the Monte Carlo, the Stress Test, and the year-by-year table — no pivot reads differently.</p>
                    <p style={{ margin:0 }}><strong style={{ color:"#e2e8f0" }}>Toggle OFF:</strong> Pure pre-tax view — <em>all</em> tax (federal, state, IRMAA, Roth-conversion cost) is zeroed everywhere. Useful for sanity-checking portfolio dynamics without tax noise, but it overstates how long your money lasts.</p>
                  </InfoModal>

                </div>
                <div
                  className="tog"
                  onClick={() => setTax(!tax)}
                  style={{ background: tax ? "#d97706" : "rgba(255,255,255,0.1)" }}
                >
                  <div className="tok" style={{ left: tax ? 18 : 2 }} />
                </div>
              </div>
              <Toggle
                val={real} onChange={setReal} label="📉 Show in today's dollars" accent="#0ea5e9"
                hint={"OFF = future dollars: the actual balance you'd see on a statement that year, inflation included. $3M at 85 sounds like a lot, but decades of inflation are baked into it.\n\nON = today's dollars: the same money re-expressed in what it would buy right now, so you can judge it against prices you know.\n\n(Economists call these 'nominal' and 'real' — same thing, plainer name.)\n\nOne limit: the chart starts at your retirement year, so 'today' means retirement-year purchasing power. Inflation between now and retirement is not removed. If you are already retired, that is the same as today."}
              />
              <div className="tog-row">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="tog-label">🌴 Non-resident (no state tax)</span>
                  <InfoModal title="🌴 Non-Resident State Tax — How It Works" accent="var(--accent-purple)">
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"#e2e8f0" }}>What it does:</strong> Removes state income tax from every year of the simulation. Use this if you (or you and your spouse) qualify as a non-resident of your listed state for the year.</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"#e2e8f0" }}>Toggle OFF (default):</strong> State tax applies to all taxable income. Use this if you're a resident of your listed state.</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"#e2e8f0" }}>Toggle ON:</strong> State tax zeroed out. Use this if you've broken residency (e.g. spending most of the year abroad and meeting your state's non-residency rules).</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"#e2e8f0" }}>Spending is independent:</strong> Total portfolio draw = US Spending + Out-of-Country Spending regardless of this toggle. The toggle only changes whether the US-domestic portion is state-taxed. Check your state's non-residency rules before turning this on — every state defines it differently (number of days, place of work, family location, etc.).</p>
                    <p style={{ margin:0 }}><strong style={{ color:"#e2e8f0" }}>Set it up:</strong> In your Profile → Spending, set <em>Primary Annual Spending</em> for your at-home budget and <em>Out-of-State Spending</em> for your travel/abroad budget. If Out-of-State Spending is left at $0, it falls back to your primary spending.</p>
                  </InfoModal>
                </div>
                <div
                  className="tog"
                  onClick={() => updateAssumption("twoHousehold", !assumptions.twoHousehold)}
                  style={{ background: assumptions.twoHousehold ? "var(--accent-purple)" : "rgba(255,255,255,0.1)" }}
                >
                  <div className="tok" style={{ left: assumptions.twoHousehold ? 18 : 2 }} />
                </div>
              </div>
            </div>

            <button
              className="run-btn"
              onClick={runSimulation}
              disabled={running}
              style={{
                background: stale ? "linear-gradient(135deg,#b45309,#d97706)" : undefined,
              }}
            >
              {running ? `Running ${MC_PATHS_LABEL} paths...` : stale ? "⚠ Inputs changed — Re-run" : "▶ Run Monte Carlo"}
            </button>
          </div>

          <div className="main">

            {stale && (
              <div
                style={{
                  background: "rgba(180,83,9,0.12)",
                  border: "1px solid rgba(217,119,6,0.4)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 12,
                  color: "var(--accent-gold)",
                }}
              >
                ⚠ Inputs changed — success rates below are stale. Press Re-run to update.
              </div>
            )}

            {/* Hero: one number that matters, with secondary metrics demoted to a compact
                strip and all interpretive copy behind a "What does this mean?" toggle.
                See requirements.md §12-adjacent design audit (2026-06-29). */}
            {(() => {
              const heroColor = mc ? (mc.rate >= 0.85 ? "var(--positive)" : mc.rate >= 0.7 ? "#f59e0b" : "var(--negative)") : "#334155";
              const sep = <span style={{ color: "var(--text-faint)" }}>·</span>;
              const strat = resolveStrategy(assumptions.withdrawalStrategy);
              return (
                <div className="met" style={{ borderLeft: `4px solid ${heroColor}` }}>
                  {/* Row 1 — the one number that matters, with the disclosure toggle aligned right. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <div className="mv" style={{ fontSize: 44, color: heroColor }}>
                        {mc ? fmtPct(mc.rate) : "—"}
                      </div>
                      <div style={{ fontSize: 15, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                        success to age {endAge}
                        <InfoDot size={12} title={`Percentage of simulations where your portfolio lasted to age ${endAge}, after all spending, taxes, healthcare shocks, and modeled expenses.`} />
                      </div>
                    </div>
                    {mc && (
                      <button
                        onClick={() => setShowInterpretation((v) => !v)}
                        style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--accent-teal)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 6px" }}
                      >
                        {showInterpretation ? "Hide details ▴" : "What does this mean? ▾"}
                      </button>
                    )}
                  </div>
                  {/* Row 2 — secondary metrics, one line (paths + strategy name removed; strategy
                      lives in its own strip below, withdrawal rate kept here only). */}
                  <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 11, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                    {/* `mc.medR` is the median portfolio at the START of retirement
                        (runMC captures portAtRetire before the drawdown loop), so
                        showing it under "at age {endAge}" reported the wrong metric
                        entirely — the balance before a single withdrawal, labelled as
                        the balance after a full retirement. `mc.term.p50` is the median
                        of each path's LAST year, which is what this label claims.
                        medR is still correct on the "Portfolio at Retirement" card.
                        Figure is nominal (future dollars); the Real$/Nominal$ toggle
                        does not reach this row yet, so it says so rather than implying
                        today's purchasing power. */}
                    <span title="Median projected portfolio value left at your plan age, across all simulated paths. Shown in future (nominal) dollars — not adjusted to today's purchasing power.">
                      <strong style={{ color: "var(--text-secondary)" }}>{mc ? fmtDollar(mc.term?.p50 ?? 0) : "—"}</strong> at age {endAge} <span style={{ fontSize: 12, opacity: 0.75 }}>(future $)</span>
                    </span>
                    {sep}
                    {/* This is params.sp — the spending target the USER typed — divided
                        by 12. The engine does not solve for it. Labelling it "safe
                        spend" claimed a number the app had computed and certified,
                        when all it does is echo the input back; the success rate to
                        the left is what says whether the target holds. "Your target"
                        is the honest frame.

                        It is also AFTER TAX. runMC sizes the portfolio draw as
                        `need + totalTax` (~line 1538) — tax is an additional draw on
                        top of the spend target, never netted out of it — so this is
                        money that reaches the household to spend. Nothing said so,
                        which is why it had to be asked. */}
                    <span title="Your spending target — the figure you entered, shown monthly. This is money to spend AFTER tax: the engine withdraws enough extra from the portfolio to cover the tax bill on top of this amount, so taxes are not taken out of it. Covered by Social Security, rental and other income first, then your portfolio draw. The success rate on the left is what tells you whether this target holds.">
                      <strong style={{ color: "var(--accent-gold)" }}>${(Math.round(params.sp / 12)).toLocaleString()}/mo</strong> your spend target <span style={{ fontSize: 12, opacity: 0.75 }}>(after tax)</span>
                    </span>
                    {sep}
                    <span title="Initial withdrawal rate = (First year spending − guaranteed income) ÷ Portfolio at retirement.">
                      <strong style={{ color: +swr <= 3 ? "var(--positive)" : +swr <= 4 ? "#34d399" : +swr <= 5 ? "#f59e0b" : "var(--negative)" }}>{swr}%</strong> withdrawal rate ({(params.safeWithdrawalRate * 100).toFixed(0)}% benchmark)
                    </span>
                  </div>
                  {/* Row 3 — strategy detail strip, pulled in from the old standalone gk-bar.
                      Facts only; the editorial "spend in the right life phase" line moved to the
                      collapsed panel. Withdrawal rate dropped here (shown once, in Row 2). */}
                  <div style={{ fontSize: 13, color: "#bae6fd", marginTop: 12, paddingTop: 11, borderTop: "1px solid rgba(14,165,233,0.18)", lineHeight: 1.55 }}>
                    <strong style={{ color: "var(--accent-teal)" }}>{getStrategyLabel(strat)} Strategy:</strong>{" "}
                    {strat === "gk" ? (
                      <>Floor {fmtDollar(params.gkFloor)} · Ceiling {fmtDollar(params.gkCeiling)} · State tax {assumptions.twoHousehold ? "OFF (non-resident)" : "ON (resident)"}.</>
                    ) : strat === "fixed" ? (
                      <>Withdrawal rate {(params.fixedWithdrawalRate * 100).toFixed(1)}% of portfolio.</>
                    ) : strat === "vpw" ? (
                      <>Amortized to age {params.vpwEndAge ?? params.endAge ?? 100} at {((params.vpwRealReturn ?? 0.0376) * 100).toFixed(2)}% assumed real return.</>
                    ) : (
                      <>Dynamic spending based on portfolio performance.</>
                    )}{" "}
                    Rental modeled at {params.abReliability}% reliability. Healthcare shocks {params.hcProb}%/yr from age {params.hcShockAge}.
                  </div>
                  {/* Sector / life-phase badge — lower far right, aligned under the toggle. */}
                  {analogue && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                      <SectorBadge age={currentAge} />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Interpretive layer — the flight analogue + 26-person visual, available on demand
                rather than always in your face (progressive disclosure). */}
            {showInterpretation && (
              <>
                {analogue && <RotatingAnalogue rate={mc.rate} endAge={endAge} />}
                {mc &&
                  (() => {
                    const success = Math.round(mc.rate * 26);
                    const fail = 26 - success;
                    return (
                      <div
                        style={{
                          background: "var(--card-bg)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          borderRadius: 10,
                          padding: "12px 16px",
                        }}
                      >
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                          If 26 people had your exact plan — age {endAge} horizon
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                          {Array.from({ length: 26 }, (_, i) => (
                            <div
                              key={i}
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: "50%",
                                background: i < success ? "var(--positive)" : "var(--negative)",
                                opacity: i < success ? 1 : 0.4,
                                title: i < success ? "Survives" : "Depleted",
                              }}
                            />
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            <span style={{ color: "var(--positive)", fontWeight: 700 }}>{success}</span> make it to {endAge}.{" "}
                            {fail > 0 && (
                              <>
                                <span style={{ color: "var(--negative)", fontWeight: 700 }}>{fail}</span> run out.
                              </>
                            )}
                            {fail === 0 && <span style={{ color: "#34d399" }}> Everyone makes it.</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#334155", fontStyle: "italic" }}>
                            100% doesn't exist — room for error IS the plan. — Morgan Housel
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>
                  As Bill Perkins says — spend in the right life phase. 🌴
                </div>
              </>
            )}

            <div className="tabs">
              {TABS.map(([k, l]) => (
                <button key={k} className={`tab ${activeTab === k ? "on" : ""}`} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>

            {needsMC.includes(activeTab) && !hasMC ? (
              <div
                className="chart-card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 260,
                  color: "var(--text-faint)",
                }}
              >
                Press ▶ Run Monte Carlo to generate charts.
              </div>
            ) : (
              <>
                {activeTab === "montecarlo" && (
                  <>
                    <MCTab
                      params={params}
                      mc={mc}
                      stress={stress}
                      running={running}
                      onRun={runSimulation}
                      checkpoints={assumptions.checkpoints}
                      portfolioGoal={assumptions.portfolioGoal}
                      earlyRetireTarget={assumptions.earlyRetireTarget}
                      onUpdateCheckpoints={(newCheckpoints) => updateAssumption("checkpoints", newCheckpoints)}
                      onDeleteCheckpoint={(id) =>
                        updateAssumption(
                          "checkpoints",
                          (assumptions.checkpoints || []).filter((c) => String(c.id) !== String(id))
                        )
                      }
                      dob={assumptions.dob}
                      sex={assumptions.sex}
                      inf={inf}
                      real={real}
                      withdrawalStrategy={assumptions.withdrawalStrategy}
                      onSetBaselineFromCheckpoint={(value) => {
                        setPort(value);
                        const currentTotal = port;
                        if (currentTotal > 0) {
                          const scale = value / currentTotal;
                          const scaledAccounts = assumptions.accounts.map((acc) => ({
                            ...acc,
                            balance: Math.round((acc.balance || 0) * scale),
                          }));
                          updateAssumption("accounts", scaledAccounts);
                        }
                        setStale(true);
                        setTimeout(runSimulation, 100);
                      }}
                    />
                    {mc && (
                      <FanChart
                        pcts={mc.pcts}
                        retireAge={retAge}
                        ssAge={assumptions.ssAge}
                        rmdAge={rmdAge}
                        inf={inf}
                        useReal={real}
                        title={`Forecast Portfolio · Retirement Age ${endAge} · ${MC_PATHS_LABEL} Scenarios`}
                        checkpoints={assumptions.checkpoints}
                        earlyRetireTarget={assumptions.earlyRetireTarget}
                        dob={assumptions.dob}
                        portfolioGoal={assumptions.portfolioGoal}
                        // Derived age, NOT assumptions.currentAge — that stored
                        // field never changes when the birthday does, so the fan
                        // kept plotting the old age (and the accumulation ramp,
                        // "you are here" dot, and survival curve with it).
                        currentAge={currentAge}
                        currentPort={params.port}
                        contrib={params.contrib}
                        hhProfile={params}
                        preRetireEq={params.preRetireEq ?? 91}
                        sex={assumptions.sex}
                        hoveredAge={hoveredAge}
                      />
                    )}
                    {mc && (
                      <MCBandTable
                        pcts={mc.pcts}
                        inf={inf}
                        useReal={real}
                        ssAge={assumptions.ssAge}
                        rmdAge={rmdAge}
                        // Same fix: this feeds the table's calendar-year column
                        // (yr = CURRENT_YEAR + age - currentAge), so a stale age
                        // shifted every year in the table by the difference.
                        currentAge={currentAge}
                        endAge={endAge}
                        hoveredAge={hoveredAge}
                        onHoverAge={setHoveredAge}
                      />
                    )}
                  </>
                )}
                {activeTab === "scenarios" && (
                  <ScenariosTab
                    initialSubTab={pendingScenarioSubTab}
                    onSubTabConsumed={() => setPendingScenarioSubTab(null)}
                    baseParams={params}
                    mc={mc}
                    fmtPct={fmtPct}
                    stress={stress}
                    checkIns={checkIns}
                    onDeleteCheckIn={handleDeleteCheckIn}
                    onRenameCheckIn={handleRenameCheckIn}
                    onImportCheckIns={handleImportCheckIns}
                    retireAge={retAge}
                    ssAge={assumptions.ssAge}
                    rmdAge={rmdAge}
                    inf={inf}
                    real={real}
                    FanChart={FanChart}
                    SEQ_2000_2012={SEQ_2000_2012}
                    DeterministicWithdrawalView={DeterministicWithdrawalView}
                    RothLadder={RothLadder}
                    BucketsTab={BucketsTab}
                    portfolioGoal={assumptions.portfolioGoal}
                    earlyRetireTarget={assumptions.earlyRetireTarget}
                    withdrawalStrategy={assumptions.withdrawalStrategy}
                    checkpoints={assumptions.checkpoints}
                    dob={assumptions.dob}
                    sex={assumptions.sex}
                    assumptions={assumptions}
                    onAssumptionChange={updateAssumption}
                    onSaveConversionOverride={(year, amount, income) => {
                      setAssumptions(prev => ({
                        ...prev,
                        conversionOverrides: [
                          ...(prev.conversionOverrides || []).filter(o => Number(o.year) !== Number(year)),
                          { id: Date.now().toString(), year: Number(year), amount: Number(amount), ...(income || {}) },
                        ].sort((a, b) => a.year - b.year),
                      }));
                    }}
                    onRemoveConversionOverride={(year) => {
                      setAssumptions(prev => ({
                        ...prev,
                        conversionOverrides: (prev.conversionOverrides || []).filter(o => Number(o.year) !== Number(year)),
                      }));
                    }}
                  />
                )}
                {activeTab === "networth" && <NetWorthTab p={params} mc={mc} inf={inf} />}
                {activeTab === "actionplan" && (
                  <ActionPlanTab
                    params={params}
                    mc={mc}
                    assumptions={assumptions}
                    mortgagePayoffYear={mortgagePayoffYear}
                    rmdAge={rmdAge}
                  />
                )}
                {/* AiraAITab is dormant — integration target is INSIDE ActionPlanTab (above), not as its own tab. See memory/project_aira_ai_tab.md. */}
                {activeTab === "assumptions" && (
                  <>
                  <ProfileWizard
                    onNavigateTab={navigateToTab}
                    autosavedAt={lastAutosaveAt}
                    values={liveProfile}
                    onChange={(k, v) => {
                      updateAssumption(k, v);
                      if (k === "retireAge") setRetAge(v);
                      if (k === "endAge") setEndAge(v);
                      if (k === "port") setPort(v);
                      if (k === "contrib") setContrib(v);
                      if (k === "sp") setSp(v);
                      if (k === "ssAge") updateAssumption("ssAge", v);
                      if (k === "ssb") setSsb(v);
                      if (k === "ab") setAb(v);
                    }}
                  />
                  </>
                )}
              </>
            )}

            <div
              style={{
                fontSize: 11,
                color: "#bacee9",
                textAlign: "center",
                paddingTop: 4,
                lineHeight: 1.6,
              }}
            >
              AiRA Freedom Financial v{APP_VERSION} · This is not financial advice. Seek a professional fiduciary, CPA, or tax accountant. Use at your own risk.
              This application is open source and covered under the GNU Affero General Public License v3.0.{" "}
              <br />
              "The best financial plan is the one you can stick with." — Morgan Housel
              <br />
              <button
                onClick={() => setShowTerms(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#2563eb",
                  cursor: "pointer",
                  fontSize: 9,
                  textDecoration: "underline",
                  padding: "2px 0",
                }}
              >
                Terms of Service &amp; Disclaimer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Admin panel (hidden; activate via ?aira_admin=1) ── */}
      <AdminPanel />

      {/* ── Purchase / account-restore toast (success + failure) ── */}
      {recoveryLink && (
        <RecoveryLinkModal
          url={recoveryLink.url}
          expiresAt={recoveryLink.expiresAt}
          onClose={() => setRecoveryLink(null)}
        />
      )}
      {stripeToast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          // Amber is its own state, not a shade of success. A payment that went
          // through but has not yet delivered is neither "done" nor "failed", and
          // showing it green would tell someone staring at a paywall that
          // everything worked.
          background: stripeToast.tone === "err"
            ? "rgba(220,38,38,0.97)"
            : stripeToast.tone === "warn"
              ? "rgba(217,119,6,0.97)"
              : "rgba(16,185,129,0.95)",
          color: "white",
          borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 99999,
          // Clickable when it carries an email address to act on; the success
          // and error toasts stay click-through as before.
          pointerEvents: stripeToast.tone === "warn" ? "auto" : "none",
          maxWidth: "min(92vw, 560px)", textAlign: "center",
          lineHeight: 1.45,
        }}>
          {stripeToast.msg}
        </div>
      )}

      {/* ── Terms of Service Modal ── */}
      {showTerms && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowTerms(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 10,
              maxWidth: 680,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "28px 32px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.28)",
              fontFamily: "system-ui, sans-serif",
              color: "#1e293b",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e3a5f" }}>Terms of Service</h2>
              <button
                onClick={() => setShowTerms(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 22, lineHeight: 1, color: "var(--text-muted)", padding: "0 4px",
                }}
                aria-label="Close"
              >×</button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 0 }}>Last updated: February 22, 2026</p>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>1. Agreement to Terms</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                By accessing and using the AiRA Financial Freedom application, you accept and agree to be bound by the terms and
                provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>2. Disclaimer of Warranties</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                The AiRA Financial Freedom application is provided on an "AS IS" and "AS AVAILABLE" basis. AiRA Financial Freedom nor its Developers, make any
                representations or warranties of any kind, express or implied, as to the operation of the application or the
                information, content, or materials included on the application. To the fullest extent permissible by applicable
                law, AiRA  Financial Freedom and its Developers disclaim all warranties, express or implied, including but not limited to implied warranties
                of merchantability, fitness for a particular purpose, and non-infringement.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>3. Limitation of Liability</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                In no event shall the AiRA  Financial Freedom application, its directors, employees, agents, or suppliers be liable for any damages
                (including, without limitation, lost profits, savings, or data; business interruption; or any other special,
                indirect, incidental, or consequential damages) arising out of or in connection with the use, inability to use,
                or results of the use of the application, even if AiRA Financial Freedom and its Developers have been advised of the possibility of such damages.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#d97706", marginBottom: 6 }}>4. Not Financial Advice</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                The AiRA Financial Freedom application provides calculations and projections for <strong>educational and informational
                purposes only</strong>. The application does not provide professional investment, tax, or financial advice. All
                calculations are estimates based on the information you provide and are subject to change. You should not rely
                solely on the calculations provided by the AiRA Financial Freedom application for making financial decisions. Always consult with
                a qualified professionals such as a financial advisors, tax advisors, or mortgage professionals before making
                important financial decisions.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>5. Accuracy of Information</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                While we strive to ensure the accuracy of calculations, the AiRA Financial Freedom application makes no guarantee regarding the accuracy
                or completeness of the results. Market conditions, interest rates, inflation, and other factors may vary from
                the assumptions used in the calculator. Historical performance does not guarantee future results. All information displayed are dependent upon information that you provide and by using this 
                application you agree to not hold accountable the application nor it's developers for any financial decisions made based on the results of the calculator.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>6. User Responsibilities</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                You are responsible for ensuring that all information you input into the calculator is accurate and current.
                You are also responsible for protecting the confidentiality of your personal financial information.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>7. Modifications to Terms</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                The AiRA Financial Freedom application reserves the right to modify these terms and conditions at any time. Your continued use of the
                application following the posting of revised terms means that you accept and agree to the changes.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>8. Governing Law</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                These terms and conditions are governed by and construed in accordance with the laws of the United States, and
                you irrevocably submit to the exclusive jurisdiction of the courts in that location.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>9. Indemnification</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                You agree to indemnify and hold harmless the AiRA Financial Freedom application and its Developers from any and all claims, damages, losses, or expenses
                arising out of your use of the application or violation of these Terms of Service.
              </p>
            </section>

            <div style={{ textAlign: "center" }}>
              <button
                onClick={() => setShowTerms(false)}
                style={{
                  background: "#1e3a5f", color: "#fff", border: "none",
                  borderRadius: 6, padding: "8px 28px", fontSize: 13,
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showReport && mc && (
        <PrintReport
          params={{ ...params, name: assumptions.name }}
          mc={mc}
          stress={stress}
          rmdAge={rmdAge}
          onClose={() => setShowReport(false)}
          // Paywall gate. `!reportCapable` always wins: the report stays locked
          // on any deployment whose server doesn't have GEMINI_API_KEY configured,
          // regardless of BILLING_ENABLED — closes the "flip one source-level
          // boolean and self-host it free" loophole (BILLING_ENABLED=false used
          // to unconditionally unlock, since the report's data is 100%
          // client-computed and BILLING_ENABLED isn't a real secret). On the
          // operator's real deployment reportCapable is true and behavior is
          // unchanged: BILLING_ENABLED=false still opens the report free for
          // local/dev convenience; BILLING_ENABLED=true gates on useReportUnlocked(),
          // which reconciles against the LEDGER — previously this read a
          // localStorage flag, so editing one value granted access and clearing
          // it caused a second 250-credit charge for a window already owned.
          // A server-verified owner reads the real report with no purchase
          // prompt. This deliberately also bypasses `reportCapable`: proving
          // ADMIN_SECRET is strictly stronger evidence of being the operator
          // than the GEMINI_API_KEY probe it replaces.
          locked={ownerVerified ? false : (!reportCapable || (BILLING_ENABLED && !reportUnlocked))}
        />
      )}
      {/* Says WHY the report is unlocked, so an owner preview can never be
          mistaken for what a paying customer sees. Sits above the report
          overlay (z-index 20000 in PrintReport's own CSS). */}
      {showReport && mc && ownerVerified && (
        <div style={{
          position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)",
          zIndex: 20001, background: "rgba(124,58,237,0.95)", color: "#fff",
          borderRadius: 999, padding: "5px 16px", fontSize: 12, fontWeight: 700,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)", pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>
          🔧 Owner preview — purchase prompt suppressed (admin secret verified)
        </div>
      )}
    </>
  );
}

export { runMC, runStress, mortgageSchedule, calcYearTax, getRmdStartAge, guytonKlingerWithdrawal, progTax, irmaaCost, simulateDeterministicWithStrategy, getStandardDeduction, getIrmaaCeiling, getBracketCeiling, loadCheckIns, saveCheckIns, ProgressTab, planShapeScores, mergeCheckIns, ageFromDob, AGE_LIMITS, InfoIcon, InfoDot, mcMedianAtAge, ANumInput, parseNumericEntry };
