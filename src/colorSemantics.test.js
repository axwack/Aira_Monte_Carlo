import fs from "fs";
import path from "path";
import { bucketColor, BUCKET_COLORS } from "./engine/bucketColors";

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

// Approved scheme: green/amber/red = outcome only; calculated values neutral; things the user typed = accent blue.
test("withdrawal rate / worst case / runs-out figures are not status-colored", () => {
  expect(SRC).not.toMatch(/\+swr <= 3 \? "var\(--positive\)"/);
  expect(SRC).not.toMatch(/worst > 0 \? "var\(--accent-gold\)"/);
});
test("the spend target the user typed uses the input accent", () => {
  expect(SRC).toMatch(/color: "var\(--accent\)" \}\}>\$\{\(Math\.round\(params\.sp \/ 12\)\)/);
});
test("bucket cards read the shared table", () => {
  expect(SRC).toContain("color={bucketColor(1)}");
  expect(bucketColor(1)).toBe(BUCKET_COLORS.b1);
});
test("dark-theme muted text tokens meet contrast targets", () => {
  expect(SRC).toContain("--text-muted: #7f8b9c");
  expect(SRC).toContain("--text-faint: #778395");
});
