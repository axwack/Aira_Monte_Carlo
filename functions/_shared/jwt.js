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

async function _hmacKey(secret, usage) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

export async function signJWT(payload, secret) {
  const header  = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body    = base64urlEncode(JSON.stringify(payload));
  const toSign  = `${header}.${body}`;
  const key     = await _hmacKey(secret, "sign");
  const sig     = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  return `${toSign}.${base64urlFromBytes(sig)}`;
}

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

export const JWT_TTL_SECONDS = 90 * 24 * 3600;

export async function mintCustomerJWT(customerId, secret, nowSeconds = Date.now() / 1000) {
  return signJWT(
    { customerId, exp: Math.floor(nowSeconds) + JWT_TTL_SECONDS },
    secret
  );
}

export function shouldRefreshJWT(payload, nowSeconds = Date.now() / 1000) {
  if (!payload || typeof payload.exp !== "number") return false;
  const remaining = payload.exp - nowSeconds;
  if (remaining <= 0) return false;
  return remaining < JWT_TTL_SECONDS / 2;
}

const STRIPE_BASE = "https://api.stripe.com/v1";

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

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

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
