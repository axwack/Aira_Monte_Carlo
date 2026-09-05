/**
 * provenance.js — every summary figure, with the arithmetic that produces it.
 *
 * Why this lives here instead of just a test fixture: I want every label to
 * make the calculation behind it obvious to the user, or at least show it if
 * it's not that important. It's not enough for a transformed figure to say
 * it was transformed — it should show the actual sum. That came out of three
 * bugs users caught by doing the arithmetic themselves that the test suite
 * never would have: "safe spend" (which just echoed an input back), "Median
 * accumulation" (a single projection dressed up as more), and the WR column
 * (a spending rate wearing a withdrawal-rate label — thanks u/garylapointe).
 * In every case, showing the formula would have made the mistake obvious on
 * first look.
 *
 * The registry used to live inside `provenance.test.js`. It moved here so
 * there's one declaration that's both rendered by the app and checked by the
 * test — otherwise the app needs its own copy of every formula, which is the
 * kind of duplication that bit us before (see the four competing card styles
 * it took to notice that one).
 *
 * Fields:
 *   id        stable key, used to look the entry up from a component
 *   label     what the card says on screen
 *   source    the exact code expression — for maintainers, not users
 *   kind      computed | echoed | point-in-time | count  (see below)
 *   formula   the user-facing arithmetic. Required. Plain words, not code:
 *             "Total Draw ÷ portfolio at the start of the year", never
 *             "r.totalWithdrawal / startPort".
 *   at        point-in-time only: which age or moment the value is from
 *
 * Kinds:
 *   "computed"      the engine derived it — the label can claim a derivation.
 *   "echoed"        a user input played back (possibly ÷12) — the label
 *                   shouldn't imply the app calculated or verified it.
 *   "point-in-time" a balance/state at one age — the label should name the age.
 *   "count"         a tally — the label should say what's being counted.
 *
 * Adding a card:
 *   1. Write the card in App.jsx.
 *   2. Add an entry here — including `formula`.
 *   3. Render the formula (see `formulaFor`).
 * Skip step 2 and the build goes red: provenance.test.js checks that the
 * card count in App.jsx matches this registry's size, and that every entry
 * has a formula.
 */

export const METRIC_CARDS = [
  // ── Roth Conversion Explorer — plan summary ──────────────────────────────
  { id: "conv-count", label: "Conversions", kind: "count",
    source: "convRows.length",
    formula: "Number of years in the plan window with a conversion" },
  { id: "conv-pinned", label: "Pinned / Forecast", kind: "count",
    source: "convRows.filter(manual|!manual).length",
    formula: "Years you pinned by hand vs years the optimizer chose, counted from this year on" },
  { id: "conv-tax-delta", label: "Lifetime Tax Delta", kind: "computed",
    source: "taxD (opt.cTax − cur.cTax)",
    formula: "Lifetime tax WITH conversions − lifetime tax WITHOUT them" },
  { id: "conv-rmd-red", label: "RMD Reduction", kind: "computed",
    source: "rmdRed (from cur.cRmd vs opt.cRmd)",
    formula: "How much smaller lifetime RMDs become: 1 − (RMDs with conversions ÷ RMDs without)" },
  { id: "conv-eff-rate", label: "Lifetime Eff. Rate", kind: "computed",
    source: "leOpt / leCur",
    formula: "Lifetime tax ÷ lifetime income, shown for the optimized plan vs your current one" },

  // ── Year-end conversion check-in ─────────────────────────────────────────
  { id: "ye-convert", label: "Convert This Amount", kind: "computed",
    source: "recConv (yearEndTaxRoom)",
    formula: "Room left in your target bracket after this year's actual income" },
  { id: "ye-tax", label: "Total Tax Cost", kind: "computed",
    source: "recTax.total",
    formula: "Federal + state tax on the conversion, plus any IRMAA it triggers two years out" },
  { id: "ye-net-roth", label: "Net → Roth", kind: "computed",
    source: "cyNetRoth",
    formula: "Amount converted − the tax paid from the conversion (0 if you fund tax elsewhere)" },

  // ── Conversion comparison (Without vs With) ──────────────────────────────
  // `nw` is r.totalPort — all four buckets, not just the two the chart above stacks.
  { id: "cmp-savings-without", label: "Savings at Age {endAge} — Without", kind: "point-in-time", at: "endAge",
    source: "cur.rows[last].nw = totalPort",
    formula: "Cash + taxable + pre-tax + Roth at your planning age, with no conversions" },
  { id: "cmp-savings-with", label: "Savings at Age {endAge} — With Conversions", kind: "point-in-time", at: "endAge",
    source: "opt.rows[last].nw = totalPort",
    formula: "Same four buckets at the same age, running the conversion plan" },
  { id: "cmp-rmd-without", label: "Lifetime RMDs — Without", kind: "computed",
    source: "cur.cRmd",
    formula: "Every forced distribution added up, with no conversions" },
  { id: "cmp-rmd-with", label: "Lifetime RMDs — With Conversions", kind: "computed",
    source: "opt.cRmd",
    formula: "Same sum, after conversions have shrunk the pre-tax balance" },

  // ── Withdrawal Plan summary ──────────────────────────────────────────────
  { id: "wd-lifetime-tax", label: "Smart Lifetime Tax", kind: "computed",
    source: "summary.lifetimeTaxSmart",
    formula: "Federal + state + IRMAA for every year of the plan, added up" },
  { id: "wd-tax-savings", label: "Tax Savings vs No Plan", kind: "computed",
    source: "summary.taxSavings",
    formula: "Lifetime tax drawing pre-tax first with no guardrails − lifetime tax on this plan" },
  { id: "wd-roth-end", label: "Roth at Age {endAge}", kind: "point-in-time", at: "endAge",
    source: "summary.finalRothSmart",
    formula: "Roth balance left at your planning age" },
  { id: "wd-irmaa-years", label: "IRMAA Years Triggered", kind: "count",
    source: "summary.irmaaYearsTriggered",
    formula: "Years whose MAGI crosses an IRMAA tier, so Medicare costs more two years later" },
  { id: "wd-avg-wr", label: "Avg. Withdrawal Rate", kind: "computed",
    source: "mean(wrAt(i)) = totalWithdrawal ÷ START-of-year portfolio",
    formula: "Average of each year's Total Draw ÷ the portfolio at the START of that year. The DRAW, not your spending." },
  { id: "wd-depletion", label: "Portfolio Depletion", kind: "point-in-time", at: "first depleted year",
    source: "depletionRow.age | 'Never'",
    formula: "The first age at which the portfolio reaches zero, or Never" },

  // ── Deterministic withdrawal view ────────────────────────────────────────
  { id: "det-port-retire", label: "Portfolio at Retirement", kind: "computed",
    source: "accumulateToRetirement(p).total",
    formula: "Today's balances grown at the expected return until your retirement age — ONE projection, not a median" },
  { id: "det-init-wr", label: "Initial Withdrawal Rate", kind: "computed",
    source: "initWR = net need ÷ portAtRetire",
    formula: "(First-year spending − guaranteed income) ÷ portfolio at retirement" },
  { id: "det-final-port", label: "Final Portfolio (Age N)", kind: "point-in-time", at: "schedule[last].age",
    source: "schedule[last].portfolioEnd",
    formula: "Balance at the end of the last year in the schedule" },

  // ── Progress / check-ins ─────────────────────────────────────────────────
  { id: "prog-latest", label: "Latest success rate", kind: "point-in-time", at: "latest check-in date",
    source: "latest.successRate (stored check-in)",
    formula: "The success rate saved at your most recent check-in — a stored value, not recomputed now" },
  { id: "prog-since-first", label: "Since first check-in", kind: "computed",
    source: "ratePP (latest − first)",
    formula: "Latest success rate − the rate at your first check-in, in percentage points" },
  { id: "prog-port-change", label: "Portfolio change", kind: "computed",
    source: "portDelta (latest − first)",
    formula: "Portfolio at the latest check-in − portfolio at the first" },

  // ── Stress test ──────────────────────────────────────────────────────────
  { id: "stress-success", label: "Stress success", kind: "computed",
    source: "stress.rate",
    formula: "Share of simulated paths still funded with this scenario applied" },
  { id: "stress-delta", label: "Delta vs base", kind: "computed",
    source: "stress.rate − mc.rate",
    formula: "Scenario success rate − your baseline success rate, in percentage points" },

  // ── Widow's-penalty delta ─────────────────────────────────────────────────
  { id: "widow-penalty", label: "Widow's penalty", kind: "computed",
    source: "(est.base − est.noDeath) × 100, same seed/N",
    formula: "Success rate WITH the modelled death − success rate without it, on identical market paths and the same random seed" },
  { id: "widow-explainer", label: "What this figure is", kind: "computed",
    source: "static explanatory prose, not a figure",
    formula: "Not a figure — prose explaining the two runs above" },

  // ── Bucket strategy (factory: one JSX site, N cards from an array) ───────
  { id: "bucket-metrics", label: "{m.l} (bucket metrics map)", kind: "computed", factory: true,
    source: "m.v from the bucket metrics array",
    formula: "Per-bucket totals taken from the bucket allocation you set" },

  // ── Mortgage calculator ──────────────────────────────────────────────────
  { id: "mort-balance", label: "Current balance", kind: "echoed",
    source: "bal (mortgage inputs)",
    formula: "The mortgage balance you entered — played back, not calculated" },
  { id: "mort-payoff", label: "Payoff year", kind: "point-in-time", at: "payoff year",
    source: "sched.payoffYr",
    formula: "The year the amortisation schedule reaches a zero balance, including extra payments" },
  { id: "mort-interest-saved", label: "Interest saved", kind: "computed",
    source: "sched.interestSaved",
    formula: "Total interest with no extra payments − total interest with yours" },
  { id: "mort-pi", label: "Monthly P&I", kind: "computed",
    source: "sched.pmt",
    formula: "Standard amortisation payment from your balance, rate and remaining term" },

  // ── Net worth tab ────────────────────────────────────────────────────────
  { id: "nw-peak-liquid", label: "Peak liquid (median)*", kind: "point-in-time", at: "peakAge",
    source: "max(mc.pcts[].p50)",
    formula: "The highest median (50th percentile) portfolio value across the whole simulation horizon" },
  { id: "nw-at-plan-age", label: "Net worth at age {planAge}", kind: "point-in-time", at: "p.endAge",
    source: "finalNW",
    formula: "Portfolio + real-estate equity at your planning age, if real estate is included" },
  { id: "nw-mortgage-free", label: "Mortgage-free", kind: "point-in-time", at: "payoff year",
    source: "mortSched.payoffYr",
    formula: "Same payoff year as the mortgage schedule, shown here for the net-worth timeline" },
  { id: "nw-re-equity", label: "Real estate equity", kind: "computed",
    source: "reEquity",
    formula: "Appreciated property value − remaining mortgage balance. NOT part of the liquid total." },

  // ── Spending-target card (three branches, one card) ──────────────────────
  // The middle branch is the one that shipped mislabelled twice: it just echoes p.sp / 12.
  { id: "spend-target", label: "{label} — spending target (3 branches)", kind: "echoed", factory: true,
    source: "fixed: port×rate/12 (computed) · target set: p.sp/12 (ECHOED) · no target: port×benchRate/12 (computed)",
    formula: "Your annual spending target ÷ 12 when you have set one (played back, not computed); otherwise a % of the portfolio ÷ 12" },
];

/** Look up a card's user-facing arithmetic by id. */
export function formulaFor(id) {
  const e = METRIC_CARDS.find(c => c.id === id);
  return e ? e.formula : null;
}

/** The whole entry, for callers that also want `kind` or `at`. */
export function provenanceFor(id) {
  return METRIC_CARDS.find(c => c.id === id) || null;
}
