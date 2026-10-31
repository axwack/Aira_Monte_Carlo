// Each row's `m` is the FLOOR of its own tier, paired with THAT tier's own
// surcharge (irmaaCost walks the array from the end, returning the first row
// whose floor the MAGI clears).
//
// `f` is the ANNUAL surcharge for a two-person Medicare household, Part B plus
// Part D, at that tier. Per person per month it is f/24. Source: CMS fact sheet
// "2026 Medicare Parts A & B Premiums and Deductibles" (14 Nov 2025),
// https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles
//   Part B surcharge / person / month: 81.20, 202.90, 324.60, 446.30, 487.00
//   Part D surcharge / person / month: 14.50,  37.50,  60.40,  83.30,  91.00
//   summed and doubled over 12 months: 2,296.80 / 5,769.60 / 9,240 / 12,710.40 / 13,872
//
// Part D is included because the app has no separate drug-cost line: the owner
// ruled on 2026-10-30 that the surcharge must cover B + D, since prescription
// drugs are a large share of retiree health spending. The old values (2,160 /
// 5,470 / 8,300 / 11,130 / 12,700) matched neither B alone nor B + D. Pinned by
// src/engineTaxTables.test.js.
export const IRMAA_2026 = [
  { m: 218000, f: 2296.8 },
  { m: 274000, f: 5769.6 },
  { m: 342000, f: 9240 },
  { m: 410000, f: 12710.4 },
  { m: 750000, f: 13872 },
];