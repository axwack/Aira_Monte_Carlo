/**
 * Withdrawal distribution strategies — the live set, and what happened to the
 * ones we retired.
 *
 * The app shipped 12 distribution strategies. Six were either arithmetically
 * identical to a survivor, a near-duplicate of one, or carried a hardcoded
 * assumption the UI never disclosed. Removed them.
 *
 * Deleting a strategy isn't just a UI change though. A saved profile still
 * says withdrawalStrategy: "cape", and the engines dispatch on that string
 * with an if/else chain that has no final else. An unrecognized value matches
 * nothing — sp never gets assigned, so spending never inflation-adjusts and
 * the spending smile deflates it ~1%/yr for the rest of the plan. Measured on
 * a $1.5M / $80k profile: lifetime spend $2,112,063 against Guyton-Klinger's
 * $3,151,968, a 33% shortfall, produced silently with no error and no
 * on-screen difference. That's the failure mode this module exists to prevent.
 *
 * So every retired value has to (a) resolve to a live strategy before it
 * reaches an engine, and (b) say so on screen. Silent remapping would just be
 * the same bug in a nicer coat.
 */

/** Strategies the app offers today. Order is the order shown in the picker. */
export const LIVE_STRATEGIES = [
  "smart",
  "gk",
  "bengen",
  "fixed",
  "ninety_five_rule",
  "vpw",
];

/** Fallback when a value is missing entirely (not retired — simply absent). */
export const DEFAULT_STRATEGY = "gk";

/**
 * Retired strategies → what a saved profile becomes.
 *
 * to        the live strategy that replaces it
 * set       companion fields that make the replacement reproduce the old plan
 * fidelity  how much the user's projected spending actually moves:
 *             "exact"   - identical to the dollar
 *             "close"   - same spending rate, one secondary behavior differs
 *             "changed" - a different rule, the numbers move
 * basis     why this target — shown to the user, so it has to be true
 *
 * Display names come from STRATEGY_LABELS below, not a `label` here.
 *
 * Every fidelity claim here was measured against the live engine, not
 * inferred from the formulas — see withdrawalStrategyMigration.test.js, which
 * re-proves them instead of trusting this comment. cape is "close" and not
 * "exact" for exactly that reason: the rate identity is real, but CAPE also
 * clamped its result to the GK floor/ceiling and Fixed % doesn't, which
 * showed up as a $307 year-1 difference on the measured profile. Reading the
 * formulas alone would've shipped "your spending is unchanged," which isn't
 * true.
 */
export const RETIRED_STRATEGIES = {
  cape: {
    to: "fixed",
    set: { fixedWithdrawalRate: 0.04 },
    fidelity: "close",
    basis:
      "CAPE was hardcoded to a CAPE ratio of 20, which fixes its rate at " +
      "0.015 + 0.5 × (1/20) = 4.0% of the current portfolio — the same " +
      "arithmetic as Fixed 4%, which is what your plan now uses. One " +
      "difference: CAPE also held its result inside your spending floor and " +
      "ceiling, and Fixed % does not, so any year those would have bound will " +
      "differ.",
  },
  one_n: {
    to: "vpw",
    set: { vpwRealReturn: 0 },
    fidelity: "exact",
    basis:
      "1/N divides the portfolio by the years remaining. That is exactly VPW " +
      "with a 0% assumed real return, so VPW at 0% reproduces it to the dollar.",
  },
  vanguard: {
    to: "gk",
    fidelity: "changed",
    basis:
      "Vanguard Dynamic Spending is a ceiling-and-floor guardrail rule, the " +
      "same family as Guyton-Klinger, which is now the guardrail strategy AiRA " +
      "carries. Guardrails still adapt your spending to markets, but the " +
      "trigger rules differ, so your projected spending will change.",
  },
  risk: {
    to: "gk",
    fidelity: "changed",
    basis:
      "Risk-Based Guardrails cut or raise spending when the withdrawal rate " +
      "drifts from a safe threshold — the same idea as Guyton-Klinger's " +
      "capital-preservation and prosperity rules, which are better specified. " +
      "Your projected spending will change.",
  },
  endowment: {
    to: "gk",
    fidelity: "changed",
    basis:
      "The Endowment rule put 70% of its weight on last year's " +
      "inflation-adjusted spending and 30% on portfolio value — a dampened " +
      "dynamic rule. Guyton-Klinger is AiRA's dampened dynamic rule. Your " +
      "projected spending will change.",
  },
  kitces: {
    to: "bengen",
    fidelity: "changed",
    basis:
      "Kitces Ratcheting is Bengen's inflation-adjusted spending plus an " +
      "upward-only ratchet after strong markets. Bengen is that same floor " +
      "without the ratchet, so spending no longer steps up after a run-up.",
  },
};

/**
 * Display names, live and retired.
 *
 * Lives here — a leaf module with no imports — so App.jsx and
 * report/PrintReport.jsx can both read it. PrintReport used to carry a
 * hand-synced copy (it can't import App.jsx, which imports it back), and
 * "kept in sync by hand" is exactly how a printed report ends up naming a
 * strategy the app no longer runs.
 *
 * Retired ids keep their labels so a migration notice, an old checkpoint, or
 * a printed report can still name what the user used to have.
 */
export const STRATEGY_LABELS = {
  smart: "Smart Waterfall",
  gk: "Guyton‑Klinger",
  bengen: "Bengen 4% Rule",
  fixed: "Fixed Percentage",
  ninety_five_rule: "95% Rule",
  vpw: "VPW (Variable Percentage)",
  vanguard: "Vanguard Dynamic Spending",
  risk: "Risk‑Based Guardrails",
  kitces: "Kitces Ratcheting",
  cape: "CAPE‑Based",
  endowment: "Endowment Model",
  one_n: "1/N (Remaining Years)",
};

/** True if `s` is a strategy the app still runs. */
export function isLiveStrategy(s) {
  return LIVE_STRATEGIES.includes(s);
}

/**
 * Map any strategy id to one an engine can actually dispatch on.
 *
 * The guard of last resort: engines call this so a params object assembled
 * anywhere — an old export, a URL, a test fixture, a preview dropdown — can
 * never reach the if/else chain as an unmatched string. Handles values that
 * are neither live nor retired (typos, corruption) by returning the default
 * instead of throwing, because failing a whole projection over one bad enum
 * is worse than running the default one.
 */
export function resolveStrategy(s) {
  if (isLiveStrategy(s)) return s;
  const retired = RETIRED_STRATEGIES[s];
  if (retired) return retired.to;
  return DEFAULT_STRATEGY;
}

/**
 * Migrate a saved profile off a retired strategy.
 *
 * Returns a new object, never mutates the input. When nothing was retired
 * the input comes back unchanged (same reference), so callers can cheaply
 * test whether a migration happened.
 *
 * Companion fields are written only for the rate-preserving mappings, and
 * only because the retired strategy ignored the user's stored value anyway:
 * cape never read fixedWithdrawalRate and one_n never read vpwRealReturn, so
 * overwriting them preserves the plan the user was actually running instead
 * of overriding a choice they made.
 *
 * The stamp is what makes the change visible. withdrawalStrategyMigratedFrom
 * survives into the exported JSON and drives the on-screen notice.
 */
export function migrateWithdrawalStrategy(profile) {
  if (!profile || typeof profile !== "object") return profile;
  const from = profile.withdrawalStrategy;
  const rule = RETIRED_STRATEGIES[from];
  if (!rule) return profile;
  return {
    ...profile,
    ...(rule.set || {}),
    withdrawalStrategy: rule.to,
    withdrawalStrategyMigratedFrom: from,
  };
}

/**
 * The sentence shown to a user whose profile was migrated. Returns null when
 * there is nothing to say, so the caller renders nothing rather than an empty
 * banner.
 */
export function migrationNotice(migratedFrom) {
  const rule = RETIRED_STRATEGIES[migratedFrom];
  if (!rule) return null;
  return {
    from: migratedFrom,
    fromLabel: STRATEGY_LABELS[migratedFrom] || migratedFrom,
    to: rule.to,
    toLabel: STRATEGY_LABELS[rule.to] || rule.to,
    fidelity: rule.fidelity,
    basis: rule.basis,
    // The one line that tells the user whether they need to do anything.
    impact:
      rule.fidelity === "exact"
        ? "Your projected spending is unchanged."
        : rule.fidelity === "close"
        ? "Your projected spending is nearly unchanged — check the years noted above if your floor or ceiling is tight."
        : "Your projected spending has changed. Review the year-by-year table below, and pick a different strategy if this is not what you want.",
  };
}
