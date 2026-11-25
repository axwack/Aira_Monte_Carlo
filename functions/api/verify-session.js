import { json, handleOptions, mintCustomerJWT, stripeGet } from "../_shared/jwt.js";
import { canonicalCustomerId } from "../_shared/customers.js";


export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  const _t0 = Date.now();
  const _origin = (() => { try { return new URL(request.url).origin; } catch { return "?"; } })();
  const fail = (reason, status, payload, extra) => {
    console.error(JSON.stringify({
      tag: "[verify-session]", ok: false, reason, status,
      origin: _origin, ms: Date.now() - _t0, ...(extra || {}),
    }));
    return json(payload, status);
  };

  try {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    const { sessionId, nonce } = body;
    if (!sessionId || typeof sessionId !== "string") {
      return fail("missing_session_id", 400, { error: "Missing or invalid sessionId" });
    }
    if (!nonce || typeof nonce !== "string") {
      return fail("missing_nonce", 400, { error: "Missing one-time nonce. Please complete a fresh checkout." }, { sessionId });
    }

    if (!env.STRIPE_SECRET_KEY) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);
    if (!env.JWT_SECRET)        return json({ error: "JWT_SECRET not configured" }, 500);
    if (!env.DB)                return fail("no_db_binding", 500, { error: "D1 database not bound" });

    try {
      const consume = await env.DB.prepare(`
        UPDATE pending_checkouts
        SET consumed_at = unixepoch()
        WHERE nonce = ?
          AND session_id = ?
          AND consumed_at IS NULL
          AND expires_at > unixepoch()
      `).bind(nonce, sessionId).run();

      if (consume.meta?.changes !== 1) {
        let why = "unknown";
        try {
          const row = await env.DB.prepare(
            "SELECT consumed_at, expires_at, unixepoch() AS now FROM pending_checkouts WHERE nonce = ?"
          ).bind(nonce).first();
          if (!row) why = "nonce_not_found";
          else if (row.consumed_at) why = "nonce_already_consumed";
          else if (row.expires_at <= row.now) why = "nonce_expired";
        } catch { why = "nonce_lookup_failed"; }
        return fail("nonce_not_consumed", 401,
                    { error: "Invalid, expired, or already-used checkout link." },
                    { sessionId, why });
      }
    } catch (e) {
      console.error("[verify-session] nonce consume failed:", e.message);
      return json({ error: "Verification unavailable. Please contact support with your session id." }, 503);
    }

    let session;
    try {
      session = await stripeGet(env.STRIPE_SECRET_KEY, `/checkout/sessions/${sessionId}`);
    } catch (e) {
      console.error("[verify-session] Stripe lookup failed:", e.message);
      return fail("stripe_lookup_failed", 400, { error: "Stripe verification failed" }, { sessionId, err: e.message });
    }

    if (session.payment_status !== "paid") {
      return fail("payment_not_paid", 402, { error: "Payment not completed" }, { sessionId });
    }

    if (!session.customer) {
      return fail("no_stripe_customer", 400, { error: "No Stripe customer on session" }, { sessionId });
    }
    const customerId = await canonicalCustomerId(
      env.DB, session.customer, session.customer_details?.email ?? session.customer_email ?? null);

    let credits = 0;
    try {
      const customer = await env.DB.prepare(
        "SELECT credits FROM customers WHERE stripe_customer_id = ?"
      ).bind(customerId).first();
      credits = customer?.credits ?? 0;
    } catch (e) {
      console.error("[verify-session] D1 query failed:", e.message);
    }

    const token = await mintCustomerJWT(customerId, env.JWT_SECRET);

    let restoreUrl = null;
    let restoreExpiresAt = null;
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const rToken = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      const ttl = 90 * 24 * 3600;
      await env.DB.prepare(`
        INSERT INTO restore_tokens (token, customer_id, note, expires_at, max_uses)
        VALUES (?, ?, ?, unixepoch() + ?, ?)
      `).bind(rToken, customerId, `self-serve @ checkout ${sessionId}`, ttl, 10).run();
      restoreUrl = `${_origin}/?restore=${rToken}`;
      restoreExpiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    } catch (e) {
      console.error("[verify-session] restore token mint failed (non-fatal):", e.message);
    }

    console.log(JSON.stringify({
      tag: "[verify-session]", ok: true, reason: "minted",
      origin: _origin, ms: Date.now() - _t0, sessionId, customerId, credits,
      restoreIssued: !!restoreUrl,
    }));
    return json({
      token, credits, customerId, restoreUrl, restoreExpiresAt,
      packId: session.metadata?.packId ?? null,
    });

  } catch (e) {
    console.error("[verify-session] unhandled exception:", e.message, e.stack);
    return json({ error: "Internal error" }, 500);
  }
}
