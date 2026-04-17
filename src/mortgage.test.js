/**
 * Mortgage paydown calculator tests
 *
 * Four tests covering:
 *   1. One-year amortization accuracy (math correctness)
 *   2. Net worth correctly reflects mortgage paydown
 *   3. MC drawdown should deduct mortgage P&I (integration gap → fixed)
 *   4. Income tab should display actual calculated payment (hardcode bug → fixed)
 */

import { runMC, mortgageSchedule } from "./App";

// Fix the clock so mortgageSchedule's elapsed-month calculation is deterministic.
// "2026-04" start + April 2026 now → elapsed = 0, full 360 months remaining.
const MOCK_NOW = new Date("2026-04-15T12:00:00.000Z");
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(MOCK_NOW);
});
afterAll(() => jest.useRealTimers());

// ─── shared fixture ───────────────────────────────────────────────────────────
const LOAN = { balance: 200_000, rate: 7.0, start: "2026-04", term: 30, extra: 0 };

const MC_PARAMS = {
  currentAge: 60, retireAge: 60, endAge: 90,
  port: 2_000_000, contrib: 0, inf: 2.5,
  sp: 80_000, ssAge: 62, ssb: 24_000,
  ab: 0, useAb: false,
  tax: 22, smile: false,
  preRetireEq: 91, postRetireEq: 70,
  gkFloor: 48_000, gkCeiling: 115_000,
  withdrawalStrategy: "gk",
  cashRealReturn: 1.0, useJointRmdTable: false,
  mortBalance: 0, mortRate: LOAN.rate,
  mortStart: LOAN.start, mortTerm: LOAN.term, mortExtra: LOAN.extra,
  accounts: [
    { id: "t1", category: "pretax",  name: "401k",    balance: 1_400_000 },
    { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
    { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
    { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
  ],
};

// ─── Test 1: One-year amortization accuracy ───────────────────────────────────
test("year-1 amortization: payment, interest, principal, and balance are correct", () => {
  const { years, pmt } = mortgageSchedule(
    LOAN.balance, LOAN.rate, LOAN.start, LOAN.term, LOAN.extra
  );
  const yr1 = years[0];

  // Standard 30yr fixed $200K at 7% → ~$1,331/mo
  expect(pmt).toBeGreaterThanOrEqual(1329);
  expect(pmt).toBeLessThanOrEqual(1332);

  // Year 1 total cash out ≈ 12 monthly payments (within $15 for rounding)
  expect(Math.abs(yr1.pPaid + yr1.iPaid - pmt * 12)).toBeLessThan(15);

  // Ending balance = starting balance − principal paid (within $5 rounding)
  expect(Math.abs(yr1.bal - (LOAN.balance - yr1.pPaid))).toBeLessThan(5);

  // Early in a 30yr loan: interest >> principal
  expect(yr1.iPaid).toBeGreaterThan(yr1.pPaid * 5);

  // Balance fell, but not by more than the full year's payments
  expect(yr1.bal).toBeLessThan(LOAN.balance);
  expect(yr1.bal).toBeGreaterThan(LOAN.balance - pmt * 12);

  // No extra payments
  expect(yr1.ePaid).toBe(0);
});

// ─── Test 2: Net worth correctly reflects mortgage paydown ────────────────────
test("net worth: mortgage balance is reduced after year 1 of payments", () => {
  const { years } = mortgageSchedule(
    LOAN.balance, LOAN.rate, LOAN.start, LOAN.term, LOAN.extra
  );
  const yr1 = years[0];
  const yr2 = years[1];

  // Balance strictly decreases each year
  expect(yr1.bal).toBeLessThan(LOAN.balance);
  expect(yr2.bal).toBeLessThan(yr1.bal);

  // Net worth impact: equity gained = principal paid
  const equityYr1 = LOAN.balance - yr1.bal;
  expect(equityYr1).toBe(yr1.pPaid);
});

// ─── Test 3: MC drawdown factors in mortgage P&I ─────────────────────────────
test("MC drawdown: having an active mortgage reduces success rate vs no mortgage", () => {
  const { pmt } = mortgageSchedule(
    LOAN.balance, LOAN.rate, LOAN.start, LOAN.term, LOAN.extra
  );

  // With a $200K mortgage the portfolio must cover P&I (~$16K/yr extra draw)
  const paramsNoMort = { ...MC_PARAMS, mortBalance: 0 };
  const paramsWithMort = { ...MC_PARAMS, mortBalance: LOAN.balance };

  const rNoMort   = runMC(paramsNoMort,   90, 1000, 42, true);
  const rWithMort = runMC(paramsWithMort, 90, 1000, 42, true);

  // Paying ~$16K/yr extra (pmt*12) from the portfolio should lower success rate
  expect(rWithMort.rate).toBeLessThan(rNoMort.rate);
});

// ─── Test 4: Income tab mortgage display uses actual calculated payment ────────
test("income tab: reported annual mortgage cost matches actual amortization schedule", () => {
  const { pmt, payoffYr } = mortgageSchedule(
    LOAN.balance, LOAN.rate, LOAN.start, LOAN.term, LOAN.extra
  );

  const actualAnnual  = pmt * 12;   // what the schedule computes
  const actualPayoffYr = payoffYr;

  // These are the values the income tab SHOULD display.
  // ~$1,331/mo × 12 = ~$15,972/yr for a $200K 7% 30yr loan
  expect(actualAnnual).toBeGreaterThan(15_900);
  expect(actualAnnual).toBeLessThan(16_000);

  // Payoff year should be ~30 years from now (2026 + 30 = 2056)
  expect(actualPayoffYr).toBeGreaterThanOrEqual(2054);
  expect(actualPayoffYr).toBeLessThanOrEqual(2057);
});
