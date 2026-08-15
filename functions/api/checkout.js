/**
 * POST /api/checkout
 * Body: { packId: "starter" | "pro", email?: string }
 * Returns: { url } — Stripe Checkout redirect URL
 *
 * Audit fix H3: generates a one-time nonce, includes it in the
 * success_url, and stores (nonce, session_id, 30-min expiry) in D1.
 * The companion /api/verify-session endpoint requires the matching
 * nonce — so a leaked session_id alone cannot be used to mint a JWT.
 *
 * Required env vars: STRIPE_SECRET_KEY, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO
 * Required bindings: DB (Cloudflare D1)
 */

import { json, handleOptions, stripePost } from "../_shared/jwt.js";

const PACK_PRICE_ENV = {
  starter: "STRIPE_PRICE_STARTER",
  value:   "STRIPE_PRICE_VALUE",
  pro:     "STRIPE_PRICE_PRO",
  // The printable report, sold as a product. Not a credit pack: it grants a
  // permanent unlock and zero credits (see webhook.js's `packId === "report"`
  // branch, which must exist before this line can safely be used — a price the
  // webhook cannot honour would take money and deliver nothing).
  report:  "STRIPE_PRICE_REPORT",
};

// 30 minutes of wall-clock time to land on /api/verify-session before the
// nonce expires. Picked to cover slow card auth + 3DS + user pause-then-resume,
// while still being short enough that a leaked URL goes stale quickly.
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
  const nonce  = crypto.randomUUID();   // WebCrypto, available in Workers

  try {
    const session = await stripePost(env.STRIPE_SECRET_KEY, "/checkout/sessions", {
      "payment_method_types[]": "card",
      "line_items[0][price]":   priceId,
      "line_items[0][quantity]": "1",
      mode:                     "payment",
      customer_creation:        "always",
      // Include the nonce alongside Stripe's {CHECKOUT_SESSION_ID} placeholder.
      // Stripe substitutes the session id; our nonce passes through unchanged.
      success_url:              `${origin}/?session_id={CHECKOUT_SESSION_ID}&nonce=${nonce}`,
      cancel_url:               `${origin}/`,
      "metadata[packId]":       packId,
      ...(email ? { customer_email: email } : {}),
    });

    // Persist the (nonce, session_id) pair so verify-session can prove the
    // caller has both pieces — not just a leaked session_id.
    try {
      await env.DB.prepare(`
        INSERT INTO pending_checkouts (nonce, session_id, expires_at)
        VALUES (?, ?, unixepoch() + ?)
      `).bind(nonce, session.id, NONCE_TTL_SECONDS).run();
    } catch (e) {
      // If the pending_checkouts table doesn't exist yet (pre-migration),
      // log and continue — verify-session will fall back to allowing the
      // session_id-only path (legacy behavior). Once migration is applied
      // this branch never runs and the H3 protection is fully active.
      console.warn("[checkout] pending_checkouts insert failed (run schema.sql migration):", e.message);
    }

    return json({ url: session.url });
  } catch (e) {
    console.error("[checkout] Stripe session create failed:", e.message);
    // Surface Stripe's OWN message. "Checkout session creation failed" alone
    // cannot distinguish the cases that actually occur, and every one of them is
    // an operator misconfiguration the operator can only fix if they can see it:
    //   • the price id belongs to TEST mode while the key is LIVE (or vice
    //     versa) — Stripe says "No such price"; by far the most common
    //   • the price is recurring but this session is mode=payment
    //   • the price was archived/deactivated
    // Same reasoning as /api/admin's shape diagnostics and /api/restore's
    // distinct reasons: debugging this blind is an unbounded loop.
    //
    // Nothing secret is exposed. A Stripe price id is not a credential (it ships
    // in client-side Stripe.js integrations by design) and the secret key never
    // appears in these messages.
    return json({
      error: "Checkout session creation failed",
      stripeError: e.message || String(e),
      hint: "Most often the price id and the secret key are in different Stripe modes (test vs live).",
    }, 502);
  }
}
