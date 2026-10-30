// Stress Lab gap tests: pre-retirement return, sequence replay, failed-path drill-down.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { runMC, historicalSequence, SequenceBuilder, FailedPathPanel } from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const P = {
  currentAge: 55, retireAge: 65, endAge: 90, sp: 80_000, ssAge: 67, ssb: 36_000, inf: 2.5,
  filingStatus: "mfj", stateOfResidence: "NJ", gr: 0.05, port: 900_000,
  accounts: [
    { id: "1", category: "pretax", name: "IRA", balance: 800_000 },
    { id: "2", category: "cash", name: "Cash", balance: 100_000 },
  ],
};
// Retired-at-65 plan that fails often (for drill-down).
const FAIL = { ...P, currentAge: 65, retireAge: 65, endAge: 95, sp: 120_000, ssb: 30_000, port: 1_000_000 };

describe("pre-retirement return", () => {
  // Captured from the pre-Stress-Lab commit c412186 (N=400, seed 42, GK on).
  const BASE = { rate: 0.9925, medR: 2373815, term: { p10: 2883908, p25: 6221139, p50: 11834775, p75: 22170395, p90: 39598972, mean: 17034223 } };
  const sig = (r) => ({ rate: r.rate, medR: r.medR, term: r.term });

  test.each([["undefined", undefined], ["empty string", ""], ["null", null]])("blank (%s) reproduces the numbers from before the feature", (_, v) => {
    expect(sig(runMC({ ...P, preRetireReturn: v }, 90, 400, 42, true))).toEqual(BASE);
  });

  test("0% with no contributions leaves the balance at retirement equal to today's", () => {
    const r = runMC({ ...P, preRetireReturn: 0 }, 90, 200, 42, true);
    expect(r.medR).toBeCloseTo(900_000, 0);
  });

  test("a fixed 5% compounds exactly over the accumulation years", () => {
    const r = runMC({ ...P, preRetireReturn: 5 }, 90, 200, 42, true);
    expect(r.medR / (900_000 * Math.pow(1.05, 10))).toBeCloseTo(1, 4);
  });

  test("a numeric string behaves like the number", () => {
    const a = runMC({ ...P, preRetireReturn: 4 }, 90, 200, 42, true);
    const b = runMC({ ...P, preRetireReturn: "4" }, 90, 200, 42, true);
    expect(b.medR).toBe(a.medR);
  });

  test("a negative flat return shrinks the balance", () => {
    expect(runMC({ ...P, preRetireReturn: -2 }, 90, 100, 42, true).medR).toBeCloseTo(900_000 * Math.pow(0.98, 10), -1);
  });
});

describe("sequence replay", () => {
  const sig = (r) => ({ rate: r.rate, medR: r.medR, term: r.term });

  test("custom [-30,-20,-10,0,10] runs, returns a rate and fan, and is deterministic for a fixed seed", () => {
    const seq = [-0.3, -0.2, -0.1, 0, 0.1];
    const a = runMC(P, 90, 300, 7, true, seq);
    const b = runMC(P, 90, 300, 7, true, seq);
    expect(a.rate).toBeGreaterThanOrEqual(0);
    expect(a.rate).toBeLessThanOrEqual(1);
    expect(a.pcts.length).toBeGreaterThan(10);
    expect(sig(b)).toEqual(sig(a));
    expect(b.pcts).toEqual(a.pcts);
  });

  test("a bad opening sequence lowers success vs no sequence", () => {
    const hard = runMC(FAIL, 95, 400, 42, true, [-0.3, -0.2, -0.1]);
    const none = runMC(FAIL, 95, 400, 42, true);
    expect(hard.rate).toBeLessThan(none.rate);
  });

  test("start-at-today and start-at-retirement differ (accumulation years take the hit)", () => {
    const seq = [-0.3, -0.2, -0.1, 0, 0.1];
    const ret = runMC(P, 90, 300, 42, true, seq, false);
    const now = runMC(P, 90, 300, 42, true, seq, true);
    expect(now.medR).toBeLessThan(ret.medR);
    expect(sig(now)).not.toEqual(sig(ret));
  });

  test("seqToday with a flat pre-retirement return: the sequence still wins during accumulation", () => {
    const flat = runMC({ ...P, preRetireReturn: 5 }, 90, 200, 42, true, [-0.5, -0.5], true);
    expect(flat.medR).toBeLessThan(900_000 * Math.pow(1.05, 10) * 0.9);
  });

  test("a historical start year pulls stock, bond and inflation from the same dataset year", () => {
    const s = historicalSequence(1973, 3);
    expect(s.map((e) => e.year)).toEqual([1973, 1974, 1975]);
    const y1974 = historicalSequence(1974, 1)[0];
    expect(s[1]).toEqual(y1974);
    expect(s[1].stock).toBeLessThan(-0.2);
    expect(s[1].infl).toBeGreaterThan(0.08);
  });

  test("replaying 2000 matches the dataset values year by year", () => {
    const s = historicalSequence(2000, 13);
    const direct = [2000, 2001, 2002, 2003].map((y) => historicalSequence(y, 1)[0]);
    s.slice(0, 4).forEach((e, i) => expect(e).toEqual(direct[i]));
  });

  test("a historical replay is deterministic for a fixed seed", () => {
    const h = historicalSequence(2000, 13);
    const a = runMC(P, 90, 300, 99, true, h);
    expect(sig(runMC(P, 90, 300, 99, true, h))).toEqual(sig(a));
  });

  test("an empty sequence behaves exactly like no sequence", () => {
    expect(sig(runMC(P, 90, 200, 42, true, []))).toEqual(sig(runMC(P, 90, 200, 42, true, null)));
    expect(sig(runMC(P, 90, 200, 42, true, [], true))).toEqual(sig(runMC(P, 90, 200, 42, true, null)));
  });

  test("a sequence longer than the horizon runs without error and stays finite", () => {
    const long = Array.from({ length: 60 }, () => -0.05);
    for (const today of [false, true]) {
      const r = runMC(P, 90, 100, 42, true, long, today);
      expect(Number.isFinite(r.rate)).toBe(true);
      expect(r.pcts.every((q) => Number.isFinite(q.p50))).toBe(true);
    }
  });

  test("historicalSequence handles 0 years, out-of-range starts, and the first dataset year", () => {
    expect(historicalSequence(2000, 0)).toEqual([]);
    expect(historicalSequence(1900, 5)).toEqual([]);
    expect(historicalSequence(1926, 5).map((e) => e.year)).toEqual([1928, 1929, 1930]);
    expect(historicalSequence(2030, 5)).toEqual([]);
    expect(historicalSequence(1928, 1)[0].year).toBe(1928);
  });
});

describe("failed-path drill-down", () => {
  const on = runMC(FAIL, 95, 600, 42, true, null, false, true);

  test("plan has failures to inspect", () => {
    expect(on.failures.count).toBeGreaterThan(10);
  });

  test("every captured path ends at $0 at its exhaustAge, with a shortfall on the last row", () => {
    for (const f of [on.failures.worst, on.failures.typical, on.failures.closest]) {
      const last = f.rows.at(-1);
      expect(last.age).toBe(f.exhaustAge);
      expect(last.end).toBe(0);
      expect(last.short).toBeGreaterThan(0);
      expect(f.rows.slice(0, -1).every((r) => r.short === 0 || r.short == null)).toBe(true);
    }
  });

  test("balances chain: end of year N equals start of year N+1, ages are consecutive", () => {
    for (const f of [on.failures.worst, on.failures.typical, on.failures.closest]) {
      for (let k = 1; k < f.rows.length; k++) {
        expect(f.rows[k].start).toBeCloseTo(f.rows[k - 1].end, 0);
        expect(f.rows[k].age).toBe(f.rows[k - 1].age + 1);
      }
    }
  });

  test("flag off: identical results and no failures kept", () => {
    const off = runMC(FAIL, 95, 600, 42, true);
    expect(off.failures).toBeNull();
    expect(off.rate).toBe(on.rate);
    expect(off.pcts).toEqual(on.pcts);
    expect(off.term).toEqual(on.term);
    expect(off.medianExhaustAge).toBe(on.medianExhaustAge);
  });

  test("the result exposes at most three captured paths, not every failure", () => {
    expect(Object.keys(on.failures).sort()).toEqual(["closest", "count", "typical", "worst"]);
  });

  test("a plan that never fails has no failed paths even with the flag on", () => {
    const easy = { ...P, sp: 20_000, port: 3_000_000, accounts: [{ id: "1", category: "pretax", name: "IRA", balance: 3_000_000 }] };
    const r = runMC(easy, 90, 300, 42, true, null, false, true);
    expect(r.rate).toBe(1);
    expect(r.failures).toBeNull();
  });

  test("works together with a stress sequence and start-today", () => {
    const r = runMC(FAIL, 95, 300, 42, true, [-0.4, -0.3], false, true);
    expect(r.failures.count).toBe(Math.round((1 - r.rate) * 300));
  });
});

describe("Stress Lab panels render", () => {
  const mount = (el) => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(el));
    return { host, root };
  };

  test("SequenceBuilder shows Run button, history picker, and custom inputs after switching mode", () => {
    const { host, root } = mount(<SequenceBuilder p={P} onResult={() => {}} />);
    expect(host.textContent).toMatch(/Run scenario/);
    expect(host.querySelector("select")).not.toBeNull();
    const customBtn = [...host.querySelectorAll("button")].find((b) => /My own numbers/.test(b.textContent));
    act(() => customBtn.click());
    const inputs = host.querySelectorAll('input[type="number"]');
    expect(inputs.length).toBe(5);
    expect([...inputs].map((i) => i.value)).toEqual(["-30", "-20", "-10", "0", "10"]);
    act(() => root.unmount());
  });

  test("SequenceBuilder Run with all custom years removed does nothing", () => {
    const calls = [];
    const { host, root } = mount(<SequenceBuilder p={P} onResult={(x) => calls.push(x)} />);
    act(() => [...host.querySelectorAll("button")].find((b) => /My own numbers/.test(b.textContent)).click());
    for (let i = 0; i < 5; i++) act(() => [...host.querySelectorAll("button")].find((b) => /Remove year/.test(b.getAttribute("aria-label") || "")).click());
    act(() => [...host.querySelectorAll("button")].find((b) => /Run scenario/.test(b.textContent)).click());
    expect(calls).toEqual([]);
    act(() => root.unmount());
  });

  test("SequenceBuilder disables Run and says why when no valid year is left; paste fills the boxes", () => {
    const { host, root } = mount(<SequenceBuilder p={P} onResult={() => {}} />);
    const btn = (re) => [...host.querySelectorAll("button")].find((b) => re.test(b.textContent) || re.test(b.getAttribute("aria-label") || ""));
    act(() => btn(/My own numbers/).click());
    for (let i = 0; i < 5; i++) act(() => btn(/Remove year/).click());
    expect(btn(/Run scenario/).disabled).toBe(true);
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/at least one year/);
    root.unmount();
  });

  test("FailedPathPanel shows the no-failure message for null and a table for failures", () => {
    const a = mount(<FailedPathPanel failures={null} n={100} />);
    expect(a.host.textContent).toMatch(/No simulated path ran out/);
    act(() => a.root.unmount());
    const f = runMC(FAIL, 95, 200, 42, true, null, false, true).failures;
    const b = mount(<FailedPathPanel failures={f} n={200} />);
    expect(b.host.textContent).toMatch(/Worst case/);
    expect(b.host.querySelectorAll("tbody tr").length).toBe(f.worst.rows.length);
    act(() => b.root.unmount());
  });
});

test("a flat pre-retirement rate leaves the retirement-year market draws unchanged", () => {
  // Accumulates 55 -> 60, then overspends, so the single path always fails and keeps its rows.
  const plan = { ...P, retireAge: 60, sp: 400_000 };
  const stocks = (v) => runMC({ ...plan, preRetireReturn: v }, 90, 1, 7, false, null, false, true).failures.worst.rows.map((r) => r.stock);
  const [flat, blank] = [stocks(6), stocks("")];
  const n = Math.min(flat.length, blank.length); // the richer plan may run out later
  expect(n).toBeGreaterThan(3);
  expect(flat.slice(0, n)).toEqual(blank.slice(0, n));
});
