import { buildWithdrawalWaterfall } from './engine/buildWithdrawalWaterfall';

const BASE = {
  currentAge: 52, retireAge: 55, endAge: 90,
  sp: 84_000, ssAge: 67, ssb: 30_000,
  inf: 2.5, gr: 0.06,
  filingStatus: 'single', stateOfResidence: 'OH',
  rothConversionTarget: 22, irmaaGuard: true,
  port: 1_500_000,
  accounts: [
    { id: '1', category: 'pretax',  name: '401k',      balance: 1_200_000 },
    { id: '2', category: 'taxable', name: 'Brokerage', balance: 200_000 },
    { id: '3', category: 'cash',    name: 'Cash',      balance: 100_000 },
  ],
};

const rowsFor = (over = {}) => buildWithdrawalWaterfall({ ...BASE, ...over })?.smart?.rows ?? [];

describe('conversion rows carry the ceiling they were sized to', () => {
  const rows = rowsFor();
  const converting = rows.filter((r) => r.conversionAmount > 0);

  test('the scenario produces conversions to check', () => {
    expect(converting.length).toBeGreaterThan(0);
  });

  test('every converting row reports a ceiling and a deduction', () => {
    for (const r of converting) {
      expect(typeof r.bracketTopYr).toBe('number');
      expect(typeof r.stdDedYr).toBe('number');
      expect(r.bracketTopYr).toBeGreaterThan(0);
      expect(r.stdDedYr).toBeGreaterThan(0);
    }
  });

  test('THE INVARIANT: taxable income never exceeds the ceiling reported beside it', () => {
    for (const r of converting) {
      expect(r.taxableIncome).toBeLessThanOrEqual(r.bracketTopYr + 1);
    }
  });

  test('the ceiling is indexed forward, not the nominal 2026 figure', () => {
    const byYear = new Map(converting.map((r) => [r.yr, r]));
    for (const [yr, r] of byYear) {
      if (r.convCapReason !== 'bracket') continue;
      const expected = Math.round(105_700 * Math.pow(1.025, yr - 2026));
      expect(r.bracketTopYr).toBe(expected);
    }
    const bracketRows = converting.filter((r) => r.convCapReason === 'bracket');
    if (bracketRows.length > 1) {
      const tops = bracketRows.map((r) => r.bracketTopYr);
      expect(new Set(tops).size).toBeGreaterThan(1);
    }
  });

  test('gross − deduction = taxable, so the on-screen arithmetic adds up', () => {
    for (const r of converting) {
      expect(r.totInc - r.stdDedYr).toBeCloseTo(r.taxableIncome, 0);
    }
  });

  test("jsalley's row: 2032 ceiling is $122,580, not $105,700", () => {
    const r = rowsFor().find((x) => x.yr === 2032 && x.conversionAmount > 0);
    expect(r).toBeDefined();
    expect(r.bracketTopYr).toBe(122_580);
    expect(r.taxableIncome).toBe(122_580);
    expect(r.marginalBracket).toBeCloseTo(0.22, 5);
    expect(Math.round(r.totInc)).toBe(141_251);
  });

  test('no bracket target ⇒ no conversion and nothing to disclose', () => {
    for (const r of rowsFor({ rothConversionTarget: 'off' })) {
      expect(r.conversionAmount).toBe(0);
      expect(r.bracketTopYr).toBeNull();
    }
  });
});
