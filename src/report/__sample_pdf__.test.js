/**
 * TEMPORARY, not part of the suite — generates a full-length sample report
 * (same technique report.test.js already uses: renderToStaticMarkup, no
 * browser, no API key) so the print-pagination fix can be eyeballed as a
 * real PDF. Deleted after use.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import PrintReport from "./PrintReport";

const RETIRE_AGE = 64;
const END_AGE = 92;

function pcts() {
  const rows = [];
  for (let age = RETIRE_AGE; age <= END_AGE; age++) {
    const t = (age - RETIRE_AGE) / (END_AGE - RETIRE_AGE); // 0..1
    const grow = (base, mult) => Math.round(base * (1 + mult * t) / 1000) * 1000;
    rows.push({
      age,
      p10: grow(1_600_000, 0.35),
      p25: grow(1_950_000, 0.85),
      p50: grow(2_350_000, 2.6),
      p75: grow(2_800_000, 4.5),
      p90: grow(3_250_000, 7.9),
      alive: Math.max(0.5, 1 - t * 0.5),
    });
  }
  return rows;
}

const PARAMS = {
  name: "Marc Bateman",
  dob: "1967-01-01",
  currentAge: 59,
  retireAge: RETIRE_AGE,
  endAge: END_AGE,
  ssAge: 70,
  ssb: 57_516,
  ssCola: 2.4,
  inf: 2.5,
  preRetireEq: 70,
  postRetireEq: 60,
  cashRealReturn: 3.0,
  taxableBasisPct: 90,
  filingStatus: "mfj",
  stateOfResidence: "TX",
  twoHousehold: false,
  withdrawalStrategy: "smart",
  withdrawalBracketTarget: "12",
  irmaaGuard: true,
  rothEmergencyReserve: 0,
  rothConversionTarget: "22",
  conversionOverrides: [],
  accounts: [
    { id: "1", category: "pretax", name: "IRA/401k", balance: 1_079_795 },
    { id: "2", category: "roth", name: "Roth", balance: 131_000 },
    { id: "3", category: "taxable", name: "Taxable", balance: 20_634 },
    { id: "4", category: "cash", name: "Cash/HSA", balance: 107_000 },
  ],
  sp: 0,
};

const MC = {
  rate: 0.969,
  mwRate: 0.988,
  N: 3000,
  medR: 2_365_195,
  term: { p10: 2_137_189, p25: 4_956_013, p50: 9_980_434, p75: 17_915_516, p90: 29_023_532 },
  pcts: pcts(),
};

const STRESS = { rate: 0.855, N: 2000 };

test("generate sample report HTML", () => {
  const html = renderToStaticMarkup(
    <PrintReport params={PARAMS} mc={MC} stress={STRESS} rmdAge={75} locked={false} />
  );
  const doc =
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    "<title>AiRA Sample Report</title></head><body>" +
    html +
    "</body></html>";
  const outDir = "C:\\Users\\user\\AppData\\Local\\Temp\\claude\\c--Users-user-Documents-Claude---White-Aira-Monte-Carlo\\7b33b489-bd60-49b5-a304-73db1a7726e7\\scratchpad";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "sample_report.html"), doc, "utf-8");
  expect(html.length).toBeGreaterThan(0);
});
