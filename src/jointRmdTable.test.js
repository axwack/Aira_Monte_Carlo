import { JOINT_RMD_TABLE_II, jointRmdDivisor } from "./data/jointRmdTable.js";

describe("JOINT_RMD_TABLE_II — full two-dimensional matrix", () => {
  test("includes owner ages 72 through 120", () => {
    expect(JOINT_RMD_TABLE_II["72"]).toBeDefined();
    expect(JOINT_RMD_TABLE_II["120"]).toBeDefined();
  });

  test("spouse entries exist for early ages (72/20→65.1, 72/21→64.2)", () => {
    expect(JOINT_RMD_TABLE_II["72"]["20"]).toBe(65.1);
    expect(JOINT_RMD_TABLE_II["72"]["21"]).toBe(64.2);
  });

  test("last row (120) exists with expected entry", () => {
    expect(JOINT_RMD_TABLE_II["120"]["60"]).toBe(27.1);
  });

  test("all rows have >0 spouse entries", () => {
    Object.entries(JOINT_RMD_TABLE_II).forEach(([age, spouses]) => {
      expect(Object.keys(spouses).length).toBeGreaterThan(0);
    });
  });
});

describe("jointRmdDivisor() — IRS Variant 1 gate", () => {
  test("73 / spouse 62 → 27.2 (handoff)", () => {
    expect(jointRmdDivisor(73, 62)).toBe(27.2);
  });

  test("80 / spouse 60 → 27.8 (handoff)", () => {
    expect(jointRmdDivisor(80, 60)).toBe(27.8);
  });

  test("90 / spouse 70 → 19.1 (handoff)", () => {
    expect(jointRmdDivisor(90, 70)).toBe(19.1);
  });

  test("spouse exactly 10 years younger → null (not MORE than 10)", () => {
    expect(jointRmdDivisor(73, 63)).toBe(null);
  });

  test("spouse older than owner → null", () => {
    expect(jointRmdDivisor(73, 75)).toBe(null);
  });

  test("null spouse age → null", () => {
    expect(jointRmdDivisor(73, null)).toBe(null);
  });

  test("undefined spouse age → null", () => {
    expect(jointRmdDivisor(73, undefined)).toBe(null);
  });

  test("NaN owner age → null", () => {
    expect(jointRmdDivisor(NaN, 62)).toBe(null);
  });

  test("72 / 20 → 65.1 (first eligible entry)", () => {
    expect(jointRmdDivisor(72, 20)).toBe(65.1);
  });

  test("age 70 → null (before table range)", () => {
    expect(jointRmdDivisor(70, 59)).toBe(null);
  });

  test("deep table: 100 / 75 → 15", () => {
    expect(jointRmdDivisor(100, 75)).toBe(15);
  });

  test("deep table: 110 / 99 → 3.7", () => {
    expect(jointRmdDivisor(110, 99)).toBe(3.7);
  });
});
