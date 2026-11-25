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

export function mortgageAnnualPayments(ms) {
  const m = new Map();
  for (const y of ms.years) m.set(y.yr, y.pPaid + y.iPaid);
  return m;
}

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
        ? Math.max(0, base + (inc.growthAmount || 0) * years)
        : base * Math.pow(1 + (inc.growthRate || 0) / 100, years);
      total += amt;
      if (inc.taxable) totalTaxable += amt;
    }
  }
  return { total, totalTaxable };
}

export function computeCashFlowEvents(events, calYear, infPct = 2.5, baseYear = new Date().getFullYear()) {
  let total = 0, committed = 0, deferrable = 0, inflow = 0, inflowTaxable = 0;
  const byBucket = {};
  const hits = [];
  if (!events?.length) return { total, committed, deferrable, inflow, inflowTaxable, byBucket, hits };

  for (const e of events) {
    const start = Number(e.year);
    const amount = Number(e.amount) || 0;
    if (!Number.isFinite(start) || amount === 0) continue;
    if (calYear < start) continue;

    const every = Number(e.recurEveryYears) || 0;
    if (every > 0) {
      if ((calYear - start) % every !== 0) continue;
      const until = e.recurUntilYear == null ? Infinity : Number(e.recurUntilYear);
      if (calYear > until) continue;
    } else if (calYear !== start) {
      continue;
    }

    const inflate = e.inflate !== false;
    const yrs = Math.max(0, calYear - baseYear);
    const amt = inflate ? amount * Math.pow(1 + (infPct || 0) / 100, yrs) : amount;

    if (e.direction === "in") {
      inflow += amt;
      const bucket = e.bucket || "taxable";
      byBucket[bucket] = (byBucket[bucket] || 0) + amt;
      if (e.taxable) inflowTaxable += amt;
      hits.push({ id: e.id, label: e.label || "Income", amount: Math.round(amt), direction: "in", bucket });
      continue;
    }

    total += amt;
    if (e.deferrable) deferrable += amt; else committed += amt;
    hits.push({ id: e.id, label: e.label || "Planned expense", amount: Math.round(amt), direction: "out" });
  }

  return { total, committed, deferrable, inflow, inflowTaxable, byBucket, hits };
}

const SMILE_RATE_GO_GO   = -0.010;
const SMILE_RATE_SLOW_GO = -0.003;
const SMILE_RATE_NO_GO   =  0.012;
const SMILE_AGE_SLOW_GO  = 80;
const SMILE_AGE_NO_GO    = 85;
const SMILE_MIN = 0.75;
const SMILE_MAX = 1.10;

export function spendingSmileFactor(age, retireAge, enabled = true) {
  if (!enabled) return 1;
  const a = Number(age), r = Number(retireAge);
  if (!Number.isFinite(a) || !Number.isFinite(r) || a <= r) return 1;

  let f = 1;
  for (let y = r; y < a; y++) {
    const rate = y >= SMILE_AGE_NO_GO   ? SMILE_RATE_NO_GO
               : y >= SMILE_AGE_SLOW_GO ? SMILE_RATE_SLOW_GO
               : SMILE_RATE_GO_GO;
    f *= (1 + rate);
  }
  return Math.min(SMILE_MAX, Math.max(SMILE_MIN, f));
}

export function healthcareShockDraw(age, rand, p = {}, cumInfl = 1) {
  const startAge = p.hcShockAge ?? 72;
  const prob     = (p.hcProb ?? 3.5) / 100;
  if (!(age >= startAge) || prob <= 0) return 0;
  if (rand() >= prob) return 0;

  const lo = p.hcMin ?? 70_000;
  const hi = Math.max(lo, p.hcMax ?? 130_000);
  const todaysCost = lo + rand() * (hi - lo);
  return todaysCost * (cumInfl || 1);
}

export function expectedHealthcareShock(age, p = {}, cumInfl = 1) {
  const startAge = p.hcShockAge ?? 72;
  const prob     = (p.hcProb ?? 3.5) / 100;
  if (!(age >= startAge) || prob <= 0) return 0;

  const lo = p.hcMin ?? 70_000;
  const hi = Math.max(lo, p.hcMax ?? 130_000);
  return prob * ((lo + hi) / 2) * (cumInfl || 1);
}
