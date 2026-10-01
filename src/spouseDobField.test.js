import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SpouseDobField, { localTodayIso } from "./SpouseDobField";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("uses the guarded DateField with today's local date as max", () => {
  const calls = [];
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<SpouseDobField value="1985-03-10" onSet={(v) => calls.push(v)} hint="Their age drives their own milestones." />));
  const input = el.querySelector("input");
  expect(input.type).toBe("date");
  expect(input.value).toBe("1985-03-10");
  expect(input.max).toBe(localTodayIso());
  expect(el.textContent).toMatch(/own milestones/i);
  expect(input.style.width).toBe("130px");
  act(() => root.unmount());
});

test("does not commit an invalid future spouse birthday", () => {
  const calls = [];
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<SpouseDobField value="" onSet={(v) => calls.push(v)} />));
  const input = el.querySelector("input");
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  act(() => {
    set.call(input, "2999-01-01");
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(calls).toEqual([]);
  act(() => root.unmount());
});
