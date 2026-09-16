/**
 * 3-Bucket asset-location strategy — shared engine.
 *
 * This is the ADDITIVE layer described in the plan: it does not replace the
 * withdrawal-order engine (buildWithdrawalWaterfall.js) or any spend-rate
 * strategy (withdrawalStrategies.js). It answers exactly two questions,
 * orthogonal to everything those already do:
 *
 *   1. What return should this year apply to each account CATEGORY, given
 *      how that category's dollars are split across time-horizon buckets
 *      1/2/3 (bucketFractionsByCategory / bucketCategoryReturn)?
 *   2. Is Bucket 3 → Bucket 2 refilling allowed this year, or should it
 *      freeze because markets are down (shouldFreezeRefill)?
 *
 * Bucket 1 (cash moat) reuses `cashRealReturn` — already the safe rate the
 * `cash` category gets today. Bucket 2 (income bridge) and Bucket 3 (growth
 * core) reuse `postRetireEq`/`preRetireEq` respectively, but as FLAT
 * (non-glidepathed) equity weights — under this strategy those two fields
 * are reinterpreted as "moderate tier" / "aggressive tier" weights instead
 * of a time-based pre/post-retirement glidepath. That glidepath continues to
 * apply unchanged to the whole portfolio when this strategy is off.
 *
 * All bucket returns for a given simulated year are drawn from the SAME
 * sampled historical-year index `i` (see App.jsx's drawYearBundle, which now
 * exposes `i`) — never a second independent rand() draw. Otherwise the
 * paired stock/bond correlation the codebase already fixed once (see the
 * "PAIRED bootstrap sampling" comment above portReturn in App.jsx) would be
 * broken again, just one layer up.
 */

import { SP500, BONDS } from "./expectedReturn.js";
import { _defaultBucket, expandAccountBuckets } from "./buckets.js";

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

/** eqWeightPct (0-100) blended against an already-drawn stock/bond return
 * pair. Deliberately takes the raw returns, not an index — runMC's normal
 * path draws stock+bond as a PAIR from one sampled historical year (see
 * blendedReturnFromIndex below), but its Stress Test path draws them from
 * DIFFERENT sources (equity is the forced historical sequence, bonds are an
 * independent bootstrap) — this primitive works for either. */
export function blendEquityBond(stockReturn, bondReturn, eqWeightPct) {
  const eqW = Math.max(0, Math.min(100, eqWeightPct ?? 0)) / 100;
  return eqW * stockReturn + (1 - eqW) * bondReturn;
}

/** eqWeightPct (0-100) blended against the SAME sampled historical year `i`
 * used elsewhere this simulated year, so bucket returns stay correlated with
 * the portfolio-wide return instead of drawing an independent random year.
 * The normal-path convenience form of blendEquityBond. */
export function blendedReturnFromIndex(i, eqWeightPct) {
  return blendEquityBond(SP500[i], BONDS[i], eqWeightPct);
}

/**
 * Core primitive: blend three already-computed per-bucket returns by a
 * category's bucket fractions. Deliberately return-agnostic — callers decide
 * HOW r1/r2/r3 were derived, so this same function serves both:
 *   - the deterministic engine (buildWithdrawalWaterfall.js), which already
 *     has flat `cashGr`/`postGr`/`preGr` (expectedReturn-based, no sampled
 *     year) and just needs them applied per-category instead of uniformly;
 *   - the stochastic engine (runMC via bucketCategoryReturn below), which
 *     needs r2/r3 drawn from the SAME sampled historical year as the
 *     portfolio-wide return.
 */
export function blendBucketReturns(fracsForCat, r1, r2, r3) {
  return (fracsForCat[1] || 0) * r1 + (fracsForCat[2] || 0) * r2 + (fracsForCat[3] || 0) * r3;
}

/**
 * The blended return one account CATEGORY earns this year under the
 * 3-Bucket strategy, for the STOCHASTIC engine (runMC) — given an
 * already-drawn stock/bond return pair for this simulated year (works for
 * both runMC's normal path, where they're paired from one sampled year, and
 * its Stress Test path, where they come from different sources — see
 * blendEquityBond). The deterministic engine calls blendBucketReturns
 * directly with its own flat cashGr/postGr/preGr instead (no market draw at
 * all — expectedReturn() is already a fixed number).
 * @param {number} stockReturn / bondReturn — this simulated year's draw.
 * @param {{1:number,2:number,3:number}} fracsForCat — from fractionsForCategory.
 * @param {number} cashRealReturnDecimal — e.g. 0.03, NOT the raw percent field.
 * @param {number} postRetireEqPct — reinterpreted as Bucket 2's flat weight (0-100).
 * @param {number} preRetireEqPct — reinterpreted as Bucket 3's flat weight (0-100).
 */
export function bucketCategoryReturnFromReturns(stockReturn, bondReturn, fracsForCat, cashRealReturnDecimal, postRetireEqPct, preRetireEqPct) {
  const r2 = blendEquityBond(stockReturn, bondReturn, postRetireEqPct);
  const r3 = blendEquityBond(stockReturn, bondReturn, preRetireEqPct);
  return blendBucketReturns(fracsForCat, cashRealReturnDecimal, r2, r3);
}

/** Convenience form of bucketCategoryReturnFromReturns for runMC's normal
 * (non-stress-test) path, where stock/bond are paired from one sampled index. */
export function bucketCategoryReturn(i, fracsForCat, cashRealReturnDecimal, postRetireEqPct, preRetireEqPct) {
  return bucketCategoryReturnFromReturns(SP500[i], BONDS[i], fracsForCat, cashRealReturnDecimal, postRetireEqPct, preRetireEqPct);
}

/* ───────────────────────────────────────────────────────────────────────────
 * NOT WIRED — the four exports below have ZERO production callers.
 *
 * bucketDrawCaps, BEAR_REFILL_THRESHOLD, bucket3DrawdownFromPeak and
 * shouldFreezeRefill are imported by src/bucketStrategy.test.js and by nothing
 * else. They are the refill-protocol half of the bucket strategy — spend
 * Bucket 1 first, sell Bucket 3 to refill it when markets are up, freeze those
 * sales when Bucket 3 is down more than BEAR_REFILL_THRESHOLD. That half was
 * never built. What IS live is asset location (blendBucketReturns et al) plus
 * the Bucket 2 -> Bucket 1 yield sweep (bucket2YieldSweep), and the UI now
 * claims only those.
 *
 * Being unit-tested made these read as shipped during an audit, which is the
 * specific trap this banner exists to close. Kept rather than deleted because
 * a real refill protocol is scoped as the next increment and would use them;
 * if that gets shelved for good, delete this block and its tests.
 *
 * Wiring them needs three things this module does not have: per-path trailing
 * peak tracking for Bucket 3 (runMC has the real sequence, this module sees
 * one year at a time), real per-bucket balances (buckets are a derived view of
 * category balances today, not tracked state), and a documented answer for the
 * deterministic engine, which has no market regime to freeze against.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Floor/target dollar thresholds per bucket, lifted verbatim from
 * BucketsTab's existing math (App.jsx ~8219-8226) so the display tab and this
 * engine can never drift onto two different definitions of "Bucket 1 is low."
 */
export function bucketDrawCaps({ b1Years = 3, b2Years = 5, ssAge, retireAge, spendBasis = 0 }) {
  const b1Floor = spendBasis;
  const b1Target = spendBasis * b1Years;
  const ssGapYears = Math.max(b2Years, (ssAge ?? 0) - (retireAge ?? 0));
  const b2Floor = spendBasis * b2Years;
  const b2Target = Math.max(b2Floor, Math.round(ssGapYears * spendBasis));
  return { b1Floor, b1Target, b2Floor, b2Target };
}

// Mirrors BucketsTab's existing bull/bear directive text verbatim
// (App.jsx ~8303-8349): "Only move money from Bucket 3 into Bucket 2 when
// markets are up or neutral. If stocks are down significantly (>15%), wait."
// A named constant, not a new profile field — that directive copy is fixed,
// not user-configurable, today.
export const BEAR_REFILL_THRESHOLD = -0.15;

/** Bucket 3's drawdown from its own trailing peak this path, as a fraction
 * (e.g. -0.20 = down 20%). Feed the result to shouldFreezeRefill. */
export function bucket3DrawdownFromPeak(currentBucket3Value, peakBucket3Value) {
  if (!peakBucket3Value || peakBucket3Value <= 0) return 0;
  return (currentBucket3Value - peakBucket3Value) / peakBucket3Value;
}

export function shouldFreezeRefill(drawdownFromPeak) {
  return drawdownFromPeak <= BEAR_REFILL_THRESHOLD;
}

/**
 * Total dollars currently sitting in each bucket, summed across every account
 * CATEGORY, using that category's bucket fractions. This is a DERIVED total,
 * not tracked state — buckets aren't separate balances in this engine (money
 * still physically lives in cash/taxable/pretax/roth accounts); this is what
 * lets the yield sweep below know "how much is in Bucket 2" without a bigger
 * rearchitecture to real per-bucket balance tracking.
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

/**
 * Bucket 2's annual income sweep — the piece of a real bucket strategy this
 * engine was missing entirely: Bucket 2 (income bridge) is supposed to throw
 * off yield (dividends/interest/coupons) that funds Bucket 1 WITHOUT selling
 * anything, every year, passively. This engine doesn't model individual
 * securities or a separate yield-vs-price-appreciation split for returns —
 * so this uses one general, user-set flat yield assumption
 * (`bucket2YieldPct`) applied to Bucket 2's current dollar total, rather than
 * trying to model real dividend/coupon mechanics per holding.
 *
 * The swept amount is SUBTRACTED from Bucket 2's own return (it left as
 * cash instead of compounding in place) and ADDED to Bucket 1's return
 * (expressed as a % of Bucket 1's own balance, since this function returns
 * adjusted RATES, not dollar transfers — it plugs into the same
 * blendBucketReturns/bucketCategoryReturn call sites Phase 1 already uses,
 * no new balance-tracking state required). Net portfolio dollars are
 * unchanged either way — this only moves WHICH bucket they compound in.
 *
 * @param {number} bucket1Dollars — this year's Bucket 1 total (bucketDollarTotals[1]).
 * @param {number} bucket2Dollars — this year's Bucket 2 total (bucketDollarTotals[2]).
 * @param {number} r1 — Bucket 1's return before the sweep (e.g. cashRealReturn decimal).
 * @param {number} r2 — Bucket 2's return before the sweep (e.g. blendEquityBond(...) decimal).
 * @param {number} yieldPct — flat annual yield, 0-100 (e.g. 3 = 3%), NOT a decimal.
 * @param {number} [bucket1Target] — Bucket 1's target size in dollars
 *   (spendBasis * b1Years). When provided and bucket1Dollars has already
 *   reached it, the sweep is a full no-op — Bucket 2 stops losing return to
 *   a Bucket 1 that no longer needs topping up. Omit for the old unconditional
 *   behavior (kept for callers/tests that don't have a target computed).
 * @returns {{ r1: number, r2: number, yieldAmount: number }} adjusted rates
 *   and the dollar amount swept, for callers that want to display it.
 */
export function bucket2YieldSweep(bucket1Dollars, bucket2Dollars, r1, r2, yieldPct, bucket1Target) {
  // If Bucket 1 is empty (no accounts tagged B1, or fully drawn down — e.g.
  // spent down in the first year or two of retirement, which is the whole
  // point of a cash moat), there's nowhere for the yield to land. The WHOLE
  // sweep must be a no-op in that case — not just skipping Bucket 1's boost
  // while still debiting Bucket 2. A prior version did exactly that: it kept
  // subtracting the yield fraction from r2 even with bucket1Dollars === 0,
  // so a large Bucket-2 balance bled value into nothing for the rest of a
  // 28-year retirement once Bucket 1 emptied. Caught by comparing a real
  // profile's Stress Test result before/after this mode — ending portfolio
  // value got WORSE, not better, which is how this was found.
  if (!(bucket1Dollars > 0)) {
    return { r1, r2, yieldAmount: 0 };
  }
  // Second real regression, found the same way (a real profile's ending
  // portfolio going down, not up): even with the fix above, the sweep ran
  // unconditionally every year Bucket 1 held ANY balance — it never checked
  // whether Bucket 1 had already reached a sensible size. A large Bucket 2
  // (e.g. a 401k) kept losing 3%/yr of its own growth to a Bucket 1 that
  // already held more than its years-of-spending target, for as long as
  // Bucket 2 had a balance at all. Stop entirely once Bucket 1 is at/above
  // target — this is a cap, not a taper, matching "top up a container,
  // don't drain the source forever."
  if (bucket1Target != null && bucket1Dollars >= bucket1Target) {
    return { r1, r2, yieldAmount: 0 };
  }
  const yieldFrac = Math.max(0, yieldPct ?? 0) / 100;
  let yieldAmount = Math.max(0, bucket2Dollars || 0) * yieldFrac;
  // Third real regression, same discovery method (an actual profile's
  // numbers, not the math on paper): even below target, the sweep pulled a
  // FLAT 3% of Bucket 2's entire balance regardless of how small the actual
  // shortfall was — a $10k gap to target still pulled ~$36k off a $1.2M
  // Bucket 2. Cap the swept amount at the real shortfall (target minus
  // current), so this behaves like topping up a container to a level, not
  // draining a fixed fraction of the source every year it's below that level.
  if (bucket1Target != null) {
    const shortfall = Math.max(0, bucket1Target - bucket1Dollars);
    yieldAmount = Math.min(yieldAmount, shortfall);
  }
  // r2 is only debited by the FRACTION of bucket2Dollars actually swept —
  // if the shortfall capped yieldAmount below the flat 3%, Bucket 2 keeps
  // the rest of its return instead of losing the full yieldFrac regardless.
  const r2Debit = (bucket2Dollars || 0) > 0 ? yieldAmount / bucket2Dollars : 0;
  return {
    r1: r1 + (yieldAmount / bucket1Dollars),
    r2: r2 - r2Debit,
    yieldAmount,
  };
}
