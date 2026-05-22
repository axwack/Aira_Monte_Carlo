/**
 * admin-panel.js — Hidden admin panel for testing the Stripe billing integration.
 *
 * Activation: add ?aira_admin=1 to the app URL.
 * The panel is only rendered when that param is present — invisible to normal users.
 *
 * All server calls go to /api/admin and require the ADMIN_SECRET you set
 * as a Cloudflare Pages env var (or in .dev.vars locally).
 */

import { useState, useCallback } from "react";
import { syncCreditBalance, getStoredJWT } from "./credits.js";

const JWT_KEY = "airaJWT.v1";

export function useAdminMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("aira_admin");
}

async function adminCall(secret, action, params = {}) {
  const res = await fetch("/api/admin", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${secret}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!res.ok && data.ok === undefined) return { ok: false, error: `HTTP ${res.status}` };
  return data;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed", bottom: 80, right: 20, zIndex: 99990,
    width: 420, maxHeight: "80vh", overflowY: "auto",
    background: "rgba(10,14,26,0.97)", border: "1px solid rgba(139,92,246,0.4)",
    borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    fontFamily: "monospace", fontSize: 12, color: "#e2e8f0",
  },
  header: {
    background: "rgba(139,92,246,0.15)", borderBottom: "1px solid rgba(139,92,246,0.25)",
    padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center",
    cursor: "pointer", userSelect: "none",
  },
  body:  { padding: "12px 14px" },
  label: { fontSize: 10, color: "#64748b", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" },
  input: {
    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6, padding: "6px 8px", color: "#e2e8f0", fontSize: 12, outline: "none",
    boxSizing: "border-box",
  },
  btn: (color = "#7c3aed") => ({
    background: `linear-gradient(135deg,${color},${color}cc)`, border: "none",
    color: "white", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap",
  }),
  row:    { display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 8 },
  result: (ok) => ({
    marginTop: 6, padding: "7px 10px", borderRadius: 6, fontSize: 11, lineHeight: 1.5,
    background: ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
    border: `1px solid ${ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
    color: ok ? "#6ee7b7" : "#fca5a5", wordBreak: "break-all",
  }),
  section: {
    borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, marginTop: 10,
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ResultBox({ data }) {
  if (!data) return null;
  return (
    <div style={S.result(data.ok)}>
      {data.ok ? "✓ " : "✗ "}
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={S.label}>{label}</div>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={S.input}
      />
    </div>
  );
}

// ── Section: Auth ─────────────────────────────────────────────────────────────

function AuthSection({ secret, setSecret, onPing, loading, result }) {
  return (
    <div>
      <div style={S.label}>Admin secret (ADMIN_SECRET env var)</div>
      <div style={S.row}>
        <Field label="" value={secret} onChange={setSecret} type="password" placeholder="Enter ADMIN_SECRET…" />
        <button onClick={onPing} disabled={loading || !secret} style={S.btn()}>
          {loading ? "…" : "Connect"}
        </button>
      </div>
      <ResultBox data={result} />
    </div>
  );
}

// ── Section: Stripe Ping ──────────────────────────────────────────────────────

function StripePingSection({ secret, disabled }) {
  const [overrideKey, setOverrideKey] = useState("");
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const r = await adminCall(secret, "stripe-ping", overrideKey ? { stripeKey: overrideKey } : {});
    setResult(r); setLoading(false);
  };

  return (
    <div style={S.section}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
        Test Stripe Connection
      </div>
      <div style={S.row}>
        <Field
          label="Override sk_key (optional — leave blank to use configured key)"
          value={overrideKey} onChange={setOverrideKey}
          type="password" placeholder="sk_test_… or sk_live_…"
        />
        <button onClick={run} disabled={disabled || loading} style={S.btn("#0284c7")}>
          {loading ? "…" : "Ping"}
        </button>
      </div>
      <ResultBox data={result} />
    </div>
  );
}

// ── Section: Simulate Purchase ────────────────────────────────────────────────

function SimulatePurchaseSection({ secret, disabled }) {
  const [email, setEmail]   = useState("");
  const [packId, setPackId] = useState("starter");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const r = await adminCall(secret, "simulate-purchase", { email, packId });
    if (r.ok && r.jwt) {
      try { localStorage.setItem(JWT_KEY, r.jwt); } catch {}
      syncCreditBalance(r.balance ?? r.credits ?? 0);
    }
    setResult(r); setLoading(false);
  };

  return (
    <div style={S.section}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
        Simulate Purchase (writes D1 + issues JWT)
      </div>
      <div style={S.row}>
        <Field label="Email" value={email} onChange={setEmail} placeholder="test@example.com" />
        <div style={{ minWidth: 90 }}>
          <div style={S.label}>Pack</div>
          <select value={packId} onChange={e => setPackId(e.target.value)} style={{ ...S.input, padding: "6px 6px" }}>
            <option value="starter">Starter 5K</option>
            <option value="value">Value 10K</option>
            <option value="pro">Pro 15K</option>
          </select>
        </div>
        <button onClick={run} disabled={disabled || loading || !email} style={S.btn("#059669")}>
          {loading ? "…" : "Simulate"}
        </button>
      </div>
      {result?.ok && (
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
          JWT written to localStorage — credit badge will update automatically.
        </div>
      )}
      <ResultBox data={result} />
    </div>
  );
}

// ── Section: Grant Credits ────────────────────────────────────────────────────

function GrantCreditsSection({ secret, disabled }) {
  const [email, setEmail]     = useState("");
  const [credits, setCredits] = useState("5000");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const r = await adminCall(secret, "grant-credits", { email, credits: parseInt(credits, 10) || 5000 });
    if (r.ok) syncCreditBalance(r.newBalance ?? 0);
    setResult(r); setLoading(false);
  };

  return (
    <div style={S.section}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
        Grant Credits (no Stripe required)
      </div>
      <div style={S.row}>
        <Field label="Email" value={email} onChange={setEmail} placeholder="test@example.com" />
        <Field label="Credits" value={credits} onChange={setCredits} type="number" placeholder="5000" />
        <button onClick={run} disabled={disabled || loading || !email} style={S.btn("#d97706")}>
          {loading ? "…" : "Grant"}
        </button>
      </div>
      <ResultBox data={result} />
    </div>
  );
}

// ── Section: Inspect ──────────────────────────────────────────────────────────

function InspectSection({ secret, disabled }) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const r = await adminCall(secret, "inspect", { email });
    setResult(r); setLoading(false);
  };

  return (
    <div style={S.section}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
        Inspect D1 Customer
      </div>
      <div style={S.row}>
        <Field label="Email" value={email} onChange={setEmail} placeholder="test@example.com" />
        <button onClick={run} disabled={disabled || loading || !email} style={S.btn("#475569")}>
          {loading ? "…" : "Inspect"}
        </button>
      </div>
      <ResultBox data={result} />
    </div>
  );
}

// ── Section: Clear local state ────────────────────────────────────────────────

function LocalStateSection() {
  const [msg, setMsg] = useState(null);
  const clearAll = () => {
    try {
      localStorage.removeItem(JWT_KEY);
      localStorage.removeItem("airaCachedBalance.v1");
      localStorage.removeItem("airaCredits.v1");
      syncCreditBalance(0);
      setMsg("Local state cleared — reload to see fresh state.");
    } catch (e) { setMsg("Error: " + e.message); }
  };
  const showJwt = () => {
    const jwt = getStoredJWT();
    setMsg(jwt ? `JWT: ${jwt.slice(0, 40)}…` : "No JWT in localStorage");
  };
  return (
    <div style={S.section}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
        Local Browser State
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={showJwt} style={S.btn("#475569")}>Show JWT</button>
        <button onClick={clearAll} style={S.btn("#991b1b")}>Clear all (JWT + balance)</button>
      </div>
      {msg && <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>{msg}</div>}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AdminPanel() {
  const active = useAdminMode();
  const [open, setOpen]         = useState(true);
  const [secret, setSecret]     = useState("");
  const [authed, setAuthed]     = useState(false);
  const [pingResult, setPingResult] = useState(null);
  const [pinging, setPinging]   = useState(false);

  const ping = useCallback(async () => {
    setPinging(true); setPingResult(null);
    const r = await adminCall(secret, "ping");
    setPingResult(r);
    if (r.ok) setAuthed(true);
    setPinging(false);
  }, [secret]);

  if (!active) return null;

  return (
    <div style={S.overlay}>
      <div style={S.header} onClick={() => setOpen(o => !o)}>
        <span style={{ color: "#a78bfa", fontWeight: 700 }}>
          🔧 AiRA Admin {authed ? "✓" : ""}
        </span>
        <span style={{ color: "#64748b", fontSize: 10 }}>
          {open ? "▲ collapse" : "▼ expand"} · ?aira_admin=1
        </span>
      </div>
      {open && (
        <div style={S.body}>
          <AuthSection
            secret={secret} setSecret={setSecret}
            onPing={ping} loading={pinging} result={pingResult}
          />
          <StripePingSection   secret={secret} disabled={!authed} />
          <SimulatePurchaseSection secret={secret} disabled={!authed} />
          <GrantCreditsSection secret={secret} disabled={!authed} />
          <InspectSection      secret={secret} disabled={!authed} />
          <LocalStateSection />
        </div>
      )}
    </div>
  );
}
