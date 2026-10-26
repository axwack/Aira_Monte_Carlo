// Sequence replay (Stress Lab slice 2): paired historical years, start-today anchor.
import { runMC, historicalSequence } from "./App";

// Copy of App.jsx SEQ_2000_2012 (not exported there).
const SEQ_2000_2012 = [-0.091, -0.119, -0.221, 0.287, 0.109, 0.048, 0.158, 0.055, -0.37, 0.265, 0.151, 0.021, 0.16];

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

describe("historicalSequence", () => {
  test("2000 start reproduces the legacy 2000-2012 stocks to within rounding", () => {
    const s = historicalSequence(2000, 13);
    expect(s).toHaveLength(13);
    expect(s[0].year).toBe(2000);
    s.forEach((e, i) => expect(Math.abs(e.stock - SEQ_2000_2012[i])).toBeLessThan(0.006));
  });

  test("pairs bonds and inflation from the same year (2008)", () => {
    const e = historicalSequence(2008, 1)[0];
    expect(e.stock).toBeCloseTo(-0.3655, 4);
    expect(e.bond).toBeGreaterThan(0.15);
  });

  test("stops at the end of the dataset", () => {
    expect(historicalSequence(2024, 10)).toHaveLength(2);
  });
});

describe("runMC with a prescribed sequence", () => {
  test("a bare number and {stock} entry give identical results", () => {
    const a = runMC(P, 90, 300, 42, true, [-0.3, -0.2]);
    const b = runMC(P, 90, 300, 42, true, [{ stock: -0.3 }, { stock: -0.2 }]);
    expect(b.rate).toBe(a.rate);
    expect(b.medR).toBe(a.medR);
  });

  test("a paired history year changes the outcome vs random bonds/inflation", () => {
    const stocksOnly = runMC(P, 90, 300, 42, true, historicalSequence(1973, 5).map((e) => e.stock));
    const paired = runMC(P, 90, 300, 42, true, historicalSequence(1973, 5));
    expect(paired.term.p50).not.toBe(stocksOnly.term.p50);
  });

  test("starting today pushes the crash into the accumulation years", () => {
    const crash = [-0.4, -0.4];
    const atRetire = runMC(P, 90, 300, 42, true, crash, false);
    const today = runMC(P, 90, 300, 42, true, crash, true);
    // Hits 10 years earlier, so the portfolio at retirement is hurt and then regrows.
    expect(today.medR).toBeLessThan(atRetire.medR);
  });
});
