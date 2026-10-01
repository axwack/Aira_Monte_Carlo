import React, { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import path from "path";
import { NavContext, GoStep } from "./NavContext";
import { PROFILE_STEP_SAVINGS, PROFILE_STEP_SPENDING, PROFILE_STEP_SETTINGS } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

test("no user-facing text still says 'Profile →' (the tab is Plan inputs)", () => {
  const lines = SRC.split("\n").filter((l) => /Profile →/.test(l) && !/^\s*(\/\/|\*|\{\/\*)/.test(l));
  expect(lines).toEqual([]);
});

test("step constants match the wizard order", () => {
  const steps = SRC.slice(SRC.indexOf("const STEPS = ["));
  const labels = [...steps.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  expect(labels[PROFILE_STEP_SAVINGS]).toBe("Current Savings");
  expect(labels[PROFILE_STEP_SPENDING]).toBe("Spending & Expenses");
  expect(labels[PROFILE_STEP_SETTINGS]).toBe("Settings");
});

test("GoStep navigates to Plan inputs at the requested step, and degrades to text without a provider", () => {
  const calls = [];
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<NavContext.Provider value={(...a) => calls.push(a)}><GoStep step={3}>Spend</GoStep></NavContext.Provider>));
  act(() => el.querySelector("button").click());
  expect(calls).toEqual([["assumptions", null, 3]]);
  act(() => root.render(<GoStep step={3}>Spend</GoStep>));
  expect(el.querySelector("button")).toBeNull();
  expect(el.textContent).toBe("Spend");
  act(() => root.unmount());
});
