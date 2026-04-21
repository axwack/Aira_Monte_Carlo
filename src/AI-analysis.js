/**
 * AI-analysis.js — Aira AI analysis via Netlify serverless proxy
 *
 * All Claude API calls go through /.netlify/functions/analyze.
 * Your ANTHROPIC_API_KEY lives only in Netlify's environment — never in the browser.
 *
 * Each function returns real Claude output in production, and a deterministic
 * rules-based fallback when the function is unreachable (local dev without
 * netlify dev, or before the key is configured).
 *
 * Local development:
 *   npm install -g netlify-cli
 *   netlify dev          ← starts React + functions together on :8888
 */

import { useState, useCallback } from "react";

const FUNCTION_URL = "/.netlify/functions/analyze";

// ─── Core fetch helper ────────────────────────────────────────────────────────
async function callAnalyze(payload) {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── Rules-based fallbacks (used when function is unreachable) ────────────────
function healthFallback(values, mcResults) {
  const rate  = mcResults?.rate ?? 0;
  const score = Math.round(rate * 100);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const flags = [];
  if (rate < 0.80)                                    flags.push("Success rate below 80% — plan needs restructuring.");
  if (values.sp / values.port > 0.05)                 flags.push("Withdrawal rate exceeds 5% — consider reducing spending.");
  if ((values.ssAge || 67) < 67)                      flags.push("Early SS claim — consider delaying to 67–70 for a higher benefit.");
  if (["CA","NJ"].includes(values.stateOfResidence))  flags.push(`${values.stateOfResidence} has high income tax — consider domicile planning.`);
  return { score, grade, summary: `Rules-based score (AI unavailable). ${(rate * 100).toFixed(1)}% MC success rate.`, flags };
}

// ─── 1. Retirement Health Score ───────────────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {{ score, grade, summary, flags[] }}
 */
export async function analyzeRetirementHealth(values, mcResults) {
  try {
    return await callAnalyze({ type: "health", values, mcResults });
  } catch {
    return healthFallback(values, mcResults);
  }
}

// ─── 2. Narrative Summary ─────────────────────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {string}  Markdown-formatted narrative
 */
export async function generateNarrativeSummary(values, mcResults) {
  try {
    const result = await callAnalyze({ type: "narrative", values, mcResults });
    return result.text;
  } catch {
    const rate = mcResults?.rate ?? 0;
    return `**Aira Narrative (AI unavailable)**\n\nYour plan shows a **${(rate * 100).toFixed(1)}% success rate** across ${mcResults?.N?.toLocaleString() ?? "N/A"} simulations to age ${values.endAge || 90}.\n\n**Portfolio:** $${(values.port || 0).toLocaleString()} · **Spending:** $${(values.sp || 0).toLocaleString()}/yr · **State:** ${values.stateOfResidence || "unknown"}\n\n_Configure ANTHROPIC_API_KEY in Netlify to receive a personalized AI narrative._`;
  }
}

// ─── 3. Withdrawal Strategy Optimization ─────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {{ recommended, reason, projectedRateImprovement }}
 */
export async function suggestWithdrawalOptimization(values, mcResults) {
  const current = values.withdrawalStrategy || "gk";
  try {
    return await callAnalyze({ type: "withdrawal", values, mcResults });
  } catch {
    return {
      recommended: current,
      reason: `AI unavailable — keeping current strategy "${current}".`,
      projectedRateImprovement: "N/A",
    };
  }
}

// ─── 4. Roth Conversion Strategy ─────────────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {{ assessment, conversionAdvice, suggestedAnnualAmount }}
 */
export async function evaluateRothStrategy(values, mcResults) {
  try {
    return await callAnalyze({ type: "roth", values, mcResults });
  } catch {
    const accounts  = values.accounts || [];
    const preTax    = accounts.filter((a) => a.category === "pretax").reduce((s, a) => s + (a.balance || 0), 0);
    const preTaxPct = values.port > 0 ? (preTax / values.port) * 100 : 0;
    return {
      assessment: preTaxPct > 70
        ? "Pre-tax heavy — Roth conversions strongly recommended before RMD age."
        : "Balanced allocation — moderate Roth conversion may still reduce lifetime taxes.",
      conversionAdvice: "AI unavailable. Configure ANTHROPIC_API_KEY in Netlify for personalized advice.",
      suggestedAnnualAmount: 0,
    };
  }
}

// ─── 5. Conversational Chat Response ─────────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @param {string} question   User's free-form question
 * @param {Array}  history    [{ role: "user"|"assistant", content: string }]
 * @returns {string}
 */
export async function generateChatResponse(values, mcResults, question, history = []) {
  try {
    const result = await callAnalyze({ type: "chat", values, mcResults, question, history });
    return result.text;
  } catch {
    return `**Aira:** You asked: _"${question}"_\n\nAI is currently unavailable. Configure ANTHROPIC_API_KEY in Netlify → Environment variables to enable Aira chat.\n\nPlan snapshot: ${(mcResults?.rate * 100 || 0).toFixed(1)}% success · $${(values.port || 0).toLocaleString()} portfolio.`;
  }
}

// ─── 6. AI-Enhanced Action Plan ───────────────────────────────────────────────
/**
 * Augments the rules-engine output of generateActions() in App.jsx.
 *
 * @param {object} values           ProfileWizard values
 * @param {object} mcResults        runMC() output
 * @param {Array}  existingActions  Output of generateActions() from App.jsx
 * @returns {Array} [{ priority, category, action, reason, deadline, aiNote? }]
 */
export async function runAIActionPlan(values, mcResults, existingActions = []) {
  try {
    const result = await callAnalyze({ type: "actionplan", values, mcResults, existingActions });
    return result.actions;
  } catch {
    return existingActions.map((a) => ({
      ...a,
      aiNote: "AI unavailable — configure ANTHROPIC_API_KEY in Netlify.",
    }));
  }
}

// ─── AIAnalysisPanel Component ────────────────────────────────────────────────
/**
 * Drop-in panel that runs health + narrative analysis on demand.
 *
 * Usage in App.jsx:
 *   import { AIAnalysisPanel } from "./AI-analysis";
 *   <AIAnalysisPanel values={params} mcResults={r90} />
 */
export function AIAnalysisPanel({ values, mcResults }) {
  const [health,  setHealth]  = useState(null);
  const [narr,    setNarr]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const runAnalysis = useCallback(async () => {
    if (!values || !mcResults) return;
    setLoading(true);
    setError(null);
    try {
      const [h, n] = await Promise.all([
        analyzeRetirementHealth(values, mcResults),
        generateNarrativeSummary(values, mcResults),
      ]);
      setHealth(h);
      setNarr(n);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [values, mcResults]);

  const gradeColor = { A: "#86efac", B: "#a3e635", C: "#fbbf24", D: "#fb923c", F: "#f87171" };

  const panelStyle = {
    padding: "1rem",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Aira AI Analysis
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          style={{ background: "#3730a3", border: "none", color: "#e0e7ff", borderRadius: 6, padding: "4px 14px", fontSize: 12, cursor: loading ? "wait" : "pointer" }}
        >
          {loading ? "Analyzing…" : health ? "Re-analyze" : "Analyze Plan"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>
          Error: {error}
        </div>
      )}

      {health && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: gradeColor[health.grade] || "#e2e8f0" }}>
            {health.grade}
          </span>
          <span style={{ fontSize: 14, color: "#94a3b8", marginLeft: 8 }}>
            {health.score}/100
          </span>
          <p style={{ fontSize: 12, color: "#cbd5e1", margin: "6px 0 8px" }}>{health.summary}</p>
          {health.flags?.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {health.flags.map((f, i) => (
                <li key={i} style={{ fontSize: 12, color: "#fbbf24", marginBottom: 3 }}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {narr && (
        <div style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "pre-wrap", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
          {narr}
        </div>
      )}

      {mcResults && (
        <p style={{ fontSize: 11, color: "#475569", margin: "8px 0 0" }}>
          MC engine: {(mcResults.rate * 100).toFixed(1)}% success · ${(mcResults.term.p50 / 1_000_000).toFixed(2)}M median terminal
        </p>
      )}
    </div>
  );
}
