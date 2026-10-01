import {
  BUCKET_COLORS,
  BUCKET_HORIZONS,
  BUCKET_LABELS,
  bucketColor,
} from "./engine/bucketColors.js";

describe("bucket display palette", () => {
  test("has one stable color for each bucket", () => {
    expect(bucketColor(1)).toBe(BUCKET_COLORS.b1);
    expect(bucketColor(2)).toBe(BUCKET_COLORS.b2);
    expect(bucketColor(3)).toBe(BUCKET_COLORS.b3);
  });

  test("invalid bucket numbers do not silently become a valid color", () => {
    expect(bucketColor(0)).toBeNull();
    expect(bucketColor(4)).toBeNull();
    expect(bucketColor("no bucket")).toBeNull();
  });

  test("labels and horizons explain the palette in a legend", () => {
    expect(BUCKET_LABELS.b1).toMatch(/cash cushion/i);
    expect(BUCKET_LABELS.b2).toMatch(/income bridge/i);
    expect(BUCKET_LABELS.b3).toMatch(/growth|long-term/i);
    expect(BUCKET_HORIZONS.b1).toMatch(/0–2 years/i);
    expect(BUCKET_HORIZONS.b2).toMatch(/2–7 years/i);
    expect(BUCKET_HORIZONS.b3).toMatch(/7\+ years/i);
  });
});
