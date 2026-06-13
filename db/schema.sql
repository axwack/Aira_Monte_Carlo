-- Cloudflare D1 schema for AiRA credit billing
-- Run: wrangler d1 execute aira-credits --file=db/schema.sql --remote

CREATE TABLE IF NOT EXISTS customers (
  stripe_customer_id  TEXT    PRIMARY KEY,
  email               TEXT,
  credits             INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Audit log of every credit change (purchases + deductions)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  type                TEXT    NOT NULL CHECK(type IN ('purchase', 'deduct', 'free_grant', 'overdraft')),
  amount              INTEGER NOT NULL,   -- positive = added, negative = deducted
  raw_tokens          INTEGER,            -- for 'deduct' rows: actual Gemini token count
  stripe_session_id   TEXT,              -- for 'purchase' rows: Stripe session id
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_txn_customer ON credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_txn_type     ON credit_transactions(type, created_at);

-- Stripe webhook event dedup (Stripe retries with the same event.id on transient failure).
-- INSERT OR IGNORE into this table is the canonical idempotency check.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT    PRIMARY KEY,
  event_type   TEXT,
  received_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
