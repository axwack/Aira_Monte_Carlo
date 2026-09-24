/**
 * Monte Carlo Overview cards — REQUIREMENTS §42 Spec A.
 *
 * Four cards, every figure a READ off one `mc` object (rule 8). What this file
 * pins down beyond "it renders":
 *
 *  1. The MEAN is the distribution's mean, NOT the average of p10..p90. The spec
 *     calls that out explicitly because it is the tempting shortcut, and it
 *     understates the figure (the mean sits above the median once the right tail
 *     is included). Asserted as an inequality against the quantile average, so a
 *     future "simplification" to the average fails here.
 *  2. The three dollar cards route through the shared SELECTORS, so the Real-$
 *     toggle moves them. A direct `mc.term.p50` read is banned by
 *     noRawMcAccess.test.js; this proves the values respond to `real`.
 *  3. No card prints a confident $0 for missing data — the defect class
 *     mcSelectors.js documents at length.
 */

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
  // The shortcut the spec forbids. If someone swaps the implementation for the
  // quantile average, this fails. (They are not merely unequal by rounding: the
  // terminal distribution is right-skewed, so the true mean sits well above the
  // average of five quantiles.)
  expect(Math.abs(MC.term.mean - quantileAvg)).toBeGreaterThan(1000);
  // Sanity: the mean cannot be below the worst decile.
  expect(MC.term.mean).toBeGreaterThanOrEqual(t.p10);
});

test("renders all four cards with their labels and formulas", () => {
  const text = renderToText(<MCOverviewCards mc={MC} inf={2.5} real={false} endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  expect(text).toContain("Success Rate");
  expect(text).toContain("Mean Final Balance");
  expect(text).toContain("Best Case (90th)");
  expect(text).toContain("Median Final Balance");
  // Each card must name the age its figure is from (Rule 1: point-in-time).
  expect(text).toContain(`age ${P.endAge}`);
  // Rule 1a: the arithmetic is on screen, not only in the registry.
  expect(text).toMatch(/Average final balance across every simulated path/i);
});

test("names the dollar basis with the retirement YEAR, never \"today's dollars\"", () => {
  const text = renderToText(<MCOverviewCards mc={MC} inf={2.5} real endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  const year = new Date().getFullYear();
  expect(text).toContain(`${year} dollars`);
  // §41 A3: the basis is the retirement year, so this phrasing is wrong here.
  expect(text).not.toMatch(/today's dollars/i);
});

test("the Real-$ toggle actually moves the dollar cards (they read the selectors)", () => {
  const nominal = renderToText(<MCOverviewCards mc={MC} inf={2.5} real={false} endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  const real = renderToText(<MCOverviewCards mc={MC} inf={2.5} real endAge={P.endAge} currentAge={P.currentAge} retireAge={P.retireAge} />);
  // A 32-year horizon at 2.5% deflates hard; if the cards read raw mc.term they
  // would be identical and this fails.
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
