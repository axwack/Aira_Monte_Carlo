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
 * Actual cash paid (P&I + extra) per calendar year, including the partial
 * final (payoff) year — mortgageSchedule's `years[]` entries already only
 * cover the months actually paid in that year, and `pPaid` already includes
 * any extraMonthly principal, so this is a straight per-year sum, not a
 * flat pmt*12 estimate (which both drops the payoff-year cost to $0 too
 * early and ignores extra payments entirely).
 * @returns {Map<number, number>} calendar year → total P&I paid that year
 */
export function mortgageAnnualPayments(ms) {
  const m = new Map();
  for (const y of ms.years) m.set(y.yr, y.pPaid + y.iPaid);
  return m;
}

/**
 * Sums a profile's "other income" streams (e.g. pensions, part-time work,
 * royalties) active in a given calendar year, applying each stream's own
 * growth (capped at growthCapYears).
 *
 * Growth mode (per stream):
 *   - "fixed" → a flat dollar COLA each year: amount = annual + growthAmount × years
 *     (matches many pensions that raise by a set $ amount, not a %).
 *   - anything else (default "pct") → compounding: annual × (1 + growthRate%)^years.
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
      const years = Math.min(yearsElapsed, cap);
      const base = inc.annual || 0;
      const amt = inc.growthMode === "fixed"
        ? Math.max(0, base + (inc.growthAmount || 0) * years)          // flat $/yr increase
        : base * Math.pow(1 + (inc.growthRate || 0) / 100, years);     // compounding %
      total += amt;
      if (inc.taxable) totalTaxable += amt;
    }
  }
  return { total, totalTaxable };
}

/**
 * One-off and periodic planned expenses ("cash flow events") for a calendar year.
 *
 * The gap this fills: the model had recurring spend (`sp`), recurring committed
 * obligations (`carveouts`, which run from today to an optional endYear), and
 * nothing for a cost that lands in ONE future year — a new roof, a wedding, a car
 * replaced every seven years. The only workaround was a multi-year CSV budget,
 * which REPLACES the withdrawal strategy outright and so silently switches off
 * the Guyton-Klinger guardrails. Events are additive instead: the strategy still
 * governs the recurring base, and these ride on top.
 *
 * Event shape:
 *   { id, label, year, amount, recurEveryYears, recurUntilYear, inflate, deferrable }
 *
 *   year            first occurrence (calendar year)
 *   amount          cost per occurrence
 *   recurEveryYears 0/null = one-time; 7 = every seven years
 *   recurUntilYear  last year a repeat may occur; null = no end
 *   inflate         true (default) = `amount` is in TODAY's dollars and is
 *                   inflated to the occurrence year; false = already nominal
 *   deferrable      true = discretionary, guardrails may cut it (a big travel
 *                   year); false (default) = committed, they may not (a roof).
 *                   Mirrors the Must Spend / Like to Spend split the CSV
 *                   importer already uses for the recurring base.
 *
 * @param {Array} events
 * @param {number} calYear
 * @param {number} infPct annual inflation, percent
 * @param {number} baseYear year in which `amount` is expressed (today)
 * @returns {{ total:number, committed:number, deferrable:number, hits:Array }}
 */
export function computeCashFlowEvents(events, calYear, infPct = 2.5, baseYear = new Date().getFullYear()) {
  let total = 0, committed = 0, deferrable = 0;
  const hits = [];
  if (!events?.length) return { total, committed, deferrable, hits };

  for (const e of events) {
    const start = Number(e.year);
    const amount = Number(e.amount) || 0;
    if (!Number.isFinite(start) || amount === 0) continue;
    if (calYear < start) continue;

    const every = Number(e.recurEveryYears) || 0;
    if (every > 0) {
      // Repeats every `every` years from `start`, optionally stopping at
      // recurUntilYear. A year only counts if it is exactly on the cycle.
      if ((calYear - start) % every !== 0) continue;
      const until = e.recurUntilYear == null ? Infinity : Number(e.recurUntilYear);
      if (calYear > until) continue;
    } else if (calYear !== start) {
      continue; // one-time event, wrong year
    }

    // Default to inflating: users think in today's dollars, and a roof quoted at
    // today's price will not cost that in fifteen years.
    const inflate = e.inflate !== false;
    const yrs = Math.max(0, calYear - baseYear);
    const amt = inflate ? amount * Math.pow(1 + (infPct || 0) / 100, yrs) : amount;

    total += amt;
    if (e.deferrable) deferrable += amt; else committed += amt;
    hits.push({ id: e.id, label: e.label || "Planned expense", amount: Math.round(amt) });
  }

  return { total, committed, deferrable, hits };
}
