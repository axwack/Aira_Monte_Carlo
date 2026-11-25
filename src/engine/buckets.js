export function _defaultBucket(category) {
  if (category === "cash")    return 1;
  if (category === "taxable") return 2;
  if (category === "pretax")  return 2;
  if (category === "hsa")     return 3;
  if (category === "roth")    return 3;
  return 2;
}

export function clampBucket(bucket, category) {
  return bucket === 1 && category !== "cash" ? 2 : bucket;
}

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

export function fractionsForCategory(fracsByCategory, category) {
  if (fracsByCategory && fracsByCategory[category]) return fracsByCategory[category];
  const b = _defaultBucket(category);
  return { 1: b === 1 ? 1 : 0, 2: b === 2 ? 1 : 0, 3: b === 3 ? 1 : 0 };
}

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

export function bucketBalancesForRow(row, fracsByCategory) {
  return bucketDollarTotals(
    { cash: row?.cashEnd, taxable: row?.taxableEnd, pretax: row?.pretaxEnd, roth: row?.rothEnd },
    fracsByCategory
  );
}

export function computeBucket1Runway(rows, fracsByCategory, b1Years) {
  if (!Array.isArray(rows) || !rows.length) return null;
  for (const r of rows) {
    const b1AtRow = bucketBalancesForRow(r, fracsByCategory)[1];
    if (b1AtRow < r.spending) {
      return { depleted: true, age: r.age, year: r.yr, refillAmount: Math.round(r.spending * (b1Years ?? 2)) };
    }
  }
  return { depleted: false };
}
