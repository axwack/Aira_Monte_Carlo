/**
 * Full app test — Monte Carlo engine output correctness
 *
 * Runs runMC with a fixed seed and a standard conservative retirement
 * scenario, then asserts the output shape and values are sensible.
 *
 * Scenario: age 60, retire 60, endAge 90, $2M portfolio, $80K/yr spend,
 * $24K/yr SS, no Airbnb. With a 60/40 mix this should succeed ~70-95%.
 */

import { runMC } from "./App";

const BASE_PARAMS = {
  currentAge: 60,
  retireAge: 60,
  port: 2_000_000,
  contrib: 0,
  inf: 2.5,
  sp: 80_000,
  ssAge: 62,
  ssb: 24_000,
  ab: 0,
  useAb: false,
  tax: 22,
  real: false,
  smile: false,
  preRetireEq: 91,
  postRetireEq: 70,
  gkFloor: 48_000,
  gkCeiling: 115_000,
  withdrawalStrategy: "gk",
  cashRealReturn: 1.0,
  useJointRmdTable: false,
  accounts: [
    { id: "t1", category: "pretax",  name: "401k",    balance: 1_400_000 },
    { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
    { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
    { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
  ],
};

test("runMC returns correct output structure and sensible values for a standard retirement scenario", () => {
  const result = runMC(BASE_PARAMS, 90, 3000, 42, true);

  // --- Shape ---
  expect(result).toHaveProperty("rate");
  expect(result).toHaveProperty("medR");
  expect(result).toHaveProperty("pcts");
  expect(result).toHaveProperty("term");
  expect(result).toHaveProperty("N", 3000);

  // --- Rate is a valid probability ---
  expect(result.rate).toBeGreaterThanOrEqual(0);
  expect(result.rate).toBeLessThanOrEqual(1);

  // --- For this conservative scenario, success rate should be reasonable ---
  expect(result.rate).toBeGreaterThan(0.5);

  // --- Percentile paths cover the full retirement horizon (30 years) ---
  expect(result.pcts).toHaveLength(31); // age 60 → 90 inclusive

  // --- Terminal percentiles are ordered correctly ---
  expect(result.term.p10).toBeLessThanOrEqual(result.term.p25);
  expect(result.term.p25).toBeLessThanOrEqual(result.term.p50);
  expect(result.term.p50).toBeLessThanOrEqual(result.term.p75);
  expect(result.term.p75).toBeLessThanOrEqual(result.term.p90);

  // --- Median portfolio at retirement starts near the input total ---
  expect(result.medR).toBeGreaterThan(1_500_000);
  expect(result.medR).toBeLessThan(2_500_000);

  // --- Deterministic: same seed always gives same rate ---
  const result2 = runMC(BASE_PARAMS, 90, 3000, 42, true);
  expect(result2.rate).toBe(result.rate);
});
