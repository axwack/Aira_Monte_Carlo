/**
 * Blanchett spending smile.
 *
 * This existed as a profile field, a sidebar toggle, a `params` entry, and three
 * pieces of UI copy asserting it as fact — including a card quoting "Go-go 115%
 * of base, Slow-go 85% of base" — while NO engine ever read it. The toggle was
 * inert and spending was flat in real terms. These tests exist so that can't
 * silently happen again: the last two assertions verify the value actually
 * reaches the plan, not merely that the helper returns a number.
 *
 * Model: real spending declines ~1%/yr through most of retirement, the decline
 * flattens around 80, and reverses from 85 as healthcare costs take over —
 * Blanchett, "Exploring the Retirement Consumption Puzzle" (2014). Implemented
 * as a compounding rate rather than age bands, since bands imply a ~26%
 * spending cliff on one birthday.
 */

import { spendingSmileFactor } from "./engine/expenses";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall";

describe("spendingSmileFactor", () => {
  test("is exactly 1.0 in the retirement year — base spend means spend at retirement", () => {
    expect(spendingSmileFactor(65, 65)).toBe(1);
  });

  test("returns 1.0 when disabled, at every age", () => {
    for (const age of [65, 75, 85, 95]) {
      expect(spendingSmileFactor(age, 65, false)).toBe(1);
    }
  });

  test("declines through the go-go years", () => {
    expect(spendingSmileFactor(70, 65)).toBeLessThan(1);
    expect(spendingSmileFactor(75, 65)).toBeLessThan(spendingSmileFactor(70, 65));
    expect(spendingSmileFactor(80, 65)).toBeLessThan(spendingSmileFactor(75, 65));
  });

  test("~1%/yr real decline compounds to roughly 86% by age 80", () => {
    expect(spendingSmileFactor(80, 65)).toBeCloseTo(Math.pow(0.99, 15), 4);
  });

  test("it is a SMILE, not just a decline — spending turns back up late", () => {
    const trough = spendingSmileFactor(85, 65);
    expect(spendingSmileFactor(90, 65)).toBeGreaterThan(trough);
    expect(spendingSmileFactor(95, 65)).toBeGreaterThan(spendingSmileFactor(90, 65));
  });

  test("the minimum sits in the no-go transition, not at the end of life", () => {
    const ages = [65, 70, 75, 80, 85, 90, 95, 100];
    const vals = ages.map((a) => spendingSmileFactor(a, 65));
    const minAt = ages[vals.indexOf(Math.min(...vals))];
    expect(minAt).toBeGreaterThanOrEqual(80);
    expect(minAt).toBeLessThanOrEqual(90);
  });

  test("the curve is anchored to retirement age, not a fixed calendar age", () => {
    // Someone retiring at 55 has had 25 years of decline by 80; someone
    // retiring at 70 has had only 10.
    expect(spendingSmileFactor(80, 55)).toBeLessThan(spendingSmileFactor(80, 70));
  });

  test("stays inside a sane band even over a very long retirement", () => {
    for (const age of [70, 90, 110, 120]) {
      const f = spendingSmileFactor(age, 45);
      expect(f).toBeGreaterThanOrEqual(0.75);
      expect(f).toBeLessThanOrEqual(1.10);
    }
  });

  test("never projects backwards before retirement", () => {
    expect(spendingSmileFactor(60, 65)).toBe(1);
  });

  test("handles missing or malformed ages without producing NaN", () => {
    expect(spendingSmileFactor(undefined, 65)).toBe(1);
    expect(spendingSmileFactor(75, undefined)).toBe(1);
    expect(spendingSmileFactor(NaN, 65)).toBe(1);
  });
});

describe("the smile actually reaches the plan (regression: it used to be inert)", () => {
  const P = {
    currentAge: 65, retireAge: 65, endAge: 95,
    sp: 80_000, ssAge: 67, ssb: 36_000, inf: 2.5,
    filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
    accounts: [
      { id: "1", category: "pretax", name: "IRA",  balance: 900_000 },
      { id: "2", category: "cash",   name: "Cash", balance: 100_000 },
    ],
  };

  test("toggling it changes the plan at all", () => {
    const flat  = buildWithdrawalWaterfall({ ...P, smile: false });
    const smile = buildWithdrawalWaterfall({ ...P, smile: true });
    expect(smile.summary).not.toEqual(flat.summary);
  });

  test("lower real spending mid-retirement leaves a larger ending balance", () => {
    const flat  = buildWithdrawalWaterfall({ ...P, smile: false });
    const smile = buildWithdrawalWaterfall({ ...P, smile: true });
    expect(smile.smart.rows.at(-1).totalPort).toBeGreaterThan(flat.smart.rows.at(-1).totalPort);
  });

  test("year-one spending is unchanged — the curve starts at 1.0", () => {
    const flat  = buildWithdrawalWaterfall({ ...P, smile: false });
    const smile = buildWithdrawalWaterfall({ ...P, smile: true });
    expect(smile.smart.rows[0].spending).toBe(flat.smart.rows[0].spending);
  });

  test("nominal spending still RISES with inflation despite the real decline", () => {
    // A common misreading: the smile is a real adjustment, so the dollar figures
    // in the table keep climbing — inflation outpaces a 1%/yr real decline.
    const r = buildWithdrawalWaterfall({ ...P, smile: true });
    const first = r.smart.rows[0].spending;
    const late  = r.smart.rows.at(-1).spending;
    expect(late).toBeGreaterThan(first);
  });

  test("defaults to ON when the field is absent, matching BLANK_PROFILE", () => {
    const noField = buildWithdrawalWaterfall(P);
    const on      = buildWithdrawalWaterfall({ ...P, smile: true });
    expect(noField.summary).toEqual(on.summary);
  });
});
