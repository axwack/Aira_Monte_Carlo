/**
 * AI-analysis.js — Claude-powered retirement analysis stubs
 *
 * Each exported function is a STUB that returns deterministic placeholder data.
 * Real Claude API calls are marked with TODO blocks showing the exact SDK pattern.
 *
 * When activating a stub:
 *   1. npm install @anthropic-ai/sdk
 *   2. Set REACT_APP_ANTHROPIC_API_KEY in .env (never commit the key)
 *   3. Replace the stub body with the TODO block below it
 *
 * Input contracts:
 *   values     — ProfileWizard profile object (same shape as BLANK_PROFILE in App.jsx)
 *   mcResults  — runMC() output: { rate, medR, pcts, term, N }
 *                  rate    : 0–1 success probability
 *                  medR    : median portfolio value at retirement start
 *                  pcts    : array[endAge-currentAge+1] of { p10, p25, p50, p75, p90 }
 *                  term    : terminal percentiles { p10, p25, p50, p75, p90 }
 *                  N       : simulation count
 */

// ─── Anthropic client (inactive until real calls replace stubs) ───────────────
// import Anthropic from "@anthropic-ai/sdk";
// const client = new Anthropic({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });

// ─── Shared prompt-context builder ───────────────────────────────────────────
/**
 * Builds a compact, token-efficient profile summary for injection into prompts.
 * Omits zero/null fields so the LLM isn't confused by empty data.
 */
function buildProfileContext(values, mcResults) {
  const swr = values.port > 0
    ? ((values.sp / values.port) * 100).toFixed(2)
    : "N/A";

  const accounts = (values.accounts || [])
    .filter((a) => a.balance > 0)
    .map((a) => `${a.name} (${a.category}): $${a.balance.toLocaleString()}`)
    .join(", ");

  const lines = [
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
      ? `MC success (90): ${(mcResults.rate * 100).toFixed(1)}% over ${mcResults.N} paths`
      : null,
    mcResults
      ? `Terminal p10/p50/p90: $${(mcResults.term.p10 / 1000).toFixed(0)}K / $${(mcResults.term.p50 / 1000).toFixed(0)}K / $${(mcResults.term.p90 / 1000).toFixed(0)}K`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return lines;
}

// ─── 1. Retirement Health Score ───────────────────────────────────────────────
/**
 * analyzeRetirementHealth
 *
 * Scores the retirement plan on a 0–100 scale, assigns a letter grade,
 * and surfaces the top risk flags.
 *
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {{ score: number, grade: string, summary: string, flags: string[] }}
 */
export async function analyzeRetirementHealth(values, mcResults) {
  // ── STUB: deterministic placeholder ─────────────────────────────────────────
  const rate = mcResults?.rate ?? 0;
  const score = Math.round(rate * 100);
  const grade =
    score >= 90 ? "A" :
    score >= 80 ? "B" :
    score >= 70 ? "C" :
    score >= 60 ? "D" : "F";

  const flags = [];
  if (rate < 0.80) flags.push("Success rate below 80% — plan needs restructuring.");
  if (values.sp / values.port > 0.05) flags.push("Withdrawal rate exceeds 5% — consider reducing spending.");
  if ((values.ssAge || 67) < 67) flags.push("Early SS claim — consider delaying to 67–70 for higher benefit.");
  if (values.stateOfResidence === "CA" || values.stateOfResidence === "NJ")
    flags.push(`${values.stateOfResidence} has high income tax — consider domicile planning.`);

  return {
    score,
    grade,
    summary: `AI analysis placeholder — ${(rate * 100).toFixed(1)}% Monte Carlo success rate.`,
    flags,
  };

  // ── TODO: Replace stub body above with this Claude API call ─────────────────
  //
  // const profileCtx = buildProfileContext(values, mcResults);
  //
  // const response = await client.messages.create({
  //   model: "claude-opus-4-7",
  //   max_tokens: 1024,
  //   thinking: { type: "adaptive" },
  //   output_config: {
  //     effort: "high",
  //     format: {
  //       type: "json_schema",
  //       json_schema: {
  //         name: "retirement_health",
  //         schema: {
  //           type: "object",
  //           properties: {
  //             score:   { type: "number", description: "0–100 health score" },
  //             grade:   { type: "string", enum: ["A","B","C","D","F"] },
  //             summary: { type: "string", description: "1–2 sentence plain-English summary" },
  //             flags:   { type: "array", items: { type: "string" }, description: "Top 3–5 risk flags" },
  //           },
  //           required: ["score","grade","summary","flags"],
  //         },
  //       },
  //     },
  //   },
  //   system: "You are Aira, a fiduciary retirement planning AI. Be concise and direct.",
  //   messages: [
  //     {
  //       role: "user",
  //       content: `Score this retirement plan and list the top risks:\n\n${profileCtx}`,
  //     },
  //   ],
  // });
  //
  // return JSON.parse(response.content.find((b) => b.type === "text").text);
}

// ─── 2. Narrative Summary ─────────────────────────────────────────────────────
/**
 * generateNarrativeSummary
 *
 * Produces a 3–5 paragraph plain-English summary of the plan's strengths,
 * weaknesses, and recommended next steps.
 *
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {string}  Markdown-formatted narrative
 */
export async function generateNarrativeSummary(values, mcResults) {
  // ── STUB ─────────────────────────────────────────────────────────────────────
  const rate = mcResults?.rate ?? 0;
  return `**AI Narrative Summary (placeholder)**

Your plan shows a **${(rate * 100).toFixed(1)}% success rate** across ${mcResults?.N?.toLocaleString() ?? "N/A"} Monte Carlo simulations to age ${values.endAge || 90}.

**Portfolio:** $${(values.port || 0).toLocaleString()} · **Annual spending:** $${(values.sp || 0).toLocaleString()} · **State:** ${values.stateOfResidence || "unknown"}

_This is stub output. Replace \`generateNarrativeSummary\` in AI-analysis.js with a real Claude API call to receive a personalized 3–5 paragraph analysis._`;

  // ── TODO: Replace stub body above with this Claude API call ─────────────────
  //
  // const profileCtx = buildProfileContext(values, mcResults);
  //
  // // Use streaming for long-form narrative to avoid timeout
  // const stream = await client.messages.stream({
  //   model: "claude-opus-4-7",
  //   max_tokens: 2048,
  //   thinking: { type: "adaptive" },
  //   output_config: { effort: "high" },
  //   system: [
  //     "You are Aira, a fiduciary retirement planning AI.",
  //     "Write in plain English. No jargon. Format with markdown headers.",
  //     "Sections: Overview | Strengths | Risks | Recommended Actions",
  //   ].join(" "),
  //   messages: [
  //     {
  //       role: "user",
  //       content: `Write a 3–5 paragraph retirement plan narrative:\n\n${profileCtx}`,
  //     },
  //   ],
  // });
  //
  // const msg = await stream.finalMessage();
  // return msg.content.find((b) => b.type === "text").text;
}

// ─── 3. Withdrawal Strategy Optimization ─────────────────────────────────────
/**
 * suggestWithdrawalOptimization
 *
 * Compares the current withdrawal strategy against alternatives and recommends
 * the best fit for this profile.
 *
 * Supported strategies in runMC(): gk, fixed, vanguard, risk, kitces,
 *   vpw, cape, endowment, one_n, ninety_five_rule
 *
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output (run with current strategy)
 * @returns {{ recommended: string, reason: string, projectedRateImprovement: string }}
 */
export async function suggestWithdrawalOptimization(values, mcResults) {
  // ── STUB ─────────────────────────────────────────────────────────────────────
  const current = values.withdrawalStrategy || "gk";
  return {
    recommended: current,
    reason: `Stub: keeping current strategy "${current}". Replace with Claude API call for AI comparison across all 10 strategies.`,
    projectedRateImprovement: "N/A (stub)",
  };

  // ── TODO: Replace stub body above with this Claude API call ─────────────────
  //
  // const profileCtx = buildProfileContext(values, mcResults);
  // const strategies = ["gk","fixed","vanguard","risk","kitces","vpw","cape","endowment","one_n","ninety_five_rule"];
  //
  // const response = await client.messages.create({
  //   model: "claude-opus-4-7",
  //   max_tokens: 512,
  //   thinking: { type: "adaptive" },
  //   output_config: {
  //     effort: "high",
  //     format: {
  //       type: "json_schema",
  //       json_schema: {
  //         name: "withdrawal_recommendation",
  //         schema: {
  //           type: "object",
  //           properties: {
  //             recommended:                { type: "string", enum: strategies },
  //             reason:                     { type: "string" },
  //             projectedRateImprovement:   { type: "string" },
  //           },
  //           required: ["recommended","reason","projectedRateImprovement"],
  //         },
  //       },
  //     },
  //   },
  //   system: "You are Aira. Recommend the best withdrawal strategy for this profile. Current strategy: " + (values.withdrawalStrategy || "gk"),
  //   messages: [
  //     { role: "user", content: profileCtx },
  //   ],
  // });
  //
  // return JSON.parse(response.content.find((b) => b.type === "text").text);
}

// ─── 4. Roth Conversion Strategy ─────────────────────────────────────────────
/**
 * evaluateRothStrategy
 *
 * Assesses whether Roth conversions make sense pre-retirement,
 * suggests an annual conversion amount, and explains the tax reasoning.
 *
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @returns {{ assessment: string, conversionAdvice: string, suggestedAnnualAmount: number }}
 */
export async function evaluateRothStrategy(values, mcResults) {
  // ── STUB ─────────────────────────────────────────────────────────────────────
  const accounts = values.accounts || [];
  const preTax = accounts.filter((a) => a.category === "pretax").reduce((s, a) => s + (a.balance || 0), 0);
  const roth   = accounts.filter((a) => a.category === "roth").reduce((s, a) => s + (a.balance || 0), 0);
  const preTaxPct = values.port > 0 ? (preTax / values.port) * 100 : 0;

  return {
    assessment: preTaxPct > 70
      ? "Pre-tax heavy — Roth conversions strongly recommended before RMD age."
      : "Balanced allocation — moderate Roth conversion may still reduce lifetime taxes.",
    conversionAdvice: "Stub: fill 22% bracket annually before retirement. Replace with Claude API for personalized analysis.",
    suggestedAnnualAmount: 0, // stub
  };

  // ── TODO: Replace stub body above with this Claude API call ─────────────────
  //
  // const profileCtx = buildProfileContext(values, mcResults);
  //
  // const response = await client.messages.create({
  //   model: "claude-opus-4-7",
  //   max_tokens: 768,
  //   thinking: { type: "adaptive" },
  //   output_config: {
  //     effort: "high",
  //     format: {
  //       type: "json_schema",
  //       json_schema: {
  //         name: "roth_strategy",
  //         schema: {
  //           type: "object",
  //           properties: {
  //             assessment:              { type: "string" },
  //             conversionAdvice:        { type: "string" },
  //             suggestedAnnualAmount:   { type: "number", description: "Dollar amount to convert per year" },
  //           },
  //           required: ["assessment","conversionAdvice","suggestedAnnualAmount"],
  //         },
  //       },
  //     },
  //   },
  //   system: "You are Aira, a tax-aware retirement planning AI. Evaluate Roth conversion strategy. Consider IRMAA, RMDs, and bracket management.",
  //   messages: [
  //     { role: "user", content: profileCtx },
  //   ],
  // });
  //
  // return JSON.parse(response.content.find((b) => b.type === "text").text);
}

// ─── 5. Conversational Chat Response ─────────────────────────────────────────
/**
 * generateChatResponse
 *
 * Answers a free-form user question in the context of their specific plan.
 * Designed for the chat panel in the app UI.
 *
 * @param {object} values     ProfileWizard values
 * @param {object} mcResults  runMC() output
 * @param {string} question   User's question text
 * @param {Array}  history    Prior messages [{ role: "user"|"assistant", content: string }]
 * @returns {string}  Plain-text or markdown answer
 */
export async function generateChatResponse(values, mcResults, question, history = []) {
  // ── STUB ─────────────────────────────────────────────────────────────────────
  return `**Aira (stub):** You asked: _"${question}"_

This is placeholder output. To activate real AI responses, replace \`generateChatResponse\` in \`AI-analysis.js\` with the Claude API call in the TODO block below.

Your plan context: ${(mcResults?.rate * 100 || 0).toFixed(1)}% success rate, $${(values.port || 0).toLocaleString()} portfolio.`;

  // ── TODO: Replace stub body above with this Claude API call ─────────────────
  //
  // const profileCtx = buildProfileContext(values, mcResults);
  //
  // const systemPrompt = [
  //   "You are Aira, a fiduciary retirement planning AI assistant.",
  //   "Answer questions about the user's specific retirement plan below.",
  //   "Be concise, honest about uncertainty, and never give legal/tax advice.",
  //   "",
  //   "USER PLAN CONTEXT:",
  //   profileCtx,
  // ].join("\n");
  //
  // // Build conversation history: prior turns + new question
  // const messages = [
  //   ...history.map((m) => ({ role: m.role, content: m.content })),
  //   { role: "user", content: question },
  // ];
  //
  // // Stream for responsive UI
  // const stream = await client.messages.stream({
  //   model: "claude-opus-4-7",
  //   max_tokens: 1024,
  //   thinking: { type: "adaptive" },
  //   output_config: { effort: "high" },
  //   system: systemPrompt,
  //   messages,
  // });
  //
  // const msg = await stream.finalMessage();
  // return msg.content.find((b) => b.type === "text").text;
}

// ─── 6. AI-Enhanced Action Plan ───────────────────────────────────────────────
/**
 * runAIActionPlan
 *
 * AI-augmented version of generateActions() in App.jsx.
 * The rules engine in App.jsx generates deterministic actions;
 * this function asks Claude to add context, prioritize, and fill gaps
 * the rules engine may miss.
 *
 * @param {object} values           ProfileWizard values
 * @param {object} mcResults        runMC() output
 * @param {Array}  existingActions  Output of generateActions() from App.jsx
 * @returns {Array} Enhanced action items [{ priority, category, action, reason, deadline, aiNote? }]
 */
export async function runAIActionPlan(values, mcResults, existingActions = []) {
  // ── STUB: pass through existing rules-engine actions unchanged ───────────────
  return existingActions.map((a) => ({
    ...a,
    aiNote: "AI enhancement pending — activate Claude API call in AI-analysis.js",
  }));

  // ── TODO: Replace stub body above with this Claude API call ─────────────────
  //
  // const profileCtx = buildProfileContext(values, mcResults);
  // const existingSummary = existingActions
  //   .map((a) => `[${a.priority.toUpperCase()}] ${a.category}: ${a.action}`)
  //   .join("\n");
  //
  // const response = await client.messages.create({
  //   model: "claude-opus-4-7",
  //   max_tokens: 2048,
  //   thinking: { type: "adaptive" },
  //   output_config: {
  //     effort: "high",
  //     format: {
  //       type: "json_schema",
  //       json_schema: {
  //         name: "action_plan",
  //         schema: {
  //           type: "object",
  //           properties: {
  //             actions: {
  //               type: "array",
  //               items: {
  //                 type: "object",
  //                 properties: {
  //                   priority:  { type: "string", enum: ["red","yellow","green"] },
  //                   category:  { type: "string" },
  //                   action:    { type: "string" },
  //                   reason:    { type: "string" },
  //                   deadline:  { type: "string" },
  //                   aiNote:    { type: "string", description: "AI-added context or caveat" },
  //                 },
  //                 required: ["priority","category","action","reason","deadline"],
  //               },
  //             },
  //           },
  //           required: ["actions"],
  //         },
  //       },
  //     },
  //   },
  //   system: [
  //     "You are Aira. Review the existing rules-based action plan and:",
  //     "1. Add an aiNote to each item with relevant context or a caveat.",
  //     "2. Add up to 3 NEW actions the rules engine missed.",
  //     "3. Return the full merged array sorted: red first, then yellow, then green.",
  //   ].join(" "),
  //   messages: [
  //     {
  //       role: "user",
  //       content: `Profile:\n${profileCtx}\n\nExisting actions:\n${existingSummary}`,
  //     },
  //   ],
  // });
  //
  // const parsed = JSON.parse(response.content.find((b) => b.type === "text").text);
  // return parsed.actions;
}

// ─── 7. AIAnalysisPanel React Component ──────────────────────────────────────
/**
 * AIAnalysisPanel
 *
 * Drop-in React component that runs all six AI analyses and renders the results.
 * Consumes the same `values` prop as ProfileWizard and the `mcResults` from runMC().
 *
 * Usage in App.jsx:
 *   import { AIAnalysisPanel } from "./AI-analysis";
 *   <AIAnalysisPanel values={params} mcResults={r90} />
 *
 * @param {{ values: object, mcResults: object }} props
 */
export function AIAnalysisPanel({ values, mcResults }) {
  // ── STUB: static placeholder UI ──────────────────────────────────────────────
  // Replace useState/useEffect bodies with real API calls once stubs are activated.

  const [health, setHealth]     = [null, () => {}];  // placeholder
  const [narrative, setNarr]    = [null, () => {}];
  const [loading, setLoading]   = [false, () => {}];
  const [error, setError]       = [null, () => {}];

  // When real: call each exported function above in a useEffect and setState

  return (
    <div style={{ padding: "1rem", border: "2px dashed #facc15", borderRadius: 8 }}>
      <h3 style={{ color: "#facc15", marginTop: 0 }}>Aira AI Analysis Panel (stub)</h3>
      <p style={{ color: "#ccc", fontSize: 13 }}>
        This panel is a placeholder. Activate each function in{" "}
        <code>AI-analysis.js</code> by replacing stub bodies with the Claude API
        calls documented in the TODO blocks.
      </p>
      <ul style={{ color: "#ccc", fontSize: 13 }}>
        <li><code>analyzeRetirementHealth</code> — health score &amp; grade</li>
        <li><code>generateNarrativeSummary</code> — 3–5 paragraph plan overview</li>
        <li><code>suggestWithdrawalOptimization</code> — strategy comparison</li>
        <li><code>evaluateRothStrategy</code> — Roth conversion advice</li>
        <li><code>generateChatResponse</code> — conversational Q&amp;A</li>
        <li><code>runAIActionPlan</code> — AI-enhanced action items</li>
      </ul>
      {mcResults && (
        <p style={{ color: "#86efac", fontSize: 13, marginBottom: 0 }}>
          Connected to MC engine — {(mcResults.rate * 100).toFixed(1)}% success,{" "}
          $
          {(mcResults.term.p50 / 1_000_000).toFixed(2)}M median terminal value.
        </p>
      )}
    </div>
  );

  // ── TODO: Replace stub JSX above with this full component ───────────────────
  //
  // import React, { useState, useEffect } from "react";
  //
  // const [health, setHealth]     = useState(null);
  // const [narrative, setNarr]    = useState("");
  // const [loading, setLoading]   = useState(false);
  // const [error, setError]       = useState(null);
  //
  // useEffect(() => {
  //   if (!values || !mcResults) return;
  //   setLoading(true);
  //   Promise.all([
  //     analyzeRetirementHealth(values, mcResults),
  //     generateNarrativeSummary(values, mcResults),
  //   ])
  //     .then(([h, n]) => { setHealth(h); setNarr(n); })
  //     .catch((e) => setError(e.message))
  //     .finally(() => setLoading(false));
  // }, [values, mcResults]);
  //
  // if (loading) return <div>Aira is analyzing your plan…</div>;
  // if (error)   return <div style={{ color: "red" }}>AI error: {error}</div>;
  //
  // return (
  //   <div style={{ padding: "1rem" }}>
  //     {health && (
  //       <div>
  //         <h3>Health Score: {health.score}/100 ({health.grade})</h3>
  //         <p>{health.summary}</p>
  //         <ul>{health.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
  //       </div>
  //     )}
  //     {narrative && <div dangerouslySetInnerHTML={{ __html: narrative }} />}
  //   </div>
  // );
}
