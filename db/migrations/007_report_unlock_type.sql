CREATE TABLE credit_transactions_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  type                TEXT    NOT NULL CHECK(type IN ('purchase', 'deduct', 'free_grant', 'overdraft', 'refund', 'dispute_lock', 'dispute_release', 'report_unlock')),
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
