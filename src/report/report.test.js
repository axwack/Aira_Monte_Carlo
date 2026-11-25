import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrintReport, { formatMoney, IS_PLACEHOLDER } from "./PrintReport";

const describeReport = IS_PLACEHOLDER ? describe.skip : describe;

if (IS_PLACEHOLDER) {
  // eslint-disable-next-line no-console
  console.warn(
    "[report.test] SKIPPED: src/report/PrintReport.jsx is the public placeholder, " +
    "not the real report. If you expected the paid report here, the private file is " +
    "missing from this working copy — restore it before deploying, or the deploy " +
    "ships the placeholder to paying customers. See REQUIREMENTS §20."
  );
}

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

describeReport("PrintReport", () => {
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
    expect(html).toMatch(/Success rate to plan age|Will the Money Last/);
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

  describe("locked mode (credit paywall)", () => {
    test("default (no `locked` prop) behaves exactly as before — Print button present, no unlock card", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" />
      );
      expect(html).toMatch(/Print \/ Save as PDF/);
      expect(html).not.toMatch(/Printable Report/);
    });

    test("locked=false explicitly — Print button present, no unlock card", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={false} />
      );
      expect(html).toMatch(/Print \/ Save as PDF/);
      expect(html).not.toMatch(/Printable Report/);
    });

    test("locked=true — Print button absent, unlock card present", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={true} />
      );
      expect(html).not.toMatch(/Print \/ Save as PDF/);
      expect(html).toMatch(/Printable Report/);
      expect(html).toMatch(/\$9\.00/);
      expect(html).toMatch(/Buy the report/);
      expect(html).toMatch(/no expiry/);
    });

    const PAID_HEADINGS = [
      /<h2>Will the Money Last\?/,
      /<h2>Stress Test/,
      /<h2>Withdrawal Schedule/,
      /<h2>Lifetime Tax Summary/,
    ];

    test("locked=true withholds the paid section markup entirely", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={{ ...BASE_PARAMS, rothConversionTarget: "22" }} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={true} />
      );
      for (const heading of PAID_HEADINGS) expect(html).not.toMatch(heading);
      expect(html).not.toMatch(/<h2>Roth Conversion Plan/);
    });

    test("locked=true does not leak the headline success rate", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={{ ...BASE_MC, rate: 0.873 }} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={true} />
      );
      expect(html).not.toMatch(/87\.3/);
    });

    test("locked=true still shows the cover, the user's own assumptions, and the teaser", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={true} />
      );
      expect(html).toMatch(/Retirement Plan Report/);
      expect(html).toMatch(/Assumptions/);
      expect(html).toMatch(/Included in the full report/);
      expect(html).toMatch(/Disclaimer/);
    });

    test("unlocking restores every paid section", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={{ ...BASE_PARAMS, rothConversionTarget: "22" }} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={false} />
      );
      for (const heading of PAID_HEADINGS) expect(html).toMatch(heading);
      expect(html).toMatch(/<h2>Roth Conversion Plan/);
      expect(html).not.toMatch(/Included in the full report/);
    });

    test("locked=true still renders the Close button", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={true} />
      );
      expect(html).toMatch(/Close/);
    });

    test("print CSS restores the overlay's ancestor chain after hiding the app", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={false} />
      );
      const hideAt    = html.indexOf("body * { display: none !important; }");
      const rootAt    = html.indexOf("#root { display: revert !important; }");
      const hasAt     = html.indexOf(":has(.aira-print-overlay) { display: revert !important; }");
      expect(hideAt).toBeGreaterThan(-1);
      expect(rootAt).toBeGreaterThan(hideAt);
      expect(hasAt).toBeGreaterThan(hideAt);
    });
  });
});
