/**
 * Roth conversion — the bracket ceiling is reported in the row's own dollars.
 *
 * Reported by a user (jsalley): single, retiring at 55, converting to fill 22%.
 * At age 58 the plan drew $101,246 from pre-tax and converted $40,005, and he
 * concluded it had blown past the 22% bracket because $141,251 > $105,700.
 *
 * It had not. Two things he could not see from the screen:
 *   1. $105,700 is a TAXABLE-income threshold; the standard deduction comes off
 *      the gross first.
 *   2. It is the 2026 figure. The engine indexes brackets forward at 2.5%/yr, as
 *      the IRS does, so the 2032 ceiling is $122,580.
 * His own reported federal tax of $20,835 reconciles exactly to a taxable income
 * of $122,580 taxed entirely within 22% — the plan was correct to the dollar.
 *
 * The defect was disclosure: the engine computed both numbers and showed neither,
 * so the only check available to a user was one guaranteed to mislead. These
 * tests pin the numbers now carried on every row, and — more importantly — the
 * invariant that makes them worth showing: the ceiling reported is one the
 * taxable income actually respects.
 */
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
    // This is the claim the disclosure makes on screen. If it can be false, the
    // number is worse than no number — it would prove a breach rather than
    // explain its absence. $1 of rounding slack, no more.
    for (const r of converting) {
      expect(r.taxableIncome).toBeLessThanOrEqual(r.bracketTopYr + 1);
    }
  });

  test('the ceiling is indexed forward, not the nominal 2026 figure', () => {
    // 22% single tops out at $105,700 in 2026 and rises 2.5%/yr from there.
    const byYear = new Map(converting.map((r) => [r.yr, r]));
    for (const [yr, r] of byYear) {
      if (r.convCapReason !== 'bracket') continue;   // IRMAA-capped rows use a different ceiling
      const expected = Math.round(105_700 * Math.pow(1.025, yr - 2026));
      expect(r.bracketTopYr).toBe(expected);
    }
    // And it must actually MOVE across the plan — a constant would mean the
    // indexing was dropped somewhere between the engine and the row.
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
    expect(r.taxableIncome).toBe(122_580);        // exactly on the line
    expect(r.marginalBracket).toBeCloseTo(0.22, 5);
    // The gross figure he compared against the published table:
    expect(Math.round(r.totInc)).toBe(141_251);
  });

  test('no bracket target ⇒ no conversion and nothing to disclose', () => {
    for (const r of rowsFor({ rothConversionTarget: 'off' })) {
      expect(r.conversionAmount).toBe(0);
      expect(r.bracketTopYr).toBeNull();
    }
  });
});
