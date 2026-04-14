/**
 * Rudimentary check: are the yellow flag-w banners hardcoded with personal data?
 *
 * This test reads App.jsx as source text and asserts that the flag-w divs
 * contain known personal strings that should NOT be hardcoded.
 */

const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

// Find all flag-w div content blocks in the source
const FLAG_W_PATTERN = /className="flag-w"[^>]*>([\s\S]*?)<\/div>/g;
const flagWBlocks = [];
let match;
while ((match = FLAG_W_PATTERN.exec(SRC)) !== null) {
  flagWBlocks.push(match[1].trim());
}

describe("Yellow flag-w banners – personal data hardcoding check", () => {
  test("flag-w banners should exist", () => {
    expect(flagWBlocks.length).toBeGreaterThan(0);
  });

  test("flag-w banner should NOT contain hardcoded 'NJ domicile' (personal state info)", () => {
    const hasHardcodedNJ = flagWBlocks.some((b) => b.includes("NJ domicile"));
    if (hasHardcodedNJ) {
      console.warn(
        "PERSONAL DATA FOUND: 'NJ domicile' is hardcoded in a yellow flag-w banner."
      );
      console.warn("Matching block(s):", flagWBlocks.filter((b) => b.includes("NJ domicile")));
    }
    expect(hasHardcodedNJ).toBe(false);
  });

  test("flag-w banner should NOT contain hardcoded 'FL residency' deadline (personal relocation plan)", () => {
    const hasFL = flagWBlocks.some((b) => b.includes("FL residency") || b.includes("Dec 31, 2030"));
    if (hasFL) {
      console.warn(
        "PERSONAL DATA FOUND: FL residency deadline is hardcoded in a yellow flag-w banner."
      );
    }
    expect(hasFL).toBe(false);
  });

  test("flag-w banner should NOT contain hardcoded SS gap dates (personal SS timeline)", () => {
    // "SS gap" alone is acceptable in dynamic banners that use {p.retireAge}/{p.ssAge}.
    // Flag only hardcoded specific calendar dates like "Jan 2031".
    const hasSS = flagWBlocks.some((b) => b.includes("Jan 2031") || b.includes("Mar 2034"));
    if (hasSS) {
      console.warn(
        "PERSONAL DATA FOUND: Specific SS gap dates are hardcoded in a yellow flag-w banner."
      );
    }
    expect(hasSS).toBe(false);
  });
});
