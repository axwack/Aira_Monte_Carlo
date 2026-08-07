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
import { buildWithdrawalWaterfall, accumulateToRetirement } from "./engine/buildWithdrawalWaterfall";
import { runMC, simulateDeterministicWithStrategy } from "./App";

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

/**
 * REGRESSION — a lump sum arriving BEFORE retirement (user report, 2026-08-01).
 *
 * Every engine processed cashFlowEvents only inside its retirement loop, so an
 * inflow dated during the accumulation years — the reported case was a future
 * inheritance — was silently dropped from every projection: a $1M test entry
 * changed nothing anywhere. (The tests above never caught it because they all
 * use currentAge === retireAge, i.e. zero accumulation years.) These pin the
 * fix: an accumulation-phase inflow is deposited into its bucket in the year
 * it arrives and compounds to retirement, in all three engines.
 */
describe("inflows BEFORE retirement are deposited during accumulation", () => {
  const P = {
    currentAge: 55, retireAge: 65, endAge: 90,
    sp: 80_000, ssAge: 67, ssb: 36_000, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
    port: 900_000,
    accounts: [
      { id: "1", category: "pretax", name: "IRA",  balance: 800_000 },
      { id: "2", category: "cash",   name: "Cash", balance: 100_000 },
    ],
  };
  const inheritYr = new Date().getFullYear() + 5; // mid-accumulation, 5 of 10 years in
  const inherit = (over = {}) => ({
    id: "w", source: "windfall", label: "Inheritance", year: inheritYr,
    amount: 1_000_000, direction: "in", bucket: "taxable", taxable: false,
    inflate: false, ...over,
  });

  test("accumulateToRetirement deposits it into the named bucket, as basis", () => {
    const base  = accumulateToRetirement(P);
    const with_ = accumulateToRetirement({ ...P, cashFlowEvents: [inherit()] });
    // Deposited in year +5 (after that year's growth, like a contribution),
    // then grown at the pinned 5% for the remaining 4 accumulation years.
    expect(with_.taxable0 - base.taxable0).toBeCloseTo(1_000_000 * 1.05 ** 4, 0);
    // Inherited money arrives as basis (stepped-up); only later growth is gain.
    expect(with_.taxableBasis0 - base.taxableBasis0).toBe(1_000_000);
    expect(with_.pretax0).toBeCloseTo(base.pretax0, 6);
  });

  test("bucket routing holds during accumulation too", () => {
    const r = accumulateToRetirement({ ...P, cashFlowEvents: [inherit({ bucket: "roth" })] });
    const base = accumulateToRetirement(P);
    expect(r.roth0).toBeGreaterThan(base.roth0);
    expect(r.taxable0).toBeCloseTo(base.taxable0, 6);
  });

  test("buildWithdrawalWaterfall: the whole retirement plan sees the money", () => {
    const base  = buildWithdrawalWaterfall(P);
    const with_ = buildWithdrawalWaterfall({ ...P, cashFlowEvents: [inherit()] });
    // Bigger portfolio from the first retirement year through the last.
    expect(with_.smart.rows[0].totalPort).toBeGreaterThan(base.smart.rows[0].totalPort + 1_000_000);
    expect(with_.smart.rows.at(-1).totalPort).toBeGreaterThan(base.smart.rows.at(-1).totalPort);
    // And it is NOT double-counted as a retirement-year deposit.
    for (const row of with_.smart.rows) expect(row.eventInflow || 0).toBe(0);
  });

  test("the deterministic schedule's portfolio-at-retirement includes it", () => {
    const base  = simulateDeterministicWithStrategy(P, 2.5, "gk");
    const with_ = simulateDeterministicWithStrategy({ ...P, cashFlowEvents: [inherit()] }, 2.5, "gk");
    expect(with_.portAtRetire).toBeGreaterThan(base.portAtRetire + 1_000_000);
  });

  test("the Monte Carlo moves too — this is the number the user watched", () => {
    // Same seed ⇒ identical return draws (computeCashFlowEvents consumes no
    // rand()), so each path's portfolio-at-retirement shifts by the deposit
    // grown over its own final 4 accumulation years.
    const base  = runMC(P, 90, 400, 42, true);
    const with_ = runMC({ ...P, cashFlowEvents: [inherit()] }, 90, 400, 42, true);
    expect(with_.medR).toBeGreaterThan(base.medR + 500_000);
    expect(with_.rate).toBeGreaterThanOrEqual(base.rate);
  });

  test("an outflow before retirement is still ignored (paid from wages, not the portfolio)", () => {
    const base  = accumulateToRetirement(P);
    const with_ = accumulateToRetirement({
      ...P,
      cashFlowEvents: [{ id: "x", label: "Wedding", year: inheritYr, amount: 50_000, inflate: false }],
    });
    expect(with_.total).toBeCloseTo(base.total, 6);
  });
});

/**
 * The three engines above all got this right — and the user still saw the bug,
 * because the two CHARTS that draw the accumulation years run their own
 * projection loops and neither called computeCashFlowEvents. They grew the
 * portfolio on contributions alone to retireAge, then handed over to the Monte
 * Carlo median, which HAD counted the windfall. So the money appeared as a step
 * on the retirement year no matter which earlier year was entered: "if I choose a
 * lump sum windfall for 2027 but retire in 2030, it is calculated to occur in
 * 2030."
 *
 * Source-parsed rather than rendered because both loops are inline useMemos with
 * no exported seam. That is the weaker kind of test — it proves the call is
 * present, not that the arithmetic is right (see the engine tests above for
 * that) — but the defect being guarded is precisely an OMITTED call, and the
 * engine suite passing while the charts lied is what proved a comment would not
 * hold this line.
 */
describe("the accumulation-phase CHART projections also apply one-off inflows", () => {
  const fs   = require("fs");
  const path = require("path");
  const SRC  = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

  /** Source between two anchors, so the assertion is scoped to one loop. */
  const between = (startAnchor, endAnchor) => {
    const i = SRC.indexOf(startAnchor);
    expect(i).toBeGreaterThan(-1);            // anchor drifted → fix the anchor
    const j = SRC.indexOf(endAnchor, i);
    expect(j).toBeGreaterThan(i);
    return SRC.slice(i, j);
  };

  test("FanChart's pre-retirement line deposits inflows in the year they arrive", () => {
    const body = between("// Deterministic accumulation path", "return pts;");
    expect(body).toContain("computeCashFlowEvents");
    // Must use the engines' year mapping (accumulation year y = CURRENT_YEAR + y),
    // not an age, or the deposit lands in the wrong calendar year.
    expect(body).toContain("CURRENT_YEAR");
  });

  test("the Net Worth chart's accumulation branch deposits them too", () => {
    const body = between("// Accumulation phase: grow from current portfolio", "port = Number.isFinite(acc)");
    expect(body).toContain("computeCashFlowEvents");
    expect(body).toContain("CURRENT_YEAR");
  });

  /* The Income chart is the surface a user goes to for "where does my money come
   * from", and it was the only one that dropped a one-off inflow: the engine row
   * carries `eventInflow` (buildWithdrawalWaterfall.js) and the Withdrawal Plan
   * table already marks it (+💰), but INCOME_CATS had no band for it, so a
   * retirement-year inheritance appeared nowhere in the stack or its side panel. */
  test("the Income chart has a band for one-off inflows, wired to r.eventInflow", () => {
    const cats = between("const INCOME_CATS = [", "];");
    expect(cats).toContain("One-Off Income");
    // The stack, its side-panel rows and its Total all derive from the same
    // categories list, so the band only counts if the data map supplies the key.
    expect(SRC).toContain('"One-Off Income": r.eventInflow');
  });

  /* The year-by-year table showed a bare "+💰" beside a "—", putting the only
   * statement of the amount in a `title=` — dead on touch, and the standard this
   * project already rejected. The row read as a year with no money in it while
   * the balance beside it jumped. */
  test("the year-by-year row states the inflow AMOUNT on screen, not only on hover", () => {
    const cell = between("{r.eventInflow > 0 && (", "</td>");
    expect(cell).toContain("fmtDollar(r.eventInflow)");
    // Specifically OUTSIDE the title attribute: strip every title={...} and the
    // amount must still be there, or we are back to hover-only disclosure.
    const visible = cell.replace(/title=\{[\s\S]*?\}\>/g, ">");
    expect(visible).toContain("fmtDollar(r.eventInflow)");
  });

  test("both take .inflow only — a pre-retirement COST must not hit these curves", () => {
    // The engines treat pre-retirement outflows as paid from wages. If a chart
    // started subtracting `.total`, it would contradict every engine.
    for (const anchor of [
      ["// Deterministic accumulation path", "return pts;"],
      ["// Accumulation phase: grow from current portfolio", "port = Number.isFinite(acc)"],
    ]) {
      const body = between(anchor[0], anchor[1]);
      expect(body).toMatch(/computeCashFlowEvents\([^;]*\)\s*\.inflow|\)\.inflow/s);
      expect(body).not.toMatch(/\)\.total\b/);
    }
  });
});
