import { json, handleOptions, stripePost } from "../_shared/jwt.js";

const PACK_PRICE_ENV = {
  starter: "STRIPE_PRICE_STARTER",
  value:   "STRIPE_PRICE_VALUE",
  pro:     "STRIPE_PRICE_PRO",
  report:  "STRIPE_PRICE_REPORT",
};

const NONCE_TTL_SECONDS = 30 * 60;

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
  if (!env.DB)                return json({ error: "D1 not bound" }, 500);

  const origin = new URL(request.url).origin;
  const nonce  = crypto.randomUUID();

  try {
    const session = await stripePost(env.STRIPE_SECRET_KEY, "/checkout/sessions", {
      "payment_method_types[]": "card",
      "line_items[0][price]":   priceId,
      "line_items[0][quantity]": "1",
      mode:                     "payment",
      customer_creation:        "always",
      success_url:              `${origin}/?session_id={CHECKOUT_SESSION_ID}&nonce=${nonce}`,
      cancel_url:               `${origin}/`,
      "metadata[packId]":       packId,
      ...(email ? { customer_email: email } : {}),
    });

    try {
      await env.DB.prepare(`
        INSERT INTO pending_checkouts (nonce, session_id, expires_at)
        VALUES (?, ?, unixepoch() + ?)
      `).bind(nonce, session.id, NONCE_TTL_SECONDS).run();
    } catch (e) {
      console.warn("[checkout] pending_checkouts insert failed (run schema.sql migration):", e.message);
    }

    return json({ url: session.url });
  } catch (e) {
    console.error("[checkout] Stripe session create failed:", e.message);
    return json({
      error: "Checkout session creation failed",
      stripeError: e.message || String(e),
      hint: "Most often the price id and the secret key are in different Stripe modes (test vs live).",
    }, 502);
  }
}
