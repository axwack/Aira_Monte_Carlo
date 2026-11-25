import { contribStopOnPrimaryClock } from "./ages.js";

export function jobContributionsForYear(p = {}, primaryAge) {
  const sp = p.spouse || {};
  const spouseActive = !!sp.enabled
    && Number.isFinite(primaryAge)
    && primaryAge < contribStopOnPrimaryClock(p);

  const pretax = (p.contrib || 0) + (p.employerContrib || 0)
    + (spouseActive ? (sp.contrib || 0) + (sp.employerContrib || 0) : 0);
  const roth = (p.rothContrib || 0)
    + (spouseActive ? (sp.rothContrib || 0) : 0);

  return { pretax, roth, spouseActive };
}

export function householdAnnualContribution(p = {}, primaryAge) {
  const age = Number.isFinite(primaryAge) ? primaryAge : (p.currentAge ?? 0);
  const { pretax, roth } = jobContributionsForYear(p, age);
  const hsa = p.hsaContrib != null ? p.hsaContrib : (p.hsaMonthly || 0) * 12;
  return pretax + roth + hsa + (p.taxableContrib || 0);
}

export function totalRetirementIncome(p = {}) {
  const ss = Number(p.ssb) || 0;
  const spouseSs = p.spouse && p.spouse.enabled
    ? Number(p.spouse.ssb) || 0
    : 0;
  const rental = Number(p.ab) || 0;
  const otherIncomes = (p.otherIncomes || []).reduce(
    (sum, x) => sum + (Number(x && x.annual) || 0),
    0,
  );
  return ss + spouseSs + rental + otherIncomes;
}
