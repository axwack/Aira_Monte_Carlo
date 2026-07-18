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
  RMD_DIV,
  JOINT_RMD_DIV,
} from "./buildRothExplorer.js";
import { mortgageSchedule, computeOtherIncome } from "./expenses.js";
import { scheduleSpendForYear } from "./expenseImport.js";

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
 * Grows a profile's account balances from currentAge to retireAge using the
 * same per-bucket rates buildWithdrawalWaterfall uses (gr for pretax/roth/
 * taxable, a conservative cashGr for cash/HSA). Exported so other views
 * (e.g. the deterministic schedule's "Portfolio at Retirement" metric) agree
 * with the waterfall's own starting balances instead of re-deriving them.
 * @returns {{ pretax0: number, roth0: number, taxable0: number, cash0: number, total: number }}
 */
export function accumulateToRetirement(params = {}) {
  const { currentAge, retireAge, accounts = [], gr: grParam } = params;
  const gr     = grParam ?? 0.07;
  const cashGr = 0.045;

  let pretax0 = 0, roth0 = 0, taxable0 = 0, cash0 = 0;
  for (const a of accounts) {
    const bal = a.balance || 0;
    if      (a.category === "pretax")  pretax0  += bal;
    else if (a.category === "roth")    roth0    += bal;
    else if (a.category === "taxable") taxable0 += bal;
    else                               cash0    += bal; // cash + hsa
  }

  const accYrs = Math.max(0, (retireAge ?? 0) - (currentAge ?? 0));
  for (let y = 0; y < accYrs; y++) {
    pretax0  *= (1 + gr);
    roth0    *= (1 + gr);
    taxable0 *= (1 + gr);
    cash0    *= (1 + cashGr);
  }

  return { pretax0, roth0, taxable0, cash0, total: pretax0 + roth0 + taxable0 + cash0 };
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
    gr: grParam,
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
  const gr         = grParam ?? 0.07;
  const cashGr     = 0.045; // conservative cash/SGOV return
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
  const { pretax0, roth0, taxable0, cash0 } = accumulateToRetirement({ currentAge, retireAge, accounts, gr });

  // Pre-compute annual mortgage P&I obligation (constant across all years,
  // mirrors runMC) — housing cost is part of "need" until the mortgage payoff year.
  let mortAnnualPI = 0, mortPayoffYr = 0;
  if (mortBalance > 0) {
    const ms = mortgageSchedule(mortBalance, mortRate || 6.5, mortStart || "2020-01", mortTerm || 30, mortExtra || 0);
    mortAnnualPI = ms.pmt * 12;
    mortPayoffYr = ms.payoffYr;
  }

  // ── Guyton-Klinger helper (mirrors App.jsx implementation) ─────────────────
  function gkWithdraw(port, initWR, lastW, lastRet, inflRate, floor, ceiling) {
    if (!port || port <= 0) return floor || 0;
    // Cap the CPI pass-through per the original GK paper (App.jsx's
    // guytonKlingerWithdrawal applies the same GK_INFLATION_CAP = 0.06) — only
    // the inflation step is capped, not the whole withdrawal formula.
    const cappedInfl = Math.min(GK_INFLATION_CAP, inflRate);
    let w = lastRet >= 0 ? lastW * (1 + cappedInfl) : lastW;
    const cur = port > 0 ? w / port : 0;
    if (cur <= initWR * 0.8) w *= 1.1;
    else if (cur >= initWR * 1.2) w *= 0.9;
    return Math.max(floor || 0, Math.min(ceiling || Infinity, w));
  }

  // ── Tax helpers ────────────────────────────────────────────────────────────
  function yearTax(age, yr, fromPretax, ssGross, annuityTaxable, rmd, inflFactor, otherTaxable = 0) {
    const iF  = inflFactor;
    const fB  = idxB(fedBase, iF);
    const sd  = stdDed(age, isMFJ, iF);
    // IRC §86 provisional-income tiers (0% / 50% / 85% of SS taxable)
    const otherOrdInc = annuityTaxable + rmd + fromPretax + otherTaxable;
    const taxSS = Math.round(taxableSocialSecurity(ssGross, otherOrdInc, isMFJ));
    const totInc = taxSS + otherOrdInc;
    const txInc  = Math.max(0, totInc - sd);
    const fedT   = Math.round(progTax(txInc, fB));
    const stT    = stateBr0 ? Math.round(progTax(txInc, idxB(stateBr0, iF))) : 0;
    // IRMAA MAGI = AGI + tax-exempt interest; untaxed SS is NOT added back
    const magi   = totInc;
    const irmaa  = age >= 65 ? irmaaCost(magi, yr, infR, isMFJ) : 0;
    let margR = 0;
    for (const b of fB) { if (txInc > b.lo) margR = b.rate; else break; }
    return { fedTax: fedT, stateTax: stT, irmaa, totalTax: fedT + stT, irmaaFull: fedT + stT + irmaa,
             effectiveRate: totInc > 0 ? (fedT + stT) / totInc : 0, marginalBracket: margR,
             taxableIncome: txInc, totInc, taxSS };
  }

  // ── Scenario runner ────────────────────────────────────────────────────────
  function runScenario(isSmart) {
    let pretax = pretax0, roth = roth0, taxable = taxable0, cash = cash0;
    const rows = [];
    let sp = baseSp, lastRet = gr;
    const totalPort0 = pretax + roth + taxable + cash;
    const ss0 = retireAge >= ssAge ? ssb : 0;
    const ab0 = ab > 0 ? ab : 0;
    const initDraw = Math.max(0, baseSp - ss0 - ab0);
    const initWR = totalPort0 > 0 ? initDraw / totalPort0 : 0.04;
    let cTax = 0;

    for (let age = retireAge; age <= endAge; age++) {
      const yr  = retireYear + (age - retireAge);
      const iF  = Math.pow(1 + infR, yr - BASE_YEAR);
      const adjFloor   = Math.round(gkFloor   * iF);
      const adjCeiling = Math.round(gkCeiling * iF);

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
          sp = gkWithdraw(totalPort, initWR, sp, lastRet, infR, adjFloor, adjCeiling);
        } else {
          sp = sp * (1 + infR);
        }
      }

      // ── Step 1: Fixed income ────────────────────────────────────────────
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

      // Housing cost: mortgage P&I while the loan is active, or inflation-adjusted
      // rent — same model as runMC's `housingCost`.
      let housingCost = 0;
      if (housingType === "own") {
        housingCost = mortAnnualPI > 0 && yr < mortPayoffYr ? mortAnnualPI : 0;
      } else if (housingType === "rent") {
        housingCost = Math.round((annualRent || 0) * iF);
      }

      // Other fixed expenses (HOA, insurance, college, etc.) active this year.
      const carveoutCost = carveouts.reduce((sum, c) => {
        return sum + (yr <= (c.endYear || 9999) ? Math.round((c.annual || 0) * iF) : 0);
      }, 0);

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

      for (let pass = 0; pass < 4; pass++) {
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

        // Source-aware tax on this pass's draws; converge on the funded amount.
        taxNoConv = yearTax(age, yr, fromPretax, ss, annuity, rmd, iF, otherIncTaxable);
        const newTax = taxNoConv.irmaaFull; // fed + state + IRMAA are all real cash costs
        if (Math.abs(newTax - taxDue) < 1) { taxDue = newTax; break; }
        taxDue = newTax;
      }

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
      let tax     = convAmt > 0 ? yearTax(age, yr, fromPretax + convAmt, ss, annuity, rmd, iF, otherIncTaxable) : taxNoConv;
      let convTax = convAmt > 0 ? Math.max(0, tax.totalTax - taxNoConv.totalTax) : 0;

      // Affordability: pretax must cover both the conversion and its incremental tax.
      // Shrink (rather than zero out) when the full fill can't be afforded — converging
      // toward the largest conversion the remaining pretax balance can self-fund.
      if (convAmt > 0) {
        for (let i = 0; i < 5 && convAmt > 0; i++) {
          const shortfall = (convAmt + convTax) - (pretax - fromPretax);
          if (shortfall <= 0) break;
          convAmt = Math.max(0, convAmt - shortfall);
          tax     = convAmt > 0 ? yearTax(age, yr, fromPretax + convAmt, ss, annuity, rmd, iF, otherIncTaxable) : taxNoConv;
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
