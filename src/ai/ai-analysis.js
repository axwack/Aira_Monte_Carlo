/**
 * ai-analysis.js — Direct Gemini API calls from the browser
 *
 * Each user provides their own Gemini API key via Profile → Assumptions.
 * No server proxy needed — calls go directly to Google's API.
 *
 * Get a free key at: https://aistudio.google.com/app/apikey
 *
 * Path A billing stub:
 *   Set BILLING_ENABLED = true to activate credit checks + deductions.
 *   False (default) = pure BYOK — existing behavior, no changes.
 */

import { useState, useEffect, useCallback } from "react";
import { hasEnoughCredits, deductCredits, ESTIMATED_CREDITS_PER_CALL, getStoredJWT, fetchCreditBalance, syncCreditBalance } from "../billing/credits.js";

// ─── Billing mode flag ────────────────────────────────────────────────────────
// Flip to true when Path A (token-resale) goes live.
// When false, all credit logic is bypassed — pure BYOK, no code path changes.
// CURRENTLY OFF: HIGH-severity audit findings H2/H3/H4 still open.
// Tracked in Requirements.md §7 pre-launch checklist.
export const BILLING_ENABLED = true;

// ─── Billing proxy ────────────────────────────────────────────────────────────
// Routes all AI calls through /api/analyze when BILLING_ENABLED = true.
// The Worker verifies the JWT, deducts credits from D1, and calls Gemini
// with the server-side key — the user's BYOK key is not needed.

async function callViaProxy(type, data) {
  const jwt = getStoredJWT();
  if (!jwt) throw new Error("Not authenticated — please purchase AiRA credits to continue.");
  const res = await fetch("/api/analyze", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body:    JSON.stringify({ type, ...data }),
  });
  if (res.status === 401) throw new Error("Session expired — please log in again.");
  if (res.status === 402) throw new Error("Insufficient AiRA credits. Please purchase more.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const result = await res.json();
  // Sync balance from the server's response to avoid a second round-trip.
  // Fall back to a live fetch if the server didn't include the remaining balance
  // (e.g. BYOK mode or deduction failed non-fatally).
  if (typeof result._credits_remaining === "number") {
    syncCreditBalance(result._credits_remaining);
  } else {
    fetchCreditBalance();
  }
  return result;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// ─── Pricing & session usage tracking ────────────────────────────────────────

// $ per 1M tokens. Google AI Studio public pricing — update as Google revises.
// Thinking ("thoughts") tokens are billed at the output rate.
export const GEMINI_PRICING = {
  "gemini-2.5-flash":      { inputPerM: 0.30,  outputPerM: 2.50  },
  "gemini-2.5-pro":        { inputPerM: 1.25,  outputPerM: 10.00 },
  "gemini-2.0-flash-lite": { inputPerM: 0.075, outputPerM: 0.30  },
  "gemini-2.0-flash-001":  { inputPerM: 0.10,  outputPerM: 0.40  },
};

const USAGE_STORAGE_KEY = "airaAiUsage.v1";
const USAGE_MAX_RECORDS = 1000;  // Cap to prevent unbounded localStorage growth.

function _loadPersistedUsage() {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-USAGE_MAX_RECORDS) : [];
  } catch { return []; }
}

function _persistUsage() {
  try {
    if (typeof localStorage === "undefined") return;
    const trimmed = _usageRecords.slice(-USAGE_MAX_RECORDS);
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* quota exceeded or storage disabled — silently drop */ }
}

const _usageRecords = _loadPersistedUsage();
const _usageListeners = new Set();

export function calcCost(model, inputTokens, outputTokens) {
  const p = GEMINI_PRICING[model] || GEMINI_PRICING[DEFAULT_GEMINI_MODEL];
  return (inputTokens / 1e6) * p.inputPerM + (outputTokens / 1e6) * p.outputPerM;
}

function _notify() {
  _usageListeners.forEach(l => { try { l(); } catch { /* ignore */ } });
}

function recordUsage(model, fnLabel, usage) {
  if (!usage) return null;
  const promptTokens   = usage.promptTokenCount      || 0;
  const outputTokens   = usage.candidatesTokenCount  || 0;
  const thoughtsTokens = usage.thoughtsTokenCount    || 0;
  // Thinking tokens bill at the output rate.
  const billableOutput = outputTokens + thoughtsTokens;
  const totalTokens    = usage.totalTokenCount || (promptTokens + billableOutput);
  const costUsd        = calcCost(model, promptTokens, billableOutput);
  const rec = { ts: Date.now(), model, fnLabel, promptTokens, outputTokens, thoughtsTokens, totalTokens, costUsd };
  _usageRecords.push(rec);
  if (_usageRecords.length > USAGE_MAX_RECORDS) _usageRecords.splice(0, _usageRecords.length - USAGE_MAX_RECORDS);
  _persistUsage();
  _notify();
  return rec;
}

export function getAiUsage() {
  let totalTokens = 0, totalCostUsd = 0;
  for (const r of _usageRecords) { totalTokens += r.totalTokens; totalCostUsd += r.costUsd; }
  return { records: _usageRecords.slice(), totalTokens, totalCostUsd, callCount: _usageRecords.length };
}

export function resetAiUsage() {
  _usageRecords.length = 0;
  _persistUsage();
  _notify();
}

export function subscribeAiUsage(listener) {
  _usageListeners.add(listener);
  return () => _usageListeners.delete(listener);
}

export function useAiUsage() {
  const [usage, setUsage] = useState(getAiUsage());
  useEffect(() => subscribeAiUsage(() => setUsage(getAiUsage())), []);
  return usage;
}

// Default model used when values.geminiModel is not set.
// gemini-2.0-flash was deprecated for new users; 2.5-flash is the current stable default.
// User can override per-profile via Profile → Assumptions → AI Model dropdown.
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

// Available models for the UI dropdown. Cheapest first.
// Update this list when Google publishes new models or deprecates old ones.
export const GEMINI_MODELS = [
  { id: "gemini-2.5-flash",       label: "Gemini 2.5 Flash (recommended)", note: "Newest stable, fast, supports thinking" },
  { id: "gemini-2.5-pro",         label: "Gemini 2.5 Pro",                  note: "Highest quality, ~10× cost" },
  { id: "gemini-2.0-flash-lite",  label: "Gemini 2.0 Flash-Lite",           note: "Cheapest, lower quality" },
  { id: "gemini-2.0-flash-001",   label: "Gemini 2.0 Flash 001",            note: "Legacy stable" },
];

function resolveModel(values) {
  return (values?.geminiModel || "").trim() || DEFAULT_GEMINI_MODEL;
}

// ─── Gemini helpers ───────────────────────────────────────────────────────────

async function callGemini(apiKey, payload, model = DEFAULT_GEMINI_MODEL, fnLabel = "unknown") {
  // callGemini is the BYOK path only — the billing/proxy path uses callViaProxy.
  // No credit guards here; credits are managed server-side for proxy calls.
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini HTTP ${res.status}`);
  }
  const data = await res.json();
  recordUsage(model, fnLabel, data.usageMetadata);
  return data;
}

function fnCall(apiKey, maxTokens, systemText, userText, fnDecl, model = DEFAULT_GEMINI_MODEL, fnLabel = "unknown") {
  return callGemini(apiKey, {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    tools: [{ functionDeclarations: [fnDecl] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [fnDecl.name] } },
    // Disable thinking for function calls — Gemini 2.5 thinking mode emits
    // function calls as Python-style code (`print(default_api.foo(...))`) 
    // which the API rejects as MALFORMED_FUNCTION_CALL. No-op for non-thinking models.
    generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  }, model, fnLabel);
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
  if (BILLING_ENABLED && getStoredJWT()) {
    try { return await callViaProxy("health", { values, mcResults }); }
    catch { return healthFallback(values, mcResults); }
  }
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
      },
      resolveModel(values),
      "health_score"
    );
    return getFnArgs(res);
  } catch {
    return healthFallback(values, mcResults);
  }
}

// ─── 2. Narrative Summary ─────────────────────────────────────────────────────

export async function generateNarrativeSummary(values, mcResults) {
  if (BILLING_ENABLED && getStoredJWT()) {
    const rate = mcResults?.rate ?? 0;
    const fallback = `**Aira Narrative (unavailable)**\n\n${(rate * 100).toFixed(1)}% success rate.`;
    try {
      const result = await callViaProxy("narrative", { values, mcResults });
      return result.text;
    } catch { return fallback; }
  }
  const apiKey = values.geminiApiKey?.trim();
  const rate   = mcResults?.rate ?? 0;
  const fallback = `**Aira Narrative (AI unavailable)**\n\nYour plan shows a **${(rate * 100).toFixed(1)}% success rate** across ${mcResults?.N?.toLocaleString() ?? "N/A"} simulations to age ${values.endAge || 90}.\n\n**Portfolio:** $${(values.port || 0).toLocaleString()} · **Spending:** $${(values.sp || 0).toLocaleString()}/yr · **State:** ${values.stateOfResidence || "unknown"}\n\n_Add your Gemini API key in Profile → Assumptions to receive a personalized AI narrative._`;
  if (!apiKey) return fallback;
  try {
    const res = await callGemini(apiKey, {
      systemInstruction: { parts: [{ text: "You are Aira. Write a 3–5 paragraph retirement narrative in plain English with markdown headers: Overview | Strengths | Risks | Recommended Actions. No legal advice." }] },
      contents: [{ role: "user", parts: [{ text: ctxNarrative(values, mcResults) }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }, resolveModel(values), "narrative");
    return getText(res);
  } catch {
    return fallback;
  }
}

// ─── 3. Withdrawal Strategy Optimization ─────────────────────────────────────

export async function suggestWithdrawalOptimization(values, mcResults) {
  const current = values.withdrawalStrategy || "gk";
  if (BILLING_ENABLED && getStoredJWT()) {
    try { return await callViaProxy("withdrawal", { values, mcResults }); }
    catch { return { recommended: current, reason: "AI unavailable.", projectedRateImprovement: "N/A" }; }
  }
  const apiKey  = values.geminiApiKey?.trim();
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
      },
      resolveModel(values),
      "withdrawal_rec"
    );
    return getFnArgs(res);
  } catch {
    return { recommended: current, reason: `AI unavailable — keeping current strategy "${current}".`, projectedRateImprovement: "N/A" };
  }
}

// ─── 4. Roth Conversion Strategy ─────────────────────────────────────────────

export async function evaluateRothStrategy(values) {
  if (BILLING_ENABLED && getStoredJWT()) {
    try { return await callViaProxy("roth", { values }); }
    catch { /* fall through to rules fallback */ }
  }
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
      },
      resolveModel(values),
      "roth_strategy"
    );
    return getFnArgs(res);
  } catch {
    return fallback;
  }
}

// ─── 5. Conversational Chat Response ─────────────────────────────────────────

export async function generateChatResponse(values, mcResults, question, history = []) {
  if (BILLING_ENABLED && getStoredJWT()) {
    try {
      const result = await callViaProxy("chat", { values, mcResults, question, history });
      return result.text;
    } catch (e) {
      return `**Aira:** ${e.message}`;
    }
  }
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
    }, resolveModel(values), "chat");
    return getText(res);
  } catch (e) {
    return `**Aira:** AI error — ${e.message}`;
  }
}

// ─── 6. AI-Enhanced Action Plan ───────────────────────────────────────────────

export async function runAIActionPlan(values, mcResults, cards = []) {
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

  if (BILLING_ENABLED && getStoredJWT()) {
    const result = await callViaProxy("actionplan", { values: slimValues, mcResults, cards });
    return result.cards;
  }

  const apiKey = values.geminiApiKey?.trim();
  if (!apiKey) throw new Error("No Gemini API key — add it in Profile → Assumptions");

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
    },
    resolveModel(values),
    "annotate_cards"
  );

  console.log("[AI] Gemini raw response:", res);
  const toolInput = getFnArgs(res);
  console.log("[AI] Parsed toolInput:", toolInput);
  const noteMap   = Object.fromEntries((toolInput.annotated || []).map(a => [a.id, a.aiNote]));
  const newCards  = (toolInput.new_cards || []).slice(0, 2);

  const merged = [
    ...cards.map(c => ({ ...c, aiChecked: true, aiNote: noteMap[c.id] || null })),
    ...newCards.map(c => ({ ...c, id: `ai-${c.category.toLowerCase().replace(/\s+/g, "-")}`, aiGenerated: true, aiChecked: true })),
  ];
  merged.sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[a.priority] - { red: 0, yellow: 1, green: 2 }[b.priority]));
  return merged;
}

// ─── 7. Retirement Date Solver ────────────────────────────────────────────────
// ─── 8. Live Internet Search Cards ───────────────────────────────────────────

function getSearchTopics(values) {
  const age       = values.currentAge || 56;
  const retireAge = values.retireAge  || 65;
  const state     = values.stateOfResidence;
  const hasSS     = (values.ssb || 0) > 0 || age > 50;
  const hasPreTax = (values.accounts || []).some(a => a.category === "pretax" && (a.balance || 0) > 0);
  const topics    = [];

  // Always relevant
  topics.push("IRS 401k IRA HSA contribution limits catch-up amounts 2026");
  topics.push("IRS federal income tax brackets standard deduction 2026 married filing jointly single");
  topics.push("long-term capital gains tax rates income thresholds 2026");
  topics.push("SECURE 2.0 Act provisions effective 2025 2026 key retirement account changes");
  topics.push("current US CPI inflation rate Federal Reserve interest rate decision 2026");
  topics.push("10-year Treasury yield I-Bond composite rate 2026");
  topics.push("safe withdrawal rate 4 percent rule latest research 2025 2026 update");

  if (hasSS) {
    topics.push("Social Security COLA 2026 cost-of-living adjustment benefit increase announcement");
    topics.push("Social Security trust fund solvency depletion date projection benefit cut risk 2026");
    topics.push("Social Security earnings test exempt amount limit 2026 working while collecting");
  }

  if (age >= 58 || retireAge <= 67) {
    topics.push("Medicare Part B standard premium 2026 IRMAA income surcharge thresholds brackets");
    topics.push("Medicare Advantage vs original Medicare cost comparison 2026 trends");
  }

  if (hasPreTax && (age >= 68 || retireAge >= 70)) {
    topics.push("required minimum distribution RMD age 73 rules calculation tables 2026 SECURE 2.0");
  }

  if (age >= 65) {
    topics.push("qualified charitable distribution QCD annual limit 2026 IRA direct to charity rules");
  }

  if (age >= 55) {
    topics.push("long-term care nursing home assisted living average cost 2026 national");
  }

  topics.push("Roth IRA conversion strategy 2026 tax bracket optimization IRMAA");
  topics.push("Social Security reform proposals benefit cut risk 2026 Congress");

  if (state) {
    topics.push(`${state} state income tax retirement income IRA 401k pension Social Security exemption 2026`);
    topics.push(`${state} property tax exemption senior retiree homestead credit 2026`);
    topics.push(`${state} estate inheritance tax exemption threshold 2026`);
  }

  return topics;
}

export async function generateTimeSensitiveCards(values, mcResults) {
  if (BILLING_ENABLED && getStoredJWT()) {
    try {
      const result = await callViaProxy("timesensitive", { values, mcResults });
      return result.cards || [];
    } catch (e) { throw e; }
  }

  const apiKey = values?.geminiApiKey?.trim();
  if (!apiKey) throw new Error("Gemini API key required — add it in Profile → Assumptions");

  const topics  = getSearchTopics(values);
  const model   = resolveModel(values);

  const profileCtx = [
    `Age: ${values.currentAge} | Retire: ${values.retireAge} | State: ${values.stateOfResidence || "unknown"}`,
    `Portfolio: $${(values.port || 0).toLocaleString()} | Spending: $${(values.sp || 0).toLocaleString()}/yr`,
    `Filing: ${values.filingStatus || "mfj"} | SS: $${(values.ssb || 0).toLocaleString()}/yr at ${values.ssAge}`,
    `MC success: ${mcResults ? (mcResults.rate * 100).toFixed(1) : "N/A"}%`,
    `Pre-tax: $${((values.accounts||[]).filter(a=>a.category==="pretax").reduce((s,a)=>s+(a.balance||0),0)/1000).toFixed(0)}K | Roth: $${((values.accounts||[]).filter(a=>a.category==="roth").reduce((s,a)=>s+(a.balance||0),0)/1000).toFixed(0)}K`,
  ].join("\n");

  const prompt = `You are Aira, a fiduciary retirement planning AI.\n\nUSER PROFILE:\n${profileCtx}\n\nUse Google Search to find CURRENT information on these topics. Only create a card when you find specific, current numbers or thresholds directly actionable for this user.\n\nSEARCH TOPICS:\n${topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nReturn ONLY a valid JSON array between <cards> and </cards> tags. Each object:\n{\n  "priority": "red|yellow|green",\n  "category": "short category name",\n  "action": "specific action sentence tailored to this user",\n  "reason": "why this matters given their numbers",\n  "deadline": "when to act",\n  "aiNote": "key current number or threshold found (dollar amount, percentage, date)",\n  "source": "website or publication name"\n}\n\nRules:\n- Only include cards with real current numbers you found via search\n- Skip topics where you only have general/training knowledge\n- Set priority by financial impact urgency for this user\n- Maximum 12 cards\n\n<cards>\n</cards>`;

  const res = await callGemini(apiKey, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools:    [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
  }, model, "time_sensitive");

  const text  = res.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  const tagged = text.match(/<cards>([\s\S]*?)<\/cards>/);
  const raw    = tagged?.[1]?.trim() ?? text.match(/\[\s*\{[\s\S]*?\}\s*\]/)?.[0];
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : []).map((c, i) => ({
      ...c,
      id:           `live-${i}-${Date.now()}`,
      isLiveData:   true,
      aiGenerated:  true,
    }));
  } catch { return []; }
}

/**
 * Pure deterministic solver — no API call needed.
 * Projects the accumulation path at three return scenarios and finds the age
 * at which the portfolio crosses the target value.
 *
 * @param {object} values  ProfileWizard values (uses port, contrib, currentAge, earlyRetireTarget)
 * @returns {{ target, currentPort, results: [{ label, rate, crossoverAge, portAtCrossover }] }}
 */
export function solveRetirementDate(values) {
  const currentAge  = values.currentAge  || 56;
  const currentPort = values.port        || 0;
  const annualContrib = values.contrib   || 0;
  const target = values.earlyRetireTarget || values.portfolioGoal || 3_500_000;
  const MAX_AGE = 80;

  const scenarios = [
    { label: "Conservative", rate: 0.06 },
    { label: "Expected",     rate: 0.075 },
    { label: "Strong",       rate: 0.09 },
  ];

  const results = scenarios.map(({ label, rate }) => {
    let port = currentPort;
    for (let age = currentAge; age <= MAX_AGE; age++) {
      if (port >= target) return { label, rate, crossoverAge: age, portAtCrossover: Math.round(port) };
      port = port * (1 + rate) + annualContrib;
    }
    return { label, rate, crossoverAge: null, portAtCrossover: Math.round(port) };
  });

  return { target, currentPort, currentAge, results };
}

/**
 * AI-enhanced retirement date analysis. Falls back to a deterministic narrative when
 * no Gemini key is present or the API call fails.
 *
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {{ solver, narrative }} solver = solveRetirementDate output, narrative = string
 */
export async function analyzeRetirementDate(values, mcResults) {
  const solver = solveRetirementDate(values);
  const apiKey = values?.geminiApiKey?.trim();
  try {
    if (!apiKey) throw new Error("no api key");
    const fmtM = (n) => `$${(n / 1_000_000).toFixed(2)}M`;
    const scenarioLines = solver.results.map(r =>
      `- ${r.label} (${(r.rate * 100).toFixed(1)}%): reaches ${fmtM(solver.target)} ${r.crossoverAge != null ? `at age ${r.crossoverAge}` : "beyond age 80"}`
    ).join("\n");
    const userText = [
      `Target portfolio: ${fmtM(solver.target)}`,
      `Current portfolio: ${fmtM(solver.currentPort)} at age ${solver.currentAge}`,
      `Planned retirement age: ${values.retireAge || 60}`,
      `MC success rate: ${mcResults ? (mcResults.rate * 100).toFixed(1) : "N/A"}%`,
      ``,
      `Solver results across three return scenarios:`,
      scenarioLines,
    ].join("\n");
    const res = await callGemini(apiKey, {
      systemInstruction: { parts: [{ text: "You are Aira. Write a 2-3 paragraph plain-English narrative about when this person reaches their portfolio target. Quote specific ages and dollar amounts from the solver. Mention the gap between expected and conservative paths. No legal or tax advice." }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { maxOutputTokens: 512 },
    }, resolveModel(values), "retirement_date");
    return { solver, narrative: getText(res) };
  } catch {
    const { target, currentPort, currentAge, results } = solver;
    const expected = results.find(r => r.label === "Expected");
    const conservative = results.find(r => r.label === "Conservative");
    const fmt = (n) => n != null ? `age ${n}` : "beyond age 80";
    const fmtM = (n) => `$${(n / 1_000_000).toFixed(2)}M`;

    const narrative = [
      `**Retirement Date Solver** — Target: ${fmtM(target)}`,
      ``,
      `Current portfolio: ${fmtM(currentPort)} at age ${currentAge}.`,
      ``,
      `| Scenario | Reaches ${fmtM(target)} |`,
      `|---|---|`,
      ...results.map(r => `| ${r.label} (${(r.rate * 100).toFixed(1)}%) | ${fmt(r.crossoverAge)} |`),
      ``,
      expected?.crossoverAge != null
        ? `At expected returns your portfolio crosses ${fmtM(target)} at **${fmt(expected.crossoverAge)}** — ${expected.crossoverAge <= (values.retireAge || 60) ? "on track for your planned retirement." : `${expected.crossoverAge - (values.retireAge || 60)} years after your planned retirement date.`}`
        : `Portfolio does not reach target before age 80 at expected returns — review contributions or target.`,
      ``,
      conservative?.crossoverAge != null && conservative.crossoverAge <= (values.retireAge || 60)
        ? `Even the conservative path hits the target by your planned retirement age — strong position.`
        : `The conservative path reaches target at ${fmt(conservative?.crossoverAge)} — consider this your planning floor.`,
    ].join("\n");

    return { solver, narrative };
  }
}

// ─── AIAnalysisPanel Component ────────────────────────────────────────────────

function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

function formatCost(usd) {
  if (usd < 0.01)  return `<$0.01`;
  if (usd < 1)     return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function AiUsageBadge({ style }) {
  const usage = useAiUsage();
  if (usage.callCount === 0) return null;
  return (
    <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 8, ...style }}>
      <span>Session: {usage.callCount} call{usage.callCount === 1 ? "" : "s"} · {formatTokens(usage.totalTokens)} tokens · ~{formatCost(usage.totalCostUsd)}</span>
      <button
        onClick={resetAiUsage}
        style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", borderRadius: 4, padding: "1px 6px", fontSize: 10, cursor: "pointer" }}
      >reset</button>
    </div>
  );
}

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

      <AiUsageBadge style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }} />
    </div>
  );
}

// ─── AiraAITab — full AI workspace ───────────────────────────────────────────
//
// Hosts all 6 AI features in one place. Each section is independent — load on
// demand, no auto-run. Wired into App.jsx as a top-level tab.
//
// Props:
//   values      — assumptions / params object (geminiApiKey, accounts, etc.)
//   mcResults   — runMC() output
//   onApplyWithdrawal(strategy) — optional callback to write recommended
//     withdrawal strategy back to App.jsx state

const sectionStyle = {
  padding: "14px 16px",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.02)",
  marginBottom: 12,
};

const sectionHeaderStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: "#818cf8",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 10,
};

const aiButtonStyle = (disabled) => ({
  background: disabled ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #7c3aed, #a78bfa)",
  border: "none",
  color: disabled ? "#475569" : "white",
  borderRadius: 6,
  padding: "5px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
});

function HealthAndNarrativeSection({ values, mcResults }) {
  const [health, setHealth] = useState(null);
  const [narr, setNarr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const gradeColor = { A: "#86efac", B: "#a3e635", C: "#fbbf24", D: "#fb923c", F: "#f87171" };

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [h, n] = await Promise.all([
        analyzeRetirementHealth(values, mcResults),
        generateNarrativeSummary(values, mcResults),
      ]);
      setHealth(h); setNarr(n);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [values, mcResults]);

  return (
    <div style={sectionStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={sectionHeaderStyle}>📊 Plan Health &amp; Narrative</div>
        <button onClick={run} disabled={loading} style={aiButtonStyle(loading)}>
          {loading ? "Analyzing…" : health ? "Re-analyze" : "Analyze Plan"}
        </button>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>Error: {error}</div>}
      {health && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: gradeColor[health.grade] || "#e2e8f0" }}>{health.grade}</span>
          <span style={{ fontSize: 14, color: "#94a3b8", marginLeft: 8 }}>{health.score}/100</span>
          <p style={{ fontSize: 12, color: "#cbd5e1", margin: "6px 0 8px" }}>{health.summary}</p>
          {health.flags?.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {health.flags.map((f, i) => <li key={i} style={{ fontSize: 12, color: "#fbbf24", marginBottom: 3 }}>{f}</li>)}
            </ul>
          )}
        </div>
      )}
      {narr && (
        <div style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "pre-wrap", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
          {narr}
        </div>
      )}
    </div>
  );
}

function RothStrategySection({ values }) {
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setLoading(true); setError(null);
    try { setOut(await evaluateRothStrategy(values)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  return (
    <div style={sectionStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={sectionHeaderStyle}>🔄 Roth Conversion Strategy</div>
        <button onClick={run} disabled={loading} style={aiButtonStyle(loading)}>
          {loading ? "Evaluating…" : out ? "Re-evaluate" : "Evaluate"}
        </button>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>Error: {error}</div>}
      {out && (
        <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 6 }}><strong style={{ color: "#a78bfa" }}>Assessment:</strong> {out.assessment}</div>
          <div style={{ marginBottom: 6 }}><strong style={{ color: "#a78bfa" }}>Advice:</strong> {out.conversionAdvice}</div>
          {out.suggestedAnnualAmount > 0 && (
            <div><strong style={{ color: "#a78bfa" }}>Suggested annual conversion:</strong> ${out.suggestedAnnualAmount.toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  );
}

function WithdrawalStrategySection({ values, mcResults, onApplyWithdrawal }) {
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [applied, setApplied] = useState(false);
  const run = async () => {
    setLoading(true); setError(null); setApplied(false);
    try { setOut(await suggestWithdrawalOptimization(values, mcResults)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  const apply = () => {
    if (out?.recommended && onApplyWithdrawal) {
      onApplyWithdrawal(out.recommended);
      setApplied(true);
    }
  };
  const current = values?.withdrawalStrategy || "gk";
  const isDifferent = out && out.recommended && out.recommended !== current;
  return (
    <div style={sectionStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={sectionHeaderStyle}>💸 Withdrawal Strategy</div>
        <button onClick={run} disabled={loading} style={aiButtonStyle(loading)}>
          {loading ? "Analyzing…" : out ? "Re-analyze" : "Suggest"}
        </button>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>Error: {error}</div>}
      {out && (
        <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color: "#a78bfa" }}>Current:</strong> {current}
            {" → "}
            <strong style={{ color: isDifferent ? "#86efac" : "#94a3b8" }}>Recommended: {out.recommended}</strong>
          </div>
          <div style={{ marginBottom: 6 }}><strong style={{ color: "#a78bfa" }}>Reason:</strong> {out.reason}</div>
          {out.projectedRateImprovement && out.projectedRateImprovement !== "N/A" && (
            <div style={{ marginBottom: 8 }}><strong style={{ color: "#a78bfa" }}>Projected improvement:</strong> {out.projectedRateImprovement}</div>
          )}
          {isDifferent && onApplyWithdrawal && (
            <button onClick={apply} disabled={applied} style={{
              ...aiButtonStyle(applied),
              background: applied ? "rgba(134,239,172,0.2)" : "linear-gradient(135deg, #16a34a, #4ade80)",
              color: applied ? "#86efac" : "white",
            }}>
              {applied ? "✓ Applied" : `Apply "${out.recommended}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RetirementDateSection({ values, mcResults }) {
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setLoading(true); setError(null);
    try { setOut(await analyzeRetirementDate(values, mcResults)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  return (
    <div style={sectionStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={sectionHeaderStyle}>🎯 Retirement Date Analysis</div>
        <button onClick={run} disabled={loading} style={aiButtonStyle(loading)}>
          {loading ? "Analyzing…" : out ? "Re-analyze" : "Analyze"}
        </button>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>Error: {error}</div>}
      {out && (
        <div style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {out.narrative}
        </div>
      )}
    </div>
  );
}

function ChatSection({ values, mcResults }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    const next = [...history, { role: "user", content: q }];
    setHistory(next);
    setLoading(true);
    try {
      const reply = await generateChatResponse(values, mcResults, q, history);
      setHistory([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setHistory([...next, { role: "assistant", content: `**Error:** ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };
  return (
    <div style={sectionStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={sectionHeaderStyle}>💬 Chat with Aira</div>
        {history.length > 0 && (
          <button onClick={() => setHistory([])} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto", marginBottom: 10, paddingRight: 4 }}>
        {history.length === 0 && (
          <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", padding: "8px 0" }}>
            Ask Aira anything about your plan — e.g. "What's my biggest risk?" or "Should I delay Social Security?"
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} style={{
            background: m.role === "user" ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)",
            border: "1px solid " + (m.role === "user" ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)"),
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 8,
            fontSize: 12,
            color: m.role === "user" ? "#c7d2fe" : "#cbd5e1",
            whiteSpace: "pre-wrap",
            lineHeight: 1.6,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: m.role === "user" ? "#818cf8" : "#a78bfa", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {m.role === "user" ? "You" : "Aira"}
            </div>
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ fontSize: 11, color: "#a78bfa", padding: "4px 0", fontStyle: "italic" }}>Aira is thinking…</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          placeholder="Ask a question…"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "6px 12px",
            color: "#e2e8f0",
            fontSize: 12,
            outline: "none",
          }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={aiButtonStyle(loading || !input.trim())}>
          Send
        </button>
      </div>
    </div>
  );
}

export function AiraAITab({ values, mcResults, onApplyWithdrawal }) {
  const hasKey = !!values?.geminiApiKey?.trim();
  if (!values || !mcResults) {
    return (
      <div style={{ ...sectionStyle, textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 8 }}>🎲 Monte Carlo not run yet</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>Press ▶ Run Monte Carlo to unlock AI analysis.</div>
      </div>
    );
  }
  return (
    <div>
      {!hasKey && (
        <div style={{
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 12,
          fontSize: 12,
          color: "#fbbf24",
        }}>
          🔒 No Gemini API key set. AI features fall back to rules-based output. {" "}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "#fbbf24", textDecoration: "underline" }}>
            Get a free key
          </a>
          {" "}then add it in Profile → Assumptions.
        </div>
      )}
      <HealthAndNarrativeSection values={values} mcResults={mcResults} />
      <RothStrategySection values={values} />
      <WithdrawalStrategySection values={values} mcResults={mcResults} onApplyWithdrawal={onApplyWithdrawal} />
      <RetirementDateSection values={values} mcResults={mcResults} />
      <ChatSection values={values} mcResults={mcResults} />
      <AiUsageBadge style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }} />
    </div>
  );
}
