import {
  json, handleOptions, verifyJWT, mintCustomerJWT, shouldRefreshJWT,
} from "../_shared/jwt.js";
import { canonicalCustomerId } from "../_shared/customers.js";

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
  let customerId = payload.customerId;
  try {
    customerId = await canonicalCustomerId(env.DB, payload.customerId);
    const customer = await env.DB.prepare(
      "SELECT credits FROM customers WHERE stripe_customer_id = ?"
    ).bind(customerId).first();
    credits = customer?.credits ?? 0;
  } catch (e) {
    console.error("[balance] D1 query failed:", e.message);
    return json({ error: "Database error: " + e.message }, 500);
  }

  let token;
  try {
    if (customerId !== payload.customerId || shouldRefreshJWT(payload)) {
      token = await mintCustomerJWT(customerId, env.JWT_SECRET);
      console.log(`[balance] refreshed session for ${customerId}`);
    }
  } catch (e) {
    console.error("[balance] token refresh failed (non-fatal):", e.message);
  }

  return json({
    credits,
    customerId,
    ...(token ? { token } : {}),
  });
}
