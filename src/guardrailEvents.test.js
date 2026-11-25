import { guytonKlingerWithdrawal, runMC, simulateDeterministicWithStrategy, GK_BAND_PCT, GK_ADJUST_PCT, GK_LONGEVITY_YEARS } from "./App";

const num = (v) => Math.round(v);

test("the sink reports a RAISE when the withdrawal rate falls below the band", () => {
  const out = {};
  const sp = guytonKlingerWithdrawal(4_000_000, 0.05, 50_000, 0.06, 0.02, 30_000, 200_000, 30, 0, 0, out);
  expect(out.event).toBe("raise");
  expect(out.reason).toBe("prosperity");
  expect(out.currentWR).not.toBeNull();
  expect(num(sp)).toBeGreaterThan(50_000);
});

test("the sink reports a CUT when the rate rises above the band, well before the horizon ends", () => {
  const out = {};
  const sp = guytonKlingerWithdrawal(400_000, 0.03, 90_000, 0.00, 0.02, 10_000, 500_000, 30, 0, 0, out);
  expect(out.event).toBe("cut");
  expect(out.reason).toBe("preservation");
  expect(num(sp)).toBeLessThan(90_000);
});

test("the longevity rule blocks the cut and says so, rather than looking like no-op", () => {
  const out = {};
  const sp = guytonKlingerWithdrawal(400_000, 0.03, 90_000, 0.00, 0.02, 10_000, 500_000, GK_LONGEVITY_YEARS, 0, 0, out);
  expect(out.event).toBeNull();
  expect(out.reason).toBe("longevity-hold");
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

test("a CEILING bind reports `constrained`/`ceiling-bind`, not `raise`", () => {
  const out = {};
  const sp = guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 105_000, 30, 0, 0, out);
  expect(out.event).toBe("constrained");
  expect(out.reason).toBe("ceiling-bind");
  expect(num(sp)).toBe(105_000);
  expect(num(sp)).toBeGreaterThan(100_000);
});

test("a FLOOR bind reports `constrained`/`floor-bind`, not `cut`", () => {
  const out = {};
  const sp = guytonKlingerWithdrawal(400_000, 0.03, 100_000, -0.10, 0.02, 95_000, 500_000, 30, 0, 0, out);
  expect(out.event).toBe("constrained");
  expect(out.reason).toBe("floor-bind");
  expect(num(sp)).toBe(95_000);
  expect(num(sp)).toBeLessThan(100_000);
});

test("a band rule that stays inside the limits keeps its ORIGINAL event", () => {
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
  const out = {};
  const sp = guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 112_200.00000000001, 30, 0, 0, out);
  expect(out.event).toBe("raise");
  expect(out.reason).toBe("prosperity");
  expect(sp).toBeLessThanOrEqual(112_200.00000000001 + 1e-9);
});

test("the sink stays additive when a bind occurs (no-sink callers unaffected)", () => {
  const bare = guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 105_000, 30, 0, 0);
  const withSink = guytonKlingerWithdrawal(4_000_000, 0.05, 100_000, 0.06, 0.02, 30_000, 105_000, 30, 0, 0, {});
  expect(withSink).toBe(bare);
});

test("PASSING NO SINK RETURNS THE SAME NUMBER AS BEFORE (backward compatibility)", () => {
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
  expect(mc.gkStats.cutRate).toBeGreaterThanOrEqual(0);
  expect(mc.gkStats.cutRate).toBeLessThanOrEqual(1);
  expect(mc.gkStats.raiseRate).toBeGreaterThanOrEqual(0);
  expect(mc.gkStats.raiseRate).toBeLessThanOrEqual(1);
  expect(mc.gkStats.avgCutsPerPath).toBeCloseTo(mc.gkStats.cuts / 500, 6);
  expect(Number.isFinite(mc.gkStats.medianCutsPerPath)).toBe(true);
  expect(mc.gkStats.medianCutsPerPath).toBeLessThanOrEqual(mc.gkStats.avgCutsPerPath);
  expect(mc.gkStats.avgCutsAmongCutters).toBeGreaterThanOrEqual(mc.gkStats.avgCutsPerPath);
  if (mc.gkStats.pathsWithCut === 0) expect(mc.gkStats.avgCutsAmongCutters).toBe(0);
  if (mc.gkStats.cuts > 0) expect(mc.gkStats.pathsWithCut).toBeGreaterThan(0);
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
  expect(first.gkEvent).toBeNull();
  for (const r of schedule.slice(1)) {
    expect(r.spAfterGK).toBeGreaterThanOrEqual(r.gkFloor - 1);
    expect(r.spAfterGK).toBeLessThanOrEqual(r.gkCeiling + 1);
  }
  for (const r of schedule) {
    if (r.gkEvent === "cut") expect(r.spAfterGK).toBeLessThanOrEqual(r.spEntering + 1);
    if (r.gkEvent === "raise") expect(r.spAfterGK).toBeGreaterThanOrEqual(r.spEntering - 1);
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
  expect(tight.ceilingBinds + tight.floorBinds).toBe(tight.constrained);
  expect(tight.pathsWithConstrained).toBeGreaterThan(0);
  expect(tight.avgConstrainedPerPath).toBeCloseTo(tight.constrained / 300, 6);

  const loose = run(60_000, 400_000);
  expect(loose.constrained).toBeLessThan(tight.constrained);
  expect(tight.constrainedRate).toBeGreaterThan(loose.constrainedRate);
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
