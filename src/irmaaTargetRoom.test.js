import fs from "fs";
import path from "path";
import { irmaaTargetRoom, shrinkToIrmaaCap, calcYearTax } from "./App";

// IRMAA tier 1 is a MAGI limit (request #38). A conversion also makes more
// Social Security taxable, so sizing from pre-conversion MAGI alone overshoots.
describe("IRMAA cap in Monte Carlo", () => {
  test("room is measured in MAGI space, with no deduction", () => {
    expect(irmaaTargetRoom("mfj", 1, 200_000)).toBe(18_000);
    expect(irmaaTargetRoom("single", 1, 100_000)).toBe(9_000);
    expect(irmaaTargetRoom("mfj", 1, 300_000)).toBe(0);
  });

  test("a conversion that makes more Social Security taxable is shrunk to fit tier 1", () => {
    // MFJ, $80k Social Security, $20k other income, no gains.
    const magiFor = (conv) => calcYearTax(66, 2026, 0, 80_000, 20_000, 0, conv, false, 0.025, "mfj", "FL").magi;
    const room = irmaaTargetRoom("mfj", 1, magiFor(0));
    expect(magiFor(room)).toBeGreaterThan(218_000);          // the old sizing overshoots

    const conv = shrinkToIrmaaCap(room, magiFor, 218_000);
    expect(magiFor(conv)).toBeLessThanOrEqual(218_000);
    expect(magiFor(conv)).toBeGreaterThan(200_000);          // not shrunk far below the cap
  });

  test("runMC applies the cap for IRMAA-Safe and for the guard", () => {
    const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
    expect(SRC).toMatch(/if \(p\.rothConversionTarget === "irmaa" \|\| irmaaOnMC\) \{\s*convAmt = shrinkToIrmaaCap\(/);
  });
});
