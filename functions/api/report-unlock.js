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
 * unlockedUntil = now + 24h, and the window is SERVER-authoritative: it is
 * derived from the ledger (latest 'report_unlock' row's created_at + 24h), not
 * from a localStorage flag. Idempotency used to be the client's job, which was
 * wrong in both directions — a customer who cleared localStorage got charged
 * 250 credits a second time, and anyone who hand-set the flag read the report
 * for free. POSTing while a window is still open now returns that window
 * without charging again.
 *
 * GET returns the current window without charging, so the UI can ask the server
 * whether the report is unlocked instead of trusting the browser.
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

// Authenticate and return the customerId, or a Response to return as-is.
async function authenticate(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !env.JWT_SECRET) {
    return { error: json({ error: "Authorization required" }, 401) };
  }
  try {
    const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
    return { customerId: payload.customerId };
  } catch {
    return { error: json({ error: "Invalid or expired token" }, 401) };
  }
}

/**
 * The active unlock window, derived from the ledger rather than the client.
 * Returns { unlocked, unlockedUntil } where unlockedUntil is an ISO string or
 * null. A 'report_unlock' row younger than UNLOCK_WINDOW_MS means still open.
 */
async function currentUnlockWindow(db, customerId) {
  // A DIRECT PURCHASE NEVER EXPIRES.
  //
  // The 24h window is right for a credit spend — credits meter AI usage, and the
  // report is a slice of that budget. It is wrong for someone who bought the
  // report as a product: nobody expects a document they paid for to stop opening
  // tomorrow. Checked first and separately so a purchase can never be aged out by
  // the window logic below.
  //
  // Also deliberately independent of the credit balance: a report buyer may hold
  // zero credits and must still be able to open what they bought.
  const bought = await db.prepare(`
    SELECT id FROM credit_transactions
    WHERE customer_id = ? AND type = 'report_purchase' LIMIT 1
  `).bind(customerId).first();
  if (bought?.id) return { unlocked: true, unlockedUntil: null, permanent: true };

  const row = await db.prepare(`
    SELECT created_at FROM credit_transactions
    WHERE customer_id = ? AND type = 'report_unlock'
    ORDER BY created_at DESC LIMIT 1
  `).bind(customerId).first();

  if (!row?.created_at) return { unlocked: false, unlockedUntil: null };

  const untilMs = row.created_at * 1000 + UNLOCK_WINDOW_MS;
  return untilMs > Date.now()
    ? { unlocked: true,  unlockedUntil: new Date(untilMs).toISOString() }
    : { unlocked: false, unlockedUntil: null };
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
    // 'report_unlock' rather than the generic 'deduct', so report spend is
    // distinguishable from AI spend in the ledger AND so the 24h window can be
    // derived from it. An overdraft stays 'overdraft' — no window was granted,
    // and counting it as one would hand out a free unlock.
    deducted ? "report_unlock" : "overdraft",
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

/**
 * GET /api/report-unlock — read the current window without charging.
 * The UI calls this so "is the report unlocked?" is answered by the ledger
 * rather than by a localStorage flag the user can edit.
 */
export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;
  if (!env.DB) return json({ error: "D1 database not bound — check Pages bindings" }, 500);

  try {
    const window = await currentUnlockWindow(env.DB, auth.customerId);
    return json(window);
  } catch (e) {
    console.error("[report-unlock] window lookup failed:", e.message);
    return json({ error: "Database error: " + e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;
  const customerId = auth.customerId;

  if (!env.DB) return json({ error: "D1 database not bound — check Pages bindings" }, 500);

  const cost = Number(env.REPORT_COST_CREDITS) > 0
    ? Number(env.REPORT_COST_CREDITS)
    : DEFAULT_REPORT_COST_CREDITS;

  // ── Already unlocked? Return the open window instead of charging again ──
  // Previously this endpoint charged on every call and relied on the client not
  // to ask twice, so a customer who cleared localStorage (or opened the report
  // on a second device) paid 250 credits again for access they already had.
  try {
    const open = await currentUnlockWindow(env.DB, customerId);
    if (open.unlocked) {
      return json({
        ok: true,
        creditsUsed: 0,
        alreadyUnlocked: true,
        creditsRemaining: null,
        unlockedUntil: open.unlockedUntil,
      });
    }
  } catch (e) {
    // Non-fatal: if this read fails we fall through and charge, which is the
    // pre-existing behavior. Better to risk a re-charge than to deny access.
    console.warn("[report-unlock] existing-window check failed:", e.message);
  }

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
