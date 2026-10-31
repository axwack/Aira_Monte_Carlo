/**
 * 2026 tax-table boundaries, checked against the federal source that produced them.
 *
 * Source: IRS Rev. Proc. 2025-32 (tax year 2026)
 *   https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
 *   - §.01 / Tables 1 and 3: rate brackets
 *   - §.03: maximum zero-rate and 15%-rate capital-gain amounts
 *   - §.14(3): additional standard deduction for the aged
 *
 * These are the only assertions that fail if a published figure is typed in
 * wrong, so they are the guard for every later year's re-indexing.
 */

import {
  FED_BRACKETS_2026_MFJ,
  FED_BRACKETS_2026_SINGLE,
  LTCG_BRACKETS_2026_MFJ,
  LTCG_BRACKETS_2026_SINGLE,
} from "./engine/buildRothExplorer.js";
import { stdDed } from "./engine/buildWithdrawalWaterfall.js";

const bound = (table, rate) => table.find((b) => b.rate === rate).hi;

describe("2026 federal brackets — Rev. Proc. 2025-32", () => {
  test("married filing jointly thresholds", () => {
    expect(FED_BRACKETS_2026_MFJ.slice(0, 6).map((b) => b.hi))
      .toEqual([24800, 100800, 211400, 403550, 512450, 768700]);
  });

  test("single 24% bracket ends at $201,775, not $201,800", () => {
    expect(bound(FED_BRACKETS_2026_SINGLE, 0.24)).toBe(201775);
    expect(FED_BRACKETS_2026_SINGLE[4].lo).toBe(201775);
  });
});

describe("2026 long-term capital gains breakpoints — Rev. Proc. 2025-32 §.03", () => {
  test("married filing jointly: 0% to $98,900, 15% to $613,700", () => {
    expect(bound(LTCG_BRACKETS_2026_MFJ, 0)).toBe(98900);
    expect(bound(LTCG_BRACKETS_2026_MFJ, 0.15)).toBe(613700);
  });

  test("all other individuals: 0% to $49,450, 15% to $545,500", () => {
    expect(bound(LTCG_BRACKETS_2026_SINGLE, 0)).toBe(49450);
    expect(bound(LTCG_BRACKETS_2026_SINGLE, 0.15)).toBe(545500);
  });
});

describe("2026 standard deduction — Rev. Proc. 2025-32 §.14", () => {
  test("single 65+ gets the $2,050 unmarried aged add-on, not $1,650", () => {
    expect(stdDed(65, false, 1)).toBe(16100 + 2050);
  });

  test("single 64 gets no aged add-on", () => {
    expect(stdDed(64, false, 1)).toBe(16100);
  });

  test("a married couple over 65 gets $1,650 per filer", () => {
    expect(stdDed(70, true, 1, 68)).toBe(32200 + 2 * 1650);
  });

  test("one filer over 65 gets one add-on", () => {
    expect(stdDed(70, true, 1, 60)).toBe(32200 + 1650);
  });
});

// ── IRMAA 2026 surcharge (Part B + Part D) ────────────────────────────────────
// Source: CMS, "2026 Medicare Parts A & B Premiums and Deductibles", 14 Nov 2025.
// Part B per person per month: 81.20 / 202.90 / 324.60 / 446.30 / 487.00
// Part D per person per month: 14.50 /  37.50 /  60.40 /  83.30 /  91.00
// f is the annual two-person total, so per person per month = f / 24.
import { IRMAA_2026 } from "./data/irmaa2026.js";

describe("IRMAA 2026 — Part B + Part D, CMS fact sheet", () => {
  const cmsMonthlyBplusD = [95.7, 240.4, 385.0, 529.6, 578.0];

  test("thresholds are the CMS 2026 MFJ tier floors", () => {
    expect(IRMAA_2026.map((r) => r.m)).toEqual([218000, 274000, 342000, 410000, 750000]);
  });

  test("each tier carries B + D per person per month", () => {
    IRMAA_2026.forEach((r, i) => {
      expect(r.f / 24).toBeCloseTo(cmsMonthlyBplusD[i], 4);
    });
  });

  test("the surcharge rises with income and has no gap at the top", () => {
    for (let i = 1; i < IRMAA_2026.length; i++) {
      expect(IRMAA_2026[i].f).toBeGreaterThan(IRMAA_2026[i - 1].f);
    }
  });
});
