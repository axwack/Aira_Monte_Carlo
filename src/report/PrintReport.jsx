/**
 * PrintReport.jsx — open-source build placeholder.
 *
 * The full printable CFP/CPA-ready report (Monte Carlo verdict, stress test,
 * year-by-year withdrawal schedule, Roth conversion plan, lifetime tax
 * summary) is part of the hosted AiRA product and is not included in this
 * public repository. The operator's own deployment builds from a private
 * local copy of this file with the same export shape, so nothing else in
 * the app needs to know which version is present.
 */
import React from "react";

export function formatMoney(v) {
  if (v == null || isNaN(v)) return "—";
  const n = Math.round(v);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

export default function PrintReport({ onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.85)",
        zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#0f172a", color: "#e2e8f0", borderRadius: 12,
          padding: "28px 32px", maxWidth: 360, textAlign: "center",
          fontFamily: "'Inter', system-ui, sans-serif", border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Report module not included</h3>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 18px" }}>
          The printable report feature is part of the hosted AiRA product and isn't
          bundled in this build.
        </p>
        <button
          type="button"
          onClick={() => onClose && onClose()}
          style={{
            background: "#334155", color: "#e2e8f0", border: "none",
            borderRadius: 6, padding: "8px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
