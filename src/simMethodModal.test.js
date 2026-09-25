/**
 * Render smoke test — SimMethodModal (the "How this simulation works" modal
 * opened from the Success Rate card's ⓘ).
 *
 * The pool-stats box computes real min/max/mean over the imported SP500/BONDS/
 * INFL arrays, and the modal body's JSX (those toFixed calls, the 4-phase grid
 * reading strategyHowItWorks[strat]) is CONSTRUCTED during this component's
 * render — before InfoModal decides whether to show it — so a bad field or a
 * div-by-zero throws on mount even though the dialog starts closed. A plain
 * mount is enough to catch that (same house pattern as taxDetailsModal.test.js;
 * no @testing-library in this repo).
 */

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
// Minimal strategyHowItWorks map (the real one is MCTab-local; the modal only
// indexes it by the resolved strategy id and falls back to .gk).
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
  // Trigger is always rendered (the dialog body is behind a click).
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
  // The headline "Success to Age" ⓘ lives in the main component, which has no
  // MCTab-local strategy map to pass. It must fall back to STRATEGY_HOW_IT_WORKS
  // for every live strategy without throwing.
  for (const s of ["gk", "smart", "bengen", "fixed", "vpw", "ninety_five_rule"]) {
    expect(() => {
      renderToText(
        <SimMethodModal params={PARAMS} withdrawalStrategy={s} trigger={<span>info</span>} />
      );
    }).not.toThrow();
  }
});
