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
import { DeterministicWithdrawalView } from "./App";

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
  // ...and the guardrail spending-path section is present for a GK-family strategy.
  expect(text).toContain("Spending Path with Guardrail Adjustments");
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
  // Bengen is not a guardrail strategy, so the adjustment-events section is absent.
  expect(text).not.toContain("Spending Path with Guardrail Adjustments");
});
