export const CREDITS_PER_DOLLAR = 1_000;

export function refundCreditsDelta(
  amountRefundedCents,
  previousAmountRefundedCents = 0,
  creditsPerDollar = CREDITS_PER_DOLLAR
) {
  const deltaCents = (Number(amountRefundedCents) || 0) - (Number(previousAmountRefundedCents) || 0);
  if (deltaCents <= 0) return 0;
  return Math.round((deltaCents / 100) * creditsPerDollar);
}
