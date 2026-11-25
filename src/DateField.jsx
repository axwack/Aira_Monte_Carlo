import React, { useEffect, useState } from "react";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCommittable(value, min = "1900-01-01", max) {
  if (value === "") return true;
  if (!DATE_RE.test(value)) return false;
  const [, y, m, d] = DATE_RE.exec(value).map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
  return value >= min && (!max || value <= max);
}

export default function DateField({ value, onSet, min = "1900-01-01", max, style }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);

  return (
    <input
      type="date"
      value={draft}
      min={min}
      max={max}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (isCommittable(v, min, max)) onSet(v);
      }}
      onBlur={() => setDraft(value || "")}
      style={style}
    />
  );
}
