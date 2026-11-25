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

  const match = await db.prepare(
    "SELECT stripe_customer_id FROM customers WHERE lower(email) = ? ORDER BY created_at ASC, stripe_customer_id ASC LIMIT 1"
  ).bind(norm).first();
  if (!match) return stripeId;

  await db.prepare(
    "INSERT OR IGNORE INTO customer_aliases (alias_id, customer_id) VALUES (?, ?)"
  ).bind(stripeId, match.stripe_customer_id).run();
  return match.stripe_customer_id;
}
