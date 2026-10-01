import fs from "fs";
import path from "path";
import { notEnteredKeys } from "./App";
import { INCOME_LABELS } from "./engine/incomeLabels";

const SRC = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
// The real-estate editor moved out of App.jsx into the Plan inputs section (WP-A).
const RE_SRC = fs.readFileSync(path.join(__dirname, "planInputs/RealEstateSection.jsx"), "utf8");

describe("expense rows that were never entered", () => {
  test("no carveouts and no mortgage -> dash Medical/LTC/Other/Housing and always Capital Gains", () => {
    expect(notEnteredKeys({ carveouts: [], mortBalance: 0 }).sort())
      .toEqual(["Capital Gains Tax", "Long-Term Care", "Medical", "Mortgage/Housing", "Other Expenses"]);
  });
  test("entered carveouts and a mortgage -> only Capital Gains stays a dash", () => {
    expect(notEnteredKeys({ carveouts: [{ id: 1 }], mortBalance: 200_000 })).toEqual(["Capital Gains Tax"]);
  });
});

test("savings row is labelled as including 401(k)/IRA draws", () => {
  expect(INCOME_LABELS.savingsDrawdown).toBe("Savings & 401(k)/IRA Drawdown");
  expect(SRC).not.toMatch(/\["Savings Drawdown"/);
});

test("labels and captions", () => {
  expect(RE_SRC).toContain('label="Original term (yrs)"');
  expect(SRC).toContain("Current life phase");
  expect(SRC).not.toMatch(/ℹ️<\/span>\}>/); // Median Final Balance uses the standard icon
});

test("real-estate headers are right-aligned over their inputs", () => {
  expect(RE_SRC).toMatch(/labelStyle = \{[^}]*textAlign: "right"/);
  ["Gross value", "Mortgage balance", "Annual income (opt)"].forEach((l) => expect(RE_SRC).toContain(`label="${l}"`));
});
