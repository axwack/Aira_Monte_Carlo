/**
 * admin-panel.js — Hidden admin panel for testing the Stripe billing integration.
 *
 * Activation: add ?aira_admin=1 to the app URL.
 * The panel is only rendered when that param is present — invisible to normal users.
 *
 * All server calls go to /api/admin and require the ADMIN_SECRET you set
 * as a Cloudflare Pages env var (or in .dev.vars locally).
 */

import { useState, useCallback, useEffect } from "react";
import { syncCreditBalance, getStoredJWT } from "./credits.js";

const JWT_KEY        = "airaJWT.v1";
const ADMIN_CFG_KEY  = "aira_admin_cfg.v1";  // localStorage only — never committed

function loadAdminCfg() {
  try {
    const raw = localStorage.getItem(ADMIN_CFG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAdminCfg(patch) {
  try {
    const current = loadAdminCfg();
    localStorage.setItem(ADMIN_CFG_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {}
}

export function useAdminMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("aira_admin");
}

/* Owner verification (drives the un-nagged report preview).
 * `?aira_admin=1` alone can't unlock anything — the param name ships in the
 * bundle, so a client-side-only check would hand every reader a free
 * 250-credit report. The flag below only gets set after /api/admin answers
 * "ok" to a `ping` carrying ADMIN_SECRET, which is a server-side env var and
 * isn't in the bundle. It lives in memory, never persisted, so it has to be
 * re-earned by the auto-connect ping on every page load.
 */
let ownerVerified = false;
const ownerListeners = new Set();

function setOwnerVerified(v) {
  if (ownerVerified === v) return;
  ownerVerified = v;
  ownerListeners.forEach(fn => { try { fn(v); } catch {} });
}

/** True once the admin secret has been verified by the server this session. */
export function useOwnerVerified() {
  const [v, setV] = useState(ownerVerified);
  useEffect(() => {
    ownerListeners.add(setV);
    setV(ownerVerified);
    return () => { ownerListeners.delete(setV); };
  }, []);
  return v;
}

async function adminCall(secret, action, params = {}) {
  // A rejected fetch (DNS, offline, TLS, blocked request) used to propagate
  // out of here. The section handlers do `setLoading(true); await
  // adminCall(...)` with no try/catch, so the throw skipped
  // `setLoading(false)` and left the button stuck on "…" rendering nothing —
  // a silent hang that looked like "no response". So this always resolves to
  // a result object, so the UI can show something even when the request
  // never left the browser.
  //
  // Sanitize the pasted secret before it reaches fetch. Two paste hazards
  // here, both of which used to show up as an unexplained failure:
  //
  //   1. A character outside ISO-8859-1 (a smart quote, an em dash, an
  //      ellipsis) makes fetch refuse to build the request — "String
  //      contains non ISO-8859-1 code point" — so nothing is sent and the
  //      panel just looks like it's hung. Copying from formatted text (a
  //      doc, a chat window) is enough to cause this.
  //   2. A non-breaking space (U+00A0) is valid ISO-8859-1 though, so it
  //      sails through that check and gets sent — then fails the server's
  //      exact comparison and returns a bare "Unauthorized", indistinguishable
  //      from a wrong password.
  //
  // So: trim outer whitespace including NBSP and zero-width characters
  // (never meaningful in a secret, always a paste artifact), then reject
  // anything left that a header can't carry — and say why, instead of just
  // failing.
  const clean = String(secret ?? "").replace(/^[\s ​-‍﻿]+|[\s ​-‍﻿]+$/g, "");
  if (!clean) return { ok: false, error: "No secret entered." };
  const bad = [...clean].find((ch) => ch.charCodeAt(0) > 0x7e || ch.charCodeAt(0) < 0x21);
  if (bad) {
    const code = "U+" + bad.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
    return {
      ok: false,
      error: `Your secret contains a character that cannot be sent in an HTTP header (${code}). `
           + `This almost always means it was copied from formatted text — a smart quote, dash, ellipsis or `
           + `non-breaking space came with it. Paste it from a plain-text source, or type it by hand.`,
    };
  }

  let res;
  try {
    res = await fetch("/api/admin", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${clean}`,
      },
      body: JSON.stringify({ action, ...params }),
    });
  } catch (e) {
    return {
      ok: false,
      error: `Request never reached the server (${e.message || "network error"}). `
           + `Check you are on the deployed site or wrangler pages dev, and that the deployment finished.`,
    };
  }
  // A non-JSON body means we did not reach the Function at all. The overwhelming
  // cause is running under `npm start`: react-scripts serves only src/, so
  // /api/* returns the SPA's 404 HTML and this used to surface as a bare
  // "HTTP 404" — indistinguishable from a wrong secret. That ambiguity cost real
  // debugging time twice in one session, so it now says what happened.
  const data = await res.json().catch(() => ({
    ok: false,
    error: res.status === 404
      ? "HTTP 404 — /api/admin was not reached. `npm start` does not serve Cloudflare Functions; use `npx wrangler pages dev build` (port 8788) or the deployed site."
      : `HTTP ${res.status} — response was not JSON, so the request did not reach the Function.`,
  }));
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

// ── Timestamps ────────────────────────────────────────────────────────
// Every timestamp in D1 is an INTEGER unixepoch (db/schema.sql). Dumped straight
// into JSON that renders as a bare 10-digit number, which no one can read — a
// dispute trace had to be run from the wrangler CLI with datetime() wrapped round
// every column because the panel's own output was useless. Format at the point of
// display, once, here.
//
// Local time, not UTC: this is an operator tool and the operator is comparing
// these rows against a Stripe dashboard and a customer's email, both of which
// speak local time. The zone is named next to the value so a screenshot pasted
// into a dispute response is unambiguous about which clock it is on.
const ADMIN_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "local"; }
  catch { return "local"; }
})();

function fmtEpoch(sec) {
  const n = Number(sec);
  if (sec == null || !Number.isFinite(n)) return "—";
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
}

// The question an operator actually asks of a support timestamp is "how long
// ago", not "what date" — shown alongside the absolute value, never instead of it.
function fmtAgo(sec) {
  const n = Number(sec);
  if (sec == null || !Number.isFinite(n)) return "";
  const secsAgo = Math.floor(Date.now() / 1000) - n;
  if (secsAgo < 0)     return "in the future";
  if (secsAgo < 60)    return "just now";
  const mins = Math.floor(secsAgo / 60);
  if (mins < 60)       return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)        return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 60)       return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

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
  const [email, setEmail]     = useState(() => loadAdminCfg().testEmail || "");
  const [packId, setPackId]   = useState(() => loadAdminCfg().testPack  || "starter");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);

  const handleEmail = v => { setEmail(v); saveAdminCfg({ testEmail: v }); };
  const handlePack  = v => { setPackId(v); saveAdminCfg({ testPack: v }); };

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
        <Field label="Email" value={email} onChange={handleEmail} placeholder="test@example.com" />
        <div style={{ minWidth: 90 }}>
          <div style={S.label}>Pack</div>
          <select value={packId} onChange={e => handlePack(e.target.value)} style={{ ...S.input, padding: "6px 6px" }}>
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
  const [email, setEmail]     = useState(() => loadAdminCfg().testEmail || "");
  const [credits, setCredits] = useState("5000");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);

  const handleEmail = v => { setEmail(v); saveAdminCfg({ testEmail: v }); };

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
        <Field label="Email" value={email} onChange={handleEmail} placeholder="test@example.com" />
        <Field label="Credits" value={credits} onChange={setCredits} type="number" placeholder="5000" />
        <button onClick={run} disabled={disabled || loading || !email} style={S.btn("#d97706")}>
          {loading ? "…" : "Grant"}
        </button>
      </div>
      <ResultBox data={result} />
    </div>
  );
}

// ── Section: Issue Restore Link ───────────────────────────────────────────────
// The endpoint has supported `issue-restore-link` since restore tokens existed,
// but nothing in this panel called it — so the one support task that actually
// arrives from customers ("I lost my credits") could only be done by hand with
// curl, which on Windows means fighting PowerShell quoting for a routine job.
// Copy button included because the whole output is a URL you have to paste
// somewhere else, and selecting it out of a JSON blob is where mistakes happen.

function RestoreLinkSection({ secret, disabled }) {
  const [email, setEmail]   = useState(() => loadAdminCfg().testEmail || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleEmail = v => { setEmail(v); saveAdminCfg({ testEmail: v }); };

  const run = async () => {
    setLoading(true); setResult(null); setCopied(false);
    // days/maxUses left at the endpoint's defaults (14 days, 3 uses): a
    // support-issued link is a one-off remedy, unlike the customer's own
    // recovery link minted at checkout, which is deliberately long-lived.
    const r = await adminCall(secret, "issue-restore-link", { email });
    setResult(r); setLoading(false);
  };

  const copy = () => {
    if (!result?.url) return;
    navigator.clipboard?.writeText(result.url)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <div style={S.section}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
        Issue Restore Link (customer lost their credits)
      </div>
      <div style={S.row}>
        <Field label="Email" value={email} onChange={handleEmail} placeholder="customer@example.com" />
        <button onClick={run} disabled={disabled || loading || !email} style={S.btn("#0d9488")}>
          {loading ? "…" : "Issue"}
        </button>
      </div>
      {result?.ok && result.url && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>
            Send this to the customer. Anyone holding it gets these credits — send it directly,
            never in a public channel. {result.maxUses} uses, expires {result.expiresAt?.slice(0, 10)}.
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              readOnly
              value={result.url}
              onFocus={e => e.target.select()}
              style={{
                flex: 1, background: "#0a1628", border: "1px solid #1e3a5f", color: "#5eead4",
                borderRadius: 6, padding: "4px 8px", fontSize: 10, fontFamily: "monospace",
              }}
            />
            <button onClick={copy} style={S.btn(copied ? "#0d9488" : "#475569")}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      {/* Errors and the ambiguous-email 409 (which returns `candidates`) still
          need the raw view — that is the case where you must re-run with an
          explicit customerId. */}
      {result && !result.url && <ResultBox data={result} />}
    </div>
  );
}

// ── Section: Inspect ──────────────────────────────────────────────────────────

function CustomerCard({ customer }) {
  const disputed  = customer.status === "disputed";
  const statusCol = disputed ? "#fca5a5" : customer.status === "active" ? "#6ee7b7" : "#fbbf24";
  const rows = [
    ["Customer",  customer.stripe_customer_id],
    ["Email",     customer.email || "—"],
    ["Credits",   Number(customer.credits ?? 0).toLocaleString()],
    ["Status",    customer.status],
    ["Created",   `${fmtEpoch(customer.created_at)}  ·  ${fmtAgo(customer.created_at)}`],
    ["Last seen", `${fmtEpoch(customer.updated_at)}  ·  ${fmtAgo(customer.updated_at)}`],
  ];
  return (
    <div style={{
      marginTop: 8, padding: "8px 10px", borderRadius: 6, fontSize: 11,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${disputed ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.10)"}`,
    }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
          <div style={{ width: 74, flexShrink: 0, color: "#64748b" }}>{k}</div>
          <div style={{
            flex: 1, wordBreak: "break-all",
            color: k === "Status" ? statusCol : "#e2e8f0",
            fontWeight: k === "Status" || k === "Credits" ? 700 : 400,
          }}>{v}</div>
        </div>
      ))}
      <div style={{ marginTop: 4, color: "#475569", fontSize: 10 }}>
        Times shown in {ADMIN_TZ}.
      </div>
    </div>
  );
}

function TxnTable({ txns }) {
  if (!txns?.length) {
    return <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>No transactions.</div>;
  }
  const cell = { padding: "3px 6px", borderBottom: "1px solid rgba(255,255,255,0.05)" };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ ...S.label, marginBottom: 4 }}>
        Ledger — newest first ({txns.length} shown, max 20)
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
        <thead>
          <tr style={{ color: "#64748b", textAlign: "left" }}>
            <th style={cell}>When</th>
            <th style={cell}>Type</th>
            <th style={{ ...cell, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {txns.map(t => (
            <tr key={t.id}>
              <td style={{ ...cell, color: "#94a3b8", whiteSpace: "nowrap" }}>
                {fmtEpoch(t.created_at)}
                <div style={{ color: "#475569", fontSize: 9.5 }}>{fmtAgo(t.created_at)}</div>
              </td>
              <td style={{ ...cell, color: "#cbd5e1" }}>
                {t.type}
                {t.stripe_session_id && (
                  <div style={{ color: "#475569", fontSize: 9, wordBreak: "break-all" }}>
                    {t.stripe_session_id}
                  </div>
                )}
              </td>
              <td style={{
                ...cell, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap",
                color: Number(t.amount) > 0 ? "#6ee7b7" : Number(t.amount) < 0 ? "#fca5a5" : "#64748b",
              }}>
                {Number(t.amount) > 0 ? "+" : ""}{Number(t.amount ?? 0).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InspectSection({ secret, disabled }) {
  const [who, setWho]       = useState(() => loadAdminCfg().testEmail || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleWho = v => { setWho(v); saveAdminCfg({ testEmail: v }); };

  const run = async () => {
    setLoading(true); setResult(null);
    // The endpoint has always accepted either key, but the panel only ever sent
    // `email` — so a Stripe customer id, which is what a dispute notification
    // actually hands you, could not be looked up here at all. Route on the
    // `cus_` prefix Stripe guarantees.
    const id = who.trim();
    const r = await adminCall(secret, "inspect",
      id.startsWith("cus_") ? { customerId: id } : { email: id });
    setResult(r); setLoading(false);
  };

  const found = result?.ok && result.found && result.customer;

  return (
    <div style={S.section}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
        Inspect D1 Customer
      </div>
      <div style={S.row}>
        <Field
          label="Email or customer ID"
          value={who}
          onChange={handleWho}
          placeholder="test@example.com or cus_…"
        />
        <button onClick={run} disabled={disabled || loading || !who.trim()} style={S.btn("#475569")}>
          {loading ? "…" : "Inspect"}
        </button>
      </div>
      {found && (
        <>
          <CustomerCard customer={result.customer} />
          <TxnTable txns={result.transactions} />
        </>
      )}
      {/* Not-found and error paths keep the raw view — that is where the
          unformatted payload (candidates, D1 errors, the id that missed) is
          the thing you need to read. */}
      {result && !found && <ResultBox data={result} />}
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
  const clearAdminCfg = () => {
    try {
      localStorage.removeItem(ADMIN_CFG_KEY);
      setOwnerVerified(false);   // drops the un-nagged report preview too
      setMsg("Admin config cleared — secret and email wiped.");
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
        <button onClick={clearAll} style={S.btn("#991b1b")}>Clear JWT + balance</button>
        <button onClick={clearAdminCfg} style={S.btn("#7f1d1d")}>Forget saved secret</button>
      </div>
      {msg && <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>{msg}</div>}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AdminPanel() {
  const active = useAdminMode();
  const [open, setOpen]             = useState(true);
  const [secret, setSecret]         = useState(() => loadAdminCfg().adminSecret || "");
  const [authed, setAuthed]         = useState(false);
  const [pingResult, setPingResult] = useState(null);
  const [pinging, setPinging]       = useState(false);

  const handleSecret = v => { setSecret(v); saveAdminCfg({ adminSecret: v }); };

  // Auto-connect on mount if a saved secret exists
  useEffect(() => {
    const saved = loadAdminCfg().adminSecret;
    if (saved && active) {
      adminCall(saved, "ping").then(r => { if (r.ok) { setAuthed(true); setOwnerVerified(true); } });
    }
  }, [active]);

  const ping = useCallback(async () => {
    setPinging(true); setPingResult(null);
    const r = await adminCall(secret, "ping");
    setPingResult(r);
    if (r.ok) { setAuthed(true); setOwnerVerified(true); saveAdminCfg({ adminSecret: secret }); }
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
            secret={secret} setSecret={handleSecret}
            onPing={ping} loading={pinging} result={pingResult}
          />
          <StripePingSection   secret={secret} disabled={!authed} />
          <SimulatePurchaseSection secret={secret} disabled={!authed} />
          <GrantCreditsSection secret={secret} disabled={!authed} />
          <InspectSection      secret={secret} disabled={!authed} />
          {/* Inspect first, then issue — confirm you have the right customer
              before handing out a bearer credential to their credits. */}
          <RestoreLinkSection  secret={secret} disabled={!authed} />
          <LocalStateSection />
        </div>
      )}
    </div>
  );
}
