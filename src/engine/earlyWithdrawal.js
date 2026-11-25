export const EARLY_PENALTY_RATE = 0.10;
export const EARLY_PENALTY_AGE = 59.5;
export const RULE_OF_55_MIN_AGE = 55;
export const SEPP_MIN_YEARS = 5;

export function ruleOf55SeparationQualifies({
  dob, birthYear, currentAge, retireAge, asOfYear,
} = {}) {
  if (!Number.isFinite(retireAge)) return false;
  let by = Number.isFinite(birthYear) ? birthYear : null;
  if (by == null && typeof dob === "string" && dob.length >= 4) {
    const parsed = parseInt(dob.slice(0, 4), 10);
    if (Number.isFinite(parsed)) by = parsed;
  }
  if (by == null || !Number.isFinite(currentAge)) {
    return retireAge >= RULE_OF_55_MIN_AGE;
  }
  const nowYear = Number.isFinite(asOfYear) ? asOfYear : new Date().getFullYear();
  const separationYear = nowYear + (retireAge - currentAge);
  return separationYear >= by + RULE_OF_55_MIN_AGE;
}

export function detectEmployerPlan(accounts = []) {
  const RE = /\b(401\s*\(?\s*k\s*\)?|403\s*\(?\s*b\s*\)?|457)\b/i;
  let employerPlanBalance = 0, pretaxBalance = 0;
  const matches = [];
  for (const a of accounts) {
    if (a?.category !== "pretax") continue;
    const bal = a.balance || 0;
    pretaxBalance += bal;
    if (RE.test(a.name || "")) {
      employerPlanBalance += bal;
      matches.push(a.name);
    }
  }
  return {
    hasEmployerPlan: employerPlanBalance > 0,
    employerPlanBalance,
    pretaxBalance,
    share: pretaxBalance > 0 ? employerPlanBalance / pretaxBalance : 0,
    matches,
  };
}

export function seppMustRunUntil(startAge) {
  return Number.isFinite(startAge)
    ? Math.max(startAge + SEPP_MIN_YEARS, EARLY_PENALTY_AGE)
    : null;
}

export function seppActive(age, startAge) {
  return Number.isFinite(age) && Number.isFinite(startAge) && age >= startAge;
}

export function earlyWithdrawalPenalty({
  age,
  pretaxDistribution = 0,
  ruleOf55 = false,
  ruleOf55Share = 0,
  retireAge = null,
  separationQualifies = undefined,
  sepp72t = false,
  sepp72tStartAge = null,
} = {}) {
  if (!(pretaxDistribution > 0) || !Number.isFinite(age)) {
    return { penalty: 0, exemptAmount: 0, reason: "" };
  }
  if (age >= EARLY_PENALTY_AGE) {
    return { penalty: 0, exemptAmount: pretaxDistribution, reason: "age 59.5+" };
  }

  if (sepp72t && seppActive(age, sepp72tStartAge)) {
    return {
      penalty: 0,
      exemptAmount: pretaxDistribution,
      reason: `72(t) SEPP active since age ${sepp72tStartAge} — must continue to age ${seppMustRunUntil(sepp72tStartAge)}`,
    };
  }

  const separationOk = typeof separationQualifies === "boolean"
    ? separationQualifies
    : (Number.isFinite(retireAge) && retireAge >= RULE_OF_55_MIN_AGE);
  const ruleOf55Applies = ruleOf55 && separationOk && ruleOf55Share > 0;
  const exemptShare = ruleOf55Applies ? Math.min(1, Math.max(0, ruleOf55Share)) : 0;
  const exemptAmount = pretaxDistribution * exemptShare;
  const taxableBase = pretaxDistribution - exemptAmount;
  const penalty = Math.round(taxableBase * EARLY_PENALTY_RATE);

  let reason;
  if (penalty <= 0 && exemptShare >= 1) reason = "Rule of 55 — former-employer plan";
  else if (exemptShare > 0) {
    reason = `Rule of 55 covers ${Math.round(exemptShare * 100)}% (employer plan); ` +
      `the IRA remainder is penalized`;
  } else {
    reason = `under 59.5 — 10% early-distribution tax`;
  }
  return { penalty, exemptAmount: Math.round(exemptAmount), reason };
}
