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

// ─── Report unlock (flat-fee, 24h window) ──────────────────────────────────
// Keep in sync with functions/api/report-unlock.js DEFAULT_REPORT_COST_CREDITS.
// Economics: a Starter Pack is 5,000 credits for $5 ($1 ≈ 1,000 credits). The
// printable report is 100% client-computed (no AI/token cost), so it's priced
// as a meaningful-but-small flat slice of a pack — 250 credits (~$0.25, 5% of
// a Starter Pack) so one $5 pack buys ~20 report unlocks.
export const REPORT_COST_CREDITS = 250;

const REPORT_UNLOCK_KEY = "aira_report_unlock";

// ─── JWT management ─────────────────────────────────────────────────────────

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

// ─── Balance — pub/sub ────────────────────────────────────────────────────────────

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
    const { credits, token } = await res.json();
    // SLIDING SESSION: /api/balance returns a fresh `token` once the current one is
    // past halfway through its life. Storing it here — on a call that already happens
    // on essentially every app open — is what keeps a paying customer from silently
    // losing access to credits they still own. `token` is absent when no refresh is
    // due, so this must stay conditional; never clear the existing token on absence.
    if (token) setStoredJWT(token);
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

/**
 * The minimum balance the SERVER will accept before running an analysis.
 *
 * MUST equal MIN_CREDITS_GUARD in functions/api/analyze.js. That is not a style
 * request: the server returns 402 below this number, so any smaller value here
 * makes the client offer a button that cannot work. The two drifted 10x (client
 * 5, server 50) and creditsGuardSync.test.js now fails the build if they ever
 * part company again — a text-parse of analyze.js, so it cannot be fooled by a
 * stale copy of this comment.
 *
 * This replaced ESTIMATED_CREDITS_PER_CALL, which was a different quantity
 * wearing the same hat: a guess at what one call costs, not the floor the server
 * enforces. Nothing called it, so the mismatch had no runtime effect yet — the
 * client simply fired and let the 402 come back.
 */
export const MIN_CREDITS_TO_RUN = 50;

/**
 * Where the UI should start warning. Deliberately a multiple of the floor rather
 * than a round number: the point is "you are close to the number that stops
 * working", which only has meaning relative to that number. The previous 500 was
 * a bare literal 10x away from a floor it did not reference.
 */
export const LOW_BALANCE_WARN_AT = MIN_CREDITS_TO_RUN * 10;

export function hasEnoughCredits(minCredits = MIN_CREDITS_TO_RUN) {
  return _readCachedBalance() >= minCredits;
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

// ─── Report, sold as a product ──────────────────────────────────────────────

/** Price of the standalone report. Display only — Stripe holds the real price. */
export const REPORT_PRICE_USD = 9.00;

/**
 * Buy the printable report outright.
 *
 * Separate from `purchaseCreditPack` on purpose. Credits meter AI token usage;
 * this report burns ZERO tokens (it is computed client-side from the engines), so
 * charging credits for it priced a deterministic document in a currency that
 * means something else — and forced a buyer who only wants the report to first
 * understand credits, buy a pack, and spend a slice of it.
 *
 * Grants a PERMANENT unlock (see report-unlock.js), not the 24-hour window a
 * credit spend buys. Nobody expects a document they paid for to stop opening
 * tomorrow.
 *
 * The 250-credit path (`unlockReport`) is deliberately kept for existing credit
 * holders — removing it would break people mid-balance — but this is the one to
 * lead with.
 */
export async function purchaseReport() {
  if (!BILLING_ENABLED) {
    console.warn("[BILLING STUB] Would redirect to Stripe for the report");
    try { localStorage.setItem(REPORT_UNLOCK_KEY, JSON.stringify({ unlockedUntil: null, permanent: true })); } catch {}
    return { success: true, stub: true };
  }
  const res = await fetch("/api/checkout", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ packId: "report" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // The customer sees a plain sentence; the OPERATOR gets Stripe's own reason
    // in the console. Splitting them matters: a shopper must not be shown
    // "No such price: price_1U4...", but without it anywhere the failure is
    // indistinguishable from a network blip and takes ten guesses to fix.
    if (err.stripeError) console.error("[checkout] Stripe rejected the report price:", err.stripeError, "—", err.hint || "");
    throw new Error(
      err.stripeError
        ? "This purchase isn't available right now — we've been notified."
        : (err.error || "Checkout failed")
    );
  }
  const { url } = await res.json();
  window.location.href = url;   // redirect to Stripe — page unloads here
}

// ─── Report unlock ──────────────────────────────────────────────────────────

/**
 * Unlock the printable CFP report for 24 hours by POSTing to
 * /api/report-unlock with the stored JWT (same fetch shape as
 * purchaseCreditPack's real-billing branch). On success, syncs the returned
 * balance and persists the unlock window in localStorage so isReportUnlocked()
 * can gate the report client-side without another round-trip.
 *
 * NOTE (soft gate by design): this is a client-side convenience gate — the
 * report's data is entirely client-computed, so nothing here is DRM. The only
 * server-enforced thing is the credit deduction itself (and, in future, any
 * AI-generated narrative added to the report). See the gating comment in
 * App.jsx for the full rationale.
 */
export async function unlockReport() {
  const jwt = getStoredJWT();
  if (!jwt) throw new Error("Not authenticated — please purchase AiRA credits to continue.");

  const res = await fetch("/api/report-unlock", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body:    JSON.stringify({}),
  });

  if (res.status === 401) {
    clearStoredJWT(); // expired token
    throw new Error("Session expired — please log in again.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error || "Report unlock failed");
    if (err.creditsRemaining != null) e.creditsRemaining = err.creditsRemaining;
    throw e;
  }

  const result = await res.json();
  if (result.creditsRemaining != null) syncCreditBalance(result.creditsRemaining);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(REPORT_UNLOCK_KEY, JSON.stringify({ unlockedUntil: result.unlockedUntil }));
    }
  } catch {}
  return result;
}

/**
 * Locally-cached unlock window. This is an OPTIMISTIC hint for first paint only
 * — it is not authority. The server derives the real window from the ledger
 * (see currentUnlockWindow in functions/api/report-unlock.js); use
 * useReportUnlocked() so a hand-edited localStorage flag can't grant access and
 * a cleared one can't revoke it.
 */
export function isReportUnlocked() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(REPORT_UNLOCK_KEY);
    if (!raw) return false;
    const { unlockedUntil, permanent } = JSON.parse(raw);
    // A purchased report has no expiry, so `unlockedUntil` is null by design.
    // Without this branch the null read as "expired" and a paying customer saw
    // the paywall on first paint until the server round-trip corrected it.
    if (permanent) return true;
    return !!unlockedUntil && new Date(unlockedUntil).getTime() > Date.now();
  } catch { return false; }
}

// ─── Report capability (Gemini-key gate) ───────────────────────────────────

/**
 * Fail-closed capability probe — see functions/api/report-capability.js for
 * why this exists (closes the "flip BILLING_ENABLED locally" free-report
 * loophole). Any failure (network error, missing endpoint, non-2xx) reports
 * `false`: unlike the balance/unlock helpers above, which fail OPEN to avoid
 * punishing a paying customer for a transient error, this is an anti-abuse
 * check with no customer on the other end to protect — default to locked.
 */
export async function fetchReportCapability() {
  try {
    const res = await fetch("/api/report-capability");
    if (!res.ok) return false;
    const { available } = await res.json();
    return !!available;
  } catch { return false; }
}

/** Hook form of fetchReportCapability() — starts false (locked), flips true once the server confirms. */
export function useReportCapability() {
  const [capable, setCapable] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchReportCapability().then(v => { if (alive) setCapable(v); });
    return () => { alive = false; };
  }, []);
  return capable;
}

/** Authoritative check — asks the server for the ledger-derived window. */
export async function fetchReportUnlockStatus() {
  const jwt = getStoredJWT();
  if (!jwt) return { unlocked: false, unlockedUntil: null };
  try {
    const res = await fetch("/api/report-unlock", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 401) { clearStoredJWT(); return { unlocked: false, unlockedUntil: null }; }
    if (!res.ok) return null;                       // null = unknown, keep cache
    // `permanent` marks a purchased report (no expiry). Carried into the cache
    // so isReportUnlocked() does not read its null `unlockedUntil` as expired.
    const { unlocked, unlockedUntil, permanent } = await res.json();
    try {
      if (typeof localStorage !== "undefined") {
        if (unlocked) localStorage.setItem(REPORT_UNLOCK_KEY, JSON.stringify({ unlockedUntil, permanent: !!permanent }));
        else          localStorage.removeItem(REPORT_UNLOCK_KEY);
      }
    } catch {}
    return { unlocked, unlockedUntil };
  } catch { return null; }
}

/**
 * Whether the report is unlocked, reconciled against the server.
 *
 * Starts from the local cache so the report doesn't flash locked for a paying
 * customer, then corrects from the ledger. `bump` re-checks after a successful
 * unlock without a remount.
 */
export function useReportUnlocked(bump = 0) {
  const [unlocked, setUnlocked] = useState(isReportUnlocked);

  useEffect(() => {
    if (!BILLING_ENABLED) { setUnlocked(true); return; }
    let alive = true;
    fetchReportUnlockStatus().then(r => {
      // null means the request failed — leave the optimistic value alone rather
      // than locking out a customer over a transient network error.
      if (alive && r) setUnlocked(r.unlocked);
    });
    return () => { alive = false; };
  }, [bump]);

  return unlocked;
}

// ─── Post-purchase: verify Stripe session → issue JWT ──────────────────────

/**
 * Called once when Stripe redirects back to /?session_id=xxx&nonce=yyy.
 * Exchanges the (session_id, nonce) pair for a JWT, stores it, and returns
 * the credit balance.
 *
 * Audit fix H3: nonce is REQUIRED — without it the server returns 400.
 * Each nonce is single-use and expires 30 minutes after checkout.
 */
export async function verifyStripeSession(sessionId, nonce) {
  const res = await fetch("/api/verify-session", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ sessionId, nonce }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Session verification failed");
  }
  const { token, credits: initialCredits, restoreUrl, restoreExpiresAt, packId } = await res.json();
  setStoredJWT(token);
  try { localStorage.setItem(CACHED_BALANCE_KEY, String(initialCredits)); } catch {}
  _notifyListeners(initialCredits);
  // Persist the recovery link so it survives the page and can be re-shown later.
  // Deliberately stored: it is the spare key for the JWT beside it, and losing it
  // silently would defeat the point. Same origin, same risk profile as the JWT.
  if (restoreUrl) setStoredRecoveryLink(restoreUrl, restoreExpiresAt);

  // A REPORT purchase grants zero credits by design — the entitlement is the
  // ledger row, not a balance. So the credit poll below is the wrong signal for
  // it: it would wait the full 12 seconds for a number that never moves, then
  // report "0 credits". Poll for the ENTITLEMENT instead, which is the thing the
  // webhook actually writes and the thing the buyer is waiting on.
  if (packId === "report") {
    for (let i = 0; i < 6; i++) {
      const status = await fetchReportUnlockStatus();
      if (status?.unlocked) return { packId, reportUnlocked: true, restoreUrl };
      await new Promise(r => setTimeout(r, 2000));
    }
    // Webhook still hasn't landed. Not an error the buyer can act on — the grant
    // is idempotent and arrives on Stripe's retry — so say so honestly rather
    // than showing a failure for a payment that succeeded.
    return { packId, reportUnlocked: false, restoreUrl };
  }

  // If credits are 0 the webhook hasn’t fired yet — poll /api/balance for up to 12s
  if (initialCredits === 0) {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const polled = await fetchCreditBalance();
      if (polled > 0) return { credits: polled, restoreUrl };
    }
  }

  return { credits: initialCredits, restoreUrl };
}

// ─── Recovery link (self-service restore) ─────────────────────────────────────
// Minted by /api/verify-session at checkout, so the buyer leaves with a spare key
// instead of depending on an operator to issue one later. See the rationale in
// functions/api/verify-session.js.
const RECOVERY_KEY = "airaRecoveryLink.v1";

export function setStoredRecoveryLink(url, expiresAt = null) {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ url, expiresAt }));
  } catch {}
}

/**
 * The stored recovery link, or null. Self-expires: a link past `expiresAt` is
 * worse than none, because a customer would try it and be told "invalid" with no
 * explanation of why it stopped working.
 */
export function getStoredRecoveryLink() {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec?.url) return null;
    if (rec.expiresAt && Date.parse(rec.expiresAt) < Date.now()) return null;
    return rec;
  } catch { return null; }
}

export function clearStoredRecoveryLink() {
  try { localStorage.removeItem(RECOVERY_KEY); } catch {}
}

// ─── Account restore (?restore=…) ──────────────────────────────────────────

/**
 * Exchange an admin-issued restore token for a JWT and store it, exactly as a
 * successful Stripe return would. Lets a customer who paid but lost access
 * (cleared localStorage, new device, or a verify-session failure at purchase
 * time) get back in by clicking one link.
 */
export async function redeemRestoreToken(token) {
  const res = await fetch("/api/restore", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Restore failed");
  }
  const { token: jwt, credits } = await res.json();
  setStoredJWT(jwt);
  try { localStorage.setItem(CACHED_BALANCE_KEY, String(credits)); } catch {}
  _notifyListeners(credits);
  return { credits };
}

/**
 * Mount alongside useStripeReturn. When the page loads with ?restore=<token>,
 * redeems it for a JWT and returns { success, credits } or { success, error }.
 *
 * The token is stripped from the URL before the network call so it never
 * survives into history or a shared screenshot — it is a bearer credential
 * until redeemed (though an expiring, use-capped one; see
 * db/migrations/006_restore_tokens.sql).
 */
export function useRestoreReturn() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!BILLING_ENABLED) return;
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("restore");
    if (!token) return;

    const clean = new URL(window.location.href);
    clean.searchParams.delete("restore");
    window.history.replaceState({}, "", clean.toString());

    redeemRestoreToken(token)
      .then(({ credits }) => setStatus({ success: true, credits }))
      .catch(e => setStatus({ success: false, error: e.message }));
  }, []);

  return status;
}

// ─── Hook: detect Stripe return URL ────────────────────────────────────────────

/**
 * Mount this hook near the top of App.jsx.
 * When Stripe redirects back with ?session_id=xxx&nonce=yyy, it verifies
 * the payment, atomically consumes the nonce, stores the JWT, and returns
 * { success, credits } or { success: false, error }.
 *
 * The nonce is required (audit fix H3): if missing, we surface a friendly
 * error so the user knows to retry from a fresh checkout link.
 */
export function useStripeReturn() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!BILLING_ENABLED) return;
    const params    = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const nonce     = params.get("nonce");
    if (!sessionId) return;

    // Clean BOTH query params so a refresh doesn't re-attempt verification
    // (the nonce is one-time-use server-side, so a retry would 401 anyway).
    const clean = new URL(window.location.href);
    clean.searchParams.delete("session_id");
    clean.searchParams.delete("nonce");
    window.history.replaceState({}, "", clean.toString());

    if (!nonce) {
      setStatus({
        success: false,
        error: "Checkout link is missing the one-time nonce. Please buy credits again from the app — your card was charged so contact support if a second purchase appears.",
      });
      return;
    }

    verifyStripeSession(sessionId, nonce)
      // packId/reportUnlocked must survive to the caller — the return-page toast
      // branches on them, and destructuring only `credits` here is what would
      // send a report buyer down the credits wording.
      .then(({ credits, restoreUrl, packId, reportUnlocked }) =>
        setStatus({ success: true, credits, restoreUrl, packId, reportUnlocked }))
      .catch(e => setStatus({ success: false, error: e.message }));
  }, []);

  return status;
}

// ─── UI — Credit Balance Badge ────────────────────────────────────────────────────

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

// ─── UI — Credit Pack Modal ─────────────────────────────────────────────────────

/**
 * "Save your recovery link" — shown once after a successful purchase, and
 * re-openable from the credit panel.
 *
 * The JWT this app runs on lives in ONE origin's localStorage and is the only
 * proof of purchase; there is no login by design. Clear site data, switch
 * browsers or buy a new laptop and paid-for credits become unreachable, with the
 * only route back being an operator issuing a restore link by hand. This is the
 * customer's own spare key, minted at the moment we know they are the legitimate
 * buyer (see functions/api/verify-session.js).
 *
 * Not a toast: a 5-second banner is the wrong container for "keep this
 * permanently". It must be dismissed deliberately.
 */
export function RecoveryLinkModal({ url, expiresAt, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  const copy = () => {
    navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {});
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      padding: 16,
    }}>
      <div style={{
        background: "rgba(15,23,42,0.98)", border: "1px solid rgba(94,234,212,0.35)",
        borderRadius: 14, padding: "24px 22px", maxWidth: 520, width: "100%",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#5eead4", marginBottom: 8 }}>
          🔑 Save your recovery link
        </div>
        <div style={{ fontSize: 12.5, color: "#94a3b8", lineHeight: 1.6, marginBottom: 14 }}>
          AiRA has no accounts or passwords, so your credits are tied to <strong>this browser</strong>.
          This link is how you get them back if you clear your browser data, switch browsers, or move
          to a new computer. <strong style={{ color: "#e2e8f0" }}>Bookmark it or email it to yourself now</strong> —
          we cannot show it to you again later if you lose access to this browser.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            style={{
              flex: 1, background: "#0a1628", border: "1px solid #1e3a5f", color: "#5eead4",
              borderRadius: 6, padding: "6px 8px", fontSize: 11, fontFamily: "monospace",
            }}
          />
          <button
            onClick={copy}
            style={{
              background: copied ? "#0d9488" : "#334155", border: "none", borderRadius: 6,
              color: "white", padding: "6px 14px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 16 }}>
          Anyone with this link can use your credits — keep it private.
          {expiresAt && ` Valid until ${new Date(expiresAt).toLocaleDateString()}.`}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "#0d9488", border: "none", borderRadius: 8, color: "white",
            padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          I've saved it
        </button>
      </div>
    </div>
  );
}

/**
 * Pull the restore token out of whatever the user pasted.
 *
 * They will paste the whole URL far more often than a bare token — it is what
 * the recovery modal hands them and what lands in their email — and a paste box
 * that only accepts the token would reject the normal case. Also tolerates a
 * leading "?"/"&", surrounding whitespace, and a link carrying other params.
 *
 * Returns null when there is nothing token-shaped, so the caller can say "that
 * doesn't look like a restore link" without a round-trip to the server.
 */
export function extractRestoreToken(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  // Any URL-ish input: read the query param wherever it sits.
  const m = raw.match(/[?&]restore=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  // A bare token. Reject anything with URL/whitespace punctuation so an
  // accidental paste of the whole page isn't sent to the server as a token.
  if (/^[A-Za-z0-9_-]{16,200}$/.test(raw)) return raw;
  return null;
}

/**
 * The other half of RecoveryLinkModal. That one SHOWS the link on the browser
 * that already has access; this one ACCEPTS it on the browser that doesn't.
 *
 * Without it the no-credits state was a dead end: it correctly told the user
 * their purchase was safe and to "use your restore link", while the only button
 * on screen was Buy Credits — so the path of least resistance was paying twice.
 * `redeemRestoreToken` existed but was reachable only by loading a ?restore= URL,
 * which is useless if the link arrived in a password manager, a note, or by
 * being read off another screen.
 */
export function RestoreAccessModal({ onClose, onRestored }) {
  const [text, setText]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone]   = useState(null);

  const submit = async () => {
    const token = extractRestoreToken(text);
    if (!token) {
      setError("That doesn't look like a restore link. Paste the whole link, including the part after ?restore=.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Server messages are already specific (not recognised / expired / used on
      // too many devices) — surface them verbatim rather than flattening three
      // different problems into one "restore failed".
      const { credits } = await redeemRestoreToken(token);
      setDone(credits);
      onRestored?.(credits);
    } catch (e) {
      setError(e.message || "Restore failed.");
    } finally {
      setBusy(false);
    }
  };

  const field = {
    width: "100%", background: "#0a1628", border: "1px solid #1e3a5f", color: "#e2e8f0",
    borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16,
    }}>
      <div style={{
        background: "rgba(15,23,42,0.98)", border: "1px solid rgba(94,234,212,0.35)",
        borderRadius: 14, padding: "24px 22px", maxWidth: 560, width: "100%",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#5eead4", marginBottom: 8 }}>
          🔑 Restore your credits on this device
        </div>

        {done != null ? (
          <>
            <div style={{ fontSize: 13, color: "#34d399", lineHeight: 1.6, marginBottom: 16 }}>
              Restored — <strong>{done.toLocaleString()} credits</strong> are now available in this
              browser. You can keep using the same link on your other devices.
            </div>
            <button onClick={onClose} style={{
              background: "#0d9488", border: "none", borderRadius: 8, color: "white",
              padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Done</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "#94a3b8", lineHeight: 1.6, marginBottom: 12 }}>
              AiRA has no accounts or passwords — your credits live in our database against your
              payment, and this browser's only claim on them is a key stored locally. That key does
              not travel between browsers or computers, which is why this device shows none.
            </div>
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: "10px 12px", marginBottom: 14,
              fontSize: 12, color: "#cbd5e1", lineHeight: 1.7,
            }}>
              <strong style={{ color: "#e2e8f0" }}>To move credits to this device:</strong>
              <div>1. Open AiRA on the computer where your credits already work.</div>
              <div>2. Action Plan tab → click <strong>🔑 recovery link</strong> → Copy.</div>
              <div>3. Paste it below. (Or just open that link in this browser.)</div>
              <div style={{ color: "#64748b", marginTop: 4 }}>
                No longer have that computer? Contact support with your payment email and we'll issue
                a new link.
              </div>
            </div>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }}
              placeholder="https://aira.tiredtoretire.com/?restore=…"
              style={field}
            />
            {error && (
              <div style={{ fontSize: 12, color: "#f87171", marginTop: 8, lineHeight: 1.5 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={submit} disabled={busy} style={{
                background: busy ? "#334155" : "#0d9488", border: "none", borderRadius: 8, color: "white",
                padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer",
              }}>{busy ? "Restoring…" : "Restore credits"}</button>
              <button onClick={onClose} style={{
                background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
                color: "#94a3b8", padding: "8px 18px", fontSize: 13, cursor: "pointer",
              }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
