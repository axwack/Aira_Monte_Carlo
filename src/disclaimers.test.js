/**
 * Disclaimers must not disappear.
 *
 * The owner's exposure concern is being perceived as giving financial advice.
 * The two surfaces that most resemble advice — a success probability, and a
 * year-by-year schedule saying how much to take from which account — carry an
 * inline notice, and the footer carries an app-wide one. A refactor that moves
 * or rewrites those components could drop them silently, and nothing else in
 * the suite would notice, so this asserts on the source directly.
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

describe("advice disclaimers are present", () => {
  test("the shared SectionDisclaimer component exists and leads with the disclaimer", () => {
    const body = bodyOf("SectionDisclaimer");
    expect(body).toContain("Not financial advice.");
    expect(body).toContain('role="note"');
  });

  test("Monte Carlo results carry an inline disclaimer", () => {
    expect(bodyOf("MCTab")).toContain("<SectionDisclaimer>");
  });

  test("the withdrawal schedule carries an inline disclaimer", () => {
    expect(bodyOf("WithdrawalPlanCombined")).toContain("<SectionDisclaimer>");
  });

  test("the Monte Carlo notice refuses to call a success rate a prediction", () => {
    const body = bodyOf("MCTab");
    expect(body).toMatch(/not a prediction/i);
    expect(body).toMatch(/licensed/i);
  });

  test("the withdrawal notice disclaims acting on the specific amounts", () => {
    const body = bodyOf("WithdrawalPlanCombined");
    expect(body).toMatch(/not a recommendation/i);
    expect(body).toMatch(/licensed tax adviser|CPA|fiduciary/i);
  });

  test("the app-wide footer disclaimer survives", () => {
    expect(SRC).toContain("This is not financial advice.");
    expect(SRC).toMatch(/Seek a professional fiduciary, CPA, or tax accountant/);
  });
});
