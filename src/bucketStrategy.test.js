/**
 * Unit tests for the 3-Bucket strategy engine (src/engine/bucketStrategy.js).
 * Hand-calculated expected values per the repo's testing gate — no reliance
 * on the real SP500/BONDS historical arrays' actual contents beyond the
 * documented identity: a 100% equity weight returns SP500[i] exactly, a 0%
 * weight returns BONDS[i] exactly (blendedReturnFromIndex is a pure lerp).
 */
import { SP500, BONDS } from "./engine/expectedReturn.js";
import {
  bucketFractionsByCategory,
  fractionsForCategory,
  blendEquityBond,
  blendedReturnFromIndex,
  blendBucketReturns,
  bucketCategoryReturn,
  bucketCategoryReturnFromReturns,
  bucketDrawCaps,
  BEAR_REFILL_THRESHOLD,
  bucket3DrawdownFromPeak,
  shouldFreezeRefill,
  bucketDollarTotals,
  bucket2YieldSweep,
} from "./engine/bucketStrategy.js";

const acct = (category, balance, bucket, id = category + Math.random()) =>
  ({ id, category, balance, ...(bucket != null ? { bucket } : {}) });

describe("bucketFractionsByCategory", () => {
  test("single cash account, explicit bucket 1 → 100% in that bucket", () => {
    const f = bucketFractionsByCategory([acct("cash", 50_000, 1)]);
    expect(f.cash).toEqual({ 1: 1, 2: 0, 3: 0 });
  });

  test("bucket 1 is cash-only: a non-cash account tagged 1 clamps to 2 (regression)", () => {
    // Bucket 1 promises "spendable without tax/penalty" — only a cash
    // account can back that. A taxable account tagged 1 is treated as 2
    // everywhere (engine/buckets.js clampBucket), not honored as-is.
    const f = bucketFractionsByCategory([acct("taxable", 50_000, 1)]);
    expect(f.taxable).toEqual({ 1: 0, 2: 1, 3: 0 });
  });

  test("no bucket tag → falls back to _defaultBucket(category) (taxable → 2)", () => {
    const f = bucketFractionsByCategory([acct("taxable", 50_000)]);
    expect(f.taxable).toEqual({ 1: 0, 2: 1, 3: 0 });
  });

  test("two accounts, same category, different buckets → weighted split", () => {
    const f = bucketFractionsByCategory([
      acct("pretax", 30_000, 2, "p1"),
      acct("pretax", 70_000, 3, "p2"),
    ]);
    expect(f.pretax[2]).toBeCloseTo(0.3, 6);
    expect(f.pretax[3]).toBeCloseTo(0.7, 6);
    expect(f.pretax[1]).toBe(0);
  });

  test("split account (Quicken-style) partitions correctly", () => {
    const f = bucketFractionsByCategory([
      { id: "c1", category: "cash", balance: 100_000, splits: [{ bucket: 1, pct: 20 }, { bucket: 3, pct: 80 }] },
    ]);
    expect(f.cash[1]).toBeCloseTo(0.2, 6);
    expect(f.cash[3]).toBeCloseTo(0.8, 6);
  });

  test("split account on a non-cash category: the bucket-1 slice clamps to 2 (regression)", () => {
    const f = bucketFractionsByCategory([
      { id: "r1", category: "roth", balance: 100_000, splits: [{ bucket: 1, pct: 20 }, { bucket: 3, pct: 80 }] },
    ]);
    expect(f.roth[1]).toBe(0);
    expect(f.roth[2]).toBeCloseTo(0.2, 6); // the would-be-B1 20% joins B2 instead
    expect(f.roth[3]).toBeCloseTo(0.8, 6);
  });

  test("multiple categories are independent", () => {
    const f = bucketFractionsByCategory([
      acct("cash", 10_000, 1),
      acct("roth", 10_000, 3),
    ]);
    expect(f.cash).toEqual({ 1: 1, 2: 0, 3: 0 });
    expect(f.roth).toEqual({ 1: 0, 2: 0, 3: 1 });
  });
});

describe("fractionsForCategory", () => {
  test("category absent from the map falls back to its default bucket", () => {
    const f = fractionsForCategory({}, "hsa"); // hsa → default bucket 3
    expect(f).toEqual({ 1: 0, 2: 0, 3: 1 });
  });

  test("category present returns the stored fractions unchanged", () => {
    const stored = { 1: 0.4, 2: 0.6, 3: 0 };
    expect(fractionsForCategory({ taxable: stored }, "taxable")).toBe(stored);
  });
});

describe("blendEquityBond (works with mismatched stock/bond sources, e.g. Stress Test)", () => {
  test("stock and bond can come from unrelated draws, still blends correctly", () => {
    // Mirrors runMC's Stress Test branch: stock = forced historical sequence
    // value, bond = an independently bootstrapped draw — not a paired index.
    expect(blendEquityBond(-0.30, 0.05, 60)).toBeCloseTo(0.6 * -0.30 + 0.4 * 0.05, 10);
  });
  test("blendedReturnFromIndex is exactly blendEquityBond(SP500[i], BONDS[i], w)", () => {
    const i = 3, w = 72;
    expect(blendedReturnFromIndex(i, w)).toBeCloseTo(blendEquityBond(SP500[i], BONDS[i], w), 10);
  });
});

describe("blendedReturnFromIndex", () => {
  const i = 10; // arbitrary fixed historical-year index, same for every assertion
  test("100% equity weight returns SP500[i] exactly", () => {
    expect(blendedReturnFromIndex(i, 100)).toBeCloseTo(SP500[i], 10);
  });
  test("0% equity weight returns BONDS[i] exactly", () => {
    expect(blendedReturnFromIndex(i, 0)).toBeCloseTo(BONDS[i], 10);
  });
  test("50/50 is the exact midpoint", () => {
    expect(blendedReturnFromIndex(i, 50)).toBeCloseTo((SP500[i] + BONDS[i]) / 2, 10);
  });
  test("clamps out-of-range weights instead of extrapolating", () => {
    expect(blendedReturnFromIndex(i, 150)).toBeCloseTo(SP500[i], 10);
    expect(blendedReturnFromIndex(i, -20)).toBeCloseTo(BONDS[i], 10);
  });
});

describe("blendBucketReturns (return-agnostic core, used by both engines)", () => {
  test("100% bucket 1 returns r1 regardless of r2/r3", () => {
    expect(blendBucketReturns({ 1: 1, 2: 0, 3: 0 }, 0.03, 0.99, -0.99)).toBeCloseTo(0.03, 10);
  });
  test("deterministic-engine style call: flat cashGr/postGr/preGr, mixed fractions", () => {
    // Mirrors exactly how buildWithdrawalWaterfall.js will call this: no
    // sampled year, just its own already-computed flat rates.
    const cashGr = 0.03, postGr = 0.055, preGr = 0.081; // illustrative expectedReturn() outputs
    const r = blendBucketReturns({ 1: 0.1, 2: 0.4, 3: 0.5 }, cashGr, postGr, preGr);
    expect(r).toBeCloseTo(0.1 * cashGr + 0.4 * postGr + 0.5 * preGr, 10);
  });
  test("missing fraction keys default to 0, not NaN", () => {
    expect(blendBucketReturns({ 2: 1 }, 0.03, 0.06, 0.09)).toBeCloseTo(0.06, 10);
  });
});

describe("bucketCategoryReturn", () => {
  const i = 7;
  test("100% Bucket 1 ignores market data entirely, returns cashRealReturn", () => {
    const r = bucketCategoryReturn(i, { 1: 1, 2: 0, 3: 0 }, 0.03, 40, 91);
    expect(r).toBeCloseTo(0.03, 10);
  });
  test("100% Bucket 3 returns the preRetireEq-weighted blend", () => {
    const r = bucketCategoryReturn(i, { 1: 0, 2: 0, 3: 1 }, 0.03, 40, 91);
    expect(r).toBeCloseTo(blendedReturnFromIndex(i, 91), 10);
  });
  test("mixed fractions sum linearly (hand-calculated)", () => {
    const r = bucketCategoryReturn(i, { 1: 0.2, 2: 0.3, 3: 0.5 }, 0.03, 40, 91);
    const expected = 0.2 * 0.03 + 0.3 * blendedReturnFromIndex(i, 40) + 0.5 * blendedReturnFromIndex(i, 91);
    expect(r).toBeCloseTo(expected, 10);
  });
});

describe("bucketCategoryReturnFromReturns (Stress Test path: mismatched stock/bond sources)", () => {
  test("agrees with bucketCategoryReturn when given the same SP500[i]/BONDS[i] pair", () => {
    const i = 5;
    const fracs = { 1: 0.2, 2: 0.3, 3: 0.5 };
    const viaIndex = bucketCategoryReturn(i, fracs, 0.03, 40, 91);
    const viaReturns = bucketCategoryReturnFromReturns(SP500[i], BONDS[i], fracs, 0.03, 40, 91);
    expect(viaReturns).toBeCloseTo(viaIndex, 10);
  });
  test("forced stress-sequence equity value blends correctly with an unrelated bond draw", () => {
    const forcedEquity = -0.365; // e.g. SEQ_2000_2012 crash year
    const bootstrappedBond = 0.08;
    const r = bucketCategoryReturnFromReturns(forcedEquity, bootstrappedBond, { 1: 1, 2: 0, 3: 0 }, 0.03, 40, 91);
    expect(r).toBeCloseTo(0.03, 10); // 100% bucket 1 ignores the crash entirely
  });
});

describe("bucketDrawCaps", () => {
  test("matches BucketsTab's hand-worked example: $80k spend, 3/5yr, SS gap 8yr", () => {
    // retireAge 60, ssAge 68 → ssGapYears = max(b2Years=5, 8) = 8
    const caps = bucketDrawCaps({ b1Years: 3, b2Years: 5, ssAge: 68, retireAge: 60, spendBasis: 80_000 });
    expect(caps.b1Floor).toBe(80_000);
    expect(caps.b1Target).toBe(240_000);       // 80k * 3
    expect(caps.b2Floor).toBe(400_000);         // 80k * 5
    expect(caps.b2Target).toBe(640_000);        // round(8 * 80k)
  });

  test("SS gap shorter than b2Years → b2Target falls back to b2Floor", () => {
    // retireAge 65, ssAge 67 → gap 2yr < b2Years 5yr
    const caps = bucketDrawCaps({ b1Years: 3, b2Years: 5, ssAge: 67, retireAge: 65, spendBasis: 50_000 });
    expect(caps.b2Target).toBe(caps.b2Floor); // 250,000
  });
});

describe("bucketDollarTotals", () => {
  test("sums two categories into one bucket total (hand-calculated)", () => {
    const catBalances = { pretax: 100_000, taxable: 50_000 };
    const fracs = {
      pretax:  { 1: 0, 2: 0.6, 3: 0.4 },
      taxable: { 1: 1, 2: 0,   3: 0 },
    };
    const totals = bucketDollarTotals(catBalances, fracs);
    expect(totals[1]).toBeCloseTo(50_000, 6);           // all of taxable
    expect(totals[2]).toBeCloseTo(60_000, 6);            // 60% of pretax
    expect(totals[3]).toBeCloseTo(40_000, 6);            // 40% of pretax
  });

  test("category missing from fracsByCategory falls back to its default bucket", () => {
    const totals = bucketDollarTotals({ roth: 10_000 }, {}); // roth → default bucket 3
    expect(totals).toEqual({ 1: 0, 2: 0, 3: 10_000 });
  });
});

describe("bucket2YieldSweep — the income-replenishment mechanic", () => {
  test("hand-calculated: 3% yield on $200k Bucket 2 = $6,000 swept to Bucket 1", () => {
    const r = bucket2YieldSweep(/* b1$ */ 50_000, /* b2$ */ 200_000, /* r1 */ 0.03, /* r2 */ 0.05, /* yieldPct */ 3);
    expect(r.yieldAmount).toBeCloseTo(6_000, 6);
    // r1 boosted by yieldAmount / b1$ = 6000/50000 = 0.12
    expect(r.r1).toBeCloseTo(0.03 + 0.12, 10);
    // r2 reduced by the yield fraction (3%) it paid out instead of retaining
    expect(r.r2).toBeCloseTo(0.05 - 0.03, 10);
  });

  test("net dollars are conserved: what leaves Bucket 2's rate equals what Bucket 1's rate gains, in dollar terms", () => {
    const b1 = 80_000, b2 = 150_000, yieldPct = 4;
    const r = bucket2YieldSweep(b1, b2, 0.03, 0.06, yieldPct);
    const b1GainFromSweep = b1 * (r.r1 - 0.03); // isolate the boost from the base rate
    expect(b1GainFromSweep).toBeCloseTo(r.yieldAmount, 6);
    const b2LossFromSweep = b2 * (0.06 - r.r2);
    expect(b2LossFromSweep).toBeCloseTo(r.yieldAmount, 6);
  });

  test("empty Bucket 1: the WHOLE sweep is a no-op — r2 must NOT be debited with nowhere for it to go", () => {
    // Regression test for a real bug: r2 used to be reduced even when
    // bucket1Dollars was 0, so Bucket 2 bled value into nothing once Bucket 1
    // was spent down (verified via a real profile's Stress Test getting
    // WORSE, not better, with this mode on).
    const r = bucket2YieldSweep(0, 100_000, 0.03, 0.05, 3);
    expect(r.yieldAmount).toBe(0);
    expect(r.r1).toBeCloseTo(0.03, 10);
    expect(r.r2).toBeCloseTo(0.05, 10); // unchanged — this is the assertion that used to be missing
  });

  test("zero yield % is a true no-op on both rates", () => {
    const r = bucket2YieldSweep(50_000, 100_000, 0.03, 0.05, 0);
    expect(r.yieldAmount).toBe(0);
    expect(r.r1).toBeCloseTo(0.03, 10);
    expect(r.r2).toBeCloseTo(0.05, 10);
  });

  describe("bucket1Target cap — the fix for a real regression", () => {
    // Found by comparing a real profile before/after: an uncapped sweep
    // permanently drained a large Bucket 2 balance (e.g. a 401k) every year,
    // long after Bucket 1 already held more than its target years-of-spending.
    test("below target: sweep still applies in full", () => {
      const r = bucket2YieldSweep(50_000, 500_000, 0.03, 0.05, 3, /* target */ 120_000);
      expect(r.yieldAmount).toBeCloseTo(15_000, 6); // 3% of 500k, unchanged
      expect(r.r2).toBeCloseTo(0.02, 10);
    });
    test("at or above target: sweep is a full no-op, Bucket 2 keeps its return", () => {
      const r = bucket2YieldSweep(120_000, 500_000, 0.03, 0.05, 3, /* target */ 120_000);
      expect(r.yieldAmount).toBe(0);
      expect(r.r1).toBeCloseTo(0.03, 10);
      expect(r.r2).toBeCloseTo(0.05, 10); // NOT debited — this is the fix
    });
    test("well above target: still a no-op, not partial", () => {
      const r = bucket2YieldSweep(300_000, 500_000, 0.03, 0.05, 3, /* target */ 120_000);
      expect(r.yieldAmount).toBe(0);
      expect(r.r2).toBeCloseTo(0.05, 10);
    });
    test("no target provided (undefined/null): old unconditional behavior, for backward compatibility", () => {
      const r = bucket2YieldSweep(300_000, 500_000, 0.03, 0.05, 3);
      expect(r.yieldAmount).toBeCloseTo(15_000, 6);
      expect(r.r2).toBeCloseTo(0.02, 10);
    });
  });

  describe("shortfall capping — don't sweep more than Bucket 1 actually needs", () => {
    // Real regression: a small shortfall still pulled the FLAT 3% off a
    // large Bucket 2, e.g. a $10k gap pulling $36k off a $1.2M Bucket 2.
    test("small shortfall relative to the flat 3%: sweep is capped at the shortfall, not 3%", () => {
      // Bucket1=110k, target=120k -> shortfall=10k. Flat 3% of 500k = 15k,
      // which would OVERSHOOT the target by 5k — must cap at 10k instead.
      const r = bucket2YieldSweep(110_000, 500_000, 0.03, 0.05, 3, 120_000);
      expect(r.yieldAmount).toBeCloseTo(10_000, 6);
      // r2 debited only by the fraction actually swept (10k/500k = 2%), not the full 3%.
      expect(r.r2).toBeCloseTo(0.05 - 0.02, 10);
      // r1 boost reflects the capped (smaller) amount.
      expect(r.r1).toBeCloseTo(0.03 + 10_000 / 110_000, 10);
    });
    test("large shortfall (flat 3% is smaller than the gap): behaves like the uncapped case", () => {
      // Bucket1=50k, target=500k -> shortfall=450k, way more than 3% of 500k (15k).
      const r = bucket2YieldSweep(50_000, 500_000, 0.03, 0.05, 3, 500_000);
      expect(r.yieldAmount).toBeCloseTo(15_000, 6); // the flat 3%, unconstrained by the large gap
      expect(r.r2).toBeCloseTo(0.02, 10);
    });
    test("shortfall of exactly zero (at target): full no-op, same as the >= target branch", () => {
      const r = bucket2YieldSweep(120_000, 500_000, 0.03, 0.05, 3, 120_000);
      expect(r.yieldAmount).toBe(0);
    });
  });
});

describe("bear-market refill freeze", () => {
  test("BEAR_REFILL_THRESHOLD matches the documented -15% directive", () => {
    expect(BEAR_REFILL_THRESHOLD).toBe(-0.15);
  });

  test("20% drawdown from peak freezes refill", () => {
    const dd = bucket3DrawdownFromPeak(80_000, 100_000);
    expect(dd).toBeCloseTo(-0.2, 10);
    expect(shouldFreezeRefill(dd)).toBe(true);
  });

  test("10% drawdown does NOT freeze (markets 'down but not >15%')", () => {
    const dd = bucket3DrawdownFromPeak(90_000, 100_000);
    expect(shouldFreezeRefill(dd)).toBe(false);
  });

  test("exactly -15% freezes (boundary is inclusive)", () => {
    const dd = bucket3DrawdownFromPeak(85_000, 100_000);
    expect(dd).toBeCloseTo(-0.15, 10);
    expect(shouldFreezeRefill(dd)).toBe(true);
  });

  test("no peak yet (0 or falsy) is treated as no drawdown, never freezes", () => {
    expect(bucket3DrawdownFromPeak(10_000, 0)).toBe(0);
    expect(shouldFreezeRefill(bucket3DrawdownFromPeak(10_000, 0))).toBe(false);
  });

  test("bucket 3 above its prior peak (new high) is a positive, never-freezing value", () => {
    const dd = bucket3DrawdownFromPeak(110_000, 100_000);
    expect(dd).toBeCloseTo(0.1, 10);
    expect(shouldFreezeRefill(dd)).toBe(false);
  });
});
