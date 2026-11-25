import { buildWithdrawalWaterfall, gkReferenceWR } from "./engine/buildWithdrawalWaterfall";

const Y = new Date().getFullYear();

const ALL_ROTH = {
  currentAge: 67, retireAge: 67, endAge: 100,
  sp: 90_000, ssAge: 67, ssb: 40_000, inf: 2.5,
  filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05,
  accounts: [{ id: "1", category: "roth", name: "Roth", balance: 1_000_000 }],
};

const pension = (growthAmount) => ([{
  id: "p", name: "Pension", annual: 20_000, startYear: Y,
  taxable: true, growthMode: "fixed", growthAmount,
}]);

const finalPort = (r) => r.smart.rows.at(-1).totalPort;
const lifetimeIncome = (r) => r.smart.rows.reduce((s, x) => s + (x.otherIncome || 0), 0);

describe("gkReferenceWR", () => {
  test("at retirement it equals the classic initial withdrawal rate", () => {
    expect(gkReferenceWR({
      plannedSpend: 90_000, cumInfl: 1, incomeOffset: 40_000, fixedCosts: 0, portAtRetire: 1_000_000,
    })).toBeCloseTo(0.05, 10);
  });

  test("rising income lowers the reference, so it cancels rather than firing a raise", () => {
    const lo = gkReferenceWR({ plannedSpend: 90_000, cumInfl: 1, incomeOffset: 40_000, portAtRetire: 1_000_000 });
    const hi = gkReferenceWR({ plannedSpend: 90_000, cumInfl: 1, incomeOffset: 60_000, portAtRetire: 1_000_000 });
    expect(hi).toBeLessThan(lo);
  });

  test("income covering the whole plan yields 0, which disables the bands", () => {
    expect(gkReferenceWR({ plannedSpend: 50_000, cumInfl: 1, incomeOffset: 80_000, portAtRetire: 1_000_000 })).toBe(0);
  });

  test("guards a zero or missing portfolio instead of dividing by it", () => {
    expect(gkReferenceWR({ plannedSpend: 90_000, portAtRetire: 0 })).toBe(0);
    expect(gkReferenceWR({ plannedSpend: 90_000 })).toBe(0);
  });
});

describe("more income never makes the plan worse", () => {
  test("a growing pension raises the ending balance (the reported bug)", () => {
    const flat = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(0) });
    const grow = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(1_135) });

    const extraIncome = lifetimeIncome(grow) - lifetimeIncome(flat);
    expect(extraIncome).toBeGreaterThan(500_000);

    expect(finalPort(grow)).toBeGreaterThan(finalPort(flat));
  });

  test("most of the added income survives to the ending balance", () => {
    const flat = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(0) });
    const grow = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(1_135) });

    const extraIncome = lifetimeIncome(grow) - lifetimeIncome(flat);
    const extraWealth = finalPort(grow) - finalPort(flat);

    expect(extraWealth).toBeGreaterThan(extraIncome * 0.5);
  });

  test("monotonic: each step up in pension growth improves the ending balance", () => {
    const ends = [0, 500, 1_135, 2_000].map(
      (g) => finalPort(buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: pension(g) }))
    );
    for (let i = 1; i < ends.length; i++) expect(ends[i]).toBeGreaterThan(ends[i - 1]);
  });

  test("a larger flat pension also never lowers the ending balance", () => {
    const small = buildWithdrawalWaterfall({
      ...ALL_ROTH, otherIncomes: [{ id: "p", name: "P", annual: 10_000, startYear: Y, taxable: true }],
    });
    const large = buildWithdrawalWaterfall({
      ...ALL_ROTH, otherIncomes: [{ id: "p", name: "P", annual: 50_000, startYear: Y, taxable: true }],
    });
    expect(finalPort(large)).toBeGreaterThan(finalPort(small));
  });

  test("the reporter's exact shape: a $1 pension with a $1,135 increase still helps", () => {
    const none = buildWithdrawalWaterfall({ ...ALL_ROTH, otherIncomes: [] });
    const tiny = buildWithdrawalWaterfall({
      ...ALL_ROTH,
      otherIncomes: [{ id: "p", name: "P", annual: 1, startYear: Y, taxable: true, growthMode: "fixed", growthAmount: 1_135 }],
    });
    expect(finalPort(tiny)).toBeGreaterThan(finalPort(none));
  });
});
