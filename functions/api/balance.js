/**
 * GET /api/balance
 * Header: Authorization: Bearer <jwt>
 * Returns: { credits, customerId, token? }
 *
 * Called by the client to refresh the displayed credit balance.
 *
 * SLIDING SESSION: this endpoint is hit on essentially every app open, so it is the
 * natural place to roll the customer's session forward. When the presented token is
 * more than halfway through its life we mint a fresh one and return it as `token`;
 * the client swaps it into localStorage. Before this, a JWT was minted exactly once
 * at the Stripe redirect and never renewed, so EVERY paying customer lost access to
 * their credits once the TTL elapsed — in the same browser, having done nothing
 * wrong — and the failure was silent (401 → clearStoredJWT → AI quietly degrades).
 *
 * `token` is omitted when no refresh is due, so the client must treat it as optional.
 * Required env vars: JWT_SECRET, DB
 */

import {
  json, handleOptions, verifyJWT, mintCustomerJWT, shouldRefreshJWT,
} from "../_shared/jwt.js";

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet({ request, env }) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Authorization required" }, 401);
  }

  let payload;
  try {
    payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
  } catch (e) {
    return json({ error: "Invalid or expired token" }, 401);
  }

  if (!env.DB) return json({ error: "D1 database not bound — check Pages bindings" }, 500);

  let credits = 0;
  try {
    const customer = await env.DB.prepare(
      "SELECT credits FROM customers WHERE stripe_customer_id = ?"
    ).bind(payload.customerId).first();
    credits = customer?.credits ?? 0;
  } catch (e) {
    console.error("[balance] D1 query failed:", e.message);
    return json({ error: "Database error: " + e.message }, 500);
  }

  // Roll the session forward if it's past halfway. Deliberately AFTER the balance
  // read and wrapped in its own try/catch: a refresh failure must never turn a
  // working balance lookup into an error the customer sees. Worst case they keep
  // their current token and get another chance on the next app open.
  let token;
  try {
    if (shouldRefreshJWT(payload)) {
      token = await mintCustomerJWT(payload.customerId, env.JWT_SECRET);
      console.log(`[balance] refreshed session for ${payload.customerId}`);
    }
  } catch (e) {
    console.error("[balance] token refresh failed (non-fatal):", e.message);
  }

  return json({
    credits,
    customerId: payload.customerId,
    ...(token ? { token } : {}),
  });
}
