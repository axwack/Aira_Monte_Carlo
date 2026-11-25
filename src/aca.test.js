import {
  federalPovertyLevel, applicablePercentage, computeAcaSubsidy,
  acaMagiCeiling, marginalSubsidyCost,
  FPL_TABLE, FPL_BASE_YEAR, CLIFF_PCT,
} from './engine/aca.js';

const Y = FPL_BASE_YEAR;

describe('federalPovertyLevel', () => {
  test('single person, contiguous US, matches the published table', () => {
    expect(federalPovertyLevel(1, 'NJ', Y)).toBe(15_650);
  });

  test('each additional person adds the published increment', () => {
    expect(federalPovertyLevel(2, 'NJ', Y)).toBe(15_650 + 5_500);
    expect(federalPovertyLevel(4, 'NJ', Y)).toBe(15_650 + 5_500 * 3);
  });

  test('Alaska and Hawaii use their own higher tables', () => {
    expect(federalPovertyLevel(1, 'AK', Y)).toBe(FPL_TABLE.AK.first);
    expect(federalPovertyLevel(1, 'HI', Y)).toBe(FPL_TABLE.HI.first);
    expect(federalPovertyLevel(1, 'AK', Y)).toBeGreaterThan(federalPovertyLevel(1, 'NJ', Y));
  });

  test('an unknown or missing state falls back to the contiguous table', () => {
    expect(federalPovertyLevel(1, null, Y)).toBe(15_650);
    expect(federalPovertyLevel(1, 'ZZ', Y)).toBe(15_650);
  });

  test('indexes forward from the published year, never hardcodes a future table', () => {
    expect(federalPovertyLevel(1, 'NJ', Y + 4, 2.5)).toBeCloseTo(15_650 * 1.025 ** 4, 4);
  });

  test('household size is floored at 1', () => {
    expect(federalPovertyLevel(0, 'NJ', Y)).toBe(15_650);
  });
});

describe('applicablePercentage', () => {
  test('statutory regime: no credit above 400% FPL — the cliff', () => {
    expect(applicablePercentage(401, true)).toBeNull();
    expect(applicablePercentage(400, true)).not.toBeNull();
  });

  test('enhanced regime: capped at 8.5% with no upper limit', () => {
    expect(applicablePercentage(401, false)).toBeCloseTo(0.085, 6);
    expect(applicablePercentage(5000, false)).toBeCloseTo(0.085, 6);
  });

  test('interpolates linearly inside a band, as the statute defines it', () => {
    expect(applicablePercentage(225, false)).toBeCloseTo(0.03, 6);
  });

  test('is monotonic — more income never lowers your required contribution %', () => {
    let prev = -1;
    for (let p = 100; p <= 400; p += 5) {
      const v = applicablePercentage(p, true);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('computeAcaSubsidy', () => {
  const BASE = { householdSize: 2, state: 'NJ', benchmarkPremium: 18_000, year: Y, cliffReturns: true };
  const fpl2 = 15_650 + 5_500;

  test('PTC = benchmark − applicable% × MAGI (hand-calculated)', () => {
    const magi = fpl2 * 3;
    const r = computeAcaSubsidy({ ...BASE, magi });
    expect(r.fplPct).toBeCloseTo(300, 6);
    expect(r.applicablePct).toBeCloseTo(0.0996, 6);
    expect(r.ptc).toBeCloseTo(18_000 - 0.0996 * magi, 4);
    expect(r.netPremium).toBeCloseTo(0.0996 * magi, 4);
  });

  test('THE CLIFF: one dollar over 400% FPL destroys the whole credit', () => {
    const at    = computeAcaSubsidy({ ...BASE, magi: fpl2 * 4 });
    const over  = computeAcaSubsidy({ ...BASE, magi: fpl2 * 4 + 1 });
    expect(at.ptc).toBeGreaterThan(0);
    expect(over.ptc).toBe(0);
    expect(over.overCliff).toBe(true);
    expect(over.reason).toBe('over_cliff');
  });

  test('no cliff under the enhanced regime — the same income keeps a credit', () => {
    const over = computeAcaSubsidy({ ...BASE, cliffReturns: false, magi: fpl2 * 6 });
    expect(over.overCliff).toBe(false);
    expect(over.reason).not.toBe('over_cliff');
  });

  test('below 100% FPL is reported, not silently zeroed', () => {
    const r = computeAcaSubsidy({ ...BASE, magi: 5_000 });
    expect(r.ptc).toBe(0);
    expect(r.reason).toBe('below_medicaid_floor');
    expect(r.eligible).toBe(false);
  });

  test('a benchmark below the required contribution yields no credit, not a negative one', () => {
    const r = computeAcaSubsidy({ ...BASE, benchmarkPremium: 500, magi: fpl2 * 3.5 });
    expect(r.ptc).toBe(0);
    expect(r.netPremium).toBe(500);
  });

  test('a bigger household gets a bigger credit at the same income', () => {
    const magi = 60_000;
    const two  = computeAcaSubsidy({ ...BASE, magi, householdSize: 2 });
    const four = computeAcaSubsidy({ ...BASE, magi, householdSize: 4 });
    expect(four.ptc).toBeGreaterThan(two.ptc);
  });

  test('no benchmark premium entered ⇒ no credit, and it does not throw', () => {
    const r = computeAcaSubsidy({ ...BASE, benchmarkPremium: 0, magi: 50_000 });
    expect(r.ptc).toBe(0);
    expect(Number.isFinite(r.fplPct)).toBe(true);
  });

  test('survives junk input', () => {
    expect(() => computeAcaSubsidy()).not.toThrow();
    expect(computeAcaSubsidy({ magi: NaN }).ptc).toBe(0);
  });
});

describe('acaMagiCeiling — what the conversion sizer caps against', () => {
  test('statutory: exactly 400% FPL', () => {
    expect(acaMagiCeiling({ householdSize: 2, state: 'NJ', year: Y, cliffReturns: true }))
      .toBeCloseTo((15_650 + 5_500) * (CLIFF_PCT / 100), 6);
  });

  test('enhanced: Infinity — never invent a ceiling the law does not have', () => {
    expect(acaMagiCeiling({ householdSize: 2, cliffReturns: false })).toBe(Infinity);
  });
});

describe('marginalSubsidyCost — the number §17 needs', () => {
  const BASE = { householdSize: 2, state: 'NJ', benchmarkPremium: 18_000, year: Y, cliffReturns: true };
  const fpl2 = 15_650 + 5_500;

  test('inside a flat band the cost per dollar equals the applicable percentage', () => {
    const r = marginalSubsidyCost({ ...BASE, magi: fpl2 * 3.2 }, 1_000);
    expect(r.costPerDollar).toBeCloseTo(0.0996, 4);
    expect(r.crossesCliff).toBe(false);
  });

  test('a conversion that crosses the cliff is flagged and priced at the full credit', () => {
    const justUnder = fpl2 * 4 - 500;
    const r = marginalSubsidyCost({ ...BASE, magi: justUnder }, 1_000);
    expect(r.crossesCliff).toBe(true);
    expect(r.subsidyLost).toBeGreaterThan(1_000);
    expect(r.costPerDollar).toBeGreaterThan(1);
  });

  test('under the enhanced regime the same conversion never crosses a cliff', () => {
    const r = marginalSubsidyCost({ ...BASE, cliffReturns: false, magi: fpl2 * 4 - 500 }, 1_000);
    expect(r.crossesCliff).toBe(false);
  });
});
