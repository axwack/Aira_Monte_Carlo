/**
 * Stable display palette for the three time-horizon buckets.
 *
 * These are presentation tokens only. Bucket assignment, clamping, and
 * accounting remain in engine/buckets.js. Keeping this table separate lets
 * every surface use the same colors without coupling UI code to React.
 */
export const BUCKET_COLORS = Object.freeze({
  b1: "#0ea5e9", // cash cushion / near-term spending
  b2: "#a78bfa", // income bridge / intermediate horizon
  b3: "#14b8a6", // growth / long-term reserve
});

export function bucketColor(bucket) {
  const n = Number(bucket);
  if (n === 1) return BUCKET_COLORS.b1;
  if (n === 2) return BUCKET_COLORS.b2;
  if (n === 3) return BUCKET_COLORS.b3;
  return null;
}

export const BUCKET_LABELS = Object.freeze({
  b1: "Bucket 1 — Cash cushion",
  b2: "Bucket 2 — Income bridge",
  b3: "Bucket 3 — Growth / long-term",
});

export const BUCKET_HORIZONS = Object.freeze({
  b1: "0–2 years · pay bills now",
  b2: "2–7 years · refill Bucket 1",
  b3: "7+ years · last resort",
});
