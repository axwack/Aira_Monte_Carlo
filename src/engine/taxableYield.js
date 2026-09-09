/**
 * Taxable-account annual yield tax drag.
 *
 * Taxable-category balances grow via one blended return, with ALL growth
 * deferred to LTCG-at-withdrawal (see buildWithdrawalWaterfall.js's
 * taxableBasis mechanics). That's wrong for the yield slice of a real
 * account: interest and dividends are taxed the year they're paid, whether
 * or not they're reinvested. Per-security modeling (muni vs. taxable bond
 * vs. qualified-dividend stock) was rejected as overkill — this is one
 * blended rate, global, not per-account, matching how `taxableBasisPct`
 * already works.
 *
 * `yieldPct` is a dividend/interest-yield convention (% of balance, same
 * convention as `bucket2YieldPct`) — NOT a % of total return. `ordinaryPct`
 * splits that yield into ordinary-taxed (interest, non-qualified dividends)
 * vs. qualified-dividend/LTCG-taxed.
 */
export function taxableYieldSplit(enteringTaxable, yieldPct, ordinaryPct) {
  if (!(enteringTaxable > 0) || !(yieldPct > 0)) {
    return { yieldAmount: 0, ordinaryYield: 0, qualifiedYield: 0 };
  }
  const yieldFrac = Math.max(0, yieldPct) / 100;
  const ordFrac = Math.max(0, Math.min(100, ordinaryPct ?? 0)) / 100;
  const yieldAmount = enteringTaxable * yieldFrac;
  const ordinaryYield = yieldAmount * ordFrac;
  const qualifiedYield = yieldAmount - ordinaryYield;
  return { yieldAmount, ordinaryYield, qualifiedYield };
}
