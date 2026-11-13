-- Funnel for the last 14 days. Run:
--   wrangler d1 execute aira-credits --remote --file=db/funnel.sql
-- Client intents come from `events`; completions are the existing server truth.

-- Client-side intents per day (simulations run, AI clicks, checkout/unlock clicks)
SELECT day, name, n FROM events WHERE day >= date('now','-14 days') ORDER BY day DESC, name;

-- Completed money events (server truth): packs vs report sales vs AI spend
SELECT date(created_at,'unixepoch') AS day, type, COUNT(*) AS txns, SUM(amount) AS credits
FROM credit_transactions
WHERE type IN ('purchase','report_purchase','report_unlock','deduct')
  AND created_at >= unixepoch('now','-14 days')
GROUP BY day, type ORDER BY day DESC, type;

-- Checkouts started vs completed (server truth)
SELECT date(created_at,'unixepoch') AS day, COUNT(*) AS started, COUNT(consumed_at) AS completed
FROM pending_checkouts WHERE created_at >= unixepoch('now','-14 days')
GROUP BY day ORDER BY day DESC;
