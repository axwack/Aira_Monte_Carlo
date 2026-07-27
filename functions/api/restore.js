/**
 * POST /api/restore
 * Body: { token: string }   — the opaque value from a ?restore=… link
 * Returns: { token: <jwt>, credits, customerId }
 *
 * Exchanges an admin-issued restore token for a signed JWT, so a customer who
 * lost access to credits they already paid for can get back in by clicking a
 * link — no login, no support call, no pasting tokens into devtools.
 *
 * Mirrors /api/verify-session's security model:
 *   - The consume is a single atomic UPDATE whose WHERE clause enforces
 *     existence, expiry, and the use cap together, so concurrent clicks can
 *     never exceed max_uses.
 *   - Fails closed if the restore_tokens table is missing (pre-migration),
 *     rather than silently handing out JWTs.
 *
 * Unlike verify-session this is use-capped rather than strictly single-use —
 * see the rationale in db/migrations/006_restore_tokens.sql.
 *
 * Required env vars: JWT_SECRET, DB
 */

import { json, handleOptions, mintCustomerJWT } from "../_shared/jwt.js";


export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { token } = body;
  if (!token || typeof token !== "string") {
    return json({ error: "Missing or invalid restore token" }, 400);
  }

  if (!env.JWT_SECRET) return json({ error: "JWT_SECRET not configured" }, 500);
  if (!env.DB)         return json({ error: "D1 database not bound" }, 500);

  // ── Atomic consume ──────────────────────────────────────────────────────
  // One statement enforces: token exists, not expired, uses remaining. The
  // increment happens in the same statement, so two simultaneous clicks can't
  // both read uses=2 and both succeed. changes === 1 ⇒ we may proceed.
  try {
    const consume = await env.DB.prepare(`
      UPDATE restore_tokens
      SET uses = uses + 1, last_used_at = unixepoch()
      WHERE token = ?
        AND expires_at > unixepoch()
        AND uses < max_uses
    `).bind(token).run();

    if (consume.meta?.changes !== 1) {
      return json({
        error: "This restore link has expired or has already been used too many times. Please contact support.",
      }, 401);
    }
  } catch (e) {
    console.error("[restore] token consume failed:", e.message);
    return json({ error: "Restore unavailable. Please contact support." }, 503);
  }

  // Resolve the customer the token was issued for.
  let row;
  try {
    row = await env.DB.prepare(
      "SELECT customer_id FROM restore_tokens WHERE token = ?"
    ).bind(token).first();
  } catch (e) {
    console.error("[restore] token lookup failed:", e.message);
    return json({ error: "Database error" }, 500);
  }
  if (!row?.customer_id) return json({ error: "Restore token has no customer" }, 401);

  const customerId = row.customer_id;

  // Suspended accounts must not be restorable — same rule as /api/analyze.
  let customer;
  try {
    customer = await env.DB.prepare(
      "SELECT credits, status FROM customers WHERE stripe_customer_id = ?"
    ).bind(customerId).first();
  } catch (e) {
    console.error("[restore] customer lookup failed:", e.message);
    return json({ error: "Database error" }, 500);
  }

  if (customer?.status === "disputed") {
    return json({ error: "Account suspended. Please contact support." }, 403);
  }

  const jwt = await mintCustomerJWT(customerId, env.JWT_SECRET);

  console.log(`[restore] issued JWT for ${customerId}`);
  return json({ token: jwt, credits: customer?.credits ?? 0, customerId });
}
