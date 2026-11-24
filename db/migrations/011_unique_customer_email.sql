-- One customers row per email. Fails while duplicates exist: merge them first
-- (scripts/merge-customers.mjs). See the run order in 010_customer_aliases.sql.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique
  ON customers(lower(email)) WHERE email IS NOT NULL;
