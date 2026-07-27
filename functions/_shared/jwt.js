/**
 * _shared/jwt.js — JWT (HS256) and Stripe helpers for Cloudflare Workers
 *
 * Uses only Web Crypto API — no npm dependencies.
 * All functions are async-safe; no module-level mutable state.
 */

// ─── Base64url helpers ────────────────────────────────────────────────────────

function base64urlFromBytes(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlEncode(str) {
  return base64urlFromBytes(new TextEncoder().encode(str));
}

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
  return atob(padded);
}

// ─── JWT ──────────────────────────────────────────────────────────────────

async function _hmacKey(secret, usage) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

/**
 * Sign a payload and return a compact JWT string.
 * @param {object} payload  — e.g. { customerId, exp }
 * @param {string} secret   — from env.JWT_SECRET
 */
export async function signJWT(payload, secret) {
  const header  = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body    = base64urlEncode(JSON.stringify(payload));
  const toSign  = `${header}.${body}`;
  const key     = await _hmacKey(secret, "sign");
  const sig     = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  return `${toSign}.${base64urlFromBytes(sig)}`;
}

/**
 * Verify a JWT and return its payload.
 * Throws if invalid, tampered, or expired.
 */
export async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [header, body, sig] = parts;

  const key     = await _hmacKey(secret, "verify");
  const toCheck = `${header}.${body}`;
  const sigBytes = Uint8Array.from(
    atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  );
  const valid = await crypto.subtle.verify(
    "HMAC", key, sigBytes, new TextEncoder().encode(toCheck)
  );
  if (!valid) throw new Error("Invalid token signature");

  const payload = JSON.parse(base64urlDecode(body));
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error("Token expired");
  return payload;
}

// ─── Customer session tokens (single source of truth) ────────────────────────────
//
// There is NO login in this product. A customer's only proof that they own the
// credits they paid for is this JWT, held in one browser's localStorage. If it
// expires, the credits are still safe in D1 but become unreachable — and the client
// degrades silently to non-AI output rather than erroring, so it reads as a worse
// product instead of a bug.
//
// The lifetime therefore has to survive the way people actually use a retirement
// planner: they check in occasionally, not daily. `shouldRefreshJWT` + the sliding
// refresh in /api/balance mean any customer who opens the app at least once inside
// the window never expires at all.
//
// TRADEOFF, stated plainly: there is no revocation mechanism for these tokens, so a
// longer TTL also lengthens how long a stolen token stays usable. That was already
// true at 30 days; this makes it 90. It is ONE constant — dial it here and every
// mint site follows, because they all import from this file.
export const JWT_TTL_SECONDS = 90 * 24 * 3600; // 90 days

/**
 * Mint a customer session token. The ONLY place the payload shape is decided —
 * verify-session, restore, admin and the /api/balance refresh all go through here so
 * they cannot drift (three of them previously each declared their own TTL constant).
 */
export async function mintCustomerJWT(customerId, secret, nowSeconds = Date.now() / 1000) {
  return signJWT(
    { customerId, exp: Math.floor(nowSeconds) + JWT_TTL_SECONDS },
    secret
  );
}

/**
 * Should this token be swapped for a fresh one? True once it is more than halfway
 * through its life, so a returning customer's window silently rolls forward.
 *
 * Pure and exported so the decision is unit-testable without WebCrypto or D1.
 * Returns false for a payload with no `exp` (non-expiring legacy token — nothing to
 * extend) and for anything already past expiry (verifyJWT rejects those first).
 */
export function shouldRefreshJWT(payload, nowSeconds = Date.now() / 1000) {
  if (!payload || typeof payload.exp !== "number") return false;
  const remaining = payload.exp - nowSeconds;
  if (remaining <= 0) return false;
  return remaining < JWT_TTL_SECONDS / 2;
}

// ─── Stripe API helpers ──────────────────────────────────────────────────────────

const STRIPE_BASE = "https://api.stripe.com/v1";

// Stripe REST API uses flat URL-encoded bodies (not JSON).
// Pass keys exactly as Stripe expects, e.g. "line_items[0][price]".
function formEncode(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export async function stripePost(secretKey, path, params) {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
  return data;
}

export async function stripeGet(secretKey, path) {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
  return data;
}

/**
 * Verify a Stripe webhook signature.
 * rawBody must be the raw request body string (before JSON.parse).
 * Throws if invalid or replay attack detected (>5 min old).
 *
 * Implementation notes (audit fix C3):
 *   - Stripe whsec_ secrets are NOT base64. The secret is used as raw UTF-8
 *     bytes, exactly as it appears in the dashboard — INCLUDING the "whsec_"
 *     prefix. This matches Stripe's official Node SDK, which passes the
 *     endpoint secret through verbatim: `createHmac('sha256', secret)` where
 *     `secret` is the full "whsec_..." string.
 *
 *     Do NOT strip the prefix. Doing so produces a different HMAC key than
 *     Stripe used to sign, so every real delivery fails with 400 and no
 *     purchase is ever credited. That was a live production bug — see the
 *     regression test in src/billing/stripeWebhookSig.test.js, which signs a
 *     payload the way Stripe does and asserts this function accepts it.
 *   - We use crypto.subtle.verify (not sign + string compare) so the
 *     byte comparison is constant-time at the WebCrypto level.
 */
export async function verifyStripeWebhook(rawBody, sigHeader, secret) {
  if (!sigHeader) throw new Error("Missing Stripe-Signature header");
  if (!secret)    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");

  const parts = Object.fromEntries(
    sigHeader.split(",").map(p => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const timestamp = parts.t;
  const sig       = parts.v1;
  if (!timestamp || !sig) throw new Error("Invalid Stripe-Signature format");

  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > 300) throw new Error("Webhook timestamp too old — possible replay attack");

  // The full secret string (prefix included) is the HMAC key — see note above.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Decode the hex v1 signature to bytes so subtle.verify can compare.
  if (!/^[0-9a-fA-F]+$/.test(sig) || sig.length % 2 !== 0) {
    throw new Error("Webhook signature mismatch");
  }
  const sigBytes = new Uint8Array(sig.length / 2);
  for (let i = 0; i < sig.length; i += 2) sigBytes[i / 2] = parseInt(sig.slice(i, i + 2), 16);

  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  );
  if (!ok) throw new Error("Webhook signature mismatch");
}

// ─── Shared HTTP helpers ──────────────────────────────────────────────────────────

export const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export function handleOptions() {
  return new Response(null, { status: 200, headers: CORS });
}
