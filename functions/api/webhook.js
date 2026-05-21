/**
 * POST /api/webhook
 * Stripe webhook handler — listens for checkout.session.completed.
 * Credits the D1 customer record when payment succeeds.
 *
 * Required env vars: STRIPE_WEBHOOK_SECRET, DB (D1 binding)
 *
 * Stripe Dashboard setup:
 *   Endpoint URL: https://<your-pages-domain>/api/webhook
 *   Events:       checkout.session.completed
 */

import { json, handleOptions, verifyStripeWebhook } from "../_shared/jwt.js";

// Must match CREDIT_PACKS in src/billing/credits.js
const PACK_CREDITS = {
  starter: 5_000,
  value:   10_000,
  pro:     15_000,
};

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  // Read raw body before parsing — Stripe signature covers the raw bytes
  const rawBody = await request.text();
  const sigHeader = request.headers.get("Stripe-Signature");

  console.log("[webhook-body-debug]",
    "bodyLen=", rawBody.length,
    "bodyStart=", JSON.stringify(rawBody.slice(0, 40)),
    "sigHeader=", sigHeader?.slice(0, 40));

  try {
    await verifyStripeWebhook(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("[webhook] Signature rejected:", e.message);
    return json({ error: e.message }, 400);
  }

  const event = JSON.parse(rawBody);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Only credit on confirmed payment
    if (session.payment_status !== "paid") {
      return json({ received: true, note: "payment_status not paid, skipping" });
    }

    const customerId = session.customer;
    const email      = session.customer_details?.email ?? session.customer_email ?? null;
    const packId     = session.metadata?.packId;
    const credits    = PACK_CREDITS[packId] ?? 0;

    if (!customerId) {
      console.error("[webhook] No customer ID on session:", session.id);
      return json({ received: true, note: "no customer id" });
    }

    if (credits > 0) {
      try {
        await env.DB.batch([
          // Upsert customer: create if new, add credits if existing
          env.DB.prepare(`
            INSERT INTO customers (stripe_customer_id, email, credits)
            VALUES (?, ?, ?)
            ON CONFLICT(stripe_customer_id) DO UPDATE SET
              email      = COALESCE(excluded.email, email),
              credits    = credits + excluded.credits,
              updated_at = unixepoch()
          `).bind(customerId, email, credits),
          // Audit log
          env.DB.prepare(`
            INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
            VALUES (?, 'purchase', ?, ?)
          `).bind(customerId, credits, session.id),
        ]);
        console.log(`[webhook] Credited ${credits} to ${customerId} for pack ${packId}`);
      } catch (e) {
        console.error("[webhook] D1 write failed:", e.message);
        return json({ error: "Database error" }, 500);
      }
    }
  }

  // Always return 200 to Stripe so it doesn't retry
  return json({ received: true });
}
