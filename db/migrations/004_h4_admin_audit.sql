-- H4 migration: admin audit trail
-- Run ONLY when upgrading an existing DB (schema was applied before 2026-06-19).
-- Fresh installs: run db/schema.sql instead — it already includes this table.
--
--   wrangler d1 execute aira-credits --file=db/migrations/004_h4_admin_audit.sql --remote

CREATE TABLE IF NOT EXISTS admin_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT    NOT NULL,
  actor_ip   TEXT,
  result     TEXT    NOT NULL DEFAULT 'ok',   -- 'ok' | 'error' | 'rate_limited'
  details    TEXT,                             -- JSON: { email?, customerId?, error? }
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_ip_time ON admin_audit(actor_ip, created_at);
