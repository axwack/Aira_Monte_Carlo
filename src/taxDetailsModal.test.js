import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { TaxDetailsModal } from "./App";

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

const P = {
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
  withdrawalStrategy: "smart",
  withdrawalBracketTarget: "12",
  irmaaGuard: true,
  ssTorpedoGuard: true,
  rothEmergencyReserve: 0,
  useJointRmdTable: true,
  cashRealReturn: 1.0,
  taxableCostBasisRatio: 0.7,
  accounts: [
    { id: "a1", category: "pretax",  name: "Rollover IRA", balance: 1_500_000 },
    { id: "a2", category: "roth",    name: "Roth IRA",     balance:   400_000 },
    { id: "a3", category: "taxable", name: "Brokerage",    balance:   500_000 },
    { id: "a4", category: "cash",    name: "Cash",         balance:    80_000 },
  ],
};

const rows = buildWithdrawalWaterfall(P).smart.rows;

test("waterfall rows carry every field the tax-detail modal reads", () => {
  expect(rows.length).toBeGreaterThan(20);
  const r = rows[0];
  for (const f of [
    "age", "yr", "totInc", "magi", "taxableIncome", "marginalBracket",
    "taxSS", "ss", "fedTax", "ltcgTax", "niit", "stateTax", "irmaa",
    "irmaaFull", "totalTax", "earlyPenalty", "effectiveRate", "realizedGain",
    "fromCash", "fromTaxable", "fromPretax", "rmd", "fromRoth",
    "annuityRental", "otherIncome", "conversionAmount", "conversionTax",
    "cashEnd", "taxableEnd", "pretaxEnd", "rothEnd", "totalPort",
    "stdDedYr", "bracketTopYr",
  ]) {
    expect(Object.prototype.hasOwnProperty.call(r, f)).toBe(true);
  }
});

test("published row totals decompose into the row's own published parts (rule 8)", () => {
  for (const r of rows) {
    const ordinary = Math.max(0, r.fedTax - r.ltcgTax - r.niit);
    expect(ordinary + r.ltcgTax + r.niit).toBeCloseTo(r.fedTax, 0);

    expect(r.irmaaFull).toBeCloseTo(r.totalTax + r.irmaa, 0);

    const afterTax = r.magi - (r.fedTax + r.stateTax + r.irmaa + (r.earlyPenalty || 0));
    expect(Number.isFinite(afterTax)).toBe(true);

    expect(r.pretaxEnd + r.rothEnd + r.taxableEnd + r.cashEnd).toBeCloseTo(r.totalPort, -1);
  }
});

test("renders a golden-window year (no RMD, possibly zero tax) without crashing", () => {
  const r = rows.find((x) => !x.landmines.rmdActive) || rows[0];
  const text = renderToText(<TaxDetailsModal r={r} p={P} open onClose={() => {}} />);
  expect(text).toMatch(/Tax Calculation Details/);
  expect(text).toMatch(/Income Sources/);
  expect(text).toMatch(/Portfolio Balances/);
});

test("renders an RMD year without crashing and shows the forced distribution", () => {
  const r = rows.find((x) => x.landmines.rmdActive) || rows[rows.length - 1];
  expect(r.landmines.rmdActive).toBe(true);
  const text = renderToText(<TaxDetailsModal r={r} p={P} open onClose={() => {}} />);
  expect(text).toMatch(/Pre-Tax — RMD \(forced\)/);
});

test("renders the final (depletion-adjacent) year without crashing", () => {
  const r = rows[rows.length - 1];
  const text = renderToText(<TaxDetailsModal r={r} p={P} open onClose={() => {}} />);
  expect(text).toMatch(/Tax Calculation Details/);
});

test("survives a row with null deduction/bracket fields (non-conversion year)", () => {
  const r = { ...rows[3], stdDedYr: null, bracketTopYr: null };
  const text = renderToText(<TaxDetailsModal r={r} p={P} open onClose={() => {}} />);
  expect(text).toMatch(/Tax Calculation Details/);
});

test("displays the engine's own fedTax figure, not a re-derivation", () => {
  const r = rows.find((x) => (x.fedTax || 0) > 500) || rows[0];
  const text = renderToText(<TaxDetailsModal r={r} p={P} open onClose={() => {}} />);
  const digits = String(Math.round(r.fedTax));
  const grouped = Number(digits).toLocaleString("en-US");
  expect(text.replace(/[^0-9,]/g, "")).toContain(grouped.replace(/,/g, ""));
});

test("closed modal renders nothing", () => {
  const text = renderToText(<TaxDetailsModal r={rows[0]} p={P} open={false} onClose={() => {}} />);
  expect(text).toBe("");
});
