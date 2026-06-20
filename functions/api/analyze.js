/**
 * POST /api/analyze
 * Body: { type, values, mcResults?, question?, history?, cards? }
 * Header (billing mode): Authorization: Bearer <jwt>
 *
 * Dual-mode:
 *   - JWT present  → use server GEMINI_API_KEY, check/deduct D1 credits
 *   - No JWT       → BYOK: use body.apiKey or env.GEMINI_API_KEY (legacy)
 *
 * Required env vars: GEMINI_API_KEY, JWT_SECRET (billing), DB (billing)
 */

import { json, handleOptions, verifyJWT } from "../_shared/jwt.js";

const GEMINI_BASE        = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FAST         = "gemini-2.5-flash";
const MODEL_STANDARD     = "gemini-2.5-flash";
const RAW_TOKENS_PER_CREDIT = 1_000;  // must match src/billing/credits.js
// Refuse calls if balance is below this. Set above the expected max single-call
// cost so a parallel-request overdraft can't open more than one call's worth of
// free spend. Typical Gemini health/narrative call uses ~30-60 credits; 50 here
// caps the worst-case parallel overdraft to ~1 free call's value.
const MIN_CREDITS_GUARD  = 50;

// ─── Gemini helpers ───────────────────────────────────────────────────────────

// usageBucket is a per-request array; callGemini pushes usageMetadata into it.
// This avoids module-level state and is concurrent-request safe.
async function callGemini(apiKey, model, payload, usageBucket) {
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
  const data = await res.json();
  if (data.usageMetadata) usageBucket.push(data.usageMetadata);
  return data;
}

function geminiFnCall(apiKey, model, maxTokens, systemText, userText, fnDecl, usageBucket) {
  return callGemini(apiKey, model, {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    tools: [{ functionDeclarations: [fnDecl] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [fnDecl.name] } },
    generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
  }, usageBucket);
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
  return [
    `SWR: ${swr}% | MC Success: ${mcResults ? (mcResults.rate * 100).toFixed(1) : "N/A"}%`,
    `Portfolio: $${(values.port || 0).toLocaleString()} | Pre-tax: ${preTaxPct}% | Roth: ${rothPct}%`,
    `Age: ${values.currentAge} → Retire: ${values.retireAge} | State: ${values.stateOfResidence || "unknown"}`,
    `Triggered rules: [${(cards || []).map(c => c.id).join(", ")}]`,
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

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleActionPlan(apiKey, values, mcResults, cards, usageBucket) {
  const ctx      = ctxActionPlan(values, mcResults, cards);
  const cardList = cards.map(c => `[${c.id}] ${c.priority.toUpperCase()} | ${c.category}: ${c.action}`).join("\n");

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
    },
    usageBucket
  );

  const toolInput = getFnArgs(res);
  const noteMap   = Object.fromEntries((toolInput.annotated || []).map(a => [a.id, a.aiNote]));
  const newCards  = (toolInput.new_cards || []).slice(0, 2);

  const merged = [
    ...cards.map(c => ({ ...c, aiChecked: true, aiNote: noteMap[c.id] || null })),
    ...newCards.map(c => ({ ...c, id: `ai-${c.category.toLowerCase().replace(/\s+/g, "-")}`, aiGenerated: true, aiChecked: true })),
  ];
  merged.sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[a.priority] - { red: 0, yellow: 1, green: 2 }[b.priority]));
  return { cards: merged };
}

async function handleHealth(apiKey, values, mcResults, usageBucket) {
  const res = await geminiFnCall(apiKey, MODEL_STANDARD, 512,
    "You are Aira. Score this retirement plan 0–100 and list 2–4 specific risk flags.",
    ctxHealth(values, mcResults),
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
    },
    usageBucket
  );
  return getFnArgs(res);
}

async function handleNarrative(apiKey, values, mcResults, usageBucket) {
  const res = await callGemini(apiKey, MODEL_STANDARD, {
    systemInstruction: { parts: [{ text: "You are Aira. Write a 3–5 paragraph retirement narrative in plain English with markdown headers: Overview | Strengths | Risks | Recommended Actions. No legal advice." }] },
    contents: [{ role: "user", parts: [{ text: ctxNarrative(values, mcResults) }] }],
    generationConfig: { maxOutputTokens: 1024 },
  }, usageBucket);
  return { text: getText(res) };
}

async function handleRoth(apiKey, values, usageBucket) {
  const res = await geminiFnCall(apiKey, MODEL_STANDARD, 512,
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
        required: ["assessment", "conversionAdvice", "suggestedAnnualAmount"],
      },
    },
    usageBucket
  );
  return getFnArgs(res);
}

async function handleWithdrawal(apiKey, values, mcResults, usageBucket) {
  const strategies = ["gk","fixed","vanguard","risk","kitces","vpw","cape","endowment","one_n","ninety_five_rule"];
  const res = await geminiFnCall(apiKey, MODEL_FAST, 256,
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
        required: ["recommended", "reason", "projectedRateImprovement"],
      },
    },
    usageBucket
  );
  return getFnArgs(res);
}

async function handleChat(apiKey, values, mcResults, question, history, usageBucket) {
  const contents = [
    ...(history || []).map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: question }] },
  ];
  const res = await callGemini(apiKey, MODEL_STANDARD, {
    systemInstruction: { parts: [{ text: `You are Aira, a fiduciary retirement planning AI. Answer questions about this plan. Be concise and honest about uncertainty. No legal advice.\n\nPLAN:\n${ctxNarrative(values, mcResults)}` }] },
    contents,
    generationConfig: { maxOutputTokens: 768 },
  }, usageBucket);
  return { text: getText(res) };
}

async function handleTimeSensitive(apiKey, values, mcResults, usageBucket) {
  const age       = values.currentAge || 56;
  const retireAge = values.retireAge  || 65;
  const state     = values.stateOfResidence;
  const hasSS     = (values.ssb || 0) > 0 || age > 50;
  const hasPreTax = (values.accounts || []).some(a => a.category === "pretax" && (a.balance || 0) > 0);

  const topics = [
    "IRS 401k IRA HSA contribution limits catch-up amounts 2026",
    "IRS federal income tax brackets standard deduction 2026",
    "long-term capital gains tax rates income thresholds 2026",
    "SECURE 2.0 Act provisions effective 2025 2026 key retirement changes",
    "current US CPI inflation rate Federal Reserve interest rate 2026",
    "10-year Treasury yield I-Bond composite rate 2026",
    "safe withdrawal rate 4 percent rule research update 2025 2026",
    ...(hasSS ? [
      "Social Security COLA 2026 benefit increase announcement",
      "Social Security trust fund solvency depletion projection 2026",
    ] : []),
    ...((age >= 58 || retireAge <= 67) ? [
      "Medicare Part B premium 2026 IRMAA income surcharge thresholds",
    ] : []),
    ...(hasPreTax && (age >= 68 || retireAge >= 70) ? [
      "required minimum distribution RMD age 73 rules 2026 SECURE 2.0",
    ] : []),
    "Roth IRA conversion strategy 2026 tax bracket optimization",
    ...(state ? [
      `${state} state income tax retirement income IRA 401k pension Social Security exemption 2026`,
      `${state} property tax exemption senior retiree 2026`,
    ] : []),
  ];

  const profileCtx = [
    `Age: ${age} | Retire: ${retireAge} | State: ${state || "unknown"}`,
    `Portfolio: $${(values.port || 0).toLocaleString()} | Spending: $${(values.sp || 0).toLocaleString()}/yr`,
    `Filing: ${values.filingStatus || "mfj"} | SS: $${(values.ssb || 0).toLocaleString()}/yr at ${values.ssAge}`,
    `MC success: ${mcResults ? (mcResults.rate * 100).toFixed(1) : "N/A"}%`,
  ].join("\n");

  const prompt = `You are Aira, a fiduciary retirement planning AI.\n\nUSER PROFILE:\n${profileCtx}\n\nUse Google Search to find CURRENT information on these topics. Only create a card when you find specific current numbers actionable for this user.\n\nSEARCH TOPICS:\n${topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nReturn ONLY a valid JSON array between <cards> and </cards> tags:\n[{ "priority": "red|yellow|green", "category": "string", "action": "string", "reason": "string", "deadline": "string", "aiNote": "current number/threshold found", "source": "website name" }]\n\nRules: real current numbers only, max 12 cards, skip topics with only general knowledge.\n\n<cards>\n</cards>`;

  const res = await callGemini(apiKey, MODEL_STANDARD, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools:    [{ google_search: {} }],
    generationConfig: {
      maxOutputTokens: 4096,
      thinkingConfig:  { thinkingBudget: 0 },
    },
  }, usageBucket);

  const text = res.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  console.log("[timesensitive] raw text length:", text.length, "| finish:", res.candidates?.[0]?.finishReason);

  // Primary: look for <cards>...</cards> wrapper
  const tagged = text.match(/<cards>([\s\S]*?)<\/cards>/);
  // Fallback: look for a bare JSON array if the model skipped the wrapper
  const raw = tagged?.[1]?.trim() ?? text.match(/\[\s*\{[\s\S]*?\}\s*\]/)?.[0];

  if (!raw) {
    console.warn("[timesensitive] no card JSON found in response");
    return { cards: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    const cards  = (Array.isArray(parsed) ? parsed : []).map((c, i) => ({
      ...c, id: `live-${i}`, isLiveData: true, aiGenerated: true,
    }));
    console.log("[timesensitive] parsed", cards.length, "cards");
    return { cards };
  } catch (e) {
    console.warn("[timesensitive] JSON parse failed:", e.message, "| raw snippet:", raw.slice(0, 200));
    return { cards: [] };
  }
}

// ─── D1 credit deduction ──────────────────────────────────────────────────────

async function deductD1Credits(db, customerId, rawTokens) {
  const creditCost = Math.ceil(rawTokens / RAW_TOKENS_PER_CREDIT);
  if (creditCost <= 0) return { creditsUsed: 0, creditsRemaining: null, txnId: null };

  // Audit fix C4: atomic conditional UPDATE. The WHERE clause guarantees we
  // only deduct when balance covers the cost. meta.changes === 0 means a
  // concurrent request already drained the balance below the threshold; we
  // record the overdraft as an audit row so reconciliation can detect drift
  // between customer.credits and SUM(credit_transactions.amount).
  const upd = await db.prepare(`
    UPDATE customers
    SET credits    = credits - ?,
        updated_at = unixepoch()
    WHERE stripe_customer_id = ? AND credits >= ?
  `).bind(creditCost, customerId, creditCost).run();

  const deducted = upd.meta?.changes === 1;

  // Capture last_row_id so AI-2 can reference this deduction row in its refund.
  const ins = await db.prepare(`
    INSERT INTO credit_transactions (customer_id, type, amount, raw_tokens)
    VALUES (?, ?, ?, ?)
  `).bind(
    customerId,
    deducted ? "deduct" : "overdraft",
    -creditCost,
    rawTokens
  ).run();

  if (!deducted) {
    console.warn(`[analyze] overdraft for ${customerId}: cost=${creditCost} raw_tokens=${rawTokens}`);
  }

  const row = await db.prepare(
    "SELECT credits FROM customers WHERE stripe_customer_id = ?"
  ).bind(customerId).first();

  return {
    creditsUsed: creditCost,
    creditsRemaining: row?.credits ?? null,
    txnId: ins.meta?.last_row_id ?? null,
  };
}

// ─── AI-2: Refund on empty/unusable result ────────────────────────────────────

// Returns true when Gemini responded but with no usable structured data,
// meaning the user was charged tokens but got nothing actionable.
function isEmptyResult(type, result) {
  if (!result) return true;
  switch (type) {
    case "health":        return !result.score && !result.grade;
    case "narrative":     return !result.text;
    case "roth":          return !result.assessment;
    case "withdrawal":    return !result.recommended;
    case "chat":          return !result.text;
    case "timesensitive": return !result.cards || result.cards.length === 0;
    // actionplan always echoes the original cards back — conservatively don't refund
    default:              return false;
  }
}

// Issues a compensating credit for a failed AI call. Keyed to the deduction
// transaction id (stored in stripe_session_id column) so retries are idempotent.
async function refundD1Credits(db, customerId, creditCost, deductTxnId) {
  if (creditCost <= 0 || !deductTxnId) return;
  const ref = String(deductTxnId);

  const existing = await db.prepare(
    "SELECT id FROM credit_transactions WHERE customer_id = ? AND type = 'refund' AND stripe_session_id = ?"
  ).bind(customerId, ref).first();
  if (existing) {
    console.log(`[analyze] AI-2 refund already issued for deduct txn ${ref}`);
    return;
  }

  await db.batch([
    db.prepare(
      "UPDATE customers SET credits = credits + ?, updated_at = unixepoch() WHERE stripe_customer_id = ?"
    ).bind(creditCost, customerId),
    db.prepare(
      "INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id) VALUES (?, 'refund', ?, ?)"
    ).bind(customerId, creditCost, ref),
  ]);
  console.log(`[analyze] AI-2 refunded ${creditCost} credits to ${customerId} (deduct txn ${ref})`);
}

// ─── Main handler ────────────────────────────────────────────────────────────

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  // ── Auth: try to extract JWT for billing mode ──────────────────────────
  const authHeader = request.headers.get("Authorization") || "";
  let customerId  = null;

  if (authHeader.startsWith("Bearer ") && env.JWT_SECRET) {
    try {
      const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
      customerId = payload.customerId;
    } catch {
      return json({ error: "Invalid or expired token" }, 401);
    }
  }

  // ── API key: billing uses server key, BYOK uses request/env key ───────────
  const apiKey = customerId
    ? env.GEMINI_API_KEY
    : (body.apiKey || env.GEMINI_API_KEY);

  if (!apiKey) {
    return json({ error: "No API key — add your Gemini API key in Profile → Assumptions" }, 500);
  }

  // ── Pre-call balance check (billing mode only) ─────────────────────────
  if (customerId && env.DB) {
    const customer = await env.DB.prepare(
      "SELECT credits, status FROM customers WHERE stripe_customer_id = ?"
    ).bind(customerId).first();

    // Suspended-account check MUST precede the balance check: a disputed account
    // that is also drained should see "Account suspended" (403), not the
    // misleading "Insufficient credits" (402).
    if (customer && customer.status === "disputed") {
      return json({ error: "Account suspended. Please contact support." }, 403);
    }
    if (!customer || customer.credits < MIN_CREDITS_GUARD) {
      return json({ error: "Insufficient AiRA credits. Please purchase a credit pack to continue." }, 402);
    }
  }

  const { type, values, mcResults, question, history, cards } = body;
  if (!type || !values) return json({ error: "Missing type or values" }, 400);

  // ── Gemini call ──────────────────────────────────────────────────
  const usageBucket = [];
  let result;

  try {
    switch (type) {
      case "actionplan":    result = await handleActionPlan(apiKey, values, mcResults, cards || [], usageBucket); break;
      case "health":        result = await handleHealth(apiKey, values, mcResults, usageBucket);                  break;
      case "narrative":     result = await handleNarrative(apiKey, values, mcResults, usageBucket);               break;
      case "roth":          result = await handleRoth(apiKey, values, usageBucket);                               break;
      case "withdrawal":    result = await handleWithdrawal(apiKey, values, mcResults, usageBucket);              break;
      case "chat":          result = await handleChat(apiKey, values, mcResults, question, history, usageBucket); break;
      case "timesensitive": result = await handleTimeSensitive(apiKey, values, mcResults, usageBucket);           break;
      default:              return json({ error: `Unknown type: ${type}` }, 400);
    }
  } catch (err) {
    console.error(`[analyze] ${type} failed:`, err.message);
    return json({ error: err.message }, 502);
  }

  // ── Post-call credit deduction (billing mode only) ────────────────────
  let creditsUsed = 0;
  let creditsRemaining = null;
  let deductTxnId = null;
  if (customerId && env.DB && usageBucket.length > 0) {
    const rawTokens = usageBucket.reduce((sum, u) => sum + (u.totalTokenCount || 0), 0);
    try {
      ({ creditsUsed, creditsRemaining, txnId: deductTxnId } = await deductD1Credits(env.DB, customerId, rawTokens));
    } catch (e) {
      console.error("[analyze] D1 deduction failed:", e.message);
    }
  }

  // ── AI-2: Refund if result is empty/unusable ──────────────────────────
  let refunded = false;
  if (customerId && env.DB && creditsUsed > 0 && deductTxnId && isEmptyResult(type, result)) {
    try {
      await refundD1Credits(env.DB, customerId, creditsUsed, deductTxnId);
      creditsRemaining = (creditsRemaining ?? 0) + creditsUsed;
      refunded = true;
    } catch (e) {
      console.error("[analyze] AI-2 refund failed:", e.message);
    }
  }

  return json({
    ...result,
    _credits_used:      refunded ? 0 : creditsUsed,
    _credits_remaining: creditsRemaining,
    ...(refunded && { _refunded: true }),
  });
}
