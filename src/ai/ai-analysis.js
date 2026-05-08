/**
 * ai-analysis.js — Direct Gemini API calls from the browser
 *
 * Each user provides their own Gemini API key via Profile → Assumptions.
 * No server proxy needed — calls go directly to Google's API.
 *
 * Get a free key at: https://aistudio.google.com/app/apikey
 */

import { useState, useCallback } from "react";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Default model — stable, fast, cheapest quality tier for structured analysis.
// Cost: ~$0.0003 per Aira AI call (2K in / 500 out).
// Reserve gemini-2.5-flash / gemini-2.5-pro for the Pro tier in Phase 2 monetization.
const MODEL       = "gemini-2.0-flash";

// ─── Gemini helpers ───────────────────────────────────────────────────────────

async function callGemini(apiKey, payload) {
  const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini HTTP ${res.status}`);
  }
  return res.json();
}

function fnCall(apiKey, maxTokens, systemText, userText, fnDecl) {
  return callGemini(apiKey, {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    tools: [{ functionDeclarations: [fnDecl] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [fnDecl.name] } },
    generationConfig: { maxOutputTokens: maxTokens },
  });
}

function getFnArgs(res) {
  return res.candidates?.[0]?.content?.parts?.[0]?.functionCall?.args || {};
}

function getText(res) {
  return res.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── Data quality gate ────────────────────────────────────────────────────────

export function profileIsComplete(values, mcResults) {
  if (!mcResults || !(mcResults.rate > 0)) return false;
  if (!values) return false;
  if ((values.port || 0) < 50_000) return false;
  if ((values.sp  || 0) <= 0) return false;
  const filledAccounts = (values.accounts || []).filter(a => (a.balance || 0) > 0);
  if (filledAccounts.length < 1) return false;
  return true;
}

// ─── Context builders ─────────────────────────────────────────────────────────

function ctxHealth(values, mcResults) {
  const swr = values.port > 0 ? ((values.sp / values.port) * 100).toFixed(1) : "N/A";
  return [
    `MC success: ${mcResults ? (mcResults.rate * 100).toFixed(1) : "N/A"}% | SWR: ${swr}%`,
    `Portfolio: $${(values.port || 0).toLocaleString()} | Spending: $${(values.sp || 0).toLocaleString()}/yr`,
    `State: ${values.stateOfResidence || "unknown"} | Age: ${values.currentAge} | Retire: ${values.retireAge}`,
  ].join("\n");
}

function ctxNarrative(values, mcResults) {
  const swr = values.port > 0 ? ((values.sp / values.port) * 100).toFixed(2) : "N/A";
  const accts = (values.accounts || []).filter(a => a.balance > 0)
    .map(a => `${a.name} (${a.category}): $${a.balance.toLocaleString()}`).join(", ");
  return [
    `Age: ${values.currentAge} | Retire: ${values.retireAge} | End: ${values.endAge}`,
    `Portfolio: $${(values.port || 0).toLocaleString()} | SWR: ${swr}%`,
    `Spending: $${(values.sp || 0).toLocaleString()}/yr | SS: $${(values.ssb || 0).toLocaleString()}/yr at ${values.ssAge}`,
    `State: ${values.stateOfResidence || "unknown"} | Filing: ${values.filingStatus || "mfj"}`,
    accts ? `Accounts: ${accts}` : null,
    mcResults ? `MC success: ${(mcResults.rate * 100).toFixed(1)}% over ${mcResults.N} paths` : null,
    mcResults ? `Terminal p10/p50/p90: $${(mcResults.term.p10/1000).toFixed(0)}K / $${(mcResults.term.p50/1000).toFixed(0)}K / $${(mcResults.term.p90/1000).toFixed(0)}K` : null,
  ].filter(Boolean).join("\n");
}

function ctxRoth(values) {
  const accts = (values.accounts || []).filter(a => a.balance > 0);
  const preTax = accts.filter(a => a.category === "pretax").reduce((s, a) => s + a.balance, 0);
  const roth   = accts.filter(a => a.category === "roth").reduce((s, a) => s + a.balance, 0);
  const preTaxPct = values.port > 0 ? ((preTax / values.port) * 100).toFixed(0) : "0";
  const rothPct   = values.port > 0 ? ((roth   / values.port) * 100).toFixed(0) : "0";
  return [
    `Age: ${values.currentAge} | Retire: ${values.retireAge} | State: ${values.stateOfResidence || "unknown"}`,
    `Pre-tax: ${preTaxPct}% ($${preTax.toLocaleString()}) | Roth: ${rothPct}% ($${roth.toLocaleString()})`,
    `Filing: ${values.filingStatus || "mfj"} | FAFSA ends: ${values.fafsaEndYear || "N/A"}`,
  ].join("\n");
}

function ctxWithdrawal(values, mcResults) {
  const swr = values.port > 0 ? ((values.sp / values.port) * 100).toFixed(1) : "N/A";
  return [
    `SWR: ${swr}% | MC success: ${mcResults ? (mcResults.rate * 100).toFixed(1) : "N/A"}%`,
    `Portfolio: $${(values.port || 0).toLocaleString()} | Spending: $${(values.sp || 0).toLocaleString()}/yr`,
    `Current strategy: ${values.withdrawalStrategy || "gk"}`,
  ].join("\n");
}

function ctxActionPlan(values, mcResults, cards) {
  const swr = values.port > 0 ? ((values.sp / values.port) * 100).toFixed(1) : "N/A";
  const accts = (values.accounts || []).filter(a => a.balance > 0);
  const preTax = accts.filter(a => a.category === "pretax").reduce((s, a) => s + a.balance, 0);
  const roth   = accts.filter(a => a.category === "roth").reduce((s, a) => s + a.balance, 0);
  const preTaxPct = values.port > 0 ? ((preTax / values.port) * 100).toFixed(0) : "0";
  const rothPct   = values.port > 0 ? ((roth   / values.port) * 100).toFixed(0) : "0";
  const triggeredIds = cards.map(c => c.id).join(", ");
  return [
    `SWR: ${swr}% | MC Success: ${mcResults ? (mcResults.rate * 100).toFixed(1) : "N/A"}%`,
    `Portfolio: $${(values.port || 0).toLocaleString()} | Pre-tax: ${preTaxPct}% | Roth: ${rothPct}%`,
    `Age: ${values.currentAge} → Retire: ${values.retireAge} | State: ${values.stateOfResidence || "unknown"}`,
    `Triggered rules: [${triggeredIds}]`,
  ].join("\n");
}

// ─── Rules-based fallbacks ────────────────────────────────────────────────────

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

export async function analyzeRetirementHealth(values, mcResults) {
  const apiKey = values.geminiApiKey?.trim();
  if (!apiKey) return healthFallback(values, mcResults);
  try {
    const res = await fnCall(apiKey, 512,
      "You are Aira. Score this retirement plan 0–100 and list 2–4 specific risk flags.",
      ctxHealth(values, mcResults),
      {
        name: "health_score",
        description: "Score a retirement plan",
        parameters: {
          type: "object",
          properties: {
            score:   { type: "number" },
            grade:   { type: "string", enum: ["A","B","C","D","F"] },
            summary: { type: "string" },
            flags:   { type: "array", items: { type: "string" } },
          },
          required: ["score","grade","summary","flags"],
        },
      }
    );
    return getFnArgs(res);
  } catch {
    return healthFallback(values, mcResults);
  }
}

// ─── 2. Narrative Summary ─────────────────────────────────────────────────────

export async function generateNarrativeSummary(values, mcResults) {
  const apiKey = values.geminiApiKey?.trim();
  const rate   = mcResults?.rate ?? 0;
  const fallback = `**Aira Narrative (AI unavailable)**\n\nYour plan shows a **${(rate * 100).toFixed(1)}% success rate** across ${mcResults?.N?.toLocaleString() ?? "N/A"} simulations to age ${values.endAge || 90}.\n\n**Portfolio:** $${(values.port || 0).toLocaleString()} · **Spending:** $${(values.sp || 0).toLocaleString()}/yr · **State:** ${values.stateOfResidence || "unknown"}\n\n_Add your Gemini API key in Profile → Assumptions to receive a personalized AI narrative._`;
  if (!apiKey) return fallback;
  try {
    const res = await callGemini(apiKey, {
      systemInstruction: { parts: [{ text: "You are Aira. Write a 3–5 paragraph retirement narrative in plain English with markdown headers: Overview | Strengths | Risks | Recommended Actions. No legal advice." }] },
      contents: [{ role: "user", parts: [{ text: ctxNarrative(values, mcResults) }] }],
      generationConfig: { maxOutputTokens: 1024 },
    });
    return getText(res);
  } catch {
    return fallback;
  }
}

// ─── 3. Withdrawal Strategy Optimization ─────────────────────────────────────

export async function suggestWithdrawalOptimization(values, mcResults) {
  const apiKey  = values.geminiApiKey?.trim();
  const current = values.withdrawalStrategy || "gk";
  if (!apiKey) return { recommended: current, reason: "AI unavailable — add your Gemini API key in Profile.", projectedRateImprovement: "N/A" };
  const strategies = ["gk","fixed","vanguard","risk","kitces","vpw","cape","endowment","one_n","ninety_five_rule"];
  try {
    const res = await fnCall(apiKey, 256,
      `You are Aira. Pick the best withdrawal strategy. Available: ${strategies.join(", ")}.`,
      ctxWithdrawal(values, mcResults),
      {
        name: "withdrawal_rec",
        description: "Recommend a withdrawal strategy",
        parameters: {
          type: "object",
          properties: {
            recommended:              { type: "string", enum: strategies },
            reason:                   { type: "string" },
            projectedRateImprovement: { type: "string" },
          },
          required: ["recommended","reason","projectedRateImprovement"],
        },
      }
    );
    return getFnArgs(res);
  } catch {
    return { recommended: current, reason: `AI unavailable — keeping current strategy "${current}".`, projectedRateImprovement: "N/A" };
  }
}

// ─── 4. Roth Conversion Strategy ─────────────────────────────────────────────

export async function evaluateRothStrategy(values) {
  const apiKey = values.geminiApiKey?.trim();
  const accounts  = values.accounts || [];
  const preTax    = accounts.filter(a => a.category === "pretax").reduce((s, a) => s + (a.balance || 0), 0);
  const preTaxPct = values.port > 0 ? (preTax / values.port) * 100 : 0;
  const fallback = {
    assessment: preTaxPct > 70
      ? "Pre-tax heavy — Roth conversions strongly recommended before RMD age."
      : "Balanced allocation — moderate Roth conversion may still reduce lifetime taxes.",
    conversionAdvice: "Add your Gemini API key in Profile for personalized advice.",
    suggestedAnnualAmount: 0,
  };
  if (!apiKey) return fallback;
  try {
    const res = await fnCall(apiKey, 512,
      "You are Aira. Evaluate Roth conversion strategy. Consider IRMAA tiers, SECURE 2.0 RMD ages, bracket management. No tax advice.",
      ctxRoth(values),
      {
        name: "roth_strategy",
        description: "Evaluate Roth conversion strategy",
        parameters: {
          type: "object",
          properties: {
            assessment:            { type: "string" },
            conversionAdvice:      { type: "string" },
            suggestedAnnualAmount: { type: "number" },
          },
          required: ["assessment","conversionAdvice","suggestedAnnualAmount"],
        },
      }
    );
    return getFnArgs(res);
  } catch {
    return fallback;
  }
}

// ─── 5. Conversational Chat Response ─────────────────────────────────────────

export async function generateChatResponse(values, mcResults, question, history = []) {
  const apiKey = values.geminiApiKey?.trim();
  if (!apiKey) {
    return `**Aira:** You asked: _"${question}"_\n\nAI is currently unavailable. Add your Gemini API key in Profile → Assumptions to enable Aira chat.\n\nPlan snapshot: ${(mcResults?.rate * 100 || 0).toFixed(1)}% success · $${(values.port || 0).toLocaleString()} portfolio.`;
  }
  try {
    const contents = [
      ...(history || []).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: question }] },
    ];
    const res = await callGemini(apiKey, {
      systemInstruction: { parts: [{ text: `You are Aira, a fiduciary retirement planning AI. Answer questions about this plan. Be concise and honest about uncertainty. No legal advice.\n\nPLAN:\n${ctxNarrative(values, mcResults)}` }] },
      contents,
      generationConfig: { maxOutputTokens: 768 },
    });
    return getText(res);
  } catch (e) {
    return `**Aira:** AI error — ${e.message}`;
  }
}

// ─── 6. AI-Enhanced Action Plan ───────────────────────────────────────────────

export async function runAIActionPlan(values, mcResults, cards = []) {
  const apiKey = values.geminiApiKey?.trim();
  if (!apiKey) throw new Error("No Gemini API key — add it in Profile → Assumptions");

  const slimValues = {
    port:               values.port,
    sp:                 values.sp,
    currentAge:         values.currentAge,
    retireAge:          values.retireAge,
    stateOfResidence:   values.stateOfResidence,
    filingStatus:       values.filingStatus,
    ssAge:              values.ssAge,
    withdrawalStrategy: values.withdrawalStrategy,
    fafsaEndYear:       values.fafsaEndYear,
    accounts: (values.accounts || []).filter(a => (a.balance || 0) > 0).map(a => ({
      category: a.category,
      balance:  a.balance,
    })),
  };

  const ctx      = ctxActionPlan(slimValues, mcResults, cards);
  const cardList = cards.map(c => `[${c.id}] ${c.priority.toUpperCase()} | ${c.category}: ${c.action}`).join("\n");

  const res = await fnCall(apiKey, 1024,
    "You are Aira, a fiduciary retirement planning AI. Be specific, concise, and quantitative. Never give legal or tax advice.",
    `Profile:\n${ctx}\n\nExisting cards:\n${cardList}\n\nFor each card, add a specific 1-2 sentence aiNote with numbers from the profile. Then add up to 2 net-new cards the rules engine missed (e.g. IRMAA cliff, SS bridge gap, specific bracket math). Skip new cards if none apply.`,
    {
      name: "annotate_cards",
      description: "Annotate existing action cards and add new ones",
      parameters: {
        type: "object",
        properties: {
          annotated: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id:     { type: "string" },
                aiNote: { type: "string", description: "1–2 sentence specific insight for this card" },
              },
              required: ["id","aiNote"],
            },
          },
          new_cards: {
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
              required: ["priority","category","action","reason","deadline","aiNote"],
            },
          },
        },
        required: ["annotated","new_cards"],
      },
    }
  );

  const toolInput = getFnArgs(res);
  const noteMap   = Object.fromEntries((toolInput.annotated || []).map(a => [a.id, a.aiNote]));
  const newCards  = (toolInput.new_cards || []).slice(0, 2);

  const merged = [
    ...cards.map(c => ({ ...c, aiNote: noteMap[c.id] || null })),
    ...newCards.map(c => ({ ...c, id: `ai-${c.category.toLowerCase().replace(/\s+/g, "-")}`, aiGenerated: true })),
  ];
  merged.sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[a.priority] - { red: 0, yellow: 1, green: 2 }[b.priority]));
  return merged;
}

// ─── AIAnalysisPanel Component ────────────────────────────────────────────────

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
