/**
 * H2 billing math — refund credit-delta correctness.
 * Covers the partial-refund path the audit flagged as untested.
 */
import { refundCreditsDelta, CREDITS_PER_DOLLAR } from "../functions/_shared/billing-math.js";

describe("refundCreditsDelta (H2 charge.refunded)", () => {
  test("rate constant matches the 1000-credits-per-dollar contract", () => {
    expect(CREDITS_PER_DOLLAR).toBe(1000);
  });

  test("full refund of a $15 pack deducts 15,000 credits (no prior refund)", () => {
    // amount_refunded = 1500 cents, previous = 0
    expect(refundCreditsDelta(1500, 0)).toBe(15_000);
  });

  test("first partial refund deducts only that portion", () => {
    // $5 of a charge refunded so far, none before → 5,000 credits
    expect(refundCreditsDelta(500, 0)).toBe(5_000);
  });

  test("incremental partial refund deducts ONLY the new delta, never double-counts", () => {
    // Charge previously had $5 refunded; now cumulative is $12 → delta $7 = 7,000
    expect(refundCreditsDelta(1200, 500)).toBe(7_000);
  });

  test("re-sent event with no new refund yields 0 (idempotent on amount)", () => {
    expect(refundCreditsDelta(1500, 1500)).toBe(0);
  });

  test("negative delta (data anomaly) clamps to 0, never adds credits", () => {
    expect(refundCreditsDelta(500, 1500)).toBe(0);
  });

  test("defaults previousAmountRefunded to 0 when omitted", () => {
    expect(refundCreditsDelta(1000)).toBe(10_000);
  });

  test("missing/undefined inputs are treated as 0, not NaN", () => {
    expect(refundCreditsDelta(undefined, undefined)).toBe(0);
    expect(refundCreditsDelta(null, null)).toBe(0);
  });

  test("rounds sub-cent fractional rates to the nearest whole credit", () => {
    // $0.1234 refunded × 1000 = 123.4 → 123
    expect(refundCreditsDelta(12.34, 0)).toBe(123);
  });
});
