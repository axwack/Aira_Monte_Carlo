/**
 * netlify/functions/analyze.js
 *
 * Serverless proxy between the browser and the Anthropic API.
 * Your ANTHROPIC_API_KEY never leaves Netlify's servers.
 *
 * Set the key once in the Netlify dashboard:
 *   Site → Environment variables → Add variable → ANTHROPIC_API_KEY
 *
 * Local dev (requires Netlify CLI):
 *   npm install -g netlify-cli
 *   Add ANTHROPIC_API_KEY to a local .env file (git-ignored)
 *   Run: netlify dev          ← starts React + functions together on :8888
 *
 * Endpoint: POST /.netlify/functions/analyze
 * Body: { type, values, mcResults, question?, history?, existingActions? }
 * Types: "health" | "narrative" | "withdrawal" | "roth" | "chat" | "actionplan"
 *
 * Timeout note: Netlify free tier = 10s. effort:"medium" keeps Claude well under that.
 * Upgrade to a paid plan and switch effort to "high" for deeper analysis.
 */

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-opus-4-7";
const EFFORT = "medium"; // bump to "high" on Netlify paid plan

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// ─── Profile context builder (mirrors src/AI-analysis.js) ────────────────────
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

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleHealth(client, values, mcResults) {
  const profileCtx = buildProfileContext(values, mcResults);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORT,
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

async function handleNarrative(client, values, mcResults) {
  const profileCtx = buildProfileContext(values, mcResults);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT },
    system: "You are Aira, a fiduciary retirement planning AI. Write in plain English. Format with markdown headers. Sections: Overview | Strengths | Risks | Recommended Actions. Never give legal or tax advice.",
    messages: [{ role: "user", content: `Write a 3–5 paragraph retirement plan narrative:\n\n${profileCtx}` }],
  });

  return { text: response.content.find((b) => b.type === "text").text };
}

async function handleWithdrawal(client, values, mcResults) {
  const profileCtx = buildProfileContext(values, mcResults);
  const current = values.withdrawalStrategy || "gk";
  const strategies = ["gk","fixed","vanguard","risk","kitces","vpw","cape","endowment","one_n","ninety_five_rule"];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORT,
      format: {
        type: "json_schema",
        json_schema: {
          name: "withdrawal_recommendation",
          schema: {
            type: "object",
            properties: {
              recommended:              { type: "string", enum: strategies },
              reason:                   { type: "string" },
              projectedRateImprovement: { type: "string" },
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

async function handleRoth(client, values, mcResults) {
  const profileCtx = buildProfileContext(values, mcResults);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 768,
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORT,
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

async function handleChat(client, values, mcResults, question, history = []) {
  const profileCtx = buildProfileContext(values, mcResults);

  const systemPrompt = [
    "You are Aira, a fiduciary retirement planning AI assistant.",
    "Answer questions about the user's specific retirement plan shown below.",
    "Be concise, honest about uncertainty, and never give legal or tax advice.",
    "",
    "USER PLAN CONTEXT:",
    profileCtx,
  ].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT },
    system: systemPrompt,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ],
  });

  return { text: response.content.find((b) => b.type === "text").text };
}

async function handleActionPlan(client, values, mcResults, existingActions = []) {
  const profileCtx = buildProfileContext(values, mcResults);
  const existingSummary = existingActions
    .map((a) => `[${a.priority.toUpperCase()}] ${a.category}: ${a.action}`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORT,
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
  return parsed;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured. Add it in Netlify → Site → Environment variables." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { type, values, mcResults, question, history, existingActions } = body;

  if (!type || !values) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing required fields: type, values" }) };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    let result;
    switch (type) {
      case "health":      result = await handleHealth(client, values, mcResults);                          break;
      case "narrative":   result = await handleNarrative(client, values, mcResults);                       break;
      case "withdrawal":  result = await handleWithdrawal(client, values, mcResults);                      break;
      case "roth":        result = await handleRoth(client, values, mcResults);                            break;
      case "chat":        result = await handleChat(client, values, mcResults, question, history);         break;
      case "actionplan":  result = await handleActionPlan(client, values, mcResults, existingActions);     break;
      default:
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    console.error("Anthropic API error:", err.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
