CREATE TABLE IF NOT EXISTS admin_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT    NOT NULL,
  actor_ip   TEXT,
  result     TEXT    NOT NULL DEFAULT 'ok',
  details    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_ip_time ON admin_audit(actor_ip, created_at);
