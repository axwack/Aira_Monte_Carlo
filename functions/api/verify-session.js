/**
 * POST /api/verify-session
 * Body: { sessionId: string }  — the Stripe Checkout session ID from ?session_id=
 * Returns: { token, credits, customerId }
 *
 * Called once when Stripe redirects back to /?session_id=xxx.
 * Verifies payment was successful, then issues a signed JWT the client
 * stores for all subsequent authenticated requests.
 *
 * Required env vars: STRIPE_SECRET_KEY, JWT_SECRET, DB
 */

import { json, handleOptions, signJWT, stripeGet } from "../_shared/jwt.js";

const JWT_TTL_SECONDS = 30 * 24 * 3600; // 30 days

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { sessionId } = body;
  if (!sessionId || typeof sessionId !== "string") {
    return json({ error: "Missing or invalid sessionId" }, 400);
  }

  // Retrieve the Stripe checkout session to confirm payment
  let session;
  try {
    session = await stripeGet(env.STRIPE_SECRET_KEY, `/checkout/sessions/${sessionId}`);
  } catch (e) {
    return json({ error: `Stripe error: ${e.message}` }, 400);
  }

  if (session.payment_status !== "paid") {
    return json({ error: "Payment not completed" }, 402);
  }

  const customerId = session.customer;
  if (!customerId) {
    return json({ error: "No Stripe customer on session — contact support" }, 400);
  }

  if (!env.JWT_SECRET) return json({ error: "JWT_SECRET env var not configured" }, 500);
  if (!env.DB)         return json({ error: "D1 database not bound — check Pages bindings" }, 500);

  // Look up current balance (webhook may have already credited by now)
  let credits = 0;
  try {
    const customer = await env.DB.prepare(
      "SELECT credits FROM customers WHERE stripe_customer_id = ?"
    ).bind(customerId).first();
    credits = customer?.credits ?? 0;
  } catch (e) {
    // Table may not exist yet — still issue the JWT so client can poll later
    console.error("[verify-session] D1 query failed:", e.message);
  }

  // Issue a signed JWT containing only the Stripe customer ID
  const token = await signJWT(
    { customerId, exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS },
    env.JWT_SECRET
  );

  return json({ token, credits, customerId });
}
