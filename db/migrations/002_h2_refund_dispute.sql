-- H2 migration: refund / dispute handling
-- Run ONLY when upgrading an existing DB (schema was applied before 2026-06-15).
-- Fresh installs: run db/schema.sql instead — it already includes these columns.
--
--   wrangler d1 execute aira-credits --file=db/migrations/002_h2_refund_dispute.sql --remote

-- 1. Add status column to customers (default 'active' for all existing rows).
ALTER TABLE customers ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- 2. Expand credit_transactions.type CHECK to include 'refund' and 'dispute_lock'.
--    SQLite cannot ALTER an existing CHECK constraint, so we recreate the table.
PRAGMA foreign_keys = OFF;

CREATE TABLE credit_transactions_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  type                TEXT    NOT NULL CHECK(type IN ('purchase', 'deduct', 'free_grant', 'overdraft', 'refund', 'dispute_lock')),
  amount              INTEGER NOT NULL,
  raw_tokens          INTEGER,
  stripe_session_id   TEXT,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO credit_transactions_new
  SELECT id, customer_id, type, amount, raw_tokens, stripe_session_id, created_at
  FROM credit_transactions;

DROP TABLE credit_transactions;
ALTER TABLE credit_transactions_new RENAME TO credit_transactions;

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_txn_customer ON credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_txn_type     ON credit_transactions(type, created_at);
