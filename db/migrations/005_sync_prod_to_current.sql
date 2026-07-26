-- 005: bring a production DB created from the ORIGINAL schema.sql (pre-2026-06-15)
-- up to the current schema in a single pass. Supersedes 002 + 003 + 004 for that
-- case — do NOT run this in addition to them.
--
--   wrangler d1 execute aira-credits --file=db/migrations/005_sync_prod_to_current.sql --remote
--
-- Why this exists: the live `aira-credits` DB was still on the 2026-05-22 schema
-- (no customers.status, old 3-value type CHECK, and missing pending_checkouts /
-- webhook_events / admin_audit). That made /api/verify-session fail closed with a
-- 503 on every purchase (no JWT ever issued) and /api/analyze return 500 on the
-- `SELECT credits, status` pre-check. Both are on the paid path.
--
-- The PRAGMA foreign_keys toggles from 002/003 are intentionally omitted: nothing
-- references credit_transactions, so rebuilding it breaks no FK.

-- 1. customers.status — the disputed-account lock column (002).
ALTER TABLE customers ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- 2. Expand credit_transactions.type CHECK to the full current set (002 + 003).
--    SQLite cannot ALTER a CHECK constraint, so rebuild the table. Row ids are
--    copied explicitly so audit references (analyze.js keys AI-2 refunds to the
--    deduction's row id) survive.
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

-- 3. Stripe event idempotency (003).
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT    PRIMARY KEY,
  event_type   TEXT,
  received_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 4. One-time purchase nonces (H3) — the table whose absence broke verify-session.
CREATE TABLE IF NOT EXISTS pending_checkouts (
  nonce       TEXT    PRIMARY KEY,
  session_id  TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_checkouts(session_id);

-- 5. Admin audit trail + rate limiting (004).
CREATE TABLE IF NOT EXISTS admin_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT    NOT NULL,
  actor_ip   TEXT,
  result     TEXT    NOT NULL DEFAULT 'ok',
  details    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_ip_time ON admin_audit(actor_ip, created_at);
