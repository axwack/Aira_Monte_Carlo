/**
 * Self-service recovery link — minted at checkout, stored client-side.
 *
 * WHY IT EXISTS
 * -------------
 * The JWT is the only proof of purchase and it lives in ONE origin's
 * localStorage. There is no login by design, so clearing site data, switching
 * browsers, or buying a new computer makes paid credits unreachable — and the
 * only route back was an operator issuing a restore link by hand. That does not
 * scale and it fails the customer at the worst possible moment.
 *
 * verify-session now mints a long-lived restore token at the one instant we know
 * the caller is the legitimate buyer (they just completed the Stripe session),
 * and returns it as `restoreUrl`. These tests cover the client half: that it is
 * captured, persisted, self-expires, and never fabricated.
 */

import {
  verifyStripeSession,
  setStoredRecoveryLink,
  getStoredRecoveryLink,
  clearStoredRecoveryLink,
} from "./credits.js";

const JWT = "header.payload.sig";

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

const okSession = (extra = {}) => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ token: JWT, credits: 5000, ...extra }),
  });
};

describe("storage", () => {
  test("round-trips a link", () => {
    setStoredRecoveryLink("https://x.test/?restore=abc", "2027-01-01T00:00:00Z");
    expect(getStoredRecoveryLink()).toEqual({
      url: "https://x.test/?restore=abc",
      expiresAt: "2027-01-01T00:00:00Z",
    });
  });

  test("returns null when nothing is stored", () => {
    expect(getStoredRecoveryLink()).toBeNull();
  });

  test("clear removes it", () => {
    setStoredRecoveryLink("https://x.test/?restore=abc");
    clearStoredRecoveryLink();
    expect(getStoredRecoveryLink()).toBeNull();
  });

  test("an EXPIRED link reads as null, not as a usable link", () => {
    // Offering a dead link is worse than offering none: the customer would try
    // it, be told "invalid", and have no idea why it stopped working.
    setStoredRecoveryLink("https://x.test/?restore=old", "2020-01-01T00:00:00Z");
    expect(getStoredRecoveryLink()).toBeNull();
  });

  test("no expiry means it does not self-expire", () => {
    setStoredRecoveryLink("https://x.test/?restore=abc");
    expect(getStoredRecoveryLink()?.url).toBe("https://x.test/?restore=abc");
  });

  test("corrupt stored JSON returns null instead of throwing", () => {
    localStorage.setItem("airaRecoveryLink.v1", "{not json");
    expect(getStoredRecoveryLink()).toBeNull();
  });
});

describe("verifyStripeSession captures the link", () => {
  test("persists restoreUrl returned by the server", async () => {
    okSession({ restoreUrl: "https://x.test/?restore=tok", restoreExpiresAt: "2027-01-01T00:00:00Z" });
    const out = await verifyStripeSession("cs_test_1", "nonce");
    expect(out.restoreUrl).toBe("https://x.test/?restore=tok");
    expect(getStoredRecoveryLink()).toEqual({
      url: "https://x.test/?restore=tok",
      expiresAt: "2027-01-01T00:00:00Z",
    });
  });

  test("a session with no restoreUrl stores nothing — never invents one", async () => {
    // The mint is best-effort server-side (it must never block the JWT the
    // purchase depends on), so the client has to tolerate its absence.
    okSession();
    const out = await verifyStripeSession("cs_test_2", "nonce");
    expect(out.restoreUrl).toBeUndefined();
    expect(getStoredRecoveryLink()).toBeNull();
  });

  test("the JWT is still stored when the recovery mint was skipped", async () => {
    // The purchase must succeed regardless. This is the regression that matters:
    // a failed recovery mint degrades recovery, not the sale.
    okSession();
    await verifyStripeSession("cs_test_3", "nonce");
    expect(localStorage.getItem("airaJWT.v1")).toBe(JWT);
  });
});
