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
