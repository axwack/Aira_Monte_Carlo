import { mcMedianAtAge, selectPortfolioAtAge, deflate } from "./App";

const PCTS = [
  { age: 54, p10: 1_000_000, p50: 2_000_000, p90: 3_000_000 },
  { age: 55, p10: 1_050_000, p50: 2_100_000, p90: 3_200_000 },
  { age: 56, p10: 1_100_000, p50: 2_250_000, p90: 3_500_000 },
];

describe("mcMedianAtAge — real figures", () => {
  test("returns the median for an age that exists", () => {
    expect(mcMedianAtAge(PCTS, 55, 54)).toBe(2_100_000);
  });

  test("matches on the row's own age, so a stale retireAge cannot shift it", () => {
    expect(mcMedianAtAge(PCTS, 55, 60)).toBe(2_100_000);
  });

  test("a genuine zero is still reported as zero, not null", () => {
    const dead = [{ age: 54, p50: 0 }];
    expect(mcMedianAtAge(dead, 54, 54)).toBe(0);
  });
});

describe("mcMedianAtAge — never fabricates", () => {
  test("past the end of the data returns null, NOT the clamped last row", () => {
    expect(mcMedianAtAge(PCTS, 57, 54)).toBeNull();
    expect(mcMedianAtAge(PCTS, 90, 54)).toBeNull();
  });

  test("before the first row returns null", () => {
    expect(mcMedianAtAge(PCTS, 53, 54)).toBeNull();
  });

  test("NaN is null, not $0 — the reported failure mode", () => {
    const poisoned = [
      { age: 54, p50: 2_000_000 },
      { age: 55, p50: NaN },
      { age: 56, p50: NaN },
    ];
    expect(mcMedianAtAge(poisoned, 54, 54)).toBe(2_000_000);
    expect(mcMedianAtAge(poisoned, 55, 54)).toBeNull();
    expect(mcMedianAtAge(poisoned, 56, 54)).toBeNull();
    expect(mcMedianAtAge(poisoned, 55, 54)).not.toBe(0);
  });

  test("undefined and Infinity are also null", () => {
    expect(mcMedianAtAge([{ age: 54, p50: undefined }], 54, 54)).toBeNull();
    expect(mcMedianAtAge([{ age: 54, p50: Infinity }], 54, 54)).toBeNull();
  });

  test("empty or missing pcts returns null instead of throwing", () => {
    expect(mcMedianAtAge([], 54, 54)).toBeNull();
    expect(mcMedianAtAge(undefined, 54, 54)).toBeNull();
    expect(mcMedianAtAge(null, 54, 54)).toBeNull();
  });
});

describe("mcMedianAtAge — legacy rows with no age field", () => {
  const LEGACY = [{ p50: 2_000_000 }, { p50: 2_100_000 }, { p50: 2_250_000 }];

  test("falls back to positional indexing from retireAge", () => {
    expect(mcMedianAtAge(LEGACY, 54, 54)).toBe(2_000_000);
    expect(mcMedianAtAge(LEGACY, 56, 54)).toBe(2_250_000);
  });

  test("but still refuses to clamp past the end", () => {
    expect(mcMedianAtAge(LEGACY, 57, 54)).toBeNull();
    expect(mcMedianAtAge(LEGACY, 90, 54)).toBeNull();
  });
});

describe("selectPortfolioAtAge — basis correctness", () => {
  const mc = { pcts: PCTS };

  test("real: false (default) returns the raw nominal figure", () => {
    expect(selectPortfolioAtAge(mc, 55)).toBe(2_100_000);
    expect(selectPortfolioAtAge(mc, 55, { real: false })).toBe(2_100_000);
  });

  test("real: true deflates by the SAME factor deflate() would apply directly", () => {
    const inf = 2.5;
    const expected = deflate(PCTS, inf, true)[1].p50;
    expect(selectPortfolioAtAge(mc, 55, { real: true, inf })).toBe(expected);
    expect(selectPortfolioAtAge(mc, 55, { real: true, inf })).not.toBe(2_100_000);
  });

  test("real: true with inf: 0 is a no-op (0% inflation deflates to itself)", () => {
    expect(selectPortfolioAtAge(mc, 55, { real: true, inf: 0 })).toBe(2_100_000);
  });

  test("missing data is null, never a silent $0 (the Checkpoints table's old `|| 0` bug)", () => {
    expect(selectPortfolioAtAge(mc, 99)).toBeNull();
    expect(selectPortfolioAtAge(mc, 99)).not.toBe(0);
  });

  test("no mc / no pcts returns null instead of throwing", () => {
    expect(selectPortfolioAtAge(null, 55)).toBeNull();
    expect(selectPortfolioAtAge(undefined, 55)).toBeNull();
    expect(selectPortfolioAtAge({}, 55)).toBeNull();
  });

  test("pct lets a caller ask for a different percentile column", () => {
    const row = { age: 54, p10: 900_000, p50: 2_000_000, p90: 4_000_000 };
    expect(selectPortfolioAtAge({ pcts: [row] }, 54, { pct: "p10" })).toBe(900_000);
    expect(selectPortfolioAtAge({ pcts: [row] }, 54, { pct: "p90" })).toBe(4_000_000);
  });

  test("legacy rows without `age` still fall back through retireAge, same as mcMedianAtAge", () => {
    const legacyMc = { pcts: [{ p50: 2_000_000 }, { p50: 2_100_000 }, { p50: 2_250_000 }] };
    expect(selectPortfolioAtAge(legacyMc, 56, { retireAge: 54 })).toBe(2_250_000);
  });
});
