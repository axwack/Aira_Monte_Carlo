import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ProfileWizard, BLANK_PROFILE, PROFILE_STEP_REAL_ESTATE } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(values) {
  const calls = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(
    <ProfileWizard values={values} onChange={(k, v) => calls.push([k, v])} onNavigateTab={() => {}} jumpTo={{ step: PROFILE_STEP_REAL_ESTATE, n: 1 }} />));
  return { el, root, calls };
}
const setInput = (input, v) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  act(() => { set.call(input, String(v)); input.dispatchEvent(new Event("input", { bubbles: true })); });
};

test("Plan inputs has a Real Estate & Debt step that edits the profile (single source of truth)", () => {
  const values = { ...BLANK_PROFILE, properties: [{ id: "p1", label: "Home", value: 400000, mortgage: 300000, income: 0 }], mortBalance: 300000 };
  const { el, root, calls } = mount(values);
  expect(el.textContent).toContain("Real Estate & Debt");
  setInput(el.querySelector('[data-testid="p1-mortgage"]'), 250000);
  const props = calls.filter(([k]) => k === "properties").pop();
  expect(props[1][0].mortgage).toBe(250000);
  // primary property's mortgage keeps the mortgage calculator balance in sync
  expect(calls).toContainEqual(["mortBalance", 250000]);
  setInput(el.querySelector('[data-testid="mortgage-term"]'), 25);
  expect(calls).toContainEqual(["mortTerm", 25]);
  act(() => root.unmount());
  el.remove();
});
