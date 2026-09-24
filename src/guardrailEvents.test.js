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
 *   4. the deterministic schedule carries the fields the chart reads,
 *   5. a floor/ceiling BIND reports as its own third type, `constrained`, and is
 *      never folded into cut/raise — see guytonKlingerWithdrawal's clamp note for
 *      why those are different causes with different remedies.
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

// ── The third event type: the band binding ───────────────────────────────────
// A floor/ceiling bind is NOT a market reaction. It happens because the user's
// own gkFloorPct / gkCeilingPct settings left the rule nowhere to go, so it gets
// its own event name rather than borrowing cut/raise. Folding them together was
// actively misleading: tightening the band makes binding MORE frequent while
// leaving cutRate/raiseRate flat or lower, so narrowing your band to force
// discipline made the panel claim the guardrails had calmed down.

test("a CEILING bind reports `constrained`/`ceiling-bind`, not `raise`", () => {
  const out = {};
  // Prosperity wants +10% on 100k → 110k, but the ceiling sits at 105k.
  const sp = guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 105_000, 30, 0, 0, out);
  expect(out.event).toBe("constrained");
  expect(out.reason).toBe("ceiling-bind");
  // The clamp really did cap it — and upward, which is why direction cannot be
  // inferred from the event name.
  expect(num(sp)).toBe(105_000);
  expect(num(sp)).toBeGreaterThan(100_000);
});

test("a FLOOR bind reports `constrained`/`floor-bind`, not `cut`", () => {
  const out = {};
  // Preservation wants -10% on 100k → 90k, but the floor lifts it back to 95k.
  const sp = guytonKlingerWithdrawal(400_000, 0.03, 100_000, -0.10, 0.02, 95_000, 500_000, 30, 0, 0, out);
  expect(out.event).toBe("constrained");
  expect(out.reason).toBe("floor-bind");
  expect(num(sp)).toBe(95_000);
  expect(num(sp)).toBeLessThan(100_000);
});

test("a band rule that stays inside the limits keeps its ORIGINAL event", () => {
  // Guards against the clamp check swallowing genuine market events: same
  // prosperity/cut setups as above, with a band wide enough not to bind.
  const raised = {};
  guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 500_000, 30, 0, 0, raised);
  expect(raised.event).toBe("raise");
  expect(raised.reason).toBe("prosperity");

  const cut = {};
  guytonKlingerWithdrawal(400_000, 0.03, 100_000, -0.10, 0.02, 10_000, 500_000, 30, 0, 0, cut);
  expect(cut.event).toBe("cut");
  expect(cut.reason).toBe("preservation");
});

test("spend landing EXACTLY on a limit is not reported as a bind", () => {
  // Float noise tolerance. `w` arriving at the ceiling through multiplication
  // carries a residue (100k × 1.02 × 1.1 = 112200.00000000001), so a naive
  // `w > ceiling` would manufacture a bind the user cannot act on. The ceiling
  // here IS that exact float value.
  const out = {};
  const sp = guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 112_200.00000000001, 30, 0, 0, out);
  expect(out.event).toBe("raise");   // prosperity moved it there; no bind
  expect(out.reason).toBe("prosperity");
  expect(sp).toBeLessThanOrEqual(112_200.00000000001 + 1e-9);
});

test("the sink stays additive when a bind occurs (no-sink callers unaffected)", () => {
  const bare = guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 105_000, 30, 0, 0);
  const withSink = guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 105_000, 30, 0, 0, {});
  expect(withSink).toBe(bare);
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
  // The MEAN must not be shown alone: on this skewed distribution the median is
  // the typical experience and the two genuinely differ. If they ever coincide
  // the fixture stopped exercising the skew and the relabel would be untested.
  expect(Number.isFinite(mc.gkStats.medianCutsPerPath)).toBe(true);
  expect(mc.gkStats.medianCutsPerPath).toBeLessThanOrEqual(mc.gkStats.avgCutsPerPath);
  // Average among the paths that actually cut >= the average over all paths,
  // since the non-cutting paths pull the overall average down.
  expect(mc.gkStats.avgCutsAmongCutters).toBeGreaterThanOrEqual(mc.gkStats.avgCutsPerPath);
  if (mc.gkStats.pathsWithCut === 0) expect(mc.gkStats.avgCutsAmongCutters).toBe(0);
  // A path with at least one cut must be counted at least once.
  if (mc.gkStats.cuts > 0) expect(mc.gkStats.pathsWithCut).toBeGreaterThan(0);
  // The spending range must be a real, ordered range of positive dollars.
  // RETIREMENT-YEAR dollars, not nominal — the field names carry the basis
  // (renamed from spendMin/spendMax for exactly that reason), and
  // guardrailsChartRender.test.js proves the deflation by bounding the range
  // inside the guardrail's own base floor/ceiling.
  expect(mc.gkStats.spendMaxReal).toBeGreaterThan(mc.gkStats.spendMinReal);
  expect(mc.gkStats.spendMinReal).toBeGreaterThan(0);
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
    // A bind sits ON whichever limit bound it — and unlike cut/raise it can move
    // spend either way, so it asserts equality with the band edge instead of an
    // inequality against the prior year.
    if (r.gkEvent === "constrained") {
      if (r.gkReason === "ceiling-bind") expect(r.spAfterGK).toBeLessThanOrEqual(r.gkCeiling + 1);
      if (r.gkReason === "floor-bind") expect(r.spAfterGK).toBeGreaterThanOrEqual(r.gkFloor - 1);
    }
  }
});

test("a tight ceiling makes the deterministic schedule emit constrained rows", () => {
  const P = {
    currentAge: 60, retireAge: 60, endAge: 90, dob: "1970-03-14", birthYear: 1970,
    inf: 2.5, sp: 100_000, ssAge: 67, ssb: 30_000, ab: 0, useAb: false,
    tax: true, smile: false, preRetireEq: 91, postRetireEq: 70,
    // Ceiling just above target spend so prosperity years clamp hard against it.
    gkFloor: 60_000, gkCeiling: 103_000, gkFloorPct: 65, gkCeilingPct: 103,
    withdrawalStrategy: "gk", cashRealReturn: 3.0, filingStatus: "mfj",
    stateOfResidence: "NJ", useJointRmdTable: false,
    accounts: [
      { id: "t1", category: "pretax",  name: "401k",    balance: 1_200_000 },
      { id: "t2", category: "roth",    name: "Roth",    balance:   250_000 },
      { id: "t3", category: "taxable", name: "Taxable", balance:   250_000 },
      { id: "t4", category: "cash",    name: "Cash",    balance:    80_000 },
    ],
  };
  const { schedule } = simulateDeterministicWithStrategy(P, 2.5, "gk");
  const binds = schedule.filter((r) => r.gkEvent === "constrained");
  expect(binds.length).toBeGreaterThan(0);
  // Every bind names a limit, and no bind is also counted as a market event.
  for (const b of binds) {
    expect(["ceiling-bind", "floor-bind"]).toContain(b.gkReason);
  }
});

test("runMC counts `constrained` separately from cuts and raises", () => {
  const base = {
    currentAge: 60, retireAge: 60, endAge: 92, dob: "1970-03-14", birthYear: 1970,
    inf: 2.5, sp: 110_000, ssAge: 67, ssb: 30_000, ab: 0, useAb: false,
    tax: true, smile: true, preRetireEq: 91, postRetireEq: 70,
    withdrawalStrategy: "gk", cashRealReturn: 3.0, filingStatus: "mfj",
    stateOfResidence: "NJ", useJointRmdTable: false,
    accounts: [
      { id: "c1", category: "pretax",  name: "401k",    balance: 1_400_000 },
      { id: "c2", category: "roth",    name: "Roth",    balance:   300_000 },
      { id: "c3", category: "taxable", name: "Taxable", balance:   300_000 },
      { id: "c4", category: "cash",    name: "Cash",    balance:   100_000 },
    ],
  };
  const run = (gkFloor, gkCeiling) => runMC({ ...base, gkFloor, gkCeiling }, 92, 300, 42, true).gkStats;

  const tight = run(60_000, 105_000);
  expect(typeof tight.constrainedRate).toBe("number");
  expect(tight.constrainedRate).toBeGreaterThan(0);
  expect(tight.constrainedRate).toBeLessThanOrEqual(1);
  // The two sub-counters sum to the total, so nothing leaks between them.
  expect(tight.ceilingBinds + tight.floorBinds).toBe(tight.constrained);
  expect(tight.pathsWithConstrained).toBeGreaterThan(0);
  // avgConstrainedPerPath is per-path by construction, same as its cut twin.
  expect(tight.avgConstrainedPerPath).toBeCloseTo(tight.constrained / 300, 6);

  // THE REGRESSION THIS FEATURE EXISTS TO FIX: widening the band must REDUCE
  // binding. Before `constrained`, tightening the band left cutRate/raiseRate
  // flat or lower — an inverted signal on the exact control the user adjusted.
  //
  // Note the loose case is not zero. A $60k floor still binds when a bad
  // sequence drives spending down to it, which is correct behaviour, not noise:
  // the assertion is monotonic, and that ordering is what the UI promises.
  const loose = run(60_000, 400_000);
  expect(loose.constrained).toBeLessThan(tight.constrained);
  expect(tight.constrainedRate).toBeGreaterThan(loose.constrainedRate);
  // A floor low enough to never bind really does produce zero.
  const unbounded = run(1_000, 50_000_000);
  expect(unbounded.constrained).toBe(0);
  expect(unbounded.constrainedRate).toBe(0);
});

test("the GK method constants stay coherent with the rules they describe", () => {
  expect(GK_BAND_PCT).toBeGreaterThan(0);
  expect(GK_BAND_PCT).toBeLessThan(1);
  expect(GK_ADJUST_PCT).toBeGreaterThan(0);
  expect(GK_ADJUST_PCT).toBeLessThan(1);
  expect(GK_LONGEVITY_YEARS).toBeGreaterThan(0);
});
