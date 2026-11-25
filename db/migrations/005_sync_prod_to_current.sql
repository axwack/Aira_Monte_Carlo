ALTER TABLE customers ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

CREATE TABLE credit_transactions_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  type                TEXT    NOT NULL CHECK(type IN ('purchase', 'deduct', 'free_grant', 'overdraft', 'refund', 'dispute_lock', 'dispute_release')),
  amount              INTEGER NOT NULL,
  raw_tokens          INTEGER,
  stripe_session_id   TEXT,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO credit_transactions_new (id, customer_id, type, amount, raw_tokens, stripe_session_id, created_at)
  SELECT id, customer_id, type, amount, raw_tokens, stripe_session_id, created_at
  FROM credit_transactions;

DROP TABLE credit_transactions;
ALTER TABLE credit_transactions_new RENAME TO credit_transactions;

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
