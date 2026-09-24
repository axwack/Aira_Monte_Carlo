/**
 * MCBandTable — the "Success Probability by Age" columns.
 *
 * Vin's Overview spec asked for a per-age success table with a count and the
 * app's band labels. That data already lived in this table (`d.alive` is the
 * share of paths still funded at each age), so the work was extending the
 * EXISTING table rather than adding a second one over `mc.pcts` — two tables on
 * one array is the Single Point of Control defect this repo keeps re-learning.
 *
 * What this file pins down:
 *   1. The columns stay ALIGNED. Adding two cells against three headers (the
 *      first cut of this change) silently shifts every dollar column one place
 *      right — a money table that lies while every test still passes. Counting
 *      <th> against <td> is the cheap guard for that.
 *   2. The band COLORS and LABELS come from the shared MC_BAND_* thresholds. The
 *      table previously carried inline `0.9 / 0.75` literals that had already
 *      drifted from the app's real bands (0.75 is not a band edge; 0.80 is).
 *   3. The Success Count reads the RUN's path count. The count is user
 *      adjustable now (⚙ Advanced Settings), so a 500-path run must not print
 *      "3,000".
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MCBandTable, MC_BAND_LOW_RISK, MC_BAND_MODERATE, MC_BAND_ELEVATED } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderToNode(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });
  // Getters, not snapshots: the table ships collapsed, so the assertions below
  // read the DOM AFTER the "Show Table" click re-renders it. A captured string
  // would silently test the collapsed state and pass on nothing.
  const out = { cleanup: () => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ""; } };
  Object.defineProperty(out, "text", { get: () => container.textContent || "" });
  Object.defineProperty(out, "html", { get: () => container.innerHTML || "" });
  return out;
}

// Four rows chosen to land in four different bands (1.00 / 0.85 / 0.72 / 0.40),
// so every badge and colour path renders.
const PCTS = [
  { age: 60, yr: 2026, p10: 900_000, p25: 1_100_000, p50: 1_400_000, p75: 1_700_000, p90: 2_000_000, alive: 1.00 },
  { age: 70, yr: 2036, p10: 700_000, p25: 950_000,  p50: 1_250_000, p75: 1_600_000, p90: 1_950_000, alive: 0.85 },
  { age: 80, yr: 2046, p10: 300_000, p25: 600_000,  p50: 900_000,   p75: 1_250_000, p90: 1_600_000, alive: 0.72 },
  { age: 90, yr: 2056, p10: 0,       p25: 10_000,   p50: 40_000,    p75: 120_000,   p90: 300_000,   alive: 0.40 },
];

const BASE = { inf: 0, useReal: false, ssAge: 67, rmdAge: 75, currentAge: 60, endAge: 90, totalPaths: 500, retireAge: 67 };

function open(props = {}) {
  const r = renderToNode(<MCBandTable pcts={PCTS} {...BASE} {...props} />);
  // The table ships collapsed; click "Show Table" first.
  const btn = [...document.querySelectorAll("button")].find((b) => /Show Table/i.test(b.textContent));
  if (btn) act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  return r;
}

test("header and body cell counts match — the money columns stay aligned", () => {
  const r = open();
  const heads = [...document.querySelectorAll("thead th")].length;
  const firstRow = document.querySelectorAll("tbody tr")[0];
  const cells = firstRow ? firstRow.querySelectorAll("td").length : 0;
  r.cleanup();
  expect(heads).toBeGreaterThan(0);
  // If these drift apart, every <td> after the insertion point is off by one.
  expect(cells).toBe(heads);
});

test("renders the Success Count from the RUN's path count, not the MC_PATHS constant", () => {
  const r = open({ totalPaths: 500 });
  expect(r.text).toContain("500/500");        // age 60, alive 1.00
  expect(r.text).toContain("425/500");        // age 70, alive 0.85
  expect(r.text).not.toContain("3,000");
  r.cleanup();
});

test("renders the Phase column from the effective retirement age", () => {
  const r = open({ retireAge: 67 });
  expect(r.text).toContain("Pre-Retirement");  // age 60 < 67
  expect(r.text).toContain("Retirement");      // ages 70+ >= 67
  r.cleanup();
});

test("band labels come from the shared thresholds, not inline literals", () => {
  const r = open();
  // 1.00 -> Excellent (>= LOW_RISK), 0.85 -> Good (>= MODERATE),
  // 0.72 -> Concerning (>= ELEVATED), 0.40 -> Critical.
  expect(r.text).toContain("Excellent");
  expect(r.text).toContain("Good");
  expect(r.text).toContain("Concerning");
  expect(r.text).toContain("Critical");
  r.cleanup();
});

test("the key states the thresholds from the constants (no retyped percentages)", () => {
  const r = open();
  expect(r.text).toContain(`${Math.round(MC_BAND_LOW_RISK * 100)}%+`);
  expect(r.text).toContain(`${Math.round(MC_BAND_MODERATE * 100)}%+`);
  expect(r.text).toContain(`below ${Math.round(MC_BAND_ELEVATED * 100)}%`);
  r.cleanup();
});

test("survives missing path count and retirement age without printing junk", () => {
  const r = open({ totalPaths: undefined, retireAge: undefined });
  expect(r.text).toContain("Still Funded");
  expect(r.text).not.toContain("NaN");
  expect(r.text).not.toContain("undefined");
  r.cleanup();
});

test("renders nothing for an empty pcts array (no crash, no empty shell)", () => {
  const r = renderToNode(<MCBandTable pcts={[]} {...BASE} />);
  expect(r.text).toBe("");
  r.cleanup();
});

test("landmarkOnly keeps a handful of ages — same component, not a second table", () => {
  // A DENSE horizon (every year 60→90). PCTS above only has four rows, and all
  // four happen to be landmarks — filtering them proves nothing. This fixture
  // makes the filter observable.
  const dense = [];
  for (let age = 60; age <= 90; age++) {
    dense.push({ age, yr: 2026 + (age - 60), p10: 100, p25: 200, p50: 300, p75: 400, p90: 500, alive: Math.max(0, 1 - (age - 60) * 0.02) });
  }
  const rowCount = () => document.querySelectorAll("tbody tr").length;
  const full = open({ pcts: dense });
  const fullRows = rowCount();
  full.cleanup();
  const land = open({ pcts: dense, landmarkOnly: true });
  const landRows = rowCount();
  const text = land.text;
  land.cleanup();

  expect(fullRows).toBe(31);                 // every age rendered
  expect(landRows).toBeLessThan(fullRows);   // the lens is real
  expect(landRows).toBeGreaterThan(0);
  // Landmarks in a 60→90 horizon: 60 (start), 65, 67 (retireAge + ssAge), 70,
  // 75 (rmdAge), 80, 85, 90 (end) → 8 rows.
  expect(landRows).toBe(8);
  // The caption admits it is a subset rather than claiming every age.
  expect(text).toMatch(/Landmark ages only/i);
});

test("landmarkOnly never renders an empty table when no landmark matches", () => {
  // A horizon whose ages miss every landmark still shows its endpoints.
  const odd = [
    { age: 61, yr: 2027, p10: 1, p25: 2, p50: 3, p75: 4, p90: 5, alive: 1 },
    { age: 62, yr: 2028, p10: 1, p25: 2, p50: 3, p75: 4, p90: 5, alive: 1 },
  ];
  const r = open({ pcts: odd, landmarkOnly: true, retireAge: 99, ssAge: 99, rmdAge: 99 });
  expect(document.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
  r.cleanup();
});
