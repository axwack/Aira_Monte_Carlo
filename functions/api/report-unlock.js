import { json, handleOptions, verifyJWT } from "../_shared/jwt.js";
import { canonicalCustomerId } from "../_shared/customers.js";

const DEFAULT_REPORT_COST_CREDITS = 250;
const UNLOCK_WINDOW_MS = 24 * 60 * 60 * 1000;

export function onRequestOptions() {
  return handleOptions();
}

async function authenticate(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !env.JWT_SECRET) {
    return { error: json({ error: "Authorization required" }, 401) };
  }
  let payload;
  try {
    payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET);
  } catch {
    return { error: json({ error: "Invalid or expired token" }, 401) };
  }
  const customerId = env.DB ? await canonicalCustomerId(env.DB, payload.customerId) : payload.customerId;
  return { customerId };
}

async function currentUnlockWindow(db, customerId) {
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
    console.warn("[report-unlock] existing-window check failed:", e.message);
  }

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

  let result;
  try {
    result = await deductReportCredits(env.DB, customerId, cost);
  } catch (e) {
    console.error("[report-unlock] D1 deduction failed:", e.message);
    return json({ error: "Database error: " + e.message }, 500);
  }

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
