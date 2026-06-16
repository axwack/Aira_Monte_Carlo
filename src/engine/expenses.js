/**
 * expenses.js
 *
 * Shared "real-world cash needs" helpers — mortgage amortization and
 * other-income streams — used by both the Monte Carlo engine (runMC, in
 * App.jsx) and the deterministic withdrawal waterfall
 * (buildWithdrawalWaterfall.js), so housing costs, carveouts, and other
 * income are computed identically everywhere they affect a year's "need".
 */

/**
 * Amortization schedule for a mortgage, given today's balance/rate/term.
 * @returns {{ years, pmt, payoffYr, totalInt, interestSaved }}
 */
export function mortgageSchedule(balance, annualRate, startDate, termYrs, extraMonthly) {
  const mRate = annualRate / 100 / 12;
  const totalMonths = termYrs * 12;
  const start = new Date(startDate + "-01"),
    now = new Date();
  const elapsed = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      now.getMonth() -
      start.getMonth()
  );
  const remaining = Math.max(1, totalMonths - elapsed);
  const pmt =
    mRate === 0
      ? balance / remaining
      : (balance * mRate * Math.pow(1 + mRate, remaining)) /
        (Math.pow(1 + mRate, remaining) - 1);
  let bal = balance,
    yr = now.getFullYear(),
    years = [],
    totalInt = 0,
    totalIntNoExtra = 0;
  while (bal > 0.01 && years.length < 35) {
    let pPaid = 0,
      iPaid = 0,
      ePaid = 0,
      balNE = bal;
    for (let m = 0; m < 12 && bal > 0.01; m++) {
      const intM = bal * mRate,
        prin = Math.min(pmt - intM, bal),
        extra = Math.min(extraMonthly, bal - prin);
      pPaid += prin + extra;
      iPaid += intM;
      ePaid += extra;
      totalInt += intM;
      bal -= prin + extra;
      if (bal <= 0) {
        bal = 0;
        break;
      }
      const intNE = balNE * mRate,
        prinNE = Math.min(pmt - intNE, balNE);
      totalIntNoExtra += intNE;
      balNE -= prinNE;
      if (balNE <= 0) balNE = 0;
    }
    years.push({
      yr,
      pPaid: Math.round(pPaid),
      iPaid: Math.round(iPaid),
      ePaid: Math.round(ePaid),
      bal: Math.round(Math.max(0, bal)),
    });
    yr++;
  }
  return {
    years,
    pmt: Math.round(pmt),
    payoffYr: years[years.length - 1]?.yr || now.getFullYear(),
    totalInt: Math.round(totalInt),
    interestSaved: Math.round(totalIntNoExtra - totalInt),
  };
}

/**
 * Sums a profile's "other income" streams (e.g. pensions, part-time work,
 * royalties) active in a given calendar year, applying each stream's own
 * growth rate (capped at growthCapYears).
 * @returns {{ total: number, totalTaxable: number }}
 */
export function computeOtherIncome(otherIncomes, calYear) {
  let total = 0, totalTaxable = 0;
  if (!otherIncomes?.length) return { total, totalTaxable };
  for (const inc of otherIncomes) {
    const start = inc.startYear || 2026;
    const end = inc.endYear || Infinity;
    if (calYear >= start && calYear <= end) {
      const yearsElapsed = calYear - start;
      const cap = inc.growthCapYears ?? Infinity;
      const growth = Math.pow(1 + (inc.growthRate || 0) / 100, Math.min(yearsElapsed, cap));
      const amt = (inc.annual || 0) * growth;
      total += amt;
      if (inc.taxable) totalTaxable += amt;
    }
  }
  return { total, totalTaxable };
}
