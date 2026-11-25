import { runMC } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

const BASE = {
  currentAge: 65, retireAge: 65, endAge: 85,
  port: 3_000_000, sp: 180_000, ssAge: 67, ssb: 30_000, ssCola: 2.4,
  inf: 2.5, smile: false, tax: true, real: false,
  filingStatus: "single", stateOfResidence: "FL",
  gkFloor: 100_000, gkCeiling: 250_000,
  withdrawalStrategy: "gk", rothConversionTarget: "off",
  ssTorpedoGuard: false, rothEmergencyReserve: 0,
  orderingMode: "tax_reactive", withdrawalOrder: ["cash", "taxable", "pretax", "roth"],
  preRetireEq: 91, postRetireEq: 70, hcProb: 0,
  birthYear: 1961, spouse: { enabled: false },
  accounts: [
    { id: "1", category: "pretax", name: "IRA",      balance: 2_000_000 },
    { id: "2", category: "roth",   name: "Roth IRA", balance: 1_500_000 },
  ],
};

const irmaaTotal = (p) =>
  buildWithdrawalWaterfall(p).smart.rows.reduce((s, r) => s + (r.irmaa || 0), 0);

describe("irmaaGuard with the bracket target OFF", () => {
  test("THE GHOST: the guard now changes the plan when the target is off", () => {
    const off = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: false };
    const on  = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: true  };
    expect(irmaaTotal(on)).not.toBe(irmaaTotal(off));
  });

  test("and it reduces IRMAA charges, which is its entire purpose", () => {
    const off = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: false };
    const on  = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: true  };
    expect(irmaaTotal(on)).toBeLessThan(irmaaTotal(off));
  });

  test("it labels the years it bound", () => {
    const on = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: true };
    const rows = buildWithdrawalWaterfall(on).smart.rows;
    expect(rows.some(r => r.pretaxCapReason === "irmaa_ceil")).toBe(true);
  });
});

describe("decoupling must not create false failures", () => {
  test("the guard alone cannot fail a solvent plan", () => {
    const on = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: true };
    expect(runMC(on, 85, 300, 42, true).rate).toBeGreaterThan(0.8);
  });

  test("guard OFF and target OFF leaves draws completely uncapped", () => {
    const none = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: false };
    const rows = buildWithdrawalWaterfall(none).smart.rows;
    expect(rows.every(r => r.pretaxCapReason !== "irmaa_ceil")).toBe(true);
  });

  test("both together — the guard shrinks the pretax draw in the years it BINDS", () => {
    const both = { ...BASE, withdrawalBracketTarget: "22", irmaaGuard: true };
    const bracketOnly = { ...BASE, withdrawalBracketTarget: "22", irmaaGuard: false };
    const bothRows = buildWithdrawalWaterfall(both).smart.rows;
    const bracketRows = buildWithdrawalWaterfall(bracketOnly).smart.rows;
    const boundYears = bothRows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.pretaxCapReason === "irmaa_ceil");
    expect(boundYears.length).toBeGreaterThan(0);
    for (const { r, i } of boundYears) {
      const otherPretax = bracketRows[i]?.fromPretax || 0;
      expect(r.fromPretax || 0).toBeLessThanOrEqual(otherPretax);
    }
  });
});
