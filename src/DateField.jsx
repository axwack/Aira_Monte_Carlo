import React, { useEffect, useState } from "react";

/**
 * A native date input that only tells its parent about COMPLETE, plausible dates.
 *
 * Chrome fires onChange with a full "YYYY-MM-DD" the moment every segment has a
 * value, so typing a year digit by digit produces 0001, 0019, 0198 ... before
 * 1985. When each of those went straight into the profile, the app derived an
 * age of ~2000 from year 0001 and re-ran everything on every keystroke, so the
 * field appeared unusable. The draft stays local; the parent sees "" (cleared)
 * or a date inside [min, max].
 */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCommittable(value, min = "1900-01-01", max) {
  if (value === "") return true;
  if (!DATE_RE.test(value)) return false;
  const [, y, m, d] = DATE_RE.exec(value).map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
  return value >= min && (!max || value <= max); // ISO strings compare chronologically
}

export default function DateField({ value, onSet, min = "1900-01-01", max, style }) {
  const [draft, setDraft] = useState(value || "");
  // Follow outside changes (import, Start over) but never fight the user's typing.
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
      onBlur={() => setDraft(value || "")} // abandon a half-typed / out-of-range date
      style={style}
    />
  );
}
