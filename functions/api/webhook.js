/**
 * POST /api/webhook
 * Stripe webhook handler — listens for checkout.session.completed.
 *
 * Instead of signature verification (which requires exact secret sync),
 * we verify the session directly via the Stripe API before crediting.
 * Idempotency: each stripe_session_id is only credited once.
 *
 * Required env vars: STRIPE_SECRET_KEY, DB
 */

import { json, handleOptions, stripeGet } from "../_shared/jwt.js";

const PACK_CREDITS = {
  starter: 5_000,
  value:   10_000,
  pro:     15_000,
};

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  let event;
  try {
    event = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    return json({ received: true });
  }

  const sessionId = event.data?.object?.id;
  if (!sessionId) return json({ error: "No session ID in event" }, 400);

  if (!env.STRIPE_SECRET_KEY) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);
  if (!env.DB)                return json({ error: "D1 not bound" }, 500);

  // Verify payment status directly via Stripe API — cannot be faked
  let session;
  try {
    session = await stripeGet(env.STRIPE_SECRET_KEY, `/checkout/sessions/${sessionId}`);
  } catch (e) {
    console.error("[webhook] Stripe session lookup failed:", e.message);
    return json({ error: "Stripe verification failed" }, 500);
  }

  if (session.payment_status !== "paid") {
    return json({ received: true, note: "payment_status not paid" });
  }

  const customerId = session.customer;
  const email      = session.customer_details?.email ?? session.customer_email ?? null;
  const packId     = session.metadata?.packId;
  const credits    = PACK_CREDITS[packId] ?? 0;

  if (!customerId) {
    console.error("[webhook] No customer on session:", sessionId);
    return json({ received: true, note: "no customer" });
  }
  if (credits === 0) {
    console.error("[webhook] Unknown packId:", packId);
    return json({ received: true, note: "unknown pack" });
  }

  // Idempotency: skip if this session was already credited
  try {
    const existing = await env.DB.prepare(
      "SELECT id FROM credit_transactions WHERE stripe_session_id = ? AND type = 'purchase'"
    ).bind(sessionId).first();
    if (existing) {
      console.log("[webhook] Already processed:", sessionId);
      return json({ received: true });
    }
  } catch (e) {
    console.error("[webhook] Idempotency check failed:", e.message);
  }

  // Write credits to D1
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO customers (stripe_customer_id, email, credits)
        VALUES (?, ?, ?)
        ON CONFLICT(stripe_customer_id) DO UPDATE SET
          email    = COALESCE(excluded.email, email),
          credits  = credits + excluded.credits,
          updated_at = unixepoch()
      `).bind(customerId, email, credits),
      env.DB.prepare(`
        INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
        VALUES (?, 'purchase', ?, ?)
      `).bind(customerId, credits, sessionId),
    ]);
    console.log(`[webhook] Credited ${credits} to ${customerId} (pack: ${packId})`);
  } catch (e) {
    console.error("[webhook] D1 write failed:", e.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ received: true });
}
