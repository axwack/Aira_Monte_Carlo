/**
 * Planned one-off / periodic expenses ("cash flow events").
 *
 * Requested independently by two users: a car replaced every ~7 years, a roof in
 * 10, a wedding, big travel years. Before this the model had recurring spend and
 * recurring carveouts (which run from today to an optional endYear) and nothing
 * that lands in a single future year. The only workaround was a multi-year CSV
 * budget, which REPLACES the withdrawal strategy outright and therefore silently
 * switches the Guyton-Klinger guardrails off — so these are additive instead.
 */

import { computeCashFlowEvents } from "./engine/expenses";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall";

const BASE = 2026;
// inflate:false keeps arithmetic exact where the test is about timing, not money.
const at = (year, amount, extra = {}) => ({ id: String(year), label: "E", year, amount, inflate: false, ...extra });

describe("computeCashFlowEvents — timing", () => {
  test("no events ⇒ zero", () => {
    expect(computeCashFlowEvents([], 2030, 2.5, BASE).total).toBe(0);
    expect(computeCashFlowEvents(null, 2030, 2.5, BASE).total).toBe(0);
  });

  test("a one-time event hits only its own year", () => {
    const e = [at(2032, 60_000)];
    expect(computeCashFlowEvents(e, 2031, 2.5, BASE).total).toBe(0);
    expect(computeCashFlowEvents(e, 2032, 2.5, BASE).total).toBe(60_000);
    expect(computeCashFlowEvents(e, 2033, 2.5, BASE).total).toBe(0);
  });

  test("never fires before its start year", () => {
    expect(computeCashFlowEvents([at(2040, 10_000)], 2026, 2.5, BASE).total).toBe(0);
  });

  test("recurring every N years fires only on the cycle", () => {
    const car = [at(2030, 40_000, { recurEveryYears: 7 })];
    for (const [yr, expected] of [[2030, 40_000], [2031, 0], [2036, 0], [2037, 40_000], [2044, 40_000], [2045, 0]]) {
      expect(computeCashFlowEvents(car, yr, 2.5, BASE).total).toBe(expected);
    }
  });

  test("recurUntilYear stops the repeats but keeps earlier ones", () => {
    const car = [at(2030, 40_000, { recurEveryYears: 7, recurUntilYear: 2045 })];
    expect(computeCashFlowEvents(car, 2037, 2.5, BASE).total).toBe(40_000);
    expect(computeCashFlowEvents(car, 2044, 2.5, BASE).total).toBe(40_000);
    expect(computeCashFlowEvents(car, 2051, 2.5, BASE).total).toBe(0); // past the cutoff
  });

  test("a recurUntilYear that lands off-cycle still bounds the series", () => {
    const e = [at(2030, 1_000, { recurEveryYears: 10, recurUntilYear: 2039 })];
    expect(computeCashFlowEvents(e, 2030, 2.5, BASE).total).toBe(1_000);
    expect(computeCashFlowEvents(e, 2040, 2.5, BASE).total).toBe(0);
  });

  test("annual recurrence is expressible (every 1 year)", () => {
    const travel = [at(2028, 30_000, { recurEveryYears: 1, recurUntilYear: 2038 })];
    expect(computeCashFlowEvents(travel, 2028, 2.5, BASE).total).toBe(30_000);
    expect(computeCashFlowEvents(travel, 2033, 2.5, BASE).total).toBe(30_000);
    expect(computeCashFlowEvents(travel, 2038, 2.5, BASE).total).toBe(30_000);
    expect(computeCashFlowEvents(travel, 2039, 2.5, BASE).total).toBe(0);
  });

  test("several events in the same year sum", () => {
    const r = computeCashFlowEvents([at(2032, 60_000), at(2032, 25_000)], 2032, 2.5, BASE);
    expect(r.total).toBe(85_000);
    expect(r.hits).toHaveLength(2);
  });

  test("zero-amount and malformed events are ignored", () => {
    const r = computeCashFlowEvents(
      [at(2032, 0), { id: "x", label: "bad", year: "nope", amount: 100 }],
      2032, 2.5, BASE
    );
    expect(r.total).toBe(0);
  });
});

describe("computeCashFlowEvents — inflation", () => {
  test("inflates from today's dollars by default", () => {
    // $10k in today's money, spent 10 years out at 2.5%.
    const r = computeCashFlowEvents([{ id: "1", label: "Roof", year: BASE + 10, amount: 10_000 }], BASE + 10, 2.5, BASE);
    expect(r.total).toBeCloseTo(10_000 * Math.pow(1.025, 10), 2);
  });

  test("inflate:false treats the amount as already nominal", () => {
    const r = computeCashFlowEvents([at(BASE + 10, 10_000)], BASE + 10, 2.5, BASE);
    expect(r.total).toBe(10_000);
  });

  test("an event in the base year is never inflated", () => {
    const r = computeCashFlowEvents([{ id: "1", label: "Now", year: BASE, amount: 5_000 }], BASE, 2.5, BASE);
    expect(r.total).toBeCloseTo(5_000, 6);
  });
});

describe("computeCashFlowEvents — committed vs deferrable", () => {
  test("events are committed by default (guardrails may not cut them)", () => {
    const r = computeCashFlowEvents([at(2032, 25_000)], 2032, 2.5, BASE);
    expect(r.committed).toBe(25_000);
    expect(r.deferrable).toBe(0);
  });

  test("deferrable events are split out so guardrails can trim them", () => {
    const r = computeCashFlowEvents(
      [at(2032, 25_000, { deferrable: true }), at(2032, 40_000)],
      2032, 2.5, BASE
    );
    expect(r.deferrable).toBe(25_000);
    expect(r.committed).toBe(40_000);
    expect(r.total).toBe(65_000);
  });
});

describe("buildWithdrawalWaterfall — events reach the plan", () => {
  const PROFILE = {
    currentAge: 60, retireAge: 60, endAge: 90,
    sp: 70_000, ssAge: 67, ssb: 30_000, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
    accounts: [
      { id: "1", category: "pretax",  name: "IRA",   balance: 1_200_000 },
      { id: "2", category: "taxable", name: "Brk",   balance: 400_000 },
      { id: "3", category: "cash",    name: "Cash",  balance: 150_000 },
    ],
  };

  test("a one-off shows up as extra spending in exactly its year", () => {
    const spikeYear = new Date().getFullYear() + 5;
    const withEvent = buildWithdrawalWaterfall({
      ...PROFILE,
      cashFlowEvents: [{ id: "car", label: "Car", year: spikeYear, amount: 60_000, inflate: false }],
    });
    const base = buildWithdrawalWaterfall(PROFILE);

    const spikeRow = withEvent.smart.rows.find(r => r.yr === spikeYear);
    const baseRow  = base.smart.rows.find(r => r.yr === spikeYear);
    expect(spikeRow.eventCost).toBe(60_000);
    expect(spikeRow.totalWithdrawal).toBeGreaterThan(baseRow.totalWithdrawal);

    // The charge does not repeat the following year.
    const after     = withEvent.smart.rows.find(r => r.yr === spikeYear + 1);
    const afterBase = base.smart.rows.find(r => r.yr === spikeYear + 1);
    expect(after.eventCost).toBe(0);
    // The two plans still diverge after the spike, and should — $60k left the
    // portfolio, so later balances, guardrail-adjusted spending and taxes all
    // shift. What matters is that the divergence is a knock-on effect and not
    // the event being charged a second time.
    const carryOver = Math.abs(after.totalWithdrawal - afterBase.totalWithdrawal);
    expect(carryOver).toBeLessThan(60_000 / 2);
  });

  test("no events leaves the plan identical to before the feature", () => {
    const a = buildWithdrawalWaterfall(PROFILE);
    const b = buildWithdrawalWaterfall({ ...PROFILE, cashFlowEvents: [] });
    expect(a.summary).toEqual(b.summary);
  });

  test("a recurring event costs more over a lifetime than a single one", () => {
    const y0 = new Date().getFullYear() + 3;
    const once = buildWithdrawalWaterfall({
      ...PROFILE, cashFlowEvents: [{ id: "c", label: "Car", year: y0, amount: 40_000 }],
    });
    const every7 = buildWithdrawalWaterfall({
      ...PROFILE, cashFlowEvents: [{ id: "c", label: "Car", year: y0, amount: 40_000, recurEveryYears: 7 }],
    });
    const sum = (r) => r.smart.rows.reduce((s, x) => s + (x.eventCost || 0), 0);
    expect(sum(every7)).toBeGreaterThan(sum(once));
  });
});

/**
 * INFLOWS — lump-sum pension, cash-balance rollover, inheritance, home sale.
 *
 * These must be DEPOSITED into an account, not netted against spending. Netting
 * is what the old `otherIncomes` workaround did, and because need is computed as
 * Math.max(0, sp - income), a $500k inflow against an $80k gap silently lost
 * $420k. Boldin's "Deposit into" field models the same idea.
 */
describe("computeCashFlowEvents — inflows", () => {
  test("an inflow is reported separately from expenses, not as a cost", () => {
    const r = computeCashFlowEvents(
      [{ id: "i", label: "Inheritance", year: 2032, amount: 500_000, direction: "in", bucket: "taxable", inflate: false }],
      2032, 2.5, BASE
    );
    expect(r.inflow).toBe(500_000);
    expect(r.total).toBe(0);         // not an expense
    expect(r.committed).toBe(0);
  });

  test("routes to the named bucket", () => {
    const r = computeCashFlowEvents(
      [{ id: "cb", label: "Cash balance", year: 2032, amount: 400_000, direction: "in", bucket: "pretax", inflate: false }],
      2032, 2.5, BASE
    );
    expect(r.byBucket.pretax).toBe(400_000);
    expect(r.byBucket.taxable).toBeUndefined();
  });

  test("defaults to the taxable bucket when none is given", () => {
    const r = computeCashFlowEvents(
      [{ id: "x", year: 2032, amount: 1_000, direction: "in", inflate: false }], 2032, 2.5, BASE
    );
    expect(r.byBucket.taxable).toBe(1_000);
  });

  test("only taxable inflows count as ordinary income", () => {
    const rollover = computeCashFlowEvents(
      [{ id: "r", year: 2032, amount: 400_000, direction: "in", bucket: "pretax", taxable: false, inflate: false }], 2032, 2.5, BASE);
    const cashOut = computeCashFlowEvents(
      [{ id: "c", year: 2032, amount: 400_000, direction: "in", bucket: "cash", taxable: true, inflate: false }], 2032, 2.5, BASE);
    expect(rollover.inflowTaxable).toBe(0);
    expect(cashOut.inflowTaxable).toBe(400_000);
  });

  test("inflows and outflows in the same year stay separate", () => {
    const r = computeCashFlowEvents([
      { id: "a", year: 2032, amount: 500_000, direction: "in", bucket: "taxable", inflate: false },
      { id: "b", year: 2032, amount: 60_000, inflate: false },
    ], 2032, 2.5, BASE);
    expect(r.inflow).toBe(500_000);
    expect(r.total).toBe(60_000);
  });

  test("inflows respect recurrence and timing like any other event", () => {
    const e = [{ id: "s", year: 2030, amount: 10_000, direction: "in", recurEveryYears: 5, recurUntilYear: 2040, inflate: false }];
    expect(computeCashFlowEvents(e, 2029, 2.5, BASE).inflow).toBe(0);
    expect(computeCashFlowEvents(e, 2035, 2.5, BASE).inflow).toBe(10_000);
    expect(computeCashFlowEvents(e, 2045, 2.5, BASE).inflow).toBe(0);
  });
});

describe("buildWithdrawalWaterfall — inflows are deposited and compound", () => {
  const P = {
    currentAge: 65, retireAge: 65, endAge: 90,
    sp: 80_000, ssAge: 67, ssb: 36_000, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
    accounts: [
      { id: "1", category: "pretax", name: "IRA",  balance: 800_000 },
      { id: "2", category: "cash",   name: "Cash", balance: 100_000 },
    ],
  };
  const yr = new Date().getFullYear() + 5;
  const lump = (over) => ({
    id: "lp", source: "pension", label: "Lump", year: yr, amount: 400_000,
    direction: "in", inflate: false, ...over,
  });

  test("a lump sum raises the ending balance", () => {
    const base = buildWithdrawalWaterfall(P);
    const with_ = buildWithdrawalWaterfall({ ...P, cashFlowEvents: [lump({ bucket: "pretax", taxable: false })] });
    expect(with_.smart.rows.at(-1).totalPort).toBeGreaterThan(base.smart.rows.at(-1).totalPort);
  });

  test("the deposit is reported in the year it arrives, and only that year", () => {
    const r = buildWithdrawalWaterfall({ ...P, cashFlowEvents: [lump({ bucket: "pretax", taxable: false })] });
    expect(r.smart.rows.find(x => x.yr === yr).eventInflow).toBe(400_000);
    expect(r.smart.rows.find(x => x.yr === yr + 1).eventInflow).toBe(0);
  });

  test("a surplus is NOT discarded — the whole amount survives, unlike other-income", () => {
    // The bug this feature exists to fix: an inflow far larger than one year's
    // spending gap used to vanish into Math.max(0, sp - income).
    const base  = buildWithdrawalWaterfall(P);
    const with_ = buildWithdrawalWaterfall({ ...P, cashFlowEvents: [lump({ bucket: "roth", taxable: false })] });
    const gain  = with_.smart.rows.at(-1).totalPort - base.smart.rows.at(-1).totalPort;
    // Deposited into Roth (never taxed, drawn last) it should still be largely
    // intact 20 years later — certainly far more than a single year's gap.
    expect(gain).toBeGreaterThan(300_000);
  });

  test("a taxable lump sum costs more tax than an identical rollover", () => {
    const rollover = buildWithdrawalWaterfall({ ...P, cashFlowEvents: [lump({ bucket: "pretax", taxable: false })] });
    const taken    = buildWithdrawalWaterfall({ ...P, cashFlowEvents: [lump({ bucket: "cash",   taxable: true  })] });
    const taxIn = (r) => r.smart.rows.find(x => x.yr === yr).totalTax;
    expect(taxIn(taken)).toBeGreaterThan(taxIn(rollover));
  });
});
