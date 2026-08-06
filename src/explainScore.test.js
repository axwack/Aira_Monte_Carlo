/**
 * explainScore — the score has to explain itself.
 *
 * Every engine defect found on 2026-08-05 (bracket cap starving solvent plans,
 * Roth reserve unreachable, Rule of 55 boundary, surplus income evaporating) was
 * invisible on screen. The user saw a percentage and nothing else, so neither he
 * nor we could sanity-check it — which is precisely how they survived.
 *
 * These tests cover the reasoning, not the styling.
 */

import { explainScore } from "./engine/explainScore.js";

const mc = (over = {}) => ({
  rate: 0.95,
  pcts: [{ age: 65, p10: 800_000, p50: 1_000_000, p90: 1_400_000 }],
  medianExhaustAge: null,
  bracketOverrideRate: 0,
  rothReserveBrokenRate: 0,
  ...over,
});

const profile = (over = {}) => ({
  currentAge: 65, retireAge: 65, endAge: 90, sp: 60_000,
  ssAge: 65, ssb: 24_000, propIncome: 0,
  accounts: [{ id: "1", category: "pretax", balance: 1_000_000 }],
  ...over,
});

const byId = (r, id) => r.drivers.find((d) => d.id === id);

describe("guard rails", () => {
  test("no Monte Carlo result yields no claims", () => {
    const r = explainScore(profile(), null);
    expect(r.drivers).toEqual([]);
    expect(r.headline).toMatch(/Run the Monte Carlo/i);
  });
});

describe("withdrawal rate — the primary driver", () => {
  test("computed net of guaranteed income, not gross spending", () => {
    // $60k spend - $24k SS = $36k drawn from $1M = 3.6%.
    const r = explainScore(profile(), mc());
    expect(byId(r, "withdrawal_rate").value).toBe("3.6%");
  });

  test("a high rate is flagged as risk", () => {
    const r = explainScore(profile({ sp: 120_000 }), mc());
    expect(byId(r, "withdrawal_rate").severity).toBe("risk");
  });

  test("income covering all spending reports zero draw, not a division artifact", () => {
    const r = explainScore(profile({ propIncome: 80_000 }), mc());
    const d = byId(r, "withdrawal_rate");
    expect(d.severity).toBe("good");
    expect(d.value).toBe("0.0%");
  });
});

describe("what the user is told about failures", () => {
  test("depletion age is surfaced when scenarios fail", () => {
    const r = explainScore(profile(), mc({ rate: 0.7, medianExhaustAge: 82 }));
    expect(byId(r, "depletion").value).toBe("Age 82");
  });

  test("no depletion driver when nothing fails", () => {
    const r = explainScore(profile(), mc({ rate: 1, medianExhaustAge: null }));
    expect(byId(r, "depletion")).toBeUndefined();
  });

  test("risks are listed before reassurance", () => {
    const r = explainScore(profile({ sp: 120_000 }), mc({ rate: 0.5, medianExhaustAge: 78 }));
    expect(r.drivers[0].severity).toBe("risk");
  });
});

describe("preferences the engine had to yield are disclosed", () => {
  test("a bracket target that could not be honoured is named", () => {
    const r = explainScore(profile(), mc({ bracketOverrideRate: 0.4 }));
    expect(byId(r, "bracket_yielded").value).toBe("40%");
  });

  test("a broken Roth reserve is named", () => {
    const r = explainScore(profile(), mc({ rothReserveBrokenRate: 0.2 }));
    expect(byId(r, "reserve_broken")).toBeDefined();
  });

  test("neither appears when neither happened", () => {
    const r = explainScore(profile(), mc());
    expect(byId(r, "bracket_yielded")).toBeUndefined();
    expect(byId(r, "reserve_broken")).toBeUndefined();
  });
});

describe("early retirement and pre-tax concentration", () => {
  test("retiring before 59.5 on mostly pre-tax money is flagged", () => {
    const r = explainScore(profile({ retireAge: 54, currentAge: 52 }), mc());
    expect(byId(r, "early_penalty")).toBeDefined();
  });

  test("enabling the Rule of 55 downgrades it and warns about rolling over", () => {
    const r = explainScore(profile({ retireAge: 54, currentAge: 52, ruleOf55: true }), mc());
    const d = byId(r, "early_penalty");
    expect(d.severity).toBe("good");
    expect(d.lever).toMatch(/UNROLLED/);
  });

  test("a pre-tax-heavy portfolio raises the forced-withdrawal driver", () => {
    const r = explainScore(profile(), mc());
    expect(byId(r, "rmd_bomb")).toBeDefined();
  });

  test("and its lever refuses to rank conversions on tax alone", () => {
    // Measured on a real profile: filling to 32% cut lifetime tax by $2.4M and
    // ended $1.1M POORER than 22%. Ranking on tax saved recommends the wrong one.
    expect(byId(explainScore(profile(), mc()), "rmd_bomb").lever).toMatch(/ending wealth/i);
  });

  test("a diversified portfolio does not raise it", () => {
    const r = explainScore(profile({
      accounts: [
        { id: "1", category: "pretax",  balance: 400_000 },
        { id: "2", category: "taxable", balance: 400_000 },
        { id: "3", category: "roth",    balance: 200_000 },
      ],
    }), mc());
    expect(byId(r, "rmd_bomb")).toBeUndefined();
  });
});

describe("headline", () => {
  test("names the worst driver when one is a risk", () => {
    const r = explainScore(profile({ sp: 120_000 }), mc({ rate: 0.5, medianExhaustAge: 78 }));
    expect(r.headline).toMatch(/biggest factor/i);
  });

  test("says so plainly when nothing stands out", () => {
    const r = explainScore(profile({ propIncome: 80_000 }), mc({ rate: 0.99 }));
    expect(r.headline).toMatch(/nothing in your plan stands out/i);
  });
});
