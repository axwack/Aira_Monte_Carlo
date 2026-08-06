/**
 * The IRMAA guard must work on its own.
 *
 * Found by the tester agent while auditing the bracket-cap fix: in BOTH engines
 * the entire IRMAA-guard block was nested inside
 *
 *     if (withdrawalBracketTarget && withdrawalBracketTarget !== "off") { ... }
 *
 * so ticking "protect me from IRMAA" did nothing at all whenever the bracket
 * target was "off". Verified byte-identical output with the guard on and off — a
 * ghost setting of exactly the kind src/ghostSettings.test.js exists to catch,
 * and it silently withheld protection a user had explicitly asked for.
 *
 * Safe to decouple only because the essential-spending override (§33) now stops
 * any cap from starving a solvent household; before that, giving the IRMAA guard
 * teeth would have created new false failures.
 */

import { runMC } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

// Enough pre-tax income to push MAGI past the IRMAA tier-1 threshold, and old
// enough for the guard to be active (age >= 63).
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
  // A large Roth alongside the pre-tax is essential to this fixture. When the
  // guard caps the pre-tax draw, the remainder has to come from SOMEWHERE — and
  // Roth is tax-free and MAGI-free, so the cap can actually lower IRMAA. With
  // pre-tax as the only source the §33 override correctly overrides the cap
  // immediately (spending must be funded), and the guard can have no effect. That
  // is not a bug in the guard; it is what "the cap is a preference" means.
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
    // Previously byte-identical. The guard must now actually cap draws.
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
    // The §33 override is what makes this safe: a cap may raise the tax bill, it
    // may never make spending unfundable.
    const on = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: true };
    expect(runMC(on, 85, 300, 42, true).rate).toBeGreaterThan(0.8);
  });

  test("guard OFF and target OFF leaves draws completely uncapped", () => {
    const none = { ...BASE, withdrawalBracketTarget: "off", irmaaGuard: false };
    const rows = buildWithdrawalWaterfall(none).smart.rows;
    expect(rows.every(r => r.pretaxCapReason !== "irmaa_ceil")).toBe(true);
  });

  test("both together still take the tighter ceiling", () => {
    const both = { ...BASE, withdrawalBracketTarget: "22", irmaaGuard: true };
    const bracketOnly = { ...BASE, withdrawalBracketTarget: "22", irmaaGuard: false };
    expect(irmaaTotal(both)).toBeLessThanOrEqual(irmaaTotal(bracketOnly));
  });
});
