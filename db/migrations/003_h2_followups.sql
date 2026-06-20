-- H2 follow-up migration: close the gaps the billing audit found in 002.
-- Run AFTER 002 on an existing DB (fresh installs get all of this from schema.sql).
--
--   wrangler d1 execute aira-credits --file=db/migrations/003_h2_followups.sql --remote
--
-- Why this exists:
--  1. webhook_events (the canonical Stripe event.id idempotency table) was only
--     ever in schema.sql, never in a migration. A DB upgraded purely via
--     migrations would lack it, and the webhook handler's dedup soft-fails (logs
--     and continues) when it's absent — so a Stripe retry of charge.refunded
--     could deduct credits twice. Create it here (idempotent).
--  2. The dispute lock was terminal; the new charge.dispute.closed handler
--     reactivates accounts whose dispute is WON and writes a 'dispute_release'
--     audit row. Expand the credit_transactions.type CHECK to allow it.

-- 1. Idempotency table (idempotent create — safe whether or not it already exists).
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT    PRIMARY KEY,
  event_type   TEXT,
  received_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2. Expand credit_transactions.type CHECK to add 'dispute_release'.
--    SQLite can't ALTER a CHECK, so recreate the table (same pattern as 002).
PRAGMA foreign_keys = OFF;

CREATE TABLE credit_transactions_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  type                TEXT    NOT NULL CHECK(type IN ('purchase', 'deduct', 'free_grant', 'overdraft', 'refund', 'dispute_lock', 'dispute_release')),
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
