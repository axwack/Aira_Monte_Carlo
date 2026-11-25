import { refundCreditsDelta, CREDITS_PER_DOLLAR } from "../functions/_shared/billing-math.js";
import { shouldRefreshJWT, JWT_TTL_SECONDS } from "../functions/_shared/jwt.js";

describe("refundCreditsDelta (H2 charge.refunded)", () => {
  test("rate constant matches the 1000-credits-per-dollar contract", () => {
    expect(CREDITS_PER_DOLLAR).toBe(1000);
  });

  test("full refund of a $15 pack deducts 15,000 credits (no prior refund)", () => {
    expect(refundCreditsDelta(1500, 0)).toBe(15_000);
  });

  test("first partial refund deducts only that portion", () => {
    expect(refundCreditsDelta(500, 0)).toBe(5_000);
  });

  test("incremental partial refund deducts ONLY the new delta, never double-counts", () => {
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
    expect(refundCreditsDelta(12.34, 0)).toBe(123);
  });
});

describe("shouldRefreshJWT — sliding session", () => {
  const now = 1_800_000_000;

  test("a freshly minted token is NOT refreshed", () => {
    const payload = { customerId: "cus_1", exp: now + JWT_TTL_SECONDS };
    expect(shouldRefreshJWT(payload, now)).toBe(false);
  });

  test("just inside halfway — still not refreshed", () => {
    const payload = { customerId: "cus_1", exp: now + JWT_TTL_SECONDS / 2 + 60 };
    expect(shouldRefreshJWT(payload, now)).toBe(false);
  });

  test("past halfway — refreshed", () => {
    const payload = { customerId: "cus_1", exp: now + JWT_TTL_SECONDS / 2 - 60 };
    expect(shouldRefreshJWT(payload, now)).toBe(true);
  });

  test("nearly expired — refreshed (the case that used to lose credits)", () => {
    const payload = { customerId: "cus_1", exp: now + 3600 };
    expect(shouldRefreshJWT(payload, now)).toBe(true);
  });

  test("already expired — NOT refreshed (verifyJWT rejects it first)", () => {
    expect(shouldRefreshJWT({ customerId: "cus_1", exp: now - 1 }, now)).toBe(false);
    expect(shouldRefreshJWT({ customerId: "cus_1", exp: now - 86_400 }, now)).toBe(false);
  });

  test("a token with no exp is left alone", () => {
    expect(shouldRefreshJWT({ customerId: "cus_1" }, now)).toBe(false);
  });

  test("missing or malformed payload never throws", () => {
    expect(shouldRefreshJWT(null, now)).toBe(false);
    expect(shouldRefreshJWT(undefined, now)).toBe(false);
    expect(shouldRefreshJWT({}, now)).toBe(false);
    expect(shouldRefreshJWT({ exp: "soon" }, now)).toBe(false);
  });

  test("repeated refreshes keep an active customer alive indefinitely", () => {
    const VISIT_GAP = 60 * 24 * 3600;
    let exp = now + JWT_TTL_SECONDS;
    let clock = now;
    let refreshes = 0;
    for (let visit = 0; visit < 30; visit++) {
      clock += VISIT_GAP;
      expect(clock).toBeLessThan(exp);
      if (shouldRefreshJWT({ customerId: "c", exp }, clock)) {
        exp = clock + JWT_TTL_SECONDS;
        refreshes++;
      }
    }
    expect(refreshes).toBe(30);
    expect(exp).toBeGreaterThan(clock);
  });

  test("a visit gap longer than the TTL still expires — restore link is the path", () => {
    const exp = now + JWT_TTL_SECONDS;
    const clockAfterLongAbsence = now + JWT_TTL_SECONDS + 1;
    expect(shouldRefreshJWT({ customerId: "c", exp }, clockAfterLongAbsence)).toBe(false);
  });

  test("the TTL is long enough that a quarterly visitor never expires", () => {
    expect(JWT_TTL_SECONDS).toBeGreaterThanOrEqual(90 * 24 * 3600);
  });
});
