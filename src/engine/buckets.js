/**
 * Time-horizon bucket assignment — SINGLE SOURCE OF TRUTH.
 *
 * Moved out of App.jsx so both the deterministic waterfall engine
 * (buildWithdrawalWaterfall.js) and the 3-Bucket strategy engine
 * (bucketStrategy.js) can share the exact same account→bucket partition
 * App.jsx already uses for BucketsTab and the Profile → Savings [B1]/[B2]/[B3]
 * chips, instead of each growing its own copy that can drift.
 *
 * `bucket` (1/2/3) is orthogonal to `category` (cash/taxable/pretax/roth/hsa):
 * category is the TAX axis (which account type pays this year — see
 * buildWithdrawalWaterfall.js), bucket is the TIME-HORIZON axis (how soon
 * this money is needed, and — when the "3-Bucket Strategy" orderingMode is
 * active — what it should be invested in). They compose; neither replaces
 * the other.
 */

// Default bucket assignment by account category (user can override per account
// via the [B1]/[B2]/[B3] chips in Profile → Savings).
export function _defaultBucket(category) {
  if (category === "cash")    return 1;
  if (category === "taxable") return 2;
  if (category === "pretax")  return 2;
  if (category === "hsa")     return 3;
  if (category === "roth")    return 3;
  return 2;
}

// A single account can distribute its balance across buckets (Quicken-style
// split): `account.splits` = [{ bucket, pct }] with pct summing to 100. When
// absent, the whole balance sits in the single `account.bucket`. These helpers
// expand an account into per-bucket "pieces" so every consumer can treat a
// split account as several bucket-tagged slices that still roll up to one
// balance (the rollup is just the untouched `account.balance`).
export function accountBucketPieces(a) {
  const bal = a.balance || 0;
  const splits = Array.isArray(a.splits) ? a.splits.filter(s => s && s.pct > 0) : null;
  if (splits && splits.length) {
    const totalPct = splits.reduce((s, x) => s + x.pct, 0) || 1;
    return splits.map(s => ({ ...a, balance: bal * (s.pct / totalPct), bucket: s.bucket, _splitPct: s.pct }));
  }
  return [{ ...a, bucket: a.bucket ?? _defaultBucket(a.category) }];
}

export function expandAccountBuckets(accounts) {
  return (accounts || []).flatMap(accountBucketPieces);
}
