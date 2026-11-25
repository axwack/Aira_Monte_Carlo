SELECT day, name, n FROM events WHERE day >= date('now','-14 days') ORDER BY day DESC, name;

SELECT date(created_at,'unixepoch') AS day, type, COUNT(*) AS txns, SUM(amount) AS credits
FROM credit_transactions
WHERE type IN ('purchase','report_purchase','report_unlock','deduct')
  AND created_at >= unixepoch('now','-14 days')
GROUP BY day, type ORDER BY day DESC, type;

SELECT date(created_at,'unixepoch') AS day, COUNT(*) AS started, COUNT(consumed_at) AS completed
FROM pending_checkouts WHERE created_at >= unixepoch('now','-14 days')
GROUP BY day ORDER BY day DESC;
