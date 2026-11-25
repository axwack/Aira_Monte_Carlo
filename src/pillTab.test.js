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
  expect((html.match(/border-bottom:2px solid var\(--accent-teal\)/g) || []).length).toBe(1);
  expect((html.match(/border-bottom:2px solid transparent/g) || []).length).toBe(2);
});

test("no fill and no border box — the previous treatment is gone", () => {
  const html = render();
  expect(html).not.toMatch(/background:rgba\([^)]*\)/);
  expect(html).toContain("background:transparent");
  expect(html).not.toMatch(/border:1px solid/);
  expect(html).not.toContain("scaleX");
});

test("the row paints one full-width hairline for the underline to sit on", () => {
  const html = render();
  expect(html).toContain('role="tablist"');
  expect(html).toContain("border-bottom:1px solid var(--divider)");
  expect(html).toContain("margin-bottom:-1px");
});

test("size controls density without changing the treatment", () => {
  const sm = render({ size: "sm" });
  const md = render();
  expect(sm).toContain("font-size:var(--fs-small)");
  expect(md).toContain("font-size:var(--fs-label)");
  expect(sm).toContain("border-bottom:2px solid var(--accent-teal)");
  expect(md).toContain("border-bottom:2px solid var(--accent-teal)");
});

test("accentFor keeps meaning-colours distinct per option", () => {
  const html = render({
    accentFor: (k) => ({ a: "var(--positive)", b: "var(--accent-gold)", c: "var(--negative)" }[k]),
  });
  expect(html).toContain("border-bottom:2px solid var(--accent-gold)");
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
