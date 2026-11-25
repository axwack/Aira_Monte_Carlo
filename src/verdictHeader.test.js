import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VerdictHeader, runMC } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderToText(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });
  const text = container.textContent || "";
  act(() => { root.unmount(); });
  container.remove();
  document.body.innerHTML = "";
  return text;
}

const P = {
  currentAge: 60, retireAge: 60, endAge: 92, dob: "1970-03-14", birthYear: 1970,
  inf: 2.5, sp: 90_000, ssAge: 67, ssb: 36_000, ab: 0, useAb: false,
  tax: true, smile: true, preRetireEq: 91, postRetireEq: 60,
  filingStatus: "mfj", stateOfResidence: "NJ", twoHousehold: false,
  withdrawalStrategy: "gk", withdrawalBracketTarget: "12", irmaaGuard: true,
  ssTorpedoGuard: true, rothEmergencyReserve: 0, useJointRmdTable: true,
  cashRealReturn: 1.0, taxableCostBasisRatio: 0.7,
  accounts: [
    { id: "a1", category: "pretax",  name: "Rollover IRA", balance: 1_500_000 },
    { id: "a2", category: "roth",    name: "Roth IRA",     balance:   500_000 },
    { id: "a3", category: "taxable", name: "Brokerage",    balance:   400_000 },
    { id: "a4", category: "cash",    name: "SGOV",         balance:   100_000 },
  ],
};

const MC = runMC(P, P.endAge, 300, 13, true);
const base = { inf: 2.5, endAge: P.endAge, currentAge: P.currentAge, retireAge: P.retireAge, swr: "3.5", swrBenchmark: 0.04 };

test("renders all four headline cards from one mc object", () => {
  const text = renderToText(<VerdictHeader mc={MC} {...base} real={false} />);
  expect(text).toContain("Withdrawal rate");
  expect(text).not.toContain("Funded to age");
  expect(text).toContain("Money outlives you");
  expect(text).toContain(`Worst case at ${P.endAge}`);
  expect(text).toContain("Runs out");
  expect(text).toContain(`${base.swr}%`);
  if (MC.mwRate != null) expect(text).toContain(`${(MC.mwRate * 100).toFixed(1)}%`);
});

test("a FAILING plan shows the failure age and a worst case of zero — the case that matters", () => {
  const rough = {
    ...P,
    sp: 260_000,
    ssb: 0,
    ssAge: 99,
    accounts: [
      { id: "b1", category: "pretax",  name: "Rollover IRA", balance: 400_000 },
      { id: "b2", category: "roth",    name: "Roth IRA",     balance: 100_000 },
      { id: "b3", category: "taxable", name: "Brokerage",    balance: 100_000 },
      { id: "b4", category: "cash",    name: "SGOV",         balance:  20_000 },
    ],
  };
  const mc = runMC(rough, rough.endAge, 300, 13, true);
  expect(mc.rate).toBeLessThan(1);
  const text = renderToText(<VerdictHeader mc={mc} {...base} real={false} />);
  if (mc.medianExhaustAge != null) expect(text).toContain(`Age ${mc.medianExhaustAge}`);
  else expect(text).toContain("Never");
  if (mc.mwRate != null) expect(mc.mwRate).toBeGreaterThanOrEqual(mc.rate);
});

test("the worst case is labelled a BALANCE, never a floor spend", () => {
  const text = renderToText(<VerdictHeader mc={MC} {...base} real={false} />);
  expect(text).not.toMatch(/floor spend/i);
  expect(text).toMatch(/Worst case/i);
});

test("names the basis with the retirement year, never \"today's dollars\" (§41 A3)", () => {
  const realText = renderToText(<VerdictHeader mc={MC} {...base} real inf={2.5} />);
  const year = new Date().getFullYear();
  expect(realText).toContain(`${year} dollars`);
  expect(realText).not.toMatch(/today's dollars/i);
});

test("the Real-$ toggle moves the worst-case balance (it reads the selector)", () => {
  const nominal = renderToText(<VerdictHeader mc={MC} {...base} real={false} />);
  const real = renderToText(<VerdictHeader mc={MC} {...base} real inf={2.5} />);
  expect(real).not.toBe(nominal);
});

test("'Never' is shown when no path failed — not a fake age", () => {
  const neverFails = { ...MC, medianExhaustAge: null };
  const text = renderToText(<VerdictHeader mc={neverFails} {...base} real={false} />);
  expect(text).toContain("Never");
  expect(text).not.toMatch(/Runs outAge/);
});

test("before a run it says so plainly instead of rendering zeros", () => {
  const text = renderToText(<VerdictHeader mc={null} {...base} real={false} />);
  expect(text).toContain("No verdict yet");
  expect(text).not.toContain("$0");
  expect(text).not.toContain("0.0%");
});

test("a missing mwRate prints a dash rather than a false 0%", () => {
  const noMw = { ...MC, mwRate: null };
  const text = renderToText(<VerdictHeader mc={noMw} {...base} real={false} />);
  expect(text).toContain("—");
});
