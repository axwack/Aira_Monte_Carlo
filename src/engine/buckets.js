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
 * this money is needed, and — when the "Bucket investing" orderingMode
 * (`three_bucket`) is active — what it should be invested in). They compose;
 * neither replaces the other. Note that orderingMode is a misnomer for this
 * one value: `three_bucket` does not change the draw ORDER at all (see
 * resolveDrawOrder in buildWithdrawalWaterfall.js), only asset location.
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

// Bucket 1 promises to be the cash cushion: spent first, reachable without
// triggering tax or an early-withdrawal penalty. Only a cash-category
// account can actually deliver that — a pretax or Roth dollar tagged
// Bucket 1 would either force ordinary income/a 10% penalty to honor the
// "spent first" promise, or (today) get quietly drawn in normal tax-
// efficient order anyway, making the tag a false promise either way. So
// Bucket 1 is a hard constraint, not a free-form tag: any non-cash account
// tagged (or split into) Bucket 1 is treated as Bucket 2 everywhere in the
// app, since 2 already means "income bridge, not the safe reserve." The
// [B1] chip in Profile -> Savings is correspondingly disabled for non-cash
// accounts (App.jsx SavingsPanel) so this can't be mis-set going forward;
// this clamp is the backstop for data already saved before that existed.
export function clampBucket(bucket, category) {
  return bucket === 1 && category !== "cash" ? 2 : bucket;
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
    return splits.map(s => ({ ...a, balance: bal * (s.pct / totalPct), bucket: clampBucket(s.bucket, a.category), _splitPct: s.pct }));
  }
  return [{ ...a, bucket: clampBucket(a.bucket ?? _defaultBucket(a.category), a.category) }];
}

export function expandAccountBuckets(accounts) {
  return (accounts || []).flatMap(accountBucketPieces);
}
