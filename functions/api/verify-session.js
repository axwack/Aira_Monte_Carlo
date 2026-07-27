/**
 * POST /api/verify-session
 * Body: { sessionId: string, nonce: string }
 *   sessionId — Stripe Checkout session id from ?session_id=
 *   nonce     — one-time token from ?nonce=, issued by /api/checkout
 * Returns: { token, credits, customerId }
 *
 * Called once when Stripe redirects back to /?session_id=xxx&nonce=yyy.
 * Verifies payment was successful, atomically consumes the nonce, then
 * issues a signed JWT the client stores for subsequent authenticated calls.
 *
 * Audit fix H3: requires BOTH session_id AND a matching unconsumed nonce.
 * A leaked session_id alone (browser history / referrer / screenshot) is
 * no longer enough to mint a JWT — the nonce must be present, valid,
 * unconsumed, and unexpired. The atomic UPDATE … WHERE consumed_at IS NULL
 * is single-use enforcement: even if two requests race with the same
 * URL, only one can succeed.
 *
 * Required env vars: STRIPE_SECRET_KEY, JWT_SECRET, DB
 */

import { json, handleOptions, mintCustomerJWT, stripeGet } from "../_shared/jwt.js";


export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  // ── Instrumentation (2026-07-27 credits incident) ────────────────────────────
  // 3 of the last 4 checkout nonces were never consumed: customers paid, the
  // webhook credited D1 correctly, and their browser walked away with no JWT.
  // We could not see WHICH branch failed, so the cause got guessed at — twice,
  // wrongly. Every exit now logs one JSON line with a distinct `reason`.
  // Grep production logs for "[verify-session]".
  //
  // Logged deliberately: the request origin (a success_url built for a different
  // host than the customer lands on strands localStorage on the wrong origin) and
  // elapsed ms. NOT logged: the nonce or the minted JWT — both are live
  // credentials. The session id is already in the customer's own URL, so logging
  // it adds no exposure and is exactly what support needs to identify a purchase.
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
      // Friendly error message — most likely cause is a stale bookmark or
      // a manually-shared link. New checkouts always include both params.
      return fail("missing_nonce", 400, { error: "Missing one-time nonce. Please complete a fresh checkout." }, { sessionId });
    }

    if (!env.STRIPE_SECRET_KEY) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);
    if (!env.JWT_SECRET)        return json({ error: "JWT_SECRET not configured" }, 500);
    if (!env.DB)                return fail("no_db_binding", 500, { error: "D1 database not bound" });

    // ── Atomic nonce consume ────────────────────────────────────────────
    // Single-statement UPDATE that:
    //   - Matches (nonce, session_id) pair issued by /api/checkout
    //   - Rejects if already consumed (consumed_at IS NOT NULL)
    //   - Rejects if expired (expires_at <= now)
    //   - Marks consumed in the same statement so a race only succeeds once
    // meta.changes === 1 ⇒ we won the race and may proceed.
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
        // THE branch we are chasing. The atomic consume matched no row, but
        // "unknown nonce", "already consumed" and "expired" are three completely
        // different bugs and this one message hid which — it is what made the
        // customer-facing "link has expired" misleading too. One extra read tells
        // us outright; it only runs on the failure path, so it costs nothing
        // normally.
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
      // If the pending_checkouts table is missing (pre-migration), log and
      // refuse — better to fail closed than silently bypass H3 protection.
      console.error("[verify-session] nonce consume failed:", e.message);
      return json({ error: "Verification unavailable. Please contact support with your session id." }, 503);
    }

    // ── Stripe payment confirmation (defense in depth) ──────────────────
    // Even after the nonce check, we re-verify the session shows "paid"
    // so a compromised checkout endpoint cannot mint nonces for unpaid
    // sessions.
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

    const customerId = session.customer;
    if (!customerId) {
      return fail("no_stripe_customer", 400, { error: "No Stripe customer on session" }, { sessionId });
    }

    // Look up current balance (webhook may have already credited by now)
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

    // Success is logged too. Without it you cannot distinguish "no failures" from
    // "nobody reached this endpoint at all" — precisely the ambiguity that let this
    // incident sit unnoticed while four customers were affected.
    console.log(JSON.stringify({
      tag: "[verify-session]", ok: true, reason: "minted",
      origin: _origin, ms: Date.now() - _t0, sessionId, customerId, credits,
    }));
    return json({ token, credits, customerId });

  } catch (e) {
    console.error("[verify-session] unhandled exception:", e.message, e.stack);
    return json({ error: "Internal error" }, 500);
  }
}
