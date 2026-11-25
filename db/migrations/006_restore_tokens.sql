CREATE TABLE IF NOT EXISTS restore_tokens (
  token       TEXT    PRIMARY KEY,
  customer_id TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL,
  uses        INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER NOT NULL DEFAULT 3,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_restore_customer ON restore_tokens(customer_id);
