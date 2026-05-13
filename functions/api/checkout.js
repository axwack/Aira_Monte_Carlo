/**
 * POST /api/checkout
 * Body: { packId: "starter" | "pro", email?: string }
 * Returns: { url } — Stripe Checkout redirect URL
 *
 * Required env vars: STRIPE_SECRET_KEY, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO
 */

import { json, handleOptions, stripePost } from "../_shared/jwt.js";

const PACK_PRICE_ENV = {
  starter: "STRIPE_PRICE_STARTER",
  value:   "STRIPE_PRICE_VALUE",
  pro:     "STRIPE_PRICE_PRO",
};

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { packId, email } = body;
  const priceEnvKey = PACK_PRICE_ENV[packId];
  if (!priceEnvKey) return json({ error: `Unknown pack: ${packId}` }, 400);

  const priceId = env[priceEnvKey];
  if (!priceId) return json({ error: "Stripe price not configured — check environment variables" }, 500);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "Stripe not configured" }, 500);

  const origin = new URL(request.url).origin;

  try {
    const session = await stripePost(env.STRIPE_SECRET_KEY, "/checkout/sessions", {
      "payment_method_types[]":   "card",
      "line_items[0][price]":     priceId,
      "line_items[0][quantity]":  "1",
      mode:                       "payment",
      success_url:                `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:                 `${origin}/`,
      "metadata[packId]":         packId,
      ...(email ? { customer_email: email } : {}),
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
