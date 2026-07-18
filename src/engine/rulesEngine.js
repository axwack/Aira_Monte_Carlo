/**
 * rulesEngine.js — Declarative, extensible action-card rules registry.
 *
 * To add a new rule: append an object to RULES. No other file needs changing.
 *
 * Each rule shape:
 *   id        — unique string key
 *   category  — display label (e.g. "Tax", "RMD")
 *   law       — optional citation (e.g. "SECURE 2.0 §107")
 *   priority  — "red"|"yellow"|"green" OR (ctx) => "red"|"yellow"|"green"
 *   condition — (ctx) => boolean
 *   action    — string OR (ctx) => string
 *   reason    — string OR (ctx) => string
 *   deadline  — string OR (ctx) => string
 *
 * ctx = { params, mc, assumptions, currentYear, retireYear, daysToRetire }
 */

// ─── Shared helpers ────────────────────────────────────────────────────────────

function accts(params) { return params.accounts || []; }
function preTaxTotal(params) {
  return accts(params).filter(a => a.category === "pretax").reduce((s, a) => s + (a.balance || 0), 0);
}
function rothTotal(params) {
  return accts(params).filter(a => a.category === "roth").reduce((s, a) => s + (a.balance || 0), 0);
}
function taxableTotal(params) {
  return accts(params).filter(a => a.category === "taxable").reduce((s, a) => s + (a.balance || 0), 0);
}
function hsaTotal(params) {
  return accts(params).filter(a => a.category === "hsa").reduce((s, a) => s + (a.balance || 0), 0);
}
function preTaxPct(params) { return params.port > 0 ? preTaxTotal(params) / params.port : 0; }
function rothPct(params)   { return params.port > 0 ? rothTotal(params)   / params.port : 0; }
function swr(params)       { return params.port > 0 ? (params.sp / params.port) * 100 : 0; }

/**
 * SECURE 2.0 Act §107 — RMD age by birth year.
 * Born before 1951 → 72 | Born 1951–1959 → 73 | Born 1960+ → 75
 */
export function getRMDAge(currentAge, currentYear = new Date().getFullYear()) {
  const birthYear = currentYear - currentAge;
  if (birthYear < 1951) return 72;
  if (birthYear < 1960) return 73;
  return 75;
}

function yearsToRMD(params, currentYear) {
  return getRMDAge(params.currentAge, currentYear) - params.currentAge;
}

// ─── Rules registry ────────────────────────────────────────────────────────────
// Add new rules here. Order within priority tier does not matter — evaluateRules sorts.

export const RULES = [

  // ── RED ────────────────────────────────────────────────────────────────────

  {
    id: "mc-below-80",
    category: "Monte Carlo",
    priority: "red",
    condition: ({ mc }) => mc && mc.rate < 0.80,
    action: "Success rate below 80%",
    reason: ({ mc }) => `${(mc.rate * 100).toFixed(1)}% — plan needs restructuring`,
    deadline: "Now",
  },
  {
    id: "mc-critical",
    category: "Monte Carlo",
    priority: "red",
    condition: ({ mc, params }) => mc && mc.rate < 0.70,
    action: "Plan failure risk — urgent review",
    reason: ({ mc, params }) => `Less than 70% success to age ${params.endAge}`,
    deadline: "Now",
  },
  {
    id: "swr-danger",
    category: "Withdrawal Rate",
    priority: "red",
    condition: ({ params }) => swr(params) > 5.0,
    action: "Withdrawal rate dangerously high",
    reason: ({ params }) => `${swr(params).toFixed(1)}% — safe benchmark is 4%`,
    deadline: "Now",
  },
  {
    id: "pretax-rmd-bomb",
    category: "Tax",
    law: "SECURE 2.0 Act §107 — RMD age 73/75",
    priority: "red",
    condition: ({ params }) => preTaxPct(params) > 0.75,
    action: "Pre-tax concentration — RMD bomb",
    reason: ({ params, currentYear }) =>
      `${(preTaxPct(params) * 100).toFixed(0)}% pre-tax — forced RMDs begin age ${getRMDAge(params.currentAge, currentYear)}`,
    deadline: ({ params }) => `Before age ${params.retireAge + 2}`,
  },
  {
    id: "domicile-nj",
    category: "Domicile",
    priority: "red",
    condition: ({ params, daysToRetire }) =>
      daysToRetire < 730 && !params.twoHousehold &&
      (params.stateOfResidence === "NJ" || !params.stateOfResidence),
    action: "FL domicile not established",
    reason: "NJ tax on withdrawals = $50,000+ lifetime loss",
    deadline: "Before D-Day",
  },
  {
    id: "portfolio-underfunded-60",
    category: "Savings",
    priority: "red",
    condition: ({ params, assumptions, mc }) => {
      // Fire if MC rate is critically low, OR if no MC has been run yet and portfolio is severely underfunded
      if (mc) return mc.rate < 0.70;
      const goal = assumptions?.portfolioGoal || 1_000_000;
      return (params.port / goal) * 100 < 60;
    },
    action: ({ params, mc }) =>
      mc
        ? `MC success rate critically low — ${(mc.rate * 100).toFixed(1)}%`
        : "Portfolio severely underfunded",
    reason: ({ params, assumptions, mc }) => {
      const goal = assumptions?.portfolioGoal || 1_000_000;
      const fmt = v => `$${Math.round(v).toLocaleString()}`;
      if (!mc) {
        return `$${Math.round(goal - params.port).toLocaleString()} gap to ${fmt(goal)} Reassess goal — run Monte Carlo to assess real risk`;
      }
      const retRow = mc.pcts?.find(d => d.age === params.retireAge);
      const p25 = retRow?.p25, p50 = retRow?.p50;
      let msg = `Only ${(mc.rate * 100).toFixed(1)}% of 3,000 paths reach age ${params.endAge || 90} — plan failure is likely`;
      if (p25 && p50) {
        msg += `. At retirement (age ${params.retireAge}): median ${fmt(p50)}, worst-25% scenario only ${fmt(p25)}`;
      }
      return msg;
    },
    deadline: "Now",
  },

  // ── SECURE 2.0 / RMD countdown rules ─────────────────────────────────────

  {
    id: "rmd-window-close",
    category: "RMD",
    law: "SECURE 2.0 Act §107 — IRS Pub 590-B",
    priority: ({ params, currentYear }) =>
      yearsToRMD(params, currentYear) <= 3 ? "red" : "yellow",
    condition: ({ params, currentYear }) => {
      const yrs = yearsToRMD(params, currentYear);
      return yrs > 0 && yrs <= 7 && preTaxPct(params) > 0.40;
    },
    action: ({ params, currentYear }) =>
      `RMD window — ${yearsToRMD(params, currentYear)} years to forced distributions`,
    reason: ({ params, currentYear }) => {
      const rmdAge = getRMDAge(params.currentAge, currentYear);
      const prePct = (preTaxPct(params) * 100).toFixed(0);
      return `RMD age ${rmdAge} per SECURE 2.0. ${prePct}% pre-tax — convert now to reduce future forced income`;
    },
    deadline: ({ params, currentYear }) =>
      `Age ${getRMDAge(params.currentAge, currentYear)}`,
  },
  {
    id: "rmd-bracket-creep",
    category: "RMD",
    law: "SECURE 2.0 Act §107 — IRS Uniform Lifetime Table",
    priority: "yellow",
    condition: ({ params, currentYear }) => {
      const rmdAge = getRMDAge(params.currentAge, currentYear);
      const preTax = preTaxTotal(params);
      const yearsLeft = rmdAge - params.currentAge;
      if (yearsLeft <= 0 || preTax <= 0) return false;
      const divisor = 24.0;
      const projectedRMD = preTax / divisor;
      return projectedRMD > 50_000;
    },
    action: "Projected RMD will push into higher bracket",
    reason: ({ params, currentYear }) => {
      const preTax = preTaxTotal(params);
      const projectedRMD = (preTax / 24.0).toLocaleString("en-US", { maximumFractionDigits: 0 });
      const rmdAge = getRMDAge(params.currentAge, currentYear);
      return `~$${projectedRMD}/yr projected RMD at age ${rmdAge} — Roth conversion now reduces future tax drag`;
    },
    deadline: ({ params, currentYear }) =>
      `Before age ${getRMDAge(params.currentAge, currentYear)}`,
  },

  // ── YELLOW ─────────────────────────────────────────────────────────────────

  {
    id: "fafsa-window",
    category: "FAFSA/CSS",
    law: "Higher Education Act — CSS Profile lookback",
    priority: "yellow",
    condition: ({ assumptions, currentYear }) =>
      (assumptions?.fafsaEndYear || 0) >= currentYear,
    action: "Minimize AGI — FAFSA years active",
    reason: ({ assumptions }) =>
      `CSS/FAFSA through ${assumptions.fafsaEndYear} — cap Roth conversions at 12% bracket`,
    deadline: ({ assumptions }) => `Spring ${assumptions.fafsaEndYear}`,
  },
  {
    id: "portfolio-underfunded-75",
    category: "Savings",
    priority: "yellow",
    condition: ({ params, mc }) => {
      // Only fire when MC has been run and success rate is below 85%
      // Suppresses when the plan is healthy regardless of funding ratio vs goal
      if (!mc) return false;
      return mc.rate >= 0.70 && mc.rate < 0.85;
    },
    action: "Increase contributions or reduce spend",
    reason: ({ params, assumptions, mc }) => {
      const fmt = v => `$${Math.round(v).toLocaleString()}`;
      const rate = (mc.rate * 100).toFixed(1);
      const retRow = mc.pcts?.find(d => d.age === params.retireAge);
      const p25 = retRow?.p25, p50 = retRow?.p50;
      const goal = assumptions?.portfolioGoal || 1_000_000;
      const pct = params.port > 0 && goal > 0 ? Math.round(params.port / goal * 100) : null;

      let msg = `MC success rate ${rate}% — below the 85% threshold. `;
      if (p50 && p25) {
        msg += `At retirement (age ${params.retireAge}): median path ${fmt(p50)}, but the 25th-percentile scenario (worst 1-in-4 outcome) reaches only ${fmt(p25)}. `;
      }
      msg += `Boost contributions, delay retirement, or trim spending to close the gap.`;
      if (pct !== null) msg += ` Portfolio is currently ${pct}% toward your ${fmt(goal)} Reassess goal.`;
      return msg;
    },
    deadline: ({ params }) =>
      params.retireAge > params.currentAge
        ? `${params.retireAge - params.currentAge} yr${params.retireAge - params.currentAge !== 1 ? "s" : ""} to D-Day`
        : "Now",
  },
  {
    id: "mortgage-outlasts-retire",
    category: "Mortgage",
    priority: "yellow",
    condition: ({ assumptions, retireYear }) =>
      assumptions?.mortgagePayoffYear > retireYear,
    action: "Mortgage outlasts retirement date",
    reason: ({ assumptions }) =>
      `Payoff ${assumptions.mortgagePayoffYear} — balance remains at D-Day`,
    deadline: "Pre-retirement",
  },
  {
    id: "hsa-low",
    category: "HSA",
    law: "IRS Rev. Proc. — HSA triple tax advantage",
    priority: "yellow",
    condition: ({ params }) => hsaTotal(params) < 50_000,
    action: "Maximize HSA contributions",
    reason: ({ params }) =>
      `Current HSA $${hsaTotal(params).toLocaleString()} — triple tax advantage (deduct, grow, withdraw tax-free for medical)`,
    deadline: "Each year",
  },
  {
    id: "roth-low",
    category: "Roth",
    law: "IRC §408A — Roth IRA",
    priority: "yellow",
    condition: ({ params }) => rothPct(params) < 0.25,
    action: "Roth balance low — conversion needed",
    reason: ({ params, currentYear }) => {
      const rmdAge = getRMDAge(params.currentAge, currentYear);
      return `${(rothPct(params) * 100).toFixed(0)}% Roth — target 40%+ before RMDs (age ${rmdAge})`;
    },
    deadline: ({ params }) => `Ages ${params.retireAge}–${params.retireAge + 10}`,
  },
  {
    id: "bucket1-liquidity",
    category: "Liquidity",
    priority: "yellow",
    condition: ({ daysToRetire }) => daysToRetire < 1460,
    action: "Bucket 1 funding — confirm cash reserve",
    reason: ({ daysToRetire, params }) =>
      `D-Day in ${Math.ceil(daysToRetire / 365)} yrs — need 2yr expenses ($${Math.round(params.sp * 2).toLocaleString()}) liquid`,
    deadline: "1 year before D-Day",
  },
  {
    id: "ss-delay-check",
    category: "Social Security",
    law: "SSA — 8% delayed credit per year (ages 62–70)",
    priority: "yellow",
    condition: ({ params }) => params.ssAge > 64,
    action: "Confirm SS claiming age",
    reason: ({ params }) =>
      `Each year delayed = ~8% higher benefit — verify break-even at age ${params.ssAge}`,
    deadline: "Before retirement",
  },
  {
    id: "taxable-low",
    category: "Emergency Fund",
    priority: "yellow",
    condition: ({ params }) => taxableTotal(params) < 50_000,
    action: "Build emergency dry powder",
    reason: ({ params }) =>
      `$${taxableTotal(params).toLocaleString()} liquid taxable — sequence-of-returns risk in first 5 years`,
    deadline: "Now",
  },

  // ── GREEN ──────────────────────────────────────────────────────────────────

  {
    id: "mc-healthy",
    category: "Monte Carlo",
    priority: "green",
    condition: ({ mc }) => mc && mc.rate >= 0.90,
    action: "Plan on track — stay the course",
    reason: ({ mc }) =>
      `${(mc.rate * 100).toFixed(1)}% success — JL Collins would approve`,
    deadline: "Ongoing",
  },
  {
    id: "swr-conservative",
    category: "Withdrawal Rate",
    priority: "green",
    condition: ({ params }) => swr(params) <= 3.5,
    action: "Withdrawal rate conservative",
    reason: ({ params }) => `${swr(params).toFixed(1)}% — strong margin of safety`,
    deadline: "Monitor",
  },
  {
    id: "mortgage-clear",
    category: "Mortgage",
    priority: "green",
    condition: ({ assumptions, retireYear }) =>
      assumptions?.mortgagePayoffYear > 0 && assumptions.mortgagePayoffYear <= retireYear,
    action: "Mortgage paid off before retirement",
    reason: ({ assumptions }) =>
      `Payoff ${assumptions.mortgagePayoffYear} — debt-free at D-Day`,
    deadline: "Done",
  },
  {
    id: "guardrails-healthy",
    category: "Guardrails",
    priority: "green",
    condition: ({ mc, params }) => mc && mc.rate >= 0.85 && swr(params) <= 4,
    action: "Guyton-Klinger guardrails healthy",
    reason: ({ params }) =>
      `Floor $${(params.gkFloor || 0).toLocaleString()} · Ceiling $${(params.gkCeiling || 0).toLocaleString()} · WR ${swr(params).toFixed(1)}%`,
    deadline: "Monitor",
  },
  {
    id: "roth-healthy",
    category: "Roth",
    priority: "green",
    condition: ({ params }) => rothPct(params) >= 0.30,
    action: "Roth allocation healthy",
    reason: ({ params, currentYear }) => {
      const rmdAge = getRMDAge(params.currentAge, currentYear);
      return `${(rothPct(params) * 100).toFixed(0)}% Roth — reducing future RMD exposure at age ${rmdAge}`;
    },
    deadline: "Monitor",
  },
  {
    id: "portfolio-on-pace",
    category: "Savings",
    priority: "green",
    condition: ({ params, assumptions }) => {
      const goal = assumptions?.portfolioGoal || 1_000_000;
      return (params.port / goal) * 100 >= 85;
    },
    action: ({ params, assumptions }) => {
      const goal = assumptions?.portfolioGoal || 1_000_000;
      return `On pace for $${Math.round(goal).toLocaleString()} goal`;
    },
    reason: ({ params, assumptions }) => {
      const goal = assumptions?.portfolioGoal || 1_000_000;
      const pct = (params.port / goal) * 100;
      return `${pct.toFixed(0)}% funded · ${params.retireAge - params.currentAge} years remaining`;
    },
    deadline: "D-Day",
  },
  // ── WITHDRAWAL ORDER ────────────────────────────────────────────────────────

  {
    id: "irmaa-guard-off",
    category: "Medicare / IRMAA",
    priority: "yellow",
    condition: ({ params, currentYear }) =>
      preTaxTotal(params) > 200_000 &&
      !params.irmaaGuard &&
      (currentYear - params.currentAge) >= -5 && // within 5 years of retirement or past
      params.currentAge >= 55,
    action: "Enable IRMAA guard in Withdrawal Order settings",
    reason: ({ params }) =>
      `$${Math.round(preTaxTotal(params)).toLocaleString()} pretax — unguarded withdrawals may cross Medicare IRMAA Tier 1 ($218,000 MFJ), adding $2,160–$11,130/yr in surcharges`,
    deadline: "Before age 63",
  },
  {
    id: "no-bracket-ceiling",
    category: "Tax",
    priority: "yellow",
    condition: ({ params }) =>
      preTaxTotal(params) > 300_000 &&
      (!params.withdrawalBracketTarget || params.withdrawalBracketTarget === "off"),
    action: "Set a pretax bracket ceiling in Withdrawal Order settings",
    reason: ({ params }) =>
      `$${Math.round(preTaxTotal(params)).toLocaleString()} pretax with no ceiling — naive ordering drains pretax first, pushing income into higher brackets and exhausting tax-deferred shelter early`,
    deadline: "At retirement",
  },
  {
    id: "roth-reserve-not-set",
    category: "Roth",
    priority: "yellow",
    condition: ({ params }) =>
      rothTotal(params) > 100_000 &&
      (params.rothEmergencyReserve || 0) === 0,
    action: "Set a Roth emergency reserve floor",
    reason: ({ params }) =>
      `$${Math.round(rothTotal(params)).toLocaleString()} Roth with no reserve — a bad sequence-of-returns year could force full Roth depletion, eliminating your only tax-free spending bucket`,
    deadline: "At retirement",
    steps: [
      "Go to the Withdrawal Schedule tab, Section 1 ('Where does each year's spending come from?')",
      "Find the 'Sourcing guardrails' strip above the waterfall table",
      "Set 'Keep Roth above $' to a floor that preserves a tax-free buffer for bad sequence-of-returns years",
      "Re-run Monte Carlo to confirm the floor doesn't materially reduce success probability",
    ],
  },
  {
    id: "smart-waterfall-inactive",
    category: "Withdrawal Order",
    priority: "yellow",
    condition: ({ params }) =>
      preTaxTotal(params) > 200_000 &&
      params.withdrawalStrategy !== "smart",
    action: "Consider Smart Waterfall withdrawal strategy",
    reason: ({ params }) => {
      const pretax = preTaxTotal(params);
      return `$${Math.round(pretax).toLocaleString()} pretax balance — naive ordering drains it first and pushes income into higher brackets. To enable: (1) Forecast sidebar → Withdrawal Strategy → select "📋 Smart Waterfall (Tax-Optimal)", then re-run Monte Carlo. (2) Profile → Assumptions → Withdrawal Order → configure your bracket ceiling and IRMAA guard. (3) Scenarios → 📋 Withdrawal Plan to compare Smart vs Naive lifetime taxes.`;
    },
    deadline: "At retirement",
  },

];

// ─── Evaluator ─────────────────────────────────────────────────────────────────

const PRIORITY_ORDER = { red: 0, yellow: 1, green: 2 };

/**
 * Run all rules against the given context.
 * Returns sorted array of action card objects.
 */
export function evaluateRules(ctx) {
  const currentYear = ctx.currentYear || new Date().getFullYear();
  const enriched = { ...ctx, currentYear };

  return RULES
    .filter(r => {
      try { return r.condition(enriched); }
      catch { return false; }
    })
    .map(r => {
      const priority = typeof r.priority === "function" ? r.priority(enriched) : r.priority;
      return {
        id: r.id,
        priority,
        category: r.category,
        law: r.law || null,
        action:   typeof r.action   === "function" ? r.action(enriched)   : r.action,
        reason:   typeof r.reason   === "function" ? r.reason(enriched)   : r.reason,
        deadline: typeof r.deadline === "function" ? r.deadline(enriched) : r.deadline,
        aiNote: null,
        aiGenerated: false,
      };
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
