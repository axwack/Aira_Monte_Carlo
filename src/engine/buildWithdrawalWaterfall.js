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
  getStateBrackets,
  getRmdStartAge,
  FED_BRACKETS_2026_MFJ,
  FED_BRACKETS_2026_SINGLE,
  LTCG_BRACKETS_2026_MFJ,
  LTCG_BRACKETS_2026_SINGLE,
  NIIT_THRESHOLD_MFJ,
  NIIT_THRESHOLD_SINGLE,
  NIIT_RATE,
  RMD_DIV,
  JOINT_RMD_DIV,
} from "./buildRothExplorer.js";
import { mortgageSchedule, mortgageAnnualPayments, computeOtherIncome } from "./expenses.js";
import { scheduleSpendForYear } from "./expenseImport.js";
import { expectedReturn } from "./expectedReturn.js";

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
export function accumulateToRetirement(params = {}) {
  const { currentAge, retireAge, accounts = [], preRetireEq = 91, cashRealReturn, gr: grParam, taxableBasisPct = 70 } = params;
  // This function only models the PRE-retirement accumulation phase, so the
  // pre-retirement equity glide (preRetireEq) — not postRetireEq — drives the
  // default growth rate here, mirroring runMC's portReturn age<62 branch.
  const gr     = grParam ?? (expectedReturn(preRetireEq) / 100);
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
  const taxableBasis0 = taxable0 * (Math.max(0, Math.min(100, taxableBasisPct)) / 100);

  const accYrs = Math.max(0, (retireAge ?? 0) - (currentAge ?? 0));
  for (let y = 0; y < accYrs; y++) {
    pretax0  *= (1 + gr);
    roth0    *= (1 + gr);
    taxable0 *= (1 + gr);
    cash0    *= (1 + cashGr);
  }

  return { pretax0, roth0, taxable0, cash0, total: pretax0 + roth0 + taxable0 + cash0, taxableBasis0 };
}

/**
 * Main export.
 * @param {object} params — full AiRA profile object
 * @returns {{ smart: ScenarioResult, naive: ScenarioResult, summary: Summary }}
 */
export function buildWithdrawalWaterfall(params = {}) {
  const {
    currentAge,
    retireAge,
    endAge       = 90,
    sp: baseSp   = 80_000,
    ssAge        = 67,
    ssb          = 0,
    ssCola       = 2.4,
    ab           = 0,
    abEndYear    = null,
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
    preRetireEq = 91,
    postRetireEq = 70,
    cashRealReturn,
    gr: grParam,
    taxableBasisPct = 70,
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
    otherIncomes = [],
    spSchedule   = null,
  } = params;

  if (currentAge == null || retireAge == null) {
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
  // Accumulation (pre-retirement) phase uses preGr — accumulateToRetirement
  // derives its own default from preRetireEq too, but pass it explicitly here
  // so an explicit grParam override (if given) also applies to this phase.
  const { pretax0, roth0, taxable0, cash0, taxableBasis0 } = accumulateToRetirement({ currentAge, retireAge, accounts, cashRealReturn, gr: preGr, taxableBasisPct });

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
  function yearTax(age, yr, fromPretax, ssGross, annuityTaxable, rmd, inflFactor, otherTaxable = 0, ltcg = 0) {
    const iF  = inflFactor;
    const fB  = idxB(fedBase, iF);
    const sd  = stdDed(age, isMFJ, iF);
    // IRC §86 provisional-income tiers (0% / 50% / 85% of SS taxable). Realized
    // gains count toward provisional income (they're part of MAGI) even though
    // they are NOT part of ordinary otherOrdInc/totInc below.
    const otherOrdInc = annuityTaxable + rmd + fromPretax + otherTaxable;
    const taxSS = Math.round(taxableSocialSecurity(ssGross, otherOrdInc + ltcg, isMFJ));
    const totInc = taxSS + otherOrdInc; // ordinary income total (excludes LTCG)
    const txInc  = Math.max(0, totInc - sd);
    // LTCG stacks ON TOP of ordinary income — the standard deduction soaks into
    // gains first if ordinary income didn't fully use it.
    const gainTxInc = Math.max(0, totInc + ltcg - sd) - txInc;
    const fedOrdinary = progTax(txInc, fB);

    // LTCG bracket walk over the stacked interval [txInc, txInc + gainTxInc).
    const ltcgBr = idxB(isMFJ ? LTCG_BRACKETS_2026_MFJ : LTCG_BRACKETS_2026_SINGLE, iF);
    const ltcgTax = Math.round(progTax(txInc + gainTxInc, ltcgBr) - progTax(txInc, ltcgBr));

    // IRMAA MAGI = AGI (incl. the full realized gain) + tax-exempt interest;
    // untaxed SS is NOT added back.
    const magi = totInc + ltcg;

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
    const irmaa  = age >= 65 ? irmaaCost(magi, yr, infR, isMFJ) : 0;
    let margR = 0;
    for (const b of fB) { if (txInc > b.lo) margR = b.rate; else break; }
    return { fedTax: fedT, stateTax: stT, irmaa, totalTax: fedT + stT, irmaaFull: fedT + stT + irmaa,
             effectiveRate: (totInc + ltcg) > 0 ? (fedT + stT) / (totInc + ltcg) : 0, marginalBracket: margR,
             taxableIncome: txInc, totInc, taxSS, ltcgTax, niit, realizedGain: Math.round(ltcg) };
  }

  // ── Scenario runner ────────────────────────────────────────────────────────
  function runScenario(isSmart) {
    let pretax = pretax0, roth = roth0, taxable = taxable0, cash = cash0;
    // Smart and naive each track their own basis (they draw taxable differently
    // year to year), both seeded from the same taxableBasis0.
    let taxableBasis = taxableBasis0;
    const rows = [];
    // Post-retirement per-year growth mirrors runMC's portReturn age-62 switch:
    // preGr below 62 (even though already retired), postGr from 62 on.
    let sp = baseSp, lastRet = retireAge < 62 ? preGr : postGr;
    const totalPort0 = pretax + roth + taxable + cash;
    // Baseline initWR = NET PORTFOLIO NEED at retirement / portfolio — the same
    // quantity (income-offset gross spend, plus housing/carveouts) the yearly
    // loop's `netNeed` computes, evaluated at the retirement year. ab0 includes
    // propIncome to match this engine's own `annuity` term below (Step 1) —
    // otherwise the baseline and the tracked ratio would drift apart even
    // within this one engine.
    const ss0  = retireAge >= ssAge ? ssb : 0;
    const iF0  = Math.pow(1 + infR, retireYear - BASE_YEAR);
    const ab0  = (ab > 0 ? ab : 0) + Math.round((propIncome || 0) * iF0);
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
      // Per-year growth rate — mirrors runMC's portReturn age-62 switch
      // (preRetireEq below 62, postRetireEq from 62 on), not just a flat
      // post-retirement rate, so a profile that retires before 62 still
      // tracks runMC's glide path exactly.
      const gr = age < 62 ? preGr : postGr;

      // ── Step 1: Fixed income (computed BEFORE the spend adjustment so GK's
      // netNeed offset can use this year's own income/fixed-cost figures) ──
      const ss = age >= ssAge
        ? Math.round(ssb * Math.pow(1 + (ssCola || 2.4) / 100, age - ssAge))
        : 0;
      const annuity = (ab > 0 && (abEndYear == null || yr <= abEndYear) && age <= 80
        ? Math.round(ab * Math.pow(1.03, Math.min(age - retireAge, 20)))
        : 0) + Math.round((propIncome || 0) * iF);
      const fixedIncome = ss + annuity;

      // Other income streams (pensions, part-time work, etc.) — offset "need"
      // and, if taxable, stack as ordinary income alongside RMDs/pretax draws.
      const { total: otherIncTotal, totalTaxable: otherIncTaxable } = computeOtherIncome(otherIncomes, yr);

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
          sp = gkWithdraw(
            totalPort, initWR, sp, lastRet, infR, adjFloor, adjCeiling,
            fixedIncome + otherIncTotal, housingCost + carveoutCost
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
      const baseNeed = Math.max(0, sp - fixedIncome - otherIncTotal) + housingCost + carveoutCost;

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
        fromCash = 0; fromTaxable = 0; fromPretax = 0;
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
            const taxSoFar = Math.max(0, Math.round(ss * 0.85) + rmd + annuity + otherIncTaxable - sd);
            let ceiling = bracketCeiling(withdrawalBracketTarget, isMFJ, iF);

            if (irmaaGuard && age >= 63) {
              const irmaaTier1 = isMFJ ? IRMAA_TIER1_2026_MFJ : IRMAA_TIER1_2026_SINGLE;
              const irmaaCap = Math.round(irmaaTier1 * iF) - sd;
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

        if (isSmart) {
          drawCash();
          drawTaxable();
          drawPretax();
        } else {
          drawPretax();   // pretax first — the whole point of the "without planning" view
          drawCash();
          drawTaxable();
        }

        // Step 6 — Roth (last resort, reserve respected in smart mode)
        const rothFloor = isSmart ? (rothEmergencyReserve || 0) : 0;
        const rothAvail = Math.max(0, roth - rothFloor);
        fromRoth = Math.min(need, rothAvail);
        rothReserveHeld = Math.max(0, roth - rothFloor - fromRoth);
        need -= fromRoth;

        // Realized LTCG on this pass's taxable draw — READ-ONLY off the current
        // (pre-draw) taxable balance/basis; the real `taxableBasis` is mutated
        // exactly once below, after the fixed point converges.
        const gPass = realizedGainFor(fromTaxable, taxable, taxableBasis);
        // Source-aware tax on this pass's draws; converge on the funded amount.
        taxNoConv = yearTax(age, yr, fromPretax, ss, annuity, rmd, iF, otherIncTaxable, gPass);
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
      if (isSmart) {
        const pretaxAfterDraw = Math.max(0, pretax - fromPretax);
        const override = overrideMap.get(yr);
        if (override != null) {
          convAmt = Math.min(Math.max(0, override), pretaxAfterDraw);
        } else if (rothConversionTarget && rothConversionTarget !== "off" && pretaxAfterDraw > 1000) {
          const sdConv = stdDed(age, isMFJ, iF);
          const ceilingConv = bracketCeiling(rothConversionTarget, isMFJ, iF);
          const room = Math.max(0, ceilingConv + sdConv - taxNoConv.totInc);
          if (room > 500) convAmt = Math.min(room, pretaxAfterDraw);
        }
      }

      // ── Step 7: Tax calculation — conversion stacks as ordinary income ───
      // Same `realizedGain` passed to both the with-conversion and no-conversion
      // yearTax calls (taxNoConv above already used it) so the LTCG tax cancels
      // out of the delta and convTax isolates the conversion's own cost.
      let tax     = convAmt > 0 ? yearTax(age, yr, fromPretax + convAmt, ss, annuity, rmd, iF, otherIncTaxable, realizedGain) : taxNoConv;
      let convTax = convAmt > 0 ? Math.max(0, tax.totalTax - taxNoConv.totalTax) : 0;

      // Affordability: pretax must cover both the conversion and its incremental tax.
      // Shrink (rather than zero out) when the full fill can't be afforded — converging
      // toward the largest conversion the remaining pretax balance can self-fund.
      if (convAmt > 0) {
        for (let i = 0; i < 5 && convAmt > 0; i++) {
          const shortfall = (convAmt + convTax) - (pretax - fromPretax);
          if (shortfall <= 0) break;
          convAmt = Math.max(0, convAmt - shortfall);
          tax     = convAmt > 0 ? yearTax(age, yr, fromPretax + convAmt, ss, annuity, rmd, iF, otherIncTaxable, realizedGain) : taxNoConv;
          convTax = convAmt > 0 ? Math.max(0, tax.totalTax - taxNoConv.totalTax) : 0;
        }
        if (convAmt <= 500) {
          convAmt = 0;
          convTax = 0;
          tax = taxNoConv;
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
      cash    = Math.max(0, cash    - fromCash)    * (1 + cashGr);
      taxable = (Math.max(0, taxable - fromTaxable) + rmdExcess) * (1 + gr);
      pretax  = Math.max(0, pretax  - fromPretax - convAmt - convTax) * (1 + gr);
      roth    = Math.max(0, roth    - fromRoth + convAmt) * (1 + gr);

      lastRet = gr;
      cTax += tax.totalTax;

      rows.push({
        age, yr,
        ss, annuityRental: annuity, fixedIncomeTotal: fixedIncome,
        rmd, rmdActive,
        fromCash, fromTaxable, fromPretax, pretaxCapReason,
        fromRoth, rothReserveHeld,
        conversionAmount: Math.round(convAmt), conversionTax: convTax,
        fedTax: tax.fedTax, stateTax: tax.stateTax, irmaa: tax.irmaa,
        totalTax: tax.totalTax, irmaaFull: tax.irmaaFull,
        effectiveRate: tax.effectiveRate, marginalBracket: tax.marginalBracket,
        taxableIncome: tax.taxableIncome, totInc: tax.totInc,
        realizedGain: Math.round(realizedGain), ltcgTax: tax.ltcgTax, niit: tax.niit, taxSS: tax.taxSS,
        landmines: { ssTorpedo, irmaaTriggered, rmdActive },
        cashEnd:    Math.round(cash),
        taxableEnd: Math.round(taxable),
        pretaxEnd:  Math.round(pretax),
        rothEnd:    Math.round(roth),
        totalPort:  Math.round(cash + taxable + pretax + roth),
        spending:   Math.round(sp),
        housingCost: Math.round(housingCost),
        carveoutCost: Math.round(carveoutCost),
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
