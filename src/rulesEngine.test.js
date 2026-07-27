/**
 * rulesEngine RMD correctness — REQUIREMENTS §13.2 #16.
 *
 * The Action Plan cards used to derive the RMD start age themselves
 * (`birthYear = currentYear - currentAge`, bucketed 72/73/75) and to project the
 * first RMD with a hardcoded divisor of 24.0. That meant a card could name a
 * different RMD age than every simulation engine, and an RMD amount computed
 * with a divisor belonging to no age in either IRS table.
 *
 * These tests pin the fix: one shared `getRmdStartAge`, the user override
 * honored, and divisors from the IRS tables with the joint-table gate.
 */

import { evaluateRules } from "./engine/rulesEngine.js";
import { getRmdStartAge, RMD_DIV, JOINT_RMD_DIV } from "./engine/buildRothExplorer.js";

// A profile whose pre-tax balance is large enough to fire rmd-bracket-creep
// (projected RMD > $50,000) while still being years short of the RMD age.
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
    // dob 1965 → statutory 75. currentAge is deliberately inconsistent with dob
    // to prove dob is what's used, not `currentYear - currentAge`.
    const card = creepCard({ ...BASE_PARAMS, dob: "1965-03-14", currentAge: 60 });
    expect(card).toBeTruthy();
    expect(card.deadline).toBe("Before age 75");
  });

  test("born 1951–1959 → 73", () => {
    const card = creepCard({ ...BASE_PARAMS, dob: "1958-06-15", currentAge: 67 });
    expect(card.deadline).toBe("Before age 73");
  });

  test("the user's rmdStartAge override wins over the statutory age", () => {
    // dob implies 75; an explicit override of 72 must be respected — this is the
    // half of the bug the old local helper could not express at all.
    const card = creepCard({ ...BASE_PARAMS, dob: "1965-03-14", rmdStartAge: 72 });
    expect(card.deadline).toBe("Before age 72");
    expect(card.reason).toContain("age 72");
  });

  test("cards agree with getRmdStartAge for the same profile (cross-file parity)", () => {
    const params = { ...BASE_PARAMS, dob: "1970-03-14", currentAge: 56 };
    const expected = getRmdStartAge({ dob: params.dob, birthYear: undefined, currentAge: params.currentAge });
    expect(creepCard(params).deadline).toBe(`Before age ${expected}`);
  });
});

describe("rulesEngine — projected RMD uses an IRS divisor, not a hardcoded 24.0", () => {
  test("Uniform Lifetime divisor at the RMD start age is used", () => {
    const params = { ...BASE_PARAMS, dob: "1965-03-14" };  // → RMD age 75
    const expected = Math.round(2_000_000 / RMD_DIV[75]);
    expect(creepCard(params).reason).toContain(expected.toLocaleString("en-US"));
  });

  test("the joint table is used when gated on, and it differs from Uniform", () => {
    const params = { ...BASE_PARAMS, dob: "1965-03-14", useJointRmdTable: true, filingStatus: "mfj" };
    // JOINT_RMD_DIV[75] and RMD_DIV[75] are different numbers, so this actually
    // discriminates between the two tables rather than passing trivially.
    expect(JOINT_RMD_DIV[75]).not.toBe(RMD_DIV[75]);
    const expected = Math.round(2_000_000 / JOINT_RMD_DIV[75]);
    expect(creepCard(params).reason).toContain(expected.toLocaleString("en-US"));
  });

  test("a stale joint-table toggle is ignored for a single filer", () => {
    // Mirrors the engines' guard: the joint table is only correct while there IS a
    // much-younger spouse, so filingStatus 'single' overrides a leftover toggle.
    const single = { ...BASE_PARAMS, dob: "1965-03-14", useJointRmdTable: true, filingStatus: "single" };
    const expected = Math.round(2_000_000 / RMD_DIV[75]);
    expect(creepCard(single).reason).toContain(expected.toLocaleString("en-US"));
  });

  test("no divisor is the old hardcoded 24.0 for a 1960+ birth year", () => {
    // Regression lock: 2,000,000 / 24 = 83,333 was the old (wrong) answer.
    const params = { ...BASE_PARAMS, dob: "1965-03-14" };
    expect(creepCard(params).reason).not.toContain((83_333).toLocaleString("en-US"));
  });

  test("the card states its basis is today's balance, not a projection", () => {
    // Guards the labeling fix: the number is a today's-balance point estimate, so
    // the copy must say so rather than implying a forecast.
    const reason = creepCard({ ...BASE_PARAMS, dob: "1965-03-14" }).reason;
    expect(reason).toContain("today's");
    expect(reason).toContain("larger if the account keeps growing");
  });
});
