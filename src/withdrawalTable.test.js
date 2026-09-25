/**
 * WaterfallPlanView — the year-by-year schedule: column parity, lens, and the
 * frozen-column contract (REQUIREMENTS §43, Track A).
 *
 * WHY THIS FILE EXISTS. The table's grouped header is correct only while the
 * sum of WF_SEGMENTS spans equals the number of columns actually rendered
 * beneath it. A column added without updating a span does not fail, does not
 * warn, and does not look broken: it shifts every money column one place to the
 * right, so "Pre-Tax" prints the Cash figure and the whole accounting identity
 * silently lies. Nothing but a test can catch that, which is why R6 exists.
 *
 * The three-way equality below is the guard:
 *
 *     Σ visible WF_SEGMENTS spans  ===  header cells  ===  cells in every body row
 *
 * The middle-vs-right comparison catches a column added to the body without the
 * header; the left-vs-middle comparison catches a span edited to the wrong
 * number. Either one alone is satisfiable by a wrong table.
 *
 * Also pinned here (§43 refusals and amendments): no Month column, exactly one
 * Tax-details trigger per row and it lives in the trailing actions column, the
 * stated basis is nominal, the default lens is Flows with "All columns" always
 * reachable, and landmine rows stay visible in that default lens.
 *
 * DOM tests run through react-dom/client into jsdom (no @testing-library in this
 * project — it is deliberately not a dependency). jsdom has NO LAYOUT, so
 * "the Age cell is sticky" cannot be asserted from computed style; per the
 * design-authority amendment to R6(d) the class/attribute is asserted here and
 * the CSS rule itself is guarded by a text-parse below.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "fs";
import { join } from "path";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import {
  WaterfallPlanView,
  WF_SEGMENTS,
  WF_BASIS_REAL,
  WF_VIEW_DEFAULT,
  WF_VIEW_STORAGE_KEY,
} from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A conventional retirement profile with all four buckets funded, so the
// waterfall produces real draws, real gains and a real RMD year.
const P = {
  currentAge: 60,
  retireAge: 60,
  endAge: 92,
  // A generic birth year, deliberately NOT any real profile's. This project
  // forbids embedding user-specific values outside data/profile.json, and an
  // RMD-start year is exactly the kind of thing a copied DOB would smuggle in.
  dob: "1965-06-15",
  birthYear: 1965,
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

// A conversion year makes the `conv` segment visible, which is the widest case
// (all ten segments, 24 columns). The no-conversion case is asserted separately
// because "visible" spans — not the raw array — are what the header must match.
const WITH_CONV = { ...P, rothConversionTarget: "22" };
const NO_CONV = { ...P, rothConversionTarget: "off" };

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<WaterfallPlanView {...props} />); });
  return {
    container,
    table: container.querySelector("table.wf-tbl"),
    cleanup() {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}

const view = (p) => mount({ p, result: buildWithdrawalWaterfall(p) });

/** The segments the table actually renders for this profile. */
function visibleSegments(p) {
  const hasConversion = buildWithdrawalWaterfall(p).smart.rows.some((r) => r.conversionAmount > 0);
  return WF_SEGMENTS.filter((s) => s.key !== "conv" || hasConversion);
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* jsdom always has it; be safe */ }
});

afterEach(() => {
  document.body.innerHTML = "";
});

// ─── R6(a): the parity guard ──────────────────────────────────────────────────

describe("WaterfallPlanView — column parity", () => {
  test("span sum, header cells and every body row agree (conversion year, 24 columns)", () => {
    const p = WITH_CONV;
    const { table, cleanup } = view(p);

    const segments = visibleSegments(p);
    const spanSum = segments.reduce((n, s) => n + s.span, 0);
    expect(segments).toHaveLength(WF_SEGMENTS.length); // every segment visible
    expect(spanSum).toBe(24);

    const headerRows = table.querySelectorAll("thead tr");
    expect(headerRows).toHaveLength(2);
    const headerCells = headerRows[1].querySelectorAll("th");
    expect(headerCells).toHaveLength(spanSum);

    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBeGreaterThan(20);
    for (const tr of bodyRows) {
      expect(tr.querySelectorAll("td")).toHaveLength(spanSum);
    }

    // The grouped row must account for the same columns as the leaf row.
    const grouped = [...headerRows[0].querySelectorAll("th")];
    const groupedSum = grouped.reduce((n, th) => n + Number(th.getAttribute("colspan") || 1), 0);
    expect(groupedSum).toBe(spanSum);

    cleanup();
  });

  test("a profile with no Roth conversion drops exactly the conv column (23 columns)", () => {
    const p = NO_CONV;
    const { table, cleanup } = view(p);

    const segments = visibleSegments(p);
    const spanSum = segments.reduce((n, s) => n + s.span, 0);
    expect(segments).toHaveLength(WF_SEGMENTS.length - 1);
    expect(spanSum).toBe(23);

    const headerCells = table.querySelectorAll("thead tr")[1].querySelectorAll("th");
    expect(headerCells).toHaveLength(spanSum);
    for (const tr of table.querySelectorAll("tbody tr")) {
      expect(tr.querySelectorAll("td")).toHaveLength(spanSum);
    }
    expect(table.querySelector('[data-cg="conv"]')).toBeNull();

    cleanup();
  });

  // R6(b): a column tagged with a group that WF_SEGMENTS does not declare is
  // invisible to every lens rule, so it can never be hidden and never gets a
  // group header — the same class of defect as a wrong span.
  test("every header and body cell carries a data-cg declared in WF_SEGMENTS", () => {
    const { table, cleanup } = view(WITH_CONV);
    const declared = new Set(WF_SEGMENTS.map((s) => s.cg));

    const cells = [...table.querySelectorAll("th"), ...table.querySelectorAll("td")];
    expect(cells.length).toBeGreaterThan(100);
    for (const cell of cells) {
      const cg = cell.getAttribute("data-cg");
      expect(cg).toBeTruthy();
      expect(declared.has(cg)).toBe(true);
    }

    cleanup();
  });
});

// ─── §43 refusals ─────────────────────────────────────────────────────────────

test("there is no Month column — the engines emit one row per year", () => {
  const { table, cleanup } = view(WITH_CONV);
  const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
  expect(headers).not.toContain("Month");
  expect(headers.some((h) => /^month$/i.test(h))).toBe(false);
  cleanup();
});

// ─── R3: one trigger, in the actions column ───────────────────────────────────

test("exactly one Tax details trigger per row, and it lives in the act column (R3)", () => {
  const { table, cleanup } = view(WITH_CONV);

  const bodyRows = [...table.querySelectorAll("tbody tr")];
  expect(bodyRows.length).toBeGreaterThan(20);

  const triggers = [...table.querySelectorAll("button")].filter((b) =>
    /tax details/i.test(b.textContent || ""));
  expect(triggers).toHaveLength(bodyRows.length);

  for (const tr of bodyRows) {
    const inRow = [...tr.querySelectorAll("button")].filter((b) =>
      /tax details/i.test(b.textContent || ""));
    expect(inRow).toHaveLength(1);
    // Moved, not duplicated: the trigger's cell is the trailing one, and the
    // tax columns carry no button at all any more.
    expect(inRow[0].closest("td").getAttribute("data-cg")).toBe("act");
  }
  expect(table.querySelectorAll('td[data-cg="tax"] button')).toHaveLength(0);

  // Every trigger keeps the year in its accessible name.
  for (const b of triggers) {
    expect(b.getAttribute("aria-label")).toMatch(/^Tax details for age \d+ \(\d{4}\)$/);
  }

  cleanup();
});

// ─── R5: stated basis ─────────────────────────────────────────────────────────

test("the table states its dollar basis, and it is the nominal one (R5)", () => {
  expect(WF_BASIS_REAL).toBe(false); // the resolved decision: nominal, not toggled

  const { container, cleanup } = view(WITH_CONV);
  const text = container.textContent || "";
  expect(text).toContain("Future Dollars");
  expect(text).not.toContain("Today's Dollars");
  cleanup();
});

// ─── R1: frozen column contract ───────────────────────────────────────────────

describe("frozen Age column (R1)", () => {
  test("the Age cell is present in both header rows and in every body row", () => {
    const { table, cleanup } = view(WITH_CONV);
    const headerRows = table.querySelectorAll("thead tr");
    expect(headerRows[0].querySelector('[data-cg="time"]')).not.toBeNull();
    expect(headerRows[1].querySelector('[data-cg="time"]')).not.toBeNull();
    for (const tr of table.querySelectorAll("tbody tr")) {
      expect(tr.querySelector('td[data-cg="time"]')).not.toBeNull();
    }
    cleanup();
  });

  test("the table sits in a keyboard-reachable, labelled scroll region", () => {
    const { container, cleanup } = view(WITH_CONV);
    const region = container.querySelector(".wf-scroll");
    expect(region).not.toBeNull();
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("aria-label")).toMatch(/withdrawal schedule/i);
    expect(region.querySelector("table.wf-tbl")).not.toBeNull();
    cleanup();
  });

  // The sticky fill and the row stripe are ONE value by construction. If a row
  // goes back to an inline background, the frozen cell stops matching its row
  // and content slides visibly underneath it — the classic sticky bleed bug.
  test("row fills come from the shared variable, never an inline background", () => {
    const { table, cleanup } = view(WITH_CONV);
    for (const tr of table.querySelectorAll("tbody tr")) {
      const style = tr.getAttribute("style") || "";
      expect(style).not.toMatch(/background/i);
    }
    // And a landmine row is marked by class, which is what carries the fill.
    expect(table.querySelectorAll("tbody tr.wf-landmine").length).toBeGreaterThan(0);
    cleanup();
  });

  // jsdom cannot compute layout, so the CSS rule itself is guarded textually:
  // position:sticky on the time cells, and the numeric layer ordering the
  // amendment requires (frozen header above body sticky, above the operators).
  test("the stylesheet declares sticky time cells with explicit layer numbers", () => {
    const src = readFileSync(join(__dirname, "App.jsx"), "utf8");
    expect(src).toMatch(/\.wf-tbl \[data-cg="time"\] \{[^}]*position:sticky/);
    expect(src).toMatch(/\.wf-tbl thead \[data-cg="time"\] \{ z-index:4; \}/);
    expect(src).toMatch(/\.wf-tbl tbody \[data-cg="time"\] \{ z-index:2; \}/);
    // Sticky borders do not paint under border-collapse:collapse.
    expect(src).toMatch(/\.wf-tbl \{[^}]*border-collapse:separate/);
    // The second header row's offset must come from the declared group-row
    // height, not a second hand-written number that can drift away from it.
    expect(src).toMatch(/--wf-grp-h:\d+px/);
    expect(src).toMatch(/\.wf-tbl thead tr:nth-child\(2\) th \{ top:var\(--wf-grp-h\); \}/);
    expect(src).toMatch(/\.wf-grp \{[^}]*line-height:1;/);
  });
});

// ─── R4: lenses ───────────────────────────────────────────────────────────────

describe("lenses (R4)", () => {
  test("the default lens is Flows (progressive disclosure)", () => {
    const { table, cleanup } = view(WITH_CONV);
    expect(WF_VIEW_DEFAULT).toBe("flows");
    expect(table.getAttribute("data-view")).toBe(WF_VIEW_DEFAULT);
    cleanup();
  });

  test("All columns stays a permanent control, and switching the lens works", () => {
    const { container, table, cleanup } = view(WITH_CONV);
    const labels = [...container.querySelectorAll(".wf-views button")].map((b) => b.textContent.trim());
    expect(labels).toContain("All columns");
    expect(labels).toHaveLength(4); // all four lenses offered, no hidden mode

    const allBtn = [...container.querySelectorAll(".wf-views button")]
      .find((b) => b.textContent.trim() === "All columns");
    act(() => { allBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(table.getAttribute("data-view")).toBe("all");

    // Parity is a property of the markup, so it must survive a lens switch.
    const spanSum = visibleSegments(WITH_CONV).reduce((n, s) => n + s.span, 0);
    for (const tr of table.querySelectorAll("tbody tr")) {
      expect(tr.querySelectorAll("td")).toHaveLength(spanSum);
    }
    cleanup();
  });

  test("a persisted lens overrides the default", () => {
    window.localStorage.setItem(WF_VIEW_STORAGE_KEY, "tax");
    const { table, cleanup } = view(WITH_CONV);
    expect(table.getAttribute("data-view")).toBe("tax");
    cleanup();
  });

  test("a garbage persisted value falls back to the default instead of blanking the table", () => {
    window.localStorage.setItem(WF_VIEW_STORAGE_KEY, "not-a-lens");
    const { table, cleanup } = view(WITH_CONV);
    expect(table.getAttribute("data-view")).toBe(WF_VIEW_DEFAULT);
    cleanup();
  });

  // Landmines must not be invisible in the default view. The Risk group is
  // hidden in Flows, so the marker rides in the frozen Age cell instead.
  test("landmine years are marked in the frozen column, with a label", () => {
    const { table, cleanup } = view(WITH_CONV);
    expect(table.getAttribute("data-view")).toBe("flows");

    const dots = [...table.querySelectorAll("tbody .wf-risk-dot")];
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      const label = dot.getAttribute("aria-label");
      expect(label).toBeTruthy();
      expect(label).toMatch(/^Tax risk this year: .+/);
    }
    // Every flagged row has a dot, and no unflagged row does.
    for (const tr of table.querySelectorAll("tbody tr")) {
      const flagged = tr.classList.contains("wf-landmine");
      expect(tr.querySelectorAll(".wf-risk-dot").length).toBe(flagged ? 1 : 0);
    }
    cleanup();
  });
});
