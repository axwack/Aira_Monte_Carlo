/**
 * credits.js — AiRA credit billing (client side)
 *
 * When BILLING_ENABLED = false (default): localStorage stub — no real money.
 * When BILLING_ENABLED = true:
 *   - JWT stored in localStorage after Stripe purchase
 *   - Credit balance fetched from /api/balance
 *   - Purchases redirect to Stripe Checkout via /api/checkout
 *   - Token deduction happens server-side in /api/analyze
 */

import { useState, useEffect } from "react";
import { BILLING_ENABLED } from "../ai/ai-analysis.js";

// ─── Credit pack definitions ──────────────────────────────────────────────────
// Keep in sync with functions/api/webhook.js PACK_CREDITS
// and wrangler.toml STRIPE_PRICE_* env vars.

export const CREDIT_PACKS = [
  {
    id:        "starter",
    label:     "Starter Pack",
    priceUsd:  5.00,
    credits:   5_000,
    highlight: false,
  },
  {
    id:        "value",
    label:     "Value Pack",
    priceUsd:  10.00,
    credits:   10_000,
    highlight: true,
  },
  {
    id:        "pro",
    label:     "Pro Pack",
    priceUsd:  15.00,
    credits:   15_000,
    highlight: false,
  },
];

// Free credits shown to unauthenticated users (stub mode only)
export const FREE_STARTER_CREDITS = 5_000;
// 1 AiRA credit = 1,000 raw Gemini tokens (must match analyze.js RAW_TOKENS_PER_CREDIT)
export const RAW_TOKENS_PER_CREDIT = 1_000;

// ─── JWT management ───────────────────────────────────────────────────────────

const JWT_KEY = "airaJWT.v1";

export function getStoredJWT() {
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(JWT_KEY) : null; }
  catch { return null; }
}

function setStoredJWT(token) {
  try { typeof localStorage !== "undefined" && localStorage.setItem(JWT_KEY, token); }
  catch {}
}

export function clearStoredJWT() {
  try { typeof localStorage !== "undefined" && localStorage.removeItem(JWT_KEY); }
  catch {}
}

export function isAuthenticated() {
  return !!getStoredJWT();
}

// ─── Balance — pub/sub ────────────────────────────────────────────────────────

const CACHED_BALANCE_KEY = "airaCachedBalance.v1";
const STUB_BALANCE_KEY   = "airaCredits.v1";
const _listeners = new Set();

function _notifyListeners(credits) {
  _listeners.forEach(l => { try { l(credits); } catch {} });
}

function _readCachedBalance() {
  try {
    if (typeof localStorage === "undefined") return FREE_STARTER_CREDITS;
    const key = BILLING_ENABLED ? CACHED_BALANCE_KEY : STUB_BALANCE_KEY;
    const raw = localStorage.getItem(key);
    if (raw === null && !BILLING_ENABLED) {
      // First-visit stub grant
      localStorage.setItem(STUB_BALANCE_KEY, String(FREE_STARTER_CREDITS));
      return FREE_STARTER_CREDITS;
    }
    return Math.max(0, parseInt(raw, 10) || 0);
  } catch { return 0; }
}

/** Synchronous — returns last known (cached) balance for immediate UI rendering. */
export function getCreditBalance() {
  return _readCachedBalance();
}

/**
 * Synchronously push a server-known balance into the cache and notify listeners.
 * Call this when the server returns a fresh balance in an API response, avoiding
 * a second round-trip to /api/balance.
 */
export function syncCreditBalance(credits) {
  const n = Math.max(0, credits);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(BILLING_ENABLED ? CACHED_BALANCE_KEY : STUB_BALANCE_KEY, String(n));
    }
  } catch {}
  _notifyListeners(n);
}

/** Async — fetches live balance from /api/balance and updates the cache. */
export async function fetchCreditBalance() {
  if (!BILLING_ENABLED) return getCreditBalance();

  const jwt = getStoredJWT();
  if (!jwt) return null;

  try {
    const res = await fetch("/api/balance", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 401) {
      clearStoredJWT(); // expired token
      return null;
    }
    if (!res.ok) return null;
    const { credits } = await res.json();
    try { localStorage.setItem(CACHED_BALANCE_KEY, String(credits)); } catch {}
    _notifyListeners(credits);
    return credits;
  } catch { return null; }
}

export function subscribeCreditBalance(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function useCreditBalance() {
  const [balance, setBalance] = useState(getCreditBalance);

  useEffect(() => {
    // Fetch live balance on mount
    fetchCreditBalance().then(b => { if (b !== null) setBalance(b); });
    return subscribeCreditBalance(setBalance);
  }, []);

  return balance;
}

// ─── Stub-mode balance helpers (only used when BILLING_ENABLED = false) ───────

export function rawTokensToCredits(totalRawTokens) {
  return Math.ceil(totalRawTokens / RAW_TOKENS_PER_CREDIT);
}

export const ESTIMATED_CREDITS_PER_CALL = 5;

export function hasEnoughCredits(estimatedCredits = ESTIMATED_CREDITS_PER_CALL) {
  return _readCachedBalance() >= estimatedCredits;
}

/** Client-side deduction — only meaningful in stub mode (BILLING_ENABLED = false). */
export function deductCredits(totalRawTokens) {
  if (BILLING_ENABLED) return; // server handles this in billing mode
  const cost    = rawTokensToCredits(totalRawTokens);
  const current = _readCachedBalance();
  const next    = Math.max(0, current - cost);
  try { localStorage.setItem(STUB_BALANCE_KEY, String(next)); } catch {}
  _notifyListeners(next);
  return cost;
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

/**
 * Initiate a credit purchase.
 *
 * Billing mode: POST /api/checkout → receive Stripe URL → redirect browser.
 * Stub mode: instantly grant credits in localStorage (demo only).
 */
export async function purchaseCreditPack(packId) {
  const pack = CREDIT_PACKS.find(p => p.id === packId);
  if (!pack) throw new Error(`Unknown pack: ${packId}`);

  if (!BILLING_ENABLED) {
    // Stub — demo only
    console.warn("[BILLING STUB] Would redirect to Stripe for", pack.label);
    const current = _readCachedBalance();
    const next    = current + pack.credits;
    try { localStorage.setItem(STUB_BALANCE_KEY, String(next)); } catch {}
    _notifyListeners(next);
    return { success: true, creditsAdded: pack.credits, newBalance: next };
  }

  // Real billing: call our Worker which creates a Stripe Checkout session
  const jwt = getStoredJWT();
  const res = await fetch("/api/checkout", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ packId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Checkout failed");
  }
  const { url } = await res.json();
  window.location.href = url; // redirect to Stripe — page unloads here
}

// ─── Post-purchase: verify Stripe session → issue JWT ────────────────────────

/**
 * Called once when Stripe redirects back to /?session_id=xxx.
 * Exchanges the session ID for a JWT, stores it, and returns the credit balance.
 */
export async function verifyStripeSession(sessionId) {
  const res = await fetch("/api/verify-session", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Session verification failed");
  }
  const { token, credits: initialCredits } = await res.json();
  setStoredJWT(token);
  try { localStorage.setItem(CACHED_BALANCE_KEY, String(initialCredits)); } catch {}
  _notifyListeners(initialCredits);

  // If credits are 0 the webhook hasn't fired yet — poll /api/balance for up to 12s
  if (initialCredits === 0) {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const polled = await fetchCreditBalance();
      if (polled > 0) return { credits: polled };
    }
  }

  return { credits: initialCredits };
}

// ─── Hook: detect Stripe return URL ──────────────────────────────────────────

/**
 * Mount this hook near the top of App.jsx.
 * When Stripe redirects back with ?session_id=..., it verifies the payment,
 * stores the JWT, and returns { success, credits } or { success: false, error }.
 */
export function useStripeReturn() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!BILLING_ENABLED) return;
    const params    = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    // Clean the URL so a refresh doesn't re-verify
    const clean = new URL(window.location.href);
    clean.searchParams.delete("session_id");
    window.history.replaceState({}, "", clean.toString());

    verifyStripeSession(sessionId)
      .then(({ credits }) => setStatus({ success: true, credits }))
      .catch(e => setStatus({ success: false, error: e.message }));
  }, []);

  return status;
}

// ─── UI — Credit Balance Badge ────────────────────────────────────────────────

export function CreditBalanceBadge({ style, onBuyClick }) {
  const balance = useCreditBalance();
  const low     = balance < 500;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, ...style }}>
      <span style={{ fontSize: 11, color: low ? "#f87171" : "#64748b" }}>
        {balance.toLocaleString()} credits{low ? " — low" : ""}
      </span>
      {onBuyClick && (
        <button
          onClick={onBuyClick}
          style={{
            background:   low
              ? "linear-gradient(135deg, #991b1b, #ef4444)"
              : "linear-gradient(135deg, #7c3aed, #a78bfa)",
            border:       "none",
            color:        "white",
            borderRadius: 8,
            padding:      "7px 16px",
            fontSize:     13,
            fontWeight:   600,
            cursor:       "pointer",
            boxShadow:    "0 2px 8px rgba(124,58,237,0.3)",
            display:      "flex",
            alignItems:   "center",
            gap:          5,
          }}
        >
          {low ? "⚠ Buy Credits" : "💳 Buy Credits"}
        </button>
      )}
    </div>
  );
}

// ─── UI — Credit Pack Modal ───────────────────────────────────────────────────

export function CreditPackModal({ onClose }) {
  const [purchasing, setPurchasing] = useState(null);
  const [done, setDone]             = useState(null);
  const [error, setError]           = useState(null);

  const buy = async (packId) => {
    setPurchasing(packId);
    setError(null);
    try {
      const result = await purchaseCreditPack(packId);
      if (result) setDone(result); // only set in stub mode (real mode redirects)
    } catch (e) {
      setError(e.message);
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div style={{
      position:        "fixed", inset: 0,
      background:      "rgba(0,0,0,0.65)",
      display:         "flex", alignItems: "center", justifyContent: "center",
      zIndex:          9999,
    }}>
      <div style={{
        background:   "rgba(15,23,42,0.98)",
        border:       "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding:      "28px 24px",
        minWidth:     340,
        maxWidth:     420,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
          Buy AiRA Credits
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
          Credits power all AI features. 1 credit ≈ 1,000 Gemini tokens.
          {!BILLING_ENABLED && (
            <span style={{ color: "#f59e0b", display: "block", marginTop: 6 }}>
              Demo mode — no real charge.
            </span>
          )}
        </div>

        {error && (
          <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {done ? (
          <div style={{
            background:   "rgba(134,239,172,0.08)",
            border:       "1px solid rgba(134,239,172,0.2)",
            borderRadius: 8, padding: "12px 14px",
            color:        "#86efac", fontSize: 13,
          }}>
            ✓ {done.creditsAdded.toLocaleString()} credits added — new balance: {done.newBalance.toLocaleString()}
          </div>
        ) : CREDIT_PACKS.map(pack => (
          <div
            key={pack.id}
            style={{
              border:         `1px solid ${pack.highlight ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.08)"}`,
              background:     pack.highlight ? "rgba(124,58,237,0.06)" : "transparent",
              borderRadius:   8,
              padding:        "14px 16px",
              marginBottom:   10,
              display:        "flex",
              justifyContent: "space-between",
              alignItems:     "center",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                {pack.label}
                {pack.highlight && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: "#a78bfa", fontWeight: 700 }}>
                    BEST VALUE
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {pack.credits.toLocaleString()} credits
              </div>
            </div>
            <button
              onClick={() => buy(pack.id)}
              disabled={!!purchasing}
              style={{
                background:   purchasing === pack.id
                  ? "rgba(255,255,255,0.05)"
                  : "linear-gradient(135deg,#7c3aed,#a78bfa)",
                border:       "none",
                color:        purchasing === pack.id ? "#475569" : "white",
                borderRadius: 6,
                padding:      "6px 16px",
                fontSize:     13,
                fontWeight:   700,
                cursor:       purchasing ? "wait" : "pointer",
                minWidth:     72,
              }}
            >
              {purchasing === pack.id ? "…" : `$${pack.priceUsd.toFixed(2)}`}
            </button>
          </div>
        ))}

        <button
          onClick={onClose}
          style={{
            background:   "transparent",
            border:       "1px solid rgba(255,255,255,0.1)",
            color:        "#64748b",
            borderRadius: 6,
            padding:      "5px 14px",
            fontSize:     11,
            cursor:       "pointer",
            marginTop:    12,
            width:        "100%",
          }}
        >
          {done ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
