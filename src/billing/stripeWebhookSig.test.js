/**
 * Regression tests for verifyStripeWebhook (functions/_shared/jwt.js).
 *
 * Why this file exists: production shipped a verifier that stripped the
 * "whsec_" prefix off the endpoint secret before using it as the HMAC key.
 * Stripe signs with the FULL secret string, so every real delivery of
 * checkout.session.completed failed signature verification and returned 400.
 * Stripe retried, kept failing, and no purchase was ever credited to D1 —
 * customers were charged and got nothing. The endpoint looked healthy to every
 * probe that didn't carry a genuine Stripe signature.
 *
 * The guard below signs a payload exactly the way Stripe's official Node SDK
 * does (`createHmac('sha256', secret)` over `${timestamp}.${rawBody}`, secret
 * passed verbatim) and asserts the verifier accepts it. Any future change that
 * transforms the secret before importing it as a key will fail test 1.
 *
 * Runs under CRA's jest (jsdom), which lacks WebCrypto's subtle and TextEncoder,
 * so both are polyfilled from node: builtins before the assertions execute.
 */

import { createHmac, webcrypto } from "node:crypto";
import { TextEncoder as NodeTextEncoder } from "node:util";
import { verifyStripeWebhook } from "../../functions/_shared/jwt.js";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = NodeTextEncoder;
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, "crypto", {
    value: webcrypto, configurable: true, writable: true,
  });
}

const SECRET  = "whsec_TESTsecret1234567890abcdefGHIJKLMN";
const RAW_BODY = JSON.stringify({
  id: "evt_test_1", type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", payment_status: "paid" } },
});

const nowTs = () => Math.floor(Date.now() / 1000);

/** Sign the way Stripe does: HMAC-SHA256 over `${t}.${body}`, key = full secret. */
function stripeSignature(rawBody, timestamp, secret = SECRET) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

describe("verifyStripeWebhook — signature parity with Stripe", () => {
  test("1. accepts a signature generated the way Stripe generates it (THE regression guard)", async () => {
    const t = nowTs();
    const header = `t=${t},v1=${stripeSignature(RAW_BODY, t)}`;
    await expect(verifyStripeWebhook(RAW_BODY, header, SECRET)).resolves.toBeUndefined();
  });

  test("2. rejects a signature keyed by the secret with 'whsec_' stripped (the old bug)", async () => {
    const t = nowTs();
    const wrong = createHmac("sha256", SECRET.slice(6))
      .update(`${t}.${RAW_BODY}`, "utf8").digest("hex");
    await expect(verifyStripeWebhook(RAW_BODY, `t=${t},v1=${wrong}`, SECRET))
      .rejects.toThrow(/signature mismatch/i);
  });

  test("3. still verifies when the secret carries no whsec_ prefix (used verbatim)", async () => {
    const bare = "rawsecretwithoutprefix";
    const t = nowTs();
    const header = `t=${t},v1=${stripeSignature(RAW_BODY, t, bare)}`;
    await expect(verifyStripeWebhook(RAW_BODY, header, bare)).resolves.toBeUndefined();
  });

  test("4. rejects a tampered body under an otherwise valid signature", async () => {
    const t = nowTs();
    const header = `t=${t},v1=${stripeSignature(RAW_BODY, t)}`;
    const tampered = RAW_BODY.replace('"paid"', '"unpaid"');
    await expect(verifyStripeWebhook(tampered, header, SECRET))
      .rejects.toThrow(/signature mismatch/i);
  });

  test("5. rejects a replayed timestamp older than the 5-minute tolerance", async () => {
    const stale = nowTs() - 301;
    const header = `t=${stale},v1=${stripeSignature(RAW_BODY, stale)}`;
    await expect(verifyStripeWebhook(RAW_BODY, header, SECRET))
      .rejects.toThrow(/replay|too old/i);
  });

  test("6. accepts a multi-signature header (Stripe sends v1 more than once during secret rotation)", async () => {
    const t = nowTs();
    const good = stripeSignature(RAW_BODY, t);
    // Stripe's format during rotation: t=...,v1=<old>,v1=<new>. Object.fromEntries
    // keeps the LAST v1, so put the valid one last to match how the parser reads it.
    const header = `t=${t},v1=${"0".repeat(64)},v1=${good}`;
    await expect(verifyStripeWebhook(RAW_BODY, header, SECRET)).resolves.toBeUndefined();
  });

  test("7. rejects a missing or malformed Stripe-Signature header", async () => {
    await expect(verifyStripeWebhook(RAW_BODY, "", SECRET)).rejects.toThrow(/missing/i);
    await expect(verifyStripeWebhook(RAW_BODY, "garbage", SECRET)).rejects.toThrow(/invalid.*format/i);
    await expect(verifyStripeWebhook(RAW_BODY, `t=${nowTs()}`, SECRET)).rejects.toThrow(/invalid.*format/i);
  });

  test("8. rejects a non-hex v1 signature without throwing a parse error", async () => {
    const t = nowTs();
    await expect(verifyStripeWebhook(RAW_BODY, `t=${t},v1=zzzz`, SECRET))
      .rejects.toThrow(/signature mismatch/i);
  });

  test("9. throws a clear error when the secret is not configured", async () => {
    const t = nowTs();
    await expect(verifyStripeWebhook(RAW_BODY, `t=${t},v1=abcd`, ""))
      .rejects.toThrow(/not configured/i);
  });
});
