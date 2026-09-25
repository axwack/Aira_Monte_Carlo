/**
 * NetWorthTip — the account-composition tooltip on the Net Worth chart.
 *
 * The point of this component is that a hover answers "what is this made of"
 * without lying about WHICH year it describes. The chart line is a projection;
 * the account split is today's entered balances. Those coincide at exactly one
 * data point (the first) and diverge after that, so the tooltip labels the split
 * as "from today's balances" once it stops being the hovered year's figure, and
 * drops it entirely once the projection has run past it.
 *
 * That distinction is the whole reason this file exists: a breakdown rendered
 * under a projected total reads as if it adds up to that total. It does not.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NetWorthTip } from "./App";

const P = {
  currentAge: 60,
  accounts: [
    { id: "a1", category: "pretax",  name: "Rollover IRA", balance: 1_500_000 },
    { id: "a2", category: "roth",    name: "Roth IRA",     balance:   500_000 },
    { id: "a3", category: "hsa",     name: "HSA",          balance:   100_000 },
    { id: "a4", category: "taxable", name: "Brokerage",    balance:   300_000 },
    { id: "a5", category: "cash",    name: "SGOV",         balance:   100_000 },
  ],
};
// 1.5M pretax · 600K tax-free (Roth + HSA) · 300K taxable · 100K cash = 2.5M
const TOTAL_TODAY = 2_500_000;

const tip = (row, label = 60) =>
  renderToStaticMarkup(
    <NetWorthTip p={P} active label={label} payload={[{ payload: row }]} />
  );

test("renders nothing when inactive or empty", () => {
  expect(tip({ "Liquid Portfolio": 1 }, 60).constructor).toBe(String);
  expect(renderToStaticMarkup(<NetWorthTip p={P} active={false} label={60} payload={[]} />)).toBe("");
  expect(renderToStaticMarkup(<NetWorthTip p={P} active label={60} payload={[]} />)).toBe("");
});

test("shows the liquid total, real estate, mortgage and a net-worth footer", () => {
  const html = tip({
    age: 70,
    "Liquid Portfolio": 4_000_000,
    "Real Estate": 900_000,
    "Mortgage Debt": -250_000,
    "Net Worth": 4_650_000,
  }, 70);
  expect(html).toContain("Age 70");
  expect(html).toContain("Liquid Portfolio");
  expect(html).toContain("$4,000,000");
  expect(html).toContain("Real Estate");
  expect(html).toContain("Total Net Worth");
  expect(html).toContain("$4,650,000");
});

test("groups Roth and HSA together as Tax-Free", () => {
  const html = tip({ "Liquid Portfolio": TOTAL_TODAY }, 60);
  expect(html).toContain("Tax-Free");
  expect(html).toContain("$600,000");
  expect(html).toContain("Pre-Tax");
  expect(html).toContain("$1,500,000");
});

test("at the FIRST data point the split is shown unlabelled — it genuinely is that year", () => {
  const html = tip({ "Liquid Portfolio": TOTAL_TODAY }, 60);
  expect(html).not.toMatch(/from today/i);
});

test("once the projection has grown, the split is labelled as today's balances", () => {
  // Still traceable to today (not yet overtaken), but no longer equal to the
  // hovered year — so it must say where it comes from.
  const html = tip({ "Liquid Portfolio": Math.round(TOTAL_TODAY * 1.01) }, 61);
  expect(html).toMatch(/from today/i);
});

test("the split DROPS once the projection has run past today's balances", () => {
  // A projected mid-retirement figure. Showing today's $2.5M split under a
  // $9M projection would imply it composes it.
  const html = tip({ "Liquid Portfolio": 9_000_000, "Net Worth": 9_000_000 }, 80);
  expect(html).not.toMatch(/Pre-Tax/);
  expect(html).not.toMatch(/Tax-Free/);
  expect(html).not.toMatch(/from today/i);
  // The headline figures still render — only the misleading breakdown is gone.
  expect(html).toContain("$9,000,000");
});

test("omits a zero mortgage line rather than printing -$0", () => {
  const html = tip({ "Liquid Portfolio": TOTAL_TODAY, "Mortgage Debt": 0, "Real Estate": 0 }, 60);
  expect(html).not.toMatch(/Mortgage Debt/);
  expect(html).not.toMatch(/Real Estate/);
});
