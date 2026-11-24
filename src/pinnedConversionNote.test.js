import fs from "fs";
import path from "path";
import { pinnedConversionNote } from "./App";

// Monte Carlo ignores manual conversion pins, so the verdict strip must say so.
describe("pinned-conversion label on the verdict strip", () => {
  test("no pins, no label", () => {
    expect(pinnedConversionNote(0)).toBeNull();
  });

  test("names the count and singular/plural", () => {
    expect(pinnedConversionNote(1)).toMatch(/Ignores Your 1 Pinned Conversion:/);
    expect(pinnedConversionNote(3)).toMatch(/Ignores Your 3 Pinned Conversions:/);
  });

  test("the strip is fed the pin count", () => {
    const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
    expect(SRC).toContain("pinnedConversions={(params.conversionOverrides || []).length}");
  });
});
