import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ProfileWizard, BLANK_PROFILE, PROFILE_STEP_SPENDING } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(values) {
  const calls = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(
    <ProfileWizard values={values} onChange={(k, v) => calls.push([k, v])} onNavigateTab={() => {}} jumpTo={{ step: PROFILE_STEP_SPENDING, n: 1 }} />));
  return { el, root, calls };
}

test("typed budget lines go through the CSV import path into US spending", () => {
  const budgetLines = [
    { category: "Groceries", frequency: "Monthly", mustSpend: 800, likeToSpend: 1000 },
    { category: "Travel", frequency: "Annually", mustSpend: 8000, likeToSpend: 20000 },
  ];
  const { el, root, calls } = mount({ ...BLANK_PROFILE, budgetLines });
  act(() => el.querySelector('[data-testid="budget-apply"]').click());
  expect(calls).toContainEqual(["sp", 32000]);
  const meta = calls.filter(([k]) => k === "spImportMeta").pop()[1];
  expect(meta).toMatchObject({ mode: "single", total: 32000, essentialTotal: 17600, lineCount: 2 });
  act(() => root.unmount());
  el.remove();
});

test("an invalid line blocks applying the budget", () => {
  const { el, root } = mount({ ...BLANK_PROFILE, budgetLines: [{ category: "Travel", frequency: "Annually", mustSpend: 5000, likeToSpend: 4000 }] });
  expect(el.querySelector('[data-testid="budget-apply"]').disabled).toBe(true);
  act(() => root.unmount());
  el.remove();
});
