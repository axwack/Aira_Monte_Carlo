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

/* ───────────────────────────────────────────────────────────────────────────
 * Bucket ACCOUNTING — how many dollars are in each bucket right now.
 *
 * These three moved here from engine/bucketStrategy.js when the `three_bucket`
 * orderingMode was removed (v1.2.129). They are pure accounting over balances
 * the simulation already tracks; nothing here changes what anything earns or
 * the order accounts are drawn in. Their consumers are the 🧺 Buckets tab and
 * the Withdrawal Plan's "B1 End" column.
 *
 * Buckets are a DERIVED VIEW, not tracked state: money physically lives in
 * cash/taxable/pretax/roth balances, and a bucket total is that balance times
 * the share of the category tagged to that bucket. Anything that wants to MOVE
 * money between buckets needs real per-bucket balances first.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * For each account CATEGORY (cash/taxable/pretax/roth/hsa), what fraction of
 * that category's total dollars sits in Bucket 1 / 2 / 3.
 * @returns {{ [category]: { 1: number, 2: number, 3: number } }} fractions
 *   summing to 1 per category (a category with $0 falls back to 100% in its
 *   own default bucket, so lookups never divide by zero / produce NaN).
 */
export function bucketFractionsByCategory(accounts) {
  const pieces = expandAccountBuckets(accounts);
  const totals = {};
  for (const piece of pieces) {
    const cat = piece.category;
    if (!totals[cat]) totals[cat] = { 1: 0, 2: 0, 3: 0, total: 0 };
    const b = [1, 2, 3].includes(piece.bucket) ? piece.bucket : _defaultBucket(cat);
    const bal = piece.balance || 0;
    totals[cat][b] += bal;
    totals[cat].total += bal;
  }
  const fracs = {};
  for (const cat of Object.keys(totals)) {
    const t = totals[cat];
    if (t.total > 0) {
      fracs[cat] = { 1: t[1] / t.total, 2: t[2] / t.total, 3: t[3] / t.total };
    } else {
      const b = _defaultBucket(cat);
      fracs[cat] = { 1: b === 1 ? 1 : 0, 2: b === 2 ? 1 : 0, 3: b === 3 ? 1 : 0 };
    }
  }
  return fracs;
}

/** A category with no accounts at all (not present in bucketFractionsByCategory's
 * output) resolves here so callers don't need their own fallback branch. */
export function fractionsForCategory(fracsByCategory, category) {
  if (fracsByCategory && fracsByCategory[category]) return fracsByCategory[category];
  const b = _defaultBucket(category);
  return { 1: b === 1 ? 1 : 0, 2: b === 2 ? 1 : 0, 3: b === 3 ? 1 : 0 };
}

/**
 * Total dollars currently sitting in each bucket, summed across every account
 * CATEGORY, using that category's bucket fractions.
 * @param {{cash?:number,taxable?:number,pretax?:number,roth?:number}} catBalances
 * @param {object} fracsByCategory — from bucketFractionsByCategory.
 */
export function bucketDollarTotals(catBalances, fracsByCategory) {
  const totals = { 1: 0, 2: 0, 3: 0 };
  for (const cat of Object.keys(catBalances)) {
    const bal = catBalances[cat] || 0;
    const f = fractionsForCategory(fracsByCategory, cat);
    totals[1] += bal * (f[1] || 0);
    totals[2] += bal * (f[2] || 0);
    totals[3] += bal * (f[3] || 0);
  }
  return totals;
}
