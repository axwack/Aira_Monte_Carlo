/**
 * buildWithdrawalWaterfall.js
 *
 * Tax-optimal withdrawal waterfall engine.
 * Runs two deterministic scenarios — "smart" (bracket-ceiling-capped pretax draws)
 * and "naive" (pretax first, no ceiling) — and returns per-year rows for both.
 *
 * Smart waterfall order per year:
 *   1. Fixed income (SS + annuity/rental)
 *   2. RMDs (forced from pretax)
 *   3. Cash / SGOV
 *   4. Taxable brokerage
 *   5. Pre-tax IRA/401k — STOP at withdrawalBracketTarget bracket ceiling
 *      (also capped at IRMAA tier-1 when irmaaGuard is enabled)
 *   6. Roth — last resort; rothEmergencyReserve floor is always maintained
 *   6.5 Roth conversion (smart scenario only) — a pinned conversionOverrides
 *      amount for this year, else fill remaining room to rothConversionTarget's
 *      bracket ceiling. Stacks on top of the Step-5 pretax draw as ordinary
 *      income for tax purposes (mirrors runMC's bracket-fill behavior).
 *   7. Tax calculation (ordinary income + conversion + IRMAA)
 *   8. Landmine detection (SS torpedo, IRMAA triggered, RMD active)
 */

import {
  progTax,
  idxB,
  irmaaCost,
  taxableSocialSecurity,
  computeHouseholdSS,
  getStateBrackets,
  getRmdStartAge,
  FED_BRACKETS_2026_MFJ,
  FED_BRACKETS_2026_SINGLE,
  LTCG_BRACKETS_2026_MFJ,
  LTCG_BRACKETS_2026_SINGLE,
  NIIT_THRESHOLD_MFJ,
  NIIT_THRESHOLD_SINGLE,
  NIIT_RATE,
  getSeniorBonusDeduction,
  RMD_DIV,
  JOINT_RMD_DIV,
} from "./buildRothExplorer.js";
import { mortgageSchedule, mortgageAnnualPayments, computeOtherIncome, computeCashFlowEvents, spendingSmileFactor, expectedHealthcareShock } from "./expenses.js";
import { scheduleSpendForYear } from "./expenseImport.js";
import { expectedReturn } from "./expectedReturn.js";
import { resolveGlidepathSwitchAge } from "./glidepath.js";

const BASE_YEAR = new Date().getFullYear();

// 2026 MFJ standard deduction base + age-65 bonus
const STD_DED_MFJ    = 32_200;
const STD_DED_SINGLE = 16_100;
const AGE_BONUS_MFJ    = 3_300;
const AGE_BONUS_SINGLE = 1_650;

// 2026 IRMAA Tier-1 MAGI ceiling, inflation-adjusted in engine
const IRMAA_TIER1_2026_MFJ    = 218_000;
const IRMAA_TIER1_2026_SINGLE = 109_000;

// Guyton-Klinger CPI pass-through cap (original GK paper). Must match
// App.jsx's GK_INFLATION_CAP exactly — kept as a separate named constant here
// since this engine does not import from App.jsx.
const GK_INFLATION_CAP = 0.06;

// Bracket ceilings as taxable income (post std-deduction), 2026, inflation-indexed
const BRACKET_CEILINGS_MFJ    = { "10": 24_800, "12": 100_800, "22": 211_400, "24": 403_550, "32": 512_450, "35": 768_700, "37": Infinity, "irmaa": 218_000 };
const BRACKET_CEILINGS_SINGLE = { "10": 12_400, "12": 50_400,  "22": 105_700, "24": 201_800, "32": 256_225, "35": 640_600, "37": Infinity, "irmaa": 109_000 };

function stdDed(age, isMFJ, inflFactor) {
  const base  = isMFJ ? STD_DED_MFJ    : STD_DED_SINGLE;
  const bonus = isMFJ ? AGE_BONUS_MFJ  : AGE_BONUS_SINGLE;
  return Math.round((base + (age >= 65 ? bonus : 0)) * inflFactor);
}

function bracketCeiling(target, isMFJ, inflFactor) {
  if (!target || target === "off") return Infinity;
  const tbl = isMFJ ? BRACKET_CEILINGS_MFJ : BRACKET_CEILINGS_SINGLE;
  const base = tbl[target] ?? tbl["22"];
  return base === Infinity ? Infinity : Math.round(base * inflFactor);
}

/**
 * Realized capital gain from a taxable-brokerage draw, using average-cost
 * basis tracking (not per-lot). g = draw × (1 − basis/balance) — the fraction
 * of the account that is unrealized gain. Guards balance<=0/basis>=balance.
 * A local copy of App.jsx's identical helper — this module does not import
 * from App.jsx.
 */
function realizedGainFor(draw, balance, basis) {
  if (!draw || draw <= 0 || !balance || balance <= 0) return 0;
  const frac = Math.max(0, 1 - (basis || 0) / balance);
  return draw * frac;
}

/**
 * Grows a profile's account balances from currentAge to retireAge using the
 * same per-bucket rates buildWithdrawalWaterfall uses (gr for pretax/roth/
 * taxable, a conservative cashGr for cash/HSA). Exported so other views
 * (e.g. the deterministic schedule's "Portfolio at Retirement" metric) agree
 * with the waterfall's own starting balances instead of re-deriving them.
 * @returns {{ pretax0: number, roth0: number, taxable0: number, cash0: number, total: number, taxableBasis0: number }}
 */
/**
 * The retirement age the projection should actually start from.
 *
 * Every engine walks the drawdown as `age = retireAge … endAge` and maps it to
 * calendar years via `BASE_YEAR + (age - currentAge)`. Account balances are
 * always TODAY's balances. So if a user is already retired and enters the age
 * they actually retired at — 67 today, retired at 65 — the projection starts two
 * years in the PAST and draws two extra years of spending out of a balance that
 * has already lived through them. The plan looks worse than it is, and the
 * year-by-year table shows years that have already happened.
 *
 * Clamping to currentAge makes "I retired at 65 and I'm 67" and "I'm retiring
 * now" the same projection, which is correct: both draw from today's money
 * starting today. Users still entering a future retireAge are unaffected.
 *
 * @returns {number} max(retireAge, currentAge), or retireAge when either is
 *   not a finite number (callers handle the null case themselves).
 */
/**
 * The Guyton-Klinger reference withdrawal rate for a given year.
 *
 * GK compares this year's withdrawal rate against a baseline and raises spending
 * 10% when it falls 20% below (Prosperity Rule) or cuts 10% when it rises 20%
 * above (Capital Preservation). In the 2006 paper the baseline is the INITIAL
 * withdrawal rate, fixed at retirement — and it works there because the paper
 * has no outside income, so the ratio moves only when the portfolio moves.
 *
 * AiRA nets income out of the numerator (otherwise a retiree whose SS starts at
 * retirement trips a bogus cut every year). That makes the signal move when
 * INCOME changes, not just the portfolio — so a pension rising on schedule was
 * indistinguishable from investment outperformance and repeatedly fired the
 * Prosperity Rule. A user reported the consequence: adding a pension that grew
 * $1,135/yr produced ~$637k of extra lifetime income but LOWERED their ending
 * balance and their success rate, because ~62% of that income was silently
 * absorbed into automatic 10% spending raises. A $1,135 income bump could
 * trigger a $9,000 spending raise, and it compounded annually.
 *
 * Fixing it means re-baselining the reference every year against the SAME
 * income, so scheduled income cancels from both sides of the comparison and
 * only portfolio deviation moves the guardrails. At year 0 this is identical to
 * the old static initialWR, so nothing else changes.
 *
 * Baseline = "what my rate would be this year if the portfolio had merely kept
 * pace with inflation and I spent my original plan."
 */
export function gkReferenceWR({ plannedSpend, cumInfl = 1, incomeOffset = 0, fixedCosts = 0, portAtRetire }) {
  const denom = (portAtRetire || 0) * (cumInfl || 1);
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  const baselineNeed = Math.max(0, (plannedSpend || 0) * (cumInfl || 1) - (incomeOffset || 0)) + (fixedCosts || 0);
  return baselineNeed / denom;
}

export function effectiveRetireAge(retireAge, currentAge) {
  const r = Number(retireAge);
  const c = Number(currentAge);
  if (!Number.isFinite(r) || !Number.isFinite(c)) return retireAge;
  return Math.max(r, c);
}

export function accumulateToRetirement(params = {}) {
  const {
    currentAge, retireAge, accounts = [], preRetireEq = 91, postRetireEq = 70,
    cashRealReturn, gr: grParam, taxableBasisPct = 70,
    // Annual contribution streams. These were previously ignored entirely, so
    // this engine reported a retirement portfolio with zero savings added —
    // understating balances for every user still working, and contradicting the
    // docstring's promise that it agrees with runMC's starting balances.
    contrib = 0, employerContrib = 0, hsaContrib = 0,
    taxableContrib = 0, rothContrib = 0,
  } = params;
  // This function only models the PRE-retirement accumulation phase, so
  // preRetireEq normally drives the growth rate here. The one exception is a
  // user who chooses to de-risk BEFORE they retire (glidepathSwitchAge <
  // retireAge) — those years must use postRetireEq, or this engine's
  // portfolio-at-retirement would exceed runMC's, which switches per age.
  const glideSwitchAge = resolveGlidepathSwitchAge(params);
  const grFor  = (age) => grParam ?? (expectedReturn(age < glideSwitchAge ? preRetireEq : postRetireEq) / 100);
  // Cash growth honors the profile's "Cash return" field — the SAME value
  // runMC applies to the cash bucket ((p.cashRealReturn ?? 3.0)/100). This was
  // a hardcoded 0.045 that silently ignored the user's setting, so the profile
  // field changed the Monte Carlo but never this engine.
  const cashGr = (cashRealReturn ?? 3.0) / 100;

  let pretax0 = 0, roth0 = 0, taxable0 = 0, cash0 = 0;
  for (const a of accounts) {
    const bal = a.balance || 0;
    if      (a.category === "pretax")  pretax0  += bal;
    else if (a.category === "roth")    roth0    += bal;
    else if (a.category === "taxable") taxable0 += bal;
    else                               cash0    += bal; // cash + hsa
  }

  // Basis is a % of TODAY's taxable balance (before the accumulation growth
  // below) — growth is unrealized gain, so the basis fraction shrinks by
  // retirement even though no dollar of basis has been consumed by a draw yet.
  let taxableBasis0 = taxable0 * (Math.max(0, Math.min(100, taxableBasisPct)) / 100);

  const accYrs = Math.max(0, (retireAge ?? 0) - (currentAge ?? 0));
  for (let y = 0; y < accYrs; y++) {
    const gr = grFor((currentAge ?? 0) + y);
    pretax0  *= (1 + gr);
    roth0    *= (1 + gr);
    taxable0 *= (1 + gr);
    cash0    *= (1 + cashGr);
    // Same bucket routing as runMC's accumulation loop — grow first, then add
    // the year's contributions, so a contribution doesn't earn a return in the
    // year it was made.
    pretax0  += contrib + employerContrib;
    cash0    += hsaContrib;
    roth0    += rothContrib;
    taxable0 += taxableContrib;
    // After-tax dollars in, so basis rises one-for-one (growth is unrealized).
    taxableBasis0 += taxableContrib;
  }

  return { pretax0, roth0, taxable0, cash0, total: pretax0 + roth0 + taxable0 + cash0, taxableBasis0 };
}

// The four drawable buckets, canonical order. Shared so runMC and this engine
// resolve a user's account draw order identically (no cross-engine drift).
export const WITHDRAWAL_BUCKETS = ["cash", "taxable", "pretax", "roth"];

// The naive ("No plan") comparison scenario is intentionally NOT user-configurable:
// it always drains pre-tax first, uncapped — the common-default baseline the smart
// plan is measured against. Named so this "not resolver-driven" invariant is explicit.
export const NAIVE_DRAW_ORDER = ["pretax", "cash", "taxable", "roth"];

/**
 * Resolve the account draw order from the profile's orderingMode.
 *   "tax_reactive" (default) → cash → taxable → pre-tax → Roth (today's behavior)
 *   "pretax_first"           → pre-tax → cash → taxable → Roth
 *   "custom"                 → the user's `withdrawalOrder`, sanitized to a full
 *                              permutation (invalid/dupes dropped, missing appended)
 * NOTE: ordering is orthogonal to the guardrails — the bracket cap / IRMAA guard
 * attach to the pre-tax step and the reserve floor to the Roth step wherever each
 * lands in the returned order.
 */
export function resolveDrawOrder(orderingMode, withdrawalOrder) {
  if (orderingMode === "custom" && Array.isArray(withdrawalOrder)) {
    const seen = new Set();
    const out = [];
    for (const b of withdrawalOrder) {
      if (WITHDRAWAL_BUCKETS.includes(b) && !seen.has(b)) { seen.add(b); out.push(b); }
    }
    for (const b of WITHDRAWAL_BUCKETS) if (!seen.has(b)) out.push(b);
    return out;
  }
  if (orderingMode === "pretax_first") return ["pretax", "cash", "taxable", "roth"];
  return ["cash", "taxable", "pretax", "roth"]; // tax_reactive (default)
}

/**
 * Main export.
 * @param {object} params — full AiRA profile object
 * @returns {{ smart: ScenarioResult, naive: ScenarioResult, summary: Summary }}
 */
export function buildWithdrawalWaterfall(params = {}) {
  const {
    currentAge,
    endAge       = 90,
    sp: baseSp   = 80_000,
    // ssAge/ssb/ssCola removed from this destructure — computeHouseholdSS(params, age)
    // reads them (and spouse.*) directly off the full params object instead.
    ab           = 0,
    abEndYear    = null,
    // Default matches BLANK_PROFILE.abGrowth in App.jsx. Previously absent here,
    // which is why this engine silently hardcoded 1.03 growth (REQUIREMENTS §13.2 #11).
    abGrowth     = 3.0,
    // Who pays the conversion tax. "from_conversion" withholds it out of the
    // transfer; anything else pays from real tracked buckets (taxable -> cash ->
    // pretax). Default matches BLANK_PROFILE.
    taxFunding   = "from_taxable",
    inf          = 2.5,
    accounts     = [],
    filingStatus = "mfj",
    stateOfResidence = "NJ",
    twoHousehold = false,
    dob,
    birthYear,
    rmdStartAge,
    useJointRmdTable = false,
    gkFloor      = 48_000,
    gkCeiling    = 115_000,
    // New waterfall fields
    withdrawalBracketTarget = "22",
    irmaaGuard           = false,
    ssTorpedoGuard       = false,
    rothEmergencyReserve = 0,
    rothConversionTarget = "off",
    conversionOverrides  = [],
    // Account draw order (orthogonal to distribution + guardrails). Default
    // "tax_reactive" reproduces the historical cash→taxable→pretax→Roth sequence.
    orderingMode    = "tax_reactive",
    withdrawalOrder = ["cash", "taxable", "pretax", "roth"],
    preRetireEq = 91,
    postRetireEq = 70,
    cashRealReturn,
    gr: grParam,
    taxableBasisPct = 70,
    // Annual contribution streams, forwarded to accumulateToRetirement so this
    // engine's starting balances match runMC's for a user still working.
    contrib = 0,
    employerContrib = 0,
    hsaContrib = 0,
    taxableContrib = 0,
    rothContrib = 0,
    // Real-world cash needs/income — same fields runMC uses for `need`
    mortBalance = 0,
    mortRate,
    mortStart,
    mortTerm,
    mortExtra,
    housingType = "own",
    annualRent  = 0,
    propIncome  = 0,
    carveouts   = [],
    cashFlowEvents = [],
    smile          = true,
    hcShockAge, hcProb, hcMin, hcMax,
    otherIncomes = [],
    spSchedule   = null,
    retireAge: retireAgeRaw,
  } = params;

  // Already-retired users: see effectiveRetireAge. Every use below must be the
  // clamped value, or the projection replays years that have already happened.
  const retireAge = effectiveRetireAge(retireAgeRaw, currentAge);

  if (currentAge == null || retireAgeRaw == null) {
    const empty = { rows: [], totalTax: 0, finalPretax: 0, finalRoth: 0, finalCash: 0, finalTaxable: 0 };
    return { smart: empty, naive: empty, summary: emptySummary() };
  }

  const isMFJ      = filingStatus !== "single";
  const infR       = inf / 100;
  // Expected growth now derives from the SAME equity-glide formula runMC's
  // portReturn uses (expectedReturn(eqPct), shared via ./expectedReturn.js)
  // instead of a hardcoded flat 7% that ignored preRetireEq/postRetireEq
  // entirely. An explicit gr override (grParam) still wins for either phase,
  // for backward compatibility with callers/tests that pin a specific rate.
  const preGr      = grParam ?? (expectedReturn(preRetireEq) / 100);
  const postGr     = grParam ?? (expectedReturn(postRetireEq) / 100);
  // Age the mix shifts pre→post. Defaults to the (effective) retirement age,
  // which is what this engine's loop assumed all along — see engine/glidepath.js.
  const glideSwitchAge = resolveGlidepathSwitchAge({ ...params, retireAge });
  // Cash growth honors the profile's "Cash return" field — the SAME value
  // runMC applies ((p.cashRealReturn ?? 3.0)/100). Was a hardcoded 0.045 that
  // ignored the user's setting entirely (profile field changed the Monte
  // Carlo but never this tab).
  const cashGr     = (cashRealReturn ?? 3.0) / 100;
  const retireYear = BASE_YEAR + (retireAge - currentAge);
  const rmdAge     = (typeof rmdStartAge === "number" && rmdStartAge > 0)
    ? rmdStartAge
    : getRmdStartAge({ dob, birthYear, currentAge });

  const fedBase    = isMFJ ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE;
  const stateBr0   = twoHousehold ? null : getStateBrackets(stateOfResidence, isMFJ);

  // Pinned per-year conversion amounts from the Conversion Plan tab (calendar year → $).
  const overrideMap = new Map();
  for (const o of conversionOverrides) {
    overrideMap.set(Number(o.year), Number(o.amount) || 0);
  }

  // ── Initialise buckets from accounts, grown to retirement ──────────────────
  // Accumulation (pre-retirement) phase normally uses preGr. Pass the glide
  // inputs rather than a pinned rate so a switch age set BEFORE retirement is
  // honoured year-by-year; an explicit grParam override still wins for both
  // phases (grParam is forwarded as `gr` only when the caller supplied one —
  // passing preGr unconditionally would re-pin it and defeat the glide).
  const { pretax0, roth0, taxable0, cash0, taxableBasis0 } = accumulateToRetirement({
    currentAge, retireAge, accounts, cashRealReturn, taxableBasisPct,
    preRetireEq, postRetireEq, glidepathSwitchAge: glideSwitchAge,
    ...(grParam != null ? { gr: grParam } : {}),
    contrib, employerContrib, hsaContrib, taxableContrib, rothContrib,
  });

  // Pre-compute the actual annual mortgage cash cost per calendar year (incl.
  // extra payments and the partial payoff year) — housing cost is part of
  // "need" for every year the mortgageSchedule reports a payment, mirroring
  // runMC/simulateDeterministicWithStrategy's mortByYear map (Fix 1).
  let mortByYear = new Map();
  if (mortBalance > 0) {
    const ms = mortgageSchedule(mortBalance, mortRate || 6.5, mortStart || "2020-01", mortTerm || 30, mortExtra || 0);
    mortByYear = mortgageAnnualPayments(ms);
  }

  // ── Guyton-Klinger helper (mirrors App.jsx implementation) ─────────────────
  // incomeOffset/fixedCosts let the tracked ratio be the same NET PORTFOLIO
  // NEED the baseline initWR was calibrated against (SS/annuity/otherIncome
  // net out of gross spend `w`; housing/carveouts add on top) — otherwise a
  // retiree whose SS starts at retirement has cur = gross-w/port far above an
  // initWR calibrated net-of-SS, triggering a bogus capital-preservation cut
  // every year regardless of portfolio health.
  function gkWithdraw(port, initWR, lastW, lastRet, inflRate, floor, ceiling, incomeOffset = 0, fixedCosts = 0) {
    if (!port || port <= 0) return floor || 0;
    // Cap the CPI pass-through per the original GK paper (App.jsx's
    // guytonKlingerWithdrawal applies the same GK_INFLATION_CAP = 0.06) — only
    // the inflation step is capped, not the whole withdrawal formula.
    const cappedInfl = Math.min(GK_INFLATION_CAP, inflRate);
    let w = lastRet >= 0 ? lastW * (1 + cappedInfl) : lastW;
    // Guard: if the baseline draw is already fully covered by income at
    // retirement (initWR <= 0), skip the band adjustments entirely — otherwise
    // cur <= 0.8*0 is always true and fires a meaningless +10% raise every year.
    if (initWR > 0) {
      const netNeed = Math.max(0, w - incomeOffset) + fixedCosts;
      const cur = port > 0 ? netNeed / port : 0;
      if (cur <= initWR * 0.8) w *= 1.1;
      else if (cur >= initWR * 1.2) w *= 0.9;
    }
    return Math.max(floor || 0, Math.min(ceiling || Infinity, w));
  }

  // ── Tax helpers ────────────────────────────────────────────────────────────
  // ltcg = realized capital gain from this year's taxable-brokerage draw (0 for
  // callers that don't pass it — e.g. a pure conversion-tax probe on an
  // already-computed gain reuses the SAME value, never re-derives it, so the
  // conversion delta stays a pure conversion cost).
  // magiLookback = MAGI from two years ago (IRMAA 2-year lookback). When the
  // caller supplies it, the IRMAA charge uses IT instead of this year's own
  // MAGI — the current year `yr` still selects the bracket table. `null`
  // (default) preserves same-year-MAGI behavior for callers without history
  // (e.g. a first-two-retirement-years fallback — pre-retirement wage income
  // isn't modeled, so there's nothing real to look back on yet).
  function yearTax(age, yr, fromPretax, ssGross, annuityTaxable, rmd, inflFactor, otherTaxable = 0, ltcg = 0, magiLookback = null) {
    const iF  = inflFactor;
    const fB  = idxB(fedBase, iF);
    // IRC §86 provisional-income tiers (0% / 50% / 85% of SS taxable). Realized
    // gains count toward provisional income (they're part of MAGI) even though
    // they are NOT part of ordinary otherOrdInc/totInc below.
    const otherOrdInc = annuityTaxable + rmd + fromPretax + otherTaxable;
    const taxSS = Math.round(taxableSocialSecurity(ssGross, otherOrdInc + ltcg, isMFJ));
    const totInc = taxSS + otherOrdInc; // ordinary income total (excludes LTCG)
    // IRMAA MAGI = AGI (incl. the full realized gain) + tax-exempt interest;
    // untaxed SS is NOT added back. Computed HERE, ahead of the deductions,
    // because the OBBBA senior bonus's phase-out is MAGI-keyed — and to keep it
    // structurally impossible to net a deduction out of MAGI (CLAUDE.md rule 3).
    const magi = totInc + ltcg;
    const sd  = stdDed(age, isMFJ, iF);
    // OBBBA senior bonus (2025–2028 only, $0 from 2029) — separate, additive,
    // NOT inflation-indexed. Reduces taxable income only, never `magi` above.
    const seniorBonus = getSeniorBonusDeduction(age, isMFJ ? "mfj" : "single", magi, yr);
    const ded = sd + seniorBonus;
    const txInc  = Math.max(0, totInc - ded);
    // LTCG stacks ON TOP of ordinary income — the deductions soak into
    // gains first if ordinary income didn't fully use them.
    const gainTxInc = Math.max(0, totInc + ltcg - ded) - txInc;
    const fedOrdinary = progTax(txInc, fB);

    // LTCG bracket walk over the stacked interval [txInc, txInc + gainTxInc).
    const ltcgBr = idxB(isMFJ ? LTCG_BRACKETS_2026_MFJ : LTCG_BRACKETS_2026_SINGLE, iF);
    const ltcgTax = Math.round(progTax(txInc + gainTxInc, ltcgBr) - progTax(txInc, ltcgBr));

    // NIIT (IRC §1411): 3.8% of the lesser of net investment income (LTCG here)
    // or the excess of MAGI over the statutory (NOT inflation-indexed) threshold.
    const niitThreshold = isMFJ ? NIIT_THRESHOLD_MFJ : NIIT_THRESHOLD_SINGLE;
    const niit = ltcg > 0 ? Math.round(NIIT_RATE * Math.min(ltcg, Math.max(0, magi - niitThreshold))) : 0;

    // LTCG tax + NIIT fold into fedT so the funding-identity math (irmaaFull =
    // fedT + stT + irmaa) keeps working unchanged; both are also returned
    // separately for UI surfacing.
    const fedT   = Math.round(fedOrdinary) + ltcgTax + niit;
    // States generally tax capital gains as ordinary income (no LTCG preferential
    // rate) — add the realized gain to the state taxable base.
    const stT    = stateBr0 ? Math.round(progTax(txInc + ltcg, idxB(stateBr0, iF))) : 0;
    // IRMAA 2-year lookback: charge uses the 2-years-ago MAGI when supplied,
    // else this year's own MAGI (pre-lookback fallback). Because magiLookback
    // is fixed before the tax↔draw fixed point runs (it doesn't depend on this
    // year's draws), `irmaa` is effectively a per-year CONSTANT across passes —
    // an improvement over the old same-year charge, which was itself part of
    // the step-function the fixed point had to converge through.
    const irmaaMagi = (typeof magiLookback === "number" && !isNaN(magiLookback)) ? magiLookback : magi;
    const irmaa  = age >= 65 ? irmaaCost(irmaaMagi, yr, infR, isMFJ) : 0;
    let margR = 0;
    for (const b of fB) { if (txInc > b.lo) margR = b.rate; else break; }
    // NOTE: `totalTax` here is fed+state ONLY (irmaa is reported separately /
    // folded via irmaaFull) — the Step 6.5/7 conversion-delta math already
    // takes `tax.totalTax - taxNoConv.totalTax`, so a same-year conversion's
    // incremental cost has never included IRMAA and needs no change for the
    // lookback: IRMAA can't move within a year regardless of convAmt now that
    // it's sourced from a fixed 2-years-ago MAGI.
    return { fedTax: fedT, stateTax: stT, irmaa, totalTax: fedT + stT, irmaaFull: fedT + stT + irmaa,
             effectiveRate: (totInc + ltcg) > 0 ? (fedT + stT) / (totInc + ltcg) : 0, marginalBracket: margR,
             taxableIncome: txInc, totInc, taxSS, ltcgTax, niit, realizedGain: Math.round(ltcg),
             // This year's OWN MAGI (never the lookback substitution) — runScenario
             // stores this per age so it becomes magiLookback two years from now.
             magi };
  }

  // The user's chosen account draw order (used by the "smart" = your-plan scenario).
  // The "naive" comparison scenario always drains pre-tax first, uncapped.
  const smartDrawOrder = resolveDrawOrder(orderingMode, withdrawalOrder);

  // ── Scenario runner ────────────────────────────────────────────────────────
  function runScenario(isSmart) {
    let pretax = pretax0, roth = roth0, taxable = taxable0, cash = cash0;
    // Smart and naive each track their own basis (they draw taxable differently
    // year to year), both seeded from the same taxableBasis0.
    let taxableBasis = taxableBasis0;
    const rows = [];
    // IRMAA 2-year lookback history for THIS scenario (smart/naive diverge in
    // draws and conversions, so each gets its own MAGI-by-age history). Keyed
    // by age, populated with each year's final (post-conversion) MAGI at the
    // bottom of the loop below.
    const magiByAge = new Map();
    // Post-retirement per-year growth mirrors runMC's portReturn glidepath:
    // preGr below the switch age, postGr from it on. The switch age is
    // `glidepathSwitchAge`, defaulting to the retirement age — so by default
    // every year in this loop is at/after the switch and uses postGr, exactly
    // as before. Setting the field later than retirement (e.g. "90/10 until
    // 67, retire at 62") is what makes the preGr branch reachable here.
    let sp = baseSp, lastRet = postGr;
    const totalPort0 = pretax + roth + taxable + cash;
    // Baseline initWR = NET PORTFOLIO NEED at retirement / portfolio — the same
    // quantity (income-offset gross spend, plus housing/carveouts) the yearly
    // loop's `netNeed` computes, evaluated at the retirement year. ab0 includes
    // propIncome to match this engine's own `annuity` term below (Step 1) —
    // otherwise the baseline and the tracked ratio would drift apart even
    // within this one engine.
    const ss0  = computeHouseholdSS(params, retireAge);
    // Cumulative CPI factor at the retirement year — still used by the rent and
    // carveout baselines below (those DO inflate at CPI). It is deliberately no
    // longer applied to rental income; see ab0.
    const iF0  = Math.pow(1 + infR, retireYear - BASE_YEAR);
    // Same basis as the yearly `annuity` term: ab + propIncome summed, grown at
    // abGrowth. At the retirement year the growth factor is exactly 1.0 (age ===
    // retireAge), so no factor is applied here. propIncome is NOT inflated by iF0
    // any more — that separate CPI track was half of the §13.2 #11 drift.
    const ab0  = (ab > 0 ? ab : 0) + (propIncome || 0);
    const { total: otherInc0 } = computeOtherIncome(otherIncomes, retireYear);
    let housing0 = 0;
    if (housingType === "own") {
      housing0 = mortByYear.get(retireYear) || 0;
    } else if (housingType === "rent") {
      housing0 = Math.round((annualRent || 0) * iF0);
    }
    const carveout0 = carveouts.reduce((sum, c) => {
      return sum + (retireYear <= (c.endYear || 9999) ? Math.round((c.annual || 0) * iF0) : 0);
    }, 0);
    const initNeed0 = Math.max(0, baseSp - ss0 - ab0 - otherInc0) + housing0 + carveout0;
    const initWR = totalPort0 > 0 ? initNeed0 / totalPort0 : 0.04;
    let cTax = 0;

    for (let age = retireAge; age <= endAge; age++) {
      const yr  = retireYear + (age - retireAge);
      const iF  = Math.pow(1 + infR, yr - BASE_YEAR);
      const adjFloor   = Math.round(gkFloor   * iF);
      const adjCeiling = Math.round(gkCeiling * iF);
      // Per-year growth rate — mirrors runMC's portReturn glidepath switch
      // (preRetireEq below glideSwitchAge, postRetireEq from it on), not a flat
      // post-retirement rate, so this engine tracks runMC's glide path exactly.
      const gr = age < glideSwitchAge ? preGr : postGr;

      // IRMAA 2-year lookback: this year's charge is based on MAGI from
      // age-2, already stored in magiByAge from that year's own iteration.
      // Pre-retirement wage income isn't modeled (this engine only knows
      // portfolio/SS/rental/conversion income), so ages whose lookback would
      // reach into working years (age-2 < retireAge) fall back to null →
      // yearTax uses same-year MAGI, matching the pre-lookback approximation
      // for exactly the first two retirement years.
      const twoYrAge = age - 2;
      const magiLookback = (twoYrAge >= retireAge && magiByAge.has(twoYrAge))
        ? magiByAge.get(twoYrAge)
        : null;

      // ── Step 1: Fixed income (computed BEFORE the spend adjustment so GK's
      // netNeed offset can use this year's own income/fixed-cost figures) ──
      const ss = computeHouseholdSS(params, age);
      // Rental / Airbnb income — must match runMC and
      // simulateDeterministicWithStrategy exactly (REQUIREMENTS §13.2 #11). This
      // used to be a third, divergent model: it hardcoded 1.03 growth (ignoring
      // the user's abGrowth), stopped ALL rental income at age 80, and inflated
      // propIncome at CPI on a separate track from ab. Now: sum the two streams
      // first, then grow the combined total once at the user's abGrowth, capped at
      // 20 years of compounding (the same cap both other engines already apply).
      //
      // The age-80 stop is gone deliberately — it had no basis in anything the
      // user set, contradicted their own abEndYear input, and silently understated
      // rental income (and so overstated pretax/Roth draws and tax) for every
      // profile planning past 80.
      //
      // abReliability is deliberately NOT applied here: it is a per-year
      // all-or-nothing coin flip that only has meaning across runMC's many paths
      // (App.jsx: `rand() < abReliability/100`). Applying it as an expected-value
      // haircut in a single deterministic path would invent a fourth model.
      // simulateDeterministicWithStrategy likewise shows full planned rental.
      const abGrowthFactor = Math.pow(1 + (abGrowth || 3) / 100, Math.min(Math.max(0, age - retireAge), 20));
      const annuity = (abEndYear == null || yr <= abEndYear)
        ? Math.round(((ab > 0 ? ab : 0) + (propIncome || 0)) * abGrowthFactor)
        : 0;
      const fixedIncome = ss + annuity;

      // Other income streams (pensions, part-time work, etc.) — offset "need"
      // and, if taxable, stack as ordinary income alongside RMDs/pretax draws.
      let { total: otherIncTotal, totalTaxable: otherIncTaxable } = computeOtherIncome(otherIncomes, yr);

      // Housing cost: mortgage cash cost (P&I + extra, incl. the partial payoff
      // year) while the loan is active, or inflation-adjusted rent — same model
      // as runMC's `housingCost`.
      let housingCost = 0;
      if (housingType === "own") {
        housingCost = mortByYear.get(yr) || 0;
      } else if (housingType === "rent") {
        housingCost = Math.round((annualRent || 0) * iF);
      }

      // Other fixed expenses (HOA, insurance, college, etc.) active this year.
      // Planned one-off / periodic expenses — additive on top of the base spend
      // so the guardrails keep governing the recurring plan. See
      // computeCashFlowEvents.
      const ev = computeCashFlowEvents(cashFlowEvents, yr, inf, BASE_YEAR);
      // ADVISORY ONLY — deliberately NOT charged to this year's draw.
      //
      // This is a probability-weighted EXPECTATION (hcProb x mean cost), and this
      // engine produces a MEDIAN path that a real person enacts: "withdraw this
      // much from this account this year". Charging E[X] into a median path is a
      // category error — at the default 3.5%/yr the median shock is $0, not
      // $3,500. The charge produced a draw that is wrong in 100% of actual years:
      // a retiree either has no shock, or has a ~$100k hip replacement.
      //
      // It also silently contaminated the GK guardrails below, which read it as a
      // fixed cost and lowered recommended spending against an expense nobody pays.
      //
      // Real shock risk is modeled where it belongs: runMC draws it stochastically
      // (healthcareShockDraw), so the success rate still prices it. This value is
      // emitted on the row purely so the UI can DISCLOSE the risk beside the plan.
      const hcRisk = expectedHealthcareShock(age, { hcShockAge, hcProb, hcMin, hcMax }, iF);

      // INFLOWS (lump-sum pension, cash-balance rollover, inheritance, home
      // sale) are DEPOSITED into their destination bucket before this year's
      // draws, so the money is available now and compounds from here. Netting
      // them against spending instead would discard everything beyond one
      // year's need — see computeCashFlowEvents.
      if (ev.inflow > 0) {
        pretax  += ev.byBucket.pretax  || 0;
        roth    += ev.byBucket.roth    || 0;
        cash    += ev.byBucket.cash    || 0;
        const taxableIn = ev.byBucket.taxable || 0;
        taxable += taxableIn;
        // Already-taxed money arrives as basis; only later growth is gain.
        // (An inherited brokerage account gets a stepped-up basis, so the same
        // rule holds there.)
        taxableBasis += taxableIn;
        // A taxable inflow is ordinary income in the year received, so it must
        // reach the tax calc — but deliberately NOT otherIncTotal, which offsets
        // spending. Offsetting is what discards the surplus; this money was
        // already deposited above.
        otherIncTaxable += ev.inflowTaxable;
      }

      const carveoutCost = carveouts.reduce((sum, c) => {
        return sum + (yr <= (c.endYear || 9999) ? Math.round((c.annual || 0) * iF) : 0);
      }, 0);

      // Spend adjustment (every year after first), unless a detailed
      // year-by-year budget was uploaded — that schedule IS the plan.
      // Smart Waterfall hybrid (mirrors runMC's "smart" strategy):
      //   yearsRemaining > 15  → GK guardrails (adaptive, paper-faithful)
      //   yearsRemaining ≤ 15  → Bengen (inflation-only, no portfolio reaction)
      // The split point matches GK's own longevity-clause threshold, so we exit
      // GK exactly where its capital-preservation brake would be disabled.
      const totalPort = pretax + roth + taxable + cash;
      if (spSchedule && spSchedule.length) {
        sp = scheduleSpendForYear(spSchedule, yr, inf);
      } else if (age > retireAge && totalPort > 0) {
        const yrsRemaining = endAge - age;
        if (yrsRemaining > 15) {
          // Reference re-based on THIS year's income — a scheduled pension
          // raise must not read as portfolio outperformance. See gkReferenceWR.
          const refWR = gkReferenceWR({
            plannedSpend: baseSp,
            cumInfl: Math.pow(1 + infR, age - retireAge),
            incomeOffset: fixedIncome + otherIncTotal,
            fixedCosts: housingCost + carveoutCost + ev.committed,
            portAtRetire: totalPort0,
          });
          sp = gkWithdraw(
            totalPort, refWR, sp, lastRet, infR, adjFloor, adjCeiling,
            fixedIncome + otherIncTotal, housingCost + carveoutCost + ev.committed
          );
        } else {
          sp = sp * (1 + infR);
        }
      }

      // ── Step 2: RMD (forced) ────────────────────────────────────────────
      let rmd = 0;
      if (age >= rmdAge && pretax > 0) {
        // Joint table only applies when actually filing jointly — a stale
        // useJointRmdTable=true left over from switching filingStatus to
        // "single" (e.g. modeling widowhood) must fall back to the standard
        // Uniform Lifetime table, matching runMC's `useJointTable` gate.
        const tbl     = (useJointRmdTable && isMFJ) ? JOINT_RMD_DIV : RMD_DIV;
        const divisor = tbl[age] || 15.0;
        rmd = Math.round(pretax / divisor);
        pretax -= rmd;
      }

      // ── Steps 3-6: Portfolio draws + tax funding (fixed-point) ───────────
      // "Need" reflects the year's full cash requirement: base spending plus
      // housing/carveout obligations, net of fixed and other income — PLUS the
      // taxes the draw itself creates (fed + state + IRMAA). Taxes depend on
      // fromPretax, which depends on the draw size, which depends on taxes —
      // iterate to convergence. RMD proceeds fund the need first; any excess
      // RMD is reinvested in the taxable bucket below.
      // Blanchett spending smile — a REAL lifestyle curve applied to this
      // year's spend. Deliberately not fed back into `sp`, which is the
      // withdrawal strategy's running state: multiplying that would compound
      // the smile year over year and corrupt GK's own inflation logic. This is
      // an overlay on what the strategy decided, not a change to the strategy.
      const spSmiled = sp * spendingSmileFactor(age, retireAge, smile !== false);
      // hcRisk is NOT in this sum — see its declaration above. Every term here is
      // a cash obligation the user actually pays this year.
      const baseNeed = Math.max(0, spSmiled - fixedIncome - otherIncTotal) + housingCost + carveoutCost + ev.total;

      // Steps 3-5: portfolio draws. The draw ORDER differs by scenario:
      //   • smart — cash → taxable → pretax (bracket-capped) → Roth (tax-optimal)
      //   • naive — pretax (uncapped) → cash → taxable → Roth ("pretax first":
      //     the no-planning retiree drains the 401k/IRA first, maximizing ordinary
      //     income early; Roth is still saved for last)
      let fromCash = 0, fromTaxable = 0, fromPretax = 0, fromRoth = 0;
      let pretaxCapReason = "uncapped";
      let rothReserveHeld = 0;
      let taxNoConv = null;
      let taxDue = 0;

      // 12 passes, not 4: the tax↔draw fixed point converges geometrically at
      // ~the marginal rate (≈0.3×/pass), so 4 passes systematically exited
      // ~$100-350 short of the true tax bill every year — a persistent
      // underfunding of the draws the user acts on. The <$1 break below makes
      // extra passes free once converged (typically pass 5-7).
      for (let pass = 0; pass < 12; pass++) {
        let need = Math.max(0, baseNeed + taxDue - rmd); // RMD proceeds fund first
        fromCash = 0; fromTaxable = 0; fromPretax = 0; fromRoth = 0;
        pretaxCapReason = "uncapped";

        const drawCash    = () => { fromCash    = Math.min(need, cash);    need -= fromCash;    };
        const drawTaxable = () => { fromTaxable = Math.min(need, taxable); need -= fromTaxable; };

        // Step 5 — Pretax (bracket-capped in smart mode, uncapped in naive)
        const drawPretax = () => {
          let pretaxAllowed = need;
          if (isSmart && withdrawalBracketTarget && withdrawalBracketTarget !== "off") {
            const sd      = stdDed(age, isMFJ, iF);
            // 85% SS inclusion here is a deliberate worst-case estimate: the pretax draw
            // being sized below itself raises provisional income, so assuming max inclusion
            // keeps the bracket cap conservative (never overshoots the target ceiling).
            const ordFloor = Math.round(ss * 0.85) + rmd + annuity + otherIncTaxable;
            let ceiling = bracketCeiling(withdrawalBracketTarget, isMFJ, iF);
            // The OBBBA senior bonus shelters ordinary income exactly as the
            // standard deduction does, so it belongs in this room calc too. Its
            // phase-out is MAGI-keyed and MAGI rises with the very draw being
            // sized, so estimate the bonus at the HIGH end of plausible MAGI
            // (floor + the room before the bonus) → worst-case phase-out →
            // smallest bonus. Same conservative direction as the 85% SS inclusion
            // above: this may under-fill the bracket but can never overshoot it.
            const roomPreBonus = Math.max(0, ceiling - Math.max(0, ordFloor - sd));
            const ded = sd + getSeniorBonusDeduction(
              age, isMFJ ? "mfj" : "single", ordFloor + roomPreBonus, yr
            );
            const taxSoFar = Math.max(0, ordFloor - ded);

            if (irmaaGuard && age >= 63) {
              const irmaaTier1 = isMFJ ? IRMAA_TIER1_2026_MFJ : IRMAA_TIER1_2026_SINGLE;
              // `ded` is subtracted here only to move the IRMAA MAGI threshold into
              // the same taxable-income space as `ceiling`/`taxSoFar`. It cancels
              // out of `room = ceiling - taxSoFar` algebraically, so this does NOT
              // reduce true MAGI (CLAUDE.md rule 3 is intact). It must be the SAME
              // `ded` used for taxSoFar above for that cancellation to hold — do
              // not "fix" one without the other.
              const irmaaCap = Math.round(irmaaTier1 * iF) - ded;
              if (irmaaCap < ceiling) {
                ceiling = irmaaCap;
                pretaxCapReason = "irmaa_ceil";
              }
            }

            const room = Math.max(0, ceiling - taxSoFar);
            pretaxAllowed = Math.min(need, room);
            if (pretaxCapReason !== "irmaa_ceil") {
              pretaxCapReason = pretaxAllowed < need
                ? `bracket_${withdrawalBracketTarget}`
                : "uncapped";
            }
          }

          fromPretax = Math.min(pretaxAllowed, pretax);
          if (pretax <= pretaxAllowed) pretaxCapReason = "exhausted";
          need -= fromPretax;
        };

        // Step 6 — Roth. Reserve floor respected in the smart (your-plan) scenario,
        // wherever Roth sits in the order. Naive keeps zero floor.
        const drawRoth = () => {
          const rothFloor = isSmart ? (rothEmergencyReserve || 0) : 0;
          const rothAvail = Math.max(0, roth - rothFloor);
          fromRoth = Math.min(need, rothAvail);
          rothReserveHeld = Math.max(0, roth - rothFloor - fromRoth);
          need -= fromRoth;
        };

        // Drain buckets in order. The smart (your-plan) scenario uses the user's
        // chosen order; the naive comparison always drains pre-tax first, uncapped.
        // Ordering is orthogonal to the guardrails: drawPretax caps itself and
        // drawRoth holds its reserve wherever each falls in the sequence.
        const drawFns  = { cash: drawCash, taxable: drawTaxable, pretax: drawPretax, roth: drawRoth };
        const drawSeq  = isSmart ? smartDrawOrder : NAIVE_DRAW_ORDER;
        for (const bucket of drawSeq) drawFns[bucket]();

        // Realized LTCG on this pass's taxable draw — READ-ONLY off the current
        // (pre-draw) taxable balance/basis; the real `taxableBasis` is mutated
        // exactly once below, after the fixed point converges.
        const gPass = realizedGainFor(fromTaxable, taxable, taxableBasis);
        // Source-aware tax on this pass's draws; converge on the funded amount.
        // magiLookback makes the IRMAA component a per-year CONSTANT across
        // passes (it depends on the already-known age-2 MAGI, not this pass's
        // draws) — an improvement over the old same-year charge, which was
        // itself part of the step function the fixed point had to converge
        // through.
        taxNoConv = yearTax(age, yr, fromPretax, ss, annuity, rmd, iF, otherIncTaxable, gPass, magiLookback);
        const newTax = taxNoConv.irmaaFull; // fed + state + IRMAA are all real cash costs
        if (Math.abs(newTax - taxDue) < 1) { taxDue = newTax; break; }
        taxDue = newTax;
      }

      // Realized gain for the YEAR (final, converged fromTaxable) — the single
      // authoritative value used both to mutate taxableBasis below and to feed
      // the Roth-conversion delta-tax calls, so the delta stays a pure
      // conversion cost rather than mixing in a different gain estimate.
      const realizedGain = realizedGainFor(fromTaxable, taxable, taxableBasis);

      // ── Step 6.5: Roth conversion (smart scenario only) ──────────────────
      // A pinned conversionOverrides amount wins; otherwise fill remaining room
      // to rothConversionTarget's bracket ceiling, sized off the taxable income
      // from the spending draw alone (mirrors runMC's bracket-fill behavior).
      let convAmt = 0;
      // Why the conversion was limited: "bracket" | "irmaa_ceil" | "manual" | null.
      // Kept as a named reason (mirroring pretaxCapReason) so §17's planned
      // conversionRoomAllCliffs() can extend the min(...) below with ACA / LTCG /
      // NIIT rooms and report which cliff actually bound, without a rewrite.
      let convCapReason = null;
      if (isSmart) {
        const pretaxAfterDraw = Math.max(0, pretax - fromPretax);
        const override = overrideMap.get(yr);
        if (override != null) {
          convAmt = Math.min(Math.max(0, override), pretaxAfterDraw);
          convCapReason = "manual";
        } else if (rothConversionTarget && rothConversionTarget !== "off" && pretaxAfterDraw > 1000) {
          const sdConv = stdDed(age, isMFJ, iF);
          let ceilingConv = bracketCeiling(rothConversionTarget, isMFJ, iF);
          convCapReason = "bracket";
          // OBBBA senior bonus, estimated at the HIGH end of plausible MAGI
          // (pre-conversion MAGI + the room before the bonus) so the phase-out is
          // worst-cased and the conversion can't be over-sized.
          const roomPreBonus = Math.max(0, ceilingConv + sdConv - taxNoConv.totInc);
          const dedConv = sdConv + getSeniorBonusDeduction(
            age, isMFJ ? "mfj" : "single", taxNoConv.magi + roomPreBonus, yr
          );
          // ENG-8: the IRMAA guard used to cap only the Step-5 pretax draw, so a
          // conversion sized to the income-tax bracket ceiling could still push
          // MAGI across an IRMAA tier — the exact thing the guard is sold as
          // preventing. Mirror Step 5's cap here.
          //
          // Two things to understand before editing this:
          //  1. `dedConv` is subtracted only to express the MAGI threshold in the
          //     same space as `ceilingConv`; it cancels out of `room` below, so
          //     this does NOT reduce true MAGI (CLAUDE.md rule 3).
          //  2. `realizedGain` is subtracted because MAGI includes realized gains
          //     while `taxNoConv.totInc` (the base `room` is measured against)
          //     excludes them. Without it the room would be overstated by the
          //     year's gain and the conversion could still breach the tier.
          //     NOTE: Step 5's own irmaaCap does NOT yet do this — that pre-existing
          //     LTCG-in-MAGI gap is documented in runMC and left unchanged here
          //     rather than silently widening this fix's scope.
          //  3. The `age >= 63` gate is deliberately the SAME as Step 5's, and it
          //     is correct for conversions too: IRMAA runs on a 2-year lookback, so
          //     a conversion at age >= 63 first bites at age >= 65 — exactly when
          //     Medicare premiums begin. Converting at 62 (lookback lands at 64,
          //     pre-Medicare) is correctly exempt.
          //  4. This caps against the CURRENT year's tier ceiling, though the MAGI
          //     it produces is actually charged in yr+2 (whose ceiling is higher,
          //     being inflation-indexed). That makes this cap slightly STRICT, not
          //     loose — it can only under-convert, never let a conversion slip past
          //     the real future cliff. That is the correct failure direction for a
          //     guardrail; do not "fix" it into an off-by-2-years bug.
          if (irmaaGuard && age >= 63) {
            const irmaaTier1 = isMFJ ? IRMAA_TIER1_2026_MFJ : IRMAA_TIER1_2026_SINGLE;
            const irmaaCapConv = Math.round(irmaaTier1 * iF) - realizedGain - dedConv;
            if (irmaaCapConv < ceilingConv) {
              ceilingConv = irmaaCapConv;
              convCapReason = "irmaa_ceil";
            }
          }
          const room = Math.max(0, ceilingConv + dedConv - taxNoConv.totInc);
          if (room > 500) convAmt = Math.min(room, pretaxAfterDraw);
          else convCapReason = null;
        }
      }

      // ── Step 7: Tax calculation — conversion stacks as ordinary income ───
      // Same `realizedGain` AND same `magiLookback` passed to both the
      // with-conversion and no-conversion yearTax calls — the LTCG tax cancels
      // out of the delta and convTax isolates the conversion's own cost. IRMAA
      // is sourced from the fixed age-2 MAGI, not this year's convAmt, so it's
      // identical in `tax` and `taxNoConv` regardless of conversion size — a
      // same-year conversion cannot move its own year's IRMAA charge under the
      // lookback (confirmed: convTax below already uses totalTax = fed+state
      // only, excluding irmaa, so this was already a pure conversion cost and
      // needed no change).
      let tax     = convAmt > 0 ? yearTax(age, yr, fromPretax + convAmt, ss, annuity, rmd, iF, otherIncTaxable, realizedGain, magiLookback) : taxNoConv;
      let convTax = convAmt > 0 ? Math.max(0, tax.totalTax - taxNoConv.totalTax) : 0;

      // Affordability: pretax must cover both the conversion and its incremental tax.
      // Shrink (rather than zero out) when the full fill can't be afforded — converging
      // toward the largest conversion the remaining pretax balance can self-fund.
      // Who actually pays the conversion tax.
      //   "from_conversion" — withhold it out of the amount transferred, so less
      //                       lands in the Roth. Nothing else is touched.
      //   anything else     — pay it from REAL, TRACKED buckets: taxable first,
      //                       then cash, then pre-tax as the last resort.
      //
      // Before this, `taxFunding` was read by NOTHING in this engine (it existed
      // only in the dead buildRothExplorer path), so conversion tax always came out
      // of pre-tax whatever the user chose — silently the most punitive option, and
      // the "outside cash" choice implied an unlimited external pot the simulation
      // never tracked or depleted. Both are gone: every dollar of conversion tax now
      // leaves a balance the user actually entered, and the plan can run out of
      // money paying it. If we don't know about money, we don't spend it.
      // The Profile dropdown emits "from_conv" (App.jsx). "from_conversion" is accepted
      // too so a stored profile written with either spelling behaves the same — a
      // mismatch here fails SILENTLY: withholding never fires and the tax quietly
      // comes from the buckets instead, which is exactly the class of bug this whole
      // change is fixing.
      const withholdFromConversion = taxFunding === "from_conv" || taxFunding === "from_conversion";
      // Funds available to pay tax WITHOUT touching pre-tax, after this year's
      // spending draws have already been taken.
      const taxableLeftForConv = Math.max(0, taxable - fromTaxable);
      const cashLeftForConv    = Math.max(0, cash    - fromCash);
      const outsideFundsForConv = withholdFromConversion
        ? 0
        : taxableLeftForConv + cashLeftForConv;

      if (convAmt > 0) {
        const convAmtBeforeShrink = convAmt;
        for (let i = 0; i < 5 && convAmt > 0; i++) {
          // Affordability now depends on WHERE the tax comes from.
          //   withholding: the conversion pays for itself, so pre-tax only needs to
          //                cover the gross conversion.
          //   real buckets: taxable+cash absorb the tax first; only the excess falls
          //                back to pre-tax, so that is all pre-tax must cover.
          const taxOnPretax = withholdFromConversion
            ? 0
            : Math.max(0, convTax - outsideFundsForConv);
          const needFromPretax = withholdFromConversion
            ? convAmt
            : convAmt + taxOnPretax;
          const shortfall = needFromPretax - (pretax - fromPretax);
          if (shortfall <= 0) break;
          convAmt = Math.max(0, convAmt - shortfall);
          tax     = convAmt > 0 ? yearTax(age, yr, fromPretax + convAmt, ss, annuity, rmd, iF, otherIncTaxable, realizedGain, magiLookback) : taxNoConv;
          convTax = convAmt > 0 ? Math.max(0, tax.totalTax - taxNoConv.totalTax) : 0;
        }
        // If affordability shrank the fill, THAT is the binding constraint now —
        // not the bracket/IRMAA ceiling that sized the original attempt. Report the
        // reason the user can actually act on.
        if (convAmt > 0 && convAmt < convAmtBeforeShrink) convCapReason = "affordability";
        if (convAmt <= 500) {
          convAmt = 0;
          convTax = 0;
          tax = taxNoConv;
          convCapReason = null;
        }
      }

      // ── Step 8: Landmine detection ──────────────────────────────────────
      // SS torpedo: other ordinary income has pushed provisional income past the
      // IRC §86 lower threshold ($32,000 MFJ / $25,000 single), dragging SS benefits
      // into taxation (up to $0.85 per extra $1 in the phase-in range).
      const provisional = ss * 0.5 + rmd + fromPretax + convAmt + annuity + otherIncTaxable;
      const torpedoThresh = isMFJ ? 32_000 : 25_000;
      const ssTorpedo     = ssTorpedoGuard && ss > 0 && provisional > torpedoThresh
        && tax.taxSS > 0;
      const irmaaTriggered = tax.irmaa > 0;
      const rmdActive     = age >= rmdAge && (pretax + rmd + fromPretax) > 0;

      // ── Update buckets ──────────────────────────────────────────────────
      // The cascade draws above already include the year's tax bill (taxDue).
      // Excess RMD (forced out beyond spending + taxes) is reinvested in taxable.
      const rmdExcess = Math.max(0, rmd - (baseNeed + taxDue));
      // Basis consumed by the draw = draw − realized gain (the non-gain, return-
      // of-basis portion); reinvested rmdExcess is fresh money → fresh basis
      // dollar-for-dollar. No growth on basis — only the balance grows below.
      const consumedBasis = fromTaxable - realizedGain;
      taxableBasis = Math.max(0, taxableBasis - consumedBasis) + rmdExcess;
      // ── Pay the conversion tax from the chosen source ────────────────────
      // Ordered draw: taxable → cash → pre-tax. Each step can only take what is
      // actually there, so the plan genuinely runs out rather than pretending.
      let convTaxFromTaxable = 0, convTaxFromCash = 0, convTaxFromPretax = 0;
      let convToRoth = convAmt;
      if (convAmt > 0 && convTax > 0) {
        if (withholdFromConversion) {
          // Withheld out of the transfer: the full gross leaves pre-tax, but only
          // the net reaches the Roth. No other bucket moves.
          convToRoth = Math.max(0, convAmt - convTax);
          convTaxFromPretax = convTax;
        } else {
          let owed = convTax;
          convTaxFromTaxable = Math.min(owed, Math.max(0, taxable - fromTaxable));
          owed -= convTaxFromTaxable;
          convTaxFromCash = Math.min(owed, Math.max(0, cash - fromCash));
          owed -= convTaxFromCash;
          // Last resort. Reaching here means taxable+cash were exhausted, which the
          // shrink loop above already tried to avoid by cutting the conversion.
          convTaxFromPretax = Math.max(0, owed);
        }
      }

      cash    = Math.max(0, cash    - fromCash    - convTaxFromCash)    * (1 + cashGr);
      // NOTE (documented simplification): a taxable draw taken to PAY the conversion
      // tax would itself realize capital gains, creating a second-order tax on the
      // tax. The year's realizedGain/basis figures above are already converged
      // against the spending draw, so folding this in means another fixed point.
      // Basis is consumed proportionally below, but that extra gain is not taxed
      // this pass — it understates tax slightly in years with a large conversion
      // funded from a low-basis taxable account. Tracked, not hidden.
      const convBasisConsumed = taxable > 0
        ? convTaxFromTaxable * (taxableBasis / Math.max(taxable, 1))
        : 0;
      taxableBasis = Math.max(0, taxableBasis - convBasisConsumed);
      taxable = (Math.max(0, taxable - fromTaxable - convTaxFromTaxable) + rmdExcess) * (1 + gr);
      pretax  = Math.max(0, pretax  - fromPretax - convAmt - convTaxFromPretax) * (1 + gr);
      roth    = Math.max(0, roth    - fromRoth + convToRoth) * (1 + gr);

      lastRet = gr;
      cTax += tax.totalTax;

      // IRMAA lookback history: this year's FINAL MAGI (post-conversion when
      // one executed — `tax` is already the with-conversion result whenever
      // convAmt > 0) becomes the magiLookback input for the age+2 iteration.
      magiByAge.set(age, tax.magi);

      rows.push({
        age, yr,
        ss, annuityRental: annuity, fixedIncomeTotal: fixedIncome,
        rmd, rmdActive,
        fromCash, fromTaxable, fromPretax, pretaxCapReason, convCapReason,
        convTaxFromTaxable, convTaxFromCash, convTaxFromPretax, convToRoth,
        fromRoth, rothReserveHeld,
        conversionAmount: Math.round(convAmt), conversionTax: convTax,
        fedTax: tax.fedTax, stateTax: tax.stateTax, irmaa: tax.irmaa,
        totalTax: tax.totalTax, irmaaFull: tax.irmaaFull,
        effectiveRate: tax.effectiveRate, marginalBracket: tax.marginalBracket,
        taxableIncome: tax.taxableIncome, totInc: tax.totInc, magi: Math.round(tax.magi),
        realizedGain: Math.round(realizedGain), ltcgTax: tax.ltcgTax, niit: tax.niit, taxSS: tax.taxSS,
        // Forced RMD beyond what spending + taxes consumed; reinvested into the
        // taxable bucket above. EMITTED rather than left internal because the
        // Pre-Tax tooltip was recomputing it as `rmd - (needFromPort + irmaaFull)`.
        //
        // That duplicate agreed exactly in ordinary years — but NOT in Roth
        // conversion years, and by up to $32k on a test profile. `taxDue` above
        // converges on the NO-conversion tax (the conversion's own tax is funded
        // separately, via convTaxFrom*), while the row's `irmaaFull` is the
        // WITH-conversion figure. The tooltip therefore subtracted the conversion
        // tax a second time and UNDERSTATED how much RMD was reinvested.
        //
        // This value is the one that actually moved money (`taxable += rmdExcess`
        // above), so it is authoritative. One formula, one owner: the engine.
        rmdSurplus: Math.round(rmdExcess),
        landmines: { ssTorpedo, irmaaTriggered, rmdActive },
        cashEnd:    Math.round(cash),
        taxableEnd: Math.round(taxable),
        pretaxEnd:  Math.round(pretax),
        rothEnd:    Math.round(roth),
        totalPort:  Math.round(cash + taxable + pretax + roth),
        spending:   Math.round(spSmiled),
        housingCost: Math.round(housingCost),
        carveoutCost: Math.round(carveoutCost),
        eventCost: Math.round(ev.total),
        // Advisory, NOT charged to any draw above. Renamed from `healthcareCost`
        // so no caller can mistake it for a funded obligation and fold it back
        // into a funding identity (withdrawal.test.js did exactly that).
        healthcareRisk: Math.round(hcRisk),
        eventInflow: Math.round(ev.inflow),
        eventLabels: ev.hits.map(h => h.label),
        otherIncome: Math.round(otherIncTotal),
        needFromPort: Math.round(baseNeed),
        // Gross portfolio outflow for spending + taxes. The cascade draws already
        // fund the tax bill, so do NOT add tax on top; RMD is a real outflow too.
        totalWithdrawal: Math.round(rmd + fromCash + fromTaxable + fromPretax + fromRoth),
      });
    }

    const last = rows[rows.length - 1] || {};
    return {
      rows,
      totalTax:     cTax,
      finalPretax:  last.pretaxEnd  || 0,
      finalRoth:    last.rothEnd    || 0,
      finalCash:    last.cashEnd    || 0,
      finalTaxable: last.taxableEnd || 0,
    };
  }

  const smart = runScenario(true);
  const naive = runScenario(false);

  const summary = {
    lifetimeTaxSmart:    smart.totalTax,
    lifetimeTaxNaive:    naive.totalTax,
    taxSavings:          naive.totalTax - smart.totalTax,
    finalRothSmart:      smart.finalRoth,
    finalRothNaive:      naive.finalRoth,
    irmaaYearsTriggered: smart.rows.filter(r => r.landmines.irmaaTriggered).length,
    ssTorpedoYears:      smart.rows.filter(r => r.landmines.ssTorpedo).length,
  };

  return { smart, naive, summary };
}

function emptySummary() {
  return {
    lifetimeTaxSmart: 0, lifetimeTaxNaive: 0, taxSavings: 0,
    finalRothSmart: 0, finalRothNaive: 0,
    irmaaYearsTriggered: 0, ssTorpedoYears: 0,
  };
}
