import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ComposedChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import moment from "moment";

/* ── Google Fonts ── */
if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}

/* ════════════════════════════════════════════
   CONSTANTS & PROFILES
════════════════════════════════════════════ */
const DDAY = new Date("2030-03-14T00:00:00");

const PROFILES = {
  vin: {
    label: "My Plan",
    currentAge: 56,
    retireAge: 60,
    endAge: 90,
    port: 2_461_544,
    contrib: 38_525,
    mr: 7.5,
    sd: 13.0,
    inf: 2.5,
    sp: 60_000,
    ssAge: 64,
    ssb: 31_543,
    ab: 20_000,
    useAb: true,
    smile: true,
    tax: true,
    real: true,
  },
  demo: {
    label: "Demo Mode",
    currentAge: 51,
    retireAge: 62,
    endAge: 88,
    port: 1_000_000,
    contrib: 24_000,
    mr: 7.5,
    sd: 13.0,
    inf: 2.5,
    sp: 72_000,
    ssAge: 67,
    ssb: 28_000,
    ab: 0,
    useAb: false,
    smile: true,
    tax: true,
    real: true,
  },
};

const SEQ_2000_2012 = [
  -0.091, -0.119, -0.221, 0.287, 0.109, 0.048, 0.158, 0.055, -0.37, 0.265,
  0.151, 0.021, 0.16,
];

const ANALOGUES = [
  {
    min: 95,
    text: "As reliable as a commercial flight landing safely",
    emoji: "✈️",
    color: "#10b981",
  },
  {
    min: 90,
    text: "Odds a 50-year-old reaches age 65 — solid F-You Money territory",
    emoji: "💪",
    color: "#34d399",
  },
  {
    min: 85,
    text: "Like calling heads correctly three times in a row",
    emoji: "🪙",
    color: "#6ee7b7",
  },
  {
    min: 80,
    text: "Similar to a college freshman graduating in 4 years",
    emoji: "🎓",
    color: "#fbbf24",
  },
  {
    min: 75,
    text: "About the odds an NBA player makes a free throw",
    emoji: "🏀",
    color: "#fbbf24",
  },
  {
    min: 70,
    text: "Odds a new business survives its first two years",
    emoji: "🏢",
    color: "#f97316",
  },
  {
    min: 0,
    text: "Slightly better than a coin flip — plan needs work",
    emoji: "😰",
    color: "#ef4444",
  },
];

/* ════════════════════════════════════════════
   MATH CORE
════════════════════════════════════════════ */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxMuller(rand) {
  const u = Math.max(rand(), 1e-10);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function logNormal(mean, vol, rand) {
  const mu = Math.log(1 + mean) - 0.5 * vol * vol;
  return Math.exp(mu + vol * boxMuller(rand)) - 1;
}

function smileGrowth(age, gg, sg, ng) {
  if (age < 75) return gg;
  if (age < 85) return sg;
  return ng;
}

function taxDrag(age, ssAge, useTax) {
  if (!useTax) return 0;
  if (age < ssAge) return 0.072;
  if (age < 73) return 0.09;
  return 0.132;
}

function runMC(p, endAge, N = 3000, seed = 42) {
  const rand = mulberry32(seed);
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = endAge - p.retireAge;
  const mr = p.mr / 100;
  const sd = p.sd / 100;
  const inf = p.inf / 100;

  const results = [];

  for (let i = 0; i < N; i++) {
    let port = p.port;

    for (let y = 0; y < accYrs; y++) {
      const r = clip(logNormal(mr, sd, rand), -0.3, 0.3);
      port = port * (1 + r) + p.contrib;
    }

    const portAtRetire = Math.round(port);

    const gg = clip(0.03 + (rand() - 0.5) * 0.01, 0.005, 0.08);
    const sg = clip(0.015 + (rand() - 0.5) * 0.01, 0.002, 0.05);
    const ng = clip(0.025 + (rand() - 0.5) * 0.01, 0.005, 0.08);

    const path = [portAtRetire];
    let survived = true,
      exhaustAge = null,
      sp = p.sp;

    for (let y = 0; y < retYrs; y++) {
      const age = p.retireAge + y;
      const sdY = age < 62 ? sd : sd * 0.824;
      const mrY = age < 62 ? mr : mr * 0.91;

      const r = clip(logNormal(mrY, sdY, rand), -0.3, 0.3);
      const inflY = clip(logNormal(inf, 0.01, rand), 0.005, 0.07);

      if (y > 0) {
        sp = p.smile
          ? sp * (1 + smileGrowth(age, gg, sg, ng))
          : sp * (1 + inflY);
      }

      const ss = age >= p.ssAge ? p.ssb * Math.pow(1.024, y) : 0;
      const rental = p.useAb ? p.ab * Math.pow(1.03, Math.min(y, 20)) : 0;
      const need = Math.max(0, sp - ss - rental);
      const drag = taxDrag(age, p.ssAge, p.tax);
      const draw = need * (1 + drag);

      port = port * (1 + r) - draw;

      if (port <= 0 && survived) {
        survived = false;
        exhaustAge = age;
        port = 0;
      }
      path.push(Math.max(0, Math.round(port)));
    }

    results.push({ path, survived, exhaustAge, portAtRetire });
  }

  const pathLen = results[0].path.length;
  const pcts = [];
  for (let t = 0; t < pathLen; t++) {
    const vals = results.map((r) => r.path[t]).sort((a, b) => a - b);
    const q = (pct) => vals[Math.floor(pct * (vals.length - 1))];
    pcts.push({
      age: p.retireAge + t,
      p10: q(0.1),
      p25: q(0.25),
      p50: q(0.5),
      p75: q(0.75),
      p90: q(0.9),
    });
  }

  const nSurvived = results.filter((r) => r.survived).length;
  const exAges = results
    .filter((r) => !r.survived)
    .map((r) => r.exhaustAge)
    .sort((a, b) => a - b);
  const medExhaust = exAges.length
    ? exAges[Math.floor(exAges.length / 2)]
    : null;
  const retVals = results.map((r) => r.portAtRetire).sort((a, b) => a - b);
  const medRetire = retVals[Math.floor(retVals.length / 2)];
  const termVals = results
    .map((r) => r.path[r.path.length - 1])
    .sort((a, b) => a - b);
  const qt = (pct) => termVals[Math.floor(pct * (termVals.length - 1))];

  return {
    rate: nSurvived / N,
    pcts,
    medExhaust,
    medRetire,
    term: {
      p10: qt(0.1),
      p25: qt(0.25),
      p50: qt(0.5),
      p75: qt(0.75),
      p90: qt(0.9),
    },
    N,
  };
}

function runStress(p, endAge, N = 2000, seed = 99) {
  const rand = mulberry32(seed);
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = endAge - p.retireAge;
  const mr = p.mr / 100;
  const sd = p.sd / 100;
  const inf = p.inf / 100;
  const results = [];

  for (let i = 0; i < N; i++) {
    let port = p.port;
    for (let y = 0; y < accYrs; y++) {
      const r = clip(logNormal(mr, sd, rand), -0.3, 0.3);
      port = port * (1 + r) + p.contrib;
    }
    const path = [Math.round(port)];
    let survived = true,
      sp = p.sp;

    for (let y = 0; y < retYrs; y++) {
      const age = p.retireAge + y;
      const r =
        y < SEQ_2000_2012.length
          ? SEQ_2000_2012[y]
          : clip(logNormal(mr, sd, rand), -0.3, 0.3);

      if (y > 0) sp = p.smile ? sp * 1.03 : sp * (1 + inf);

      const ss = age >= p.ssAge ? p.ssb * Math.pow(1.024, y) : 0;
      const rental = p.useAb ? p.ab * Math.pow(1.03, Math.min(y, 20)) : 0;
      const need = Math.max(0, sp - ss - rental);
      const draw = need * (1 + taxDrag(age, p.ssAge, p.tax));

      port = port * (1 + r) - draw;
      if (port <= 0 && survived) {
        survived = false;
        port = 0;
      }
      path.push(Math.max(0, Math.round(port)));
    }
    results.push({ path, survived });
  }

  const pathLen = results[0].path.length;
  const pcts = [];
  for (let t = 0; t < pathLen; t++) {
    const vals = results.map((r) => r.path[t]).sort((a, b) => a - b);
    const q = (pct) => vals[Math.floor(pct * (vals.length - 1))];
    pcts.push({
      age: p.retireAge + t,
      p10: q(0.1),
      p25: q(0.25),
      p50: q(0.5),
      p75: q(0.75),
      p90: q(0.9),
    });
  }

  return { rate: results.filter((r) => r.survived).length / N, pcts };
}

/* ════════════════════════════════════════════
   ROTH CONVERSION LADDER
════════════════════════════════════════════ */
function buildRothLadder() {
  const years = [
    { yr: 2031, age: 61, label: "Year 1", otherInc: 20000 },
    { yr: 2032, age: 62, label: "Year 2", otherInc: 20600 },
    { yr: 2033, age: 63, label: "Golden Year ★", otherInc: 21200 },
    { yr: 2034, age: 64, label: "Year 4 (SS starts)", otherInc: 21800 },
  ];
  return years.map((y) => {
    const inf = Math.pow(1.025, y.yr - 2026);
    const stdDed = 32200 * inf;
    const b12top = 100800 * inf;
    const b22top = 211400 * inf;
    const b24top = 403550 * inf;
    const taxableOther = Math.max(0, y.otherInc - stdDed);
    const conv =
      y.age === 63
        ? Math.min(210000, Math.max(0, b24top - taxableOther))
        : Math.min(60000, Math.max(0, b22top - taxableOther));
    const fedTax =
      y.age === 63
        ? b12top * 0.12 + Math.max(0, conv - b12top) * 0.22
        : conv * 0.12;
    const stateNJ = conv * 0.065;
    return {
      ...y,
      conv: Math.round(conv),
      fedTax: Math.round(fedTax),
      stateNJ: Math.round(stateNJ),
      effFL: ((fedTax / conv) * 100).toFixed(1),
      effNJ: (((fedTax + stateNJ) / conv) * 100).toFixed(1),
      netRoth: Math.round(conv - fedTax),
    };
  });
}

/* ════════════════════════════════════════════
   FORMATTERS & HELPERS
════════════════════════════════════════════ */
const fmtM = (v) =>
  v >= 1e6
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1e3
    ? `$${Math.round(v / 1e3)}K`
    : `$${Math.round(v)}`;
const fmtK = (v) => `$${Math.round(v / 1000)}K`;

function getAnalogue(rate) {
  const pct = rate * 100;
  return ANALOGUES.find((a) => pct >= a.min) || ANALOGUES[ANALOGUES.length - 1];
}

function countdownDays() {
  return Math.max(0, Math.floor((DDAY - new Date()) / 86400000));
}

function deflate(data, inf, useReal) {
  if (!useReal) return data;
  return data.map((d, i) => ({
    ...d,
    p10: Math.round(d.p10 / Math.pow(1 + inf / 100, i)),
    p25: Math.round(d.p25 / Math.pow(1 + inf / 100, i)),
    p50: Math.round(d.p50 / Math.pow(1 + inf / 100, i)),
    p75: Math.round(d.p75 / Math.pow(1 + inf / 100, i)),
    p90: Math.round(d.p90 / Math.pow(1 + inf / 100, i)),
  }));
}

/* ════════════════════════════════════════════
   STYLES
════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'DM Sans', sans-serif; background: #060e1a; color: #e2e8f0; }
  .app { min-height: 100vh; background: linear-gradient(160deg, #040b16 0%, #071220 50%, #04091a 100%); }
  .hdr { background: rgba(7,18,32,0.95); border-bottom: 1px solid rgba(14,116,144,0.3); padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; backdrop-filter: blur(12px); }
  .logo { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
  .logo-sub { color: #5eead4; font-weight: 300; font-size: 14px; }
  .mode-btn { padding: 6px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; font-size: 12px; font-family: 'DM Sans', sans-serif; font-weight: 500; transition: all 0.2s; background: transparent; color: #64748b; }
  .mode-btn.active { background: linear-gradient(135deg, #0d9488, #14b8a6); border-color: transparent; color: white; }
  .mode-btn.demo-active { background: linear-gradient(135deg, #7c3aed, #4f46e5); border-color: transparent; color: white; }
  .layout { display: grid; grid-template-columns: 280px 1fr; height: calc(100vh - 58px); }
  .sidebar { border-right: 1px solid rgba(255,255,255,0.06); padding: 16px; overflow-y: auto; background: rgba(7,14,26,0.6); display: flex; flex-direction: column; gap: 12px; }
  .sb-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 14px; }
  .sb-title { font-size: 10px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
  .sl-row { display: grid; grid-template-columns: 110px 1fr 60px; align-items: center; gap: 8px; margin-bottom: 8px; }
  .sl-label { font-size: 11px; color: #94a3b8; }
  .sl-val { font-size: 11px; font-weight: 600; text-align: right; color: #e2e8f0; font-family: 'DM Mono', monospace; }
  input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.1); outline: none; cursor: pointer; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #0d9488; cursor: pointer; transition: transform 0.15s; }
  input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
  .tog-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .tog-label { font-size: 11px; color: #94a3b8; }
  .tog { width: 38px; height: 20px; border-radius: 10px; cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
  .tok { position: absolute; top: 2px; width: 16px; height: 16px; border-radius: 50%; background: white; transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  .run-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #0d9488, #14b8a6); border: none; border-radius: 10px; color: white; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: opacity 0.2s; margin-top: 4px; }
  .run-btn:hover { opacity: 0.9; }
  .run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .main { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  .flag { border-left: 3px solid #f59e0b; background: rgba(245,158,11,0.08); padding: 8px 12px; font-size: 12px; color: #fcd34d; border-radius: 0 8px 8px 0; }
  .flag-info { border-left-color: #0ea5e9; background: rgba(14,165,233,0.08); color: #7dd3fc; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .met { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px; }
  .met-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .met-val { font-size: 24px; font-weight: 700; font-family: 'DM Mono', monospace; line-height: 1; }
  .met-sub { font-size: 10px; color: #475569; margin-top: 4px; }
  .analogue { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #94a3b8; font-style: italic; }
  .tabs { display: flex; gap: 3px; background: rgba(255,255,255,0.04); border-radius: 10px; padding: 3px; }
  .tab { flex: 1; padding: 7px 6px; border: none; background: transparent; border-radius: 8px; cursor: pointer; font-size: 12px; font-family: 'DM Sans', sans-serif; color: #64748b; transition: all 0.15s; font-weight: 500; }
  .tab.active { background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.1); }
  .chart-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 16px 18px; }
  .chart-title { font-size: 12px; color: #64748b; margin-bottom: 12px; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; }
  .leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #64748b; }
  .leg-line { width: 18px; height: 2px; border-radius: 1px; }
  .ppl-grid { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
  .ppl-dot { width: 18px; height: 18px; border-radius: 50%; }
  .roth-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .roth-table th { font-size: 10px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 10px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .roth-table th:first-child { text-align: left; }
  .roth-table td { padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right; font-family: 'DM Mono', monospace; }
  .roth-table td:first-child { text-align: left; font-family: 'DM Sans', sans-serif; font-weight: 500; color: #e2e8f0; }
  .golden { background: rgba(251,191,36,0.06); }
  .scen-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .scen-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; }
  .tip-box { background: rgba(7,18,32,0.95); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 12px; font-size: 11px; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
`;

/* ════════════════════════════════════════════
   TOOLTIP
════════════════════════════════════════════ */
const CustomTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip-box">
      <div style={{ color: "#64748b", marginBottom: 4, fontSize: 10 }}>
        Age {label}
      </div>
      {payload
        .filter((p) => p.value > 0)
        .map((p, i) => (
          <div key={i} style={{ color: p.color, marginBottom: 2 }}>
            <span style={{ color: "#94a3b8" }}>{p.name}: </span>
            {fmtM(p.value)}
          </div>
        ))}
    </div>
  );
};

/* ════════════════════════════════════════════
   TOGGLE COMPONENT
════════════════════════════════════════════ */
function Toggle({ val, onChange, label, accent = "#0d9488" }) {
  return (
    <div className="tog-row">
      <span className="tog-label">{label}</span>
      <div
        className="tog"
        onClick={() => onChange(!val)}
        style={{ background: val ? accent : "rgba(255,255,255,0.1)" }}
      >
        <div className="tok" style={{ left: val ? 20 : 2 }} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   SLIDER COMPONENT
════════════════════════════════════════════ */
function Slider({ label, value, min, max, step, format, onChange }) {
  return (
    <div className="sl-row">
      <span className="sl-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="sl-val">{format(value)}</span>
    </div>
  );
}

/* ════════════════════════════════════════════
   FAN CHART
════════════════════════════════════════════ */
function FanChart({ pcts, retireAge, ssAge, inf, useReal, title }) {
  const data = useMemo(() => deflate(pcts, inf, useReal), [pcts, inf, useReal]);
  return (
    <div className="chart-card">
      <div className="chart-title">
        {title} · {useReal ? "Real $" : "Nominal $"}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="g90" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5eead4" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#5eead4" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="g75" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 10 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 10 }}
            tickFormatter={(v) => fmtM(v)}
            width={58}
          />
          <Tooltip content={<CustomTip />} />
          <ReferenceLine
            x={retireAge}
            stroke="#fbbf24"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              value: "D-Day",
              fill: "#fbbf24",
              fontSize: 9,
              position: "top",
            }}
          />
          <ReferenceLine
            x={ssAge}
            stroke="#c084fc"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{
              value: "SS",
              fill: "#c084fc",
              fontSize: 9,
              position: "top",
            }}
          />
          <ReferenceLine
            x={73}
            stroke="#34d399"
            strokeWidth={1}
            strokeDasharray="4 3"
            label={{
              value: "RMD",
              fill: "#34d399",
              fontSize: 9,
              position: "top",
            }}
          />
          <Area
            type="monotone"
            dataKey="p90"
            stroke="#5eead4"
            strokeWidth={1}
            strokeDasharray="4 2"
            fill="url(#g90)"
            dot={false}
            name="90th %ile"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="p75"
            stroke="#0d9488"
            strokeWidth={1}
            strokeDasharray="3 2"
            fill="url(#g75)"
            dot={false}
            name="75th %ile"
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#14b8a6"
            strokeWidth={3}
            dot={false}
            name="Median"
          />
          <Line
            type="monotone"
            dataKey="p25"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            name="25th %ile"
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke="#f87171"
            strokeWidth={2}
            dot={false}
            strokeDasharray="3 3"
            name="10th %ile"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend">
        {[
          { c: "#5eead4", l: "90th — best 10%" },
          { c: "#0d9488", l: "75th — good case" },
          { c: "#14b8a6", l: "Median" },
          { c: "#fbbf24", l: "25th — cautious" },
          { c: "#f87171", l: "10th — near worst" },
        ].map((i) => (
          <div key={i.l} className="leg-item">
            <div className="leg-line" style={{ background: i.c }} />
            {i.l}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   INCOME MAP
════════════════════════════════════════════ */
function IncomeMap({ p }) {
  const data = useMemo(() => {
    const yrs = Math.min(26, p.endAge - p.retireAge);
    return Array.from({ length: yrs }, (_, i) => {
      const age = p.retireAge + i;
      const ss = age >= p.ssAge ? Math.round(p.ssb * Math.pow(1.024, i)) : 0;
      const ab = p.useAb
        ? Math.round(p.ab * Math.pow(1.03, Math.min(i, 20)))
        : 0;
      let sp = p.sp;
      for (let j = 1; j <= i; j++) {
        const a = p.retireAge + j;
        sp = p.smile
          ? sp * (1 + smileGrowth(a, 0.03, 0.015, 0.025))
          : sp * (1 + p.inf / 100);
      }
      sp = Math.round(sp);
      return {
        age,
        "Portfolio Draw": Math.max(0, sp - ss - ab),
        "Social Security": ss,
        "Airbnb Net": ab,
      };
    });
  }, [p]);

  return (
    <div className="chart-card">
      <div className="chart-title">
        Annual income coverage · {p.smile ? "Smile" : "Flat"} spending ·{" "}
        {p.tax ? "Tax drag on" : "Gross"}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 10 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 10 }}
            tickFormatter={(v) => fmtM(v)}
            width={54}
          />
          <Tooltip content={<CustomTip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 8 }}
          />
          <Bar dataKey="Portfolio Draw" stackId="a" fill="#0d9488cc" />
          <Bar dataKey="Social Security" stackId="a" fill="#7c3aedcc" />
          <Bar
            dataKey="Airbnb Net"
            stackId="a"
            fill="#059669cc"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="flag" style={{ marginTop: 10, fontSize: 11 }}>
        ⚠ SS gap: ages {p.retireAge}–{p.ssAge - 1} — portfolio carries 100% of
        spending. Critical 3-year vulnerability window.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   SMILE CHART
════════════════════════════════════════════ */
function SmileChart({ p }) {
  const data = useMemo(
    () =>
      Array.from({ length: 31 }, (_, i) => {
        const age = p.retireAge + i;
        const inf = p.inf / 100;
        let smile = p.sp,
          flat = p.sp;
        for (let j = 1; j <= i; j++) {
          const a = p.retireAge + j;
          smile *= 1 + smileGrowth(a, 0.03, 0.015, 0.025);
          flat *= 1 + inf;
        }
        return {
          age,
          "Flat (inflation)": Math.round(flat),
          "Smile (Blanchett)": Math.round(smile),
        };
      }),
    [p]
  );

  return (
    <div className="chart-card">
      <div className="chart-title">
        Retirement Smile spending · Blanchett/Morningstar · Go-go 3% → Slow-go
        1.5% → Healthcare tail 2.5%
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 10 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 10 }}
            tickFormatter={(v) => fmtK(v)}
            width={50}
          />
          <Tooltip content={<CustomTip />} />
          <ReferenceLine
            x={75}
            stroke="rgba(251,191,36,0.4)"
            strokeDasharray="3 3"
          />
          <ReferenceLine
            x={85}
            stroke="rgba(249,115,22,0.4)"
            strokeDasharray="3 3"
          />
          <Line
            type="monotone"
            dataKey="Flat (inflation)"
            stroke="#475569"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Smile (Blanchett)"
            stroke="#a78bfa"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 8,
        }}
      >
        {[
          {
            phase: "Go-Go",
            ages: `${p.retireAge}–74`,
            pct: "110%+",
            color: "#34d399",
            note: "Thailand · Philippines · Experiences",
          },
          {
            phase: "Slow-Go",
            ages: "75–84",
            pct: "80–95%",
            color: "#fbbf24",
            note: "Portfolio breathing room · Compounding window",
          },
          {
            phase: "Healthcare",
            ages: "85+",
            pct: "90%",
            color: "#f87171",
            note: "LTC risk · HSA + Roth fund this phase",
          },
        ].map((ph) => (
          <div
            key={ph.phase}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${ph.color}33`,
              borderRadius: 8,
              padding: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: ph.color }}>
              {ph.phase} · {ph.ages}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {ph.pct} of base
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              {ph.note}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   ROTH LADDER TAB
════════════════════════════════════════════ */
function RothLadder() {
  const ladder = useMemo(() => buildRothLadder(), []);
  const totalConv = ladder.reduce((s, r) => s + r.conv, 0);
  const totalFed = ladder.reduce((s, r) => s + r.fedTax, 0);
  const totalNJ = ladder.reduce((s, r) => s + r.stateNJ, 0);
  const totalRoth = ladder.reduce((s, r) => s + r.netRoth, 0);

  return (
    <div className="chart-card">
      <div className="chart-title">
        Roth conversion ladder · Ages 61–64 · FL/Thailand (zero state tax) vs NJ
        (6.5% avg)
      </div>
      <table className="roth-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Age</th>
            <th>Conversion</th>
            <th>Fed tax</th>
            <th>FL rate</th>
            <th>NJ rate</th>
            <th>Net → Roth</th>
          </tr>
        </thead>
        <tbody>
          {ladder.map((r) => (
            <tr key={r.yr} className={r.age === 63 ? "golden" : ""}>
              <td>
                {r.yr}
                {r.age === 63 ? " ★" : ""}
              </td>
              <td style={{ color: "#94a3b8" }}>{r.age}</td>
              <td style={{ color: "#e2e8f0" }}>{fmtM(r.conv)}</td>
              <td style={{ color: "#f87171" }}>{fmtM(r.fedTax)}</td>
              <td style={{ color: "#34d399" }}>{r.effFL}%</td>
              <td style={{ color: "#fb923c" }}>{r.effNJ}%</td>
              <td style={{ color: "#14b8a6", fontWeight: 600 }}>
                {fmtM(r.netRoth)}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            <td style={{ fontWeight: 700, color: "#e2e8f0" }}>Total</td>
            <td>—</td>
            <td style={{ fontWeight: 700 }}>{fmtM(totalConv)}</td>
            <td style={{ color: "#f87171", fontWeight: 700 }}>
              {fmtM(totalFed)}
            </td>
            <td>—</td>
            <td style={{ color: "#fb923c", fontWeight: 700 }}>
              {fmtM(totalFed + totalNJ)}
            </td>
            <td style={{ color: "#14b8a6", fontWeight: 700 }}>
              {fmtM(totalRoth)}
            </td>
          </tr>
        </tbody>
      </table>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          marginTop: 14,
        }}
      >
        <div className="met">
          <div className="met-label">FL saves vs NJ</div>
          <div className="met-val" style={{ color: "#34d399", fontSize: 20 }}>
            {fmtM(totalNJ)}
          </div>
          <div className="met-sub">Over full conversion window</div>
        </div>
        <div className="met">
          <div className="met-label">RMD bomb w/o conversion</div>
          <div className="met-val" style={{ color: "#f87171", fontSize: 20 }}>
            ~$272K/yr
          </div>
          <div className="met-sub">
            Forced income at age 73 · ~59% eff. rate
          </div>
        </div>
        <div className="met">
          <div className="met-label">RMD after conversion</div>
          <div className="met-val" style={{ color: "#fbbf24", fontSize: 20 }}>
            ~$28K/yr
          </div>
          <div className="met-sub">Pre-tax account dramatically reduced</div>
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "#7c3aed",
          background: "rgba(124,58,237,0.08)",
          borderRadius: 8,
          padding: "8px 12px",
          border: "1px solid rgba(124,58,237,0.2)",
        }}
      >
        ★ Golden year 2033 (age 63): last year before SS starts March 2034.
        Bracket room ~$210K. After SS begins, space drops to ~$90K/yr. Delay
        aggressive conversions until Danielle graduates Spring 2034.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MORTGAGE TAB
════════════════════════════════════════════ */
function MortgageTab() {
  const [originalLoanAmount, setOriginalLoanAmount] = useState(300000);
  const [interestRate, setInterestRate] = useState(6.25);
  const [loanTerm, setLoanTerm] = useState(30);
  const [startDate, setStartDate] = useState("2023-05-01");
  const [currentBalance, setCurrentBalance] = useState(267518);
  const [extraMonthly, setExtraMonthly] = useState(310);

  const computeMonthlyPayment = (balance, annualRate, yearsRemaining) => {
    const monthlyRate = annualRate / 12 / 100;
    const months = yearsRemaining * 12;
    if (monthlyRate === 0) return balance / months;
    return (
      (balance * monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1)
    );
  };

  const generateAmortization = (
    balance,
    annualRate,
    yearsRemaining,
    extraMonthlyPayment,
    currentYear
  ) => {
    const monthlyRate = annualRate / 100 / 12;
    const monthsRemaining = yearsRemaining * 12;
    let bal = balance;
    const schedule = [];
    let year = currentYear;
    let monthCounter = 0;

    while (bal > 0.01 && monthCounter < monthsRemaining * 2) {
      let principalPaidYear = 0;
      let interestPaidYear = 0;
      let extraPaidYear = 0;

      for (let m = 0; m < 12; m++) {
        if (bal <= 0) break;
        const monthlyPayment = computeMonthlyPayment(
          bal,
          annualRate,
          (monthsRemaining - monthCounter) / 12
        );
        const interestThisMonth = bal * monthlyRate;
        let principalThisMonth = monthlyPayment - interestThisMonth;
        const extraThisMonth = extraMonthlyPayment;
        const totalPrincipal = principalThisMonth + extraThisMonth;
        if (totalPrincipal >= bal) {
          principalPaidYear += bal;
          interestPaidYear += interestThisMonth;
          extraPaidYear += Math.min(extraThisMonth, bal - principalThisMonth);
          bal = 0;
          break;
        } else {
          principalPaidYear += totalPrincipal;
          interestPaidYear += interestThisMonth;
          extraPaidYear += extraThisMonth;
          bal -= totalPrincipal;
        }
        monthCounter++;
        if (bal <= 0) break;
      }
      schedule.push({
        year,
        principalPaid: principalPaidYear,
        interestPaid: interestPaidYear,
        extraPrincipal: extraPaidYear,
        balance: Math.max(0, bal),
      });
      year++;
      if (bal <= 0) break;
    }
    return schedule;
  };

  const currentYear = moment().year();
  const yearsRemaining = useMemo(() => {
    const start = moment(startDate);
    const now = moment();
    const monthsElapsed = now.diff(start, "months");
    const monthsRemaining = loanTerm * 12 - monthsElapsed;
    return Math.max(0, monthsRemaining / 12);
  }, [startDate, loanTerm]);

  const monthlyPayment = useMemo(() => {
    if (yearsRemaining <= 0) return 0;
    return computeMonthlyPayment(currentBalance, interestRate, yearsRemaining);
  }, [currentBalance, interestRate, yearsRemaining]);

  const scheduleWithoutExtra = useMemo(() => {
    return generateAmortization(
      currentBalance,
      interestRate,
      yearsRemaining,
      0,
      currentYear
    );
  }, [currentBalance, interestRate, yearsRemaining, currentYear]);

  const scheduleWithExtra = useMemo(() => {
    return generateAmortization(
      currentBalance,
      interestRate,
      yearsRemaining,
      extraMonthly,
      currentYear
    );
  }, [currentBalance, interestRate, yearsRemaining, extraMonthly, currentYear]);

  const totalInterestWithout = useMemo(() => {
    return scheduleWithoutExtra.reduce((sum, yr) => sum + yr.interestPaid, 0);
  }, [scheduleWithoutExtra]);

  const totalInterestWith = useMemo(() => {
    return scheduleWithExtra.reduce((sum, yr) => sum + yr.interestPaid, 0);
  }, [scheduleWithExtra]);

  const interestSaved = totalInterestWithout - totalInterestWith;

  const debtFreeDate = useMemo(() => {
    if (scheduleWithExtra.length === 0) return null;
    const lastYear = scheduleWithExtra[scheduleWithExtra.length - 1].year;
    return moment().year(lastYear).endOf("year");
  }, [scheduleWithExtra]);

  const balanceChartData = useMemo(() => {
    const maxYears = Math.max(
      scheduleWithoutExtra.length,
      scheduleWithExtra.length
    );
    const data = [];
    for (let i = 0; i < maxYears; i++) {
      const year = currentYear + i;
      const balanceWithout = scheduleWithoutExtra[i]?.balance ?? 0;
      const balanceWith = scheduleWithExtra[i]?.balance ?? 0;
      data.push({ year, balanceWithout, balanceWith });
    }
    return data;
  }, [scheduleWithoutExtra, scheduleWithExtra, currentYear]);

  const amortizationData = scheduleWithExtra.slice(0, 10);

  const formatCurrency = (value) =>
    `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  const formatDate = (date) => (date ? date.format("MMM YYYY") : "—");

  const handleExtraMonthlyChange = (e) =>
    setExtraMonthly(Number(e.target.value));

  const principalPaid = originalLoanAmount - currentBalance;
  const percentPaid = (principalPaid / originalLoanAmount) * 100;

  return (
    <div className="chart-card" style={{ padding: "1.5rem" }}>
      <h3 style={{ marginBottom: "1rem", fontSize: "1rem", color: "#e2e8f0" }}>
        Mortgage Paydown
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div className="met" style={{ padding: "1rem" }}>
          <div className="met-label">TOTAL DEBT</div>
          <div className="met-val" style={{ fontSize: "1.5rem" }}>
            {formatCurrency(currentBalance)}
          </div>
          <div className="met-sub">1 mortgage</div>
        </div>
        <div className="met" style={{ padding: "1rem" }}>
          <div className="met-label">TOTAL INTEREST (remaining)</div>
          <div className="met-val" style={{ fontSize: "1.5rem" }}>
            {formatCurrency(totalInterestWith)}
          </div>
          <div className="met-sub">with extra payments</div>
        </div>
        <div className="met" style={{ padding: "1rem" }}>
          <div className="met-label">DEBT‑FREE DATE</div>
          <div className="met-val" style={{ fontSize: "1.5rem" }}>
            {formatDate(debtFreeDate)}
          </div>
          <div className="met-sub">all loans paid off</div>
        </div>
        <div className="met" style={{ padding: "1rem" }}>
          <div className="met-label">INTEREST SAVED</div>
          <div
            className="met-val"
            style={{ fontSize: "1.5rem", color: "#2b6e3b" }}
          >
            {formatCurrency(interestSaved)}
          </div>
          <div className="met-sub">by extra payments</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2rem",
          marginBottom: "2rem",
        }}
      >
        <div>
          <div className="sb-card" style={{ padding: "1rem" }}>
            <div className="sb-title">Loan Details</div>
            <div className="sl-row">
              <span className="sl-label">Original Loan Amount</span>
              <input
                type="number"
                value={originalLoanAmount}
                onChange={(e) => setOriginalLoanAmount(Number(e.target.value))}
                step="1000"
                style={{ width: "100%", marginTop: "0.25rem" }}
              />
            </div>
            <div className="sl-row">
              <span className="sl-label">Interest Rate (%)</span>
              <input
                type="number"
                value={interestRate}
                onChange={(e) => setInterestRate(Number(e.target.value))}
                step="0.125"
                style={{ width: "100%", marginTop: "0.25rem" }}
              />
            </div>
            <div className="sl-row">
              <span className="sl-label">Loan Term (years)</span>
              <input
                type="number"
                value={loanTerm}
                onChange={(e) => setLoanTerm(Number(e.target.value))}
                step="1"
                style={{ width: "100%", marginTop: "0.25rem" }}
              />
            </div>
            <div className="sl-row">
              <span className="sl-label">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: "100%", marginTop: "0.25rem" }}
              />
            </div>
            <div className="sl-row">
              <span className="sl-label">Current Balance</span>
              <input
                type="number"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(Number(e.target.value))}
                step="1000"
                style={{ width: "100%", marginTop: "0.25rem" }}
              />
            </div>
            <div className="sl-row">
              <span className="sl-label">Extra Monthly Payment</span>
              <input
                type="number"
                value={extraMonthly}
                onChange={handleExtraMonthlyChange}
                step="50"
                style={{ width: "100%", marginTop: "0.25rem" }}
              />
              <span className="sl-val">
                Current: {formatCurrency(extraMonthly)}
              </span>
            </div>
          </div>
          <div
            className="sb-card"
            style={{ padding: "1rem", marginTop: "1rem" }}
          >
            <div>
              Principal Paid: <strong>{formatCurrency(principalPaid)}</strong> (
              {percentPaid.toFixed(0)}% paid off)
            </div>
            <div>
              Monthly P&I: <strong>{formatCurrency(monthlyPayment)}</strong>
            </div>
          </div>
        </div>

        <div>
          <div
            className="sb-card"
            style={{ padding: "1rem", marginBottom: "1rem" }}
          >
            <div className="met-label">MORTGAGE PAYOFF DATE</div>
            <div className="met-val" style={{ fontSize: "1.2rem" }}>
              {formatDate(debtFreeDate)}
            </div>
            <div className="met-sub">
              ↓{" "}
              {(
                ((totalInterestWithout - totalInterestWith) /
                  totalInterestWithout) *
                100
              ).toFixed(0)}
              % less interest with extra payments
            </div>
          </div>
          <div
            className="sb-card"
            style={{ padding: "1rem", marginBottom: "1rem" }}
          >
            <div className="met-label">MONTHLY PAYMENT</div>
            <div className="met-val" style={{ fontSize: "1.2rem" }}>
              {formatCurrency(monthlyPayment)}
            </div>
            <div className="met-sub">Principal & interest only</div>
          </div>
          <div
            className="sb-card"
            style={{ padding: "1rem", marginBottom: "1rem" }}
          >
            <div className="met-label">TOTAL INTEREST PAID</div>
            <div className="met-val" style={{ fontSize: "1.2rem" }}>
              {formatCurrency(totalInterestWith)}
            </div>
            <div className="met-sub">with extra payments</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <div className="chart-title">Balance Over Time</div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={balanceChartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
              <XAxis
                dataKey="year"
                stroke="#1e3a5f"
                tick={{ fill: "#475569", fontSize: 10 }}
              />
              <YAxis
                tickFormatter={(value) => `$${value / 1000}k`}
                stroke="#1e3a5f"
                tick={{ fill: "#475569", fontSize: 10 }}
                width={60}
              />
              <Tooltip content={<CustomTip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
              <Line
                type="monotone"
                dataKey="balanceWithout"
                stroke="#8884d8"
                name="Without extra"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="balanceWith"
                stroke="#82ca9d"
                name="With extra"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="chart-title">
          Amortization Schedule (Annual Summary)
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
          >
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.05)" }}>
                <th style={{ padding: "0.75rem", textAlign: "left" }}>Year</th>
                <th style={{ padding: "0.75rem", textAlign: "right" }}>
                  Principal Paid
                </th>
                <th style={{ padding: "0.75rem", textAlign: "right" }}>
                  Interest Paid
                </th>
                <th style={{ padding: "0.75rem", textAlign: "right" }}>
                  Extra Principal
                </th>
                <th style={{ padding: "0.75rem", textAlign: "right" }}>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {amortizationData.map((row, idx) => (
                <tr
                  key={idx}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <td style={{ padding: "0.5rem" }}>{row.year}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>
                    {formatCurrency(row.principalPaid)}
                  </td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>
                    {formatCurrency(row.interestPaid)}
                  </td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>
                    {formatCurrency(row.extraPrincipal)}
                  </td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>
                    {formatCurrency(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   SIMULATION INPUTS PANEL
════════════════════════════════════════════ */
function SimulationInputs({
  params,
  mode,
  contrib,
  port,
  mr,
  inf,
  sp,
  ssAge,
  ssb,
  ab,
  useAb,
  smile,
  tax,
  real,
}) {
  const [expanded, setExpanded] = useState(true);
  const isVin = mode === "vin";
  const monthlyContrib = contrib / 12;
  const monthlySpend = sp / 12;
  const withdrawalRate = ((sp / port) * 100).toFixed(1);
  const realReturn = (params.mr - params.inf).toFixed(1);
  const yearsToRetire = params.retireAge - params.currentAge;

  return (
    <div className="chart-card" style={{ marginBottom: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="chart-title">📊 Simulation Inputs & Assumptions</div>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          {expanded ? "▼" : "▶"}
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1rem",
            }}
          >
            {/* Accumulation Phase */}
            <div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#0d9488",
                  marginBottom: "6px",
                }}
              >
                ACCUMULATION PHASE (age {params.currentAge} – {params.retireAge}
                )
              </div>
              <div className="sl-row">
                <span className="sl-label">Starting portfolio</span>
                <span className="sl-val">{fmtM(port)}</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Annual contribution</span>
                <span className="sl-val">{fmtK(contrib)}/yr</span>
              </div>
              {isVin && (
                <div className="sl-row">
                  <span className="sl-label">Employer match (401k)</span>
                  <span className="sl-val">$8,325/yr</span>
                </div>
              )}
              <div className="sl-row">
                <span className="sl-label">Years to retirement</span>
                <span className="sl-val">{yearsToRetire} yrs</span>
              </div>
            </div>

            {/* Withdrawal Phase */}
            <div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#0d9488",
                  marginBottom: "6px",
                }}
              >
                WITHDRAWAL PHASE (age {params.retireAge} – {params.endAge})
              </div>
              <div className="sl-row">
                <span className="sl-label">Base annual spending</span>
                <span className="sl-val">{fmtK(sp)}/yr</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Monthly spending</span>
                <span className="sl-val">{fmtK(monthlySpend)}/mo</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Withdrawal rate (initial)</span>
                <span className="sl-val">{withdrawalRate}%</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">SS start age / benefit</span>
                <span className="sl-val">
                  {ssAge} / {fmtK(ssb)}/yr
                </span>
              </div>
              {useAb && (
                <div className="sl-row">
                  <span className="sl-label">Airbnb net income</span>
                  <span className="sl-val">{fmtK(ab)}/yr</span>
                </div>
              )}
            </div>

            {/* Market & Statistical Model */}
            <div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#0d9488",
                  marginBottom: "6px",
                }}
              >
                MARKET & STATISTICAL MODEL
              </div>
              <div className="sl-row">
                <span className="sl-label">Mean nominal return</span>
                <span className="sl-val">{mr.toFixed(1)}%</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Inflation (general)</span>
                <span className="sl-val">{inf.toFixed(1)}%</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Real return (mean)</span>
                <span className="sl-val">{realReturn}%</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Std deviation (equity)</span>
                <span className="sl-val">15.0%</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Simulations</span>
                <span className="sl-val">3,000</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Withdrawal strategy</span>
                <span className="sl-val">Guyton-Klinger</span>
              </div>
            </div>

            {/* Options / Toggles */}
            <div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#0d9488",
                  marginBottom: "6px",
                }}
              >
                MODEL OPTIONS
              </div>
              <div className="sl-row">
                <span className="sl-label">Smile spending</span>
                <span className="sl-val">{smile ? "Yes" : "No"}</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Tax drag</span>
                <span className="sl-val">{tax ? "Yes" : "No"}</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Airbnb income</span>
                <span className="sl-val">{useAb ? "Yes" : "No"}</span>
              </div>
              <div className="sl-row">
                <span className="sl-label">Real dollars</span>
                <span className="sl-val">{real ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>

          {/* Footer notes - split into separate divs to avoid <br /> issues */}
          <div
            style={{
              marginTop: "12px",
              fontSize: "10px",
              color: "#475569",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              paddingTop: "8px",
            }}
          >
            <div>
              ⚡ Returns: per‑year log‑normal with sequence risk · Historical
              bootstrap of S&P 500 (99 years) and bonds (50 years).
            </div>
            <div>
              🛡️ Guardrails: Floor $48K, Target $60K, Ceiling $84K · Adjust 10%
              when WR &gt;120% or &lt;80% of initial.
            </div>
            <div>
              📊 Roth conversions: 4‑year ladder (ages 60‑63) with golden year
              2033 ($210K). FL domicile assumed after 2030.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   PEOPLE VISUALIZATION
════════════════════════════════════════════ */
function PeopleViz({ rate }) {
  const success = Math.round(rate * 26);
  const fail = 26 - success;
  return (
    <div className="chart-card">
      <div className="chart-title">
        If 26 people had your exact plan — age 90 horizon
      </div>
      <div className="ppl-grid">
        {Array.from({ length: 26 }, (_, i) => (
          <div
            key={i}
            className="ppl-dot"
            style={{
              background: i < success ? "#0d9488" : "#ef4444",
              opacity: i < success ? 1 : 0.5,
            }}
            title={
              i < success ? "Portfolio survives to 90" : "Exhausted before 90"
            }
          />
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
        <span style={{ color: "#0d9488", fontWeight: 600 }}>{success}</span>{" "}
        make it to age 90.{" "}
        {fail > 0 && (
          <>
            <span style={{ color: "#ef4444", fontWeight: 600 }}>{fail}</span>{" "}
            run out of money.
          </>
        )}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: "#475569",
          fontStyle: "italic",
        }}
      >
        100% success doesn't exist in any retirement model. As Morgan Housel
        says — room for error IS the plan.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════ */
export default function AiRAForecaster() {
  const [mode, setMode] = useState("vin");
  const [activeTab, setTab] = useState("fan");
  const [running, setRunning] = useState(false);
  const [results85, setR85] = useState(null);
  const [results90, setR90] = useState(null);
  const [stress90, setStr90] = useState(null);
  const [days] = useState(countdownDays);

  const prof = PROFILES[mode];
  const [port, setPort] = useState(prof.port);
  const [contrib, setContrib] = useState(prof.contrib);
  const [mr, setMr] = useState(prof.mr);
  const [inf, setInf] = useState(prof.inf);
  const [retAge, setRetAge] = useState(prof.retireAge);
  const [endAge, setEndAge] = useState(prof.endAge);
  const [sp, setSp] = useState(prof.sp);
  const [ssAge, setSsAge] = useState(prof.ssAge);
  const [ssb, setSsb] = useState(prof.ssb);
  const [ab, setAb] = useState(prof.ab);
  const [smile, setSmile] = useState(prof.smile);
  const [tax, setTax] = useState(prof.tax);
  const [useAb, setUseAb] = useState(prof.useAb);
  const [real, setReal] = useState(prof.real);

  const switchMode = useCallback((m) => {
    setMode(m);
    const p = PROFILES[m];
    setPort(p.port);
    setContrib(p.contrib);
    setMr(p.mr);
    setInf(p.inf);
    setRetAge(p.retireAge);
    setEndAge(p.endAge);
    setSp(p.sp);
    setSsAge(p.ssAge);
    setSsb(p.ssb);
    setAb(p.ab);
    setSmile(p.smile);
    setTax(p.tax);
    setUseAb(p.useAb);
    setReal(p.real);
    setR85(null);
    setR90(null);
    setStr90(null);
  }, []);

  const params = useMemo(
    () => ({
      currentAge: PROFILES[mode].currentAge,
      retireAge: retAge,
      endAge,
      port,
      contrib,
      mr,
      sd: 13.0,
      inf,
      sp,
      ssAge,
      ssb,
      ab,
      useAb,
      smile,
      tax,
      real,
    }),
    [
      mode,
      retAge,
      endAge,
      port,
      contrib,
      mr,
      inf,
      sp,
      ssAge,
      ssb,
      ab,
      useAb,
      smile,
      tax,
      real,
    ]
  );

  const swr = ((sp / port) * 100).toFixed(1);

  const runSimulation = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const r85 = runMC(params, 85, 3000, 42);
      const r90 = runMC(params, 90, 3000, 43);
      const str = runStress(params, params.endAge, 2000, 99);
      setR85(r85);
      setR90(r90);
      setStr90(str);
      setRunning(false);
      setTab("fan");
    }, 30);
  }, [params]);

  const analogue = results90 ? getAnalogue(results90.rate) : null;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="hdr">
          <div>
            <div className="logo">
              AiRA <span className="logo-sub">Freedom Financial</span>
            </div>
            <div style={{ fontSize: 11, color: "#334155" }}>
              v4 · Authoritative Mode · Carpe Muerte methodology · 3,000 paths
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {Object.entries(PROFILES).map(([k, v]) => (
              <button
                key={k}
                className={`mode-btn ${
                  mode === k ? (k === "demo" ? "demo-active" : "active") : ""
                }`}
                onClick={() => switchMode(k)}
              >
                {k === "demo" ? "🎬 " : "👤 "}
                {v.label}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#14b8a6",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {days.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: "#334155" }}>
              days to D-Day · March 14, 2030
            </div>
          </div>
        </div>

        <div className="layout">
          <div className="sidebar">
            <div className="sb-card">
              <div className="sb-title">Portfolio</div>
              <Slider
                label="Current value"
                value={port}
                min={500000}
                max={5000000}
                step={10000}
                format={(v) => fmtM(v)}
                onChange={setPort}
              />
              <Slider
                label="Annual contrib"
                value={contrib}
                min={0}
                max={100000}
                step={500}
                format={(v) => fmtK(v) + "/yr"}
                onChange={setContrib}
              />
              <Slider
                label="Mean return"
                value={mr}
                min={3}
                max={12}
                step={0.25}
                format={(v) => v.toFixed(2) + "%"}
                onChange={setMr}
              />
              <Slider
                label="Inflation"
                value={inf}
                min={1}
                max={6}
                step={0.25}
                format={(v) => v.toFixed(2) + "%"}
                onChange={setInf}
              />
            </div>

            <div className="sb-card">
              <div className="sb-title">Retirement</div>
              <Slider
                label="Retire age"
                value={retAge}
                min={55}
                max={68}
                step={1}
                format={(v) => "Age " + v}
                onChange={setRetAge}
              />
              <Slider
                label="Plan to age"
                value={endAge}
                min={80}
                max={100}
                step={1}
                format={(v) => "Age " + v}
                onChange={setEndAge}
              />
              <Slider
                label="Annual spend"
                value={sp}
                min={30000}
                max={200000}
                step={1000}
                format={(v) => fmtK(v) + "/yr"}
                onChange={setSp}
              />
              <Slider
                label="SS start age"
                value={ssAge}
                min={62}
                max={70}
                step={1}
                format={(v) => "Age " + v}
                onChange={setSsAge}
              />
              <Slider
                label="SS benefit"
                value={ssb}
                min={0}
                max={50000}
                step={500}
                format={(v) => fmtK(v) + "/yr"}
                onChange={setSsb}
              />
              <Slider
                label="Airbnb net"
                value={ab}
                min={0}
                max={50000}
                step={1000}
                format={(v) => fmtK(v) + "/yr"}
                onChange={setAb}
              />
            </div>

            <div className="sb-card">
              <div className="sb-title">Options</div>
              <Toggle
                val={smile}
                onChange={setSmile}
                label="🙂 Smile spending"
              />
              <Toggle
                val={tax}
                onChange={setTax}
                label="🏛 Tax drag"
                accent="#d97706"
              />
              <Toggle
                val={useAb}
                onChange={setUseAb}
                label="🏖 Airbnb income"
                accent="#059669"
              />
              <Toggle
                val={real}
                onChange={setReal}
                label="📉 Real dollars"
                accent="#0ea5e9"
              />
            </div>

            <button
              className="run-btn"
              onClick={runSimulation}
              disabled={running}
            >
              {running ? "Running 6,000 paths..." : "▶ Run Monte Carlo"}
            </button>
            <div
              style={{ fontSize: 10, color: "#334155", textAlign: "center" }}
            >
              3,000 paths × age 85 + age 90 · per-year log-normal
            </div>
          </div>

          <div className="main">
            <div className="flag">
              ⚠ NJ domicile — establish FL residency before Dec 31, 2030 · Est.
              Roth ladder savings vs NJ: ~$50,575
            </div>
            <div className="flag">
              ⚠ SS gap Jan 2031 → Mar 2034 — zero SS income for 3 years · Bucket
              1 ($180K cash) covers this window
            </div>

            <div className="metrics">
              <div className="met">
                <div className="met-label">Success to 85</div>
                <div
                  className="met-val"
                  style={{
                    color: results85
                      ? results85.rate >= 0.85
                        ? "#0d9488"
                        : results85.rate >= 0.7
                        ? "#f59e0b"
                        : "#ef4444"
                      : "#334155",
                  }}
                >
                  {results85 ? (results85.rate * 100).toFixed(1) + "%" : "—"}
                </div>
                <div className="met-sub">3,000 simulations</div>
              </div>
              <div className="met">
                <div className="met-label">Success to 90</div>
                <div
                  className="met-val"
                  style={{
                    color: results90
                      ? results90.rate >= 0.85
                        ? "#0d9488"
                        : results90.rate >= 0.7
                        ? "#f59e0b"
                        : "#ef4444"
                      : "#334155",
                  }}
                >
                  {results90 ? (results90.rate * 100).toFixed(1) + "%" : "—"}
                </div>
                <div className="met-sub">3,000 simulations</div>
              </div>
              <div className="met">
                <div className="met-label">Portfolio at D-Day</div>
                <div
                  className="met-val"
                  style={{ color: "#94a3b8", fontSize: 18 }}
                >
                  {results90 ? fmtM(results90.medRetire) : "—"}
                </div>
                <div className="met-sub">Median projected</div>
              </div>
              <div className="met">
                <div className="met-label">Withdrawal rate</div>
                <div
                  className="met-val"
                  style={{
                    color:
                      +swr <= 4 ? "#0d9488" : +swr <= 5 ? "#f59e0b" : "#ef4444",
                    fontSize: 20,
                  }}
                >
                  {swr}%
                </div>
                <div className="met-sub">4% = safe benchmark</div>
              </div>
            </div>

            {analogue && (
              <div className="analogue">
                {analogue.emoji} "{analogue.text}." —{" "}
                {(results90.rate * 100).toFixed(1)}% success to age {endAge}.
              </div>
            )}

            <div className="tabs">
              {[
                ["fan", "📈 Portfolio fan"],
                ["income", "💵 Income map"],
                ["smile", "🙂 Spending smile"],
                ["stress", "🔶 Stress test"],
                ["roth", "🔄 Roth ladder"],
                ["mortgage", "🏠 Mortgage"],
                ["people", "👥 People viz"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={`tab ${activeTab === k ? "active" : ""}`}
                  onClick={() => setTab(k)}
                >
                  {l}
                </button>
              ))}
            </div>

            {!results90 &&
            activeTab !== "roth" &&
            activeTab !== "smile" &&
            activeTab !== "income" &&
            activeTab !== "mortgage" ? (
              <div
                className="chart-card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 280,
                  color: "#475569",
                }}
              >
                Press ▶ Run Monte Carlo to generate the fan chart and survival
                analysis.
              </div>
            ) : (
              <>
                {activeTab === "fan" && results90 && (
                  <>
                    <SimulationInputs
                      params={params}
                      mode={mode}
                      contrib={contrib}
                      port={port}
                      mr={mr}
                      inf={inf}
                      sp={sp}
                      ssAge={ssAge}
                      ssb={ssb}
                      ab={ab}
                      useAb={useAb}
                      smile={smile}
                      tax={tax}
                      real={real}
                    />
                    <FanChart
                      pcts={results90.pcts}
                      retireAge={retAge}
                      ssAge={ssAge}
                      inf={inf}
                      useReal={real}
                      title={`Portfolio fan · age ${endAge} horizon · 3,000 paths`}
                    />
                  </>
                )}

                {activeTab === "income" && <IncomeMap p={params} />}

                {activeTab === "smile" && <SmileChart p={params} />}

                {activeTab === "stress" && stress90 && (
                  <div>
                    <FanChart
                      pcts={stress90.pcts}
                      retireAge={retAge}
                      ssAge={ssAge}
                      inf={inf}
                      useReal={real}
                      title="Stress test: 2000–2012 actual S&P 500 returns at retirement (dot-com + 2008)"
                    />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      <div className="met">
                        <div className="met-label">Stress success rate</div>
                        <div
                          className="met-val"
                          style={{
                            color:
                              stress90.rate >= 0.85 ? "#0d9488" : "#f59e0b",
                          }}
                        >
                          {(stress90.rate * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="met">
                        <div className="met-label">Delta vs base case</div>
                        <div
                          className="met-val"
                          style={{
                            color:
                              stress90.rate >= results90.rate
                                ? "#0d9488"
                                : "#ef4444",
                          }}
                        >
                          {((stress90.rate - results90.rate) * 100).toFixed(1)}
                          pp
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      {SEQ_2000_2012.map((r, i) => (
                        <span
                          key={i}
                          style={{
                            display: "inline-block",
                            margin: 2,
                            padding: "3px 7px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontFamily: "'DM Mono', monospace",
                            fontWeight: 500,
                            background:
                              r < 0
                                ? "rgba(239,68,68,0.15)"
                                : "rgba(16,185,129,0.12)",
                            color: r < 0 ? "#f87171" : "#34d399",
                            border: `1px solid ${
                              r < 0
                                ? "rgba(239,68,68,0.3)"
                                : "rgba(16,185,129,0.25)"
                            }`,
                          }}
                        >
                          {2000 + i}: {r > 0 ? "+" : ""}
                          {(r * 100).toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "roth" && <RothLadder />}

                {activeTab === "mortgage" && <MortgageTab />}

                {activeTab === "people" && results90 && (
                  <PeopleViz rate={results90.rate} />
                )}
              </>
            )}

            <div
              style={{
                fontSize: 10,
                color: "#1e3a5f",
                textAlign: "center",
                paddingTop: 4,
              }}
            >
              AiRA Freedom Financial v4 · Authoritative Mode · 3,000 paths ·
              Per-year log-normal (Carpe Muerte) · Glide path 91/9→70/30 ·
              Blanchett smile · Stress: S&P 2000–2012 · MFJ throughout · Not
              financial advice
              <br />
              "The best financial plan is the one you can stick with." — Morgan
              Housel
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
