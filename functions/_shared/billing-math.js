/**
 * Pure billing math — no I/O, no Stripe, no D1. Kept dependency-free so it can be
 * unit-tested directly from the Jest suite in src/ (CRA's test runner only picks
 * up test files under src/, but they may import helpers from anywhere).
 */

// 1 000 credits per dollar — must match client-side pack definitions and webhook.js.
export const CREDITS_PER_DOLLAR = 1_000;

/**
 * Credits to deduct for a single `charge.refunded` event.
 *
 * Stripe sends the NEW cumulative `amount_refunded` on the charge, and the prior
 * cumulative total under `event.data.previous_attributes.amount_refunded`. The
 * delta is what was refunded in *this* event — so partial refunds never
 * double-count and a re-sent event with no new refund yields 0.
 *
 * @param {number} amountRefundedCents      charge.amount_refunded (new cumulative, cents)
 * @param {number} previousAmountRefundedCents previous_attributes.amount_refunded (cents)
 * @param {number} creditsPerDollar         conversion rate (default CREDITS_PER_DOLLAR)
 * @returns {number} non-negative integer credits to deduct
 */
export function refundCreditsDelta(
  amountRefundedCents,
  previousAmountRefundedCents = 0,
  creditsPerDollar = CREDITS_PER_DOLLAR
) {
  const deltaCents = (Number(amountRefundedCents) || 0) - (Number(previousAmountRefundedCents) || 0);
  if (deltaCents <= 0) return 0;
  return Math.round((deltaCents / 100) * creditsPerDollar);
}
