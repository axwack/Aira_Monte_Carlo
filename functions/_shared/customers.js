/**
 * _shared/customers.js — one customers row per email.
 *
 * Checkout uses customer_creation:"always", so Stripe mints a NEW cus_… id on
 * every purchase. The `customers` table is keyed by that id, so a repeat buyer
 * would get a second row (and a second, separate balance). Instead the first
 * row for an email is canonical and later Stripe ids are recorded as aliases
 * (customer_aliases, migration 010). Every path that turns a Stripe customer id
 * into a row must go through here.
 */

/**
 * @param db        D1 binding
 * @param stripeId  the cus_… id Stripe sent
 * @param email     buyer email if known (checkout sessions have it; charges don't)
 * @returns the stripe_customer_id of the canonical row (stripeId itself if none exists yet)
 */
export async function canonicalCustomerId(db, stripeId, email = null) {
  if (!stripeId) return stripeId;

  const alias = await db.prepare(
    "SELECT customer_id FROM customer_aliases WHERE alias_id = ?"
  ).bind(stripeId).first();
  if (alias?.customer_id) return alias.customer_id;

  const own = await db.prepare(
    "SELECT stripe_customer_id FROM customers WHERE stripe_customer_id = ?"
  ).bind(stripeId).first();
  if (own) return stripeId;

  const norm = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!norm) return stripeId;

  // Oldest row wins so the answer never changes once a second row exists.
  const match = await db.prepare(
    "SELECT stripe_customer_id FROM customers WHERE lower(email) = ? ORDER BY created_at ASC, stripe_customer_id ASC LIMIT 1"
  ).bind(norm).first();
  if (!match) return stripeId;

  await db.prepare(
    "INSERT OR IGNORE INTO customer_aliases (alias_id, customer_id) VALUES (?, ?)"
  ).bind(stripeId, match.stripe_customer_id).run();
  return match.stripe_customer_id;
}
