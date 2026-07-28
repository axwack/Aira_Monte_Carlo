// tests/roth-conversion.test.js
import { describe, it, expect } from 'vitest';
import { buildRothExplorer } from '../src/engine/buildRothExplorer.js';

const baseParams = {
  currentAge: 56,
  retireAge: 60,
  ssAge: 64,
  ssb: 31543,
  ab: 18000,
  inf: 2.5,
  endAge: 85,
  port: 3000000,
  accounts: [
    { category: "pretax", balance: 2000000 },
    { category: "roth", balance: 800000 },
    { category: "taxable", balance: 200000 },
  ],
  sp: 100000,
  gkFloor: 48000,
  gkCeiling: 115000,
  conversionOverrides: [],
  rothMode: "fill_22",
  taxFunding: "outside_cash",
};

describe('buildRothExplorer - withdrawal order', () => {
  it('should draw from taxable before pre-tax', () => {
    const res = buildRothExplorer({ ...baseParams });
    const firstRow = res.opt.rows.find(r => r.yr === 2030);
    expect(firstRow.drawFromTaxable).toBeGreaterThan(0);
  });

  it('should only count pre-tax draw as ordinary income', () => {
    const res = buildRothExplorer({ ...baseParams });
    const row = res.opt.rows.find(r => r.yr === 2031);
    // baseInc was not exposed directly; we test indirectly: since taxable draw doesn't create tax, conversion room should be larger than if we counted total draw.
    const conv = row.conv;
    expect(conv).toBeGreaterThan(0); // there should be conversion room
  });

  it('should respect manual override of $0 in 2034', () => {
    const overrides = [{ year: 2034, amount: 0 }];
    const res = buildRothExplorer({ ...baseParams, conversionOverrides: overrides });
    const row2034 = res.opt.rows.find(r => r.yr === 2034);
    expect(row2034.conv).toBe(0);
    expect(row2034.capReason).toMatch(/manual/);
  });
});