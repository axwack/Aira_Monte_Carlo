// Flat "return until retirement" assumption (Stress Lab slice 1).
import { runMC, simulateDeterministicWithStrategy } from "./App";

const P = {
  currentAge: 55, retireAge: 65, endAge: 90,
  sp: 80_000, ssAge: 67, ssb: 36_000, inf: 2.5,
  filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
  port: 900_000,
  accounts: [
    { id: "1", category: "pretax", name: "IRA",  balance: 800_000 },
    { id: "2", category: "cash",   name: "Cash", balance: 100_000 },
  ],
};

describe("preRetireReturn", () => {
  test("blank / null / NaN reproduce today's numbers exactly", () => {
    const base = runMC(P, 90, 300, 42, true);
    for (const v of [undefined, null, "", "abc"]) {
      const r = runMC({ ...P, preRetireReturn: v }, 90, 300, 42, true);
      expect(r.medR).toBe(base.medR);
      expect(r.rate).toBe(base.rate);
    }
  });

  test("0% flat with no contributions: portfolio at retirement equals today's balance", () => {
    const r = runMC({ ...P, preRetireReturn: 0 }, 90, 300, 42, true);
    expect(r.medR).toBe(900_000);
    const d = simulateDeterministicWithStrategy({ ...P, preRetireReturn: 0 }, 2.5, "gk");
    expect(d.portAtRetire).toBe(900_000);
  });

  test("a flat 5% is deterministic across paths", () => {
    const r = runMC({ ...P, preRetireReturn: 5 }, 90, 300, 42, true);
    expect(r.medR).toBe(Math.round(900_000 * 1.05 ** 10));
  });
});
