import fs from "fs";
import path from "path";
import { irmaaTargetRoom, runMC } from "./App";

// Request #38: IRMAA-Safe is a tier-1 MAGI limit. Monte Carlo used it as a
// taxable-income ceiling, so draws and conversions overshot by the deduction.
describe("IRMAA-Safe in Monte Carlo", () => {
  test("room is measured in MAGI space, with no deduction", () => {
    expect(irmaaTargetRoom("mfj", 1, 200_000)).toBe(18_000);
    expect(irmaaTargetRoom("single", 1, 100_000)).toBe(9_000);
    expect(irmaaTargetRoom("mfj", 1, 300_000)).toBe(0);
  });

  test("both call sites use it for the irmaa target, guard or not", () => {
    const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
    expect(SRC).toContain("const irmaaRoomMC = irmaaTargetRoom(filingStatus, inflFactor, taxResult.magi || 0);");
    expect(SRC).toContain('p.rothConversionTarget === "irmaa"\n          ? irmaaRoomMC');
    expect(SRC).toContain("if (irmaaOnMC || irmaaTargetMC) {");
    expect(SRC).toContain("bracketSetMC && !irmaaTargetMC");
  });

  test("with the guard on, a bracket-target conversion is also capped at tier 1", () => {
    const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
    expect(SRC).toContain("irmaaOnMC ? irmaaRoomMC : Infinity");
  });

  test("an IRMAA-Safe plan still runs", () => {
    const p = {
      currentAge: 64, retireAge: 64, endAge: 80, sp: 80_000, ssAge: 70, ssb: 40_000,
      inf: 2.5, tax: true, real: true, filingStatus: "mfj", stateOfResidence: "FL",
      rothConversionTarget: "irmaa", withdrawalBracketTarget: "irmaa", irmaaGuard: false,
      withdrawalOrder: ["cash", "taxable", "pretax", "roth"], preRetireEq: 60, postRetireEq: 60,
      spouse: { enabled: false },
      accounts: [
        { id: "1", category: "pretax", balance: 2_000_000 },
        { id: "2", category: "cash", balance: 300_000 },
      ],
    };
    const r = runMC(p, 80, 50);
    expect(r.rate).toBeGreaterThanOrEqual(0);
    expect(r.rate).toBeLessThanOrEqual(1);
  });
});
