const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

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

  test("the always-visible short form carries the warning on its own", () => {
    const body = bodyOf("SectionDisclaimer");
    expect(body).toMatch(/Hypothetical model projections, not predictions/);
    expect(body).toMatch(/Consult a licensed professional before acting/);
    expect(body).toContain("aria-expanded={open}");
    expect(body).toMatch(/Full disclosure/);
  });

  test("Monte Carlo results carry an inline disclaimer", () => {
    expect(bodyOf("McTabDisclaimer")).toContain("<SectionDisclaimer>");
    expect(SRC).toContain("<McTabDisclaimer");
  });

  test("the withdrawal schedule carries an inline disclaimer", () => {
    expect(bodyOf("WithdrawalPlanCombined")).toContain("<SectionDisclaimer>");
  });

  test("the Monte Carlo notice refuses to call a success rate a prediction", () => {
    const body = bodyOf("McTabDisclaimer");
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
    const rendered = (CLIENT.match(/<AiOutputNotice \/>/g) || []).length;
    expect(rendered).toBeGreaterThanOrEqual(5);
  });

  test("the UI does not label model output as 'Advice'", () => {
    expect(CLIENT).not.toMatch(/>Advice:</);
    expect(CLIENT).not.toMatch(/for personalized advice/);
  });
});
