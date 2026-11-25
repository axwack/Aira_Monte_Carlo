CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique
  ON customers(lower(email)) WHERE email IS NOT NULL;
