/**
 * Monte Carlo Advanced Settings — sampling-window and path-count behaviour.
 *
 * The load-bearing claim this file tests is DEFAULT PRESERVATION: an absent or
 * full-range window must not change a single number in an existing plan.
 * `resolveSampleRange` returns null for the full history on purpose, and every
 * sampler then takes its original code path — same rand() call count, same
 * index mapping. If that ever stops being true, every saved result and seed in
 * the app silently re-baselines, which is exactly the class of change that
 * looks harmless in review and moves every user's success rate.
 */

import { runMC } from "./App";
import { resolveSampleRange, SAMPLE_START_YEAR, SAMPLE_END_YEAR, MC_PATHS, MC_PATH_MIN, MC_PATH_MAX } from "./App";

const BASE = {
  currentAge: 60,
  retireAge: 60,
  dob: "1970-03-14",
  birthYear: 1970,
  endAge: 90,
  port: 2_000_000,
  contrib: 0,
  inf: 2.5,
  sp: 80_000,
  ssAge: 62,
  ssb: 24_000,
  ab: 0,
  useAb: false,
  tax: true,
  real: false,
  smile: false,
  preRetireEq: 91,
  postRetireEq: 70,
  gkFloor: 48_000,
  gkCeiling: 115_000,
  withdrawalStrategy: "gk",
  cashRealReturn: 1.0,
  useJointRmdTable: false,
  filingStatus: "mfj",
  stateOfResidence: "NJ",
  accounts: [
    { id: "t1", category: "pretax",  name: "401k",    balance: 1_400_000 },
    { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
    { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
    { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
  ],
};

test("an absent range resolves to the full history (null = original fast path)", () => {
  expect(resolveSampleRange(BASE)).toBeNull();
  expect(resolveSampleRange({ ...BASE, mcRangeStart: undefined, mcRangeEnd: undefined })).toBeNull();
});

test("an explicit full range also resolves to null, so it can't change results", () => {
  expect(resolveSampleRange({ ...BASE, mcRangeStart: SAMPLE_START_YEAR, mcRangeEnd: SAMPLE_END_YEAR })).toBeNull();
});

test("a narrowed window resolves to the matching offsets", () => {
  const r = resolveSampleRange({ ...BASE, mcRangeStart: 2000, mcRangeEnd: 2012 });
  expect(r).not.toBeNull();
  expect(r.lo).toBe(2000);
  expect(r.hi).toBe(2012);
  expect(r.count).toBe(13);
  expect(r.start).toBe(2000 - SAMPLE_START_YEAR);
});

test("degenerate or reversed ranges fall back to full history instead of throwing", () => {
  expect(resolveSampleRange({ ...BASE, mcRangeStart: 2000, mcRangeEnd: 2000 })).toBeNull();
  expect(resolveSampleRange({ ...BASE, mcRangeStart: 2012, mcRangeEnd: 2000 })).toBeNull();
  expect(resolveSampleRange({ ...BASE, mcRangeStart: NaN, mcRangeEnd: 2000 })).toBeNull();
  expect(resolveSampleRange({ ...BASE, mcRangeStart: 1900, mcRangeEnd: 1850 })).toBeNull();
});

test("out-of-range years are clamped into the data window", () => {
  const r = resolveSampleRange({ ...BASE, mcRangeStart: 1800, mcRangeEnd: 2025 });
  // Clamped to the data start; the end is the data end → full history again.
  expect(r).toBeNull();
  const r2 = resolveSampleRange({ ...BASE, mcRangeStart: 1800, mcRangeEnd: 1990 });
  expect(r2.start).toBe(0);
  expect(r2.hi).toBe(1990);
});

test("DEFAULT PRESERVATION: no range == full range, byte-identical results", () => {
  const noRange = runMC(BASE, 90, 400, 42, true);
  const fullRange = runMC({ ...BASE, mcRangeStart: SAMPLE_START_YEAR, mcRangeEnd: SAMPLE_END_YEAR }, 90, 400, 42, true);
  expect(fullRange.rate).toBe(noRange.rate);
  expect(fullRange.mwRate).toBe(noRange.mwRate);
  expect(fullRange.term.p50).toBe(noRange.term.p50);
  expect(fullRange.pcts.map((r) => r.p50)).toEqual(noRange.pcts.map((r) => r.p50));
});

test("a modern-only window can differ from the full history (the feature works)", () => {
  const full = runMC(BASE, 90, 600, 42, true);
  const modern = runMC({ ...BASE, mcRangeStart: 1980, mcRangeEnd: 2025 }, 90, 600, 42, true);
  // Not asserting a DIRECTION (that would encode a market opinion); asserting
  // the window actually reaches the engine and moves the answer.
  const differs = modern.rate !== full.rate || modern.term.p50 !== full.term.p50;
  expect(differs).toBe(true);
});

test("path count is honoured by runMC and reported back as N", () => {
  const r = runMC(BASE, 90, 750, 42, true);
  expect(r.N).toBe(750);
  expect(r.rate).toBeGreaterThanOrEqual(0);
  expect(r.rate).toBeLessThanOrEqual(1);
});

test("path-count bounds are coherent with the default", () => {
  expect(MC_PATH_MIN).toBeLessThan(MC_PATHS);
  expect(MC_PATH_MAX).toBeGreaterThan(MC_PATHS);
});
