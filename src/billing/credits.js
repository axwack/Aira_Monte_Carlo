import { useState, useEffect } from "react";
import { BILLING_ENABLED } from "../ai/ai-analysis.js";
import { track } from "../analytics.js";

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

export const FREE_STARTER_CREDITS = 5_000;
export const RAW_TOKENS_PER_CREDIT = 1_000;

export const REPORT_COST_CREDITS = 250;

const REPORT_UNLOCK_KEY = "aira_report_unlock";

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
      localStorage.setItem(STUB_BALANCE_KEY, String(FREE_STARTER_CREDITS));
      return FREE_STARTER_CREDITS;
    }
    return Math.max(0, parseInt(raw, 10) || 0);
  } catch { return 0; }
}

export function getCreditBalance() {
  return _readCachedBalance();
}

export function syncCreditBalance(credits) {
  const n = Math.max(0, credits);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(BILLING_ENABLED ? CACHED_BALANCE_KEY : STUB_BALANCE_KEY, String(n));
    }
  } catch {}
  _notifyListeners(n);
}

export async function fetchCreditBalance() {
  if (!BILLING_ENABLED) return getCreditBalance();

  const jwt = getStoredJWT();
  if (!jwt) return null;

  try {
    const res = await fetch("/api/balance", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 401) {
      clearStoredJWT();
      return null;
    }
    if (!res.ok) return null;
    const { credits, token } = await res.json();
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
    fetchCreditBalance().then(b => { if (b !== null) setBalance(b); });
    return subscribeCreditBalance(setBalance);
  }, []);

  return balance;
}

export function rawTokensToCredits(totalRawTokens) {
  return Math.ceil(totalRawTokens / RAW_TOKENS_PER_CREDIT);
}

export const MIN_CREDITS_TO_RUN = 50;

export const LOW_BALANCE_WARN_AT = MIN_CREDITS_TO_RUN * 10;

export function hasEnoughCredits(minCredits = MIN_CREDITS_TO_RUN) {
  return _readCachedBalance() >= minCredits;
}

export function deductCredits(totalRawTokens) {
  if (BILLING_ENABLED) return;
  const cost    = rawTokensToCredits(totalRawTokens);
  const current = _readCachedBalance();
  const next    = Math.max(0, current - cost);
  try { localStorage.setItem(STUB_BALANCE_KEY, String(next)); } catch {}
  _notifyListeners(next);
  return cost;
}

export async function purchaseCreditPack(packId) {
  const pack = CREDIT_PACKS.find(p => p.id === packId);
  if (!pack) throw new Error(`Unknown pack: ${packId}`);
  track("checkout_start");

  if (!BILLING_ENABLED) {
    console.warn("[BILLING STUB] Would redirect to Stripe for", pack.label);
    const current = _readCachedBalance();
    const next    = current + pack.credits;
    try { localStorage.setItem(STUB_BALANCE_KEY, String(next)); } catch {}
    _notifyListeners(next);
    return { success: true, creditsAdded: pack.credits, newBalance: next };
  }

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
  window.location.href = url;
}

export const REPORT_PRICE_USD = 9.00;

export async function purchaseReport() {
  track("report_checkout_start");
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
    if (err.stripeError) console.error("[checkout] Stripe rejected the report price:", err.stripeError, "—", err.hint || "");
    throw new Error(
      err.stripeError
        ? "This purchase isn't available right now — we've been notified."
        : (err.error || "Checkout failed")
    );
  }
  const { url } = await res.json();
  window.location.href = url;
}

export async function unlockReport() {
  track("report_unlock");
  const jwt = getStoredJWT();
  if (!jwt) throw new Error("Not authenticated — please purchase AiRA credits to continue.");

  const res = await fetch("/api/report-unlock", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body:    JSON.stringify({}),
  });

  if (res.status === 401) {
    clearStoredJWT();
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

export function isReportUnlocked() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(REPORT_UNLOCK_KEY);
    if (!raw) return false;
    const { unlockedUntil, permanent } = JSON.parse(raw);
    if (permanent) return true;
    return !!unlockedUntil && new Date(unlockedUntil).getTime() > Date.now();
  } catch { return false; }
}

export async function fetchReportCapability() {
  try {
    const res = await fetch("/api/report-capability");
    if (!res.ok) return false;
    const { available } = await res.json();
    return !!available;
  } catch { return false; }
}

export function useReportCapability() {
  const [capable, setCapable] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchReportCapability().then(v => { if (alive) setCapable(v); });
    return () => { alive = false; };
  }, []);
  return capable;
}

export async function fetchReportUnlockStatus() {
  const jwt = getStoredJWT();
  if (!jwt) return { unlocked: false, unlockedUntil: null };
  try {
    const res = await fetch("/api/report-unlock", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 401) { clearStoredJWT(); return { unlocked: false, unlockedUntil: null }; }
    if (!res.ok) return null;
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

export function useReportUnlocked(bump = 0) {
  const [unlocked, setUnlocked] = useState(isReportUnlocked);

  useEffect(() => {
    if (!BILLING_ENABLED) { setUnlocked(true); return; }
    let alive = true;
    fetchReportUnlockStatus().then(r => {
      if (alive && r) setUnlocked(r.unlocked);
    });
    return () => { alive = false; };
  }, [bump]);

  return unlocked;
}

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
  if (restoreUrl) setStoredRecoveryLink(restoreUrl, restoreExpiresAt);

  if (packId === "report") {
    for (let i = 0; i < 6; i++) {
      const status = await fetchReportUnlockStatus();
      if (status?.unlocked) return { packId, reportUnlocked: true, restoreUrl };
      await new Promise(r => setTimeout(r, 2000));
    }
    return { packId, reportUnlocked: false, restoreUrl };
  }

  if (initialCredits === 0) {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const polled = await fetchCreditBalance();
      if (polled > 0) return { credits: polled, restoreUrl };
    }
  }

  return { credits: initialCredits, restoreUrl };
}

const RECOVERY_KEY = "airaRecoveryLink.v1";

export function setStoredRecoveryLink(url, expiresAt = null) {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ url, expiresAt }));
  } catch {}
}

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

export function useStripeReturn() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!BILLING_ENABLED) return;
    const params    = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const nonce     = params.get("nonce");
    if (!sessionId) return;

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
      .then(({ credits, restoreUrl, packId, reportUnlocked }) =>
        setStatus({ success: true, credits, restoreUrl, packId, reportUnlocked }))
      .catch(e => setStatus({ success: false, error: e.message }));
  }, []);

  return status;
}

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

export function extractRestoreToken(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const m = raw.match(/[?&]restore=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  if (/^[A-Za-z0-9_-]{16,200}$/.test(raw)) return raw;
  return null;
}

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
      if (result) setDone(result);
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
