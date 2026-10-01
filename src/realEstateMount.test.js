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

test("Plan inputs has a Real Estate & Debt step that edits the profile (single source of truth)", () => {
  const home = { id: "p1", label: "Home", value: 400000, mortgage: 300000, income: 0 };
  const { el, root, calls } = mount({ ...BLANK_PROFILE, properties: [home], mortBalance: 300000 });
  ["Real Estate & Debt", "Gross value", "Mortgage balance", "Annual income (opt)", "Original term (yrs)", "Start date"]
    .forEach((t) => expect(el.textContent).toContain(t));
  // the app's own slider inputs, not bare number fields
  expect(el.querySelector('input[type="number"]')).toBeNull();
  act(() => Array.from(el.querySelectorAll("button")).find((b) => b.textContent.includes("Add property")).click());
  const props = calls.filter(([k]) => k === "properties").pop()[1];
  expect(props).toHaveLength(2);
  expect(props[0]).toEqual(home);
  act(() => root.unmount());
  el.remove();
});
