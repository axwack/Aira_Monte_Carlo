import { evaluateRules } from "./engine/rulesEngine.js";
import { getRmdStartAge, RMD_DIV } from "./engine/buildRothExplorer.js";
import { jointRmdDivisor } from "./data/jointRmdTable.js";

const BASE_PARAMS = {
  currentAge: 60,
  retireAge: 65,
  endAge: 90,
  sp: 80_000,
  port: 2_000_000,
  filingStatus: "mfj",
  stateOfResidence: "FL",
  useJointRmdTable: false,
  accounts: [
    { id: "a1", category: "pretax",  name: "401k",    balance: 2_000_000 },
    { id: "a2", category: "roth",    name: "Roth",    balance:         0 },
    { id: "a3", category: "taxable", name: "Taxable", balance:         0 },
  ],
};

function cardsFor(params, currentYear = 2026) {
  return evaluateRules({ params, mc: null, assumptions: {}, currentYear, daysToRetire: 1_825 });
}
function creepCard(params, currentYear = 2026) {
  return cardsFor(params, currentYear).find(c => c.id === "rmd-bracket-creep");
}

describe("rulesEngine — RMD start age agrees with the engines", () => {
  test("born 1960 or later → 75 (SECURE 2.0)", () => {
    const card = creepCard({ ...BASE_PARAMS, dob: "1965-03-14", currentAge: 60 });
    expect(card).toBeTruthy();
    expect(card.deadline).toBe("Before age 75");
  });

  test("born 1951–1959 → 73", () => {
    const card = creepCard({ ...BASE_PARAMS, dob: "1958-06-15", currentAge: 67 });
    expect(card.deadline).toBe("Before age 73");
  });

  test("the user's rmdStartAge override wins over the statutory age", () => {
    const card = creepCard({ ...BASE_PARAMS, dob: "1965-03-14", rmdStartAge: 72 });
    expect(card.deadline).toBe("Before age 72");
    expect(card.reason).toContain("age 72");
  });

  test("cards agree with getRmdStartAge for the same profile (cross-file parity)", () => {
    const params = { ...BASE_PARAMS, dob: "1970-01-01", currentAge: 56 };
    const expected = getRmdStartAge({ dob: params.dob, birthYear: undefined, currentAge: params.currentAge });
    expect(creepCard(params).deadline).toBe(`Before age ${expected}`);
  });
});

describe("rulesEngine — projected RMD uses an IRS divisor, not a hardcoded 24.0", () => {
  test("Uniform Lifetime divisor at the RMD start age is used", () => {
    const params = { ...BASE_PARAMS, dob: "1965-03-14" };
    const expected = Math.round(2_000_000 / RMD_DIV[75]);
    expect(creepCard(params).reason).toContain(expected.toLocaleString("en-US"));
  });

  test("the joint table is used when gated on, and it differs from Uniform", () => {
    const params = {
      ...BASE_PARAMS,
      dob: "1965-03-14",
      useJointRmdTable: true,
      filingStatus: "mfj",
      spouse: { enabled: true, dob: "1980-03-14" },
    };
    const joint = jointRmdDivisor(75, 60);
    expect(joint).toBe(28.3);
    expect(joint).not.toBe(RMD_DIV[75]);
    const expected = Math.round(2_000_000 / joint);
    expect(creepCard(params).reason).toContain(expected.toLocaleString("en-US"));
  });

  test("a spouse not more than 10 years younger falls back to Uniform", () => {
    const params = {
      ...BASE_PARAMS,
      dob: "1965-03-14",
      useJointRmdTable: true,
      filingStatus: "mfj",
      spouse: { enabled: true, dob: "1970-03-14" },
    };
    expect(jointRmdDivisor(75, 70)).toBeNull();
    const expected = Math.round(2_000_000 / RMD_DIV[75]);
    expect(creepCard(params).reason).toContain(expected.toLocaleString("en-US"));
  });

  test("a stale joint-table toggle is ignored for a single filer", () => {
    const single = { ...BASE_PARAMS, dob: "1965-03-14", useJointRmdTable: true, filingStatus: "single" };
    const expected = Math.round(2_000_000 / RMD_DIV[75]);
    expect(creepCard(single).reason).toContain(expected.toLocaleString("en-US"));
  });

  test("no divisor is the old hardcoded 24.0 for a 1960+ birth year", () => {
    const params = { ...BASE_PARAMS, dob: "1965-03-14" };
    expect(creepCard(params).reason).not.toContain((83_333).toLocaleString("en-US"));
  });

  test("the card states its basis is today's balance, not a projection", () => {
    const reason = creepCard({ ...BASE_PARAMS, dob: "1965-03-14" }).reason;
    expect(reason).toContain("today's");
    expect(reason).toContain("larger if the account keeps growing");
  });
});

describe("irmaa-guard-off — proximity is years to retirement, not year minus age", () => {
  const at = (currentAge, retireAge) => cardsFor({ ...BASE_PARAMS, currentAge, retireAge });
  const ids = (cards) => cards.map(c => c.id);

  test("a 55-year-old ten years from retirement does not get the card", () => {
    expect(ids(at(55, 65))).not.toContain("irmaa-guard-off");
  });

  test("a 61-year-old four years from retirement gets the card", () => {
    expect(ids(at(61, 65))).toContain("irmaa-guard-off");
  });

  test("a profile with no retireAge still gets the card", () => {
    expect(ids(cardsFor({ ...BASE_PARAMS, retireAge: undefined }))).toContain("irmaa-guard-off");
  });
});
