import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MCOverviewCards, runMC } from "./App";

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

const MC = runMC(P, P.endAge, 300, 11, true);

test("runMC publishes term.mean, and it is NOT the average of the percentiles", () => {
  expect(Number.isFinite(MC.term.mean)).toBe(true);
  expect(MC.term.mean).toBeGreaterThan(0);
  const t = MC.term;
  const quantileAvg = (t.p10 + t.p25 + t.p50 + t.p75 + t.p90) / 5;
  expect(Math.abs(MC.term.mean - quantileAvg)).toBeGreaterThan(1000);
  expect(MC.term.mean).toBeGreaterThanOrEqual(t.p10);
});

test("renders all four cards with their labels and formulas", () => {
  const text = renderToText(<MCOverviewCards mc={MC} inf={2.5} real={false} endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  expect(text).toContain("Success Rate");
  expect(text).toContain("Mean Final Balance");
  expect(text).toContain("Best Case (90th)");
  expect(text).toContain("Median Final Balance");
  expect(text).toContain(`age ${P.endAge}`);
  expect(text).toMatch(/Average final balance across every simulated path/i);
});

test("names the dollar basis with the retirement YEAR, never \"today's dollars\"", () => {
  const text = renderToText(<MCOverviewCards mc={MC} inf={2.5} real endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  const year = new Date().getFullYear();
  expect(text).toContain(`${year} dollars`);
  expect(text).not.toMatch(/today's dollars/i);
});

test("the Real-$ toggle actually moves the dollar cards (they read the selectors)", () => {
  const nominal = renderToText(<MCOverviewCards mc={MC} inf={2.5} real={false} endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  const real = renderToText(<MCOverviewCards mc={MC} inf={2.5} real endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  expect(real).not.toBe(nominal);
});

test("renders nothing without a run — no confident $0", () => {
  expect(renderToText(<MCOverviewCards mc={null} inf={2.5} real={false} endAge={90} currentAge={60} retireAge={60} />)).toBe("");
});

test("a run missing term.mean prints a dash, not $0", () => {
  const stripped = { ...MC, term: { ...MC.term, mean: undefined } };
  const text = renderToText(<MCOverviewCards mc={stripped} inf={2.5} real={false} endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  expect(text).toContain("Mean Final Balance");
  expect(text).toContain("—");
  expect(text).not.toContain("$0");
});
