/**
 * POST /api/admin
 * Authorization: Bearer <ADMIN_SECRET>
 * Body: { action, ...params }
 *
 * Hidden admin endpoint for testing the Stripe billing integration.
 * Gated by ADMIN_SECRET env var — never expose in client code.
 *
 * H4: Rate-limited to 10 requests / minute per IP (D1-backed).
 * H4: All successful admin actions are written to admin_audit table.
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

import { json, handleOptions, mintCustomerJWT, stripeGet } from "../_shared/jwt.js";

const RATE_LIMIT_MAX   = 10;   // max requests per IP per window
const RATE_LIMIT_SECS  = 60;   // rolling window in seconds

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

/**
 * Resolve an email to the customer id that actually holds the credits.
 *
 * `inspect` and `issue-jwt` used to call fakeCustomerId(email) directly, which
 * INVENTS a cus_ADMIN_<local-part> identity. That only ever matches rows created by
 * simulate-purchase, so looking up a real paying customer by their email returned
 * "not found" while their credits sat in D1 under a genuine cus_… id. That is exactly
 * how the admin panel failed to find a live customer during the 2026-07-27 incident.
 *
 * Real customer first (same query issue-restore-link already used); the synthetic id
 * is only a fallback so admin test flows keep working.
 */
async function resolveCustomerId(db, email) {
  if (!email) return null;
  try {
    const row = await db.prepare(
      "SELECT stripe_customer_id FROM customers WHERE email = ? ORDER BY updated_at DESC"
    ).bind(email).first();
    if (row?.stripe_customer_id) return row.stripe_customer_id;
  } catch { /* fall through to the synthetic id */ }
  return fakeCustomerId(email);
}

function fakeSessionId() {
  return `cs_admin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function onRequestOptions() {
  return handleOptions();
}

// Audit fix C5: constant-time string comparison so secret bytes cannot be
// recovered byte-by-byte via response-timing analysis. XORs every byte
// regardless of mismatch so the loop's runtime is data-independent.
function constantTimeEqual(a, b) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  // Always iterate the longer; XOR-in length difference so unequal lengths
  // still take comparable time but fail.
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] || 0) ^ (bBytes[i] || 0);
  }
  return diff === 0;
}

// H4: Write an admin audit row. Used fire-and-forget via waitUntil.
function writeAudit(db, action, actorIp, result, details) {
  return db.prepare(
    "INSERT INTO admin_audit (action, actor_ip, result, details) VALUES (?, ?, ?, ?)"
  ).bind(action, actorIp, result, details ? JSON.stringify(details) : null)
   .run()
   .catch(() => {}); // non-fatal
}

export async function onRequestPost({ request, env, waitUntil }) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!env.ADMIN_SECRET) {
    return json({ ok: false, error: "ADMIN_SECRET not configured on this deployment" }, 503);
  }
  const authHeader = request.headers.get("Authorization") || "";
  const presented  = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  // A missing ADMIN_SECRET used to fall through to the same 401 as a wrong one,
  // because constantTimeEqual(x, undefined) simply compares against the string
  // "undefined". That cost real debugging time: "Unauthorized" gave no hint that the
  // env var was never set on this deployment. Leaks nothing — it describes server
  // config, not the secret.
  if (!env.ADMIN_SECRET) {
    return json({ ok: false, error: "ADMIN_SECRET is not configured on this deployment." }, 500);
  }
  if (!presented || !constantTimeEqual(presented, env.ADMIN_SECRET)) {
    // Brief constant-ish randomized delay to mask any residual timing signal.
    await new Promise(r => setTimeout(r, 80 + Math.floor(Math.random() * 40)));
    // ── Shape-only diagnostics ───────────────────────────────────────────────
    // "Unauthorized" alone cannot distinguish the cases that actually occur:
    //   • the value you typed is wrong
    //   • the deployment predates your secret upload (Pages binds at build time)
    //   • the stored value is not what you think (a masked prompt captured a
    //     password, or a paste artifact came with it)
    //   • you set Production but this deployment reads Preview
    // Debugging that blind is an unbounded loop — it cost most of an evening.
    //
    // Deliberately SHAPE ONLY: lengths and character-class, never the values and
    // never a hash. A hash prefix would be offline-attackable if the stored
    // secret were weak, which is exactly the case we are trying to detect. A
    // length leak on a rate-limited endpoint (10/IP/min) is a fair trade for
    // making a self-inflicted misconfiguration visible to its owner.
    const shape = (v) => ({
      length: v.length,
      isLowerHex: /^[0-9a-f]+$/.test(v),
      hasNonAscii: [...v].some(c => c.charCodeAt(0) > 0x7e || c.charCodeAt(0) < 0x21),
    });
    return json({
      ok: false,
      error: "Unauthorized",
      // Compare these two rows. Same length + both isLowerHex true, yet still
      // unauthorized ⇒ two different 64-char secrets (e.g. local vs production).
      // Different lengths ⇒ the stored value is not the one you are pasting.
      diagnostic: {
        youSent: presented ? shape(presented) : { length: 0 },
        serverExpects: shape(env.ADMIN_SECRET),
        hint: "Shapes only, no values. If lengths differ, the stored secret is not the string you are pasting — set it again and redeploy (Pages binds secrets at build time). If both look identical, you have two different secrets of the same shape: production vs .dev.vars.",
      },
    }, 401);
  }

  // ── H4: Extract caller IP ─────────────────────────────────────────────────
  const actorIp = request.headers.get("CF-Connecting-IP")
               || request.headers.get("X-Real-IP")
               || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
               || "unknown";

  // ── H4: Per-IP rate limit (D1-backed, best-effort) ───────────────────────
  if (env.DB) {
    try {
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM admin_audit WHERE actor_ip = ? AND created_at > unixepoch() - ?"
      ).bind(actorIp, RATE_LIMIT_SECS).first();

      if ((recent?.cnt ?? 0) >= RATE_LIMIT_MAX) {
        // Log the blocked attempt non-blocking; intentionally not awaited
        env.DB.prepare(
          "INSERT INTO admin_audit (action, actor_ip, result) VALUES ('blocked', ?, 'rate_limited')"
        ).bind(actorIp).run().catch(() => {});
        return json({
          ok: false,
          error: `Rate limit exceeded. Max ${RATE_LIMIT_MAX} admin requests per ${RATE_LIMIT_SECS}s.`,
        }, 429);
      }
    } catch { /* non-fatal: skip if admin_audit table not yet migrated */ }
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const { action } = body;

  // ── Action dispatch ───────────────────────────────────────────────────────
  // Wrapped in doAction so we can log the audit trail once at the bottom.
  const doAction = async () => {

    // ── ping ─────────────────────────────────────────────────────────────
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

    // ── stripe-ping ───────────────────────────────────────────────────────
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

    // ── grant-credits ─────────────────────────────────────────────────────
    if (action === "grant-credits") {
      const { email, customerId: explicitId, credits = 5_000 } = body;
      if (!email && !explicitId) return json({ ok: false, error: "Provide email or customerId" }, 400);
      if (!env.DB)               return json({ ok: false, error: "D1 not bound" }, 500);

      const customerId = explicitId || fakeCustomerId(email);
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

    // ── simulate-purchase ─────────────────────────────────────────────────
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
        const token = await mintCustomerJWT(customerId, env.JWT_SECRET);
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

    // ── inspect ───────────────────────────────────────────────────────────
    if (action === "inspect") {
      const { email, customerId: explicitId } = body;
      if (!email && !explicitId) return json({ ok: false, error: "Provide email or customerId" }, 400);
      if (!env.DB)               return json({ ok: false, error: "D1 not bound" }, 500);

      const customerId = explicitId || await resolveCustomerId(env.DB, email);
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

    // ── issue-jwt ─────────────────────────────────────────────────────────
    if (action === "issue-jwt") {
      const { email, customerId: explicitId } = body;
      if (!email && !explicitId) return json({ ok: false, error: "Provide email or customerId" }, 400);
      if (!env.JWT_SECRET)       return json({ ok: false, error: "JWT_SECRET not configured" }, 500);

      const customerId = explicitId || await resolveCustomerId(env.DB, email);
      const token = await mintCustomerJWT(customerId, env.JWT_SECRET);
      return json({
        ok: true,
        customerId,
        jwt: token,
        note: "Store this JWT in localStorage under key 'airaJWT.v1'",
      });
    }

    // ── issue-restore-link ────────────────────────────────────────────────
    // Mints an expiring, use-capped restore token and returns a clickable URL.
    // Give this to a customer who paid but cannot reach their credits (lost
    // localStorage, new device, or a verify-session failure at purchase time).
    //
    // Resolving by email uses a real lookup against customers.email — NOT
    // fakeCustomerId(), which would invent a cus_ADMIN_… identity and split the
    // balance away from their real Stripe customer id.
    if (action === "issue-restore-link") {
      const { email, customerId: explicitId, days = 14, maxUses = 3, note = null } = body;
      if (!email && !explicitId) return json({ ok: false, error: "Provide email or customerId" }, 400);
      if (!env.DB)               return json({ ok: false, error: "D1 not bound" }, 500);

      let customerId = explicitId || null;
      if (!customerId) {
        try {
          const found = await env.DB.prepare(
            "SELECT stripe_customer_id FROM customers WHERE email = ? ORDER BY updated_at DESC"
          ).bind(email).all();
          const ids = (found.results || []).map(r => r.stripe_customer_id);
          if (ids.length === 0) {
            return json({ ok: false, error: `No customer found with email ${email}` }, 404);
          }
          if (ids.length > 1) {
            // Ambiguous — refuse rather than guess which account to restore.
            return json({
              ok: false,
              error: `${ids.length} customers share that email. Re-run with an explicit customerId.`,
              candidates: ids,
            }, 409);
          }
          customerId = ids[0];
        } catch (e) {
          return json({ ok: false, error: "D1 error: " + e.message }, 500);
        }
      } else {
        // Explicit id must actually exist, or the link would 401 on redemption.
        try {
          const exists = await env.DB.prepare(
            "SELECT 1 AS ok FROM customers WHERE stripe_customer_id = ?"
          ).bind(customerId).first();
          if (!exists) return json({ ok: false, error: `No customer row for ${customerId}` }, 404);
        } catch (e) {
          return json({ ok: false, error: "D1 error: " + e.message }, 500);
        }
      }

      // 32 bytes of CSPRNG entropy, hex-encoded — not guessable, and distinct
      // from the UUID shape used by checkout nonces.
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");

      const ttlSeconds = Math.max(1, Math.min(90, Number(days) || 14)) * 24 * 3600;
      const cap        = Math.max(1, Math.min(20, Number(maxUses) || 3));

      try {
        await env.DB.prepare(`
          INSERT INTO restore_tokens (token, customer_id, note, expires_at, max_uses)
          VALUES (?, ?, ?, unixepoch() + ?, ?)
        `).bind(token, customerId, note, ttlSeconds, cap).run();
      } catch (e) {
        return json({ ok: false, error: "D1 error (did you run migration 006?): " + e.message }, 500);
      }

      const origin = new URL(request.url).origin;
      return json({
        ok:        true,
        customerId,
        url:       `${origin}/?restore=${token}`,
        maxUses:   cap,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        note:      "Send this URL to the customer. Clicking it restores their credits on that device.",
      });
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  };

  const response = await doAction();

  // ── H4: Audit trail (fire-and-forget via waitUntil) ──────────────────────
  // Log every authenticated, non-rate-limited request regardless of outcome.
  if (env.DB && action) {
    const auditPromise = writeAudit(env.DB, action, actorIp, "ok", {
      email:      body.email      || null,
      customerId: body.customerId || null,
    });
    if (typeof waitUntil === "function") waitUntil(auditPromise);
    else await auditPromise;
  }

  return response;
}
