import fs from "fs";
import path from "path";
import { savingsDrawdownOf, computeInitialWR } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

// Reported case: the income chart's savings bar fell to ~$0 at RMD age while
// the accounts still held millions, because the forced RMD isn't in fromPretax.
describe("savings drawdown bar includes RMDs", () => {
  const plan = {
    currentAge: 72, retireAge: 72, dob: "1954-06-01", endAge: 80,
    sp: 100_000, gkFloor: 65_000, gkCeiling: 135_000, inf: 2.5,
    ssb: 0, otherIncomes: [], filingStatus: "single", stateOfResidence: "TX",
    accounts: [{ id: "a1", category: "pretax", name: "IRA", balance: 2_000_000 }],
  };
  const rows = buildWithdrawalWaterfall(plan).smart.rows;
  const firstRmd = rows.findIndex((r) => r.rmd > 0);

  test("the plan reaches an RMD year", () => {
    expect(firstRmd).toBeGreaterThan(0);
  });

  test("the bar counts the RMD net of the reinvested surplus", () => {
    const r = rows[firstRmd];
    expect(savingsDrawdownOf(r))
      .toBe(r.fromCash + r.fromTaxable + r.fromPretax + r.fromRoth + r.rmd - r.rmdSurplus);
  });

  test("the bar does not collapse when RMDs start", () => {
    expect(savingsDrawdownOf(rows[firstRmd])).toBeGreaterThan(0.8 * savingsDrawdownOf(rows[firstRmd - 1]));
  });
});

// Reported case: a $350k renovation in the retirement year was in the income
// chart's first bar but not in the "Withdrawal rate at retirement" year-one draw.
describe("year-one draw includes one-off expenses in the retirement year", () => {
  const year = new Date().getFullYear();
  const base = { currentAge: 44, retireAge: 46, port: 6_500_000, sp: 239_000, ssb: 0, inf: 2.5 };

  test("a renovation in the retirement year adds its amount in today's dollars", () => {
    const without = computeInitialWR(base);
    const withReno = computeInitialWR({
      ...base,
      cashFlowEvents: [{ id: "r", year: year + 2, amount: 350_000, direction: "out" }],
    });
    expect(withReno.oneOffAtRetire).toBe(350_000);
    expect(withReno.initDrawEst - without.initDrawEst).toBe(350_000);
    expect(withReno.initWRpct).toBeGreaterThan(without.initWRpct);
  });

  test("one-offs in other years and inflows are left out", () => {
    const r = computeInitialWR({
      ...base,
      cashFlowEvents: [
        { id: "later", year: year + 5, amount: 100_000, direction: "out" },
        { id: "gift", year: year + 2, amount: 500_000, direction: "in" },
      ],
    });
    expect(r.oneOffAtRetire).toBe(0);
  });
});

// A one-off is real for year one but is not the plan's ongoing rate: the
// verdict strip and the guardrail band judge the steady rate instead.
describe("steady rate vs year-one rate", () => {
  const year = new Date().getFullYear();
  const base = { currentAge: 44, retireAge: 46, port: 6_500_000, sp: 239_000, ssb: 0, inf: 2.5 };
  const reno = { cashFlowEvents: [{ id: "r", year: year + 2, amount: 350_000, direction: "out" }] };

  test("steadyWRpct ignores the one-off; initWRpct includes it", () => {
    const plain = computeInitialWR(base), withReno = computeInitialWR({ ...base, ...reno });
    expect(withReno.steadyWRpct).toBeCloseTo(plain.initWRpct, 10);
    expect(withReno.initWRpct).toBeGreaterThan(withReno.steadyWRpct);
    expect(withReno.initDrawEst - withReno.steadyDraw).toBe(withReno.oneOffAtRetire);
  });

  test("an amount entered in future dollars is deflated to today's dollars", () => {
    const r = computeInitialWR({ ...base, cashFlowEvents: [{ year: year + 2, amount: 350_000, inflate: false }] });
    expect(r.oneOffAtRetire).toBeCloseTo(350_000 / 1.025 ** 2, 6);
  });

  test("the verdict strip and the guardrail panel read the steady rate", () => {
    const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
    expect(SRC).toContain("const swr = computeInitialWR(params).steadyWRpct");
    expect(SRC).toContain("const inSafeBand = steadyWRpct >= 5.0 && steadyWRpct <= 5.5;");
    // The panel's formula lists every term that makes up the draw.
    expect(SRC).toMatch(/other income \{fmtDollar\(otherIncAtRetire\)\}.*housing \{fmtDollar\(housingAtRetire\)\}.*carveouts \{fmtDollar\(carveoutAtRetire\)\} = portfolio draw \{fmtDollar\(steadyDraw\)\}/);
  });
});
