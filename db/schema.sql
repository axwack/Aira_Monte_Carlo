CREATE TABLE IF NOT EXISTS customers (
  stripe_customer_id  TEXT    PRIMARY KEY,
  email               TEXT,
  credits             INTEGER NOT NULL DEFAULT 0,
  status              TEXT    NOT NULL DEFAULT 'active',
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         TEXT    NOT NULL REFERENCES customers(stripe_customer_id),

  type                TEXT    NOT NULL CHECK(type IN ('purchase', 'deduct', 'free_grant', 'overdraft', 'refund', 'dispute_lock', 'dispute_release', 'report_unlock', 'report_purchase')),
  amount              INTEGER NOT NULL,
  raw_tokens          INTEGER,
  stripe_session_id   TEXT,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_txn_customer ON credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_txn_type     ON credit_transactions(type, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT    PRIMARY KEY,
  event_type   TEXT,
  received_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS pending_checkouts (
  nonce       TEXT    PRIMARY KEY,
  session_id  TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_checkouts(session_id);

CREATE TABLE IF NOT EXISTS admin_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT    NOT NULL,
  actor_ip   TEXT,
  result     TEXT    NOT NULL DEFAULT 'ok',
  details    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_ip_time ON admin_audit(actor_ip, created_at);

CREATE TABLE IF NOT EXISTS restore_tokens (
  token        TEXT    PRIMARY KEY,
  customer_id  TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  note         TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at   INTEGER NOT NULL,
  uses         INTEGER NOT NULL DEFAULT 0,
  max_uses     INTEGER NOT NULL DEFAULT 3,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_restore_customer ON restore_tokens(customer_id);

CREATE TABLE IF NOT EXISTS events (
  day   TEXT    NOT NULL,
  name  TEXT    NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);

CREATE TABLE IF NOT EXISTS customer_aliases (
  alias_id    TEXT    PRIMARY KEY,
  customer_id TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_alias_customer ON customer_aliases(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique
  ON customers(lower(email)) WHERE email IS NOT NULL;
