import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

const BASE = {
  currentAge: 65, retireAge: 65, endAge: 90,
  sp: 80_000, ssAge: 67, ssb: 24_000, ssCola: 2.4,
  ab: 0, inf: 2.5, filingStatus: "mfj", stateOfResidence: "FL",
  twoHousehold: false, useJointRmdTable: false,
  gkFloor: 48_000, gkCeiling: 115_000, withdrawalBracketTarget: "22",
  irmaaGuard: false, ssTorpedoGuard: true, rothEmergencyReserve: 0, gr: 0.07,
  accounts: [
    { id: "t1", category: "pretax",  name: "401k",    balance: 1_000_000 },
    { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
    { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
    { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
  ],
};
const rowsOf = (p) => buildWithdrawalWaterfall(p).smart.rows;
const startOf = (r) => r.cashStart + r.taxableStart + r.pretaxStart + r.rothStart;

describe("retirement-age boundaries", () => {
  test("retiring the year you are measured: no accumulation, balances are today's", () => {
    const r = rowsOf({ ...BASE, currentAge: 65, retireAge: 65 });
    expect(r[0].age).toBe(65);
    expect(startOf(r[0])).toBe(1_600_000);
  });

  test("already retired (retireAge below currentAge) starts at today's age", () => {
    const r = rowsOf({ ...BASE, currentAge: 70, retireAge: 62 });
    expect(r[0].age).toBe(70);
    expect(startOf(r[0])).toBe(1_600_000);
  });

  test("the last row is exactly the horizon year", () => {
    const r = rowsOf(BASE);
    expect(r[r.length - 1].age).toBe(90);
  });
});

describe("zero and negative inputs", () => {
  test("an empty portfolio produces finite rows that never go below zero", () => {
    const r = rowsOf({ ...BASE, accounts: BASE.accounts.map((a) => ({ ...a, balance: 0 })) });
    expect(r.length).toBeGreaterThan(0);
    for (const row of r) {
      expect(Number.isFinite(row.totalPort)).toBe(true);
      expect(row.totalPort).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(row.totalTax)).toBe(true);
      expect(Number.isFinite(row.needFromPort)).toBe(true);
    }
  });

  test("a $0-spend plan draws nothing for spending (the GK floor must not invent it)", () => {
    const r = rowsOf({ ...BASE, sp: 0, ssb: 0, ab: 0 });
    for (const row of r) {
      expect(row.spending).toBe(0);
      expect(row.needFromPort).toBe(0);
    }
    const hc = r.filter((x) => x.healthcareRisk > 0);
    expect(hc.length).toBeGreaterThan(0);
    for (const row of hc) expect(row.needFromPort).toBe(0);
  });

  test("the GK floor still applies to a plan that does have spending", () => {
    const r = rowsOf({ ...BASE, sp: 10_000 });
    expect(r[1].spending).toBeGreaterThanOrEqual(48_000);
  });

  test("a negative account balance never produces a NaN or negative total", () => {
    const r = rowsOf({
      ...BASE,
      accounts: BASE.accounts.map((a) => (a.category === "cash" ? { ...a, balance: -50_000 } : a)),
    });
    for (const row of r) {
      expect(Number.isFinite(row.totalPort)).toBe(true);
      expect(row.totalPort).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("spouse benefit timing", () => {
  const P = {
    ...BASE,
    currentAge: 65, retireAge: 65, endAge: 85,
    ssb: 24_000, ssAge: 67, dob: "1960-01-01",
    spouse: { enabled: true, dob: "1962-01-01", ssb: 18_000, ssAge: 67, ssPia: 0 },
  };
  const at = (age) => rowsOf(P).find((r) => r.age === age).ss;

  test("no household benefit before the first claim age", () => {
    expect(at(65)).toBe(0);
    expect(at(66)).toBe(0);
  });

  test("the primary's benefit alone runs from the primary's claim age", () => {
    expect(at(67)).toBe(24_000);
  });

  test("the spouse's benefit adds at the spouse's own claim age", () => {
    const before = at(68);
    const after = at(69);
    expect(after - before).toBeGreaterThanOrEqual(18_000);
    expect(after - before).toBeLessThan(19_000);
  });
});
