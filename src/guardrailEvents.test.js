/**
 * Guardrail event emission — the data behind the Guardrails chart.
 *
 * WHY THIS FILE EXISTS
 * The Guardrails view draws cuts and raises as markers on the spending path. A
 * marker is only allowed to appear where the ENGINE actually adjusted spending,
 * so the engine has to say so. Before this, `guytonKlingerWithdrawal` applied
 * the rule and returned a bare dollar figure, discarding the fact — which meant
 * any chart of "adjustment events" would have had to re-implement the bands,
 * the longevity clause and the income offset in the UI. Those two copies would
 * then drift, and the chart would confidently mark raises the plan never got.
 *
 * So the contract tested here is:
 *   1. the new `out` sink reports cut / raise / longevity-hold correctly,
 *   2. callers that pass no sink are completely unaffected (numeric return),
 *   3. runMC's aggregate counts agree with the per-year events it recorded,
 *   4. the deterministic schedule carries the fields the chart reads.
 */

import { guytonKlingerWithdrawal, runMC, simulateDeterministicWithStrategy, GK_BAND_PCT, GK_ADJUST_PCT, GK_LONGEVITY_YEARS } from "./App";

const num = (v) => Math.round(v);

test("the sink reports a RAISE when the withdrawal rate falls below the band", () => {
  const out = {};
  // Portfolio huge relative to the draw → currentWR far under initialWR.
  const sp = guytonKlingerWithdrawal(4_000_000, 0.05, 50_000, 0.06, 0.02, 30_000, 200_000, 30, 0, 0, out);
  expect(out.event).toBe("raise");
  expect(out.reason).toBe("prosperity");
  expect(out.currentWR).not.toBeNull();
  expect(num(sp)).toBeGreaterThan(50_000); // it really did rise
});

test("the sink reports a CUT when the rate rises above the band, well before the horizon ends", () => {
  const out = {};
  // Small portfolio, big draw → currentWR well above initialWR.
  const sp = guytonKlingerWithdrawal(400_000, 0.03, 90_000, 0.00, 0.02, 10_000, 500_000, 30, 0, 0, out);
  expect(out.event).toBe("cut");
  expect(out.reason).toBe("preservation");
  expect(num(sp)).toBeLessThan(90_000);
});

test("the longevity rule blocks the cut and says so, rather than looking like no-op", () => {
  const out = {};
  // Same over-band situation, but inside the final GK_LONGEVITY_YEARS.
  const sp = guytonKlingerWithdrawal(400_000, 0.03, 90_000, 0.00, 0.02, 10_000, 500_000, GK_LONGEVITY_YEARS, 0, 0, out);
  expect(out.event).toBeNull();
  expect(out.reason).toBe("longevity-hold");
  // NOT untouched: GK rule 4 still passes inflation through after a
  // non-negative year (lastReturn 0.00 counts as non-negative), so 90,000
  // becomes 91,800. The thing being blocked is the CUT, not the CPI step —
  // conflating those is exactly the misreading this assertion pins down.
  expect(num(sp)).toBe(91_800);
  expect(num(sp)).toBeGreaterThan(90_000);
});

test("a raise is NOT blocked by the longevity rule (only the cut is)", () => {
  const out = {};
  guytonKlingerWithdrawal(4_000_000, 0.05, 50_000, 0.06, 0.02, 30_000, 200_000, 3, 0, 0, out);
  expect(out.event).toBe("raise");
});

test("an ordinary year reports no event", () => {
  const out = {};
  guytonKlingerWithdrawal(1_000_000, 0.04, 40_000, 0.02, 0.02, 20_000, 90_000, 30, 0, 0, out);
  expect(out.event).toBeNull();
  expect(out.reason).toBeNull();
});

test("PASSING NO SINK RETURNS THE SAME NUMBER AS BEFORE (backward compatibility)", () => {
  // The whole existing engine and test suite calls this without a sink, so the
  // sink must be strictly additive. Compare a with-sink call against the bare
  // call across the three event types.
  const cases = [
    [4_000_000, 0.05, 50_000, 0.06, 0.02, 30_000, 200_000, 30],
    [400_000, 0.03, 90_000, 0.00, 0.02, 10_000, 500_000, 30],
    [1_000_000, 0.04, 40_000, 0.02, 0.02, 20_000, 90_000, 30],
    [400_000, 0.03, 90_000, 0.00, 0.02, 10_000, 500_000, GK_LONGEVITY_YEARS],
  ];
  for (const c of cases) {
    const bare = guytonKlingerWithdrawal(...c);
    const withSink = guytonKlingerWithdrawal(...c, {});
    expect(withSink).toBe(bare);
  }
});

test("runMC reports guardrail statistics that agree with its own path counts", () => {
  const P = {
    currentAge: 60, retireAge: 60, endAge: 92, dob: "1970-03-14", birthYear: 1970,
    inf: 2.5, sp: 110_000, ssAge: 67, ssb: 30_000, ab: 0, useAb: false,
    tax: true, smile: true, preRetireEq: 91, postRetireEq: 70,
    gkFloor: 60_000, gkCeiling: 160_000,
    gkFloorPct: 65, gkCeilingPct: 135,
    withdrawalStrategy: "gk", cashRealReturn: 3.0, filingStatus: "mfj",
    stateOfResidence: "NJ", useJointRmdTable: false,
    accounts: [
      { id: "g1", category: "pretax",  name: "401k",    balance: 1_400_000 },
      { id: "g2", category: "roth",    name: "Roth",    balance:   300_000 },
      { id: "g3", category: "taxable", name: "Taxable", balance:   300_000 },
      { id: "g4", category: "cash",    name: "Cash",    balance:   100_000 },
    ],
  };
  const mc = runMC(P, 92, 500, 42, true);
  expect(mc.gkStats).toBeTruthy();
  expect(mc.gkStats.paths).toBe(500);
  // Rates are shares of paths, so they must be probabilities.
  expect(mc.gkStats.cutRate).toBeGreaterThanOrEqual(0);
  expect(mc.gkStats.cutRate).toBeLessThanOrEqual(1);
  expect(mc.gkStats.raiseRate).toBeGreaterThanOrEqual(0);
  expect(mc.gkStats.raiseRate).toBeLessThanOrEqual(1);
  // avgCutsPerPath === total cuts / paths, by construction.
  expect(mc.gkStats.avgCutsPerPath).toBeCloseTo(mc.gkStats.cuts / 500, 6);
  // A path with at least one cut must be counted at least once.
  if (mc.gkStats.cuts > 0) expect(mc.gkStats.pathsWithCut).toBeGreaterThan(0);
  // The spending range must be a real, ordered range of positive dollars.
  expect(mc.gkStats.spendMax).toBeGreaterThan(mc.gkStats.spendMin);
  expect(mc.gkStats.spendMin).toBeGreaterThan(0);
});

test("the deterministic schedule carries the fields the guardrails chart reads", () => {
  const P = {
    currentAge: 60, retireAge: 60, endAge: 90, dob: "1970-03-14", birthYear: 1970,
    inf: 2.5, sp: 100_000, ssAge: 67, ssb: 30_000, ab: 0, useAb: false,
    tax: true, smile: false, preRetireEq: 91, postRetireEq: 70,
    gkFloor: 60_000, gkCeiling: 160_000, gkFloorPct: 65, gkCeilingPct: 135,
    withdrawalStrategy: "gk", cashRealReturn: 3.0, filingStatus: "mfj",
    stateOfResidence: "NJ", useJointRmdTable: false,
    accounts: [
      { id: "g1", category: "pretax",  name: "401k",    balance: 1_200_000 },
      { id: "g2", category: "roth",    name: "Roth",    balance:   250_000 },
      { id: "g3", category: "taxable", name: "Taxable", balance:   250_000 },
      { id: "g4", category: "cash",    name: "Cash",    balance:    80_000 },
    ],
  };
  const { schedule } = simulateDeterministicWithStrategy(P, 2.5, "gk");
  expect(schedule.length).toBeGreaterThan(10);
  const first = schedule[0];
  for (const f of ["spEntering", "spAfterGK", "gkFloor", "gkCeiling", "gkEvent", "gkReason", "gkWR"]) {
    expect(Object.prototype.hasOwnProperty.call(first, f)).toBe(true);
  }
  // The first year takes the target spend with no guardrail move.
  expect(first.gkEvent).toBeNull();
  // Every subsequent GK year must land inside its own band, because the engine
  // clamps there — this is the invariant the chart's floor/ceiling lines claim.
  for (const r of schedule.slice(1)) {
    expect(r.spAfterGK).toBeGreaterThanOrEqual(r.gkFloor - 1);
    expect(r.spAfterGK).toBeLessThanOrEqual(r.gkCeiling + 1);
  }
  // And any flagged event must actually have moved the spend in that direction.
  for (const r of schedule) {
    if (r.gkEvent === "cut") expect(r.spAfterGK).toBeLessThanOrEqual(r.spEntering + 1);
    if (r.gkEvent === "raise") expect(r.spAfterGK).toBeGreaterThanOrEqual(r.spEntering - 1);
  }
});

test("the GK method constants stay coherent with the rules they describe", () => {
  expect(GK_BAND_PCT).toBeGreaterThan(0);
  expect(GK_BAND_PCT).toBeLessThan(1);
  expect(GK_ADJUST_PCT).toBeGreaterThan(0);
  expect(GK_ADJUST_PCT).toBeLessThan(1);
  expect(GK_LONGEVITY_YEARS).toBeGreaterThan(0);
});
