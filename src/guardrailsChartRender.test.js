/**
 * Render smoke test — DeterministicWithdrawalView (the Guyton-Klinger
 * "Spending Path with Guardrail Adjustments" chart).
 *
 * WHY THIS EXISTS: the guardrails chart is a large JSX block that reads a dozen
 * fields off each schedule row (spEntering / spAfterGK / gkFloor / gkCeiling /
 * gkEvent / gkReason) and references module constants (GK_ADJUST_PCT,
 * GK_BAND_PCT, GK_LONGEVITY_YEARS) inside a custom tooltip and dot renderer.
 * The engine tests prove the numbers; they cannot prove the component mounts.
 * A prior undefined-variable crash (RothLadder, v1.1.0.11 — an Income Breakdown
 * row referenced an undefined `provisional`) shipped precisely because nothing
 * rendered the component. A ReferenceError in a component body throws on mount,
 * so a plain mount catches exactly that class.
 *
 * No @testing-library/react in this project (deliberately not a dependency —
 * the repo asks before adding packages), so render through react-dom/client
 * into a jsdom container and read the text back, matching taxDetailsModal.test.js.
 * recharts' ResponsiveContainer has zero size in jsdom and draws no points, so
 * the custom tooltip/dot closures don't fire here — but everything in the
 * component body (the branch that reads the schedule, the guardrail summary
 * strip, the legend) renders unconditionally, which is where the crash class lives.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { DeterministicWithdrawalView, runMC } from "./App";

// react-dom only treats act() as the ambient environment when this flag is set.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderToText(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });
  const text = document.body.textContent || "";
  act(() => { root.unmount(); });
  container.remove();
  document.body.innerHTML = "";
  return text;
}

// A conventional, fully-funded household — all four buckets, a real RMD year,
// enough portfolio that GK's bands actually get exercised across the horizon.
const FUNDED = {
  currentAge: 60,
  retireAge: 60,
  endAge: 92,
  // `port` and `contrib` are what the deterministic accumulation path compounds
  // from. Without them this fixture rendered "$NaN" in EVERY Portfolio column,
  // and no assertion noticed — the tests only checked that the right labels
  // appeared. A money table full of NaN is the purest form of the provenance
  // defect (a label asserting a value that was never computed), so the fixture
  // now supplies them and a test below fails on any NaN in the output.
  port: 2_500_000,
  contrib: 0,
  dob: "1970-03-14",
  birthYear: 1970,
  inf: 2.5,
  sp: 90_000,
  ssAge: 67,
  ssb: 36_000,
  ab: 0,
  useAb: false,
  tax: true,
  smile: true,
  preRetireEq: 91,
  postRetireEq: 60,
  filingStatus: "mfj",
  stateOfResidence: "NJ",
  twoHousehold: false,
  withdrawalStrategy: "gk",
  withdrawalBracketTarget: "12",
  irmaaGuard: true,
  ssTorpedoGuard: true,
  rothEmergencyReserve: 0,
  useJointRmdTable: true,
  cashRealReturn: 1.0,
  taxableCostBasisRatio: 0.7,
  gkFloor: 60_000,
  gkCeiling: 130_000,
  accounts: [
    { id: "a1", category: "pretax",  name: "Rollover IRA", balance: 1_500_000 },
    { id: "a2", category: "roth",    name: "Roth IRA",     balance:   500_000 },
    { id: "a3", category: "taxable", name: "Brokerage",    balance:   400_000 },
    { id: "a4", category: "cash",    name: "SGOV",         balance:   100_000 },
  ],
};

// Deliberate depletion: tiny portfolio, oversized spend, no income offset. The
// deterministic schedule breaks early on port<=0 — this exercises the
// failure-year render path (short/empty schedule) without throwing.
const DEPLETING = {
  ...FUNDED,
  sp: 300_000,
  ssb: 0,
  ssAge: 99,
  gkFloor: 250_000,
  gkCeiling: 350_000,
  accounts: [
    { id: "a1", category: "pretax",  name: "Rollover IRA", balance: 200_000 },
    { id: "a2", category: "roth",    name: "Roth IRA",     balance:  50_000 },
    { id: "a3", category: "taxable", name: "Brokerage",    balance:  50_000 },
    { id: "a4", category: "cash",    name: "SGOV",         balance:  10_000 },
  ],
};

test("GK guardrails chart mounts for a funded plan and shows the spending-path section", () => {
  let text;
  expect(() => {
    text = renderToText(
      <DeterministicWithdrawalView p={FUNDED} inf={2.5} withdrawalStrategy="gk" smartRows={[]} />
    );
  }).not.toThrow();
  // The deterministic schedule rendered (not the empty-state fallback)...
  expect(text).toContain("Deterministic Schedule");
  expect(text).not.toContain("No data available");
  // ...and the guardrail view is present for a GK-family strategy (tabbed now:
  // Spending Path · Adjustment Events · Across All Scenarios).
  expect(text).toContain("Adjustment Events");
  expect(text).toContain("Portfolio (right axis)");
  // No NaN anywhere in the rendered money. This surface prints a lot of dollars
  // across the schedule, the guardrail bands and the summary cards, and "$NaN"
  // is what a half-populated fixture (or a broken engine input) looks like on
  // screen — silently, since it still renders.
  expect(text).not.toContain("NaN");
});

test("GK guardrails chart mounts without throwing on a depleting (failure-year) plan", () => {
  expect(() => {
    renderToText(
      <DeterministicWithdrawalView p={DEPLETING} inf={2.5} withdrawalStrategy="gk" smartRows={[]} />
    );
  }).not.toThrow();
});

test("non-guardrail strategy (bengen) renders the schedule but hides the guardrail section", () => {
  let text;
  expect(() => {
    text = renderToText(
      <DeterministicWithdrawalView p={{ ...FUNDED, withdrawalStrategy: "bengen" }} inf={2.5} withdrawalStrategy="bengen" smartRows={[]} />
    );
  }).not.toThrow();
  expect(text).toContain("Deterministic Schedule");
  // Bengen is not a guardrail strategy, so the guardrail view is absent.
  expect(text).not.toContain("Adjustment Events");
});

/**
 * The cross-scenario summary strip — the FIRST reader of mc.gkStats.
 *
 * Drives the engine rather than hand-building a gkStats object, so this also
 * catches a rename or re-scope on the engine side (the field names carry the
 * dollar BASIS: spendMinReal/spendMaxReal, retirement-year dollars).
 */
describe("guardrails cross-scenario strip (mc.gkStats)", () => {
  const mcFor = (over = {}, n = 200) =>
    runMC({ ...FUNDED, gkFloorPct: 65, gkCeilingPct: 135, ...over }, FUNDED.endAge, n, 7, true);

  test("renders the cross-scenario counts when a run exists, with the basis year named", () => {
    const mc = mcFor();
    expect(mc.gkStats).toBeTruthy();
    const text = renderToText(
      <DeterministicWithdrawalView p={FUNDED} inf={2.5} withdrawalStrategy="gk" smartRows={[]} mc={mc} />
    );
    expect(text).toContain("Across 200 simulated scenarios");
    expect(text).toContain("cut spending in");
    expect(text).toContain("raised it in");
    // Median FIRST, and the mean qualified as "among the paths that cut". The
    // bare "avg N cuts per scenario" was removed because it read as the typical
    // experience while the median path cuts zero times.
    expect(text).toContain("cuts: typically");
    expect(text).toContain("per scenario");
    expect(text).toContain("on average among the");
    expect(text).not.toMatch(/avg \d/);
    expect(text).toContain("spending seen");
    // The basis is RETIREMENT-YEAR dollars, named with the actual calendar year
    // (retireAge === currentAge here, so retirement year one IS the current
    // year). "today's dollars" would be the wrong label — see §41 A3.
    const retirementYear = new Date().getFullYear();
    expect(text).toContain(`${retirementYear} dollars`);
    // Both endpoints of the range must be real, ordered dollars.
    expect(mc.gkStats.spendMinReal).toBeGreaterThan(0);
    expect(mc.gkStats.spendMaxReal).toBeGreaterThan(mc.gkStats.spendMinReal);
  });

  test("the strip is ABSENT before a run — no confident $0", () => {
    // No mc at all (fresh session, nothing run yet).
    const text = renderToText(
      <DeterministicWithdrawalView p={FUNDED} inf={2.5} withdrawalStrategy="gk" smartRows={[]} />
    );
    // The guardrail view (tabs) renders, but the cross-scenario STRIP does not
    // (no mc). The "Across All Scenarios" tab LABEL is always present, so we
    // assert on the strip's own text ("simulated scenarios" / "spending seen").
    expect(text).toContain("Adjustment Events");
    expect(text).not.toContain("simulated scenarios");
    expect(text).not.toContain("spending seen");
  });

  test("the strip is ABSENT when gkStats is null", () => {
    const text = renderToText(
      <DeterministicWithdrawalView p={FUNDED} inf={2.5} withdrawalStrategy="gk" smartRows={[]} mc={{ gkStats: null, rate: 0.9 }} />
    );
    expect(text).not.toContain("spending seen");
  });

  test("spendMinReal/spendMaxReal are retirement-year dollars, not nominal", () => {
    // DISCRIMINATING BY CONSTRUCTION. The guardrail clamps each year's spend
    // into `gkFloor * cumInfl` … `gkCeiling * cumInfl`. Deflating by the same
    // cumInfl therefore puts the real range back inside the BASE band —
    // [$60,000, $130,000] for this fixture — and that is exactly what makes the
    // basis testable: the observed real max came back at 130,000, the ceiling
    // itself.
    //
    // A nominal recording could not pass this. The ceiling is multiplied by
    // cumInfl every year, so by the final year nominal spend reaches
    // 130,000 x 1.025^31 ≈ $280K — the upper bound below fails loudly. Stating
    // the bound (rather than asserting the field merely exists) is the point.
    const mc = mcFor();
    expect(mc.gkStats.spendMinReal).toBeGreaterThanOrEqual(FUNDED.gkFloor);
    expect(mc.gkStats.spendMinReal).toBeLessThanOrEqual(FUNDED.gkCeiling);
    expect(mc.gkStats.spendMaxReal).toBeLessThanOrEqual(FUNDED.gkCeiling);
    expect(mc.gkStats.spendMaxReal).toBeGreaterThanOrEqual(FUNDED.gkFloor);
    // Nominal would blow past the ceiling by the end of the horizon.
    expect(mc.gkStats.spendMaxReal).toBeLessThan(Math.round(FUNDED.gkCeiling * 1.05));
    // And the band is genuinely exercised, not a degenerate single value.
    expect(mc.gkStats.spendMaxReal).toBeGreaterThan(mc.gkStats.spendMinReal);
  });
});
