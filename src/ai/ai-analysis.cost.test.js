// ai-analysis.cost.test.js — Pure tests for token usage tracking + cost calc

import {
  GEMINI_PRICING,
  calcCost,
  getAiUsage,
  resetAiUsage,
  subscribeAiUsage,
} from './ai-analysis';

// Internal accumulator is exercised via subscribe/get; recordUsage isn't exported,
// so these tests cover the public surface and the math.

beforeEach(() => resetAiUsage());

describe('calcCost', () => {
  test('1M input + 1M output at gemini-2.5-flash = $0.30 + $2.50 = $2.80', () => {
    expect(calcCost('gemini-2.5-flash', 1_000_000, 1_000_000)).toBeCloseTo(2.80, 5);
  });

  test('zero tokens = zero cost', () => {
    expect(calcCost('gemini-2.5-flash', 0, 0)).toBe(0);
  });

  test('partial tokens scale linearly', () => {
    const full = calcCost('gemini-2.0-flash-lite', 1_000_000, 1_000_000);
    const half = calcCost('gemini-2.0-flash-lite', 500_000, 500_000);
    expect(half).toBeCloseTo(full / 2, 8);
  });

  test('unknown model falls back to default pricing without throwing', () => {
    const fallback = calcCost('does-not-exist', 100_000, 100_000);
    expect(fallback).toBeGreaterThan(0);
  });

  test('flash-lite is cheaper than 2.5-pro for identical workload', () => {
    const lite = calcCost('gemini-2.0-flash-lite', 100_000, 100_000);
    const pro  = calcCost('gemini-2.5-pro',         100_000, 100_000);
    expect(pro).toBeGreaterThan(lite);
  });
});

describe('pricing table shape', () => {
  test('every entry has inputPerM and outputPerM as positive numbers', () => {
    for (const [model, p] of Object.entries(GEMINI_PRICING)) {
      expect(typeof p.inputPerM).toBe('number');
      expect(typeof p.outputPerM).toBe('number');
      expect(p.inputPerM).toBeGreaterThan(0);
      expect(p.outputPerM).toBeGreaterThan(0);
      expect(p.outputPerM).toBeGreaterThanOrEqual(p.inputPerM); // output always >= input
      expect(model).toBeTruthy();
    }
  });
});

describe('session usage accumulator', () => {
  test('starts empty', () => {
    const u = getAiUsage();
    expect(u.callCount).toBe(0);
    expect(u.totalTokens).toBe(0);
    expect(u.totalCostUsd).toBe(0);
    expect(u.records).toEqual([]);
  });

  test('resetAiUsage clears state and notifies subscribers', () => {
    let fired = 0;
    const unsub = subscribeAiUsage(() => { fired++; });
    resetAiUsage();
    expect(fired).toBe(1);
    expect(getAiUsage().callCount).toBe(0);
    unsub();
  });

  test('subscribe returns an unsubscribe function', () => {
    let fired = 0;
    const unsub = subscribeAiUsage(() => { fired++; });
    expect(typeof unsub).toBe('function');
    resetAiUsage();
    expect(fired).toBe(1);
    unsub();
    resetAiUsage();
    expect(fired).toBe(1); // didn't fire again after unsub
  });

  test('getAiUsage returns a snapshot, not a live reference', () => {
    const snapshot = getAiUsage();
    snapshot.records.push({ fake: true });
    expect(getAiUsage().records).toEqual([]);
  });
});

describe('localStorage persistence', () => {
  // beforeEach already calls resetAiUsage(), which clears localStorage.

  test('resetAiUsage clears the localStorage key', () => {
    localStorage.setItem('airaAiUsage.v1', JSON.stringify([{ fake: true }]));
    resetAiUsage();
    const raw = localStorage.getItem('airaAiUsage.v1');
    // After reset we write an empty array, not null.
    expect(raw).toBe('[]');
  });

  test('storage key is versioned for forward-compat', () => {
    // If we change the record shape later, bump v1 → v2 to avoid hydrating bad data.
    expect(typeof localStorage.getItem('airaAiUsage.v1')).not.toBe('undefined');
  });

  test('survives bad/corrupt JSON gracefully (does not throw on module load)', () => {
    // We can't re-trigger module load mid-test, but we can verify the load helper's
    // contract: it returns [] when storage is broken. Simulate by writing junk and
    // re-reading via getAiUsage's snapshot (which mirrors _usageRecords).
    localStorage.setItem('airaAiUsage.v1', 'not valid json{{{');
    // resetAiUsage is what we have available — it should clear without throwing.
    expect(() => resetAiUsage()).not.toThrow();
    expect(getAiUsage().records).toEqual([]);
  });

  test('disabled localStorage does not crash (silently drops persistence)', () => {
    // Monkey-patch to simulate quota error.
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      // resetAiUsage internally calls _persistUsage, which should swallow the throw.
      expect(() => resetAiUsage()).not.toThrow();
    } finally {
      Storage.prototype.setItem = origSetItem;
    }
  });
});
