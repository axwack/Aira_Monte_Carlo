import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;
const isComment = (l) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l);

// Design #23: no emoji in the chrome (tabs, buttons, headings, labels). The ones left are status dots,
// table legends and data glyphs, still to be decided one by one. This is a ratchet: a new emoji line
// fails the build; after removing some, lower MAX to the new count so they cannot creep back.
const MAX = 145;

test("emoji lines in App.jsx never grow past the ratchet", () => {
  const lines = SRC.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => EMOJI.test(l) && !isComment(l));
  expect(lines.length).toBeLessThanOrEqual(MAX);
});

test("the Analysis sub-tabs and Roth view tabs carry plain sentence-case names", () => {
  const block = SRC.slice(SRC.indexOf("const SCENARIO_SUBTABS"), SRC.indexOf("const SCENARIO_SUBTABS") + 600);
  expect(block).not.toMatch(EMOJI);
  expect(block).not.toMatch(/"[A-Z]{3,}( [A-Z]{3,})*"/);
});
