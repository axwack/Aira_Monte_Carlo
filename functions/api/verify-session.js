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

import { json, handleOptions, signJWT, stripeGet } from "../_shared/jwt.js";

const JWT_TTL_SECONDS = 30 * 24 * 3600; // 30 days

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    const { sessionId, nonce } = body;
    if (!sessionId || typeof sessionId !== "string") {
      return json({ error: "Missing or invalid sessionId" }, 400);
    }
    if (!nonce || typeof nonce !== "string") {
      // Friendly error message — most likely cause is a stale bookmark or
      // a manually-shared link. New checkouts always include both params.
      return json({ error: "Missing one-time nonce. Please complete a fresh checkout." }, 400);
    }

    if (!env.STRIPE_SECRET_KEY) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);
    if (!env.JWT_SECRET)        return json({ error: "JWT_SECRET not configured" }, 500);
    if (!env.DB)                return json({ error: "D1 database not bound" }, 500);

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
        return json({ error: "Invalid, expired, or already-used checkout link." }, 401);
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
      return json({ error: "Stripe verification failed" }, 400);
    }

    if (session.payment_status !== "paid") {
      return json({ error: "Payment not completed" }, 402);
    }

    const customerId = session.customer;
    if (!customerId) {
      return json({ error: "No Stripe customer on session" }, 400);
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

    const token = await signJWT(
      { customerId, exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS },
      env.JWT_SECRET
    );

    return json({ token, credits, customerId });

  } catch (e) {
    console.error("[verify-session] unhandled exception:", e.message, e.stack);
    return json({ error: "Internal error" }, 500);
  }
}
