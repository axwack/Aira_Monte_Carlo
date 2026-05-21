/**
 * GET /api/balance
 * Header: Authorization: Bearer <jwt>
 * Returns: { credits, customerId }
 *
 * Called by the client to refresh the displayed credit balance.
 * Required env vars: JWT_SECRET, DB
 */

import { json, handleOptions, verifyJWT } from "../_shared/jwt.js";

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

  return json({
    credits,
    customerId: payload.customerId,
  });
}
