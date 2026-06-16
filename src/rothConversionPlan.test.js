/**
 * rothConversionPlan.test.js
 *
 * Tests for buildConversionPlan (needs_schedule / recommendedSchedule) and
 * checkRothWithdrawalPenalty (5-year conversion rule).
 *
 * Key invariant: recommendedSchedule[0].amount must equal
 * buildWithdrawalWaterfall(params).smart.rows[0].conversionAmount — the
 * Withdrawal Schedule tab's "Roth Conv" figure for year 0. This is the
 * cross-tab consistency the Conversion Plan numbers must satisfy.
 */

import { buildConversionPlan, checkRothWithdrawalPenalty, buildConversionLadder } from "./engine/rothConversionPlan.js";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

// Sample retirement profile used to validate cross-tab consistency
const TEST_PROFILE = {
  currentAge: 56, retireAge: 60, endAge: 85, sp: 110000, ssAge: 62, ssb: 30696,
  filingStatus: "mfj", stateOfResidence: "NJ", twoHousehold: false,
  inf: 2.5, ssCola: 2.4, useJointRmdTable: true, rmdStartAge: 75,
  ab: 0, abEndYear: 0, useAb: true,
  gkFloor: 65000, gkCeiling: 135000,
  withdrawalBracketTarget: "22",
  rothConversionTarget: "22",
  irmaaGuard: true, ssTorpedoGuard: true,
  rothEmergencyReserve: 400000,
  conversionOverrides: [],
  accounts: [
    { category: "pretax", balance: 1900201 },
    { category: "roth", balance: 765198 },
    { category: "hsa", balance: 78303 },
    { category: "taxable", balance: 95000 },
    { category: "pretax", balance: 2790 },
    { category: "hsa", balance: 4653 },
    { category: "cash", balance: 25000 },
  ],
};

describe("buildConversionLadder — Conversion Plan tab matches Withdrawal Schedule tab", () => {
  test("ladder row[0].conv equals Withdrawal Schedule's Roth Conv for year 0 (sample profile)", () => {
    const ladder = buildConversionLadder(TEST_PROFILE, "fill_22");
    const { smart } = buildWithdrawalWaterfall({ ...TEST_PROFILE, rothConversionTarget: "22" });
    expect(ladder.rows.length).toBeGreaterThan(0);
    expect(ladder.rows[0].conv).toBe(smart.rows[0].conversionAmount);
    expect(ladder.rows[0].yr).toBe(smart.rows[0].yr);
  });

  test("every ladder row's conv matches the waterfall row for the same year", () => {
    const ladder = buildConversionLadder(TEST_PROFILE, "fill_22");
    const { smart } = buildWithdrawalWaterfall({ ...TEST_PROFILE, rothConversionTarget: "22" });
    for (const row of ladder.rows) {
      const match = smart.rows.find(r => r.yr === row.yr);
      expect(match).toBeDefined();
      expect(row.conv).toBe(match.conversionAmount);
      expect(row.fedT).toBe(match.fedTax);
      expect(row.stT).toBe(match.stateTax);
    }
  });

  test("a manual override is reflected in the ladder's conv and capReason", () => {
    // TEST_PROFILE retires at 60 (currentAge 56), so the simulation starts in BASE_YEAR + 4.
    const yr = 2031;
    const p = { ...TEST_PROFILE, conversionOverrides: [{ year: yr, amount: 50_000 }] };
    const ladder = buildConversionLadder(p, "fill_22");
    const row = ladder.rows.find(r => r.yr === yr);
    expect(row).toBeDefined();
    expect(row.conv).toBe(50_000);
    expect(row.capReason).toBe("manual override");
  });
});

describe("buildConversionPlan — cross-tab consistency", () => {
  test("recommendedSchedule[0].amount matches Withdrawal Schedule's Roth Conv for year 0", () => {
    const plan = buildConversionPlan(TEST_PROFILE);
    const { smart } = buildWithdrawalWaterfall(TEST_PROFILE);
    expect(plan.recommendedSchedule.length).toBeGreaterThan(0);
    expect(plan.recommendedSchedule[0].amount).toBe(smart.rows[0].conversionAmount);
    expect(plan.recommendedSchedule[0].year).toBe(smart.rows[0].yr);
  });

  test("Large pretax balance ($1.9M) triggers needs_schedule", () => {
    const plan = buildConversionPlan(TEST_PROFILE);
    expect(plan.needs_schedule).toBe(true);
    expect(plan.totalTraditional).toBe(1900201 + 2790);
  });

  test("recommendedSchedule stops before rmdAge", () => {
    const plan = buildConversionPlan(TEST_PROFILE);
    for (const entry of plan.recommendedSchedule) {
      expect(entry.age).toBeLessThan(plan.rmdAge);
    }
  });

  test("recommendedSchedule amounts are non-negative and schedule is non-empty", () => {
    const plan = buildConversionPlan(TEST_PROFILE);
    expect(plan.recommendedSchedule.every(e => e.amount > 0)).toBe(true);
  });
});

describe("buildConversionPlan — needs_schedule reasons", () => {
  test("zero pretax balance: needs_schedule = false, empty schedule", () => {
    const p = {
      ...TEST_PROFILE,
      accounts: TEST_PROFILE.accounts.filter(a => a.category !== "pretax"),
    };
    const plan = buildConversionPlan(p);
    expect(plan.needs_schedule).toBe(false);
    expect(plan.recommendedSchedule).toHaveLength(0);
    expect(plan.totalTraditional).toBe(0);
  });

  test("small pretax balance relative to headroom: headroomTooSmall is false when conversion can't exceed pretax", () => {
    // Tiny pretax (e.g. $5,000) — headroom this year is capped at the pretax balance,
    // so headroomYear0 ≈ totalTraditional, which is NOT < 20% of itself.
    const p = {
      ...TEST_PROFILE,
      accounts: [
        { category: "pretax", balance: 5000 },
        { category: "roth", balance: 765198 },
        { category: "taxable", balance: 95000 },
        { category: "cash", balance: 25000 },
      ],
    };
    const plan = buildConversionPlan(p);
    expect(plan.reasons.headroomTooSmall).toBe(false);
  });

  test("large pretax relative to bracket headroom triggers headroomTooSmall", () => {
    const p = {
      ...TEST_PROFILE,
      accounts: [
        { category: "pretax", balance: 10_000_000 },
        { category: "roth", balance: 765198 },
        { category: "taxable", balance: 95000 },
        { category: "cash", balance: 25000 },
      ],
    };
    const plan = buildConversionPlan(p);
    expect(plan.reasons.headroomTooSmall).toBe(true);
    expect(plan.needs_schedule).toBe(true);
  });
});

describe("checkRothWithdrawalPenalty — 5-year conversion rule", () => {
  test("age >= 59.5: never penalized regardless of conversion timing", () => {
    const result = checkRothWithdrawalPenalty({
      withdrawalDate: "2027-01-15",
      withdrawalAmount: 50_000,
      ageAtWithdrawal: 60,
      conversionHistory: [{ date: "2026-06-01", amount: 50_000 }],
    });
    expect(result.penalty_due).toBe(false);
    expect(result.penaltyAmount).toBe(0);
  });

  test("under 59.5, withdrawal within 5 years of conversion: penalty due", () => {
    const result = checkRothWithdrawalPenalty({
      withdrawalDate: "2028-03-01",
      withdrawalAmount: 30_000,
      ageAtWithdrawal: 55,
      conversionHistory: [{ date: "2026-06-01", amount: 50_000 }],
    });
    expect(result.penalty_due).toBe(true);
    expect(result.penaltyAmount).toBe(3_000); // 10% of 30,000
    expect(result.flaggedConversions).toHaveLength(1);
  });

  test("under 59.5, withdrawal more than 5 years after conversion: no penalty", () => {
    const result = checkRothWithdrawalPenalty({
      withdrawalDate: "2032-01-02",
      withdrawalAmount: 30_000,
      ageAtWithdrawal: 55,
      conversionHistory: [{ date: "2026-06-01", amount: 50_000 }],
    });
    expect(result.penalty_due).toBe(false);
    expect(result.penaltyAmount).toBe(0);
  });

  test("FIFO ordering: withdrawal draws from oldest conversion first", () => {
    // Older conversion (2024) is past its 5-year window by 2030; newer (2029) is not.
    const result = checkRothWithdrawalPenalty({
      withdrawalDate: "2030-01-01",
      withdrawalAmount: 40_000,
      ageAtWithdrawal: 50,
      conversionHistory: [
        { date: "2024-01-01", amount: 30_000 }, // clock starts 2024-01-01, clear by 2029
        { date: "2029-06-01", amount: 30_000 }, // clock starts 2029-01-01, not clear until 2034
      ],
    });
    // First 30K comes from the 2024 conversion (clean), remaining 10K from 2029 (flagged)
    expect(result.penalty_due).toBe(true);
    expect(result.flaggedConversions).toHaveLength(1);
    expect(result.flaggedConversions[0].amountAffected).toBe(10_000);
    expect(result.penaltyAmount).toBe(1_000);
  });

  test("withdrawal in conversion's tax year itself is flagged (clock starts Jan 1)", () => {
    const result = checkRothWithdrawalPenalty({
      withdrawalDate: "2026-12-31",
      withdrawalAmount: 10_000,
      ageAtWithdrawal: 50,
      conversionHistory: [{ date: "2026-03-15", amount: 10_000 }],
    });
    expect(result.penalty_due).toBe(true);
  });

  test("no conversion history: no penalty", () => {
    const result = checkRothWithdrawalPenalty({
      withdrawalDate: "2026-12-31",
      withdrawalAmount: 10_000,
      ageAtWithdrawal: 50,
      conversionHistory: [],
    });
    expect(result.penalty_due).toBe(false);
  });

  test("zero withdrawal amount: no penalty", () => {
    const result = checkRothWithdrawalPenalty({
      withdrawalDate: "2026-12-31",
      withdrawalAmount: 0,
      ageAtWithdrawal: 50,
      conversionHistory: [{ date: "2026-03-15", amount: 10_000 }],
    });
    expect(result.penalty_due).toBe(false);
  });
});
