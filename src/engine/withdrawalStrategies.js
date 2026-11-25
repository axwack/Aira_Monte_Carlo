export const LIVE_STRATEGIES = [
  "smart",
  "gk",
  "bengen",
  "fixed",
  "ninety_five_rule",
  "vpw",
];

export const DEFAULT_STRATEGY = "gk";

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

export function isLiveStrategy(s) {
  return LIVE_STRATEGIES.includes(s);
}

export function resolveStrategy(s) {
  if (isLiveStrategy(s)) return s;
  const retired = RETIRED_STRATEGIES[s];
  if (retired) return retired.to;
  return DEFAULT_STRATEGY;
}

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
    impact:
      rule.fidelity === "exact"
        ? "Your projected spending is unchanged."
        : rule.fidelity === "close"
        ? "Your projected spending is nearly unchanged — check the years noted above if your floor or ceiling is tight."
        : "Your projected spending has changed. Review the year-by-year table below, and pick a different strategy if this is not what you want.",
  };
}
