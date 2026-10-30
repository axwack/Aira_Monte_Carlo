import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
const COLOR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([0-9., ]+\)/g;
const skip = (l) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l) || /^\s*--[a-z0-9-]+\s*:/.test(l); // comments and the theme's own definitions

// Colors should come from the theme (var(--positive), var(--accent-gold) ...) so one edit re-themes the app and
// contrast is checked in one place. This is a ratchet: a new literal color fails the build; after replacing
// some, lower MAX to the new count.
const MAX = 1066;

test("hard-coded colors in App.jsx never grow past the ratchet", () => {
  const n = SRC.split("\n").filter((l) => !skip(l)).reduce((sum, l) => sum + (l.match(COLOR) || []).length, 0);
  expect(n).toBeLessThanOrEqual(MAX);
});

test("the two retired literals stay out", () => {
  const body = SRC.split("\n").filter((l) => !skip(l)).join("\n");
  for (const c of ["#4fd88f", "#f4d35e", "#64748b", "#2563eb"]) expect(body).not.toContain(c);
});
