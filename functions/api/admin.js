/**
 * POST /api/admin
 * Authorization: Bearer <ADMIN_SECRET>
 * Body: { action, ...params }
 *
 * Hidden admin endpoint for testing the Stripe billing integration.
 * Gated by ADMIN_SECRET env var — never expose in client code.
 *
 * Actions:
 *   ping             — verify the admin secret works
 *   stripe-ping      — test Stripe API connectivity (accepts stripeKey override)
 *   grant-credits    — write credits directly to D1 (no Stripe required)
 *   simulate-purchase — full simulation: fake customer + credits + issue JWT
 *   inspect          — read D1 state for a customer
 *   issue-jwt        — mint a fresh JWT for a known customerId
 *
 * Required env vars: ADMIN_SECRET, STRIPE_SECRET_KEY (optional override), JWT_SECRET, DB
 */

import { json, handleOptions, signJWT, stripeGet } from "../_shared/jwt.js";

const JWT_TTL_SECONDS = 30 * 24 * 3600;

const PACK_CREDITS = {
  starter: 5_000,
  value:   10_000,
  pro:     15_000,
};

// Derive a stable fake Stripe customer ID from an email for simulation
function fakeCustomerId(email) {
  // cus_ADMIN_ prefix makes it visually distinct from real Stripe IDs
  const local = email.toLowerCase().split("@")[0].replace(/[^a-z0-9]/g, "_").slice(0, 16);
  return `cus_ADMIN_${local}`;
}

function fakeSessionId() {
  return `cs_admin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!env.ADMIN_SECRET) {
    return json({ ok: false, error: "ADMIN_SECRET not configured on this deployment" }, 503);
  }
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== env.ADMIN_SECRET) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const { action } = body;

  // ── ping ─────────────────────────────────────────────────────────────────
  if (action === "ping") {
    return json({
      ok: true,
      message: "Admin access confirmed",
      env: {
        hasStripeKey:    !!env.STRIPE_SECRET_KEY,
        hasJwtSecret:    !!env.JWT_SECRET,
        hasDb:           !!env.DB,
        stripeKeyPrefix: env.STRIPE_SECRET_KEY ? env.STRIPE_SECRET_KEY.slice(0, 12) + "…" : null,
      },
    });
  }

  // ── stripe-ping ───────────────────────────────────────────────────────────
  if (action === "stripe-ping") {
    const sk = body.stripeKey || env.STRIPE_SECRET_KEY;
    if (!sk) return json({ ok: false, error: "No Stripe key available (set STRIPE_SECRET_KEY or pass stripeKey)" }, 400);
    try {
      const account = await stripeGet(sk, "/account");
      return json({
        ok: true,
        accountId:   account.id,
        displayName: account.display_name || account.settings?.dashboard?.display_name,
        livemode:    account.livemode,
        keyPrefix:   sk.slice(0, 12) + "…",
      });
    } catch (e) {
      return json({ ok: false, error: e.message }, 502);
    }
  }

  // ── grant-credits ─────────────────────────────────────────────────────────
  if (action === "grant-credits") {
    const { email, customerId: explicitId, credits = 5_000 } = body;
    if (!email && !explicitId) return json({ ok: false, error: "Provide email or customerId" }, 400);
    if (!env.DB)               return json({ ok: false, error: "D1 not bound" }, 500);

    const customerId = explicitId || fakeCustomerId(email);
    const sessionId  = fakeSessionId();

    try {
      // Idempotency: each sessionId can only be credited once
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO customers (stripe_customer_id, email, credits)
          VALUES (?, ?, ?)
          ON CONFLICT(stripe_customer_id) DO UPDATE SET
            email      = COALESCE(excluded.email, email),
            credits    = credits + excluded.credits,
            updated_at = unixepoch()
        `).bind(customerId, email || null, credits),
        env.DB.prepare(`
          INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
          VALUES (?, 'free_grant', ?, ?)
        `).bind(customerId, credits, sessionId),
      ]);
      const row = await env.DB.prepare(
        "SELECT credits FROM customers WHERE stripe_customer_id = ?"
      ).bind(customerId).first();
      return json({ ok: true, customerId, creditsGranted: credits, newBalance: row?.credits ?? credits });
    } catch (e) {
      return json({ ok: false, error: "D1 error: " + e.message }, 500);
    }
  }

  // ── simulate-purchase ─────────────────────────────────────────────────────
  // Creates a fake customer in D1, credits the chosen pack, and issues a JWT
  // so the full client-side billing flow can be exercised without a real payment.
  if (action === "simulate-purchase") {
    const { email, packId = "starter" } = body;
    if (!email)   return json({ ok: false, error: "email required" }, 400);
    if (!env.DB)  return json({ ok: false, error: "D1 not bound" }, 500);
    if (!env.JWT_SECRET) return json({ ok: false, error: "JWT_SECRET not configured" }, 500);

    const credits    = PACK_CREDITS[packId] ?? PACK_CREDITS.starter;
    const customerId = fakeCustomerId(email);
    const sessionId  = fakeSessionId();

    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO customers (stripe_customer_id, email, credits)
          VALUES (?, ?, ?)
          ON CONFLICT(stripe_customer_id) DO UPDATE SET
            email      = COALESCE(excluded.email, email),
            credits    = credits + excluded.credits,
            updated_at = unixepoch()
        `).bind(customerId, email, credits),
        env.DB.prepare(`
          INSERT INTO credit_transactions (customer_id, type, amount, stripe_session_id)
          VALUES (?, 'purchase', ?, ?)
        `).bind(customerId, credits, sessionId),
      ]);
      const token = await signJWT(
        { customerId, exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS },
        env.JWT_SECRET
      );
      const row = await env.DB.prepare(
        "SELECT credits FROM customers WHERE stripe_customer_id = ?"
      ).bind(customerId).first();
      return json({
        ok:         true,
        customerId,
        packId,
        credits,
        balance:    row?.credits ?? credits,
        jwt:        token,
        note:       "Store this JWT in localStorage under key 'airaJWT.v1' to activate billing in the browser",
      });
    } catch (e) {
      return json({ ok: false, error: "D1 error: " + e.message }, 500);
    }
  }

  // ── inspect ───────────────────────────────────────────────────────────────
  if (action === "inspect") {
    const { email, customerId: explicitId } = body;
    if (!email && !explicitId) return json({ ok: false, error: "Provide email or customerId" }, 400);
    if (!env.DB)               return json({ ok: false, error: "D1 not bound" }, 500);

    const customerId = explicitId || fakeCustomerId(email);
    try {
      const customer = await env.DB.prepare(
        "SELECT * FROM customers WHERE stripe_customer_id = ?"
      ).bind(customerId).first();
      if (!customer) return json({ ok: true, found: false, customerId });

      const txns = await env.DB.prepare(
        "SELECT id, type, amount, stripe_session_id, created_at FROM credit_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20"
      ).bind(customerId).all();
      return json({ ok: true, found: true, customer, transactions: txns.results });
    } catch (e) {
      return json({ ok: false, error: "D1 error: " + e.message }, 500);
    }
  }

  // ── issue-jwt ─────────────────────────────────────────────────────────────
  if (action === "issue-jwt") {
    const { email, customerId: explicitId } = body;
    if (!email && !explicitId) return json({ ok: false, error: "Provide email or customerId" }, 400);
    if (!env.JWT_SECRET)       return json({ ok: false, error: "JWT_SECRET not configured" }, 500);

    const customerId = explicitId || fakeCustomerId(email);
    const token = await signJWT(
      { customerId, exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS },
      env.JWT_SECRET
    );
    return json({
      ok: true,
      customerId,
      jwt: token,
      note: "Store this JWT in localStorage under key 'airaJWT.v1'",
    });
  }

  return json({ ok: false, error: `Unknown action: ${action}` }, 400);
}
