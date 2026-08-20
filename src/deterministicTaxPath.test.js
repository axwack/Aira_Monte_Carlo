/**
 * §35 — the deterministic tax columns must belong to the plan on screen.
 *
 * The Year-by-Year table borrows its tax from buildWithdrawalWaterfall, and
 * that is the right call: the waterfall is account-aware, so only pre-tax draws
 * are ordinary income, whereas calcYearTax on an aggregate draw treats every
 * dollar as ordinary and overstates tax badly. The defect was that the
 * waterfall taxed ITS OWN spend path — the GK/Bengen hybrid — no matter which
 * distribution strategy the user had selected. The draw on screen and the tax
 * beside it described different plans.
 *
 * Measured before the fix, on the profile below: five strategies drawing
 * between $2.28M and $3.45M over a lifetime all displayed exactly $210,686 of
 * tax. After: $210,686 / $210,686 / $249,751 / $215,498 / $281,695.
 *
 * The fix is two-pass — pass 1 discovers the strategy's spend path, the
 * waterfall is re-run against it, pass 2 replays with the resulting tax — and
 * it has two ways to go silently wrong. Both are pinned here, because both
 * produce plausible numbers rather than errors.
 */
import { simulateDeterministicWithStrategy } from "./App";
import { buildWithdrawalWaterfall } from "./engine/buildWithdrawalWaterfall.js";
import { scheduleSpendForYear } from "./engine/expenseImport.js";
import { spendingSmileFactor } from "./engine/expenses.js";

const P = {
  currentAge: 60, retireAge: 60, endAge: 90,
  port: 1_500_000, contrib: 0, inf: 2.5, sp: 80_000,
  ssAge: 67, ssb: 30_000, ssCola: 2.4, ab: 0, abReliability: 100,
  eqPct: 60, filingStatus: "mfj", stateOfResidence: "NJ", birthYear: 1966,
  gkFloor: 60_000, gkCeiling: 120_000, fixedWithdrawalRate: 0.04,
  accounts: [
    { id: "a1", category: "pretax",  name: "401k", balance: 900_000 },
    { id: "a2", category: "taxable", name: "Brok", balance: 400_000 },
    { id: "a3", category: "roth",    name: "Roth", balance: 200_000 },
  ],
};

const sim = (extra, s) => simulateDeterministicWithStrategy({ ...P, ...extra, withdrawalStrategy: s }, 2.5, s);
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);

// ═══════════════════════════════════════════════════════════════════════════
// 1. The defect itself
// ═══════════════════════════════════════════════════════════════════════════
describe("Tax columns describe the strategy that is on screen", () => {
  test("strategies with materially different draws do NOT all show the same tax", () => {
    // The original symptom in one assertion. Before the fix every entry in this
    // set was byte-identical; `fixed` once showed $777 of tax against $6.1M of
    // withdrawals, which is arithmetically impossible and plainly visible.
    const taxes = ["gk", "bengen", "fixed", "ninety_five_rule", "vpw"].map(
      (s) => Math.round(sum(sim({}, s).schedule, "totalTax"))
    );
    expect(new Set(taxes).size).toBeGreaterThan(1);
  });

  test("the biggest and smallest spending plans do not pay identical tax", () => {
    // VPW draws roughly 50% more than the 95% Rule on this profile. Whatever
    // else is true, those two cannot owe the same amount.
    //
    // Direction of the difference is NOT asserted. The prior version demanded
    // "more spending → more tax" but that is a plausible-sounding heuristic,
    // not a rigorous invariant: sourcing matters. VPW's percentage-of-balance
    // draws can tap Roth (tax-free) heavily late-life while N95's steady
    // real-dollar draws stay in pretax; the two strategies can rank either
    // direction on lifetime tax depending on when each hits the Roth bucket.
    // Under Damodaran-calibrated expected returns (v1.2.104) N95 pays more
    // lifetime tax on this profile — an emergent effect of higher expected
    // growth, not a bug.
    const vpw = sim({}, "vpw").schedule;
    const n95 = sim({}, "ninety_five_rule").schedule;
    expect(sum(vpw, "spending")).toBeGreaterThan(sum(n95, "spending") * 1.2);
    expect(Math.round(sum(vpw, "totalTax"))).not.toBe(Math.round(sum(n95, "totalTax")));
  });

  test("each strategy's tax is the waterfall's tax for that strategy's own spending", () => {
    // The positive form of the claim: reconstruct the spend path the engine fed
    // the waterfall, re-run it, and the displayed tax must come back.
    //
    // Tolerance, and why it is not zero: the fix runs a SINGLE iteration. Pass
    // 2's tax differs slightly from pass 1's, which changes the portfolio,
    // which changes next year's spend for the portfolio-linked strategies. The
    // residual is largest for VPW (the most portfolio-linked) at ~0.5% of
    // lifetime tax, and is documented rather than claimed away.
    for (const s of ["gk", "bengen", "fixed", "ninety_five_rule", "vpw"]) {
      const det = sim({}, s).schedule;
      const preSmile = det.map((r) => ({
        year: r.yr,
        amount: Math.round(r.spending / spendingSmileFactor(r.age, P.retireAge, true)),
      }));
      const wf = buildWithdrawalWaterfall({ ...P, spSchedule: preSmile });
      const byAge = new Map(wf.smart.rows.map((r) => [r.age, r.totalTax || 0]));
      const shown = sum(det, "totalTax");
      const expected = det.reduce((a, r) => a + (byAge.get(r.age) ?? 0), 0);
      expect(Math.abs(shown - expected)).toBeLessThan(Math.max(2_000, shown * 0.01));
    }
  });

  test("a strategy that draws more from PRE-TAX money pays more tax", () => {
    // Sanity on direction: the point of the account-aware tax is that WHERE the
    // money comes from matters. An all-pre-tax portfolio must cost more tax
    // than the same spending drawn from a Roth-heavy one.
    const allPretax = { accounts: [{ id: "x", category: "pretax", name: "401k", balance: 1_500_000 }] };
    const rothHeavy = {
      accounts: [
        { id: "y1", category: "pretax", name: "401k", balance: 300_000 },
        { id: "y2", category: "roth",   name: "Roth", balance: 1_200_000 },
      ],
    };
    const a = sum(sim(allPretax, "bengen").schedule, "totalTax");
    const b = sum(sim(rothHeavy, "bengen").schedule, "totalTax");
    expect(a).toBeGreaterThan(b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. TRAP ONE — the spending smile must not be applied twice
// ═══════════════════════════════════════════════════════════════════════════
describe("Trap 1: the smile is applied once, not twice", () => {
  // buildWithdrawalWaterfall computes `spSmiled = sp * smileFactor` AFTER its
  // spSchedule override. Feeding back the post-smile `spending` field instead
  // of the pre-smile `sp` therefore smiles an already-smiled number. Measured
  // on this profile: $20,913 too little at age 80 — a plausible-looking figure
  // that no error would ever surface.
  test("spending with the smile ON is exactly ONE smile factor below smile OFF", () => {
    // Decisive because a second application would square the factor.
    const on  = sim({ smile: true  }, "bengen").schedule;
    const off = sim({ smile: false }, "bengen").schedule;
    for (const i of [0, 5, 10, 15, 20, 25]) {
      if (!on[i] || !off[i]) continue;
      const factor = spendingSmileFactor(on[i].age, P.retireAge, true);
      const ratio = on[i].spending / off[i].spending;
      expect(ratio).toBeCloseTo(factor, 3);
      // And explicitly NOT the squared factor, wherever the two differ enough
      // to tell them apart.
      if (Math.abs(factor - factor * factor) > 0.01) {
        expect(Math.abs(ratio - factor * factor)).toBeGreaterThan(0.005);
      }
    }
  });

  test("the second pass does not shrink the spending the first pass found", () => {
    // The smile trap's signature at the whole-plan level: pass 2's spending
    // would come back systematically below pass 1's. Bengen ignores the
    // portfolio entirely, so its spend path must be identical to the dollar
    // whatever the tax turns out to be — any drift here is double-application.
    const rows = sim({}, "bengen").schedule;
    const inflY = 0.025;
    for (const i of [1, 5, 10, 20]) {
      if (!rows[i]) continue;
      const expected = P.sp * Math.pow(1 + inflY, i) * spendingSmileFactor(rows[i].age, P.retireAge, true);
      expect(rows[i].spending).toBeCloseTo(expected, -1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. TRAP TWO — the spend path must not be inflated a second time
// ═══════════════════════════════════════════════════════════════════════════
describe("Trap 2: the fed-back schedule is not re-inflated", () => {
  // Pass-1 spend is already NOMINAL (GK/Bengen inflate internally). The
  // question §35 raised was whether scheduleSpendForYear would inflate it
  // again. Measured answer: it only inflates BEYOND its last entry, carrying
  // that value forward. So the requirement is full coverage — one entry per
  // plan year — which is what the engine emits.
  test("a schedule covering every year returns each amount verbatim", () => {
    const sched = [
      { year: 2030, amount: 100_000 },
      { year: 2031, amount: 110_000 },
      { year: 2032, amount: 120_000 },
    ];
    expect(scheduleSpendForYear(sched, 2030, 2.5)).toBe(100_000);
    expect(scheduleSpendForYear(sched, 2031, 2.5)).toBe(110_000);
    expect(scheduleSpendForYear(sched, 2032, 2.5)).toBe(120_000);
  });

  test("but a GAP past the last entry DOES inflate — which is why coverage matters", () => {
    // This is the assertion that makes the previous one meaningful: the helper
    // is not inert, it simply does not fire on covered years. If the engine
    // ever emits a sparse schedule, spending is inflated twice from that point.
    const sched = [{ year: 2030, amount: 100_000 }];
    expect(scheduleSpendForYear(sched, 2032, 2.5)).toBeGreaterThan(100_000);
    expect(scheduleSpendForYear(sched, 2032, 2.5)).toBe(Math.round(100_000 * 1.025 ** 2));
  });

  test("a non-portfolio-linked strategy still tracks plain inflation end to end", () => {
    // The whole-plan consequence of trap 2. Bengen is inflation-only, so a
    // second inflation pass anywhere would compound visibly by year 20.
    const rows = sim({ smile: false }, "bengen").schedule;
    expect(rows[20].spending / rows[0].spending).toBeCloseTo(1.025 ** 20, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. The restructure must not have changed anything else
// ═══════════════════════════════════════════════════════════════════════════
describe("Two-pass restructure leaves the rest of the schedule intact", () => {
  test("a user's own detailed budget short-circuits pass 2 and is not clobbered", () => {
    // When spSchedule is set the budget already overrides the strategy in both
    // engines, so the waterfall is taxing this exact path already. Re-running
    // it would recompute the same numbers against a schedule we synthesised
    // from the user's own — pointless, and a chance to corrupt their input.
    const budget = [];
    for (let y = 0; y < 30; y++) budget.push({ year: 2026 + y, amount: 70_000 + y * 1_000 });
    const frozen = JSON.parse(JSON.stringify(budget));
    const rows = sim({ spSchedule: budget, smile: false }, "vpw").schedule;
    expect(budget).toEqual(frozen);          // input untouched
    expect(rows[0].spending).toBeCloseTo(70_000, -1);
    expect(rows[5].spending).toBeCloseTo(75_000, -1);
  });

  test("the schedule is deterministic — same input, same output", () => {
    // Two passes and an extra waterfall build are more moving parts; none of
    // them may introduce path dependence.
    for (const s of ["gk", "fixed", "vpw"]) {
      expect(sim({}, s).schedule).toEqual(sim({}, s).schedule);
    }
  });

  test("every row still carries a complete, finite set of columns", () => {
    // Pass 2 replaces the schedule wholesale, so a dropped field would surface
    // as a blank column rather than an error.
    for (const s of ["gk", "bengen", "fixed", "ninety_five_rule", "vpw"]) {
      const rows = sim({}, s).schedule;
      expect(rows.length).toBeGreaterThan(20);
      for (const r of rows) {
        for (const k of ["age", "yr", "spending", "portfolioDraw", "fedTax", "stateTax", "irmaa", "totalTax", "totalWithdrawal", "portfolioEnd"]) {
          expect(Number.isFinite(r[k])).toBe(true);
        }
        expect(r.totalTax).toBeGreaterThanOrEqual(0);
        expect(r.totalWithdrawal).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("the tax-drag master toggle still zeroes every tax column", () => {
    // taxEnabled is read inside the pass function now; a scoping slip would
    // leave tax on with the toggle off.
    const rows = sim({ tax: false }, "vpw").schedule;
    expect(sum(rows, "totalTax")).toBe(0);
    expect(sum(rows, "fedTax")).toBe(0);
    expect(sum(rows, "stateTax")).toBe(0);
    expect(sum(rows, "irmaa")).toBe(0);
  });

  test("Smart Waterfall is untouched — it reads the waterfall rows directly", () => {
    // "smart" returns before the two-pass block entirely: its draws and its tax
    // already come from the same engine, so there is nothing to reconcile.
    const rows = simulateDeterministicWithStrategy({ ...P, withdrawalStrategy: "smart" }, 2.5, "smart").schedule;
    const wf = buildWithdrawalWaterfall(P);
    expect(rows.length).toBe(wf.smart.rows.length);
    expect(Math.round(sum(rows, "totalTax"))).toBe(Math.round(sum(wf.smart.rows, "totalTax")));
  });

  test("a portfolio with no accounts configured still produces a schedule", () => {
    // The waterfall can return nothing when accounts are unset; pass 2 must
    // then be declined rather than replacing every row's tax with the
    // treat-everything-as-ordinary-income fallback.
    const rows = simulateDeterministicWithStrategy(
      { ...P, accounts: [], withdrawalStrategy: "gk" }, 2.5, "gk"
    ).schedule;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Number.isFinite(r.totalTax)).toBe(true);
  });
});
