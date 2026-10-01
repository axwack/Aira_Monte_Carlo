import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VerdictHeader, NetWorthTab, runMC } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function text(node) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  const root = createRoot(c);
  act(() => { root.render(node); });
  const t = c.textContent || "";
  act(() => { root.unmount(); });
  c.remove();
  return t;
}

const P = {
  currentAge: 60, retireAge: 60, endAge: 92, dob: "1970-03-14", birthYear: 1970,
  inf: 2.5, sp: 90_000, ssAge: 67, ssb: 36_000, ab: 0, useAb: false, tax: true, smile: true,
  preRetireEq: 91, postRetireEq: 60, filingStatus: "mfj", stateOfResidence: "NJ",
  withdrawalStrategy: "gk", withdrawalBracketTarget: "12", irmaaGuard: true, ssTorpedoGuard: true,
  rothEmergencyReserve: 0, useJointRmdTable: true, cashRealReturn: 1.0, taxableCostBasisRatio: 0.7,
  accounts: [{ id: "a1", category: "pretax", name: "IRA", balance: 600_000 }],
  properties: [], mortBalance: 0, mortExtra: 0,
};

describe("Runs out (median) wording", () => {
  const hdr = (mc) => text(<VerdictHeader mc={mc} inf={2.5} endAge={92} currentAge={60} retireAge={60} swr="3.5" swrBenchmark={0.04} real={false} />);
  test("tooltip no longer claims 'Never' means fewer than half failed, and 'thin' is gone", () => {
    const t = hdr(runMC(P, 92, 200, 7, true));
    expect(t).not.toMatch(/fewer than half/);
    expect(t).not.toMatch(/\bthin\b/);
  });
});

describe("Net Worth mortgage-free card", () => {
  const mc = runMC(P, 92, 200, 7, true);
  const card = (p) => text(<NetWorthTab p={p} mc={mc} inf={2.5} real={false} />);
  test("no mortgage -> says so, no 'With extra payments'", () => {
    const t = card(P);
    expect(t).toContain("No mortgage modeled");
    expect(t).not.toContain("With extra payments");
  });
  test("mortgage without extra payments -> standard payments", () => {
    const t = card({ ...P, mortBalance: 200_000, mortRate: 5, mortStart: "2020-01", mortTerm: 30, mortExtra: 0 });
    expect(t).toContain("Standard payments");
    expect(t).not.toContain("With extra payments");
  });
  test("mortgage with extra payments -> with extra payments", () => {
    const t = card({ ...P, mortBalance: 200_000, mortRate: 5, mortStart: "2020-01", mortTerm: 30, mortExtra: 500 });
    expect(t).toContain("With extra payments");
  });
});
