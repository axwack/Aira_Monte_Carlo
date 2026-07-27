/**
 * PrintReport smoke tests — pure render-to-string checks (no RTL in this repo,
 * see banner.test.js / computations.test.js for the established convention of
 * either source-text checks or lightweight rendering). react-dom/server's
 * renderToStaticMarkup gives a synchronous, dependency-free way to render the
 * component tree and assert on the resulting HTML string.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrintReport, { formatMoney, IS_PLACEHOLDER } from "./PrintReport";

// The real printable report is not part of the public repository (REQUIREMENTS §20):
// what ships here is a placeholder with the same export shape, so `npm run build`
// stays green for anyone who clones this. These assertions describe the PAID
// report's content, so against the placeholder they would fail for an expected,
// by-design reason — and a suite that is permanently red for a non-bug trains you
// to stop reading it. Skip instead, loudly, and run in full wherever the private
// implementation is present (it does not export IS_PLACEHOLDER).
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

  describe("locked mode (credit paywall)", () => {
    test("default (no `locked` prop) behaves exactly as before — Print button present, no unlock card", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" />
      );
      expect(html).toMatch(/Print \/ Save as PDF/);
      expect(html).not.toMatch(/Premium Report/);
    });

    test("locked=false explicitly — Print button present, no unlock card", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={false} />
      );
      expect(html).toMatch(/Print \/ Save as PDF/);
      expect(html).not.toMatch(/Premium Report/);
    });

    test("locked=true — Print button absent, unlock card present", () => {
      const html = renderToStaticMarkup(
        <PrintReport params={BASE_PARAMS} mc={BASE_MC} stress={BASE_STRESS} rmdAge={75} buildTag="[test] v0.0.0.0" locked={true} />
      );
      expect(html).not.toMatch(/Print \/ Save as PDF/);
      expect(html).toMatch(/Premium Report/);
    });

    // The paywall used to render every section and merely add a `pr-blurred`
    // CSS class, so deleting one class in devtools revealed the whole report.
    // Since every figure is computed client-side, withholding the MARKUP is the
    // only gate that actually holds. These assert exactly that.
    //
    // NOTE: don't assert on /pr-blurred/ — PRINT_CSS is rendered inline in a
    // <style> block, so that string is always present regardless of the class
    // actually applied. The original test matched the stylesheet, not the DOM,
    // and so could never have failed.
    // Matched as <h2> specifically: the teaser intentionally NAMES these
    // sections to sell the unlock, so bare-text matching would hit the teaser's
    // own labels. Only a real rendered section emits the <h2>.
    const PAID_HEADINGS = [
      /<h2>Monte Carlo Verdict/,
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
      // Nothing is withheld by showing the user their own inputs, and it makes
      // the preview read as a real document rather than an error state.
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
  });
});
