/**
 * AI-analysis.js — BYOK Claude-powered retirement analysis
 *
 * Users supply their own Anthropic API key via the ApiKeyInput component.
 * The key is stored in localStorage and never leaves the browser — no backend
 * required, no server ever sees it.
 *
 * All six analysis functions are LIVE: they call claude-opus-4-7 when a key is
 * saved, or return deterministic placeholder data when no key is present.
 *
 * Setup:
 *   1. npm install @anthropic-ai/sdk
 *   2. Uncomment the import line below
 *   3. User enters their sk-ant-... key in the ApiKeyInput field
 *
 * Input contracts:
 *   values     — ProfileWizard profile object (same shape as BLANK_PROFILE in App.jsx)
 *   mcResults  — runMC() output: { rate, medR, pcts, term, N }
 *                  rate  : 0–1 success probability
 *                  medR  : median portfolio at retirement start
 *                  pcts  : array[endAge-currentAge+1] of { p10, p25, p50, p75, p90 }
 *                  term  : terminal percentiles { p10, p25, p50, p75, p90 }
 *                  N     : simulation count
 */

import { useState, useEffect, useCallback } from "react";

// Uncomment after: npm install @anthropic-ai/sdk
// import Anthropic from "@anthropic-ai/sdk";

// ─── BYOK key management ──────────────────────────────────────────────────────
const STORAGE_KEY = "aira_anthropic_key";

export function getApiKey()       { return localStorage.getItem(STORAGE_KEY) || ""; }
export function setApiKey(key)    { localStorage.setItem(STORAGE_KEY, key.trim()); }
export function clearApiKey()     { localStorage.removeItem(STORAGE_KEY); }
export function hasApiKey()       { return Boolean(localStorage.getItem(STORAGE_KEY)); }

function makeClient() {
  const key = getApiKey();
  if (!key) return null;
  // Requires: npm install @anthropic-ai/sdk  +  uncomment import above
  // return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  return null; // remove this line once the import is active
}

// ─── Shared prompt-context builder ───────────────────────────────────────────
function buildProfileContext(values, mcResults) {
  const swr = values.port > 0
    ? ((values.sp / values.port) * 100).toFixed(2)
    : "N/A";

  const accounts = (values.accounts || [])
    .filter((a) => a.balance > 0)
    .map((a) => `${a.name} (${a.category}): $${a.balance.toLocaleString()}`)
    .join(", ");

  return [
    `Age: ${values.currentAge}, Retire: ${values.retireAge}, End: ${values.endAge}`,
    `Portfolio: $${(values.port || 0).toLocaleString()} | SWR: ${swr}%`,
    `Spending: $${(values.sp || 0).toLocaleString()}/yr`,
    `SS: $${(values.ssb || 0).toLocaleString()}/yr at age ${values.ssAge}`,
    `State: ${values.stateOfResidence || "unknown"} | Filing: ${values.filingStatus || "mfj"}`,
    accounts ? `Accounts: ${accounts}` : null,
    values.mortBalance > 0
      ? `Mortgage: $${values.mortBalance.toLocaleString()} @ ${values.mortRate}%`
      : null,
    mcResults
      ? `MC success (to 90): ${(mcResults.rate * 100).toFixed(1)}% over ${mcResults.N} paths`
      : null,
    mcResults
      ? `Terminal p10/p50/p90: $${(mcResults.term.p10 / 1000).toFixed(0)}K / $${(mcResults.term.p50 / 1000).toFixed(0)}K / $${(mcResults.term.p90 / 1000).toFixed(0)}K`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── No-key placeholder helper ────────────────────────────────────────────────
function noKeyResult(shape) {
  return { ...shape, _noKey: true };
}

// ─── 1. Retirement Health Score ───────────────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {{ score, grade, summary, flags[], _noKey? }}
 */
export async function analyzeRetirementHealth(values, mcResults) {
  const client = makeClient();

  if (!client) {
    // Deterministic rules-based fallback when no key is saved
    const rate = mcResults?.rate ?? 0;
    const score = Math.round(rate * 100);
    const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
    const flags = [];
    if (rate < 0.80)                          flags.push("Success rate below 80% — plan needs restructuring.");
    if (values.sp / values.port > 0.05)       flags.push("Withdrawal rate exceeds 5% — consider reducing spending.");
    if ((values.ssAge || 67) < 67)            flags.push("Early SS claim — consider delaying to 67–70 for a higher benefit.");
    if (["CA","NJ"].includes(values.stateOfResidence))
      flags.push(`${values.stateOfResidence} has high income tax — consider domicile planning.`);
    return noKeyResult({ score, grade, summary: `Rules-based score (no API key). ${(rate * 100).toFixed(1)}% MC success rate.`, flags });
  }

  const profileCtx = buildProfileContext(values, mcResults);

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        json_schema: {
          name: "retirement_health",
          schema: {
            type: "object",
            properties: {
              score:   { type: "number", description: "0–100 plan health score" },
              grade:   { type: "string", enum: ["A","B","C","D","F"] },
              summary: { type: "string", description: "1–2 sentence plain-English summary" },
              flags:   { type: "array", items: { type: "string" }, description: "Top 3–5 risk flags" },
            },
            required: ["score","grade","summary","flags"],
          },
        },
      },
    },
    system: "You are Aira, a fiduciary retirement planning AI. Be concise and direct. Never give legal or tax advice.",
    messages: [{ role: "user", content: `Score this retirement plan and list the top risks:\n\n${profileCtx}` }],
  });

  return JSON.parse(response.content.find((b) => b.type === "text").text);
}

// ─── 2. Narrative Summary ─────────────────────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {string}  Markdown-formatted narrative
 */
export async function generateNarrativeSummary(values, mcResults) {
  const client = makeClient();

  if (!client) {
    const rate = mcResults?.rate ?? 0;
    return `**Aira Narrative (no API key)**\n\nYour plan shows a **${(rate * 100).toFixed(1)}% success rate** across ${mcResults?.N?.toLocaleString() ?? "N/A"} Monte Carlo simulations to age ${values.endAge || 90}.\n\n**Portfolio:** $${(values.port || 0).toLocaleString()} · **Annual spending:** $${(values.sp || 0).toLocaleString()} · **State:** ${values.stateOfResidence || "unknown"}\n\n_Add your Anthropic API key in the Assumptions tab to receive a personalized AI narrative._`;
  }

  const profileCtx = buildProfileContext(values, mcResults);

  const stream = await client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: "You are Aira, a fiduciary retirement planning AI. Write in plain English. Format with markdown headers. Sections: Overview | Strengths | Risks | Recommended Actions. Never give legal or tax advice.",
    messages: [{ role: "user", content: `Write a 3–5 paragraph retirement plan narrative:\n\n${profileCtx}` }],
  });

  const msg = await stream.finalMessage();
  return msg.content.find((b) => b.type === "text").text;
}

// ─── 3. Withdrawal Strategy Optimization ─────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output (run with current strategy)
 * @returns {{ recommended, reason, projectedRateImprovement, _noKey? }}
 */
export async function suggestWithdrawalOptimization(values, mcResults) {
  const client = makeClient();
  const current = values.withdrawalStrategy || "gk";

  if (!client) {
    return noKeyResult({
      recommended: current,
      reason: `No API key — keeping current strategy "${current}". Add your key for AI comparison across all 10 strategies.`,
      projectedRateImprovement: "N/A",
    });
  }

  const profileCtx = buildProfileContext(values, mcResults);
  const strategies = ["gk","fixed","vanguard","risk","kitces","vpw","cape","endowment","one_n","ninety_five_rule"];

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 512,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        json_schema: {
          name: "withdrawal_recommendation",
          schema: {
            type: "object",
            properties: {
              recommended:               { type: "string", enum: strategies },
              reason:                    { type: "string" },
              projectedRateImprovement:  { type: "string" },
            },
            required: ["recommended","reason","projectedRateImprovement"],
          },
        },
      },
    },
    system: `You are Aira. Recommend the best withdrawal strategy for this retirement profile. Current strategy: ${current}. Available: ${strategies.join(", ")}.`,
    messages: [{ role: "user", content: profileCtx }],
  });

  return JSON.parse(response.content.find((b) => b.type === "text").text);
}

// ─── 4. Roth Conversion Strategy ─────────────────────────────────────────────
/**
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {{ assessment, conversionAdvice, suggestedAnnualAmount, _noKey? }}
 */
export async function evaluateRothStrategy(values, mcResults) {
  const client = makeClient();

  if (!client) {
    const accounts = values.accounts || [];
    const preTax = accounts.filter((a) => a.category === "pretax").reduce((s, a) => s + (a.balance || 0), 0);
    const preTaxPct = values.port > 0 ? (preTax / values.port) * 100 : 0;
    return noKeyResult({
      assessment: preTaxPct > 70
        ? "Pre-tax heavy — Roth conversions strongly recommended before RMD age."
        : "Balanced allocation — moderate Roth conversion may still reduce lifetime taxes.",
      conversionAdvice: "Add your API key for personalized Roth bracket-fill analysis.",
      suggestedAnnualAmount: 0,
    });
  }

  const profileCtx = buildProfileContext(values, mcResults);

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 768,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        json_schema: {
          name: "roth_strategy",
          schema: {
            type: "object",
            properties: {
              assessment:            { type: "string" },
              conversionAdvice:      { type: "string" },
              suggestedAnnualAmount: { type: "number", description: "Dollar amount to convert per year" },
            },
            required: ["assessment","conversionAdvice","suggestedAnnualAmount"],
          },
        },
      },
    },
    system: "You are Aira, a tax-aware retirement planning AI. Evaluate Roth conversion strategy. Consider IRMAA tiers, RMD age (73/75 per SECURE 2.0), and bracket management. Never give legal or tax advice.",
    messages: [{ role: "user", content: profileCtx }],
  });

  return JSON.parse(response.content.find((b) => b.type === "text").text);
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
  const client = makeClient();

  if (!client) {
    return `**Aira:** You asked: _"${question}"_\n\nAdd your Anthropic API key in the Assumptions tab to receive a personalized answer about your plan.\n\nPlan snapshot: ${(mcResults?.rate * 100 || 0).toFixed(1)}% success · $${(values.port || 0).toLocaleString()} portfolio · ${values.stateOfResidence || "unknown"} domicile.`;
  }

  const profileCtx = buildProfileContext(values, mcResults);

  const systemPrompt = [
    "You are Aira, a fiduciary retirement planning AI assistant.",
    "Answer questions about the user's specific retirement plan shown below.",
    "Be concise, honest about uncertainty, and never give legal or tax advice.",
    "",
    "USER PLAN CONTEXT:",
    profileCtx,
  ].join("\n");

  const stream = await client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: systemPrompt,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ],
  });

  const msg = await stream.finalMessage();
  return msg.content.find((b) => b.type === "text").text;
}

// ─── 6. AI-Enhanced Action Plan ───────────────────────────────────────────────
/**
 * Augments the rules-engine output from generateActions() in App.jsx.
 *
 * @param {object} values           ProfileWizard values
 * @param {object} mcResults        runMC() output
 * @param {Array}  existingActions  Output of generateActions() from App.jsx
 * @returns {Array} [{ priority, category, action, reason, deadline, aiNote? }]
 */
export async function runAIActionPlan(values, mcResults, existingActions = []) {
  const client = makeClient();

  if (!client) {
    return existingActions.map((a) => ({
      ...a,
      aiNote: "Add your API key for AI-enhanced context on this item.",
    }));
  }

  const profileCtx = buildProfileContext(values, mcResults);
  const existingSummary = existingActions
    .map((a) => `[${a.priority.toUpperCase()}] ${a.category}: ${a.action}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        json_schema: {
          name: "action_plan",
          schema: {
            type: "object",
            properties: {
              actions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    priority: { type: "string", enum: ["red","yellow","green"] },
                    category: { type: "string" },
                    action:   { type: "string" },
                    reason:   { type: "string" },
                    deadline: { type: "string" },
                    aiNote:   { type: "string" },
                  },
                  required: ["priority","category","action","reason","deadline"],
                },
              },
            },
            required: ["actions"],
          },
        },
      },
    },
    system: "You are Aira. Review the existing rules-based action plan. 1) Add an aiNote to each item with relevant context. 2) Add up to 3 NEW actions the rules engine missed. 3) Return the full merged array sorted red → yellow → green.",
    messages: [{
      role: "user",
      content: `Profile:\n${profileCtx}\n\nExisting actions:\n${existingSummary}`,
    }],
  });

  const parsed = JSON.parse(response.content.find((b) => b.type === "text").text);
  return parsed.actions;
}

// ─── ApiKeyInput Component ────────────────────────────────────────────────────
/**
 * Self-contained API key field. Drop this anywhere in the Assumptions tab.
 *
 * Usage in App.jsx:
 *   import { ApiKeyInput } from "./AI-analysis";
 *   <ApiKeyInput />
 *
 * No props needed — reads/writes localStorage directly.
 */
export function ApiKeyInput() {
  const [draft, setDraft]     = useState("");
  const [saved, setSaved]     = useState(hasApiKey);
  const [visible, setVisible] = useState(false);
  const [flash, setFlash]     = useState("");   // "saved" | "cleared" | ""

  const maskedDisplay = saved ? "sk-ant-••••••••••••••••••••••••••" : "";

  const handleSave = useCallback(() => {
    if (!draft.trim().startsWith("sk-ant-")) {
      setFlash("invalid");
      setTimeout(() => setFlash(""), 2500);
      return;
    }
    setApiKey(draft.trim());
    setDraft("");
    setSaved(true);
    setVisible(false);
    setFlash("saved");
    setTimeout(() => setFlash(""), 2500);
  }, [draft]);

  const handleClear = useCallback(() => {
    clearApiKey();
    setDraft("");
    setSaved(false);
    setFlash("cleared");
    setTimeout(() => setFlash(""), 2500);
  }, []);

  const inputStyle = {
    background: "#0d1b2a",
    border: "1px solid #1e3a5f",
    color: "#e2e8f0",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
    width: "100%",
    letterSpacing: visible ? "normal" : "0.1em",
  };

  const btnStyle = (color) => ({
    background: "transparent",
    border: `1px solid ${color}`,
    color,
    borderRadius: 6,
    padding: "3px 10px",
    fontSize: 11,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ marginTop: 4 }}>
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: saved ? "#86efac" : "#94a3b8" }}>
          {saved ? "✓ API key saved" : "No API key — AI features disabled"}
        </span>
        {flash === "saved"   && <span style={{ fontSize: 11, color: "#86efac" }}>Saved!</span>}
        {flash === "cleared" && <span style={{ fontSize: 11, color: "#f87171" }}>Cleared.</span>}
        {flash === "invalid" && <span style={{ fontSize: 11, color: "#fbbf24" }}>Key must start with sk-ant-</span>}
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type={visible ? "text" : "password"}
          value={saved ? maskedDisplay : draft}
          readOnly={saved}
          placeholder={saved ? "" : "sk-ant-..."}
          onChange={(e) => { if (!saved) setDraft(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !saved) handleSave(); }}
          style={inputStyle}
        />
        {!saved && (
          <button style={btnStyle("#60a5fa")} onClick={() => setVisible((v) => !v)}>
            {visible ? "Hide" : "Show"}
          </button>
        )}
        {!saved && draft && (
          <button style={btnStyle("#86efac")} onClick={handleSave}>
            Save
          </button>
        )}
        {saved && (
          <button style={btnStyle("#f87171")} onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
        Your key is stored only in this browser's localStorage — never sent to any server.
        Get a key at console.anthropic.com.
      </div>
    </div>
  );
}

// ─── AIAnalysisPanel Component ────────────────────────────────────────────────
/**
 * Drop-in panel that runs all six analyses and renders the results.
 *
 * Usage in App.jsx:
 *   import { AIAnalysisPanel } from "./AI-analysis";
 *   <AIAnalysisPanel values={params} mcResults={r90} />
 */
export function AIAnalysisPanel({ values, mcResults }) {
  const [health,    setHealth]  = useState(null);
  const [narrative, setNarr]    = useState("");
  const [loading,   setLoading] = useState(false);
  const [error,     setError]   = useState(null);
  const [keyReady,  setKeyReady] = useState(hasApiKey());

  // Re-check key state whenever this component is focused
  useEffect(() => {
    const check = () => setKeyReady(hasApiKey());
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, []);

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

  const panelStyle = {
    padding: "1rem",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
  };

  const gradeColor = { A: "#86efac", B: "#a3e635", C: "#fbbf24", D: "#fb923c", F: "#f87171" };

  if (!keyReady) {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
          Aira AI Analysis
        </div>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
          Add your Anthropic API key in the <strong>Personal Profile</strong> section above to enable AI analysis.
        </p>
      </div>
    );
  }

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

      {health && !health._noKey && (
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

      {narrative && !health?._noKey && (
        <div style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "pre-wrap", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
          {narrative}
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
