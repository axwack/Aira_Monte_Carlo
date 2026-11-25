import fs from "fs";
import path from "path";

const SRC_DIR = __dirname;

const SKIP_DIRS = new Set(["node_modules", "build", "__snapshots__"]);
const isTestFile = (name) => /\.test\.jsx?$/.test(name);
const isSourceFile = (name) => /\.(js|jsx)$/.test(name) && !isTestFile(name);

function listSourceFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out = out.concat(listSourceFiles(path.join(dir, entry.name)));
    } else if (isSourceFile(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const ALLOWED = {
  "App.jsx": [
    "pcts={stress.pcts}",
    "pcts={mc.pcts}",
    "const dollarBasis = dollarBasisLabel(real, mc?.pcts?.[0]?.age ?? effRetireAge);",
    "const dPcts = useMemo(() => (mc ? deflate(mc.pcts, inf, real) : []), [mc, inf, real]);",
    "medianTerminal: mc.term?.p50 ?? null,",
  ],
  "engine/mcSelectors.js": [
    "if (!mc?.pcts) return null;",
    "const pcts = real ? deflate(mc.pcts, inf, true) : mc.pcts;",
    "const mean = mc?.term?.mean;",
    "const i = pctRowIndexAtAge(mc?.pcts, age, retireAge);",
  ],
  "engine/explainScore.js": [
    "if (!mc || !Array.isArray(mc.pcts) || mc.pcts.length === 0) {",
  ],
  "report/PrintReport.jsx": [
    "{(mc.pcts || []).map((d) => {",
  ],
  "provenance.js": [
    'source: "max(mc.pcts[].p50)",',
  ],
};

function findRawMcReads(file) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  const pattern = /\b(?:mc|stress)\??\.(?:pcts|term)\b/;
  const hits = [];
  let inBlockComment = false;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*") || trimmed.startsWith("{/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (pattern.test(trimmed)) hits.push({ line: i + 1, text: trimmed });
  });
  return hits;
}

describe("no raw mc.pcts/mc.term/stress.pcts access outside selectPortfolioAtAge", () => {
  test("selectPortfolioAtAge, deflate, mcMedianAtAge still exist in engine/mcSelectors.js", () => {
    const src = fs.readFileSync(path.join(SRC_DIR, "engine", "mcSelectors.js"), "utf8");
    expect(src).toMatch(/export function selectPortfolioAtAge\(/);
    expect(src).toMatch(/export function deflate\(/);
    expect(src).toMatch(/export function mcMedianAtAge\(/);
  });

  test("every direct mc.pcts/mc.term/stress.pcts read, anywhere in src/, is on that file's allow-list", () => {
    const files = listSourceFiles(SRC_DIR);
    const unexpected = [];
    for (const file of files) {
      const rel = path.relative(SRC_DIR, file).split(path.sep).join("/");
      const allowedForFile = ALLOWED[rel] || [];
      for (const hit of findRawMcReads(file)) {
        if (!allowedForFile.includes(hit.text)) {
          unexpected.push({ file: rel, ...hit });
        }
      }
    }
    if (unexpected.length > 0) {
      const detail = unexpected.map((h) => `  src/${h.file}:${h.line}  ${h.text}`).join("\n");
      throw new Error(
        `Found ${unexpected.length} new direct read(s) of mc.pcts/mc.term/stress.pcts outside ` +
        `selectPortfolioAtAge():\n${detail}\n\n` +
        `If this is a dollar-value lookup, route it through selectPortfolioAtAge() from ` +
        `engine/mcSelectors.js instead — that's the whole point of this test (see its header ` +
        `comment). If it's a genuine exception, add the exact trimmed line to ALLOWED under ` +
        `that file's entry in src/noRawMcAccess.test.js, with a comment explaining why, and add ` +
        `a matching // eslint-disable-next-line no-restricted-properties in the source.`
      );
    }
  });
});
