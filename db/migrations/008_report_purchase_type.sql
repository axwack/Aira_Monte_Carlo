-- 008: add the 'report_purchase' transaction type.
--
--   Local:  wrangler d1 execute aira-credits --file=db/migrations/008_report_purchase_type.sql --local
--   Remote: wrangler d1 execute aira-credits --file=db/migrations/008_report_purchase_type.sql --remote
--
-- MUST BE APPLIED BEFORE the code that writes this type is deployed. The order
-- is not stylistic. `type` carries a CHECK constraint, so an INSERT of an
-- unlisted value throws — and the only place that INSERT happens is the Stripe
-- webhook, which runs AFTER the card has been charged. Deploying the code first
-- would mean: customer pays, D1 rejects the row, the handler 500s, Stripe retries
-- and fails identically forever, and the customer has no report and no refund.
-- Applying this first is harmless in the other direction: the constraint simply
-- permits a value nothing writes yet.
--
-- Why a distinct type rather than reusing 'purchase':
--   'purchase' means credits were added, and the balance-affecting paths key off
--   it. A report sale grants ZERO credits and a permanent entitlement instead, so
--   filing it as 'purchase' would either inflate a balance or force every reader
--   of that type to special-case an amount of 0. It also keeps the question 007
--   was written to answer — "do people buy this for the AI or for the report?" —
--   answerable directly.
--
-- Note report_purchase rows carry amount 0 by design: the entitlement is the row's
-- existence, not a balance. /api/report-unlock checks for the row's TYPE, never a
-- credit total, so a buyer holding zero credits still opens what they paid for.
--
-- SQLite cannot ALTER a CHECK constraint, so the table is rebuilt — same pattern
-- as 007. Row ids are copied explicitly: analyze.js keys AI-2 refunds to the
-- deduction row's id, so renumbering would silently break refund matching.

CREATE TABLE credit_transactions_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  type                TEXT    NOT NULL CHECK(type IN ('purchase', 'deduct', 'free_grant', 'overdraft', 'refund', 'dispute_lock', 'dispute_release', 'report_unlock', 'report_purchase')),
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
