import React, { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import path from "path";
import { ProfileWizard, BLANK_PROFILE, PROFILE_STEP_SAVINGS } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

test("PROFILE_STEP_SAVINGS points at the Current Savings step", () => {
  const steps = SRC.slice(SRC.indexOf("const STEPS = ["));
  const labels = [...steps.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  expect(labels[PROFILE_STEP_SAVINGS]).toBe("Current Savings");
});

function mount(jumpTo) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const render = (j) => act(() => root.render(
    <ProfileWizard values={{ ...BLANK_PROFILE }} onChange={() => {}} onNavigateTab={() => {}} jumpTo={j} />));
  render(jumpTo);
  return { el, root, render };
}

test("opens on About You by default, on Current Savings when asked, and re-jumps on a new click", () => {
  const { el, root, render } = mount(undefined);
  expect(el.textContent).toContain("Who You Are");
  render({ step: PROFILE_STEP_SAVINGS, n: 1 });
  expect(el.textContent).not.toContain("Who You Are");
  // wander back to About You manually, then click the link again -> jumps again
  render({ step: 0, n: 2 });
  expect(el.textContent).toContain("Who You Are");
  render({ step: PROFILE_STEP_SAVINGS, n: 3 });
  expect(el.textContent).not.toContain("Who You Are");
  act(() => root.unmount());
  el.remove();
});
