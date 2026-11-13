-- 009: daily aggregate counters for client-side funnel events.
--
--   Local:  wrangler d1 execute aira-credits --file=db/migrations/009_events.sql --local
--   Remote: wrangler d1 execute aira-credits --file=db/migrations/009_events.sql --remote
--
-- Aggregate only: one row per (UTC day, event name). No user id, IP, or cookie is
-- stored, so there is nothing personal to leak or disclose. Safe to apply before
-- or after the code that writes it (/api/event ignores a missing table).
CREATE TABLE IF NOT EXISTS events (
  day   TEXT    NOT NULL,            -- UTC YYYY-MM-DD
  name  TEXT    NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);
