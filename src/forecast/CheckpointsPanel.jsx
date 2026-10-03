import React, { useState } from "react";
import { ageFromDob, parseCalendarDate } from "../engine/ages.js";
import { selectPortfolioAtAge } from "../engine/mcSelectors.js";

/**
 * "Portfolio checkpoints (actual vs. forecast)" — lifted out of `MCTab`.
 *
 * Props in, callbacks out: this module never imports `App.jsx`, and it holds no
 * source of truth. `checkpoints` is owned by the caller (profile field
 * `checkpoints`); every mutation leaves through a callback.
 *
 * WHAT CHANGED WHEN IT MOVED
 * --------------------------
 *  1. The three emoji-only row buttons (✏️ 🗑️ 📍) now carry text labels and
 *     `aria-label`s. Emoji alone is not an accessible name, and "📍" told a
 *     screen-reader user nothing about rolling every balance forward.
 *  2. "Set baseline" asks first, and says what it will do. It rewrites every
 *     account balance, so a one-click action next to Edit/Delete was a trap.
 *  3. Save explains itself. It used to `return` silently on an empty date or
 *     value, which reads as a broken button.
 *  4. When the table shows only the most recent rows, it says how many exist.
 *
 * `fmtDollar` is a prop on purpose: App.jsx owns that formatter, and a second
 * copy is how two surfaces start rounding differently.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const defaultFmtDollar = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

/** The reason Save cannot proceed, or "" when it can. Order matters: the date is
 *  the field a user is most likely to leave empty. */
export function checkpointError({ date, value } = {}) {
  if (!date) return "Add the date this balance was true.";
  if (!DATE_RE.test(String(date))) return "Use a date in YYYY-MM-DD form.";
  // A shape check is not enough: "2020-13-99" matches the pattern. Compare the
  // parsed date back to the parts so a month 13 or a day 99 is refused here
  // rather than silently becoming some other day on the calendar.
  const [y, m, d] = String(date).split("-").map(Number);
  const parsed = parseCalendarDate(String(date));
  if (isNaN(parsed.getTime()) || parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    return "That date does not exist.";
  }
  if (value === "" || value === null || value === undefined) return "Add the portfolio value on that date.";
  const n = Number(value);
  if (!Number.isFinite(n)) return "The portfolio value must be a number.";
  if (n <= 0) return "The portfolio value must be greater than zero.";
  return "";
}

export default function CheckpointsPanel({
  checkpoints = [],
  mc = null,
  retireAge,
  dob,
  currentPort = 0,
  fmtDollar = defaultFmtDollar,
  onUpdate,
  onDelete,
  onSetBaseline,
  defaultOpen = false,
  maxRows = 6,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmingBaselineId, setConfirmingBaselineId] = useState(null);

  const cancelEdit = () => {
    setEditingId(null);
    setDate("");
    setValue("");
    setNote("");
    setError("");
    setShowForm(false);
  };

  const startEdit = (cp) => {
    setEditingId(cp.id);
    setDate(cp.date || "");
    setValue(cp.value != null ? String(cp.value) : "");
    setNote(cp.note || "");
    setError("");
    setShowForm(true);
  };

  const save = () => {
    const reason = checkpointError({ date, value });
    if (reason) { setError(reason); return; }
    const data = { date, value: Number(value), note: note || "" };
    const next = editingId
      ? checkpoints.map((cp) => (cp.id === editingId ? { ...cp, ...data } : cp))
      : [...checkpoints, { id: `${Date.now()}`, ...data }];
    onUpdate?.(next);
    cancelEdit();
  };

  const rows = [...checkpoints].reverse();
  const shown = rows.slice(0, maxRows);
  const hiddenCount = rows.length - shown.length;

  return (
    <div className="chart-card" style={{ marginBottom: 12 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
          cursor: "pointer", padding: "10px 0", background: "transparent", border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: open ? 14 : 0, fontFamily: "inherit" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ fontSize: 9, color: "var(--accent-teal)", display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}>▶</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-teal)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Portfolio checkpoints (actual vs. forecast)
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {checkpoints.length ? `${checkpoints.length} saved` : "none saved yet"}
          </span>
        </span>
        <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
            Add real portfolio values at specific dates to compare against the simulation's projected median path. This helps you see if you're ahead or behind your retirement goals.
          </div>

          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => {
                if (showForm) cancelEdit();
                else { setEditingId(null); setDate(""); setValue(""); setNote(""); setError(""); setShowForm(true); }
              }}
              style={{ background: "rgba(13,148,136,0.2)", border: "1px solid #0d9488", borderRadius: 6, padding: "4px 12px", color: "var(--accent-teal)", cursor: "pointer" }}
            >
              {showForm ? "− Hide form" : "+ Add checkpoint"}
            </button>
          </div>

          {showForm && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="date" aria-label="Checkpoint date" value={date} onChange={(e) => { setDate(e.target.value); setError(""); }}
                  style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "6px 8px" }} />
                <input type="number" aria-label="Portfolio value" placeholder="Portfolio value ($)" value={value}
                  onChange={(e) => { setValue(e.target.value); setError(""); }}
                  style={{ width: 140, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "6px 8px" }} />
                <input type="text" aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)}
                  style={{ width: 240, background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 6, padding: "6px 8px" }} />
                <button type="button" onClick={save}
                  style={{ background: "var(--positive)", border: "none", borderRadius: 6, padding: "6px 16px", color: "white", cursor: "pointer" }}>
                  {editingId ? "Update checkpoint" : "Save checkpoint"}
                </button>
                {editingId && (
                  <button type="button" onClick={cancelEdit}
                    style={{ background: "transparent", border: "1px solid #f87171", borderRadius: 6, padding: "6px 12px", color: "#f87171", cursor: "pointer" }}>
                    Cancel
                  </button>
                )}
              </div>
              {/* Says WHY nothing happened. The old handler returned silently. */}
              {error && (
                <div role="alert" style={{ marginTop: 8, fontSize: 11, color: "#fca5a5" }}>{error}</div>
              )}
            </div>
          )}

          {checkpoints.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="nw-table" style={{ fontSize: 14 }}>
                <thead>
                  <tr>
                    <th>Date</th><th>Actual</th><th>MC Median</th><th>vs Forecast</th>
                    <th>Growth Since</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((cp) => {
                    const age = ageFromDob(dob, cp.date);
                    // real: false on purpose — cp.value is an actual balance on a
                    // real date, so it is inherently nominal. Deflating only the
                    // forecast side would compare it to a basis it was never in.
                    const p50AtAge = age !== null
                      ? (selectPortfolioAtAge(mc, age, { retireAge, real: false }) ?? 0)
                      : 0;
                    const delta = p50AtAge > 0 ? cp.value - p50AtAge : null;
                    const status = p50AtAge > 0 ? (delta > 0 ? "Ahead" : delta < 0 ? "Behind" : "On track") : "Pre-retirement";
                    const deltaColor = delta > 0 ? "#34d399" : delta < 0 ? "#f87171" : "var(--text-secondary)";
                    const growthAbs = currentPort - cp.value;
                    const growthPct = cp.value > 0 ? growthAbs / cp.value : 0;
                    const growthColor = growthAbs >= 0 ? "#34d399" : "#f87171";
                    const isExpanded = expandedId === cp.id;
                    const confirming = confirmingBaselineId === cp.id;

                    const narrativeAge = age !== null ? `age ${age}` : "that date";
                    const vsText = delta !== null
                      ? `${Math.abs(delta / cp.value * 100).toFixed(1)}% ${delta >= 0 ? "ahead of" : "behind"} the median forecast (${fmtDollar(p50AtAge)})`
                      : "before the retirement simulation begins";
                    const growthText = `Since this snapshot, the portfolio has ${growthAbs >= 0 ? "grown" : "declined"} ${growthAbs >= 0 ? "+" : ""}${fmtDollar(growthAbs)} (${growthAbs >= 0 ? "+" : ""}${(growthPct * 100).toFixed(1)}%) to today's ${fmtDollar(currentPort)}.`;
                    const noteText = cp.note ? ` Note: "${cp.note}".` : "";
                    const narrative = `At ${narrativeAge} on ${cp.date ? new Date(`${cp.date}T00:00:00`).toLocaleDateString() : "—"}, your portfolio was ${fmtDollar(cp.value)} — ${vsText}.${noteText} ${growthText}`;

                    const rowBtn = { background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: "2px 4px" };

                    return (
                      <React.Fragment key={cp.id}>
                        <tr onClick={() => setExpandedId(isExpanded ? null : cp.id)}
                          style={{ cursor: "pointer", background: isExpanded ? "rgba(99,102,241,0.08)" : undefined }}>
                          <td>
                            <span aria-hidden="true" style={{ marginRight: 4, fontSize: 10, color: "var(--text-faint)" }}>{isExpanded ? "▼" : "▶"}</span>
                            {cp.date ? new Date(`${cp.date}T00:00:00`).toLocaleDateString() : "—"}
                            {cp.note && <span style={{ marginLeft: 6, fontSize: 14, color: "var(--text-muted)" }}>· {cp.note}</span>}
                          </td>
                          <td style={{ fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(cp.value)}</td>
                          <td style={{ color: "var(--text-muted)" }}>{p50AtAge > 0 ? fmtDollar(p50AtAge) : "—"}</td>
                          <td style={{ color: deltaColor, fontFamily: "'JetBrains Mono',monospace" }}>
                            {delta !== null ? (delta >= 0 ? "+" : "") + fmtDollar(delta) : "—"}
                            {delta !== null && p50AtAge > 0 && (
                              <span style={{ fontSize: 10, marginLeft: 4 }}>({delta >= 0 ? "+" : ""}{(delta / p50AtAge * 100).toFixed(1)}%)</span>
                            )}
                          </td>
                          <td style={{ color: growthColor, fontFamily: "'JetBrains Mono',monospace" }}>
                            {(growthAbs >= 0 ? "+" : "") + fmtDollar(growthAbs)}
                            <span style={{ fontSize: 10, marginLeft: 4 }}>({growthAbs >= 0 ? "+" : ""}{(growthPct * 100).toFixed(1)}%)</span>
                          </td>
                          <td style={{ color: deltaColor }}>{status}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {confirming ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                                <span>Reset all balances to {fmtDollar(cp.value)}?</span>
                                <button type="button" style={{ ...rowBtn, color: "var(--accent-teal)", fontWeight: 700 }}
                                  aria-label={`Confirm: reset all balances to the ${fmtDollar(cp.value)} checkpoint`}
                                  onClick={() => { onSetBaseline?.(cp.value); setConfirmingBaselineId(null); }}>
                                  Confirm
                                </button>
                                <button type="button" style={{ ...rowBtn, color: "var(--text-muted)" }} onClick={() => setConfirmingBaselineId(null)}>
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <button type="button" style={{ ...rowBtn, color: "var(--text-muted)" }}
                                  aria-label={`Edit the ${cp.date} checkpoint`} onClick={() => startEdit(cp)}>
                                  <span aria-hidden="true">✏️</span> Edit
                                </button>
                                <button type="button" style={{ ...rowBtn, color: "var(--text-muted)" }}
                                  aria-label={`Delete the ${cp.date} checkpoint`} onClick={() => onDelete?.(cp.id)}>
                                  <span aria-hidden="true">🗑️</span> Delete
                                </button>
                                <button type="button" style={{ ...rowBtn, color: "var(--accent-teal)" }}
                                  aria-label={`Set the plan baseline from the ${cp.date} checkpoint, resetting every account balance to ${fmtDollar(cp.value)}`}
                                  onClick={() => setConfirmingBaselineId(cp.id)}>
                                  <span aria-hidden="true">📍</span> Set baseline
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ background: "rgba(99,102,241,0.05)" }}>
                            <td colSpan={7} style={{ padding: "10px 16px" }}>
                              {/* A tinted panel rather than a thick accent rule on
                                  one side. border-left >1px on a callout is the
                                  detector's "side-tab" tell, and the tint already
                                  separates this from the row above it. */}
                              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, fontStyle: "italic",
                                background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.16)",
                                borderRadius: 8, padding: "10px 12px" }}>
                                {narrative}
                              </div>
                              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                                <div style={{ background: "var(--card-bg)", borderRadius: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Snapshot value</div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(cp.value)}</div>
                                </div>
                                {p50AtAge > 0 && (
                                  <div style={{ background: "var(--card-bg)", borderRadius: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                    <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>vs Median forecast</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: deltaColor, fontFamily: "'JetBrains Mono',monospace" }}>
                                      {delta >= 0 ? "+" : ""}{fmtDollar(delta)} ({delta >= 0 ? "+" : ""}{(delta / p50AtAge * 100).toFixed(1)}%)
                                    </div>
                                  </div>
                                )}
                                <div style={{ background: "var(--card-bg)", borderRadius: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Growth since snapshot</div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: growthColor, fontFamily: "'JetBrains Mono',monospace" }}>
                                    {growthAbs >= 0 ? "+" : ""}{fmtDollar(growthAbs)} ({growthAbs >= 0 ? "+" : ""}{(growthPct * 100).toFixed(1)}%)
                                  </div>
                                </div>
                                <div style={{ background: "var(--card-bg)", borderRadius: 6, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 2 }}>Current portfolio</div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace" }}>{fmtDollar(currentPort)}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {hiddenCount > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
                  Showing the {maxRows} most recent of {checkpoints.length} checkpoints.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
