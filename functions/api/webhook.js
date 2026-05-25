/**
 * POST /api/webhook
 * Stripe webhook handler — listens for checkout.session.completed.
 *
 * Verification strategy: HMAC-SHA256 signature check against the raw request body
 * (Stripe-Signature header). This is fully synchronous — no outbound API call needed,
 * which eliminates the timeout / "other error" class of failures.
 *
 * Required env vars: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY, DB
 */

import { json, handleOptions, verifyStripeWebhook } from "../_shared/jwt.js";

const PACK_CREDITS = {
  starter: 5_000,
  value:   10_000,
  pro:     15_000,
};

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  // ── 1. Read raw body FIRST (required for signature verification) ─────────────
  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Could not read request body" }, 400);
  }

  // ── 2. Verify Stripe signature ───────────────────────────────────────────────
  const sigHeader = request.headers.get("stripe-signature");
  try {
    await verifyStripeWebhook(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("[webhook] Signature verification failed:", e.message);
    return json({ error: "Webhook signature invalid" }, 400);
  }

  // ── 3. Parse event ───────────────────────────────────────────────────────────
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Only process completed checkout sessions; acknowledge everything else
  if (event.type !== "checkout.session.completed") {
    return json({ received: true });
  }

  const sessionId = event.data?.object?.id;
  if (!sessionId) return json({ error: "No session ID in event" }, 400);

  if (!env.DB) return json({ error: "D1 not bound" }, 500);

  const session      = event.data.object;
  const customerId   = session.customer;
  const email        = session.customer_details?.email ?? session.customer_email ?? null;
  const packId       = session.metadata?.packId;
  const credits      = PACK_CREDITS[packId] ?? 0;
  const paymentStatus = session.payment_status;

  if (paymentStatus !== "paid") {
    return json({ received: true, note: "payment_status not paid" });
  }

  if (!customerId) {
    console.error("[webhook] No customer on session:", sessionId);
    return json({ received: true, note: "no customer" });
  }
  if (credits === 0) {
    console.error("[webhook] Unknown packId:", packId);
    return json({ received: true, note: "unknown pack" });
  }

  // ── 4. Idempotency: skip if session already credited ────────────────────────
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
    // Non-fatal — continue; worst case we double-credit (guarded by UNIQUE constraint)
  }

  // ── 5. Write credits to D1 ──────────────────────────────────────────────────
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO customers (stripe_customer_id, email, credits)
        VALUES (?, ?, ?)
        ON CONFLICT(stripe_customer_id) DO UPDATE SET
          email      = COALESCE(excluded.email, email),
          credits    = credits + excluded.credits,
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
