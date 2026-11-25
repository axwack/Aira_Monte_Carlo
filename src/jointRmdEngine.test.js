import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

const PRETAX = 1_000_000;

function firstRow({ age = 85, dob = "1941-01-01", spouse }) {
  const rows = buildWithdrawalWaterfall({
    currentAge: age,
    retireAge: age,
    endAge: age + 2,
    dob,
    sp: 80_000,
    gr: 0.05,
    inf: 2.5,
    filingStatus: "mfj",
    stateOfResidence: "FL",
    useJointRmdTable: true,
    spouse,
    accounts: [
      { id: "a1", category: "pretax",  name: "IRA",     balance: PRETAX },
      { id: "a2", category: "roth",    name: "Roth",    balance: 0 },
      { id: "a3", category: "taxable", name: "Taxable", balance: 0 },
      { id: "a4", category: "cash",    name: "Cash",    balance: 0 },
    ],
  }).smart.rows;
  return rows[0];
}

describe("buildWithdrawalWaterfall — joint RMD divisor uses both ages", () => {
  test("spouse 15 years younger at 85 → Table II 19.5", () => {
    const row = firstRow({ spouse: { enabled: true, dob: "1956-01-01" } });
    expect(row.age).toBe(85);
    expect(row.rmd).toBe(Math.round(PRETAX / 19.5));
  });

  test("spouse only 5 years younger at 85 → Uniform 16.0", () => {
    const row = firstRow({ spouse: { enabled: true, dob: "1946-01-01" } });
    expect(row.rmd).toBe(Math.round(PRETAX / 16.0));
  });

  test("age 95, joint toggle on but no >10-year gap → Uniform 8.9, never the old 15.0", () => {
    const row = firstRow({
      age: 95,
      dob: "1931-01-01",
      spouse: { enabled: true, dob: "1936-01-01" },
    });
    expect(row.age).toBe(95);
    expect(row.rmd).toBe(Math.round(PRETAX / 8.9));
    expect(row.rmd).not.toBe(Math.round(PRETAX / 15.0));
  });

  test("age 95 with a spouse 15 years younger → Table II 11.7, not 15.0", () => {
    const row = firstRow({
      age: 95,
      dob: "1931-01-01",
      spouse: { enabled: true, dob: "1946-01-01" },
    });
    expect(row.rmd).toBe(Math.round(PRETAX / 11.7));
    expect(row.rmd).not.toBe(Math.round(PRETAX / 15.0));
  });

  test("a spouse who has already died → Uniform", () => {
    const row = firstRow({
      spouse: { enabled: true, dob: "1956-01-01", deathAge: 65 },
    });
    expect(row.rmd).toBe(Math.round(PRETAX / 16.0));
  });
});
