import { accumulateToRetirement } from "./engine/buildWithdrawalWaterfall";

const acct = (category, balance, id = category) => ({ id, category, name: category, balance });

function growThenContribute(balance0, contribution, r, n) {
  let b = balance0;
  for (let i = 0; i < n; i++) b = b * (1 + r) + contribution;
  return b;
}

describe("accumulateToRetirement — contribution routing", () => {
  const base = {
    currentAge: 50,
    retireAge:  60,
    gr:         0.05,
    cashRealReturn: 0,
    taxableBasisPct: 100,
  };

  test("bug 3: contributions are applied at all (was silently ignored)", () => {
    const without = accumulateToRetirement({ ...base, accounts: [acct("pretax", 100_000)] });
    const with401 = accumulateToRetirement({ ...base, accounts: [acct("pretax", 100_000)], contrib: 10_000 });

    expect(with401.pretax0).toBeGreaterThan(without.pretax0);
    expect(with401.pretax0).toBeCloseTo(growThenContribute(100_000, 10_000, 0.05, 10), 2);
  });

  test("bug 1: 401(k) + employer land in pretax; Roth in roth; brokerage in taxable", () => {
    const r = accumulateToRetirement({
      ...base,
      accounts: [acct("pretax", 0), acct("roth", 0), acct("taxable", 0)],
      contrib: 10_000, employerContrib: 5_000,
      rothContrib: 7_000, taxableContrib: 20_000,
    });

    expect(r.pretax0).toBeCloseTo(growThenContribute(0, 15_000, 0.05, 10), 2);
    expect(r.roth0).toBeCloseTo(growThenContribute(0, 7_000, 0.05, 10), 2);
    expect(r.taxable0).toBeCloseTo(growThenContribute(0, 20_000, 0.05, 10), 2);
  });

  test("bug 1: brokerage savings do NOT inflate the pre-tax (RMD) balance", () => {
    const asPretax  = accumulateToRetirement({ ...base, accounts: [acct("pretax", 0)], contrib: 20_000 });
    const asTaxable = accumulateToRetirement({ ...base, accounts: [acct("pretax", 0), acct("taxable", 0)], taxableContrib: 20_000 });

    expect(asTaxable.pretax0).toBe(0);
    expect(asTaxable.taxable0).toBeCloseTo(asPretax.pretax0, 2);
    expect(asTaxable.total).toBeCloseTo(asPretax.total, 2);
  });

  test("brokerage contributions add cost basis one-for-one; growth does not", () => {
    const r = accumulateToRetirement({
      ...base, accounts: [acct("taxable", 0)], taxableContrib: 10_000,
    });

    expect(r.taxableBasis0).toBeCloseTo(100_000, 2);
    expect(r.taxable0).toBeGreaterThan(r.taxableBasis0);
    expect(r.taxable0 - r.taxableBasis0).toBeCloseTo(growThenContribute(0, 10_000, 0.05, 10) - 100_000, 2);
  });

  test("existing taxable basis is preserved and added to, not replaced", () => {
    const r = accumulateToRetirement({
      ...base, accounts: [acct("taxable", 50_000)],
      taxableBasisPct: 60, taxableContrib: 1_000,
    });
    expect(r.taxableBasis0).toBeCloseTo(30_000 + 10_000, 2);
  });

  test("HSA contributions grow at the equity glidepath rate, then fold into cash0", () => {
    const r = accumulateToRetirement({
      ...base, accounts: [acct("hsa", 0)], hsaContrib: 4_000,
    });
    expect(r.cash0).toBeCloseTo(growThenContribute(0, 4_000, 0.05, 10), 2);
    expect(r.pretax0).toBe(0);
  });

  test("bug 2: an hsa-category balance is counted, not dropped, and grows at gr not cashRealReturn", () => {
    const r = accumulateToRetirement({ ...base, accounts: [acct("hsa", 25_000)] });
    expect(r.cash0).toBeCloseTo(25_000 * Math.pow(1.05, 10), 2);
    expect(r.total).toBeCloseTo(25_000 * Math.pow(1.05, 10), 2);
  });

  test("an unrecognized category still lands somewhere rather than vanishing", () => {
    const r = accumulateToRetirement({ ...base, accounts: [acct("something_new", 10_000)] });
    expect(r.total).toBeCloseTo(10_000, 2);
  });

  test("no accumulation years ⇒ no contributions applied", () => {
    const r = accumulateToRetirement({
      ...base, currentAge: 60, retireAge: 60,
      accounts: [acct("pretax", 100_000)],
      contrib: 10_000, taxableContrib: 10_000,
    });
    expect(r.pretax0).toBe(100_000);
    expect(r.taxable0).toBe(0);
  });

  test("HSA-only balance outgrows pure cashGr compounding under the real equity glidepath", () => {
    const r = accumulateToRetirement({
      currentAge: 50, retireAge: 60,
      preRetireEq: 91, postRetireEq: 70, cashRealReturn: 3.0,
      accounts: [acct("hsa", 25_000)],
    });
    const pureCashGrowth = 25_000 * Math.pow(1.03, 10);
    expect(r.cash0).toBeGreaterThan(pureCashGrowth);
  });

  test("total equals the sum of its buckets with every stream active", () => {
    const r = accumulateToRetirement({
      ...base,
      accounts: [acct("pretax", 10_000), acct("roth", 10_000), acct("taxable", 10_000), acct("hsa", 10_000)],
      contrib: 1_000, employerContrib: 500, hsaContrib: 250,
      rothContrib: 750, taxableContrib: 2_000,
    });
    expect(r.total).toBeCloseTo(r.pretax0 + r.roth0 + r.taxable0 + r.cash0, 6);
  });
});
