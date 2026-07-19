/**
 * PrintReport.jsx
 *
 * Free-tier printable CFP/CPA-ready report. Renders a portal overlay with an
 * on-screen preview (Print/Close controls) plus a `.print-report` subtree that
 * is the ONLY thing visible when the browser's native print dialog runs
 * (window.print()) — no jsPDF, no server rendering, no new dependency.
 *
 * Data source: everything here is derived from data already in memory (the
 * live `params`/`mc`/`stress` the app just computed) — the report never
 * re-fetches or re-simulates anything except the withdrawal waterfall, which
 * is deterministic and cheap to recompute from `params`.
 */
import React, { useMemo, useState } from "react";
import { buildWithdrawalWaterfall } from "../engine/buildWithdrawalWaterfall.js";
import { expectedReturn } from "../engine/expectedReturn.js";
import {
  REPORT_COST_CREDITS,
  unlockReport,
  isAuthenticated,
  useCreditBalance,
  CreditPackModal,
} from "../billing/credits.js";

/* ── Local formatting helpers — full comma dollars, never k/M abbreviations ── */
export function formatMoney(v) {
  if (v == null || isNaN(v)) return "—";
  const n = Math.round(v);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

function formatPct(v, decimals = 1) {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}

/**
 * A local copy of App.jsx's getStrategyLabel — this module deliberately does
 * NOT import from ../App.jsx (App.jsx imports THIS file to render the Report
 * button/overlay, and importing back would create a circular module
 * dependency). Kept in sync by hand, same convention as
 * buildWithdrawalWaterfall.js's local realizedGainFor() copy.
 */
function getStrategyLabelLocal(strategy) {
  const labels = {
    smart: "Smart Waterfall",
    gk: "Guyton‑Klinger",
    fixed: "Fixed Percentage",
    vanguard: "Vanguard Dynamic Spending",
    risk: "Risk‑Based Guardrails",
    kitces: "Kitces Ratcheting",
    vpw: "VPW (Variable Percentage)",
    cape: "CAPE‑Based",
    endowment: "Endowment Model",
    one_n: "1/N (Remaining Years)",
    ninety_five_rule: "95% Rule",
    bengen: "Bengen 4% Rule",
  };
  return labels[strategy] || strategy || "—";
}

function bracketTargetLabel(target) {
  if (!target || target === "off") return "Off (uncapped)";
  if (target === "irmaa") return "IRMAA tier-1 ceiling";
  return `${target}% bracket ceiling`;
}

function bucketTotals(accounts = []) {
  const totals = { cash: 0, taxable: 0, pretax: 0, roth: 0 };
  for (const a of accounts) {
    const bal = a.balance || 0;
    if (a.category === "pretax") totals.pretax += bal;
    else if (a.category === "roth") totals.roth += bal;
    else if (a.category === "taxable") totals.taxable += bal;
    else totals.cash += bal; // cash + hsa
  }
  return totals;
}

/* ════════════════════════ Section components ════════════════════════ */

function CoverSection({ params, buildTag }) {
  const today = new Date().toLocaleDateString();
  return (
    <section className="pr-cover pr-row">
      <div className="pr-eyebrow">AiRA Freedom Financial</div>
      <h1>Retirement Plan Report</h1>
      {params.name && <div className="pr-name">{params.name}</div>}
      <div className="pr-cover-meta">Report date: {today}</div>
      <div className="pr-cover-meta">
        Plan horizon: Age {params.currentAge ?? "—"} → {params.endAge ?? "—"}
      </div>
      <div className="pr-cover-build">{buildTag}</div>
    </section>
  );
}

function AssumptionsSection({ params, rmdAge }) {
  const totals = bucketTotals(params.accounts);
  const total = totals.cash + totals.taxable + totals.pretax + totals.roth;
  const rows = [
    ["Retirement age", params.retireAge ?? "—"],
    ["Plan-to age", params.endAge ?? "—"],
    [
      "Social Security",
      `Claim at ${params.ssAge ?? "—"} · ${formatMoney(params.ssb)}/yr · COLA ${params.ssCola ?? "—"}%`,
    ],
    ["Inflation assumption", `${params.inf ?? "—"}%`],
    [
      "Pre-retirement equity glide",
      `${params.preRetireEq ?? "—"}/${100 - (params.preRetireEq ?? 0)} → ${expectedReturn(params.preRetireEq).toFixed(2)}% expected`,
    ],
    [
      "Post-retirement equity glide",
      `${params.postRetireEq ?? "—"}/${100 - (params.postRetireEq ?? 0)} → ${expectedReturn(params.postRetireEq).toFixed(2)}% expected`,
    ],
    ["Cash return", `${params.cashRealReturn ?? "—"}%`],
    ["Taxable cost basis", `${params.taxableBasisPct ?? "—"}% of balance`],
    ["Filing status", params.filingStatus === "single" ? "Single" : "Married Filing Jointly"],
    [
      "State of residence",
      `${params.stateOfResidence || "—"}${params.twoHousehold ? " (non-resident / two-household — state tax skipped)" : ""}`,
    ],
    ["Withdrawal strategy", getStrategyLabelLocal(params.withdrawalStrategy)],
    ["Withdrawal bracket target", bracketTargetLabel(params.withdrawalBracketTarget)],
    ["IRMAA guard", params.irmaaGuard ? "On" : "Off"],
    ["Roth emergency reserve", formatMoney(params.rothEmergencyReserve)],
    ["RMD start age", rmdAge ?? "—"],
  ];

  return (
    <section className="pr-section pr-row">
      <h2>Assumptions</h2>
      <div className="pr-two-col">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <h3>Account Balances</h3>
      <table>
        <thead>
          <tr>
            <th>Bucket</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Cash / HSA</td><td>{formatMoney(totals.cash)}</td></tr>
          <tr><td>Taxable</td><td>{formatMoney(totals.taxable)}</td></tr>
          <tr><td>Pre-Tax (IRA/401k)</td><td>{formatMoney(totals.pretax)}</td></tr>
          <tr><td>Roth</td><td>{formatMoney(totals.roth)}</td></tr>
          <tr className="pr-total-row"><td>Total</td><td>{formatMoney(total)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}

function MonteCarloSection({ mc, params }) {
  if (!mc) return null;
  const thisYear = new Date().getFullYear();
  const currentAge = params.currentAge;
  return (
    <section className="pr-section pr-row">
      <h2>Monte Carlo Verdict</h2>
      <div className="pr-two-col">
        <div><span>Success rate to plan age</span><strong>{formatPct(mc.rate)}</strong></div>
        {mc.mwRate != null && (
          <div><span>Chance money outlives you (mortality-weighted)</span><strong>{formatPct(mc.mwRate)}</strong></div>
        )}
        <div><span>Simulated paths</span><strong>{(mc.N ?? 0).toLocaleString()}</strong></div>
        <div><span>Median portfolio at retirement</span><strong>{formatMoney(mc.medR)}</strong></div>
        <div><span>Terminal 10th percentile</span><strong>{formatMoney(mc.term?.p10)}</strong></div>
        <div><span>Terminal median (50th)</span><strong>{formatMoney(mc.term?.p50)}</strong></div>
        <div><span>Terminal 90th percentile</span><strong>{formatMoney(mc.term?.p90)}</strong></div>
      </div>
      <p className="pr-note">
        <strong>What this means:</strong> the Monte Carlo replays your exact plan through
        thousands of alternate market histories drawn from roughly a century of real S&amp;P 500,
        bond, and inflation data. The "Still Funded" column below answers one question per age
        — in what share of those simulated futures did your accounts still have money? A "failed"
        path is not a loss of all income: Social Security, rental, and pension income keep paying
        in every path, and this is a conditional model, not a literal forecast. Read Still Funded
        alongside the 10th percentile column — a high funded rate paired with a thin 10th
        percentile is a fragile plan, one bad sequence of returns from joining the failures.
        The mortality-weighted figure answers the actuarial question instead of the planning
        one: the headline rate assumes you live to the full plan age, while the weighted rate
        discounts each failed path by the SSA probability of being alive at its failure age —
        the chance the money outlives <em>you</em>, rather than the horizon.
      </p>
      <table className="pr-wide-table">
        <thead>
          <tr>
            <th>Age</th><th>Year</th><th>Still Funded</th>
            <th>10th %ile</th><th>25th %ile</th><th>Median</th><th>75th %ile</th><th>90th %ile</th>
          </tr>
        </thead>
        <tbody>
          {(mc.pcts || []).map((d) => {
            const yr = currentAge != null ? thisYear + (d.age - currentAge) : null;
            return (
              <tr key={d.age} className="pr-row">
                <td>{d.age}</td>
                <td>{yr ?? "—"}</td>
                <td>{d.alive != null ? formatPct(d.alive) : "—"}</td>
                <td>{formatMoney(d.p10)}</td>
                <td>{formatMoney(d.p25)}</td>
                <td>{formatMoney(d.p50)}</td>
                <td>{formatMoney(d.p75)}</td>
                <td>{formatMoney(d.p90)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function StressTestSection({ stress }) {
  if (!stress) return null;
  return (
    <section className="pr-section pr-row">
      <h2>Stress Test</h2>
      <div className="pr-two-col">
        <div><span>Stress success rate</span><strong>{formatPct(stress.rate)}</strong></div>
        <div><span>Simulated paths</span><strong>{(stress.N ?? 0).toLocaleString()}</strong></div>
      </div>
      <p className="pr-note">
        This forces the actual 2000–2012 equity return sequence (dot-com crash into the Global
        Financial Crisis) to begin the year you retire — the single worst historical
        sequence-of-returns window for a new retiree — and re-runs your exact plan against it.
      </p>
    </section>
  );
}

function WithdrawalScheduleSection({ rows, endAge }) {
  if (!rows || rows.length === 0) return null;
  const anyConversion = rows.some((r) => r.conversionAmount > 0);
  return (
    <section className="pr-section pr-row">
      <h2>Withdrawal Schedule — Smart Waterfall</h2>
      <p className="pr-note">
        Year-by-year account sourcing for your chosen retirement plan (retire → age {endAge ?? "—"}),
        computed by the same tax-optimal waterfall engine used throughout the app: cash → taxable →
        pre-tax (bracket-capped) → Roth last.
      </p>
      <table className="pr-wide-table">
        <thead>
          <tr>
            <th>Age</th><th>Year</th><th>Spending</th><th>Fixed Income</th><th>Cash</th>
            <th>Taxable</th><th>Pre-Tax</th><th>Roth</th>
            {anyConversion && <th>Roth Conv</th>}
            <th>Fed</th><th>State</th><th>IRMAA</th><th>Total Draw</th><th>End Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const marks = `${r.landmines?.ssTorpedo ? "†" : ""}${r.landmines?.irmaaTriggered ? "‡" : ""}${r.landmines?.rmdActive ? "*" : ""}`;
            return (
              <tr key={r.age} className="pr-row">
                <td>{r.age}{marks && <sup>{marks}</sup>}</td>
                <td>{r.yr}</td>
                <td>{formatMoney(r.spending)}</td>
                <td>{formatMoney(r.fixedIncomeTotal)}</td>
                <td>{formatMoney(r.fromCash)}</td>
                <td>
                  {formatMoney(r.fromTaxable)}
                  {r.realizedGain > 0 ? ` (+${formatMoney(r.realizedGain)} gain)` : ""}
                </td>
                <td>
                  {formatMoney(r.fromPretax + r.rmd)}
                  {r.rmdActive ? " (RMD)" : ""}
                </td>
                <td>{formatMoney(r.fromRoth)}</td>
                {anyConversion && <td>{r.conversionAmount > 0 ? formatMoney(r.conversionAmount) : "—"}</td>}
                <td>{formatMoney(r.fedTax)}</td>
                <td>{formatMoney(r.stateTax)}</td>
                <td>{formatMoney(r.irmaa)}</td>
                <td>{formatMoney(r.totalWithdrawal)}</td>
                <td>{formatMoney(r.totalPort)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="pr-footnote">
        † SS torpedo triggered this year &nbsp;·&nbsp; ‡ IRMAA surcharge triggered this year &nbsp;·&nbsp; * RMD active this year
      </div>
    </section>
  );
}

function RothConversionSection({ rows }) {
  const convRows = (rows || []).filter((r) => r.conversionAmount > 0);
  if (convRows.length === 0) return null;
  return (
    <section className="pr-section pr-row">
      <h2>Roth Conversion Plan</h2>
      <p className="pr-note">
        IRMAA impacts from a conversion land two calendar years after the conversion (Medicare's
        2-year MAGI lookback) — a conversion in the "Year" column below may raise Medicare
        premiums two years later, not the same year.
      </p>
      <table>
        <thead>
          <tr><th>Year</th><th>Age</th><th>Conversion</th><th>Est. Tax on Conversion</th><th>MAGI</th></tr>
        </thead>
        <tbody>
          {convRows.map((r) => (
            <tr key={r.age} className="pr-row">
              <td>{r.yr}</td>
              <td>{r.age}</td>
              <td>{formatMoney(r.conversionAmount)}</td>
              <td>{formatMoney(r.conversionTax)}</td>
              <td>{formatMoney(r.magi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LifetimeTaxSection({ summary }) {
  if (!summary) return null;
  return (
    <section className="pr-section pr-row">
      <h2>Lifetime Tax Summary</h2>
      <div className="pr-two-col">
        <div><span>Smart Waterfall lifetime tax</span><strong>{formatMoney(summary.lifetimeTaxSmart)}</strong></div>
        <div><span>No-plan (pretax-first) lifetime tax</span><strong>{formatMoney(summary.lifetimeTaxNaive)}</strong></div>
      </div>
      <p className="pr-note">
        Following the tax-optimal sourcing order above saves an estimated{" "}
        <strong>{formatMoney(summary.taxSavings)}</strong> in lifetime taxes compared to draining
        pre-tax accounts first with no plan. This estimate assumes today's tax law holds for your
        entire retirement — verify with a CPA before acting on any single year's figures.
      </p>
    </section>
  );
}

function DisclaimerSection() {
  return (
    <section className="pr-section pr-row pr-disclaimer">
      <h2>Disclaimer</h2>
      <h3>1. Not Financial Advice</h3>
      <p>
        The AiRA Freedom Financial application (the "App") is provided as a financial modeling and
        educational tool for informational purposes only. It does not constitute professional
        financial, investment, tax, or legal advice. The developers of this app are not acting as
        your financial advisor, fiduciary, or broker through the provision of this App.
      </p>
      <p>
        All simulations, including Monte Carlo analyses and withdrawal strategies, are based on
        historical data and mathematical projections. Past performance is not indicative of future
        results. Financial markets are inherently volatile, and there is no guarantee that the
        assumptions used in the App will materialize.
      </p>
      <h3>2. Use at Your Own Risk &amp; Accuracy</h3>
      <p>
        While the logic and methodologies used in this tool are utilized by the developer for
        personal planning, they are provided "as is" and "as available." We make no warranties,
        express or implied, regarding the accuracy, completeness, or reliability of the
        calculations. Financial planning involves complex variables that may not be fully captured
        by this software. You are solely responsible for verifying any output from the App with a
        qualified professional before making any financial decisions.
      </p>
      <p className="pr-final-note">
        Generated by AiRA Freedom Financial — for informational purposes only. Verify with a
        qualified professional.
      </p>
    </section>
  );
}

/* ════════════════════════ Locked-mode unlock panel ════════════════════════
 * Soft client-side gate, by design: the report's data is entirely computed
 * in the browser from state the app already holds — nothing here is DRM.
 * The only thing actually enforced server-side is the credit deduction in
 * POST /api/report-unlock (and, in future, any AI-generated narrative added
 * to the report). This panel just decides whether to render the blurred vs.
 * clear version and lets the user pay to flip that decision.
 */
function UnlockPanel({ onUnlocked }) {
  const balance = useCreditBalance();
  const authed = isAuthenticated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [insufficient, setInsufficient] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    setInsufficient(false);
    try {
      await unlockReport();
      onUnlocked();
    } catch (e) {
      if (e.creditsRemaining != null || /insufficient/i.test(e.message || "")) {
        setInsufficient(true);
      } else {
        setError(e.message || "Unlock failed — please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pr-unlock-overlay">
      <div className="pr-unlock-card">
        <div className="pr-unlock-lock">🔒</div>
        <h3>Premium Report — {REPORT_COST_CREDITS.toLocaleString()} credits</h3>
        <p>Unlock the full printable CFP/CPA-ready report for 24 hours.</p>

        {!authed ? (
          <>
            <p className="pr-unlock-note">
              Buy AiRA credits to unlock — your first purchase also creates your account.
            </p>
            <button type="button" className="pr-btn-unlock" onClick={() => setShowBuyModal(true)}>
              💳 Buy Credits
            </button>
          </>
        ) : (
          <>
            <div className="pr-unlock-balance">Balance: {balance.toLocaleString()} credits</div>
            <button type="button" className="pr-btn-unlock" disabled={busy} onClick={handleUnlock}>
              {busy ? "Unlocking…" : "Unlock for 24 hours"}
            </button>
            {insufficient && (
              <>
                <div className="pr-unlock-error">Not enough credits for this unlock.</div>
                <button
                  type="button"
                  className="pr-btn-unlock-secondary"
                  onClick={() => setShowBuyModal(true)}
                >
                  Buy More Credits
                </button>
              </>
            )}
            {error && <div className="pr-unlock-error">{error}</div>}
          </>
        )}
      </div>
      {showBuyModal && <CreditPackModal onClose={() => setShowBuyModal(false)} />}
    </div>
  );
}

/* ════════════════════════ Print CSS ════════════════════════ */
const PRINT_CSS = `
  .aira-print-overlay {
    position: fixed; inset: 0; background: rgba(15,23,42,0.78); z-index: 20000;
    overflow-y: auto; padding: 24px 0 60px;
  }
  .aira-print-controls {
    position: sticky; top: 0; z-index: 5; display: flex; justify-content: center;
    gap: 10px; padding: 10px 0 16px;
  }
  .aira-print-controls button {
    padding: 8px 22px; border-radius: 6px; border: none; cursor: pointer;
    font-size: 13px; font-weight: 700; font-family: 'Inter', sans-serif;
  }
  .aira-print-controls .pr-btn-print { background: #0d9488; color: #fff; }
  .aira-print-controls .pr-btn-close { background: #334155; color: #e2e8f0; }
  .pr-report-wrap { position: relative; max-width: 800px; margin: 0 auto; }
  .print-report.pr-blurred {
    filter: blur(7px);
    user-select: none;
    pointer-events: none;
  }
  .pr-unlock-overlay {
    position: absolute; inset: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .pr-unlock-card {
    background: rgba(15,23,42,0.97); border: 1px solid rgba(124,58,237,0.4);
    border-radius: 14px; padding: 28px 32px; text-align: center; color: #e2e8f0;
    font-family: 'Inter', system-ui, sans-serif; box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    max-width: 320px;
  }
  .pr-unlock-lock { font-size: 32px; margin-bottom: 8px; }
  .pr-unlock-card h3 { margin: 0 0 6px; font-size: 15px; color: #fff; }
  .pr-unlock-card p, .pr-unlock-note { font-size: 12px; color: #94a3b8; margin: 0 0 14px; }
  .pr-unlock-balance { font-size: 12px; color: #a78bfa; margin-bottom: 10px; }
  .pr-btn-unlock {
    background: linear-gradient(135deg,#7c3aed,#a78bfa); border: none; color: #fff;
    border-radius: 8px; padding: 10px 22px; font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .pr-btn-unlock-secondary {
    margin-top: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.2);
    color: #e2e8f0; border-radius: 8px; padding: 8px 18px; font-size: 12px; cursor: pointer;
  }
  .pr-unlock-error { color: #f87171; font-size: 11px; margin-top: 8px; }
  .print-report {
    background: #fff; color: #111827; max-width: 800px; margin: 0 auto;
    padding: 48px 56px; font-family: Georgia, 'Times New Roman', serif;
    line-height: 1.5; box-shadow: 0 8px 40px rgba(0,0,0,0.5); border-radius: 4px;
  }
  .print-report h1 { font-family: 'Inter', system-ui, sans-serif; font-size: 26px; margin: 0 0 4px; color: #0f172a; }
  .print-report h2 { font-family: 'Inter', system-ui, sans-serif; font-size: 16px; margin: 0 0 10px; color: #0f172a; border-bottom: 2px solid #0d9488; padding-bottom: 4px; }
  .print-report h3 { font-family: 'Inter', system-ui, sans-serif; font-size: 13px; margin: 14px 0 6px; color: #1e293b; }
  .print-report p { font-size: 12px; margin: 0 0 10px; }
  .print-report table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .print-report th, .print-report td { border: 1px solid #cbd5e1; padding: 3px 6px; font-size: 10px; text-align: right; }
  .print-report th:first-child, .print-report td:first-child { text-align: left; }
  .print-report .pr-total-row td { font-weight: 700; border-top: 2px solid #0f172a; }
  .print-report .pr-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 24px; font-size: 11px; margin-bottom: 10px; }
  .print-report .pr-two-col > div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted #cbd5e1; padding: 2px 0; }
  .print-report .pr-wide-table th, .print-report .pr-wide-table td { font-size: 9px; padding: 2px 3px; }
  .print-report .pr-cover { text-align: center; padding-top: 70px; }
  .print-report .pr-eyebrow { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #0d9488; font-family: 'Inter', sans-serif; font-weight: 700; }
  .print-report .pr-name { font-size: 16px; margin-top: 8px; }
  .print-report .pr-cover-meta { font-size: 12px; color: #475569; margin-top: 4px; }
  .print-report .pr-cover-build { font-size: 9px; color: #94a3b8; margin-top: 60px; }
  .print-report .pr-note { font-size: 11px; color: #334155; background: #f8fafc; border-left: 3px solid #0d9488; padding: 8px 10px; }
  .print-report .pr-footnote { font-size: 10px; color: #475569; margin-top: -4px; }
  .print-report .pr-disclaimer p { font-size: 11px; }
  .print-report .pr-final-note { margin-top: 20px; font-weight: 700; font-size: 11px; }
  @media print {
    @page { size: letter portrait; margin: 0.5in; }
    html, body { background: #fff !important; }
    body * { visibility: hidden !important; }
    .print-report, .print-report * { visibility: visible !important; }
    .aira-print-controls { display: none !important; }
    .print-report { position: absolute; inset: 0; margin: 0; max-width: none; box-shadow: none; border-radius: 0; padding: 0.15in 0; }
    .pr-section { page-break-before: always; }
    .pr-row { page-break-inside: avoid; }
    /* Locked mode must print the SAME blurred document a screen shows — never
       let the print pipeline (which recalculates visibility above) leak the
       clear, un-blurred report. The unlock card itself is never printed. */
    .print-report.pr-blurred, .print-report.pr-blurred * {
      visibility: visible !important;
      filter: blur(7px) !important;
    }
    .pr-unlock-overlay, .pr-unlock-overlay * {
      visibility: hidden !important;
      content-visibility: hidden;
    }
  }
`;

/**
 * Main export — the overlay + printable report. Rendered by App.jsx only when
 * `mc` exists (the caller gates the "📄 Report" button on `mc != null`).
 *
 * `locked` (soft client-side gate — see UnlockPanel comment above): when
 * true, the report content renders blurred/non-interactive and an unlock
 * panel takes the place of the Print button. Once the user successfully
 * calls unlockReport(), internal state flips the view to unlocked in place
 * without needing to close/reopen the overlay.
 */
export default function PrintReport({ params = {}, mc, stress, rmdAge, buildTag, onClose, locked = false }) {
  const waterfall = useMemo(() => buildWithdrawalWaterfall(params), [params]);
  const rows = waterfall?.smart?.rows ?? [];
  const [justUnlocked, setJustUnlocked] = useState(false);
  const isLocked = locked && !justUnlocked;

  const handlePrint = () => {
    if (typeof window !== "undefined" && window.print) window.print();
  };

  return (
    <div className="aira-print-overlay">
      <style>{PRINT_CSS}</style>
      <div className="aira-print-controls">
        {!isLocked && (
          <button type="button" className="pr-btn-print" onClick={handlePrint}>🖨️ Print / Save as PDF</button>
        )}
        <button type="button" className="pr-btn-close" onClick={() => onClose && onClose()}>Close</button>
      </div>
      <div className="pr-report-wrap">
        <div className={`print-report${isLocked ? " pr-blurred" : ""}`}>
          <CoverSection params={params} buildTag={buildTag} />
          <AssumptionsSection params={params} rmdAge={rmdAge} />
          <MonteCarloSection mc={mc} params={params} />
          <StressTestSection stress={stress} />
          <WithdrawalScheduleSection rows={rows} endAge={params.endAge} />
          <RothConversionSection rows={rows} />
          <LifetimeTaxSection summary={waterfall?.summary} />
          <DisclaimerSection />
        </div>
        {isLocked && <UnlockPanel onUnlocked={() => setJustUnlocked(true)} />}
      </div>
    </div>
  );
}
