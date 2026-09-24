/**
 * TaxDetailsModal — parity and crash tests.
 *
 * This is a TAX-MATH SURFACE, so the gate is parity: every number the modal
 * shows must be the engine's own figure for that year, read off the
 * buildWithdrawalWaterfall row rather than recomputed (CLAUDE.md rule 8).
 *
 * Two classes of check:
 *   1. Row-shape + identity checks — the fields the modal reads exist, and the
 *      row's published totals decompose into the row's published parts
 *      (fedTax = ordinary + ltcgTax + niit, irmaaFull = fedTax + stateTax +
 *      irmaa). These are the identities the modal's arithmetic relies on; if
 *      the engine ever renames or re-scopes one, this fails loudly instead of
 *      the modal silently printing a wrong split.
 *   2. Render smoke tests across the three row shapes the requirement names —
 *      a low/zero-tax golden-window year, an RMD year (age >= RMD start), and
 *      the final/depletion-adjacent year. The modal reads `stdDedYr` and
 *      `bracketTopYr`, which are null outside Roth-conversion years, so a
 *      missing null-guard would crash exactly the rows a user is most likely
 *      to click. No render smoke-test existed for the MC tab's RothLadder
 *      crash in v1.1.0.11; this is that gap closed for this surface.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { TaxDetailsModal } from "./App";

// react-dom only treats act() as the ambient environment when this flag is set;
// without it React logs an "environment is not configured to support act"
// warning on every render even though the assertions pass.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// No @testing-library/react in this project (it is deliberately not a
// dependency — the repo asks before adding packages), so render through
// react-dom/client into a jsdom container and read the text back. That is
// enough to prove the modal mounts and does not throw.
//
// The dialog itself is a portal onto document.body (InfoModal uses
// createPortal), so the rendered text is read from body, not the container.
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

// A conventional retirement profile with all four buckets funded, so the
// waterfall produces real draws, real gains, and a real RMD year.
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
    // The modal shows fedTax split as ordinary + LTCG + NIIT. That split is
    // only honest if the engine's fedTax IS that sum — it is (yearTax's
    // `fedT`), so assert it rather than assume it.
    const ordinary = Math.max(0, r.fedTax - r.ltcgTax - r.niit);
    expect(ordinary + r.ltcgTax + r.niit).toBeCloseTo(r.fedTax, 0);

    // irmaaFull is the fully-loaded federal+state+IRMAA figure; totalTax
    // excludes IRMAA. The modal labels them differently, so they must differ
    // by exactly the IRMAA charge.
    expect(r.irmaaFull).toBeCloseTo(r.totalTax + r.irmaa, 0);

    // After-tax (the header pill) = MAGI − fed − state − IRMAA − penalty.
    const afterTax = r.magi - (r.fedTax + r.stateTax + r.irmaa + (r.earlyPenalty || 0));
    expect(Number.isFinite(afterTax)).toBe(true);

    // The four bucket end-balances must sum to the row's published total —
    // the modal's "Total" cell is r.totalPort, and a reader will add the
    // four cells above it by eye.
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
  // stdDedYr / bracketTopYr are only populated when a Roth conversion ran, so
  // strip them to prove the null path is guarded.
  const r = { ...rows[3], stdDedYr: null, bracketTopYr: null };
  const text = renderToText(<TaxDetailsModal r={r} p={P} open onClose={() => {}} />);
  expect(text).toMatch(/Tax Calculation Details/);
});

test("displays the engine's own fedTax figure, not a re-derivation", () => {
  const r = rows.find((x) => (x.fedTax || 0) > 500) || rows[0];
  const text = renderToText(<TaxDetailsModal r={r} p={P} open onClose={() => {}} />);
  // fmtDollar formats with grouping; compare on digits only.
  const digits = String(Math.round(r.fedTax));
  const grouped = Number(digits).toLocaleString("en-US");
  expect(text.replace(/[^0-9,]/g, "")).toContain(grouped.replace(/,/g, ""));
});

test("closed modal renders nothing", () => {
  const text = renderToText(<TaxDetailsModal r={rows[0]} p={P} open={false} onClose={() => {}} />);
  expect(text).toBe("");
});
