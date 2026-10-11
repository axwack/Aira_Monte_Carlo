/**
 * Engine RMD divisor — IRS Pub 590-B Table II (Joint & Last Survivor).
 *
 * The engines used to pick the joint table from a one-age map
 * (`JOINT_RMD_DIV[age]`) that held 18 values, none matching Table II for a
 * given spouse age (age 90 read 17.8 whatever the spouse's age), and gated it
 * on "filing jointly" alone — so a spouse only 5 years younger got the joint
 * table. The waterfall then did `tbl[age] || 15.0`, and since the old map had
 * no entry past 90, ages 91+ used 15.0 instead of the Uniform divisor (8.9 at
 * 95): an RMD roughly 40% too small.
 *
 * These tests pin the behavior through the engine rather than the helper: at
 * 85 with a spouse 15 years younger the row's RMD is 1,000,000 / 19.5 (Table
 * II); a spouse 5 years younger falls back to Uniform 16.0; 95 with the joint
 * toggle on but no >10-year gap uses Uniform 8.9, never 15.0; and a spouse who
 * has already died falls back to Uniform too.
 *
 * Note: the shared Table II now runs to owner age 120 (the old one-age map
 * stopped at 90), so a QUALIFYING younger spouse at 95 gets Table II 95/80 =
 * 11.7 rather than Uniform 8.9. The last test locks that in — 8.9 at 95 is
 * only correct when the spouse is not more than 10 years younger.
 */

import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

const PRETAX = 1_000_000;

// Retiring at the modeled age keeps the first row at that age. The RMD is
// taken from today's pre-tax balance before any growth or draw, so row.rmd is
// exactly Math.round(PRETAX / divisor) and the divisor can be read back off it.
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
    // 1956 dob → spouse is 70 when the primary is 85: Table II 85/70 = 19.5.
    // The old one-age map had 19.3 for 85, which this rules out.
    const row = firstRow({ spouse: { enabled: true, dob: "1956-01-01" } });
    expect(row.age).toBe(85);
    expect(row.rmd).toBe(Math.round(PRETAX / 19.5));
  });

  test("spouse only 5 years younger at 85 → Uniform 16.0", () => {
    // IRS rule: Table II needs the spouse MORE than 10 years younger, so the
    // toggle being on is not enough — Uniform RMD_DIV[85] = 16.0 governs.
    const row = firstRow({ spouse: { enabled: true, dob: "1946-01-01" } });
    expect(row.rmd).toBe(Math.round(PRETAX / 16.0));
  });

  test("age 95, joint toggle on but no >10-year gap → Uniform 8.9, never the old 15.0", () => {
    // Spouse is 90 (5-year gap), so the IRS >10-years-younger rule sends this
    // to Uniform RMD_DIV[95] = 8.9. The old code picked its joint map because
    // the toggle was on, found no 95 entry in a map that stopped at 90, and
    // `tbl[age] || 15.0` took an RMD ~40% too small.
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
    // The generated table covers owner ages 72-120, so the old 90-year cap in
    // JOINT_RMD_DIV is gone: a qualifying spouse at 95 gets the real Table II
    // divisor (95/80 = 11.7), never the 15.0 last-resort fallback.
    const row = firstRow({
      age: 95,
      dob: "1931-01-01",
      spouse: { enabled: true, dob: "1946-01-01" },
    });
    expect(row.rmd).toBe(Math.round(PRETAX / 11.7));
    expect(row.rmd).not.toBe(Math.round(PRETAX / 15.0));
  });

  test("a spouse who has already died → Uniform", () => {
    // Spouse dies at their own age 65, which is primary age 80 (15-year gap),
    // so at 85 the return is single and the joint table must not apply even
    // though the toggle is still on.
    const row = firstRow({
      spouse: { enabled: true, dob: "1956-01-01", deathAge: 65 },
    });
    expect(row.rmd).toBe(Math.round(PRETAX / 16.0));
  });
});
