// Failed-path drill-down (Stress Lab slice 3): runMC(..., keepFailures).
import { runMC } from "./App";

const P = {
  currentAge: 65, retireAge: 65, endAge: 95,
  sp: 120_000, ssAge: 67, ssb: 30_000, inf: 2.5,
  filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
  port: 1_000_000,
  accounts: [
    { id: "1", category: "pretax", name: "IRA",  balance: 900_000 },
    { id: "2", category: "cash",   name: "Cash", balance: 100_000 },
  ],
};

describe("keepFailures", () => {
  const off = runMC(P, 95, 400, 42, true);
  const on = runMC(P, 95, 400, 42, true, null, false, true);

  test("turning it on changes no headline number and is null when off", () => {
    expect(off.failures).toBeNull();
    expect(on.rate).toBe(off.rate);
    expect(on.medR).toBe(off.medR);
    expect(on.term).toEqual(off.term);
  });

  test("plan fails often enough to test; worst <= typical <= closest by exhaust age", () => {
    expect(on.failures.count).toBe(Math.round((1 - on.rate) * 400));
    const { worst, typical, closest } = on.failures;
    expect(worst.exhaustAge).toBeLessThanOrEqual(typical.exhaustAge);
    expect(typical.exhaustAge).toBeLessThanOrEqual(closest.exhaustAge);
  });

  test("rows chain year to year and end at the exhaust age with nothing left", () => {
    for (const f of Object.values({ w: on.failures.worst, t: on.failures.typical, c: on.failures.closest })) {
      const rows = f.rows;
      expect(rows.at(-1).age).toBe(f.exhaustAge);
      expect(rows.at(-1).end).toBeLessThanOrEqual(1);
      for (let k = 1; k < rows.length; k++) expect(Math.abs(rows[k].start - rows[k - 1].end)).toBeLessThanOrEqual(1);
      rows.forEach((r) => expect(Number.isFinite(r.stock) && Number.isFinite(r.ret) && Number.isFinite(r.infl)).toBe(true));
    }
  });
});
