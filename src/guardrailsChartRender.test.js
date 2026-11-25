import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { DeterministicWithdrawalView, runMC } from "./App";

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

const FUNDED = {
  currentAge: 60,
  retireAge: 60,
  endAge: 92,
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
  expect(text).toContain("Steady-return schedule");
  expect(text).not.toContain("No data available");
  expect(text).toContain("Adjustment Events");
  expect(text).toContain("Portfolio (right axis)");
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
  expect(text).toContain("Steady-return schedule");
  expect(text).not.toContain("Adjustment Events");
});

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
    expect(text).toContain("cuts: typically");
    expect(text).toContain("per scenario");
    expect(text).toContain("on average among the");
    expect(text).not.toMatch(/avg \d/);
    expect(text).toContain("spending seen");
    const retirementYear = new Date().getFullYear();
    expect(text).toContain(`${retirementYear} dollars`);
    expect(mc.gkStats.spendMinReal).toBeGreaterThan(0);
    expect(mc.gkStats.spendMaxReal).toBeGreaterThan(mc.gkStats.spendMinReal);
  });

  test("the strip is ABSENT before a run — no confident $0", () => {
    const text = renderToText(
      <DeterministicWithdrawalView p={FUNDED} inf={2.5} withdrawalStrategy="gk" smartRows={[]} />
    );
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
    const mc = mcFor();
    expect(mc.gkStats.spendMinReal).toBeGreaterThanOrEqual(FUNDED.gkFloor);
    expect(mc.gkStats.spendMinReal).toBeLessThanOrEqual(FUNDED.gkCeiling);
    expect(mc.gkStats.spendMaxReal).toBeLessThanOrEqual(FUNDED.gkCeiling);
    expect(mc.gkStats.spendMaxReal).toBeGreaterThanOrEqual(FUNDED.gkFloor);
    expect(mc.gkStats.spendMaxReal).toBeLessThan(Math.round(FUNDED.gkCeiling * 1.05));
    expect(mc.gkStats.spendMaxReal).toBeGreaterThan(mc.gkStats.spendMinReal);
  });
});
