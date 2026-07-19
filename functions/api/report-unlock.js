/**
 * POST /api/report-unlock
 * Header: Authorization: Bearer <jwt>  (same auth model as /api/analyze)
 * Body:   {} (no payload needed — this is a flat-fee unlock, not a token-metered call)
 *
 * Unlocks the printable CFP report for 24 hours by deducting a flat credit
 * fee. Mirrors /api/analyze's atomic deduction pattern exactly (see
 * deductD1Credits in analyze.js): a conditional `WHERE credits >= ?` UPDATE
 * so concurrent requests can't overdraft, plus a credit_transactions audit
 * row for every attempt (deduct or overdraft).
 *
 * REPORT_COST_CREDITS default reasoning:
 *   CREDIT_PACKS (src/billing/credits.js) price a Starter Pack at 5,000
 *   credits for $5 — i.e. $1 ≈ 1,000 credits. The report is 100% client-
 *   computed (no AI/token cost), so it should cost a meaningful-but-small
 *   slice of a pack rather than a per-token rate. 250 credits (~$0.25,
 *   5% of a Starter Pack) means one $5 pack buys ~20 report unlocks —
 *   a "coffee-money" fee that still gates a valuable printable artifact.
 *   Keep in sync with src/billing/credits.js REPORT_COST_CREDITS.
 *
 * unlockedUntil = now + 24h. This endpoint is intentionally stateless
 * beyond the txn record — idempotency (not re-charging within the 24h
 * window) is tracked CLIENT-side (see isReportUnlocked() in
 * src/billing/credits.js). Calling this endpoint twice always charges
 * twice; the client is responsible for not calling it while still unlocked.
 *
 * Required env vars: JWT_SECRET, DB. Optional: REPORT_COST_CREDITS (integer
 * override for the flat fee).
 */

import { json, handleOptions, verifyJWT } from "../_shared/jwt.js";

// Keep in sync with src/billing/credits.js REPORT_COST_CREDITS.
const DEFAULT_REPORT_COST_CREDITS = 250;
const UNLOCK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export function onRequestOptions() {
  return handleOptions();
}

// Same atomic pattern as analyze.js's deductD1Credits, adapted for a flat
// fee instead of a token-derived cost (no rawTokens to record).
async function deductReportCredits(db, customerId, cost) {
  const upd = await db.prepare(`
    UPDATE customers
    SET credits    = credits - ?,
        updated_at = unixepoch()
    WHERE stripe_customer_id = ? AND credits >= ?
  `).bind(cost, customerId, cost).run();

  const deducted = upd.meta?.changes === 1;

  const ins = await db.prepare(`
    INSERT INTO credit_transactions (customer_id, type, amount, raw_tokens)
    VALUES (?, ?, ?, ?)
  `).bind(
    customerId,
    deducted ? "deduct" : "overdraft",
    -cost,
    null
  ).run();

  if (!deducted) {
    console.warn(`[report-unlock] overdraft for ${customerId}: cost=${cost}`);
  }

  const row = await db.prepare(
    "SELECT credits FROM customers WHERE stripe_customer_id = ?"
  ).bind(customerId).first();

  return {
    deducted,
    creditsRemaining: row?.credits ?? null,
    txnId: ins.meta?.last_row_id ?? null,
  };
}

export async function onRequestPost({ request, env }) {
  // ── Auth: same shape/errors as analyze.js ──────────────────────────────
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !env.JWT_SECRET) {
    return json({ error: "Authorization required" }, 401);
  }

  let customerId;
  try {
    const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
    customerId = payload.customerId;
  } catch {
    return json({ error: "Invalid or expired token" }, 401);
  }

  if (!env.DB) return json({ error: "D1 database not bound — check Pages bindings" }, 500);

  const cost = Number(env.REPORT_COST_CREDITS) > 0
    ? Number(env.REPORT_COST_CREDITS)
    : DEFAULT_REPORT_COST_CREDITS;

  // ── Pre-check: same suspended/insufficient shape as analyze.js ────────
  let customer;
  try {
    customer = await env.DB.prepare(
      "SELECT credits, status FROM customers WHERE stripe_customer_id = ?"
    ).bind(customerId).first();
  } catch (e) {
    console.error("[report-unlock] D1 lookup failed:", e.message);
    return json({ error: "Database error: " + e.message }, 500);
  }

  if (customer && customer.status === "disputed") {
    return json({ error: "Account suspended. Please contact support." }, 403);
  }
  if (!customer || customer.credits < cost) {
    return json({
      error: "Insufficient AiRA credits. Please purchase a credit pack to continue.",
      creditsRemaining: customer?.credits ?? 0,
    }, 402);
  }

  // ── Atomic deduction ────────────────────────────────────────────────────
  let result;
  try {
    result = await deductReportCredits(env.DB, customerId, cost);
  } catch (e) {
    console.error("[report-unlock] D1 deduction failed:", e.message);
    return json({ error: "Database error: " + e.message }, 500);
  }

  // A concurrent request may have drained the balance between the pre-check
  // and the atomic UPDATE above — surface the same 402 shape in that case.
  if (!result.deducted) {
    return json({
      error: "Insufficient AiRA credits. Please purchase a credit pack to continue.",
      creditsRemaining: result.creditsRemaining ?? 0,
    }, 402);
  }

  return json({
    ok: true,
    creditsUsed: cost,
    creditsRemaining: result.creditsRemaining,
    unlockedUntil: new Date(Date.now() + UNLOCK_WINDOW_MS).toISOString(),
  });
}
