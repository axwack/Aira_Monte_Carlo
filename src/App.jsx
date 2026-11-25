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
import React, { useState, useEffect, useRef, useCallback, useMemo, memo, useContext, createContext } from "react";
import ReactDOM from "react-dom";
import { ABOUT_ME, ABOUT_THANKS, ABOUT_PRODUCT, ABOUT_FEATURES } from "./about.js";
import {
  taxableSocialSecurity,
  computeHouseholdSS,
  LTCG_BRACKETS_2026_MFJ, LTCG_BRACKETS_2026_SINGLE,
  NIIT_THRESHOLD_MFJ, NIIT_THRESHOLD_SINGLE, NIIT_RATE,
  getSeniorBonusDeduction, OBBBA_SENIOR_LAST_YEAR,
} from "./engine/buildRothExplorer.js";
import { buildWithdrawalWaterfall, accumulateToRetirement, resolveDrawOrder, effectiveRetireAge, gkReferenceWR, migrateOrderingMode } from "./engine/buildWithdrawalWaterfall.js";
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
import CountdownCard from "./CountdownCard";
import DateField from "./DateField";
import SpouseDobField from "./SpouseDobField";
import { BucketLegend, BucketResetButton } from "./BucketLegend";
import BudgetEditor, { budgetLinesToCsv, lineError } from "./planInputs/BudgetEditor";
import { NavContext, GoStep } from "./NavContext";
import CheckpointsPanel from "./forecast/CheckpointsPanel";
import HelpPage from "./HelpPage";
import { INCOME_LABELS } from "./engine/incomeLabels";
import { bucketColor } from "./engine/bucketColors";
import { retirementTarget, formatRemaining } from "./engine/retirementTarget";
import { ageFromDob, parseCalendarDate, personAgeNow, spouseAgeOffset, spouseAgeAt, personsAtLeastAge, filesJointlyAt, filingStatusAt, spouseDeathOnPrimaryClock, planEndAgeOnPrimaryClock, survivorAgeOnPrimaryClock, survivorIsPrimary, firstToDie, contribStopOnPrimaryClock } from "./engine/ages.js";
import { survivorFra, survivorReductionFactor, survivorBasis, resolveSurvivorClaimAge } from "./engine/survivorBenefit.js";
import { STRATEGY_LABELS, resolveStrategy, migrateWithdrawalStrategy, migrationNotice } from "./engine/withdrawalStrategies.js";
import { _defaultBucket, accountBucketPieces, expandAccountBuckets, clampBucket, bucketFractionsByCategory, bucketBalancesForRow, computeBucket1Runway } from "./engine/buckets.js";
import { dollarBasisLabel, retirementBasisYear, deflate, mcMedianAtAge, selectPortfolioAtAge, selectTerminalMeanAtAge } from "./engine/mcSelectors.js";
import { taxableYieldSplit } from "./engine/taxableYield.js";
import { formulaFor } from "./provenance.js";
import { track } from "./analytics.js";
import { solveRetirementDate, GEMINI_MODELS, DEFAULT_GEMINI_MODEL, AiUsageBadge, BILLING_ENABLED } from "./ai/ai-analysis.js";
import { CreditBalanceBadge, CreditPackModal, RecoveryLinkModal, RestoreAccessModal, useStripeReturn, useRestoreReturn, useCreditBalance, useReportUnlocked, useReportCapability , getStoredJWT, MIN_CREDITS_TO_RUN, LOW_BALANCE_WARN_AT, getStoredRecoveryLink } from "./billing/credits.js";
import { AdminPanel, useOwnerVerified } from "./billing/admin-panel.js";
import PrintReport from "./report/PrintReport.jsx";
import { AGE_LIMITS } from './data/ageLimits.js';
import { ComposedChart,Area,BarChart,Bar,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,ReferenceLine,ReferenceDot,Legend,RadarChart,PolarGrid,PolarAngleAxis,PolarRadiusAxis,Radar,PieChart,Pie,Cell,} from "recharts";
import { jointRmdDivisor } from './data/jointRmdTable.js';
import { STATE_BRACKETS } from './data/stateBrackets.js';
import { irmaaTableFor } from './data/irmaa2027.js';



const FEEDBACK_EMAIL = "tiredtoretire@gmail.com";
const aboutLink = (label) => ABOUT_ME.links.find((l) => l.label === label)?.url || "";

const APP_VERSION = "1.3.0";
export const BUILD_TAG = `v${APP_VERSION} - Home screen: the inputs come first`;
export const BUILD_TIME = "2026-10-04T12:00:00Z";
if (typeof window !== "undefined" && !window.__AIRA_BUILD_LOGGED__) {
  window.__AIRA_BUILD_LOGGED__ = true;
  // eslint-disable-next-line no-console
  console.log(`[AiRA] build ${BUILD_TAG} · ${BUILD_TIME} · v${APP_VERSION}`);
}

export const MC_PATHS = 3000;
export const STRESS_PATHS = 2000;
export const MC_PATHS_LABEL = MC_PATHS.toLocaleString();
export const STRESS_PATHS_LABEL = STRESS_PATHS.toLocaleString();
export const MC_PATH_MIN = 500;
export const MC_PATH_MAX = 20000;
export const SAMPLE_START_YEAR = 1928;
export const SAMPLE_END_YEAR = 2025;
export const SAMPLE_YEARS = SAMPLE_END_YEAR - SAMPLE_START_YEAR + 1;
export const MC_BAND_LOW_RISK  = 0.90;
export const MC_BAND_MODERATE  = 0.80;
export const MC_BAND_ELEVATED  = 0.70;
export const MC_BAND_HIGH      = 0.60;
const rateColor = (r) =>
  r >= MC_BAND_LOW_RISK ? "var(--positive)" : r >= MC_BAND_MODERATE ? "var(--positive)" : r >= MC_BAND_ELEVATED ? "var(--accent-gold)" : r >= MC_BAND_HIGH ? "var(--chart-7)" : "var(--negative)";
const bandLabel = (r) =>
  r >= MC_BAND_LOW_RISK ? "Excellent" : r >= MC_BAND_MODERATE ? "Good" : r >= MC_BAND_ELEVATED ? "Concerning" : "Critical";
export const MC_SOLID_PLAN_RATE = 0.85;

export const INFO_ACCENT = {
  method:   "var(--accent-teal)",
  money:    "var(--chart-2)",
  tax:      "var(--accent-purple)",
  positive: "var(--positive)",
  risk:     "var(--accent-gold)",
};

function PillTab({
  options, value, onChange, accentFor,
  defaultAccent = INFO_ACCENT.method,
  ariaLabel, style, size = "md",
}) {
  const SIZES = {
    md: { fontSize: "var(--fs-label)", padding: "7px 13px" },
    sm: { fontSize: "var(--fs-small)", padding: "5px 10px" },
  };
  const s = SIZES[size] || SIZES.md;
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        alignItems: "stretch",
        borderBottom: "1px solid var(--divider)",
        ...style,
      }}
    >
      {options.map(([key, label]) => {
        const on = key === value;
        const accent = (accentFor && accentFor(key)) || defaultAccent;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(key)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${on ? accent : "transparent"}`,
              marginBottom: -1,
              padding: s.padding,
              fontSize: s.fontSize,
              fontFamily: "var(--font-sans)",
              fontWeight: on ? 800 : 600,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              color: on ? accent : "var(--text-muted)",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export const GK_FLOOR_DEFAULT_PCT = 65;export const GK_CEILING_DEFAULT_PCT = 135;
export const GK_FLOOR_FALLBACK = 48_000;
export const GK_CEILING_FALLBACK = 115_000;
const CURRENT_YEAR = new Date().getFullYear();

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


const GK_INFLATION_CAP = 0.06;
const GK_BAND_PCT = 0.20;
const GK_ADJUST_PCT = 0.10;
const GK_LONGEVITY_YEARS = 15;

const SEQ_2000_2012 = [
  -0.091, -0.119, -0.221, 0.287, 0.109, 0.048, 0.158, 0.055, -0.37, 0.265,
  0.151, 0.021, 0.16,
];

export function computeInitialWR(p) {
  const currentAge = p.currentAge || 35;
  const retireAge = p.retireAge || 65;
  const yrsToRetire = Math.max(0, retireAge - currentAge);
  const eqPct = p.preRetireEq ?? 91;
  const nominalRate = expectedReturn(eqPct) / 100;
  const inflRate = (p.inf ?? 2.5) / 100;
  const accumRate = nominalRate - inflRate;
  const hsaAnnual = p.hsaContrib != null ? p.hsaContrib : (p.hsaMonthly || 0) * 12;
  const annualAdds = (p.contrib || 0) + (p.employerContrib || 0) + hsaAnnual
    + (p.taxableContrib || 0) + (p.rothContrib || 0);
  const growth = (yrs) => Math.pow(1 + accumRate, yrs);
  const projectedPort = (p.port || 0) * growth(yrsToRetire) +
    (yrsToRetire > 0 && accumRate > 0
      ? annualAdds * (growth(yrsToRetire) - 1) / accumRate
      : annualAdds * yrsToRetire);
  const baseSpend = p.sp || 0;
  const ssAtRetire = computeHouseholdSS(p, retireAge);
  const rentalAtRetire = (p.ab > 0 ? p.ab : 0) + (p.propIncome || 0);
  const retireCalYear = CURRENT_YEAR + (retireAge - currentAge);
  const { total: otherIncAtRetire } = computeOtherIncome(p.otherIncomes, retireCalYear);
  const housingType = p.housingType || "own";
  let housingAtRetire = 0;
  if (housingType === "own" && p.mortBalance > 0) {
    const ms = mortgageSchedule(p.mortBalance, p.mortRate ?? 6.5, p.mortStart || "2020-01", p.mortTerm || 30, p.mortExtra || 0);
    housingAtRetire = mortgageAnnualPayments(ms).get(retireCalYear) || 0;
  } else if (housingType === "rent") {
    housingAtRetire = p.annualRent || 0;
  }
  const carveoutAtRetire = (p.carveouts || []).reduce((sum, c) => {
    return sum + (retireCalYear <= (c.endYear || 9999) ? (c.annual || 0) : 0);
  }, 0);
  const oneOffAtRetire = computeCashFlowEvents(p.cashFlowEvents, retireCalYear, inflRate * 100, CURRENT_YEAR).total
    / Math.pow(1 + inflRate, Math.max(0, retireCalYear - CURRENT_YEAR));
  const steadyDraw = Math.max(0, baseSpend - ssAtRetire - rentalAtRetire - otherIncAtRetire) + housingAtRetire + carveoutAtRetire;
  const initDrawEst = steadyDraw + oneOffAtRetire;
  const pctOf = (draw) => projectedPort > 0 ? (draw / projectedPort) * 100 : 0;
  const initWRpct = pctOf(initDrawEst);
  const steadyWRpct = pctOf(steadyDraw);
  return { initWRpct, steadyWRpct, projectedPort, initDrawEst, steadyDraw, oneOffAtRetire, baseSpend, ssAtRetire, rentalAtRetire,
    otherIncAtRetire, housingAtRetire, carveoutAtRetire, annualAdds, accumRate, nominalRate, inflRate, yrsToRetire };
}


function getStateBrackets(state, isMFJ) {
  const entry = STATE_BRACKETS[state];
  if (!entry) return null;
  return isMFJ ? entry.mfj : entry.single;
}


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

export { _defaultBucket, accountBucketPieces, expandAccountBuckets, clampBucket };

export const BLANK_PROFILE = {
  label: "My Plan",
  name: "",
  dob: "",
  dobIsEstimate: false,
  sex: "blended",
  stateOfResidence: "",
  currentAge: 50,
  retireAge: 60,
  endAge: 85,
  port: 1_000_000,
  contrib: 20,
  employerContrib: 0,
  taxableContrib: 0,
  rothContrib: 0,
  inf: 2.5,
  sp: 10_000,
  spOutOfCountry: 0,
  spSpendOutofState: 0,
  portfolioGoal: 1_000_000,
  ssAge: 67,
  ssb: 24_000,
  ssPia: 0,
  spouse: {
    enabled: false,
    dob: "",
    ssb: 0,
    ssAge: 67,
    ssPia: 0,
    deathAge: null,
    firstToDie: "spouse",
    survivorClaimAge: null,
    survivorBenefitAtClaim: 0,
    retireAge: null,
    contrib: 0,
    employerContrib: 0,
    rothContrib: 0,
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
  gkFloorPct: GK_FLOOR_DEFAULT_PCT,
  gkTarget: 72_000,
  gkCeiling: 100_000,
  gkCeilingPct: GK_CEILING_DEFAULT_PCT,
  mortBalance: 0,
  mortRate: 5.0,
  mortStart: "2020-01",
  mortTerm: 30,
  mortExtra: 0,
  mortPI: 0,
  properties: [
    { id:"p1", label:"Primary Residence", value:0, mortgage:0, income:0 },
    { id:"p2", label:"Property 2",        value:0, mortgage:0, income:0 },
  ],
  filingStatus: "mfj",
  reGrowthRate: 3.0,
  useJointRmdTable: false,
  cashRealReturn: 3.0,
  mcPaths: MC_PATHS,
  mcRangeStart: SAMPLE_START_YEAR,
  mcRangeEnd: SAMPLE_END_YEAR,
  taxableBasisPct: 70,
  taxableYieldPct: 0,
  taxableYieldOrdinaryPct: 50,
  housingType: "own",
  annualRent: 0,
  carveouts: [],
  cashFlowEvents: [],
  spSchedule: null,
  budgetLines: [],
  spImportMeta: null,
  rothConversionTarget: "off",
  fafsaGuard: false,
  fafsaEndYear: null,
  cssEndYear: null,
  conversionOverrides: [],
  accounts: [
    { id: "1", category: "pretax", name: "401(k)",      balance: 0, bucket: 2 },
    { id: "2", category: "roth",   name: "Roth IRA",    balance: 0, bucket: 3 },
    { id: "3", category: "taxable",name: "Brokerage",   balance: 0, bucket: 2 },
    { id: "4", category: "hsa",    name: "HSA",         balance: 0, bucket: 3 },
    { id: "5", category: "cash",   name: "Cash/Savings",balance: 0, bucket: 1 },
  ],
  abReliability: 80,
  otherIncomes: [],
  abGrowth: 3.0,
  ssCola: 2.4,
  preRetireEq: 91,
  postRetireEq: 70,
  glidepathSwitchAge: null,
  fixedWithdrawalRate: 4.0,
  hcShockAge: 72,
  hcProb: 3.5,
  hcMin: 70_000,
  hcMax: 130_000,
  checkpoints: [],
  earlyRetireTarget: 2_000_000,
  withdrawalStrategy: "gk",
  withdrawalBracketTarget: "22",
  irmaaGuard: false,
  ssTorpedoGuard: false,
  rothEmergencyReserve: 0,
  ruleOf55: false,
  sepp72t: false,
  sepp72tStartAge: null,
  orderingMode: "tax_reactive",
  withdrawalOrder: ["cash", "taxable", "pretax", "roth"],
  b1Years: 2,
  b2Years: 5,
  geminiApiKey: "",
  geminiModel: "",
};

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
    color: "var(--positive)",
  },
  {
    min: 90,
    text: "An NFL kicker making an extra point",
    stat: "≈94%",
    emoji: "🏈",
    color: "var(--positive)",
  },
  {
    min: 90,
    text: "A full year of driving without a collision claim",
    stat: "≈94%",
    emoji: "🚗",
    color: "var(--positive)",
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
    color: "var(--chart-7)",
  },
  {
    min: 70,
    text: "Not flipping two heads in a row",
    stat: "75%",
    emoji: "🪙",
    color: "var(--chart-7)",
  },
  {
    min: 60,
    text: "Graduating college within six years of starting",
    stat: "≈64%",
    emoji: "🎓",
    color: "var(--chart-3)",
  },
  {
    min: 60,
    text: "Rolling 3 or higher on a single die",
    stat: "≈67%",
    emoji: "🎲",
    color: "var(--chart-3)",
  },
  {
    min: 50,
    text: "A literal coin flip — retirement shouldn't be one",
    stat: "50%",
    emoji: "🪙",
    color: "var(--chart-1)",
  },
  {
    min: 50,
    text: "Guessing a card's color correctly",
    stat: "50%",
    emoji: "🎴",
    color: "var(--chart-1)",
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
function resolveSampleRange(p) {
  const lo = Number(p?.mcRangeStart);
  const hi = Number(p?.mcRangeEnd);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const start = Math.max(0, Math.round(lo) - SAMPLE_START_YEAR);
  const end   = Math.min(SP500.length - 1, Math.round(hi) - SAMPLE_START_YEAR);
  if (end <= start) return null;
  if (start === 0 && end === SP500.length - 1) return null;
  return { start, count: end - start + 1, lo: SAMPLE_START_YEAR + start, hi: SAMPLE_START_YEAR + end };
}
function sampleYearIndex(rand, range) {
  return range ? range.start + Math.floor(rand() * range.count)
               : Math.floor(rand() * SP500.length);
}
function portReturn(age, rand, preRetireEq, postRetireEq, switchAge, range = null) {
  const eqW = glidepathEquityWeight(age, preRetireEq, postRetireEq, switchAge);
  const i = sampleYearIndex(rand, range);
  return eqW * SP500[i] + (1 - eqW) * BONDS[i];
}
function drawYearBundle(age, rand, preRetireEq, postRetireEq, switchAge, range = null) {
  const eqW = glidepathEquityWeight(age, preRetireEq, postRetireEq, switchAge);
  const i = sampleYearIndex(rand, range);
  rand();
  return {
    ret: eqW * SP500[i] + (1 - eqW) * BONDS[i],
    inflY: INFL[i],
    i,
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
    fixedCosts = 0,
    out = null
  ) {
    if (out) { out.event = null; out.reason = null; out.currentWR = null; }
    if (isNaN(portfolioValue) || portfolioValue <= 0) return floor || 0;
    if (isNaN(lastWithdrawal)) lastWithdrawal = floor || 0;
    if (isNaN(lastReturn)) lastReturn = 0;
    if (isNaN(inflationRate)) inflationRate = 0.02;
    if (isNaN(initialWR)) initialWR = 0.04;
    if (isNaN(incomeOffset)) incomeOffset = 0;
    if (isNaN(fixedCosts)) fixedCosts = 0;

    const cappedInfl = Math.min(GK_INFLATION_CAP, inflationRate);
    let w =
      lastReturn >= 0 ? lastWithdrawal * (1 + cappedInfl) : lastWithdrawal;

    if (initialWR > 0) {
      const netNeed = Math.max(0, w - incomeOffset) + fixedCosts;
      const currentWR = portfolioValue !== 0 ? netNeed / portfolioValue : 0;

      if (currentWR <= initialWR * (1 - GK_BAND_PCT)) {
        w *= 1 + GK_ADJUST_PCT;
        if (out) { out.event = "raise"; out.reason = "prosperity"; }
      }
      else if (currentWR >= initialWR * (1 + GK_BAND_PCT) && yearsRemaining > GK_LONGEVITY_YEARS) {
        w *= 1 - GK_ADJUST_PCT;
        if (out) { out.event = "cut"; out.reason = "preservation"; }
      } else if (out && currentWR >= initialWR * (1 + GK_BAND_PCT)) {
        out.reason = "longevity-hold";
      }
      if (out) out.currentWR = currentWR;
    }

    const clampedW = Math.max(floor || 0, Math.min(ceiling || Infinity, w));
    if (out && Number.isFinite(w)) {
      if (Number.isFinite(ceiling) && w > ceiling + 1e-9) {
        out.event = "constrained";
        out.reason = "ceiling-bind";
      } else if (floor != null && w < floor - 1e-9) {
        out.event = "constrained";
        out.reason = "floor-bind";
      }
    }
    return clampedW;
}

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
  magiLookback = null,
  spouseAge = null
) {
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
  const taxableSS = taxableSocialSecurity(ssIncome, otherIncome + ltcgAmount, isMFJ);
  const totalIncome = taxableSS + otherIncome;
  const inflationFactor = Math.pow(1 + inflationRate, Math.max(0, yr - CURRENT_YEAR));

  const magi = totalIncome + ltcgAmount;

  const stdDeduction = getStandardDeduction(age, filingStatus, inflationFactor, spouseAge);
  const seniorBonus = getSeniorBonusDeduction(age, filingStatus, magi, yr, spouseAge);
  const totalDeduction = stdDeduction + seniorBonus;
  const taxableIncome = Math.max(0, totalIncome - totalDeduction);
  const gainTaxable = Math.max(0, totalIncome + ltcgAmount - totalDeduction) - taxableIncome;

  const rawBrackets = isMFJ ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE;
  const fedBrackets = idxB(rawBrackets, inflationFactor);
  const fedTaxOrdinary = progTax(taxableIncome, fedBrackets);

  const ltcgBrackets = idxB(isMFJ ? LTCG_BRACKETS_2026_MFJ : LTCG_BRACKETS_2026_SINGLE, inflationFactor);
  const ltcgTax = Math.round(
    progTax(taxableIncome + gainTaxable, ltcgBrackets) - progTax(taxableIncome, ltcgBrackets)
  );

  const niitThreshold = isMFJ ? NIIT_THRESHOLD_MFJ : NIIT_THRESHOLD_SINGLE;
  const niit = ltcgAmount > 0
    ? Math.round(NIIT_RATE * Math.min(ltcgAmount, Math.max(0, magi - niitThreshold)))
    : 0;

  const fedTax = fedTaxOrdinary + ltcgTax + niit;
  let stateTax = 0;

  if (!isTwoHousehold) {
    const stateBr = getStateBrackets(stateOfResidence, isMFJ);
    const stateTaxSS = stateOfResidence === "NJ" ? taxableSS : 0;
    if (stateBr) stateTax = Math.round(progTax(Math.max(0, taxableIncome - stateTaxSS) + ltcgAmount, idxB(stateBr, inflationFactor)));
  }
      const irmaaMagi = (typeof magiLookback === "number" && !isNaN(magiLookback)) ? magiLookback : magi;
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
    stdDeduction, seniorBonus,
    magi,
  };
}

function getStandardDeduction(age, filingStatus, inflFactor, spouseAge = null) {
  const mfj = filingStatus !== "single";
  let sd = mfj ? 32_200 : 16_100;
  const seniors = personsAtLeastAge(age, spouseAge, mfj, 65);
  sd += seniors * 1_650;
  return Math.round(sd * inflFactor);
}

function getIrmaaCeiling(tier, filingStatus, inflFactor) {
  const mfj = filingStatus !== "single";
  const base = mfj ? 218_000 : 109_000;
  return Math.round(base * inflFactor);
}

export function irmaaTargetRoom(filingStatus, inflFactor, magiSoFar) {
  return Math.max(0, getIrmaaCeiling(1, filingStatus, inflFactor) - magiSoFar);
}

export function shrinkToIrmaaCap(amt, magiFor, cap) {
  for (let i = 0; i < 3 && amt > 0; i++) {
    const over = magiFor(amt) - cap;
    if (over <= 0) break;
    amt = Math.max(0, amt - over);
  }
  return amt;
}

function getBracketCeiling(target, filingStatus, inflFactor) {
  const mfj = filingStatus !== "single";
  const ceilings = mfj
    ? { "10": 24_800, "12": 100_800, "22": 211_400, "24": 403_550, "32": 512_450, "35": 768_700, "37": Infinity }
    : { "10": 12_400, "12":  50_400, "22": 105_700, "24": 201_800, "32": 256_225, "35": 640_600, "37": Infinity };
  const base = ceilings[target] ?? ceilings["22"];
  return base === Infinity ? Infinity : Math.round(base * inflFactor);
}

function flatPreRetReturn(p) {
  const v = p.preRetireReturn;
  return v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v) / 100;
}

function seqYear(entry, eqW, rand) {
  const stock = typeof entry === "number" ? entry : entry.stock;
  const bondDraw = bootstrapDraw(BONDS, rand);
  const inflDraw = bootstrapDraw(INFL, rand);
  const bond = entry?.bond ?? bondDraw;
  return { stock, bond, infl: entry?.infl ?? inflDraw, r: eqW * stock + (1 - eqW) * bond };
}

export function historicalSequence(startYear, years = 13) {
  const i0 = startYear - SAMPLE_START_YEAR;
  return Array.from({ length: years }, (_, k) => i0 + k)
    .filter((i) => i >= 0 && i < SP500.length)
    .map((i) => ({ year: SAMPLE_START_YEAR + i, stock: SP500[i], bond: BONDS[i], infl: INFL[i] }));
}

function runMC(p, endAge, N = MC_PATHS, seed = 42, useGK = true, seqOverride = null, seqToday = false, keepFailures = false) {
  const rand = mulberry32(seed);
  const taxEnabled = p.tax !== false;
  const drawOrderMC = resolveDrawOrder(p.orderingMode, p.withdrawalOrder);
  const retAgeMC = effectiveRetireAge(p.retireAge, p.currentAge);
  const ruleOf55ShareMC = detectEmployerPlan(p.accounts).share;
  const ruleOf55OkMC = ruleOf55SeparationQualifies({
    dob: p.dob, birthYear: p.birthYear, currentAge: p.currentAge, retireAge: retAgeMC,
  });
  const glideSwitchAgeMC = resolveGlidepathSwitchAge({ ...p, retireAge: retAgeMC });
  const sampleRangeMC = resolveSampleRange(p);
  const accYrs = Math.max(0, retAgeMC - p.currentAge);
  const planEndMC = planEndAgeOnPrimaryClock(p, endAge);
  const retYrs = planEndMC - retAgeMC;
  const results = [];
  const gkStats = { paths: 0, pathsWithCut: 0, pathsWithRaise: 0, cuts: 0, raises: 0, longevityHolds: 0, constrained: 0, pathsWithConstrained: 0, ceilingBinds: 0, floorBinds: 0, spendMinReal: Infinity, spendMaxReal: 0, cutCounts: [] };
  const gkFloor = p.gkFloor || GK_FLOOR_FALLBACK;
  const gkCeiling = p.gkCeiling || GK_CEILING_FALLBACK;
  const withdrawalStrategy = resolveStrategy(p.withdrawalStrategy);

  const cashRealReturn = (p.cashRealReturn ?? 3.0) / 100;
  const useJointTableAt = (age) => (p.useJointRmdTable ?? false) && filesJointlyAt(p, age);
  const UNIFORM_TABLE = RMD_DIV;

  const rmdStartAge = (typeof p.rmdStartAge === "number" && p.rmdStartAge > 0)
    ? p.rmdStartAge
    : getRmdStartAge({ dob: p.dob, birthYear: p.birthYear, currentAge: p.currentAge });

  const taxInfl = (p.inf ?? 2.5) / 100;

  const taxableBasisPct = Math.max(0, Math.min(100, p.taxableBasisPct ?? 70));

  let mortByYear = new Map();
  if (p.mortBalance > 0) {
    const ms = mortgageSchedule(
      p.mortBalance,
      p.mortRate ?? 6.5,
      p.mortStart || "2020-01",
      p.mortTerm || 30,
      p.mortExtra || 0
    );
    mortByYear = mortgageAnnualPayments(ms);
  }

  const preRetFlat = flatPreRetReturn(p);
  const seqOffset = seqToday ? accYrs : 0;
  const failedRuns = [];
  const accInflowByYear = [];
  for (let y = 0; y < accYrs; y++) {
    accInflowByYear.push(computeCashFlowEvents(p.cashFlowEvents, CURRENT_YEAR + y, p.inf ?? 2.5, CURRENT_YEAR));
  }

  for (let i = 0; i < N; i++) {
    let pretax = 0, roth = 0, taxable = 0, cash = 0;
    for (const acct of (p.accounts || [])) {
      const bal = acct.balance || 0;
      if (acct.category === "pretax") pretax += bal;
      else if (acct.category === "roth") roth += bal;
      else if (acct.category === "taxable") taxable += bal;
      else cash += bal;
    }
    let taxableBasis = taxable * (taxableBasisPct / 100);
    let totalPort = pretax + roth + taxable + cash;

    for (let y = 0; y < accYrs; y++) {
      let ret;
      if (seqToday && seqOverride && y < seqOverride.length) {
        ret = seqYear(seqOverride[y], glidepathEquityWeight(p.currentAge + y, p.preRetireEq, p.postRetireEq, glideSwitchAgeMC), rand).r;
      } else {
        ret = portReturn(p.currentAge + y, rand, p.preRetireEq, p.postRetireEq, glideSwitchAgeMC, sampleRangeMC);
        if (preRetFlat != null) ret = preRetFlat;
      }
      pretax   = Math.max(0, pretax   * (1 + ret));
      roth     = Math.max(0, roth     * (1 + ret));
      taxable  = Math.max(0, taxable  * (1 + ret));
      cash     = Math.max(0, cash     * (1 + ret));
      const jc = jobContributionsForYear(p, p.currentAge + y);
      pretax  += jc.pretax;
      cash    += (p.hsaContrib || 0);
      roth    += jc.roth;
      taxable += (p.taxableContrib || 0);
      taxableBasis += (p.taxableContrib || 0);
      const evAcc = accInflowByYear[y];
      if (evAcc && evAcc.inflow > 0) {
        pretax += evAcc.byBucket.pretax || 0;
        roth   += evAcc.byBucket.roth   || 0;
        cash   += evAcc.byBucket.cash   || 0;
        const taxableIn = evAcc.byBucket.taxable || 0;
        taxable += taxableIn;
        taxableBasis += taxableIn;
      }
      totalPort = pretax + roth + taxable + cash;
    }

    const portAtRetire = Math.round(totalPort);

    const path = [portAtRetire];
    let survived = true, exhaustAge = null;
    let bracketOverrideYears = 0;
    let rothReserveBrokenYears = 0;
    let gkYearSink = null;
    let pathCuts = 0;
    let pathRaise = false;
    let pathConstrained = 0;
    let sp = p.sp;
    let lastReturn = 0;
    let inflPrev = 0;

    let magiOneYearAgo = null, magiTwoYearsAgo = null;

    const rows = keepFailures ? [] : null;
    for (let y = 0; y < retYrs; y++) {
      const startBal = totalPort;
      const age = retAgeMC + y;
      const calYear = CURRENT_YEAR + (age - p.currentAge);
      let r, inflY;
      let stockReturnMC, bondReturnMC;
      if (seqOverride && y + seqOffset < seqOverride.length) {
        const eqW = glidepathEquityWeight(age, p.preRetireEq, p.postRetireEq, glideSwitchAgeMC);
        ({ stock: stockReturnMC, bond: bondReturnMC, infl: inflY, r } = seqYear(seqOverride[y + seqOffset], eqW, rand));
      } else {
        const bundle = drawYearBundle(age, rand, p.preRetireEq, p.postRetireEq, glideSwitchAgeMC, sampleRangeMC);
        r = bundle.ret;
        inflY = bundle.inflY;
        stockReturnMC = SP500[bundle.i];
      }

      const cumInfl = Math.pow(1 + (p.inf ?? 2.5) / 100, y);
      const adjFloor = gkFloor * cumInfl;
      const adjCeiling = gkCeiling * cumInfl;

      const ss = computeHouseholdSS(p, age);
      const growthFactor = Math.pow(1 + (p.abGrowth ?? 3) / 100, Math.min(y, 20));
      const totalRental = Math.round(((p.propIncome || 0) + (p.ab > 0 ? p.ab : 0)) * growthFactor);
      const rentalForGK = (p.abEndYear && calYear > p.abEndYear) ? 0 : totalRental;

      const housingType = p.housingType || "own";
      let housingCost = 0;
      if (housingType === "own") {
        housingCost = mortByYear.get(calYear) || 0;
      } else if (housingType === "rent") {
        housingCost = Math.round((p.annualRent || 0) * cumInfl);
      }

      const carveoutCost = (p.carveouts || []).reduce((sum, c) => {
        return sum + (calYear <= (c.endYear || 9999) ? Math.round((c.annual || 0) * cumInfl) : 0);
      }, 0);

      const { total: otherIncTotal, totalTaxable: otherIncTaxable } = computeOtherIncome(p.otherIncomes, calYear);

      const ev = computeCashFlowEvents(p.cashFlowEvents, calYear, p.inf ?? 2.5, CURRENT_YEAR);
      const eventCost = ev.total;

      if (ev.inflow > 0) {
        pretax  += ev.byBucket.pretax  || 0;
        roth    += ev.byBucket.roth    || 0;
        cash    += ev.byBucket.cash    || 0;
        const taxableIn = ev.byBucket.taxable || 0;
        taxable += taxableIn;
        taxableBasis += taxableIn;
        totalPort = pretax + roth + taxable + cash;
      }

      const { yieldAmount: taxableYieldAmtMC, ordinaryYield: ordinaryYieldMC, qualifiedYield: qualifiedYieldMC } =
        taxableYieldSplit(taxable, p.taxableYieldPct, p.taxableYieldOrdinaryPct);

      const hcShock = healthcareShockDraw(age, rand, p, cumInfl);

      const gkIncomeOffset = ss + rentalForGK + otherIncTotal;
      const gkFixedCosts = housingCost + carveoutCost + ev.committed + hcShock;

      if (p.spSchedule && p.spSchedule.length) {
        sp = scheduleSpendForYear(p.spSchedule, calYear, p.inf ?? 2.5);
      } else if (y === 0) {
      } else {
        if (withdrawalStrategy === "gk") {
          const refWR = gkReferenceWR({ plannedSpend: p.sp, cumInfl, incomeOffset: gkIncomeOffset, fixedCosts: gkFixedCosts, portAtRetire });
          gkYearSink = {};
          sp = guytonKlingerWithdrawal(totalPort, refWR, sp, lastReturn, inflPrev, adjFloor, adjCeiling, endAge - age, gkIncomeOffset, gkFixedCosts, gkYearSink);
          if (gkYearSink.event === "cut") { pathCuts++; gkStats.cuts++; }
          else if (gkYearSink.event === "raise") { pathRaise = true; gkStats.raises++; }
          else if (gkYearSink.event === "constrained") {
            pathConstrained++;
            gkStats.constrained++;
            if (gkYearSink.reason === "ceiling-bind") gkStats.ceilingBinds++;
            else if (gkYearSink.reason === "floor-bind") gkStats.floorBinds++;
          }
          else if (gkYearSink.reason === "longevity-hold") gkStats.longevityHolds++;
        }
        else if (withdrawalStrategy === "fixed") {
          const fixedRate = p.fixedWithdrawalRate ?? 0.04;
          sp = totalPort * fixedRate;
        }
        else if (withdrawalStrategy === "vpw") {
          const rVPW = p.vpwRealReturn ?? 0.0376;
          const n = Math.max(1, (p.vpwEndAge ?? endAge ?? 100) - age);
          const rateVPW = rVPW === 0 ? 1 / n : rVPW / (1 - Math.pow(1 + rVPW, -n));
          const newSp = totalPort * Math.min(0.10, rateVPW);
          sp = Math.max(adjFloor, Math.min(adjCeiling, newSp));
        }
        else if (withdrawalStrategy === "ninety_five_rule") {
          if (y === 1) {
            sp = p.sp;
          } else {
            const inflated = sp * (1 + inflPrev);
            const floor95 = sp * 0.95;
            sp = Math.max(floor95, inflated);
          }
          sp = Math.max(adjFloor, Math.min(adjCeiling, sp));
        }
        else if (withdrawalStrategy === "bengen") {
          sp = sp * (1 + inflPrev);
        }
        else if (withdrawalStrategy === "smart") {
          const yrsRemaining = endAge - age;
          if (yrsRemaining > 15) {
            const refWR2 = gkReferenceWR({ plannedSpend: p.sp, cumInfl, incomeOffset: gkIncomeOffset, fixedCosts: gkFixedCosts, portAtRetire });
            sp = guytonKlingerWithdrawal(totalPort, refWR2, sp, lastReturn, inflPrev, adjFloor, adjCeiling, yrsRemaining, gkIncomeOffset, gkFixedCosts);
          } else {
            sp = sp * (1 + inflPrev);
          }
        }
        else {
          sp = sp * (1 + inflPrev);
        }
      }
      lastReturn = r;
      inflPrev = inflY;

      if (sp > 0) {
        const spReal = sp / cumInfl;
        if (spReal < gkStats.spendMinReal) gkStats.spendMinReal = spReal;
        if (spReal > gkStats.spendMaxReal) gkStats.spendMaxReal = spReal;
      }

      const abReliable = rand() < (p.abReliability || 80) / 100;
      const effectiveAb = (p.abEndYear && calYear > p.abEndYear) ? 0 :
        (abReliable ? totalRental : 0);

      const spSmiled = sp * spendingSmileFactor(age, retAgeMC, p.smile !== false);
      const need = Math.max(0, (spSmiled + housingCost + carveoutCost + eventCost + hcShock) - ss - effectiveAb - otherIncTotal);
      const incomeSurplus = Math.max(0,
        (ss + effectiveAb + otherIncTotal) - (spSmiled + housingCost + carveoutCost + eventCost + hcShock));

      let rmd = 0;
      if (age >= rmdStartAge && pretax > 0) {
        const jointDiv = useJointTableAt(age) ? jointRmdDivisor(age, spouseAgeAt(p, age)) : null;
        const divisor = jointDiv ?? (UNIFORM_TABLE[age] || 15.0);
        rmd = Math.round(pretax / divisor);
      }
      const yr = CURRENT_YEAR + (age - p.currentAge);
      const filingStatus = filingStatusAt(p, age);

      let bracketRoomMC = Infinity;
      const bracketSetMC = !!(p.withdrawalBracketTarget && p.withdrawalBracketTarget !== "off");
      const irmaaOnMC    = !!p.irmaaGuard && age >= 63;
      if (bracketSetMC || irmaaOnMC) {
        const inflFactorMC = Math.pow(1 + taxInfl, Math.max(0, yr - CURRENT_YEAR));
        const sdMC = getStandardDeduction(age, filingStatus, inflFactorMC, spouseAgeAt(p, age));
        const ordinaryFloorMC = Math.round(ss * 0.85) + rmd + (effectiveAb + otherIncTaxable) + ordinaryYieldMC;
        const irmaaTargetMC = p.withdrawalBracketTarget === "irmaa";
        const ceilingMC = bracketSetMC && !irmaaTargetMC
          ? getBracketCeiling(p.withdrawalBracketTarget, filingStatus, inflFactorMC)
          : Infinity;
        const ceilingForBonusMC = Number.isFinite(ceilingMC)
          ? ceilingMC
          : Math.max(0, getIrmaaCeiling(1, filingStatus, inflFactorMC) - sdMC);
        const roomBeforeBonusMC = Math.max(0, ceilingForBonusMC - (ordinaryFloorMC - sdMC));
        const seniorBonusMC = getSeniorBonusDeduction(
          age, filingStatus, ordinaryFloorMC + roomBeforeBonusMC, yr, spouseAgeAt(p, age)
        );
        const taxableSoFarMC = ordinaryFloorMC - (sdMC + seniorBonusMC);
        bracketRoomMC = Number.isFinite(ceilingMC)
          ? Math.max(0, ceilingMC - taxableSoFarMC)
          : Infinity;
        if (irmaaOnMC || irmaaTargetMC) {
          bracketRoomMC = Math.min(bracketRoomMC, irmaaTargetRoom(filingStatus, inflFactorMC, ordinaryFloorMC));
        }
      }

      const rothFloorMC = p.rothEmergencyReserve || 0;
      const magiLookbackMC = (y >= 2 && typeof magiTwoYearsAgo === "number") ? magiTwoYearsAgo : null;
      let taxResult = null;
      let totalTax = 0;
      let fromCash = 0, fromTaxable = 0, fromPretax = 0, fromRoth = 0;
      let shortfall = 0;
      const rowOf = (end, short = 0) => ({
        age, year: calYear, stock: stockReturnMC, ret: r, infl: inflY,
        spend: Math.round(spSmiled + housingCost + carveoutCost + eventCost + hcShock),
        income: Math.round(ss + effectiveAb + otherIncTotal), tax: Math.round(totalTax),
        start: Math.round(startBal), end: Math.round(end), short: Math.round(short),
      });
      let earlyPenMC = { penalty: 0, exemptAmount: 0, reason: "" };
      for (let pass = 0; pass < 12; pass++) {
        let remaining = Math.max(0, need + totalTax - rmd - incomeSurplus);
        fromCash = fromTaxable = fromPretax = fromRoth = 0;
        const drawMC = {
          cash:    () => { fromCash    = Math.min(remaining, cash);                                             remaining -= fromCash;    },
          taxable: () => { fromTaxable = Math.min(remaining, taxable);                                          remaining -= fromTaxable; },
          pretax:  () => { fromPretax  = Math.min(Math.min(remaining, bracketRoomMC), Math.max(0, pretax - rmd)); remaining -= fromPretax;  },
          roth:    () => { fromRoth    = Math.min(remaining, Math.max(0, roth - rothFloorMC));                  remaining -= fromRoth;    },
        };
        for (const bucket of drawOrderMC) drawMC[bucket]();

        if (remaining > 0.01) {
          const pretaxAvail = Math.max(0, pretax - rmd) - fromPretax;
          if (pretaxAvail > 0) {
            const extra = Math.min(remaining, pretaxAvail);
            fromPretax += extra;
            remaining  -= extra;
            bracketOverrideYears++;
          }
        }
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

        const gPass = realizedGainFromDraw(fromTaxable, taxable, taxableBasis);
        taxResult = calcYearTax(
          age, yr, fromPretax, ss, effectiveAb + otherIncTaxable + ordinaryYieldMC, rmd, 0,
          p.twoHousehold || false, taxInfl, filingStatus, p.stateOfResidence || "NJ", gPass + qualifiedYieldMC, magiLookbackMC,
          spouseAgeAt(p, age)
        );
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
        if (rows) rows.push(rowOf(0, shortfall));
        break;
      }

      const realizedGainMC = realizedGainFromDraw(fromTaxable, taxable, taxableBasis);

      const rmdExcess = Math.max(0, rmd - (need + totalTax));
      const consumedBasisMC = fromTaxable - realizedGainMC;
      const surplusToTaxableMC = Math.max(0, incomeSurplus - Math.max(0, totalTax - rmd));
      taxableBasis = Math.max(0, taxableBasis - consumedBasisMC) + rmdExcess + surplusToTaxableMC + taxableYieldAmtMC;
      cash    = Math.max(0, cash    - fromCash);
      taxable = Math.max(0, taxable - fromTaxable) + rmdExcess + surplusToTaxableMC;
      pretax  = Math.max(0, pretax  - fromPretax - rmd);
      roth    = Math.max(0, roth    - fromRoth);

      cash    = isNaN(cash)    ? 0 : cash;
      taxable = isNaN(taxable) ? 0 : taxable;
      pretax  = isNaN(pretax)  ? 0 : pretax;
      roth    = isNaN(roth)    ? 0 : roth;

      let finalMagiMC = taxResult.magi;

      if (p.rothConversionTarget && p.rothConversionTarget !== "off" && pretax > 1000) {
        const inflFactor = Math.pow(1 + taxInfl, Math.max(0, yr - CURRENT_YEAR));
        const irmaaRoomMC = irmaaTargetRoom(filingStatus, inflFactor, taxResult.magi || 0);
        const room = p.rothConversionTarget === "irmaa"
          ? irmaaRoomMC
          : Math.min(
              Math.max(0, getBracketCeiling(p.rothConversionTarget, filingStatus, inflFactor) - (taxResult.taxableIncome || 0)),
              irmaaOnMC ? irmaaRoomMC : Infinity,
            );
        if (room > 500) {
          let convAmt = Math.min(room, pretax);
          let lastWithConv = null;
          const withConvFor = (amt) => calcYearTax(
            age, yr, fromPretax, ss, effectiveAb + otherIncTaxable + ordinaryYieldMC, rmd, amt,
            p.twoHousehold || false, taxInfl, filingStatus, p.stateOfResidence || "NJ", realizedGainMC + qualifiedYieldMC, magiLookbackMC,
            spouseAgeAt(p, age)
          );
          const convTaxFor = (amt) => {
            if (!taxEnabled || amt <= 0) return 0;
            const withConv = withConvFor(amt);
            lastWithConv = withConv;
            return Math.max(0, withConv.totalTax - totalTax);
          };
          if (p.rothConversionTarget === "irmaa" || irmaaOnMC) {
            convAmt = shrinkToIrmaaCap(convAmt, (a) => withConvFor(a).magi, getIrmaaCeiling(1, filingStatus, inflFactor));
          }
          let convTax = convTaxFor(convAmt);

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
              pretax -= convAmt;
              roth   += Math.max(0, convAmt - convTax);
            } else {
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

      magiTwoYearsAgo = magiOneYearAgo;
      magiOneYearAgo = finalMagiMC;

      cash    = Math.max(0, cash    * (1 + cashRealReturn));
      pretax  = Math.max(0, pretax  * (1 + r));
      roth    = Math.max(0, roth    * (1 + r));
      taxable = Math.max(0, taxable * (1 + r));

      totalPort = pretax + roth + taxable + cash;
      path.push(Math.round(totalPort));
      if (rows) rows.push(rowOf(totalPort));

      if (totalPort <= 0 && survived) {
        survived = false;
        exhaustAge = age;
      }
    }
    while (path.length <= retYrs) path.push(0);
    gkStats.paths++;
    gkStats.cuts += pathCuts;
    gkStats.cutCounts.push(pathCuts);
    if (pathCuts > 0) gkStats.pathsWithCut++;
    if (pathRaise) gkStats.pathsWithRaise++;
    if (pathConstrained > 0) gkStats.pathsWithConstrained++;
    results.push({ path, survived, exhaustAge, portAtRetire, bracketOverrideYears, rothReserveBrokenYears });
    if (rows && !survived) failedRuns.push({ rows, exhaustAge, portAtRetire, path: i });
  }

  const pcts = [];
  for (let t = 0; t <= retYrs; t++) {
    const vals = results.map(r => r.path[t] ?? 0).sort((a, b) => a - b);
    const q = pct => vals[Math.floor(pct * (vals.length - 1))];
    const ageT = retAgeMC + t;
    const alive = results.filter(r => r.exhaustAge == null || r.exhaustAge > ageT).length / N;
    pcts.push({
      age: ageT,
      p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9),
      alive,
    });
  }
  const nS = results.filter(r => r.survived).length;
  const bracketOverrideRate = results.filter(r => r.bracketOverrideYears > 0).length / N;
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
  const termMean = tV.length ? Math.round(tV.reduce((s, v) => s + v, 0) / tV.length) : 0;
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
    gkStats: gkStats.paths > 0 ? {
      ...gkStats,
      spendMinReal: Number.isFinite(gkStats.spendMinReal) ? Math.round(gkStats.spendMinReal) : 0,
      spendMaxReal: Math.round(gkStats.spendMaxReal),
      cutRate: gkStats.pathsWithCut / gkStats.paths,
      raiseRate: gkStats.pathsWithRaise / gkStats.paths,
      avgCutsPerPath: gkStats.cuts / gkStats.paths,
      medianCutsPerPath: gkStats.cutCounts.length
        ? [...gkStats.cutCounts].sort((a, b) => a - b)[Math.floor(gkStats.cutCounts.length / 2)]
        : 0,
      avgCutsAmongCutters: gkStats.pathsWithCut > 0 ? gkStats.cuts / gkStats.pathsWithCut : 0,
      constrainedRate: gkStats.pathsWithConstrained / gkStats.paths,
      avgConstrainedPerPath: gkStats.constrained / gkStats.paths,
    } : null,
    pcts,
    medR,
    failures: failedRuns.length ? (() => {
      const s = [...failedRuns].sort((a, b) => a.exhaustAge - b.exhaustAge);
      return { count: s.length, worst: s[0], typical: s[s.length >> 1], closest: s[s.length - 1] };
    })() : null,
    term: { p10: qt(0.1), p25: qt(0.25), p50: qt(0.5), p75: qt(0.75), p90: qt(0.9), mean: termMean },
    N,
  };
}

function runStress(p, endAge, N = STRESS_PATHS, seed = 99) {
  return runMC(p, endAge, N, seed, true, SEQ_2000_2012);
}

function simulateDeterministicWithStrategy(p, inf, strategyArg) {
  const withdrawalStrategy = resolveStrategy(strategyArg ?? p.withdrawalStrategy);
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

  const retAgeDet = effectiveRetireAge(p.retireAge, p.currentAge);
  const glideSwitchAgeDet = resolveGlidepathSwitchAge({ ...p, retireAge: retAgeDet });
  const accYrs = Math.max(0, retAgeDet - p.currentAge);
  const preRetFlat = flatPreRetReturn(p);
  const planEndDet = planEndAgeOnPrimaryClock(p, p.endAge);
  const retYrs = planEndDet - retAgeDet;
  let port = Number.isFinite(p.port)
    ? p.port
    : (p.accounts || []).reduce((s, a) => s + (a.balance || 0), 0);

  for (let y = 0; y < accYrs; y++) {
    const ret = preRetFlat ?? expectedReturn(glidepathEqPct(p.currentAge + y, p.preRetireEq, p.postRetireEq, glideSwitchAgeDet)) / 100;
    const jcDet = jobContributionsForYear(p, p.currentAge + y);
    port = port * (1 + ret)
      + jcDet.pretax + jcDet.roth + (p.hsaContrib || 0)
      + (p.taxableContrib || 0);
    const evAccDet = computeCashFlowEvents(p.cashFlowEvents, CURRENT_YEAR + y, p.inf ?? 2.5, CURRENT_YEAR);
    if (evAccDet.inflow > 0) port += evAccDet.inflow;
  }

  const portAtRetire = port;
  let mortByYear = new Map();
  if (p.mortBalance > 0) {
    const ms = mortgageSchedule(p.mortBalance, p.mortRate ?? 6.5, p.mortStart || "2020-01", p.mortTerm || 30, p.mortExtra || 0);
    mortByYear = mortgageAnnualPayments(ms);
  }
  const gkFloor = p.gkFloor || GK_FLOOR_FALLBACK;
  const gkCeiling = p.gkCeiling || GK_CEILING_FALLBACK;
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
  const smartTaxByAge = new Map();
  try {
    const wf = buildWithdrawalWaterfall(p);
    for (const row of wf?.smart?.rows ?? []) {
      smartTaxByAge.set(row.age, {
        fedTax: row.fedTax || 0,
        stateTax: row.stateTax || 0,
        irmaa: row.irmaa || 0,
        totalTax: row.totalTax || 0,
        irmaaFull: row.irmaaFull || 0,
        earlyPenalty: row.earlyPenalty || 0,
      });
    }
  } catch { }

  const taxEnabled = p.tax !== false;

  const runPass = (taxByAge) => {
  let port = portAtRetire;
  let sp = p.sp;
  let lastReturn = 0;
  const schedule = [];
  const spByYear = [];

  for (let y = 0; y < retYrs; y++) {
    const age = retAgeDet + y;
    const yr = CURRENT_YEAR + (age - p.currentAge);
    const ret = expectedReturn(glidepathEqPct(age, p.preRetireEq, p.postRetireEq, glideSwitchAgeDet)) / 100;
    const inflY = inf / 100;
    const cumInfl = Math.pow(1 + inflY, y);
    const adjFloor = gkFloor * cumInfl;
    const adjCeiling = gkCeiling * cumInfl;

    const ss = computeHouseholdSS(p, age);
    const growthFactor = Math.pow(1 + (p.abGrowth ?? 3)/100, Math.min(y, 20));
    const rawAb = Math.round(((p.ab > 0 ? p.ab : 0) + (p.propIncome || 0)) * growthFactor);
    const ab = (p.abEndYear && yr > p.abEndYear) ? 0 : rawAb;
    const { total: otherIncTotal } = computeOtherIncome(p.otherIncomes, yr);

    let housingCost = 0;
    if ((p.housingType || "own") === "own") {
      housingCost = mortByYear.get(yr) || 0;
    } else if (p.housingType === "rent") {
      housingCost = Math.round((p.annualRent || 0) * cumInfl);
    }
    const carveoutCost = (p.carveouts || []).reduce((sum, c) => {
      return sum + (yr <= (c.endYear || 9999) ? Math.round((c.annual || 0) * cumInfl) : 0);
    }, 0);

    const evDet = computeCashFlowEvents(p.cashFlowEvents, yr, p.inf ?? 2.5, CURRENT_YEAR);
    const eventCostDet = evDet.total;
    if (evDet.inflow > 0) port += evDet.inflow;

    const hcRiskDet = expectedHealthcareShock(age, p, cumInfl);

    const gkIncomeOffset = ss + ab + otherIncTotal;
    const gkFixedCosts = housingCost + carveoutCost + evDet.committed;

    let gkEvent = null;
    const spEntering = sp;

    if (p.spSchedule && p.spSchedule.length) {
      sp = scheduleSpendForYear(p.spSchedule, yr, p.inf ?? 2.5);
    } else if (y === 0) {
    } else {
      if (withdrawalStrategy === "gk") {
        const refWRd = gkReferenceWR({ plannedSpend: p.sp, cumInfl, incomeOffset: gkIncomeOffset, fixedCosts: gkFixedCosts, portAtRetire });
        gkEvent = {};
        sp = guytonKlingerWithdrawal(port, refWRd, sp, lastReturn, inflY, adjFloor, adjCeiling, p.endAge - age, gkIncomeOffset, gkFixedCosts, gkEvent);
      }
      else if (withdrawalStrategy === "fixed") {
        const fixedRate = p.fixedWithdrawalRate ?? 0.04;
        sp = port * fixedRate;
      }
      else if (withdrawalStrategy === "vpw") {
        const rVPW = p.vpwRealReturn ?? 0.0376;
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
        sp = sp * (1 + inflY);
      }
      else if (withdrawalStrategy === "smart") {
        const yrsRemaining = p.endAge - age;
        if (yrsRemaining > 15) {
          const refWRd2 = gkReferenceWR({ plannedSpend: p.sp, cumInfl, incomeOffset: gkIncomeOffset, fixedCosts: gkFixedCosts, portAtRetire });
          sp = guytonKlingerWithdrawal(port, refWRd2, sp, lastReturn, inflY, adjFloor, adjCeiling, yrsRemaining, gkIncomeOffset, gkFixedCosts);
        } else {
          sp = sp * (1 + inflY);
        }
      }
      else {
        sp = sp * (1 + inflY);
      }
    }
    lastReturn = ret;

    const spSmiledDet = sp * spendingSmileFactor(age, retAgeDet, p.smile !== false);
    const need = Math.max(0, spSmiledDet - ss - ab - otherIncTotal) + housingCost + carveoutCost + eventCostDet;
    const incomeSurplusDet = Math.max(0,
      (ss + ab + otherIncTotal) - (spSmiledDet + housingCost + carveoutCost + eventCostDet));

    const wfTax = taxByAge.get(age);
    const taxResult = wfTax ?? calcYearTax(age, yr, need, ss, ab, 0, 0, p.twoHousehold || false, inflY, filingStatusAt(p, age), p.stateOfResidence || "NJ", 0, null, spouseAgeAt(p, age));
    const totalTax = taxEnabled ? taxResult.totalTax : 0;
    const fundedTax = taxEnabled
      ? (wfTax ? (wfTax.irmaaFull + wfTax.earlyPenalty) : taxResult.totalTax)
      : 0;
    const totalDraw = need + fundedTax;
    port = Math.max(0, port - totalDraw + incomeSurplusDet) * (1 + ret);

    spByYear.push({ year: yr, amount: Math.round(sp) });

    schedule.push({
      age, yr,
      spending: Math.round(spSmiledDet),
      spEntering: Math.round(spEntering),
      spAfterGK: Math.round(sp),
      gkEvent: gkEvent ? gkEvent.event : null,
      gkReason: gkEvent ? gkEvent.reason : null,
      gkWR: gkEvent && gkEvent.currentWR != null ? gkEvent.currentWR : null,
      gkFloor: Math.round(adjFloor),
      gkCeiling: Math.round(adjCeiling),
      ss, Rental: ab, OtherIncome: Math.round(otherIncTotal),
      portfolioDraw: Math.round(need),
      housingCost: Math.round(housingCost),
      carveoutCost: Math.round(carveoutCost),
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

  const pass1 = runPass(smartTaxByAge);

  if (p.spSchedule && p.spSchedule.length) {
    return { schedule: pass1.schedule, portAtRetire: Math.round(portAtRetire), initWR };
  }

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
        irmaaFull: row.irmaaFull || 0,
        earlyPenalty: row.earlyPenalty || 0,
      });
    }
    if (taxByAge2.size > 0) pass2 = runPass(taxByAge2);
  } catch { }

  const finalSchedule = (pass2?.schedule?.length ? pass2 : pass1).schedule;
  return { schedule: finalSchedule, portAtRetire: Math.round(portAtRetire), initWR, spByYear: pass1.spByYear };
}

function waterfallForActiveStrategy(p) {
  const strategy = resolveStrategy(p?.withdrawalStrategy);
  if (strategy === "smart" || (p?.spSchedule && p.spSchedule.length)) {
    return buildWithdrawalWaterfall(p);
  }
  const det = simulateDeterministicWithStrategy(p, p?.inf ?? 2.5, strategy);
  if (!det?.spByYear?.length) return buildWithdrawalWaterfall(p);
  return buildWithdrawalWaterfall({ ...p, spSchedule: det.spByYear });
}

const FED_BRACKETS_2026_MFJ = [
  { lo: 0,       hi: 24800,  rate: 0.10 },
  { lo: 24800,   hi: 100800, rate: 0.12 },
  { lo: 100800,  hi: 211400, rate: 0.22 },
  { lo: 211400,  hi: 403550, rate: 0.24 },
  { lo: 403550,  hi: 512450, rate: 0.32 },
  { lo: 512450,  hi: 768700, rate: 0.35 },
  { lo: 768700,  hi: Infinity, rate: 0.37 },
];
const FED_BRACKETS_2026_SINGLE = [
  { lo: 0,      hi: 12400,  rate: 0.10 },
  { lo: 12400,  hi: 50400,  rate: 0.12 },
  { lo: 50400,  hi: 105700, rate: 0.22 },
  { lo: 105700, hi: 201800, rate: 0.24 },
  { lo: 201800, hi: 256225, rate: 0.32 },
  { lo: 256225, hi: 640600, rate: 0.35 },
  { lo: 640600, hi: Infinity, rate: 0.37 },
];

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
function irmaaCost(magi, yr, infR = 0.025, isMFJ = true, beneficiaries = null) {
  const { rows: T, baseYear } = irmaaTableFor(yr);
  const f = Math.pow(1 + (isNaN(infR) ? 0.025 : infR), yr - baseYear);
  const n = beneficiaries != null ? Math.max(0, beneficiaries) : (isMFJ ? 2 : 1);
  if (n === 0) return 0;
  for (let i = T.length - 1; i >= 0; i--) {
    const thresh = isMFJ ? T[i].m
      : (i === T.length - 1 ? 500_000 : T[i].m / 2);
    const cost = (T[i].f / 2) * n;
    if (i === T.length - 1 ? magi >= thresh * f : magi > thresh * f) return Math.round(cost * f);
  }
  return 0;
}

const ROTH_BASE_YEAR = new Date().getFullYear();

function getRmdStartAge({ dob, birthYear, currentAge } = {}) {
  let by = null;
  if (typeof birthYear === "number" && birthYear > 0) by = birthYear;
  else if (typeof dob === "string" && dob.length >= 4) {
    const y = parseInt(dob.slice(0, 4), 10);
    if (!isNaN(y)) by = y;
  } else if (typeof currentAge === "number" && currentAge > 0) {
    by = ROTH_BASE_YEAR - currentAge;
  }
  if (by === null) return 73;
  if (by >= 1960) return 75;
  if (by >= 1951) return 73;
  return 72;
}

function SectionDisclaimer({ children, summary }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      role="note"
      style={{
        fontSize: "var(--fs-small)",
        lineHeight: 1.55,
        color: "var(--text-muted)",
        background: "rgba(251,191,36,0.04)",
        border: "1px solid rgba(251,191,36,0.16)",
        borderLeft: "2px solid rgba(251,191,36,0.55)",
        borderRadius: 7,
        padding: "6px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ minWidth: 0 }}>
          <strong style={{ color: "#fbbf24" }}>Not financial advice.</strong>{" "}
          {summary || "Hypothetical model projections, not predictions. Consult a licensed professional before acting."}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: "#fbbf24", fontSize: "var(--fs-small)", fontWeight: 700, fontFamily: "var(--font-sans)",
            whiteSpace: "nowrap", textDecoration: "underline", textUnderlineOffset: 2,
          }}
        >
          {open ? "Hide full disclosure ▴" : "Full disclosure ▾"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid rgba(251,191,36,0.16)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

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

function InfoDot({ title, heading = "What this means", size = 14, color = "var(--text-secondary)", hoverColor = "var(--text-primary)" }) {
  const [hover, setHover] = useState(false);
  return (
    <InfoModal
      title={heading}
      trigger={
        <span
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: size + 6, height: size + 6, borderRadius: "50%",
            background: hover ? "var(--tint-white-15)" : "var(--card-border)",
            color: hover ? hoverColor : color,
            cursor: "pointer", transition: "background 0.15s, color 0.15s",
          }}
        >
          <InfoIcon size={size} />
        </span>
      }
    >
      <div style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.7 }}>{title}</div>
    </InfoModal>
  );
}

const STRATEGY_HOW_IT_WORKS = {
  gk: "Guyton‑Klinger guardrails — Every year, if the current withdrawal rate exceeds 120% of the initial rate, spending cuts 10% (never below floor). If it falls below 80%, spending increases 10% (never above ceiling).",
  fixed: "Fixed Percentage — You withdraw a constant percentage of the current portfolio each year, automatically adjusting with market value.",
  vpw: "Variable Percentage Withdrawal (VPW) — Spending is recalculated annually as the portfolio amortized over your remaining years, so the plan is designed to spend down to roughly zero by your plan-to age.",
  ninety_five_rule: "95% Rule — Spending can drop to 95% of last year's amount during downturns, otherwise tracks inflation.",
  bengen: "Bengen 4% Rule — Spend your planned annual amount in year one, then increase that dollar amount with inflation every year after (the \"4%\" is the rule's name, not a rate applied to your portfolio). Spending never reacts to portfolio performance, for better or worse — an honest model of late-stage risk for fixed-budget retirees.",
  smart: "Smart Waterfall (hybrid) — Guyton‑Klinger guardrails while more than 15 years remain in the plan, then switches to the Bengen 4% Rule for the final 15 years — the split matches GK's own longevity-safety-brake threshold, so the switch happens exactly where GK's brake would otherwise be disabled."
};

function SimMethodModal({ params, withdrawalStrategy, strategyHowItWorks = STRATEGY_HOW_IT_WORKS, trigger }) {
  const strat = resolveStrategy(withdrawalStrategy);
  const pool = useMemo(() => {
    const eq = SP500.map((v) => v * 100);
    const infl = INFL.map((v) => (v ?? 0) * 100);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    return {
      years: SP500.length,
      eqAvg: mean(eq),
      eqBest: Math.max(...eq),
      eqWorst: Math.min(...eq),
      downPct: Math.round((eq.filter((v) => v < 0).length / eq.length) * 100),
      inflAvg: mean(infl),
    };
  }, []);
  return (
    <InfoModal
      title="Chance of Success — How This Simulation Works"
      accent={INFO_ACCENT.method}
      maxWidth={640}
      bodyMaxHeight="72vh"
      trigger={trigger}
    >
      <div>
        <div>
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>What is Chance of Success?</div>
          <div style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            It runs your plan through <strong style={{ color: "var(--text-primary)" }}>{MC_PATHS_LABEL} Monte Carlo simulations</strong>. For <em>every year</em> of your retirement, each path draws a <strong style={{ color: "var(--text-primary)" }}>random</strong> year from <strong style={{ color: "var(--text-primary)" }}>{SAMPLE_YEARS} years of real market history (1928–2025)</strong> and applies that year’s actual S&amp;P 500 return, 10-year Treasury return, and inflation <em>together</em> — so the real correlation between them survives (e.g. 2008’s −36.6% stocks paired with its +20.1% bond rally).
          </div>
          <div style={{ marginTop: 8, fontSize: "var(--fs-label)", color: "var(--text-muted)", lineHeight: 1.65 }}>
            Years are drawn <strong style={{ color: "var(--text-secondary)" }}>with replacement</strong> and the <strong style={{ color: "var(--text-secondary)" }}>order is reshuffled on every path</strong> — so 2008 might strike twice in one run and never in another. This is a bootstrap of history into thousands of <em>plausible</em> futures, <strong style={{ color: "var(--text-secondary)" }}>not a replay of one past sequence in calendar order</strong>.
          </div>
          <div style={{ marginTop: 10, fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            A path “succeeds” if the portfolio still has money at age {params.endAge}. The success rate is the share of paths that survive. <strong style={{ color: "var(--accent-teal)" }}>Above {Math.round(MC_SOLID_PLAN_RATE * 100)}% is generally considered a solid plan.</strong>
          </div>
          <div style={{ marginTop: 10, fontSize: "var(--fs-label)", color: "var(--text-muted)", lineHeight: 1.6 }}>
            AiRA also applies <strong style={{ color: "var(--accent-gold)" }}>{getStrategyDescription(withdrawalStrategy)}</strong>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14, fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <div><div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 3 }}>1. Accumulation (ages {params.currentAge}–{params.retireAge})</div>Each path draws a random paired S&amp;P 500 + bond year, blended by glide path. Contributions added annually.</div>
            <div><div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 3 }}>2. Retirement spending</div>Fresh random returns each year. {params.smile !== false ? "Blanchett smile curve." : "Flat real spending."} SS{params.ab > 0 ? " and rental" : ""} income offsets draws.</div>
            <div><div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 3 }}>3. {getStrategyLabel(strat)} {strat === "gk" ? "guardrails" : "strategy"}</div>{strategyHowItWorks[strat] || strategyHowItWorks.gk}</div>
            <div><div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 3 }}>4. Survival check</div>Balance above $0 through age {params.endAge} = success. The fan chart shows the 10th–90th percentile spread.</div>
          </div>
          <div style={{ marginTop: 14, background: "var(--tint-teal-600-08)", border: "1px solid var(--tint-teal-600-25)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--accent-teal)", marginBottom: 6 }}>Why this beats a single projection</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <li>Built on real historical market performance, not a guessed average</li>
              <li>Reports a probability and a range, not one false-precision number</li>
              <li>Captures sequence-of-returns risk — the order of good and bad years</li>
              <li>Surfaces both best-case and worst-case outcomes</li>
            </ul>
          </div>
          <div style={{ marginTop: 12, fontSize: "var(--fs-small)", color: "var(--text-faint)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text-muted)" }}>Data source:</strong> Aswath Damodaran’s historical returns dataset (S&amp;P 500, 10-year U.S. Treasury, CPI-U), 1928–2025, paired by calendar year. No winsorization — real tail years (1931, 2008, 2022) are kept.
          </div>
        </div>
        <div style={{ marginTop: 16, background: "var(--row-highlight)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>What the simulation draws from</div>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.55 }}>
            The pool of <strong style={{ color: "var(--text-secondary)" }}>{pool.years} real market years (1928–2025)</strong>. Each simulated year picks one at random — <strong style={{ color: "var(--text-secondary)" }}>the past won’t repeat in order</strong>, so we reshuffle history, we don’t replay it.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 10 }}>
            {[
              ["Avg stock year", `${pool.eqAvg >= 0 ? "+" : ""}${pool.eqAvg.toFixed(1)}%`, "var(--accent-teal)"],
              ["Best / worst", `+${pool.eqBest.toFixed(0)}% / ${pool.eqWorst.toFixed(0)}%`, "var(--text-secondary)"],
              ["Down years", `${pool.downPct}% of ${pool.years}`, "var(--chart-1)"],
              ["Avg inflation", `${pool.inflAvg.toFixed(1)}%`, "var(--accent-gold)"],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: c, fontFamily: "var(--font-mono)" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </InfoModal>
  );
}

const fmtDollar = (v) => `$${Math.round(v).toLocaleString()}`;
const MAX_MONEY_INPUT = 1_000_000_000;
const MONEY_AXIS_WIDTH = 92;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;

const Dot = ({ tone = "info" }) => <span className={`dot dot-${tone}`} aria-hidden="true" />;

export const withAlpha = (color, hexAlpha) => {
  if (typeof color !== "string" || !color.includes("var(")) return `${color}${hexAlpha}`;
  const pct = Math.round((parseInt(hexAlpha, 16) / 255) * 1000) / 10;
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
};

export const ACCOUNT_CATEGORIES = [
  { key: "pretax",  label: "Pre-Tax",        color: "#0ea5e9", defaultName: "401(k)" },
  { key: "roth",    label: "Roth",           color: "var(--accent-purple)", defaultName: "Roth IRA" },
  { key: "taxable", label: "Taxable",        color: "var(--accent-gold)", defaultName: "Brokerage" },
  { key: "hsa",     label: "HSA",            color: "var(--positive)", defaultName: "HSA" },
  { key: "cash",    label: "Cash / Savings", color: "var(--text-secondary)", defaultName: "Savings" },
];

function AllocationDonut({ accounts, onEdit }) {
  const data = ACCOUNT_CATEGORIES
    .map((c) => ({ ...c, value: (accounts || []).filter((a) => a.category === c.key).reduce((s, a) => s + (a.balance || 0), 0) }))
    .filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  let acc = 0;
  const stops = data.map((d) => {
    const start = (acc / total) * 360;
    acc += d.value;
    const end = (acc / total) * 360;
    return `${d.color} ${start}deg ${end}deg`;
  }).join(", ");
  const ringMask = "radial-gradient(circle, transparent 33px, #000 34px)";
  const Ring = onEdit ? "button" : "div";
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--tint-white-06)" }}>
      <h2 style={{ margin: "0 0 6px", fontWeight: 400, fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
        Tax Treatment
      </h2>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Ring
          {...(onEdit ? { type: "button", className: "donut-btn", onClick: onEdit, "aria-label": "Edit account split" } : { style: { flexShrink: 0 } })}
          title={data.map((d) => `${d.label}: ${fmtDollar(d.value)} (${((d.value / total) * 100).toFixed(0)}%)`).join("\n")}
        >
          <span
            style={{
              display: "block", width: 84, height: 84, borderRadius: "50%",
              background: `conic-gradient(${stops})`,
              WebkitMask: ringMask, mask: ringMask,
            }}
          />
        </Ring>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          {data.map((d) => (
            <div key={d.key} title={`${d.label}: ${fmtDollar(d.value)}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--fs-small)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-secondary)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                {d.label}
              </span>
              <span style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace" }}>
                {((d.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function parseNumericEntry(text) {
  const cleaned = String(text).trim().replace(/[$,%\s]/g, "");
  if (!cleaned) return null;
  const suffix = /[mk]$/i.test(cleaned);
  const mult = suffix ? (/m$/i.test(cleaned) ? 1e6 : 1e3) : 1;
  const n = Number(suffix ? cleaned.slice(0, -1) : cleaned);
  return Number.isFinite(n) ? n * mult : null;
}
function parseMoneyInput(text, min) {
  const n = parseNumericEntry(text);
  return n === null ? null : Math.max(min, Math.round(n));
}
export function getAnalogues(rate) {
  const pct = rate * 100;
  const first = ANALOGUES.find((a) => pct >= a.min) || ANALOGUES[ANALOGUES.length - 1];
  return ANALOGUES.filter((a) => a.min === first.min);
}

function getAnalogue(rate) {
  return getAnalogues(rate)[0];
}

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
            <span key={i} style={{ color: i === idx % pool.length ? "var(--text-secondary)" : "#334155", fontSize: "var(--fs-small)", marginRight: 3 }}>●</span>
          ))}
        </span>
      )}
    </div>
  );
}

function MCBandTable({ pcts, inf, useReal, ssAge, rmdAge, currentAge, endAge, hoveredAge, onHoverAge, totalPaths, retireAge, landmarkOnly = false, embedded = false }) {
  const [show, setShow] = useState(embedded);
  const [showExplainer, setShowExplainer] = useState(false);
  const data = useMemo(() => deflate(pcts, inf, useReal), [pcts, inf, useReal]);
  if (!data || data.length === 0) return null;
  const rows = useMemo(() => {
    if (!landmarkOnly) return data;
    const keep = new Set([data[0]?.age, data[data.length - 1]?.age, retireAge, ssAge, rmdAge, 60, 65, 70, 75, 80, 85].filter((a) => a != null));
    const picked = data.filter((d) => keep.has(d.age));
    return picked.length ? picked : [data[0], data[data.length - 1]].filter(Boolean);
  }, [data, landmarkOnly, retireAge, ssAge, rmdAge]);
  const fundedColor = (a) => rateColor(a ?? 1);
  return (
    <div className={embedded ? undefined : "chart-card"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: show || showExplainer ? 8 : 0, flexWrap: "wrap", gap: 6 }}>
        <div className="ct" style={{ marginBottom: 0 }}>
          Age-by-Age Projection Bands · {dollarBasisLabel(useReal, retirementBasisYear(currentAge, retireAge, CURRENT_YEAR))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setShowExplainer(!showExplainer)}
            className="mbtn"
            style={{ fontSize: "var(--fs-label)", padding: "3px 8px" }}
          >
            ℹ️ What do these numbers mean?
          </button>
          {!embedded && (
            <button onClick={() => setShow(!show)} className="mbtn" style={{ fontSize: "var(--fs-label)", padding: "3px 8px" }}>
              {show ? "Hide Table" : "Show Table"}
            </button>
          )}
        </div>
      </div>
      {showExplainer && (
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.6, background: "var(--card-bg)", border: "1px solid var(--tint-white-08)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
          <strong style={{ color: "var(--text-secondary)" }}>Still Funded</strong> is the share of simulated retirement
          histories where your accounts still had money at that age — not a literal forecast, and not a
          chance of zero income. Social Security, rental, and pension income keep paying even in "failed"
          paths; a failure just means living on those guaranteed streams alone from that age onward.
          Read Still Funded together with the <strong style={{ color: "var(--text-secondary)" }}>10th percentile</strong> column
          for fragility: a high Still Funded % paired with a thin 10th percentile is one bad market
          sequence away from joining the failures, while a high 10th percentile means real margin.
          <br /><br />
          Full explanation: Help → Reading the Charts → "What does Still Funded % actually mean?"
        </div>
      )}
      {show && (
        <>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", margin: "6px 0 8px", lineHeight: 1.5 }}>
            {landmarkOnly
              ? "Landmark ages only — your retirement, Social Security claim, Medicare, first RMD and the decade markers inside your horizon. "
              : "Each row is one age from the fan chart above: "}
            The percentile spread of{" "}
            <strong style={{ color: "var(--text-secondary)" }}>
              {totalPaths ? totalPaths.toLocaleString() : MC_PATHS_LABEL}
            </strong>{" "}
            simulated portfolios and the share of paths still funded. 10th %ile = pessimistic (90% of outcomes were better);
            90th %ile = optimistic.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="nw-table" style={{ fontSize: "var(--fs-label)" }}>
              <thead>
                <tr>
                  <th>Age</th><th>Year</th>
                  <ThInfo tip={"Share of simulated paths whose portfolio has not run out by this age"}>Still Funded</ThInfo>
                  <ThInfo tip={`How many of the ${totalPaths ? totalPaths.toLocaleString() : "simulated"} paths are still funded at this age — the same share as the column to its left, shown as a count`}>Success Count</ThInfo>
                  <ThInfo tip={"Pre-Retirement = ages before you stop working; Retirement = the drawdown years. Your portfolio is still being added to in the first phase, so a low figure there means something different."}>Phase</ThInfo>
                  <ThInfo tip={"Pessimistic — 90% of simulated outcomes were better than this"}>10th %ile</ThInfo>
                  <th>25th %ile</th>
                  <ThInfo tip={"The median outcome — half of paths above, half below"}>Median</ThInfo>
                  <th>75th %ile</th>
                  <ThInfo tip={"Optimistic — only 10% of simulated outcomes were better than this"}>90th %ile</ThInfo>
                </tr>
              </thead>
              <tbody>
                {rows.map((d, i) => {
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
                          ? "var(--tint-sky-06)"
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
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ color: fundedColor(d.alive ?? 1) }}>
                          {d.alive != null ? `${(d.alive * 100).toFixed(1)}%` : "—"}
                        </span>
                        {d.alive != null && (
                          <span style={{ marginLeft: 6, fontSize: "var(--fs-small)", fontWeight: 700, color: fundedColor(d.alive), border: `1px solid ${withAlpha(fundedColor(d.alive), "44")}`, borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" }}>
                            {bandLabel(d.alive)}
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {d.alive != null && totalPaths ? `${Math.round(d.alive * totalPaths).toLocaleString()}/${totalPaths.toLocaleString()}` : "—"}
                      </td>
                      <td style={{ textAlign: "left", color: "var(--text-muted)", whiteSpace: "nowrap", fontSize: "var(--fs-small)" }}>
                        {retireAge != null && d.age != null ? (d.age < retireAge ? "Pre-Retirement" : "Retirement") : "—"}
                      </td>
                      <td style={{ color: "var(--chart-1)" }}>{fmtDollar(d.p10)}</td>
                      <td style={{ color: "var(--accent-gold)" }}>{fmtDollar(d.p25)}</td>
                      <td style={{ color: "var(--accent-teal)", fontWeight: 700 }}>{fmtDollar(d.p50)}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{fmtDollar(d.p75)}</td>
                      <td style={{ color: "var(--positive)" }}>{fmtDollar(d.p90)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center", marginTop: 8, fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
            <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Still Funded:</span>
            {[
              { label: "Excellent", at: MC_BAND_LOW_RISK },
              { label: "Good", at: MC_BAND_MODERATE },
              { label: "Concerning", at: MC_BAND_ELEVATED },
            ].map(({ label, at }) => (
              <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: rateColor(at) }} />
                {label} ({Math.round(at * 100)}%+)
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: rateColor(0) }} />
              Critical (below {Math.round(MC_BAND_ELEVATED * 100)}%)
            </span>
            <span style={{ color: "var(--text-faint)" }}>· 🏛️ Social Security starts · 📋 RMDs begin</span>
          </div>
        </>
      )}
    </div>
  );
}

const SECTORS = [
  {
    n: "Sector 1: The Escape",
    color: "var(--negative)",
    range: "Before age 59½",
    active: (age) => age < 59.5,
    desc: (
      <>
        <ModalLede>The pre-59½ penalty zone — the years you have to bridge before tax-deferred money is reachable without a penalty.</ModalLede>
        <ModalP>
          Withdrawals from <Em>Traditional 401(k) / IRA</Em> accounts before 59½ trigger a
          {" "}<Em color="var(--negative)">10% early-withdrawal penalty</Em> on top of ordinary income tax.
          The play is to <Em>escape</Em> to 59½ by living on your taxable brokerage, cash
          reserves, and Roth contributions — or a structured <Em>72(t) / SEPP</Em> — without
          touching the penalized accounts.
        </ModalP>
        <ModalNote accent="var(--negative)">
          This is the highest sequence-of-returns risk window: an early market drop lands while
          the portfolio is largest and no penalty-free lever is available yet.
        </ModalNote>
      </>
    ),
  },
  {
    n: "Sector 2: The Gap",
    color: "#0ea5e9",
    range: "Age 59½ – 65",
    active: (age) => age >= 59.5 && age < 65,
    desc: (
      <>
        <ModalLede>Penalty-free withdrawals unlock, but Social Security, Medicare, and RMDs haven't started yet.</ModalLede>
        <ModalP>
          These are the <Em>gap years</Em>: the 10% penalty is gone, income is often at its
          lowest, and you're still before the 2-year <Em>IRMAA lookback</Em> that sets Medicare
          premiums at 65. Typically the cleanest, lowest-bracket window for
          {" "}<Em color="var(--accent-purple)">Roth conversions</Em>.
        </ModalP>
      </>
    ),
  },
  {
    n: "Sector 3: The Maneuver",
    color: "var(--accent-gold)",
    range: "Age 65 – 73",
    active: (age) => age >= 65 && age < 73,
    desc: (
      <>
        <ModalLede>Medicare and Social Security are live; required distributions still aren't. Your last window to steer income.</ModalLede>
        <ModalP>
          Medicare starts at 65, so <Em color="var(--accent-purple)">IRMAA tiers</Em> now drive
          your premiums; Social Security may have begun. But <Em>RMDs haven't started</Em>, so this
          is the window to finish conversions and maneuver taxable income before distributions
          become mandatory.
        </ModalP>
      </>
    ),
  },
  {
    n: "Sector 4: The Torpedo",
    color: "var(--chart-7)",
    range: "Age 73 – 80",
    active: (age) => age >= 73 && age < 80,
    desc: (
      <>
        <ModalLede>The tax torpedo: Required Minimum Distributions begin whether you need the money or not.</ModalLede>
        <ModalP>
          <Em color="var(--chart-7)">RMDs</Em> start at age 73 (SECURE 2.0), forcing taxable withdrawals
          from tax-deferred accounts on the IRS schedule. Those forced distributions can push you
          into a higher bracket and a higher <Em color="var(--accent-purple)">IRMAA tier</Em> —
          the "torpedo" that a large un-converted balance sets off.
        </ModalP>
      </>
    ),
  },
  {
    n: "Sector 5: Legacy",
    color: "var(--accent-purple)",
    range: "Age 80+",
    active: (age) => age >= 80,
    desc: (
      <>
        <ModalLede>The wealth-transfer phase — the focus shifts from your spend to what passes to heirs.</ModalLede>
        <ModalP>
          RMDs are ongoing; planning turns to estate efficiency and beneficiary tax treatment —
          the <Em>10-year inherited-IRA rule</Em> that governs how fast heirs must draw down what
          they receive.
        </ModalP>
      </>
    ),
  },
];

function SectorBadge({ age }) {
  const cur = SECTORS.find((s) => s.active(age)) || SECTORS[0];
  return (
    <InfoModal
      title="Life-phase sectors"
      accent={cur.color}
      maxWidth={460}
      bodyMaxHeight="60vh"
      trigger={
        <span
          title="Tap or click to learn about this retirement phase"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: `${withAlpha(cur.color, "18")}`,
            border: `1px solid ${withAlpha(cur.color, "44")}`,
            borderRadius: 12,
            padding: "2px 10px",
            fontSize: "var(--fs-small)",
            color: cur.color,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {cur.n} <InfoIcon size={11} />
        </span>
      }
    >
      <ModalP>
        AiRA splits the retirement horizon into <Em>five sectors</Em> — each a distinct tax-and-access
        regime. Your current phase is highlighted below.
      </ModalP>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {SECTORS.map((s) => {
          const isCur = s.n === cur.n;
          return (
            <div
              key={s.n}
              style={{
                border: `1px solid ${withAlpha(s.color, isCur ? "66" : "22")}`,
                borderLeft: `3px solid ${s.color}`,
                background: withAlpha(s.color, isCur ? "14" : "08"),
                borderRadius: 8,
                padding: "10px 12px",
                opacity: isCur ? 1 : 0.85,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minWidth: 0, flex: "1 1 auto" }}>
                  <span style={{ fontSize: "var(--fs-label)", fontWeight: 800, color: s.color }}>{s.n}</span>
                  {isCur && (
                    <span style={{ fontSize: "var(--fs-small)", fontWeight: 800, letterSpacing: 0.4,
                      color: s.color, background: withAlpha(s.color, "22"), border: `1px solid ${withAlpha(s.color, "55")}`,
                      borderRadius: 999, padding: "1px 7px", lineHeight: 1.55, whiteSpace: "nowrap" }}>You are here</span>
                  )}
                </span>
                <span style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>{s.range}</span>
              </div>
              {s.desc}
            </div>
          );
        })}
      </div>
    </InfoModal>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  /* Design tokens — single source for the palette. Reference as var(--x) in
     both CSS rules and inline styles (style={{ color: "var(--text-muted)" }}).
     Added semantic-status tokens, a spacing scale, a --accent-ai alias
     (purple, promoted from an ambient chart color into a named AI-branding
     role), and a --divider token. Dark theme only; the light override block was removed (see git history).
  */
  :root {
    /* Deep neutral ink (less blue-cast), one indigo trust anchor,
       teal/gold/violet held to strict semantic roles. */
    /* ── Type system ──────────────────────────────────────────────────────
       'Inter' and 'JetBrains Mono' were declared all over this stylesheet but
       NEVER loaded: there is no @font-face here and no webfont <link> in
       public/index.html, so every one of those declarations silently fell
       through to the browser default (Arial/Segoe on Windows, Times-adjacent
       metrics in some embeds) while the app looked like it had a chosen face.
       Rather than add a third-party font request — this app's whole pitch is
       that your data stays on your machine, and a Google Fonts call hands
       every visitor's IP to a third party — the stacks below name the best
       SYSTEM faces in preference order. Inter is still first, so anyone who
       has it installed gets it.
       Tabular numerals are on globally: retirement figures are compared
       column-to-column, and proportional digits make an aligned column of
       dollars look ragged. */
    --font-sans: Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans',
                 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono',
                 'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Liberation Mono',
                 Menlo, monospace;
    --bg-base: #0e1218;
    --bg-hdr: rgba(14,18,24,0.96);
    --card-bg: #151b24;
    --card-bg-raised: #1b222d;
    --card-border: #2a3646;
    --divider: #243040;
    --card-shadow: none;
    --text-primary: #e8edf5;
    --text-secondary: #c0c9d6;
    --text-muted: #9aa6ba;  /* 5.3:1 on card (was 3.5) */
    --text-faint: #8793a7;  /* 4.8:1 on card (was 1.95) */
    --accent: #7ab8f5;
    --accent-teal: #7ab8f5;
    --accent-purple: #b4bac4;
    --accent-ai: #b4bac4;
    --accent-gold: #f4d35e;
    --positive: #4fd88f;
    --negative: #ff7b72;
    /* Semantic status backgrounds — accent hue at 8-10% alpha, recomputed off
       the palette so a theme flip re-tints them correctly. */
    --bg-info:     rgba(122,184,245,0.12);
    --bg-success:  rgba(79,216,143,0.12);
    --bg-warning:  rgba(244,211,94,0.13);
    --bg-danger:   rgba(255,111,122,0.13);
    /* Neutral and status tints, one token per base colour and alpha. */
    --tint-amber-07: rgba(251,191,36,0.07);
    --tint-amber-08: rgba(251,191,36,0.08);
    --tint-amber-35: rgba(251,191,36,0.35);
    --tint-black-40: rgba(0,0,0,0.4);
    --tint-black-50: rgba(0,0,0,0.5);
    --tint-black-60: rgba(0,0,0,0.6);
    --tint-black-70: rgba(0,0,0,0.7);
    --tint-black-80: rgba(0,0,0,0.8);
    --tint-green-05: rgba(52,211,153,0.05);
    --tint-green-07: rgba(52,211,153,0.07);
    --tint-red-05: rgba(255,111,122,0.05);
    --tint-red-07: rgba(255,111,122,0.07);
    --tint-red-08: rgba(255,111,122,0.08);
    --tint-red-15: rgba(255,111,122,0.15);
    --tint-red-20: rgba(255,111,122,0.2);
    --tint-red-25: rgba(255,111,122,0.25);
    --tint-red-30: rgba(255,111,122,0.3);
    --tint-sky-06: rgba(90,209,240,0.06);
    --tint-sky-07: rgba(90,209,240,0.07);
    --tint-sky-20: rgba(90,209,240,0.2);
    --tint-sky-25: rgba(90,209,240,0.25);
    --tint-sky-30: rgba(90,209,240,0.3);
    --tint-sky-45: rgba(90,209,240,0.45);
    /* Data palette: one name per chart and category colour. */
    --chart-1: #ff6f7a;
    --chart-2: #6c9bff;
    --chart-3: #fb923c;
    --chart-4: #818cf8;
    --chart-5: #22d3ee;
    --chart-6: #f5a623;
    --chart-7: #f97316;
    --chart-8: #6366f1;
    --chart-9: #8b5cf6;
    --chart-10: #3b82f6;
    --chart-11: #a9d1ac;
    --tint-indigo-05: rgba(99,102,241,0.05);
    --tint-indigo-15: rgba(99,102,241,0.15);
    --tint-indigo-20: rgba(99,102,241,0.2);
    --tint-indigo-30: rgba(99,102,241,0.3);
    --tint-indigo-40: rgba(99,102,241,0.4);
    --tint-orange-10: rgba(251,146,60,0.1);
    --tint-orange-25: rgba(251,146,60,0.25);
    --tint-orange-35: rgba(251,146,60,0.35);
    --tint-sky-500-10: rgba(14,165,233,0.1);
    --tint-sky-500-18: rgba(14,165,233,0.18);
    --tint-sky-500-25: rgba(14,165,233,0.25);
    --tint-sky-500-45: rgba(14,165,233,0.45);
    --tint-slate-400-15: rgba(148,163,184,0.15);
    --tint-teal-600-06: rgba(13,148,136,0.06);
    --tint-teal-600-08: rgba(13,148,136,0.08);
    --tint-teal-600-25: rgba(13,148,136,0.25);
    --tint-violet-400-30: rgba(167,139,250,0.3);
    --tint-violet-600-08: rgba(124,58,237,0.08);
    --tint-white-02: rgba(255,255,255,0.02);
    --tint-white-03: rgba(255,255,255,0.03);
    --tint-white-04: rgba(255,255,255,0.04);
    --tint-white-05: rgba(255,255,255,0.05);
    --tint-white-06: rgba(255,255,255,0.06);
    --tint-white-07: rgba(255,255,255,0.07);
    --tint-white-08: rgba(255,255,255,0.08);
    --tint-white-09: rgba(255,255,255,0.09);
    --tint-white-10: rgba(255,255,255,0.1);
    --tint-white-12: rgba(255,255,255,0.12);
    --tint-white-14: rgba(255,255,255,0.14);
    --tint-white-15: rgba(255,255,255,0.15);
    --row-highlight: rgba(122,184,245,0.06);
    /* Spacing scale — dense numeric-table app; loosening broadly costs
       rows-per-screen. xs and 2xl added for badges/pills and hero breaks
       that were hardcoded ad hoc. */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 14px;
    --space-lg: 20px;
    --space-xl: 32px;
    --space-2xl: 48px;
    /* Typography scale — sizes used to be scattered literals across the app;
       one place now so a display/small tweak is one edit. */
    --fs-display: 32px;
    --fs-h1: 22px;
    --fs-h2: 16px;
    --fs-body: 13px;
    --fs-small: 11px;
    --fs-label: 12px;
    --fs-mono: 13px;
    --radius-card: 8px;
    --radius-btn: 8px;
    --radius-pill: 999px;
  }
  * { box-sizing:border-box; }
  /* Reusable surfaces / labels — prefer these over retyping the card and
     uppercase-label inline style objects. */
  .card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:var(--radius-card); padding:13px; }
  .section-label { font-size:var(--fs-small); font-weight:700; color:var(--text-muted); }
  body { margin:0; font-family:var(--font-sans); background:var(--bg-base); color:var(--text-primary); font-size:13px; line-height:1.5;
    font-variant-numeric: tabular-nums; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility; }
  .app { min-height:100vh; background:var(--bg-base); }
  .hdr { background:var(--bg-hdr); border-bottom:1px solid var(--divider); padding:10px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:100; backdrop-filter:blur(16px); }
  h1.logo { margin:0; }
  .sr-only { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  .logo { font-size:25px; font-weight:800; letter-spacing:-0.03em; color:#eaf1ff; }
  .logo-sub { color:var(--chart-2); font-weight:400; font-size:16px; margin-left:6px; }
  .mbtn { padding:5px 13px; border-radius:7px; border:1px solid var(--card-border); cursor:pointer; font-size:11px; font-family:var(--font-sans); font-weight:500; transition:all 0.2s; background:transparent; color:var(--text-secondary); }
  .mbtn:hover { color:var(--text-primary); border-color:var(--divider); }
  .mbtn.on { background:var(--accent); border-color:transparent; color:var(--bg-base); }
  .mbtn:disabled { opacity:0.4; cursor:not-allowed; }
  /* Thin divider separating the utility buttons from the support CTA. */
  .hdiv { width:1px; height:20px; background:var(--divider); margin:0 3px; flex-shrink:0; }
  /* Buy-me-a-coffee — the one prominent, filled support CTA in the header. */
  .coffee-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 15px; border-radius:8px; border:none; background:#ffdd00; color:#1a1a1a; font-size:12px; font-weight:800; font-family:var(--font-sans); letter-spacing:-0.01em; text-decoration:none; cursor:pointer; white-space:nowrap; transition:filter 0.15s; }
  .coffee-btn:hover { filter:brightness(1.06); }
  /* ── Visitor landing (first-screen hero) ── */
  .landing { min-height:100vh; background:var(--bg-base); display:flex; flex-direction:column; align-items:center; padding:clamp(26px,6vw,60px) 20px 60px; overflow-y:auto; }
  .lp-wrap { width:100%; max-width:760px; }
  .lp-brand { display:flex; align-items:center; justify-content:space-between; margin-bottom:clamp(30px,6vw,52px); }
  .lp-eyebrow { font-size:13px; font-weight:600; color:var(--accent); margin-bottom:16px; }
  .lp-answer { font-size:clamp(29px,6vw,50px); font-weight:500; line-height:1.05; letter-spacing:-0.03em; color:var(--text-primary); margin:0; }
  .lp-age { color:var(--accent-teal); font-family:'JetBrains Mono',monospace; }
  .lp-answer.short .lp-age { color:var(--accent-gold); }
  .lp-sub { margin-top:16px; font-size:16px; color:var(--text-secondary); max-width:54ch; line-height:1.55; }
  .lp-panel { margin-top:28px; background:var(--card-bg); border:1px solid var(--card-border); border-radius:16px; padding:22px; }
  .lp-row { display:grid; grid-template-columns:1fr auto; align-items:baseline; }
  .lp-label { font-size:14px; color:var(--text-secondary); font-weight:600; }
  .lp-val { font-size:16px; font-weight:500; color:var(--text-primary); font-family:'JetBrains Mono',monospace; }
  /* Typed hero readout. A fixed 14ch width + right alignment keeps the grid's
     right edge steady as the value grows — $250,000,000 must not shove the label. */
  .lp-val-input { width:14ch; text-align:right; background:transparent; border:1px solid transparent; border-radius:6px; padding:2px 6px; cursor:text; }
  .lp-val-input:hover { border-color:var(--card-border); background:var(--row-highlight); }
  .lp-val-input:focus { outline:none; border-color:var(--accent); background:var(--bg-info); color:var(--text-primary); }
  /* Scoped under .landing so it beats the global input[type=range] display:none. */
  .landing input[type=range].lp-range { -webkit-appearance:none; appearance:none; display:block; width:100%; height:6px; border-radius:100px; background:var(--divider); outline:none; margin:7px 0 18px; cursor:pointer; }
  .landing input[type=range].lp-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:22px; height:22px; border-radius:50%; background:var(--accent); border:3px solid var(--bg-base); cursor:pointer; }
  .landing input[type=range].lp-range::-moz-range-thumb { width:20px; height:20px; border-radius:50%; background:var(--accent); border:3px solid var(--bg-base); cursor:pointer; }
  .lp-cta { display:inline-flex; align-items:center; gap:9px; margin-top:26px; padding:15px 30px; border:none; border-radius:12px; background:var(--accent); color:var(--bg-base); font-size:17px; font-weight:600; font-family:var(--font-sans); cursor:pointer; transition:filter 0.15s; }
  .lp-cta:hover { filter:brightness(1.1); }
  .lp-skip { display:block; margin-top:15px; background:none; border:none; color:var(--text-muted); font-size:13px; cursor:pointer; font-family:var(--font-sans); text-decoration:underline; padding:0; }
  .lp-skip:hover { color:var(--text-secondary); }
  .lp-site { width:100%; max-width:1080px; }
  .lp-top { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:clamp(28px,5vw,56px); flex-wrap:wrap; }
  .lp-nav { display:flex; align-items:center; gap:18px; font-size:14px; white-space:nowrap; }
  .lp-nav a { color:var(--text-secondary); text-decoration:none; font-weight:600; }
  .lp-nav a:hover { color:var(--text-primary); }
  .lp-nav-btn { padding:9px 18px; border-radius:10px; border:1px solid var(--card-border); background:var(--card-bg); color:var(--text-primary); font-size:14px; font-weight:600; font-family:var(--font-sans); cursor:pointer; }
  .lp-nav-btn:hover { border-color:var(--accent); }
  .lp-hero { display:grid; grid-template-columns:1fr; gap:36px; align-items:start; }
  @media (min-width:900px) { .lp-hero { grid-template-columns:1fr 1fr; gap:48px; } }
  .lp-title { font-size:clamp(34px,5.5vw,54px); font-weight:700; line-height:1.06; letter-spacing:-0.02em; color:var(--text-primary); margin:0; }
  .lp-micro { margin-top:14px; font-size:13px; color:var(--text-muted); }
  .lp-facts { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:32px; max-width:520px; }
  .lp-facts div { background:var(--card-bg); border:1px solid var(--card-border); border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:4px; }
  .lp-facts b { font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:500; color:var(--accent-teal); }
  .lp-facts span { font-size:12px; color:var(--text-muted); line-height:1.35; }
  .lp-btnrow { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
  .lp-btnrow .lp-cta { margin-top:26px; }
  .lp-ghost { margin-top:26px; padding:14px 22px; border-radius:12px; border:1px solid var(--card-border); background:transparent; color:var(--text-primary); font-size:16px; font-weight:600; font-family:var(--font-sans); cursor:pointer; }
  .lp-ghost:hover { border-color:var(--accent); }
  .lp-btnrow .lp-cta-sm { padding:13px 26px; font-size:16px; }
  .lp-q { font-size:clamp(26px,4vw,38px); font-weight:700; line-height:1.12; letter-spacing:-0.01em; color:var(--text-primary); margin:0; outline:none; }
  .lp-qrow { margin-top:26px; max-width:520px; }
  .lp-ringcard { text-align:center; }
  .lp-ringcard .lp-card-tag { text-align:left; }
  .lp-ringcard .lp-card-sub { text-align:left; }
  .lp-ring { position:relative; width:150px; height:150px; margin:8px auto 0; }
  .lp-ring-arc { transition:stroke-dashoffset 0.4s ease; }
  .lp-ring-num { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .lp-ring-num b { font-family:'JetBrains Mono',monospace; font-size:38px; font-weight:500; color:var(--text-primary); line-height:1; }
  .lp-ring-num span { font-size:11px; color:var(--text-muted); font-weight:600; margin-top:4px; }
  .lp-dots { display:flex; gap:8px; margin-top:18px; }
  .lp-dots span { width:10px; height:10px; border-radius:50%; background:var(--tint-white-06); }
  .lp-dots span.on { background:var(--accent); }
  @media (prefers-reduced-motion: reduce) { .lp-ring-arc { transition:none; } }
  .lp-card { margin-top:0; }
  .lp-card-tag { font-size:12px; font-weight:700; color:var(--accent); margin-bottom:12px; }
  .lp-card .lp-answer { font-size:clamp(26px,4vw,38px); }
  .lp-card-sub { margin:10px 0 0; font-size:14px; color:var(--text-secondary); line-height:1.5; }
  .lp-fine { margin:6px 0 0; font-size:12px; color:var(--text-faint); line-height:1.5; }
  .lp-section { margin-top:clamp(48px,8vw,88px); }
  .lp-h2 { font-size:clamp(24px,3.6vw,32px); font-weight:700; color:var(--text-primary); margin:0 0 20px; letter-spacing:-0.01em; }
  .lp-h3 { font-size:17px; font-weight:700; color:var(--text-primary); margin:0 0 8px; }
  .lp-p { font-size:15px; color:var(--text-secondary); line-height:1.55; margin:0; }
  .lp-grid3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }
  .lp-grid2 { display:grid; grid-template-columns:1fr; gap:14px; margin-top:20px; }
  @media (min-width:700px) { .lp-grid2 { grid-template-columns:1fr 1fr; } }
  .lp-tile { background:var(--card-bg); border:1px solid var(--card-border); border-radius:14px; padding:22px; text-align:left; font-family:var(--font-sans); text-decoration:none; display:block; }
  .lp-tile-btn { cursor:pointer; width:100%; display:flex; flex-direction:column; justify-content:flex-start; }
  .lp-tile-btn:hover { border-color:var(--accent); }
  .lp-num { width:34px; height:34px; border-radius:50%; background:var(--bg-info); color:var(--accent); font-weight:700; display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
  .lp-feature { display:grid; grid-template-columns:1fr; gap:24px; align-items:center; margin-top:clamp(28px,5vw,56px); }
  @media (min-width:900px) { .lp-feature { grid-template-columns:1fr 1.25fr; gap:52px; } .lp-feature.lp-flip { grid-template-columns:1.25fr 1fr; } .lp-feature.lp-flip .lp-feature-text { order:2; } }
  .lp-h3-big { font-size:clamp(22px,3vw,28px); line-height:1.15; margin:0 0 12px; }
  .lp-bullets { margin:14px 0 0; padding-left:20px; color:var(--text-secondary); font-size:15px; line-height:1.7; }
  .lp-shot { margin:0; border:1px solid var(--card-border); border-radius:14px; background:var(--card-bg); padding:10px; box-shadow:0 18px 40px rgba(0,0,0,0.35); }
  .lp-shot img { display:block; width:100%; height:auto; border-radius:8px; }
  .lp-shot figcaption { font-size:12px; color:var(--text-faint); margin-top:8px; }
  .lp-shot-note { padding:28px; display:flex; flex-direction:column; gap:8px; }
  .lp-shot-note b { color:var(--text-primary); font-size:17px; }
  .lp-shot-note span { color:var(--text-secondary); font-size:15px; line-height:1.5; }
  .lp-video { max-width:900px; }
  .lp-video video { display:block; width:100%; height:auto; border-radius:8px; background:#000; }
  .lp-reveal { opacity:0; transform:translateY(24px); transition:opacity 0.6s ease, transform 0.6s ease; }
  .lp-reveal.lp-in { opacity:1; transform:none; }
  @media (prefers-reduced-motion: reduce) { .lp-reveal { opacity:1; transform:none; transition:none; } }
  .lp-foot { margin-top:clamp(48px,8vw,88px); padding-top:32px; border-top:1px solid var(--divider); font-size:14px; color:var(--text-muted); line-height:1.7; }
  .lp-foot-grid { display:grid; grid-template-columns:1fr; gap:28px; }
  @media (min-width:700px) { .lp-foot-grid { grid-template-columns:1.6fr 1fr 1fr 1fr; gap:36px; } }
  .lp-foot h3 { margin:0 0 10px; font-size:13px; font-weight:700; color:var(--text-primary); }
  .lp-foot nav { display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
  .lp-foot a, .lp-foot nav button { color:var(--text-secondary); text-decoration:none; font:inherit; font-size:14px; padding:0; background:none; border:0; cursor:pointer; text-align:left; }
  .lp-foot a:hover, .lp-foot nav button:hover { color:var(--accent); text-decoration:underline; }
  .lp-foot-line { margin:8px 0 0; max-width:34ch; color:var(--text-muted); }
  .lp-foot-fine { margin:32px 0 0; padding-top:16px; border-top:1px solid var(--divider); font-size:12px; color:var(--text-faint); }
  /* minmax(0,1fr), not bare 1fr: a grid track's auto minimum is its content's
     max-content width, so a wide child (the 15+ column Withdrawal Plan
     table) silently grows the whole right-pane track past the viewport
     instead of scrolling inside it — the browser has to be widened to see
     it. minmax(0,1fr) removes that content-based floor so .main is held to
     the track's actual size and its own overflow rules (below) take over. */
  .layout { display:grid; grid-template-columns:340px minmax(0, 1fr); height:calc(100vh - 56px); overflow:hidden; }
  .sidebar { border-right:1px solid var(--tint-white-08); padding:14px 12px; overflow-y:auto; background:rgba(10,15,30,0.78); display:flex; flex-direction:column; gap:12px; min-height:0; min-width:0; }
  .sb-card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:var(--radius-card); padding:13px 12px; }
  .sb-title { font-size:var(--fs-label); font-weight:600; color:var(--text-muted); margin:0 0 10px; }
  .sl-row { display:flex; flex-direction:column; gap:6px; margin-bottom:13px; }
  .sl-nudge-btn { width:24px; height:24px; border-radius:5px; border:1px solid var(--tint-white-12); background:var(--tint-white-06); color:var(--text-secondary); cursor:pointer; font-size:14px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; padding:0; transition:all 0.15s; flex-shrink:0; line-height:1; user-select:none; }
  .sl-nudge-btn:hover:not(:disabled) { background:var(--tint-white-15); color:#ffffff; border-color:rgba(255,255,255,0.28); transform:scale(1.06); }
  .sl-nudge-btn:active:not(:disabled) { transform:scale(0.94); }
  .sl-nudge-btn:disabled { opacity:0.22; cursor:not-allowed; }
  /* The value cell is now an editable input (typed entry can exceed the slider max). */
  .sl-val-input { width:auto; min-width:70px; max-width:120px; text-align:center; background:rgba(15,23,42,0.65); border:1px solid var(--tint-white-12); border-radius:5px; padding:2px 6px; cursor:text; }
  .sl-val-input:hover { border-color:rgba(255,255,255,0.22); background:var(--tint-white-08); }
  .sl-val-input:focus { outline:none; border-color:var(--positive); background:rgba(90,209,240,0.12); color:var(--text-primary); box-shadow:0 0 0 2px var(--tint-sky-25); }
  .sl-label { font-size:12px; color:var(--text-secondary); font-weight:600; }
  .sl-val { font-size:12px; font-weight:700; text-align:right; color:var(--text-primary); font-family:'JetBrains Mono',monospace; }
  .tog-row { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:10px; gap:8px; flex-wrap:nowrap; }
  .sb-card > .tog-row:last-child { margin-bottom:0; }
  .tog-label { font-size:12px; line-height:18px; color:var(--text-secondary); font-weight:500; flex:1; min-width:0; }
  .tog { width:34px; height:18px; border:0; padding:0; border-radius:9px; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; }
  .tok { position:absolute; top:2px; width:14px; height:14px; border-radius:50%; background:white; transition:left 0.2s; box-shadow:0 1px 3px var(--tint-black-40); }
  .run-btn { width:100%; padding:10px; background:var(--accent); border:none; border-radius:6px; color:var(--bg-base); font-size:13px; font-weight:700; cursor:pointer; font-family:var(--font-sans); transition:all 0.2s; letter-spacing:-0.01em; flex-shrink:0; }
  .run-btn:hover { opacity:0.9; }
  .run-btn:disabled { opacity:0.4; cursor:not-allowed; box-shadow:none; }
  .main { padding:16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; min-height:0; min-width:0; }
  /* min-width:0 alongside flex-shrink:0: shrink is about the column axis
     (height) here, not width — without min-width:0 a card holding a wide
     table still stretches to that table's content width on the cross axis,
     which is the other half of the same overflow this section fixes. */
  .main > * { flex-shrink:0; min-width:0; }
  /* One level isn't enough. Tab bodies nest their own
     display:flex/flexDirection:column card stacks several layers deep
     (WithdrawalPlanCombined > a plain section div > WaterfallPlanView, each
     wrapping the next) before reaching the wide table's own overflow-x:auto
     div. Each of those intermediate flex containers has the exact same
     content-based auto-minimum-width problem .main > * fixes one level up —
     min-width:0 only stops the wide child from being a floor on ITS
     immediate flex parent, it doesn't cascade to grandparents. Rather than
     hunting down and annotating every nested flex wrapper in every tab
     (this pattern repeats across the app), apply the fix universally to
     every descendant of .main: min-width:0 is already CSS's default value,
     so this changes nothing for ordinary block boxes — it only removes the
     content-based floor for the specific flex/grid items that have one. */
  .main * { min-width:0; }
  .flag-w { border-left:3px solid var(--accent-gold); background:var(--bg-warning); padding:7px 12px; font-size:12px; color:#fde68a; border-radius:0 8px 8px 0; margin-bottom:4px; font-weight:500; }
  .flag-i { border-left:3px solid #38bdf8; background:rgba(56,189,248,0.08); color:#bae6fd; border-radius:0 8px 8px 0; padding:7px 12px; font-size:12px; margin-bottom:4px; font-weight:500; }
  /* ── Help / About body — the info-modal kit's rhythm, authored in HTML ──
     The ❓ Help modal and its cards render authored HTML from about.js via
     dangerouslySetInnerHTML, so they cannot use the JSX kit directly
     (ModalLede / ModalP / Em / ModalNote). These classes ARE that kit, in
     CSS, at the same values: change them together, or the help copy grows a
     second body style — the drift this block exists to prevent. */
  .help-body { font-size:13px; color:var(--text-secondary); line-height:1.75; }
  .help-body p { margin:0 0 10px; }
  .help-body > *:last-child { margin-bottom:0; }
  .help-lede { font-size:14.5px; font-weight:700; color:var(--text-primary); line-height:1.5; margin:0 0 10px; }
  .help-sub { font-size:13px; font-weight:700; color:var(--text-primary); line-height:1.5; margin:16px 0 7px; }
  .help-body strong { color:var(--text-primary); font-weight:700; }
  .help-body em { font-style:italic; }
  .help-body ul { margin:0 0 10px; padding-left:20px; }
  .help-body li { margin-bottom:4px; }
  .help-body code { font-family:var(--font-mono); font-size:12px; background:var(--tint-white-06); border:1px solid var(--tint-white-08); border-radius:4px; padding:1px 5px; }
  /* The ModalNote look. Accent comes from --note-accent so a risk-toned note
     is a modifier, not a second rule that can fall out of step. */
  .help-note { --note-accent: var(--accent-gold); display:flex; gap:9px;
    background:rgba(245,166,35,0.07); border:1px solid rgba(245,166,35,0.2);
    border-left:3px solid var(--note-accent); border-radius:8px; padding:10px 12px;
    margin:0 0 10px; font-size:12.5px; color:var(--text-secondary); line-height:1.6; }
  .help-note--risk { --note-accent: var(--negative); background:var(--tint-red-07);
    border-top-color:var(--tint-red-20); border-right-color:var(--tint-red-20);
    border-bottom-color:var(--tint-red-20); border-left:3px solid var(--note-accent); }
  .help-note--method { --note-accent: var(--accent-teal); background:var(--tint-sky-07);
    border-top-color:var(--tint-sky-20); border-right-color:var(--tint-sky-20);
    border-bottom-color:var(--tint-sky-20); border-left:3px solid var(--note-accent); }
  .help-note-icon { color:var(--note-accent); font-weight:800; flex-shrink:0; line-height:1.6; }
  /* auto-fit (not a fixed 4-column count) so a row with fewer cards than
     the column count STRETCHES to fill the width instead of leaving empty
     gaps — a fixed repeat(4,1fr) left a lone 5th card stranded on its own
     row with 3 blank slots next to it, and any future card count hits the
     same problem again at a different number. minmax(160px,1fr) keeps cards
     from getting too narrow to read before wrapping. */
  .metrics { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:9px; }
  .met { background:var(--tint-white-04); border:1px solid var(--tint-white-09); border-radius:10px; padding:13px 15px; }
  .ml { font-size:var(--fs-small); color:var(--text-muted); margin-bottom:7px; font-weight:600; }
  .mv { font-size:22px; font-weight:800; font-family:'JetBrains Mono',monospace; line-height:1; }
  .ms { font-size:12px; color:var(--text-muted); margin-top:5px; }
  .analogue { background:var(--tint-white-03); border:1px solid var(--tint-white-08); border-radius:10px; padding:12px 16px; font-size:13px; color:var(--text-secondary); font-style:italic; }
  .analogue-fade { animation: analogueFade 0.6s ease; }
  @keyframes analogueFade { from { opacity: 0; } to { opacity: 1; } }
  .recomputing { animation: recomputePulse 1.15s ease-in-out infinite; }
  @keyframes recomputePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
  .tabs { display:flex; gap:2px; border-bottom:1px solid var(--tint-white-10); flex-wrap:wrap; }
  .tab { flex:1; min-width:72px; padding:10px 6px; border:none; border-bottom:2px solid transparent; margin-bottom:-1px; background:transparent; cursor:pointer; font-size:13px; font-family:var(--font-sans); color:var(--text-muted); transition:color 0.15s, border-color 0.15s, background 0.15s; font-weight:500; white-space:nowrap; letter-spacing:-0.01em; border-radius:7px 7px 0 0; position:relative; overflow:hidden; }
  .tab:hover { color:var(--text-muted); background:var(--tint-white-03); }
  /* The active tab's teal underline used to stop at that button's own width, so
     the "you are here" marker read as a short dash floating under one label
     while the grey rule carried on past it either side. This strip spans the
     whole bar and overflow:hidden on the button clips it to the selected tab,
     so the highlighter runs edge to edge like the reference design — and it
     stays right however the buttons wrap, with no hardcoded widths or nth-child
     maths. Sits on the border line itself (bottom:0, over the 2px
     border-bottom) rather than below it. */
  .tab::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--accent-teal); transform:scaleX(0); transform-origin:left; transition:transform 0.15s ease; pointer-events:none; }
  /* Folder-tab treatment: the active tab gets a tinted "page" surface that
     reads as connected to the panel below, plus the teal/green highlighter
     underline that was already carrying the state. The tint is one step of
     the same accent so the tab and its panel look like one surface. */
  .tab.on { color:var(--accent-teal); border-bottom-color:var(--accent-teal); font-weight:600; background:color-mix(in srgb, var(--accent-teal) 12%, transparent); }
  .tab.on::after { transform:scaleX(1); }
  .chart-card { background:var(--tint-white-03); border:1px solid var(--tint-white-08); border-radius:11px; padding:15px 17px; }
  .ct { font-size:18px; color:var(--text-muted); margin-bottom:12px; font-weight:500; }
  .ct-sub { font-size:11.5px; color:var(--text-muted); line-height:1.5; margin:-8px 0 10px; }
  .leg { display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; }
  .li { display:flex; align-items:center; gap:5px; font-size:12px; color:var(--text-muted); }
  .ll { width:18px; height:2px; border-radius:1px; }
  .ppl-grid { display:flex; flex-wrap:wrap; gap:4px; margin:8px 0; }
  .dot { display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:6px; vertical-align:middle; }
  .dot-ok { background:var(--positive); } .dot-warn { background:var(--accent-gold); } .dot-bad { background:var(--negative); } .dot-info { background:var(--accent); }
  .ppl-dot { width:18px; height:18px; border-radius:50%; }
  .roth-tbl { width:100%; border-collapse:collapse; font-size:12px; }
  /* ── Withdrawal table: grouped column views ───────────────────────────────
     The year-by-year schedule carries 23 columns, which is more than anyone can
     read across. Rather than maintain four separate hand-written tables (four
     places to update on every engine change), the columns carry a group tag and
     a view hides whole groups. Hiding is per-GROUP only, so a visible group's
     colSpan in the header row is always correct and never needs recomputing.
     This is the same "one table, different lenses" idea as the reference app's
     Main / Growth / Withdrawals / Tax tabs. */
  .wf-views { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
  .wf-views button { padding:4px 12px; font-size:11px; font-weight:600; border-radius:999px; cursor:pointer;
    border:1px solid var(--card-border); background:transparent; color:var(--text-secondary);
    font-family:var(--font-sans); transition:all 0.15s; }
  .wf-views button:hover { color:var(--text-primary); }
  .wf-views button.on { background:color-mix(in srgb, var(--accent-teal) 16%, transparent);
    border-color:color-mix(in srgb, var(--accent-teal) 45%, transparent); color:var(--accent-teal); }
  .wf-grp { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.14em;
    color:var(--text-muted); text-align:center; padding:6px 6px 4px; white-space:nowrap;
    border-bottom:1px solid var(--divider); }
  .wf-grp-s { color:var(--accent-gold); }
  .wf-grp-i { color:var(--positive); }
  .wf-grp-d { color:var(--accent-teal); }
  .wf-grp-t { color:var(--chart-3); }
  .wf-grp-b { color:var(--accent-purple); }
  .wf-tbl[data-view="flows"] [data-cg="tax"],
  .wf-tbl[data-view="flows"] [data-cg="risk"],
  .wf-tbl[data-view="flows"] [data-cg="bal"] { display:none; }
  .wf-tbl[data-view="tax"] [data-cg="spend"],
  .wf-tbl[data-view="tax"] [data-cg="income"],
  .wf-tbl[data-view="tax"] [data-cg="draw"],
  .wf-tbl[data-view="tax"] [data-cg="conv"],
  .wf-tbl[data-view="tax"] [data-cg="bal"] { display:none; }
  .wf-tbl[data-view="bal"] [data-cg="spend"],
  .wf-tbl[data-view="bal"] [data-cg="income"],
  .wf-tbl[data-view="bal"] [data-cg="draw"],
  .wf-tbl[data-view="bal"] [data-cg="conv"],
  .wf-tbl[data-view="bal"] [data-cg="tax"],
  .wf-tbl[data-view="bal"] [data-cg="risk"] { display:none; }  .roth-tbl th { font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em; padding:7px 8px; text-align:right; border-bottom:1px solid var(--tint-white-09); }
  .roth-tbl th:first-child { text-align:left; }
  .roth-tbl td { padding:9px 8px; border-bottom:1px solid var(--tint-white-05); text-align:right; font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--text-primary); }
  .roth-tbl td:first-child { text-align:left; font-family:var(--font-sans); color:var(--text-primary); }
  .gold { background:var(--tint-amber-07); }
  .gk-bar { background:rgba(14,165,233,0.07); border:1px solid rgba(14,165,233,0.2); border-radius:9px; padding:11px 15px; font-size:12px; color:#bae6fd; }
  .cfg-btn { display:block; width:100%; margin:0 0 12px; padding:9px 12px; border:0; border-radius:8px; background:var(--accent-teal); color:#04201c; font-size:13px; font-weight:800; letter-spacing:0.02em; cursor:pointer; text-align:center; }
  .cfg-btn:hover { filter:brightness(1.08); }
  .cfg-btn:focus-visible, .sb-edit:focus-visible, .donut-btn:focus-visible, .tog:focus-visible, .info-trig:focus-visible, .sb-title[role=button]:focus-visible { outline:2px solid var(--accent-teal); outline-offset:2px; }
  .cfg-launch { margin:0; min-height:44px; flex-shrink:0; }
  .cfg-launch:active { transform:translateY(1px); }
  .cfg-launch[aria-current] { background:transparent; color:var(--accent-teal); box-shadow:inset 0 0 0 1.5px var(--accent-teal); }
  .assume-row { display:flex; justify-content:space-between; align-items:baseline; gap:10px; width:100%; padding:7px 0; border:0; border-top:1px solid var(--tint-white-06); background:none; color:var(--text-primary); font:inherit; font-size:12px; text-align:left; cursor:pointer; }
  .assume-row span:last-child { color:var(--accent-teal); font-size:11px; font-weight:600; text-decoration:underline; flex-shrink:0; }
  .assume-row:focus-visible { outline:2px solid var(--accent-teal); outline-offset:2px; }
  .gap-row { display:flex; align-items:baseline; gap:9px; width:100%; padding:9px 13px; border:1px solid var(--tint-amber-35); border-radius:9px; background:var(--tint-amber-07); color:var(--text-secondary); font:inherit; font-size:12.5px; line-height:1.5; text-align:left; cursor:pointer; }
  .gap-row > span:first-child, .gap-row strong { color:var(--accent-gold); }
  .gap-row:hover { background:var(--tint-amber-08); }
  .gap-row:focus-visible { outline:2px solid var(--accent-gold); outline-offset:2px; }
  .gap-more { color:var(--accent-gold); font-weight:700; white-space:nowrap; text-decoration:underline; text-underline-offset:3px; }
  .donut-btn { padding:0; border:0; background:none; border-radius:50%; cursor:pointer; flex-shrink:0; }
  .donut-btn:hover { filter:brightness(1.2); }
  .sb-edit { background:none; border:0; padding:0; color:var(--accent-teal); font-size:10px; font-weight:600; text-decoration:underline; cursor:pointer; }
  .progress-bar { height:5px; background:var(--tint-white-08); border-radius:3px; overflow:hidden; margin-top:6px; }
  .progress-fill { height:100%; background:var(--accent); border-radius:3px; transition:width 1s; }
  .nw-table { width:100%; border-collapse:collapse; font-size:12px; }
  .nw-table th { font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em; padding:7px 8px; border-bottom:1px solid var(--tint-white-09); text-align:right; font-weight:700; }
  .nw-table th:first-child { text-align:left; }
  .nw-table td { padding:8px 8px; border-bottom:1px solid var(--tint-white-04); text-align:right; font-family:'JetBrains Mono',monospace; color:var(--text-primary); }
  .nw-table td:first-child { text-align:left; font-family:var(--font-sans); color:var(--text-primary); }
  .wizard-mobile-steps { display:none; }
  .ap-col { background:var(--tint-white-03); border:1px solid var(--tint-white-08); border-radius:10px; padding:14px; }
  .ap-hdr { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:11px; }
  .ap-item { font-size:12px; padding:6px 0; border-bottom:1px solid var(--tint-white-05); color:var(--text-secondary); }
  .ms-dot { width:11px; height:11px; border-radius:50%; flex-shrink:0; margin-top:2px; }
  .ms-line { width:2px; background:var(--tint-white-08); margin:0 4px; }
  .tip-box { background:rgba(10,15,30,0.98); border:1px solid var(--tint-white-12); border-radius:8px; padding:9px 12px; font-size:14px; color:var(--text-primary); }
  /* Scrollbars.
     These used to be 3px wide at 12% opacity — invisible on every platform,
     and worse on macOS, where the OS uses overlay scrollbars that stay
     hidden until you actively scroll. Wide tables (the 15-column waterfall,
     the MC band table, the checkpoint table) looked truncated instead of
     scrollable, and Mac users never discovered the columns off to the right.

     Styling ::-webkit-scrollbar at all opts Chrome/Safari out of overlay
     mode, so the bar stays on screen; the size and contrast below make it
     actually visible once it is. Firefox uses the standard properties. */
  ::-webkit-scrollbar { width:10px; height:10px; }
  ::-webkit-scrollbar-track {
    background:var(--tint-white-04);
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

  /* Horizontally scrollable regions get a right-edge fade so there's a
     visual cue that content continues past the viewport, independent of the
     scrollbar itself. */
  .scroll-x {
    overflow-x:auto;
    background:
      linear-gradient(to right, var(--bg-base) 30%, rgba(10,15,30,0)) left center,
      linear-gradient(to left,  var(--bg-base) 30%, rgba(10,15,30,0)) right center;
    background-repeat:no-repeat;
    background-size:36px 100%, 36px 100%;
    background-attachment:local, local;
  }

  /* Mobile / Responsive */
  @media (max-width: 768px) {
    .hdr { padding:8px 12px; gap:6px; flex-wrap:wrap; }
    .logo-sub { display:none; }
    .mbtn { padding:4px 9px; font-size:10px; }
    .layout { grid-template-columns:1fr; height:auto; overflow:visible; }
    .sidebar { border-right:none; border-bottom:1px solid var(--tint-white-06); max-height:220px; overflow-y:auto; min-height:unset; padding:10px; flex-direction:row; flex-wrap:wrap; gap:8px; }
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

const FAN_COLORS = {
  "90th":   "var(--chart-4)",
  "75th":   "var(--chart-5)",
  "Median": "var(--accent-teal)",
  "25th":   "var(--accent-gold)",
  "10th":   "var(--chart-1)",
};

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

  const seen = new Set();
  const uniquePayload = payload.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  return (
    <div className="tip-box">
      <div style={{ color: "var(--text-muted)", marginBottom: 3 }}>{tipHeading(uniquePayload, label)}</div>
      {uniquePayload
        .filter((p) => p.value > 0)
        .map((p, i) => {
          const c = FAN_COLORS[p.name] || p.color;
          return (
            <div key={i} style={{ color: c, marginBottom: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: "var(--text-secondary)" }}>{p.name}: </span>
              {fmtDollar(p.value)}
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
    <tr key={lbl} style={{ borderBottom: "1px solid var(--tint-white-04)" }}>
      <td style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: swatch, display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)" }}>{lbl}</span>
        </div>
      </td>
      <td style={{ padding: "4px 0 4px 12px", textAlign: "right", fontSize: "var(--fs-small)", color: note ? "#374151" : "var(--text-primary)" }}>
        {note ? <em style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{note}</em> : N(optV)}
      </td>
      <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
        {note ? "" : N(curV)}
      </td>
    </tr>
  );
  return (
    <div style={{ background: "#0f172a", border: "1px solid var(--tint-white-12)", borderRadius: 8, padding: "10px 14px", minWidth: 280, boxShadow: "0 4px 20px var(--tint-black-60)" }}>
      <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--tint-white-08)" }}>
        Age {label} — Tax Breakdown
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", textAlign: "left", paddingBottom: 4, fontWeight: 500 }}>Type</th>
            <th style={{ fontSize: "var(--fs-small)", color: "var(--chart-4)", textAlign: "right", paddingBottom: 4, fontWeight: 500, paddingLeft: 12 }}>With Conv</th>
            <th style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", textAlign: "right", paddingBottom: 4, fontWeight: 500, paddingLeft: 8 }}>Without</th>
          </tr>
        </thead>
        <tbody>
          {tipRow("var(--chart-8)", "Federal Income Tax", oF, cF)}
          {hasState && tipRow("var(--chart-3)", "State Income Tax", oS, cS)}
          {hasIrmaa && tipRow("var(--chart-1)", "IRMAA Surcharge", oI, cI)}
          {tipRow("#334155", "FICA (payroll tax)", 0, 0, "not applicable — retired")}
          {tipRow("#334155", "Capital Gains Tax", 0, 0, "not modeled here")}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--tint-white-10)" }}>
            <td style={{ paddingTop: 5, fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-primary)" }}>Total</td>
            <td style={{ paddingTop: 5, textAlign: "right", fontSize: "var(--fs-label)", fontWeight: 700, paddingLeft: 12, color: delta > 0 ? "var(--chart-3)" : delta < 0 ? "var(--positive)" : "var(--text-secondary)" }}>{N(oTotal)}</td>
            <td style={{ paddingTop: 5, textAlign: "right", fontSize: "var(--fs-label)", fontWeight: 700, paddingLeft: 8, color: "var(--text-secondary)" }}>{N(cTotal)}</td>
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
    <tr key={lbl} style={{ borderBottom: "1px solid var(--tint-white-04)" }}>
      <td style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: swatch, display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)" }}>{lbl}</span>
        </div>
      </td>
      <td style={{ padding: "4px 0 4px 12px", textAlign: "right", fontSize: "var(--fs-small)", color: "var(--text-primary)" }}>{N(optV)}</td>
      <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{N(curV)}</td>
    </tr>
  ) : null;
  return (
    <div style={{ background: "#0f172a", border: "1px solid var(--tint-white-12)", borderRadius: 8, padding: "10px 14px", minWidth: 280, boxShadow: "0 4px 20px var(--tint-black-60)" }}>
      <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--tint-white-08)" }}>
        Age {label} — Taxable Income Sources
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", textAlign: "left", paddingBottom: 4, fontWeight: 500 }}>Source</th>
            <th style={{ fontSize: "var(--fs-small)", color: "var(--accent-teal)", textAlign: "right", paddingBottom: 4, fontWeight: 500, paddingLeft: 12 }}>With Conv</th>
            <th style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", textAlign: "right", paddingBottom: 4, fontWeight: 500, paddingLeft: 8 }}>Without</th>
          </tr>
        </thead>
        <tbody>
          {tipRow("var(--accent-teal)", "Social Security (85%)", oSS, cSS)}
          {tipRow("var(--accent-gold)", "Annuity / Benefit", oAb, cAb)}
          {tipRow("var(--accent-purple)", "Required Min. Dist.", oRmd, cRmd)}
          {tipRow("var(--chart-2)", "Pretax Withdrawal", oPxs, cPxs)}
          {tipRow("var(--positive)", "Roth Conversion", oConv, 0)}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--tint-white-10)" }}>
            <td style={{ paddingTop: 5, fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-primary)" }}>Total Taxable</td>
            <td style={{ paddingTop: 5, textAlign: "right", fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--accent-teal)", paddingLeft: 12 }}>{N(oTotal)}</td>
            <td style={{ paddingTop: 5, textAlign: "right", fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--text-secondary)", paddingLeft: 8 }}>{N(cTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
function Toggle({ val, onChange, label, accent = "var(--positive)", hint, infoTitle, infoAccent }) {
  return (
    <div className="tog-row">
      <span className="tog-label">
        {label}
        {hint && (
          <InfoModal
            title={infoTitle || (typeof label === "string" ? label : "About this option")}
            accent={infoAccent || accent}
            trigger={
              <span style={{ marginLeft: 6, color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex", verticalAlign: "-2px" }}
                    role="img" aria-label={`About ${typeof label === "string" ? label : "this option"}`}
                    title="Tap or click for more info">
                <InfoIcon size={13} />
              </span>
            }
          >
            {typeof hint === "string" ? hint.split("\n\n").map((para, i) => (
              <p key={i} style={{ margin: "0 0 10px" }}>{para}</p>
            )) : hint}
          </InfoModal>
        )}
      </span>
      <button
        type="button" role="switch" aria-checked={!!val}
        aria-label={typeof label === "string" ? label : undefined}
        className="tog"
        onClick={() => onChange(!val)}
        style={{ background: val ? accent : "var(--tint-white-10)" }}
      >
        <span className="tok" style={{ left: val ? 18 : 2 }} />
      </button>
    </div>
  );
}

function CollapsibleAboutCard({ entry, defaultOpen = false, open: controlled, onToggle }) {
  const [selfOpen, setSelfOpen] = React.useState(defaultOpen);
  const open = controlled ?? selfOpen;
  const ref = React.useRef(null);
  React.useEffect(() => { if (controlled) ref.current?.scrollIntoView?.({ block: "nearest" }); }, [controlled]);
  return (
    <div ref={ref} style={{ background:"var(--card-bg)",
      border:"1px solid var(--tint-white-07)", borderRadius:10, overflow:"hidden" }}>
      <button
        type="button"
        onClick={onToggle || (() => setSelfOpen(o => !o))}
        style={{ width:"100%", display:"flex", alignItems:"center",
          justifyContent:"space-between", gap:8, padding:"13px 15px",
          background:"transparent", border:"none", cursor:"pointer",
          fontSize: "var(--fs-body)", fontWeight:700, color:"var(--text-primary)", textAlign:"left",
          fontFamily:"inherit" }}
        aria-expanded={open}
      >
        <span>{entry.icon} {entry.title}</span>
        <span style={{ color:"var(--text-muted)", fontSize: "var(--fs-small)", lineHeight:1,
          display:"inline-block", transition:"transform 0.15s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
      </button>
      {open && (
        <div className="help-body" style={{ padding:"0 15px 13px" }}
          dangerouslySetInnerHTML={{ __html: entry.body }} />
      )}
    </div>
  );
}

function AboutButton() {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState(0);
  const TABS = ["About Me", "The App"];

  const tabBtn = (i) => ({
    flex:1, padding:"7px 4px", fontSize: "var(--fs-small)", fontWeight: tab===i ? 700 : 500,
    background: tab===i ? "rgba(96,165,250,0.18)" : "transparent",
    color: tab===i ? "var(--chart-2)" : "var(--text-muted)",
    border:"none", borderBottom: tab===i ? "2px solid var(--chart-2)" : "2px solid transparent",
    cursor:"pointer", transition:"all 0.15s",
  });

  const overlay = open ? ReactDOM.createPortal(
    <div
      onClick={() => setOpen(false)}
      style={{ position:"fixed", inset:0, background:"var(--tint-black-70)", zIndex:99999,
        display:"flex", alignItems:"flex-start", justifyContent:"center",
        padding:"40px 16px 60px", overflowY:"auto" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#0f1729", border:"1px solid rgba(96,165,250,0.2)",
          borderRadius:14, padding:"24px 28px 28px", maxWidth:600, width:"100%",
          boxShadow:"0 24px 60px var(--tint-black-80)" }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
          <div>
            <div style={{ fontSize: "var(--fs-h2)", fontWeight:800, color:"var(--text-primary)", letterSpacing:"-0.3px" }}>
              {ABOUT_PRODUCT.name}
            </div>
            <div style={{ fontSize: "var(--fs-small)", color:"var(--text-faint)", marginTop:3 }}>v{APP_VERSION}</div>
          </div>
          <button onClick={() => setOpen(false)}
            style={{ background:"transparent", border:"none", color:"var(--text-muted)",
              cursor:"pointer", fontSize: "var(--fs-h1)", lineHeight:1, padding:"0 2px" }}>×</button>
        </div>

        <div style={{ display:"flex", borderBottom:"1px solid var(--tint-white-08)", marginBottom:22 }}>
          {TABS.map((t, i) => (
            <button key={i} style={tabBtn(i)} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>

        {tab === 0 && (
          <div>
            <div style={{ fontSize: "var(--fs-h2)", fontWeight:700, color:"var(--text-primary)" }}>{ABOUT_ME.name}</div>
            <div style={{ fontSize: "var(--fs-small)", color:"var(--chart-2)", marginTop:3, marginBottom:14, letterSpacing:"0.5px" }}>
              {ABOUT_ME.tagline}
            </div>
            <p style={{ fontSize: "var(--fs-body)", color:"var(--text-secondary)", lineHeight:1.75, margin:"0 0 20px" }}>
              {ABOUT_ME.bio}
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {ABOUT_ME.links.filter(l => l.url).map(l => (
                <a key={l.label} href={l.url} target={l.url.startsWith("mailto:") ? "_self" : "_blank"} rel="noreferrer"
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    background:"var(--row-highlight)", border:"1px solid var(--tint-white-08)",
                    borderRadius:9, color:"var(--text-primary)", fontSize: "var(--fs-body)", fontWeight:600,
                    textDecoration:"none", transition:"background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background="rgba(96,165,250,0.12)"}
                  onMouseLeave={e => e.currentTarget.style.background="var(--row-highlight)"}
                >
                  <span style={{ fontSize: "var(--fs-h2)" }}>{l.icon}</span>
                  <span>{l.label}</span>
                  <span style={{ marginLeft:"auto", color:"var(--text-faint)", fontSize: "var(--fs-small)" }}>↗</span>
                </a>
              ))}
            </div>

            {ABOUT_THANKS?.people?.length > 0 && (
              <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid var(--tint-white-08)" }}>
                <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 8 }}>
                  ⭐ Special thanks
                </div>
                <p style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 14 }}>
                  {ABOUT_THANKS.intro}
                </p>
                <div style={{ fontSize: "var(--fs-body)", color: "var(--text-primary)", lineHeight: 1.9 }}>
                  {ABOUT_THANKS.people.map((pr, i) => (
                    <span key={pr.handle} title={pr.note || undefined} style={{ whiteSpace: "nowrap" }}>
                      {i > 0 && <span style={{ color: "var(--text-faint)", margin: "0 8px" }}>·</span>}
                      {pr.url ? (
                        <a href={pr.url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "var(--text-faint)" }}>{pr.handle}</a>
                      ) : pr.handle}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 1 && (
          <div>
            <div style={{ fontSize: "var(--fs-body)", color:"var(--chart-2)", fontWeight:600, marginBottom:10 }}>
              {ABOUT_PRODUCT.tagline}
            </div>
            <p style={{ fontSize: "var(--fs-body)", color:"var(--text-secondary)", lineHeight:1.75, margin:"0 0 18px" }}>
              {ABOUT_PRODUCT.description}
            </p>
            <div style={{ fontSize: "var(--fs-label)", fontWeight:700, color:"var(--text-secondary)", marginBottom:10, letterSpacing:"0.5px" }}>
              Key Capabilities
            </div>
            <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8 }}>
              {ABOUT_PRODUCT.bullets.map((b, i) => (
                <li key={i} style={{ display:"flex", gap:10, fontSize: "var(--fs-body)", color:"var(--text-secondary)" }}>
                  <Dot tone="ok" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={() => setOpen(false)}
          style={{ marginTop:22, width:"100%", background:"rgba(96,165,250,0.08)",
            border:"1px solid rgba(96,165,250,0.25)", borderRadius:8, padding:"9px 0",
            color:"var(--chart-2)", fontSize: "var(--fs-body)", fontWeight:600, cursor:"pointer" }}>
          Close
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button className="mbtn" onClick={() => { setTab(0); setOpen(true); }}>
        About
      </button>
      {overlay}
    </>
  );
}

function HelpButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button className="mbtn" onClick={() => setOpen(true)} title="Look up how a feature or number works">
        Help
      </button>
      {open && <HelpPage entries={ABOUT_FEATURES} onClose={() => setOpen(false)} />}
    </>
  );
}

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
          color: "var(--chart-2)", fontSize: "var(--fs-small)", fontWeight: 700, fontStyle: "normal", lineHeight: 1,
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
            padding: "9px 11px", fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.55, fontWeight: 400,
            textAlign: "left", zIndex: 100001, boxShadow: "0 10px 30px var(--tint-black-60)", pointerEvents: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function ModalLede({ children }) {
  return <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.5, marginBottom: 10 }}>{children}</div>;
}
function ModalP({ children }) {
  return <p style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.75, margin: "0 0 10px" }}>{children}</p>;
}
function Em({ children, color = "var(--text-primary)" }) {
  return <strong style={{ color, fontWeight: 700 }}>{children}</strong>;
}
function ModalNote({ children, accent = "var(--accent-gold)", icon = "→" }) {
  return (
    <div style={{ display: "flex", gap: 9, background: withAlpha(accent, "12"), border: `1px solid ${withAlpha(accent, "33")}`,
      borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: "10px 12px", marginTop: 4 }}>
      <span aria-hidden="true" style={{ color: accent, fontWeight: 800, flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
      <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function InfoModal({ title, children, accent = "var(--chart-2)", trigger, maxWidth = 480, bodyMaxHeight = null, open: controlledOpen, onClose }) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const trigRef = React.useRef(null);
  const setOpen = (next) => {
    if (isControlled) { if (!next && onClose) onClose(); }
    else setUncontrolledOpen(next);
    if (!next) trigRef.current?.focus();
  };
  const trigProps = {
    ref: trigRef, role: "button", tabIndex: 0, "aria-haspopup": "dialog", className: "info-trig",
    onClick: () => setOpen(true),
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } },
  };
  const overlay = open ? ReactDOM.createPortal(
    <div
      onClick={() => setOpen(false)}
      style={{ position:"fixed", inset:0, background:"var(--tint-black-60)", zIndex:99999,
        display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus(); }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
        onClick={e => e.stopPropagation()}
        style={{ outline:"none", background:"#0f1729", border:`1px solid ${withAlpha(accent, "44")}`, borderRadius:12,
          padding:28, maxWidth, width:"100%", boxShadow:"0 24px 60px var(--tint-black-60)",
          maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12,
          marginBottom:18, paddingBottom:12, borderBottom:`1px solid ${withAlpha(accent, "22")}`, flexShrink: 0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
            <span aria-hidden="true" style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
              width:28, height:28, borderRadius:8, background:withAlpha(accent, "1a"),
              border:`1px solid ${withAlpha(accent, "44")}`, color:accent, fontSize: "var(--fs-body)", fontWeight:800, flexShrink:0 }}>ⓘ</span>
            <div style={{ fontSize: "var(--fs-h2)", fontWeight:800, color:"var(--text-primary)", lineHeight:1.3,
              borderBottom:`2.5px solid ${accent}`, paddingBottom:4 }}>{title}</div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close"
            style={{ background:"transparent", border:"none", color:"var(--text-muted)",
              cursor:"pointer", fontSize: "var(--fs-h2)", lineHeight:1, marginTop:2, flexShrink:0 }}>×</button>
        </div>
        <div style={{ fontSize: "var(--fs-body)", color:"var(--text-secondary)", lineHeight:1.7,
          ...(bodyMaxHeight ? { maxHeight: bodyMaxHeight, overflowY: "auto", paddingRight: 6 } : {}) }}>{children}</div>
        <button onClick={() => setOpen(false)}
          style={{ marginTop:20, width:"100%", background:withAlpha(accent, "22"),
            border:`1px solid ${withAlpha(accent, "44")}`, borderRadius:8, padding:"8px 0",
            color:accent, fontSize: "var(--fs-body)", fontWeight:600, cursor:"pointer", flexShrink: 0 }}>
          Got it
        </button>
      </div>
    </div>,
    document.body
  ) : null;
  return (
    <>
      {trigger ? (
        <span {...trigProps} style={{ cursor:"pointer", display:"inline-flex" }}>
          {trigger}
        </span>
      ) : isControlled ? null : (
        <span
          {...trigProps} aria-label="More info"
          style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
            width:16, height:16, borderRadius:"50%", background:"var(--card-border)",
            border:`1px solid ${withAlpha(accent, "44")}`, color:accent, fontSize: "var(--fs-small)", fontWeight:700,
            cursor:"pointer", flexShrink:0 }}
          title="Click for more info"
        >?</span>
      )}
      {overlay}
    </>
  );
}

function ThInfo({ children, tip, style, accent = "#93c5fd", modalTitle, ...rest }) {
  const paras = String(tip)
    .replace(/&#10;/g, "\n")
    .split(/\n\s*\n/)
    .filter(Boolean);
  return (
    <th style={style} {...rest}>
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

function Slider({ label, value, min, max, step, stepNudge, format, onChange, quickPills, accent, titleHint, valueWidth, dataLever }) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  const trackRef = useRef(null);

  const nudge = stepNudge || step;
  const handleDec = useCallback((e) => {
    e?.stopPropagation();
    const next = Math.min(value, Math.max(min, Number((value - nudge).toFixed(4))));
    onChange(next);
  }, [value, min, nudge, onChange]);

  const handleInc = useCallback((e) => {
    e?.stopPropagation();
    const next = Math.max(value, Math.min(max, Number((value + nudge).toFixed(4))));
    onChange(next);
  }, [value, max, nudge, onChange]);

const [draft, setDraft] = useState(null);
  const commitDraft = useCallback(() => {
    if (draft !== null) {
      const n = parseMoneyInput(draft, min);
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
              background: "var(--tint-white-12)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${pct}%`,
              height: 6,
              borderRadius: 3,
              background: accent || "linear-gradient(90deg,#0d9488,var(--positive))",
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
              border: "2.5px solid var(--positive)",
              boxShadow: "0 1px 4px var(--tint-black-50)",
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
    <div className="sl-row" data-lever={dataLever}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="sl-label" title={titleHint || undefined} style={titleHint ? { cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: 2 } : undefined}>{label}</span>
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
            style={valueWidth ? { minWidth: valueWidth, maxWidth: valueWidth } : undefined}
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
            background: "var(--tint-white-12)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            height: 6,
            borderRadius: 3,
            background: accent || "linear-gradient(90deg,#0d9488,var(--positive))",
            boxShadow: "0 0 10px var(--tint-sky-30)",
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
            border: "2.5px solid var(--positive)",
            boxShadow: "0 2px 6px var(--tint-black-60)",
            cursor: "grab",
            zIndex: 2,
            transition: "transform 0.12s, box-shadow 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.25)";
            e.currentTarget.style.boxShadow = "0 0 12px rgba(90,209,240,0.8)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 2px 6px var(--tint-black-60)";
          }}
        />
      </div>

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
                  background: isActive ? "var(--tint-sky-20)" : "var(--tint-white-04)",
                  border: isActive ? "1px solid var(--positive)" : "1px solid var(--tint-white-08)",
                  color: isActive ? "#5ad1f0" : "var(--text-muted)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  fontSize: "var(--fs-small)",
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
function DualInput({ label, value, min, max, step, format, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)" }}>{label}</span>
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

const LS_PROFILE_KEY = "aira_profile_v1";

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
const LS_RESULTS_KEY = "aira_results_v1";
function saveResultsToLocal(sig, mc, stress) {
  try {
    localStorage.setItem(LS_RESULTS_KEY, JSON.stringify({
      sig, mc, stress, savedAt: new Date().toISOString(), buildTag: BUILD_TAG,
    }));
    return true;
  } catch {
    return false;
  }
}
function loadResultsFromLocal() {
  try {
    const raw = localStorage.getItem(LS_RESULTS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.buildTag !== BUILD_TAG) return null;
    if (typeof data.sig !== "string" || !data.mc || typeof data.mc.rate !== "number") return null;
    return data;
  } catch {
    return null;
  }
}
function fmtLastRun(iso) {
  try {
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return "";
    const mins = Math.floor((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const sameDay = then.toDateString() === new Date().toDateString();
    if (sameDay) return then.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return then.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
const LS_AIKEY_KEY = "aira_ai_key_v1";
export function saveProfileToLocal(values) {
  try {
    const { geminiApiKey, ...plan } = values;
    if (geminiApiKey) localStorage.setItem(LS_AIKEY_KEY, geminiApiKey);
    else if (geminiApiKey === "") localStorage.removeItem(LS_AIKEY_KEY);
    const hasPropIncome = (plan.properties || []).some(pr => Number(pr.income) > 0);
    const payload = {
      ...plan,
      ab: hasPropIncome ? 0 : (plan.ab || 0),
      fafsaEndYear: plan.fafsaEndYear || null,
      cssEndYear: plan.cssEndYear || null,
      savedAt: new Date().toISOString(),
      buildTag: BUILD_TAG,
    };
    localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
export function resetLocalProfile() {
  try {
    localStorage.removeItem(LS_PROFILE_KEY);
    localStorage.removeItem(LS_RESULTS_KEY);
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
    if (data && data.geminiApiKey) {
      localStorage.setItem(LS_AIKEY_KEY, data.geminiApiKey);
      const { geminiApiKey: _moved, ...rest } = data;
      localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(rest));
    }
    if (data) data.geminiApiKey = localStorage.getItem(LS_AIKEY_KEY) || "";
    if (data && data.spOutOfCountry == null && data.spSpendOutofState) {
      data.spOutOfCountry = data.spSpendOutofState;
    }
    if (data && data.rothConversionTarget && /^\d+$/.test(data.rothConversionTarget)) {
      data.rothConversionTarget = "fill_" + data.rothConversionTarget;
    }
    return migrateOrderingMode(migrateWithdrawalStrategy(data));
  } catch {
    return null;
  }
}
async function saveBlobAs(blob, filename, description, accept) {
  if (typeof window !== "undefined" && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportProfile(values, name = "AiRA_Profile") {
  const blob = new Blob([JSON.stringify(values, null, 2)], { type: "application/json" });
  return saveBlobAs(blob, `${name}_${new Date().toISOString().slice(0, 10)}.json`,
    "AiRA profile", { "application/json": [".json"] });
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
        
        if (!Array.isArray(parsed.accounts)) {
          parsed.accounts = BLANK_PROFILE.accounts;
        }
        
        if (!Array.isArray(parsed.properties)) {
          parsed.properties = BLANK_PROFILE.properties;
        } else {
            parsed.properties = parsed.properties.map((p, i) =>
              p.id ? { ...p, id: String(p.id) } : { ...p, id: "p" + (i + 1) }
            );
        }
        
        if (!Array.isArray(parsed.checkpoints)) {
          parsed.checkpoints = [];
        } else {
          parsed.checkpoints = parsed.checkpoints.map(cp =>
            cp.id != null ? { ...cp, id: String(cp.id) } : { ...cp, id: Date.now().toString() + Math.random() }
          );
        }
        
        if (!Array.isArray(parsed.otherIncomes)) {
          parsed.otherIncomes = [];
        }

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

const SSA_QX_MALE = [
  0.00520,0.00568,0.00619,0.00674,0.00733,
  0.00796,0.00865,0.00940,0.01022,0.01112,
  0.01213,0.01324,0.01446,0.01580,0.01729,
  0.01892,0.02069,0.02263,0.02475,0.02706,
  0.02960,0.03239,0.03548,0.03890,0.04267,
  0.04685,0.05149,0.05661,0.06224,0.06840,
  0.07514,0.08250,0.09054,0.09930,0.10882,
  0.11915,0.13033,0.14237,0.15527,0.16903,
  0.18359,0.19878,0.21432,0.22962,0.24419,
  0.25855,0.27357,0.28997,0.30826,0.32870,
  0.35148,
];
const SSA_QX_FEMALE = [
  0.00280,0.00304,0.00330,0.00359,0.00390,
  0.00425,0.00463,0.00507,0.00556,0.00612,
  0.00675,0.00746,0.00824,0.00909,0.01003,
  0.01107,0.01222,0.01349,0.01490,0.01646,
  0.01819,0.02012,0.02228,0.02469,0.02739,
  0.03044,0.03388,0.03774,0.04205,0.04683,
  0.05211,0.05793,0.06433,0.07134,0.07900,
  0.08733,0.09637,0.10613,0.11664,0.12795,
  0.14011,0.15315,0.16711,0.18203,0.19792,
  0.21476,0.23238,0.25058,0.26894,0.28700,
  0.30462,
];

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

function FanChart({ pcts, retireAge, ssAge, rmdAge, inf, useReal, title, checkpoints, earlyRetireTarget, dob, portfolioGoal, currentAge, currentPort, contrib, hhProfile, preRetireEq, hoveredAge, table }) {
  const [showTargets, setShowTargets] = useState(true);
  const [view, setView] = useState("chart");

  const rawData = useMemo(() => deflate(pcts, inf, useReal), [pcts, inf, useReal]);

  const accumData = useMemo(() => {
    if (!currentPort || currentAge == null || currentAge >= retireAge) return [];
    const ret = expectedReturn(preRetireEq ?? 91) / 100;
    let p = currentPort;
    const pts = [];
    for (let age = currentAge; age <= retireAge; age++) {
      pts.push({ age, accum: p });
      const add = hhProfile ? householdAnnualContribution(hhProfile, age) : (contrib || 0);
      const evIn = computeCashFlowEvents(
        hhProfile?.cashFlowEvents, CURRENT_YEAR + (age - currentAge), hhProfile?.inf ?? 2.5, CURRENT_YEAR,
      ).inflow;
      p = Math.round(p * (1 + ret) + add + evIn);
    }
    return pts;
  }, [currentPort, currentAge, retireAge, contrib, preRetireEq, hhProfile]);

  const data = useMemo(() => {
    if (!showTargets || accumData.length === 0) return rawData;
    const preRetire = accumData.slice(0, -1).map(d => ({ age: d.age, accum: d.accum }));
    const atRetire = rawData[0] ? { ...rawData[0], accum: accumData[accumData.length - 1].accum } : null;
    return [...preRetire, ...(atRetire ? [atRetire] : []), ...rawData.slice(atRetire ? 1 : 0)];
  }, [accumData, rawData, showTargets]);

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

  const nowPct = currentAge >= retireAge
    ? calcPercentile(currentPort, pcts.find(d => d.age === currentAge))
    : null;

  const maxY = useMemo(() => {
    if (!data || data.length === 0) return 5_000_000;
    const maxPortfolio = Math.max(...data.map(d => Math.max(d.p90 || 0, d.p75 || 0, d.p50 || 0, d.accum || 0)));
    return Math.max(maxPortfolio, portfolioGoal || 0, earlyRetireTarget || 0, currentPort || 0) * 1.05;
  }, [data, portfolioGoal, earlyRetireTarget, currentPort]);

  return (
    <div className="chart-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          {title && <div className="ct" style={{ margin: 0 }}>{title}</div>}
          {showTargets && (() => {
            const currentYear = new Date().getFullYear();
            const goalLine = (icon, name, amount, color) => {
              const cross = (pcts || []).find(d => d.p50 >= amount);
              const diff = cross ? cross.age - (retireAge || 65) : 0;
              const yrs = `${Math.abs(diff)} yr${Math.abs(diff) !== 1 ? "s" : ""}`;
              return (
                <span>
                  <strong style={{ color }}>{icon} {name} ${Math.round(amount).toLocaleString()}</strong>{" "}
                  {!cross
                    ? "not reached on the median path"
                    : `age ${cross.age} · ${currentYear + (cross.age - (currentAge || 60))} · ${diff < 0 ? `${yrs} before retirement` : diff === 0 ? "at retirement" : `${yrs} after retirement`}`}
                </span>
              );
            };
            return (
              <div style={{ display: "flex", gap: "2px 18px", flexWrap: "wrap", fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {goalLine("🚀", "Trigger", earlyRetireTarget, "var(--chart-9)")}
                {goalLine("🎯", "Reassess", portfolioGoal, "var(--accent-gold)")}
              </div>
            );
          })()}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {table && ["chart", "table"].map((k) => (
            <button key={k} type="button" className={`mbtn ${view === k ? "on" : ""}`} aria-pressed={view === k} onClick={() => setView(k)} style={{ padding: "3px 10px" }}>
              {k === "chart" ? "Chart" : "Table"}
            </button>
          ))}
          <Toggle val={showTargets} onChange={setShowTargets} label="Milestones" accent="var(--accent-gold)" />
        </div>
      </div>
      {view === "table" ? table : (<>
      <div style={{ height: "clamp(320px, 50vh, 640px)" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 28, right: 48, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="g90v5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="g75v5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="var(--row-highlight)"
          />
          <XAxis
            dataKey="age"
            stroke="var(--divider)"
            tickMargin={6}
            tick={{ fill: "var(--text-muted)", fontSize: "var(--fs-small)", fontFamily: "var(--font-mono)", letterSpacing: "0.01em" }}
          />
          <YAxis
            yAxisId="port"
            stroke="var(--divider)"
            tickMargin={4}
            tick={{ fill: "var(--text-muted)", fontSize: "var(--fs-small)", fontFamily: "var(--font-mono)" }}
            tickFormatter={(v) => fmtDollar(v)}
            width={MONEY_AXIS_WIDTH}
            domain={[0, maxY]}
          />
          <Tooltip content={<Tip />} />

          <ReferenceLine yAxisId="port" x={retireAge} stroke="var(--accent-gold)" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: "D-Day (Retirement Date)", fill: "var(--accent-gold)", fontSize: "var(--fs-small)", fontWeight: 600, position: "top" }} />
          <ReferenceLine yAxisId="port" x={ssAge} stroke="#c084fc" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: "SS", fill: "#c084fc", fontSize: "var(--fs-small)", fontWeight: 600, position: "top" }} />
          <ReferenceLine yAxisId="port" x={rmdAge} stroke="var(--positive)" strokeWidth={1} strokeDasharray="4 3" label={{ value: "RMD", fill: "var(--positive)", fontSize: "var(--fs-small)", fontWeight: 600, position: "top" }} />

          <Area yAxisId="port" type="monotone" dataKey="p90" stroke={FAN_COLORS["90th"]} strokeWidth={1} strokeDasharray="4 2" fill="url(#g90v5)" dot={false} name="90th" legendType="none" />
          <Area yAxisId="port" type="monotone" dataKey="p75" stroke={FAN_COLORS["75th"]} strokeWidth={1} strokeDasharray="3 2" fill="url(#g75v5)" dot={false} name="75th" legendType="none" />
          <Line yAxisId="port" type="monotone" dataKey="p50" stroke={FAN_COLORS["Median"]} strokeWidth={2.5} dot={false} name="Median" />
          <Line yAxisId="port" type="monotone" dataKey="p25" stroke={FAN_COLORS["25th"]} strokeWidth={1.5} dot={false} strokeDasharray="5 3" name="25th" />
          <Line yAxisId="port" type="monotone" dataKey="p10" stroke={FAN_COLORS["10th"]} strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="10th" />

          {hoveredAge != null && (() => {
            const row = data.find((d) => d.age === hoveredAge);
            if (!row) return null;
            const dot = (val, color) =>
              val == null ? null : (
                <ReferenceDot yAxisId="port" x={hoveredAge} y={val} r={4} fill={color} stroke="var(--bg-base)" strokeWidth={1.5} isFront />
              );
            return (
              <>
                <ReferenceLine yAxisId="port" x={hoveredAge} stroke="rgba(56,189,248,0.5)" strokeWidth={2}
                  label={{ value: `Age ${hoveredAge}`, fill: "var(--accent)", fontSize: "var(--fs-small)", position: "top" }} />
                {dot(row.p90, FAN_COLORS["90th"])}
                {dot(row.p75, FAN_COLORS["75th"])}
                {dot(row.p50, FAN_COLORS["Median"])}
                {dot(row.p25, FAN_COLORS["25th"])}
                {dot(row.p10, FAN_COLORS["10th"])}
              </>
            );
          })()}

          {showTargets && accumData.length > 0 && (
            <Line yAxisId="port" type="monotone" dataKey="accum" stroke="var(--chart-2)" strokeWidth={2}
              strokeDasharray="6 3" dot={false} name="Expected path" connectNulls={false} />
          )}

          {showTargets && currentAge != null && currentPort != null && (
            <ReferenceDot
              yAxisId="port"
              x={currentAge} y={currentPort} r={7}
              fill="var(--chart-2)" stroke="#0f1729" strokeWidth={2}
              label={{ value: nowPct ? `▶ Now · ${nowPct} %ile` : "▶ Now", fill: "var(--chart-2)", fontSize: "var(--fs-small)", position: "top" }}
            />
          )}

          {(() => {
            if (!checkpoints || !dob) return null;
            const labeledAges = new Set();
            return checkpoints.map((cp) => {
              if (!cp.date) return null;
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
                  label={showLabel ? { value: labelText, fill: color, fontSize: "var(--fs-small)", position: "top" } : undefined}
                />
              );
            });
          })()}

          {showTargets && <ReferenceLine
            yAxisId="port"
            y={portfolioGoal}
            stroke="var(--accent-gold)"
            strokeWidth={2.5}
            strokeDasharray="0"
            label={{
              value: `🎯 Reassess $${Math.round(portfolioGoal).toLocaleString()}`,
              fill: "var(--bg-base)",
              fontSize: "var(--fs-label)",
              fontWeight: 700,
              position: "right",
              style: { background: "var(--accent-gold)", padding: "4px 8px", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }
            }}
          />}
          {showTargets && <ReferenceLine
            yAxisId="port"
            y={earlyRetireTarget}
            stroke="var(--chart-9)"
            strokeWidth={2.5}
            strokeDasharray="0"
            label={{
              value: `🚀 Trigger $${Math.round(earlyRetireTarget).toLocaleString()}`,
              fill: "#fff",
              fontSize: "var(--fs-label)",
              fontWeight: 700,
              position: "right",
              style: { background: "var(--chart-9)", padding: "4px 8px", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }
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
                    r={6} fill="var(--accent-gold)" stroke="var(--bg-base)" strokeWidth={2}
                    label={{ value: `Age ${reassessCross.age}`, fill: "var(--accent-gold)", fontSize: "var(--fs-small)", position: "top" }}
                  />
                )}
                {triggerCross && (
                  <ReferenceDot
                    yAxisId="port"
                    x={triggerCross.age} y={earlyRetireTarget}
                    r={6} fill="var(--chart-9)" stroke="var(--bg-base)" strokeWidth={2}
                    label={{ value: `Age ${triggerCross.age}`, fill: "var(--chart-9)", fontSize: "var(--fs-small)", position: "top" }}
                  />
                )}
              </>
            );
          })()}
        </ComposedChart>
      </ResponsiveContainer>
      </div>

      <div className="leg">
        {[
          ...(showTargets && accumData.length > 0 ? [{ c: "var(--chart-2)", l: "Expected path" }] : []),
          { c: FAN_COLORS["Median"], l: "Median" },
          { c: `linear-gradient(90deg, ${FAN_COLORS["75th"]} 50%, ${FAN_COLORS["25th"]} 50%)`, l: "75th / 25th %ile" },
          { c: `linear-gradient(90deg, ${FAN_COLORS["90th"]} 50%, ${FAN_COLORS["10th"]} 50%)`, l: "90th / 10th %ile" },
        ].map((i) => (
          <div key={i.l} className="li">
            <div className="ll" style={{ background: i.c }} />
            {i.l}
          </div>
        ))}
      </div>
      </>)}
    </div>
  );
}

function categorizeCarveouts(carveouts, yr, inf) {
  const iF = Math.pow(1 + (inf ?? 2.5) / 100, yr - new Date().getFullYear());
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

const INCOME_CATS = [
  [INCOME_LABELS.savingsDrawdown, "var(--accent-teal)"],
  ["Social Security", withAlpha("#7c3aed", "cc")],
  ["Annuity/Rental", withAlpha("#295ff1", "cc")],
  ["Pension/Other", withAlpha("#eab308", "cc")],
  ["One-Off Income", withAlpha("#ec4899", "cc")],
  ["Roth Conversion", "var(--accent-gold)"],
];

const EXPENSE_CATS = [
  ["General/Living", "var(--accent)"],
  ["Mortgage/Housing", "var(--chart-3)"],
  ["Medical", "var(--positive)"],
  ["Long-Term Care", "var(--accent-purple)"],
  ["Other Expenses", "var(--text-secondary)"],
  ["Income Tax", "var(--chart-1)"],
  ["Capital Gains Tax", "var(--text-muted)"],
  ["Moved to Roth", "var(--accent-gold)"],
  ["Saved to Accounts", withAlpha("#ec4899", "cc")],
];

export function savingsDrawdownOf(r) {
  const convTaxPaid = (r.convTaxFromCash || 0) + (r.convTaxFromTaxable || 0) + (r.convTaxFromPretax || 0);
  const convTaxWithheld = (r.conversionAmount || 0) - (r.convToRoth ?? r.conversionAmount ?? 0);
  return r.fromCash + r.fromTaxable + r.fromPretax + r.fromRoth + (r.rmd || 0) - (r.rmdSurplus || 0)
    + convTaxPaid - convTaxWithheld;
}

export function incomeExpenseRow(r, carveouts, inf) {
  const { medical, ltc, other } = categorizeCarveouts(carveouts, r.yr, inf);
  return {
    yr: r.yr, age: r.age,
    "Social Security": r.ss,
    "Annuity/Rental": r.annuityRental,
    "Pension/Other": r.otherIncome,
    [INCOME_LABELS.savingsDrawdown]: savingsDrawdownOf(r),
    "One-Off Income": r.eventInflow || 0,
    "Roth Conversion": r.conversionAmount,
    "General/Living": r.spending,
    "Mortgage/Housing": r.housingCost,
    "Medical": medical,
    "Long-Term Care": ltc,
    "Other Expenses": other + (r.eventCost || 0),
    "Income Tax": r.fedTax + r.stateTax + r.irmaa + (r.earlyPenalty || 0),
    "Capital Gains Tax": 0,
    "Moved to Roth": r.convToRoth ?? r.conversionAmount ?? 0,
    "Saved to Accounts": (r.eventInflow || 0) + (r.surplusToTaxable || 0),
  };
}

function IncomeExpensesChart({ p, inf }) {
  const rows = useMemo(() => waterfallForActiveStrategy(p)?.smart?.rows ?? [], [p]);

  const data = useMemo(() => rows.map((r) => incomeExpenseRow(r, p.carveouts, inf)), [rows, p.carveouts, inf]);

  const [hoverYr, setHoverYr] = useState(null);
  const hoverRow = hoverYr != null ? data.find((d) => d.yr === hoverYr) : null;
  const onMove = (e) => { if (e && e.activeLabel != null) setHoverYr(e.activeLabel); };
  const onLeave = () => setHoverYr(null);

  if (!data.length) return null;

  return (
    <>
      <IncomeExpenseStack
        title="Estimated Income, Drawdowns & Roth Conversions"
        subtitle={`Sourced from the Smart Waterfall plan — hover a year to see its breakdown on the right. Retirement years only (${data[0]?.yr} onward): money arriving before then is already inside the balances these years start from.`}
        data={data} categories={INCOME_CATS}
        hoverYr={hoverYr} hoverRow={hoverRow}
        onMove={onMove} onLeave={onLeave}
        footnote="Where each row comes from: Annuity/Rental = your Annuity/Benefit input plus each property's Annual income. Social Security and Pension/Other come from their own inputs. Withdrawals from 401(k)/IRA, taxable, cash and Roth accounts are all in Savings & 401(k)/IRA Drawdown, never in Annuity/Rental."
      />
      <IncomeExpenseStack
        title="Estimated Expenses"
        subtitle="Living costs, housing, taxes, and carveouts (e.g. medical, long-term care) — hover a year for its breakdown"
        data={data} categories={EXPENSE_CATS}
        hoverYr={hoverYr} hoverRow={hoverRow}
        onMove={onMove} onLeave={onLeave}
        dashKeys={notEnteredKeys(p)}
        zeroNotes={{ "Mortgage/Housing": housingRowNote(p, data.reduce((a, d) => a + (d["Mortgage/Housing"] || 0), 0)) }}
        reconcile
        footnote="A dash means nothing was entered for that row, which is not the same as zero cost: Medical, Long-Term Care and Other Expenses appear only if you add carveouts (or Planned One-Off Expenses), and Mortgage/Housing says why when it is empty (nothing entered, housing already inside your spending, or the loan is paid off before these years begin). Only the primary property's mortgage is charged as a payment. Capital Gains Tax is not yet separately modeled (shown as —) — realized gains on taxable-account draws are folded into Income Tax. Moved to Roth is this year's conversion after any tax withheld from it; Saved to Accounts is one-off income and income beyond what you spend, both deposited back into your accounts. Each year's total matches the Income chart."
      />
      {p.ssAge > p.retireAge && (
        <div className="flag-w" style={{ fontSize: "var(--fs-small)" }}>
          Social Security gap, ages {p.retireAge}–{p.ssAge - 1} — with no SS yet, your
          portfolio carries the full spending need (the green Savings &amp; 401(k)/IRA Drawdown above is
          largest here). This is the highest sequence-of-returns risk window.
        </div>
      )}
    </>
  );
}

function ReconLine({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", fontSize: "var(--fs-small)" }}>
      <div style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
        {label}
      </div>
      <div style={{ color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace" }}>
        {value < 0 ? `−${fmtDollar(Math.abs(value))}` : fmtDollar(value)}
      </div>
    </div>
  );
}

export function notEnteredKeys(p) {
  const keys = ["Capital Gains Tax"];
  const oneOffOut = (p.cashFlowEvents || []).some((e) => e.direction !== "in");
  if (!(p.carveouts || []).length) keys.push("Medical", "Long-Term Care", ...(oneOffOut ? [] : ["Other Expenses"]));
  if (!(p.mortBalance > 0)) keys.push("Mortgage/Housing");
  return keys;
}

export function housingRowNote(p, lifetimeTotal) {
  const type = p.housingType || "own";
  if (type === "none") return "included in your spending";
  if (type === "rent") return p.annualRent > 0 ? "" : "no rent entered";
  if (!(p.mortBalance > 0)) return "no mortgage entered";
  return lifetimeTotal > 0 ? "" : "paid off before retirement";
}

function IncomeExpenseStack({ title, subtitle, data, categories, hoverYr, hoverRow, onMove, onLeave, footnote, reconcile, dashKeys = [], zeroNotes = {} }) {
  const rows = categories.map(([key, color]) => ({
    key, color,
    value: hoverRow ? (hoverRow[key] || 0) : data.reduce((s, d) => s + (d[key] || 0), 0),
  }));
  const total = rows.reduce((s, r) => s + r.value, 0);

  const sumKey = (k) => hoverRow ? (hoverRow[k] || 0) : data.reduce((s, d) => s + (d[k] || 0), 0);
  const recon = reconcile ? (() => {
    const otherIncome  = sumKey("Social Security") + sumKey("Annuity/Rental") + sumKey("Pension/Other")
      + sumKey("One-Off Income") + sumKey("Roth Conversion");
    const draw         = sumKey(INCOME_LABELS.savingsDrawdown);
    const spendNeed    = sumKey("General/Living") + sumKey("Mortgage/Housing") + sumKey("Medical")
      + sumKey("Long-Term Care") + sumKey("Other Expenses");
    const taxes        = sumKey("Income Tax") + sumKey("Capital Gains Tax");
    const kept         = sumKey("Moved to Roth") + sumKey("Saved to Accounts");
    return { otherIncome, draw, spendNeed, taxes, kept };
  })() : null;

  return (
    <div className="chart-card">
      <div className="ct">{title}</div>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 8 }}>{subtitle}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 12 }}>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onMouseMove={onMove} onMouseLeave={onLeave}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="yr" stroke="#1e3a5f" tick={{ fill: "#71a8f7", fontSize: "var(--fs-small)" }} />
            <YAxis stroke="#1e3a5f" tick={{ fill: "#71a8f7", fontSize: "var(--fs-small)" }} tickFormatter={(v) => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
            <Tooltip content={<Tip />} />
            {categories.map(([key, color], i) => (
              <Bar key={key} dataKey={key} stackId="a" fill={color} radius={i === categories.length - 1 ? [2, 2, 0, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div style={{ background: "var(--tint-white-02)", border: "1px solid var(--tint-white-06)", borderRadius: 8, padding: 12, fontSize: "var(--fs-label)", alignSelf: "start" }}>
          <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
            {hoverYr != null ? `Year ${hoverYr}` : "Lifetime"}
          </div>
          {rows.map(({ key, color, value }) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: "inline-block" }} />
                <span>
                  {key}
                  {value === 0 && zeroNotes[key] && <span style={{ display: "block", fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{zeroNotes[key]}</span>}
                </span>
              </div>
              <div style={{ color: "var(--text-primary)", fontFamily: "'JetBrains Mono',monospace" }}>{value === 0 && (zeroNotes[key] || dashKeys.includes(key)) ? "—" : fmtDollar(value)}</div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--tint-white-08)", marginTop: 8, paddingTop: 6, fontWeight: 700 }}>
            <div style={{ color: "var(--text-primary)" }}>Total</div>
            <div style={{ color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(total)}</div>
          </div>

          {recon && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--tint-white-12)" }}>
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                What your portfolio must cover
              </div>
              <ReconLine label="Spending, housing, carveouts, one-offs" value={recon.spendNeed} color="var(--text-secondary)" />
              <ReconLine label="+ Taxes" value={recon.taxes} color="var(--chart-1)" />
              <ReconLine label="+ Moved to Roth / saved to accounts" value={recon.kept} color="var(--accent-gold)" />
              <ReconLine label="− Other income (SS, rental, pension, one-off, conversion)" value={-recon.otherIncome} color="#7c3aed" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--tint-white-08)", marginTop: 6, paddingTop: 6, fontWeight: 700 }}>
                <div style={{ color: "var(--chart-11)" }}>= Drawn from savings</div>
                <div style={{ color: "var(--chart-11)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(recon.draw)}</div>
              </div>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                “Drawn from savings” is the green <strong style={{ color: "var(--chart-11)" }}>Savings &amp; 401(k)/IRA Drawdown</strong> bar above, including RMDs and the tax the draws themselves cause. These lines add up exactly, so the two charts have the same total every year.
              </div>
            </div>
          )}
        </div>
      </div>
      {footnote && <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>ℹ️ {footnote}</div>}
    </div>
  );
}

const PROFILE_TO_ROTHMODE = {
  off: "no_convert",
  irmaa: "irmaa_safe",
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
  const rothMode = PROFILE_TO_ROTHMODE[params?.rothConversionTarget] ?? "fill_22";
  const setRothMode = (mode) => {
    if (onAssumptionChange) onAssumptionChange("rothConversionTarget", ROTHMODE_TO_PROFILE[mode] ?? "fill_22");
  };

  const currentCalYear = new Date().getFullYear() + 1;
  const [cyYear,   setCyYear]   = useState(currentCalYear);
  const [cyW2,     setCyW2]     = useState(0);
  const [cySS,     setCySS]     = useState(0);
  const [cyRental, setCyRental] = useState(0);
  const [cyOther,  setCyOther]  = useState(0);
  const profileCashForTaxes = expandAccountBuckets(params?.accounts || [])
    .filter(a => a.bucket === 1)
    .reduce((s, a) => s + (a.balance || 0), 0);
  const [cySGOVOverride, setCySGOVOverride] = useState(null);
  const cySGOV = cySGOVOverride ?? profileCashForTaxes;

  const loadPinIntoCalculator = (pin) => {
    if (!pin) return;
    if (pin.w2     !== undefined) setCyW2(pin.w2);
    if (pin.ss     !== undefined) setCySS(pin.ss);
    if (pin.rental !== undefined) setCyRental(pin.rental);
    if (pin.other  !== undefined) setCyOther(pin.other);
    if (pin.sgov   !== undefined) setCySGOVOverride(pin.sgov === profileCashForTaxes ? null : pin.sgov);
  };
  useEffect(() => {
    loadPinIntoCalculator((params?.conversionOverrides || []).find(o => Number(o.year) === Number(cyYear)));
    // eslint-disable-next-line
  }, [cyYear, params?.conversionOverrides]);

  const ex = useMemo(
    () => buildWaterfallComparison(params ?? {}, rothMode),
    [params, rothMode]
  );

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

  const convRows = useMemo(
    () => buildConversionLadder(params ?? {}, rothMode).rows,
    [params, rothMode]
  );

  const conversionPlan = useMemo(
    () => buildConversionPlan(params ?? {}),
    [params]
  );

const state = params.stateOfResidence || "NJ";
const domLabel = isNoTaxState
  ? "No Tax State Move or Out of Country"
  : `${state} Domicile (with tax)`;
  const domColor = isNoTaxState ? "var(--positive)" : "var(--chart-3)";
  
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
    fill_24: "Aggressive — fill to 24%. IRMAA risk at 65 (2‑yr lookback).",
    fill_32: "Very aggressive — fill to 32%. IRMAA and NIIT implications.",
    fill_35: "High income — fill to 35%. Only for large conversions.",
    fill_37: "Maximum — fill to 37%. Rarely optimal; consult CPA.",
    irmaa_safe: "Dynamic — fills 22% normally, auto‑throttles near IRMAA threshold.",
};

  const InputsPanel = () => (
    <div
      style={{
        background: "var(--tint-white-02)",
        border: "1px solid var(--tint-white-08)",
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
            fontSize: "var(--fs-small)",
          }}
        >
          {[
            ["Domicile", domLabel, domColor],
            ["Filing Status", filingStatus === "mfj" ? "MFJ" : "Single", "var(--text-secondary)"],
            ["Bracket Target", modeLabels[rothMode], "var(--accent-teal)"],
            [
              "Std Deduction (under 65)",
              fmtDollar(getStandardDeduction(64, filingStatus, 1)) +
                " (indexed " + params.inf + "%/yr; higher from 65)",
              "var(--text-secondary)",
            ],
            [
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
                borderBottom: "1px solid var(--tint-white-04)",
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
        <PillTab
          ariaLabel="Roth conversion view"
          size="sm"
          options={[
            ["thisyear", "Tax Room"],
            ["optimized", "Conversion Plan"],
            ["taxes", "Taxes"],
            ["table", "Year-by-Year"],
            ["scenarios", "3-Scenario"],
          ]}
          value={view}
          onChange={setView}
          accentFor={(k) => (k === "thisyear" ? "var(--accent-gold)" : INFO_ACCENT.method)}
        />
        </div>
        <button
          onClick={() => setShowInputs(!showInputs)}
          style={{
            padding: "3px 8px",
            borderRadius: 5,
            border: "1px solid var(--tint-white-10)",
            cursor: "pointer",
            fontSize: "var(--fs-small)",
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
            fontSize: "var(--fs-small)",
            color: "var(--text-faint)",
            letterSpacing: "0.08em",
          }}
        >
          Bracket Fill Strategy
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>

          <PillTab
            ariaLabel="Bracket fill strategy"
            size="sm"
            options={Object.entries(modeLabels)}
            value={rothMode}
            onChange={setRothMode}
            accentFor={(k) => {
              if (["fill_32", "fill_35", "fill_37"].includes(k)) return "var(--negative)";
              if (k === "fill_24") return "var(--accent-gold)";
              if (["no_convert", "fill_10", "fill_12"].includes(k)) return "var(--positive)";
              return INFO_ACCENT.method;
            }}
          />
        </div>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", fontStyle: "italic" }}>
          {modeDescs[rothMode]}
        </div>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-small)" }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: 4, background: domColor }}
        />
        <span style={{ color: domColor, fontWeight: 600 }}>
          Domicile: {domLabel}
        </span>
        <span style={{ color: "var(--text-faint)" }}>
          · {isNoTaxState
            ? "Solo mode (lower spend, no state tax)"
            : `Both in ${params.stateOfResidence || "your state"} (full spend, state tax applies)`}
        </span>
      </div>
      {(() => {
        const _cy = new Date().getFullYear();
        const _pinned   = convRows.filter(r => r.capReason?.startsWith("manual") && r.yr >= _cy).length;
        const _forecast = convRows.filter(r => !r.capReason?.startsWith("manual") && r.yr >= _cy).length;
        const _past     = convRows.filter(r => r.yr < _cy).length;
        return (
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 6, display: "flex", gap: 16, alignItems: "center" }}>
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
          <div className="mv" style={{ color: "var(--accent-teal)", fontSize: "var(--fs-h1)" }}>
            {convRows.length}
          </div>
          <div className="ms">during plan window</div>
        </div>
        <div className="met" style={{ border: convRows.filter(r => r.capReason?.startsWith("manual")).length > 0 ? "1px solid rgba(244,211,94,0.3)" : undefined }}>
          <div className="ml">📌 Pinned / 🔮 Forecast</div>
          <div className="mv" style={{ fontSize: "var(--fs-body)" }}>
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
            style={{ color: taxD > 0 ? "var(--chart-3)" : "var(--positive)", fontSize: "var(--fs-h2)" }}
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
          <div className="mv" style={{ color: "var(--positive)", fontSize: "var(--fs-h1)" }}>
            {rmdRed}%
          </div>
          <div className="ms">lower forced distributions</div>
        </div>
        <div className="met">
          <div className="ml">Lifetime Eff. Rate</div>
          <div className="mv" style={{ color: "var(--accent-teal)", fontSize: "var(--fs-h2)" }}>
            {(leOpt * 100).toFixed(1)}% vs {(leCur * 100).toFixed(1)}%
          </div>
          <div className="ms">optimized vs current</div>
        </div>
      </div>
      {conversionPlan.totalTraditional > 0 && (
        <div
          style={{
            background: "var(--tint-sky-06)",
            border: "1px solid var(--tint-sky-25)",
            borderRadius: 8,
            padding: "10px 12px",
            marginTop: 8,
            fontSize: "var(--fs-small)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: "var(--fs-label)", fontWeight: 600, color: "var(--accent-teal)" }}>
              Recommended Conversion — Year 1: {fmtDollar(conversionPlan.recommendedSchedule[0]?.amount || 0)}
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              Matches the "Roth Conv" figure for {conversionPlan.recommendedSchedule[0]?.year ?? "year 1"} on the Withdrawal Schedule tab
            </div>
          </div>
          {conversionPlan.needs_schedule ? (
            <>
              <div style={{ color: "var(--accent-gold)", marginTop: 6 }}>
                A multi-year conversion schedule is recommended because:
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
        const infRate = (params?.inf ?? 2.5) / 100;
        const f       = Math.pow(1 + infRate, cyYear - CURRENT_YEAR);
        const fedBase = isMFJ ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE;
        const fB      = idxB(fedBase, f);
        const b12t    = fB.find(b => b.rate === 0.12)?.hi ?? 0;
        const b22t    = fB.find(b => b.rate === 0.22)?.hi ?? 0;
        const b24t    = fB.find(b => b.rate === 0.24)?.hi ?? 0;
        const b32t    = fB.find(b => b.rate === 0.32)?.hi ?? 0;
        const b35t    = fB.find(b => b.rate === 0.35)?.hi ?? 0;
        const b37t    = fB.find(b => b.rate === 0.37)?.hi ?? 0;

        const ssTaxable = Math.round(taxableSocialSecurity(cySS, cyW2 + cyRental + cyOther, isMFJ));
        const grossInc  = cyW2 + ssTaxable + cyRental + cyOther;
        const cyAge     = (params?.currentAge || 0) + (cyYear - CURRENT_YEAR);
        const stdD      = getStandardDeduction(cyAge, params?.filingStatus || "mfj", f);
        const cySeniorBonus = getSeniorBonusDeduction(
          cyAge, params?.filingStatus || "mfj", grossInc, cyYear
        );
        const dedD      = stdD + cySeniorBonus;
        const taxableBC = Math.max(0, grossInc - dedD);
        const fedTaxBC  = Math.round(progTax(taxableBC, fB));

        const stateBr   = getStateBrackets(params?.stateOfResidence || "NJ", isMFJ);
        const stTaxBC   = stateBr ? Math.round(progTax(taxableBC, stateBr)) : 0;

        const room12 = Math.max(0, b12t - taxableBC);
        const room22 = Math.max(0, b22t - taxableBC);
        const room24 = Math.max(0, b24t - taxableBC);
        const room32 = Math.max(0, b32t - taxableBC);
        const room35 = Math.max(0, b35t - taxableBC);
        const room37 = Math.max(0, b37t - taxableBC);

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

        let recConv, recTax, recNote;
        if (recRoom === 0) {
          recConv = 0; recTax = convTax(0); recNote = `Already above ${targetLabel} bracket — no room`;
        } else if (cySGOV <= 0) {
          recConv = recRoom; recTax = recRoomTax; recNote = "Enter Cash/Treasury/Short Term cash balance to check cash constraint";
        } else if (recRoomTax.total <= cySGOV) {
          recConv = recRoom; recTax = recRoomTax; recNote = `Cash/Treasury/Short Term cash covers full ${targetLabel} fill`;
        } else {
          const ratio = cySGOV / recRoomTax.total;
          recConv = Math.round(recRoom * ratio);
          recTax  = convTax(recConv);
          recNote = "Cash/Treasury/Short Term cash limits conversion — increase cash to fill full bracket";
        }

        const inputStyle = {
          width: "100%", background: "#0d1b2a", border: "1px solid #1e3a5f",
          color: "var(--text-primary)", borderRadius: 6, padding: "5px 8px", fontSize: "var(--fs-label)",
          fontFamily: "'JetBrains Mono',monospace", textAlign: "right",
        };
        const rowSep = { borderBottom: "1px solid var(--tint-white-04)", padding: "5px 0" };
        const fmtN = (n) => n === 0 ? "$0" : `$${Math.round(n).toLocaleString()}`;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <InfoModal
              title="How Tax Room and the Lifetime Ladder Work Together"
              accent="var(--accent-gold)"
              maxWidth={560}
              trigger={
                <span style={{ fontSize: "var(--fs-small)", color: "var(--accent-gold)", fontWeight: 600 }}>
                  ▸ How Tax Room and the Lifetime Ladder Work Together
                </span>
              }
            >
              <ModalP>
                <Em>Tax Room (this tab)</Em> is grounded in reality — you enter your actual known income
                for the year and get the exact conversion amount to hand your CPA. It reflects what you
                can actually do right now, not a forecast.
              </ModalP>
              <ModalP>
                <Em>Lifetime Ladder (Conversion Plan tab)</Em> projects conversions over every future year.
                For years where you have not saved a real number, it uses the bracket-fill optimizer —
                which does not know about your working income, Cash or Taxable/Brokerage balance, or IRMAA timing.
              </ModalP>
              <ModalNote>
                <Em color="var(--accent-gold)">Press "Save to Lifetime Ladder"</Em> to anchor the current year to your real number.
                The Ladder will then use the optimizer only for future years it does not have a pin for.
                Do this every December to keep the projection grounded year by year — the same way
                Monte Carlo checkpoints anchor the portfolio balance to reality.
              </ModalNote>
            </InfoModal>
            <div className="chart-card">
              <div className="ct">Current Year Conversion Calculator</div>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", fontStyle: "italic", marginBottom: 10 }}>
                    Enter your expected income for {cyYear}, then see how much bracket room remains 
                    for a Roth conversion. Give the recommended number to your CPA by December.
                  </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: "var(--fs-label)" }}>
                <div>
                  <div style={{ color: "var(--text-secondary)", marginBottom: 2, fontSize: "var(--fs-small)" }}>Tax Year &amp; Income</div>
                  <div style={{ color: "var(--text-faint)", marginBottom: 6, fontSize: "var(--fs-small)", lineHeight: 1.5 }}>
                    Enter <strong style={{ color: "var(--text-secondary)" }}>gross</strong> annual wages, not take-home pay: the W-2 Box 1 figure
                    (salary minus pre-tax 401(k) and health premiums). Do not subtract income tax, FICA or other withholding.
                    Self-employed: net profit.
                  </div>
                  {[
                    ["Tax Year",          cyYear,   setCyYear,   false, 2026, 2060],
                    ["W-2 Wages (Gross, Box 1)", cyW2, setCyW2,   true],
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
                  <div style={{ color: "var(--text-secondary)", marginBottom: 6, fontSize: "var(--fs-small)" }}>Cash Available for Taxes</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8, alignItems: "center", ...rowSep }}>
                    <span style={{ color: "var(--accent-gold)" }}>Cash/Treasury/Short Term cash for Taxes</span>
                    <input
                      type="number" value={cySGOV}
                      onChange={e => setCySGOVOverride(Number(e.target.value) || 0)}
                      min={0} step={1000} style={{ ...inputStyle, borderColor: "var(--accent-gold)" }}
                onFocus={selectAllOnFocus}
              />
                  </div>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 6 }}>
                    {cySGOVOverride != null
                      ? <>Overridden for this analysis · Bucket 1 (Cash) balance is {fmtN(profileCashForTaxes)}{" "}
                          <button
                            onClick={() => setCySGOVOverride(null)}
                            style={{ background: "none", border: "none", color: "var(--accent-teal)", cursor: "pointer", fontSize: "var(--fs-small)", textDecoration: "underline", padding: 0, fontFamily: "inherit" }}
                          >↺ reset to profile</button>
                        </>
                      : <>From Bucket 1 — Cash ({fmtN(profileCashForTaxes)}) — edit to refine for this analysis only.</>}
                  </div>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 6 }}>
                    Filing: {isMFJ ? "Married Filing Jointly" : "Single"} ·{" "}
                    State: {params?.stateOfResidence || "NJ"}{stateBr ? "" : " (no state tax)"}
                  </div>
                </div>
              </div>
            </div>

            <div className="chart-card">
              <div className="ct">Income Breakdown — Tax Year {cyYear}</div>
              <table className="roth-tbl">
                <tbody>
                  {[
                    ["W-2 wages (gross)",     fmtN(cyW2),      "var(--text-primary)"],
                    ["Social Security (taxable " + (cySS > 0 ? Math.round((ssTaxable / cySS) * 100) : 0) + "%)", fmtN(ssTaxable), "var(--text-primary)"],
                    ["Rental / Airbnb net",   fmtN(cyRental),   "var(--text-primary)"],
                    ["Other income",          fmtN(cyOther),    "var(--text-primary)"],
                    ["Gross income",          fmtN(grossInc),   "var(--accent-teal)"],
                    ["Standard deduction",    `(${fmtN(stdD)})`, "var(--chart-1)"],
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
                    <tr key={bracket} style={{ background: bracket === targetLabel ? "var(--tint-teal-600-08)" : undefined }}>
                      <td style={{ color: bracket === targetLabel ? "var(--accent-teal)" : "var(--text-secondary)", fontWeight: bracket === targetLabel ? 700 : 400 }}>{bracket}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace" }}>{fmtN(top)}</td>
                      <td style={{ color: room > 0 ? "var(--text-primary)" : "var(--text-faint)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtN(room)}</td>
                      <td style={{ color: "var(--chart-1)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtN(tax.fedInc)}</td>
                      <td style={{ color: stateBr ? "var(--chart-3)" : "var(--positive)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtN(tax.stInc)}</td>
                      <td style={{ color: "var(--chart-1)", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{fmtN(tax.total)}</td>
                      <td style={{ color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace" }}>
                        {room > 0 ? ((tax.total / room) * 100).toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="chart-card" style={{ border: "1px solid rgba(244,211,94,0.4)", background: "rgba(244,211,94,0.05)" }}>
              <div className="ct" style={{ color: "var(--accent-gold)" }}>Recommended Conversion — {cyYear}</div>
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
                      <div className="met" style={{ border: "1px solid rgba(244,211,94,0.3)" }}>
                        <div className="ml">Convert This Amount</div>
                        <div className="mv" style={{ color: "var(--accent-gold)", fontSize: "var(--fs-h1)" }}>{fmtN(recConv)}</div>
                        <div className="ms">pretax → Roth</div>
                      </div>
                      <div className="met" style={{ border: "1px solid var(--tint-red-30)" }}>
                        <div className="ml">Total Tax Cost</div>
                        <div className="mv" style={{ color: "var(--chart-1)", fontSize: "var(--fs-h1)" }}>{fmtN(recTax.total)}</div>
                        <div className="ms">fed {fmtN(recTax.fedInc)} + state {fmtN(recTax.stInc)}</div>
                      </div>
                      <div className="met" style={{ border: "1px solid var(--tint-sky-30)" }}>
                        <div className="ml">Net → Roth</div>
                        <div className="mv" style={{ color: "var(--accent-teal)", fontSize: "var(--fs-h1)" }}>{fmtN(cyNetRoth)}</div>
                        <div className="ms">{cyFundLabel}</div>
                      </div>
                    </div>
                    <div style={{ background: "var(--bg-warning)", border: "1px solid rgba(244,211,94,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: "var(--fs-label)", color: "var(--accent-gold)", fontWeight: 600 }}>
                      Give this to your CPA: Convert {fmtN(recConv)} from pretax to Roth in {cyYear}. {cyCpaTax}
                    </div>
                  </>
                );
              })()}
              {recNote && (
                <div style={{ marginTop: 8, fontSize: "var(--fs-small)", color: "var(--text-secondary)" }}>{recNote}</div>
              )}
              {(() => {
                const cyPin = (params?.conversionOverrides || []).find(o => Number(o.year) === cyYear);
                return (
                  <>
                    {cyPin && (
                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, background: "rgba(167,139,250,0.08)", border: "1px solid var(--tint-violet-400-30)", borderRadius: 8, padding: "8px 12px" }}>
                        <span style={{ fontSize: "var(--fs-label)", color: "var(--accent-purple)", fontWeight: 600, flex: 1 }}>
                          📌 Pinned for {cyYear}: {fmtN(cyPin.amount)}
                        </span>
                        {onRemoveConversionOverride && (
                          <button
                            onClick={() => onRemoveConversionOverride(cyYear)}
                            style={{ background: "var(--tint-red-15)", border: "1px solid var(--tint-red-30)", color: "var(--chart-1)", borderRadius: 5, cursor: "pointer", fontSize: "var(--fs-label)", padding: "3px 10px", fontFamily: "inherit" }}
                          >× Remove pin</button>
                        )}
                      </div>
                    )}
                    {recConv > 0 && onSaveConversionOverride && (
                      <button
                        onClick={() => {
                          onSaveConversionOverride(cyYear, recConv, { w2: cyW2, ss: cySS, rental: cyRental, other: cyOther, sgov: cySGOV });
                          alert(`Saved: Convert ${fmtN(recConv)} in ${cyYear} to your Lifetime Projection ladder.`);
                        }}
                        style={{
                          marginTop: 8, width: "100%", padding: "10px 0",
                          background: "rgba(244,211,94,0.2)", border: "1px solid var(--accent-gold)",
                          color: "var(--accent-gold)", borderRadius: 8, cursor: "pointer",
                          fontSize: "var(--fs-body)", fontWeight: 700, fontFamily: "inherit",
                        }}
                      >
                        {cyPin ? "↺ Update Lifetime Ladder pin" : "→ Save to Lifetime Ladder"}
                      </button>
                    )}
                  </>
                );
              })()}
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
                  tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }}
                  tickFormatter={(v) => fmtDollar(v)}
                  width={MONEY_AXIS_WIDTH}
                />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: "var(--fs-small)" }} />
                <Bar dataKey="10%" stackId="br" fill="#1d4ed8" name="10%" />
                <Bar dataKey="12%" stackId="br" fill="#0ea5e9" name="12%" />
                <Bar dataKey="22%" stackId="br" fill="var(--accent-teal)" name="22%" />
                <Bar dataKey="24%" stackId="br" fill="var(--accent-gold)" name="24%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="32%" stackId="br" fill="var(--chart-7)" name="32%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="35%" stackId="br" fill="var(--negative)" name="35%" radius={[4, 4, 0, 0]} />
                <Bar dataKey="37%" stackId="br" fill="#991b1b" name="37%" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", margin: "8px 0 4px", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>📌 <span style={{ color: "var(--accent-gold)" }}>Amber</span> = pinned from Tax Room or manual entry</span>
              <span>🔮 <span style={{ color: "var(--accent-teal)" }}>Default</span> = optimizer projection</span>
              <span>📅 <span style={{ color: "var(--text-faint)" }}>Gray</span> = historical (already past)</span>
              <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
                Net→Roth basis:{" "}
                {params?.taxFunding === "from_conv"
                  ? <span style={{ color: "var(--chart-1)" }}>From conversion (Conv − total tax)</span>
                  : params?.taxFunding === "outside_cash"
                  ? <span style={{ color: "var(--positive)" }}>Outside cash (full conversion)</span>
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
                    ? "var(--tint-white-02)"
                    : isPinned
                    ? "rgba(244,211,94,0.07)"
                    : undefined;
                  const sourceLabel = isPast
                    ? <span style={{ color: "var(--text-faint)", fontSize: "var(--fs-small)" }}>📅 Past</span>
                    : isPinned
                    ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontSize: "var(--fs-small)" }}>📌 Pinned</span>
                        <button
                          onClick={() => {
                            setCyYear(r.yr);
                            loadPinIntoCalculator((params?.conversionOverrides || []).find(o => Number(o.year) === r.yr));
                            setView("thisyear");
                          }}
                          title={`Edit pin for ${r.yr} in calculator`}
                          style={{ background: "rgba(167,139,250,0.15)", border: "1px solid var(--tint-violet-400-30)", color: "var(--accent-purple)", borderRadius: 4, cursor: "pointer", fontSize: "var(--fs-small)", padding: "1px 5px", fontFamily: "inherit", lineHeight: 1.4 }}
                        >✏</button>
                        {onRemoveConversionOverride && (
                          <button
                            onClick={() => onRemoveConversionOverride(r.yr)}
                            style={{ background: "var(--tint-red-15)", border: "1px solid var(--tint-red-30)", color: "var(--chart-1)", borderRadius: 4, cursor: "pointer", fontSize: "var(--fs-small)", padding: "1px 5px", fontFamily: "inherit", lineHeight: 1.4 }}
                          >×</button>
                        )}
                      </span>
                    : <span style={{ color: "var(--text-faint)", fontSize: "var(--fs-small)" }}>🔮 Forecast</span>;
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
                    <td style={{ color: isPast ? "#334155" : isPinned ? "var(--accent-gold)" : "var(--text-primary)", fontWeight: isPinned ? 700 : 400 }}>{fmtDollar(r.conv)}</td>
                    <td style={{ color: isPast ? "#334155" : "var(--chart-1)" }}>{fmtDollar(r.fedT)}</td>
                    <td style={{ color: isPast ? "#334155" : isNoTaxState ? "var(--positive)" : "var(--chart-3)" }}>
                      {isNoTaxState ? "$0" : fmtDollar(r.stT)}
                    </td>
                    <td
                      style={{
                        color: isPast ? "#334155"
                          : r.bracketUsed === "24%" ? "var(--accent-gold)"
                          : r.bracketUsed === "22%" ? "var(--accent-teal)"
                          : "var(--text-secondary)",
                        fontSize: "var(--fs-small)",
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
                          : "var(--positive)",
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
                <tr style={{ borderTop: "1px solid var(--tint-white-12)" }}>
                  <td style={{ fontWeight: 700 }} colSpan={4}>
                    Total
                  </td>
                  <td>—</td>
                  <td style={{ fontWeight: 700 }}>{fmtDollar(convRows.reduce((s, r) => s + r.conv, 0))}</td>
                  <td style={{ color: "var(--chart-1)", fontWeight: 700 }}>
                    {fmtDollar(convRows.reduce((s, r) => s + r.fedT, 0))}
                  </td>
                  <td
                    style={{
                      color: isNoTaxState ? "var(--positive)" : "var(--chart-3)",
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
                <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--tint-red-07)", border: "1px solid var(--tint-red-25)", borderRadius: 8 }}>
                  <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--chart-1)", marginBottom: 6 }}>
                    Stale Pins — producing $0 conversion
                  </div>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.6 }}>
                    The pins below exist in your plan but result in <strong style={{ color: "var(--text-primary)" }}>$0 converted</strong> — the pre-tax balance was likely exhausted before that year, or your income already exceeds the bracket ceiling. They have no effect and can be safely removed.
                  </div>
                  {orphaned.map(o => (
                    <div key={o.year} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace", flex: 1 }}>
                        📌 {o.year} — pinned at {fmtDollar(Number(o.amount))} → effective: $0
                      </span>
                      {onRemoveConversionOverride && (
                        <button
                          onClick={() => onRemoveConversionOverride(o.year)}
                          style={{ background: "var(--tint-red-15)", border: "1px solid var(--tint-red-30)", color: "var(--chart-1)", borderRadius: 5, cursor: "pointer", fontSize: "var(--fs-small)", padding: "2px 10px", fontFamily: "inherit" }}
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
                  tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }}
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
          <div className="met">
              <div className="ml">Savings at Age {params.endAge || 90} — Without</div>
              <div className="mv" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-h2)" }}>
                {fmtDollar(cur.rows[cur.rows.length - 1]?.nw || 0)}
              </div>
              <div className="ms">All buckets: cash + taxable + pre-tax + Roth</div>
            </div>
            <div className="met">
              <div className="ml">Savings at Age {params.endAge || 90} — With Conversions</div>
              <div className="mv" style={{ color: "var(--accent-teal)", fontSize: "var(--fs-h2)" }}>
                {fmtDollar(opt.rows[opt.rows.length - 1]?.nw || 0)}
              </div>
              <div className="ms">All buckets — more than the two bars above</div>
            </div>
          </div>
          {rmdYears.length > 0 && (
            <div className="chart-card">
              <div className="ct">Required minimum distributions (RMDs)</div>
              <div className="ct-sub">IRS Joint &amp; Last Survivor table</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div className="met">
                  <div className="ml">Lifetime RMDs — Without Conversions</div>
                  <div
                    className="mv"
                    style={{ color: "var(--chart-1)", fontSize: "var(--fs-h2)" }}
                  >
                    {fmtDollar(cur.cRmd)}
                  </div>
                  <div className="ms">{formulaFor("cmp-rmd-without")}</div>
                </div>
                <div className="met">
                  <div className="ml">Lifetime RMDs — With Conversions</div>
                  <div
                    className="mv"
                    style={{ color: "var(--positive)", fontSize: "var(--fs-h2)" }}
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
                    tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }}
                  />
                  <YAxis
                    stroke="#1e3a5f"
                    tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }}
                    tickFormatter={(v) => fmtDollar(v)}
                    width={MONEY_AXIS_WIDTH}
                  />
                  <Tooltip content={<Tip />} />
                  <Bar
                    dataKey="curRmd"
                    name="RMD — No Convert"
                    fill="rgba(255,111,122,0.4)"
                  />
                  <Bar
                    dataKey="optRmd"
                    name="RMD — With Convert"
                    fill="rgba(79,216,143,0.5)"
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
                  fontSize: "var(--fs-small)",
                  color: "var(--accent)",
                  background: "var(--tint-violet-600-08)",
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

        const tblBox  = { flex: "0 0 250px", background: "var(--card-bg)", borderRadius: 8, border: "1px solid var(--tint-white-07)", overflow: "hidden" };
        const tblHead = { padding: "7px 10px", borderBottom: "1px solid var(--tint-white-07)", fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" };

        const ltRow = (color, label, optVal, curVal) => (
          <tr style={{ borderBottom: "1px solid var(--tint-white-04)" }}>
            <td style={{ padding: "5px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)" }}>{label}</span>
              </div>
            </td>
            <td style={{ padding: "5px 8px", textAlign: "right", fontSize: "var(--fs-label)", color: "var(--text-primary)", fontWeight: 500 }}>{fmtDollar(optVal)}</td>
            <td style={{ padding: "5px 8px", textAlign: "right", fontSize: "var(--fs-label)", color: "var(--text-muted)" }}>{fmtDollar(curVal)}</td>
          </tr>
        );

        return (
          <>
            <div className="chart-card">
              <div className="ct">Estimated Taxes</div>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 10 }}>
                Annual tax by type — bright bars = with conversions (OPT), muted bars = without (CUR)
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={taxChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={2}>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
                      <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} />
                      <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} tickFormatter={v => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
                      <Tooltip content={<TaxYearTip />} />
                      <Bar dataKey="opt_fed"   stackId="opt" fill="var(--chart-8)"                name="OPT Federal" />
                      <Bar dataKey="opt_st"    stackId="opt" fill="var(--chart-3)"                name="OPT State" />
                      <Bar dataKey="opt_irmaa" stackId="opt" fill="var(--chart-1)"                name="OPT IRMAA"  radius={[2,2,0,0]} />
                      <Bar dataKey="cur_fed"   stackId="cur" fill="var(--tint-indigo-30)"   name="CUR Federal" />
                      <Bar dataKey="cur_st"    stackId="cur" fill="rgba(251,146,60,0.3)"   name="CUR State" />
                      <Bar dataKey="cur_irmaa" stackId="cur" fill="var(--tint-red-30)"  name="CUR IRMAA"  radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={tblBox}>
                  <div style={tblHead}>
                    <span>Lifetime</span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ color: "var(--chart-4)" }}>With Conv</span>
                      <span style={{ color: "var(--text-faint)" }}>Without</span>
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {ltRow("var(--chart-8)", "Federal Income Tax", optFedTotal, curFedTotal)}
                      {!isNoTaxState && ltRow("var(--chart-3)", "State Income Tax", optStTotal, curStTotal)}
                      {ltRow("var(--chart-1)", "IRMAA Surcharges", opt.cIrmaa || 0, cur.cIrmaa || 0)}
                      <tr style={{ borderTop: "2px solid var(--tint-white-10)", background: "var(--card-bg)" }}>
                        <td style={{ padding: "6px 8px", fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-primary)" }}>Total</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "var(--fs-label)", fontWeight: 700, color: taxD > 0 ? "var(--chart-3)" : "var(--positive)" }}>{fmtDollar(opt.cTax)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--text-secondary)" }}>{fmtDollar(cur.cTax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="chart-card">
              <div className="ct">Gross Taxable Income by Source</div>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 10 }}>
                What generates taxable income each year — bright bars = with conversions, muted = without
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={incChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={2}>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
                      <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} />
                      <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} tickFormatter={v => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
                      <Tooltip content={<IncYearTip />} />
                      <Bar dataKey="opt_ss"   stackId="opt" fill="var(--accent-teal)"                  name="OPT Social Sec." />
                      <Bar dataKey="opt_ab"   stackId="opt" fill="var(--accent-gold)"                  name="OPT Annuity" />
                      <Bar dataKey="opt_rmd"  stackId="opt" fill="var(--accent-purple)"                  name="OPT RMD" />
                      <Bar dataKey="opt_pxs"  stackId="opt" fill="var(--chart-2)"                  name="OPT Pretax Draw" />
                      <Bar dataKey="opt_conv" stackId="opt" fill="var(--positive)"                  name="OPT Conversion"  radius={[2,2,0,0]} />
                      <Bar dataKey="cur_ss"   stackId="cur" fill="var(--tint-sky-30)"     name="CUR Social Sec." />
                      <Bar dataKey="cur_ab"   stackId="cur" fill="rgba(251,191,36,0.3)"     name="CUR Annuity" />
                      <Bar dataKey="cur_rmd"  stackId="cur" fill="var(--tint-violet-400-30)"    name="CUR RMD" />
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
                      {(optPxsTotal > 0 || curPxsTotal > 0) && ltRow("var(--chart-2)", "Pretax Withdrawals", optPxsTotal, curPxsTotal)}
                      {(opt.cConv || 0) > 0 && ltRow("var(--positive)", "Roth Conversions", opt.cConv || 0, 0)}
                      <tr style={{ borderTop: "2px solid var(--tint-white-10)", background: "var(--card-bg)" }}>
                        <td style={{ padding: "6px 8px", fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-primary)" }}>Total Taxable Inc.</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--accent-teal)" }}>{fmtDollar(optTotInc)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--text-secondary)" }}>{fmtDollar(curTotInc)}</td>
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
                  <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} />
                  <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} tickFormatter={v => (v * 100).toFixed(0) + "%"} width={36} />
                  <Tooltip content={<RateTip />} />
                  <Legend wrapperStyle={{ fontSize: "var(--fs-small)" }} />
                  <Line type="monotone" dataKey="OPT Rate" stroke="var(--positive)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="CUR Rate" stroke="var(--chart-1)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        );
      })()}
      {view === "table" && (
        <div className="chart-card" style={{ overflowX: "auto" }}>
          <div className="ct">Year-by-Year Comparison Table</div>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5, padding: "6px 8px", background: "var(--card-bg)", borderRadius: 6, border: "1px solid var(--tint-white-06)" }}>
            <strong style={{ color: "var(--text-primary)" }}>OPT</strong> = With Roth conversion ladder &nbsp;|&nbsp; <strong style={{ color: "var(--text-primary)" }}>CUR</strong> = Without conversions &nbsp;|&nbsp; <span style={{ color: "var(--chart-1)" }}>Red numbers</span> = you're paying more tax that year by choice to pay less at {rmdAge}
          </div>
          <table className="roth-tbl">
            <thead>
              <tr>
                <th>Year</th>
                <th>Age</th>
                <th style={{ borderLeft: "2px solid var(--tint-indigo-40)", color: "#a5b4fc" }}>OPT Rate</th>
                <th style={{ color: "var(--text-secondary)" }}>CUR Rate</th>
                <th style={{ borderLeft: "2px solid rgba(255,111,122,0.4)", color: "var(--chart-1)" }}>OPT Tax</th>
                <th style={{ color: "var(--text-secondary)" }}>CUR Tax</th>
                <th style={{ borderLeft: "2px solid rgba(52,211,153,0.4)", color: "var(--positive)" }}>OPT RMD</th>
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
                      <td style={{ borderLeft: "2px solid var(--tint-indigo-20)", background: "var(--tint-indigo-05)" }}>{(r.effR * 100).toFixed(0)}%</td>
                      <td style={{ background: "var(--tint-indigo-05)" }}>{c ? (c.effR * 100).toFixed(0) : "0"}%</td>
                      <td style={{ color: "var(--chart-1)", borderLeft: "2px solid var(--tint-red-20)", background: "var(--tint-red-05)" }}>{fmtDollar(r.totT)}</td>
                      <td style={{ color: "var(--text-secondary)", background: "var(--tint-red-05)" }}>
                        {c ? fmtDollar(c.totT) : "$0"}
                      </td>
                      <td style={{ color: "var(--positive)", borderLeft: "2px solid rgba(52,211,153,0.2)", background: "var(--tint-green-05)" }}>
                        {r.rmd > 0 ? fmtDollar(r.rmd) : "-"}
                      </td>
                      <td style={{ color: "var(--chart-1)", background: "var(--tint-green-05)" }}>
                        {c && c.rmd > 0 ? fmtDollar(c.rmd) : "-"}
                      </td>
                    </tr>
                  );
                })}
              <tr style={{ borderTop: "2px solid var(--tint-white-15)", background: "var(--card-bg)" }}>
                <td colSpan={2} style={{ fontWeight: 700, color: "var(--text-primary)", textAlign: "left" }}>Lifetime Totals</td>
                <td colSpan={2} style={{ borderLeft: "2px solid var(--tint-indigo-20)", background: "var(--tint-indigo-05)" }} />
                <td style={{ color: "var(--chart-1)", fontWeight: 700, borderLeft: "2px solid var(--tint-red-20)", background: "var(--tint-red-05)" }}>{fmtDollar(opt.cTax)}</td>
                <td style={{ color: "var(--text-secondary)", fontWeight: 700, background: "var(--tint-red-05)" }}>{fmtDollar(cur.cTax)}</td>
                <td colSpan={2} style={{ color: cur.cTax - opt.cTax > 0 ? "var(--positive)" : "var(--chart-1)", fontWeight: 700, textAlign: "left", borderLeft: "2px solid rgba(52,211,153,0.2)", background: "var(--tint-green-05)" }}>
                  {cur.cTax - opt.cTax > 0 ? `Saves ${fmtDollar(cur.cTax - opt.cTax)}` : `Costs ${fmtDollar(opt.cTax - cur.cTax)} more`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {view === "scenarios" && (() => {
        const baseCur = cur;
        const baseOpt = opt;
        const noTaxOpt = exNoTax.opt;
        const userState = params.stateOfResidence || "Your State";
        const allYears = baseOpt.rows.filter(r => r.age >= (params.retireAge || 60));
        const stSave = baseCur.cTax - baseOpt.cTax;
        const ntSave = baseCur.cTax - noTaxOpt.cTax;
        return (
          <div className="chart-card" style={{ overflowX: "auto" }}>
            <div className="ct">Three scenarios compared</div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5, padding: "6px 8px", background: "var(--card-bg)", borderRadius: 6, border: "1px solid var(--tint-white-06)" }}>
              <strong style={{ color: "var(--chart-1)" }}>No Conversion</strong> = stay put, do nothing &nbsp;|&nbsp;
              <strong style={{ color: "var(--accent-teal)" }}>{userState} + Convert</strong> = stay put, execute Roth ladder &nbsp;|&nbsp;
              <strong style={{ color: "var(--positive)" }}>No-Tax State + Convert</strong> = move to a no-income-tax state, execute Roth ladder
            </div>
            <table className="roth-tbl">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Year</th>
                  <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Age</th>
                  <th colSpan={3} style={{ color: "var(--chart-1)", background: "var(--bg-danger)", textAlign: "center", borderBottom: "2px solid rgba(255,111,122,0.45)", borderLeft: "2px solid rgba(255,111,122,0.45)", paddingBottom: 5, fontSize: "var(--fs-small)", fontWeight: 700, letterSpacing: "0.04em" }}>
                    No Conversion
                  </th>
                  <th colSpan={3} style={{ color: "var(--accent-teal)", background: "rgba(90,209,240,0.13)", textAlign: "center", borderBottom: "2px solid var(--tint-sky-45)", borderLeft: "2px solid var(--tint-sky-45)", paddingBottom: 5, fontSize: "var(--fs-small)", fontWeight: 700, letterSpacing: "0.04em" }}>
                    {userState} + Convert
                  </th>
                  <th colSpan={3} style={{ color: "var(--positive)", background: "rgba(52,211,153,0.13)", textAlign: "center", borderBottom: "2px solid rgba(52,211,153,0.45)", borderLeft: "2px solid rgba(52,211,153,0.45)", paddingBottom: 5, fontSize: "var(--fs-small)", fontWeight: 700, letterSpacing: "0.04em" }}>
                    No-Tax State + Convert
                  </th>
                </tr>
                <tr>
                  <th style={{ color: "var(--chart-1)", background: "var(--tint-red-07)", borderLeft: "2px solid rgba(255,111,122,0.35)" }}>Roth $</th>
                  <ThInfo style={{ color: "var(--chart-1)", background: "var(--tint-red-07)", cursor: "help" }} tip={`Total income tax owed this year = federal + ${userState} state tax combined. Hover any data cell for the federal / state split.`}>Total Tax</ThInfo>
                  <th style={{ color: "var(--text-secondary)", background: "var(--tint-red-07)" }}>IRA Bal</th>
                  <th style={{ color: "var(--accent-teal)", background: "var(--tint-sky-07)", borderLeft: "2px solid rgba(90,209,240,0.35)" }}>Roth $</th>
                  <ThInfo style={{ color: "var(--accent-teal)", background: "var(--tint-sky-07)", cursor: "help" }} tip={`Total income tax owed this year = federal + ${userState} state tax combined. Hover any data cell for the federal / state split.`}>Total Tax</ThInfo>
                  <th style={{ color: "var(--text-secondary)", background: "var(--tint-sky-07)" }}>IRA Bal</th>
                  <th style={{ color: "var(--positive)", background: "var(--tint-green-07)", borderLeft: "2px solid rgba(52,211,153,0.35)" }}>Roth $</th>
                  <ThInfo style={{ color: "var(--positive)", background: "var(--tint-green-07)", cursor: "help" }} tip={"Federal income tax only — no state income tax applies in this scenario (no-tax state). Hover any data cell to confirm the $0 state split."}>Total Tax</ThInfo>
                  <th style={{ color: "var(--text-secondary)", background: "var(--tint-green-07)" }}>IRA Bal</th>
                </tr>
              </thead>
              <tbody>
                {allYears.map(r => {
                  const nc = baseCur.rows.find(x => x.yr === r.yr) || {};
                  const bo = baseOpt.rows.find(x => x.yr === r.yr) || {};
                  const nt = noTaxOpt.rows.find(x => x.yr === r.yr) || {};
                  const hasConv = bo.conv > 0 || nt.conv > 0;
                  return (
                    <tr key={r.yr} style={{ background: hasConv ? "var(--tint-teal-600-06)" : undefined }}>
                      <td>{r.yr}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{r.age}</td>
                      <td style={{ color: "var(--chart-1)", background: "var(--tint-red-07)", borderLeft: "2px solid var(--tint-red-25)" }}>{nc.conv > 0 ? fmtDollar(nc.conv) : "—"}</td>
                      <td style={{ color: "var(--chart-1)", background: "var(--tint-red-07)", cursor: "help" }} title={`Fed: ${fmtDollar(nc.fedT || 0)} | State: ${fmtDollar(nc.stT || 0)}`}>{fmtDollar(nc.totT || 0)}</td>
                      <td style={{ color: "var(--text-secondary)", background: "var(--tint-red-07)" }}>{fmtDollar(nc.pT || 0)}</td>
                      <td style={{ color: "var(--accent-teal)", fontWeight: bo.conv > 0 ? 600 : 400, background: "var(--tint-sky-07)", borderLeft: "2px solid var(--tint-sky-25)" }}>{bo.conv > 0 ? fmtDollar(bo.conv) : "—"}</td>
                      <td style={{ color: "var(--accent-teal)", background: "var(--tint-sky-07)", cursor: "help" }} title={`Fed: ${fmtDollar(bo.fedT || 0)} | State: ${fmtDollar(bo.stT || 0)}`}>{fmtDollar(bo.totT || 0)}</td>
                      <td style={{ color: "var(--text-secondary)", background: "var(--tint-sky-07)" }}>{fmtDollar(bo.pT || 0)}</td>
                      <td style={{ color: "var(--positive)", fontWeight: nt.conv > 0 ? 600 : 400, background: "var(--tint-green-07)", borderLeft: "2px solid rgba(52,211,153,0.25)" }}>{nt.conv > 0 ? fmtDollar(nt.conv) : "—"}</td>
                      <td style={{ color: "var(--positive)", background: "var(--tint-green-07)", cursor: "help" }} title={`Fed: ${fmtDollar(nt.fedT || 0)} | State: $0 (no-tax state)`}>{fmtDollar(nt.totT || 0)}</td>
                      <td style={{ color: "var(--text-secondary)", background: "var(--tint-green-07)" }}>{fmtDollar(nt.pT || 0)}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--tint-white-15)", background: "var(--row-highlight)", fontWeight: 700 }}>
                  <td colSpan={2} style={{ color: "var(--text-primary)" }}>Lifetime Totals</td>
                  <td style={{ color: "var(--chart-1)", background: "var(--tint-red-07)", borderLeft: "2px solid var(--tint-red-25)" }}>—</td>
                  <td style={{ color: "var(--chart-1)", background: "var(--tint-red-07)" }}>{fmtDollar(baseCur.cTax)}</td>
                  <td style={{ color: "var(--text-secondary)", background: "var(--tint-red-07)" }}>{fmtDollar(baseCur.rows[baseCur.rows.length-1]?.pT || 0)}</td>
                  <td style={{ color: "var(--accent-teal)", background: "var(--tint-sky-07)", borderLeft: "2px solid var(--tint-sky-25)" }}>{fmtDollar(baseOpt.cConv)}</td>
                  <td style={{ color: stSave > 0 ? "var(--positive)" : "var(--chart-1)", background: "var(--tint-sky-07)" }}>{fmtDollar(baseOpt.cTax)} {stSave > 0 ? `(saves ${fmtDollar(stSave)})` : `(costs ${fmtDollar(-stSave)} more)`}</td>
                  <td style={{ color: "var(--text-secondary)", background: "var(--tint-sky-07)" }}>{fmtDollar(baseOpt.rows[baseOpt.rows.length-1]?.pT || 0)}</td>
                  <td style={{ color: "var(--positive)", background: "var(--tint-green-07)", borderLeft: "2px solid rgba(52,211,153,0.25)" }}>{fmtDollar(noTaxOpt.cConv)}</td>
                  <td style={{ color: ntSave > 0 ? "var(--positive)" : "var(--chart-1)", background: "var(--tint-green-07)" }}>{fmtDollar(noTaxOpt.cTax)} {ntSave > 0 ? `(saves ${fmtDollar(ntSave)})` : `(costs ${fmtDollar(-ntSave)} more)`}</td>
                  <td style={{ color: "var(--text-secondary)", background: "var(--tint-green-07)" }}>{fmtDollar(noTaxOpt.rows[noTaxOpt.rows.length-1]?.pT || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}
      <div
        style={{
          fontSize: "var(--fs-small)",
          color: "var(--text-faint)",
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        This analysis is for planning purposes only. Consult a tax professional
        before executing Roth conversions. Progressive fed brackets (IRS Rev.
        Proc. 2025-32) · NJ graduated rates · Joint &amp; Last Survivor RMD table ·
        7% growth assumption · Conversion tax default funded from your taxable /
        HSA / cash bucket (Vanguard BETR best practice — lowest effective rate).
        Override in Assumptions → Roth Conversion Strategy.
      </div>
    </div>
  );
}

const LS_YEAREND_KEY = "aira_yearend_ack_v1";

function yearEndAcked(year) {
  try { return Number(localStorage.getItem(LS_YEAREND_KEY)) === year; } catch { return false; }
}
function ackYearEnd(year) {
  try { localStorage.setItem(LS_YEAREND_KEY, String(year)); } catch { }
}

function YearEndBody({ room, days, year, compact }) {
  const money = (n) => (n === Infinity ? "no limit" : fmtDollar(n));
  return (
    <div style={{ fontSize: compact ? 10 : 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
      <div style={{ marginBottom: compact ? 4 : 8 }}>
        <strong style={{ color: days <= 10 ? "var(--chart-1)" : "var(--accent-gold)", fontSize: compact ? 11 : 13 }}>
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
            paddingTop: 4, borderTop: "1px solid var(--tint-slate-400-15)",
          }}>
            <span style={{ color: "var(--text-primary)" }}>
              Convertible now{" "}
              <span style={{ color: "var(--text-muted)" }}>({room.bindingConstraint === "irmaa" ? "IRMAA binds" : "bracket binds"})</span>
            </span>
            <strong style={{ color: "var(--positive)", fontFamily: "'JetBrains Mono',monospace" }}>{money(room.conversionRoom)}</strong>
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

function YearEndStrip({ room, days, year }) {
  return (
    <div style={{
      marginTop: 8, padding: "6px 8px", borderRadius: 6,
      background: "var(--tint-amber-08)", border: "1px solid rgba(251,191,36,0.25)",
    }}>
      <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 3 }}>
        Year-end check
      </div>
      <YearEndBody room={room} days={days} year={year} compact />
    </div>
  );
}

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
          background: "#0f172a", border: "1px solid var(--tint-amber-35)", borderRadius: 12,
          padding: "18px 20px", maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto",
          boxShadow: "0 10px 40px var(--tint-black-80)",
        }}
      >
        <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 4 }}>
          Year-end check &mdash; {year}
        </div>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 12 }}>
          Shown once each December. Two things are worth doing before the 31st.
        </div>

        <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
          1 &middot; Your remaining tax room
        </div>
        <YearEndBody room={room} days={days} year={year} />

        <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--text-primary)", margin: "14px 0 6px" }}>
          2 &middot; Record a check-in
        </div>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>
          A year-end snapshot of your real balances and success rate. Check-ins anchor the
          projection to what actually happened, so next year&rsquo;s plan starts from fact
          rather than from last year&rsquo;s forecast.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="mbtn"
            disabled={!canCheckIn || saved}
            onClick={() => { onSaveCheckIn?.(); setSaved(true); }}
            style={{ fontSize: "var(--fs-label)", padding: "5px 12px", opacity: (!canCheckIn || saved) ? 0.5 : 1 }}
          >
            {saved ? "Check-in saved" : "Save check-in"}
          </button>
          <button className="mbtn" onClick={onClose} style={{ fontSize: "var(--fs-label)", padding: "5px 12px" }}>
            Close
          </button>
        </div>
        {!canCheckIn && (
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>
            Run the Monte Carlo first — a checkpoint stores the success rate alongside the balances.
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

const LANDMINE_TIP_W = 290;

function LandmineTip({ emoji, label, detail, color }) {
  const [show, setShow] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const ref = React.useRef(null);

  const place = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
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
          border: "1px solid var(--tint-white-12)", borderRadius: 8,
          padding: "9px 13px", width: LANDMINE_TIP_W, maxWidth: "calc(100vw - 16px)",
          boxShadow: "0 4px 20px var(--tint-black-70)", zIndex: 9999, pointerEvents: "none",
          whiteSpace: "normal", textAlign: "left",
          maxHeight: "70vh", overflowY: "auto",
        }}>
          <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: color || "var(--text-primary)", marginBottom: 5 }}>
            {emoji} {label}
          </div>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{detail}</div>
        </div>,
        document.body
      )}
    </span>
  );
}

const BUCKET_LABELS = { cash: "Cash ", taxable: "Taxable brokerage", pretax: "Pre-tax (IRA/401k)", roth: "Roth" };
const BUCKET_LABELS_SHORT = { cash: "cash", taxable: "taxable", pretax: "pre-tax", roth: "Roth" };

function AccountDrawOrder({ p, onAssumptionChange }) {
  const set = onAssumptionChange ?? (() => {});
  const mode = p.orderingMode || "tax_reactive";
  const effective = resolveDrawOrder(mode, p.withdrawalOrder);
  const customOrder = resolveDrawOrder("custom", p.withdrawalOrder);

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
  const radioLbl = { fontSize: "var(--fs-label)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", whiteSpace: "nowrap" };
  const arrow = (dis) => ({ background: dis ? "transparent" : "#0a1628", border: "1px solid #1e3a5f", color: dis ? "#334155" : "var(--accent-teal)", borderRadius: 4, width: 20, height: 18, cursor: dis ? "default" : "pointer", fontSize: "var(--fs-small)", lineHeight: 1, padding: 0 });

  return (
    <div style={{
      background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.18)",
      borderRadius: 8, padding: "10px 14px", margin: "10px 0",
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent)" }}>
          Account draw order
        </span>
        {MODES.map(([val, name, rec]) => (
          <label key={val} style={radioLbl}>
            <input type="radio" name="orderingMode" checked={mode === val} onChange={() => set("orderingMode", val)} style={{ cursor: "pointer" }} />
            {name}{rec && <em style={{ color: "var(--text-muted)", fontStyle: "normal", fontSize: "var(--fs-small)" }}>&nbsp;(recommended)</em>}
          </label>
        ))}
        {mode !== "custom" && (
          <span style={{ marginLeft: "auto", fontSize: "var(--fs-small)", color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace" }}>
            {effective.map((b) => BUCKET_LABELS[b]).join(" → ")}
          </span>
        )}
      </div>

      {mode === "custom" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {customOrder.map((b, i) => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 7, padding: "5px 8px" }}>
              <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{i + 1}</span>
              <span style={{ fontSize: "var(--fs-label)", color: "var(--text-primary)" }}>{BUCKET_LABELS[b]}</span>
              <button style={arrow(i === 0)} disabled={i === 0} onClick={() => move(i, -1)} title="Move earlier">▲</button>
              <button style={arrow(i === customOrder.length - 1)} disabled={i === customOrder.length - 1} onClick={() => move(i, 1)} title="Move later">▼</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
        Earlier = drained first. RMDs are always taken first by law; the bracket cap, IRMAA guard, and Roth reserve below still apply to wherever pre-tax and Roth land.
      </div>

    </div>
  );
}

function SourcingGuardrails({ p, onAssumptionChange, summary }) {
  const set = onAssumptionChange ?? (() => {});
  const saved = summary?.taxSavings ?? 0;
  const ctl = { background: "#0a1628", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", cursor: "pointer", fontFamily: "inherit" };
  const lbl = { fontSize: "var(--fs-small)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
      background: "var(--tint-sky-06)", border: "1px solid var(--tint-sky-20)",
      borderRadius: 8, padding: "10px 14px", margin: "10px 0",
    }}>
      <span style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent-teal)" }}>
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
      {(p.retireAge ?? 99) < EARLY_PENALTY_AGE && (() => {
        const plan = detectEmployerPlan(p.accounts || []);
        return (
          <div style={{
            width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8,
            background: "var(--tint-red-08)", border: "1px solid var(--tint-red-25)",
          }}>
            <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "#fca5a5", marginBottom: 4 }}>
              Retiring at {p.retireAge} — before 59.5
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>
              Pre-tax withdrawals before 59.5 owe a <strong>10% penalty</strong> on top of income tax
              (IRC 72(t)). AiRA charges it. Tick an exception only if it genuinely applies to you.
            </div>
            {plan.hasEmployerPlan ? (
              <label style={lbl} title="Rule of 55: penalty-free withdrawals from the plan of the employer you separated from, if you left in or after the year you turned 55. It does NOT apply to an IRA — rolling the 401k over forfeits it permanently.">
                <input type="checkbox" checked={p.ruleOf55 || false}
                  onChange={(e) => set("ruleOf55", e.target.checked)}
                  style={{ cursor: "pointer", width: 15, height: 15 }} />
                Rule of 55 — I left this employer at 55+ and did NOT roll it over
                <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-small)", marginLeft: 4 }}>
                  ({plan.matches.join(", ")} = {Math.round(plan.share * 100)}% of pre-tax)
                </span>
              </label>
            ) : (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", fontStyle: "italic", marginBottom: 4 }}>
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
                <span style={{ color: "var(--accent-gold)", fontSize: "var(--fs-small)", marginLeft: 4 }}>
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
      <span
        style={{
          marginLeft: "auto", fontSize: "var(--fs-small)", fontWeight: 700,
          color: saved > 0 ? "var(--positive)" : "var(--text-secondary)",
          background: saved > 0 ? "var(--tint-green-07)" : "transparent",
          borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap",
        }}
        title="Estimated lifetime tax saved by this sourcing plan vs. drawing pre-tax first with no guardrails. Updates as you change the controls."
      >
        {saved > 0 ? `≈ ${fmtDollar(saved)} lifetime tax saved vs no plan` : "No tax savings vs pretax-first at these settings"}
      </span>
    </div>
  );
}

function WithdrawalSectionHeader({ open, onToggle, color, question, subtitle, badge }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: "100%",
        background: "var(--tint-white-03)",
        border: `1px solid ${withAlpha(color, "44")}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: "16px 18px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        marginBottom: open ? 10 : 0,
      }}
    >
      <span style={{ color, fontSize: "var(--fs-h2)", lineHeight: 1, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▸</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text-primary)", fontStyle: "italic", lineHeight: 1.35 }}>
          “{question}”
        </div>
        <div style={{ fontSize: "var(--fs-body)", color: "var(--text-muted)", marginTop: 5 }}>{subtitle}</div>
      </div>
      {badge && (
        <span onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, marginTop: 1 }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function WithdrawalPlanCombined({ p, inf, withdrawalStrategy, onAssumptionChange, mc }) {
  const [openSourcing, setOpenSourcing] = useState(false);
  const [openStrategy, setOpenStrategy] = useState(false);
  const [previewStrategy, setPreviewStrategy] = useState(withdrawalStrategy);
  useEffect(() => { setPreviewStrategy(withdrawalStrategy); }, [withdrawalStrategy]);
  const previewIsDefault = previewStrategy === withdrawalStrategy;
  const waterfall = useMemo(() => waterfallForActiveStrategy(p), [p]);
  const migrated = migrationNotice(p.withdrawalStrategyMigratedFrom);

  const savedPlanBadge = (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 9px", borderRadius: 5, fontSize: "var(--fs-small)", fontWeight: 700,
        letterSpacing: ".03em", whiteSpace: "nowrap",
        border: "1px solid rgba(52,211,153,0.35)",
        background: "var(--tint-green-07)",
        color: "var(--positive)",
      }}
    >
      {"Saved: " + getStrategyLabel(withdrawalStrategy)}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {migrated && (
        <div style={{
          background: migrated.fidelity === "changed" ? "var(--tint-amber-08)" : "var(--tint-teal-600-08)",
          border: `1px solid ${migrated.fidelity === "changed" ? "var(--tint-amber-35)" : "rgba(13,148,136,0.35)"}`,
          borderRadius: 8, padding: "12px 14px", fontSize: "var(--fs-label)",
          color: "var(--text-secondary)", lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: migrated.fidelity === "changed" ? "var(--accent-gold)" : "var(--accent-teal)", marginBottom: 4 }}>
            <Dot tone={migrated.fidelity === "changed" ? "warn" : "ok"} />Your saved strategy “{migrated.fromLabel}” was retired — this plan now uses{" "}
            {migrated.toLabel}.
          </div>
          <div>{migrated.basis}</div>
          <div style={{ marginTop: 6, color: migrated.fidelity === "changed" ? "var(--accent-gold)" : "var(--text-secondary)" }}>
            {migrated.impact}
          </div>
          <button
            className="mbtn"
            style={{ marginTop: 9, fontSize: "var(--fs-small)" }}
            onClick={() => onAssumptionChange("withdrawalStrategyMigratedFrom", null)}
          >
            Got it — don't show this again
          </button>
        </div>
      )}

      <div style={{
        background: "var(--tint-teal-600-06)",
        border: "1px solid rgba(13,148,136,0.18)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: "var(--fs-small)",
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

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          <select
            value={previewStrategy}
            onChange={(e) => setPreviewStrategy(e.target.value)}
            style={{
              width: "100%",
              background: "#0d1b2a",
              border: "1px solid #1e3a5f",
              color: "var(--text-primary)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: "var(--fs-body)",
              fontFamily: "var(--font-sans)",
            }}
          >
            <option value="smart">Smart Waterfall (Tax-Optimal · GK→Bengen at 15yr)</option>
            <option value="gk">Guyton‑Klinger (Dynamic)</option>
            <option value="bengen">Bengen 4% Rule (fixed, inflation-adjusted)</option>
            <option value="fixed">Fixed % of Portfolio</option>
            <option value="ninety_five_rule">95% Rule (Cut Protection)</option>
            <option value="vpw">VPW (Variable Percentage · spends to zero)</option>
          </select>
          <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{getStrategyDescription(previewStrategy)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 24 }}>
            {previewIsDefault ? (
              <span style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                Previewing your saved default — the whole app (including Monte Carlo) uses this strategy.
                <InfoModal
                  title="How this works"
                  accent="var(--positive)"
                  trigger={
                    <span style={{ color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex" }}
                          title="Tap or click for more info">
                      <InfoIcon size={11} />
                    </span>
                  }
                >
                  <p style={{ margin: "0 0 10px" }}>The dropdown above is a <strong>PREVIEW</strong>. Changing it redraws the year-by-year table on this page so you can compare strategies — it does not change your plan, and it does not re-run the Monte Carlo.</p>
                  <p style={{ margin: "0 0 10px" }}><strong>TO ACTUALLY CHANGE YOUR PLAN: </strong>Pick a strategy in the dropdown, then click the yellow "Use ... in my plan" button that appears just below it. That is the only place in the app that saves your strategy — there is no strategy setting in the Profile tab.</p>
                  <p style={{ margin: 0 }}>ONCE SAVED, it drives everything: the Monte Carlo success rate, the Net Worth summary card on the home page, and every projection tab. Until you click it, all of those keep using your saved strategy — which is why the home card can show a different strategy than this dropdown. Your saved plan currently uses <strong style={{ color: "var(--text-primary)" }}>{getStrategyLabel(withdrawalStrategy)}</strong>.</p>
                </InfoModal>
              </span>
            ) : (
              <>
                <span style={{ fontSize: "var(--fs-label)", color: "var(--accent-gold)" }}>
                  Nothing has changed in your plan yet.
                </span>
                <button
                  onClick={() => {
                    onAssumptionChange("withdrawalStrategy", previewStrategy);
                    if (p.withdrawalStrategyMigratedFrom) onAssumptionChange("withdrawalStrategyMigratedFrom", null);
                  }}
                  style={{
                    padding: "7px 16px", fontSize: "var(--fs-label)", fontWeight: 800, borderRadius: 6,
                    border: "none", background: "var(--accent-gold)", color: "#0d1b2a",
                    cursor: "pointer", whiteSpace: "nowrap",
                    boxShadow: "0 2px 10px var(--tint-amber-35)",
                  }}
                  title="Save this strategy to your plan. This re-runs the Monte Carlo simulation and updates every tab, including the Net Worth summary card."
                >
                  Use {getStrategyLabel(previewStrategy)} in my plan →
                </button>
                <button
                  onClick={() => setPreviewStrategy(withdrawalStrategy)}
                  style={{
                    padding: "4px 10px", fontSize: "var(--fs-small)", borderRadius: 6,
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

      <div>
        <WithdrawalSectionHeader
          open={openSourcing}
          onToggle={() => setOpenSourcing(v => !v)}
          color="var(--accent-teal)"
          question="Where does each year's spending come from?"
          subtitle={`Account-by-account sourcing — ${resolveDrawOrder(p.orderingMode, p.withdrawalOrder).map((b) => BUCKET_LABELS_SHORT[b]).join(" → ")} — with tax landmines flagged`}
          badge={savedPlanBadge}
        />
        {openSourcing && (
          <div style={{ paddingLeft: 4 }}>
            <AccountDrawOrder p={p} onAssumptionChange={onAssumptionChange} />
            <SourcingGuardrails p={p} onAssumptionChange={onAssumptionChange} summary={waterfall.summary} />
            <WaterfallPlanView p={p} result={waterfall} />
          </div>
        )}
      </div>

      <div>
        <WithdrawalSectionHeader
          open={openStrategy}
          onToggle={() => setOpenStrategy(v => !v)}
          color="var(--accent-gold)"
          question="How does my chosen strategy pace spending year by year?"
          subtitle={`Preview how ${getStrategyLabel(previewStrategy)} paces spending — expand for the full year-by-year schedule and chart.`}
          badge={savedPlanBadge}
        />
        {openStrategy && (
          <div style={{ paddingLeft: 4 }}>
            <DeterministicWithdrawalView p={p} inf={inf} withdrawalStrategy={previewStrategy} smartRows={waterfall.smart.rows} mc={mc} />
          </div>
        )}
      </div>

      <SectionDisclaimer>
        This schedule is an illustration produced by a model — not a recommendation to
        withdraw from, convert, or roll over any specific account. It cannot see your full
        tax picture, and the tax, RMD, IRMAA, and penalty figures are estimates based on the
        assumptions you entered and on current law, both of which change. Do not act on
        these amounts without confirming them with a licensed tax adviser, CPA, or fiduciary.
      </SectionDisclaimer>
    </div>
  );
}

function TaxDetailsModal({ r, p, dollarBasis, open, onClose }) {
  if (!r) return null;
  const money = (v) => fmtDollar(Math.round(Number(v) || 0));
  const monthly = (v) => fmtDollar(Math.round((Number(v) || 0) / 12));
  const mfj = filingStatusAt(p, r.age) !== "single";
  const stateLabel = p?.twoHousehold ? "Non-resident (no state tax)" : (p?.stateOfResidence || "NJ");

  const totInc   = Number(r.totInc) || 0;
  const magi     = Number(r.magi) || 0;
  const gain     = Number(r.realizedGain) || 0;
  const fedTax   = Number(r.fedTax) || 0;
  const ltcgTax  = Number(r.ltcgTax) || 0;
  const niit     = Number(r.niit) || 0;
  const stateTax = Number(r.stateTax) || 0;
  const irmaa    = Number(r.irmaa) || 0;
  const penalty  = Number(r.earlyPenalty) || 0;
  const fedOrdinary = Math.max(0, fedTax - ltcgTax - niit);
  const totalLoaded = fedTax + stateTax + irmaa + penalty;
  const grossIncome = (Number(r.rmd) || 0) + (Number(r.fromPretax) || 0) + (Number(r.fromTaxable) || 0)
    + (Number(r.fromRoth) || 0) + (Number(r.ss) || 0) + (Number(r.annuityRental) || 0) + (Number(r.otherIncome) || 0);
  const afterTax    = grossIncome - totalLoaded;
  const ssPct = (Number(r.ss) || 0) > 0 ? Math.round((Number(r.taxSS) || 0) / Number(r.ss) * 100) : 0;

  const section = { background: "var(--row-highlight)", border: "1px solid var(--tint-white-08)", borderRadius: 9, padding: 14, marginBottom: 12 };
  const secHead = { fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-faint)", marginBottom: 10 };
  const tbl = { width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-label)" };
  const thC = { textAlign: "right", color: "var(--text-faint)", fontWeight: 600, fontSize: "var(--fs-small)", padding: "4px 6px", borderBottom: "1px solid var(--tint-white-10)" };
  const tdL = { textAlign: "left", color: "var(--text-secondary)", padding: "5px 6px" };
  const tdR = { textAlign: "right", fontFamily: "'JetBrains Mono',monospace", color: "var(--text-primary)", padding: "5px 6px", whiteSpace: "nowrap" };
  const balCell = { flex: 1, textAlign: "center", padding: "8px 4px" };
  const balLbl = { fontSize: "var(--fs-small)", color: "var(--text-faint)" };
  const balVal = { fontSize: "var(--fs-body)", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: "var(--text-primary)", marginTop: 3 };

  const sources = [
    r.rmd > 0 && { label: "Pre-Tax — RMD (forced)", amt: r.rmd, treat: "Ordinary income — required by law" },
    r.fromPretax > 0 && { label: "Pre-Tax — discretionary draw", amt: r.fromPretax, treat: "Ordinary income" },
    r.fromTaxable > 0 && { label: "Taxable brokerage", amt: r.fromTaxable, treat: gain > 0 ? `Capital gains on ${money(gain)} of realized gain` : "Cost basis only — no gain realized" },
    r.fromRoth > 0 && { label: "Roth / tax-free", amt: r.fromRoth, treat: "Tax-free — no bracket, SS or IRMAA impact" },
    r.ss > 0 && { label: "Social Security", amt: r.ss, treat: ssPct > 0 ? `${ssPct}% taxable (${money(r.taxSS)} included)` : "Not taxable this year" },
    r.annuityRental > 0 && { label: "Annuity / rental income", amt: r.annuityRental, treat: "Ordinary income" },
    r.otherIncome > 0 && { label: "Other income", amt: r.otherIncome, treat: "As entered" },
    r.conversionAmount > 0 && { label: "Roth conversion (above)", amt: r.conversionAmount, treat: `Ordinary income — adds ${money(r.conversionTax)} to this year's tax` },
  ].filter(Boolean);

  const fedBr = Array.isArray(r.fedBrackets) ? r.fedBrackets : [];
  const ti    = Number(r.taxableIncome) || 0;
  const bracketFill = [];
  for (const b of fedBr) {
    if (ti <= b.lo) break;
    const amt = Math.min(ti, b.hi) - b.lo;
    bracketFill.push({ rate: b.rate, lo: b.lo, hi: b.hi, amt, tax: Math.round(amt * b.rate) });
  }
  const marginalPct  = Math.round((Number(r.marginalBracket) || 0) * 100);
  const deduction    = Number(r.deduction) || 0;
  const effOnTaxable = ti > 0 ? (fedOrdinary / ti) * 100 : 0;
  const bracketColor = (rate) => rate <= 0.12 ? "#22c55e" : rate <= 0.24 ? "var(--accent-gold)" : "#f87171";

  return (
    <InfoModal
      title={`Tax Calculation Details — Age ${r.age} (${r.yr})`}
      accent="var(--accent-teal)"
      maxWidth={760}
      bodyMaxHeight="62vh"
      open={open}
      onClose={onClose}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
          Age {r.age} · {mfj ? "Married filing jointly" : "Single"} · {stateLabel}
          {dollarBasis ? ` · ${dollarBasis}` : ""}
        </div>
        <div style={{ border: "1px solid var(--positive)", borderRadius: 8, padding: "6px 12px", textAlign: "right", background: "rgba(16,185,129,0.07)" }}>
          <div style={{ fontSize: "var(--fs-h2)", fontWeight: 800, color: "var(--positive)", fontFamily: "'JetBrains Mono',monospace" }}>{money(afterTax)}</div>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--positive)" }}>After tax</div>
        </div>
      </div>

      <div style={section}>
        <div style={secHead}>Portfolio Balances (end of {r.yr})</div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={balCell}><div style={balLbl}>Pre-Tax</div><div style={balVal}>{money(r.pretaxEnd)}</div></div>
          <div style={{ ...balCell, borderLeft: "1px solid var(--tint-white-07)" }}><div style={balLbl}>Roth</div><div style={{ ...balVal, color: "var(--accent-purple)" }}>{money(r.rothEnd)}</div></div>
          <div style={{ ...balCell, borderLeft: "1px solid var(--tint-white-07)" }}><div style={balLbl}>Taxable</div><div style={{ ...balVal, color: "var(--accent-gold)" }}>{money(r.taxableEnd)}</div></div>
          <div style={{ ...balCell, borderLeft: "1px solid var(--tint-white-07)" }}><div style={balLbl}>Cash</div><div style={{ ...balVal, color: "var(--chart-5)" }}>{money(r.cashEnd)}</div></div>
          <div style={{ ...balCell, borderLeft: "1px solid var(--tint-white-10)" }}><div style={balLbl}>Total</div><div style={balVal}>{money(r.totalPort)}</div></div>
        </div>
      </div>

      <div style={section}>
        <div style={secHead}>Income Sources</div>
        <table style={tbl}>
          <thead><tr><th style={{ ...thC, textAlign: "left" }}>Source</th><th style={thC}>Annualized</th><th style={thC}>Monthly</th><th style={{ ...thC, textAlign: "left" }}>Tax Treatment</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.label}>
                <td style={tdL}>{s.label}</td>
                <td style={tdR}>{money(s.amt)}</td>
                <td style={{ ...tdR, color: "var(--text-muted)" }}>{monthly(s.amt)}</td>
                <td style={{ ...tdL, fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{s.treat}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...tdL, fontWeight: 700, color: "var(--text-primary)", borderTop: "1px solid var(--tint-white-12)" }}>Total gross income</td>
              <td style={{ ...tdR, fontWeight: 700, borderTop: "1px solid var(--tint-white-12)" }}>{money(grossIncome)}</td>
              <td style={{ ...tdR, color: "var(--text-muted)", borderTop: "1px solid var(--tint-white-12)" }}>{monthly(grossIncome)}</td>
              <td style={{ ...tdL, fontSize: "var(--fs-small)", color: "var(--text-faint)", borderTop: "1px solid var(--tint-white-12)" }}>Received this year{r.conversionAmount > 0 ? " (excl. Roth conversion transfer)" : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={section}>
        <div style={secHead}>How This Year's Taxable Income Is Calculated</div>
        <table style={tbl}>
          <tbody>
            <tr><td style={tdL}>Ordinary income (pre-tax draws + RMD + taxable SS + rental/other)</td><td style={tdR}>{money(totInc)}</td></tr>
            <tr><td style={tdL}>+ Realized long-term capital gains</td><td style={tdR}>{money(gain)}</td></tr>
            <tr>
              <td style={{ ...tdL, fontWeight: 700, color: "#86efac", borderTop: "1px solid rgba(134,239,172,0.3)" }}>= MAGI (AGI before deductions)</td>
              <td style={{ ...tdR, fontWeight: 700, color: "#86efac", borderTop: "1px solid rgba(134,239,172,0.3)" }}>{money(magi)}</td>
            </tr>
            {r.stdDedYr != null && (
              <tr><td style={tdL}>− Deductions applied in {r.yr} (standard + senior bonus)</td><td style={tdR}>−{money(r.stdDedYr)}</td></tr>
            )}
            <tr><td style={{ ...tdL, fontWeight: 700, color: "var(--text-primary)", borderTop: "1px solid var(--tint-white-12)" }}>= Taxable income</td><td style={{ ...tdR, fontWeight: 700, borderTop: "1px solid var(--tint-white-12)" }}>{money(r.taxableIncome)}</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.6, marginTop: 8 }}>
          {r.stdDedYr != null
            ? `Marginal bracket this year: ${Math.round((r.marginalBracket || 0) * 100)}%${r.bracketTopYr != null ? ` · bracket top ${money(r.bracketTopYr)} in ${r.yr} dollars` : ""}. Bracket tops are inflation-indexed, which is why this year's ceiling is above today's published figure — compare TAXABLE income against it, not the gross draw.`
            : `Marginal bracket this year: ${Math.round((r.marginalBracket || 0) * 100)}%. The deduction and bracket ceiling for this year aren't stored on a row without a Roth conversion, so only the resulting taxable income is shown here — it is the engine's own figure, not a re-derivation.`}
        </div>
      </div>

      <div style={section}>
        <div style={secHead}>Tax Calculation</div>
        <table style={tbl}>
          <tbody>
            <tr><td style={tdL}>Federal tax on ordinary income</td><td style={tdR}>{money(fedOrdinary)}</td></tr>
            <tr><td style={tdL}>Federal long-term capital gains tax{ltcgTax === 0 && gain > 0 ? " (0% bracket — gain fits under the threshold)" : ""}</td><td style={tdR}>{money(ltcgTax)}</td></tr>
            <tr><td style={tdL}>Net investment income tax (NIIT 3.8%)</td><td style={tdR}>{money(niit)}</td></tr>
            <tr><td style={tdL}>State tax ({p?.twoHousehold ? "not applied — non-resident" : (p?.stateOfResidence || "NJ")}{p?.stateOfResidence === "NJ" && (Number(r.taxSS) || 0) > 0 && !p?.twoHousehold ? " — SS exempt" : ""})</td><td style={tdR}>{money(stateTax)}</td></tr>
            <tr>
              <td style={tdL}>Medicare IRMAA surcharge <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>(from {r.yr - 2} MAGI — 2-yr lookback)</span></td>
              <td style={tdR}>{money(irmaa)}</td>
            </tr>
            {penalty > 0 && (
              <tr><td style={{ ...tdL, color: "#f87171" }}>Early-withdrawal penalty (IRC §72(t), 10%) — a separate additional tax</td><td style={{ ...tdR, color: "#f87171" }}>{money(penalty)}</td></tr>
            )}
            <tr>
              <td style={{ ...tdL, fontWeight: 700, color: "var(--text-primary)", borderTop: "1px solid var(--tint-white-12)" }}>= Total tax{r.earlyPenalty > 0 ? " (incl. penalty)" : ""}</td>
              <td style={{ ...tdR, fontWeight: 700, borderTop: "1px solid var(--tint-white-12)" }}>{money(totalLoaded)}</td>
            </tr>
            <tr>
              <td style={{ ...tdL, color: "var(--text-muted)" }}>Effective rate on {money(magi)} of income <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>(federal + state, excl. IRMAA &amp; penalty)</span></td>
              <td style={{ ...tdR, color: "var(--text-muted)" }}>{((Number(r.effectiveRate) || 0) * 100).toFixed(1)}%</td>
            </tr>
            <tr><td style={{ ...tdL, fontWeight: 700, color: "var(--positive)" }}>= After tax</td><td style={{ ...tdR, fontWeight: 700, color: "var(--positive)" }}>{money(afterTax)}</td></tr>
          </tbody>
        </table>
      </div>

      {bracketFill.length > 0 && ti > 0 && (
        <div style={section}>
          <div style={secHead}>Federal Tax Bracket Analysis</div>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 10 }}>
            Income ranges are inflation-adjusted to {r.yr}. Compare your <strong>taxable</strong> income ({money(ti)}) against them — the IRS widens brackets each year, so this year's ranges sit above today's published figures.
          </div>
          <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", marginBottom: 6, background: "var(--tint-white-05)" }}>
            {bracketFill.map((f) => (
              <div key={f.rate} title={`${Math.round(f.rate * 100)}% bracket — ${money(f.amt)} taxed here`} style={{ width: `${(f.amt / ti) * 100}%`, background: bracketColor(f.rate), display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-small)", fontWeight: 800, color: "#04120a", minWidth: 24 }}>
                {Math.round(f.rate * 100)}%
              </div>
            ))}
          </div>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 12 }}>Your taxable income: {money(ti)}</div>
          <table style={tbl}>
            <thead><tr><th style={{ ...thC, textAlign: "left" }}>Tax Rate</th><th style={{ ...thC, textAlign: "left" }}>Income Range ({r.yr} $)</th><th style={thC}>Amount in Bracket</th><th style={thC}>Tax</th></tr></thead>
            <tbody>
              {bracketFill.map((f) => (
                <tr key={f.rate}>
                  <td style={{ ...tdL, color: bracketColor(f.rate), fontWeight: 700 }}>{Math.round(f.rate * 100)}%</td>
                  <td style={tdL}>{money(f.lo)} – {f.hi === Infinity ? "no ceiling" : money(f.hi)}</td>
                  <td style={tdR}>{money(f.amt)}</td>
                  <td style={tdR}>{money(f.tax)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdL, fontWeight: 700, color: "var(--text-primary)", borderTop: "1px solid var(--tint-white-12)" }}>Total</td>
                <td style={{ ...tdL, color: "var(--text-muted)", borderTop: "1px solid var(--tint-white-12)" }}>{bracketFill.length} bracket{bracketFill.length === 1 ? "" : "s"} filled</td>
                <td style={{ ...tdR, fontWeight: 700, borderTop: "1px solid var(--tint-white-12)" }}>{money(ti)}</td>
                <td style={{ ...tdR, fontWeight: 700, borderTop: "1px solid var(--tint-white-12)" }}>{money(fedOrdinary)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 10, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent-purple)", marginBottom: 6 }}>◇ Key Insights</div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              Marginal tax rate (top bracket reached): <strong style={{ color: "var(--text-primary)" }}>{marginalPct}%</strong><br />
              Effective rate on taxable income: <strong style={{ color: "var(--text-primary)" }}>{effOnTaxable.toFixed(1)}%</strong>
              {deduction > 0 && (<><br />Tax saved from deductions: <strong style={{ color: "var(--positive)" }}>~{money(Math.round(deduction * (Number(r.marginalBracket) || 0)))}</strong> <span style={{ color: "var(--text-faint)" }}>({money(deduction)} deduction × {marginalPct}% marginal)</span></>)}
            </div>
          </div>
        </div>
      )}

      <div style={section}>
        <div style={secHead}>Monthly Summary</div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={balCell}>
            <div style={balLbl}>Gross Income</div>
            <div style={balVal}>{monthly(grossIncome)}</div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 2 }}>{money(grossIncome)}/yr</div>
          </div>
          <div style={{ ...balCell, borderLeft: "1px solid var(--tint-white-07)" }}>
            <div style={balLbl}>Tax</div>
            <div style={{ ...balVal, color: "#f87171" }}>−{monthly(totalLoaded)}</div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 2 }}>−{money(totalLoaded)}/yr</div>
          </div>
          <div style={{ ...balCell, borderLeft: "1px solid var(--tint-white-10)" }}>
            <div style={balLbl}>After-Tax</div>
            <div style={{ ...balVal, color: "var(--positive)" }}>{monthly(afterTax)}</div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 2 }}>{money(afterTax)}/yr</div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.65, borderTop: "1px solid var(--tint-white-08)", paddingTop: 10 }}>
        <div style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--text-secondary)" }}>What's inside these numbers.</strong>{" "}
          {Number(r.ss) > 0
            ? `Social Security is ${ssPct}% taxable this year (${money(r.taxSS)} of ${money(r.ss)})${r.landmines?.ssTorpedo ? " — the SS torpedo is active, meaning provisional income crossed the threshold where 85% becomes taxable" : ""}. `
            : "Social Security is not being taxed this year. "}
          {irmaa > 0
            ? `IRMAA is charged this year because your ${r.yr - 2} MAGI exceeded the base Medicare tier; this year's income affects premiums in ${r.yr + 2}. `
            : "No IRMAA surcharge this year. "}
          {gain > 0 && ltcgTax === 0
            ? `The realized gain of ${money(gain)} fell inside the 0% long-term capital gains bracket, so no federal tax is due on it. `
            : ""}
          {r.rothReserveBroken ? `The Roth emergency reserve was breached this year. ` : ""}
        </div>
        <div>
          These are model estimates from the same tax engine that produced the schedule row above — a second, independent calculation is never run for this panel.
          State tax is an estimate; actual liability depends on items not modeled here (itemized deductions, credits, local taxes). Consult a qualified tax professional.
        </div>
      </div>
    </InfoModal>
  );
}

const WF_SEGMENTS = [
  { key: "time",   cg: "time",   span: 1, label: "Timeline",                     view: null,     cls: "" },
  { key: "spend",  cg: "spend",  span: 2, label: "Spending",                     view: "flows",  cls: "wf-grp-s" },
  { key: "income", cg: "income", span: 2, label: "Income — offsets spend first", view: "flows",  cls: "wf-grp-i" },
  { key: "draw",   cg: "draw",   span: 9, label: "Withdrawals — in draw order",  view: "flows",  cls: "wf-grp-d" },
  { key: "conv",   cg: "conv",   span: 1, label: "Roth",                         view: "flows",  cls: "wf-grp-d" },
  { key: "b1",     cg: "bal",    span: 1, label: "Bucket 1",                     view: "bal",    cls: "wf-grp-b" },
  { key: "tax",    cg: "tax",    span: 4, label: "Taxes",                        view: "tax",    cls: "wf-grp-t" },
  { key: "risk",   cg: "risk",   span: 2, label: "Risk checks",                  view: "tax",    cls: "wf-grp-t" },
  { key: "total",  cg: "bal",    span: 1, label: "Total",                        view: "bal",    cls: "wf-grp-b" },
];

function WaterfallPlanView({ p, result }) {
  const [mode, setMode] = useState("smart");
  const [taxRow, setTaxRow] = useState(null);
  const [wfView, setWfView] = useState("all");
  const { smart, naive, summary } = result;
  const rows = mode === "smart" ? smart.rows : naive.rows;

  const b1Pieces = expandAccountBuckets(p.accounts).filter(piece => piece.bucket === 1);
  const hasB1 = b1Pieces.length > 0;
  const b1FracsByCategory = bucketFractionsByCategory(p.accounts);

  const opThStyle = { padding: "0 3px", color: "var(--text-faint)", fontWeight: 400, fontSize: "var(--fs-small)", textAlign: "center" };
  const opTdStyle = { padding: "0 3px", color: "var(--text-faint)", fontWeight: 600, fontSize: "var(--fs-label)", textAlign: "center" };

  const btnStyle = (active) => ({
    padding: "5px 14px", fontSize: "var(--fs-label)", borderRadius: 6, border: "none",
    cursor: "pointer",
    background: active ? "var(--tint-teal-600-25)" : "transparent",
    color: active ? "var(--accent-teal)" : "var(--text-faint)",
  });

  const chartData = rows.map(r => ({
    age: r.age,
    Cash:    Math.round(r.fromCash),
    Taxable: Math.round(r.fromTaxable),
    "Pre-Tax": Math.round(r.fromPretax + r.rmd),
    Roth:    Math.round(r.fromRoth),
    "Fed Tax":   Math.round(r.fedTax),
    "State Tax": Math.round(r.stateTax),
    "IRMAA":     Math.round(r.irmaa),
    "Roth Conversion": Math.round(r.conversionAmount),
  }));

  const anyLandmine = (r) => r.landmines.ssTorpedo || r.landmines.irmaaTriggered || r.landmines.rmdActive || r.earlyPenalty > 0;
  const anyConversion = rows.some(r => r.conversionAmount > 0);
  const portAtRetire = accumulateToRetirement(p).total;
  const wrAt = (i) => {
    const r = rows[i];
    if (!r) return null;
    const startPort = i === 0 ? portAtRetire : rows[i - 1].totalPort;
    return startPort > 0 ? r.totalWithdrawal / startPort : null;
  };

  const initialWR = wrAt(0) || (p.safeWithdrawalRate ?? 0.04);
  const rowWRColor = (i) => {
    const wr = wrAt(i);
    if (wr == null) return "var(--text-secondary)";
    return wr > initialWR * 1.2 ? "var(--chart-1)" : wr < initialWR * 0.8 ? "var(--accent-gold)" : "var(--positive)";
  };

  const wrSeries = rows.map((_, i) => wrAt(i)).filter(v => v != null);
  const avgWithdrawalRate = wrSeries.length ? wrSeries.reduce((a, b) => a + b, 0) / wrSeries.length : 0;
  const depletionRow = rows.find(r => r.totalPort <= 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <div className="met">
          <div className="ml">Your Plan's Lifetime Tax</div>
          <div className="mv" style={{ color: "var(--positive)", fontSize: "var(--fs-h2)" }}>{fmtDollar(summary.lifetimeTaxSmart)}</div>
          <div className="ms">drawn cash → taxable → pre-tax → Roth, in that order</div>
        </div>
        <div className="met">
          <div className="ml">Tax Savings vs No Plan</div>
          <div className="mv" style={{ color: summary.taxSavings > 0 ? "var(--positive)" : "var(--chart-1)", fontSize: "var(--fs-h2)" }}>
            {summary.taxSavings >= 0 ? "+" : ""}{fmtDollar(summary.taxSavings)}
          </div>
          <div className="ms">vs draining pre-tax first, no plan</div>
        </div>
        <div className="met">
          <div className="ml">Roth at Age {p.endAge || 90}</div>
          <div className="mv" style={{ color: "var(--accent-purple)", fontSize: "var(--fs-h2)" }}>{fmtDollar(summary.finalRothSmart)}</div>
          <div className="ms">your plan · {fmtDollar(summary.finalRothNaive)} without a plan</div>
        </div>
        <div className="met">
          <div className="ml">IRMAA Years Triggered</div>
          <div className="mv" style={{ color: summary.irmaaYearsTriggered > 0 ? "var(--chart-3)" : "var(--positive)", fontSize: "var(--fs-h2)" }}>
            {summary.irmaaYearsTriggered}
          </div>
          <div className="ms">{summary.ssTorpedoYears} SS torpedo yrs</div>
        </div>
        <div className="met">
          <div className="ml">Avg. Withdrawal Rate</div>
          <div className="mv" style={{ color: avgWithdrawalRate > initialWR * 1.2 ? "var(--chart-1)" : "var(--accent-teal)", fontSize: "var(--fs-h2)" }}>
            {(avgWithdrawalRate * 100).toFixed(1)}%
          </div>
          <div className="ms">total withdrawal ÷ prior-year portfolio</div>
        </div>
        <div className="met">
          <div className="ml">Portfolio Depletion</div>
          <div className="mv" style={{ color: depletionRow ? "var(--chart-1)" : "var(--positive)", fontSize: "var(--fs-h2)" }}>
            {depletionRow ? `Age ${depletionRow.age}` : "Never"}
          </div>
          <div className="ms">{depletionRow ? `(${depletionRow.yr})` : `lasts to age ${p.endAge || 90}`}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginRight: 4 }}>View:</span>
        <button style={btnStyle(mode === "smart")} onClick={() => setMode("smart")}>Your plan</button>
        <button style={btnStyle(mode === "naive")} onClick={() => setMode("naive")}>No plan (pretax first, uncapped)</button>
        {mode === "naive" && (
          <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginLeft: 8 }}>
            The common default — pretax drains first, no bracket ceiling, Roth used last
          </span>
        )}
      </div>

      <div className="chart-card">
        <div className="ct">Annual Withdrawals by Source — {mode === "smart" ? "Your plan" : "No plan"}</div>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 8 }}>
          Stacks show where each year's spending comes from; Fed Tax / State Tax / IRMAA sit on top (match the table columns exactly)
          {anyConversion && mode === "smart" && <> · Roth Conversion (purple) is a pretax→Roth transfer, not spending — shown for visibility</>}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} />
            <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} tickFormatter={v => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
            <Tooltip content={<Tip />} />
            <Legend wrapperStyle={{ fontSize: "var(--fs-small)" }} />
            <Bar dataKey="Cash"     stackId="a" fill="var(--text-muted)" />
            <Bar dataKey="Taxable"  stackId="a" fill="var(--chart-10)" />
            <Bar dataKey="Pre-Tax"  stackId="a" fill="var(--accent-gold)" />
            <Bar dataKey="Roth"     stackId="a" fill="var(--positive)" />
            <Bar dataKey="Fed Tax"   stackId="a" fill="var(--negative)" />
            <Bar dataKey="State Tax" stackId="a" fill="#ec4899" />
            <Bar dataKey="IRMAA"     stackId="a" fill="#f43f5e" />
            <Bar dataKey="Roth Conversion" stackId="a" fill="var(--accent-purple)" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card" style={{ overflowX: "auto" }}>
        <div className="ct">Year-by-Year Withdrawal Schedule</div>
        <div className="wf-views">
          <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginRight: 2 }}>Show:</span>
          {[["all", "All columns"], ["flows", "Flows (in → out)"], ["tax", "Taxes & risk"], ["bal", "Balances"]].map(([k, label]) => (
            <button key={k} type="button" className={wfView === k ? "on" : ""} onClick={() => setWfView(k)}>{label}</button>
          ))}
        </div>
        {wfView !== "all" && (
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
            {wfView === "flows" && "Income is applied first; only the shortfall becomes a withdrawal. Draw columns are in the order the waterfall uses them."}
            {wfView === "tax" && "Only the tax columns and the two risk checks — the funding columns are hidden so the tax picture fits on one screen."}
            {wfView === "bal" && "Bucket 1 and the total portfolio at each year end. Switch to Flows to see what moved them."}
            {" "}The full schedule is always one click away under <strong style={{ color: "var(--text-secondary)" }}>All columns</strong>.
          </div>
        )}
          LEGEND:
        <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
         ⚡ SS Torpedo &nbsp;|&nbsp; 💊 IRMAA triggered &nbsp;|&nbsp; 📋 RMDs active &nbsp;|&nbsp;
          Bracket cap reason shown in Pre-Tax column
          <br />
          Columns read left→right in draw order. Funding identity each year: <strong>Income + Cash + Taxable + Pre-Tax (incl. RMD)  + Roth = Spending + Housing + Carveouts + Planned one-off expenses + Fed/State/IRMAA taxes</strong> (Income = Social Security + Pension/Other + Annuity/Rental — All of it offsets spending before any draw) (Any RMD forced out beyond that need is reinvested into Taxable — hover the Pre-Tax cell for the split). Hover the Spending cell for that year's full need breakdown. In a Roth-conversion year, Cash/Taxable/Pre-Tax also carry a small <span style={{ color: "var(--accent-purple)" }}>+conv $X</span> badge — the share of that year's conversion tax paid from that account. Total Draw and the identity above include it.
        </div>
        <table className="roth-tbl wf-tbl" data-view={wfView}>
          <thead>
            <tr>
              {WF_SEGMENTS.map((seg) => {
                if (seg.key === "conv" && !anyConversion) return null;
                return (
                  <th key={seg.key} colSpan={seg.span} data-cg={seg.cg} className={`wf-grp ${seg.cls || ""}`}>
                    {seg.label}
                  </th>
                );
              })}
            </tr>
            <tr>
              <th data-cg="time">Age</th>
              <ThInfo data-cg="spend" tip={"Target spending this year.\n\nOpen any row's Spending cell for the full need breakdown — housing, carveouts, planned one-off costs, other income and taxes."}>Spending</ThInfo>
              <ThInfo data-cg="spend" style={opThStyle} tip={"Spending is funded by the income + draw columns to the right — see the funding identity above the table."}>←</ThInfo>
              <th data-cg="income">
                Income{" "}
                <InfoModal title="Income — what this column contains" accent="var(--accent-teal)"
                  trigger={<span style={{ cursor: "pointer", display: "inline-flex", color: "var(--accent-teal)" }}><InfoIcon size={12} /></span>}>
                  <p style={{ margin: "0 0 10px" }}>
                    Money that arrives whether or not you sell anything. It is used <strong style={{ color: "var(--text-primary)" }}>first</strong>,
                    before any portfolio draw — only the shortfall becomes a withdrawal.
                  </p>
                  <p style={{ margin: "0 0 6px", color: "var(--text-primary)" }}><strong>This column is the sum of exactly three things:</strong></p>
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
              <th data-cg="income" style={opThStyle}>+</th>
              <ThInfo data-cg="draw" tip={"Step 3 — drawn first from the portfolio"}>Cash</ThInfo>
              <th data-cg="draw" style={opThStyle}>+</th>
              <ThInfo data-cg="draw" tip={"Step 4 — drawn after cash is exhausted"}>Taxable</ThInfo>
              <th data-cg="draw" style={opThStyle}>+</th>
              <ThInfo data-cg="draw" tip={"Step 5 — TOTAL pretax outflow this year: forced RMD + discretionary draw (capped at your bracket-ceiling target). This is the amount to actually withdraw from your IRA/401k."}>Pre-Tax</ThInfo>
              <th data-cg="draw" style={opThStyle}>+</th>
              <ThInfo data-cg="draw" tip={"Step 6 — last resort; emergency reserve floor maintained"}>Roth</ThInfo>
              <th data-cg="draw" style={opThStyle}>=</th>
              <ThInfo data-cg="draw" tip={"Total leaving your portfolio this year: Cash + Taxable + Pre-Tax (incl. RMD) + Roth. The single number to enact — it covers spending, housing, carveouts, and all taxes."}>Total Draw</ThInfo>
              {anyConversion && (
                <ThInfo data-cg="conv" tip={"Roth conversion this year (pinned in Conversion Plan, or bracket-fill if set in Withdrawal Order). Stacks on top of this year's spending withdrawal as ordinary income — Fed/State/IRMAA columns reflect the combined total."}>Roth Conv</ThInfo>
              )}
              <ThInfo data-cg="bal" style={{ borderLeft: "1px solid var(--tint-slate-400-15)" }} tip={"Bucket 1 is the safe cash reserve — the slice of your accounts tagged for near-term spending, tracked separately from Bucket 2 (income bridge) and Bucket 3 (long-term growth).\n\nThis column is Bucket 1's true dollar share of the portfolio at the end of each year, summed across every account/category it's tagged in — not one category's whole balance. A taxable account split 40% Bucket 1 / 60% Bucket 2 only contributes its 40% share here.\n\n\"—\" means no account is tagged Bucket 1 at all. \"$0\" means Bucket 1 has actually depleted. Hover any row's value for that year's exact calculation."}>B1 End</ThInfo>
              <th data-cg="tax">Fed Tax</th><th data-cg="tax">State Tax</th><th data-cg="tax">IRMAA</th><th data-cg="tax">Eff %</th>
              <ThInfo data-cg="risk" tip={"What share of the portfolio this year's DRAW represents: Total Draw ÷ the portfolio at the START of the year.\n\nNot your spending rate. If income covers most of your spending, this stays low even when spending is high — which is the point of the column.\n\nGreen means within ±20% of your first-year rate, the Guyton-Klinger guardrail band. Amber = well below it, red = well above."}>WR <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>(of draw)</span></ThInfo>
              <th data-cg="risk">
                <LandmineTip
                  emoji="💣"
                  label="Tax Landmines"
                  color="var(--chart-1)"
                  detail="Hidden tax traps that quietly increase your bill. ⚡ SS Torpedo — too much income makes 85% of Social Security taxable. 💊 IRMAA — income above ~$218,000 MFJ triggers Medicare premium surcharges. 📋 RMD — forced pretax distributions create mandatory taxable income you cannot defer. Hover each row icon for year-specific details."
                />
                {" "}Landmines
              </th>
              <th data-cg="bal">Port End</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rowIdx) => {
              const b1End = hasB1
                ? bucketBalancesForRow(r, b1FracsByCategory)[1]
                : null;
              const b1Breakdown = hasB1 ? (() => {
                const CAT_META = {
                  cash:    { label: "Cash",    start: r.cashStart,    end: r.cashEnd,    draw: r.fromCash,    gr: r.cashGr,
                             subtract: [["Conv Tax", r.convTaxFromCash]], add: [] },
                  taxable: { label: "Taxable", start: r.taxableStart, end: r.taxableEnd, draw: r.fromTaxable, gr: r.gr,
                             subtract: [["Conv Tax", r.convTaxFromTaxable]],
                             add: [["RMD Surplus", r.rmdSurplus], ["Income Surplus", r.surplusToTaxable]] },
                  pretax:  { label: "Pre-Tax", start: r.pretaxStart,  end: r.pretaxEnd,  draw: r.fromPretax,  gr: r.gr,
                             subtract: [["Conversion Outflow", r.convPretaxOutflow]], add: [] },
                  roth:    { label: "Roth",    start: r.rothStart,    end: r.rothEnd,    draw: r.fromRoth,    gr: r.gr,
                             subtract: [], add: [["Conversion In", r.convToRoth]] },
                };
                const blocks = Object.keys(CAT_META)
                  .map((cat) => {
                    const frac = b1FracsByCategory[cat]?.[1] || 0;
                    const m = CAT_META[cat];
                    if (frac <= 0 || m.start == null) return null;
                    let line = `${m.label} Start ${fmtDollar(m.start)} − Draw ${fmtDollar(m.draw || 0)}`;
                    let preGrowth = m.start - (m.draw || 0);
                    for (const [termLabel, val] of m.subtract) {
                      if (val > 0) { line += ` − ${termLabel} ${fmtDollar(val)}`; preGrowth -= val; }
                    }
                    for (const [termLabel, val] of m.add) {
                      if (val > 0) { line += ` + ${termLabel} ${fmtDollar(val)}`; preGrowth += val; }
                    }
                    preGrowth = Math.max(0, preGrowth);
                    line += ` = ${fmtDollar(preGrowth)}`;
                    if (m.gr != null) line += ` × (1 + ${(Math.round(m.gr * 1000) / 10)}% growth)`;
                    line += ` = ${m.label} End ${fmtDollar(m.end)}`;
                    const tagLine = `${m.label} End ${fmtDollar(m.end)} × ${Math.round(frac * 100)}% tagged B1 = ${fmtDollar(Math.round((m.end || 0) * frac))}`;
                    return `${line}\n${tagLine}`;
                  })
                  .filter(Boolean);
                if (!blocks.length) return null;
                return blocks.length > 1 ? `${blocks.join("\n\n")}\n\nTotal B1 End = ${fmtDollar(b1End)}` : blocks[0];
              })() : null;
              return (
              <tr key={r.age} style={{ background: anyLandmine(r) ? "var(--tint-red-07)" : undefined }}>
                <td data-cg="time">{r.age}</td>
                <td data-cg="spend" style={{ textAlign: "right" }}
                    title={`Spending ${fmtDollar(r.spending)}`
                      + (r.smileFactor != null && Math.abs(r.smileFactor - 1) >= 0.005
                          ? ` (spending-curve ${r.smileFactor > 1 ? "+" : "−"}${Math.abs(Math.round((r.smileFactor - 1) * 1000) / 10)}% applied to your ${fmtDollar(r.smileBase)} target)`
                          : "")
                      + (r.housingCost > 0 ? ` + housing ${fmtDollar(r.housingCost)}` : "")
                      + (r.carveoutCost > 0 ? ` + carveouts ${fmtDollar(r.carveoutCost)}` : "")
                      + (r.eventCost > 0
                          ? ` + planned expense${(r.eventLabels || []).length > 1 ? "s" : ""} ${fmtDollar(r.eventCost)}`
                            + ((r.eventLabels || []).length ? ` (${r.eventLabels.join(", ")})` : "")
                          : "")
                      + ` + taxes ${fmtDollar(r.fedTax + r.stateTax + r.irmaa)}`
                      + (r.otherIncome > 0 ? ` − other income ${fmtDollar(r.otherIncome)}` : "")
                      + ` = total need funded by the income + draw columns to the right`
                      }>
                  {fmtDollar(r.spending)}
                  {r.eventCost > 0 && (
                    <span style={{ color: "#fb7185", fontSize: "var(--fs-small)", marginLeft: 3 }}
                          title={`Includes ${fmtDollar(r.eventCost)} of planned one-off spending`}>+📌</span>
                  )}
                  {r.smileFactor != null && Math.abs(r.smileFactor - 1) >= 0.005 && (
                    <span style={{ color: "var(--accent-purple)", fontSize: "var(--fs-small)", marginLeft: 3, fontFamily: "'JetBrains Mono',monospace" }}
                          title={`Spending curve: your ${fmtDollar(r.smileBase)} target × ${r.smileFactor.toFixed(3)} for age ${r.age}. Turn it off with "Smile spending" in the sidebar Options.`}>
                      {r.smileFactor > 1 ? "+" : "−"}{Math.abs(Math.round((r.smileFactor - 1) * 1000) / 10)}%
                    </span>
                  )}
                </td>
                <td data-cg="spend" style={opTdStyle}>←</td>
                <td data-cg="income" style={{ textAlign: "right", color: "var(--accent-teal)" }}
                    title={(() => {
                      const parts = [`Social Security ${fmtDollar(r.ss)}`];
                      if (r.annuityRental > 0) parts.push(`Annuity/Rental ${fmtDollar(r.annuityRental)}`);
                      if (r.otherIncome > 0)   parts.push(`Pension/Other ${fmtDollar(r.otherIncome)}`);
                      const total = (r.fixedIncomeTotal || 0) + (r.otherIncome || 0);
                      let t = parts.length > 1
                        ? `${parts.join(" + ")} = ${fmtDollar(total)}\n\nCovered first, before any portfolio draw.`
                        : `Social Security: ${fmtDollar(r.ss)}`;
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
                  {r.eventInflow > 0 && (
                    <span style={{ color: "var(--positive)", fontSize: "var(--fs-small)", marginLeft: 3, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}
                          title={`${fmtDollar(r.eventInflow)} one-off money arriving${(r.eventLabels || []).length ? ` (${r.eventLabels.join(", ")})` : ""} — deposited into your accounts, not spent. It raises the balances on the right rather than reducing this year's draw.`}>
                      💰+{fmtDollar(r.eventInflow)}
                    </span>
                  )}
                </td>
                <td data-cg="income" style={opTdStyle}>+</td>
                <td data-cg="draw" style={{ textAlign: "right", color: "var(--text-muted)" }} title={fmtDollar(r.fromCash)}>
                  {r.fromCash > 0 ? fmtDollar(r.fromCash) : "—"}
                  {r.convTaxFromCash > 0 && (
                    <span style={{ color: "var(--accent-purple)", fontSize: "var(--fs-small)", marginLeft: 3, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}
                          title={`+${fmtDollar(r.convTaxFromCash)} paid from Cash to fund this year's Roth conversion tax — see the Roth Conv column for the full breakdown.`}>
                      +conv {fmtDollar(r.convTaxFromCash)}
                    </span>
                  )}
                </td>
                <td data-cg="draw" style={opTdStyle}>+</td>
                <td data-cg="draw" style={{ textAlign: "right", color: "var(--chart-10)" }} title={fmtDollar(r.fromTaxable)}>
                  {r.fromTaxable > 0 ? fmtDollar(r.fromTaxable) : "—"}
                  {r.convTaxFromTaxable > 0 && (
                    <span style={{ color: "var(--accent-purple)", fontSize: "var(--fs-small)", marginLeft: 3, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}
                          title={`+${fmtDollar(r.convTaxFromTaxable)} paid from Taxable to fund this year's Roth conversion tax — see the Roth Conv column for the full breakdown.`}>
                      +conv {fmtDollar(r.convTaxFromTaxable)}
                    </span>
                  )}
                </td>
                <td data-cg="draw" style={opTdStyle}>+</td>
                <td data-cg="draw" style={{ textAlign: "right", color: "var(--accent-gold)" }}
                    title={(() => {
                      const totalPretaxOut = r.fromPretax + r.rmd;
                      const rmdExcess = r.rmdSurplus || 0;
                      let t = `${fmtDollar(totalPretaxOut)} total from pretax`;
                      if (r.rmd > 0) t += ` = forced RMD ${fmtDollar(r.rmd)} + discretionary ${fmtDollar(r.fromPretax)}`;
                      t += ` — ${r.pretaxCapReason}`;
                      if (rmdExcess > 0) t += `. ${fmtDollar(rmdExcess)} of the RMD exceeds this year's need and is reinvested into Taxable.`;
                      if (r.convTaxFromPretax > 0) t += ` ${fmtDollar(r.convTaxFromPretax)} more was withheld from the conversion itself to fund its own tax — see the Roth Conv column.`;
                      return t;
                    })()}>
                  {r.rmd > 0 && <span style={{ fontSize: "var(--fs-small)", color: "var(--accent-purple)", marginRight: 2 }}>RMD {fmtDollar(r.rmd)}</span>}
                  {(r.fromPretax + r.rmd) > 0 ? fmtDollar(r.fromPretax + r.rmd) : "—"}
                  {r.convTaxFromPretax > 0 && (
                    <span style={{ color: "var(--accent-purple)", fontSize: "var(--fs-small)", marginLeft: 3, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}
                          title={`+${fmtDollar(r.convTaxFromPretax)} withheld from the conversion to fund its own tax — see the Roth Conv column for the full breakdown.`}>
                      +conv {fmtDollar(r.convTaxFromPretax)}
                    </span>
                  )}
                </td>
                <td data-cg="draw" style={opTdStyle}>+</td>
                <td data-cg="draw" style={{ textAlign: "right", color: "var(--positive)" }} title={fmtDollar(r.fromRoth)}>{r.fromRoth > 0 ? fmtDollar(r.fromRoth) : "—"}</td>
                <td data-cg="draw" style={opTdStyle}>=</td>
                <td data-cg="draw" style={{ textAlign: "right", color: "var(--text-primary)", fontWeight: 600 }}
                    title={`${fmtDollar(r.totalWithdrawal)} leaves the portfolio this year (Cash ${fmtDollar(r.fromCash + (r.convTaxFromCash || 0))} + Taxable ${fmtDollar(r.fromTaxable + (r.convTaxFromTaxable || 0))} + Pre-Tax ${fmtDollar(r.fromPretax + r.rmd + (r.convTaxFromPretax || 0))} + Roth ${fmtDollar(r.fromRoth)}) — covers spending, housing, carveouts, all taxes, and this year's Roth conversion tax (the "+conv" badges to the left)`}>
                  {r.totalWithdrawal > 0 ? fmtDollar(r.totalWithdrawal) : "—"}
                  {(r.totalWithdrawal - r.spending) !== 0 && (
                    <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", fontWeight: 400, marginTop: 1 }}
                         title={`Total Draw ${fmtDollar(r.totalWithdrawal)} − Spending ${fmtDollar(r.spending)} — the gap is housing, carveouts, taxes, and any Roth-conversion tax funding, none of which is spending itself.`}>
                      {r.totalWithdrawal > r.spending ? "+" : "−"}{fmtDollar(Math.abs(r.totalWithdrawal - r.spending))} vs spend
                    </div>
                  )}
                </td>
                {anyConversion && (
                  <td data-cg="conv" style={{ textAlign: "right", color: "var(--accent-purple)" }}
                      title={(() => {
                        if (!(r.conversionAmount > 0)) return "No conversion this year";
                        let t = `Converted ${fmtDollar(r.conversionAmount)} pretax → Roth`
                          + ` — adds ~${fmtDollar(r.conversionTax)} to this year's tax (included in Fed/State).`;
                        const src = [];
                        if (r.convTaxFromTaxable > 0) src.push(`Taxable ${fmtDollar(r.convTaxFromTaxable)}`);
                        if (r.convTaxFromCash > 0)    src.push(`Cash ${fmtDollar(r.convTaxFromCash)}`);
                        if (r.convTaxFromPretax > 0)  src.push(`Pre-Tax ${fmtDollar(r.convTaxFromPretax)}`);
                        if (src.length) t += `\n\nTax paid from: ${src.join(" + ")}.`;
                        if (r.convToRoth > 0 && r.convToRoth < r.conversionAmount) {
                          t += `\n\nOnly ${fmtDollar(r.convToRoth)} actually reaches the Roth —`
                            + ` the tax was withheld from the transfer. Paying it from Taxable or Cash`
                            + ` instead would move the full ${fmtDollar(r.conversionAmount)} across.`;
                        } else if (r.convToRoth > 0) {
                          t += `\nFull ${fmtDollar(r.convToRoth)} reaches the Roth.`;
                        }
                        if (r.convTaxFromPretax > 0 && r.convToRoth >= r.conversionAmount) {
                          t += `\n\nPart of the tax came from Pre-Tax — that draw is itself`
                            + ` ordinary income. Taxable or Cash is the cheaper source.`;
                        }
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
                      <span style={{ color: "var(--accent-gold)", fontSize: "var(--fs-small)", marginLeft: 2 }}
                            title={`Only ${fmtDollar(r.convToRoth)} of the ${fmtDollar(r.conversionAmount)} reaches the Roth — tax withheld from the transfer`}>◑</span>
                    )}
                    {r.conversionAmount > 0 && r.bracketTopYr != null && (
                      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap", marginTop: 1 }}>
                        {r.convCapReason === "irmaa_ceil"
                          ? `IRMAA cap ${fmtDollar(r.bracketTopYr)}`
                          : `${Math.round((r.marginalBracket || 0) * 100)}% top ${fmtDollar(r.bracketTopYr)}`}
                      </div>
                    )}
                  </td>
                )}
                <td data-cg="bal" style={{ textAlign: "right", color: b1End === 0 || (b1End < (p.bucket1Floor || 0) && (p.bucket1Floor || 0) > 0) ? "var(--chart-1)" : "var(--chart-5)", fontSize: "var(--fs-small)", borderLeft: "1px solid var(--tint-slate-400-15)" }}
                    title={
                      b1End == null
                        ? "No account is tagged Bucket 1"
                        : [b1End === 0 ? "Bucket 1 is depleted." : null, b1Breakdown]
                            .filter(Boolean).join("\n\n") || fmtDollar(b1End)
                    }>
                  {b1End == null ? "—" : fmtDollar(b1End)}
                </td>
                <td data-cg="tax" style={{ textAlign: "right", color: "var(--chart-1)" }}>
                  {fmtDollar(r.fedTax)}
                  {(r.ltcgTax > 0 || r.niit > 0) && (
                    <span style={{ color: "#fca5a5", fontSize: "var(--fs-small)", marginLeft: 2 }}
                          aria-label="Includes capital-gains tax and/or net investment income tax">*</span>
                  )}
                  <div style={{ marginTop: 1 }}>
                    <button
                      type="button"
                      onClick={() => setTaxRow(r)}
                      aria-label={`Tax details for age ${r.age} (${r.yr})`}
                      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer",
                        fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent-teal)",
                        textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap" }}
                    >
                      Tax details
                    </button>
                  </div>
                </td>
                <td data-cg="tax" style={{ textAlign: "right", color: r.stateTax > 0 ? "var(--chart-3)" : "var(--text-faint)" }}>
                  {r.stateTax > 0 ? fmtDollar(r.stateTax) : "—"}
                </td>
                <td data-cg="tax" style={{ textAlign: "right", color: r.irmaa > 0 ? "var(--chart-3)" : "var(--text-faint)" }}>
                  {r.irmaa > 0 ? fmtDollar(r.irmaa) : "—"}
                </td>
                <td data-cg="tax" style={{ textAlign: "right" }}>{(r.effectiveRate * 100).toFixed(1)}%</td>
                <td data-cg="risk" style={{ textAlign: "right", color: rowWRColor(rowIdx), fontWeight: 600, fontSize: "var(--fs-small)" }}
                    title={(() => {
                      const wr = wrAt(rowIdx);
                      if (wr == null) return "No portfolio at the start of this year.";
                      const startPort = rowIdx === 0 ? portAtRetire : rows[rowIdx - 1].totalPort;
                      return `${fmtDollar(r.totalWithdrawal)} drawn ÷ ${fmtDollar(startPort)} portfolio at the START of the year = ${(wr * 100).toFixed(1)}%.

This is the DRAW, not your spending — income covers the rest. Guardrail band is ±20% around your first-year rate of ${(initialWR * 100).toFixed(1)}%.`;
                    })()}>
                  {(() => { const wr = wrAt(rowIdx); return wr == null ? "—" : (wr * 100).toFixed(1) + "%"; })()}
                </td>
                <td data-cg="risk" style={{ textAlign: "center", fontSize: "var(--fs-body)" }}>
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
                        color="var(--chart-3)"
                        detail={`This year's ${fmtDollar(r.irmaa)} surcharge is based on your ${r.yr - 2} income (IRMAA uses a 2-year lookback — the current Tier-1 threshold ~$218,000 MFJ was checked against that year's MAGI, not this year's). Income this year affects premiums in ${r.yr + 2}. Enable IRMAA Guard in Plan inputs → Settings → Withdrawal Order to cap pretax draws before this threshold.`}
                      />
                    );
                  })()}
                  {r.earlyPenalty > 0 && (
                    <LandmineTip
                      emoji="⛔"
                      label="Early Withdrawal Penalty"
                      color="var(--chart-1)"
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
                  {!anyLandmine(r) && <Dot tone="ok" />}
                </td>
                <td data-cg="bal" style={{ textAlign: "right", color: "var(--text-secondary)" }} title={fmtDollar(r.totalPort)}>{fmtDollar(r.totalPort)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TaxDetailsModal
        r={taxRow}
        p={p}
        dollarBasis="nominal dollars for that year"
        open={taxRow != null}
        onClose={() => setTaxRow(null)}
      />
    </div>
  );
}

const GUARDRAIL_STRATEGIES = ["gk", "smart", "risk", "kitces", "vanguard", "endowment", "cape", "one_n"];
function isGuardrailStrategy(strategy) {
  return GUARDRAIL_STRATEGIES.includes(resolveStrategy(strategy));
}

function GuardrailsView({ p, inf, withdrawalStrategy, mc, topRule = true }) {
  const [subTab, setSubTab] = useState("path");
  const gkApplies = isGuardrailStrategy(withdrawalStrategy);
  const { schedule } = useMemo(
    () => simulateDeterministicWithStrategy(p, inf, withdrawalStrategy),
    [p, inf, withdrawalStrategy]
  );
  if (!gkApplies || !schedule || schedule.length === 0) return null;

  const realAt = (v, i) => Math.round((v || 0) / Math.pow(1 + (inf || 0) / 100, i));
  const rows = schedule.map((s, i) => ({
    age: s.age, yr: s.yr, gkEvent: s.gkEvent, gkReason: s.gkReason,
    priorReal: realAt(s.spEntering, i),
    actualReal: realAt(s.spAfterGK ?? s.spending, i),
    floorReal: realAt(s.gkFloor, i),
    ceilingReal: realAt(s.gkCeiling, i),
    portReal: realAt(s.portfolioEnd, i),
  }));
  const gkChartData = rows.map((r) => ({
    age: r.age, gkEvent: r.gkEvent, gkReason: r.gkReason,
    "Prior spend (real)": r.priorReal,
    "Actual spend (real)": r.actualReal,
    "Floor (real)": r.floorReal,
    "Ceiling (real)": r.ceilingReal,
    "Portfolio (real)": r.portReal,
  }));
  const events = rows.filter((r) => r.gkEvent === "cut" || r.gkEvent === "raise" || r.gkEvent === "constrained" || r.gkReason === "longevity-hold");
  const cutCount = rows.filter((r) => r.gkEvent === "cut").length;
  const raiseCount = rows.filter((r) => r.gkEvent === "raise").length;
  const constrainedCount = rows.filter((r) => r.gkEvent === "constrained").length;
  const holdCount = rows.filter((r) => r.gkReason === "longevity-hold").length;
  const money = (v) => fmtDollar(v || 0);
  const perMonth = (v) => fmtDollar(Math.round((v || 0) / 12));
  const retAgeForBasis = effectiveRetireAge(p.retireAge, p.currentAge);
  const retirementYear = CURRENT_YEAR + Math.max(0, retAgeForBasis - (p.currentAge ?? retAgeForBasis));
  const g = mc?.gkStats;
  const pctS = (v) => `${Math.round((v || 0) * 100)}%`;

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setSubTab(id)} style={{
      background: "none", border: "none", cursor: "pointer", padding: "6px 2px",
      fontSize: "var(--fs-label)", fontWeight: subTab === id ? 800 : 600,
      color: subTab === id ? "var(--accent-teal)" : "var(--text-muted)",
      borderBottom: `2px solid ${subTab === id ? "var(--accent-teal)" : "transparent"}`,
    }}>{label}</button>
  );

  return (
    <div style={topRule ? { marginTop: 20, borderTop: "1px solid var(--divider)", paddingTop: 14 } : undefined}>
      {g && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 18px", padding: "8px 12px", marginBottom: 12, background: "var(--row-highlight)", border: "1px solid var(--card-border)", borderRadius: 8, fontSize: "var(--fs-small)", color: "var(--text-secondary)" }}>
          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Across {g.paths.toLocaleString()} simulated scenarios:</span>
          <span>guardrails <strong style={{ color: "var(--chart-1)" }}>cut spending in {pctS(g.cutRate)}</strong> of scenarios</span>
          <span><strong style={{ color: "var(--positive)" }}>raised it in {pctS(g.raiseRate)}</strong></span>
          <span>
            cuts: typically <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{g.medianCutsPerPath}</strong> per scenario
            {g.avgCutsAmongCutters > 0 && (
              <span style={{ color: "var(--text-muted)" }}>
                {" "}(<strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{g.avgCutsAmongCutters.toFixed(1)}</strong> on average
                among the {pctS(g.cutRate)} that cut)
              </span>
            )}
          </span>
          <span style={{ color: "var(--text-muted)" }}>spending seen <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{money(g.spendMinReal)}–{money(g.spendMaxReal)}</strong>/yr ({perMonth(g.spendMinReal)}–{perMonth(g.spendMaxReal)}/mo) in {retirementYear} dollars</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 18, borderBottom: "1px solid var(--divider)", marginBottom: 12 }}>
        <TabBtn id="path" label="Spending Path" />
        <TabBtn id="events" label={`Adjustment Events${events.length ? ` (${events.length})` : ""}`} />
        <TabBtn id="scenarios" label="Across All Scenarios" />
      </div>

      {subTab === "path" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", lineHeight: 1.5, flex: "1 1 260px" }}>
              One <strong style={{ color: "var(--text-secondary)" }}>median-returns</strong> path — teal is what you actually spend, riding between your floor and ceiling; the blue dashed line is the portfolio (right axis). ▲/▼ mark the years an adjustment fired.
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
              {cutCount} cut{cutCount === 1 ? "" : "s"} · {raiseCount} raise{raiseCount === 1 ? "" : "s"}{holdCount ? ` · ${holdCount} held` : ""} · in {retirementYear} dollars
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={gkChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
              <XAxis dataKey="age" stroke="var(--divider)" tickMargin={6} tick={{ fill: "var(--text-muted)", fontSize: "var(--fs-small)", fontFamily: "var(--font-mono)" }} />
              <YAxis yAxisId="spend" stroke="var(--divider)" tickMargin={4} width={MONEY_AXIS_WIDTH} tick={{ fill: "var(--text-muted)", fontSize: "var(--fs-small)", fontFamily: "var(--font-mono)" }} tickFormatter={(v) => fmtDollar(v)} />
              <YAxis yAxisId="port" orientation="right" stroke="var(--divider)" tickMargin={4} width={MONEY_AXIS_WIDTH} tick={{ fill: "var(--chart-2)", fontSize: "var(--fs-small)", fontFamily: "var(--font-mono)" }} tickFormatter={(v) => fmtDollar(v)} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = gkChartData.find((d) => d.age === label) || {};
                  const monthly = (v) => fmtDollar(Math.round((v || 0) / 12));
                  const ev = row.gkEvent;
                  return (
                    <div style={{ background: "#0f1729", border: "1px solid var(--tint-white-14)", borderRadius: 8, padding: "9px 12px", fontSize: "var(--fs-small)", lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Age {label}</div>
                      <div style={{ color: "var(--text-secondary)" }}>Prior spend <strong style={{ fontFamily: "var(--font-mono)" }}>{fmtDollar(row["Prior spend (real)"])}</strong> <span style={{ color: "var(--text-faint)" }}>({monthly(row["Prior spend (real)"])}/mo)</span></div>
                      <div style={{ color: "var(--text-secondary)" }}>After guardrail <strong style={{ fontFamily: "var(--font-mono)" }}>{fmtDollar(row["Actual spend (real)"])}</strong> <span style={{ color: "var(--text-faint)" }}>({monthly(row["Actual spend (real)"])}/mo)</span></div>
                      <div style={{ color: "var(--text-muted)" }}>Floor {fmtDollar(row["Floor (real)"])} · Ceiling {fmtDollar(row["Ceiling (real)"])}</div>
                      <div style={{ color: "var(--chart-2)" }}>Portfolio {fmtDollar(row["Portfolio (real)"])}</div>
                      {ev === "cut" && <div style={{ color: "var(--chart-1)", fontWeight: 700, marginTop: 4 }}>▼ Spending cut {Math.round(GK_ADJUST_PCT * 100)}% — withdrawal rate crossed the {Math.round(GK_BAND_PCT * 100)}% upper band</div>}
                      {ev === "raise" && <div style={{ color: "var(--positive)", fontWeight: 700, marginTop: 4 }}>▲ Spending raised {Math.round(GK_ADJUST_PCT * 100)}% — withdrawal rate fell {Math.round(GK_BAND_PCT * 100)}% below the initial rate</div>}
                      {ev === "constrained" && (
                        <div style={{ color: "var(--chart-6)", fontWeight: 700, marginTop: 4 }}>
                          ◆ {row.gkReason === "floor-bind" ? "Floor bound" : "Ceiling bound"} — the guardrail rule was held at your {row.gkReason === "floor-bind" ? "floor" : "ceiling"} setting ({money(row[`${row.gkReason === "floor-bind" ? "Floor" : "Ceiling"} (real)`])}). This is a settings effect, not a market reaction.
                        </div>
                      )}
                      {!ev && row.gkReason === "longevity-hold" && <div style={{ color: "var(--accent-gold)", marginTop: 4 }}>Band crossed, but the longevity rule held — {GK_LONGEVITY_YEARS} years or fewer remain</div>}
                      {!ev && !row.gkReason && <div style={{ color: "var(--text-faint)", marginTop: 4 }}>No adjustment — inflation only</div>}
                    </div>
                  );
                }}
              />
              <Area yAxisId="spend" type="monotone" dataKey="Ceiling (real)" stroke="none" fill="var(--tint-green-07)" />
              <Line yAxisId="spend" type="monotone" dataKey="Floor (real)" stroke="var(--chart-6)" strokeWidth={1.2} strokeDasharray="4 3" dot={false} />
              <Line yAxisId="spend" type="monotone" dataKey="Ceiling (real)" stroke="var(--positive)" strokeWidth={1.2} strokeDasharray="4 3" dot={false} />
              <Line yAxisId="spend" type="monotone" dataKey="Prior spend (real)" stroke="var(--text-faint)" strokeWidth={1.2} strokeDasharray="2 3" dot={false} />
              <Line yAxisId="port" type="monotone" dataKey="Portfolio (real)" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
              <Line yAxisId="spend" type="monotone" dataKey="Actual spend (real)" stroke="var(--accent-teal)" strokeWidth={2.4}
                    dot={(props) => {
                      const ev = gkChartData[props.index]?.gkEvent;
                      if (!ev) return <g key={`d${props.index}`} />;
                      if (ev === "constrained") {
                        const d = 7, off = 11;
                        const pts = `${props.cx},${props.cy - off - d} ${props.cx + d},${props.cy - off} ${props.cx},${props.cy - off + d} ${props.cx - d},${props.cy - off}`;
                        return <polygon key={`e${props.index}`} points={pts} fill="var(--chart-6)" stroke="var(--bg-base)" strokeWidth={1.5} />;
                      }
                      const up = ev === "raise";
                      const w = 8.5, h = 13, gap = 11;
                      const baseY = up ? props.cy - gap : props.cy + gap;
                      const apexY = up ? baseY - h : baseY + h;
                      const pts = `${props.cx - w},${baseY} ${props.cx + w},${baseY} ${props.cx},${apexY}`;
                      return <polygon key={`e${props.index}`} points={pts} fill={up ? "var(--positive)" : "var(--chart-1)"} stroke="var(--bg-base)" strokeWidth={1.5} />;
                    }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="leg">
            <div className="li"><div className="ll" style={{ background: "var(--accent-teal)" }} />Actual spending</div>
            <div className="li"><div className="ll" style={{ background: "var(--text-faint)" }} />Prior year's spending</div>
            <div className="li"><div className="ll" style={{ background: "var(--chart-6)" }} />Floor</div>
            <div className="li"><div className="ll" style={{ background: "var(--positive)" }} />Ceiling</div>
            <div className="li"><div className="ll" style={{ background: "var(--chart-2)" }} />Portfolio (right axis)</div>
            <div className="li"><span style={{ color: "var(--chart-1)", fontSize: "var(--fs-label)" }}>▼</span> Cut</div>
            <div className="li"><span style={{ color: "var(--positive)", fontSize: "var(--fs-label)" }}>▲</span> Raise</div>
            <div className="li"><span style={{ color: "var(--chart-6)", fontSize: "var(--fs-label)" }}>◆</span> Band bound (your floor/ceiling setting)</div>
          </div>
        </>
      )}

      {subTab === "events" && (
        events.length === 0 ? (
          <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", lineHeight: 1.6, padding: "10px 4px" }}>
            No guardrail adjustments fired on this median-returns path — spending simply tracked inflation every year. A weaker market sequence would trigger cuts; the <strong style={{ color: "var(--text-secondary)" }}>Across All Scenarios</strong> tab shows how often that happens across all {g ? g.paths.toLocaleString() : "3,000"} simulated runs.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="nw-table" style={{ fontSize: "var(--fs-label)" }}>
              <thead><tr><th>Age</th><th>Year</th><th>Event</th><th>From</th><th>To</th><th>Change</th><th>Why</th></tr></thead>
              <tbody>
                {events.map((r) => {
                  const isCut = r.gkEvent === "cut", isRaise = r.gkEvent === "raise";
                  const isConstrained = r.gkEvent === "constrained";
                  const delta = r.actualReal - r.priorReal;
                  const c = isConstrained ? "var(--chart-6)" : isCut ? "var(--chart-1)" : isRaise ? "var(--positive)" : "var(--accent-gold)";
                  return (
                    <tr key={r.age}>
                      <td style={{ textAlign: "left" }}>{r.age}</td><td>{r.yr}</td>
                      <td style={{ color: c, fontWeight: 700 }}>{isConstrained ? `◆ ${r.gkReason === "floor-bind" ? "Floor bound" : "Ceiling bound"}` : isCut ? "▼ Cut" : isRaise ? "▲ Raise" : "Held"}</td>
                      <td>{money(r.priorReal)}</td>
                      <td>{money(r.actualReal)}</td>
                      <td style={{ color: delta < 0 ? "var(--chart-1)" : delta > 0 ? "var(--positive)" : "var(--text-muted)" }}>{delta > 0 ? "+" : ""}{money(delta)}</td>
                      <td style={{ textAlign: "left", color: "var(--text-muted)", fontSize: "var(--fs-small)" }}>{isConstrained ? `GK rule's figure was held at your ${r.gkReason === "floor-bind" ? "floor" : "ceiling"} setting` : isCut ? `Withdrawal rate crossed the ${Math.round(GK_BAND_PCT * 100)}% upper band` : isRaise ? `Withdrawal rate fell ${Math.round(GK_BAND_PCT * 100)}% below the initial rate` : `Band crossed, but ≤ ${GK_LONGEVITY_YEARS} years remained`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 8 }}>All figures in {retirementYear} dollars. Change is relative to the prior year's spending.</div>
          </div>
        )
      )}

      {subTab === "scenarios" && (
        g ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {[
                ["Scenarios with a cut", pctS(g.cutRate), "var(--chart-1)", `${Math.round(g.cutRate * g.paths).toLocaleString()} of ${g.paths.toLocaleString()} paths cut spending at least once`],
                ["Scenarios with a raise", pctS(g.raiseRate), "var(--positive)", `${Math.round(g.raiseRate * g.paths).toLocaleString()} of ${g.paths.toLocaleString()} paths raised spending`],
                ["Avg cuts per scenario", g.avgCutsPerPath.toFixed(1), "var(--accent-gold)", "Averaged over every simulated path"],
                ["Spending range seen", `${money(g.spendMinReal)}–${money(g.spendMaxReal)}`, "var(--chart-2)", `${perMonth(g.spendMinReal)}–${perMonth(g.spendMaxReal)}/mo · ${retirementYear} dollars`],
                ...(g.constrainedRate != null ? [[
                  "Scenarios where the band bound",
                  pctS(g.constrainedRate),
                  "var(--chart-6)",
                  `${Math.round((g.ceilingBinds || 0) + (g.floorBinds || 0)).toLocaleString()} bind-years (${(g.ceilingBinds || 0).toLocaleString()} ceiling · ${(g.floorBinds || 0).toLocaleString()} floor) across ${g.paths.toLocaleString()} paths — driven by your floor/ceiling settings, not by markets`,
                ]] : []),
              ].map(([l, v, c, sub]) => (
                <div key={l} style={{ background: "var(--row-highlight)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: "var(--fs-h1)", fontWeight: 800, color: c, fontFamily: "var(--font-mono)" }}>{v}</div>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.6, marginTop: 12 }}>
              The Spending Path tab illustrates one <em>median</em> path — usually benign, so few adjustments fire there. These figures count how the guardrails actually behave across all {g.paths.toLocaleString()} simulated markets, the bad sequences included.{g.longevityHolds > 0 ? ` In ${g.longevityHolds.toLocaleString()} path-years a cut was skipped because ${GK_LONGEVITY_YEARS} years or fewer remained (the longevity rule).` : ""}
            </div>
          </>
        ) : (
          <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", padding: "10px 4px" }}>Run Monte Carlo to see how the guardrails behave across all simulated scenarios.</div>
        )
      )}

      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.55, marginTop: 12, borderTop: "1px solid var(--divider)", paddingTop: 10 }}>
        Guardrails move spending relative to <em>last year's</em> level. The GK rules in force — {Math.round(GK_BAND_PCT * 100)}% band, {Math.round(GK_ADJUST_PCT * 100)}% adjustment, no cut inside the last {GK_LONGEVITY_YEARS} years, inflation capped at {Math.round(GK_INFLATION_CAP * 100)}% — are set in the Forecast tab's ⚙ Advanced Settings.
      </div>
    </div>
  );
}

function DeterministicWithdrawalView({ p, inf, withdrawalStrategy, smartRows, mc }) {
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
    "Prior spend": s.spEntering,
    "Post-guardrail": s.spAfterGK ?? s.spending,
    Floor: s.gkFloor,
    Ceiling: s.gkCeiling,
    gkEvent: s.gkEvent,
    gkReason: s.gkReason,
  }));

  if (!schedule || schedule.length === 0) {
    return <div className="chart-card">No data available. Run Monte Carlo first.</div>;
  }

  const strategyLabel = getStrategyLabel(resolveStrategy(withdrawalStrategy));

  const notSmart = resolveStrategy(withdrawalStrategy) !== "smart";

  return (
    <>
      <div className="chart-card">
        <div className="ct">Steady-return schedule · {strategyLabel}</div>
        <div className="ct-sub">
          One fixed path, no market swings: median historical returns every year
          ({expectedReturn(p.preRetireEq ?? 91).toFixed(2)}% before age {resolveGlidepathSwitchAge(p)} / {expectedReturn(p.postRetireEq ?? 70).toFixed(2)}% after) · Inflation {inf}%
        </div>
        {notSmart && (
          <div style={{
            fontSize: "var(--fs-small)", color: "var(--text-secondary)", background: "var(--tint-amber-07)",
            border: "1px solid rgba(251,191,36,0.22)", borderRadius: 6, padding: "8px 10px",
            marginBottom: 10, lineHeight: 1.5,
          }}>
            <strong style={{ color: "#fbbf24" }}>Simplified schedule.</strong> This "{strategyLabel}" view uses
            one blended growth rate for your whole portfolio, not the real per-account draws the
            Sourcing section above uses — and it never models a Roth conversion (Roth Conv. always
            reads $0 here). Its Fed/State Tax figures ARE borrowed from the Sourcing section's real
            plan though, including any conversion's tax — so Tax can be nonzero here in a year Roth
            Conv. shows $0, and Portfolio End can differ from the Sourcing section's Port End by a
            real amount. For your actual plan's numbers, use the Sourcing section above.
          </div>
        )}
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} />
            <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} tickFormatter={(v) => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
            <Tooltip content={<Tip />} />
            <Line type="monotone" dataKey="Portfolio End" stroke="var(--accent-teal)" strokeWidth={2.5} dot={false} name="Portfolio Balance" />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="leg">
          <div className="li"><div className="ll" style={{ background: "var(--accent-teal)" }} />Portfolio Balance</div>
        </div>

        <GuardrailsView p={p} inf={inf} withdrawalStrategy={withdrawalStrategy} mc={mc} topRule />

        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis dataKey="age" stroke="#1e3a5f" tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }} />
            <YAxis stroke="#1e3a5f" tick={{ fill: "var(--text-muted)", fontSize: "var(--fs-small)" }} tickFormatter={(v) => fmtDollar(v)} width={MONEY_AXIS_WIDTH} />
            <Tooltip content={<Tip />} />
            <Bar dataKey="Spending" fill="var(--accent-gold)" name="Spending" />
            <Bar dataKey="Total Withdrawal" fill="var(--chart-1)" name="Total Withdrawal (inc. tax)" />
          </BarChart>
        </ResponsiveContainer>
        <div className="leg">
          <div className="li"><div className="ll" style={{ background: "var(--accent-gold)" }} />Spending</div>
          <div className="li"><div className="ll" style={{ background: "var(--chart-1)" }} />Total Withdrawal (inc. tax)</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div className="met"><div className="ml">Portfolio at Retirement</div><div className="mv" style={{ color: "var(--accent-teal)" }}>{fmtDollar(portAtRetire)}</div><div className="ms">Single projection at the expected return — not a median</div></div>
        <div className="met"><div className="ml">Initial Withdrawal Rate</div><div className="mv" style={{ color: "var(--accent-gold)" }}>{(initWR * 100).toFixed(1)}%</div><div className="ms">Net portfolio draw / portfolio</div></div>
        <div className="met"><div className="ml">Final Portfolio (Age {schedule[schedule.length - 1]?.age})</div><div className="mv" style={{ color: schedule[schedule.length - 1]?.portfolioEnd > 0 ? "var(--positive)" : "var(--negative)" }}>{fmtDollar(schedule[schedule.length - 1]?.portfolioEnd || 0)}</div><div className="ms">{schedule[schedule.length - 1]?.portfolioEnd > 0 ? "Survives" : "Exhausted"}</div></div>
      </div>

      <div className="chart-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="ct">Year‑by‑Year Schedule</div>
          <button onClick={() => setShowTable(!showTable)} className="mbtn" style={{ fontSize: "var(--fs-label)", padding: "3px 8px" }}>{showTable ? "Hide Table" : "Show Table"}</button>
        </div>
        {showTable && (
          <div style={{ overflowX: "auto" }}>
            <table className="nw-table" style={{ fontSize: "var(--fs-label)" }}>
              <thead><tr><th>Age</th><th>Year</th><th>Spending</th><th>Social Security</th><th>Annuity/Rental</th><th>Pension/Other</th><th>Housing</th><th>Carveouts</th><th>Portfolio Draw</th><th>Roth Conv.</th><th>Fed Tax</th><th>State Tax</th><th>IRMAA</th><th>Total Withdrawal</th><th>Portfolio End</th></tr></thead>
              <tbody>
                {schedule.map((s) => (
                  <tr key={s.age}>
                    <td style={{ textAlign: "left" }}>{s.age}</td><td>{s.yr}</td>
                    <td style={{ color: "var(--accent-gold)",fontSize: "var(--fs-h2)", fontWeight: 'bold'  }}>{fmtDollar(s.spending)}</td>
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
                        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {s.convCapReason === "irmaa_ceil"
                            ? `IRMAA cap ${fmtDollar(s.bracketTopYr)}`
                            : `${Math.round((s.marginalBracket || 0) * 100)}% top ${fmtDollar(s.bracketTopYr)}`}
                        </div>
                      )}
                    </td>
                    <td style={{ color: "var(--chart-1)" }}>{fmtDollar(s.fedTax)}</td>
                    <td style={{ color: "var(--chart-3)" }}>{fmtDollar(s.stateTax)}</td>
                    <td style={{ color: "var(--accent-purple)" }}>{fmtDollar(s.irmaa)}</td>
                    <td style={{ color: "#8fcfa8",fontSize: "var(--fs-h2)", fontWeight: 'bold' }}>{fmtDollar(s.totalWithdrawal)}</td>
                    <td style={{ color: "var(--accent-teal)", fontWeight: 600 }}>
                      {fmtDollar(s.portfolioEnd)}
                      {(() => {
                        if (!notSmart || !smartRows) return null;
                        const smartRow = smartRows.find(r => r.age === s.age);
                        if (!smartRow) return null;
                        const delta = s.portfolioEnd - smartRow.totalPort;
                        if (Math.abs(delta) < 500) return null;
                        return (
                          <InfoModal
                            title="Why Portfolio End differs this year"
                            accent="#fbbf24"
                            trigger={
                              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", fontWeight: 400, whiteSpace: "nowrap" }}>
                                {delta >= 0 ? "+" : "−"}{fmtDollar(Math.abs(delta))} vs Sourcing
                              </div>
                            }
                          >
                            <p>This schedule: <strong>{fmtDollar(s.portfolioEnd)}</strong><br />
                              Sourcing section (age {s.age}): <strong>{fmtDollar(smartRow.totalPort)}</strong><br />
                              Difference: <strong>{delta >= 0 ? "+" : "−"}{fmtDollar(Math.abs(delta))}</strong></p>
                            <p>Spending, Fed Tax, and State Tax already match between the two schedules
                              this year — this gap is purely how each one grows the money that's left.</p>
                            <p>This schedule applies <strong>one blended return</strong> to your whole
                              portfolio. The Sourcing section applies a <strong>different return per
                              account</strong> — cash grows conservatively, other accounts follow your
                              equity/bond mix.</p>
                            <p>The Sourcing section's number reflects your real accounts; treat this
                              schedule's Portfolio End as an approximation.</p>
                          </InfoModal>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flag-i" style={{ fontSize: "var(--fs-label)" }}>
        ℹ️ Deterministic (median) path – shows how the {strategyLabel} strategy would behave in a single "typical" sequence of returns. Actual outcomes will vary.
      </div>
    </>
  );
}

const _BCFG_KEY = "aira_buckets_cfg.v1";
function _loadBCfg() {
  try { return JSON.parse(localStorage.getItem(_BCFG_KEY) || "null") || {}; } catch { return {}; }
}

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
  const barClr = status === "below" ? "var(--chart-1)" : status === "full" ? "var(--positive)" : color;
  const runway = monthly > 0 && num === 1 ? (actual / monthly).toFixed(1) : null;
  return (
    <div style={{ background: "var(--tint-white-02)", border: `1px solid ${withAlpha(color, "33")}`, borderLeft: `3px solid ${color}`, borderRadius: 9, padding: 14, flex: 1, position: "relative" }}>
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
              style={{ position: "absolute", top: "100%", right: 0, background: "rgba(15,23,42,0.98)", border: `1px solid ${withAlpha(color, "66")}`, borderRadius: 6, padding: 10, fontSize: "var(--fs-small)", color: "var(--text-secondary)", zIndex: 20, width: 240, lineHeight: 1.5, boxShadow: "0 6px 16px var(--tint-black-50)", cursor: "default" }}
            >
              {role && (
                <>
                  <div style={{ color, fontWeight: 600, marginBottom: 3, fontSize: "var(--fs-small)" }}>Role</div>
                  <div style={{ marginBottom: holdings ? 8 : 0 }}>{role}</div>
                </>
              )}
              {holdings && (
                <>
                  <div style={{ color, fontWeight: 600, marginBottom: 3, fontSize: "var(--fs-small)" }}>Recommended holdings</div>
                  <div>{holdings}</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 700, color }}>{label}</div>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{horizon}</div>
        </div>
        <div style={{ textAlign: "right", paddingRight: role || holdings ? 16 : 0 }}>
          <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: barClr, fontFamily: "'JetBrains Mono',monospace" }}>{actual > 0 ? fmtDollar(actual) : "—"}</div>
          {runway && <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{runway} mo runway</div>}
        </div>
      </div>
      {(floor > 0 || target > 0) && (
        <>
          <div style={{ height: 6, background: "var(--card-border)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ height: "100%", width: `${barPct}%`, background: barClr, borderRadius: 3, transition: "width 0.4s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>
            <span>Floor {fmtDollar(floor)}</span>
            <span>Target {fmtDollar(target)}</span>
          </div>
        </>
      )}
      {acctList.length > 0 && (
        <div style={{ marginTop: 8, borderTop: "1px solid var(--tint-white-06)", paddingTop: 6 }}>
          {acctList.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 2 }}>
              <span>{a.name}</span>
              <span style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(a.balance || 0)}</span>
            </div>
          ))}
        </div>
      )}
      {acctList.length === 0 && (
        <div style={{ marginTop: 8, fontSize: "var(--fs-small)", color: "var(--text-faint)", fontStyle: "italic" }}>No accounts assigned — use B{num} chips in <GoStep step={PROFILE_STEP_SAVINGS}>Plan inputs → Current Savings</GoStep></div>
      )}
    </div>
  );
}

function BucketsTab({ params = {}, onAssumptionChange }) {
  const [bCfg, setBCfg] = useState(_loadBCfg);
  const saveBCfg = (patch) => {
    const next = { ..._loadBCfg(), ...patch };
    try { localStorage.setItem(_BCFG_KEY, JSON.stringify(next)); } catch {}
    setBCfg(next);
  };
  const b1Years  = params.b1Years ?? 2;
  const b2Years  = params.b2Years ?? 5;
  const drawMode = bCfg.drawMode ?? "net";

  const sp         = params.sp        || 0;
  const port       = params.port      || 0;
  const retireAge  = params.retireAge || 60;
  const currentAge = params.currentAge|| 50;
  const ssAge      = params.ssAge     || 67;
  const gkFloor    = params.gkFloor   || 0;
  const yrsToRetire = Math.max(0, retireAge - currentAge);
  const retireYear  = new Date().getFullYear() + yrsToRetire;

  const mortAnnualPI = (() => {
    if (!params.mortBalance || params.mortBalance <= 0) return 0;
    const ms = mortgageSchedule(params.mortBalance, params.mortRate ?? 6.5, params.mortStart || "2020-01", params.mortTerm || 30, params.mortExtra || 0);
    return ms.pmt * 12;
  })();
  const propIncome  = params.propIncome || 0;
  const netDraw     = Math.max(0, sp + mortAnnualPI - propIncome);
  const spendBasis  = drawMode === "gross" ? sp : netDraw;
  const monthly     = spendBasis > 0 ? Math.round(spendBasis / 12) : 0;

  const accts  = expandAccountBuckets(params.accounts);
  const b1Accts = accts.filter(a => a.bucket === 1);
  const b2Accts = accts.filter(a => a.bucket === 2);
  const b3Accts = accts.filter(a => a.bucket === 3);
  const b1Actual = b1Accts.reduce((s, a) => s + (a.balance || 0), 0);
  const b2Actual = b2Accts.reduce((s, a) => s + (a.balance || 0), 0);
  const b3Actual = b3Accts.reduce((s, a) => s + (a.balance || 0), 0);
  const hasAccounts = (b1Actual + b2Actual + b3Actual) > 0;

  const b1Floor    = spendBasis;
  const b1Target   = spendBasis * b1Years;
  const ssGapYears = Math.max(b2Years, ssAge - retireAge);
  const b2Floor    = spendBasis * b2Years;
  const b2Target   = Math.max(b2Floor, Math.round(ssGapYears * spendBasis));

  const waterfallResult = useMemo(() => {
    if (!sp || !port) return null;
    try { return waterfallForActiveStrategy(params); }
    catch { return null; }
  }, [params]);
  const simRow = waterfallResult?.smart?.rows?.[0] ?? null;
  const marginalRate = simRow?.marginalBracket ?? 12;
  const irmaaRisk    = simRow?.landmines?.irmaaTriggered ?? false;

  const runway = useMemo(() => {
    if (!hasAccounts || b1Accts.length === 0) return null;
    if (b1Actual < b1Floor) return null;
    const fracs = bucketFractionsByCategory(params.accounts);
    return computeBucket1Runway(waterfallResult?.smart?.rows, fracs, b1Years);
  }, [hasAccounts, b1Accts.length, b1Actual, b1Floor, waterfallResult, params.accounts, b1Years]);

  const directive = useMemo(() => {
    if (!hasAccounts || !sp) return { type: "setup" };

    const b2Taxable = b2Accts.filter(a => a.category === "taxable");
    const b2Pretax  = b2Accts.filter(a => a.category === "pretax");
    const b3All     = b3Accts;

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
        steps.push({ label: `Emergency — draw from ${acctLabel(rothPool, "Roth accounts")} (B3)`, accounts: rothPool, amount: amt, tax: "Tax-free", note: "Last resort — Roth grows tax-free, avoid if possible" });
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
      return { type: "warning", title: "Bucket 2 below floor — replenish from Bucket 3", needed, steps, marketWarning: true };
    }
    return { type: "ok", title: "All buckets healthy — no action needed" };
  }, [b1Actual, b2Actual, b1Floor, b1Target, b2Floor, b2Target, b2Accts, b3Accts, marginalRate, irmaaRisk, hasAccounts, sp]);

  const DC = { critical: "var(--chart-1)", warning: "var(--accent-gold)", ok: "var(--positive)", setup: "var(--text-faint)" };
const DI_TONE = { critical: "bad", warning: "warn", ok: "ok" };
  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "long" });


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      <div className="chart-card" style={{ borderLeft: `3px solid ${DC[directive.type]}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--text-primary)" }}>{monthName} {now.getFullYear()} — Retirement Directive</div>
            <div style={{ fontSize: "var(--fs-label)", color: DC[directive.type], fontWeight: 600, marginTop: 3 }}>
              {DI_TONE[directive.type] && <Dot tone={DI_TONE[directive.type]} />}{directive.title}
            </div>
          </div>
        </div>

        {directive.type === "setup" && (
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.6 }}>
            To get a directive:<br/>
            1. Enter your account balances in <GoStep step={PROFILE_STEP_SAVINGS}>Plan inputs → Current Savings</GoStep><br/>
            2. Use the <strong style={{ color: "var(--text-primary)" }}>[B1] [B2] [B3]</strong> buttons to assign each account to a bucket<br/>
            3. Enter your annual spending in <GoStep step={PROFILE_STEP_SPENDING}>Plan inputs → Spending &amp; Expenses</GoStep>
          </div>
        )}

        {directive.marketWarning && (
          <div style={{ background: "var(--tint-amber-08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: "var(--fs-small)", color: "var(--accent-gold)", lineHeight: 1.5 }}>
            <strong>Market condition check required:</strong> Only move money from Bucket 3 into Bucket 2 when markets are <em>up or neutral</em>. If stocks are down significantly (&gt;15%), wait — let Bucket 2 cover you until markets recover. Selling growth assets in a downturn defeats the purpose of the bucket strategy.
          </div>
        )}
        {directive.b1Empty && (
          <div style={{ background: "rgba(14,165,233,0.08)", border: "1px solid var(--tint-sky-500-25)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: "var(--fs-small)", color: "#7dd3fc", lineHeight: 1.6 }}>
            <strong>No B1 account assigned yet.</strong> Bucket 1 currently holds <strong>$0</strong>. To receive this transfer you need a cash account (HYSA, money market, SGOV) tagged as B1 in <GoStep step={PROFILE_STEP_SAVINGS}>Plan inputs → Current Savings</GoStep>. The steps below show which B2 accounts to sell — the proceeds go into that new B1 account.
          </div>
        )}
        {directive.steps?.length > 0 && (
          <>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 8 }}>
              {directive.optional
                ? `Optional top-up — Bucket 1 currently has ${fmtDollar(directive.b1Actual ?? 0)}, target is ${fmtDollar(directive.needed + (directive.b1Actual ?? 0))}:`
                : `Transfer ${fmtDollar(directive.needed)} from Bucket 2 → into your Bucket 1 cash account:`}
            </div>
            {directive.steps.map((step, i) => (
              <div key={i} style={{ background: "var(--card-bg)", border: "1px solid var(--tint-white-07)", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: "var(--fs-label)", fontWeight: 600, color: "var(--text-primary)" }}>Step {i + 1} — {step.label}</span>
                  <span style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--positive)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(step.amount)}</span>
                </div>
                {step.accounts.map(a => (
                  <div key={a.id} style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 1 }}>
                    → {a.name}: {fmtDollar(a.balance || 0)} available
                  </div>
                ))}
                <div style={{ fontSize: "var(--fs-small)", marginTop: 5, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Tax: {step.tax}</span>
                  {step.note && <span style={{ color: "var(--text-faint)" }}>{step.note}</span>}
                </div>
              </div>
            ))}
          </>
        )}

        {directive.type === "ok" && (
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", lineHeight: 1.6 }}>
            Check back periodically — or sooner if spending increases or markets fall significantly.
            {runway?.depleted && <> See the runway card below for when Bucket 1 is projected to need topping up.</>}
          </div>
        )}
      </div>

      {runway && (
        <div className="chart-card" style={{ borderLeft: `3px solid ${runway.depleted ? "var(--accent-gold)" : "var(--positive)"}` }}>
          <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
            Bucket 1 Runway
          </div>
          {runway.depleted ? (
            <div style={{ fontSize: "var(--fs-body)", color: "var(--text-primary)", lineHeight: 1.6 }}>
              At your current plan, <strong>Bucket 1 covers spending through {runway.year}</strong> (age {runway.age}).
              Around then, plan to move about <strong style={{ color: "var(--accent-gold)" }}>{fmtDollar(runway.refillAmount)}</strong>{" "}
              from Bucket 2 to refill it to your {b1Years}-year target.
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 6 }}>
                Based on your projected withdrawal schedule (Scenarios → Withdrawal Plan) — not a separate
                projection, and not a crash forecast. A market drop or a spending change would move this date.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "var(--fs-body)", color: "var(--text-primary)", lineHeight: 1.6 }}>
              Bucket 1 is projected to stay funded through your full plan — no refill from Bucket 2 is currently expected.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "6px 2px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>Buffer targets:</span>
        {[
          { label: "B1 years", key: "b1Years", val: b1Years, min: 1, max: 7, hint: "2–3 recommended" },
          { label: "B2 years", key: "b2Years", val: b2Years, min: 3, max: 12, hint: "5–10 recommended" },
        ].map(({ label, key, val, min, max, hint }) => {
          const setYears = (n) => (onAssumptionChange ? onAssumptionChange(key, n) : saveBCfg({ [key]: n }));
          return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{label}:</span>
            <button onClick={() => setYears(Math.max(min, val - 1))} style={{ background: "var(--tint-white-06)", border: "1px solid var(--tint-white-10)", color: "var(--text-secondary)", borderRadius: 4, width: 20, height: 20, cursor: "pointer", fontSize: "var(--fs-body)", lineHeight: 1, padding: 0 }}>−</button>
            <span style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--text-primary)", minWidth: 14, textAlign: "center" }}>{val}</span>
            <button onClick={() => setYears(Math.min(max, val + 1))} style={{ background: "var(--tint-white-06)", border: "1px solid var(--tint-white-10)", color: "var(--text-secondary)", borderRadius: 4, width: 20, height: 20, cursor: "pointer", fontSize: "var(--fs-body)", lineHeight: 1, padding: 0 }}>+</button>
            <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{hint}</span>
          </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <span
            style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", cursor: "help" }}
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
                  background: active ? "var(--tint-sky-500-18)" : "var(--row-highlight)",
                  border: `1px solid ${active ? "#0ea5e9" : "var(--tint-white-10)"}`,
                  color: active ? "#0ea5e9" : "var(--text-secondary)",
                  borderRadius: 4, padding: "2px 8px", fontSize: "var(--fs-small)", cursor: "pointer", fontWeight: active ? 600 : 400,
                }}
              >{opt.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <BucketCard num={1} color={bucketColor(1)} label="Bucket 1 — Cash" horizon={`0–${b1Years} years · pay bills now`}
          actual={b1Actual} floor={b1Floor} target={b1Target} accounts={b1Accts} monthly={monthly}
          role={`${b1Years}-year runway at ${fmtDollar(spendBasis)}/yr ${drawMode === "net" ? "net draw" : "gross spend"}. Pays bills now — NEVER dual-purpose.`}
          holdings="HYSA · Money market · T-bills · CDs" />
        <BucketCard num={2} color={bucketColor(2)} label="Bucket 2 — Income" horizon={`${b1Years}–${b1Years + b2Years} years · refills B1`}
          actual={b2Actual} floor={b2Floor} target={b2Target} accounts={b2Accts} monthly={monthly}
          role={`Bridges ${ssGapYears}-yr SS gap (age ${retireAge}→${ssAge}). Refills Bucket 1 as it depletes.`}
          holdings="30–50% Equities · 50–70% Bonds · REITs" />
        <BucketCard num={3} color={bucketColor(3)} label="Bucket 3 — Growth" horizon={`${b1Years + b2Years}+ years · last resort`}
          actual={b3Actual} floor={0} target={0} accounts={b3Accts} monthly={monthly}
          role="Protects against inflation & grows wealth for a decade or more."
          holdings="50–100% Equities · Broad-market equity · International" />
      </div>
    </div>
  );
}
const CHECKIN_TICK = { fill: "var(--text-secondary)", fontSize: "var(--fs-small)" };

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
  { key: "retireBy", label: "Retire by", color: "var(--positive)",
    what: "How early your plan retires you",
    how: "Planned retirement age on an absolute scale (50 scores 100, 75 scores 0 — lower is better)" },
  { key: "spend", label: "Spend", color: "#a3e635",
    what: "How comfortably the plan funds your spending target",
    how: "4% of today's portfolio vs your planned annual spend (at or above target scores 100)" },
  { key: "legacy", label: "Legacy", color: "var(--chart-4)",
    what: "What's left at end of plan",
    how: `Median ending portfolio (p50) — ${fmtDollar(LEGACY_FULL_SCORE_PORT)} or more scores 100` },
  { key: "resilience", label: "Resilience", color: "var(--chart-3)",
    what: "How well the plan weathers market stress",
    how: "Success rate with the 2000–2012 sequence forced at retirement" },
];

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
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--tint-white-08)", borderRadius: 10, padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>📈</div>
        <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Start your journey</div>
        <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 460, margin: "0 auto 14px" }}>
          Save your first check-in to start tracking how your plan changes over time.
          The <strong style={{ color: "var(--accent-teal)" }}>Check-in</strong> button in the top toolbar snapshots
          today's plan — success rate, portfolio, and spending — as a point on your timeline.
          They travel with your profile export, but importing one never overwrites your plan
          inputs — a check-in is a running journal entry, shown here as a trend once you've
          saved a few.
        </div>
        <label style={{ fontSize: "var(--fs-small)", color: "var(--accent)", cursor: "pointer" }}>
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
            {ratePP == null ? "—" : `${ratePP >= 0 ? "+" : ""}${ratePP.toFixed(1)}%`}
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

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--tint-white-08)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div className="ct">Plan shape over time</div>
        <div style={{
          fontSize: "var(--fs-label)", lineHeight: 1.5, padding: "8px 12px", borderRadius: 8, marginBottom: 10,
          background: shapeStable ? "rgba(56,189,248,0.06)" : "rgba(251,146,60,0.08)",
          border: `1px solid ${shapeStable ? "rgba(56,189,248,0.18)" : "var(--tint-orange-25)"}`,
          color: "var(--text-primary)",
        }}>
          {shapeStable
            ? "Your plan shape has been stable — no axis has moved by more than 5 points."
            : `Biggest shift since your first check-in: ${maxShift.label} ${maxShift.d > 0 ? "+" : ""}${maxShift.d.toFixed(0)} points.`}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ flex: "1 1 300px", minWidth: 260 }}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="var(--tint-white-12)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--text-primary)", fontSize: "var(--fs-small)" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "var(--text-secondary)", fontSize: "var(--fs-small)" }} tickCount={5} angle={90} />
                {hasTwo && (
                  <Radar name={`First check-in (${fmtDate(first.ts)})`} dataKey="first"
                    stroke="var(--text-secondary)" fill="var(--text-secondary)" fillOpacity={0.12} strokeWidth={1.5} />
                )}
                <Radar name={`Today (${fmtDate(latest.ts)})`} dataKey="today"
                  stroke="var(--chart-10)" fill="var(--chart-10)" fillOpacity={0.25} strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: "var(--fs-small)" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 250, display: "flex", flexDirection: "column", gap: 8 }}>
            {PLAN_SHAPE_AXES.map(({ key, label, color, what, how }) => (
              <div key={key} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
                <div style={{ fontSize: "var(--fs-label)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{label}</strong>
                  <span style={{ color: "var(--text-secondary)" }}> {what}</span>
                </div>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)" }}>{how}</div>
                <div style={{ fontSize: "var(--fs-small)", color, fontFamily: "'JetBrains Mono',monospace" }}>
                  {hasTwo ? `${sFirst[key].toFixed(0)} → ${sToday[key].toFixed(0)}` : sToday[key].toFixed(0)} / 100
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginTop: 8 }}>
          Each axis scores 0–100 on an absolute scale — higher is better on every axis.
          Goal: <strong style={{ color: "var(--accent-teal)" }}>expand the polygon over time</strong>.
        </div>
      </div>

      {sorted.length >= 2 ? (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--tint-white-08)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div className="ct">Plan trend</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--row-highlight)" />
                <XAxis dataKey="date" tick={CHECKIN_TICK} />
                <YAxis domain={[0, 100]} tick={CHECKIN_TICK} tickFormatter={(v) => `${v}%`} width={42} />
                <Tooltip
                  contentStyle={{ background: "#0f1729", border: "1px solid var(--tint-white-15)", borderRadius: 8, fontSize: "var(--fs-label)" }}
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
                  contentStyle={{ background: "#0f1729", border: "1px solid var(--tint-white-15)", borderRadius: 8, fontSize: "var(--fs-label)" }}
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
        <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", background: "var(--tint-sky-06)", border: "1px solid rgba(90,209,240,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
          Save another check-in later to see your trend here — one point doesn't make a line yet.
        </div>
      )}

      <div style={{
      background: "var(--card-bg)",
      border: "1px solid var(--tint-white-08)",
      borderRadius: 12, padding: 16,
    }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="ct" style={{ marginBottom: 0 }}>Check-in history</div>
          <div style={{ fontSize: "var(--fs-small)", display: "flex", gap: 12, alignItems: "center" }}>
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
            <div key={c.id} style={{ background: "var(--card-bg)", border: "1px solid var(--tint-white-08)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                  {fmtDate(c.ts)}{isToday(c.ts) ? " · TODAY" : ""}
                </span>
                <input
                  defaultValue={c.name || ""}
                  placeholder="Name this check-in…"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.name || "")) onRename(c.id, v); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  style={{
                    flex: 1, minWidth: 80, background: "transparent", border: "none", outline: "none",
                    color: "var(--text-primary)", fontSize: "var(--fs-body)", fontWeight: 700, fontFamily: "inherit",
                  }}
                />
                <button onClick={() => onDelete(c.id)} title="Delete this check-in"
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "var(--fs-body)", lineHeight: 1 }}>
                  ×
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {[
                  ["SUCCESS RATE", c.successRate != null ? `${(c.successRate * 100).toFixed(0)}%` : "—", "var(--accent-teal)"],
                  ["STRESS SR",    c.stressRate  != null ? `${(c.stressRate  * 100).toFixed(0)}%` : "—", "var(--chart-3)"],
                  ["PORTFOLIO",    c.port           != null ? fmtDollar(c.port)           : "—", "var(--text-primary)"],
                  ["SPENDING",     c.sp             != null ? fmtDollar(c.sp)             : "—", "var(--text-primary)"],
                  ["LEGACY",       c.medianTerminal != null ? fmtDollar(c.medianTerminal) : "—", "var(--chart-4)"],
                  ["RETIRE / PLAN TO", c.retireAge != null ? `${c.retireAge} / ${c.endAge ?? "—"}` : "—", "var(--text-primary)"],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background: "var(--row-highlight)", border: "1px solid var(--tint-white-09)", borderRadius: 8, padding: "6px 10px", minWidth: 86 }}>
                    <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", letterSpacing: "0.08em" }}>{label}</div>
                    <div style={{ fontSize: "var(--fs-body)", fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
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

const STRESS_QUICK_PATHS = 200;
const STRESS_QUICK_PATHS_LABEL = STRESS_QUICK_PATHS.toLocaleString();
const STRESS_DEATH_SOONER_YEARS = 10;
const LTC_ANNUAL_COST = 110000;
const LTC_YEARS = 3;

function stressRateColor(rate) {
  if (rate == null) return "var(--text-muted)";
  if (rate >= 0.85) return "var(--positive)";
  if (rate >= 0.70) return "var(--accent-gold)";
  return "var(--chart-1)";
}

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

function StressScenarioGrid({ p, baseRate, fmtPct, onSeqResult }) {
  const [severity, setSeverity] = useState(-0.40);
  const [crashOpen, setCrashOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [est, setEst] = useState(null);
  const [full, setFull] = useState({});
  const [running, setRunning] = useState(null);
  const [sevNote, setSevNote] = useState("");
  const endAge = p.endAge || 90;

  const authoredDeath = !!(p.spouse?.enabled && Number(p.spouse?.deathAge) > 0);
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
      id: "crash", label: "Market crashes early",
      sub: `One-year ${Math.round(severity * 100)}% equity shock right at retirement`,
      run: (N, seed) => runMC(p, endAge, N, seed, true, [severity]),
    },
    {
      id: "ltc", label: "Long-term care event",
      sub: `${LTC_YEARS} years of memory care ≈ ${fmtDollar(LTC_ANNUAL_COST)}/yr`,
      run: (N, seed) => runMC(
        { ...p, carveouts: [...(p.carveouts || []), {
          id: "_ltc_shock", label: "LTC shock",
          annual: Math.round(LTC_ANNUAL_COST * LTC_YEARS / Math.max(1, endAge - p.retireAge)),
          endYear: null,
        }] },
        endAge, N, seed, true),
    },
    {
      id: "live100", label: "Live to 100",
      sub: `${Math.max(0, 100 - endAge)} extra years of withdrawals`,
      run: (N, seed) => runMC(p, 100, N, seed, true),
    },
    {
      id: "survivor",
      label: authoredDeath ? `First death ${STRESS_DEATH_SOONER_YEARS} years sooner` : "Spouse passes early",
      sub: authoredDeath
        ? `Your modelled first death at ${soonerDeathAge} instead of ${p.spouse.deathAge} — same survivor rules, worse timing`
        : "Survivor keeps the larger SS check AND files Single, from day one — a worst-case bound, not a forecast",
      run: (N, seed) => runMC(
        authoredDeath
          ? { ...p, spouse: { ...p.spouse, deathAge: soonerDeathAge } }
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

  const [estRunning, setEstRunning] = useState(false);
  const estSigRef = useRef(null);
  const inputSig = useMemo(() => {
    try { return JSON.stringify(p) + "|" + severity + "|" + endAge; } catch { return null; }
  }, [p, severity, endAge]);
  const estStale = est != null && estSigRef.current !== inputSig;

  const runEstimates = () => {
    setEstRunning(true);
    setTimeout(() => {
      const out = { base: runMC(p, endAge, STRESS_QUICK_PATHS, 7, true).rate };
      scenarios.forEach((s) => { out[s.id] = s.run(STRESS_QUICK_PATHS, 7).rate; });
      out.noDeath = authoredDeath
        ? runMC({ ...p, spouse: { ...p.spouse, deathAge: null } }, endAge, STRESS_QUICK_PATHS, 7, true).rate
        : null;
      estSigRef.current = inputSig;
      setEst(out);
      setFull({});
      setEstRunning(false);
    }, 0);
  };

  const runFull = (s) => {
    setRunning(s.id);
    setTimeout(() => {
      const rate = s.run(MC_PATHS, 43).rate;
      setFull((f) => ({ ...f, [s.id]: rate }));
      if (s.id === "crash") setSevNote("");
      setRunning(null);
    }, 30);
  };

  const setSev = (v) => {
    setSeverity(v);
    setFull((f) => { const n = { ...f }; delete n.crash; return n; });
    setSevNote(full.crash != null ? "Severity changed, so the precise result was cleared. Run it again." : "");
  };

  const worst = est
    ? scenarios.reduce((lo, s) => Math.min(lo, full[s.id] ?? est[s.id] ?? 1), 1)
    : null;

  return (
    <div className="chart-card" style={{ marginBottom: 12 }}>
      <button type="button" className="ct" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              style={{ marginBottom: open ? 4 : 0, background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "inherit", textAlign: "left" }}>
        Stress scenarios against your plan <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (<>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Each card re-runs your plan with one thing gone wrong. The big number is how many points the share
        of funded plans falls versus your baseline; <b style={{ color: "var(--text-secondary)" }}>drops to</b> is
        the share still funded. <b style={{ color: "var(--text-secondary)" }}>Quick check</b> gives every card a fast
        estimate; <b style={{ color: "var(--text-secondary)" }}>Precise run</b> gives one card the full
        {" "}{MC_PATHS_LABEL}-path result.
        <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
          What the simulation varies: <b style={{ color: "var(--text-secondary)" }}>market returns, inflation,
          rental reliability and healthcare shocks</b>. Your spending, claim ages, retirement age and
          any modelled death are held at what you entered — so this measures how much
          <em> market</em> risk the plan absorbs, not the overall odds your retirement works out.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={runEstimates}
          disabled={estRunning}
          className={estStale || !est ? "mbtn on" : "mbtn"}
          style={{ fontSize: "var(--fs-label)", padding: "6px 14px", fontWeight: 700, opacity: estRunning ? 0.6 : 1 }}
        >
          {estRunning
            ? `Running ${STRESS_QUICK_PATHS_LABEL} paths…`
            : est ? "Re-run quick check" : "Quick check"}
        </button>
        <span style={{ fontSize: "var(--fs-small)", color: estStale ? "var(--accent-gold)" : "var(--text-faint)" }}>
          {estRunning ? "Testing your plan against each scenario…"
            : !est ? "Nothing has been run yet — press Quick check to test your plan."
            : estStale ? "Your plan changed. These results are from the previous inputs."
            : "Up to date with your current plan."}
        </span>
      </div>

      {authoredDeath && est?.noDeath != null && (() => {
        const withDeath = est.base;
        const without   = est.noDeath;
        const pp        = (withDeath - without) * 100;
        const col       = pp <= -10 ? "var(--negative)" : pp <= -3 ? "var(--accent-gold)" : "var(--positive)";
        const whoDies   = p.spouse?.firstToDie === "primary" ? "your" : "your spouse's";
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10, marginBottom: 12 }}>
            <div className="met" style={{ background: `${withAlpha(col, "0d")}`, border: `1px solid ${withAlpha(col, "33")}` }}>
              <div className="ml">Widow's penalty</div>
              <div className="mv" style={{ color: col }}>
                {`${pp > 0 ? "+" : ""}${pp.toFixed(1)}%`}
              </div>
              <div className="ms">
                {fmtPct(without)} without {whoDies} death → {fmtPct(withDeath)} with it, at age {p.spouse.deathAge}
              </div>
            </div>
            <div className="met">
              <div className="ml">What this figure is</div>
              <div className="mv" style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.45 }}>
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
          const rate = measured ? real : est ? est[s.id] : null;
          const baseline = measured ? (baseRate ?? est?.base) : est?.base;
          const deltaPP = rate != null && baseline != null ? (rate - baseline) * 100 : null;
          const color = stressRateColor(rate);
          const isRunning = running === s.id;
          return (
            <div key={s.id} style={{
              background: `${withAlpha(color, "0d")}`, border: `1px solid ${withAlpha(color, "33")}`,
              borderRadius: 12, padding: "13px 15px",
              ...(s.id === "crash" && crashOpen ? { gridColumn: "1 / -1", order: -1 } : null),
            }}>
              <div style={{ display: "flex", gap: 12 }}>
                <ScenarioGauge pct={rate == null ? null : rate * 100} color={color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-secondary)" }}>
                    {s.label}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "3px 0 1px" }}>
                    <span style={{ fontSize: "var(--fs-h1)", fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>
                      {deltaPP == null ? "—" : `${deltaPP > 0 ? "+" : ""}${deltaPP.toFixed(0)}`}
                    </span>
                    <span style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", fontWeight: 600 }}>%</span>
                  </div>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)" }}>
                    drops to <b style={{ color, fontFamily: "'JetBrains Mono',monospace" }}>{rate == null ? "—" : fmtPct(rate)}</b>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 9, lineHeight: 1.45 }}>{s.sub}</div>

              {s.id === "crash" && (
                <div style={{ marginTop: 9 }}>
                  <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-faint)", marginBottom: 5 }}>
                    Crash severity
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[-0.10, -0.25, -0.40].map((v) => (
                      <button key={v} onClick={() => setSev(v)}
                        style={{
                          flex: 1, padding: "3px 0", minHeight: 28, fontSize: "var(--fs-small)", borderRadius: 5, cursor: "pointer",
                          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                          border: `1px solid ${severity === v ? SEQ_CRASH : "var(--card-border)"}`,
                          background: severity === v ? "var(--bg-danger)" : "transparent",
                          color: severity === v ? SEQ_CRASH : "var(--text-muted)",
                        }}>
                        {Math.round(v * 100)}%
                      </button>
                    ))}
                  </div>
                  {sevNote && <div role="status" style={{ fontSize: "var(--fs-small)", color: "var(--accent-gold)", marginTop: 5 }}>{sevNote}</div>}
                  <button type="button" onClick={() => setCrashOpen((o) => !o)} aria-expanded={crashOpen}
                    style={{ marginTop: 8, width: "100%", padding: "7px 0", minHeight: 32, borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                      fontSize: "var(--fs-label)", fontWeight: 600, color: SEQ_CRASH, background: crashOpen ? "var(--bg-danger)" : "transparent",
                      border: `1px solid ${SEQ_CRASH}` }}>
                    {crashOpen ? "Close crash editor" : "Edit the crash: real history or your own years"}
                  </button>
                </div>
              )}
              {s.id === "crash" && crashOpen && <SequenceBuilder p={p} onResult={onSeqResult} />}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <span style={{ fontSize: "var(--fs-small)", color: measured ? "var(--positive)" : "var(--text-faint)", fontWeight: 600 }}>
                  {measured ? `Precise, ${MC_PATHS_LABEL} paths` : est ? (estStale ? "previous inputs" : "fast estimate") : "run the quick check first"}
                </span>
                <button onClick={() => runFull(s)} disabled={isRunning || !est} className="mbtn" title={est ? undefined : "Run the quick check first"}
                  style={{ fontSize: "var(--fs-small)", padding: "3px 10px", minHeight: 28, opacity: isRunning || !est ? 0.5 : 1 }}>
                  {isRunning ? "Running…" : measured ? "Re-run" : "Precise run"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", marginTop: 12 }}>
        {worst == null ? "Run the quick check to see your worst case."
          : worst >= 0.70
          ? "Even the worst case here stays in the recoverable range."
          : "At least one scenario pushes the plan into fragile territory — worth a mitigation."}
      </div>
      </>)}
    </div>
  );
}

function FailedPathPanel({ failures, n }) {
  const [which, setWhich] = useState("worst");
  const [allCols, setAllCols] = useState(false);
  const [open, setOpen] = useState(false);
  const box = { marginTop: 12 };
  if (!failures) {
    return <div className="chart-card" style={box}><div className="ct">Why plans failed</div>
      <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)" }}>No simulated path ran out of money in this scenario.</div></div>;
  }
  const f = failures[which];
  const picks = [["worst", "Worst case"], ["typical", "Typical failure"], ["closest", "Closest call"]];
  const WHICH_BLURB = {
    worst: "Worst case: the plan that ran out earliest.",
    typical: "Typical failure: the middle one, half ran out sooner and half later.",
    closest: "Closest call: the plan that ran out latest.",
  };
  const cols = [["Age", "age", true], ["Stocks", "stock", true], ["Portfolio return", "ret"], ["Inflation", "infl"], ["Spend", "spend"], ["Income", "income"], ["Tax", "tax"], ["Start", "start"], ["End", "end", true]]
    .filter((c) => allCols || c[2]);
  const pct = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
  const th = { textAlign: "right", padding: "3px 8px", fontWeight: 600, color: "var(--text-faint)", whiteSpace: "nowrap" };
  const td = { textAlign: "right", padding: "3px 8px", fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div className="chart-card" style={box}>
      <button type="button" className="ct" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              style={{ marginBottom: 4, background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "inherit", textAlign: "left" }}>
        Why plans failed <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 8 }}>
        {failures.count.toLocaleString()}{n ? ` of ${n.toLocaleString()}${` (${((failures.count / n) * 100).toFixed(0)}%)`}` : ""} simulated paths ran out of money. Pick one to see what happened each year (nominal dollars).
      </div>
      {open && (<>
      <div style={{ fontSize: "var(--fs-label)", color: "var(--text-primary)", marginBottom: 8 }}>
        {WHICH_BLURB[which]} Stocks {pct(f.rows[0]?.stock)} in year 1; money ran out at {f.exhaustAge}.
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {picks.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setWhich(k)}
                  style={{ fontSize: "var(--fs-small)", padding: "3px 10px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
                    minHeight: 28, border: `1px solid ${which === k ? "var(--accent-teal)" : "var(--card-border)"}`,
                    background: which === k ? "var(--bg-success)" : "transparent",
                    color: which === k ? "var(--accent-teal)" : "var(--text-secondary)" }}
                  aria-pressed={which === k}>
            {label} · out at {failures[k].exhaustAge}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "var(--fs-small)", width: "100%" }}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Year-by-year path for the {picks.find((x) => x[0] === which)[1].toLowerCase()}</caption>
          <thead><tr>{cols.map(([h, k]) => <th key={k} scope="col" style={k === "age" ? { ...th, position: "sticky", left: 0, background: "var(--bg-base)", textAlign: "left" } : th}>{h}</th>)}</tr></thead>
          <tbody>
            {f.rows.map((r) => {
              const cell = {
                age: <td key="age" style={{ ...td, textAlign: "left", position: "sticky", left: 0, background: r.short > 0 ? "var(--bg-danger)" : "var(--bg-base)" }}>{r.age}</td>,
                stock: <td key="stock" style={{ ...td, color: r.stock < 0 ? "var(--negative)" : "var(--positive)" }}>{pct(r.stock)}</td>,
                ret: <td key="ret" style={td}>{pct(r.ret)}</td>,
                infl: <td key="infl" style={td}>{pct(r.infl)}</td>,
                spend: <td key="spend" style={td}>{fmtDollar(r.spend)}</td>,
                income: <td key="income" style={td}>{fmtDollar(r.income)}</td>,
                tax: <td key="tax" style={td}>{fmtDollar(r.tax)}</td>,
                start: <td key="start" style={td}>{fmtDollar(r.start)}</td>,
                end: <td key="end" style={td}>{r.short > 0 ? `short ${fmtDollar(r.short)}` : fmtDollar(r.end)}</td>,
              };
              return <tr key={r.age} style={r.short > 0 ? { background: "var(--bg-danger)" } : undefined}>{cols.map(([, k]) => cell[k])}</tr>;
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setAllCols((v) => !v)} aria-expanded={allCols}
              style={{ marginTop: 8, background: "transparent", border: "none", color: "var(--accent-teal)", fontSize: "var(--fs-label)", cursor: "pointer", fontFamily: "inherit", padding: "4px 0", minHeight: 28 }}>
        {allCols ? "Show fewer columns ▴" : "Show all columns: returns, spending, income, tax ▾"}
      </button>
      </>)}
    </div>
  );
}

const SEQ_PICKS = [1929, 1966, 1973, 2000, 2007];
const SEQ_DEFAULT_YEARS = 5;
const SEQ_HISTORY_LENGTHS = [5, 10, 15, 20, 25, 30];
const SEQ_MAX_CUSTOM_YEARS = 10;
const SEQ_INPUT_STYLE = { background: "var(--card-bg-raised)", border: "1px solid var(--card-border)", color: "var(--text-primary)", borderRadius: 6, padding: "5px 8px", fontSize: "var(--fs-label)", minHeight: 28 };
const SEQ_RETURN_MIN = -90, SEQ_RETURN_MAX = 200;
const parseSeqText = (t) => t.split(/[\s,;]+/).filter((x) => x !== "").slice(0, SEQ_MAX_CUSTOM_YEARS);

const SEQ_NAMES = { 1929: "Great Depression", 1966: "Stagflation", 1973: "Oil shock", 2000: "Dot-com bust", 2007: "Financial crisis" };
const SEQ_CRASH = "var(--negative)";

function SeqBars({ items, big }) {
  const half = big ? 44 : 28;
  const maxAbs = Math.max(0.3, ...items.map((i) => Math.abs(i.r || 0)));
  return (
    <div style={{ display: "flex", gap: big ? 8 : 4, alignItems: "stretch" }}>
      {items.map((it, i) => {
        const r = it.r || 0;
        const h = Math.max(2, Math.round((Math.min(Math.abs(r), maxAbs) / maxAbs) * half));
        return (
          <div key={i} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={{ height: half * 2, position: "relative", borderBottom: "none" }}>
              <div style={{ position: "absolute", left: "18%", right: "18%", borderRadius: 3,
                ...(r < 0 ? { top: half, height: h, background: SEQ_CRASH } : { bottom: half, height: h, background: "var(--positive)" }) }} />
              <div style={{ position: "absolute", left: 0, right: 0, top: half, height: 1, background: "var(--divider)" }} />
            </div>
            <div style={{ fontSize: big ? "var(--fs-label)" : "var(--fs-small)", fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: "tabular-nums", color: r < 0 ? "var(--negative)" : "var(--positive)", fontWeight: 700 }}>
              {r > 0 ? "+" : ""}{(r * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function SequenceBuilder({ p, onResult }) {
  const [mode, setMode] = useState("history");
  const [startYear, setStartYear] = useState(2000);
  const [years, setYears] = useState(SEQ_DEFAULT_YEARS);
  const [custom, setCustom] = useState(["-30", "-20", "-10", "0", "10"]);
  const [today, setToday] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pasteNote, setPasteNote] = useState("");
  const endAge = p.endAge || 90;

  const typed = custom.map((v) => v.trim()).filter((v) => v !== "");
  const valid = typed.filter((v) => Number.isFinite(Number(v)));
  const outOfRange = valid.filter((v) => Number(v) < SEQ_RETURN_MIN || Number(v) > SEQ_RETURN_MAX);
  const hist = mode === "history";
  const histSeq = historicalSequence(startYear, years);
  let problem = "";
  if (!hist) {
    if (!valid.length) problem = "Enter at least one year to run.";
    else if (outOfRange.length) problem = `${outOfRange.join(", ")}% looks like a typo. Returns outside ${SEQ_RETURN_MIN}% to +${SEQ_RETURN_MAX}% are not realistic, so the scenario will not run.`;
    else if (valid.length < typed.length) problem = `${typed.length - valid.length} entry isn't a number and will be skipped.`;
  }
  const canRun = !busy && (hist || (valid.length > 0 && !outOfRange.length));

  const run = () => {
    const seq = hist ? histSeq : valid.map((v) => Number(v) / 100);
    if (!seq.length) return;
    setBusy(true);
    setTimeout(() => {
      const r = runMC(p, endAge, STRESS_PATHS, 99, true, seq, today, true);
      const when = today ? "starting today" : "at retirement";
      onResult({
        rate: r.rate, pcts: r.pcts, failures: r.failures ?? null, n: r.N,
        title: hist
          ? `Stress test: ${seq[0].year}–${seq[seq.length - 1].year} actual market sequence ${when}`
          : `Stress test: custom sequence (${valid.join(", ")}%) ${when}`,
        chips: seq.map((e, i) => ({ label: hist ? String(e.year) : `Yr ${i + 1}`, r: hist ? e.stock : e })),
      });
      setBusy(false);
      setStatus(`Done: ${seq.length} ${hist ? "historical" : "custom"} years ${when}. Results are below.`);
      if (typeof document !== "undefined") document.getElementById("stress-result")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 30);
  };

  const pill = (on) => ({
    fontSize: "var(--fs-label)", padding: "6px 14px", minHeight: 32, borderRadius: 16, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${on ? SEQ_CRASH : "var(--card-border)"}`,
    background: on ? "var(--bg-danger)" : "transparent", color: on ? SEQ_CRASH : "var(--text-secondary)",
  });
  const lab = { fontSize: "var(--fs-label)", color: "var(--text-muted)", marginRight: 8 };
  const head = { fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-faint)", marginBottom: 8 };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
      <div style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 12, maxWidth: 760 }}>
        Replace the one-year shock with a run of real or imagined markets. These numbers change stock returns only;
        bonds and inflation stay random (in real history they come from the same years). When the run ends,
        returns go back to random history.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button type="button" style={pill(mode === "history")} aria-pressed={mode === "history"} onClick={() => setMode("history")}>Real history</button>
        <button type="button" style={pill(mode === "custom")} aria-pressed={mode === "custom"} onClick={() => setMode("custom")}>My own numbers</button>
      </div>

      {hist ? (
        <div style={{ marginBottom: 14 }}>
          <div style={head}>Pick a market</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 12 }}>
            {SEQ_PICKS.map((y) => {
              const on = startYear === y;
              return (
                <button key={y} type="button" onClick={() => setStartYear(y)} aria-pressed={on}
                        style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", minHeight: 72,
                          border: `1px solid ${on ? SEQ_CRASH : "var(--card-border)"}`, background: on ? "var(--bg-danger)" : "var(--card-bg)",
                          color: "var(--text-primary)" }}>
                  <div style={{ fontSize: "var(--fs-h1)", fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: on ? SEQ_CRASH : "var(--text-primary)" }}>{y}</div>
                  <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)" }}>{SEQ_NAMES[y]}</div>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <label style={lab} htmlFor="seq-start">Or any start year</label>
            <select id="seq-start" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} style={SEQ_INPUT_STYLE} aria-label="Start year">
              {Array.from({ length: SAMPLE_END_YEAR - SAMPLE_START_YEAR + 1 }, (_, i) => SAMPLE_START_YEAR + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ ...lab, marginLeft: 10 }}>For</span>
            {SEQ_HISTORY_LENGTHS.map((n) => <button key={n} type="button" style={pill(years === n)} aria-pressed={years === n} onClick={() => setYears(n)}>{n} years</button>)}
          </div>
          <div style={head}>What your plan will live through</div>
          <SeqBars big items={histSeq.map((e) => ({ label: String(e.year), r: e.stock }))} />
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <div style={head}>Stock return for each year, in %</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(custom.length, 5)}, minmax(84px, 1fr))`, gap: 10, maxWidth: 640 }}>
            {custom.map((v, i) => (
              <div key={i}>
                <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", marginBottom: 3 }}>Year {i + 1}</div>
                <input type="number" inputMode="decimal" value={v} aria-label={`Year ${i + 1} stock return %`}
                       onChange={(e) => setCustom((c) => c.map((x, j) => (j === i ? e.target.value : x)))}
                       onFocus={selectAllOnFocus}
                       style={{ ...SEQ_INPUT_STYLE, width: "100%", boxSizing: "border-box", minHeight: 42, fontSize: "var(--fs-h2)", fontWeight: 700, padding: "6px 8px",
                         fontFamily: "'JetBrains Mono',monospace", fontVariantNumeric: "tabular-nums", color: Number(v) < 0 ? "var(--negative)" : SEQ_INPUT_STYLE.color }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            {custom.length < SEQ_MAX_CUSTOM_YEARS && (
              <button type="button" style={pill(false)} onClick={() => setCustom((c) => [...c, "0"])}>+ Add year</button>
            )}
            {custom.length > 0 && (
              <button type="button" style={pill(false)} aria-label={`Remove year ${custom.length}`} onClick={() => setCustom((c) => c.slice(0, -1))}>− Remove last</button>
            )}
            <label style={{ ...lab, marginLeft: 10 }} htmlFor="seq-paste">Or paste a list</label>
            <input id="seq-paste" type="text" placeholder="-30, -20, -10, 0, 10" autoComplete="off"
                   onChange={(e) => {
                     const t = parseSeqText(e.target.value);
                     if (!t.length) return;
                     const total = e.target.value.split(/[\s,;]+/).filter((x) => x !== "").length;
                     setCustom(t);
                     setPasteNote(total > t.length ? `Kept the first ${t.length} of ${total} years.` : `Replaced your years with ${t.length} from the list.`);
                   }}
                   style={{ ...SEQ_INPUT_STYLE, width: 220, fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          {pasteNote && <div role="status" style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", marginTop: 6 }}>{pasteNote}</div>}
          {custom.length >= SEQ_MAX_CUSTOM_YEARS && (
            <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", marginTop: 6 }}>Up to {SEQ_MAX_CUSTOM_YEARS} years. After that, returns go back to random history.</div>
          )}
          {problem && <div role="alert" style={{ fontSize: "var(--fs-body)", color: "var(--accent-gold)", marginTop: 8 }}>{problem}</div>}
          {valid.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={head}>What your plan will live through</div>
              <SeqBars big items={valid.map((v, i) => ({ label: `Year ${i + 1}`, r: Number(v) / 100 }))} />
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <span style={lab}>Starts</span>
        <button type="button" style={pill(!today)} aria-pressed={!today} onClick={() => setToday(false)}>At retirement</button>
        <button type="button" style={pill(today)} aria-pressed={today} onClick={() => setToday(true)}>Today</button>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className={canRun ? "mbtn on" : "mbtn"} onClick={run} disabled={!canRun}
                style={{ fontSize: "var(--fs-body)", padding: "10px 24px", minHeight: 42, fontWeight: 700, opacity: canRun ? 1 : 0.5 }}>
          {busy ? "Running…" : "Run scenario"}
        </button>
        <button type="button" onClick={() => { onResult(null); setStatus(""); }}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "var(--fs-body)", cursor: "pointer", fontFamily: "inherit", padding: "4px 0", minHeight: 32 }}>
          Clear result
        </button>
        <span role="status" style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)" }}>
          {status || (hist ? `${years} years from ${startYear}` : valid.length ? `${valid.length} ${valid.length === 1 ? "year" : "years"} will run` : "")}
        </span>
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
  assumptions,
  onAssumptionChange,
  onSaveConversionOverride,
  onRemoveConversionOverride,
}) {

  const [scenarioSubTab, setScenarioSubTab] = useState(initialSubTab || "roth");
  const [showSeq, setShowSeq] = useState(false);
  const [seqRun, setSeqRun] = useState(null);
  useEffect(() => setSeqRun(null), [baseParams]);
  const { pcts: stressPcts } = stress ?? {};
  const view = seqRun ?? (stress ? {
    rate: stress.rate, pcts: stressPcts,
    title: "Stress test: 2000–2012 actual S&P sequence at retirement",
    chips: SEQ_2000_2012.map((r, i) => ({ label: String(2000 + i), r })),
  } : null);

  useEffect(() => {
    if (initialSubTab) {
      setScenarioSubTab(initialSubTab);
      onSubTabConsumed && onSubTabConsumed();
    }
  }, [initialSubTab]);

  const SCENARIO_SUBTABS = [
    ["roth",        "Roth conversions"],
    ["withdrawals", "Withdrawal plan"],
    ["stress",      "Stress test"],
    ["buckets",     "Buckets"],
    ["income",      "Income"],
    ["realestate",  "Real estate"],
    ["progress",    "Progress"],
  ];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <PillTab
          ariaLabel="Analysis view"
          options={SCENARIO_SUBTABS}
          value={scenarioSubTab}
          onChange={setScenarioSubTab}
        />
      </div>

      {scenarioSubTab === "stress" && (
        <div>
          <StressScenarioGrid p={baseParams} baseRate={mc?.rate ?? null} fmtPct={fmtPct} onSeqResult={setSeqRun} />
          {view && (
            <>
          <div id="stress-result" style={{ scrollMarginTop: 12 }} />
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
                style={{ color: view.rate >= 0.85 ? "var(--positive)" : "var(--accent-gold)" }}
              >
                {fmtPct(view.rate)}
              </div>
              <div className="ms">{formulaFor("stress-success")}</div>
            </div>
            <div className="met">
              <div className="ml">Delta vs base</div>
              <div
                className="mv"
                style={{
                  color: mc && view.rate >= mc.rate ? "var(--positive)" : "var(--negative)",
                }}
              >
                {mc ? `${((view.rate - mc.rate) * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="ms">{formulaFor("stress-delta")}</div>
            </div>
          </div>
          <FanChart
            // eslint-disable-next-line no-restricted-properties -- FanChart deflates the whole array itself; see noRawMcAccess.test.js.
            pcts={view.pcts}
            retireAge={retireAge}
            ssAge={ssAge}
            rmdAge={rmdAge}
            inf={inf}
            useReal={real}
            title={view.title}
            checkpoints={checkpoints}
            portfolioGoal={portfolioGoal}
            earlyRetireTarget={earlyRetireTarget}
            dob={dob}
          />
          <button
            onClick={() => setShowSeq((v) => !v)}
            style={{
              marginTop: 10, background: "transparent", border: "none",
              color: "var(--accent-teal)", fontSize: "var(--fs-label)", cursor: "pointer",
              fontFamily: "inherit", padding: "4px 0",
            }}
          >
            {showSeq ? "Hide year-by-year S&P sequence ▴" : "Show year-by-year S&P sequence ▾"}
          </button>
          {showSeq && (
            <div
              style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}
            >
              {view.chips.map(({ label, r }, i) => (
                <span
                  key={i}
                  style={{
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: "var(--fs-small)",
                    fontFamily: "'JetBrains Mono',monospace",
                    background:
                      r < 0 ? "var(--tint-red-15)" : "var(--bg-success)",
                    color: r < 0 ? "var(--chart-1)" : "var(--positive)",
                    border: `1px solid ${
                      r < 0 ? "var(--tint-red-30)" : "rgba(79,216,143,0.25)"
                    }`,
                  }}
                >
                  {label}: {r > 0 ? "+" : ""}
                  {(r * 100).toFixed(1)}%
                </span>
              ))}
            </div>
          )}
          {view.failures !== undefined && <FailedPathPanel failures={view.failures} n={view.n} />}
            </>
          )}
        </div>
      )}

      {scenarioSubTab === "withdrawals" && (
        <WithdrawalPlanCombined p={baseParams} inf={inf} withdrawalStrategy={withdrawalStrategy} onAssumptionChange={onAssumptionChange} mc={mc} />
      )}

      {scenarioSubTab === "roth" && <RothLadder params={baseParams} onSaveConversionOverride={onSaveConversionOverride} onRemoveConversionOverride={onRemoveConversionOverride} onAssumptionChange={onAssumptionChange} />}
      {scenarioSubTab === "buckets"    && <BucketsTab params={baseParams} onAssumptionChange={onAssumptionChange} />}
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

function PreRetireReturnField({ value, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: "var(--fs-label)", color: "var(--text-muted)" }}>
        Growth until retirement (%/yr)
        <input type="number" step={0.5} placeholder="historical" value={value ?? ""}
               onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
               onFocus={selectAllOnFocus}
               style={{ ...SEQ_INPUT_STYLE, width: 90 }} />
      </label>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", lineHeight: 1.45, marginTop: 4 }}>
        Blank: balances grow with real market draws until you retire. 0 = no growth, only contributions. Re-run to apply.
      </div>
    </div>
  );
}

function MCAdvancedSettings({ p, onAssumptionChange }) {
  const range = resolveSampleRange(p);
  const startYr = Number.isFinite(Number(p?.mcRangeStart)) ? Math.round(Number(p.mcRangeStart)) : SAMPLE_START_YEAR;
  const endYr   = Number.isFinite(Number(p?.mcRangeEnd))   ? Math.round(Number(p.mcRangeEnd))   : SAMPLE_END_YEAR;
  const pathCount = Math.max(MC_PATH_MIN, Math.min(MC_PATH_MAX, Math.round(Number(p?.mcPaths) || MC_PATHS)));

  const stat = useMemo(() => {
    const lo = range ? range.start : 0;
    const hi = range ? range.start + range.count - 1 : SP500.length - 1;
    const n = hi - lo + 1;
    const mean = (arr) => {
      let s = 0;
      for (let i = lo; i <= hi; i++) s += arr[i];
      return s / n;
    };
    const worst = (arr) => {
      let w = Infinity;
      for (let i = lo; i <= hi; i++) w = Math.min(w, arr[i]);
      return w;
    };
    return {
      n, years: `${SAMPLE_START_YEAR + lo}–${SAMPLE_START_YEAR + hi}`,
      eq: mean(SP500), bond: mean(BONDS), infl: mean(INFL), worst: worst(SP500),
    };
  }, [range]);

  const set = (k, v) => onAssumptionChange && onAssumptionChange(k, v);
  const setRange = (which, raw) => {
    const v = Math.round(Number(raw));
    if (!Number.isFinite(v)) return;
    if (which === "start") set("mcRangeStart", Math.max(SAMPLE_START_YEAR, Math.min(v, endYr - 1)));
    else set("mcRangeEnd", Math.min(SAMPLE_END_YEAR, Math.max(v, startYr + 1)));
  };

  const sec = { background: "var(--row-highlight)", border: "1px solid var(--tint-white-08)", borderRadius: 9, padding: 14, marginBottom: 12 };
  const secHead = { fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-faint)", marginBottom: 10 };
  const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" };
  const lbl = { fontSize: "var(--fs-label)", color: "var(--text-secondary)", fontWeight: 600 };
  const help = { fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.55, marginTop: -4, marginBottom: 10 };
  const kv = { display: "flex", justifyContent: "space-between", fontSize: "var(--fs-small)", marginBottom: 4 };
  const isDefaultRange = startYr === SAMPLE_START_YEAR && endYr === SAMPLE_END_YEAR;
  const isDefaultPaths = pathCount === MC_PATHS;

  return (
    <InfoModal title="Monte Carlo — Advanced Settings" accent="var(--accent-teal)" maxWidth={640} bodyMaxHeight="64vh"
      trigger={
        <button type="button"
          style={{ padding: "5px 12px", fontSize: "var(--fs-small)", borderRadius: 7, cursor: "pointer",
            border: "1px solid var(--card-border)", background: "transparent", color: "var(--text-secondary)",
            fontWeight: 600, whiteSpace: "nowrap" }}>
          Advanced Settings
        </button>
      }
    >
      <div style={sec}>
        <div style={secHead}>Simulations</div>
        <div style={row}>
          <span style={lbl}>Simulated paths per run</span>
          <ANumInput value={pathCount} onSet={(v) => set("mcPaths", Math.max(MC_PATH_MIN, Math.min(MC_PATH_MAX, Math.round(v))))}
                     min={MC_PATH_MIN} max={MC_PATH_MAX} step={500} />
        </div>
        <div style={help}>
          Each path replays your whole plan against a different sequence of historical market years.
          More paths steady the success rate and the percentile bands; fewer finish faster. Default {MC_PATHS_LABEL}.
          {!isDefaultPaths ? ` Currently ${pathCount.toLocaleString()} — re-run Monte Carlo to apply.` : ""}
        </div>
      </div>

      <div style={sec}>
        <div style={secHead}>Historical Range To Sample</div>
        <div style={row}>
          <span style={lbl}>From</span>
          <ANumInput value={startYr} onSet={(v) => setRange("start", v)} min={SAMPLE_START_YEAR} max={SAMPLE_END_YEAR - 1} step={1} plain />
        </div>
        <div style={row}>
          <span style={lbl}>Through</span>
          <ANumInput value={endYr} onSet={(v) => setRange("end", v)} min={SAMPLE_START_YEAR + 1} max={SAMPLE_END_YEAR} step={1} plain />
        </div>
        <div style={help}>
          The engine bootstraps whole calendar years — stocks, bonds and inflation drawn together from the
          same year — so narrowing this window changes which markets your plan is tested against. Sample
          1928–{SAMPLE_END_YEAR} for every kind of history including the Depression and the 1970s stagflation,
          or a later window to test only the modern era.
          {!isDefaultRange ? " Re-run Monte Carlo to apply." : ""}
        </div>
        <div style={{ borderTop: "1px solid var(--tint-white-08)", paddingTop: 10 }}>
          <div style={{ ...kv, fontWeight: 700, color: "var(--text-secondary)" }}>
            <span>{isDefaultRange ? "Sampling full history" : "Sampling a narrowed window"}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{stat.years} · {stat.n} yrs</span>
          </div>
          <div style={kv}><span style={{ color: "var(--text-muted)" }}>Average equity year</span><span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--text-primary)" }}>{(stat.eq * 100).toFixed(2)}%</span></div>
          <div style={kv}><span style={{ color: "var(--text-muted)" }}>Average bond year</span><span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--text-primary)" }}>{(stat.bond * 100).toFixed(2)}%</span></div>
          <div style={kv}><span style={{ color: "var(--text-muted)" }}>Average inflation</span><span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--text-primary)" }}>{(stat.infl * 100).toFixed(2)}%</span></div>
          <div style={kv}><span style={{ color: "var(--text-muted)" }}>Worst equity year in window</span><span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#f87171" }}>{(stat.worst * 100).toFixed(2)}%</span></div>
        </div>
        {!isDefaultRange && (
          <button type="button" onClick={() => { set("mcRangeStart", SAMPLE_START_YEAR); set("mcRangeEnd", SAMPLE_END_YEAR); }}
            style={{ marginTop: 10, padding: "4px 10px", fontSize: "var(--fs-small)", borderRadius: 6, cursor: "pointer",
              border: "1px solid var(--card-border)", background: "transparent", color: "var(--accent-teal)", fontWeight: 600 }}>
            Reset to full history ({SAMPLE_START_YEAR}–{SAMPLE_END_YEAR})
          </button>
        )}
      </div>

      <div style={sec}>
        <div style={secHead}>Return &amp; Cost Assumptions</div>
        <div style={row}>
          <span style={lbl}>Inflation (CPI)</span>
          <ANumInput value={p.inf ?? 2.5} onSet={(v) => set("inf", v)} min={0} max={15} step={0.1} suffix="%" />
        </div>
        <div style={help}>
          Indexes spending, deflates every Real-$ figure, and drives the Social Security COLA.
        </div>
        <div style={row}>
          <span style={lbl}>Cash return</span>
          <ANumInput value={p.cashRealReturn ?? 3.0} onSet={(v) => set("cashRealReturn", v)} min={0} max={8} step={0.1} suffix="%" />
        </div>
        <div style={help}>
          What the cash bucket earns (HYSA, SGOV, money market) — in the Monte Carlo and the Withdrawal Plan alike.
        </div>
        <div style={row}>
          <span style={lbl}>SS COLA / yr</span>
          <ANumInput value={p.ssCola ?? 2.4} onSet={(v) => set("ssCola", v)} min={0} max={6} step={0.1} suffix="%" />
        </div>
        <div style={help}>
          Annual Social Security cost-of-living adjustment. Applies from your claim age, not from retirement.
        </div>
        <div style={{ borderTop: "1px solid var(--tint-white-08)", paddingTop: 10, marginTop: 4 }}>
          <div style={{ ...row, marginBottom: 6 }}>
            <span style={lbl}>Equity glide</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ANumInput value={p.preRetireEq ?? 91} onSet={(v) => set("preRetireEq", v)} min={50} max={100} step={1} suffix="%" />
              <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-label)" }}>→</span>
              <ANumInput value={p.postRetireEq ?? 70} onSet={(v) => set("postRetireEq", v)} min={30} max={100} step={1} suffix="%" />
            </span>
          </div>
          <div style={row}>
            <span style={{ ...lbl, fontWeight: 500, color: "var(--text-muted)" }}>Switch to the second mix at age</span>
            <input
              type="number"
              value={p.glidepathSwitchAge ?? ""}
              placeholder={`${p.retireAge ?? ""}`}
              min={AGE_LIMITS.retire.min}
              max={AGE_LIMITS.retire.max}
              onChange={(e) => set("glidepathSwitchAge", e.target.value ? parseInt(e.target.value, 10) : null)}
              onFocus={selectAllOnFocus}
              style={{ width: 84, background: "var(--row-highlight)", border: "1px solid var(--card-border)", color: "var(--text-primary)", borderRadius: 6, padding: "3px 8px", fontSize: "var(--fs-label)", fontFamily: "var(--font-mono)" }}
            />
          </div>
          <div style={help}>
            Stock share while saving → stock share once retired, and the age you shift. The second number is your
            sequence-of-returns dial: raising it lifts the median outcome but widens the downside, so the success
            rate can fall even as the median rises. Both set the average return AND the volatility. Blank switch age
            = shift at retirement (age {p.retireAge}).
            {" "}Blended expected returns: {expectedReturn(p.preRetireEq ?? 91).toFixed(1)}% before, {expectedReturn(p.postRetireEq ?? 70).toFixed(1)}% after.
          </div>
        </div>
      </div>

      <div style={sec}>
        <div style={secHead}>Spending Guardrails</div>
        <div style={row}>
          <span style={lbl}>Floor — % of core spend</span>
          <ANumInput value={p.gkFloorPct ?? GK_FLOOR_DEFAULT_PCT} onSet={(v) => set("gkFloorPct", v)} min={50} max={95} step={5} suffix="%" />
        </div>
        <div style={row}>
          <span style={lbl}>Ceiling — % of core spend</span>
          <ANumInput value={p.gkCeilingPct ?? GK_CEILING_DEFAULT_PCT} onSet={(v) => set("gkCeilingPct", v)} min={105} max={200} step={5} suffix="%" />
        </div>
        <div style={help}>
          The hard floor and cap on real spending, applied after every Guyton-Klinger adjustment: spending
          will never fall below the floor even after repeated cuts, nor rise above the ceiling after repeated raises.
          These apply to the GK-family strategies (Guyton-Klinger, Risk, Kitces) and the Smart waterfall.
        </div>
        <div style={{ borderTop: "1px solid var(--tint-white-08)", paddingTop: 10, fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>Guyton-Klinger rules in force (fixed by the method)</div>
          <div>Withdrawal rate {Math.round(GK_BAND_PCT * 100)}% above the initial rate → cut spending {Math.round(GK_ADJUST_PCT * 100)}%.</div>
          <div>Withdrawal rate {Math.round(GK_BAND_PCT * 100)}% below the initial rate → raise spending {Math.round(GK_ADJUST_PCT * 100)}%.</div>
          <div>No cut when {GK_LONGEVITY_YEARS} years or fewer remain to your plan age.</div>
          <div>Inflation pass-through applied only after a positive-return year, capped at {Math.round(GK_INFLATION_CAP * 100)}%/yr.</div>
        </div>
      </div>

      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", lineHeight: 1.6 }}>
        Plan horizon {Math.max(0, (p.endAge || 0) - effectiveRetireAge(p.retireAge, p.currentAge))} yrs ·
        {" "}{pathCount.toLocaleString()} paths × {stat.n}-year sampling window ({stat.years}) ·
        both applied on the next run.
      </div>
    </InfoModal>
  );
}

function MCOverviewCards({ mc, inf = 0, real = false, endAge, currentAge, retireAge }) {
  if (!mc) return null;
  const p50 = selectPortfolioAtAge(mc, endAge, { retireAge, real, inf, pct: "p50" });
  const p90 = selectPortfolioAtAge(mc, endAge, { retireAge, real, inf, pct: "p90" });
  const mean = selectTerminalMeanAtAge(mc, endAge, { retireAge, real, inf });
  const money = (v) => (v == null ? "—" : fmtDollar(v));
  const retAge = effectiveRetireAge(retireAge, currentAge);
  const basisYear = CURRENT_YEAR + Math.max(0, retAge - (currentAge ?? retAge));
  const basis = real ? `${basisYear} dollars` : `future (${basisYear}-basis) dollars`;
  const paths = mc.N ? mc.N.toLocaleString() : "simulated";

  const cardStyle = { color: INFO_ACCENT.money, textAlign: "right" };
  const provLine = { fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 6, lineHeight: 1.45 };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <div className="met">
          <div className="ml">Success Rate</div>
          <div className="mv" style={{ color: INFO_ACCENT.positive, textAlign: "right" }}>{fmtPct(mc.rate)}</div>
          <div className="ms">{paths} simulated paths, funded all the way to age {endAge}</div>
          <div style={provLine}>{formulaFor("ov-success")}</div>
        </div>
        <div className="met">
          <div className="ml">Mean Final Balance</div>
          <div className="mv" style={cardStyle}>{money(mean)}</div>
          <div className="ms">Average of every path at age {endAge} — the best sequences pull it above the median</div>
          <div style={provLine}>{formulaFor("ov-mean-final")}</div>
        </div>
        <div className="met">
          <div className="ml">Best Case (90th)</div>
          <div className="mv" style={cardStyle}>{money(p90)}</div>
          <div className="ms">90% of simulated outcomes ended below this · at age {endAge}</div>
          <div style={provLine}>{formulaFor("ov-best-case")}</div>
        </div>
        <div className="met">
          <div className="ml">Median Final Balance</div>
          <div className="mv" style={{ color: "var(--accent-teal)", textAlign: "right" }}>{money(p50)}</div>
          <div className="ms">Half of all outcomes ended above this · at age {endAge}</div>
          <div style={provLine}>{formulaFor("ov-median")}</div>
        </div>
      </div>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 6 }}>
        Showing {basis}. Every figure is read from the same run — nothing here is recomputed in the UI.
      </div>
    </div>
  );
}

export function pinnedConversionNote(count) {
  if (!count) return null;
  return `Monte Carlo Ignores Your ${count} Pinned Conversion${count === 1 ? "" : "s"}: these odds assume the bracket-target conversions. The Year-by-Year Schedule uses your pins.`;
}

function VerdictHeader({ mc, stress, real = false, inf = 0, endAge, currentAge, retireAge, swr, swrBenchmark = 0.04, pinnedConversions = 0 }) {
  if (!mc) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", marginBottom: 10, background: "var(--row-highlight)", border: "1px solid var(--card-border)", borderRadius: 8, fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
        <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>No verdict yet.</span>
        <span>Run Monte Carlo from the sidebar and this strip will hold your headline answers here, on every tab.</span>
      </div>
    );
  }
  const retAge = effectiveRetireAge(retireAge, currentAge);
  const basisYear = CURRENT_YEAR + Math.max(0, retAge - (currentAge ?? retAge));
  const worst = selectPortfolioAtAge(mc, endAge, { retireAge: retAge, real, inf, pct: "p10" });
  const survived = mc.rate;
  const outlives = mc.mwRate;
  const exhaust = mc.medianExhaustAge;

  const fact = { display: "flex", flexDirection: "column", gap: 1, minWidth: 0 };
  const k = { fontSize: "var(--fs-small)", color: "var(--text-faint)", whiteSpace: "nowrap" };
  const v = { fontSize: "var(--fs-h2)", fontWeight: 800, fontFamily: "var(--font-mono)", lineHeight: 1.1, whiteSpace: "nowrap" };
  const sep = { width: 1, alignSelf: "stretch", background: "var(--divider)", flexShrink: 0 };

  return (
    <div
      role="status"
      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", padding: "9px 14px", marginBottom: 10, background: "var(--card-bg)", border: "1px solid var(--card-border)", borderLeft: `3px solid ${rateColor(survived)}`, borderRadius: 8 }}
    >
      <div style={fact}>
        <span style={k}>Withdrawal rate</span>
        <span style={{ ...v, color: "var(--text-primary)" }}>
          {swr != null ? `${swr}%` : "—"}
        </span>
      </div>
      <div style={sep} />
      <div style={fact}>
        <span style={k}>Money outlives you</span>
        <span style={{ ...v, color: rateColor(outlives ?? survived) }}>
          {outlives != null ? fmtPct(outlives) : "—"}
        </span>
      </div>
      <div style={sep} />
      <div style={fact}>
        <span style={k}>Worst case at {endAge}</span>
        <span style={{ ...v, color: worst == null ? "var(--text-muted)" : worst > 0 ? "var(--text-primary)" : "var(--negative)" }}>
          {worst == null ? "—" : fmtDollar(worst)}
        </span>
        {worst != null && <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>1 in 10 outcomes end lower</span>}
      </div>
      <div style={sep} />
      <div style={fact}>
        <span style={k}>Runs out</span>
        <span style={{ ...v, color: exhaust == null ? "var(--positive)" : "var(--text-primary)" }}>
          {exhaust == null ? "Never" : `Age ${exhaust}`}
        </span>
        {exhaust != null && <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>in the paths that fail</span>}
      </div>
      {stress && (<>
        <div style={sep} />
        <div style={fact}>
          <span style={k}>Stress test 2000–12</span>
          <span style={{ ...v, color: rateColor(stress.rate) }}>{fmtPct(stress.rate)}</span>
        </div>
      </>)}
      <div style={sep} />
      <div style={fact}>
        <InfoModal title="Your headline answers" accent={INFO_ACCENT.method}
          trigger={<span aria-label="What are these numbers?" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, color: INFO_ACCENT.method, fontSize: "var(--fs-small)", fontWeight: 600 }}><InfoIcon size={13} /> What are these?</span>}>
          <ModalLede>These numbers answer the questions that actually matter, before you open a single tab.</ModalLede>
          <ModalP><Em color={INFO_ACCENT.money}>Withdrawal rate</Em> — first-year spending net of guaranteed income, divided by the portfolio at retirement, against a {(swrBenchmark * 100).toFixed(0)}% benchmark. It sizes the draw the plan starts from; the success rate on the card above is what says whether that rate holds to age {endAge}.</ModalP>
          <ModalP><Em color={INFO_ACCENT.positive}>Money outlives you</Em> — the same paths, re-weighted by your odds of actually being alive at each failure age. It is always at least as high as the funded-to-age success rate on the card above, and it answers the actuarial question rather than the worst-case one.</ModalP>
          <ModalP><Em color={INFO_ACCENT.money}>Worst case</Em> — the 10th-percentile ending balance: 90% of simulated outcomes finished above it. A small worst case beside a high success rate is one bad sequence away from joining the failures.</ModalP>
          <ModalP><Em color={INFO_ACCENT.risk}>Runs out</Em> — the typical age at which the simulated paths that ran out of money did so (the middle one). It describes only the paths that failed, not your whole plan, so a high success rate can sit beside a young age here. "Never" appears only when no simulated path ran out. When few paths fail, this figure rests on few paths: treat it as indicative.</ModalP>
          {stress && <ModalP><Em color={INFO_ACCENT.risk}>Stress test</Em> — the share of paths funded to age {endAge} when retirement opens with the actual 2000–2012 S&amp;P 500 sequence. The year-by-year detail is on Analysis → Stress Test.</ModalP>}
          <ModalNote accent={INFO_ACCENT.method}>All of them are read from the one simulation you last ran — nothing here is recomputed. Change an input and the strip goes stale with the rest of the results until you re-run.</ModalNote>
        </InfoModal>
      </div>
      <div style={{ marginLeft: "auto" }}>
        <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{real ? `Amounts in ${basisYear} dollars` : "Amounts in future dollars"}</span>
      </div>
      {pinnedConversions > 0 && (
        <div style={{ flexBasis: "100%", fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
          {pinnedConversionNote(pinnedConversions)}
        </div>
      )}
    </div>
  );
}

function MCTab({ params, mc, running, onRun, checkpoints, onUpdateCheckpoints, onDeleteCheckpoint, portfolioGoal, earlyRetireTarget, dob, onSetBaselineFromCheckpoint, withdrawalStrategy, inf = 0, real = false, onAssumptionChange, chart }) {
  const [showInputs, setShowInputs] = useState(false);
  const [showGaps, setShowGaps] = useState(false);

  const effRetireAge = effectiveRetireAge(params.retireAge, params.currentAge);
  const accPhase = effRetireAge > params.currentAge
    ? `Age ${params.currentAge} → ${effRetireAge}`
    : "already retired — no accumulation phase";
  const retPhase = `Age ${effRetireAge} → ${params.endAge}`;

  const termAt = (k) => selectPortfolioAtAge(mc, params.endAge, { retireAge: effRetireAge, real, inf, pct: k }) ?? 0;
  const dollarBasis = dollarBasisLabel(real, retirementBasisYear(params.currentAge, effRetireAge, CURRENT_YEAR));
  const pathsLabel = mc?.N ? mc.N.toLocaleString() : MC_PATHS_LABEL;
  const mortSched = params.mortBalance > 0
    ? mortgageSchedule(params.mortBalance, params.mortRate ?? 6.5, params.mortStart || "2020-01", params.mortTerm || 30, params.mortExtra || 0)
    : null;
  const mortAnnual = mortSched ? mortSched.pmt * 12 : 0;
  const mortPayoffAge = mortSched
    ? params.currentAge + (mortSched.payoffYr - new Date().getFullYear())
    : 0;
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

  const SectionHeader = ({ label, open, onToggle, color = "var(--accent-teal)", hint }) => (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 0", borderBottom: "1px solid var(--tint-white-07)", marginBottom: open ? 14 : 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-small)", color, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}>▶</span>
        <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color }}>{label}</div>
        {hint && <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{open ? "Hide" : "Show"}</div>
    </div>
  );

  const InputCard = ({ title, rows }) => (
    <div style={{ background: "var(--row-highlight)", border: "1px solid var(--tint-white-08)", borderRadius: 9, padding: 14 }}>
      <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-faint)", marginBottom: 10 }}>{title}</div>
      {rows.map(([label, val], i) => (
        <div key={`${label}|${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, fontSize: "var(--fs-label)" }}>
          <span style={{ color: "var(--text-muted)" }}>{label}</span>
          <span style={{ color: "var(--text-primary)", fontFamily: "'JetBrains Mono',monospace", fontWeight: 500, textAlign: "right" }}>{val}</span>
        </div>
      ))}
    </div>
  );

  const planHorizon  = Math.max(0, (params.endAge || 0) - effRetireAge);
  const longHorizon  = planHorizon >= 40;
  const preMedicare  = Math.max(0, 65 - effRetireAge);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {(longHorizon || preMedicare > 0) && (<>
        <button type="button" className="gap-row" onClick={() => setShowGaps(true)} aria-haspopup="dialog">
          <Dot tone="warn" />
          <span style={{ flex: 1, minWidth: 0 }}>
            {preMedicare > 0 && longHorizon
              ? <><strong>Not in this forecast:</strong> {preMedicare} years of health insurance before Medicare, plus 2 long-retirement caveats. The plan looks better than it is.</>
              : preMedicare > 0
              ? <><strong>Not in this forecast:</strong> health insurance for your {preMedicare} years before Medicare. The plan looks better than it is.</>
              : <><strong>{planHorizon}-year retirement:</strong> the spending curve and the 4% rule are stretched past their evidence.</>}
          </span>
          <span className="gap-more">What to do ›</span>
        </button>
        <InfoModal title="What this forecast leaves out" accent="var(--accent-gold)" maxWidth={560} bodyMaxHeight="60vh" open={showGaps} onClose={() => setShowGaps(false)}>
          <ModalLede>These are not modelled, and they make the plan look better than it is.</ModalLede>
          {preMedicare > 0 && (<>
            <ModalP>
              <Em color="var(--accent-gold)">Health insurance before Medicare.</Em>{" "}
              You have {preMedicare} years to cover before 65. AiRA models catastrophic healthcare
              shocks but not ACA marketplace premiums.
            </ModalP>
            <ModalNote><strong>What to do:</strong> include those premiums in your annual spending yourself.</ModalNote>
            <ModalP>
              <Em color="var(--accent-gold)">Roth conversions before 65.</Em>{" "}
              The Roth conversion planner optimises against tax brackets and IRMAA, and IRMAA does not
              begin until 63. It does not know about ACA premium subsidies, which phase out on income.
            </ModalP>
            <ModalNote><strong>What to do:</strong> before 65, check the subsidy you would lose before acting on a recommended conversion. It can cost more than the conversion saves in tax.</ModalNote>
          </>)}
          {longHorizon && (<>
            <ModalP>
              <Em color="var(--accent-gold)">The spending curve is extrapolated.</Em>{" "}
              The Blanchett smile measures retirees in their 60s and 70s; applied from age {effRetireAge} it
              assumes your real spending drifts down to about{" "}
              {Math.round(spendingSmileFactor(Math.min(80, params.endAge), effRetireAge) * 100)}% of today's by 80.
              That is well past the data it was fitted on.
            </ModalP>
            <ModalNote><strong>What to do:</strong> turn off <strong>Reduce spending with age</strong> in the sidebar Options for a flat-real plan. It is a stricter and, over {planHorizon} years, more defensible test.</ModalNote>
            <ModalP>
              <Em color="var(--accent-gold)">4% is a 30-year rule.</Em>{" "}
              Bengen and Guyton-Klinger were derived for ~30-year retirements. The success rate
              is computed honestly for the rate you chose; it is the rule of thumb, not the simulation,
              that does not transfer.
            </ModalP>
            <ModalNote><strong>What to do:</strong> over {planHorizon} years the sustainable rate is materially lower, commonly cited near 3.0–3.5%. Compare your withdrawal rate with that.</ModalNote>
          </>)}
          <ModalP>
            What is modelled: retiring at {effRetireAge} is fully simulated across all {planHorizon} years,
            with the early-withdrawal penalty, the bridge to Social Security, and bracket-capped drawdown.
          </ModalP>
        </InfoModal>
      </>)}

      {chart}
      {!mc && <div style={{ textAlign: "center", padding: "20px", color: "var(--text-faint)", fontSize: "var(--fs-body)" }}>{running ? `Running ${MC_PATHS_LABEL} paths...` : "Run Monte Carlo from the sidebar to see results here."}</div>}
      {mc && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 18px", padding: "0 2px", fontSize: "var(--fs-label)", color: "var(--text-muted)" }}>
          <span>Balance at age {params.endAge} · {dollarBasis}</span>
          {[["10th", "p10", "10th"], ["25th", "p25", "25th"], ["Median", "p50", "Median"], ["75th", "p75", "75th"], ["90th", "p90", "90th"]].map(([l, k, c]) => (
            <span key={k}>{l} <strong style={{ color: FAN_COLORS[c], fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(termAt(k))}</strong></span>
          ))}
        </div>
      )}


      {mc && (() => {
        const ex = explainScore(params, mc, computeInitialWR(params));
        if (!ex.drivers.length) return null;
        const tone = {
          risk:  { fg: "var(--chart-1)", tag: "Biggest risk" },
          watch: { fg: "#fdba74", tag: "Worth knowing" },
          good:  { fg: "var(--positive)", tag: "Working for you" },
        };
        return (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--tint-white-08)", borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>What's driving this</div>
            {ex.drivers.map((d, i) => {
              const t = tone[d.severity];
              return (
                <details key={d.id} open={i === 0 && d.severity === "risk"} style={{ borderTop: i ? "1px solid var(--divider)" : "none" }}>
                  <summary style={{ cursor: "pointer", padding: "8px 0", fontSize: "var(--fs-label)" }}>
                    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 10px", width: "calc(100% - 20px)", verticalAlign: "top" }}>
                      <span style={{ flex: "1 1 180px", minWidth: 0, fontWeight: 600, color: "var(--text-primary)" }}>{d.label}</span>
                      <span style={{ fontSize: "var(--fs-small)", color: t.fg, whiteSpace: "nowrap" }}>{t.tag}</span>
                      <span style={{ fontWeight: 700, color: t.fg, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{d.value}</span>
                    </span>
                  </summary>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.55, paddingBottom: 10 }}>
                    {d.detail}{" "}
                    <strong style={{ color: t.fg }}>What moves it: </strong><span style={{ color: "var(--text-secondary)" }}>{d.lever}</span>
                  </div>
                </details>
              );
            })}
          </div>
        );
      })()}




      <div style={{ background: "var(--card-bg)", border: "1px solid var(--tint-white-08)", borderRadius: 10, padding: 16, scrollMarginTop: 16 }}>
        <SectionHeader label="Simulation inputs & assumptions" open={showInputs} onToggle={() => setShowInputs(!showInputs)}
          hint={[
            getStrategyLabel(resolveStrategy(withdrawalStrategy)),
            params.smile !== false ? "spending declines with age" : "flat spending",
            params.tax !== false ? "taxes modelled" : "tax OFF",
          ].join(" · ")}
        />
        {showInputs && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "#0ea5e9", marginBottom: 10 }}>ACCUMULATION PHASE ({accPhase})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                <InputCard title="Starting Balances" rows={[...(params.accounts || []).filter(a => (a.balance || 0) > 0).map(a => [a.name || a.category, fmtDollar(a.balance || 0)]), ["Total liquid", fmtDollar(params.port)]]} />
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
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--accent-purple)", marginBottom: 10 }}>WITHDRAWAL PHASE ({retPhase})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
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
            {(cfInflows.length > 0 || cfOutflows.length > 0) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--accent-gold)", marginBottom: 10 }}>
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
                    ["Applied to", `All ${pathsLabel} paths + the year-by-year plan`],
                  ]} />
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--positive)", marginBottom: 10 }}>MARKET &amp; STATISTICAL MODEL</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                <InputCard title="Return Distribution" rows={[["Model", "Historical bootstrap"], ["Equity data", `${SAMPLE_YEARS}yr S&P 500 (${SAMPLE_START_YEAR}–${SAMPLE_END_YEAR})`], [`Pre-retire mix (${params.preRetireEq ?? 91}/${100 - (params.preRetireEq ?? 91)})`, "Equity / Bonds"], [`Post-retire mix (${params.postRetireEq ?? 70}/${100 - (params.postRetireEq ?? 70)})`, "Equity / Bonds"]]} />
                <InputCard title="Inflation & Guardrails" rows={[["Inflation", "Historical bootstrap"], ["Inflation source", `CPI for the same years (${SAMPLE_START_YEAR}–${SAMPLE_END_YEAR})`], ["GK floor", fmtDollar(params.gkFloor) + "/yr"], ["GK ceiling", fmtDollar(params.gkCeiling) + "/yr"]]} />
                <InputCard title="Simulation Parameters" rows={[["Simulations", `${pathsLabel} paths`], ["Horizon", `Age ${params.endAge || 90} (your plan age)`], ["Withdrawal", getStrategyLabel(params.withdrawalStrategy || "smart")], ["Rental reliability", `${params.abReliability ?? 80}% per year`]]} />
              </div>
            </div>
          </>
        )}
      </div>

      <CheckpointsPanel
        checkpoints={checkpoints}
        mc={mc}
        retireAge={effRetireAge}
        dob={dob}
        currentPort={params?.port || 0}
        fmtDollar={fmtDollar}
        onUpdate={onUpdateCheckpoints}
        onDelete={onDeleteCheckpoint}
        onSetBaseline={onSetBaselineFromCheckpoint}
      />

    </div>
  );
}

function McTabDisclaimer() {
  return (
    <SectionDisclaimer>
      These are hypothetical projections generated by a model, not a prediction and not a
      recommendation to buy, sell, or hold any investment. A success rate is the share of
      simulated scenarios in which the portfolio survived — it is not a probability that
      your actual retirement will succeed, and past market results do not guarantee future
      ones. Discuss any decision with a licensed financial, tax, or legal professional who
      knows your full circumstances.
    </SectionDisclaimer>
  );
}

function MortgageTab({ values, onChange }) {
  const bal   = values.mortBalance || 0;
  const rate  = values.mortRate    ?? 6.5;
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

  const properties = values.properties || [{ id: "p1", label: "Primary Residence", value: 0, mortgage: 0, income: 0 }];
  const nav = useContext(NavContext);

  const totalValue    = properties.reduce((s, p) => s + (p.value||0), 0);
  const totalMortgage = properties.reduce((s, p) => s + (p.mortgage||0), 0);
  const totalEquity   = totalValue - totalMortgage;
  const totalIncome   = properties.reduce((s, p) => s + (p.income||0), 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <div style={{ fontSize: "var(--fs-label)", fontWeight:600, color:"var(--text-primary)" }}>Properties</div>
          {nav && (
            <button type="button" className="cfg-btn" style={{ width:"auto", margin:0, padding:"6px 14px" }}
              onClick={() => nav("assumptions", null, PROFILE_STEP_REAL_ESTATE)}>
              Edit in Plan inputs →
            </button>
          )}
        </div>
        {properties.filter(pr => (pr.value||0) || (pr.mortgage||0) || (pr.income||0)).map((prop) => (
          <div key={prop.id} style={{ display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap", fontSize: "var(--fs-label)", color:"var(--text-secondary)", border:"1px solid var(--card-border)", borderRadius:8, padding:"8px 12px" }}>
            <strong style={{ color:"var(--text-primary)" }}>{prop.label}</strong>
            <span>Value {fmtDollar(prop.value||0)} · Mortgage {fmtDollar(prop.mortgage||0)} · Equity {fmtDollar((prop.value||0)-(prop.mortgage||0))}{(prop.income||0) > 0 ? ` · ${fmtDollar(prop.income)}/yr income` : ""}</span>
          </div>
        ))}

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {[
            { l:"Total value",    v:totalValue,    c:"var(--text-primary)" },
            { l:"Total mortgage", v:totalMortgage, c:"var(--text-primary)" },
            { l:"Total equity",   v:totalEquity,   c:"var(--text-primary)" },
            { l:"Annual income",  v:totalIncome,   c:"var(--text-primary)" },
          ].map(m => (
            <div key={m.l} className="met">
              <div className="ml">{m.l}</div>
              <div className="mv" style={{ color:m.c, fontSize: "var(--fs-h2)" }}>{fmtDollar(m.v)}</div>
              <div className="ms">{formulaFor("bucket-metrics")}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card">
        <div className="ct">{properties[0]?.label || "Primary Residence"} · Mortgage calculator</div>

        <div className="metrics" style={{ marginBottom:12 }}>
          <div className="met">
            <div className="ml">Current balance</div>
            <div className="mv" style={{ color:"var(--text-primary)", fontSize: "var(--fs-h2)" }}>{fmtDollar(bal)}</div>
          </div>
          <div className="met">
            <div className="ml">Payoff year</div>
            <div className="mv" style={{ color:"var(--text-primary)", fontSize: "var(--fs-h2)" }}>{sched.payoffYr}</div>
            <div className="ms">With ${extra}/mo extra</div>
          </div>
          <div className="met">
            <div className="ml">Interest saved</div>
            <div className="mv" style={{ color:"var(--text-primary)", fontSize: "var(--fs-h2)" }}>{fmtDollar(sched.interestSaved)}</div>
            <div className="ms">vs no extra</div>
          </div>
          <div className="met">
            <div className="ml">Monthly P&amp;I</div>
            <div className="mv" style={{ color:"var(--text-primary)", fontSize: "var(--fs-h2)" }}>{fmtDollar(sched.pmt)}</div>
            <div className="ms">At {rate}% fixed</div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top:8, right:8, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)"/>
            <XAxis dataKey="yr" stroke="#1e3a5f" tick={{ fill:"var(--text-faint)", fontSize: "var(--fs-small)" }}/>
            <YAxis stroke="#1e3a5f" tick={{ fill:"var(--text-faint)", fontSize: "var(--fs-small)" }}
              tickFormatter={v=>fmtDollar(v)} width={MONEY_AXIS_WIDTH}/>
            <Tooltip content={<Tip/>}/>
            <Line type="monotone" dataKey="With extra" stroke="var(--positive)" strokeWidth={2.5} dot={false}/>
            <Line type="monotone" dataKey="Original" stroke="var(--text-faint)" strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <div className="ct">Amortization — first 10 years{extra > 0 ? " with extra payments" : ""}</div>
        <table className="nw-table">
          <thead>
            <tr><th>Year</th><th>Principal</th><th>Interest</th><th>Extra</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {sched.years.slice(0,10).map(r => (
              <tr key={r.yr}>
                <td style={{ textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>{r.yr}</td>
                <td>{fmtDollar(r.pPaid)}</td>
                <td style={{ color:"var(--chart-1)" }}>{fmtDollar(r.iPaid)}</td>
                <td style={{ color:"var(--positive)" }}>{fmtDollar(r.ePaid)}</td>
                <td style={{ color:"#0ea5e9" }}>{fmtDollar(r.bal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetWorthTip({ active, payload, label, p }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const liquid = row["Liquid Portfolio"];
  const mort = row["Mortgage Debt"] || 0;
  const re = row["Real Estate"] || 0;
  const nw = row["Net Worth"];
  const yr = Number.isFinite(label) ? new Date().getFullYear() + (label - (p?.currentAge ?? label)) : null;

  const accts = p?.accounts || [];
  const sumOf = (keys) => accts.filter((a) => keys.includes(a.category)).reduce((s, a) => s + (a.balance || 0), 0);
  const groups = [
    { name: "Pre-Tax",     color: "#0ea5e9", value: sumOf(["pretax"]) },
    { name: "Tax-Free",    color: "var(--positive)", value: sumOf(["roth", "hsa"]) },
    { name: "Taxable",     color: "var(--accent-gold)", value: sumOf(["taxable"]) },
    { name: "Cash",        color: "var(--text-muted)", value: sumOf(["cash"]) },
  ].filter((g) => g.value > 0);
  const groupTotal = groups.reduce((s, g) => s + g.value, 0);
  const atStart = Number.isFinite(liquid) && Math.abs(liquid - groupTotal) <= 1;
  const stillTraceableToToday = Number.isFinite(liquid) && liquid > 0 && liquid <= groupTotal * 1.5;

  const line = (name, value, color, opts = {}) => (
    <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
      <span style={{ color: "var(--text-secondary)" }}>{name}: </span>
      <span style={{ color: opts.muted ? "var(--text-muted)" : "var(--text-primary)" }}>{fmtDollar(value)}</span>
    </div>
  );

  return (
    <div className="tip-box">
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>
        Age {label}{yr ? ` · ${yr}` : ""}
      </div>
      {line("Liquid Portfolio", liquid ?? 0, "#0ea5e9")}
      {groups.length > 0 && (atStart || stillTraceableToToday) && (
        <div style={{ marginLeft: 14, marginBottom: 2 }}>
          {!atStart && (
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 1 }}>
              from today's balances of:
            </div>
          )}
          {groups.map((g) => (
            <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-body)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 1, background: g.color, display: "inline-block", flexShrink: 0, opacity: 0.75 }} />
              <span style={{ color: "var(--text-muted)" }}>{g.name}: </span>
              <span style={{ color: "var(--text-muted)" }}>{fmtDollar(g.value)}</span>
            </div>
          ))}
        </div>
      )}
      {re > 0 && line("Real Estate", re, "var(--accent-gold)")}
      {mort !== 0 && line("Mortgage Debt", mort, "var(--negative)", { muted: true })}
      {Number.isFinite(nw) && (
        <div style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid var(--tint-white-14)", display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>Total Net Worth</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{fmtDollar(nw)}</span>
        </div>
      )}
    </div>
  );
}

export function NetWorthTab({ p, mc, inf, real }) {
  const [showRE, setShowRE] = useState(false);
  // eslint-disable-next-line no-restricted-properties -- array-wide scan (peak across every age); no single-age selector call could give this.
  const dPcts = useMemo(() => (mc ? deflate(mc.pcts, inf, real) : []), [mc, inf, real]);
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
        const yearsToAge = age - p.currentAge;
        let acc = currentPort;
        for (let y = 0; y < yearsToAge; y++) {
          acc = acc * (1 + preReturnRate) + householdAnnualContribution(p, p.currentAge + y)
              + computeCashFlowEvents(p.cashFlowEvents, CURRENT_YEAR + y, p.inf ?? 2.5, CURRENT_YEAR).inflow;
        }
        port = Number.isFinite(acc) ? Math.round(acc) : null;
      } else {
        port = selectPortfolioAtAge(mc, age, { retireAge: p.retireAge, real, inf });
      }

      const mortEntry = mortSched.years.find((y) => y.yr === yr);
      const mortBal = mortEntry ? mortEntry.bal : 0;
      const yearsFromNow = yr - new Date().getFullYear();
      const reGrow = Math.pow(1 + (p.reGrowthRate ?? 3.0) / 100, yearsFromNow);
      const re = showRE ? Math.round(reTotal * reGrow) : 0;
      return {
        age,
        "Liquid Portfolio": port,
        "Mortgage Debt": -mortBal,
        "Real Estate": re,
        "Net Worth": port == null ? null : port + re - mortBal,
      };
    });
  }, [p, mc, dPcts, showRE, mortSched, reTotal]);

  const finitePcts = useMemo(
    () => dPcts.filter((d) => Number.isFinite(d.p50)),
    [dPcts]
  );
  const peakRow = finitePcts.reduce(
    (best, d) => (best == null || d.p50 > best.p50 ? d : best),
    null
  );
  const peakPort = peakRow ? peakRow.p50 : 0;
  const peakAge = peakRow ? (peakRow.age ?? p.retireAge + finitePcts.indexOf(peakRow)) : 0;

  const lastRealRow = [...nwData].reverse().find((d) => d["Net Worth"] != null);
  const finalNW = lastRealRow ? lastRealRow["Net Worth"] : 0;
  const lastDataAge = lastRealRow ? lastRealRow.age : null;
  const planAge = p.endAge;
  const dataStopsEarly = lastDataAge != null && lastDataAge < planAge;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="metrics">
        <div className="met">
          <div className="ml">Peak portfolio*</div>
          <div className="mv" style={{ color: "var(--positive)", fontSize: "var(--fs-h2)" }}>
            {fmtDollar(peakPort)}
          </div>
          <div className="ms">Age {peakAge} · typical outcome</div>
        </div>
        <div className="met">
          <div className="ml">Net worth at age {lastDataAge ?? planAge}</div>
          <div className="mv" style={{ color: dataStopsEarly ? "var(--accent-gold)" : "var(--text-primary)", fontSize: "var(--fs-h2)" }}>
            {fmtDollar(finalNW)}
          </div>
          <div className="ms">
            {showRE ? "Incl." : "Excl."} real estate · {dollarBasisLabel(real, retirementBasisYear(p.currentAge, p.retireAge, CURRENT_YEAR))}
            {dataStopsEarly && (
              <span style={{ color: "var(--accent-gold)" }}> · projection stops here, not {planAge}</span>
            )}
          </div>
        </div>
        {p.mortBalance > 0 && (
        <div className="met">
          <div className="ml">Mortgage‑free</div>
          <div className="mv" style={{ color: "var(--text-primary)", fontSize: "var(--fs-h2)" }}>
            {mortSched.payoffYr}
          </div>
          <div className="ms">
            {p.mortExtra > 0 ? "With extra payments" : "Standard payments"}
          </div>
        </div>
        )}
        {reTotal > 0 && (
        <div className="met">
          <div className="ml">Real estate equity</div>
          <div className="mv" style={{ color: "var(--text-primary)", fontSize: "var(--fs-h2)" }}>
            {fmtDollar(reEquity)}
          </div>
          <div className="ms">Not counted in your portfolio</div>
        </div>
        )}
        {(() => {
          const port     = (p.accounts||[]).reduce((s,a)=>s+(a.balance||0),0) || p.port || 0;
          const strategy = resolveStrategy(p.withdrawalStrategy);
          const rate     = p.fixedWithdrawalRate || 0.04;
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
            hint    = `You have not entered a spending target, so this is a placeholder: ${pctOf(benchRate)}% of your ${fmtDollar(port)} portfolio, divided by 12. Enter your real target in Plan inputs → Spending & Expenses. Money to spend after tax.`;
          }

          return (
            <div className="met" title={hint}>
              <div className="ml">{label}</div>
              <div className="mv" style={{ color: "#4ade80", fontSize: "var(--fs-h2)" }}>{fmtDollar(monthly)}</div>
              <div className="ms">{note}</div>
            </div>
          );
        })()}
      </div>
      {!(p.mortBalance > 0 && reTotal > 0) && (
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: -4 }}>
          {[!(reTotal > 0) && "No real estate entered", !(p.mortBalance > 0) && "No mortgage modeled"].filter(Boolean).join(" · ")}
          {" · "}<GoStep step={PROFILE_STEP_REAL_ESTATE}>add in Plan inputs</GoStep>
        </div>
      )}

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
            <div>
              <div className="ct" style={{ margin: 0 }}>{showRE ? "Net worth projection" : "Portfolio projection"}</div>
              <div className="ct-sub" style={{ margin: "2px 0 0" }}>
                Typical outcome, every 5 years to age {lastDataAge ?? planAge} · {dollarBasisLabel(real, retirementBasisYear(p.currentAge, p.retireAge, CURRENT_YEAR))}{showRE ? "" : " · excludes real estate"}
              </div>
            </div>
            <InfoDot
              heading="Reading this chart"
              title="Liquid Portfolio = investments (excl. real estate). Mortgage Debt shown as negative (dashed red line). Net Worth = Liquid + Real Estate - Mortgage Debt."
            />
          </div>
          <Toggle
            val={showRE}
            onChange={setShowRE}
            label="Include Real Estate In Projection"
            accent="var(--accent-gold)"
          />
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={nwData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="var(--row-highlight)" />
            <XAxis
              dataKey="age"
              stroke="#1e3a5f"
              tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }}
            />
            <YAxis
              stroke="#1e3a5f"
              tick={{ fill: "var(--text-faint)", fontSize: "var(--fs-small)" }}
              tickFormatter={(v) => fmtDollar(v)}
              width={MONEY_AXIS_WIDTH}
            />
            <Tooltip content={<NetWorthTip p={p} />} />
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
              stroke="var(--chart-1)"
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

        {dataStopsEarly && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "var(--tint-orange-10)", border: "1px solid var(--tint-orange-35)",
            fontSize: "var(--fs-small)", color: "#fdba74", lineHeight: 1.55,
          }}>
            <strong>The line stops at age {lastDataAge}.</strong> The last Monte Carlo run covers
            ages {p.retireAge}–{lastDataAge}, not through {planAge}, so ages {lastDataAge + 1}–{planAge} are
            left blank rather than guessed. If you changed your retirement or planning age since the
            last run, press <strong>▶ Run Monte Carlo</strong> to refresh. If it keeps stopping short,
            one of your inputs is producing an invalid number for those years — a one-off cash-flow
            event or income entry with a blank or malformed amount is the usual cause.
          </div>
        )}

        <div className="leg" style={{ marginTop: 8, justifyContent: "center" }}>
          <div className="li"><div className="ll" style={{ background: "#0ea5e9" }} />Liquid Portfolio</div>
          <div className="li"><div className="ll" style={{ background: "var(--chart-1)", borderTop: "1px dashed var(--chart-1)", height: 2 }} />Mortgage Debt (dashed)</div>
          {showRE && <div className="li"><div className="ll" style={{ background: "var(--accent-gold)" }} />Real Estate</div>}
          <div className="li"><div className="ll" style={{ background: "var(--positive)" }} />{showRE ? "Net Worth" : "Portfolio (ex. RE)"}</div>
        </div>

        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>
          * Peak portfolio is the highest point of the typical (median) outcome across your whole plan, to age {p.endAge}.
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

const PRIORITY_COLOR = {
  red:    { border: "var(--negative)", bg: "var(--tint-red-07)",  label: "var(--chart-1)" },
  yellow: { border: "var(--accent-gold)", bg: "rgba(244,211,94,0.07)", label: "var(--accent-gold)" },
  green:  { border: "var(--positive)", bg: "rgba(79,216,143,0.07)", label: "var(--positive)" },
};

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
        <span style={{ fontSize: "var(--fs-small)", color: "var(--accent)", transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <span style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent)" }}>
          Age Milestones
        </span>
        <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginLeft: 4 }}>({milestones.length} milestones)</span>
      </button>
      {open && (
      <div style={{ position: "relative" }}>
        {milestones.map((m, idx) => (
          <div key={m.age} style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "var(--tint-indigo-15)", border: "2px solid var(--tint-indigo-40)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--chart-4)", flexShrink: 0,
              }}>
                {m.age === (params?.currentAge || 56) ? "Now" : m.age}
              </div>
              {idx < milestones.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 16, background: "var(--tint-indigo-20)", marginTop: 4 }} />
              )}
            </div>
            <div style={{
              flex: 1, background: "rgba(99,102,241,0.04)", border: "1px solid var(--tint-indigo-15)",
              borderRadius: 9, padding: "10px 14px", marginBottom: 2,
            }}>
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "#a5b4fc", marginBottom: 6 }}>
                {m.label}
                <span style={{ fontWeight: 400, color: "var(--text-faint)", marginLeft: 8 }}>{m.year}</span>
              </div>
              {m.items.map((item, j) => (
                <div key={j} style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 3, display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--accent)", flexShrink: 0 }}>•</span>
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
        background:   isSelected ? "rgba(99,102,241,0.1)" : "var(--tint-white-02)",
        border:       `1px solid ${isSelected ? "var(--tint-indigo-40)" : "var(--tint-white-06)"}`,
        cursor:       "pointer",
        transition:   "all 0.12s",
        marginBottom: 4,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--row-highlight)"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "var(--tint-white-02)"; }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.border, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: C.label, marginBottom: 1, display: "flex", alignItems: "center", gap: 5 }}>
          {card.category}
          {card.isLiveData  && <span style={{ color: "var(--chart-5)",  fontSize: "var(--fs-small)" }}>LIVE</span>}
          {card.aiGenerated && !card.isLiveData && <span style={{ color: "var(--accent-purple)", fontSize: "var(--fs-small)" }}>✦ AI</span>}
          {card.aiChecked && (
            <span style={{
              background: card.aiNote ? "var(--tint-indigo-15)" : "rgba(71,85,105,0.18)",
              color:      card.aiNote ? "var(--chart-4)"                : "var(--text-muted)",
              border:     `1px solid ${card.aiNote ? "var(--tint-indigo-30)" : "rgba(71,85,105,0.3)"}`,
              borderRadius: 4, padding: "1px 5px", fontSize: "var(--fs-small)", fontWeight: 700,
            }}>
              {card.aiNote ? "AI insight" : "AI reviewed"}
            </span>
          )}
        </div>
        <div style={{ fontSize: "var(--fs-body)", color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.action}
        </div>
      </div>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", flexShrink: 0, whiteSpace: "nowrap" }}>{card.deadline}</div>
      <div style={{ fontSize: "var(--fs-body)", color: isSelected ? "var(--chart-4)" : "#334155", flexShrink: 0 }}>›</div>
    </div>
  );
}

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{
              background: C.bg, border: `1px solid ${C.border}`, color: C.label,
              borderRadius: 4, padding: "2px 8px", fontSize: "var(--fs-small)", fontWeight: 700,
            }}>{label}</span>
            <span style={{
              background: "var(--tint-white-06)", color: "var(--text-secondary)",
              borderRadius: 4, padding: "2px 8px", fontSize: "var(--fs-small)", fontWeight: 600,
            }}>{card.category}</span>
            {card.isLiveData  && <span style={{ background: "rgba(6,182,212,0.1)", color: "var(--chart-5)", borderRadius: 4, padding: "2px 8px", fontSize: "var(--fs-small)", fontWeight: 700 }}>🌐 LIVE</span>}
            {card.aiGenerated && !card.isLiveData && <span style={{ background: "rgba(167,139,250,0.1)", color: "var(--accent-purple)", borderRadius: 4, padding: "2px 8px", fontSize: "var(--fs-small)", fontWeight: 700 }}>✦ AI</span>}
          </div>
          <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.4 }}>{card.action}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "var(--fs-h1)", lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      {card.reason && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-faint)", marginBottom: 6 }}>DETAILS</div>
          <div style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.65 }}>{card.reason}</div>
        </div>
      )}

      {steps.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-faint)", marginBottom: 8 }}>WHAT TO DO</div>
          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: "var(--tint-indigo-15)", border: "1px solid var(--tint-indigo-30)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--chart-4)",
              }}>{i + 1}</div>
              <div style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.55, paddingTop: 2 }}>{step}</div>
            </div>
          ))}
        </div>
      )}

      {card.aiNote ? (
        <div style={{
          background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 14,
        }}>
          <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--chart-4)", marginBottom: 4 }}>AI INSIGHT</div>
          <div style={{ fontSize: "var(--fs-label)", color: "var(--accent-purple)", lineHeight: 1.55 }}>{card.aiNote}</div>
        </div>
      ) : card.aiChecked ? (
        <div style={{
          background: "rgba(71,85,105,0.08)", border: "1px solid rgba(71,85,105,0.2)",
          borderRadius: 8, padding: "8px 14px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Dot tone="ok" />
          <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>AI reviewed — this card is already comprehensive, nothing to add.</span>
        </div>
      ) : null}

      {card.source && (
        <div style={{ fontSize: "var(--fs-small)", color: "var(--chart-5)", marginBottom: 12 }}>Source: {card.source}</div>
      )}

      <div style={{ fontSize: "var(--fs-label)", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 6, paddingTop: 8, borderTop: "1px solid var(--tint-white-06)" }}>
        ⏱ <span style={{ color: "var(--text-muted)" }}>{card.deadline}</span>
      </div>
    </div>
  );
}

function ActionPlanTab({ params, mc, assumptions, mortgagePayoffYear, rmdAge: rmdAgeProp }) {
  const currentYear = new Date().getFullYear();
  const retireYear = currentYear + ((params?.retireAge || 60) - (params?.currentAge || 56));
  const daysToRetire = formatRemaining(
    retirementTarget({ dob: assumptions?.dob, retireAge: params?.retireAge }) ||
      { date: new Date(retireYear, 5, 15) }
  )?.totalDays ?? 0;

  const [cards, setCards]               = useState(null);
  const [loadingAI, setLoadingAI]       = useState(false);
  const [aiError, setAiError]           = useState(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showRestore, setShowRestore]   = useState(false);
  const [liveCards, setLiveCards]       = useState(null);
  const [loadingLive, setLoadingLive]   = useState(false);
  const [liveError, setLiveError]       = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [filterPriority, setFilter]     = useState("all");
  const creditBalance                    = useCreditBalance();

  const runAI = async (baseCards) => {
    track("ai_click");
    const { runAIActionPlan, profileIsComplete } = await import("./ai/ai-analysis.js");
    console.log("[AI] runAI called. profileIsComplete:", profileIsComplete(params, mc));
    console.log("[AI] geminiApiKey present:", !!assumptions?.geminiApiKey, "model:", assumptions?.geminiModel || "default");
    console.log("[AI] baseCards count:", baseCards?.length, "ids:", baseCards?.map(c => c.id));
    if (!profileIsComplete(params, mc)) {
      console.warn("[AI] Profile incomplete — runAI exiting silently. Need: port>50K, sp>0, mcResults.rate>0, ≥1 funded account.");
      return;
    }
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
    track("ai_click");
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
        <div style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", marginBottom: 8 }}>Monte Carlo not run yet</div>
        <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)" }}>Press ▶ Run Monte Carlo to generate your personalized action plan.</div>
      </div>
    );
  }

  const baseCards = evaluateRulesEngine({
    params, mc, assumptions,
    currentYear, retireYear, daysToRetire,
  });

  const displayCards = cards || baseCards;

  const hasGeminiKey = !!(assumptions?.geminiApiKey?.trim());
  const profileReady = (params.port || 0) > 50_000 &&
    (params.sp  || 0) > 0 &&
    mc?.rate > 0 &&
    (params.accounts || []).some(a => (a.balance || 0) > 0);
  const hasAiAccess  = BILLING_ENABLED ? (creditBalance >= MIN_CREDITS_TO_RUN || hasGeminiKey) : hasGeminiKey;
  const canRunAI     = !loadingAI && !cards && profileReady && hasAiAccess;
  const aiDisabledReason = !profileReady
    ? "Complete your profile and run Monte Carlo first"
    : !hasAiAccess
    ? "Buy AiRA credits or add a free Gemini API key in Plan inputs → Settings"
    : "Run AI analysis on your plan";

  const COLORS = {
    red:    { bg: "var(--tint-red-08)",   border: "var(--tint-red-25)",   label: "var(--chart-1)", badge: "Critical" },
    yellow: { bg: "rgba(244,211,94,0.08)",  border: "rgba(244,211,94,0.25)",  label: "var(--accent-gold)", badge: "Important" },
    green:  { bg: "rgba(79,216,143,0.08)",  border: "rgba(79,216,143,0.25)",  label: "var(--positive)", badge: "On Track" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <button
            onClick={() => runAI(baseCards)}
            disabled={!canRunAI}
            title={aiDisabledReason}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none", flexShrink: 0,
              background: canRunAI ? "linear-gradient(135deg, #7c3aed, #9a9cff)" : "var(--row-highlight)",
              color: canRunAI ? "white" : "var(--text-faint)",
              fontSize: "var(--fs-body)", fontWeight: 600,
              cursor: canRunAI ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: canRunAI ? "0 2px 8px rgba(124,58,237,0.3)" : "none",
              transition: "all 0.2s",
            }}
          >
            {loadingAI ? "Analyzing…" : cards ? "AI Applied" : "Run AI Analysis"}
          </button>

          {loadingAI && (
            <span style={{ color: "var(--accent-purple)", fontSize: "var(--fs-label)" }}>Aira is thinking…</span>
          )}
          {!loadingAI && !cards && profileReady && !hasAiAccess && !BILLING_ENABLED && (
            <span style={{ fontSize: "var(--fs-small)", color: "var(--accent-gold)" }}>
              🔒 Add a free Gemini key in <GoStep step={PROFILE_STEP_SETTINGS}>Plan inputs → Settings</GoStep> ·{" "}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)", textDecoration: "underline" }}>
                Get one here
              </a>
            </span>
          )}
          {(cards || aiError) && !loadingAI && (
            <button
              onClick={() => { setCards(null); setAiError(null); }}
              style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Reset
            </button>
          )}
        </div>

        {BILLING_ENABLED ? (
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          16,
            background:   creditBalance < LOW_BALANCE_WARN_AT ? "var(--tint-red-05)" : "rgba(124,58,237,0.06)",
            border:       `1px solid ${creditBalance < LOW_BALANCE_WARN_AT ? "var(--tint-red-25)" : "rgba(124,58,237,0.2)"}`,
            borderRadius: 10,
            padding:      "10px 16px",
            flexShrink:   0,
          }}>
            <div>
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent-purple)", marginBottom: 2 }}>
                AiRA Credits
              </div>
              {!getStoredJWT() ? (
                <div style={{ maxWidth: 230 }}>
                  <div style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--accent-gold)", lineHeight: 1.25 }}>
                    No credits found on this device
                  </div>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.35 }}>
                    Already bought credits? They're safe — this browser just isn't linked
                    to your purchase.
                  </div>
                  <button
                    onClick={() => setShowRestore(true)}
                    style={{
                      marginTop: 6, background: "rgba(13,148,136,0.18)",
                      border: "1px solid var(--tint-sky-45)", color: "var(--accent-teal)",
                      borderRadius: 6, padding: "5px 12px", fontSize: "var(--fs-label)",
                      fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    Restore my credits
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: "var(--fs-h1)", fontWeight: 700, color: creditBalance < LOW_BALANCE_WARN_AT ? "var(--chart-1)" : "var(--text-primary)", lineHeight: 1 }}>
                  {creditBalance.toLocaleString()}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowBuyModal(true)}
              style={{
                background:   "linear-gradient(135deg, #7c3aed, #9a9cff)",
                border:       "none", color: "white",
                borderRadius: 8, padding: "8px 16px",
                fontSize: "var(--fs-body)", fontWeight: 600, cursor: "pointer",
                boxShadow:    "0 2px 8px rgba(124,58,237,0.3)",
                whiteSpace:   "nowrap",
              }}
            >
              Buy Credits
            </button>
            {getStoredRecoveryLink() && (
              <button
                onClick={() => setShowRecovery(true)}
                title="The link that restores these credits in another browser or on a new computer"
                style={{
                  background: "none", border: "none", color: "var(--text-muted)",
                  fontSize: "var(--fs-small)", cursor: "pointer", textDecoration: "underline dotted",
                  textUnderlineOffset: 3, whiteSpace: "nowrap", padding: 0, marginLeft: 4,
                }}
              >
                recovery link
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
              background:   "var(--tint-amber-07)",
              border:       "1px solid rgba(251,191,36,0.3)",
              borderRadius: 10,
              padding:      "10px 16px",
              flexShrink:   0,
              cursor:       "help",
            }}
          >
            <div style={{ fontSize: "var(--fs-h1)", lineHeight: 1 }}>🚧</div>
            <div>
              <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 2 }}>
                AiRA Credits
              </div>
              <div style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#fde68a", lineHeight: 1.15 }}>
                Coming Soon
              </div>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginTop: 2 }}>
                BYOK active · in development
              </div>
            </div>
          </div>
        )}
      </div>

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
          background: "var(--tint-red-08)",
          border: "1px solid var(--tint-red-25)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: "var(--fs-label)",
          color: "var(--chart-1)",
        }}>
          AI unavailable: {aiError}
        </div>
      )}

      {(() => {
        const solver = solveRetirementDate(params);
        const { target, currentPort, currentAge, results } = solver;
        const retireAge = params.retireAge || 60;
        const rowColor = (age) => {
          if (age == null) return "var(--chart-1)";
          if (age <= retireAge) return "var(--positive)";
          if (age <= retireAge + 3) return "var(--accent-gold)";
          return "var(--chart-1)";
        };
        return (
          <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid var(--tint-indigo-20)", borderRadius: 9, padding: "12px 15px", marginBottom: 4 }}>
            <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--chart-4)", marginBottom: 8 }}>
              Retirement Date Solver — Target {fmtDollar(target)}
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 8 }}>
              Portfolio today: <span style={{ color: "var(--text-primary)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(currentPort)}</span>
              &nbsp;·&nbsp;Planned retirement: <span style={{ color: "var(--text-primary)" }}>age {retireAge}</span>
              &nbsp;·&nbsp;Annual contrib: <span style={{ color: "var(--text-primary)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(householdAnnualContribution(params))}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-label)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--tint-white-06)" }}>
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
                    <tr key={r.label} style={{ borderBottom: "1px solid var(--tint-white-04)" }}>
                      <td style={{ color: "var(--text-secondary)", padding: "4px 0" }}>{r.label}</td>
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
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 8 }}>
              Update your portfolio balance in the profile to keep this projection current.
            </div>
          </div>
        );
      })()}

      {(() => {
        const allCards     = [...displayCards, ...(liveCards || [])];
        const counts       = { all: allCards.length, red: 0, yellow: 0, green: 0 };
        allCards.forEach(c => { if (counts[c.priority] !== undefined) counts[c.priority]++; });
        const filtered     = filterPriority === "all" ? allCards : allCards.filter(c => c.priority === filterPriority);
        const canLive      = !loadingLive && (!!(assumptions?.geminiApiKey?.trim()) || BILLING_ENABLED);

        const FILTER_OPTS = [
          { key: "all",    label: `All`,       count: counts.all,    color: "var(--text-muted)",  active: "var(--text-primary)" },
          { key: "red",    label: `Critical`,  count: counts.red,    color: "var(--chart-1)",  active: "#fca5a5" },
          { key: "yellow", label: `Important`, count: counts.yellow, color: "var(--accent-gold)",  active: "#fde68a" },
          { key: "green",  label: `On Track`,  count: counts.green,  color: "var(--positive)",  active: "#6ee7b7" },
        ];

        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {FILTER_OPTS.map(f => (
                <button
                  key={f.key}
                  onClick={() => { setFilter(f.key); setSelectedCard(null); }}
                  style={{
                    background:   filterPriority === f.key ? "var(--card-border)" : "transparent",
                    border:       `1px solid ${filterPriority === f.key ? "rgba(255,255,255,0.2)" : "var(--tint-white-07)"}`,
                    color:        filterPriority === f.key ? (f.key === "all" ? "var(--text-primary)" : f.active) : f.color,
                    borderRadius: 6, padding: "4px 12px",
                    fontSize: "var(--fs-label)", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {f.label} <span style={{ opacity: 0.7, fontSize: "var(--fs-small)" }}>{f.count}</span>
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                onClick={runLiveSearch}
                disabled={!canLive}
                title={canLive ? "Search the web for current IRS limits, SS COLA, Medicare premiums, and more" : "Add a Gemini API key to enable live search"}
                style={{
                  background:   !canLive ? "var(--card-bg)" : loadingLive ? "var(--row-highlight)" : "linear-gradient(135deg, #0e7490, var(--chart-5))",
                  border:       "none", color: !canLive || loadingLive ? "var(--text-faint)" : "white",
                  borderRadius: 7, padding: "5px 14px",
                  fontSize: "var(--fs-label)", fontWeight: 600, cursor: canLive && !loadingLive ? "pointer" : "not-allowed",
                  whiteSpace:   "nowrap",
                  boxShadow:    canLive && !loadingLive ? "0 2px 8px rgba(6,182,212,0.25)" : "none",
                }}
              >
                {loadingLive ? "Searching…" : liveCards ? "Refresh Live" : "Live Updates"}
              </button>
            </div>

            {liveError && <div style={{ fontSize: "var(--fs-small)", color: "var(--chart-1)", marginBottom: 8 }}>{liveError}</div>}

            {!liveError && liveCards && liveCards.length === 0 && (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--positive)", marginBottom: 8 }}>
                Live search complete — no new time-sensitive updates found. Your plan figures look current.
              </div>
            )}
            {!liveError && liveCards && liveCards.length > 0 && (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--chart-5)", marginBottom: 8 }}>
                Found {liveCards.length} live update{liveCards.length > 1 ? "s" : ""} — see below.
              </div>
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

              <div style={{ flex: selectedCard ? "0 0 46%" : 1, minWidth: 0, transition: "flex 0.2s" }}>
                {filtered.length === 0 && (
                  <div style={{ fontSize: "var(--fs-label)", color: "var(--text-faint)", padding: "20px 0", textAlign: "center" }}>
                    No cards for this filter.
                  </div>
                )}

                {filtered.filter(c => !c.isLiveData).map((card, i) => (
                  <ActionPlanRow
                    key={card.id || i}
                    card={card}
                    isSelected={selectedCard?.id === card.id}
                    onClick={() => setSelectedCard(prev => prev?.id === card.id ? null : card)}
                  />
                ))}

                {filtered.some(c => c.isLiveData) && (
                  <>
                    <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--chart-5)", margin: "12px 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
                      Live Updates
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

                <div style={{ marginTop: 16 }}>
                  <MilestonesSection params={params} rmdAge={rmdAgeProp} />
                </div>
              </div>

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

function RealEstateStep({ values, onChange }) {
  const properties = values.properties || [{ id: "p1", label: "Primary Residence", value: 0, mortgage: 0, income: 0 }];
  const updateProp = (id, field, val) => {
    onChange("properties", properties.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
    if (id === properties[0]?.id && field === "mortgage") onChange("mortBalance", val);
  };
  const addProperty = () => {
    if (properties.length >= 5) return;
    onChange("properties", [...properties, { id: "p" + Date.now(), label: `Property ${properties.length + 1}`, value: 0, mortgage: 0, income: 0 }]);
  };
  const removeProperty = (id) => {
    if (properties.length <= 1) return;
    onChange("properties", properties.filter((p) => p.id !== id));
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize: "var(--fs-h2)", fontWeight:600, color:"var(--text-primary)" }}>Real Estate &amp; Debt</div>
          <div style={{ fontSize: "var(--fs-small)", color:"var(--text-muted)" }}>Property values, mortgages, and rental income used by the plan.</div>
        </div>
        {properties.length < 5 && (
          <button onClick={addProperty}
            style={{ padding:"4px 12px", borderRadius:6,
              border:"1px dashed rgba(13,148,136,0.4)", background:"transparent",
              color:"var(--positive)", fontSize: "var(--fs-small)", cursor:"pointer", fontFamily:"inherit" }}>
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
            border:`1px solid ${isFirst ? "var(--tint-teal-600-25)" : "var(--card-border)"}`,
            borderRadius:10, padding:14,
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <input type="text" value={prop.label}
                onChange={e => updateProp(prop.id, "label", e.target.value)}
                style={{ fontSize: "var(--fs-body)", fontWeight:600, color:"var(--text-primary)",
                  background:"transparent", border:"none", outline:"none",
                  borderBottom:"1px solid var(--tint-white-12)",
                  padding:"2px 0", width:180, fontFamily:"'DM Sans',sans-serif" }}/>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {isFirst && (
                  <span style={{ fontSize: "var(--fs-small)", color:"var(--positive)",
                    background:"rgba(13,148,136,0.1)", border:"1px solid rgba(13,148,136,0.3)",
                    borderRadius:8, padding:"2px 7px" }}>
                    Primary · wired to mortgage calc
                  </span>
                )}
                {properties.length > 1 && (
                  <button onClick={() => removeProperty(prop.id)} aria-label={`Remove ${prop.label || "property"}`}
                    style={{ background:"transparent", border:"none", color:"var(--text-faint)",
                      cursor:"pointer", fontSize: "var(--fs-body)", padding:"2px 4px", transition:"color 0.15s" }}
                    onMouseEnter={e=>e.currentTarget.style.color="var(--chart-1)"}
                    onMouseLeave={e=>e.currentTarget.style.color="var(--text-faint)"}>
                    ×
                  </button>
                )}
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:10 }}>
              <div>
                <div style={{ fontSize: "var(--fs-small)", color:"var(--text-muted)", marginBottom:4, textAlign:"right" }}>Gross value</div>
                <DualInput label="" value={prop.value||0} min={0} max={10_000_000} step={5_000}
                  format={v=>`$${Math.round(v).toLocaleString()}`} onChange={v=>updateProp(prop.id,"value",v)}/>
              </div>
              <div>
                <div style={{ fontSize: "var(--fs-small)", color:"var(--text-muted)", marginBottom:4, textAlign:"right" }}>Mortgage balance</div>
                <DualInput label="" value={prop.mortgage||0} min={0} max={10_000_000} step={1_000}
                  format={v=>`$${Math.round(v).toLocaleString()}`} onChange={v=>updateProp(prop.id,"mortgage",v)}/>
              </div>
              <div>
                <div style={{ fontSize: "var(--fs-small)", color:"var(--text-muted)", marginBottom:4, textAlign:"right" }}>Annual income (opt)</div>
                <DualInput label="" value={prop.income||0} min={0} max={200_000} step={1_000}
                  format={v=>`$${Math.round(v).toLocaleString()}/yr`} onChange={v=>updateProp(prop.id,"income",v)}/>
              </div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize: "var(--fs-small)", color:"var(--text-muted)" }}>Net equity:</span>
              <span style={{ fontSize: "var(--fs-body)", fontWeight:700,
                fontFamily:"'JetBrains Mono',monospace",
                color: equity >= 0 ? "var(--positive)" : "var(--chart-1)" }}>
                {equity < 0 ? "-" : ""}{fmtDollar(Math.abs(equity))}
              </span>
              {(prop.income||0) > 0 && (
                <span style={{ fontSize: "var(--fs-small)", color:"#059669" }}>
                  · {fmtDollar(prop.income)}/yr income
                </span>
              )}
            </div>
            {!isFirst && (
              <div data-testid={`${prop.id}-payment-note`} style={{ fontSize: "var(--fs-small)", color:"var(--text-muted)", marginTop:8, lineHeight:1.5 }}>
                This mortgage balance counts toward net worth only. AiRA charges a payment for the primary property's mortgage only, so include this loan's payment in your spending.
              </div>
            )}
          </div>
        );
      })}

      <div className="chart-card">
        <div className="ct">{properties[0]?.label || "Primary Residence"} · Mortgage</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <DualInput label="Balance" value={values.mortBalance||0} min={0} max={1_500_000} step={1_000}
            format={v=>fmtDollar(v)}
            onChange={v=>{ onChange("mortBalance",v); updateProp(properties[0]?.id,"mortgage",v); }}/>
          <DualInput label="Rate %" value={values.mortRate??6.5} min={0} max={12} step={0.125}
            format={v=>v.toFixed(3)+"%"} onChange={v=>onChange("mortRate",v)}/>
          <DualInput label="Original term (yrs)" value={values.mortTerm||30} min={10} max={30} step={1}
            format={v=>v+" yrs"} onChange={v=>onChange("mortTerm",v)}/>
          <DualInput label="Extra/mo" value={values.mortExtra||0} min={0} max={5_000} step={50}
            format={v=>"$"+v.toLocaleString()+"/mo"} onChange={v=>onChange("mortExtra",v)}/>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize: "var(--fs-small)", color:"var(--text-secondary)", minWidth:70 }}>Start date</span>
            <MonthYearSelect value={values.mortStart || "2020-01"} onSet={v=>onChange("mortStart",v)}/>
          </div>
        </div>
      </div>
    </div>
  );
}

export const PROFILE_STEP_SAVINGS = 1;
export const PROFILE_STEP_MONEY_IN = 2;
export const PROFILE_STEP_SPENDING = 3;
export const PROFILE_STEP_REAL_ESTATE = 4;
export const PROFILE_STEP_SETTINGS = 6;

export function ProfileWizard({ values, onChange, onNavigateTab, autosavedAt, jumpTo }) {
  const [step, setStep] = useState(jumpTo?.step ?? 0);
  useEffect(() => { if (jumpTo) setStep(jumpTo.step); }, [jumpTo]);
  const [saveStatus, setSaveStatus] = useState("");

  const flashStatus = (msg) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(""), 2000);
  };

  const handleSave = () => {
    const ok = saveProfileToLocal(values);
    flashStatus(ok ? "Saved to this browser" : "Save failed (localStorage blocked)");
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
    flashStatus("Restored saved profile");
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

  const STEPS = [
    { label: "About You", icon: "👤", sub: `You are ${ageFromDob(values.dob) ?? values.currentAge} yrs old` },
    { label: "Current Savings", icon: "💰", sub: `Net worth of ${fmtDollar(values.port)} saved. Congratulations!` },
    {
      label: "Money In", icon: "💵",
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
    {
      label: "Real Estate & Debt", icon: "🏠",
      sub: (() => {
        const props = values.properties || [];
        const v = props.reduce((a, x) => a + (x.value || 0), 0);
        const m = props.reduce((a, x) => a + (x.mortgage || 0), 0);
        return v || m ? `${fmtDollar(v)} property · ${fmtDollar(m)} mortgage` : "Home value, mortgage, rental income";
      })(),
    },
    { label: "Retirement Plan", icon: "🎯", sub: `Projected Retirement Age ${values.retireAge}` },
    { label: "Settings", icon: "⚙️", sub: "Calculation & app settings", isSettings: true },
  ];

  const PANELS = [
    <AboutYouPanel values={values} onChange={onChange} />,
    <SavingsPanel values={values} onChange={onChange} />,
    <ContribPanel values={values} onChange={onChange} onNavigateStep={setStep} />,
    <ExpensesPanel values={values} onChange={onChange} />,
    <RealEstateStep values={values} onChange={onChange} />,
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
        background: "var(--tint-white-02)",
        border: "1px solid var(--tint-white-08)",
        borderRadius: 12,
        alignItems: "start",
        flexShrink: 0,
      }}
    >
      <div className="wizard-sidebar" style={{ borderRight: "1px solid var(--tint-white-06)", padding: 16 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
          {s.isSettings && (
            <div style={{
              marginTop: 14, marginBottom: 6, paddingTop: 10,
              borderTop: "1px solid var(--tint-white-08)",
              fontSize: "var(--fs-small)", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-faint)",
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
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: s.isSettings ? 3 : "50%",
                flexShrink: 0,
                background: s.isSettings
                  ? (i === step ? "rgba(148,163,184,0.35)" : "var(--tint-white-07)")
                  : (i < step ? "var(--positive)" : i === step ? "var(--accent-teal)" : "var(--tint-white-10)"),
                border: s.isSettings
                  ? "2px solid rgba(148,163,184,0.4)"
                  : `2px solid ${i <= step ? "var(--positive)" : "var(--tint-white-15)"}`,
                boxShadow: (!s.isSettings && i === step) ? `0 0 8px ${withAlpha("#0d9488", "66")}` : "none",
              }}
            />
            <div>
              <div style={{ fontSize: "var(--fs-h2)", fontWeight: 600, color: i === step ? "var(--text-primary)" : "var(--text-muted)" }}>
                {s.icon} {s.label}
              </div>
              <div style={{ fontSize: "var(--fs-body)", color: "var(--text-muted)" }}>{s.sub}</div>
            </div>
          </div>
          </React.Fragment>
        ))}
      </div>

      <div className="wizard-panel" style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            marginBottom: 16,
            background: "var(--tint-teal-600-08)",
            border: "1px solid var(--tint-teal-600-25)",
            borderRadius: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: "var(--fs-label)", fontWeight: 600, color: "var(--accent-teal)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--positive)", display: "inline-block", boxShadow: "0 0 6px var(--positive)" }} />
              Auto-save on
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
              {autosavedAt
                ? `Auto-saved ${autosavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — your work is kept in this browser`
                : savedMeta
                  ? `Last saved to this browser: ${savedMeta}`
                  : "Changes save automatically as you edit"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {saveStatus && <span style={{ fontSize: "var(--fs-small)", color: "var(--accent-teal)" }}>{saveStatus}</span>}
            <button
              onClick={handleReload}
              disabled={!savedMeta}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: "1px solid var(--tint-white-15)",
                background: "transparent",
                color: savedMeta ? "var(--text-secondary)" : "#334155",
                cursor: savedMeta ? "pointer" : "not-allowed",
                fontSize: "var(--fs-small)",
                fontFamily: "inherit",
              }}
            >
              Reload Saved
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "6px 14px",
                borderRadius: 7,
                border: "none",
                background: "linear-gradient(135deg,#0d9488,var(--positive))",
                color: "white",
                cursor: "pointer",
                fontSize: "var(--fs-small)",
                fontFamily: "inherit",
                fontWeight: 600,
              }}
            >
              Save
            </button>
          </div>
        </div>

        <div className="wizard-mobile-steps" style={{ marginBottom: 16 }}>
          <select
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            style={{
              width: "100%",
              background: "#0d1b2a",
              border: "1px solid #1e3a5f",
              color: "var(--text-primary)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: "var(--fs-body)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {STEPS.map((s, i) => (
              <option key={i} value={i}>
                {s.icon} {s.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
          {currentStepData.icon} {currentStepData.label}
        </div>
        <div style={{ fontSize: "var(--fs-label)", color: "var(--text-faint)", marginBottom: 20 }}>
          {currentStepData.sub}
        </div>

        {currentPanel}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--tint-white-06)",
          }}
        >
          <button
            onClick={goPrev}
            disabled={step === 0}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              background: step === 0 ? "var(--row-highlight)" : "linear-gradient(135deg,#0d9488,var(--positive))",
              color: step === 0 ? "#334155" : "white",
              cursor: step === 0 ? "not-allowed" : "pointer",
              fontSize: "var(--fs-label)",
              fontFamily: "inherit",
              fontWeight: 600,
              opacity: step === 0 ? 0.4 : 1,
            }}
          >
            ← Previous
          </button>

          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{step + 1} / {STEPS.length}</div>

          <button
            onClick={goNext}
            disabled={step === STEPS.length - 1}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              background: step === STEPS.length - 1 ? "var(--row-highlight)" : "linear-gradient(135deg,#0d9488,var(--positive))",
              color: step === STEPS.length - 1 ? "#334155" : "white",
              cursor: step === STEPS.length - 1 ? "not-allowed" : "pointer",
              fontSize: "var(--fs-label)",
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

const LeverContext = createContext(null);
function LeverValue({ lever, children }) {
  const focusLever = useContext(LeverContext);
  return (
    <div>
      <div style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{children}</div>
      {focusLever && <button type="button" className="sb-edit" style={{ fontSize: "var(--fs-small)" }} onClick={() => focusLever(lever)}>Adjust in sidebar</button>}
    </div>
  );
}

function WFieldRow({ label, helper, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>{label}</div>
        {helper && <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.4 }}>{helper}</div>}
      </div>
      <div style={{ marginLeft: 16, minWidth: 130, textAlign: "right" }}>
        {children}
      </div>
    </div>
  );
}

function AccountSplitEditor({ acct, color, onChangeSplits, onClose }) {
  const splits = acct.splits || [];
  const bal = acct.balance || 0;
  const total = splits.reduce((s, x) => s + (Number(x.pct) || 0), 0);
  const remaining = 100 - total;
  const clampPct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const update = (i, patch) => onChangeSplits(splits.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div style={{ marginLeft: 106, marginBottom: 8, padding: "8px 10px", background: "var(--tint-white-03)", border: `1px solid ${withAlpha(color, "33")}`, borderRadius: 6 }}>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 6 }}>
        Split <strong style={{ color: "var(--text-primary)" }}>{acct.name}</strong> across buckets · rolls up to {fmtDollar(bal)}
      </div>
      {splits.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          {[1, 2, 3].map(b => {
            const disabled = b === 1 && acct.category !== "cash";
            return (
              <button key={b} onClick={() => !disabled && update(i, { bucket: b })}
                disabled={disabled}
                title={disabled ? "Bucket 1 (cash cushion) can only be assigned to Cash accounts" : `Bucket ${b}`}
                style={{
                  background: s.bucket === b ? withAlpha(color, "33") : "transparent",
                  border: `1px solid ${s.bucket === b ? color : "var(--tint-white-10)"}`,
                  color: disabled ? "#1e293b" : s.bucket === b ? color : "#334155",
                  borderRadius: 4, padding: "2px 6px", fontSize: "var(--fs-small)", fontWeight: 700,
                  cursor: disabled ? "not-allowed" : "pointer", lineHeight: 1.4,
                  opacity: disabled ? 0.5 : 1,
                }}>B{b}</button>
            );
          })}
          <input
            type="number" min={0} max={100} value={s.pct}
            onChange={e => update(i, { pct: clampPct(e.target.value) })}
            style={{ width: 52, fontSize: "var(--fs-small)", color: "var(--text-primary)", background: "transparent", border: "1px solid var(--tint-white-10)", borderRadius: 4, padding: "2px 6px", textAlign: "right", outline: "none", fontFamily: "'JetBrains Mono',monospace" }}
                onFocus={selectAllOnFocus}
              />
          <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>%</span>
          <span style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", fontFamily: "'JetBrains Mono',monospace", minWidth: 78, textAlign: "right" }}>{fmtDollar(bal * (Number(s.pct) || 0) / 100)}</span>
          <button onClick={() => onChangeSplits(splits.filter((_, j) => j !== i))} title="Remove this slice"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--fs-body)", opacity: 0.6 }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <button onClick={() => onChangeSplits([...splits, { bucket: 2, pct: Math.max(0, remaining) }])}
          style={{ background: "transparent", border: `1px dashed ${withAlpha(color, "55")}`, borderRadius: 4, color, fontSize: "var(--fs-small)", padding: "2px 8px", cursor: "pointer" }}>+ Add slice</button>
        <span style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: total === 100 ? "var(--positive)" : "var(--accent-gold)" }}>
          {total === 100 ? "100% assigned" : `${total}% assigned · ${remaining > 0 ? remaining + "% left" : Math.abs(remaining) + "% over"}`}
        </span>
        <button onClick={() => { onChangeSplits([]); onClose(); }}
          style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--text-muted)", fontSize: "var(--fs-small)", cursor: "pointer", textDecoration: "underline" }}>↩ use one bucket</button>
      </div>
    </div>
  );
}

function SavingsPanel({ values, onChange }) {
  const GOAL = values.earlyRetireTarget || 1_000_000;
  const accounts = values.accounts || BLANK_PROFILE.accounts;
  const [splitEditId, setSplitEditId] = useState(null);
  const [showTaxAssumptions, setShowTaxAssumptions] = useState(false);

  const CATEGORIES = ACCOUNT_CATEGORIES;

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
      <ACard title="Accounts" accent="var(--accent-teal)" desc="Every balance the plan draws from, grouped by tax treatment — the grouping is what decides the withdrawal order and the tax on each dollar.">
      <BucketLegend />
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.5, marginTop: -4 }}>
        B1 / B2 / B3 sets how soon each account's money is needed. Each account starts at its category's default; ↺ appears when you change it.
      </div>
      {CATEGORIES.map(cat => {
        const catAccounts = accounts.filter(a => a.category === cat.key);
        return (
          <div key={cat.key} style={{ background: "var(--tint-white-02)", borderRadius: 8, borderLeft: `3px solid ${cat.color}`, padding: "8px 12px" }}>
            <div style={{ fontSize: "var(--fs-small)", color: cat.color, fontWeight: 600, marginBottom: 8 }}>{cat.label}</div>
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
                    style={{ width: 100, fontSize: "var(--fs-small)", color: "var(--text-primary)", background: "transparent", border: "1px solid var(--tint-white-06)", borderRadius: 4, padding: "2px 6px", fontFamily: "'DM Sans',sans-serif", outline: "none" }}
                    onFocus={e => e.target.style.borderColor = withAlpha(cat.color, "66")}
                    onBlur={e => e.target.style.borderColor = "var(--tint-white-06)"}
                  />
                  <div style={{ flex: 1 }}>
                    <ANumInput value={acct.balance || 0} onSet={(v) => handleBalance(acct.id, v)} min={0} max={999_000_000_000} step={5000} />
                  </div>
                  {hasSplits ? (
                    <span title="Split across buckets — click 🔀 to edit" style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: cat.color, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
                      {acct.splits.map(s => `${s.pct}%·B${s.bucket}`).join("  ")}
                    </span>
                  ) : (
                    [1,2,3].map(b => {
                      const active = clampBucket(acct.bucket ?? _defaultBucket(acct.category), acct.category) === b;
                      const disabled = b === 1 && cat.key !== "cash";
                      return (
                        <button key={b} onClick={() => !disabled && setBucket(acct.id, b)}
                          disabled={disabled}
                          title={disabled ? "Bucket 1 (cash cushion) can only be assigned to Cash accounts — it has to be spendable without triggering tax or an early-withdrawal penalty" : `Assign to Bucket ${b}`}
                          style={{
                            background: active ? withAlpha(cat.color, "33") : "transparent",
                            border: `1px solid ${active ? cat.color : "var(--tint-white-10)"}`,
                            color: disabled ? "var(--text-faint)" : active ? cat.color : "var(--text-muted)",
                            borderRadius: 4, padding: "2px 6px", fontSize: "var(--fs-small)", fontWeight: 700,
                            cursor: disabled ? "not-allowed" : "pointer", lineHeight: 1.4,
                            opacity: disabled ? 0.5 : 1,
                          }}>B{b}</button>
                      );
                    })
                  )}
                  {!hasSplits && clampBucket(acct.bucket ?? _defaultBucket(acct.category), acct.category) !== clampBucket(_defaultBucket(acct.category), acct.category) && (
                    <BucketResetButton account={acct} onReset={(id, b) => setBucket(id, b)} />
                  )}
                  <button onClick={() => toggleSplit(acct.id)} title="Split this account across buckets" style={{
                    background: (hasSplits || editing) ? withAlpha(cat.color, "33") : withAlpha(cat.color, "14"),
                    border: `1px solid ${(hasSplits || editing) ? cat.color : withAlpha(cat.color, "55")}`,
                    borderRadius: 4, padding: "2px 7px", fontSize: "var(--fs-body)", cursor: "pointer", lineHeight: 1.4,
                    filter: (hasSplits || editing) ? "none" : "opacity(0.85)",
                  }}
                    onMouseEnter={e => { if (!(hasSplits || editing)) { e.currentTarget.style.background = withAlpha(cat.color, "33"); e.currentTarget.style.filter = "none"; } }}
                    onMouseLeave={e => { if (!(hasSplits || editing)) { e.currentTarget.style.background = withAlpha(cat.color, "14"); e.currentTarget.style.filter = "opacity(0.85)"; } }}
                  >🔀</button>
                  <button
                    onClick={() => removeAccount(acct.id)}
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--fs-body)", padding: "2px 4px", opacity: 0.5 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "var(--chart-1)"; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    ×
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
              style={{ background: "transparent", border: `1px dashed ${withAlpha(cat.color, "33")}`, borderRadius: 4, color: cat.color, fontSize: "var(--fs-small)", padding: "2px 8px", cursor: "pointer", opacity: 0.6, marginTop: 2 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
            >
              + Add
            </button>
            {cat.key === "taxable" && catAccounts.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--tint-white-06)" }}>
                <button
                  onClick={() => setShowTaxAssumptions(v => !v)}
                  style={{ background: "transparent", border: "none", color: cat.color, fontSize: "var(--fs-small)", fontWeight: 600, cursor: "pointer", padding: 0 }}
                >
                  {showTaxAssumptions ? "▾" : "▸"} ⚙ Tax assumptions
                </button>
                {showTaxAssumptions && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 6 }}>
                      Applies to your combined Taxable balance ({fmtDollar(catSum("taxable"))}) — not any single account above.
                    </div>
                    <ARow label="Taxable cost basis" desc="Percent of your taxable brokerage balance that is cost basis (from your brokerage statement). The rest is unrealized gain — selling realizes it as LTCG income, taxed at 0/15/20% federal (plus state, plus NIIT above the MAGI threshold) and counted toward Social Security's provisional income and Medicare IRMAA.">
                      <ANumInput value={values.taxableBasisPct ?? 70} onSet={(v) => onChange("taxableBasisPct", v)} min={0} max={100} step={5} suffix="%" />
                    </ARow>
                    <ARow label="Taxable annual yield" desc="Percent of your taxable brokerage balance assumed to be interest/dividend yield, taxed every year even if reinvested — the rest of its growth stays deferred until you sell, same as above. 0% (off) leaves your plan unchanged; a diversified stock+bond account is often 1.5–3%.">
                      <ANumInput value={values.taxableYieldPct ?? 0} onSet={(v) => onChange("taxableYieldPct", v)} min={0} max={10} step={0.5} suffix="%" />
                    </ARow>
                    {(values.taxableYieldPct ?? 0) > 0 && (
                      <ARow label="— % of that yield taxed as ordinary income" desc="The rest of the yield above is taxed at qualified-dividend/LTCG rates instead. Interest (bonds, cash) is ordinary; qualified stock dividends get the lower rate — this is one blended split across your whole taxable balance, not per security.">
                        <ANumInput value={values.taxableYieldOrdinaryPct ?? 50} onSet={(v) => onChange("taxableYieldOrdinaryPct", v)} min={0} max={100} step={5} suffix="%" />
                      </ARow>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      </ACard>

      <ACard title="Early-Retirement Target" accent="var(--positive)" desc="Your goal number, and how the accounts above track against it.">
        <WFieldRow label="Target Portfolio for Early Retirement" helper={`Goal: ${fmtDollar(GOAL)}`}>
          <ANumInput value={values.earlyRetireTarget || 0} onSet={(v) => onChange("earlyRetireTarget", v)} min={0} max={MAX_MONEY_INPUT} step={50_000} />
        </WFieldRow>
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: "var(--fs-label)", color: "var(--text-primary)" }}>Progress</span>
            <span style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{percentToGoal.toFixed(1)}%</span>
          </div>
          <div style={{ height: 10, background: "var(--tint-white-10)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${percentToGoal}%`, height: "100%", background: "linear-gradient(90deg,#0d9488,var(--positive))", borderRadius: 5 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginTop: 12 }}>
            {[
              { label: "Pre-Tax", val: catSum("pretax"),  color: "#0ea5e9" },
              { label: "Roth",    val: catSum("roth"),     color: "var(--accent-purple)" },
              { label: "Taxable", val: catSum("taxable"),  color: "var(--accent-gold)" },
              { label: "HSA",     val: catSum("hsa"),      color: "var(--positive)" },
              { label: "Cash",    val: catSum("cash"),     color: "var(--text-secondary)" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{s.label}</div>
                <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(s.val)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
            <span>Total: <strong style={{ color: "var(--text-primary)" }}>{fmtDollar(autoTotal)}</strong></span>
            <span>Remaining: <strong style={{ color: "var(--chart-1)" }}>{fmtDollar(remaining)}</strong></span>
          </div>
        </div>
      </ACard>
    </div>
  );
}

function AboutYouPanel({ values, onChange }) {
  const derivedAge = ageFromDob(values.dob);
  const currentAgeForCalc = derivedAge ?? values.currentAge;
  const round1 = (n) => Math.round(n * 10) / 10;
  const yearsToRetire = round1(Math.max(0, values.retireAge - currentAgeForCalc));
  const yearsInRetire = round1(Math.max(0, values.endAge - values.retireAge));
  const totalHorizon = round1(yearsToRetire + yearsInRetire);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <ACard title="Who You Are" accent="#0ea5e9" desc="Who you are. Your birthday is the input of record — age, D-Day and every accumulation year derive from it.">
        <ARow label="Name" desc="Appears on the printable report and in the exported JSON filename (AiRA_Profile_&lt;name&gt;_YYYY-MM-DD.json). Not used in any calculation.">
          <input
            type="text"
            value={values.name || ""}
            placeholder="Full Name"
            onChange={(e) => onChange("name", e.target.value)}
            style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace" }}
          />
        </ARow>
        <ARow
          label="Date of Birth"
          desc={`Current age: ${derivedAge} · Used to derive D-Day (Day of Retirement) and accumulation years`}
        >
          <ADateInput value={values.dob} max={new Date().toISOString().slice(0, 10)} onSet={(v) => onChange("dob", v)} />
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
            style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", cursor: "pointer" }}
          >
            <option value="mfj">Married Filing Jointly (MFJ)</option>
            <option value="single">Single (unmarried)</option>
          </select>
        </ARow>
        <ARow label="Include a spouse or partner" desc="Model two people instead of one. Turns on your spouse's own Social Security (their benefit, their claim age, survivor benefits) and lets their retirement contributions stop on their own retirement date. Off leaves your plan exactly as it is today.">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "var(--fs-label)", color: "var(--text-secondary)" }}>
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
          <LeverValue lever="retireAge">Age {values.retireAge}</LeverValue>
        </WFieldRow>
        <WFieldRow label="Planning Horizon" helper="Age through which you want the plan to last.">
          <LeverValue lever="endAge">Age {values.endAge}</LeverValue>
        </WFieldRow>
        <WFieldRow label="Sex" helper="Used for SSA mortality overlay on the fan chart (male/female life expectancy tables, or blended average).">
          <select
            value={values.sex || "blended"}
            onChange={(e) => onChange("sex", e.target.value)}
            style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", cursor: "pointer" }}
          >
            <option value="blended">Blended (avg)</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </WFieldRow>
      </ACard>

      <ACard title="Plan Horizon At A Glance" accent="var(--accent-teal)" desc="Derived from your birthday and the two ages above — nothing to edit here.">
        {[
          { label: "Years to retirement", val: yearsToRetire, color: "var(--accent-teal)" },
          { label: "Years in retirement", val: yearsInRetire, color: "var(--accent-purple)" },
          { label: "Total horizon", val: `${totalHorizon} yrs`, color: "var(--text-primary)" },
        ].map((m) => (
          <div key={m.label}>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: "var(--fs-h1)", fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.2 }}>
              {m.val}
            </div>
          </div>
        ))}
      </ACard>
    </div>
  );
}

function ARow({ label, desc, children }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid var(--tint-white-06)" }}>
      <div>
        <div style={{ fontSize: "var(--fs-label)", color:"var(--text-primary)", fontWeight:500 }}>{label}</div>
        {desc && <div style={{ fontSize: "var(--fs-label)", color:"var(--text-secondary)", marginTop:2 }}>{desc}</div>}
      </div>
      <div style={{ marginLeft:16, flexShrink:0 }}>{children}</div>
    </div>
  );
}

function selectAllOnFocus(e) {
  const el = e.target;
  requestAnimationFrame(() => { try { el.select(); } catch { } });
}

function ANumInput({ value, onSet, min, max, step, suffix = "", plain = false }) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const allowDecimals = step != null && !Number.isInteger(step);
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  const inputRef = useRef(null);
  const typedSinceFocus = useRef(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value != null && !isNaN(value) ? value.toString() : "");
    }
  }, [value, isFocused]);

  const handleChange = (e) => {
    const raw = e.target.value;
    typedSinceFocus.current = true;
    setLocalValue(raw);
    const num = raw.trim() === "" ? 0 : parseNumericEntry(raw);
    if (num !== null) {
      onSet(max != null ? Math.min(max, num) : num);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const typed  = localValue.trim() === "" ? 0 : parseNumericEntry(localValue);
    const fallbk = value != null && !isNaN(value) ? value : null;
    const base   = typed !== null ? typed : fallbk;
    if (base === null) return;
    const clamped = Math.max(lo, Math.min(hi, base));
    if (!Number.isFinite(clamped)) return;
    if (clamped !== value) onSet(clamped);
    setLocalValue(clamped.toString());
  };

  const displayValue = isFocused
    ? localValue
    : (value != null && !isNaN(value)
        ? (plain ? String(value) : new Intl.NumberFormat('en-US').format(value))
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
          requestAnimationFrame(() => {
            const el = inputRef.current;
            if (!el || typedSinceFocus.current) return;
            if (typeof document !== "undefined" && document.activeElement !== el) return;
            try { el.select(); } catch { }
          });
        }}
        onBlur={handleBlur}
        style={{
          width: "120px",
          maxWidth: "100%",
          background: "#0d1b2a",
          border: "1px solid #1e3a5f",
          color: "var(--text-primary)",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: "var(--fs-label)",
          fontFamily: "'JetBrains Mono',monospace",
          textAlign: "right",
        }}
      />
      {suffix && <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{suffix}</span>}
    </div>
  );
}

function AStateSelect({ value, onSet }) {
  return (
    <select
      value={value || "NJ"}
      onChange={(e) => onSet(e.target.value)}
      style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"var(--text-primary)", borderRadius:6, padding:"4px 8px", fontSize: "var(--fs-label)", fontFamily:"'JetBrains Mono',monospace" }}
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

function ADateInput({ value, onSet, max }) {
  return (
    <DateField
      value={value}
      onSet={onSet}
      max={max}
      style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"var(--text-primary)", borderRadius:6, padding:"4px 8px", fontSize: "var(--fs-label)", fontFamily:"'JetBrains Mono',monospace" }}
    />
  );
}

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const MORT_START_YEARS_BACK = 40;
const MORT_START_YEARS_FWD  = 10;

function MonthYearSelect({ value, onSet }) {
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(value || "");
  const year  = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  const first = now.getFullYear() - MORT_START_YEARS_BACK;
  const last  = now.getFullYear() + MORT_START_YEARS_FWD;
  const years = [];
  for (let y = Math.min(first, year); y <= Math.max(last, year); y++) years.push(y);
  const emit = (yy, mm) => onSet(`${yy}-${String(mm).padStart(2, "0")}`);
  const sel = {
    background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)",
    borderRadius: 4, padding: "4px 6px", fontSize: "var(--fs-small)",
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
      fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--text-primary)",
      marginBottom: desc || !isOpen ? 5 : 12,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span>{title}</span>
      {collapsible && <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{isOpen ? "▾" : "▸"}</span>}
    </div>
  );

  return (
    <div style={{
      background: "var(--card-bg)",
      border: "1px solid var(--tint-white-08)",
      borderLeft: accent ? `3px solid ${accent}` : "1px solid var(--tint-white-08)",
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
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>{desc}</div>
      )}
      {isOpen && children}
    </div>
  );
}

function AssumptionsPanel({ values, onChange }) {
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

  const derivedAge = ageFromDob(dob) ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <ACard title="Tax Settings" accent="var(--accent)"
        desc="How AiRA taxes your withdrawals. Defaults are fine for most people.">
        {(values.filingStatus || "mfj") !== "single" && (
          <Toggle
            val={values.useJointRmdTable}
            onChange={(v) => onChange("useJointRmdTable", v)}
            label="Use Joint & Last Survivor RMD Table (spouse >10 yrs younger)"
            accent="var(--accent-purple)"
          />
        )}
      </ACard>

      <ACard title="Housing & Fixed Obligations" accent="var(--accent-gold)" collapsible defaultOpen={false}>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 12 }}>
          Separate housing &amp; fixed obligations from core lifestyle spend. The MC engine adds each carveout to the portfolio draw automatically.
        </div>
        <ARow label="Home / RE Annual Growth" desc="Annual appreciation rate applied to real estate values in the Net Worth projection.">
          <ANumInput value={values.reGrowthRate} onSet={(v) => onChange("reGrowthRate", v)} min={0} max={10} step={0.5} suffix="%" />
        </ARow>
        <ARow label="Housing type" desc="Own = mortgage P&amp;I drawn from portfolio until payoff. Rent = inflation-adjusted annual rent. None = housing already in core spend.">
          <select
            value={values.housingType || "own"}
            onChange={(e) => onChange("housingType", e.target.value)}
            style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", cursor: "pointer" }}
          >
            <option value="own">Own (mortgage)</option>
            <option value="rent">Rent</option>
            <option value="none">None / already in spend</option>
          </select>
        </ARow>
        {(values.housingType || "own") === "rent" && (
          <ARow label="Annual rent" desc="Today's dollars — inflated each year in simulation">
            <ANumInput value={values.annualRent} onSet={(v) => onChange("annualRent", v)} min={0} max={MAX_MONEY_INPUT} step={500} />
          </ARow>
        )}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", fontWeight: 600, marginBottom: 8 }}>
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
                style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace" }}
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
                style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
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
                style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
              <button
                onClick={() => onChange("carveouts", (values.carveouts || []).filter((_, i) => i !== idx))}
                style={{ background: "var(--tint-red-15)", border: "1px solid var(--tint-red-30)", color: "var(--chart-1)", borderRadius: 5, cursor: "pointer", fontSize: "var(--fs-body)", padding: "2px 6px" }}
              >×</button>
            </div>
          ))}
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 6 }}>Label · $/yr · End year (calendar year when obligation ends)</div>
          <button
            onClick={() => onChange("carveouts", [...(values.carveouts || []), { id: Date.now().toString(), label: "", annual: 0, endYear: new Date().getFullYear() + 5 }])}
            style={{ fontSize: "var(--fs-small)", background: "var(--tint-sky-500-10)", border: "1px solid var(--tint-sky-500-25)", color: "var(--accent)", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
          >+ Add obligation</button>
        </div>
      </ACard>

      <ACard title="Roth Conversion Strategy" accent="var(--accent-purple)">
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 12 }}>
          After each year's spending withdrawal, AiRA converts additional pretax → Roth to fill up to your target bracket. Tax on conversion is funded from the pretax bucket.
        </div>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", lineHeight: 1.5, marginBottom: 12 }}>
          The bracket-fill target is set on <strong style={{ color: "var(--accent-purple)" }}>Scenarios → Conversion Plan</strong>,
          right above the ladder it shapes — it's saved here in your profile so the Withdrawal Plan
          and Monte Carlo runs use the same setting.
        </div>
        <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", marginBottom: 6, marginTop: 4 }}>
          FAFSA / CSS College-Aid Protection — enter a year to cap Roth conversions during your child's college aid window. Leave blank to disable.
        </div>
        <div style={{ display: "flex", gap: 16, marginLeft: 4 }}>
          <ARow label="FAFSA cap through year" desc="Cap conversions at 12% bracket through this year (FAFSA uses 2-yr prior income). Leave blank to skip.">
            <input
              type="number"
              value={values.fafsaEndYear || ""}
              onChange={(e) => onChange("fafsaEndYear", e.target.value ? parseInt(e.target.value) : null)}
              placeholder="e.g. 2031"
              min={2026} max={2060}
              style={{ width: 100, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace" }}
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
              style={{ width: 100, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace" }}
                onFocus={selectAllOnFocus}
              />
          </ARow>
        </div>
        <ARow label="Tax funding source" desc="Who pays the tax on each conversion. 'From taxable' debits your real taxable / HSA / cash buckets — the honest default for most people. 'From the conversion' withholds the tax out of the amount transferred, so less lands in the Roth. 'Outside cash' is kept only so older saved profiles still load — it now behaves exactly like 'From taxable'.">
          <select
            value={values.taxFunding || "from_taxable"}
            onChange={(e) => onChange("taxFunding", e.target.value)}
            style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", cursor: "pointer" }}
          >
            <option value="from_taxable">From taxable / HSA / cash bucket (recommended)</option>
            <option value="from_conv">From the conversion (withhold)</option>
            <option value="outside_cash">Outside cash (legacy — same as From taxable)</option>
          </select>
        </ARow>
        {(values.taxFunding === "outside_cash") && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "var(--tint-orange-10)", border: "1px solid var(--tint-orange-35)",
            fontSize: "var(--fs-small)", color: "#fdba74", lineHeight: 1.55,
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

      <ACard title="Withdrawal Order" accent="var(--accent-teal)">
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", lineHeight: 1.5 }}>
          The <strong style={{ color: "var(--accent)" }}>account draw order</strong> (which bucket drains first —
          tax-reactive, custom, or pre-tax first) and the sourcing guardrails — pre-tax bracket ceiling,
          IRMAA guard, Roth reserve, and SS-torpedo warnings — are set on{" "}
          <strong style={{ color: "var(--accent-teal)" }}>Scenarios → Withdrawal Plan</strong>, right above the
          waterfall they shape. The distribution strategy stays here in Profile.
        </div>
      </ACard>

      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--tint-white-08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: "var(--fs-small)",
            fontWeight: 700,
            color: "var(--positive)",
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
        <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--tint-teal-600-06)", border: "1px solid rgba(13,148,136,0.2)", borderRadius: 8, fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
          Inflation, cash return, Social Security COLA and your equity glide are model parameters, not plan
          facts — they now live in <strong style={{ color: "var(--accent-teal)" }}>Monte Carlo → ⚙ Advanced Settings</strong>,
          with the rest of the simulation settings.
        </div>
      </div>

      <ACard title="Healthcare Shock Model" accent="var(--chart-1)" collapsible defaultOpen={false}>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 12 }}>
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
          fontSize: "var(--fs-small)",
          color: "var(--text-faint)",
          fontStyle: "italic",
          textAlign: "right",
        }}
      >
        Changes take effect on next Monte Carlo run · These replace all hardcoded simulation values
      </div>

      <ACard title="AI Assistant" accent="#c4b5fd" collapsible defaultOpen={false}
        desc="Optional. Bring your own free Gemini key to run AI analysis without spending AiRA credits.">
        <ARow label="Gemini API Key" desc="Bring your own free key from Google AI Studio to unlock AI analysis.">
          <input
            type="password"
            value={values.geminiApiKey || ''}
            onChange={(e) => onChange('geminiApiKey', e.target.value)}
            placeholder="AIza..."
            style={{ width: "260px", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace" }}
          />
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--fs-small)", color: "var(--chart-2)", marginLeft: 8 }}>Get free key →</a>
        </ARow>
        <ARow label="AI Model" desc="Fetched live from Google using your key, so a model Google retires disappears from this list instead of failing mid-analysis.">
          <select
            value={values.geminiModel || DEFAULT_GEMINI_MODEL}
            onChange={(e) => onChange('geminiModel', e.target.value)}
            style={{ width: "260px", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", cursor: "pointer" }}
          >
            {modelOptions.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
            {!modelOptions.some(m => m.id === (values.geminiModel || DEFAULT_GEMINI_MODEL)) && (
              <option value={values.geminiModel || DEFAULT_GEMINI_MODEL}>
                {values.geminiModel || DEFAULT_GEMINI_MODEL} (not offered by your key)
              </option>
            )}
          </select>
          <span style={{ fontSize: "var(--fs-small)", color: liveModels.length ? "var(--accent-teal)" : "var(--text-muted)", marginLeft: 8 }}>
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

  const sp = values.spouse || {};
  const spouseOn = !!sp.enabled;
  const setSpouse = (patch) => onChange("spouse", { ...sp, ...patch });
  const sp401k    = sp.contrib || 0;
  const spEmp     = sp.employerContrib || 0;
  const spRoth    = sp.rothContrib || 0;
  const spouseTotal = spouseOn ? sp401k + spEmp + spRoth : 0;
  const totalSavings = annual401k + hsaAnnual + employerContrib + rothContrib + taxableContrib + spouseTotal;

  const spouseStopOnPrimaryClock = spouseOn ? contribStopOnPrimaryClock(values) : Infinity;
  const spouseWorksPastPrimary = Number.isFinite(spouseStopOnPrimaryClock)
    && spouseStopOnPrimaryClock > (values.retireAge || 0)
    && spouseTotal > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <div style={{
        marginBottom: 2,
        fontSize: "var(--fs-small)", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-faint)",
      }}>
        While Working
      </div>

      <ACard title="Annual Contributions" desc="Still working? Enter your annual retirement-account contributions — leave at 0 if you're already retired.">
        <div style={{ fontSize: "var(--fs-small)", color: "var(--accent-gold)", marginBottom: 10, lineHeight: 1.4 }}>Employer Contribution and Brokerage/After-Tax Savings aren't capped by the tool — the IRS doesn't set a hard per-field limit on either, but real-world amounts are still bounded by your actual plan and income. 401(k), HSA, and Roth IRA below stay capped at their real legal limits.</div>
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

        {!spouseOn && (
          <div style={{ padding: "10px 12px", marginTop: 4, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.28)", borderRadius: 8, fontSize: "var(--fs-label)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span>Two of you saving? Enter your spouse's contributions separately so they stop on <strong style={{ color: "#c4b5fd" }}>their</strong> retirement date, not yours.</span>
            <button
              type="button"
              onClick={() => onNavigateStep && onNavigateStep(0)}
              style={{
                fontSize: "var(--fs-small)", color: "#c4b5fd", background: "none", border: "none",
                padding: 0, cursor: onNavigateStep ? "pointer" : "default",
                textDecoration: onNavigateStep ? "underline" : "none",
              }}
              disabled={!onNavigateStep}
            >
              Add a spouse in About You →
            </button>
          </div>
        )}

        {spouseOn && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--tint-white-08)" }}>
            <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "var(--accent-purple)", marginBottom: 4 }}>
              Your spouse
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Only the contributions tied to <em>their</em> job go here — they stop when your spouse stops
              working, which may not be when you do. Brokerage savings and the HSA above stay
              household-wide: brokerage money isn't tied to a job, and HSA contributions stop at
              Medicare enrolment rather than at retirement.
            </div>
            <WFieldRow label="Their retirement age" helper="Their OWN age when they stop working — not yours. This is the field that changes your projection: it decides how many more years their contributions keep landing. Leave blank to use your retirement age.">
              <input
                type="number"
                value={sp.retireAge ?? ""}
                onChange={(e) => setSpouse({ retireAge: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
                placeholder="same as you"
                min={AGE_LIMITS.retire.min} max={AGE_LIMITS.retire.max}
                style={{ width: 120, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
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
                background: "var(--tint-orange-10)", border: "1px solid var(--tint-orange-35)",
                fontSize: "var(--fs-small)", color: "#fdba74", lineHeight: 1.55,
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

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--tint-white-08)" }}>
          <span style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)" }}>Total annual savings <span style={{ color: "var(--text-faint)" }}>
            {spouseTotal > 0
              ? `(you ${fmtDollar(annual401k + employerContrib + rothContrib)} + spouse ${fmtDollar(spouseTotal)} + HSA ${fmtDollar(hsaAnnual)} + brokerage ${fmtDollar(taxableContrib)})`
              : "(incl. employer, HSA, Roth & brokerage)"}
          </span></span>
          <span style={{ fontSize: "var(--fs-h1)", fontWeight: 800, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(totalSavings)}<span style={{ fontSize: "var(--fs-label)", fontWeight: 400, color: "var(--text-muted)" }}>/yr</span></span>
        </div>
      </ACard>

      <div style={{
        marginTop: 4, marginBottom: 2, paddingTop: 12,
        borderTop: "1px solid var(--tint-white-10)",
        fontSize: "var(--fs-small)", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-faint)",
      }}>
        In Retirement
      </div>

      <ACard title="Social Security" accent="#7c3aed">
        <WFieldRow label="Social Security Benefit" helper="Monthly benefit at your SS start age. (Per Month)">
          <ANumInput value={Math.round((values.ssb || 0) / 12)} onSet={(v) => onChange("ssb", Math.round(v * 12))} min={0} max={10_000} step={50} suffix="/mo" />
        </WFieldRow>
        <WFieldRow label="SS Start Age" helper="Age you plan to claim Social Security.">
          <LeverValue lever="ssAge">Age {values.ssAge || 67}</LeverValue>
        </WFieldRow>

        {!values.spouse?.enabled && (
          <div style={{ padding: "10px 12px", marginBottom: 16, background: "var(--tint-violet-600-08)", border: "1px solid rgba(124,58,237,0.28)", borderRadius: 8, fontSize: "var(--fs-label)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span>Modelling one benefit. Add a spouse to include <strong style={{ color: "#c4b5fd" }}>their</strong> benefit, claim age and survivor benefits.</span>
            <button
              type="button"
              onClick={() => onNavigateStep && onNavigateStep(0)}
              style={{
                fontSize: "var(--fs-small)", color: "#c4b5fd", background: "none", border: "none",
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
          const primaryPia = Number(values.ssPia) || 0;
          const spousePia  = Number(sp.ssPia) || 0;
          const higherPia  = Math.max(primaryPia, spousePia);
          const topUp      = Math.max(0, higherPia * 0.5 - spousePia);
          const gap        = spouseAgeOffset(values);
          const spouseAge  = personAgeNow(sp);
          const yourAge    = personAgeNow(values);
          const spouseClaimAtYourAge = (sp.ssAge || 67) + gap;
          return (
            <>
              <WFieldRow
                label="Spouse's date of birth"
                helper="Their own age drives when their benefit starts, when they reach Medicare at 65, and their own RMD age. Leave blank to assume they are the same age as you."
              >
                <SpouseDobField value={sp.dob || ""} onSet={(dob) => setSpouse({ dob })} />
              </WFieldRow>
              <div style={{
                margin: "-8px 0 16px", padding: "8px 12px", borderRadius: 8, fontSize: "var(--fs-small)", lineHeight: 1.55,
                background: sp.dob ? "var(--tint-violet-600-08)" : "rgba(148,163,184,0.07)",
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
                  margin: "2px 0 14px", padding: "9px 12px", borderRadius: 8, fontSize: "var(--fs-small)", lineHeight: 1.55,
                  background: topUp > 0 ? "var(--tint-sky-07)" : "rgba(148,163,184,0.08)",
                  border: `1px solid ${topUp > 0 ? "var(--tint-sky-30)" : "rgba(148,163,184,0.22)"}`,
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
                        borderRadius: 6, padding: "5px 12px", fontSize: "var(--fs-label)", cursor: "pointer", fontWeight: 600,
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
                const primarySurvives = (sp.firstToDie || "spouse") !== "primary";
                const deathAtYourAge = primarySurvives ? sp.deathAge + gap : sp.deathAge;
                const survivorDob = primarySurvives ? values.dob : sp.dob;
                const survFraAge = survivorFra(
                  survivorDob ? parseInt(String(survivorDob).slice(0, 4), 10) : null
                );
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
                      margin: "-8px 0 16px", padding: "10px 12px", borderRadius: 8, fontSize: "var(--fs-small)", lineHeight: 1.6,
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
                      <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid var(--tint-orange-25)", color: "#fcd9b6" }}>
                        <strong>See what it costs:</strong> the <em>Stress Test</em> tab shows a
                        <strong> Widow&apos;s penalty</strong> card — your plan run twice, with and without this
                        death, on the same market paths — so the change in success rate is attributable to
                        the death alone.
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid var(--tint-orange-25)", color: "#fcd9b6" }}>
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
                  margin: "-8px 0 16px", padding: "9px 12px", borderRadius: 8, fontSize: "var(--fs-small)", lineHeight: 1.55,
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
          <ANumInput value={values.abGrowth ?? 3} onSet={(v) => onChange("abGrowth", v)} min={0} max={10} step={0.5} suffix="%" />
        </WFieldRow>
        <WFieldRow label="Rental Reliability" helper="Probability rental income is received each year (default 80%).">
          <ANumInput value={values.abReliability || 80} onSet={(v) => onChange("abReliability", v)} min={0} max={100} step={5} suffix="%" />
        </WFieldRow>
         <WFieldRow label="Rental Income Ends (year)" helper="Year when rental income is expected to end.">
          <input type="number" value={values.abEndYear || ''} min={2026} max={2100} step={1} onChange={(e) => onChange("abEndYear", Number(e.target.value))} style={{ background:"#0d1b2a", border:"1px solid #1e3a5f", color:"var(--text-primary)",
            borderRadius:6, padding:"6px 8px", fontSize: "var(--fs-label)", fontFamily:"'JetBrains Mono',monospace",
            width:80, textAlign:"right" }}
                onFocus={selectAllOnFocus}
              /> year
        </WFieldRow>
      </ACard>

      <ACard title="Pensions">
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>
          Defined-benefit income. Pick the type for each one — AiRA models them differently, and
          getting it wrong is the most common source of bad numbers here.
        </div>

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
          style={{ background: "var(--tint-sky-500-10)", border: "1px dashed var(--tint-sky-500-45)", borderRadius: 6, color: "var(--accent)", fontSize: "var(--fs-label)", fontWeight: 600, padding: "6px 12px", cursor: "pointer", marginTop: 8 }}
        >+ Add pension</button>
      </ACard>

      <ACard title="Other Income">
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>
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
          style={{ background: "var(--tint-sky-500-10)", border: "1px dashed var(--tint-sky-500-45)", borderRadius: 6, color: "var(--accent)", fontSize: "var(--fs-label)", fontWeight: 600, padding: "6px 12px", cursor: "pointer", marginTop: 8 }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--tint-sky-500-18)"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--tint-sky-500-10)"}
        >+ Add another income source</button>
      </ACard>

      <ACard title="One-Off Income & Windfalls">
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>
          Money you expect <em>once</em> — an inheritance, a home or business sale. AiRA deposits it into
          the account you pick in the year it arrives, and it compounds from there. It is income, not
          spending — it will never appear under Planned One-Off Expenses.
        </div>
        {(values.cashFlowEvents || []).filter(e => e.direction === "in" && e.source !== "pension").map((ev) => {
          const upd = (patch) => onChange("cashFlowEvents", (values.cashFlowEvents || []).map(x => x.id === ev.id ? { ...x, ...patch } : x));
          return (
            <div key={ev.id} style={{ border: "1px solid var(--tint-white-08)", borderRadius: 10, padding: 12, marginBottom: 10, background: "var(--tint-white-02)", position: "relative" }}>
              <button onClick={() => onChange("cashFlowEvents", (values.cashFlowEvents || []).filter(x => x.id !== ev.id))}
                title="Remove this windfall"
                style={{ position: "absolute", top: 8, right: 8, background: "var(--tint-red-15)", border: "1px solid var(--tint-red-30)", color: "var(--chart-1)", borderRadius: 5, cursor: "pointer", fontSize: "var(--fs-label)", padding: "2px 8px" }}>×</button>
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
          style={{ background: "var(--tint-sky-500-10)", border: "1px dashed var(--tint-sky-500-45)", borderRadius: 6, color: "var(--accent)", fontSize: "var(--fs-label)", fontWeight: 600, padding: "6px 12px", cursor: "pointer", marginTop: 8 }}
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

function PensionEntry({ type, onTypeChange, onRemove, children }) {
  return (
    <div style={{ border: "1px solid var(--tint-white-08)", borderRadius: 10, padding: 12, marginBottom: 10, background: "var(--tint-white-02)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {PENSION_TYPES.map(t => {
          const on = t.id === type;
          return (
            <button key={t.id} onClick={() => onTypeChange(t.id)} title={t.desc}
              style={{
                background: on ? "rgba(14,165,233,0.22)" : "transparent",
                border: `1px solid ${on ? "rgba(56,189,248,0.55)" : "var(--tint-white-10)"}`,
                color: on ? "#e0f2fe" : "var(--text-muted)",
                borderRadius: 6, padding: "4px 10px", fontSize: "var(--fs-small)",
                fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit",
              }}>{t.icon} {t.label}</button>
          );
        })}
        <button onClick={onRemove} title="Remove this pension"
          style={{ marginLeft: "auto", background: "var(--tint-red-15)", border: "1px solid var(--tint-red-30)", color: "var(--chart-1)", borderRadius: 5, cursor: "pointer", fontSize: "var(--fs-label)", padding: "2px 8px" }}>×</button>
      </div>
      {children}
    </div>
  );
}

function LumpPensionFields({ ev, upd, placeholder = "Cash balance pension", taxHint = "(uncheck for a direct rollover)" }) {
  const cell = { background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "5px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace", width: "100%" };
  const lbl  = { fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 3, display: "block" };
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
      <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-small)", color: "var(--text-secondary)", cursor: "pointer" }}>
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
  }, []);

  const onFocusCard = () => { clearTimeout(blurTimer.current); setFocused(true); };
  const onBlurCard = () => { blurTimer.current = setTimeout(() => setFocused(false), 150); };

  const upd = (patch) => onChange({ ...inc, ...patch });

  return (
    <div
      onFocus={onFocusCard}
      onBlur={onBlurCard}
      style={{
        background: focused ? "rgba(14,165,233,0.05)" : "var(--tint-white-02)",
        border: `1px solid ${focused ? "rgba(14,165,233,0.4)" : "var(--tint-white-07)"}`,
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
            fontSize: "var(--fs-label)",
            fontWeight: 600,
            color: "var(--text-primary)",
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${focused ? "rgba(14,165,233,0.4)" : "var(--tint-white-10)"}`,
            outline: "none",
            padding: "2px 0",
            fontFamily: "'DM Sans',sans-serif",
            transition: "border-color 0.15s",
          }}
        />
        {!focused && (
          <span style={{ fontSize: "var(--fs-small)", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
            {inc.annual ? <span style={{ color: "var(--accent-teal)", fontWeight: 700 }}>{`$${Number(inc.annual).toLocaleString("en-US", { maximumFractionDigits: 2 })}/yr`}</span> : ""}
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
          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--fs-body)", padding: "2px 4px", opacity: 0.5 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "var(--chart-1)"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = "var(--text-muted)"; }}
        >×</button>
      </div>
      {focused && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px 108px 60px auto", gap: 6, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 2 }}>Annual ($)</div>
            <ANumInput value={inc.annual || 0} onSet={(v) => upd({ annual: v })} min={0} max={MAX_MONEY_INPUT} step={1000} suffix="/yr" />
          </div>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 2 }}>Start yr</div>
            <input type="number" value={inc.startYear || ""} min={2025} max={2100}
              onChange={(e) => upd({ startYear: e.target.value ? Number(e.target.value) : null })}
              style={{ width: "100%", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 6px", fontSize: "var(--fs-small)", fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
          </div>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 2 }}>End yr</div>
            <input type="number" value={inc.endYear || ""} min={2025} max={2100}
              onChange={(e) => upd({ endYear: e.target.value ? Number(e.target.value) : null })}
              placeholder="∞"
              style={{ width: "100%", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 6px", fontSize: "var(--fs-small)", fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
          </div>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 3 }}>Grows by</div>
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
                    style={{ flex: 1, border: "none", cursor: "pointer", fontSize: "var(--fs-small)", fontWeight: 700, padding: "3px 0", lineHeight: 1, background: on ? "#0ea5e9" : "transparent", color: on ? "#fff" : "var(--text-muted)" }}
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
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 2 }}>Cap yrs</div>
            <input type="number" value={inc.growthCapYears || ""} min={1} max={50}
              onChange={(e) => upd({ growthCapYears: e.target.value ? Number(e.target.value) : null })}
              placeholder="∞"
              style={{ width: "100%", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 6px", fontSize: "var(--fs-small)", fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}
                onFocus={selectAllOnFocus}
              />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 14 }}>
            <Toggle val={inc.taxable} onChange={(v) => upd({ taxable: v })} accent="#0ea5e9" />
            <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>Taxable</span>
          </div>
        </div>
      )}
    </div>
  );
}

function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  return saveBlobAs(blob, filename, "CSV file", { "text/csv": [".csv"] });
}

function ExpenseImport({ values, onChange }) {
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const fileRef = useRef(null);
  const meta = values.spImportMeta || null;

  const applyCsv = (text, fileName) => {
    setError(""); setWarnings([]);
    try {
      const r = parseExpenseCsv(text);
      setWarnings(r.warnings || []);
      const importedAt = new Date().toISOString();
      if (r.mode === "multi") {
        onChange("spSchedule", r.schedule);
        onChange("spImportMeta", {
          mode: "multi", fileName, importedAt,
          years: r.schedule.length,
          firstYear: r.schedule[0].year, lastYear: r.schedule[r.schedule.length - 1].year,
        });
      } else {
        onChange("sp", r.total);
        onChange("spSchedule", null);
        onChange("spImportMeta", {
          mode: "single", fileName, importedAt,
          total: r.total, essentialTotal: r.essentialTotal ?? null,
          lineCount: r.lineItems.length,
        });
      }
    } catch (err) {
      setError(err.message || "Could not read that file.");
    }
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => applyCsv(String(e.target.result || ""), file.name);
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  };

  const budgetLines = values.budgetLines || [];
  const budgetReady = budgetLines.length > 0 && budgetLines.every((l) => !lineError(l));

  const clearImport = () => {
    onChange("spSchedule", null);
    onChange("spImportMeta", null);
    setError(""); setWarnings([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
    <BudgetEditor value={budgetLines} onChange={(next) => onChange("budgetLines", next)} />
    {budgetLines.length > 0 && (
      <button type="button" className="cfg-btn" disabled={!budgetReady} data-testid="budget-apply"
        style={{ width: "auto", margin: "8px 0 0", padding: "6px 14px", opacity: budgetReady ? 1 : 0.5 }}
        onClick={() => applyCsv(budgetLinesToCsv(budgetLines), "the budget you typed")}>
        Use this budget as my US spending
      </button>
    )}
    <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 8 }}>
      <div style={{ fontSize: "var(--fs-label)", fontWeight: 700, color: "#c4b5fd", marginBottom: 4 }}>Import detailed expenses (CSV)</div>
      <div style={{ fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 8 }}>
        Replace the typed spend above with a line-item budget. <strong style={{ color: "var(--text-secondary)" }}>Exclude</strong> mortgage/rent,
        debt, medical, long-term care, and income tax — those are modeled separately (Expense Model, carveouts, tax engine).
        Upload <strong style={{ color: "var(--text-secondary)" }}>one year</strong> (summed and inflated forward) or
        <strong style={{ color: "var(--text-secondary)" }}> multiple years</strong> (one column or row per year — used as the spend plan for those years).
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
          style={{ fontSize: "var(--fs-label)", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#d8b4fe", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}
        >⬆ Choose CSV file</button>
        <button
          onClick={() => downloadCsv("AiRA_budget_template_one_year.csv", SINGLE_YEAR_TEMPLATE)}
          style={{ fontSize: "var(--fs-small)", background: "transparent", border: "1px solid #334155", color: "var(--text-secondary)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
        >↓ One-year template</button>
        <button
          onClick={() => downloadCsv("AiRA_budget_template_multi_year.csv", MULTI_YEAR_TEMPLATE)}
          style={{ fontSize: "var(--fs-small)", background: "transparent", border: "1px solid #334155", color: "var(--text-secondary)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
        >↓ Multi-year template</button>
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: "var(--fs-small)", color: "#fca5a5", background: "var(--tint-red-08)", border: "1px solid var(--tint-red-30)", borderRadius: 6, padding: "6px 10px" }}>
          {error}
        </div>
      )}

      {meta && (
        <div style={{ marginTop: 10, fontSize: "var(--fs-small)", color: "var(--text-secondary)", background: "var(--tint-sky-06)", border: "1px solid var(--tint-sky-20)", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ lineHeight: 1.5 }}>
            {meta.mode === "multi" ? (
              <>
                <strong style={{ color: "var(--accent-teal)" }}>Multi-year budget loaded</strong> — {meta.years} years
                ({meta.firstYear}–{meta.lastYear}) from <em>{meta.fileName}</em>.
                <div style={{ color: "var(--accent-gold)", fontSize: "var(--fs-small)", marginTop: 2 }}>
                  This overrides the withdrawal-strategy spend rule. After the last year, the final amount inflates forward.
                </div>
              </>
            ) : (
              <>
                <strong style={{ color: "var(--accent-teal)" }}>One-year budget loaded</strong> — {fmtDollar(meta.total)}/yr
                from {meta.lineCount} line item(s) in <em>{meta.fileName}</em>.
                {meta.essentialTotal != null && (
                  <div style={{ color: "var(--text-secondary)", fontSize: "var(--fs-small)", marginTop: 2 }}>
                    Essential (Must Spend): {fmtDollar(meta.essentialTotal)}/yr · Total (Like to Spend) set as US Spending above.
                  </div>
                )}
              </>
            )}
          </div>
          <button
            onClick={clearImport}
            style={{ flexShrink: 0, fontSize: "var(--fs-small)", background: "var(--bg-danger)", border: "1px solid var(--tint-red-30)", color: "var(--chart-1)", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}
          >Clear</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 8, fontSize: "var(--fs-small)", color: "var(--accent-gold)" }}>
          {warnings.map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}
    </div>
    </>
  );
}

function ExpensesPanel({ values, onChange }) {
  const meta = values.spImportMeta || null;
  const usSp = values.sp || 0;
  const outOfCountrySp = values.spOutOfCountry != null ? values.spOutOfCountry : (values.spSpendOutofState || 0);
  const combinedSp = usSp + outOfCountrySp;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <ACard title="Spending" accent="var(--accent-teal)">
        <div style={{
          marginBottom: 16, padding: "9px 12px", borderRadius: 8,
          background: "var(--tint-amber-07)", border: "1px solid rgba(251,191,36,0.28)",
          fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.55,
        }}>
          <strong style={{ color: "var(--accent-gold)" }}>Enter what you want to spend — after tax.</strong>{" "}
          This is money that reaches your household. AiRA withdraws extra from the portfolio
          to pay the tax bill <em>on top of</em> this figure, so do not add taxes in yourself
          and do not reduce it for them.
          <div data-testid="spend-housing-note" style={{ marginTop: 6 }}>
            {(values.housingType || "own") === "none"
              ? <>Include your housing costs in this number: Housing type is set to “None / already in spend”, so AiRA adds nothing for housing.</>
              : (values.housingType === "rent"
                ? <>Leave rent out of this number: AiRA adds your Annual rent on top of it.</>
                : <>Leave your mortgage payment out of this number: AiRA adds it on top, from <GoStep step={PROFILE_STEP_REAL_ESTATE}>Real Estate &amp; Debt</GoStep>, until the loan is paid off.</>)}
          </div>
        </div>
        <WFieldRow label="US Spending (annual)" helper="Domestic household spending in today's dollars, after tax. Subject to state income tax when residing in-state.">
          <LeverValue lever="sp">{fmtDollar(values.sp || 0)}/yr</LeverValue>
        </WFieldRow>
        <WFieldRow label="Out-of-Country Spending (annual)" helper="Spending that occurs abroad in today's dollars, after tax. Always drawn from the portfolio but never subject to US state tax.">
          <ANumInput value={values.spOutOfCountry != null ? values.spOutOfCountry : (values.spSpendOutofState || 0)} onSet={(v) => onChange("spOutOfCountry", v)} min={0} max={MAX_MONEY_INPUT} step={1000} suffix="/yr" />
        </WFieldRow>
        <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--tint-sky-06)", border: "1px solid var(--tint-sky-20)", borderRadius: 8, fontSize: "var(--fs-label)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Total combined annual spending, after tax (used for portfolio draw)</span>
          <strong style={{ color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", fontSize: "var(--fs-body)" }}>{fmtDollar(combinedSp)}/yr</strong>
        </div>
        <div style={{ marginTop: 8, fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {values.smile !== false ? (
            <>
              <span style={{ color: "var(--accent-purple)" }}>Spending curve is ON</span> — this target is re-scaled
              per year (down through the active years, up again in late retirement), so year-by-year
              spending will not equal the figure above. The Withdrawal Plan table shows the exact
              percentage each year. Turn it off under <strong style={{ color: "var(--text-secondary)" }}>Options → Spending curve</strong> in the sidebar.
            </>
          ) : (
            <>
              <span style={{ color: "var(--text-muted)" }}>Spending curve is OFF</span> — this target stays flat
              in real terms for every year of the plan. Enable it under <strong style={{ color: "var(--text-secondary)" }}>Options → Spending curve</strong> in the sidebar.
            </>
          )}
        </div>
      </ACard>

      <ACard title="Detailed Expense Budget" accent="#c4b5fd" desc="Optional. Type or upload a real line-item budget instead of one number." collapsible defaultOpen={(values.budgetLines || []).length > 0}>
        <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
          Instead of typing a single spending number above, upload your real line-item budget.
          A <strong style={{ color: "var(--text-secondary)" }}>one-year</strong> budget is summed into the US Spending field
          above and inflated forward like a typed number.
          A <strong style={{ color: "var(--text-secondary)" }}>multi-year</strong> budget becomes an explicit per-year spending
          plan that overrides your withdrawal strategy's spend rule for those years — the Monte Carlo,
          Withdrawal Plan, and deterministic schedule all follow it.
        </div>
        <ExpenseImport values={values} onChange={onChange} />
        {!meta && (
          <div style={{ marginTop: 12, fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.5 }}>
            No budget loaded — the plan currently uses the typed spending numbers above.
          </div>
        )}
      </ACard>

      <ACard title="Planned One-Off Expenses" accent="var(--chart-3)"
        desc="Big costs you can see coming — a new roof, a car, a wedding, a heavy travel year. Enter today's price; AiRA inflates it to the year it happens.">
        {(values.cashFlowEvents || []).filter(e => e.direction !== "in").length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 70px 78px 28px", gap: 6, marginBottom: 4, fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>
            <span>What</span><span style={{ textAlign: "right" }}>Cost</span><span style={{ textAlign: "right" }}>Year</span>
            <span style={{ textAlign: "right" }}>Every</span><span style={{ textAlign: "right" }}>Until</span><span />
          </div>
        )}
        {(values.cashFlowEvents || []).filter(e => e.direction !== "in").map((ev) => {
          const upd = (patch) => onChange("cashFlowEvents",
            (values.cashFlowEvents || []).map(x => x.id === ev.id ? { ...x, ...patch } : x));
          const cell = { background: "#0d1b2a", border: "1px solid #1e3a5f", color: "var(--text-primary)", borderRadius: 6, padding: "4px 8px", fontSize: "var(--fs-label)", fontFamily: "'JetBrains Mono',monospace" };
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
                  style={{ background: "var(--tint-red-15)", border: "1px solid var(--tint-red-30)", color: "var(--chart-1)", borderRadius: 5, cursor: "pointer", fontSize: "var(--fs-body)", padding: "2px 6px" }}
                >×</button>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: "var(--fs-small)", color: "var(--text-secondary)", cursor: "pointer" }}>
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
          style={{ fontSize: "var(--fs-small)", background: "var(--tint-orange-10)", border: "1px solid var(--tint-orange-25)", color: "var(--chart-3)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", marginTop: 4 }}
        >+ Add planned expense</button>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>
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
  const twoHousehold = values.twoHousehold ?? false;
  const baseSpend = combinedSp || 100000;
  const floorPct = values.gkFloorPct ?? GK_FLOOR_DEFAULT_PCT;
  const ceilingPct = values.gkCeilingPct ?? GK_CEILING_DEFAULT_PCT;
  const guard = resolveSpendGuardrails({ sp: usSp, spOutOfCountry: outOfCountrySp, gkFloorPct: floorPct, gkCeilingPct: ceilingPct, spImportMeta: values.spImportMeta });
  const guardFromImport = guard.source === "import";
  const floor = guardFromImport ? guard.gkFloor : Math.round(baseSpend * (floorPct / 100));
  const ceiling = guardFromImport ? guard.gkCeiling : Math.round(baseSpend * (ceilingPct / 100));
  const strategy = resolveStrategy(values.withdrawalStrategy);

  const wr = computeInitialWR({ ...values, sp: combinedSp });
  const { steadyWRpct, initWRpct, projectedPort, steadyDraw, initDrawEst, oneOffAtRetire, ssAtRetire, rentalAtRetire,
    otherIncAtRetire, housingAtRetire, carveoutAtRetire, annualAdds, accumRate, nominalRate, inflRate, yrsToRetire } = wr;
  const retireAge = values.retireAge || 65;
  const inSafeBand = steadyWRpct >= 5.0 && steadyWRpct <= 5.5;
  const wrColor = inSafeBand ? "var(--positive)" : (steadyWRpct > 5.5 ? "var(--chart-1)" : "var(--accent-gold)");

  const activeScenario = twoHousehold
    ? "Claiming non-residency — no state income tax"
    : `Resident of ${values.stateOfResidence || "your state"} — state tax applies`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ background: "rgba(14,165,233,0.08)", border: "1px solid var(--tint-sky-500-25)", borderRadius: 8, padding: "10px 14px", fontSize: "var(--fs-label)", color: "#7dd3fc" }}>
        <strong>State tax:</strong> {activeScenario} · Sidebar toggle → "Non-resident (no state tax)"
      </div>

      <ACard title="Withdrawal Strategy" accent="var(--accent-purple)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            width: "100%",
            background: "#0d1b2a",
            border: "1px solid #1e3a5f",
            color: "var(--text-primary)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: "var(--fs-body)",
            fontFamily: "var(--font-sans)",
          }}>
            {getStrategyLabel(strategy)}
          </div>
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.4 }}>{getStrategyDescription(strategy)}</div>
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab("scenarios", "withdrawals")}
            style={{
              fontSize: "var(--fs-small)", color: "var(--accent-teal)", background: "none", border: "none",
              padding: 0, cursor: onNavigateTab ? "pointer" : "default",
              textDecoration: onNavigateTab ? "underline" : "none", textAlign: "left",
            }}
            disabled={!onNavigateTab}
          >
            Change this on the Withdrawal Plan tab →
          </button>
        </div>
      </ACard>

      <ACard title="Spending" accent="var(--accent-teal)">
        <div style={{ padding: "10px 12px", background: "var(--tint-sky-06)", border: "1px solid var(--tint-sky-20)", borderRadius: 8, fontSize: "var(--fs-label)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>
            Combined annual spending <span style={{ color: "var(--accent-gold)" }}>(after tax)</span>{values.spImportMeta ? (
              <> · <strong style={{ color: "#c4b5fd" }}>{values.spImportMeta.mode === "multi" ? "multi-year budget active" : "budget-driven"}</strong></>
            ) : null}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", fontSize: "var(--fs-body)" }}>{fmtDollar(combinedSp)}/yr</strong>
            <button
              type="button"
              onClick={() => onNavigateStep && onNavigateStep(3)}
              style={{
                fontSize: "var(--fs-small)", color: "#c4b5fd", background: "none", border: "none",
                padding: 0, cursor: onNavigateStep ? "pointer" : "default",
                textDecoration: onNavigateStep ? "underline" : "none",
              }}
              disabled={!onNavigateStep}
            >
              Edit in Spending &amp; Expenses →
            </button>
          </span>
        </div>
      </ACard>

      <ACard title="Social Security" accent="#7c3aed">
        <div style={{ padding: "10px 12px", background: "var(--tint-violet-600-08)", border: "1px solid rgba(124,58,237,0.28)", borderRadius: 8, fontSize: "var(--fs-label)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>Now in the <strong style={{ color: "#c4b5fd" }}>Money In</strong> step — SS is income, not a withdrawal setting.</span>
          <button
            type="button"
            onClick={() => onNavigateStep && onNavigateStep(2)}
            style={{
              fontSize: "var(--fs-small)", color: "#c4b5fd", background: "none", border: "none",
              padding: 0, cursor: onNavigateStep ? "pointer" : "default",
              textDecoration: onNavigateStep ? "underline" : "none",
            }}
            disabled={!onNavigateStep}
          >
            Edit in Money In →
          </button>
        </div>
      </ACard>

      <ACard title="Rental Income" accent="#295ff1" collapsible defaultOpen={false}>
        <div style={{ padding: "10px 12px", background: "rgba(41,95,241,0.08)", border: "1px solid rgba(41,95,241,0.28)", borderRadius: 8, fontSize: "var(--fs-label)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>Now in the <strong style={{ color: "#c4b5fd" }}>Money In</strong> step — it is income, same as SS and pensions.</span>
          <button
            type="button"
            onClick={() => onNavigateStep && onNavigateStep(2)}
            style={{
              fontSize: "var(--fs-small)", color: "#c4b5fd", background: "none", border: "none",
              padding: 0, cursor: onNavigateStep ? "pointer" : "default",
              textDecoration: onNavigateStep ? "underline" : "none",
            }}
            disabled={!onNavigateStep}
          >
            Edit in Money In →
          </button>
        </div>
      </ACard>

      <ACard title="Strategy Detail" accent="var(--accent-purple)" desc="The parameters the strategy you picked above actually uses.">
        {strategy === "gk" && (
          <>
            <div style={{ fontSize: "var(--fs-body)", color: "var(--text-primary)", marginBottom: 12 }}>Guyton‑Klinger Guardrails</div>
            <div style={{
              marginBottom: 14,
              padding: "10px 12px",
              background: inSafeBand ? "var(--tint-green-07)" : "var(--tint-amber-08)",
              border: `1px solid ${withAlpha(wrColor, "40")}`,
              borderRadius: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-secondary)" }}>Initial portfolio draw rate</div>
                <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: wrColor, fontFamily: "'JetBrains Mono',monospace" }}>{steadyWRpct.toFixed(1)}%</div>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginLeft: "auto", fontStyle: "italic" }}>
                  {inSafeBand ? "in 5–5.5% safe band" : steadyWRpct > 5.5 ? "above safe band — consider lower spend or later retirement" : "below safe band — room to spend more or retire earlier"}
                </div>
              </div>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.5 }}>
                spend {fmtDollar(wr.baseSpend)} − SS {fmtDollar(ssAtRetire)} − rental {fmtDollar(rentalAtRetire)} − other income {fmtDollar(otherIncAtRetire)} (floored at $0) + housing {fmtDollar(housingAtRetire)} + carveouts {fmtDollar(carveoutAtRetire)} = portfolio draw {fmtDollar(steadyDraw)}<br/>
                projected portfolio at age {retireAge} (today's dollars): {fmtDollar(projectedPort)}<br/>
                = current {fmtDollar(values.port || 0)} grown {yrsToRetire}yr @ {(accumRate * 100).toFixed(1)}% real ({(nominalRate * 100).toFixed(1)}% nominal − {(inflRate * 100).toFixed(1)}% infl) + {fmtDollar(annualAdds)}/yr contrib<br/>
                ⇒ {fmtDollar(steadyDraw)} ÷ {fmtDollar(projectedPort)} = <strong style={{ color: wrColor }}>{steadyWRpct.toFixed(1)}%</strong>
                {oneOffAtRetire > 0 && <><br/>year one also pays one-off expenses of {fmtDollar(oneOffAtRetire)}: {fmtDollar(initDrawEst)} ÷ {fmtDollar(projectedPort)} = {initWRpct.toFixed(1)}% that year only</>}
              </div>
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 16 }}>
              {guardFromImport
                ? <>Floor = <strong style={{ color: "var(--text-secondary)" }}>Must Spend</strong> · Ceiling = <strong style={{ color: "var(--text-secondary)" }}>Like to Spend</strong> (from your imported budget — the slider %s below are ignored)</>
                : <>Floor = {floorPct}% of core spend · Ceiling = {ceilingPct}% of core spend</>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 4 }}>Floor</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-gold)", fontFamily: "'JetBrains Mono',monospace" }}>{guardFromImport ? fmtDollar(floor) : `${floorPct}%`}</div><div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{guardFromImport ? "essentials / yr" : `${fmtDollar(floor)} / yr`}</div></div>
              <div style={{ width: 1, height: 30, background: "var(--tint-white-10)" }} />
              <div style={{ textAlign: "center" }}><div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", marginBottom: 4 }}>Ceiling</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--positive)", fontFamily: "'JetBrains Mono',monospace" }}>{guardFromImport ? fmtDollar(ceiling) : `${ceilingPct}%`}</div><div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>{guardFromImport ? "full budget / yr" : `${fmtDollar(ceiling)} / yr`}</div></div>
            </div>
            <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--tint-teal-600-06)", border: "1px solid rgba(13,148,136,0.2)", borderRadius: 8, fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              Floor and ceiling are edited in <strong style={{ color: "var(--accent-teal)" }}>Monte Carlo → ⚙ Advanced Settings</strong> →
              Spending Guardrails, alongside the rest of the simulation settings. The values in force are shown above.
            </div>
            <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(14,165,233,0.06)", border: "1px solid var(--tint-sky-500-18)", borderRadius: 8, fontSize: "var(--fs-small)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              <div style={{ fontWeight: 700, color: "#7dd3fc", marginBottom: 6 }}>Guyton‑Klinger — the 5 rules</div>
              <div style={{ marginLeft: 8, marginBottom: 6 }}>
                <strong>1. Initial draw.</strong> Derived from your spending ÷ portfolio at retirement. Safe range is 5–5.5%.<br/>
                <strong>2. Capital Preservation.</strong> If WR rises 20% above initial → cut spending 10%.<br/>
                <strong>3. Prosperity.</strong> If WR falls 20% below initial → raise spending 10%.<br/>
                <strong>4. Inflation rule.</strong> Adjust spending by CPI only after positive-return years, capped at 6%.<br/>
                <strong>5. Longevity rule.</strong> Skip the −10% cut when ≤15 years remain to your end-age.
              </div>
              <div style={{ marginBottom: 4 }}>The <strong style={{ color: "var(--accent-gold)" }}>Floor</strong> and <strong style={{ color: "var(--positive)" }}>Ceiling</strong> sliders above are a safety belt on top of the 5 rules — spending can drift within those bands but never past them.</div>
              <div style={{ fontStyle: "italic", color: "var(--text-muted)" }}>Defaults: 65 / 135. Tighten (e.g. 80 / 120) to keep spending closer to plan; widen (e.g. 55 / 150) to allow larger swings.</div>
            </div>
          </>
        )}
        {strategy === "fixed" && (
          <>
            <div style={{ fontSize: "var(--fs-body)", color: "var(--text-primary)", marginBottom: 12 }}>Fixed Percentage Withdrawal</div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 16 }}>Each year, withdraw a fixed percentage of the current portfolio balance.</div>
            <div style={{ textAlign: "center", marginBottom: 14 }}><div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>Withdrawal Rate</div><div style={{ fontSize: "var(--fs-display)", fontWeight: 700, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace" }}>{values.fixedWithdrawalRate || 4.0}%</div><div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>of portfolio balance each year</div></div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <WFieldRow label="Withdrawal Rate" helper="Annual percentage of portfolio to withdraw (default 4%).">
                <ANumInput value={values.fixedWithdrawalRate ?? 4.0} onSet={(v) => onChange("fixedWithdrawalRate", v)} min={2} max={10} step={0.1} suffix="%" />
              </WFieldRow>
            </div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 16, fontStyle: "italic", textAlign: "center" }}>Spending will fluctuate with portfolio value.</div>
          </>
        )}
        {strategy === "vpw" && (
          <>
            <div style={{ fontSize: "var(--fs-body)", color: "var(--text-primary)", marginBottom: 12 }}>Variable Percentage Withdrawal</div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 16 }}>Each year, the portfolio is amortized over the years remaining to your plan-to age — so the plan is designed to spend down to roughly zero, not to leave an estate.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>Assumed real return</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-gold)", fontFamily: "'JetBrains Mono',monospace" }}>{(((values.vpwRealReturn ?? 0.0376)) * 100).toFixed(2)}%</div></div>
              <div style={{ width: 1, height: 30, background: "var(--tint-white-10)" }} />
              <div style={{ textAlign: "center" }}><div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>Amortized to age</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--positive)", fontFamily: "'JetBrains Mono',monospace" }}>{values.vpwEndAge ?? values.endAge ?? 100}</div></div>
            </div>
          </>
        )}
        {!["gk", "fixed", "vpw"].includes(strategy) && (
          <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", textAlign: "center" }}>{getStrategyLabel(strategy)} strategy active — see documentation for details.</div>
        )}
      </ACard>
    </div>
  );
}



const LANDING_SS_ANNUAL = 30000;
const LANDING_REAL_RETURN = 0.045;
const LANDING_TARGET = 0.85;

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
function landingEarliestAge(s) {
  for (let a = Math.max(s.curAge + 1, 50); a <= AGE_LIMITS.retire.max; a++) {
    if (landingProject(a, s).conf >= LANDING_TARGET) return a;
  }
  return null;
}

const LANDING_ALREADY_RETIRED_AGE = 66;
function landingIsRetired(s) {
  return s.curAge >= LANDING_ALREADY_RETIRED_AGE;
}

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
const LANDING_LIMITS = {
  savings: { min: 50_000, max: 250_000_000 },
  contrib: { min:      0, max:   5_000_000 },
  spend:   { min: 40_000, max:   5_000_000 },
};
const LANDING_SLIDER_STEPS = 1000;
const LANDING_LOG_FLOOR = 1_000;

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
  const v = Math.max(min, Math.min(max, val || 0));
  if (v <= 0) return 0;
  const lo = Math.log(Math.max(LANDING_LOG_FLOOR, min));
  const hi = Math.log(max);
  return Math.round(((Math.log(Math.max(LANDING_LOG_FLOOR, v)) - lo) / (hi - lo)) * LANDING_SLIDER_STEPS);
}

function LandingMoneyField({ row }) {
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const put = (v) => { draftRef.current = v; setDraft(v); };
  const commit = () => {
    const d = draftRef.current;
    if (d === null) return;
    put(null);
    const n = parseMoneyInput(d, row.min);
    if (n !== null) row.set(n);
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

function LpReveal({ children, className = "" }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || calm || typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={"lp-reveal " + className + (seen ? " lp-in" : "")}>{children}</div>;
}

const LANDING_INTRO_VIDEO_URL = "";

const LANDING_STEPS = [
  { key: "age", q: "How Old Are You?", help: "Your age sets how many years you have left to save." },
  { key: "savings", q: "How Much Have You Saved So Far?", help: "Add up your retirement accounts and investments. Round numbers are fine." },
  { key: "spend", q: "What Do You Want To Spend Each Year In Retirement?", help: "Think in today's dollars." },
  { key: "contrib", q: "How Much Will You Add Each Year Until Then?", help: "Include any employer match. Use zero if you are not saving." },
];

const LANDING_FEATURES = [
  { kicker: "The Result", t: "One Clear Number, Backed By Detail",
    d: "Your plan runs through thousands of simulated markets. You get one headline number, then the numbers behind it.",
    points: ["Share of simulated futures where your money lasts", "Worst case, withdrawal rate and the age money runs out", "Every figure shown in today's dollars"],
    img: "/landing/result.png", alt: "The AiRA result card showing a 99.5 percent success rate and a strip of supporting figures.", cap: "The result card, using example numbers." },
  { kicker: "Stress Test", t: "See What Happens When Things Go Wrong",
    d: "Each card re-runs your plan with one thing going wrong, so you see how much a bad stretch really costs.",
    points: ["A market crash right at retirement", "A long-term care event", "Living to 100", "Replay real past crashes against your plan"],
    img: "/landing/stress.png", alt: "Three stress cards: market crashes early, long-term care event and live to 100, each showing the change in success rate.", cap: "The Stress Test tab, using example numbers." },
  { kicker: "Checkpoints", t: "Save A Check-In And Watch Your Plan Over Time",
    d: "Plans drift. Save a check-in whenever something changes, and AiRA shows whether your plan is holding or slipping.",
    points: ["Change in success rate since your first check-in", "A plan-shape chart across five measures", "Everything stays on your device"],
    img: "/landing/checkpoints.png", alt: "The Progress tab showing latest success rate, change since first check-in and a plan shape chart.", cap: "The Progress tab, using example numbers." },
  { kicker: "AI Analysis", t: "Turn Your Results Into Next Steps",
    d: "An optional AI analysis reads your plan and writes a ranked list of actions to consider.",
    points: ["Optional: the calculator works fully without it", "Uses AiRA credits, or your own free Gemini key", "It suggests. You decide."],
    img: "/landing/ai.png", alt: "The Action Plan tab after AI analysis: a retirement date solver table and a ranked list of nine items marked critical, important or on track.", cap: "The Action Plan tab after an AI analysis, using example numbers." },
];

function RetirementLanding({ onEnter, savedPlan = false, onContinue }) {
  const [curAge, setCurAge] = useState(45);
  const [savings, setSavings] = useState(850000);
  const [contribL, setContribL] = useState(40000);
  const [spend, setSpend] = useState(90000);
  const canvasRef = useRef(null);
  const [step, setStep] = useState(null);
  const guidedRef = useRef(null);
  const s = { curAge, savings, contrib: contribL, spend };
  const retired = landingIsRetired(s);
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
    g.addColorStop(0, "rgba(90,209,240,0.28)"); g.addColorStop(1, "rgba(90,209,240,0.02)");
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(x(i), y(p.val)) : ctx.lineTo(x(i), y(p.val)));
    ctx.lineTo(x(pts.length - 1), H - pad); ctx.lineTo(x(0), H - pad); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(x(i), y(p.val)) : ctx.lineTo(x(i), y(p.val)));
    ctx.strokeStyle = "var(--accent-teal)"; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
  }, [curAge, savings, contribL, spend, age, step]);

  useEffect(() => {
    if (step !== null && guidedRef.current) {
      guidedRef.current.closest(".landing")?.scrollTo?.(0, 0);
      window.scrollTo(0, 0);
      const h = guidedRef.current.querySelector("h2");
      if (h) h.focus({ preventScroll: true });
    }
  }, [step]);

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

  const renderRow = (r) => (
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
  );

  const startNow = savedPlan ? onContinue : () => onEnter(s);
  const rowByKey = (k) => rows.find((r) => r.key === k);
  const replaceAndEnter = () => { if (!savedPlan || window.confirm("Replace your saved plan with these numbers?")) onEnter(s); };
  const confPct = Math.round(conf * 100);
  const RING_R = 58, RING_C = 2 * Math.PI * RING_R;
  const startLabel = savedPlan ? "Open My Saved Plan" : "See Your Real Numbers";
  const steps = [
    { n: "1", t: "Answer Four Questions", d: "Your age, what you have saved, what you add each year, and what you want to spend in retirement." },
    { n: "2", t: "Run The Simulation", d: `AiRA replays your plan through ${MC_PATHS_LABEL} simulated market histories, with taxes, Social Security and the order you withdraw from accounts.` },
    { n: "3", t: "Read One Number", d: "See the share of simulated futures where your money lasts. Change an input and watch the number move." },
  ];
  const checks = [
    { t: "2026 Tax Rules", d: "Federal tax brackets and standard deductions use the 2026 IRS figures." },
    { t: "Medicare Premium Surcharges", d: "Income-based surcharges (called IRMAA) use the 2026 Medicare (CMS) figures." },
    { t: "Required Withdrawals", d: "The rules for when you must start taking money out of retirement accounts (RMDs)." },
    { t: "Market Stress Tests", d: "Replay past market crashes against your plan to see how it holds up." },
  ];

  return (
    <div className="landing">
      <div className="lp-site">
        <header className="lp-top">
          <div className="logo">AiRA <span className="logo-sub">Freedom Financial</span></div>
          <nav className="lp-nav" aria-label="Page sections">
            <a href="#lp-how">How It Works</a>
            <a href="#lp-trust">What We Check</a>
            <button className="lp-nav-btn" onClick={startNow}>{savedPlan ? "Open My Saved Plan" : "Open The App"}</button>
          </nav>
        </header>

        {step === null ? (
        <section className="lp-hero">
          <div>
            <div className="lp-eyebrow">Free Retirement Planner</div>
            <h1 className="lp-title">See Your Real Retirement Numbers</h1>
            <p className="lp-sub">
              Answer four questions to see when you can retire. Then test your plan against {MC_PATHS_LABEL} simulated
              markets, using your real accounts, taxes and Social Security.
            </p>
            <div className="lp-btnrow">
              <button className="lp-cta" onClick={startNow}>{startLabel}</button>
              <button className="lp-ghost" onClick={() => setStep(0)}>Walk Me Through It</button>
            </div>
            {savedPlan
              ? <button className="lp-skip" onClick={() => {
                  if (window.confirm("Replace your saved plan with the numbers on this page?")) onEnter(s);
                }}>Replace My Plan With These Numbers</button>
              : <button className="lp-skip" onClick={() => onEnter(null)}>Skip — I'll Enter My Own Details</button>}
            <p className="lp-micro">No Account Needed. Your Plan Is Saved On This Device.</p>
            <div className="lp-facts">
              <div><b>{MC_PATHS_LABEL}</b><span>Simulated Markets Per Run</span></div>
              <div><b>2026</b><span>IRS And Medicare Rules</span></div>
              <div><b>Free</b><span>No Account Needed</span></div>
            </div>
          </div>

          <div className="lp-panel lp-card">
            <div className="lp-card-tag">Example Plan: Change The Numbers To Yours</div>
            <h2 className={"lp-answer" + (age != null && conf < 0.9 ? " short" : "")}>
              {retired
                ? <>Your money lasts to <span className="lp-age">{landingLastsToAge(s)}</span></>
                : age != null
                  ? <>You can retire at <span className="lp-age">{age}</span></>
                  : <>Let's find your <span className="lp-age">number</span></>}
            </h2>
            <p className="lp-card-sub">
              {age != null
                ? <>The math says you reach financial independence{" "}
                    <b style={{ color: "var(--text-primary)" }}>{age - curAge <= 0 ? "right now" : `${age - curAge} year${age - curAge === 1 ? "" : "s"} from now`}</b>
                    {conf >= 0.92 ? ", with real margin." : ", with a modest cushion."}</>
                : <>No age up to {AGE_LIMITS.retire.max} clears 85% confidence at these numbers yet. Try saving more, or trimming the spend.</>}
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 34, fontWeight: 500, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{Math.round(conf * 100)}</span>
                <span style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", fontWeight: 600 }}>% confident<br />at that age</span>
              </div>
              <div style={{ flex: 1, minWidth: 160, height: 10, borderRadius: 100, background: "var(--tint-white-06)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -3, bottom: -3, left: "85%", width: 2, background: "var(--text-faint)" }} />
                <div style={{ height: "100%", borderRadius: 100, width: `${Math.min(100, Math.round(conf * 100))}%`, background: "var(--accent-teal)", transition: "width 0.35s" }} />
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 }}>Median portfolio path</div>
              <canvas ref={canvasRef} style={{ width: "100%", height: 120, display: "block" }} />
            </div>

            <div style={{ marginTop: 18 }}>
              {rows.map(renderRow)}
            </div>
            <p className="lp-fine">An estimate from a simplified model, not financial advice and not a guarantee. The full app is more detailed.</p>
          </div>
        </section>
        ) : (
        <section className="lp-hero lp-guided" ref={guidedRef}>
          <div>
            {step < 4 ? (
              <>
                <div className="lp-eyebrow">Question {step + 1} Of 4</div>
                <h2 className="lp-q" tabIndex={-1}>{LANDING_STEPS[step].q}</h2>
                <p className="lp-sub">{LANDING_STEPS[step].help}</p>
                <div className="lp-qrow">{renderRow(rowByKey(LANDING_STEPS[step].key))}</div>
              </>
            ) : (
              <>
                <div className="lp-eyebrow">Your Quick Estimate</div>
                <h2 className="lp-q" tabIndex={-1}>
                  {retired
                    ? <>Your money lasts to <span className="lp-age">{landingLastsToAge(s)}</span></>
                    : age != null
                      ? <>You can retire at <span className="lp-age">{age}</span></>
                      : <>Not Yet At These Numbers</>}
                </h2>
                <p className="lp-sub">
                  {age != null
                    ? <>That is {confPct}% confident at that age, from a simplified model. The full app tests your real accounts, taxes and Social Security against {MC_PATHS_LABEL} simulated markets.</>
                    : <>No age up to {AGE_LIMITS.retire.max} clears 85% confidence yet. Go back and try saving more, or spending less.</>}
                </p>
                <button className="lp-cta" onClick={replaceAndEnter}>See Your Real Numbers</button>
              </>
            )}
            <div className="lp-btnrow" style={{ marginTop: step < 4 ? 8 : 14 }}>
              {step > 0 && step < 4 && <button className="lp-ghost" onClick={() => setStep(step - 1)}>Back</button>}
              {step < 4 && <button className="lp-cta lp-cta-sm" onClick={() => setStep(step + 1)}>{step === 3 ? "See My Estimate" : "Next"}</button>}
              {step === 4 && <button className="lp-ghost" onClick={() => setStep(0)}>Change My Answers</button>}
            </div>
            <button className="lp-skip" onClick={() => setStep(null)}>Back To Overview</button>
          </div>

          <div className="lp-panel lp-card lp-ringcard">
            {step < 3 ? (
              <>
                <div className="lp-card-tag">Your Number</div>
                <p className="lp-card-sub">Your estimate appears after question 3. It updates as you answer.</p>
                <div className="lp-dots" aria-hidden="true">
                  {[0, 1, 2, 3].map((n) => <span key={n} className={n <= step ? "on" : ""} />)}
                </div>
              </>
            ) : (
              <>
                <div className="lp-card-tag">{step === 3 ? "Updating As You Answer" : "Your Estimate"}</div>
                <div className="lp-ring" role="img"
                  aria-label={age != null ? `Confidence at the earliest retirement age: ${confPct} percent` : "No retirement age reaches 85 percent confidence yet"}>
                  <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
                    <circle cx="75" cy="75" r={RING_R} fill="none" stroke="var(--tint-white-06)" strokeWidth="12" />
                    <circle cx="75" cy="75" r={RING_R} fill="none" strokeWidth="12" strokeLinecap="round"
                      stroke={conf >= 0.85 ? "var(--accent-teal)" : "var(--accent-gold)"}
                      strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - Math.min(1, conf))}
                      transform="rotate(-90 75 75)" className="lp-ring-arc" />
                  </svg>
                  <div className="lp-ring-num"><b>{confPct}</b><span>% Confident</span></div>
                </div>
                <h3 className="lp-h3" style={{ marginTop: 14 }}>
                  {retired ? <>Money lasts to {landingLastsToAge(s)}</> : age != null ? <>Retire at {age}</> : <>No age reaches 85%</>}
                </h3>
                <p className="lp-fine">An estimate from a simplified model, not financial advice and not a guarantee.</p>
              </>
            )}
          </div>
        </section>
        )}

        <section className="lp-section">
          <h2 className="lp-h2">See It In Action</h2>
          <p className="lp-p" style={{ maxWidth: "62ch", marginBottom: 18 }}>
            A 24-second silent tour with example numbers: the projection, the forecast range, spending guardrails and a stress test that replays a real market crash.
          </p>
          <LpReveal>
            <figure className="lp-shot lp-video">
              <video controls preload="none" playsInline poster="/landing/tour-poster.jpg"
                aria-label="Silent 24-second tour of the AiRA app using example numbers">
                <source src="/landing/tour.mp4" type="video/mp4" />
              </video>
              <figcaption>Press play. No sound. Example numbers.</figcaption>
            </figure>
          </LpReveal>
        </section>

        <section className="lp-section">
          <h2 className="lp-h2">What AiRA Does Best</h2>
          {LANDING_FEATURES.map((f, i) => (
            <LpReveal key={f.t} className={"lp-feature" + (i % 2 ? " lp-flip" : "")}>
              <div className="lp-feature-text">
                <div className="lp-eyebrow">{f.kicker}</div>
                <h3 className="lp-h3 lp-h3-big">{f.t}</h3>
                <p className="lp-p">{f.d}</p>
                <ul className="lp-bullets">{f.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
              </div>
              {f.img
                ? <figure className="lp-shot"><img src={f.img} alt={f.alt} loading="lazy" /><figcaption>{f.cap}</figcaption></figure>
                : <div className="lp-shot lp-shot-note"><b>{f.noteTitle}</b><span>{f.note}</span></div>}
            </LpReveal>
          ))}
        </section>

        <section id="lp-how" className="lp-section">
          <h2 className="lp-h2">How It Works</h2>
          <div className="lp-grid3">
            {steps.map((st) => (
              <div key={st.n} className="lp-tile">
                <div className="lp-num">{st.n}</div>
                <h3 className="lp-h3">{st.t}</h3>
                <p className="lp-p">{st.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section">
          <h2 className="lp-h2">Choose How To Start</h2>
          <div className="lp-grid3">
            {savedPlan && (
              <button className="lp-tile lp-tile-btn" onClick={onContinue}>
                <h3 className="lp-h3">Open My Saved Plan</h3>
                <p className="lp-p">Go straight back to the plan saved on this device.</p>
              </button>
            )}
            <button className="lp-tile lp-tile-btn" onClick={() => setStep(0)}>
              <h3 className="lp-h3">Walk Me Through It</h3>
              <p className="lp-p">Four short questions, one at a time, with your estimate updating as you answer.</p>
            </button>
            <button className="lp-tile lp-tile-btn" onClick={() => (savedPlan ? window.confirm("Replace your saved plan with the numbers on this page?") && onEnter(s) : onEnter(s))}>
              <h3 className="lp-h3">Start With The Numbers Above</h3>
              <p className="lp-p">Use the four answers in the example card. The app fills in the rest and lists what it assumed.</p>
            </button>
            <button className="lp-tile lp-tile-btn" onClick={() => (savedPlan ? window.confirm("Replace your saved plan with a blank one?") && onEnter(null) : onEnter(null))}>
              <h3 className="lp-h3">Enter Every Detail Myself</h3>
              <p className="lp-p">Go to the full inputs for accounts, income, taxes and Social Security.</p>
            </button>
            {LANDING_INTRO_VIDEO_URL && (
              <a className="lp-tile lp-tile-btn" href={LANDING_INTRO_VIDEO_URL} target="_blank" rel="noopener noreferrer">
                <h3 className="lp-h3">Watch: Getting Started</h3>
                <p className="lp-p">A short video that walks through your first plan.</p>
              </a>
            )}
          </div>
        </section>

        <section id="lp-trust" className="lp-section">
          <h2 className="lp-h2">What We Check</h2>
          <p className="lp-p" style={{ maxWidth: "62ch" }}>
            The math follows published rules, and every change runs the full automated test suite before it ships.
          </p>
          <div className="lp-grid2">
            {checks.map((c) => (
              <div key={c.t} className="lp-tile">
                <h3 className="lp-h3">{c.t}</h3>
                <p className="lp-p">{c.d}</p>
              </div>
            ))}
          </div>
          <div className="lp-tile" style={{ marginTop: 14 }}>
            <h3 className="lp-h3">What This Doesn't Do</h3>
            <p className="lp-p">
              AiRA is an educational tool. It is not financial advice. It cannot predict markets or promise a result,
              and its assumptions are ones you can see and change.
            </p>
          </div>
        </section>

        <footer className="lp-foot">
          <div className="lp-foot-grid">
            <div>
              <div className="logo">AiRA</div>
              <p className="lp-foot-line">Built in the open by one person who wanted honest retirement numbers.</p>
              <p className="lp-foot-line">No ads. No accounts. Your plan stays on your device.</p>
            </div>
            <nav aria-label="Use It">
              <h3>Use It</h3>
              <button type="button" onClick={startNow}>{savedPlan ? "Open My Saved Plan" : "Open The App"}</button>
              <a href="#lp-how">How It Works</a>
              <a href="#lp-trust">What We Check</a>
            </nav>
            <nav aria-label="Check My Work">
              <h3>Check My Work</h3>
              <a href="https://github.com/axwack/Aira_Monte_Carlo" target="_blank" rel="noopener noreferrer">Source On GitHub</a>
              <a href="/contribute#check-the-math">Check The Math</a>
              <a href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("AiRA wrong number")}`}>Report A Wrong Number</a>
            </nav>
            <nav aria-label="Help Build It">
              <h3>Help Build It</h3>
              <a href="/contribute">Contribute</a>
              <a href={aboutLink("YouTube Channel")} target="_blank" rel="noopener noreferrer">YouTube</a>
              <a href={`mailto:${FEEDBACK_EMAIL}`}>Contact</a>
            </nav>
          </div>
          <p className="lp-foot-fine">
            AiRA is an educational tool, not financial, tax or legal advice. v{APP_VERSION}
          </p>
        </footer>
      </div>
    </div>
  );
}

function setToastTimed(setter, toast, ms) {
  setter(toast);
  return setTimeout(() => setter(null), ms);
}

export default function AiRAForecaster() {
  const [activeTab, setTab] = useState(() =>
    loadProfileFromLocal() ? "networth" : "assumptions"
  );
  const [mcView, setMcView] = useState("simulation");
  const [profileSavedBefore] = useState(() => !!loadProfileFromLocal());
  const [sbCoreOpen, setSbCoreOpen] = useState(() => !loadProfileFromLocal());
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const skipAutosave = useRef(false);
  const [sbMacroOpen, setSbMacroOpen] = useState(false);
  const [sbOptionsOpen, setSbOptionsOpen] = useState(false);
  const [pendingScenarioSubTab, setPendingScenarioSubTab] = useState(null);
  const [profileJump, setProfileJump] = useState(null);
  const navigateToTab = useCallback((tab, subTab = null, profileStep = null) => {
    if (subTab) setPendingScenarioSubTab(subTab);
    if (profileStep != null) setProfileJump({ step: profileStep, n: Date.now() });
    setTab(tab);
  }, []);
  const focusLever = useCallback((key) => {
    setSbCoreOpen(true);
    setTimeout(() => {
      const el = document.querySelector(`[data-lever="${key}"]`), sb = el?.closest(".sidebar");
      if (!el) return;
      if (sb.getBoundingClientRect().top < 0) window.scrollTo({ top: 0 });
      sb.scrollTop += el.getBoundingClientRect().top - sb.getBoundingClientRect().top - 60;
      el.querySelector("input")?.focus({ preventScroll: true });
    }, 0);
  }, []);
  const twisty = (open, fn) => ({
    role: "button", tabIndex: 0, "aria-expanded": open, onClick: fn,
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } },
  });
  const tabsRef = useRef(null);
  const openPlanInputs = useCallback((step = null) => {
    navigateToTab("assumptions", null, step);
    const tabs = tabsRef.current, main = tabs?.parentElement;
    if (!tabs) return;
    if (main.scrollHeight > main.clientHeight) main.scrollTop += tabs.getBoundingClientRect().top - main.getBoundingClientRect().top;
    else tabs.scrollIntoView({ block: "start" });
  }, [navigateToTab]);
  const [hasSavedPlan] = useState(() => !!loadProfileFromLocal());
  const [showWelcome, setShowWelcome] = useState(
    () => !loadProfileFromLocal() || new URLSearchParams(window.location.search).has("welcome"));
  const [fromLanding, setFromLanding] = useState(false);
  const [running, setRunning] = useState(false);
  const [stale, setStale] = useState(false);
  const [cachedRun] = useState(loadResultsFromLocal);
  const [mc, setMc] = useState(cachedRun?.mc ?? null);
  const [stress, setStress] = useState(cachedRun?.stress ?? null);
  const [lastRunAt, setLastRunAt] = useState(cachedRun?.savedAt ?? null);
  const [hoveredAge, setHoveredAge] = useState(null);


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
      // eslint-disable-next-line no-restricted-properties -- a permanent point-in-time snapshot written once on Check-in, not a live display re-derived on render.
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

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const reportUnlocked = useReportUnlocked(showReport ? 1 : 0);
  const reportCapable = useReportCapability();
  const ownerVerified = useOwnerVerified();
  const [stripeToast, setStripeToast] = useState(null);
  const stripeReturn  = useStripeReturn();
  const restoreReturn = useRestoreReturn();
  const [recoveryLink, setRecoveryLink] = useState(null);
  useEffect(() => {
    if (stripeReturn?.success && stripeReturn.restoreUrl) {
      setRecoveryLink({ url: stripeReturn.restoreUrl });
    }
  }, [stripeReturn]);
  useEffect(() => {
    if (!stripeReturn) return;
    const reportBuy = stripeReturn.packId === "report";
    const stalled = reportBuy && !stripeReturn.reportUnlocked;
    const okMsg = reportBuy
      ? (stripeReturn.reportUnlocked
          ? "Report unlocked — it's yours permanently. Press ▶ Run Monte Carlo, then Report."
          : `Payment received — your report is taking longer than usual to unlock. Reload this page in a minute. If it is still locked, email ${FEEDBACK_EMAIL} with your Stripe receipt and we will open it straight away.`)
      : `${(stripeReturn.credits || 0).toLocaleString()} credits added to your account`;
    const t = stripeReturn.success
      ? setToastTimed(setStripeToast, { msg: okMsg, tone: stalled ? "warn" : "ok" }, stalled ? 20000 : 5000)
      : setToastTimed(setStripeToast, { msg: `${stripeReturn.error}`, tone: "err" }, 15000);
    return () => clearTimeout(t);
  }, [stripeReturn]);
  useEffect(() => {
    if (!restoreReturn) return;
    const t = restoreReturn.success
      ? setToastTimed(setStripeToast, { msg: `Account restored — ${restoreReturn.credits.toLocaleString()} credits available`, tone: "ok" }, 6000)
      : setToastTimed(setStripeToast, { msg: `${restoreReturn.error}`, tone: "err" }, 15000);
    return () => clearTimeout(t);
  }, [restoreReturn]);
  const ranSigRef = useRef(cachedRun?.sig ?? null);
  const runningRef = useRef(false);
  const sigRef = useRef(null);
  const pendingRunRef = useRef(false);

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

  const [assumptions, setAssumptions] = useState(() => {
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
    (key, val) => setAssumptions((prev) => ({ ...prev, [key]: val, ...(key === "dob" ? { dobIsEstimate: false } : {}) })),
    []
  );

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
  }, []);

  const currentAge = useMemo(
    () => ageFromDob(assumptions.dob) ?? assumptions.currentAge ?? BLANK_PROFILE.currentAge,
    [assumptions.dob, assumptions.currentAge]
  );

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

  const autosaveReady = useRef(false);
  const [lastAutosaveAt, setLastAutosaveAt] = useState(null);
  useEffect(() => {
    if (!autosaveReady.current) { autosaveReady.current = true; return; }
    if (showWelcome) return;
    const t = setTimeout(() => {
      if (skipAutosave.current) return;
      if (saveProfileToLocal(liveProfile)) setLastAutosaveAt(new Date());
    }, 1000);
    return () => clearTimeout(t);
  }, [liveProfile, showWelcome]);

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

  const params = useMemo(
    () => ({
      dob: assumptions.dob || "",
      rmdStartAge: assumptions.rmdStartAge,
      currentAge,
      retireAge: retAge,
      endAge,
      ssAge: assumptions.ssAge,
      ssPia: assumptions.ssPia || 0,
      spouse: assumptions.spouse || {
        enabled: false, dob: "", ssb: 0, ssAge: 67, ssPia: 0,
        deathAge: null, firstToDie: "spouse",
        survivorClaimAge: null, survivorBenefitAtClaim: 0,
        retireAge: null, contrib: 0, employerContrib: 0, rothContrib: 0,
      },
      port,
      contrib,
      employerContrib: assumptions.employerContrib || 0,
      hsaContrib: Math.round((assumptions.hsaMonthly || 0) * 12),
      taxableContrib: assumptions.taxableContrib || 0,
      rothContrib: assumptions.rothContrib || 0,
      accounts: assumptions.accounts,
      sp: (sp || 0) + (assumptions.spOutOfCountry || assumptions.spSpendOutofState || 0),
      spOutOfCountry: assumptions.spOutOfCountry || assumptions.spSpendOutofState || 0,
      spSpendOutofState: assumptions.spSpendOutofState,
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
      mortRate: assumptions.mortRate ?? 6.5,
      mortStart: assumptions.mortStart || "2020-01",
      mortTerm: assumptions.mortTerm || 30,
      mortExtra: assumptions.mortExtra || 0,
      properties: assumptions.properties || [],
      reGrowthRate: assumptions.reGrowthRate ?? 3.0,
      housingType: assumptions.housingType || "own",
      annualRent: assumptions.annualRent || 0,
      carveouts: assumptions.carveouts || [],
      cashFlowEvents: assumptions.cashFlowEvents || [],
      spSchedule: (assumptions.spSchedule && assumptions.spSchedule.length) ? assumptions.spSchedule : null,
      rothConversionTarget: (() => { const r = assumptions.rothConversionTarget || "off"; return r.startsWith("fill_") ? r.replace("fill_", "") : r; })(),
      taxFunding: assumptions.taxFunding || "from_taxable",
      fafsaGuard: assumptions.fafsaGuard || false,
      fafsaEndYear: assumptions.fafsaEndYear || null,
      cssEndYear: assumptions.cssEndYear || null,
      conversionOverrides: assumptions.conversionOverrides || [],
      preRetireEq: assumptions.preRetireEq,
      preRetireReturn: assumptions.preRetireReturn ?? null,
      postRetireEq: assumptions.postRetireEq,
      glidepathSwitchAge: assumptions.glidepathSwitchAge ?? null,
      hcShockAge: assumptions.hcShockAge,
      hcProb: assumptions.hcProb,
      hcMin: assumptions.hcMin,
      hcMax: assumptions.hcMax,
      cashRealReturn: assumptions.cashRealReturn ?? 3.0,
      sex: assumptions.sex || "blended",
      taxableBasisPct: assumptions.taxableBasisPct ?? 70,
      taxableYieldPct: assumptions.taxableYieldPct ?? 0,
      taxableYieldOrdinaryPct: assumptions.taxableYieldOrdinaryPct ?? 50,
      useJointRmdTable: assumptions.useJointRmdTable || false,
      withdrawalStrategy: assumptions.withdrawalStrategy,
      withdrawalStrategyMigratedFrom: assumptions.withdrawalStrategyMigratedFrom ?? null,
      withdrawalBracketTarget: assumptions.withdrawalBracketTarget || "22",
      irmaaGuard: assumptions.irmaaGuard || false,
      rothEmergencyReserve: assumptions.rothEmergencyReserve || 0,
      ruleOf55: assumptions.ruleOf55 || false,
      sepp72t: assumptions.sepp72t || false,
      sepp72tStartAge: assumptions.sepp72tStartAge ?? null,
      ssTorpedoGuard: assumptions.ssTorpedoGuard || false,
      orderingMode: assumptions.orderingMode || "tax_reactive",
      withdrawalOrder: assumptions.withdrawalOrder || ["cash", "taxable", "pretax", "roth"],
      b1Years: assumptions.b1Years ?? 2,
      b2Years: assumptions.b2Years ?? 5,
      fixedWithdrawalRate: (() => { const r = assumptions.fixedWithdrawalRate || 4.0; return r < 1 ? r : r / 100; })(),
      vpwRealReturn: assumptions.vpwRealReturn ?? null,
      vpwEndAge: assumptions.vpwEndAge ?? null,
      safeWithdrawalRate: 0.04,
      checkpoints: assumptions.checkpoints || [],
      earlyRetireTarget: assumptions.earlyRetireTarget,
      portfolioGoal: assumptions.portfolioGoal,
      abEndYear: assumptions.abEndYear ?? null,
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
        assumptions.mortRate ?? 6.5,
        assumptions.mortStart || "2020-01",
        assumptions.mortTerm || 30,
        assumptions.mortExtra || 0
      ),
    [assumptions.mortBalance, assumptions.mortRate, assumptions.mortStart, assumptions.mortTerm, assumptions.mortExtra]
  );

const mortgagePayoffYear = mortgageSched.payoffYr;

  const paramsRef = useRef(params);
  paramsRef.current = params;

  const runSimulation = useCallback(() => {
    track("mc_run");
    runningRef.current = true;
    ranSigRef.current = sigRef.current;
    setRunning(true);
    setStale(false);
    setTimeout(() => {
      const p = paramsRef.current;
      ranSigRef.current = sigRef.current;
      const planAge = p.endAge || 90;
      const paths = Math.max(MC_PATH_MIN, Math.min(MC_PATH_MAX, Math.round(p.mcPaths || MC_PATHS)));
      const rEnd_ = runMC(p, planAge, paths, 43, true);
      const str = runStress(p, planAge, STRESS_PATHS, 99);
      setMc(rEnd_);
      setStress(str);
      saveResultsToLocal(sigRef.current, rEnd_, str);
      setLastRunAt(new Date().toISOString());
      runningRef.current = false;
      setRunning(false);
    }, 0);
  }, []);

  const paramsSig = useMemo(() => {
    try { return JSON.stringify(params); } catch { return String(Date.now()); }
  }, [params]);
  sigRef.current = paramsSig;

  const noAccountMoney = Array.isArray(params.accounts) && params.accounts.length > 0
    && params.accounts.every((a) => !(a.balance > 0));

  useEffect(() => {
    if (showWelcome) return;

    if (ranSigRef.current === null) {
      if (!pendingRunRef.current && !noAccountMoney) runSimulation();
      return;
    }

    if (runningRef.current) return;

    setStale(paramsSig !== ranSigRef.current);
  }, [paramsSig, runSimulation, showWelcome, noAccountMoney]);

  const yearEndInfo = useMemo(() => {
    const now = new Date();
    let forced = false;
    try { forced = new URLSearchParams(window.location.search).get("yearend") === "1"; } catch { }
    if (!forced && !isYearEndWindow(now)) return { show: false };
    const year = now.getFullYear();
    let rows = [];
    try { rows = waterfallForActiveStrategy(params)?.smart?.rows || []; } catch { rows = []; }
    return {
      show: true,
      year,
      days: daysLeftInTaxYear(now),
      room: yearEndTaxRoom(rows, {
        year,
        bracketCeiling: getBracketCeiling,
        irmaaCeiling: getIrmaaCeiling,
        filingStatus: params.filingStatus || "mfj",
        target: params.rothConversionTarget && params.rothConversionTarget !== "off"
          ? params.rothConversionTarget
          : (params.withdrawalBracketTarget && params.withdrawalBracketTarget !== "off"
              ? params.withdrawalBracketTarget
              : "22"),
      }),
    };
  }, [params]);
  const [showYearEndModal, setShowYearEndModal] = useState(() => {
    let forced = false;
    try { forced = new URLSearchParams(window.location.search).get("yearend") === "1"; } catch { }
    if (forced) return true;
    return isYearEndWindow() && !yearEndAcked(new Date().getFullYear());
  });

 const swr = computeInitialWR(params).steadyWRpct.toFixed(1);
 const analogue = mc ? getAnalogue(mc.rate) : null;

  const TABS = [
    ["networth", "Net Worth"],
    ["montecarlo", "Forecast"],
    ["scenarios", "Analysis"],
    ["actionplan", "Action Plan"],
    ["assumptions", "Plan inputs"],
  ];

  const needsMC = ["montecarlo", "networth"];
  const hasMC = !!mc;

  const handleSendFeedback = () => {
    if (!feedbackType) {
      alert("Please select a feedback type.");
      return;
    }
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

  useEffect(() => {
    if (pendingRunRef.current) {
      pendingRunRef.current = false;
      runSimulation();
    }
  }, [paramsSig, runSimulation]);

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
      updateAssumption("dobIsEstimate", true);
      const landingAge = landingIsRetired(inp) ? null : landingEarliestAge(inp);
      if (landingAge != null) { setRetAge(landingAge); updateAssumption("retireAge", landingAge); }
      setStale(true);
      pendingRunRef.current = true;
      setFromLanding(true);
    }
    dismissWelcome();
    setTab(inp ? "networth" : "assumptions");
  };

  if (showWelcome) {
    return (
      <>
        <style>{CSS}</style>
        <RetirementLanding onEnter={enterFromLanding} savedPlan={hasSavedPlan}
          onContinue={() => { dismissWelcome(); setTab("networth"); }} />
      </>
    );
  }

  return (
    <NavContext.Provider value={navigateToTab}><LeverContext.Provider value={focusLever}>
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="hdr">
          <div>
            <h1 className="logo">
              AiRA <span className="logo-sub">Freedom Financial</span>
            </h1>
            <div style={{ fontSize: "var(--fs-label)", color: "var(--text-faint)" }}>
              A DIY retirement forecaster · v{APP_VERSION}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <button
              className="mbtn"
              disabled={!mc}
              title={mc ? "Generate a printable CFP/CPA-ready report" : "Run Monte Carlo first"}
              onClick={() => setShowReport(true)}
            >
              Report
            </button>
            <button
              className="mbtn"
              title={mc
                ? "Snapshot today's plan (success rate, portfolio, spending) to your Progress journal and open it (Analysis → Progress)"
                : "Run Monte Carlo first — a check-in snapshots your current success rate"}
              onClick={() => { handleSaveCheckIn(); navigateToTab("scenarios", "progress"); }}
              disabled={!mc}
              style={!mc ? { opacity: 0.45, cursor: "default" } : checkInFlash ? { color: "var(--accent-teal)" } : undefined}
            >
              {checkInFlash ? "Saved!" : "Check-in"}
            </button>
            <button
              className="mbtn"
              title="Export profile to JSON"
              onClick={() =>
                exportProfile(
                  {
                    ...assumptions,
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
                    checkIns,
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
              Export
            </button>
            <button
              className="mbtn"
              title="Import profile from JSON"
              onClick={() =>
                importProfile((rawData) => {
                  const data = migrateOrderingMode(migrateWithdrawalStrategy(rawData));
                  if (Array.isArray(data.checkIns)) handleImportCheckIns(data.checkIns);
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
                  if (!Array.isArray(data.carveouts)) data.carveouts = [];
                  if (!Array.isArray(data.otherIncomes)) data.otherIncomes = [];
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

                  if (data.otherInc && !data.otherIncomes) {
                    data.otherIncomes = data.otherInc;
                  }
                  if (!Array.isArray(data.otherIncomes)) {
                    data.otherIncomes = [];
                  }

                  const hasPropIncome = (data.properties || []).some(pr => Number(pr.income) > 0);
                  const rawRct = data.rothConversionTarget || "off";
                  const restoredRct = /^\d+$/.test(rawRct) ? "fill_" + rawRct : rawRct;
                  setAssumptions((prev) => ({
                    ...prev,
                    ...data,
                    name: data.name || "",
                    dob: data.dob || "",
                    dobIsEstimate: !!data.dobIsEstimate,
                    stateOfResidence: data.stateOfResidence || "NJ",
                    filingStatus: data.filingStatus || "mfj",
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
                    geminiApiKey: prev.geminiApiKey || "",
                  }));

                  setStale(true);
                  dismissWelcome();
                  setTab("networth");
                  alert(`Profile loaded${data.name ? ` for ${data.name}` : ""}. Press ▶ Run Monte Carlo to update.`);
                })
              }
            >
              Import
            </button>
            <div aria-hidden="true" style={{ width: 1, height: 20, background: "var(--tint-white-14)", margin: "0 5px" }} />
            <HelpButton />
            <AboutButton />
            <div style={{ position: "relative", display: "inline-flex" }}>
              <button
                className="mbtn"
                onClick={() => setShowFeedback((prev) => !prev)}
                title="Send feedback"
              >
                Feedback
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
                    boxShadow: "0 8px 32px var(--tint-black-50)",
                  }}
                >
                  <div style={{ fontSize: "var(--fs-label)", color: "var(--text-primary)", fontWeight: 600, marginBottom: 10 }}>
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
                          border: feedbackType === fb.type ? "1px solid #9a9cff" : "1px solid var(--tint-white-08)",
                          background: feedbackType === fb.type ? "rgba(167,139,250,0.15)" : "var(--card-bg)",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ fontSize: "var(--fs-h2)" }}>{fb.emoji}</div>
                        <div style={{ fontSize: "var(--fs-small)", color: feedbackType === fb.type ? "var(--accent-purple)" : "var(--text-muted)", marginTop: 2 }}>
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
                      color: "var(--text-primary)",
                      borderRadius: 6,
                      padding: "8px 10px",
                      fontSize: "var(--fs-small)",
                      fontFamily: "'DM Sans',sans-serif",
                      resize: "vertical",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent-purple)")}
                    onBlur={(e) => (e.target.style.borderColor = "#1e3a5f")}
                  />
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
                          color: "var(--text-primary)", borderRadius: 6, padding: "6px 8px",
                          fontSize: "var(--fs-small)", fontFamily: "'DM Sans',sans-serif", outline: "none",
                        }}
                        onFocus={e => e.target.style.borderColor = "var(--accent-purple)"}
                        onBlur={e => e.target.style.borderColor = "#1e3a5f"}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                    Opens your email app. Or write to{" "}
                    <span style={{ color: "var(--accent-purple)", fontFamily: "'JetBrains Mono',monospace", userSelect: "all" }}>
                      {FEEDBACK_EMAIL}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <button
                      onClick={() => setShowFeedback(false)}
                      style={{ background: "transparent", border: "none", color: "var(--text-faint)", fontSize: "var(--fs-small)", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendFeedback}
                      style={{
                        padding: "5px 16px",
                        borderRadius: 6,
                        border: "none",
                        background: "linear-gradient(135deg,#7c3aed,#9a9cff)",
                        color: "white",
                        fontSize: "var(--fs-small)",
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
              href={aboutLink("Buy me a coffee")}
              target="_blank"
              rel="noopener noreferrer"
              className="coffee-btn"
              title="Support the app — buy me a coffee"
            >
              Buy me a coffee
            </a>
          </div>
        </div>

        <div className="layout">
          <div className="sidebar">
            <button type="button" className="cfg-btn cfg-launch" onClick={() => openPlanInputs()}
              aria-current={activeTab === "assumptions" ? "page" : undefined}>
              {activeTab === "assumptions" ? "Editing plan inputs" : `${profileSavedBefore ? "Adjust values" : "Configure your plan"} →`}
            </button>

            <div className="sb-card">
              <div className="sb-title" {...twisty(sbCoreOpen, () => setSbCoreOpen(v => !v))}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span>{sbCoreOpen ? "▾" : "▸"} Plan basics</span>
              </div>
              {sbCoreOpen && (<>
              <Slider
                dataLever="retireAge"
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
                dataLever="endAge"
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
                dataLever="sp"
                label="US annual spend"
                value={sp}
                min={0}
                max={300000}
                step={1000}
                stepNudge={5000}
                format={(v) => fmtDollar(v) + "/yr"}
                onChange={setSp}
              />
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
                dataLever="ssAge"
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
              </>)}
            </div>
            {fromLanding && (() => {
              const funded = (assumptions.accounts || []).filter((a) => (a.balance || 0) > 0);
              const items = [
                assumptions.dobIsEstimate && [`Born mid-${String(assumptions.dob || "").slice(0, 4)}`, () => openPlanInputs(0)],
                funded.length === 1 && [`All ${fmtDollar(port)} in one ${ACCOUNT_CATEGORIES.find((c) => c.key === funded[0].category)?.label || "account"} account`, () => openPlanInputs(PROFILE_STEP_SAVINGS)],
                ssb === BLANK_PROFILE.ssb && [`Social Security of ${fmtDollar(ssb)}/yr from age ${assumptions.ssAge}`, () => openPlanInputs(PROFILE_STEP_MONEY_IN)],
                retAge === BLANK_PROFILE.retireAge && [`Retiring at ${retAge}, planning to age ${endAge}`, () => focusLever("retireAge")],
              ].filter(Boolean);
              if (!items.length) return null;
              return (
                <div className="sb-card" data-testid="we-assumed">
                  <div className="sb-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>We assumed</span>
                    <button type="button" className="sb-edit" style={{ textTransform: "none", letterSpacing: 0 }} onClick={() => setFromLanding(false)}>Hide</button>
                  </div>
                  <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 8 }}>
                    The quick estimate was a rule of thumb. These results come from the full simulation, using your four answers plus the assumptions below. Change any that are wrong.
                  </div>
                  {items.map(([text, go]) => (
                    <button key={text} type="button" className="assume-row" onClick={go}>
                      <span>{text}</span><span aria-hidden="true">Change</span>
                    </button>
                  ))}
                </div>
              );
            })()}
            <div className="sb-card">
              <CountdownCard
                dob={assumptions.dob}
                retireAge={retAge}
                dobIsEstimate={!!assumptions.dobIsEstimate}
                employerStartDate={assumptions.employerStartDate}
                name={assumptions.name}
                onConfigure={() => openPlanInputs(0)}
              />
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid var(--tint-white-06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>Liquid Portfolio{" "}
                  <button type="button" className="sb-edit" onClick={() => openPlanInputs(PROFILE_STEP_SAVINGS)} aria-label="Edit accounts and balances">Edit accounts</button>
                </span>
                <span style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--accent-teal)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "-0.5px" }}>
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
                    <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>Net Worth <span style={{ color: "var(--text-faint)" }}>(+RE equity)</span></span>
                    <span style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--accent-purple)", fontFamily: "'JetBrains Mono',monospace" }}>
                      {fmtDollar(netWorth)}
                    </span>
                  </div>
                );
              })()}
              <AllocationDonut accounts={assumptions.accounts} onEdit={() => openPlanInputs(PROFILE_STEP_SAVINGS)} />
              <div style={{ textAlign: "right", marginTop: 4 }}>
                <button type="button" className="sb-edit" onClick={() => openPlanInputs(PROFILE_STEP_SAVINGS)} aria-label="Edit account split">Edit split</button>
              </div>
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
                  <span style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", letterSpacing: "0.04em", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                    Engine &amp; assumptions · v{APP_VERSION}
                  </span>
                }
              >
                <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)", lineHeight: 1.9 }}>
                  <div>
                    <span style={{ color: "var(--accent-teal)" }}>Equity:</span> {SAMPLE_YEARS}yr S&amp;P bootstrap [-30 / +30%]
                  </div>
                  <div>
                    <span style={{ color: "var(--accent-purple)" }}>Bonds:</span> {SAMPLE_YEARS}yr bond history [-15 / +20%]
                  </div>
                  <div>
                    <span style={{ color: "var(--accent-gold)" }}>{getStrategyLabel(assumptions.withdrawalStrategy)}</span>{" "}
                    {(() => {
                      const s = resolveStrategy(assumptions.withdrawalStrategy);
                      if (s === "gk") return `Floor: ${fmtDollar(params.gkFloor)} · Ceiling ${fmtDollar(params.gkCeiling)}`;
                      if (s === "fixed") return `Rate: ${((params.fixedWithdrawalRate || 0.04) * 100).toFixed(1)}%`;
                      if (s === "vpw") return `Amortized to age ${params.vpwEndAge ?? params.endAge ?? 100} at ${((params.vpwRealReturn ?? 0.0376) * 100).toFixed(2)}% real`;
                      return "";
                    })()}
                  </div>
                  <div>
                    <span style={{ color: "#059669" }}>Rental:</span> {assumptions.abReliability || 80}% reliability per year
                  </div>
                  <div>
                    <span style={{ color: "var(--chart-1)" }}>Healthcare:</span> {assumptions.hcProb || 3.5}% shock risk age {assumptions.hcShockAge || 72}+
                  </div>
                  {(() => {
                    const evs  = (params.cashFlowEvents || []).filter((e) => Number.isFinite(Number(e.year)) && (Number(e.amount) || 0) !== 0);
                    if (evs.length === 0) return null;
                    const sum  = (list) => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
                    const ins  = evs.filter((e) => e.direction === "in");
                    const outs = evs.filter((e) => e.direction !== "in");
                    return (
                      <div>
                        <span style={{ color: "var(--accent-gold)" }}>One-off events:</span>{" "}
                        {ins.length > 0 && `${ins.length} in +${fmtDollar(sum(ins))}`}
                        {ins.length > 0 && outs.length > 0 && " · "}
                        {outs.length > 0 && `${outs.length} out −${fmtDollar(sum(outs))}`}
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "var(--accent-teal)" }}>Phase 1 ({assumptions.preRetireEq ?? 91}/{100 - (assumptions.preRetireEq ?? 91)}):</span> {expectedReturn(assumptions.preRetireEq ?? 91).toFixed(2)}% μ
                    <Hint
                      text={`Pre‑retirement expected return. "μ" (mu) is the mean annual return of a ${assumptions.preRetireEq ?? 91}% stocks / ${100 - (assumptions.preRetireEq ?? 91)}% bonds mix — the weighted average of the S&P 500 and bond history the engine bootstraps from. Individual simulated years vary widely around this average; it is not a guaranteed rate.`}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "var(--chart-3)" }}>Phase 2 ({assumptions.postRetireEq ?? 70}/{100 - (assumptions.postRetireEq ?? 70)}):</span> {expectedReturn(assumptions.postRetireEq ?? 70).toFixed(2)}% μ
                    <Hint
                      text={`Post‑retirement expected return. "μ" (mu) is the mean annual return of a ${assumptions.postRetireEq ?? 70}% stocks / ${100 - (assumptions.postRetireEq ?? 70)}% bonds mix. The lower equity weight vs. Phase 1 means less volatility and a slightly lower average return once you're drawing down.`}
                    />
                  </div>
                </div>
              </InfoModal>
            </div>

            <div className="sb-card">
              <div className="sb-title" {...twisty(sbMacroOpen, () => setSbMacroOpen(v => !v))}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span>{sbMacroOpen ? "▾" : "▸"} Market assumptions</span>
              </div>
              {sbMacroOpen && (<>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "7px 10px", fontSize: "var(--fs-label)", marginBottom: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>Inflation (CPI)</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{Number(assumptions.inf ?? inf ?? 2.5).toFixed(1)}%/yr</span>
                <span style={{ color: "var(--text-muted)" }}>Equity glide</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                  {assumptions.preRetireEq ?? 91}% → {assumptions.postRetireEq ?? 70}%
                  <span style={{ color: "var(--text-faint)" }}> @{assumptions.glidepathSwitchAge ?? assumptions.retireAge ?? "—"}</span>
                </span>
                <span style={{ color: "var(--text-muted)" }}>SS COLA / yr</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{Number(assumptions.ssCola ?? 2.4).toFixed(1)}%</span>
                <span style={{ color: "var(--text-muted)" }}>Cash return</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{Number(assumptions.cashRealReturn ?? 3.0).toFixed(1)}%</span>
                <span style={{ color: "var(--text-muted)" }}>Expected return</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                  {expectedReturn(assumptions.preRetireEq ?? 91).toFixed(1)}% → {expectedReturn(assumptions.postRetireEq ?? 70).toFixed(1)}%
                </span>
              </div>
              <PreRetireReturnField value={assumptions.preRetireReturn} onChange={(v) => updateAssumption("preRetireReturn", v)} />
              <MCAdvancedSettings p={assumptions} onAssumptionChange={updateAssumption} />
              </>)}
            </div>

            <div className="sb-card">
              <div className="sb-title" {...twisty(sbOptionsOpen, () => setSbOptionsOpen(v => !v))} style={{ cursor: "pointer" }}>
                {sbOptionsOpen ? "▾" : "▸"} Options
              </div>
              {sbOptionsOpen && (<>
              <Toggle
                val={smile} onChange={setSmile}
                label="Reduce spending with age"
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

              <Toggle
                val={tax} onChange={setTax} label="Model taxes" infoAccent={INFO_ACCENT.tax}
                hint={<>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"var(--text-primary)" }}>What it does:</strong> When ON, every year's withdrawal is grossed up by a full tax calculation so the <em>after-tax</em> amount you keep matches your spending target. Without it, the engine would draw exactly your spend number and silently underfund you by whatever taxes are owed.</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"var(--text-primary)" }}>What's modeled each year:</strong> federal brackets with the standard deduction, the Social Security tax torpedo (provisional-income inclusion), IRMAA Medicare surcharges, and your state's brackets (skipped when Non-resident is on). Tax rises naturally over retirement as Social Security starts and RMDs force pre-tax draws.</p>
                    <p style={{ margin:"0 0 10px" }}>Single filers owe more than MFJ at the same income because of halved brackets and standard deduction.</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"var(--text-primary)" }}>ON (default):</strong> Full tax model applied. The same calculation drives the Monte Carlo, the Stress Test, and the year-by-year table — no pivot reads differently.</p>
                    <p style={{ margin:0 }}><strong style={{ color:"var(--text-primary)" }}>OFF:</strong> Pure pre-tax view — <em>all</em> tax (federal, state, IRMAA, Roth-conversion cost) is zeroed everywhere. Useful for sanity-checking portfolio dynamics without tax noise, but it overstates how long your money lasts.</p>
                </>}
              />
              <Toggle
                val={real} onChange={setReal} label="Show in today's dollars"
                hint={"OFF = future dollars: the actual balance you'd see on a statement that year, inflation included. $3M at 85 sounds like a lot, but decades of inflation are baked into it.\n\nON = today's dollars: the same money re-expressed in what it would buy right now, so you can judge it against prices you know.\n\n(Economists call these 'nominal' and 'real' — same thing, plainer name.)\n\nOne limit: the chart starts at your retirement year, so 'today' means retirement-year purchasing power. Inflation between now and retirement is not removed. If you are already retired, that is the same as today."}
              />
              <Toggle
                val={!!assumptions.twoHousehold} onChange={(v) => updateAssumption("twoHousehold", v)}
                label="Skip state tax (non-resident)" infoAccent={INFO_ACCENT.tax}
                hint={<>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"var(--text-primary)" }}>What it does:</strong> Removes state income tax from every year of the simulation. Use this if you (or you and your spouse) qualify as a non-resident of your listed state for the year.</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"var(--text-primary)" }}>OFF (default):</strong> State tax applies to all taxable income. Use this if you're a resident of your listed state.</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"var(--text-primary)" }}>ON:</strong> State tax zeroed out. Use this if you've broken residency (e.g. spending most of the year abroad and meeting your state's non-residency rules).</p>
                    <p style={{ margin:"0 0 10px" }}><strong style={{ color:"var(--text-primary)" }}>Spending is independent:</strong> Total portfolio draw = US Spending + Out-of-Country Spending regardless of this toggle. The toggle only changes whether the US-domestic portion is state-taxed. Check your state's non-residency rules before turning this on — every state defines it differently (number of days, place of work, family location, etc.).</p>
                    <p style={{ margin:0 }}><strong style={{ color:"var(--text-primary)" }}>Set it up:</strong> Set <em>US annual spend</em> in the sidebar for your at-home budget, and <em>Out-of-Country Spending</em> in Plan inputs → Spending &amp; Expenses for your travel/abroad budget. If Out-of-Country Spending is left at $0, it falls back to your US spending.</p>
                </>}
              />
              </>)}
            </div>

            <button
              className="run-btn"
              onClick={runSimulation}
              disabled={running}
              style={{
                background: stale ? "linear-gradient(135deg,#3d6fe0,var(--chart-2))" : undefined,
              }}
            >
              {running ? `Running ${Math.round(Number(params?.mcPaths) || MC_PATHS).toLocaleString()} paths...` : stale ? "Inputs changed — Re-run" : "▶ Run Monte Carlo"}
            </button>
            {lastRunAt && !running && (
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", textAlign: "center", marginTop: 5 }}>
                Last run {fmtLastRun(lastRunAt)}
              </div>
            )}
          </div>

          <main className="main">

            {stale && (
              <div
                style={{
                  background: "var(--bg-warning)",
                  border: "1px solid rgba(244,211,94,0.4)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: "var(--fs-label)",
                  color: "var(--accent-gold)",
                }}
              >
                Inputs changed — success rates below are stale. Press Re-run to update.
              </div>
            )}

            {(() => {
              const heroColor = mc ? (mc.rate >= 0.85 ? "var(--positive)" : mc.rate >= 0.7 ? "var(--accent-gold)" : "var(--negative)") : "#334155";
              const sep = <span style={{ color: "var(--text-faint)" }}>·</span>;
              if (!mc && noAccountMoney) return (
                <div className="met">
                  <div style={{ fontSize: "var(--fs-h1)", fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Add Your Accounts to See Your Result</div>
                  <div style={{ fontSize: "var(--fs-body)", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
                    This plan has no account balances yet, so there is nothing to simulate. Enter what you hold in each account, then press Run Monte Carlo.
                  </div>
                  <button className="mbtn" onClick={() => navigateToTab("assumptions")}>Add Your Accounts</button>
                </div>
              );
              return (
                <div className={`met ${running ? "recomputing" : ""}`} style={{ borderLeft: `4px solid ${heroColor}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <div className="mv" style={{ fontSize: 44, color: heroColor }}>
                        {mc ? fmtPct(mc.rate) : "—"}
                      </div>
                      <div style={{ fontSize: "var(--fs-h2)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                        Success to Age {endAge}
                        <SimMethodModal
                          params={params}
                          withdrawalStrategy={withdrawalStrategy}
                          trigger={
                            <span
                              role="img"
                              aria-label="How this simulation works"
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "var(--card-border)", color: "var(--text-secondary)", cursor: "pointer" }}
                            >
                              <InfoIcon size={12} />
                            </span>
                          }
                        />
                      </div>
                    </div>
                    {mc && (
                      <span style={{ marginLeft: "auto" }}>
                        <InfoModal
                          title={`${fmtPct(mc.rate)} Success to Age ${endAge}`}
                          accent={heroColor}
                          trigger={
                            <span style={{ color: "var(--accent-teal)", fontSize: "var(--fs-body)", fontFamily: "inherit", padding: "4px 6px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              What does this mean? ▾
                            </span>
                          }
                        >
                          {(() => {
                            const success = Math.round(mc.rate * 26);
                            const fail = 26 - success;
                            return (
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 8 }}>
                                  If 26 people had your exact plan — age {endAge} horizon
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
                                  {Array.from({ length: 26 }, (_, i) => (
                                    <div
                                      key={i}
                                      style={{
                                        width: 12, height: 12, borderRadius: "50%",
                                        background: i < success ? "var(--positive)" : "var(--negative)",
                                        opacity: i < success ? 1 : 0.4,
                                      }}
                                      title={i < success ? "Survives" : "Depleted"}
                                    />
                                  ))}
                                </div>
                                <div style={{ fontSize: "var(--fs-label)", color: "var(--text-secondary)" }}>
                                  <span style={{ color: "var(--positive)", fontWeight: 700 }}>{success}</span> make it to {endAge}.{" "}
                                  {fail > 0 && (
                                    <><span style={{ color: "var(--negative)", fontWeight: 700 }}>{fail}</span> run out.</>
                                  )}
                                  {fail === 0 && <span style={{ color: "var(--positive)" }}> Everyone makes it.</span>}
                                </div>
                                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", fontStyle: "italic", marginTop: 6 }}>
                                  “100% doesn't exist — room for error IS the plan.” — Morgan Housel
                                </div>
                              </div>
                            );
                          })()}
                          {analogue && (
                            <div style={{ borderTop: "1px solid var(--tint-white-08)", paddingTop: 12 }}>
                              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 6 }}>Put another way</div>
                              <RotatingAnalogue rate={mc.rate} endAge={endAge} />
                            </div>
                          )}
                        </InfoModal>
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "var(--fs-body)", color: "var(--text-muted)", marginTop: 11, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                    <span title="Median projected portfolio value left at your plan age, across all simulated paths.">
                      <strong style={{ color: "var(--text-secondary)" }}>{mc ? fmtDollar(selectPortfolioAtAge(mc, endAge, { retireAge: retAge, real, inf }) ?? 0) : "—"}</strong> at age {endAge} <span style={{ fontSize: "var(--fs-label)", opacity: 0.75 }}>({dollarBasisLabel(real, retirementBasisYear(params.currentAge, retAge, CURRENT_YEAR)).toLowerCase()})</span>
                    </span>
                    {sep}
                    <span title="Your spending target — the figure you entered, shown monthly. This is money to spend AFTER tax: the engine withdraws enough extra from the portfolio to cover the tax bill on top of this amount, so taxes are not taken out of it. Covered by Social Security, rental and other income first, then your portfolio draw. The success rate on the left is what tells you whether this target holds.">
                      <strong style={{ color: "var(--accent)" }}>${(Math.round(params.sp / 12)).toLocaleString()}/mo</strong> your spend target <span style={{ fontSize: "var(--fs-label)", opacity: 0.75 }}>(after tax)</span>
                    </span>
                  </div>
                  {analogue && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, marginTop: 10 }}>
                      <span style={{ fontSize: "var(--fs-small)", fontWeight: 700, color: "var(--text-muted)" }}>Current life phase</span>
                      <SectorBadge age={currentAge} />
                    </div>
                  )}
                </div>
              );
            })()}

            <VerdictHeader
              mc={mc}
              real={real}
              inf={inf}
              endAge={params.endAge}
              currentAge={params.currentAge}
              retireAge={params.retireAge}
              swr={swr}
              stress={stress}
              swrBenchmark={params.safeWithdrawalRate}
              pinnedConversions={(params.conversionOverrides || []).length}
            />

            <nav className="tabs" aria-label="Sections" ref={tabsRef}>
              {TABS.map(([k, l]) => (
                <button key={k} className={`tab ${activeTab === k ? "on" : ""}`} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </nav>
            <h2 className="sr-only">{TABS.find(([k]) => k === activeTab)?.[1]}</h2>

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
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", borderBottom: "1px solid var(--divider)", marginBottom: 12 }}>
                    <div role="tablist" aria-label="Monte Carlo views" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {[["simulation", "Simulation"], ["guardrails", "Guardrails"]].map(([k, label]) => {
                        const on = mcView === k;
                        return (
                          <button
                            key={k}
                            role="tab"
                            aria-selected={on}
                            onClick={() => setMcView(k)}
                            style={{
                              background: "transparent",
                              border: "none",
                              borderBottom: `2px solid ${on ? "var(--accent-teal)" : "transparent"}`,
                              marginBottom: -1,
                              padding: "8px 20px",
                              fontSize: "var(--fs-label)",
                              fontWeight: on ? 800 : 600,
                              color: on ? "var(--accent-teal)" : "var(--text-muted)",
                              fontFamily: "var(--font-sans)",
                              letterSpacing: "-0.01em",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              transition: "color 0.15s, border-color 0.15s",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px 14px", flexWrap: "wrap", padding: "4px 0", fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
                        <span>
                          {(() => {
                            const paths = Math.max(MC_PATH_MIN, Math.min(MC_PATH_MAX, Math.round(Number(params?.mcPaths) || MC_PATHS)));
                            const r = resolveSampleRange(params);
                            const yrs = r ? `${SAMPLE_START_YEAR + r.start}–${SAMPLE_START_YEAR + r.start + r.count - 1}` : `${SAMPLE_START_YEAR}–${SAMPLE_END_YEAR}`;
                            return `${paths.toLocaleString()} paths · sampling ${yrs}`;
                          })()}
                        </span>
                        <SimMethodModal
                          params={params}
                          withdrawalStrategy={assumptions.withdrawalStrategy}
                          trigger={<span aria-label="How this simulation works" style={{ color: "var(--chart-2)", cursor: "pointer", fontSize: "var(--fs-small)", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px dashed rgba(96,165,250,0.45)", display: "inline-flex", alignItems: "center", gap: 4 }}><InfoIcon size={12} /> How this works</span>}
                        />
                        <MCAdvancedSettings p={params} onAssumptionChange={updateAssumption} />
                      </div>
                    </div>

                    {mcView === "simulation" ? (
                    <>
                    <MCTab
                      params={params}
                      mc={mc}
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
                      inf={inf}
                      real={real}
                      withdrawalStrategy={assumptions.withdrawalStrategy}
                      onAssumptionChange={updateAssumption}
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
                      }}
                      chart={mc && (
                      <FanChart
                        // eslint-disable-next-line no-restricted-properties -- FanChart deflates the whole array itself; see noRawMcAccess.test.js.
                        pcts={mc.pcts}
                        retireAge={retAge}
                        ssAge={assumptions.ssAge}
                        rmdAge={rmdAge}
                        inf={inf}
                        useReal={real}
                        checkpoints={assumptions.checkpoints}
                        earlyRetireTarget={assumptions.earlyRetireTarget}
                        dob={assumptions.dob}
                        portfolioGoal={assumptions.portfolioGoal}
                        currentAge={currentAge}
                        currentPort={params.port}
                        contrib={params.contrib}
                        hhProfile={params}
                        preRetireEq={params.preRetireEq ?? 91}
                        hoveredAge={hoveredAge}
                        table={(
                      <MCBandTable
                        embedded
                        // eslint-disable-next-line no-restricted-properties -- FanChart deflates the whole array itself; see noRawMcAccess.test.js.
                        pcts={mc.pcts}
                        inf={inf}
                        useReal={real}
                        ssAge={assumptions.ssAge}
                        rmdAge={rmdAge}
                        currentAge={currentAge}
                        endAge={endAge}
                        hoveredAge={hoveredAge}
                        onHoverAge={setHoveredAge}
                        totalPaths={mc.N}
                        retireAge={effectiveRetireAge(params.retireAge, params.currentAge)}
                      />
                        )}
                      />
                      )}
                    />
                    </>
                    ) : (
                      <div className="chart-card">
                        <div className="ct">Guardrails — how your spending flexes over time</div>
                        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 4 }}>
                          Your withdrawal strategy raises or cuts spending as markets move, keeping the plan funded.
                          The dashed bands are your spending floor and ceiling; ▲/▼ mark the years an adjustment fired.
                        </div>
                        {isGuardrailStrategy(assumptions.withdrawalStrategy) ? (
                          <GuardrailsView p={params} inf={inf} withdrawalStrategy={assumptions.withdrawalStrategy} mc={mc} topRule={false} />
                        ) : (
                          <div style={{ fontSize: "var(--fs-label)", color: "var(--text-muted)", lineHeight: 1.6, padding: "10px 2px" }}>
                            Your current spending strategy doesn’t use Guyton–Klinger guardrails, so there is nothing to
                            flex here. Switch to a guardrail-family strategy (Guyton–Klinger, Risk-based, Kitces, or Smart
                            Waterfall) in <strong style={{ color: "var(--text-secondary)" }}>Scenarios → Withdrawal Plan</strong> to
                            see the spending path, its floor and ceiling, and every year an adjustment fired.
                          </div>
                        )}
                      </div>
                    )}
                    {mc && <McTabDisclaimer />}
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
                {activeTab === "networth" && <NetWorthTab p={params} mc={mc} inf={inf} real={real} />}
                {activeTab === "actionplan" && (
                  <ActionPlanTab
                    params={params}
                    mc={mc}
                    assumptions={assumptions}
                    mortgagePayoffYear={mortgagePayoffYear}
                    rmdAge={rmdAge}
                  />
                )}
                {activeTab === "assumptions" && (
                  <>
                  <ProfileWizard
                    jumpTo={profileJump}
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
                  <div className="sb-card" style={{ marginTop: 16 }}>
                    <div className="sb-title">Start over</div>
                    {!confirmStartOver ? (
                      <button type="button" className="sb-edit" style={{ fontSize: "var(--fs-label)" }} onClick={() => setConfirmStartOver(true)}>
                        Reset to the quick-start screen…
                      </button>
                    ) : (
                      <div role="alertdialog" aria-label="Confirm start over" style={{ fontSize: 12, lineHeight: 1.6 }}>
                        This deletes your saved plan and returns to the quick-start screen. Export your profile first if you want to keep it.
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button type="button" className="cfg-btn" style={{ margin: 0 }} onClick={() => setConfirmStartOver(false)}>Cancel</button>
                          <button type="button" className="cfg-btn" style={{ margin: 0, background: "var(--chart-1)" }}
                            onClick={() => { skipAutosave.current = true; resetLocalProfile(); window.location.reload(); }}>
                            Delete and start over
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  </>
                )}
              </>
            )}

            <div
              style={{
                fontSize: "var(--fs-small)",
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
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontSize: "var(--fs-small)",
                  textDecoration: "underline",
                  padding: "2px 0",
                }}
              >
                Terms of Service &amp; Disclaimer
              </button>
            </div>
          </main>
        </div>
      </div>

      <AdminPanel />

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
          background: stripeToast.tone === "err"
            ? "rgba(220,38,38,0.97)"
            : stripeToast.tone === "warn"
              ? "rgba(244,211,94,0.97)"
              : "rgba(79,216,143,0.95)",
          color: "white",
          borderRadius: 8, padding: "10px 20px", fontSize: "var(--fs-body)", fontWeight: 600,
          boxShadow: "0 4px 16px var(--tint-black-40)", zIndex: 99999,
          pointerEvents: stripeToast.tone === "warn" ? "auto" : "none",
          maxWidth: "min(92vw, 560px)", textAlign: "center",
          lineHeight: 1.45,
        }}>
          {stripeToast.msg}
        </div>
      )}

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
              <h2 style={{ margin: 0, fontSize: "var(--fs-h1)", fontWeight: 700, color: "#1e3a5f" }}>Terms of Service</h2>
              <button
                onClick={() => setShowTerms(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "var(--fs-h1)", lineHeight: 1, color: "var(--text-muted)", padding: "0 4px",
                }}
                aria-label="Close"
              >×</button>
            </div>
            <p style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: 0 }}>Last updated: February 22, 2026</p>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>1. Agreement to Terms</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                By accessing and using the AiRA Financial Freedom application, you accept and agree to be bound by the terms and
                provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>2. Disclaimer of Warranties</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                The AiRA Financial Freedom application is provided on an "AS IS" and "AS AVAILABLE" basis. AiRA Financial Freedom nor its Developers, make any
                representations or warranties of any kind, express or implied, as to the operation of the application or the
                information, content, or materials included on the application. To the fullest extent permissible by applicable
                law, AiRA  Financial Freedom and its Developers disclaim all warranties, express or implied, including but not limited to implied warranties
                of merchantability, fitness for a particular purpose, and non-infringement.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>3. Limitation of Liability</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                In no event shall the AiRA  Financial Freedom application, its directors, employees, agents, or suppliers be liable for any damages
                (including, without limitation, lost profits, savings, or data; business interruption; or any other special,
                indirect, incidental, or consequential damages) arising out of or in connection with the use, inability to use,
                or results of the use of the application, even if AiRA Financial Freedom and its Developers have been advised of the possibility of such damages.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#d97706", marginBottom: 6 }}>4. Not Financial Advice</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                The AiRA Financial Freedom application provides calculations and projections for <strong>educational and informational
                purposes only</strong>. The application does not provide professional investment, tax, or financial advice. All
                calculations are estimates based on the information you provide and are subject to change. You should not rely
                solely on the calculations provided by the AiRA Financial Freedom application for making financial decisions. Always consult with
                a qualified professionals such as a financial advisors, tax advisors, or mortgage professionals before making
                important financial decisions.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>5. Accuracy of Information</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                While we strive to ensure the accuracy of calculations, the AiRA Financial Freedom application makes no guarantee regarding the accuracy
                or completeness of the results. Market conditions, interest rates, inflation, and other factors may vary from
                the assumptions used in the calculator. Historical performance does not guarantee future results. All information displayed are dependent upon information that you provide and by using this 
                application you agree to not hold accountable the application nor it's developers for any financial decisions made based on the results of the calculator.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>6. User Responsibilities</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                You are responsible for ensuring that all information you input into the calculator is accurate and current.
                You are also responsible for protecting the confidentiality of your personal financial information.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>7. Modifications to Terms</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                The AiRA Financial Freedom application reserves the right to modify these terms and conditions at any time. Your continued use of the
                application following the posting of revised terms means that you accept and agree to the changes.
              </p>
            </section>

            <section style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>8. Governing Law</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                These terms and conditions are governed by and construed in accordance with the laws of the United States, and
                you irrevocably submit to the exclusive jurisdiction of the courts in that location.
              </p>
            </section>

            <section style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>9. Indemnification</h3>
              <p style={{ fontSize: "var(--fs-body)", lineHeight: 1.6, margin: 0 }}>
                You agree to indemnify and hold harmless the AiRA Financial Freedom application and its Developers from any and all claims, damages, losses, or expenses
                arising out of your use of the application or violation of these Terms of Service.
              </p>
            </section>

            <div style={{ textAlign: "center" }}>
              <button
                onClick={() => setShowTerms(false)}
                style={{
                  background: "#1e3a5f", color: "#fff", border: "none",
                  borderRadius: 6, padding: "8px 28px", fontSize: "var(--fs-body)",
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
          locked={ownerVerified ? false : (!reportCapable || (BILLING_ENABLED && !reportUnlocked))}
        />
      )}
      {showReport && mc && ownerVerified && (
        <div style={{
          position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)",
          zIndex: 20001, background: "rgba(124,58,237,0.95)", color: "#fff",
          borderRadius: 999, padding: "5px 16px", fontSize: "var(--fs-label)", fontWeight: 700,
          boxShadow: "0 4px 16px var(--tint-black-40)", pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>
          🔧 Owner preview — purchase prompt suppressed (admin secret verified)
        </div>
      )}
    </>
    </LeverContext.Provider></NavContext.Provider>
  );
}

export { runMC, runStress, mortgageSchedule, calcYearTax, getRmdStartAge, guytonKlingerWithdrawal, progTax, irmaaCost, simulateDeterministicWithStrategy, waterfallForActiveStrategy, getStandardDeduction, getIrmaaCeiling, getBracketCeiling, loadCheckIns, saveCheckIns, ProgressTab, planShapeScores, mergeCheckIns, ageFromDob, AGE_LIMITS, InfoIcon, InfoDot, mcMedianAtAge, selectPortfolioAtAge, deflate, ANumInput, parseNumericEntry, TaxDetailsModal, resolveSampleRange, MCAdvancedSettings, GK_BAND_PCT, GK_ADJUST_PCT, GK_LONGEVITY_YEARS, DeterministicWithdrawalView, SimMethodModal, MCBandTable, bandLabel, MCOverviewCards, VerdictHeader, NetWorthTip, PillTab, SequenceBuilder, FailedPathPanel };
