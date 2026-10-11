/**
 * A field set to 0 must stay 0. `p.inf || 2.5` (and the same on abGrowth and
 * mortRate) used to turn a real 0 into the default: 0% inflation ran at 2.5%,
 * flat rental/other income grew 3%/yr, a 0% mortgage was charged 6.5%.
 * With the bug, each pair below came out identical; same seed, so any
 * difference is the input alone.
 */
import { runMC } from "./App";

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
const run = (over) => runMC({ ...P, ...over }, 90, 200, 42, true);

describe("zero inputs are not replaced by defaults", () => {
  test("inf: 0% lands next to 0.001%, not next to the 2.5 default", () => {
    // Some paths already used a real 0, so "0 differs from 2.5" proved nothing. Continuity does:
    // with the bug, 0 jumped to 2.5% in the fixed places and broke away from 0.001%.
    const zero = run({ inf: 0 }).term.p50;
    const tiny = run({ inf: 0.001 }).term.p50;
    expect(Math.abs(zero - tiny) / tiny).toBeLessThan(0.001);
  });

  test("abGrowth: 0 keeps rental income flat (less than 3%/yr growth)", () => {
    // Rental income only flows in retirement, so compare end-of-plan wealth, not medR (at retirement).
    const flat = run({ propIncome: 30_000, abGrowth: 0 });
    const grown = run({ propIncome: 30_000, abGrowth: 3 });
    expect(flat.term.p50).toBeLessThan(grown.term.p50);
  });

  test("mortRate: a 0% mortgage costs less than the 6.5% default", () => {
    const mort = { mortBalance: 200_000, mortStart: "2024-01", mortTerm: 30, mortExtra: 0 };
    const free = run({ ...mort, mortRate: 0 });
    const charged = run({ ...mort, mortRate: 6.5 });
    expect(free.medR).toBeGreaterThan(charged.medR);
  });
});
