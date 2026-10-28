// Each row's `m` is the FLOOR of its own tier, paired with THAT tier's own
// surcharge (irmaaCost walks the array from the end, returning the first
// row whose floor the MAGI clears). The array previously paired each floor
// with the PRECEDING tier's charge (218000 tier carried $0 rather than
// $2,160; 750000 carried $8,300's neighbor $11,130 rather than the true
// top-tier $12,700) — a whole-table off-by-one, not just a missing top row.
// Verified against aira-forecaster-agents/knowledge/TAX_REFERENCE.md's
// "IRMAA Thresholds (MFJ 2026)" list, tier by tier.
export const IRMAA_2026 = [
  { m: 218000, f: 2160 },
  { m: 274000, f: 5470 },
  { m: 342000, f: 8300 },
  { m: 410000, f: 11130 },
  { m: 750000, f: 12700 },
];