import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { BucketLegend, BucketResetButton } from "./BucketLegend";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("bucket legend names all three time horizons", () => {
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<BucketLegend />));
  expect(el.textContent).toMatch(/Bucket 1.*Cash cushion/i);
  expect(el.textContent).toMatch(/Bucket 2.*Income bridge/i);
  expect(el.textContent).toMatch(/Bucket 3.*Growth/i);
  act(() => root.unmount());
});

test("reset button delegates to the category default bucket", () => {
  const calls = [];
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<BucketResetButton account={{ id: "ira", name: "IRA", category: "pretax", bucket: 3 }} onReset={(...args) => calls.push(args)} />));
  const button = el.querySelector("button");
  expect(button.getAttribute("aria-label")).toMatch(/category default/i);
  act(() => button.click());
  expect(calls).toEqual([["ira", 2]]);
  act(() => root.unmount());
});
