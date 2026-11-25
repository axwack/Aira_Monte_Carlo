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
} from "./buildRothExplorer.js";
import { jointRmdDivisor } from "../data/jointRmdTable.js";
import { mortgageSchedule, mortgageAnnualPayments, computeOtherIncome, computeCashFlowEvents, spendingSmileFactor, expectedHealthcareShock } from "./expenses.js";
import { jobContributionsForYear } from "./contributions.js";
import { spouseAgeAt, personsAtLeastAge, spouseDeathOnPrimaryClock, filesJointlyAt, planEndAgeOnPrimaryClock, survivorAgeOnPrimaryClock, survivorIsPrimary, spouseAgeOffset } from "./ages.js";
import { earlyWithdrawalPenalty, detectEmployerPlan, ruleOf55SeparationQualifies, EARLY_PENALTY_RATE, EARLY_PENALTY_AGE } from "./earlyWithdrawal.js";
import { scheduleSpendForYear } from "./expenseImport.js";
import { expectedReturn } from "./expectedReturn.js";
import { resolveGlidepathSwitchAge } from "./glidepath.js";
import { taxableYieldSplit } from "./taxableYield.js";

const BASE_YEAR = new Date().getFullYear();

const STD_DED_MFJ    = 32_200;
const STD_DED_SINGLE = 16_100;
const AGE_BONUS_MFJ    = 3_300;
const AGE_BONUS_SINGLE = 1_650;
const AGE_BONUS_UNMARRIED = 2_050;

const IRMAA_TIER1_2026_MFJ    = 218_000;
const IRMAA_TIER1_2026_SINGLE = 109_000;

const GK_INFLATION_CAP = 0.06;

const BRACKET_CEILINGS_MFJ    = { "10": 24_800, "12": 100_800, "22": 211_400, "24": 403_550, "32": 512_450, "35": 768_700, "37": Infinity, "irmaa": 218_000 };
const BRACKET_CEILINGS_SINGLE = { "10": 12_400, "12": 50_400,  "22": 105_700, "24": 201_775, "32": 256_225, "35": 640_600, "37": Infinity, "irmaa": 109_000 };

export function stdDed(age, isMFJ, inflFactor, spouseAge = null) {
  const base    = isMFJ ? STD_DED_MFJ : STD_DED_SINGLE;
  const perHead = isMFJ ? AGE_BONUS_SINGLE : AGE_BONUS_UNMARRIED;
  const seniors = personsAtLeastAge(age, spouseAge, isMFJ, 65);
  return Math.round((base + seniors * perHead) * inflFactor);
}

function bracketCeiling(target, isMFJ, inflFactor) {
  if (!target || target === "off") return Infinity;
  const tbl = isMFJ ? BRACKET_CEILINGS_MFJ : BRACKET_CEILINGS_SINGLE;
  const base = tbl[target] ?? tbl["22"];
  return base === Infinity ? Infinity : Math.round(base * inflFactor);
}

function realizedGainFor(draw, balance, basis) {
  if (!draw || draw <= 0 || !balance || balance <= 0) return 0;
  const frac = Math.max(0, 1 - (basis || 0) / balance);
  return draw * frac;
}

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
    hsaContrib = 0, taxableContrib = 0,
    cashFlowEvents = [], inf = 2.5,
    preRetireReturn,
  } = params;
  const glideSwitchAge = resolveGlidepathSwitchAge(params);
  const grFor  = (age) => grParam ?? (expectedReturn(age < glideSwitchAge ? preRetireEq : postRetireEq) / 100);
  const cashGr = (cashRealReturn ?? 3.0) / 100;
  const flatPreRetGr = (() => {
    const v = preRetireReturn;
    if (v === "" || v == null || !Number.isFinite(Number(v))) return null;
    return Number(v) / 100;
  })();

  let pretax0 = 0, roth0 = 0, taxable0 = 0, cash0 = 0, hsa0 = 0;
  for (const a of accounts) {
    const bal = a.balance || 0;
    if      (a.category === "pretax")  pretax0  += bal;
    else if (a.category === "roth")    roth0    += bal;
    else if (a.category === "taxable") taxable0 += bal;
    else if (a.category === "hsa")     hsa0     += bal;
    else                               cash0    += bal;
  }

  let taxableBasis0 = taxable0 * (Math.max(0, Math.min(100, taxableBasisPct)) / 100);

  const accYrs = Math.max(0, (retireAge ?? 0) - (currentAge ?? 0));
  for (let y = 0; y < accYrs; y++) {
    const gr = flatPreRetGr ?? grFor((currentAge ?? 0) + y);
    const cGr = flatPreRetGr ?? cashGr;
    pretax0  *= (1 + gr);
    roth0    *= (1 + gr);
    taxable0 *= (1 + gr);
    hsa0     *= (1 + gr);
    cash0    *= (1 + cGr);
    const jc = jobContributionsForYear(params, (currentAge ?? 0) + y);
    pretax0  += jc.pretax;
    hsa0     += hsaContrib;
    roth0    += jc.roth;
    taxable0 += taxableContrib;
    taxableBasis0 += taxableContrib;
    const ev = computeCashFlowEvents(cashFlowEvents, BASE_YEAR + y, inf, BASE_YEAR);
    if (ev.inflow > 0) {
      pretax0  += ev.byBucket.pretax || 0;
      roth0    += ev.byBucket.roth   || 0;
      cash0    += ev.byBucket.cash   || 0;
      const taxableIn = ev.byBucket.taxable || 0;
      taxable0 += taxableIn;
      taxableBasis0 += taxableIn;
    }
  }

  const cash0Total = cash0 + hsa0;
  return { pretax0, roth0, taxable0, cash0: cash0Total, total: pretax0 + roth0 + taxable0 + cash0Total, taxableBasis0 };
}

export const WITHDRAWAL_BUCKETS = ["cash", "taxable", "pretax", "roth"];

export const NAIVE_DRAW_ORDER = ["pretax", "cash", "taxable", "roth"];

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
  return ["cash", "taxable", "pretax", "roth"];
}

export function migrateOrderingMode(profile) {
  if (!profile || typeof profile !== "object") return profile;
  if (profile.orderingMode !== "three_bucket") return profile;
  return { ...profile, orderingMode: "tax_reactive" };
}

export function buildWithdrawalWaterfall(params = {}) {
  const {
    currentAge,
    endAge       = 90,
    sp: baseSp   = 80_000,
    ab           = 0,
    abEndYear    = null,
    abGrowth     = 3.0,
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
    withdrawalBracketTarget = "22",
    irmaaGuard           = false,
    ssTorpedoGuard       = false,
    rothEmergencyReserve = 0,
    rothConversionTarget = "off",
    conversionOverrides  = [],
    orderingMode    = "tax_reactive",
    withdrawalOrder = ["cash", "taxable", "pretax", "roth"],
    preRetireEq = 91,
    postRetireEq = 70,
    cashRealReturn,
    gr: grParam,
    taxableBasisPct = 70,
    taxableYieldPct = 0,
    taxableYieldOrdinaryPct = 50,
    contrib = 0,
    employerContrib = 0,
    hsaContrib = 0,
    taxableContrib = 0,
    rothContrib = 0,
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
    ruleOf55     = false,
    sepp72t      = false,
    sepp72tStartAge = null,
  } = params;

  const ruleOf55Share = detectEmployerPlan(params.accounts).share;

  const retireAge = effectiveRetireAge(retireAgeRaw, currentAge);

  const ruleOf55Ok = ruleOf55SeparationQualifies({
    dob: params.dob, birthYear: params.birthYear,
    currentAge: params.currentAge, retireAge,
  });

  if (currentAge == null || retireAgeRaw == null) {
    const empty = { rows: [], totalTax: 0, finalPretax: 0, finalRoth: 0, finalCash: 0, finalTaxable: 0 };
    return { smart: empty, naive: empty, summary: emptySummary() };
  }

  const isMFJ      = filingStatus !== "single";
  const spAgeAt    = (a) => spouseAgeAt(params, a);
  const infR       = inf / 100;
  const preGr      = grParam ?? (expectedReturn(preRetireEq) / 100);
  const postGr     = grParam ?? (expectedReturn(postRetireEq) / 100);
  const glideSwitchAge = resolveGlidepathSwitchAge({ ...params, retireAge });
  const cashGr     = (cashRealReturn ?? 3.0) / 100;
  const retireYear = BASE_YEAR + (retireAge - currentAge);
  const rmdAge     = (typeof rmdStartAge === "number" && rmdStartAge > 0)
    ? rmdStartAge
    : getRmdStartAge({ dob, birthYear, currentAge });

  const survivorFrom = spouseDeathOnPrimaryClock(params);
  const planEnd      = planEndAgeOnPrimaryClock(params, endAge);

  const perPersonAgeAt = (a) => (isSurvivorAt(a) ? survivorAgeOnPrimaryClock(params, a) : a);

  const rmdStartOnPrimaryClock = (() => {
    if (survivorIsPrimary(params)) return rmdAge;
    const off = spouseAgeOffset(params);
    const spouseRmdAge = getRmdStartAge({
      dob: params.spouse?.dob, birthYear: params.spouse?.birthYear,
      currentAge: params.spouse?.currentAge,
    });
    return spouseRmdAge + off;
  })();
  const rmdAgeAt = (a) => (isSurvivorAt(a) ? rmdStartOnPrimaryClock : rmdAge);
  const mfjAt = (a) => filesJointlyAt(params, a);
  const isSurvivorAt = (a) => a > survivorFrom;

  const fedBaseAt  = (a) => (mfjAt(a) ? FED_BRACKETS_2026_MFJ : FED_BRACKETS_2026_SINGLE);
  const stateBrAt  = (a) => (twoHousehold ? null : getStateBrackets(stateOfResidence, mfjAt(a)));

  const overrideMap = new Map();
  for (const o of conversionOverrides) {
    overrideMap.set(Number(o.year), Number(o.amount) || 0);
  }

  const { pretax0, roth0, taxable0, cash0, taxableBasis0 } = accumulateToRetirement({
    currentAge, retireAge, accounts, cashRealReturn, taxableBasisPct,
    preRetireEq, postRetireEq, glidepathSwitchAge: glideSwitchAge,
    ...(grParam != null ? { gr: grParam } : {}),
    contrib, employerContrib, hsaContrib, taxableContrib, rothContrib,
    cashFlowEvents, inf,
  });

  let mortByYear = new Map();
  if (mortBalance > 0) {
    const ms = mortgageSchedule(mortBalance, mortRate ?? 6.5, mortStart || "2020-01", mortTerm || 30, mortExtra || 0);
    mortByYear = mortgageAnnualPayments(ms);
  }

  function gkWithdraw(port, initWR, lastW, lastRet, inflRate, floor, ceiling, incomeOffset = 0, fixedCosts = 0) {
    if (!port || port <= 0) return floor || 0;
    const cappedInfl = Math.min(GK_INFLATION_CAP, inflRate);
    let w = lastRet >= 0 ? lastW * (1 + cappedInfl) : lastW;
    if (initWR > 0) {
      const netNeed = Math.max(0, w - incomeOffset) + fixedCosts;
      const cur = port > 0 ? netNeed / port : 0;
      if (cur <= initWR * 0.8) w *= 1.1;
      else if (cur >= initWR * 1.2) w *= 0.9;
    }
    return Math.max(floor || 0, Math.min(ceiling || Infinity, w));
  }

  function yearTax(age, yr, fromPretax, ssGross, annuityTaxable, rmd, inflFactor, otherTaxable = 0, ltcg = 0, magiLookback = null) {
    const iF  = inflFactor;
    const fB  = idxB(fedBaseAt(age), iF);
    const otherOrdInc = annuityTaxable + rmd + fromPretax + otherTaxable;
    const taxSS = Math.round(taxableSocialSecurity(ssGross, otherOrdInc + ltcg, mfjAt(age)));
    const totInc = taxSS + otherOrdInc;
    const magi = totInc + ltcg;
    const sd  = stdDed(perPersonAgeAt(age), mfjAt(age), iF, spAgeAt(age));
    const seniorBonus = getSeniorBonusDeduction(perPersonAgeAt(age), mfjAt(age) ? "mfj" : "single", magi, yr, spAgeAt(age));
    const ded = sd + seniorBonus;
    const txInc  = Math.max(0, totInc - ded);
    const gainTxInc = Math.max(0, totInc + ltcg - ded) - txInc;
    const fedOrdinary = progTax(txInc, fB);

    const ltcgBr = idxB(mfjAt(age) ? LTCG_BRACKETS_2026_MFJ : LTCG_BRACKETS_2026_SINGLE, iF);
    const ltcgTax = Math.round(progTax(txInc + gainTxInc, ltcgBr) - progTax(txInc, ltcgBr));

    const niitThreshold = mfjAt(age) ? NIIT_THRESHOLD_MFJ : NIIT_THRESHOLD_SINGLE;
    const niit = ltcg > 0 ? Math.round(NIIT_RATE * Math.min(ltcg, Math.max(0, magi - niitThreshold))) : 0;

    const fedT   = Math.round(fedOrdinary) + ltcgTax + niit;
    const stBr   = stateBrAt(age);
    const stateTaxSS = stateOfResidence === "NJ" ? taxSS : 0;
    const stT    = stBr ? Math.round(progTax(Math.max(0, txInc - stateTaxSS) + ltcg, idxB(stBr, iF))) : 0;
    const irmaaMagi = (typeof magiLookback === "number" && !isNaN(magiLookback)) ? magiLookback : magi;
    const medicareHeads = personsAtLeastAge(perPersonAgeAt(age), spAgeAt(age), mfjAt(age), 65);
    const irmaa  = medicareHeads > 0
      ? irmaaCost(irmaaMagi, yr, infR, mfjAt(age), medicareHeads)
      : 0;
    let margR = 0;
    for (const b of fB) { if (txInc > b.lo) margR = b.rate; else break; }
    return { fedTax: fedT, stateTax: stT, irmaa, totalTax: fedT + stT, irmaaFull: fedT + stT + irmaa,
             effectiveRate: (totInc + ltcg) > 0 ? (fedT + stT) / (totInc + ltcg) : 0, marginalBracket: margR,
             fedBrackets: fB, deduction: Math.round(ded), fedOrdinary: Math.round(fedOrdinary),
             taxableIncome: txInc, totInc, taxSS, ltcgTax, niit, realizedGain: Math.round(ltcg),
             magi };
  }

  const smartDrawOrder = resolveDrawOrder(orderingMode, withdrawalOrder);

  function runScenario(isSmart) {
    let pretax = pretax0, roth = roth0, taxable = taxable0, cash = cash0;
    let taxableBasis = taxableBasis0;
    const rows = [];
    const magiByAge = new Map();
    let sp = baseSp, lastRet = postGr;
    const totalPort0 = pretax + roth + taxable + cash;
    const ss0  = computeHouseholdSS(params, retireAge);
    const iF0  = Math.pow(1 + infR, retireYear - BASE_YEAR);
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

    for (let age = retireAge; age <= planEnd; age++) {
      const yr  = retireYear + (age - retireAge);
      const iF  = Math.pow(1 + infR, yr - BASE_YEAR);
      const adjFloor   = Math.round(gkFloor   * iF);
      const adjCeiling = Math.round(gkCeiling * iF);
      const gr = age < glideSwitchAge ? preGr : postGr;

      const twoYrAge = age - 2;
      const magiLookback = (twoYrAge >= retireAge && magiByAge.has(twoYrAge))
        ? magiByAge.get(twoYrAge)
        : null;

      const ss = computeHouseholdSS(params, age);
      const abGrowthFactor = Math.pow(1 + (abGrowth ?? 3) / 100, Math.min(Math.max(0, age - retireAge), 20));
      const annuity = (abEndYear && yr > abEndYear)
        ? 0
        : Math.round(((ab > 0 ? ab : 0) + (propIncome || 0)) * abGrowthFactor);
      const fixedIncome = ss + annuity;

      let { total: otherIncTotal, totalTaxable: otherIncTaxable } = computeOtherIncome(otherIncomes, yr);

      let housingCost = 0;
      if (housingType === "own") {
        housingCost = mortByYear.get(yr) || 0;
      } else if (housingType === "rent") {
        housingCost = Math.round((annualRent || 0) * iF);
      }

      const ev = computeCashFlowEvents(cashFlowEvents, yr, inf, BASE_YEAR);
      const hcRisk = expectedHealthcareShock(age, { hcShockAge, hcProb, hcMin, hcMax }, iF);

      if (ev.inflow > 0) {
        pretax  += ev.byBucket.pretax  || 0;
        roth    += ev.byBucket.roth    || 0;
        cash    += ev.byBucket.cash    || 0;
        const taxableIn = ev.byBucket.taxable || 0;
        taxable += taxableIn;
        taxableBasis += taxableIn;
        otherIncTaxable += ev.inflowTaxable;
      }

      const { yieldAmount: taxableYieldAmt, ordinaryYield: taxableOrdYield, qualifiedYield: taxableQualYield } =
        taxableYieldSplit(taxable, taxableYieldPct, taxableYieldOrdinaryPct);
      otherIncTaxable += taxableOrdYield;

      const carveoutCost = carveouts.reduce((sum, c) => {
        return sum + (yr <= (c.endYear || 9999) ? Math.round((c.annual || 0) * iF) : 0);
      }, 0);

      const totalPort = pretax + roth + taxable + cash;
      if (spSchedule && spSchedule.length) {
        sp = scheduleSpendForYear(spSchedule, yr, inf);
      } else if (age > retireAge && totalPort > 0) {
        const yrsRemaining = endAge - age;
        if (yrsRemaining > 15) {
          const refWR = gkReferenceWR({
            plannedSpend: baseSp,
            cumInfl: Math.pow(1 + infR, age - retireAge),
            incomeOffset: fixedIncome + otherIncTotal,
            fixedCosts: housingCost + carveoutCost + ev.committed,
            portAtRetire: totalPort0,
          });
          sp = gkWithdraw(
            totalPort, refWR, sp, lastRet, infR, baseSp > 0 ? adjFloor : 0, adjCeiling,
            fixedIncome + otherIncTotal, housingCost + carveoutCost + ev.committed
          );
        } else {
          sp = sp * (1 + infR);
        }
      }

      let rmd = 0;
      if (age >= rmdAgeAt(age) && pretax > 0) {
        const jointDivisor = (useJointRmdTable && mfjAt(age))
          ? jointRmdDivisor(age, spouseAgeAt(params, age))
          : null;
        const divisor = jointDivisor ?? RMD_DIV[age] ?? 15.0;
        rmd = Math.round(pretax / divisor);
        pretax -= rmd;
      }

      const smileFactor = spendingSmileFactor(age, retireAge, smile !== false);
      const spSmiled = sp * smileFactor;
      const baseNeed = Math.max(0, spSmiled + housingCost + carveoutCost + ev.total - fixedIncome - otherIncTotal);

      const incomeSurplus = Math.max(0, (fixedIncome + otherIncTotal) - (spSmiled + housingCost + carveoutCost + ev.total));

      let fromCash = 0, fromTaxable = 0, fromPretax = 0, fromRoth = 0;
      let pretaxCapReason = "uncapped";
      let rothReserveHeld = 0;
      let rothReserveBroken = false;
      let taxNoConv = null;
      let taxDue = 0;
      let earlyPenalty = { penalty: 0, exemptAmount: 0, reason: "" };

      const cashStart = cash, taxableStart = taxable, pretaxStart = pretax, rothStart = roth;

      for (let pass = 0; pass < 12; pass++) {
        let need = Math.max(0, baseNeed + taxDue - rmd - incomeSurplus);
        fromCash = 0; fromTaxable = 0; fromPretax = 0; fromRoth = 0;
        pretaxCapReason = "uncapped";

        const drawCash    = () => { fromCash    = Math.min(need, cash);    need -= fromCash;    };
        const drawTaxable = () => { fromTaxable = Math.min(need, taxable); need -= fromTaxable; };

        const drawPretax = () => {
          let pretaxAllowed = need;
          const bracketSet = !!(withdrawalBracketTarget && withdrawalBracketTarget !== "off");
          const irmaaOn    = !!irmaaGuard && age >= 63;
          if (isSmart && (bracketSet || irmaaOn)) {
            const sd      = stdDed(perPersonAgeAt(age), mfjAt(age), iF, spAgeAt(age));
            const ordFloor = Math.round(ss * 0.85) + rmd + annuity + otherIncTaxable;
            let ceiling = bracketSet ? bracketCeiling(withdrawalBracketTarget, mfjAt(age), iF) : Infinity;
            const irmaaTier1 = mfjAt(age) ? IRMAA_TIER1_2026_MFJ : IRMAA_TIER1_2026_SINGLE;
            const ceilingForBonus = Number.isFinite(ceiling)
              ? ceiling
              : Math.max(0, Math.round(irmaaTier1 * iF) - sd);
            const roomPreBonus = Math.max(0, ceilingForBonus - (ordFloor - sd));
            const ded = sd + getSeniorBonusDeduction(
              perPersonAgeAt(age), mfjAt(age) ? "mfj" : "single", ordFloor + roomPreBonus, yr, spAgeAt(age)
            );
            const taxSoFar = ordFloor - ded;

            if (irmaaOn || withdrawalBracketTarget === "irmaa") {
              const irmaaCap = Math.round(irmaaTier1 * iF) - ded;
              if (irmaaCap < ceiling) {
                ceiling = irmaaCap;
                pretaxCapReason = "irmaa_ceil";
              }
            }

            if (Number.isFinite(ceiling)) {
              const room = Math.max(0, ceiling - taxSoFar);
              pretaxAllowed = Math.min(need, room);
              if (pretaxCapReason !== "irmaa_ceil") {
                pretaxCapReason = pretaxAllowed < need
                  ? `bracket_${withdrawalBracketTarget}`
                  : "uncapped";
              }
            }
          }

          fromPretax = Math.min(pretaxAllowed, pretax);
          if (pretax <= pretaxAllowed) pretaxCapReason = "exhausted";
          need -= fromPretax;
        };

        const drawRoth = () => {
          const rothFloor = isSmart ? (rothEmergencyReserve || 0) : 0;
          const rothAvail = Math.max(0, roth - rothFloor);
          fromRoth = Math.min(need, rothAvail);
          rothReserveHeld = Math.max(0, roth - rothFloor - fromRoth);
          need -= fromRoth;
        };

        const drawFns  = { cash: drawCash, taxable: drawTaxable, pretax: drawPretax, roth: drawRoth };
        const drawSeq  = isSmart ? smartDrawOrder : NAIVE_DRAW_ORDER;
        for (const bucket of drawSeq) drawFns[bucket]();

        if (need > 0.01 && pretax > fromPretax) {
          const extra = Math.min(need, pretax - fromPretax);
          fromPretax += extra;
          need -= extra;
          pretaxCapReason = "bracket_exceeded_to_fund_spending";
        }

        if (need > 0.01 && isSmart && (rothEmergencyReserve || 0) > 0) {
          const reserveLeft = Math.max(0, roth - fromRoth);
          if (reserveLeft > 0) {
            const extra = Math.min(need, reserveLeft);
            fromRoth += extra;
            need -= extra;
            rothReserveHeld = Math.max(0, roth - fromRoth);
            rothReserveBroken = true;
          }
        }

        const gPass = realizedGainFor(fromTaxable, taxable, taxableBasis);
        taxNoConv = yearTax(age, yr, fromPretax, ss, annuity, rmd, iF, otherIncTaxable, gPass + taxableQualYield, magiLookback);
        earlyPenalty = earlyWithdrawalPenalty({
          separationQualifies: ruleOf55Ok,
          age, pretaxDistribution: fromPretax + rmd,
          ruleOf55, ruleOf55Share, retireAge,
          sepp72t, sepp72tStartAge: sepp72tStartAge ?? retireAge,
        });
        const newTax = taxNoConv.irmaaFull + earlyPenalty.penalty;
        if (Math.abs(newTax - taxDue) < 1) { taxDue = newTax; break; }
        taxDue = newTax;
      }

      const realizedGain = realizedGainFor(fromTaxable, taxable, taxableBasis);

      let convAmt = 0;
      let convCapReason = null;
      let bracketTopYr = null, stdDedYr = null;
      if (isSmart) {
        const pretaxAfterDraw = Math.max(0, pretax - fromPretax);
        const override = overrideMap.get(yr);
        if (override != null) {
          convAmt = Math.min(Math.max(0, override), pretaxAfterDraw);
          convCapReason = "manual";
        } else if (rothConversionTarget && rothConversionTarget !== "off" && pretaxAfterDraw > 1000) {
          const sdConv = stdDed(perPersonAgeAt(age), mfjAt(age), iF, spAgeAt(age));
          let ceilingConv = bracketCeiling(rothConversionTarget, mfjAt(age), iF);
          convCapReason = "bracket";
          const roomPreBonus = Math.max(0, ceilingConv + sdConv - taxNoConv.totInc);
          const dedConv = sdConv + getSeniorBonusDeduction(
            perPersonAgeAt(age), mfjAt(age) ? "mfj" : "single", taxNoConv.magi + roomPreBonus, yr, spAgeAt(age)
          );
          if (rothConversionTarget === "irmaa" || (irmaaGuard && age >= 63)) {
            const irmaaTier1 = mfjAt(age) ? IRMAA_TIER1_2026_MFJ : IRMAA_TIER1_2026_SINGLE;
            const irmaaCapConv = Math.round(irmaaTier1 * iF) - realizedGain - taxableQualYield - dedConv;
            if (irmaaCapConv < ceilingConv) {
              ceilingConv = irmaaCapConv;
              convCapReason = "irmaa_ceil";
            }
          }
          bracketTopYr = Number.isFinite(ceilingConv) ? Math.round(ceilingConv) : null;
          stdDedYr     = Math.round(dedConv);
          const room = Math.max(0, ceilingConv + dedConv - taxNoConv.totInc);
          if (room > 500) convAmt = Math.min(room, pretaxAfterDraw);
          else convCapReason = null;
        }
      }

      let tax     = convAmt > 0 ? yearTax(age, yr, fromPretax + convAmt, ss, annuity, rmd, iF, otherIncTaxable, realizedGain + taxableQualYield, magiLookback) : taxNoConv;
      let convTax = convAmt > 0 ? Math.max(0, tax.totalTax - taxNoConv.totalTax) : 0;

      const withholdFromConversion = taxFunding === "from_conv" || taxFunding === "from_conversion";
      const taxableLeftForConv = Math.max(0, taxable - fromTaxable);
      const cashLeftForConv    = Math.max(0, cash    - fromCash);
      const outsideFundsForConv = withholdFromConversion
        ? 0
        : taxableLeftForConv + cashLeftForConv;

      if (convAmt > 0) {
        const convAmtBeforeShrink = convAmt;
        for (let i = 0; i < 5 && convAmt > 0; i++) {
          const taxOnPretax = withholdFromConversion
            ? 0
            : Math.max(0, convTax - outsideFundsForConv);
          const needFromPretax = withholdFromConversion
            ? convAmt
            : convAmt + taxOnPretax;
          const shortfall = needFromPretax - (pretax - fromPretax);
          if (shortfall <= 0) break;
          convAmt = Math.max(0, convAmt - shortfall);
          tax     = convAmt > 0 ? yearTax(age, yr, fromPretax + convAmt, ss, annuity, rmd, iF, otherIncTaxable, realizedGain + taxableQualYield, magiLookback) : taxNoConv;
          convTax = convAmt > 0 ? Math.max(0, tax.totalTax - taxNoConv.totalTax) : 0;
        }
        if (convAmt > 0 && convAmt < convAmtBeforeShrink) convCapReason = "affordability";
        if (convAmt <= 500) {
          convAmt = 0;
          convTax = 0;
          tax = taxNoConv;
          convCapReason = null;
        }
      }

      const provisional = ss * 0.5 + rmd + fromPretax + convAmt + annuity + otherIncTaxable;
      const torpedoThresh = mfjAt(age) ? 32_000 : 25_000;
      const ssTorpedo     = ssTorpedoGuard && ss > 0 && provisional > torpedoThresh
        && tax.taxSS > 0;
      const irmaaTriggered = tax.irmaa > 0;
      const rmdActive     = age >= rmdAgeAt(age) && (pretax + rmd + fromPretax) > 0;

      const rmdExcess = Math.max(0, rmd - (baseNeed + taxDue));
      const consumedBasis = fromTaxable - realizedGain;
      taxableBasis = Math.max(0, taxableBasis - consumedBasis) + rmdExcess;
      let convTaxFromTaxable = 0, convTaxFromCash = 0, convTaxFromPretax = 0;
      let convToRoth = convAmt;
      if (convAmt > 0 && convTax > 0) {
        if (withholdFromConversion) {
          convToRoth = Math.max(0, convAmt - convTax);
          convTaxFromPretax = convTax;
        } else {
          let owed = convTax;
          convTaxFromTaxable = Math.min(owed, Math.max(0, taxable - fromTaxable));
          owed -= convTaxFromTaxable;
          convTaxFromCash = Math.min(owed, Math.max(0, cash - fromCash));
          owed -= convTaxFromCash;
          convTaxFromPretax = Math.max(0, owed);
        }
      }

      if (convTaxFromPretax > 0) {
        const convPen = earlyWithdrawalPenalty({
          separationQualifies: ruleOf55Ok,
          age, pretaxDistribution: convTaxFromPretax,
          ruleOf55, ruleOf55Share, retireAge,
          sepp72t, sepp72tStartAge: sepp72tStartAge ?? retireAge,
        });
        earlyPenalty = {
          penalty: earlyPenalty.penalty + convPen.penalty,
          exemptAmount: earlyPenalty.exemptAmount + convPen.exemptAmount,
          reason: earlyPenalty.reason || convPen.reason,
        };
      }

      const cashGrThisYr    = cashGr;
      const taxableGrThisYr = gr;
      const pretaxGrThisYr  = gr;
      const rothGrThisYr    = gr;

      cash    = Math.max(0, cash    - fromCash    - convTaxFromCash)    * (1 + cashGrThisYr);
      const convBasisConsumed = taxable > 0
        ? convTaxFromTaxable * (taxableBasis / Math.max(taxable, 1))
        : 0;
      taxableBasis = Math.max(0, taxableBasis - convBasisConsumed);
      const surplusToTaxable = Math.max(0, incomeSurplus - Math.max(0, taxDue - rmd));
      taxableBasis += surplusToTaxable;
      taxableBasis += taxableYieldAmt;
      taxable = (Math.max(0, taxable - fromTaxable - convTaxFromTaxable) + rmdExcess + surplusToTaxable) * (1 + taxableGrThisYr);
      const convPretaxOutflow = withholdFromConversion ? convAmt : convAmt + convTaxFromPretax;
      pretax  = Math.max(0, pretax  - fromPretax - convPretaxOutflow) * (1 + pretaxGrThisYr);
      roth    = Math.max(0, roth    - fromRoth + convToRoth) * (1 + rothGrThisYr);

      lastRet = gr;
      cTax += tax.totalTax + earlyPenalty.penalty;

      magiByAge.set(age, tax.magi);

      rows.push({
        age, yr,
        ss, annuityRental: annuity, fixedIncomeTotal: fixedIncome,
        rmd, rmdActive,
        fromCash, fromTaxable, fromPretax, pretaxCapReason, convCapReason,
        convTaxFromTaxable, convTaxFromCash, convTaxFromPretax, convToRoth,
        fromRoth, rothReserveHeld, rothReserveBroken,
        conversionAmount: Math.round(convAmt), conversionTax: convTax,
        bracketTopYr, stdDedYr,
        fedTax: tax.fedTax, stateTax: tax.stateTax, irmaa: tax.irmaa,
        totalTax: tax.totalTax, irmaaFull: tax.irmaaFull,
        earlyPenalty: earlyPenalty.penalty,
        earlyPenaltyReason: earlyPenalty.reason,
        earlyPenaltyExempt: earlyPenalty.exemptAmount,
        effectiveRate: tax.effectiveRate, marginalBracket: tax.marginalBracket,
        fedBrackets: tax.fedBrackets, deduction: tax.deduction, fedOrdinary: tax.fedOrdinary,
        taxableIncome: tax.taxableIncome, totInc: tax.totInc, magi: Math.round(tax.magi),
        realizedGain: Math.round(realizedGain), ltcgTax: tax.ltcgTax, niit: tax.niit, taxSS: tax.taxSS,
        rmdSurplus: Math.round(rmdExcess),
        landmines: { ssTorpedo, irmaaTriggered, rmdActive },
        cashEnd:    Math.round(cash),
        taxableEnd: Math.round(taxable),
        pretaxEnd:  Math.round(pretax),
        rothEnd:    Math.round(roth),
        cashStart:    Math.round(cashStart),
        taxableStart: Math.round(taxableStart),
        pretaxStart:  Math.round(pretaxStart),
        rothStart:    Math.round(rothStart),
        gr: taxableGrThisYr,
        cashGr: cashGrThisYr,
        convPretaxOutflow: Math.round(convPretaxOutflow),
        surplusToTaxable: Math.round(surplusToTaxable),
        totalPort:  Math.round(cash + taxable + pretax + roth),
        spending:   Math.round(spSmiled),
        smileFactor: smileFactor,
        smileBase:  Math.round(sp),
        housingCost: Math.round(housingCost),
        carveoutCost: Math.round(carveoutCost),
        eventCost: Math.round(ev.total),
        healthcareRisk: Math.round(hcRisk),
        eventInflow: Math.round(ev.inflow),
        eventLabels: ev.hits.map(h => h.label),
        otherIncome: Math.round(otherIncTotal),
        needFromPort: Math.round(baseNeed),
        totalWithdrawal: Math.round(rmd + fromCash + fromTaxable + fromPretax + fromRoth
          + convTaxFromTaxable + convTaxFromCash + convTaxFromPretax),
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
