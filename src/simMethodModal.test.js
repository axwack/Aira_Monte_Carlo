import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SimMethodModal } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderToText(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });
  const text = document.body.textContent || "";
  act(() => { root.unmount(); });
  container.remove();
  document.body.innerHTML = "";
  return text;
}

const PARAMS = { currentAge: 60, retireAge: 60, endAge: 92, smile: true, ab: 0 };
const HOW = { gk: "Guardrails raise or cut spending as the withdrawal rate drifts.", smart: "GK early, Bengen late." };

test("SimMethodModal mounts without throwing and renders its trigger", () => {
  let text;
  expect(() => {
    text = renderToText(
      <SimMethodModal
        params={PARAMS}
        withdrawalStrategy="gk"
        strategyHowItWorks={HOW}
        trigger={<span>ⓘ How this works</span>}
      />
    );
  }).not.toThrow();
  expect(text).toContain("How this works");
});

test("mounts for a non-GK strategy too (strategy label path)", () => {
  expect(() => {
    renderToText(
      <SimMethodModal
        params={PARAMS}
        withdrawalStrategy="smart"
        strategyHowItWorks={HOW}
        trigger={<span>info</span>}
      />
    );
  }).not.toThrow();
});

test("mounts with NO strategyHowItWorks prop — the hero ⓘ relies on the module-level default", () => {
  for (const s of ["gk", "smart", "bengen", "fixed", "vpw", "ninety_five_rule"]) {
    expect(() => {
      renderToText(
        <SimMethodModal params={PARAMS} withdrawalStrategy={s} trigger={<span>info</span>} />
      );
    }).not.toThrow();
  }
});
