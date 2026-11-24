-- Aliases for repeat Stripe customer ids (see functions/_shared/customers.js).
-- Checkout mints a new cus_… per purchase; the webhook folds a repeat buyer into
-- their first customers row and records the new id here.
--
-- RUN ORDER:
--   1. wrangler d1 execute aira-credits --remote --file=db/migrations/010_customer_aliases.sql
--   2. deploy the webhook / verify-session change
--   3. node scripts/merge-customers.mjs <keep> <drop> --apply     (per duplicate pair)
--   4. wrangler d1 execute aira-credits --remote --file=db/migrations/011_unique_customer_email.sql
--
-- Find duplicates:
--   SELECT lower(email) e, group_concat(stripe_customer_id) ids, count(*) n
--   FROM customers WHERE email IS NOT NULL GROUP BY e HAVING n > 1;

CREATE TABLE IF NOT EXISTS customer_aliases (
  alias_id    TEXT    PRIMARY KEY,
  customer_id TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_alias_customer ON customer_aliases(customer_id);
