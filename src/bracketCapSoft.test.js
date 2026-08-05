/**
 * The bracket target is a PREFERENCE, not a wall.
 *
 * THE BUG THIS PINS (reported 2026-08-05, real user profile)
 * ---------------------------------------------------------
 * Single filer, age 52, retiring at 54. $1.75M in a 401(k), $20k Roth, $40k HSA,
 * no taxable and no cash. $93,000/yr of property income growing 3%/yr. Spending
 * $60k. Bracket target 22%.
 *
 * Reported success rate: 3.3%. True figure: ~100%.
 *
 * Mechanism: by his early 60s the rental income ALONE exceeds the single-filer
 * 22% bracket top, so `room = ceiling - taxSoFar` was zero and the pre-tax step
 * would draw nothing. With 97% of the portfolio in pre-tax and Roth/HSA quickly
 * spent, `need` stayed unfunded forever and every path was flagged failed —
 * while holding $3-4M. The giveaway was the `alive` curve: 59% alive at age 66
 * against a $3.98M median balance. Paths were dying rich.
 *
 * The defect in one line: a tax preference was enforced as a hard constraint.
 * Faced with "pay 24% instead of 22%" or "fail the plan", the engine starved.
 *
 * The INVARIANT test at the bottom is the important one — it catches this whole
 * CLASS rather than this one profile: a path must never be scored as failed
 * while it still holds drawable assets.
 */

import { runMC, simulateDeterministicWithStrategy } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";

/**
 * De-identified real-world profile shape (reported 2026-08-05).
 *
 * Name and exact date of birth removed deliberately: this repo is public, and a
 * user's identity plus balances does not belong in it. `birthYear` is kept
 * because the Rule-of-55 calendar-year boundary depends on it, and the balances
 * are kept because the bug only reproduces at this concentration of pre-tax.
 * Nothing here identifies anyone.
 */
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
    // Was 0.033. The plan is genuinely sound: rental alone covers the spend.
    expect(mc.rate).toBeGreaterThan(0.85);
  });

  test("success is now insensitive to the bracket target, as it must be", () => {
    // A tax PREFERENCE may change the tax bill. It must not decide solvency.
    const at22 = runMC({ ...PRETAX_HEAVY, withdrawalBracketTarget: "22" }, 90, 500, 42, true).rate;
    const off  = runMC({ ...PRETAX_HEAVY, withdrawalBracketTarget: "off" }, 90, 500, 42, true).rate;
    expect(Math.abs(at22 - off)).toBeLessThan(0.15);
  });

  test("no cliff across the rental amount that fills the bracket", () => {
    // Before the fix: 70k -> 91.8%, 93k -> 3.3%. A 33% income rise cannot cost
    // 88 points of success.
    const r70 = runMC({ ...PRETAX_HEAVY, propIncome: 70_000 }, 90, 500, 42, true).rate;
    const r93 = runMC({ ...PRETAX_HEAVY, propIncome: 93_000 }, 90, 500, 42, true).rate;
    expect(r70 - r93).toBeLessThan(0.15);
  });

  test("the override is REPORTED, not silent", () => {
    // The user gave up a tax preference to stay funded; that must be visible.
    // Uses a household that genuinely has a shortfall — since the §34 surplus fix
    // PRETAX_HEAVY's own income covers his spending AND its tax, so nothing is unfunded.
    const needy = { ...PRETAX_HEAVY, propIncome: 40_000, sp: 90_000, withdrawalBracketTarget: "10" };
    const mc = runMC(needy, 90, 300, 42, true);
    expect(mc.bracketOverrideRate).toBeGreaterThan(0);
  });

  test("waterfall labels the year it exceeded the target", () => {
    // PRETAX_HEAVY himself no longer needs the override: since the §34 surplus fix his
    // income covers both spending and its own tax, so nothing is ever unfunded.
    // That is the correct outcome, so this test needs a household that genuinely
    // has a shortfall AND a blocked bracket: income just under spending, target
    // pinned at 10% so there is essentially no room.
    const needy = { ...PRETAX_HEAVY, propIncome: 40_000, sp: 90_000, withdrawalBracketTarget: "10" };
    const rows = buildWithdrawalWaterfall(needy).smart.rows;
    const overridden = rows.filter(r => r.pretaxCapReason === "bracket_exceeded_to_fund_spending");
    // At least one year must both exceed the target AND say so.
    expect(overridden.length).toBeGreaterThan(0);
  });

  test("a household with room to spare is NOT pushed past its target", () => {
    // The override must fire only when needed — otherwise it silently discards
    // the tax optimisation the user asked for.
    const roomy = {
      ...PRETAX_HEAVY, propIncome: 0, sp: 40_000,
      accounts: [
        { id: "a", category: "pretax",  balance: 600_000 },
        { id: "b", category: "taxable", balance: 900_000 },
        { id: "c", category: "cash",    balance: 200_000 },
      ],
    };
    // Not exactly 0: in a handful of stochastic tails (bad returns plus a
    // healthcare shock) exceeding the target genuinely IS the right call. The
    // requirement is that it stays rare, not that it never happens.
    expect(runMC(roomy, 90, 300, 42, true).bracketOverrideRate).toBeLessThan(0.05);
  });
});

// ─── The general invariant — catches the CLASS, not the case ─────────────────

describe("§ INVARIANT: no path may fail while holding drawable assets", () => {
  // Extreme shapes chosen to stress the interaction that broke: large
  // non-portfolio income against a low bracket target, with the portfolio
  // concentrated in pre-tax so the cap has maximum bite.
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
      // Every one of these households has more income than it spends plus a
      // seven-figure portfolio. Anything below a high success rate means an
      // artificial constraint is starving them again.
      expect(mc.rate).toBeGreaterThan(0.8);
    });
  });

  test("deterministic schedule never reports an unfunded year for these shapes", () => {
    Object.values(EXTREMES).forEach((override) => {
      const det = simulateDeterministicWithStrategy({ ...PRETAX_HEAVY, ...override }, 2.5, "gk");
      const broke = det.schedule.filter(r => (r.portfolioEnd ?? 0) <= 0);
      expect(broke.length).toBe(0);   // EXTREMES no longer includes the 400k case
    });
  });

  /**
   * §34 FIXED — surplus income is carried, not evaporated.
   *
   * Was: `need = max(0, spend - income)` threw away every dollar of income above
   * spending, while the TAX on that income was still charged to the portfolio. A
   * household with $400k of rental income and $60k of spending discarded $340k/yr,
   * drew ~$100k/yr from the 401(k) to pay tax on money it had received, and
   * depleted — Monte Carlo scored it under 50%.
   *
   * Now the surplus funds the tax bill first and the remainder is deposited into
   * the taxable bucket as basis (it is already-taxed money), exactly as v1.2.73
   * did for cashFlowEvents inflows.
   */
  test("§34: a household whose income exceeds its spending does NOT fail", () => {
    const huge = { ...PRETAX_HEAVY, propIncome: 400_000, withdrawalBracketTarget: "10" };
    expect(runMC(huge, 90, 300, 42, true).rate).toBeGreaterThan(0.95);
  });

  test("§34: more income makes you RICHER, never poorer", () => {
    // The direction check that the old code inverted. Same profile, more income,
    // must not end with a smaller portfolio.
    const lo = simulateDeterministicWithStrategy({ ...PRETAX_HEAVY, propIncome: 93_000 }, 2.5, "gk");
    const hi = simulateDeterministicWithStrategy({ ...PRETAX_HEAVY, propIncome: 200_000 }, 2.5, "gk");
    const last = (d) => d.schedule[d.schedule.length - 1].portfolioEnd;
    expect(last(hi)).toBeGreaterThan(last(lo));
  });

  test("§34: the surplus actually lands in the taxable bucket", () => {
    // Not merely "doesn't fail" — the money must be somewhere. PRETAX_HEAVY starts with
    // NO taxable account at all, so any taxable balance is deposited surplus.
    const rows = buildWithdrawalWaterfall({ ...PRETAX_HEAVY, propIncome: 200_000 }).smart.rows;
    const withTaxable = rows.filter(r => (r.taxableEnd ?? 0) > 0);
    expect(withTaxable.length).toBeGreaterThan(0);
  });

  test("the two engines agree on survival for the reported profile", () => {
    // Cross-engine drift on the SAME rule is this codebase's recurring defect —
    // the override had to land in both runMC and the waterfall.
    const mc  = runMC(PRETAX_HEAVY, 90, 300, 42, true);
    const det = simulateDeterministicWithStrategy(PRETAX_HEAVY, 2.5, "gk");
    const lastRow = det.schedule[det.schedule.length - 1];
    expect(mc.rate).toBeGreaterThan(0.85);
    expect(lastRow.portfolioEnd).toBeGreaterThan(0);
  });
});

// ─── The symptom the user found from the other side ──────────────────────────

describe("§ Roth conversions must not decide SOLVENCY", () => {
  /**
   * Reported gradient, BEFORE the fix, varying `rothConversionTarget` only:
   *
   *   off      3.3%      fill_12  40.8%      fill_24  99.8%
   *   fill_10  4.6%      fill_22  99.8%
   *
   * This is the same bracket-cap bug seen from the other side, and it is the
   * clearest possible proof of the mechanism. Conversions MOVE money from
   * pre-tax into Roth, and Roth draws are not subject to the bracket cap — so
   * converting was an accidental workaround that relocated the portfolio into a
   * bucket the cap could not block. More conversion, more reachable money, more
   * "success". Solvency was never the constraint; ACCESS was.
   *
   * A Roth conversion is a lifetime-TAX decision. It must never be the
   * difference between a plan working and a plan failing. If this test starts
   * failing, some cap has become a hard wall again.
   */
  const MODES = ["off", "10", "12", "22", "24"];

  test("success is roughly flat across every conversion setting", () => {
    const rates = MODES.map((m) =>
      runMC({ ...PRETAX_HEAVY, rothConversionTarget: m }, 90, 400, 42, true).rate
    );
    const spread = Math.max(...rates) - Math.min(...rates);
    // Was a 96.5-point spread (3.3% -> 99.8%). Conversions may still move the
    // number a little — they genuinely change the tax bill — but not the outcome.
    expect(spread).toBeLessThan(0.2);
  });

  test("conversions OFF is no longer catastrophic", () => {
    // The exact configuration the user had saved: conversions off, 22% target.
    const off = runMC({ ...PRETAX_HEAVY, rothConversionTarget: "off" }, 90, 400, 42, true).rate;
    expect(off).toBeGreaterThan(0.8);
  });
});

// ─── Conversion economics, measured on the fixed engine ──────────────────────

describe("§ conversions change TAX and WEALTH, not solvency", () => {
  /**
   * Measured on this shape after the §33/§34 fixes (1000 paths, deterministic
   * waterfall for the money figures):
   *
   *   mode   success   lifetime tax   ending total
   *   off    100.0%     $4,066,565     $32,394,626
   *   10     100.0%     $4,066,565     $32,394,626   (identical: see below)
   *   12     100.0%     $4,066,565     $32,394,626   (identical: see below)
   *   22     100.0%     $3,623,700     $32,418,275   <- most ending wealth
   *   24     100.0%     $2,181,374     $31,007,610
   *   32     100.0%     $1,687,756     $31,278,450
   *
   * Two findings worth pinning:
   *
   * 1. `off`/`10`/`12` are IDENTICAL to the dollar. Correct, not a bug: this
   *    single filer's rental income alone already exceeds the 10% and 12%
   *    bracket tops, so conversion room is zero and nothing converts.
   *
   * 2. Lowest lifetime tax is NOT most money. Filling to 32% cuts lifetime tax
   *    by $2.4M versus off, yet ends with ~$1.1M LESS than filling to 22%,
   *    because tax paid early stops compounding. Any UI that ranks conversion
   *    strategies on tax saved alone will recommend the wrong one.
   */
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
    // 32% pays the least tax of any setting yet ends poorer than 22%.
    expect(total("32")).toBeLessThan(total("22"));
  });

  test("a target below existing ordinary income converts nothing", () => {
    // Rental income alone exceeds the single-filer 12% top, so there is no room.
    const t = (m) => buildWithdrawalWaterfall({ ...PRETAX_HEAVY, rothConversionTarget: m }).smart.totalTax;
    expect(t("12")).toBe(t("off"));
  });
});
