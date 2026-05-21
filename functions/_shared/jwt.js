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

// ─── JWT ─────────────────────────────────────────────────────────────────────

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

// ─── Stripe API helpers ───────────────────────────────────────────────────────

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
 */
export async function verifyStripeWebhook(rawBody, sigHeader, secret) {
  if (!sigHeader) throw new Error("Missing Stripe-Signature header");
  if (!secret)    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");

  const parts = Object.fromEntries(
    sigHeader.split(",").map(p => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const timestamp = parts.t;
  const sig       = parts.v1;
  if (!timestamp || !sig) throw new Error("Invalid Stripe-Signature format");

  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > 300) throw new Error("Webhook timestamp too old — possible replay attack");

  // Strip "whsec_" prefix, normalize URL-safe base64, add padding, then decode
  const b64raw = (secret.startsWith("whsec_") ? secret.slice(6) : secret).trim();
  const b64std = b64raw.replace(/-/g, "+").replace(/_/g, "/");
  const b64    = b64std + "==".slice(0, (4 - b64std.length % 4) % 4);
  const rawKeyBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", rawKeyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );

  const toSign   = `${timestamp}.${rawBody}`;
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const expectedHex = Array.from(new Uint8Array(expected))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  if (expectedHex !== sig) throw new Error("Webhook signature mismatch");
}

// ─── Shared HTTP helpers ──────────────────────────────────────────────────────

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
