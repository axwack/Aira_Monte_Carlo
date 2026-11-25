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

  try {
    const consume = await env.DB.prepare(`
      UPDATE restore_tokens
      SET uses = uses + 1, last_used_at = unixepoch()
      WHERE token = ?
        AND expires_at > unixepoch()
        AND uses < max_uses
    `).bind(token).run();

    if (consume.meta?.changes !== 1) {
      let why = "unknown";
      try {
        const row = await env.DB.prepare(
          "SELECT uses, max_uses, expires_at, unixepoch() AS now FROM restore_tokens WHERE token = ?"
        ).bind(token).first();
        if (!row) why = "not_found";
        else if (row.expires_at <= row.now) why = "expired";
        else if (row.uses >= row.max_uses) why = "used_up";
      } catch { why = "lookup_failed"; }
      console.error(JSON.stringify({ tag: "[restore]", ok: false, reason: why }));
      const msg = why === "not_found"
        ? "That restore link isn't recognised. Please check you copied the whole link, or contact support."
        : why === "used_up"
          ? "This restore link has already been used on the maximum number of devices. Contact support for a new one."
          : "This restore link has expired. Contact support for a new one.";
      return json({ error: msg }, 401);
    }
  } catch (e) {
    console.error("[restore] token consume failed:", e.message);
    return json({ error: "Restore unavailable. Please contact support." }, 503);
  }

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
