/**
 * PillTab — the shared pill idiom (REQUIREMENTS §41 §5 "no number exists in two
 * places", applied to chrome instead of data).
 *
 * Three groups of pills had three different active states, plus `.mbtn.on` as a
 * fourth. This pins the consolidation: one component renders all of them, so the
 * shape/weight/underline cannot drift apart the way the tab styles did before
 * `.tab::after` unified them.
 *
 * The part worth defending with a test is that semantic colour SURVIVES the
 * unification. Bracket-fill grades risk (green safe / amber caution / red 32%+)
 * and Tax Room's amber marks figures anchored to REAL entered income. Flattening
 * those to one accent would delete a warning, so `accentFor` keeps the hue and
 * only the chrome is shared.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PillTab } from "./App";

const OPTS = [["a", "Alpha"], ["b", "Beta"], ["c", "Gamma"]];
const render = (props = {}) =>
  renderToStaticMarkup(
    <PillTab options={OPTS} value="b" onChange={() => {}} {...props} />
  );

test("renders every option, marking exactly one selected", () => {
  const html = render();
  expect(html).toContain("Alpha");
  expect(html).toContain("Beta");
  expect(html.match(/aria-selected="true"/g) || []).toHaveLength(1);
  expect(html.match(/aria-selected="false"/g) || []).toHaveLength(2);
});

test("exposes a tablist for assistive tech", () => {
  const html = render({ ariaLabel: "My controls" });
  expect(html).toContain('role="tablist"');
  expect(html).toContain('aria-label="My controls"');
  expect((html.match(/role="tab"/g) || []).length).toBe(3);
});

test("the selected item carries the accent underline; unselected ones stay transparent", () => {
  const html = render();
  // Bare text on a hairline (image-2 treatment): the state is carried by a 2px
  // bottom border in the accent colour, NOT by a fill or a border box.
  expect((html.match(/border-bottom:2px solid var\(--accent-teal\)/g) || []).length).toBe(1);
  expect((html.match(/border-bottom:2px solid transparent/g) || []).length).toBe(2);
});

test("no fill and no border box — the previous treatment is gone", () => {
  const html = render();
  // The tinted-surface + coloured-border-box pass read as a wall of buttons and
  // was reverted on screen. Pin its absence so it cannot creep back.
  expect(html).not.toMatch(/background:rgba\([^)]*\)/);
  expect(html).toContain("background:transparent");
  expect(html).not.toMatch(/border:1px solid/);
  // And no leftover absolutely-positioned strip from the scaleX implementation.
  expect(html).not.toContain("scaleX");
});

test("the row paints one full-width hairline for the underline to sit on", () => {
  const html = render();
  expect(html).toContain('role="tablist"');
  expect(html).toContain("border-bottom:1px solid var(--divider)");
  // Items overlap the rule by a pixel so the active underline REPLACES the grey
  // line rather than floating above it.
  expect(html).toContain("margin-bottom:-1px");
});

test("size controls density without changing the treatment", () => {
  const sm = render({ size: "sm" });
  const md = render();
  expect(sm).toContain("font-size:11px");
  expect(md).toContain("font-size:12px");
  // Both keep the same underline mechanic.
  expect(sm).toContain("border-bottom:2px solid var(--accent-teal)");
  expect(md).toContain("border-bottom:2px solid var(--accent-teal)");
});

test("accentFor keeps meaning-colours distinct per option", () => {
  const html = render({
    accentFor: (k) => ({ a: "var(--positive)", b: "var(--accent-gold)", c: "var(--negative)" }[k]),
  });
  // The SELECTED one ("b") paints gold on its underline + text.
  expect(html).toContain("border-bottom:2px solid var(--accent-gold)");
  // And the mapping is consulted per key, not once globally.
  const withC = render({
    value: "c",
    accentFor: (k) => ({ a: "var(--positive)", b: "var(--accent-gold)", c: "var(--negative)" }[k]),
  });
  expect(withC).toContain("border-bottom:2px solid var(--negative)");
});

test("falls back to one accent when no semantic mapping is supplied", () => {
  const html = render();
  expect(html).toContain("border-bottom:2px solid var(--accent-teal)");
});

test("clicking an option reports its key", () => {
  const seen = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const { createRoot } = require("react-dom/client");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { act } = require("react");
  const root = createRoot(container);
  act(() => { root.render(<PillTab options={OPTS} value="a" onChange={(k) => seen.push(k)} />); });
  const buttons = [...container.querySelectorAll("button")];
  act(() => { buttons[2].dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  act(() => { root.unmount(); });
  container.remove();
  expect(seen).toEqual(["c"]);
});
