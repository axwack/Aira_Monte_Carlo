const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

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
  expect(bodyOf("MCTab")).not.toContain("<GuardrailsView");
  expect(SRC).toContain("<GuardrailsView");
});

test("the Guardrails view explains itself when the strategy has no guardrails", () => {
  expect(SRC).toMatch(/doesn’t use Guyton–Klinger guardrails/);
});

test("the disclaimer still mounts on the Monte Carlo tab", () => {
  expect(SRC).toContain("{mc && <McTabDisclaimer />}");
});

test("the sub-tabs use the app's OWN tab language — the teal underline, not a new idiom", () => {
  const start = SRC.indexOf('aria-label="Monte Carlo views"');
  expect(start).toBeGreaterThan(-1);
  const block = SRC.slice(start, start + 1800);
  expect(block).toContain("var(--accent-teal)");
  expect(block).toMatch(/borderBottom: `2px solid \$\{on \? "var\(--accent-teal\)" : "transparent"\}`/);
  expect(block).not.toContain("borderRadius: 9");
  expect(block).not.toMatch(/className=\{`mbtn/);
});

test("the sub-tabs stay subordinate to the top-level bar (size + fill)", () => {
  const start = SRC.indexOf('aria-label="Monte Carlo views"');
  const block = SRC.slice(start, start + 1800);
  expect(block).toContain('fontSize: "var(--fs-label)"');
  expect(block).toContain('background: "transparent"');
  expect(SRC).toMatch(/\.tab\.on \{[^}]*background:color-mix/);
});
