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

/**
 * The AI prompts and the AI output surface.
 *
 * "Fiduciary" is a legal term of art naming a duty of loyalty and care this
 * product does not assume. It sat in the system prompt of a PAID feature, in
 * two files, which both undercuts the disclaimers elsewhere and invites the
 * model to phrase output as advice. These lock the replacement in.
 */
describe("AI analysis does not claim to be advice", () => {
  const CLIENT = fs.readFileSync(path.join(__dirname, "ai/ai-analysis.js"), "utf8");
  const SERVER = fs.readFileSync(
    path.join(__dirname, "..", "functions/api/analyze.js"), "utf8");

  const personaOf = (src) => {
    const m = src.match(/^const AIRA_PERSONA = ".*";$/m);
    expect(m).not.toBeNull();
    return m[0];
  };

  test("no prompt calls Aira a fiduciary", () => {
    // The word legitimately appears in the comment explaining its removal, so
    // strip comment lines and assert only on live code.
    const codeOnly = (src) => src.split("\n")
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join("\n");
    for (const src of [CLIENT, SERVER]) {
      expect(codeOnly(src)).not.toMatch(/fiduciary/i);
    }
  });

  test("the persona disclaims advice and names the limits", () => {
    const persona = personaOf(CLIENT);
    expect(persona).toMatch(/NOT personalised financial, investment, tax, or legal advice/);
    expect(persona).toMatch(/never a recommendation to buy, sell, or hold/);
    expect(persona).toMatch(/licensed professional/);
  });

  test("client and server personas stay byte-identical", () => {
    expect(personaOf(CLIENT)).toBe(personaOf(SERVER));
  });

  test("generated output carries an inline notice wherever it renders", () => {
    expect(CLIENT).toContain("function AiOutputNotice()");
    expect(CLIENT).toMatch(/AI-generated — not financial advice/);
    // Every block that renders model output must include it.
    const rendered = (CLIENT.match(/<AiOutputNotice \/>/g) || []).length;
    expect(rendered).toBeGreaterThanOrEqual(5);
  });

  test("the UI does not label model output as 'Advice'", () => {
    expect(CLIENT).not.toMatch(/>Advice:</);
    expect(CLIENT).not.toMatch(/for personalized advice/);
  });
});
