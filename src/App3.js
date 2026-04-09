import { useState, useEffect, useMemo } from "react";

/* ── Google Fonts ── */
const _fl = document.createElement("link");
_fl.rel = "stylesheet";
_fl.href =
  "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap";
document.head.appendChild(_fl);

import {
  ComposedChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

/* ══════════════════════════════════════════════
   MATH CORE
══════════════════════════════════════════════ */
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
  const u1 = Math.max(rand(), 1e-10);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
}

/* ══════════════════════════════════════════════
   RETIREMENT SMILE SPENDING
   Blanchett / Morningstar research-based.
   Phase 1B (60-65): 110-120%  Phase 2 (65-75): declining  Phase 3 (75-85): flat  Healthcare tail: 90%
══════════════════════════════════════════════ */
function smileMultiplier(age) {
  if (age < 65) return 1.15; // Go-go: Thailand, Philippines, bucket list — Perkins territory
  if (age < 70) return 1.05; // Still active
  if (age < 75) return 0.95; // Transition
  if (age < 80) return 0.85; // Slow-go
  if (age < 85) return 0.8; // No-go
  return 0.9; // Healthcare tail surge
}

/* ══════════════════════════════════════════════
   TAX DRAG — 3-phase federal marginal rate
   Pre-tax ratio tracks Roth conversion progress
══════════════════════════════════════════════ */
function taxRate(age, ssAge) {
  if (age < ssAge) return 0.12;
  if (age < 73) return 0.15;
  return 0.22;
}
const PRE_TAX_RATIO = 0.6;

/* ══════════════════════════════════════════════
   MONTE CARLO ENGINE
══════════════════════════════════════════════ */
function runMonteCarlo(p, N = 2000, seedOffset = 0) {
  const rand = mulberry32(42 + seedOffset);
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = p.endAge - p.retireAge;
  const results = [];

  for (let i = 0; i < N; i++) {
    let port = p.portfolioTotal;

    for (let y = 0; y < accYrs; y++) {
      port =
        port * (1 + p.meanReturn + p.stdDev * boxMuller(rand)) +
        p.annualContrib;
    }

    const path = [Math.round(port)];
    let survived = true,
      exhaustAge = null;

    for (let y = 0; y < retYrs; y++) {
      const age = p.retireAge + y;
      const seqPenalty = y < 5 ? p.sequencePenalty || 0 : 0;
      const r = p.meanReturn - seqPenalty + p.stdDev * boxMuller(rand);
      const inf = Math.pow(1 + p.inflation, y);
      const baseSp = p.annualSpending * inf;
      const grossSpend = p.useSmile ? baseSp * smileMultiplier(age) : baseSp;
      const ss = age >= p.ssAge ? p.ssBenefit * Math.pow(1.024, y) : 0;
      const rental = p.includeRental
        ? p.rentalIncome * Math.pow(1.03, Math.min(y, 20))
        : 0;
      const portNeed = Math.max(0, grossSpend - ss - rental);
      const tRate = p.includeTax ? taxRate(age, p.ssAge) : 0;

      // Mortgage paydown: extra draw in years 1-4 of retirement (ages 60-63)
      const mortDraw =
        p.includeMortgage && age >= 60 && age <= 63 ? p.mortgageAnnual || 0 : 0;

      const draw = portNeed * (1 + tRate * PRE_TAX_RATIO) + mortDraw;

      port = port * (1 + r) - draw;
      if (port <= 0 && survived) {
        survived = false;
        exhaustAge = age;
        port = 0;
      }
      path.push(Math.max(0, Math.round(port)));
    }
    results.push({ path, survived, exhaustAge });
  }

  const pathLen = results[0].path.length;
  const pctPaths = [];
  for (let t = 0; t < pathLen; t++) {
    const vals = results.map((r) => r.path[t]).sort((a, b) => a - b);
    const pct = (q) => vals[Math.floor(q * (vals.length - 1))];
    pctPaths.push({
      age: p.retireAge + t,
      p10: pct(0.1),
      p25: pct(0.25),
      p50: pct(0.5),
      p75: pct(0.75),
      p90: pct(0.9),
    });
  }

  const nSurvived = results.filter((r) => r.survived).length;
  const exAges = results
    .filter((r) => !r.survived && r.exhaustAge)
    .map((r) => r.exhaustAge);
  const medExhaust = exAges.length
    ? exAges.sort((a, b) => a - b)[Math.floor(exAges.length / 2)]
    : null;

  return { successRate: nSurvived / N, pctPaths, medExhaust, N };
}

/* ══════════════════════════════════════════════
   STRESS TEST: 2000–2012
══════════════════════════════════════════════ */
const SEQ_2000_2012 = [
  { year: 2000, r: -0.091 },
  { year: 2001, r: -0.119 },
  { year: 2002, r: -0.221 },
  { year: 2003, r: 0.287 },
  { year: 2004, r: 0.109 },
  { year: 2005, r: 0.048 },
  { year: 2006, r: 0.158 },
  { year: 2007, r: 0.055 },
  { year: 2008, r: -0.37 },
  { year: 2009, r: 0.265 },
  { year: 2010, r: 0.151 },
  { year: 2011, r: 0.021 },
  { year: 2012, r: 0.16 },
];

function runStressMonteCarlo(p, N = 2000) {
  const rand = mulberry32(99);
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = p.endAge - p.retireAge;
  const results = [];

  for (let i = 0; i < N; i++) {
    let port = p.portfolioTotal;
    for (let y = 0; y < accYrs; y++) {
      port =
        port * (1 + p.meanReturn + p.stdDev * boxMuller(rand)) +
        p.annualContrib;
    }
    const path = [Math.round(port)];
    let survived = true,
      exhaustAge = null;

    for (let y = 0; y < retYrs; y++) {
      const age = p.retireAge + y;
      const r =
        y < SEQ_2000_2012.length
          ? SEQ_2000_2012[y].r
          : p.meanReturn + p.stdDev * boxMuller(rand);
      const inf = Math.pow(1 + p.inflation, y);
      const baseSp = p.annualSpending * inf;
      const grossSpend = p.useSmile ? baseSp * smileMultiplier(age) : baseSp;
      const ss = age >= p.ssAge ? p.ssBenefit * Math.pow(1.024, y) : 0;
      const rental = p.includeRental
        ? p.rentalIncome * Math.pow(1.03, Math.min(y, 20))
        : 0;
      const portNeed = Math.max(0, grossSpend - ss - rental);
      const tRate = p.includeTax ? taxRate(age, p.ssAge) : 0;
      const mortDraw =
        p.includeMortgage && age >= 60 && age <= 63 ? p.mortgageAnnual || 0 : 0;
      const draw = portNeed * (1 + tRate * PRE_TAX_RATIO) + mortDraw;

      port = port * (1 + r) - draw;
      if (port <= 0 && survived) {
        survived = false;
        exhaustAge = age;
        port = 0;
      }
      path.push(Math.max(0, Math.round(port)));
    }
    results.push({ path, survived, exhaustAge });
  }

  function getBracketRoom(
    age,
    baseIncome,
    stdDed,
    taxMode,
    year,
    brackets2026
  ) {
    // Index brackets for inflation
    const inflFactor = Math.pow(1.025, year - 2026);
    const b = brackets2026.map((b) => ({
      ...b,
      top: b.top * inflFactor,
    }));

    // Standard deduction (indexed)
    const stdDedYr = 32200 * inflFactor + (age >= 65 ? 1650 * 2 : 0);

    // Current taxable income
    const taxable = Math.max(0, baseIncome - stdDedYr);

    // Select target bracket
    let targetTop;
    if (taxMode === "fill_12") targetTop = b.find((x) => x.rate === 0.12).top;
    if (taxMode === "fill_22") targetTop = b.find((x) => x.rate === 0.22).top;
    if (taxMode === "fill_24") targetTop = b.find((x) => x.rate === 0.24).top;
    if (taxMode === "optimal") targetTop = getOptimalBracket(age, year, b);

    // Room remaining
    return Math.max(0, targetTop - taxable);
  }

  function getOptimalBracket(age, year, brackets) {
    // FAFSA years — stay at 12%
    if (year <= 2029) return brackets.find((x) => x.rate === 0.12).top;
    // IRMAA guard years
    if (age >= 63 && age <= 65)
      return brackets.find((x) => x.rate === 0.22).top;
    // Default Roth conversion window
    if (age >= 60 && age <= 72)
      return brackets.find((x) => x.rate === 0.22).top;
    // RMD years — minimize
    if (age >= 73) return brackets.find((x) => x.rate === 0.22).top;
    return brackets.find((x) => x.rate === 0.22).top;
  }

  const pathLen = results[0].path.length;
  const pctPaths = [];
  for (let t = 0; t < pathLen; t++) {
    const vals = results.map((r) => r.path[t]).sort((a, b) => a - b);
    const pct = (q) => vals[Math.floor(q * (vals.length - 1))];
    pctPaths.push({
      age: p.retireAge + t,
      p10: pct(0.1),
      p25: pct(0.25),
      p50: pct(0.5),
      p75: pct(0.75),
      p90: pct(0.9),
    });
  }

  const nSurvived = results.filter((r) => r.survived).length;
  const exAges = results
    .filter((r) => !r.survived && r.exhaustAge)
    .map((r) => r.exhaustAge);
  const medExhaust = exAges.length
    ? exAges.sort((a, b) => a - b)[Math.floor(exAges.length / 2)]
    : null;

  return { successRate: nSurvived / N, pctPaths, medExhaust, N };
}

/* ══════════════════════════════════════════════
   PROFILES — corrected from Master Instructions v3.0.1
══════════════════════════════════════════════ */
const PROFILES = {
  personal: {
    label: "My Plan",
    name: "Vin",
    tag: "AiRA Freedom Financial",
    currentAge: 56,
    retireAge: 60,
    endAge: 90,
    portfolioTotal: 2_461_544, // Corrected Mar 23, 2026
    annualContrib: 38_525, // Alpha 401k total
    meanReturn: 0.075,
    stdDev: 0.13,
    inflation: 0.025, // 2.5% per protocol
    annualSpending: 96_000, // Yearly Spending
    ssAge: 64,
    ssBenefit: 31_543, // SS at 64, March 2034 — CLOSED DECISION
    rentalIncome: 20_000, // 🚩 $20K NET — never $54K gross
    includeRental: true,
    mortgageBalance: 267_518, // Feb 2026 statement
    mortgageAnnual: 67_000, // ~$267K / 4 years paydown
  },
  demo: {
    label: "Demo Mode",
    name: "Alex",
    tag: "AiRA · Demo",
    currentAge: 45,
    retireAge: 62,
    endAge: 90,
    portfolioTotal: 1_200_000,
    annualContrib: 24_000,
    meanReturn: 0.075,
    stdDev: 0.13,
    inflation: 0.025,
    annualSpending: 90_000,
    ssAge: 67,
    ssBenefit: 28_000,
    rentalIncome: 0,
    includeRental: false,
    mortgageBalance: 0,
    mortgageAnnual: 0,
  },
};

/* ══════════════════════════════════════════════
   SCENARIOS
══════════════════════════════════════════════ */
const SCENARIOS = [
  {
    key: "base",
    label: "Base Case",
    icon: "📊",
    desc: "Your plan as modeled",
    extra: {},
  },
  {
    key: "bear",
    label: "Bear Case",
    icon: "🐻",
    desc: "Sequence penalty first 5 yrs",
    extra: { sequencePenalty: 0.04 },
  },
  {
    key: "bull",
    label: "Bull Case",
    icon: "🐂",
    desc: "+1% returns · higher accumulation",
    extra: { meanReturn_delta: 0.01 },
  },
  {
    key: "norental",
    label: "No Rental",
    icon: "🏚️",
    desc: "Airbnb income drops to zero",
    extra: { includeRental: false },
  },
  {
    key: "highspend",
    label: "Higher Spending",
    icon: "💸",
    desc: "$6K/mo abroad ($72K/yr)",
    extra: { annualSpending: 72_000 },
  },
  {
    key: "delay62",
    label: "Delay to 62",
    icon: "⏳",
    desc: "Work 2 more years to 62",
    extra: { retireAge_delta: 2 },
  },
];

/* ══════════════════════════════════════════════
   PROBABILITY ANALOGUES — Protocol 4.C
══════════════════════════════════════════════ */
function getAnalogue(rate) {
  const p = rate * 100;
  if (p >= 99)
    return {
      text: "As certain as the sun rising tomorrow",
      emoji: "☀️",
      color: "#10b981",
    };
  if (p >= 95)
    return {
      text: "As reliable as a commercial flight landing safely",
      emoji: "✈️",
      color: "#10b981",
    };
  if (p >= 90)
    return {
      text: "Better odds than a 50-year-old reaching age 65",
      emoji: "💪",
      color: "#34d399",
    };
  if (p >= 85)
    return {
      text: "Like calling heads/tails correctly — twice in a row",
      emoji: "🪙",
      color: "#6ee7b7",
    };
  if (p >= 80)
    return {
      text: "Similar to a college freshman graduating in 4 years",
      emoji: "🎓",
      color: "#fbbf24",
    };
  if (p >= 75)
    return {
      text: "About the odds an NBA player makes a free throw",
      emoji: "🏀",
      color: "#fbbf24",
    };
  if (p >= 70)
    return {
      text: "Odds a new business survives its first two years",
      emoji: "🏢",
      color: "#f97316",
    };
  if (p >= 65)
    return {
      text: "A 65% chance of rain forecast — bring an umbrella",
      emoji: "🌧️",
      color: "#f97316",
    };
  if (p >= 55)
    return {
      text: "Slightly better than a coin flip — too close",
      emoji: "😰",
      color: "#ef4444",
    };
  return {
    text: "Less likely than drawing a face card from a deck",
    emoji: "🃏",
    color: "#dc2626",
  };
}

/* ══════════════════════════════════════════════
   FORMATTERS
══════════════════════════════════════════════ */
const fmtM = (v) =>
  v >= 1e6
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1e3
    ? `$${Math.round(v / 1000)}K`
    : `$${v}`;
const fmtK = (v) => `$${Math.round(v / 1000)}K`;

/* ══════════════════════════════════════════════
   D-DAY COUNTDOWN — includes actual desk days (M-F only)
══════════════════════════════════════════════ */
function countWorkDays(from, to) {
  // US Federal Holidays (approximate recurring dates)
  const isHoliday = (d) => {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = d.getDay();
    // New Year's, MLK, Presidents, Memorial, Juneteenth,
    // July 4, Labor, Thanksgiving+Friday, Christmas
    if (m === 1 && day === 1) return true;
    if (m === 1 && dow === 1 && day >= 15 && day <= 21) return true;
    if (m === 2 && dow === 1 && day >= 15 && day <= 21) return true;
    if (m === 5 && dow === 1 && day >= 25) return true;
    if (m === 6 && day === 19) return true;
    if (m === 7 && day === 4) return true;
    if (m === 9 && dow === 1 && day <= 7) return true;
    if (m === 11 && dow === 4 && day >= 22 && day <= 28) return true;
    if (m === 11 && dow === 5 && day >= 23 && day <= 29) return true;
    if (m === 12 && day === 25) return true;
    return false;
  };

  // PTO + sick days per year (Alpha FMC)
  // 25 vacation + 5 sick = 30 days/yr = ~2.5/month
  const PTO_SICK_PER_YEAR = 30;

  let workDays = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (d < end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !isHoliday(d)) workDays++;
    d.setDate(d.getDate() + 1);
  }

  // Subtract PTO + sick days proportionally
  const yearsRemaining = (end - from) / (365.25 * 86400000);
  const ptoDays = Math.round(yearsRemaining * PTO_SICK_PER_YEAR);

  return Math.max(0, workDays - ptoDays);
}

function useDDayCountdown() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dday = new Date("2030-03-14T00:00:00");
  const diff = dday - now;
  if (diff <= 0)
    return { days: 0, hours: 0, mins: 0, secs: 0, pct: 100, deskDays: 0 };

  const totalStart = new Date("2026-03-06T00:00:00");
  const totalSpan = dday - totalStart;
  const elapsed = now - totalStart;
  const pct = Math.min(100, Math.max(0, (elapsed / totalSpan) * 100));
  const deskDays = countWorkDays(now, dday);

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    mins: Math.floor((diff % 3600000) / 60000),
    secs: Math.floor((diff % 60000) / 1000),
    pct: pct.toFixed(1),
    deskDays,
  };
}

/* ══════════════════════════════════════════════
   TOOLTIP
══════════════════════════════════════════════ */
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0d1b2aee",
        border: "1px solid #1e3a5f",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 11,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ color: "#64748b", marginBottom: 5, fontWeight: 600 }}>
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

/* ══════════════════════════════════════════════
   TOGGLE
══════════════════════════════════════════════ */
const Toggle = ({ val, set, label, accent = "#0d9488" }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
    <div
      onClick={() => set(!val)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: val ? accent : "#1e293b",
        cursor: "pointer",
        position: "relative",
        transition: "all 0.25s ease",
        border: `1px solid ${val ? accent + "88" : "#334155"}`,
        flexShrink: 0,
        boxShadow: val ? `0 0 12px ${accent}44` : "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: val ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "white",
          transition: "left 0.25s ease",
          boxShadow: val ? `0 0 6px ${accent}66` : "0 1px 3px #00000033",
        }}
      />
    </div>
  </div>
);

/* ══════════════════════════════════════════════
   26-PEOPLE-IN-A-ROOM VISUALIZATION (Protocol 4.C)
══════════════════════════════════════════════ */
function PeopleViz({ successRate, N }) {
  const total = 25;
  const failCount = Math.round((1 - successRate) * total);
  const successCount = total - failCount;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "12px 0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        If {total} people had your exact plan…
      </div>
      <div
        style={{
          display: "flex",
          gap: 3,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 260,
        }}
      >
        {Array.from({ length: total }, (_, i) => {
          const isFail = i >= successCount;
          return (
            <div
              key={i}
              style={{
                fontSize: 18,
                filter: isFail ? "grayscale(1) opacity(0.4)" : "none",
                transform: isFail ? "scale(0.9)" : "none",
                transition: "all 0.3s ease",
              }}
            >
              {isFail ? "💀" : "🧑"}
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 300,
        }}
      >
        <span style={{ color: "#10b981", fontWeight: 700 }}>
          {successCount}
        </span>{" "}
        make it to age 90.{" "}
        {failCount > 0 && (
          <>
            <span style={{ color: "#ef4444", fontWeight: 700 }}>
              {failCount}
            </span>{" "}
            run out of money.
          </>
        )}
        {failCount === 0 && (
          <span style={{ color: "#10b981" }}>Everyone makes it.</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>
        Based on {N.toLocaleString()} Monte Carlo simulations
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   SECTOR INDICATOR
══════════════════════════════════════════════ */
function SectorBadge({ currentAge }) {
  const sectors = [
    {
      name: "The Escape",
      range: "Pre-59.5",
      color: "#ef4444",
      icon: "🚀",
      active: currentAge < 59.5,
    },
    {
      name: "The Gap",
      range: "59.5–63",
      color: "#0ea5e9",
      icon: "🛸",
      active: currentAge >= 59.5 && currentAge < 63,
    },
    {
      name: "The Maneuver",
      range: "65–72",
      color: "#fbbf24",
      icon: "📡",
      active: currentAge >= 65 && currentAge < 72,
    },
    {
      name: "The Torpedo",
      range: "70+",
      color: "#f97316",
      icon: "🚀",
      active: currentAge >= 72,
    },
    {
      name: "Legacy",
      range: "Unknown",
      color: "#a78bfa",
      icon: "🔐",
      active: false,
    },
  ];
  const current = sectors.find((s) => s.active) || sectors[0];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {sectors.map((s, i) => (
        <div
          key={i}
          style={{
            width: s.active ? "auto" : 8,
            height: 8,
            borderRadius: s.active ? 12 : 4,
            background: s.active ? s.color : `${s.color}33`,
            padding: s.active ? "2px 10px" : 0,
            fontSize: 9,
            color: "white",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.3s ease",
            boxShadow: s.active ? `0 0 12px ${s.color}44` : "none",
          }}
        >
          {s.active && (
            <>
              {s.icon} Sector {i + 1}: {s.name}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════
   FAN CHART DISPLAY
══════════════════════════════════════════════ */
function FanChartDisplay({
  pctPaths,
  retireAge,
  ssAge,
  gradId = "fan",
  useReal = false,
  inflation = 0.025,
}) {
  const data = pctPaths.map((d, i) => {
    const deflator = useReal ? Math.pow(1 + inflation, i) : 1;
    return {
      age: d.age,
      p90: Math.round(d.p90 / deflator),
      p75: Math.round(d.p75 / deflator),
      median: Math.round(d.p50 / deflator),
      p25: Math.round(d.p25 / deflator),
      p10: Math.round(d.p10 / deflator),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart
        data={data}
        margin={{ top: 36, right: 20, left: 0, bottom: 8 }}
      >
        <defs>
          <linearGradient id={`${gradId}Outer`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5eead4" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#5eead4" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={`${gradId}Inner`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#0d9488" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 5" stroke="#0f2035" />
        <XAxis
          dataKey="age"
          stroke="#1e3a5f"
          tick={{ fill: "#64748b", fontSize: 10 }}
        />
        <YAxis
          stroke="#1e3a5f"
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`}
          width={54}
        />
        <Tooltip content={<Tip />} />
        <ReferenceLine
          x={retireAge}
          stroke="#fbbf24"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          label={{
            value: "D-Day",
            fill: "#fbbf24",
            fontSize: 10,
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
            fontSize: 10,
            position: "top",
          }}
        />
        <ReferenceLine
          x={73}
          stroke="#34d399"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          label={{
            value: "RMD",
            fill: "#34d399",
            fontSize: 10,
            position: "top",
          }}
        />

        <Area
          type="monotone"
          dataKey="p90"
          stroke="#5eead4"
          strokeWidth={1}
          strokeDasharray="4 2"
          fill={`url(#${gradId}Outer)`}
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
          fill={`url(#${gradId}Inner)`}
          dot={false}
          name="75th %ile"
          legendType="none"
        />

        <Line
          type="monotone"
          dataKey="median"
          stroke="#14b8a6"
          strokeWidth={3}
          dot={false}
          name="Median"
        />
        <Line
          type="monotone"
          dataKey="p25"
          stroke="#fcd34d"
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 3"
          name="25th %ile"
        />
        <Line
          type="monotone"
          dataKey="p10"
          stroke="#fca5a5"
          strokeWidth={2.5}
          dot={false}
          strokeDasharray="3 3"
          name="10th %ile"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ══════════════════════════════════════════════
   SMILE CHART
══════════════════════════════════════════════ */
function SmileChart({ baseSpending, retireAge, inflation }) {
  const data = Array.from({ length: 31 }, (_, i) => {
    const age = retireAge + i;
    const inf = Math.pow(1 + inflation, i);
    return {
      age,
      Flat: Math.round(baseSpending * inf),
      Smile: Math.round(baseSpending * smileMultiplier(age) * inf),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 20, left: 0, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="2 5" stroke="#0f2035" />
        <XAxis
          dataKey="age"
          stroke="#1e3a5f"
          tick={{ fill: "#64748b", fontSize: 10 }}
        />
        <YAxis
          stroke="#1e3a5f"
          tick={{ fill: "#64748b", fontSize: 10 }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
          width={46}
        />
        <Tooltip content={<Tip />} />
        <ReferenceLine x={65} stroke="#fbbf2455" strokeDasharray="3 3" />
        <ReferenceLine x={75} stroke="#f9731655" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="Flat"
          stroke="#475569"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Smile"
          stroke="#a78bfa"
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ══════════════════════════════════════════════
   ROTH CONVERSION LADDER DATA
   Ages 60-63, filling brackets bottom-up
══════════════════════════════════════════════ */
function buildRothLadder(isFL = true) {
  // MFJ 2026 brackets (approximate, inflation-indexed to conversion years)
  const years = [
    {
      year: 2031,
      age: 61,
      label: "Year 1",
      otherIncome: 20000, // Airbnb net
      bracket12: 96_700,
      bracket22: 206_000,
    },
    {
      year: 2032,
      age: 62,
      label: "Year 2",
      otherIncome: 20600,
      bracket12: 99_000,
      bracket22: 211_000,
    },
    {
      year: 2033,
      age: 63,
      label: "Golden Year",
      otherIncome: 21200,
      bracket12: 101_300,
      bracket22: 216_000,
    },
  ];

  return years.map((y) => {
    const stdDed = 30_000; // MFJ std deduction ~$30K
    const taxableOther = Math.max(0, y.otherIncome - stdDed);
    const room12 = y.bracket12 - taxableOther;
    const room22 = y.bracket22 - taxableOther;
    const convTarget =
      y.age === 63 ? Math.min(210_000, room22) : Math.min(60_000, room12);
    const fedTax =
      y.age === 63
        ? y.bracket12 * 0.12 + (convTarget - y.bracket12) * 0.22
        : convTarget * 0.12;
    const stateTax = isFL ? 0 : convTarget * 0.065; // NJ ~6.5% avg

    return {
      ...y,
      convTarget,
      fedTax: Math.round(fedTax),
      stateTax: Math.round(stateTax),
      totalTax: Math.round(fedTax + stateTax),
      effectiveRate: (((fedTax + stateTax) / convTarget) * 100).toFixed(1),
      netToRoth: convTarget - Math.round(fedTax + stateTax),
    };
  });
}

/* ══════════════════════════════════════════════
   BUCKET STRATEGY AT RETIREMENT
══════════════════════════════════════════════ */
const BUCKETS = [
  {
    name: "Bucket 1: Cash/SGOV",
    target: "$160–200K",
    color: "#0ea5e9",
    pct: 6,
    purpose:
      "Living expenses — 3-5 years runway. NEVER dual-purpose for visa or investment.",
    holdings: "SGOV, Money Market, T-Bills",
  },
  {
    name: "Bucket 2: Income Sleeve",
    target: "~$500K",
    color: "#a78bfa",
    pct: 16,
    purpose: "Dividend/income generation. Starts AT retirement, not before.",
    holdings: "SCHD, SPYI, QQQI, Realty Income (O)",
  },
  {
    name: "Bucket 3: Growth",
    target: "Remainder (~$2.5M+)",
    color: "#10b981",
    pct: 78,
    purpose: "Never touch for 7-10 years. Let compounding work.",
    holdings: "VOO, SPMO, VTI, VXUS",
  },
];

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function AiRAForecaster() {
  const [mode, setMode] = useState("personal");
  const [activeTab, setActiveTab] = useState("fan");
  const [useReal, setUseReal] = useState(true);
  const profile = PROFILES[mode];
  const countdown = useDDayCountdown();

  const [portfolioTotal, setPT] = useState(profile.portfolioTotal);
  const [spending, setSP] = useState(profile.annualSpending);
  const [retireAge, setRA] = useState(profile.retireAge);
  const [returnPct, setRP] = useState(profile.meanReturn * 100);
  const [inflPct, setIP] = useState(profile.inflation * 100);
  const [ssAge, setSSA] = useState(profile.ssAge);
  const [includeRental, setIR] = useState(profile.includeRental);
  const [useSmile, setUseSmile] = useState(true);
  const [includeTax, setIncludeTax] = useState(true);
  const [includeMortgage, setIncludeMortgage] = useState(true);
  const [taxMode, setTaxMode] = useState("fill_22");

  useEffect(() => {
    const p = PROFILES[mode];
    setPT(p.portfolioTotal);
    setSP(p.annualSpending);
    setRA(p.retireAge);
    setRP(p.meanReturn * 100);
    setIP(p.inflation * 100);
    setSSA(p.ssAge);
    setIR(p.includeRental);
    if (mode === "demo") {
      setIncludeMortgage(false);
    } else {
      setIncludeMortgage(true);
    }
  }, [mode]);

  const params = {
    profile,
    portfolioTotal,
    annualSpending: spending,
    retireAge,
    meanReturn: returnPct / 100,
    inflation: inflPct / 100,
    ssAge,
    includeRental,
    stdDev: profile.stdDev,
    useSmile,
    includeTax,
    includeMortgage,
    mortgageAnnual: profile.mortgageAnnual || 0,
    taxMode,
  };

  const base = useMemo(
    () => runMonteCarlo(params, 2000, 0),
    [JSON.stringify(params)]
  );
  const stress = useMemo(
    () => runStressMonteCarlo(params, 2000),
    [JSON.stringify(params)]
  );
  const smileResult = useMemo(
    () => runMonteCarlo({ ...params, useSmile: true }, 1000, 500),
    [JSON.stringify(params)]
  );
  const flatResult = useMemo(
    () => runMonteCarlo({ ...params, useSmile: false }, 1000, 500),
    [JSON.stringify(params)]
  );

  const smileDelta = (
    (smileResult.successRate - flatResult.successRate) *
    100
  ).toFixed(1);

  const scenarioResults = useMemo(
    () =>
      SCENARIOS.map((s, idx) => {
        const sp = {
          ...params,
          retireAge: params.retireAge + (s.extra.retireAge_delta || 0),
          meanReturn: params.meanReturn + (s.extra.meanReturn_delta || 0),
          ssAge: s.extra.ssAge ?? params.ssAge,
          includeRental:
            s.extra.includeRental !== undefined
              ? s.extra.includeRental
              : params.includeRental,
          sequencePenalty: s.extra.sequencePenalty || 0,
          annualSpending: s.extra.annualSpending || params.annualSpending,
        };
        return { ...s, result: runMonteCarlo(sp, 1200, 100 + idx * 100) };
      }),
    [
      portfolioTotal,
      spending,
      retireAge,
      returnPct,
      inflPct,
      ssAge,
      includeRental,
      useSmile,
      includeTax,
      includeMortgage,
      mode,
    ]
  );

  const analogue = getAnalogue(base.successRate);
  const stressAna = getAnalogue(stress.successRate);
  const successPct = (base.successRate * 100).toFixed(1);
  const stressPct = (stress.successRate * 100).toFixed(1);
  const verdictColor =
    base.successRate >= 0.85
      ? "#0d9488"
      : base.successRate >= 0.7
      ? "#fbbf24"
      : "#ef4444";

  const terminalVals = base.pctPaths[base.pctPaths.length - 1] || {};
  const peakMedian = Math.max(...base.pctPaths.map((d) => d.p50));
  const impliedSWR = ((spending / portfolioTotal) * 100).toFixed(1);
  const failPct = ((1 - base.successRate) * 100).toFixed(1);
  const goalPct = ((portfolioTotal / 3_200_000) * 100).toFixed(0);

  const incomeYears = Math.min(30, params.endAge - params.retireAge);
  const incomeData = Array.from({ length: incomeYears }, (_, i) => {
    const age = retireAge + i;
    const inf = Math.pow(1 + inflPct / 100, i);
    const baseSp = spending * inf;
    const gross = useSmile
      ? Math.round(baseSp * smileMultiplier(age))
      : Math.round(baseSp);
    const ss =
      age >= ssAge ? Math.round(profile.ssBenefit * Math.pow(1.024, i)) : 0;
    const rental = includeRental
      ? Math.round(profile.rentalIncome * Math.pow(1.03, Math.min(i, 20)))
      : 0;
    const portNeed = Math.max(0, gross - ss - rental);
    const tRate = includeTax ? taxRate(age, ssAge) : 0;
    const tax = Math.round(portNeed * tRate * PRE_TAX_RATIO);
    const mort =
      includeMortgage && age >= 60 && age <= 63
        ? Math.round(profile.mortgageAnnual || 0)
        : 0;
    return {
      age,
      "Portfolio Draw": portNeed,
      "Social Security": ss,
      "Rental Income": rental,
      ...(includeTax && tax > 0 ? { "Tax Drag": tax } : {}),
      ...(mort > 0 ? { Mortgage: mort } : {}),
    };
  });

  const rothLadder = buildRothLadder(true); // FL/Thailand scenario

  const TABS = [
    ["fan", "📈 Portfolio Fan"],
    ["stress", "🔶 Stress Test"],
    ["income", "💵 Income Map"],
    ["roth", "🔄 Roth Ladder"],
    ["buckets", "🪣 Buckets"],
    ["smile", "🙂 Smile"],
    ["scenarios", "🎯 Scenarios"],
  ];

  /* ══════════════════════════════════════════
     RENDER — Single column layout for artifact panel (~600px)
  ══════════════════════════════════════════ */
  const [showControls, setShowControls] = useState(true);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(160deg,#020c18 0%,#071428 40%,#030e1c 100%)",
        color: "#e2e8f0",
        fontFamily: "'Outfit',sans-serif",
        fontSize: 11,
        overflowX: "hidden",
      }}
    >
      {/* ── HEADER ── */}
      <div
        style={{
          background: "#071428",
          borderBottom: "1px solid #0d9488",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#0d9488,#14b8a6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 900,
              color: "white",
            }}
          >
            Ai
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>
              AiRA{" "}
              <span style={{ color: "#5eead4", fontWeight: 400, fontSize: 11 }}>
                Freedom Financial
              </span>
            </div>
            <div style={{ fontSize: 10, color: "#475569" }}>
              AI Retirement Assessment — Dedicated to Aira
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 3,
            background: "#0a1628",
            border: "1px solid #1e3a5f",
            borderRadius: 8,
            padding: 2,
          }}
        >
          {Object.entries(PROFILES).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
                fontWeight: 600,
                background:
                  mode === key
                    ? key === "demo"
                      ? "linear-gradient(135deg,#7c3aed,#4f46e5)"
                      : "linear-gradient(135deg,#0d9488,#14b8a6)"
                    : "transparent",
                color: mode === key ? "white" : "#64748b",
              }}
            >
              {key === "demo" ? "🎬" : "👤"} {val.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "demo" && (
        <div
          style={{
            background: "#3730a3",
            padding: "4px 16px",
            fontSize: 10,
            color: "#c4b5fd",
          }}
        >
          🎬 <strong>Demo Mode</strong> — fictional profile. Safe to screencast.
        </div>
      )}

      <div style={{ padding: "12px 16px" }}>
        {/* ── D-DAY COUNTDOWN ── */}
        {mode === "personal" && (
          <div
            style={{
              background: "#0a1628",
              border: "1px solid #0d948844",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 12,
            }}
          >
            {/* Desk days — the hero number */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#5eead4",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Desk Days Remaining
                </div>
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 6 }}
                >
                  <span
                    style={{
                      fontSize: 48,
                      fontWeight: 900,
                      color: "#f0fdfa",
                      fontFamily: "'JetBrains Mono',monospace",
                      lineHeight: 1,
                    }}
                  >
                    {countdown.deskDays.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 13, color: "#475569" }}>
                    M–F until freedom
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#475569" }}>
                  Calendar Days
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "#94a3b8",
                    fontFamily: "'JetBrains Mono',monospace",
                    lineHeight: 1,
                  }}
                >
                  {countdown.days.toLocaleString()}
                </div>
              </div>
            </div>
            {/* Live clock + progress */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { v: countdown.days, l: "DAYS" },
                  { v: countdown.hours, l: "HRS" },
                  { v: countdown.mins, l: "MIN" },
                  { v: countdown.secs, l: "SEC" },
                ].map((u) => (
                  <div
                    key={u.l}
                    style={{
                      textAlign: "center",
                      background: "#071428",
                      borderRadius: 4,
                      padding: "4px 6px",
                      minWidth: 36,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: "#f0fdfa",
                        fontFamily: "'JetBrains Mono',monospace",
                        lineHeight: 1,
                      }}
                    >
                      {String(u.v).padStart(2, "0")}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#475569",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {u.l}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  flex: 1,
                  maxWidth: 200,
                  marginLeft: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: "#1e293b",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${countdown.pct}%`,
                      height: "100%",
                      background: "linear-gradient(90deg,#0d9488,#14b8a6)",
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#5eead4",
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {countdown.pct}%
                </span>
              </div>
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                color: "#334155",
                textAlign: "right",
              }}
            >
              March 14, 2030 · Age 60 · D-Day
            </div>
          </div>
        )}

        {/* ── HERO VERDICT ── */}
        <div
          style={{
            background: "#0a1628",
            border: `1.5px solid ${verdictColor}44`,
            borderRadius: 14,
            padding: "16px",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                }}
              >
                Survival Rate
              </div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: verdictColor,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {successPct}
                <span style={{ fontSize: 22 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: "#475569" }}>
                to age {params.endAge} · {base.N.toLocaleString()} paths
              </div>
            </div>
            <div
              style={{
                background: "#071428",
                border: "1px solid #fb923c33",
                borderRadius: 10,
                padding: "10px 14px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  textTransform: "uppercase",
                }}
              >
                Stress
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 900,
                  color: "#fb923c",
                  fontFamily: "'JetBrains Mono',monospace",
                  lineHeight: 1,
                }}
              >
                {stressPct}
                <span style={{ fontSize: 14 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: "#78350f" }}>2000–2012</div>
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#cbd5e1",
              fontStyle: "italic",
              marginBottom: 10,
              lineHeight: 1.4,
            }}
          >
            {analogue.emoji} "{analogue.text}."
          </div>
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            {[
              {
                label: "Fail",
                val: `${failPct}%`,
                color: base.successRate < 0.85 ? "#f87171" : "#64748b",
              },
              { label: "SWR", val: `${impliedSWR}%`, color: "#14b8a6" },
              {
                label: "Goal",
                val: `${goalPct}%`,
                color: goalPct >= 100 ? "#10b981" : "#fbbf24",
              },
              { label: "Peak", val: fmtM(peakMedian), color: "#93c5fd" },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  background: "#071428",
                  borderRadius: 6,
                  padding: "6px 10px",
                  textAlign: "center",
                  flex: "1 1 70px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: m.color,
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {m.val}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {useSmile && (
              <span
                style={{
                  background: "#3b076422",
                  border: "1px solid #a855f733",
                  borderRadius: 12,
                  padding: "2px 8px",
                  fontSize: 11,
                  color: "#d8b4fe",
                }}
              >
                🙂 +{smileDelta}pp
              </span>
            )}
            {includeTax && (
              <span
                style={{
                  background: "#42200622",
                  border: "1px solid #fbbf2433",
                  borderRadius: 12,
                  padding: "2px 8px",
                  fontSize: 11,
                  color: "#fde68a",
                }}
              >
                🏛 Tax
              </span>
            )}
            {includeMortgage && mode === "personal" && (
              <span
                style={{
                  background: "#05202e22",
                  border: "1px solid #0ea5e933",
                  borderRadius: 12,
                  padding: "2px 8px",
                  fontSize: 11,
                  color: "#7dd3fc",
                }}
              >
                �� Mtg
              </span>
            )}
            <SectorBadge currentAge={profile.currentAge} />
          </div>
          <PeopleViz successRate={base.successRate} N={base.N} />
        </div>

        {/* ── CONTROLS (collapsible) ── */}
        <div
          style={{
            background: "#071428",
            border: "1px solid #1e3a5f",
            borderRadius: 10,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          <div
            onClick={() => setShowControls(!showControls)}
            style={{
              padding: "10px 14px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>
              ⚙️ Assumptions & Toggles
            </span>
            <span style={{ fontSize: 10, color: "#475569" }}>
              {showControls ? "▲ Hide" : "▼ Show"}
            </span>
          </div>
          {showControls && (
            <div
              style={{
                padding: "0 14px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}
                >
                  Current Portfolio
                </div>
                <input
                  type="number"
                  value={portfolioTotal}
                  onChange={(e) => setPT(Number(e.target.value))}
                  step={10000}
                  style={{
                    width: "100%",
                    background: "#0d1b2a",
                    border: "1px solid #1e3a5f",
                    color: "#e2e8f0",
                    borderRadius: 6,
                    padding: "5px 8px",
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono',monospace",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {[
                {
                  label: "Annual Spending",
                  val: spending,
                  set: setSP,
                  min: 24000,
                  max: 200000,
                  step: 2000,
                  fmt: (v) => `$${(v / 1000).toFixed(0)}K`,
                },
                {
                  label: "Retire Age",
                  val: retireAge,
                  set: setRA,
                  min: 55,
                  max: 70,
                  step: 1,
                  fmt: (v) => `${v}`,
                },
                {
                  label: "Return",
                  val: returnPct,
                  set: setRP,
                  min: 3,
                  max: 12,
                  step: 0.5,
                  fmt: (v) => `${v.toFixed(1)}%`,
                },
                {
                  label: "Inflation",
                  val: inflPct,
                  set: setIP,
                  min: 1,
                  max: 6,
                  step: 0.25,
                  fmt: (v) => `${v.toFixed(2)}%`,
                },
                {
                  label: "SS Start Age",
                  val: ssAge,
                  set: setSSA,
                  min: 62,
                  max: 70,
                  step: 1,
                  fmt: (v) => `${v}`,
                },
              ].map((c) => (
                <div key={c.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      {c.label}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#14b8a6",
                        fontFamily: "'JetBrains Mono',monospace",
                      }}
                    >
                      {c.fmt(c.val)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={c.val}
                    onChange={(e) => c.set(Number(e.target.value))}
                    style={{
                      width: "100%",
                      accentColor: "#0d9488",
                      cursor: "pointer",
                      margin: 0,
                    }}
                  />
                </div>
              ))}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  borderTop: "1px solid #1e3a5f",
                  paddingTop: 10,
                }}
              >
                <Toggle val={includeRental} set={setIR} label="🏖️ Rental" />
                <Toggle
                  val={useSmile}
                  set={setUseSmile}
                  label="🙂 Smile"
                  accent="#7c3aed"
                />
                <Toggle
                  val={includeTax}
                  set={setIncludeTax}
                  label="🏛️ Tax"
                  accent="#d97706"
                />
                <Toggle
                  val={useReal}
                  set={setUseReal}
                  label="📉 Real $"
                  accent="#14b8a6"
                />
                {mode === "personal" && (
                  <Toggle
                    val={includeMortgage}
                    set={setIncludeMortgage}
                    label="🏠 Mortgage"
                    accent="#0ea5e9"
                  />
                )}
                {/* Tax Bracket Optimization */}
                <div
                  style={{
                    gridColumn: "1 / -1",
                    borderTop: "1px solid #1e3a5f",
                    paddingTop: 8,
                    marginTop: 2,
                  }}
                >
                  <div
                    style={{ fontSize: 11, color: "#a78bfa", marginBottom: 4 }}
                  >
                    💰 Tax Optimization
                  </div>
                  <select
                    value={taxMode}
                    onChange={(e) => setTaxMode(e.target.value)}
                    style={{
                      width: "100%",
                      background: "#0d1b2a",
                      border: "1px solid #1e3a5f",
                      color: "#e2e8f0",
                      borderRadius: 6,
                      padding: "5px 8px",
                      fontSize: 12,
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <option value="fixed">Fixed Withdrawal</option>
                    <option value="fill_12">Fill 12% Bracket</option>
                    <option value="fill_22">Fill 22% Bracket ★</option>
                    <option value="fill_24">Fill 24% Bracket ⚠️ IRMAA</option>
                    <option value="optimal">AiRA Optimal Mode</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── TABS ── */}
        <div
          style={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            marginBottom: -1,
            position: "relative",
            zIndex: 1,
          }}
        >
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: "7px 12px",
                fontSize: 12,
                fontFamily: "inherit",
                cursor: "pointer",
                border: "1px solid",
                borderColor: activeTab === key ? "#1e3a5f" : "transparent",
                borderBottom:
                  activeTab === key
                    ? "1px solid #071428"
                    : "1px solid transparent",
                borderRadius: "6px 6px 0 0",
                background: activeTab === key ? "#071428" : "transparent",
                color: activeTab === key ? "#e2e8f0" : "#475569",
                fontWeight: activeTab === key ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div
          style={{
            background: "#071428",
            border: "1px solid #1e3a5f",
            borderRadius: "0 8px 8px 8px",
            padding: "16px",
            minHeight: 300,
          }}
        >
          {activeTab === "fan" && (
            <>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
                {base.N.toLocaleString()} sims · {useReal ? "Real" : "Nominal"}{" "}
                ${useSmile && " · 🙂"}
                {includeTax && " · 🏛"}
              </div>
              <FanChartDisplay
                pctPaths={base.pctPaths}
                retireAge={retireAge}
                ssAge={ssAge}
                gradId="base"
                useReal={useReal}
                inflation={inflPct / 100}
              />
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 4,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {[
                  { c: "#5eead4", l: "90th" },
                  { c: "#0d9488", l: "75th" },
                  { c: "#14b8a6", l: "Med" },
                  { c: "#fcd34d", l: "25th" },
                  { c: "#fca5a5", l: "10th" },
                ].map((x) => (
                  <div
                    key={x.l}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "2px 6px",
                      background: "#0a1628",
                      borderRadius: 4,
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 2,
                        background: x.c,
                        borderRadius: 1,
                      }}
                    />
                    <span style={{ fontSize: 11, color: x.c }}>{x.l}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "stress" && (
            <>
              <div
                style={{
                  background: "#1c0a00",
                  border: "1px solid #fb923c44",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{ fontSize: 11, fontWeight: 700, color: "#fb923c" }}
                >
                  🔶 2000–2012 Stress Test
                </div>
                <div style={{ fontSize: 11, color: "#92400e" }}>
                  First 13 yrs use actual S&P returns: dot-com → 2008.
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  flexWrap: "wrap",
                  marginBottom: 10,
                  justifyContent: "center",
                }}
              >
                {SEQ_2000_2012.map((s) => (
                  <div
                    key={s.year}
                    style={{
                      background: s.r < 0 ? "#450a0a" : "#052e16",
                      borderRadius: 4,
                      padding: "2px 4px",
                      textAlign: "center",
                      minWidth: 32,
                    }}
                  >
                    <div style={{ fontSize: 7, color: "#64748b" }}>
                      {s.year}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono',monospace",
                        color: s.r < 0 ? "#f87171" : "#4ade80",
                      }}
                    >
                      {s.r > 0 ? "+" : ""}
                      {(s.r * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
              <FanChartDisplay
                pctPaths={stress.pctPaths}
                retireAge={retireAge}
                ssAge={ssAge}
                gradId="str"
                useReal={useReal}
                inflation={inflPct / 100}
              />
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 16,
                  background: "#0a1628",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Stress</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: "#fb923c",
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {stressPct}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>vs Base</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color:
                        stress.successRate >= base.successRate
                          ? "#4ade80"
                          : "#f87171",
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {((stress.successRate - base.successRate) * 100).toFixed(1)}
                    pp
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "income" && (
            <>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
                Income sources vs spending · {useSmile ? "🙂" : "Flat"} ·{" "}
                {includeTax ? "🏛" : "Gross"}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={incomeData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="#0d1f38" />
                  <XAxis
                    dataKey="age"
                    stroke="#1e3a5f"
                    tick={{ fill: "#64748b", fontSize: 9 }}
                  />
                  <YAxis
                    stroke="#1e3a5f"
                    tick={{ fill: "#64748b", fontSize: 9 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                    width={40}
                  />
                  <Tooltip content={<Tip />} />
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                      color: "#64748b",
                      paddingTop: 4,
                    }}
                  />
                  <Bar dataKey="Portfolio Draw" stackId="a" fill="#0d9488" />
                  <Bar dataKey="Social Security" stackId="a" fill="#7c3aed" />
                  <Bar dataKey="Rental Income" stackId="a" fill="#059669" />
                  {includeTax && (
                    <Bar dataKey="Tax Drag" stackId="a" fill="#b45309" />
                  )}
                  {includeMortgage && mode === "personal" && (
                    <Bar
                      dataKey="Mortgage"
                      stackId="a"
                      fill="#0ea5e9"
                      radius={[2, 2, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
              {mode === "personal" && (
                <div
                  style={{
                    marginTop: 8,
                    background: "#1c0a00",
                    border: "1px solid #fbbf2444",
                    borderRadius: 6,
                    padding: "8px 10px",
                  }}
                >
                  <div
                    style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700 }}
                  >
                    🚩 3-Year SS Gap: Jan 2031 → March 2034
                  </div>
                  <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
                    Bucket 1 + Bucket 2 + Airbnb $20K net must cover everything.
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "roth" && (
            <>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
                Roth Ladder · Ages 61–63 · FL/Thailand (no state tax)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rothLadder.map((y) => (
                  <div
                    key={y.year}
                    style={{
                      background: y.age === 63 ? "#0d1f38" : "#0a1628",
                      border: `1px solid ${
                        y.age === 63 ? "#fbbf2444" : "#1e3a5f"
                      }`,
                      borderRadius: 8,
                      padding: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: y.age === 63 ? "#fbbf24" : "#e2e8f0",
                          }}
                        >
                          {y.label}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: "#475569",
                            marginLeft: 6,
                          }}
                        >
                          {y.year} · Age {y.age}
                        </span>
                        {y.age === 63 && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "#fbbf24",
                              marginLeft: 6,
                              background: "#fbbf2418",
                              padding: "1px 6px",
                              borderRadius: 8,
                            }}
                          >
                            GOLDEN
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 900,
                          color: y.age === 63 ? "#fbbf24" : "#14b8a6",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {fmtK(y.convTarget)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {[
                        {
                          label: "Fed",
                          val: `$${y.fedTax.toLocaleString()}`,
                          color: "#f87171",
                        },
                        {
                          label: "State",
                          val: `$${y.stateTax.toLocaleString()}`,
                          color: y.stateTax > 0 ? "#f97316" : "#4ade80",
                        },
                        {
                          label: "Rate",
                          val: `${y.effectiveRate}%`,
                          color: "#fcd34d",
                        },
                        {
                          label: "Net→Roth",
                          val: `$${y.netToRoth.toLocaleString()}`,
                          color: "#14b8a6",
                        },
                      ].map((m) => (
                        <div
                          key={m.label}
                          style={{
                            textAlign: "center",
                            background: "#071428",
                            borderRadius: 4,
                            padding: "4px 8px",
                            flex: "1 1 60px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 7,
                              color: "#475569",
                              textTransform: "uppercase",
                            }}
                          >
                            {m.label}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: m.color,
                              fontFamily: "'JetBrains Mono',monospace",
                            }}
                          >
                            {m.val}
                          </div>
                        </div>
                      ))}
                    </div>
                    {y.age === 63 && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: "#92400e",
                          fontStyle: "italic",
                        }}
                      >
                        Last year before SS. Max bracket room. After, SS torpedo
                        drops space to ~$90K/yr.
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 10,
                  background: "#0a1628",
                  borderRadius: 8,
                  padding: "10px 12px",
                  border: "1px solid #14b8a644",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#14b8a6",
                    marginBottom: 4,
                  }}
                >
                  Prime Directive
                </div>
                <div
                  style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}
                >
                  Goal: MAX LIFETIME SPENDING POWER. Without conversions →
                  ~$5.8M by 73 → forced RMDs ~$272K/yr → ~59% rate. These cut
                  RMDs to ~$28K/yr.
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "#ef4444" }}>
                  🚩 NJ exit before Dec 31, 2030 saves ~$50,575.
                </div>
              </div>
            </>
          )}

          {activeTab === "buckets" && (
            <>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
                3-Bucket Strategy at Retirement (March 2030)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {BUCKETS.map((b) => (
                  <div
                    key={b.name}
                    style={{
                      background: "#0a1628",
                      border: `1px solid ${b.color}33`,
                      borderRadius: 8,
                      padding: "12px",
                      display: "flex",
                      gap: 12,
                    }}
                  >
                    <div style={{ textAlign: "center", minWidth: 50 }}>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 900,
                          color: b.color,
                          fontFamily: "'JetBrains Mono',monospace",
                          lineHeight: 1,
                        }}
                      >
                        {b.pct}%
                      </div>
                      <div
                        style={{ fontSize: 10, color: "#475569", marginTop: 2 }}
                      >
                        {b.target}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: b.color,
                          marginBottom: 2,
                        }}
                      >
                        {b.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          lineHeight: 1.4,
                          marginBottom: 2,
                        }}
                      >
                        {b.purpose}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569" }}>
                        {b.holdings}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 10,
                  background: "#0a1628",
                  borderRadius: 8,
                  padding: "10px 12px",
                  border: "1px solid #1e3a5f",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#fbbf24",
                    marginBottom: 6,
                  }}
                >
                  Build Schedule — LOCKED
                </div>
                {[
                  {
                    date: "Jan 2028",
                    action: "Begin SCHD in Solo 401k, DRIP on",
                    color: "#4ade80",
                  },
                  {
                    date: "Jan 2029",
                    action: "Add SPYI, QQQI, Realty Income (O)",
                    color: "#0ea5e9",
                  },
                  {
                    date: "Sep 2029",
                    action: "Turn off all DRIP",
                    color: "#fbbf24",
                  },
                  {
                    date: "Mar 2030",
                    action: "Bucket 2 fully operational",
                    color: "#10b981",
                  },
                ].map((s) => (
                  <div
                    key={s.date}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        width: 3,
                        height: 16,
                        background: s.color,
                        borderRadius: 2,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: s.color,
                        minWidth: 60,
                      }}
                    >
                      {s.date}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {s.action}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: 4, fontSize: 11, color: "#ef4444" }}>
                  🚩 No income ETFs before January 2028.
                </div>
              </div>
            </>
          )}

          {activeTab === "smile" && (
            <>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 6 }}>
                Retirement Smile (Blanchett/Morningstar)
              </div>
              <SmileChart
                baseSpending={spending}
                retireAge={retireAge}
                inflation={inflPct / 100}
              />
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {[
                  {
                    phase: "Go-Go",
                    ages: `${retireAge}–69`,
                    mult: "110–115%",
                    color: "#34d399",
                    icon: "✈️",
                    note: "Thailand. Philippines. Experiences.",
                  },
                  {
                    phase: "Slow-Go",
                    ages: "70–79",
                    mult: "80–95%",
                    color: "#fbbf24",
                    icon: "🏡",
                    note: "Portfolio gets breathing room for compounding.",
                  },
                  {
                    phase: "Healthcare",
                    ages: "80+",
                    mult: "90%",
                    color: "#f87171",
                    icon: "🏥",
                    note: "LTC & care. Funded by Roth (tax-free).",
                  },
                ].map((p) => (
                  <div
                    key={p.phase}
                    style={{
                      background: "#0a1628",
                      borderRadius: 6,
                      padding: "8px 10px",
                      border: `1px solid ${p.color}22`,
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{p.icon}</span>
                    <div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: p.color,
                        }}
                      >
                        {p.phase}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "#475569",
                          marginLeft: 4,
                        }}
                      >
                        {p.ages} · {p.mult}
                      </span>
                      <div
                        style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}
                      >
                        {p.note}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "#a78bfa",
                  fontStyle: "italic",
                }}
              >
                Smile adds <strong>+{smileDelta}pp</strong> survival.
              </div>
            </>
          )}

          {activeTab === "scenarios" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scenarioResults.map((s) => {
                const pct = (s.result.successRate * 100).toFixed(1);
                const col =
                  s.result.successRate >= 0.85
                    ? "#10b981"
                    : s.result.successRate >= 0.7
                    ? "#fbbf24"
                    : "#ef4444";
                const delta = (s.result.successRate - base.successRate) * 100;
                const ana = getAnalogue(s.result.successRate);
                return (
                  <div
                    key={s.key}
                    style={{
                      background: "#0a1628",
                      border: `1px solid ${col}33`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#f1f5f9",
                        }}
                      >
                        {s.icon} {s.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569" }}>
                        {s.desc}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          fontStyle: "italic",
                          marginTop: 2,
                        }}
                      >
                        {ana.emoji} {ana.text.slice(0, 45)}…
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        flexShrink: 0,
                        marginLeft: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 900,
                          color: col,
                          fontFamily: "'JetBrains Mono',monospace",
                          lineHeight: 1,
                        }}
                      >
                        {pct}%
                      </div>
                      {s.key !== "base" && (
                        <div
                          style={{
                            fontSize: 11,
                            color: delta >= 0 ? "#10b981" : "#f87171",
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          {delta >= 0 ? "+" : ""}
                          {delta.toFixed(1)}pp
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── CATCH FLAGS ── */}
        {mode === "personal" && (
          <div
            style={{
              marginTop: 10,
              background: "#0a1628",
              border: "1px solid #1e3a5f",
              borderRadius: 8,
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {[
              {
                flag: "NJ Domicile",
                note: "FL before Dec 31, 2030",
                color: "#ef4444",
              },
              {
                flag: "SS Gap 3yr",
                note: "No SS Jan 2031 → Mar 2034",
                color: "#fbbf24",
              },
              {
                flag: "Airbnb=$20K NET",
                note: "Never $54K gross",
                color: "#10b981",
              },
              {
                flag: "Thailand=Solo",
                note: "Mira stays NJ",
                color: "#a78bfa",
              },
              {
                flag: "AAPL ~15%",
                note: "Solo 401k concentration",
                color: "#f97316",
              },
              { flag: "MFJ", note: "All projections", color: "#0ea5e9" },
            ].map((f) => (
              <div
                key={f.flag}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    background: f.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 600, color: f.color }}>
                  {f.flag}
                </span>
                <span style={{ fontSize: 10, color: "#475569" }}>{f.note}</span>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            textAlign: "center",
            fontSize: 10,
            color: "#1e3a5f",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          AiRA Freedom Financial · {base.N.toLocaleString()} paths · {inflPct}%
          infl · Not financial advice
          <br />
          "The best financial plan is the one you can stick with." — Morgan
          Housel
        </div>
      </div>
    </div>
  );
}
