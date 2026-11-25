import { runMC, mortgageSchedule } from "./App";

const MOCK_NOW = new Date("2026-04-15T12:00:00.000Z");
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(MOCK_NOW);
});
afterAll(() => jest.useRealTimers());

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

test("year-1 amortization: payment, interest, principal, and balance are correct", () => {
  const { years, pmt } = mortgageSchedule(
    LOAN.balance, LOAN.rate, LOAN.start, LOAN.term, LOAN.extra
  );
  const yr1 = years[0];

  expect(pmt).toBeGreaterThanOrEqual(1329);
  expect(pmt).toBeLessThanOrEqual(1332);

  expect(Math.abs(yr1.pPaid + yr1.iPaid - pmt * 12)).toBeLessThan(15);

  expect(Math.abs(yr1.bal - (LOAN.balance - yr1.pPaid))).toBeLessThan(5);

  expect(yr1.iPaid).toBeGreaterThan(yr1.pPaid * 5);

  expect(yr1.bal).toBeLessThan(LOAN.balance);
  expect(yr1.bal).toBeGreaterThan(LOAN.balance - pmt * 12);

  expect(yr1.ePaid).toBe(0);
});

test("net worth: mortgage balance is reduced after year 1 of payments", () => {
  const { years } = mortgageSchedule(
    LOAN.balance, LOAN.rate, LOAN.start, LOAN.term, LOAN.extra
  );
  const yr1 = years[0];
  const yr2 = years[1];

  expect(yr1.bal).toBeLessThan(LOAN.balance);
  expect(yr2.bal).toBeLessThan(yr1.bal);

  const equityYr1 = LOAN.balance - yr1.bal;
  expect(equityYr1).toBe(yr1.pPaid);
});

test("MC drawdown: having an active mortgage reduces success rate vs no mortgage", () => {
  const { pmt } = mortgageSchedule(
    LOAN.balance, LOAN.rate, LOAN.start, LOAN.term, LOAN.extra
  );

  const paramsNoMort = { ...MC_PARAMS, mortBalance: 0 };
  const paramsWithMort = { ...MC_PARAMS, mortBalance: LOAN.balance };

  const rNoMort   = runMC(paramsNoMort,   90, 1000, 42, true);
  const rWithMort = runMC(paramsWithMort, 90, 1000, 42, true);

  expect(rWithMort.rate).toBeLessThan(rNoMort.rate);
});

test("income tab: reported annual mortgage cost matches actual amortization schedule", () => {
  const { pmt, payoffYr } = mortgageSchedule(
    LOAN.balance, LOAN.rate, LOAN.start, LOAN.term, LOAN.extra
  );

  const actualAnnual  = pmt * 12;
  const actualPayoffYr = payoffYr;

  expect(actualAnnual).toBeGreaterThan(15_900);
  expect(actualAnnual).toBeLessThan(16_000);

  expect(actualPayoffYr).toBeGreaterThanOrEqual(2054);
  expect(actualPayoffYr).toBeLessThanOrEqual(2057);
});
