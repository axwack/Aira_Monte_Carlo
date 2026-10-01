import React from "react";

const EMPTY_LINE = { category: "", frequency: "Monthly", mustSpend: "", likeToSpend: "" };
// This editor feeds the recurring detailed-budget parser. One-off costs belong
// in Planned One-Off Expenses; parseExpenseCsv treats unknown frequencies as
// annual, so exposing "One-time" here would silently repeat the expense.
const frequencies = ["Monthly", "Quarterly", "Annually"];

function updateLine(lines, index, field, value) {
  return lines.map((line, i) => i === index ? { ...line, [field]: value } : line);
}

export function annualMultiplier(frequency) {
  const s = String(frequency || "").toLowerCase();
  if (s.includes("month")) return 12;
  if (s.includes("quarter")) return 4;
  return 1;
}

export function annualizedAmount(value, frequency) {
  const n = Number(value);
  return Number.isFinite(n) ? n * annualMultiplier(frequency) : 0;
}

export function lineError(line) {
  const must = Number(line.mustSpend);
  const like = Number(line.likeToSpend);
  if (!String(line.category || "").trim()) return "Add a category.";
  if (!Number.isFinite(must) || must < 0) return "Must Spend must be zero or greater.";
  if (!Number.isFinite(like) || like < 0) return "Like to Spend must be zero or greater.";
  if (like < must) return "Like to Spend must be at least Must Spend.";
  return "";
}

/** Serialize editor rows into the CSV shape accepted by parseExpenseCsv. */
export function budgetLinesToCsv(lines = []) {
  return ["Category,Frequency,Must Spend,Like to Spend", ...lines.map((line) => [
    line.category || "",
    line.frequency || "Annually",
    line.mustSpend ?? "",
    line.likeToSpend ?? "",
  ].map((cell) => {
    const text = String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(","))].join("\n");
}

const inputStyle = { width: "100%", boxSizing: "border-box", background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e2e8f0", borderRadius: 5, padding: "5px 6px", fontSize: 11 };

export default function BudgetEditor({ value = [], onChange }) {
  const lines = Array.isArray(value) ? value : [];
  const set = (next) => onChange?.(next);
  return (
    <section data-testid="budget-editor" style={{ marginTop: 12, padding: "12px 14px", background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#c4b5fd", marginBottom: 4 }}>Detailed Expense Budget</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 9 }}>
        Enter line items directly or use CSV import/export. Do not include mortgage/rent, debt, medical, long-term care, or income tax here; those are modeled separately.
      </div>
      {lines.map((line, index) => {
        const error = lineError(line);
        return (
          <div data-testid={`budget-line-${index}`} key={index} style={{ display: "grid", gridTemplateColumns: "1.5fr .9fr 1fr 1fr auto", gap: 6, alignItems: "start", marginBottom: 7 }}>
            <input aria-label={`Budget category ${index + 1}`} placeholder="Category" value={line.category || ""} onChange={(e) => set(updateLine(lines, index, "category", e.target.value))} style={inputStyle} />
            <select aria-label={`Budget frequency ${index + 1}`} value={line.frequency || "Monthly"} onChange={(e) => set(updateLine(lines, index, "frequency", e.target.value))} style={inputStyle}>{frequencies.map((f) => <option key={f}>{f}</option>)}</select>
            <input aria-label={`Must Spend ${index + 1}`} type="number" min="0" value={line.mustSpend ?? ""} placeholder="Must Spend" onChange={(e) => set(updateLine(lines, index, "mustSpend", e.target.value))} style={inputStyle} />
            <input aria-label={`Like to Spend ${index + 1}`} type="number" min="0" value={line.likeToSpend ?? ""} placeholder="Like to Spend" onChange={(e) => set(updateLine(lines, index, "likeToSpend", e.target.value))} style={inputStyle} />
            <button type="button" aria-label={`Remove budget line ${index + 1}`} onClick={() => set(lines.filter((_, i) => i !== index))}>✕</button>
            {error && <div style={{ gridColumn: "1 / -1", color: "#fca5a5", fontSize: 10 }}>{error}</div>}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => set([...lines, { ...EMPTY_LINE }])}>+ Add budget line</button>
        {lines.length > 0 && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{lines.length} line{lines.length === 1 ? "" : "s"} · export-compatible CSV</span>}
      </div>
    </section>
  );
}
