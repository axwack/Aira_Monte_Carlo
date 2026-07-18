/**
 * PrintReport smoke tests — pure render-to-string checks (no RTL in this repo,
 * see banner.test.js / computations.test.js for the established convention of
 * either source-text checks or lightweight rendering). react-dom/server's
 * renderToStaticMarkup gives a synchronous, dependency-free way to render the
 * component tree and assert on the resulting HTML string.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrintReport, { formatMoney } from "./PrintReport";

const BASE_PARAMS = {
  name: "Jane Retiree",
  dob: "1966-01-01",
  currentAge: 60,
  retireAge: 62,
  endAge: 90,
  ssAge: 67,
  ssb: 30_000,
  ssCola: 2.4,
  inf: 2.5,
  preRetireEq: 91,
  postRetireEq: 70,
  cashRealReturn: 3.0,
  taxableBasisPct: 70,
  filingStatus: "mfj",
  stateOfResidence: "NJ",
  twoHousehold: false,
  withdrawalStrategy: "smart",
  withdrawalBracketTarget: "22",
  irmaaGuard: false,
  rothEmergencyReserve: 0,
  rothConversionTarget: "off",
  conversionOverrides: [],
  accounts: [
    { id: "1", category: "pretax", name: "401k", balance: 1_200_000 },
    { id: "2", category: "roth", name: "Roth", balance: 300_000 },
    { id: "3", category: "taxable", name: "Brokerage", balance: 200_000 },
    { id: "4", category: "cash", name: "Cash", balance: 50_000 },
  ],
  sp: 80_000,
};

const BASE_MC = {
  rate: 0.87,
  N: 3000,
  medR: 1_750_000,
  term: { p10: 500_000, p25: 900_000, p50: 1_500_000, p75: 2_200_000, p90: 3_100_000 },
  pcts: [
    { age: 62, p10: 1_000_000, p25: 1_200_000, p50: 1_500_000, p75: 1_800_000, p90: 2_100_000, alive: 1.0 },
    { age: 63, p10: 950_000, p25: 1_180_000, p50: 1_520_000, p75: 1_850_000, p90: 2_150_000, alive: 0.99 },
  ],
};

const BASE_STRESS = { rate: 0.74, N: 2000 };

describe("PrintReport", () => {
  test("renders without crashing given a minimal params+mc fixture", () => {
    const html = renderToStaticMarkup(
      <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" />
    );
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });

  test("contains key strings", () => {
    const html = renderToStaticMarkup(
      <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" />
    );
    expect(html).toMatch(/Retirement Plan Report/);
    expect(html).toMatch(/Assumptions/);
    expect(html).toMatch(/Success rate to plan age|Monte Carlo Verdict/);
  });

  test("formats a known dollar amount with commas", () => {
    expect(formatMoney(1_234_567)).toBe("$1,234,567");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(-2_500)).toBe("-$2,500");
  });

  test("omits the Roth conversion section when no conversions exist", () => {
    const html = renderToStaticMarkup(
      <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" />
    );
    expect(html).not.toMatch(/Roth Conversion Plan/);
  });

  test("includes the Roth conversion section when conversions exist", () => {
    const paramsWithConversion = {
      ...BASE_PARAMS,
      rothConversionTarget: "22",
    };
    const html = renderToStaticMarkup(
      <PrintReport params={paramsWithConversion} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" />
    );
    expect(html).toMatch(/Roth Conversion Plan/);
  });
});
