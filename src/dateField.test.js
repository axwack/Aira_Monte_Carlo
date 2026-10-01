import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import DateField, { isCommittable } from "./DateField";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("isCommittable", () => {
  test("accepts cleared and plausible dates", () => {
    expect(isCommittable("")).toBe(true);
    expect(isCommittable("1985-03-10")).toBe(true);
  });
  test("rejects the intermediate years produced while typing", () => {
    ["0001-03-10", "0019-03-10", "0198-03-10", "1899-12-31"].forEach((v) => expect(isCommittable(v)).toBe(false));
  });
  test("rejects impossible dates and anything past max", () => {
    expect(isCommittable("2021-02-30")).toBe(false);
    expect(isCommittable("2999-01-01", "1900-01-01", "2026-10-01")).toBe(false);
    expect(isCommittable("2026-10-01", "1900-01-01", "2026-10-01")).toBe(true);
  });
});

test("DateField does not push half-typed years to the parent", () => {
  const calls = [];
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<DateField value="1980-06-15" onSet={(v) => calls.push(v)} />));
  const input = el.querySelector("input");
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  const type = (v) => act(() => { set.call(input, v); input.dispatchEvent(new Event("input", { bubbles: true })); });
  ["0001-06-15", "0019-06-15", "0198-06-15", "1985-06-15"].forEach(type);
  expect(calls).toEqual(["1985-06-15"]);
  act(() => root.unmount());
});
