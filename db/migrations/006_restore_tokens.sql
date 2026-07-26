-- 006: account-restore tokens.
--
--   wrangler d1 execute aira-credits --file=db/migrations/006_restore_tokens.sql --remote
--
-- Why this exists: a customer's JWT is minted exactly once, at the Stripe
-- redirect, and lives only in that browser's localStorage. Clear it, switch
-- devices, or hit a bug in verify-session (as happened on 2026-07-26, when
-- pending_checkouts was missing and verify-session 503'd on every purchase) and
-- the credits they paid for become permanently unreachable. There is no login,
-- so there was no recovery path at all.
--
-- A restore token is an opaque, expiring, use-capped bearer credential that can
-- be emailed to a known customer. /api/restore exchanges it for a JWT using the
-- same atomic-consume pattern as verify-session, so the token itself is never a
-- long-lived credential and a leaked email has a bounded blast radius.
--
-- max_uses (not single-use) is deliberate: a customer who opens the link on
-- their phone and then wants it on a laptop would otherwise be locked out and
-- have to email support again. Three uses covers real multi-device behavior
-- while still capping abuse.

CREATE TABLE IF NOT EXISTS restore_tokens (
  token       TEXT    PRIMARY KEY,
  customer_id TEXT    NOT NULL REFERENCES customers(stripe_customer_id),
  note        TEXT,                                    -- why it was issued (support audit)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL,
  uses        INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER NOT NULL DEFAULT 3,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_restore_customer ON restore_tokens(customer_id);
