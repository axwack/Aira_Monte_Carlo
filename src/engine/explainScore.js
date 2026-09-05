/**
 * explainScore.js — why is the success rate what it is?
 *
 * A user hit 3.3% success on a plan that was actually ~100%. Took a day to
 * track down: the bracket cap had zero room, so pre-tax draws got blocked and
 * paths scored as failed while sitting on $3-4M. Found three more bugs in the
 * same family right after, all invisible on screen — the app knew it had blown
 * a bracket target or broken a reserve and just showed a percentage. Can't
 * sanity-check a number with no explanation behind it, not the user and not us.
 *
 * So this module names the drivers behind the score and gives each one a
 * lever. Kept it pure on purpose — no React, no formatting beyond short display
 * strings — so the reasoning can actually be tested.
 *
 * Rule: never rank a driver by tax saved alone. On a real profile, filling to
 * the 32% bracket cut lifetime tax by $2.4M but ended $1.1M poorer than filling
 * to 22%, because tax paid early stops compounding. Ending wealth is the
 * yardstick — tax is just an input to it.
 */

/** Withdrawal-rate bands. 4% is the Bengen rule of thumb, not a law. */
const WR_SAFE = 0.035;
const WR_WATCH = 0.045;

const pct = (x) => `${Math.round(x * 100)}%`;
const money = (x) =>
  `$${Math.round(x).toLocaleString("en-US")}`;

/**
 * @param {object} p   profile/params (the same object the engines receive)
 * @param {object} mc  runMC result: { rate, pcts, term, medianExhaustAge,
 *                     bracketOverrideRate, rothReserveBrokenRate, mwRate }
 * @returns {{ rate:number, verdict:string, headline:string, drivers:Array }}
 *   driver: { id, label, value, detail, lever, severity: "good"|"watch"|"risk" }
 */
export function explainScore(p = {}, mc = null) {
  if (!mc || !Array.isArray(mc.pcts) || mc.pcts.length === 0) {
    return { rate: 0, verdict: "unknown", headline: "Run the Monte Carlo to see what drives your score.", drivers: [] };
  }

  const rate = mc.rate ?? 0;
  const retireAge = p.retireAge ?? 65;
  const endAge = p.endAge ?? 90;
  const spend = p.sp ?? 0;

  // Portfolio at retirement — the median path's first year.
  const portAtRetire = mc.pcts[0]?.p50 ?? 0;

  // Income that arrives whether or not markets cooperate. `ssb` starts at ssAge,
  // so at retirement it may be zero — that gap is itself a driver below.
  const rental = (p.propIncome || 0) + (p.ab > 0 ? p.ab : 0);
  const ssAtRetire = (p.ssAge ?? 67) <= retireAge ? (p.ssb || 0) : 0;
  const guaranteed = rental + ssAtRetire;
  const coverage = spend > 0 ? Math.min(1, guaranteed / spend) : 1;

  // The first-year draw the portfolio must actually carry.
  const initialDraw = Math.max(0, spend - guaranteed);
  const wr = portAtRetire > 0 ? initialDraw / portAtRetire : 0;

  const pretaxBal = (p.accounts || [])
    .filter((a) => a.category === "pretax")
    .reduce((s, a) => s + (a.balance || 0), 0);
  const totalBal = (p.accounts || []).reduce((s, a) => s + (a.balance || 0), 0) || p.port || 0;
  const pretaxShare = totalBal > 0 ? pretaxBal / totalBal : 0;

  const drivers = [];

  // ── 1. Withdrawal rate — the primary determinant of survival ──────────────
  drivers.push({
    id: "withdrawal_rate",
    label: "Withdrawal rate at retirement",
    value: `${(wr * 100).toFixed(1)}%`,
    detail: initialDraw > 0
      ? `Your portfolio covers ${money(initialDraw)} of ${money(spend)} spending in year one — ${(wr * 100).toFixed(1)}% of ${money(portAtRetire)}. Below about 3.5% is historically durable over a long retirement; above 4.5% depends on good markets.`
      : `Guaranteed income covers all of your spending, so the portfolio carries nothing in year one. This is the strongest position a plan can be in.`,
    lever: wr > WR_WATCH
      ? `Cutting spending to ${money(guaranteed + portAtRetire * WR_WATCH)} or working one more year both move this the most.`
      : "No change needed — this is the number most plans fail on.",
    severity: initialDraw === 0 || wr <= WR_SAFE ? "good" : wr <= WR_WATCH ? "watch" : "risk",
  });

  // ── 2. Guaranteed-income coverage ─────────────────────────────────────────
  drivers.push({
    id: "guaranteed_coverage",
    label: "Spending covered by income you don't have to sell for",
    value: pct(coverage),
    detail: `${money(guaranteed)} of ${money(spend)} comes from Social Security and rental/other income at retirement. Income you don't sell assets for is immune to market timing, which is what makes plans survive bad decades.`,
    lever: coverage < 0.5
      ? "Delaying Social Security raises this permanently — each year of delay adds roughly 7-8% to the benefit for life."
      : "Strong. This is why your plan tolerates poor markets.",
    severity: coverage >= 0.6 ? "good" : coverage >= 0.3 ? "watch" : "risk",
  });

  // ── 3. Where it fails, and when ───────────────────────────────────────────
  if (rate < 0.995 && mc.medianExhaustAge != null) {
    drivers.push({
      id: "depletion",
      label: "When money runs out in the scenarios that fail",
      value: `Age ${mc.medianExhaustAge}`,
      detail: `${pct(1 - rate)} of scenarios run short. In the typical failure the portfolio is exhausted at ${mc.medianExhaustAge}, leaving ${Math.max(0, endAge - mc.medianExhaustAge)} years funded by income alone.`,
      lever: `A spending cut only in the bad scenarios — the guardrail approach — recovers most of this without changing your plan today.`,
      severity: rate >= 0.85 ? "watch" : "risk",
    });
  }

  // ── 4. Retiring before 59½ ────────────────────────────────────────────────
  if (retireAge < 59.5 && pretaxShare > 0.5) {
    const penaltyYears = Math.ceil(59.5 - retireAge);
    drivers.push({
      id: "early_penalty",
      label: "Retiring before 59½ with mostly pre-tax savings",
      value: `${penaltyYears} yrs · ${pct(pretaxShare)} pre-tax`,
      detail: `${pct(pretaxShare)} of your savings sits in pre-tax accounts, and withdrawals before 59½ normally owe a 10% additional tax on top of income tax for about ${penaltyYears} years.`,
      lever: p.ruleOf55
        ? "Rule of 55 is enabled, which removes the penalty on the plan you separate from — keep that 401(k) UNROLLED or the exception is lost permanently."
        : "Two exceptions can remove this: the Rule of 55 (if you separate in or after the year you turn 55) or a 72(t) SEPP. Neither is assumed unless you enable it.",
      severity: p.ruleOf55 || p.sepp72t ? "good" : "watch",
    });
  }

  // ── 5. Pre-tax concentration → forced income later ────────────────────────
  if (pretaxShare > 0.7 && pretaxBal > 500_000) {
    drivers.push({
      id: "rmd_bomb",
      label: "Forced withdrawals later (RMDs)",
      value: `${pct(pretaxShare)} pre-tax`,
      detail: `A large pre-tax balance becomes forced taxable income once required distributions begin, which can push you into higher brackets, raise Medicare premiums two years later, and increase the taxable share of Social Security — all at once, and not at your choosing.`,
      lever: "Roth conversions during your lowest-income years reduce this. Compare options on ending wealth, not on tax saved — the lowest-tax choice is often not the richest one.",
      severity: "watch",
    });
  }

  // ── 6. Preferences the engine had to yield ────────────────────────────────
  // Used to enforce these silently as hard limits and just fail the plan.
  // If a preference is getting overridden now, say so.
  if ((mc.bracketOverrideRate ?? 0) > 0.02) {
    drivers.push({
      id: "bracket_yielded",
      label: "Your tax-bracket target could not always be honoured",
      value: pct(mc.bracketOverrideRate),
      detail: `In ${pct(mc.bracketOverrideRate)} of scenarios, funding your spending required drawing past your chosen bracket target. Spending is funded first — a higher tax bill is better than an unfunded year — but it means the target is not reachable every year.`,
      lever: "A higher target, or more money in taxable/Roth accounts to draw from, removes the conflict.",
      severity: "watch",
    });
  }
  if ((mc.rothReserveBrokenRate ?? 0) > 0.02) {
    drivers.push({
      id: "reserve_broken",
      label: "Your Roth emergency reserve had to be used",
      value: pct(mc.rothReserveBrokenRate),
      detail: `In ${pct(mc.rothReserveBrokenRate)} of scenarios every other account was exhausted and the reserve was tapped to keep spending funded. It is used strictly last.`,
      lever: "A smaller reserve, lower spending, or more taxable savings all reduce how often this happens.",
      severity: "watch",
    });
  }

  // Risk first, then watch, then good — someone scanning for a problem should
  // hit it right away instead of reading past the reassurance.
  const order = { risk: 0, watch: 1, good: 2 };
  drivers.sort((a, b) => order[a.severity] - order[b.severity]);

  const verdict = rate >= 0.9 ? "strong" : rate >= 0.8 ? "solid" : rate >= 0.7 ? "fragile" : "at risk";
  const worst = drivers.find((d) => d.severity === "risk");
  const headline = worst
    ? `${pct(rate)} of scenarios succeed. The biggest factor is your ${worst.label.toLowerCase()}.`
    : `${pct(rate)} of scenarios succeed, and nothing in your plan stands out as a risk.`;

  return { rate, verdict, headline, drivers };
}
