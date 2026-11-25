import fs from "fs";
import { METRIC_CARDS, formulaFor, provenanceFor } from "./provenance.js";
import path from "path";

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

const RENDERED = SRC
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ")
  .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1");

describe("§28 — metric-card provenance registry", () => {
  test("every metric card in App.jsx is declared here", () => {
    const rendered = (SRC.match(/className="ml"/g) || []).length;
    expect(rendered).toBe(METRIC_CARDS.length);
  });

  test("the failure message explains itself", () => {
    const rendered = (SRC.match(/className="ml"/g) || []).length;
    const advice =
      "A metric card was added or removed in src/App.jsx without updating " +
      "METRIC_CARDS in src/provenance.test.js. Add an entry declaring the card's " +
      "label, its exact source expression, and its kind (computed / echoed / " +
      "point-in-time / count). If the value is ECHOED from user input, the label " +
      "must say so on screen; if it is POINT-IN-TIME, the label must name the age.";
    expect(rendered === METRIC_CARDS.length ? "" : advice).toBe("");
  });

  test("EVERY figure states its arithmetic in words a user can check", () => {
    METRIC_CARDS.forEach((c) => {
      expect(typeof c.formula).toBe("string");
      expect(c.formula.length).toBeGreaterThan(10);
      expect(c.formula).not.toMatch(/[a-zA-Z]\.[a-zA-Z]+\s*[/*+-]/);
      expect(c.formula).not.toMatch(/p\.|mc\.|params\./);
    });
  });

  test("EVERY card renders an explanation line on screen — none is bare", () => {
    const lines = SRC.split("\n");
    const bare = [];
    lines.forEach((l, i) => {
      if (!l.includes('className="ml"')) return;
      const block = lines.slice(i, i + 13).join("\n");
      if (!block.includes('className="ms"')) bare.push(i + 1);
    });
    expect(bare).toEqual([]);
  });

  test("displayed formulas come from the registry, not inlined per call site", () => {
    expect(SRC).toContain('import { formulaFor } from "./provenance.js"');
    expect((SRC.match(/formulaFor\(/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  test("every card has a stable unique id so a component can look it up", () => {
    const ids = METRIC_CARDS.map(c => c.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(formulaFor(ids[0])).toBe(METRIC_CARDS[0].formula);
    expect(provenanceFor("nope")).toBeNull();
  });

  test("every entry declares a label, a source and a valid kind", () => {
    const KINDS = new Set(["computed", "echoed", "point-in-time", "count"]);
    METRIC_CARDS.forEach((c, i) => {
      expect(typeof c.label).toBe("string");
      expect(c.label.length).toBeGreaterThan(0);
      expect(typeof c.source).toBe("string");
      expect(c.source.length).toBeGreaterThan(0);
      expect(KINDS.has(c.kind)).toBe(true);
      if (c.kind === "point-in-time") {
        expect(typeof c.at).toBe("string");
        expect(c.at.length).toBeGreaterThan(0);
      }
    });
  });

  test("no two entries share a label AND a source (copy-paste guard)", () => {
    const seen = new Set();
    METRIC_CARDS.forEach((c) => {
      const key = `${c.label}::${c.source}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
  });
});

describe("§28 — provenance regressions that already shipped once", () => {
  test('no card is captioned "Median accumulation" (it was a single projection)', () => {
    expect(RENDERED).not.toContain("Median accumulation");
  });

  test('the results bar does not call the user\'s own input "safe spend"', () => {
    expect(RENDERED).not.toMatch(/safe spend/i);
  });

  test("the spending target discloses its after-tax basis at the INPUT, not only in results", () => {
    expect(SRC).toMatch(/Enter what you want to spend — after tax/);
  });

  test("the income aggregate names its three components on screen", () => {
    expect(SRC).toContain("Income = Social Security + Pension/Other + Annuity/Rental");
  });

  test("no table header hides its explanation behind a hover-only title=", () => {
    const hoverOnlyHeaders = RENDERED.match(/<th[^>]*\stitle=/g) || [];
    expect(hoverOnlyHeaders).toEqual([]);
  });

  test("the click-open header component is actually in use", () => {
    expect((RENDERED.match(/<ThInfo/g) || []).length).toBeGreaterThanOrEqual(20);
  });

  test("Toggle hints open a modal rather than rendering a native tooltip", () => {
    expect(RENDERED).not.toMatch(/<div className="tog-row" title=/);
  });

  test("the WR column is a WITHDRAWAL rate, not a spending rate", () => {
    expect(RENDERED).not.toMatch(/spending\s*\/\s*r?\.?totalPort/);
    expect(RENDERED).toContain("r.totalWithdrawal / startPort");
  });

  test("money in metric cards goes through fmtDollar, not inline toLocaleString", () => {
    const badMv = RENDERED.match(/className="mv"[^>]*>\s*\$\{?[a-zA-Z.]+\.toLocaleString\(\)/g) || [];
    expect(badMv).toEqual([]);
  });
});
