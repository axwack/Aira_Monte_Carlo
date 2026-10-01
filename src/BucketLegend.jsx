import React from "react";
import { _defaultBucket } from "./engine/buckets.js";
import { BUCKET_HORIZONS, BUCKET_LABELS, bucketColor } from "./engine/bucketColors.js";

export function BucketLegend() {
  return (
    <div aria-label="Bucket legend" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.4 }}>
      {[1, 2, 3].map((n) => {
        const key = `b${n}`;
        return (
          <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title={BUCKET_HORIZONS[key]}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: bucketColor(n), display: "inline-block" }} />
            {BUCKET_LABELS[key]}
          </span>
        );
      })}
    </div>
  );
}

export function BucketResetButton({ account, onReset }) {
  if (!account) return null;
  const defaultBucket = _defaultBucket(account.category);
  return (
    <button
      type="button"
      onClick={() => onReset(account.id, defaultBucket)}
      title={`Reset to ${BUCKET_LABELS[`b${defaultBucket}`] || `Bucket ${defaultBucket}`}`}
      aria-label={`Reset ${account.name || account.category} to its category default bucket`}
      style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}
    >↺</button>
  );
}
