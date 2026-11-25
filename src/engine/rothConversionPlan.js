import { buildWithdrawalWaterfall } from "./buildWithdrawalWaterfall.js";
import { getRmdStartAge, getStateBrackets } from "./buildRothExplorer.js";
import { expectedReturn } from "./expectedReturn.js";
import { resolveGlidepathSwitchAge } from "./glidepath.js";

const MIN_REMAINING_BALANCE = 10_000;

const ROTH_MODE_TO_TARGET = {
  fill_10: "10", fill_12: "12", fill_22: "22", fill_24: "24",
  fill_32: "32", fill_35: "35", fill_37: "37",
  irmaa_safe: "22",
  no_convert: "off",
};

export function buildConversionPlan(params = {}) {
  const { accounts = [], dob, birthYear, currentAge, rmdStartAge } = params;

  const rmdAge = (typeof rmdStartAge === "number" && rmdStartAge > 0)
    ? rmdStartAge
    : getRmdStartAge({ dob, birthYear, currentAge });

  const totalTraditional = accounts
    .filter(a => a.category === "pretax")
    .reduce((s, a) => s + (a.balance || 0), 0);

  const empty = {
    needs_schedule: false,
    reasons: { headroomTooSmall: false, cannotPayTaxFromCash: false, rmdBracketIncrease: false },
    recommendedSchedule: [],
    totalTraditional,
    headroomYear0: 0,
    rmdAge,
  };

  if (totalTraditional <= 0) return empty;

  const withConv = buildWithdrawalWaterfall(params);
  const noConv = buildWithdrawalWaterfall({ ...params, rothConversionTarget: "off" });

  const rows = withConv.smart.rows;
  const baseline = noConv.smart.rows;
  if (rows.length === 0 || baseline.length === 0) return empty;

  const firstRow = rows[0];
  const firstBaseline = baseline[0];

  const headroomYear0 = firstRow.conversionAmount || 0;
  const headroomTooSmall = headroomYear0 < 0.2 * totalTraditional;

  const nonRetirementCash = accounts
    .filter(a => a.category === "cash" || a.category === "taxable")
    .reduce((s, a) => s + (a.balance || 0), 0);
  const cannotPayTaxFromCash = (firstRow.conversionTax || 0) > nonRetirementCash;

  const todayBracket = firstBaseline.marginalBracket || 0;
  const atRmdRow = baseline.find(r => r.age >= rmdAge);
  const rmdBracketIncrease = atRmdRow ? (atRmdRow.marginalBracket || 0) > todayBracket : false;

  const needs_schedule = headroomTooSmall || cannotPayTaxFromCash || rmdBracketIncrease;

  let recommendedSchedule = [];
  if (needs_schedule) {
    let remaining = totalTraditional;
    for (const r of rows) {
      if (r.age >= rmdAge) break;
      if (remaining < MIN_REMAINING_BALANCE) break;
      const amount = Math.min(r.conversionAmount || 0, remaining);
      if (amount <= 0) continue;
      recommendedSchedule.push({ year: r.yr, age: r.age, amount: Math.round(amount) });
      remaining -= amount;
    }
  }

  return {
    needs_schedule,
    reasons: { headroomTooSmall, cannotPayTaxFromCash, rmdBracketIncrease },
    recommendedSchedule,
    totalTraditional,
    headroomYear0,
    rmdAge,
  };
}

export function checkRothWithdrawalPenalty({
  withdrawalDate,
  withdrawalAmount,
  ageAtWithdrawal,
  conversionHistory = [],
}) {
  const wd = new Date(withdrawalDate);

  if (ageAtWithdrawal >= 59.5 || withdrawalAmount <= 0) {
    return { penalty_due: false, penaltyAmount: 0, flaggedConversions: [] };
  }

  const sorted = [...conversionHistory]
    .map(c => ({ date: new Date(c.date), amount: Number(c.amount) || 0 }))
    .filter(c => c.amount > 0)
    .sort((a, b) => a.date - b.date);

  const flaggedConversions = [];
  let remaining = withdrawalAmount;

  for (const c of sorted) {
    if (remaining <= 0) break;
    const amountFromThisConversion = Math.min(remaining, c.amount);

    const clockStart = new Date(c.date.getUTCFullYear(), 0, 1);
    const fiveYearMark = new Date(clockStart);
    fiveYearMark.setFullYear(fiveYearMark.getFullYear() + 5);

    if (wd < fiveYearMark) {
      flaggedConversions.push({
        conversionDate: c.date.toISOString().slice(0, 10),
        amountAffected: amountFromThisConversion,
      });
    }
    remaining -= amountFromThisConversion;
  }

  const penaltyAmount = flaggedConversions.reduce((s, f) => s + f.amountAffected, 0) * 0.10;

  return {
    penalty_due: flaggedConversions.length > 0,
    penaltyAmount: Math.round(penaltyAmount),
    flaggedConversions,
  };
}

function classifyRow(r, retireAge, ssAge, target, overrideMap) {
  let label = `Year ${r.age - retireAge}`;
  if (ssAge != null && r.age === ssAge - 1) label = "Golden Year ★";
  else if (ssAge != null && r.age === ssAge) label = "SS Starts";

  const override = overrideMap.get(r.yr);
  const capReason = r.conversionAmount > 0
    ? (override !== undefined ? (override === 0 ? "manual $0" : "manual override") : `mode ${target}%`)
    : "";

  const brPct = Math.round((r.marginalBracket || 0) * 100);
  const convByBr = { conv10: 0, conv12: 0, conv22: 0, conv24: 0, conv32: 0, conv35: 0, conv37: 0 };
  const brKey = `conv${brPct}`;
  if (r.conversionAmount > 0 && brKey in convByBr) convByBr[brKey] = r.conversionAmount;

  return {
    yr: r.yr, age: r.age, label, capReason,
    conv: r.conversionAmount,
    fedT: r.fedTax, stT: r.stateTax, totT: r.totalTax,
    effR: r.effectiveRate, margR: r.marginalBracket,
    bracketUsed: `${brPct}%`,
    irmaa: r.irmaa,
    rmd: r.rmd, ss: r.ss, abn: r.annuityRental,
    pretaxSpend: r.fromPretax,
    totInc: r.totInc,
    pT: r.pretaxEnd, ro: r.rothEnd, nw: r.totalPort,
    ...convByBr,
  };
}

export function buildConversionLadder(params = {}, rothMode = "fill_22") {
  const target = ROTH_MODE_TO_TARGET[rothMode] ?? "22";
  const irmaaGuard = rothMode === "irmaa_safe" ? true : !!params.irmaaGuard;
  const { ssAge, retireAge } = params;
  const preGr  = params.gr ?? (expectedReturn(params.preRetireEq ?? 91) / 100);
  const postGr = params.gr ?? (expectedReturn(params.postRetireEq ?? 70) / 100);
  const gr = retireAge < resolveGlidepathSwitchAge(params) ? preGr : postGr;

  const { smart } = buildWithdrawalWaterfall({ ...params, rothConversionTarget: target, irmaaGuard });
  const rows = smart.rows;
  if (rows.length === 0) return { rows: [] };

  const overrideMap = new Map();
  for (const o of (params.conversionOverrides || [])) {
    overrideMap.set(Number(o.year), Number(o.amount));
  }

  const ladder = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.conversionAmount <= 0) continue;

    const pTStart = i === 0
      ? Math.round(r.pretaxEnd / (1 + gr) + r.fromPretax + r.conversionAmount + r.conversionTax)
      : rows[i - 1].pretaxEnd;
    const roStart = i === 0
      ? Math.round(r.rothEnd / (1 + gr) + r.fromRoth - r.conversionAmount)
      : rows[i - 1].rothEnd;

    ladder.push({ ...classifyRow(r, retireAge, ssAge, target, overrideMap), pTStart, roStart });
  }

  return { rows: ladder };
}

export function buildWaterfallComparison(params = {}, rothMode = "fill_22") {
  const target = ROTH_MODE_TO_TARGET[rothMode] ?? "22";
  const irmaaGuard = rothMode === "irmaa_safe" ? true : !!params.irmaaGuard;
  const {
    ssAge, retireAge, currentAge, endAge = 90,
    filingStatus = "mfj", stateOfResidence, twoHousehold,
    dob, birthYear, rmdStartAge,
  } = params;

  const overrideMap = new Map();
  for (const o of (params.conversionOverrides || [])) {
    overrideMap.set(Number(o.year), Number(o.amount));
  }

  const withConv = buildWithdrawalWaterfall({ ...params, rothConversionTarget: target, irmaaGuard });
  const noConv   = buildWithdrawalWaterfall({ ...params, rothConversionTarget: "off", irmaaGuard });

  function buildScenario(result) {
    const rows = result.smart.rows.map(r => classifyRow(r, retireAge, ssAge, target, overrideMap));
    return {
      rows,
      cTax:   rows.reduce((s, r) => s + r.totT, 0),
      cConv:  rows.reduce((s, r) => s + r.conv, 0),
      cIrmaa: rows.reduce((s, r) => s + r.irmaa, 0),
      cRmd:   rows.reduce((s, r) => s + r.rmd, 0),
      cTotInc: rows.reduce((s, r) => s + r.totInc, 0),
      finalNw: rows.length ? rows[rows.length - 1].nw : 0,
    };
  }

  const opt = buildScenario(withConv);
  const cur = buildScenario(noConv);

  const isMFJ = filingStatus !== "single";
  const rmdAge = (typeof rmdStartAge === "number" && rmdStartAge > 0)
    ? rmdStartAge
    : getRmdStartAge({ dob, birthYear, currentAge });
  const retireYear = new Date().getFullYear() + (retireAge - currentAge);
  const isNoTaxState = !!twoHousehold || !getStateBrackets(stateOfResidence || "NJ", isMFJ);

  return {
    opt, cur,
    taxD: opt.cTax - cur.cTax,
    estD: cur.finalNw - opt.finalNw,
    leOpt: opt.cTotInc > 0 ? opt.cTax / opt.cTotInc : 0,
    leCur: cur.cTotInc > 0 ? cur.cTax / cur.cTotInc : 0,
    rmdRed: cur.cRmd > 0 ? Math.round((1 - opt.cRmd / cur.cRmd) * 100) : 0,
    isNoTaxState, retireYear, rmdAge, endAge,
    filingStatus: isMFJ ? "mfj" : "single",
  };
}
