import { runMC, simulateDeterministicWithStrategy } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

const PRETAX_HEAVY = {
  currentAge: 52, retireAge: 54, endAge: 90,
  port: 1_810_000, sp: 60_000, ssAge: 62, ssb: 25_200, ssCola: 2.4,
  contrib: 13_000, hsaContrib: 4_404,
  inf: 2.5, smile: true, tax: true, real: true,
  filingStatus: "single", stateOfResidence: "OH",
  gkFloor: 48_000, gkCeiling: 100_000,
  propIncome: 93_000, ab: 0, useAb: true, abReliability: 80, abGrowth: 3,
  taxableBasisPct: 70, cashRealReturn: 3,
  withdrawalStrategy: "gk", withdrawalBracketTarget: "22",
  irmaaGuard: false, ssTorpedoGuard: false, rothEmergencyReserve: 0,
  orderingMode: "tax_reactive", withdrawalOrder: ["cash", "taxable", "pretax", "roth"],
  preRetireEq: 91, postRetireEq: 70,
  hcShockAge: 72, hcProb: 3.5, hcMin: 70_000, hcMax: 130_000,
  birthYear: 1973, sex: "male", spouse: { enabled: false },
  accounts: [
    { id: "1", category: "pretax", balance: 1_750_000 },
    { id: "2", category: "roth",   balance:    20_000 },
    { id: "4", category: "hsa",    balance:    40_000 },
  ],
};

describe("§ bracket cap must not starve a funded household", () => {
  test("the reported profile no longer collapses (was 3.3%)", () => {
    const mc = runMC(PRETAX_HEAVY, 90, 500, 42, true);
    expect(mc.rate).toBeGreaterThan(0.85);
  });

  test("success is now insensitive to the bracket target, as it must be", () => {
    const at22 = runMC({ ...PRETAX_HEAVY, withdrawalBracketTarget: "22" }, 90, 500, 42, true).rate;
    const off  = runMC({ ...PRETAX_HEAVY, withdrawalBracketTarget: "off" }, 90, 500, 42, true).rate;
    expect(Math.abs(at22 - off)).toBeLessThan(0.15);
  });

  test("no cliff across the rental amount that fills the bracket", () => {
    const r70 = runMC({ ...PRETAX_HEAVY, propIncome: 70_000 }, 90, 500, 42, true).rate;
    const r93 = runMC({ ...PRETAX_HEAVY, propIncome: 93_000 }, 90, 500, 42, true).rate;
    expect(r70 - r93).toBeLessThan(0.15);
  });

  test("the override is REPORTED, not silent", () => {
    const needy = { ...PRETAX_HEAVY, propIncome: 40_000, sp: 90_000, withdrawalBracketTarget: "10" };
    const mc = runMC(needy, 90, 300, 42, true);
    expect(mc.bracketOverrideRate).toBeGreaterThan(0);
  });

  test("waterfall labels the year it exceeded the target", () => {
    const needy = { ...PRETAX_HEAVY, propIncome: 40_000, sp: 90_000, withdrawalBracketTarget: "10" };
    const rows = buildWithdrawalWaterfall(needy).smart.rows;
    const overridden = rows.filter(r => r.pretaxCapReason === "bracket_exceeded_to_fund_spending");
    expect(overridden.length).toBeGreaterThan(0);
  });

  test("a household with room to spare is NOT pushed past its target", () => {
    const roomy = {
      ...PRETAX_HEAVY, propIncome: 0, sp: 40_000,
      accounts: [
        { id: "a", category: "pretax",  balance: 600_000 },
        { id: "b", category: "taxable", balance: 900_000 },
        { id: "c", category: "cash",    balance: 200_000 },
      ],
    };
    expect(runMC(roomy, 90, 300, 42, true).bracketOverrideRate).toBeLessThan(0.05);
  });
});

describe("§ INVARIANT: no path may fail while holding drawable assets", () => {
  const EXTREMES = {
    "rental far above spend, 10% target": { propIncome: 200_000, withdrawalBracketTarget: "10" },
    "rental equal to spend, 12% target":  { propIncome: 60_000,  withdrawalBracketTarget: "12" },
    "MFJ variant, rental fills bracket":  { propIncome: 150_000, filingStatus: "mfj", withdrawalBracketTarget: "12" },
    "IRMAA guard on top of the cap":      { propIncome: 120_000, withdrawalBracketTarget: "12", irmaaGuard: true },
    "SS torpedo guard on as well":        { propIncome: 120_000, withdrawalBracketTarget: "12", ssTorpedoGuard: true },
    "all-pretax portfolio, no Roth/HSA":  {
      propIncome: 150_000, withdrawalBracketTarget: "10",
      accounts: [{ id: "1", category: "pretax", balance: 2_000_000 }],
    },
  };

  Object.entries(EXTREMES).forEach(([label, override]) => {
    test(`${label} — survives, because the money is reachable`, () => {
      const mc = runMC({ ...PRETAX_HEAVY, ...override }, 90, 300, 42, true);
      expect(mc.rate).toBeGreaterThan(0.8);
    });
  });

  test("deterministic schedule never reports an unfunded year for these shapes", () => {
    Object.values(EXTREMES).forEach((override) => {
      const det = simulateDeterministicWithStrategy({ ...PRETAX_HEAVY, ...override }, 2.5, "gk");
      const broke = det.schedule.filter(r => (r.portfolioEnd ?? 0) <= 0);
      expect(broke.length).toBe(0);
    });
  });

  test("§34: a household whose income exceeds its spending does NOT fail", () => {
    const huge = { ...PRETAX_HEAVY, propIncome: 400_000, withdrawalBracketTarget: "10" };
    expect(runMC(huge, 90, 300, 42, true).rate).toBeGreaterThan(0.95);
  });

  test("§34: more income makes you RICHER, never poorer", () => {
    const lo = simulateDeterministicWithStrategy({ ...PRETAX_HEAVY, propIncome: 93_000 }, 2.5, "gk");
    const hi = simulateDeterministicWithStrategy({ ...PRETAX_HEAVY, propIncome: 200_000 }, 2.5, "gk");
    const last = (d) => d.schedule[d.schedule.length - 1].portfolioEnd;
    expect(last(hi)).toBeGreaterThan(last(lo));
  });

  test("§34: the surplus actually lands in the taxable bucket", () => {
    const rows = buildWithdrawalWaterfall({ ...PRETAX_HEAVY, propIncome: 200_000 }).smart.rows;
    const withTaxable = rows.filter(r => (r.taxableEnd ?? 0) > 0);
    expect(withTaxable.length).toBeGreaterThan(0);
  });

  test("the two engines agree on survival for the reported profile", () => {
    const mc  = runMC(PRETAX_HEAVY, 90, 300, 42, true);
    const det = simulateDeterministicWithStrategy(PRETAX_HEAVY, 2.5, "gk");
    const lastRow = det.schedule[det.schedule.length - 1];
    expect(mc.rate).toBeGreaterThan(0.85);
    expect(lastRow.portfolioEnd).toBeGreaterThan(0);
  });
});

describe("§ Roth conversions must not decide SOLVENCY", () => {
  const MODES = ["off", "10", "12", "22", "24"];

  test("success is roughly flat across every conversion setting", () => {
    const rates = MODES.map((m) =>
      runMC({ ...PRETAX_HEAVY, rothConversionTarget: m }, 90, 400, 42, true).rate
    );
    const spread = Math.max(...rates) - Math.min(...rates);
    expect(spread).toBeLessThan(0.2);
  });

  test("conversions OFF is no longer catastrophic", () => {
    const off = runMC({ ...PRETAX_HEAVY, rothConversionTarget: "off" }, 90, 400, 42, true).rate;
    expect(off).toBeGreaterThan(0.8);
  });
});

describe("§ conversions change TAX and WEALTH, not solvency", () => {
  test("success rate is flat across conversion targets", () => {
    const rates = ["off", "12", "22", "32"].map((m) =>
      runMC({ ...PRETAX_HEAVY, rothConversionTarget: m }, 90, 300, 42, true).rate
    );
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(0.15);
  });

  test("converting more reduces lifetime tax", () => {
    const tax = (m) => buildWithdrawalWaterfall({ ...PRETAX_HEAVY, rothConversionTarget: m }).smart.totalTax;
    expect(tax("32")).toBeLessThan(tax("22"));
    expect(tax("22")).toBeLessThan(tax("off"));
  });

  test("but lowest tax is NOT highest ending wealth — the trap in ranking on tax", () => {
    const total = (m) => {
      const w = buildWithdrawalWaterfall({ ...PRETAX_HEAVY, rothConversionTarget: m }).smart;
      return (w.finalPretax || 0) + (w.finalRoth || 0) + (w.finalTaxable || 0) + (w.finalCash || 0);
    };
    expect(total("32")).toBeLessThan(total("22"));
  });

  test("a target below existing ordinary income converts nothing", () => {
    const t = (m) => buildWithdrawalWaterfall({ ...PRETAX_HEAVY, rothConversionTarget: m }).smart.totalTax;
    expect(t("12")).toBe(t("off"));
  });
});
