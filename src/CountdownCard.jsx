import React, { useEffect, useState } from "react";
import { retirementTarget, describeCountdown } from "./engine/retirementTarget";
import { parseCalendarDate } from "./engine/ages";

// Owns its own clock so a tick re-renders only this card, never the app root.
// Once a minute is plenty: nothing here is finer than a day.
export const COUNTDOWN_TICK_MS = 60000;

/** % of the working career elapsed, start → target. null when it can't be said honestly. */
export function careerProgress(startDate, target, now = new Date()) {
  if (!startDate || !target) return null;
  const s = parseCalendarDate(startDate);
  if (isNaN(s) || s >= target.date) return null;
  return Math.max(0, Math.min(100, ((now - s) / (target.date - s)) * 100));
}

export default function CountdownCard({ dob, retireAge, dobIsEstimate, employerStartDate, name, onConfigure }) {
  const [now, setNow] = useState(() => new Date());
  const showCountdown = Boolean(dob && !dobIsEstimate);
  useEffect(() => {
    if (!showCountdown) return undefined;
    const t = setInterval(() => setNow(new Date()), COUNTDOWN_TICK_MS);
    return () => clearInterval(t);
  }, [showCountdown]);

  const target = retirementTarget({ dob, retireAge, dobIsEstimate });
  const d = describeCountdown(target, now);
  const pct = careerProgress(employerStartDate, target, now);

  if (!showCountdown) {
    return (
      <div data-testid="countdown-card">
        <div className="sb-title">Retirement Countdown</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Add your date of birth to see a meaningful retirement countdown.
        </div>
        {onConfigure && (
          <button type="button" onClick={onConfigure}
            style={{ marginTop: 8, padding: "5px 9px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--accent-teal)", background: "transparent", color: "var(--accent-teal)", fontSize: 11, fontWeight: 700 }}>
            Add date of birth →
          </button>
        )}
      </div>
    );
  }

  return (
    <div data-testid="countdown-card">
      <div className="sb-title">Retirement Countdown</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
        <div style={{ color: "var(--accent-teal)", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
          {d.heading}
        </div>
        {d.detail && (
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary, #f0fdfa)", marginTop: 4 }}>
            {d.detail}
          </div>
        )}
        {d.totalDays != null && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {d.totalDays.toLocaleString()} days total
          </div>
        )}
        {d.approx && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            Add your real date of birth in Plan inputs for an exact date.
          </div>
        )}
      </div>
      {pct != null && (
        <>
          <div className="progress-bar" style={{ marginTop: 8 }} role="progressbar"
               aria-label="Share of working career completed" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${pct.toFixed(1)}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>
            <span>Career since {parseCalendarDate(employerStartDate).getFullYear()}</span>
            <span style={{ color: "var(--accent-teal)", fontWeight: 600 }}>{pct.toFixed(1)}% done</span>
          </div>
        </>
      )}
      {name && (
        <div style={{ fontSize: 18, color: "var(--accent-teal)", textAlign: "right", marginTop: 8, fontWeight: 600 }}>
          📋 {name}
        </div>
      )}
    </div>
  );
}
