import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MCBandTable, MC_BAND_LOW_RISK, MC_BAND_MODERATE, MC_BAND_ELEVATED } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderToNode(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });
  const out = { cleanup: () => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ""; } };
  Object.defineProperty(out, "text", { get: () => container.textContent || "" });
  Object.defineProperty(out, "html", { get: () => container.innerHTML || "" });
  return out;
}

const PCTS = [
  { age: 60, yr: 2026, p10: 900_000, p25: 1_100_000, p50: 1_400_000, p75: 1_700_000, p90: 2_000_000, alive: 1.00 },
  { age: 70, yr: 2036, p10: 700_000, p25: 950_000,  p50: 1_250_000, p75: 1_600_000, p90: 1_950_000, alive: 0.85 },
  { age: 80, yr: 2046, p10: 300_000, p25: 600_000,  p50: 900_000,   p75: 1_250_000, p90: 1_600_000, alive: 0.72 },
  { age: 90, yr: 2056, p10: 0,       p25: 10_000,   p50: 40_000,    p75: 120_000,   p90: 300_000,   alive: 0.40 },
];

const BASE = { inf: 0, useReal: false, ssAge: 67, rmdAge: 75, currentAge: 60, endAge: 90, totalPaths: 500, retireAge: 67 };

function open(props = {}) {
  const r = renderToNode(<MCBandTable pcts={PCTS} {...BASE} {...props} />);
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
  expect(cells).toBe(heads);
});

test("renders the Success Count from the RUN's path count, not the MC_PATHS constant", () => {
  const r = open({ totalPaths: 500 });
  expect(r.text).toContain("500/500");
  expect(r.text).toContain("425/500");
  expect(r.text).not.toContain("3,000");
  r.cleanup();
});

test("renders the Phase column from the effective retirement age", () => {
  const r = open({ retireAge: 67 });
  expect(r.text).toContain("Pre-Retirement");
  expect(r.text).toContain("Retirement");
  r.cleanup();
});

test("band labels come from the shared thresholds, not inline literals", () => {
  const r = open();
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

  expect(fullRows).toBe(31);
  expect(landRows).toBeLessThan(fullRows);
  expect(landRows).toBeGreaterThan(0);
  expect(landRows).toBe(8);
  expect(text).toMatch(/Landmark ages only/i);
});

test("landmarkOnly never renders an empty table when no landmark matches", () => {
  const odd = [
    { age: 61, yr: 2027, p10: 1, p25: 2, p50: 3, p75: 4, p90: 5, alive: 1 },
    { age: 62, yr: 2028, p10: 1, p25: 2, p50: 3, p75: 4, p90: 5, alive: 1 },
  ];
  const r = open({ pcts: odd, landmarkOnly: true, retireAge: 99, ssAge: 99, rmdAge: 99 });
  expect(document.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
  r.cleanup();
});
