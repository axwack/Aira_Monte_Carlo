CREATE TABLE IF NOT EXISTS customer_aliases (
  alias_id    TEXT    PRIMARY KEY,
  customer_id TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_alias_customer ON customer_aliases(customer_id);
