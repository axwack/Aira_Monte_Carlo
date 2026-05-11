/**
 * functions/api/analyze.js — Cloudflare Pages Function
 *
 * Route: POST /api/analyze
 * Set GEMINI_API_KEY in Cloudflare Dashboard → Settings → Environment Variables.
 */

const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FAST     = "gemini-2.0-flash";
const MODEL_STANDARD = "gemini-2.0-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

async function callGemini(apiKey, model, payload) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }
  return res.json();
}

function geminiFnCall(apiKey, model, maxTokens, systemText, userText, fnDecl) {
  return callGemini(apiKey, model, {
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

// ─── Context builders ─────────────────────────────────────────────────────────

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

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleActionPlan(apiKey, values, mcResults, cards) {
  const ctx = ctxActionPlan(values, mcResults, cards);
  const cardList = cards.map(c =>
    `[${c.id}] ${c.priority.toUpperCase()} | ${c.category}: ${c.action}`
  ).join("\n");

  const res = await geminiFnCall(apiKey, MODEL_FAST, 1024,
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
              required: ["id", "aiNote"],
            },
          },
          new_cards: {
            type: "array",
            items: {
              type: "object",
              properties: {
                priority: { type: "string", enum: ["red", "yellow", "green"] },
                category: { type: "string" },
                action:   { type: "string" },
                reason:   { type: "string" },
                deadline: { type: "string" },
                aiNote:   { type: "string" },
              },
              required: ["priority", "category", "action", "reason", "deadline", "aiNote"],
            },
          },
        },
        required: ["annotated", "new_cards"],
      },
    }
  );

  const toolInput = getFnArgs(res);
  const noteMap = Object.fromEntries((toolInput.annotated || []).map(a => [a.id, a.aiNote]));
  const newCards = (toolInput.new_cards || []).slice(0, 2);

  const merged = [
    ...cards.map(c => ({ ...c, aiNote: noteMap[c.id] || null })),
    ...newCards.map(c => ({ ...c, id: `ai-${c.category.toLowerCase().replace(/\s+/g, "-")}`, aiGenerated: true })),
  ];
  merged.sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[a.priority] - { red: 0, yellow: 1, green: 2 }[b.priority]));
  return { cards: merged };
}

async function handleHealth(apiKey, values, mcResults) {
  const ctx = ctxHealth(values, mcResults);
  const res = await geminiFnCall(apiKey, MODEL_STANDARD, 512,
    "You are Aira. Score this retirement plan 0–100 and list 2–4 specific risk flags.",
    ctx,
    {
      name: "health_score",
      description: "Score a retirement plan",
      parameters: {
        type: "object",
        properties: {
          score:   { type: "number" },
          grade:   { type: "string", enum: ["A", "B", "C", "D", "F"] },
          summary: { type: "string" },
          flags:   { type: "array", items: { type: "string" } },
        },
        required: ["score", "grade", "summary", "flags"],
      },
    }
  );
  return getFnArgs(res);
}

async function handleNarrative(apiKey, values, mcResults) {
  const ctx = ctxNarrative(values, mcResults);
  const res = await callGemini(apiKey, MODEL_STANDARD, {
    systemInstruction: { parts: [{ text: "You are Aira. Write a 3–5 paragraph retirement narrative in plain English with markdown headers: Overview | Strengths | Risks | Recommended Actions. No legal advice." }] },
    contents: [{ role: "user", parts: [{ text: ctx }] }],
    generationConfig: { maxOutputTokens: 1024 },
  });
  return { text: getText(res) };
}

async function handleRoth(apiKey, values) {
  const ctx = ctxRoth(values);
  const res = await geminiFnCall(apiKey, MODEL_STANDARD, 512,
    "You are Aira. Evaluate Roth conversion strategy. Consider IRMAA tiers, SECURE 2.0 RMD ages, bracket management. No tax advice.",
    ctx,
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
        required: ["assessment", "conversionAdvice", "suggestedAnnualAmount"],
      },
    }
  );
  return getFnArgs(res);
}

async function handleWithdrawal(apiKey, values, mcResults) {
  const ctx = ctxWithdrawal(values, mcResults);
  const strategies = ["gk","fixed","vanguard","risk","kitces","vpw","cape","endowment","one_n","ninety_five_rule"];
  const res = await geminiFnCall(apiKey, MODEL_FAST, 256,
    `You are Aira. Pick the best withdrawal strategy. Available: ${strategies.join(", ")}.`,
    ctx,
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
        required: ["recommended", "reason", "projectedRateImprovement"],
      },
    }
  );
  return getFnArgs(res);
}

async function handleChat(apiKey, values, mcResults, question, history) {
  const ctx = ctxNarrative(values, mcResults);
  const contents = [
    ...(history || []).map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: question }] },
  ];
  const res = await callGemini(apiKey, MODEL_STANDARD, {
    systemInstruction: { parts: [{ text: `You are Aira, a fiduciary retirement planning AI. Answer questions about this plan. Be concise and honest about uncertainty. No legal advice.\n\nPLAN:\n${ctx}` }] },
    contents,
    generationConfig: { maxOutputTokens: 768 },
  });
  return { text: getText(res) };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const apiKey = body.apiKey || env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "No API key — add your Gemini API key in Profile → Assumptions" }, 500);
  }

  const { type, values, mcResults, question, history, cards } = body;
  if (!type || !values) return json({ error: "Missing type or values" }, 400);

  try {
    switch (type) {
      case "actionplan": return json(await handleActionPlan(apiKey, values, mcResults, cards || []));
      case "health":     return json(await handleHealth(apiKey, values, mcResults));
      case "narrative":  return json(await handleNarrative(apiKey, values, mcResults));
      case "roth":       return json(await handleRoth(apiKey, values));
      case "withdrawal": return json(await handleWithdrawal(apiKey, values, mcResults));
      case "chat":       return json(await handleChat(apiKey, values, mcResults, question, history));
      default:           return json({ error: `Unknown type: ${type}` }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 502);
  }
}
