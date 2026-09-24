/**
 * Monte Carlo sub-tabs — Simulation | Guardrails (Vincent, 2026-09-24).
 *
 * Structural test, in the style of disclaimers.test.js: the Monte Carlo tab is
 * assembled in the SHELL (MCTab + FanChart + MCBandTable + the disclaimer are
 * sibling children of `activeTab === "montecarlo"`), so the sub-tab bar has to
 * live there too.
 *
 * The regression this guards is specific and was live once: `GuardrailsView` sat
 * INSIDE MCTab. A sub-tab bar in MCTab therefore could not hide it, and the
 * Guardrails content appeared underneath the Simulation view as well — at which
 * point "tabs" is a lie and the user scrolls past the same section twice.
 *
 * It also pins the anti-dead-column rule (§41 §6): for a strategy with no
 * guardrails, GuardrailsView returns null. Rendering that bare would leave a
 * blank tab with no explanation, so the shell must say WHY it is empty.
 */

const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

/** Body of a top-level `function Name(` up to the next top-level function. */
function bodyOf(name) {
  const start = SRC.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = SRC.indexOf("\nfunction ", start + 1);
  return SRC.slice(start, next === -1 ? SRC.length : next);
}

test("the two sub-tabs exist and are driven by shell state", () => {
  expect(SRC).toContain('aria-label="Monte Carlo views"');
  expect(SRC).toContain('["simulation", "Simulation"]');
  expect(SRC).toContain('["guardrails", "Guardrails"]');
  expect(SRC).toMatch(/const \[mcView, setMcView\] = useState\("simulation"\)/);
});

test("GuardrailsView is NOT rendered inside MCTab — it would show under both views", () => {
  // The whole point of moving it: one render, inside the Guardrails branch only.
  expect(bodyOf("MCTab")).not.toContain("<GuardrailsView");
  // And it IS still rendered from the shell, so the view is not empty.
  expect(SRC).toContain("<GuardrailsView");
});

test("the Guardrails view explains itself when the strategy has no guardrails", () => {
  // anti-dead-column (§41 §6): never leave a tab blank with no reason.
  expect(SRC).toMatch(/doesn’t use Guyton–Klinger guardrails/);
});

test("the disclaimer still mounts on the Monte Carlo tab", () => {
  // The sub-tab split must not have stranded it inside one branch.
  expect(SRC).toContain("{mc && <McTabDisclaimer />}");
});

test("the sub-tabs use the app's OWN tab language — the teal underline, not a new idiom", () => {
  // Vincent, 2026-09-24: the first pass shipped a filled segmented control,
  // which was a fourth tab idiom in an app whose established one is the
  // underline. Consistency wins. This asserts the sub-tabs render the SAME
  // treatment as `.tab.on` (2px teal bottom border) rather than a filled track.
  const start = SRC.indexOf('aria-label="Monte Carlo views"');
  expect(start).toBeGreaterThan(-1);
  const block = SRC.slice(start, start + 1800);
  expect(block).toContain("var(--accent-teal)");
  expect(block).toMatch(/borderBottom: `2px solid \$\{on \? "var\(--accent-teal\)" : "transparent"\}`/);
  // The segmented-control chrome must be gone: no bordered track, no filled pill.
  expect(block).not.toContain("borderRadius: 9");
  expect(block).not.toMatch(/className=\{`mbtn/);
});

test("the sub-tabs stay subordinate to the top-level bar (size + fill)", () => {
  // Both levels now use the underline, so the hierarchy rests on the two axes
  // that remain: the top bar is 13px AND tints its active tab; the sub-tabs are
  // 12.5px and do not fill. Assert both, so a later restyle cannot flatten them
  // into one indistinguishable level (the v1.2.111 failure).
  const start = SRC.indexOf('aria-label="Monte Carlo views"');
  const block = SRC.slice(start, start + 1800);
  expect(block).toContain("fontSize: 12.5");
  expect(block).toContain('background: "transparent"');
  // The top-level bar keeps its tint, so the two levels differ by fill.
  expect(SRC).toMatch(/\.tab\.on \{[^}]*background:color-mix/);
});
