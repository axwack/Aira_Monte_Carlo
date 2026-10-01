import React from "react";
import DateField from "./DateField";

function localTodayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const INPUT_STYLE = {
  background: "#0d1b2a",
  border: "1px solid #1e3a5f",
  color: "#e2e8f0",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 12,
  fontFamily: "'JetBrains Mono',monospace",
  width: 130,
};

/**
 * Spouse DOB field using the same guarded date behavior as the primary DOB.
 * The parent remains the source of truth; this component only presents the
 * field and rejects incomplete/impossible dates through DateField.
 */
export default function SpouseDobField({ value, onSet, hint }) {
  return (
    <div>
      <DateField value={value} onSet={onSet} max={localTodayIso()} style={INPUT_STYLE} />
      {hint && <div style={{ marginTop: 4, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

export { localTodayIso };
