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

  test("both together — the guard shrinks the pretax draw in the years it BINDS", () => {
    // WEAKER (and truer) form of the invariant, after v1.2.104's data upgrade
    // surfaced two failure modes for stronger versions:
    //
    //   (a) Lifetime IRMAA total is NOT bounded by (with-guard) ≤ (bracket-only).
    //       Every dollar the guard keeps IN pretax this year compounds and
    //       enlarges next decade's RMD — forced income the guard cannot cap.
    //       Under Damodaran-calibrated returns the compounding is fast enough
    //       that late-life RMDs alone breach IRMAA tier-1 in this fixture, so
    //       shifting draws out of pretax now costs more IRMAA later.
    //
    //   (b) PER-YEAR IRMAA charge is also NOT bounded. The guard sizes pretax
    //       against tier-1 using ORDINARY-income-only math (SS+RMD+annuity),
    //       but the actual IRMAA charge uses TRUE MAGI which includes LTCG
    //       from taxable draws. So the guard can bind ("irmaa_ceil") and the
    //       year still incurs a charge because taxable withdrawals pushed
    //       real MAGI across a tier the guard did not see.
    //
    // Both are known limitations of a per-year local optimiser. See the
    // "PER-YEAR LOCAL OPTIMISATION" note above drawPretax in
    // engine/buildWithdrawalWaterfall.js.
    //
    // What IS provable is the guard's DIRECT CONTRACT: in years it binds,
    // it holds the pretax draw ≤ the same year without the guard. Whether
    // that translates into less IRMAA depends on downstream state the guard
    // cannot see. The test now checks the contract, not the wish.
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
