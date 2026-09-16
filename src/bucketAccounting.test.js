/**
 * Unit tests for bucket ACCOUNTING (src/engine/buckets.js).
 *
 * These helpers answer one question — how many dollars sit in Bucket 1/2/3
 * right now — for the 🧺 Buckets tab and the Withdrawal Plan's "B1 End"
 * column. They are pure accounting: nothing here changes what any account
 * earns or the order accounts are drawn in.
 *
 * Previously src/bucketStrategy.test.js, covering an engine module of the same
 * name. v1.2.129 removed the "three_bucket" ordering mode after measuring its
 * asset-location half as a bit-for-bit no-op, and the tests for the removed
 * return-blending and yield-sweep code went with it. What survives is the part
 * that was always real: counting the buckets.
 */

import {
  bucketFractionsByCategory,
  fractionsForCategory,
  bucketDollarTotals,
} from "./engine/buckets.js";

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
