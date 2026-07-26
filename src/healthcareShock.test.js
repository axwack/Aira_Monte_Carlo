/**
 * Healthcare shocks.
 *
 * Like the spending smile, this shipped as four profile fields, four Advanced
 * inputs, `params` plumbing, and UI copy asserting it as fact ("Healthcare
 * shocks hit 3.5% of years after age 72") while NO engine consumed it. There
 * were no shocks in any simulation.
 *
 * Costs are entered in TODAY's dollars and inflated to the year they occur. That
 * is the whole point: a $100,000 shock at 90 is a 2050s expense quoted on a
 * 2020s number, and applying it flat understates it by roughly half across a
 * 25-year horizon.
 */

import { healthcareShockDraw, expectedHealthcareShock } from "./engine/expenses";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall";

const DEFAULTS = { hcShockAge: 72, hcProb: 3.5, hcMin: 70_000, hcMax: 130_000 };

describe("expectedHealthcareShock (deterministic)", () => {
  test("charges nothing before the shock start age", () => {
    expect(expectedHealthcareShock(71, DEFAULTS)).toBe(0);
    expect(expectedHealthcareShock(50, DEFAULTS)).toBe(0);
  });

  test("charges probability x mean cost from the start age", () => {
    // 3.5% x mean(70k,130k)=100k = $3,500/yr
    expect(expectedHealthcareShock(72, DEFAULTS)).toBeCloseTo(3_500, 6);
  });

  test("TRACKS INFLATION — the same expected cost is larger further out", () => {
    const today = expectedHealthcareShock(80, DEFAULTS, 1);
    const in15  = expectedHealthcareShock(80, DEFAULTS, Math.pow(1.025, 15));
    expect(in15).toBeGreaterThan(today);
    expect(in15).toBeCloseTo(3_500 * Math.pow(1.025, 15), 4);
  });

  test("a 25-year horizon nearly doubles the nominal cost", () => {
    const ratio = expectedHealthcareShock(90, DEFAULTS, Math.pow(1.025, 25))
                / expectedHealthcareShock(90, DEFAULTS, 1);
    expect(ratio).toBeGreaterThan(1.8);
  });

  test("zero probability disables it entirely", () => {
    expect(expectedHealthcareShock(90, { ...DEFAULTS, hcProb: 0 })).toBe(0);
  });

  test("scales with probability and with the cost range", () => {
    expect(expectedHealthcareShock(80, { ...DEFAULTS, hcProb: 7 }))
      .toBeCloseTo(2 * expectedHealthcareShock(80, DEFAULTS), 6);
    expect(expectedHealthcareShock(80, { ...DEFAULTS, hcMin: 140_000, hcMax: 260_000 }))
      .toBeCloseTo(2 * expectedHealthcareShock(80, DEFAULTS), 6);
  });

  test("an inverted range is tolerated rather than producing a negative cost", () => {
    expect(expectedHealthcareShock(80, { ...DEFAULTS, hcMin: 130_000, hcMax: 70_000 }))
      .toBeGreaterThan(0);
  });

  test("falls back to documented defaults when fields are absent", () => {
    expect(expectedHealthcareShock(72, {})).toBeCloseTo(3_500, 6);
  });
});

describe("healthcareShockDraw (stochastic)", () => {
  const always = () => 0;      // rand() = 0 ⇒ always under the probability
  const never  = () => 0.999;  // rand() = 0.999 ⇒ never fires at 3.5%

  test("never fires before the start age", () => {
    expect(healthcareShockDraw(71, always, DEFAULTS)).toBe(0);
  });

  test("fires when the draw lands under the probability", () => {
    expect(healthcareShockDraw(75, always, DEFAULTS)).toBeGreaterThan(0);
  });

  test("does not fire when the draw is above the probability", () => {
    expect(healthcareShockDraw(75, never, DEFAULTS)).toBe(0);
  });

  test("cost lands inside the configured range", () => {
    let seq = [0, 0.5];  // fire, then pick the midpoint of the range
    const rand = () => seq.shift();
    expect(healthcareShockDraw(75, rand, DEFAULTS)).toBeCloseTo(100_000, 6);
  });

  test("the drawn cost is inflated to the year it occurs", () => {
    const mk = () => { let seq = [0, 0.5]; return () => seq.shift(); };
    const today = healthcareShockDraw(90, mk(), DEFAULTS, 1);
    const in25  = healthcareShockDraw(90, mk(), DEFAULTS, Math.pow(1.025, 25));
    expect(in25).toBeCloseTo(today * Math.pow(1.025, 25), 4);
  });
});

describe("healthcare shocks reach the plan (regression: they were inert)", () => {
  const P = {
    currentAge: 65, retireAge: 65, endAge: 95,
    sp: 80_000, ssAge: 67, ssb: 36_000, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
    accounts: [
      { id: "1", category: "pretax", name: "IRA",  balance: 900_000 },
      { id: "2", category: "cash",   name: "Cash", balance: 100_000 },
    ],
  };

  test("enabling shocks lowers the ending balance", () => {
    const off = buildWithdrawalWaterfall({ ...P, hcProb: 0 });
    const on  = buildWithdrawalWaterfall(P);
    expect(on.smart.rows.at(-1).totalPort).toBeLessThan(off.smart.rows.at(-1).totalPort);
  });

  test("the cost appears only from the start age onward", () => {
    const r = buildWithdrawalWaterfall(P);
    expect(r.smart.rows.find(x => x.age === 71).healthcareCost).toBe(0);
    expect(r.smart.rows.find(x => x.age === 72).healthcareCost).toBeGreaterThan(0);
  });

  test("the charged cost grows over time — inflation is applied in the plan", () => {
    const r = buildWithdrawalWaterfall(P);
    const at72 = r.smart.rows.find(x => x.age === 72).healthcareCost;
    const at90 = r.smart.rows.find(x => x.age === 90).healthcareCost;
    expect(at90).toBeGreaterThan(at72);
  });

  test("a higher shock probability costs more", () => {
    const low  = buildWithdrawalWaterfall({ ...P, hcProb: 1 });
    const high = buildWithdrawalWaterfall({ ...P, hcProb: 10 });
    expect(high.smart.rows.at(-1).totalPort).toBeLessThan(low.smart.rows.at(-1).totalPort);
  });
});
