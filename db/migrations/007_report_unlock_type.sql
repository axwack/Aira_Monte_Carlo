-- 007: explicit 'report_unlock' transaction type.
--
--   wrangler d1 execute aira-credits --file=db/migrations/007_report_unlock_type.sql --remote
--
-- Why: report unlocks and AI calls both wrote type='deduct'. The only way to
-- tell them apart was `raw_tokens IS NULL`, which is far too implicit to report
-- on — and answering "do people buy this for the AI or for the report?" is the
-- decision that determines whether the report deserves its own Stripe SKU.
-- As of 2026-07-26 there were ZERO deduct rows of either kind, so this lands
-- before the data that will answer it exists.
--
-- Second, larger reason: making the row type explicit lets /api/report-unlock
-- derive the active 24h window from the ledger itself
-- (latest report_unlock created_at + 24h) instead of trusting a localStorage
-- flag. That turns the unlock window server-authoritative, which fixes a bug in
-- both directions: a customer who cleared localStorage was charged 250 credits
-- a second time, and anyone who hand-set the flag got in free.
--
-- SQLite cannot ALTER a CHECK constraint, so the table is rebuilt. Row ids are
-- copied explicitly — analyze.js keys AI-2 refunds to the deduction row's id.

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
