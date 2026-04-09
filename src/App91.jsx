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

if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}

/* ════ REFERENCE DATA ════ */
const SP500 = [
  37.88, -11.91, -28.48, -47.07, -15.15, 46.59, -5.94, 41.37, 27.92, -38.59,
  25.21, -5.45, -15.29, -17.86, 12.43, 19.45, 13.8, 30.72, -11.87, 0, -0.65,
  10.26, 21.78, 16.46, 11.78, -6.62, 45.02, 26.4, 2.62, -14.31, 38.06, 8.48,
  -2.97, 23.13, -11.81, 18.89, 12.97, 9.06, -13.09, 20.09, 7.66, -11.36, 0.1,
  10.79, 15.63, -17.37, -29.72, 31.55, 19.15, -11.5, 1.06, 12.31, 25.77, -9.73,
  14.76, 17.27, 1.4, 26.33, 14.62, 2.03, 12.4, 27.25, -6.56, 26.31, 4.46, 7.06,
  -1.54, 34.11, 20.26, 31.01, 26.67, 19.53, -10.14, -13.04, -23.37, 26.38, 8.99,
  3, 13.62, 3.53, -38.49, 23.45, 12.78, 0, 13.41, 29.6, 11.39, -0.73, 9.54,
  19.42, -6.24, 28.88, 16.26, 26.89, -19.44, 24.23, 23.31, 16.39, 1.53,
].map((r) => Math.max(-30, Math.min(30, r)) / 100);

const BONDS = [
  15.6, 3.0, 1.4, 1.9, 2.7, 6.2, 32.6, 8.4, 8.4, 22.1, 15.1, 15.3, 2.7, 14.5,
  8.9, 16.0, 7.4, 9.8, -2.9, 18.5, 3.6, 9.7, 8.7, -0.8, 11.6, 8.4, 10.3, 4.1,
  4.3, 2.4, 4.3, 7.0, 5.2, 5.9, 6.5, 7.8, 4.2, -2.0, 6.0, 0.5, 2.6, 3.5, 0.0,
  8.7, -1.5, 7.5, -13.0, 5.5, 1.7, 7.1,
].map((r) => Math.max(-15, Math.min(20, r)) / 100);

const INFL = [
  3.4, 2.8, 1.6, 2.3, 2.7, 3.4, 3.2, 2.8, 3.8, -0.4, 1.6, 3.2, 2.1, 1.5, 1.6,
  0.1, 1.3, 2.1, 2.4, 1.8, 1.2, 4.7, 8.0, 4.1, 2.9,
].map((r) => Math.max(0.5, Math.min(7.0, r)) / 100);

const SEQ_2000_2012 = [
  -0.091, -0.119, -0.221, 0.287, 0.109, 0.048, 0.158, 0.055, -0.37, 0.265,
  0.151, 0.021, 0.16,
];

const CALIB = {
  phase1Mean: 9.68,
  phase1Std: 13.65,
  phase2Mean: 8.93,
  phase2Std: 10.35,
};

/* ════ PROFILES ════ */
const DDAY = new Date("2030-03-14T00:00:00");

const PROFILES = {
  vin: {
    label: "My Plan",
    currentAge: 56,
    retireAge: 60,
    endAge: 85,
    port: 2_434_000,
    contrib: 38_525,
    inf: 2.5,
    sp: 100_000, // total both households
    spThailand: 48_000, // Vin solo abroad
    spMiraNJ: 52_000, // Mira NJ household
    ssAge: 64,
    ssb: 31_543,
    ab: 20_000,
    useAb: true,
    smile: true,
    tax: true,
    real: true,
    gkFloor: 88_000, // both households floor
    gkFloorThailand: 48_000, // solo floor
    gkTarget: 100_000,
    gkCeiling: 115_000,
    mortBalance: 267_518,
    mortRate: 6.25,
    mortStart: "2023-05",
    mortTerm: 30,
    mortExtra: 310,
    mortPI: 1847.15,
    reHarrington: 1_340_000,
    reOrlando105: 500_000,
    reOrlando306: 500_000,
  },
  demo: {
    label: "Demo Mode",
    currentAge: 51,
    retireAge: 62,
    endAge: 88,
    port: 1_000_000,
    contrib: 24_000,
    inf: 2.5,
    sp: 72_000,
    spThailand: 72_000,
    spMiraNJ: 0,
    ssAge: 67,
    ssb: 28_000,
    ab: 0,
    useAb: false,
    smile: true,
    tax: true,
    real: true,
    gkFloor: 48_000,
    gkFloorThailand: 48_000,
    gkTarget: 72_000,
    gkCeiling: 100_000,
    mortBalance: 200_000,
    mortRate: 7.0,
    mortStart: "2022-01",
    mortTerm: 30,
    mortExtra: 0,
    mortPI: 1330,
    reHarrington: 600_000,
    reOrlando105: 0,
    reOrlando306: 0,
  },
};

const ANALOGUES = [
  {
    min: 95,
    text: "As reliable as a commercial flight landing safely",
    emoji: "✈️",
    color: "#10b981",
  },
  {
    min: 90,
    text: "Odds a 50-year-old reaches age 65 — F-You Money territory",
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

/* ════ MATH CORE ════ */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalDraw(mean, vol, rand) {
  const u = Math.max(rand(), 1e-10);
  return (
    mean + vol * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
  );
}
function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function bootstrapDraw(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

function portReturn(age, rand, preRetireEq, postRetireEq) {
  const eqW = age < 62 ? (preRetireEq || 91) / 100 : (postRetireEq || 70) / 100;
  return (
    eqW * bootstrapDraw(SP500, rand) + (1 - eqW) * bootstrapDraw(BONDS, rand)
  );
}
function smileMult(age) {
  if (age < 65) return 1.15;
  if (age < 70) return 1.05;
  if (age < 75) return 0.95;
  if (age < 80) return 0.85;
  if (age < 85) return 0.8;
  return 0.9;
}
function taxDragRate(age, ssAge, useTax) {
  if (!useTax) return 0;
  if (age < ssAge) return 0.072;
  if (age < 73) return 0.09;
  return 0.132;
}

function guytonKlingerWithdrawal(
  portfolioValue,
  initialWR,
  lastWithdrawal,
  lastReturn,
  inflationRate,
  floor,
  ceiling
) {
  if (portfolioValue <= 0) return floor;
  let w =
    lastReturn >= 0 ? lastWithdrawal * (1 + inflationRate) : lastWithdrawal;
  const currentWR = w / portfolioValue;
  if (currentWR <= initialWR * 0.8) w *= 1.1;
  else if (currentWR >= initialWR * 1.2) w *= 0.9;
  return Math.max(floor, Math.min(ceiling, w));
}

function calcYearTax(
  age,
  yr,
  withdrawalAmount,
  ssIncome,
  airbnbIncome,
  rmdIncome,
  conversionAmount,
  isTwoHousehold,
  inflationRate
) {
  const taxableSS = ssIncome * 0.85;
  const otherIncome =
    (withdrawalAmount || 0) +
    (airbnbIncome || 0) +
    (rmdIncome || 0) +
    (conversionAmount || 0);
  const totalIncome = taxableSS + otherIncome;
  const inflationFactor = Math.pow(1 + inflationRate, Math.max(0, yr - 2026));
  let stdDeduction = Math.round(32200 * inflationFactor);
  if (age >= 65) stdDeduction += Math.round(3300 * inflationFactor);
  const taxableIncome = Math.max(0, totalIncome - stdDeduction);
  const fedBrackets = idxB(FED_BRACKETS_2026, inflationFactor);
  const fedTax = progTax(taxableIncome, fedBrackets);
  let stateTax = 0;
  if (!isTwoHousehold) {
    const njBrackets = idxB(NJ_BRACKETS_2026, inflationFactor);
    stateTax = progTax(taxableIncome, njBrackets);
  }
  const magi = totalIncome;
  const irmaa = age >= 65 ? irmaaCost(magi, yr) : 0;
  const totalTax = fedTax + stateTax + irmaa;
  const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0;
  let marginalBracket = 0;
  for (const b of fedBrackets) {
    if (taxableIncome > b.lo) marginalBracket = b.rate;
    else break;
  }
  return { fedTax, stateTax, irmaa, totalTax, effectiveRate, marginalBracket };
}

function runMC(p, endAge, N = 3000, seed = 42, useGK = true) {
  const rand = mulberry32(seed);
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = endAge - p.retireAge;
  const results = [];
  const gkFloor = p.gkFloor || 48_000;
  const gkCeiling = p.gkCeiling || 115_000;

  for (let i = 0; i < N; i++) {
    let port = p.port;
    for (let y = 0; y < accYrs; y++) {
      port =
        port *
          (1 +
            portReturn(p.currentAge + y, rand, p.preRetireEq, p.postRetireEq)) +
        p.contrib;
    }
    const portAtRetire = Math.round(port);

    const gg = clip(normalDraw(0.03, 0.005, rand), 0.005, 0.08);
    const sg = clip(normalDraw(0.015, 0.005, rand), 0.002, 0.05);
    const ng = clip(normalDraw(0.025, 0.005, rand), 0.005, 0.08);

    const path = [portAtRetire];
    let survived = true,
      exhaustAge = null;
    let sp = p.sp;
    let lastReturn = 0;

    const ss0 = p.retireAge >= p.ssAge ? p.ssb : 0;
    const ab0 = p.useAb ? p.ab : 0;
    const initDraw =
      Math.max(0, p.sp - ss0 - ab0) *
      (1 + taxDragRate(p.retireAge, p.ssAge, p.tax));
    const initWR = portAtRetire > 0 ? initDraw / portAtRetire : 0.04;

    for (let y = 0; y < retYrs; y++) {
      const age = p.retireAge + y;
      const r = portReturn(age, rand, p.preRetireEq, p.postRetireEq);
      const inflY = bootstrapDraw(INFL, rand);

      if (useGK && y > 0 && port > 0) {
        sp = guytonKlingerWithdrawal(
          port,
          initWR,
          sp,
          lastReturn,
          inflY,
          gkFloor,
          gkCeiling
        );
      } else if (y > 0) {
        sp = p.smile
          ? sp * (1 + (age < 75 ? gg : age < 85 ? sg : ng))
          : sp * (1 + inflY);
      }
      lastReturn = r;

      const ss =
        age >= p.ssAge ? p.ssb * Math.pow(1 + (p.ssCola || 2.4) / 100, y) : 0;
      const abReliable = rand() < (p.abReliability || 80) / 100;
      const ab =
        p.useAb && abReliable
          ? p.ab * Math.pow(1 + (p.abGrowth || 3) / 100, Math.min(y, 20))
          : 0;
      const need = Math.max(0, sp - ss - ab);
      const td = taxDragRate(age, p.ssAge, p.tax);
      const hShock =
        age >= (p.hcShockAge || 72) && rand() < (p.hcProb || 3.5) / 100
          ? (p.hcMin || 70_000) +
            rand() * ((p.hcMax || 130_000) - (p.hcMin || 70_000))
          : 0;
      const draw = need * (1 + td) + hShock;

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

  const pL = results[0].path.length;
  const pcts = [];
  for (let t = 0; t < pL; t++) {
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
  const nS = results.filter((r) => r.survived).length;
  const rV = results.map((r) => r.portAtRetire).sort((a, b) => a - b);
  const medR = rV[Math.floor(rV.length / 2)];
  const tV = results
    .map((r) => r.path[r.path.length - 1])
    .sort((a, b) => a - b);
  const qt = (p) => tV[Math.floor(p * (tV.length - 1))];
  return {
    rate: nS / N,
    pcts,
    medR,
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
  const results = [];
  const gkFloor = p.gkFloor || 48_000;
  const gkCeiling = p.gkCeiling || 115_000;

  for (let i = 0; i < N; i++) {
    let port = p.port;
    for (let y = 0; y < accYrs; y++) {
      port =
        port *
          (1 +
            portReturn(p.currentAge + y, rand, p.preRetireEq, p.postRetireEq)) +
        p.contrib;
    }
    const portAtRetire = Math.round(port);
    const path = [portAtRetire];
    let survived = true,
      sp = p.sp;
    let lastReturn = 0;

    const ss0 = p.retireAge >= p.ssAge ? p.ssb : 0;
    const ab0 = p.useAb ? p.ab : 0;
    const initDraw =
      Math.max(0, p.sp - ss0 - ab0) *
      (1 + taxDragRate(p.retireAge, p.ssAge, p.tax));
    const initWR = portAtRetire > 0 ? initDraw / portAtRetire : 0.04;

    for (let y = 0; y < retYrs; y++) {
      const age = p.retireAge + y;
      const eqW =
        age < 62 ? (p.preRetireEq || 91) / 100 : (p.postRetireEq || 70) / 100;
      const eq =
        y < SEQ_2000_2012.length
          ? SEQ_2000_2012[y]
          : bootstrapDraw(SP500, rand);
      const r = eqW * eq + (1 - eqW) * bootstrapDraw(BONDS, rand);
      const inflY = bootstrapDraw(INFL, rand);

      if (y > 0 && port > 0) {
        sp = guytonKlingerWithdrawal(
          port,
          initWR,
          sp,
          lastReturn,
          inflY,
          gkFloor,
          gkCeiling
        );
      }
      lastReturn = r;

      const ss = age >= p.ssAge ? p.ssb * Math.pow(1.024, y) : 0;
      const ab =
        p.useAb && rand() < (p.abReliability || 80) / 100
          ? p.ab * Math.pow(1 + (p.abGrowth || 3) / 100, Math.min(y, 20))
          : 0;
      const td = taxDragRate(age, p.ssAge, p.tax);
      const hShock =
        age >= (p.hcShockAge || 72) && rand() < (p.hcProb || 3.5) / 100
          ? (p.hcMin || 70_000) +
            rand() * ((p.hcMax || 130_000) - (p.hcMin || 70_000))
          : 0;
      const draw = Math.max(0, sp - ss - ab) * (1 + td) + hShock;

      port = port * (1 + r) - draw;
      if (port <= 0 && survived) {
        survived = false;
        port = 0;
      }
      path.push(Math.max(0, Math.round(port)));
    }
    results.push({ path, survived });
  }

  const pL = results[0].path.length;
  const pcts = [];
  for (let t = 0; t < pL; t++) {
    const vals = results.map((r) => r.path[t]).sort((a, b) => a - b);
    const q = (p) => vals[Math.floor(p * (vals.length - 1))];
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

function simulateMedianGK(p, inf) {
  const accYrs = Math.max(0, p.retireAge - p.currentAge);
  const retYrs = p.endAge - p.retireAge;
  let port = p.port;

  for (let y = 0; y < accYrs; y++) {
    const ret = CALIB.phase1Mean / 100;
    port = port * (1 + ret) + p.contrib;
  }

  const portAtRetire = port;
  const gkFloor = p.gkFloor || 48_000;
  const gkCeiling = p.gkCeiling || 115_000;
  const ss0 = p.retireAge >= p.ssAge ? p.ssb : 0;
  const ab0 = p.useAb ? p.ab : 0;
  const initDraw = Math.max(0, p.sp - ss0 - ab0);
  const initWR = portAtRetire > 0 ? initDraw / portAtRetire : 0.04;

  let sp = p.sp;
  let lastReturn = 0;
  const schedule = [];

  for (let y = 0; y < retYrs; y++) {
    const age = p.retireAge + y;
    const yr = 2026 + (age - p.currentAge);
    const ret = age < 62 ? CALIB.phase1Mean / 100 : CALIB.phase2Mean / 100;
    const inflY = inf / 100;

    if (y > 0 && port > 0) {
      sp = guytonKlingerWithdrawal(
        port,
        initWR,
        sp,
        lastReturn,
        inflY,
        gkFloor,
        gkCeiling
      );
    }
    lastReturn = ret;

    const ss =
      age >= p.ssAge
        ? Math.round(p.ssb * Math.pow(1 + (p.ssCola || 2.4) / 100, y))
        : 0;
    const ab = p.useAb
      ? Math.round(
          p.ab * Math.pow(1 + (p.abGrowth || 3) / 100, Math.min(y, 20))
        )
      : 0;
    const need = Math.max(0, sp - ss - ab);

    const taxResult = calcYearTax(
      age,
      yr,
      need,
      ss,
      ab,
      0,
      0,
      p.twoHousehold || false,
      inflY
    );

    const totalDraw = need + taxResult.totalTax;
    port = port * (1 + ret) - totalDraw;

    schedule.push({
      age,
      yr,
      spending: Math.round(sp),
      ss,
      airbnb: ab,
      portfolioDraw: Math.round(need),
      fedTax: taxResult.fedTax,
      stateTax: taxResult.stateTax,
      irmaa: taxResult.irmaa,
      totalTax: taxResult.totalTax,
      totalWithdrawal: Math.round(totalDraw),
      portfolioEnd: Math.max(0, Math.round(port)),
    });

    if (port <= 0) break;
  }
  return { schedule, portAtRetire: Math.round(portAtRetire), initWR };
}

/* ════ ROTH CONVERSION EXPLORER ════ */
const FED_BRACKETS_2026 = [
  { lo: 0, hi: 24800, rate: 0.1 },
  { lo: 24800, hi: 100800, rate: 0.12 },
  { lo: 100800, hi: 211400, rate: 0.22 },
  { lo: 211400, hi: 403550, rate: 0.24 },
  { lo: 403550, hi: 512450, rate: 0.32 },
];
const NJ_BRACKETS_2026 = [
  { lo: 0, hi: 20000, rate: 0.014 },
  { lo: 20000, hi: 35000, rate: 0.0175 },
  { lo: 35000, hi: 40000, rate: 0.035 },
  { lo: 40000, hi: 75000, rate: 0.05525 },
  { lo: 75000, hi: 500000, rate: 0.0637 },
  { lo: 500000, hi: 1000000, rate: 0.0897 },
  { lo: 1000000, hi: Infinity, rate: 0.1075 },
];
const IRMAA_2026 = [
  { m: 218000, f: 0 },
  { m: 274000, f: 2160 },
  { m: 342000, f: 5470 },
  { m: 410000, f: 8300 },
  { m: 750000, f: 11130 },
];
const RMD_DIV = {
  73: 30.4,
  74: 29.5,
  75: 28.5,
  76: 27.6,
  77: 26.6,
  78: 25.7,
  79: 24.7,
  80: 23.8,
  81: 22.9,
  82: 22.0,
  83: 21.1,
  84: 20.2,
  85: 19.4,
  86: 18.5,
  87: 17.7,
  88: 16.9,
  89: 16.1,
  90: 15.3,
};

function progTax(ti, br) {
  let t = 0;
  for (const b of br) {
    if (ti <= b.lo) break;
    t += Math.max(0, Math.min(ti, b.hi) - b.lo) * b.rate;
  }
  return t;
}
function idxB(br, f) {
  return br.map((b) => ({
    lo: Math.round(b.lo * f),
    hi: b.hi === Infinity ? Infinity : Math.round(b.hi * f),
    rate: b.rate,
  }));
}
function irmaaCost(magi, yr) {
  const f = Math.pow(1.025, yr - 2026);
  for (let i = IRMAA_2026.length - 1; i >= 0; i--) {
    if (magi >= IRMAA_2026[i].m * f) return Math.round(IRMAA_2026[i].f * f);
  }
  return 0;
}

const ROTH_BASE_YEAR = new Date().getFullYear();

function buildRothExplorer(params = {}) {
  const {
    currentAge = 56,
    retireAge = 60,
    ssAge = 64,
    ssb = 31543,
    ab = 20000,
    useAb = true,
    inf = 2.5,
    port = 2434000,
    twoHousehold = true,
    rothMode = "fill_22",
  } = params;
  const infR = inf / 100,
    retireYear = ROTH_BASE_YEAR + (retireAge - currentAge),
    isFL = twoHousehold;
  const pretaxBal = port * 0.6,
    rothBal = port * 0.4,
    gr = 0.07;

  function irmaaCeiling(yr) {
    const f = Math.pow(1.025, yr - 2026);
    return Math.round(218000 * f);
  }

  const gkF = params.gkFloor || 48000;
  const gkC = params.gkCeiling || 115000;
  const baseSp = params.sp || 100000;

  function runScenario(doConvert) {
    let pT = pretaxBal,
      ro = rothBal,
      cTax = 0,
      cConv = 0,
      cIrmaa = 0,
      cRmd = 0;
    const rows = [];
    let sp = baseSp,
      lastReturn = gr;
    const totalPort0 = pretaxBal + rothBal;
    const ss0 = retireAge >= ssAge ? ssb : 0;
    const ab0 = useAb ? ab : 0;
    const initDraw0 = Math.max(0, baseSp - ss0 - ab0);
    const initWR = totalPort0 > 0 ? initDraw0 / totalPort0 : 0.04;

    for (let age = retireAge; age <= 90; age++) {
      const yr = retireYear + (age - retireAge),
        f = Math.pow(1 + infR, yr - ROTH_BASE_YEAR);
      const fB = idxB(FED_BRACKETS_2026, f),
        nB = idxB(NJ_BRACKETS_2026, f);
      const stdD = Math.round(32200 * f) + (age >= 65 ? 3300 : 0);
      const b12t =
        fB.find((b) => b.rate === 0.12)?.hi || Math.round(100800 * f);
      const b22t =
        fB.find((b) => b.rate === 0.22)?.hi || Math.round(211400 * f);
      const b24t =
        fB.find((b) => b.rate === 0.24)?.hi || Math.round(403550 * f);

      const totalPort = pT + ro;
      if (age > retireAge && totalPort > 0) {
        sp = guytonKlingerWithdrawal(
          totalPort,
          initWR,
          sp,
          lastReturn,
          infR,
          gkF,
          gkC
        );
      }

      const ss =
        age >= ssAge ? Math.round(ssb * Math.pow(1.024, age - ssAge)) : 0;
      const ssT = Math.round(ss * 0.85);
      const abn =
        useAb && age <= 80
          ? Math.round(ab * Math.pow(1.03, Math.min(age - retireAge, 20)))
          : 0;
      const baseInc = ssT + abn;
      const portDraw = Math.max(0, sp - ss - abn);

      let rmd = 0;
      if (age >= 73 && pT > 0) {
        const d = RMD_DIV[age] || 15.0;
        rmd = Math.round(pT / d);
      }
      const incBC = baseInc + rmd;
      const txBC = Math.max(0, incBC - stdD);

      let conv = 0;
      if (
        doConvert &&
        rothMode !== "no_convert" &&
        age >= retireAge &&
        age < 73 &&
        pT > 0
      ) {
        let targetTop;
        if (rothMode === "fill_12") targetTop = b12t;
        else if (rothMode === "fill_22") targetTop = b22t;
        else if (rothMode === "fill_24") targetTop = b24t;
        else if (rothMode === "irmaa_safe")
          targetTop = Math.min(b22t, irmaaCeiling(yr) + stdD);
        else targetTop = b22t;

        if (age >= 63 && age <= 65 && rothMode !== "fill_12")
          targetTop = Math.min(targetTop, b22t);
        if (yr <= 2029) targetTop = Math.min(targetTop, b12t);
        const room = Math.max(0, targetTop - txBC);
        conv = Math.round(Math.min(room, Math.max(0, pT)));
      }

      const totInc = incBC + conv,
        txInc = Math.max(0, totInc - stdD);
      const fedT = Math.round(progTax(txInc, fB));
      const stT = isFL ? 0 : Math.round(progTax(Math.max(0, txInc), nB));
      const totT = fedT + stT,
        effR = totInc > 0 ? totT / totInc : 0;
      const magi = totInc + (ss - ssT);
      const irmaa = age >= 65 ? irmaaCost(magi, yr) : 0;

      pT =
        Math.max(0, pT - rmd - conv - Math.max(0, portDraw * 0.6)) * (1 + gr);
      ro = Math.max(0, ro + conv - Math.max(0, portDraw * 0.4)) * (1 + gr);
      lastReturn = gr;
      cTax += totT;
      cConv += conv;
      cIrmaa += irmaa;
      cRmd += rmd;

      let label = "";
      if (conv > 0) {
        if (age === ssAge - 1) label = "Golden Year ★";
        else if (age === ssAge) label = "SS Starts";
        else label = `Year ${age - retireAge}`;
      }

      rows.push({
        yr,
        age,
        ss,
        abn,
        rmd,
        conv,
        baseInc: incBC,
        totInc,
        txInc,
        fedT,
        stT,
        totT,
        effR,
        irmaa,
        magi,
        pT: Math.round(pT),
        ro: Math.round(ro),
        nw: Math.round(pT + ro),
        label,
        bracketUsed:
          conv > 0
            ? txInc <= b12t
              ? "12%"
              : txInc <= b22t
              ? "22%"
              : txInc <= b24t
              ? "24%"
              : "32%"
            : "-",
        sp: Math.round(sp),
        portDraw: Math.round(portDraw),
      });
    }
    return {
      rows,
      cTax,
      cConv,
      cIrmaa,
      cRmd,
      fPT: Math.round(pT),
      fRo: Math.round(ro),
    };
  }

  const opt = runScenario(true),
    cur = runScenario(false);
  const convRows = opt.rows.filter((r) => r.conv > 0);
  const taxD = opt.cTax - cur.cTax;
  const estD =
    (cur.rows[cur.rows.length - 1]?.nw || 0) -
    (opt.rows[opt.rows.length - 1]?.nw || 0);
  const totIncOpt = opt.rows.reduce((s, r) => s + r.totInc, 0);
  const totIncCur = cur.rows.reduce((s, r) => s + r.totInc, 0);
  const leOpt = totIncOpt > 0 ? opt.cTax / totIncOpt : 0;
  const leCur = totIncCur > 0 ? cur.cTax / totIncCur : 0;
  const rmdRed = cur.cRmd > 0 ? Math.round((1 - opt.cRmd / cur.cRmd) * 100) : 0;

  return {
    opt,
    cur,
    convRows,
    taxD,
    estD,
    leOpt,
    leCur,
    rmdRed,
    isFL,
    retireYear,
    retireAge,
    ssAge,
  };
}

function buildRothLadder(params = {}) {
  const ex = buildRothExplorer(params);
  return ex.convRows.map((r) => ({
    yr: r.yr,
    age: r.age,
    label: r.label,
    otherInc: r.abn,
    conv: r.conv,
    fedTax: r.fedT,
    stateNJ: r.stT,
    effFL: r.conv > 0 ? ((r.fedT / r.conv) * 100).toFixed(1) : "0.0",
    effNJ: r.conv > 0 ? (((r.fedT + r.stT) / r.conv) * 100).toFixed(1) : "0.0",
    netRoth: Math.round(r.conv - r.fedT - (params.twoHousehold ? 0 : r.stT)),
  }));
}

/* ════ MORTGAGE MATH ════ */
function mortgageSchedule(
  balance,
  annualRate,
  startDate,
  termYrs,
  extraMonthly
) {
  const mRate = annualRate / 100 / 12;
  const totalMonths = termYrs * 12;
  const start = new Date(startDate + "-01"),
    now = new Date();
  const elapsed = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      now.getMonth() -
      start.getMonth()
  );
  const remaining = Math.max(1, totalMonths - elapsed);
  const pmt =
    mRate === 0
      ? balance / remaining
      : (balance * mRate * Math.pow(1 + mRate, remaining)) /
        (Math.pow(1 + mRate, remaining) - 1);
  let bal = balance,
    yr = now.getFullYear(),
    years = [],
    totalInt = 0,
    totalIntNoExtra = 0;
  while (bal > 0.01 && years.length < 35) {
    let pPaid = 0,
      iPaid = 0,
      ePaid = 0,
      balNE = bal;
    for (let m = 0; m < 12 && bal > 0.01; m++) {
      const intM = bal * mRate,
        prin = Math.min(pmt - intM, bal),
        extra = Math.min(extraMonthly, bal - prin);
      pPaid += prin + extra;
      iPaid += intM;
      ePaid += extra;
      totalInt += intM;
      bal -= prin + extra;
      if (bal <= 0) {
        bal = 0;
        break;
      }
      const intNE = balNE * mRate,
        prinNE = Math.min(pmt - intNE, balNE);
      totalIntNoExtra += intNE;
      balNE -= prinNE;
      if (balNE <= 0) balNE = 0;
    }
    years.push({
      yr,
      pPaid: Math.round(pPaid),
      iPaid: Math.round(iPaid),
      ePaid: Math.round(ePaid),
      bal: Math.round(Math.max(0, bal)),
    });
    yr++;
  }
  return {
    years,
    pmt: Math.round(pmt),
    payoffYr: years[years.length - 1]?.yr || now.getFullYear(),
    totalInt: Math.round(totalInt),
    interestSaved: Math.round(totalIntNoExtra - totalInt),
  };
}

/* ════ FORMATTERS ════ */
const fmtM = (v) =>
  v >= 1e6
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1e3
    ? `$${Math.round(v / 1e3)}K`
    : `$${Math.round(v)}`;
const fmtK = (v) => `$${Math.round(v / 1e3)}K`;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;
function getAnalogue(rate) {
  const pct = rate * 100;
  return ANALOGUES.find((a) => pct >= a.min) || ANALOGUES[ANALOGUES.length - 1];
}
function countdownDays() {
  return Math.max(0, Math.floor((DDAY - new Date()) / 86400000));
}
function useCountdown(dday) {
  const calc = () => {
    const diff = Math.max(0, dday - new Date());
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      mins: Math.floor((diff % 3600000) / 60000),
      secs: Math.floor((diff % 60000) / 1000),
      pct: Math.min(
        100,
        ((new Date() - new Date("2026-03-02")) /
          (dday - new Date("2026-03-02"))) *
          100
      ).toFixed(1),
    };
  };
  const [cd, setCd] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setCd(calc()), 1000);
    return () => clearInterval(t);
  }, [dday]);
  return cd;
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

function SectorBadge({ age }) {
  const sectors = [
    { n: "Sector 1: The Escape", color: "#ef4444", active: age < 59.5 },
    {
      n: "Sector 2: The Gap",
      color: "#0ea5e9",
      active: age >= 59.5 && age < 63,
    },
    {
      n: "Sector 3: The Maneuver",
      color: "#fbbf24",
      active: age >= 65 && age < 72,
    },
    {
      n: "Sector 4: The Torpedo",
      color: "#f97316",
      active: age >= 72 && age < 73,
    },
    { n: "Sector 5: Legacy", color: "#a78bfa", active: false },
  ];
  const cur = sectors.find((s) => s.active) || sectors[0];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: `${cur.color}18`,
        border: `1px solid ${cur.color}44`,
        borderRadius: 12,
        padding: "2px 10px",
        fontSize: 10,
        color: cur.color,
        fontWeight: 600,
      }}
    >
      ⚡ {cur.n}
    </span>
  );
}

/* ════ CSS ════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing:border-box; }
  body { margin:0; font-family:'DM Sans',sans-serif; background:#060e1a; color:#e2e8f0; }
  .app { min-height:100vh; background:linear-gradient(160deg,#040b16 0%,#071220 50%,#04091a 100%); }
  .hdr { background:rgba(7,18,32,0.97); border-bottom:1px solid rgba(13,148,136,0.3); padding:10px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:100; backdrop-filter:blur(12px); }
  .logo { font-size:17px; font-weight:700; letter-spacing:-0.02em; }
  .logo-sub { color:#5eead4; font-weight:300; font-size:13px; }
  .mbtn { padding:5px 13px; border-radius:7px; border:1px solid rgba(255,255,255,0.1); cursor:pointer; font-size:11px; font-family:'DM Sans',sans-serif; font-weight:500; transition:all 0.2s; background:transparent; color:#64748b; }
  .mbtn.on { background:linear-gradient(135deg,#0d9488,#14b8a6); border-color:transparent; color:white; }
  .mbtn.demo-on { background:linear-gradient(135deg,#7c3aed,#4f46e5); border-color:transparent; color:white; }
  .layout { display:grid; grid-template-columns:260px 1fr; height:calc(100vh - 56px); }
  .sidebar { border-right:1px solid rgba(255,255,255,0.06); padding:14px; overflow-y:auto; background:rgba(7,14,26,0.6); display:flex; flex-direction:column; gap:10px; }
  .sb-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:12px; }
  .sb-title { font-size:11px; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:12px; }
  .sl-row { display:grid; grid-template-columns:110px 1fr 62px; align-items:center; gap:8px; margin-bottom:12px; }
  .sl-label { font-size:12px; color:#94a3b8; }
  .sl-val { font-size:12px; font-weight:600; text-align:right; color:#e2e8f0; font-family:'DM Mono',monospace; }
  input[type=range] { display:none; }
  .tog-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:9px; }
  .tog-label { font-size:12px; color:#94a3b8; }
  .tog { width:34px; height:18px; border-radius:9px; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; }
  .tok { position:absolute; top:2px; width:14px; height:14px; border-radius:50%; background:white; transition:left 0.2s; }
  .run-btn { width:100%; padding:10px; background:linear-gradient(135deg,#0d9488,#14b8a6); border:none; border-radius:9px; color:white; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; }
  .run-btn:hover { opacity:0.88; }
  .run-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .main { padding:16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; }
  .flag-w { border-left:3px solid #f59e0b; background:rgba(245,158,11,0.08); padding:7px 12px; font-size:12px; color:#fcd34d; border-radius:0 7px 7px 0; margin-bottom:4px; }
  .flag-i { border-left:3px solid #0ea5e9; background:rgba(14,165,233,0.08); color:#7dd3fc; border-radius:0 7px 7px 0; padding:7px 12px; font-size:12px; margin-bottom:4px; }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .met { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:9px; padding:12px 14px; }
  .ml { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:6px; }
  .mv { font-size:22px; font-weight:700; font-family:'DM Mono',monospace; line-height:1; }
  .ms { font-size:11px; color:#475569; margin-top:4px; }
  .analogue { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:9px; padding:11px 15px; font-size:13px; color:#94a3b8; font-style:italic; }
  .tabs { display:flex; gap:2px; background:rgba(255,255,255,0.04); border-radius:9px; padding:3px; flex-wrap:wrap; }
  .tab { flex:1; min-width:66px; padding:6px 4px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:10px; font-family:'DM Sans',sans-serif; color:#64748b; transition:all 0.15s; font-weight:500; white-space:nowrap; }
  .tab.on { background:rgba(255,255,255,0.08); color:#e2e8f0; border:1px solid rgba(255,255,255,0.1); }
  .chart-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:14px 16px; }
  .ct { font-size:12px; color:#64748b; margin-bottom:12px; }
  .leg { display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; }
  .li { display:flex; align-items:center; gap:5px; font-size:11px; color:#64748b; }
  .ll { width:18px; height:2px; border-radius:1px; }
  .ppl-grid { display:flex; flex-wrap:wrap; gap:4px; margin:8px 0; }
  .ppl-dot { width:18px; height:18px; border-radius:50%; }
  .roth-tbl { width:100%; border-collapse:collapse; font-size:12px; }
  .roth-tbl th { font-size:11px; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:0.07em; padding:6px 8px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.08); }
  .roth-tbl th:first-child { text-align:left; }
  .roth-tbl td { padding:9px 8px; border-bottom:1px solid rgba(255,255,255,0.05); text-align:right; font-family:'DM Mono',monospace; font-size:12px; }
  .roth-tbl td:first-child { text-align:left; font-family:'DM Sans',sans-serif; }
  .gold { background:rgba(251,191,36,0.06); }
  .gk-bar { background:rgba(13,148,136,0.08); border:1px solid rgba(13,148,136,0.2); border-radius:8px; padding:11px 15px; font-size:12px; }
  .countdown-grid { display:flex; gap:5px; }
  .cd-unit { text-align:center; background:rgba(255,255,255,0.04); border-radius:5px; padding:5px 7px; min-width:36px; }
  .cd-val { font-size:16px; font-weight:700; color:#f0fdfa; font-family:'DM Mono',monospace; line-height:1; }
  .cd-lbl { font-size:10px; color:#475569; letter-spacing:0.1em; }
  .progress-bar { height:5px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin-top:6px; }
  .progress-fill { height:100%; background:linear-gradient(90deg,#0d9488,#14b8a6); border-radius:3px; transition:width 1s; }
  .nw-table { width:100%; border-collapse:collapse; font-size:12px; }
  .nw-table th { font-size:11px; color:#475569; text-transform:uppercase; letter-spacing:0.07em; padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:right; }
  .nw-table th:first-child { text-align:left; }
  .nw-table td { padding:7px 8px; border-bottom:1px solid rgba(255,255,255,0.04); text-align:right; font-family:'DM Mono',monospace; }
  .nw-table td:first-child { text-align:left; font-family:'DM Sans',sans-serif; }
  .ap-col { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:9px; padding:13px; }
  .ap-hdr { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:11px; }
  .ap-item { font-size:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); color:#94a3b8; }
  .ms-dot { width:11px; height:11px; border-radius:50%; flex-shrink:0; margin-top:2px; }
  .ms-line { width:2px; background:rgba(255,255,255,0.08); margin:0 4px; }
  .tip-box { background:rgba(7,18,32,0.97); border:1px solid rgba(255,255,255,0.1); border-radius:7px; padding:8px 11px; font-size:12px; }
  ::-webkit-scrollbar { width:3px; height:3px; }
  ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
`;

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip-box">
      <div style={{ color: "#64748b", marginBottom: 3 }}>Age {label}</div>
      {payload
        .filter((p) => p.value > 0)
        .map((p, i) => (
          <div key={i} style={{ color: p.color, marginBottom: 1 }}>
            <span style={{ color: "#94a3b8" }}>{p.name}: </span>
            {fmtM(p.value)}
          </div>
        ))}
    </div>
  );
};

function Toggle({ val, onChange, label, accent = "#0d9488" }) {
  return (
    <div className="tog-row">
      <span className="tog-label">{label}</span>
      <div
        className="tog"
        onClick={() => onChange(!val)}
        style={{ background: val ? accent : "rgba(255,255,255,0.1)" }}
      >
        <div className="tok" style={{ left: val ? 18 : 2 }} />
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  const trackRef = useRef(null);
  const handleClick = useCallback(
    (e) => {
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const stepped = Math.round((min + ratio * (max - min)) / step) * step;
      onChange(Math.max(min, Math.min(max, stepped)));
    },
    [min, max, step, onChange]
  );
  const handleDrag = useCallback(
    (e) => {
      e.preventDefault();
      const move = (ev) => {
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const rect = trackRef.current.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (clientX - rect.left) / rect.width)
        );
        const stepped = Math.round((min + ratio * (max - min)) / step) * step;
        onChange(Math.max(min, Math.min(max, stepped)));
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", up);
    },
    [min, max, step, onChange]
  );
  return (
    <div className="sl-row">
      <span className="sl-label">{label}</span>
      <div
        ref={trackRef}
        onClick={handleClick}
        style={{
          position: "relative",
          height: 20,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 6,
            borderRadius: 3,
            background: "rgba(255,255,255,0.15)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            height: 6,
            borderRadius: 3,
            background: "linear-gradient(90deg,#0d9488,#14b8a6)",
          }}
        />
        <div
          onMouseDown={handleDrag}
          onTouchStart={handleDrag}
          style={{
            position: "absolute",
            left: `calc(${pct}% - 9px)`,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#0d9488",
            border: "2.5px solid #14b8a6",
            boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
            cursor: "grab",
            zIndex: 2,
            transition: "transform 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        />
      </div>
      <span className="sl-val">{format(value)}</span>
    </div>
  );
}

/* ════ DUAL INPUT — text box + slider auto-sync ════ */
function DualInput({ label, value, min, max, step, format, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Math.max(min, Math.min(max, Number(e.target.value)));
            if (!isNaN(v)) onChange(v);
          }}
          style={{
            width: 100,
            background: "#0d1b2a",
            border: "1px solid #1e3a5f",
            color: "#5eead4",
            borderRadius: 5,
            padding: "3px 8px",
            fontSize: 12,
            fontFamily: "'DM Mono',monospace",
            textAlign: "right",
          }}
        />
      </div>
      <Slider
        label=""
        value={value}
        min={min}
        max={max}
        step={step}
        format={format}
        onChange={onChange}
      />
    </div>
  );
}

/* ════ IMPORT / EXPORT ════ */
function exportProfile(values, name = "AiRA_Profile") {
  const blob = new Blob([JSON.stringify(values, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProfile(onLoad) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        onLoad(data);
      } catch {
        alert("Invalid profile file — must be a valid AiRA JSON export.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function FanChart({ pcts, retireAge, ssAge, inf, useReal, title }) {
  const data = useMemo(() => deflate(pcts, inf, useReal), [pcts, inf, useReal]);
  return (
    <div className="chart-card">
      <div className="ct">
        {title} · {useReal ? "Real $" : "Nominal $"}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="g90v5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5eead4" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#5eead4" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="g75v5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 11 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 11 }}
            tickFormatter={(v) => fmtM(v)}
            width={58}
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
            strokeWidth={1}
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
            fill="url(#g90v5)"
            dot={false}
            name="90th"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="p75"
            stroke="#0d9488"
            strokeWidth={1}
            strokeDasharray="3 2"
            fill="url(#g75v5)"
            dot={false}
            name="75th"
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#14b8a6"
            strokeWidth={2.5}
            dot={false}
            name="Median"
          />
          <Line
            type="monotone"
            dataKey="p25"
            stroke="#fbbf24"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="5 3"
            name="25th"
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke="#f87171"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="3 3"
            name="10th"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="leg">
        {[
          { c: "#5eead4", l: "90th" },
          { c: "#0d9488", l: "75th" },
          { c: "#14b8a6", l: "Median" },
          { c: "#fbbf24", l: "25th" },
          { c: "#f87171", l: "10th" },
        ].map((i) => (
          <div key={i.l} className="li">
            <div className="ll" style={{ background: i.c }} />
            {i.l}
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleViz({ rate }) {
  const success = Math.round(rate * 26);
  return (
    <div className="chart-card">
      <div className="ct">26 people with your exact plan — age 90 horizon</div>
      <div className="ppl-grid">
        {Array.from({ length: 26 }, (_, i) => (
          <div
            key={i}
            className="ppl-dot"
            style={{
              background: i < success ? "#0d9488" : "#ef4444",
              opacity: i < success ? 1 : 0.4,
            }}
            title={i < success ? "Survives to 90" : "Exhausted before 90"}
          />
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
        <span style={{ color: "#0d9488", fontWeight: 600 }}>{success}</span>{" "}
        make it to 90.{" "}
        {26 - success > 0 && (
          <>
            {" "}
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              {26 - success}
            </span>{" "}
            run out.
          </>
        )}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          color: "#475569",
          fontStyle: "italic",
        }}
      >
        100% doesn't exist. As Morgan Housel says — room for error IS the plan.
      </div>
    </div>
  );
}

function IncomeMap({ p, inf }) {
  const data = useMemo(() => {
    const yrs = Math.min(26, p.endAge - p.retireAge);
    return Array.from({ length: yrs }, (_, i) => {
      const age = p.retireAge + i;
      const ss = age >= p.ssAge ? Math.round(p.ssb * Math.pow(1.024, i)) : 0;
      const ab = p.useAb
        ? Math.round(p.ab * Math.pow(1.03, Math.min(i, 20)))
        : 0;
      let sp = p.sp;
      for (let j = 1; j <= i; j++)
        sp *= p.smile ? 1 + smileMult(p.retireAge + j) * 0.03 : 1 + inf / 100;
      return {
        age,
        "Portfolio Draw": Math.max(0, Math.round(sp) - ss - ab),
        "Social Security": ss,
        "Airbnb Net": ab,
      };
    });
  }, [p, inf]);
  return (
    <div className="chart-card">
      <div className="ct">
        Annual income coverage · {p.smile ? "Smile" : "Flat"} spending · Airbnb
        80% reliability modeled
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 9 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 9 }}
            tickFormatter={(v) => fmtM(v)}
            width={50}
          />
          <Tooltip content={<Tip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, color: "#64748b", paddingTop: 6 }}
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
      <div className="flag-w" style={{ marginTop: 8, fontSize: 10 }}>
        ⚠ SS gap ages {p.retireAge}–{p.ssAge - 1} — portfolio carries 100% of
        spending. Highest-risk window.
      </div>
    </div>
  );
}

function SmileChart({ p, inf }) {
  const data = useMemo(
    () =>
      Array.from({ length: 31 }, (_, i) => {
        const age = p.retireAge + i;
        const infR = inf / 100;
        let smile = p.sp,
          flat = p.sp;
        for (let j = 1; j <= i; j++) {
          const a = p.retireAge + j;
          smile *= 1 + smileMult(a) * 0.028;
          flat *= 1 + infR;
        }
        return {
          age,
          Flat: Math.round(flat),
          "Smile (Blanchett)": Math.round(smile),
        };
      }),
    [p, inf]
  );
  return (
    <div className="chart-card">
      <div className="ct">
        Retirement Smile · Go-go 115% → Slow-go 85% → Healthcare tail 90% ·
        Blanchett/Morningstar
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis
            dataKey="age"
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 9 }}
          />
          <YAxis
            stroke="#1e3a5f"
            tick={{ fill: "#475569", fontSize: 9 }}
            tickFormatter={(v) => fmtK(v)}
            width={46}
          />
          <Tooltip content={<Tip />} />
          <ReferenceLine
            x={65}
            stroke="rgba(251,191,36,0.35)"
            strokeDasharray="3 3"
          />
          <ReferenceLine
            x={75}
            stroke="rgba(249,115,22,0.35)"
            strokeDasharray="3 3"
          />
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
            dataKey="Smile (Blanchett)"
            stroke="#a78bfa"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RothLadder({ params }) {
  const [showInputs, setShowInputs] = useState(false);
  const [view, setView] = useState("optimized");
  const [rothMode, setRothMode] = useState("fill_22");
  const ex = useMemo(
    () => buildRothExplorer({ ...(params ?? {}), rothMode }),
    [
      params?.currentAge,
      params?.retireAge,
      params?.ssAge,
      params?.ab,
      params?.inf,
      params?.port,
      params?.twoHousehold,
      params?.useAb,
      params?.ssb,
      rothMode,
    ]
  );
  const {
    opt,
    cur,
    convRows,
    taxD,
    estD,
    leOpt,
    leCur,
    rmdRed,
    isFL,
    retireYear,
  } = ex;
  const domLabel = isFL
    ? "FL / Thailand (0% state)"
    : "NJ (graduated 1.4–10.75%)";
  const domColor = isFL ? "#34d399" : "#fb923c";
  const modeLabels = {
    fill_12: "Fill 12%",
    fill_22: "Fill 22%",
    fill_24: "Fill 24%",
    irmaa_safe: "IRMAA-Safe",
  };
  const modeDescs = {
    fill_12:
      "Conservative — stay in 12% bracket. Lowest tax, slowest conversion.",
    fill_22: "Moderate — fill to top of 22%. IRMAA-safe. AiRA default.",
    fill_24:
      "Aggressive — fill to 24%. ⚠️ IRMAA risk at 65 (2-yr lookback). Faster conversion.",
    irmaa_safe:
      "Dynamic — fills 22% normally, auto-throttles near IRMAA threshold.",
  };
  const InputsPanel = () => (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: showInputs ? "12px" : "0",
        maxHeight: showInputs ? "600px" : "0",
        overflow: "hidden",
        transition: "all 0.3s ease",
        marginBottom: showInputs ? 10 : 0,
      }}
    >
      {showInputs && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px 20px",
            fontSize: 11,
          }}
        >
          {[
            ["Domicile", domLabel, domColor],
            ["Filing Status", "MFJ", "#94a3b8"],
            ["Bracket Target", modeLabels[rothMode], "#5eead4"],
            [
              "Std Deduction (2026)",
              "$32,200 (indexed " + params.inf + "%/yr)",
              "#94a3b8",
            ],
            [
              "Other Income",
              "Airbnb $" +
                (params.ab || 20000).toLocaleString() +
                "/yr (3% growth)",
              "#94a3b8",
            ],
            [
              "SS Start",
              "Age " +
                (params.ssAge || 64) +
                " / $" +
                (params.ssb || 31543).toLocaleString() +
                "/yr",
              "#94a3b8",
            ],
            [
              "Portfolio",
              fmtM(params.port || 2434000) + " (60% pre-tax est.)",
              "#94a3b8",
            ],
            ["Growth Assumption", "7% nominal (balance projection)", "#94a3b8"],
            ["IRMAA Guard", "Ages 63-65 auto-throttled to 22%", "#fbbf24"],
            ["FAFSA Guard", "Through 2029 · capped at 12%", "#fbbf24"],
            [
              "Conversion Window",
              "Age " + (params.retireAge || 60) + "–72 (dynamic fill)",
              "#5eead4",
            ],
            [
              "RMD Table",
              "Joint & Last Survivor (Mira 9yr younger)",
              "#94a3b8",
            ],
          ].map(([k, v, c]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ color: "#64748b" }}>{k}</span>
              <span
                style={{
                  color: c,
                  fontFamily: "'DM Mono',monospace",
                  fontWeight: 500,
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const barData = convRows.map((r) => ({
    yr: r.yr,
    age: r.age,
    conv: r.conv,
    label: r.label,
  }));
  const taxCompare = opt.rows
    .filter((_, i) => i % 2 === 0 || i < 10)
    .map((r, i) => {
      const c = cur.rows.find((cr) => cr.yr === r.yr);
      return {
        yr: r.yr,
        age: r.age,
        optRate: (r.effR * 100).toFixed(0),
        curRate: c ? (c.effR * 100).toFixed(0) : "0",
        optTax: r.totT,
        curTax: c ? c.totT : 0,
      };
    });
  const rmdYears = opt.rows
    .filter((r) => r.age >= 73 && r.age <= 90)
    .map((r) => {
      const c = cur.rows.find((cr) => cr.yr === r.yr);
      return {
        age: r.age,
        optRmd: r.rmd,
        curRmd: c ? c.rmd : 0,
        optPT: r.pT,
        curPT: c ? c.pT : 0,
      };
    });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {["optimized", "comparison", "table"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: 600,
                background: view === v ? "rgba(13,148,136,0.2)" : "transparent",
                color: view === v ? "#5eead4" : "#64748b",
              }}
            >
              {v === "optimized"
                ? "📊 Conversion Plan"
                : v === "comparison"
                ? "⚖️ Compare"
                : "📋 Year-by-Year"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowInputs(!showInputs)}
          style={{
            padding: "3px 8px",
            borderRadius: 5,
            border: "1px solid rgba(255,255,255,0.1)",
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "inherit",
            background: "transparent",
            color: "#64748b",
          }}
        >
          {showInputs ? "▲ Hide" : "▼ Show"} Assumptions
        </button>
      </div>
      <InputsPanel />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontSize: 10,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Bracket Fill Strategy
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {Object.entries(modeLabels).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setRothMode(k)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: 600,
                border:
                  rothMode === k
                    ? "1px solid #0d9488"
                    : "1px solid rgba(255,255,255,0.1)",
                background:
                  rothMode === k ? "rgba(13,148,136,0.15)" : "transparent",
                color: rothMode === k ? "#5eead4" : "#64748b",
                transition: "all 0.15s",
              }}
            >
              {v}
              {k === "fill_24" ? " ⚠️" : ""}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>
          {modeDescs[rothMode]}
        </div>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: 4, background: domColor }}
        />
        <span style={{ color: domColor, fontWeight: 600 }}>
          Domicile: {domLabel}
        </span>
        <span style={{ color: "#475569" }}>
          · {isFL ? "🌴 Two households toggle ON" : "🏠 Both in NJ"}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 8,
        }}
      >
        <div className="met">
          <div className="ml">Conversions</div>
          <div className="mv" style={{ color: "#5eead4", fontSize: 20 }}>
            {convRows.length}
          </div>
          <div className="ms">during plan window</div>
        </div>
        <div className="met">
          <div className="ml">Lifetime Tax Delta</div>
          <div
            className="mv"
            style={{ color: taxD > 0 ? "#fb923c" : "#34d399", fontSize: 16 }}
          >
            {taxD > 0 ? "+" : ""}
            {fmtM(Math.abs(taxD))}
          </div>
          <div className="ms">
            {taxD > 0 ? "more" : "less"} with conversions
          </div>
        </div>
        <div className="met">
          <div className="ml">RMD Reduction</div>
          <div className="mv" style={{ color: "#34d399", fontSize: 20 }}>
            {rmdRed}%
          </div>
          <div className="ms">lower forced distributions</div>
        </div>
        <div className="met">
          <div className="ml">Lifetime Eff. Rate</div>
          <div className="mv" style={{ color: "#5eead4", fontSize: 16 }}>
            {(leOpt * 100).toFixed(1)}% vs {(leCur * 100).toFixed(1)}%
          </div>
          <div className="ms">optimized vs current</div>
        </div>
      </div>
      {view === "optimized" && (
        <>
          <div className="chart-card">
            <div className="ct">
              Conversion Plan · Ages {convRows[0]?.age}–
              {convRows[convRows.length - 1]?.age} · {domLabel}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={barData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="yr"
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  tickFormatter={(v) => fmtK(v)}
                  width={46}
                />
                <Tooltip content={<Tip />} />
                <Bar
                  dataKey="conv"
                  name="Conversion"
                  fill="#0d9488"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <table className="roth-tbl" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Age</th>
                  <th>Label</th>
                  <th>Conversion</th>
                  <th>Fed Tax</th>
                  <th>State Tax</th>
                  <th>Bracket</th>
                  <th>Eff Rate</th>
                  <th>Net→Roth</th>
                </tr>
              </thead>
              <tbody>
                {convRows.map((r) => (
                  <tr
                    key={r.yr}
                    className={r.label === "Golden Year ★" ? "gold" : ""}
                  >
                    <td>{r.yr}</td>
                    <td style={{ color: "#94a3b8" }}>{r.age}</td>
                    <td
                      style={{
                        color: r.label.includes("Golden")
                          ? "#fbbf24"
                          : "#94a3b8",
                        fontWeight: r.label.includes("Golden") ? 700 : 400,
                      }}
                    >
                      {r.label}
                    </td>
                    <td style={{ color: "#e2e8f0" }}>{fmtM(r.conv)}</td>
                    <td style={{ color: "#f87171" }}>{fmtM(r.fedT)}</td>
                    <td style={{ color: isFL ? "#34d399" : "#fb923c" }}>
                      {isFL ? "$0" : fmtM(r.stT)}
                    </td>
                    <td
                      style={{
                        color:
                          r.bracketUsed === "24%"
                            ? "#fbbf24"
                            : r.bracketUsed === "22%"
                            ? "#5eead4"
                            : "#94a3b8",
                        fontSize: 10,
                      }}
                    >
                      {r.bracketUsed}
                    </td>
                    <td style={{ color: "#94a3b8" }}>
                      {(r.effR * 100).toFixed(1)}%
                    </td>
                    <td style={{ color: "#14b8a6", fontWeight: 600 }}>
                      {fmtM(r.conv - r.fedT - (isFL ? 0 : r.stT))}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                  <td style={{ fontWeight: 700 }} colSpan={3}>
                    Total
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmtM(opt.cConv)}</td>
                  <td style={{ color: "#f87171", fontWeight: 700 }}>
                    {fmtM(convRows.reduce((s, r) => s + r.fedT, 0))}
                  </td>
                  <td
                    style={{
                      color: isFL ? "#34d399" : "#fb923c",
                      fontWeight: 700,
                    }}
                  >
                    {isFL
                      ? "$0"
                      : fmtM(convRows.reduce((s, r) => s + r.stT, 0))}
                  </td>
                  <td>—</td>
                  <td style={{ color: "#14b8a6", fontWeight: 700 }}>
                    {fmtM(
                      convRows.reduce(
                        (s, r) => s + r.conv - r.fedT - (isFL ? 0 : r.stT),
                        0
                      )
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="chart-card">
            <div className="ct">
              Projected Account Balances · Pre-Tax vs Roth
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={opt.rows.filter((_, i) => i % 2 === 0)}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="age"
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  tickFormatter={(v) => fmtM(v)}
                  width={54}
                />
                <Tooltip content={<Tip />} />
                <Bar dataKey="pT" name="Pre-Tax" stackId="a" fill="#1e3a5f" />
                <Bar
                  dataKey="ro"
                  name="Roth"
                  stackId="a"
                  fill="#0d9488"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            <div className="met">
              <div className="ml">Savings at Age 90 — Without</div>
              <div className="mv" style={{ color: "#94a3b8", fontSize: 16 }}>
                {fmtM(cur.rows[cur.rows.length - 1]?.nw || 0)}
              </div>
            </div>
            <div className="met">
              <div className="ml">Savings at Age 90 — With Conversions</div>
              <div className="mv" style={{ color: "#5eead4", fontSize: 16 }}>
                {fmtM(opt.rows[opt.rows.length - 1]?.nw || 0)}
              </div>
            </div>
          </div>
          {rmdYears.length > 0 && (
            <div className="chart-card">
              <div className="ct">
                Required Minimum Distributions · Joint & Last Survivor Table
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div className="met">
                  <div className="ml">Lifetime RMDs — Without</div>
                  <div
                    className="mv"
                    style={{ color: "#f87171", fontSize: 16 }}
                  >
                    {fmtM(cur.cRmd)}
                  </div>
                </div>
                <div className="met">
                  <div className="ml">Lifetime RMDs — With Conversions</div>
                  <div
                    className="mv"
                    style={{ color: "#34d399", fontSize: 16 }}
                  >
                    {fmtM(opt.cRmd)}
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={rmdYears.filter((_, i) => i % 2 === 0)}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="age"
                    stroke="#1e3a5f"
                    tick={{ fill: "#475569", fontSize: 9 }}
                  />
                  <YAxis
                    stroke="#1e3a5f"
                    tick={{ fill: "#475569", fontSize: 9 }}
                    tickFormatter={(v) => fmtK(v)}
                    width={46}
                  />
                  <Tooltip content={<Tip />} />
                  <Bar
                    dataKey="curRmd"
                    name="RMD — No Convert"
                    fill="rgba(239,68,68,0.4)"
                  />
                  <Bar
                    dataKey="optRmd"
                    name="RMD — With Convert"
                    fill="rgba(16,185,129,0.5)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {(() => {
            const g = convRows.find((r) => r.label === "Golden Year ★");
            return g ? (
              <div
                style={{
                  fontSize: 11,
                  color: "#7c3aed",
                  background: "rgba(124,58,237,0.08)",
                  borderRadius: 7,
                  padding: "7px 11px",
                  border: "1px solid rgba(124,58,237,0.2)",
                }}
              >
                ★ Golden year {g.yr} (age {g.age}): last before SS. Bracket room
                up to 24% ceiling. After SS, space compresses. Delay aggressive
                conversions until Danielle graduates Spring 2034.
              </div>
            ) : null;
          })()}
        </>
      )}
      {view === "comparison" && (
        <>
          <div className="chart-card">
            <div className="ct">Effective Federal Tax Rate · Year-by-Year</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={opt.rows.filter((_, i) => i % 2 === 0)}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="age"
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  tickFormatter={(v) => (v * 100).toFixed(0) + "%"}
                  width={36}
                />
                <Tooltip content={<Tip />} />
                <Line
                  type="monotone"
                  dataKey="effR"
                  name="Optimized Rate"
                  stroke="#0d9488"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <div className="ct">
              Tax Liability Comparison · Optimized vs Current Plan
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div className="met">
                <div className="ml">Lifetime Taxes — Without</div>
                <div className="mv" style={{ color: "#94a3b8", fontSize: 16 }}>
                  {fmtM(cur.cTax)}
                </div>
              </div>
              <div className="met">
                <div className="ml">Lifetime Taxes — With Conversions</div>
                <div
                  className="mv"
                  style={{
                    color: taxD > 0 ? "#fb923c" : "#34d399",
                    fontSize: 16,
                  }}
                >
                  {fmtM(opt.cTax)}
                </div>
              </div>
            </div>
          </div>
          <div className="chart-card">
            <div className="ct">IRMAA Fees · Medicare Premium Surcharges</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <div className="met">
                <div className="ml">Lifetime IRMAA — Without</div>
                <div className="mv" style={{ fontSize: 16 }}>
                  {cur.cIrmaa > 0 ? fmtM(cur.cIrmaa) : "$0"}
                </div>
              </div>
              <div className="met">
                <div className="ml">Lifetime IRMAA — With Conversions</div>
                <div className="mv" style={{ fontSize: 16 }}>
                  {opt.cIrmaa > 0 ? fmtM(opt.cIrmaa) : "$0"}
                </div>
              </div>
            </div>
            {opt.cIrmaa === 0 && cur.cIrmaa === 0 && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "#475569",
                  textAlign: "center",
                }}
              >
                ✅ No IRMAA surcharges projected in either scenario
              </div>
            )}
          </div>
        </>
      )}
      {view === "table" && (
        <div className="chart-card" style={{ overflowX: "auto" }}>
          <div className="ct">Year-by-Year Comparison Table</div>
          <table className="roth-tbl">
            <thead>
              <tr>
                <th>Year</th>
                <th>Age</th>
                <th>Opt Rate</th>
                <th>Cur Rate</th>
                <th>Opt Tax</th>
                <th>Cur Tax</th>
                <th>Opt RMD</th>
                <th>Cur RMD</th>
              </tr>
            </thead>
            <tbody>
              {opt.rows
                .filter((r) => r.age >= 60 && r.age <= 90)
                .filter((_, i) => i % 2 === 0 || i < 12)
                .map((r) => {
                  const c = cur.rows.find((cr) => cr.yr === r.yr);
                  return (
                    <tr key={r.yr} className={r.conv > 0 ? "gold" : ""}>
                      <td>{r.yr}</td>
                      <td style={{ color: "#94a3b8" }}>{r.age}</td>
                      <td>{(r.effR * 100).toFixed(0)}%</td>
                      <td>{c ? (c.effR * 100).toFixed(0) : "0"}%</td>
                      <td style={{ color: "#f87171" }}>{fmtM(r.totT)}</td>
                      <td style={{ color: "#94a3b8" }}>
                        {c ? fmtM(c.totT) : "$0"}
                      </td>
                      <td style={{ color: "#34d399" }}>
                        {r.rmd > 0 ? fmtM(r.rmd) : "-"}
                      </td>
                      <td style={{ color: "#f87171" }}>
                        {c && c.rmd > 0 ? fmtM(c.rmd) : "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <div
        style={{
          fontSize: 9,
          color: "#334155",
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        This analysis is for planning purposes only. Consult a tax professional
        before executing Roth conversions. Progressive fed brackets (IRS Rev.
        Proc. 2025-32) · NJ graduated rates · Joint & Last Survivor RMD table ·
        7% growth assumption
      </div>
    </div>
  );
}

function DeterministicGKView({ p, inf }) {
  const [showTable, setShowTable] = useState(false);
  const data = useMemo(() => simulateMedianGK(p, inf), [p, inf]);
  const { schedule, portAtRetire, initWR } = data;
  const chartData = schedule.map((s) => ({
    age: s.age,
    "Total Withdrawal": s.totalWithdrawal,
    "Portfolio End": s.portfolioEnd,
    Spending: s.spending,
  }));

  // If schedule is empty (no data), show a placeholder
  if (!schedule || schedule.length === 0) {
    return (
      <div className="chart-card">
        No data available. Run Monte Carlo first.
      </div>
    );
  }

  return (
    <>
      <div className="chart-card">
        <div className="ct">
          📈 Deterministic GK Schedule · Median historical returns (
          {CALIB.phase1Mean}% pre‑62 / {CALIB.phase2Mean}% after) · Inflation{" "}
          {inf}%
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
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
              width={58}
            />
            <Tooltip content={<Tip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, color: "#64748b", paddingTop: 6 }}
            />
            <Line
              type="monotone"
              dataKey="Spending"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={false}
              name="Spending (GK)"
            />
            <Line
              type="monotone"
              dataKey="Total Withdrawal"
              stroke="#f87171"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              name="Total Withdrawal (inc. tax)"
            />
            <Line
              type="monotone"
              dataKey="Portfolio End"
              stroke="#14b8a6"
              strokeWidth={2.5}
              dot={false}
              name="Portfolio Balance (EOY)"
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="leg">
          <div className="li">
            <div className="ll" style={{ background: "#fbbf24" }} />
            Spending (GK)
          </div>
          <div className="li">
            <div className="ll" style={{ background: "#f87171" }} />
            Total Withdrawal (inc. tax)
          </div>
          <div className="li">
            <div className="ll" style={{ background: "#14b8a6" }} />
            Portfolio Balance
          </div>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
      >
        <div className="met">
          <div className="ml">Portfolio at Retirement</div>
          <div className="mv" style={{ color: "#5eead4" }}>
            {fmtM(portAtRetire)}
          </div>
          <div className="ms">Median accumulation</div>
        </div>
        <div className="met">
          <div className="ml">Initial Withdrawal Rate</div>
          <div className="mv" style={{ color: "#fbbf24" }}>
            {(initWR * 100).toFixed(1)}%
          </div>
          <div className="ms">Pre‑tax spending / portfolio</div>
        </div>
        <div className="met">
          <div className="ml">
            Final Portfolio (Age {schedule[schedule.length - 1]?.age})
          </div>
          <div
            className="mv"
            style={{
              color:
                schedule[schedule.length - 1]?.portfolioEnd > 0
                  ? "#34d399"
                  : "#ef4444",
            }}
          >
            {fmtM(schedule[schedule.length - 1]?.portfolioEnd || 0)}
          </div>
          <div className="ms">
            {schedule[schedule.length - 1]?.portfolioEnd > 0
              ? "Survives"
              : "Exhausted"}
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div className="ct">📋 Year‑by‑Year Schedule</div>
          <button
            onClick={() => setShowTable(!showTable)}
            className="mbtn"
            style={{ fontSize: 10, padding: "3px 8px" }}
          >
            {showTable ? "Hide Table" : "Show Table"}
          </button>
        </div>
        {showTable && (
          <div style={{ overflowX: "auto" }}>
            <table className="nw-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Year</th>
                  <th>Spending (GK)</th>
                  <th>SS</th>
                  <th>Airbnb</th>
                  <th>Portfolio Draw</th>
                  <th>Fed Tax</th>
                  <th>State Tax</th>
                  <th>IRMAA</th>
                  <th>Total Withdrawal</th>
                  <th>Portfolio End</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((s) => (
                  <tr key={s.age}>
                    <td style={{ textAlign: "left" }}>{s.age}</td>
                    <td>{s.yr}</td>
                    <td style={{ color: "#fbbf24" }}>{fmtM(s.spending)}</td>
                    <td>{fmtM(s.ss)}</td>
                    <td>{fmtM(s.airbnb)}</td>
                    <td>{fmtM(s.portfolioDraw)}</td>
                    <td style={{ color: "#f87171" }}>{fmtM(s.fedTax)}</td>
                    <td style={{ color: "#fb923c" }}>{fmtM(s.stateTax)}</td>
                    <td style={{ color: "#a78bfa" }}>{fmtM(s.irmaa)}</td>
                    <td style={{ color: "#94a3b8" }}>
                      {fmtM(s.totalWithdrawal)}
                    </td>
                    <td style={{ color: "#14b8a6", fontWeight: 600 }}>
                      {fmtM(s.portfolioEnd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flag-i" style={{ fontSize: 11 }}>
        ℹ️ This is a deterministic (median) path – not a Monte Carlo average. It
        shows how Guyton‑Klinger would behave in a single "typical" sequence of
        returns (9.68% pre‑62, 8.93% after). Use it for planning a realistic
        withdrawal schedule, but remember that actual outcomes will vary.
      </div>
    </>
  );
}

function BucketsTab() {
  const buckets = [
    {
      name: "Bucket 1 — Cash/SGOV",
      target: "$160–200K",
      pct: 6,
      color: "#0ea5e9",
      purpose:
        "Living expenses 3-5yr runway. GK floor mechanism. NEVER dual-purpose.",
      holdings: "SGOV · Money Market · T-Bills",
      locked: "Jan 2030",
    },
    {
      name: "Bucket 2 — Income Sleeve",
      target: "~$500K",
      pct: 16,
      color: "#a78bfa",
      purpose:
        "Dividend/income generation. Starts AT retirement. Reduces portfolio WR.",
      holdings: "SCHD · SPYI · QQQI · Realty Income (O)",
      locked: "Jan 2028 start",
    },
    {
      name: "Bucket 3 — Growth",
      target: "Remainder",
      pct: 78,
      color: "#10b981",
      purpose:
        "Never touch 7-10 years. Compounding engine. Draw only when Bucket 1 depleted.",
      holdings: "VOO · SPMO · VTI · VXUS",
      locked: "Never before 2037",
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="chart-card">
        <div className="ct">
          3-Bucket strategy · Section 0.G · GK guardrails govern all draws
        </div>
        {buckets.map((b) => (
          <div
            key={b.name}
            style={{
              marginBottom: 12,
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${b.color}33`,
              borderRadius: 9,
              padding: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: b.color }}>
                {b.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: b.color,
                  fontFamily: "'DM Mono',monospace",
                }}
              >
                {b.target} · {b.pct}%
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
              {b.purpose}
            </div>
            <div style={{ fontSize: 10, color: "#475569" }}>
              <span style={{ color: b.color }}>Holdings:</span> {b.holdings}
            </div>
            <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>
              🔒 {b.locked}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenariosTab({
  baseParams,
  r85,
  r90,
  stress,
  running,
  runSimulation,
  retAge,
  ssAge,
  inf,
  real,
  endAge,
  fmtPct,
  fmtM,
  FanChart,
  SEQ_2000_2012,
  DeterministicGKView,
  RothLadder,
  BucketsTab,
  SmileChart,
}) {
  const [scenarioSubTab, setScenarioSubTab] = useState("stress");

  const SCENARIO_SUBTABS = [
    ["stress", "🔶 Stress"],
    ["gk", "📐 Guardrails"],
    ["roth", "🔄 Roth"],
    ["buckets", "🪣 Buckets"],
    ["smile", "🙂 Smile"],
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 12,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          paddingBottom: 8,
        }}
      >
        {SCENARIO_SUBTABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setScenarioSubTab(key)}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background:
                scenarioSubTab === key
                  ? "rgba(255,255,255,0.1)"
                  : "transparent",
              color: scenarioSubTab === key ? "#e2e8f0" : "#475569",
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {scenarioSubTab === "stress" && stress && (
        <div>
          <FanChart
            pcts={stress.pcts}
            retireAge={retAge}
            ssAge={ssAge}
            inf={inf}
            useReal={real}
            title="Stress test: 2000–2012 actual S&P sequence at retirement"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 10,
            }}
          >
            <div className="met">
              <div className="ml">Stress success</div>
              <div
                className="mv"
                style={{ color: stress.rate >= 0.85 ? "#0d9488" : "#f59e0b" }}
              >
                {fmtPct(stress.rate)}
              </div>
            </div>
            <div className="met">
              <div className="ml">Delta vs base</div>
              <div
                className="mv"
                style={{
                  color: r90 && stress.rate >= r90.rate ? "#0d9488" : "#ef4444",
                }}
              >
                {r90 ? `${((stress.rate - r90.rate) * 100).toFixed(1)}pp` : "—"}
              </div>
            </div>
          </div>
          <div
            style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}
          >
            {SEQ_2000_2012.map((r, i) => (
              <span
                key={i}
                style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: "'DM Mono',monospace",
                  background:
                    r < 0 ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.12)",
                  color: r < 0 ? "#f87171" : "#34d399",
                  border: `1px solid ${
                    r < 0 ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.25)"
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
      {scenarioSubTab === "gk" && (
        <DeterministicGKView p={baseParams} inf={inf} />
      )}
      {scenarioSubTab === "roth" && <RothLadder params={baseParams} />}
      {scenarioSubTab === "buckets" && <BucketsTab />}
      {scenarioSubTab === "smile" && <SmileChart p={baseParams} inf={inf} />}
    </div>
  );
}

function MCTab({ params, r85, r90, stress, running, onRun }) {
  const [showInputs, setShowInputs] = useState(true);
  const [showHow, setShowHow] = useState(false);
  const accPhase = `Age ${params.currentAge} → ${params.retireAge}`;
  const retPhase = `Age ${params.retireAge} → ${params.endAge}`;
  const mortAnnual = Math.round((params.mortBalance > 0 ? 1847.15 : 0) * 12);
  const mortPayoffAge = params.retireAge + 4;
  const rateColor = (r) =>
    r >= 0.9
      ? "#0d9488"
      : r >= 0.8
      ? "#34d399"
      : r >= 0.7
      ? "#fbbf24"
      : r >= 0.6
      ? "#f97316"
      : "#ef4444";
  const riskLabel = (r) =>
    r >= 0.9
      ? "Low risk — strong plan. As JL Collins would say — F-You Money."
      : r >= 0.8
      ? "Moderate risk — solid foundation. Consider small adjustments."
      : r >= 0.7
      ? "Elevated risk — plan needs some work."
      : "High risk — most scenarios deplete savings before target age.";
  const SectionHeader = ({ label, open, onToggle, color = "#5eead4" }) => (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        marginBottom: open ? 14 : 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 10, color: "#475569" }}>
        {open ? "▲ Hide" : "▼ Show"}
      </div>
    </div>
  );
  const InputCard = ({ title, rows }) => (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 9,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {rows.map(([label, val]) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
            fontSize: 12,
          }}
        >
          <span style={{ color: "#64748b" }}>{label}</span>
          <span
            style={{
              color: "#e2e8f0",
              fontFamily: "'DM Mono',monospace",
              fontWeight: 500,
            }}
          >
            {val}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#e2e8f0",
            marginBottom: 10,
          }}
        >
          WHAT IS A MONTE CARLO SIMULATION?
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>
          A Monte Carlo simulation tests your retirement plan against{" "}
          <strong style={{ color: "#e2e8f0" }}>
            3,000 different market scenarios
          </strong>{" "}
          using randomized annual returns drawn from 99 years of actual S&P 500
          history. Instead of assuming a single fixed growth rate, it models the
          real-world uncertainty of markets — some years boom, some years crash
          — and tells you how often your savings last through retirement.{" "}
          <strong style={{ color: "#5eead4" }}>
            A success rate above 85% is generally considered a solid plan.
          </strong>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
          AiRA also applies{" "}
          <strong style={{ color: "#fbbf24" }}>
            Guyton-Klinger guardrails
          </strong>{" "}
          — your spending adapts each year based on portfolio performance, so
          the simulation reflects how a real retiree would behave, not a robot
          spending a fixed amount no matter what.
        </div>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <SectionHeader
          label="Simulation Inputs & Assumptions"
          open={showInputs}
          onToggle={() => setShowInputs(!showInputs)}
        />
        {showInputs && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#0ea5e9",
                  marginBottom: 10,
                }}
              >
                ACCUMULATION PHASE ({accPhase})
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 10,
                }}
              >
                <InputCard
                  title="Starting Balances"
                  rows={[
                    ["Solo 401k (Fidelity)", "$1.66M"],
                    ["Combined Roth IRA", "$732K"],
                    ["HSA", "~$16K"],
                    ["Total liquid", fmtM(params.port)],
                  ]}
                />
                <InputCard
                  title="Annual Contributions"
                  rows={[
                    ["401k (2% pre + 10% Roth)", fmtK(26_500) + "/yr"],
                    ["Catch-up (forced Roth)", fmtK(8_000) + "/yr"],
                    ["Employer (3% + 1.5%)", fmtK(8_325) + "/yr"],
                    ["Total", fmtK(params.contrib) + "/yr"],
                  ]}
                />
                <InputCard
                  title="Plan Parameters"
                  rows={[
                    ["Retire age", "Age " + params.retireAge],
                    [
                      "Years to retirement",
                      params.retireAge - params.currentAge + " yrs",
                    ],
                    ["Glide path", "91% equity / 9% bonds"],
                    ["Employer", "Alpha FMC"],
                  ]}
                />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#a78bfa",
                  marginBottom: 10,
                }}
              >
                WITHDRAWAL PHASE ({retPhase})
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 10,
                }}
              >
                <InputCard
                  title="Living Expenses"
                  rows={[
                    ["Base annual spend", fmtM(params.sp) + "/yr"],
                    ["Inflation model", "Blanchett smile"],
                    ["Go-go (60–74)", "115% of base"],
                    ["Slow-go (75–84)", "85% of base"],
                  ]}
                />
                <InputCard
                  title="Income Offsets"
                  rows={[
                    ["Social Security", "$31,543/yr @ 64"],
                    ["SS COLA", "2.4%/yr"],
                    ["Airbnb net (80% reliable)", "$20,000/yr"],
                    ["SS gap", "Ages 60–63: $0"],
                  ]}
                />
                <InputCard
                  title="Additional Costs"
                  rows={[
                    ["Healthcare (age 72+)", "3.5% shock prob/yr"],
                    ["Shock range", "$70K–$130K"],
                    [
                      "Mortgage annual",
                      mortAnnual > 0 ? fmtM(mortAnnual) + "/yr" : "Paid off",
                    ],
                    ["Mortgage payoff", "~" + mortPayoffAge],
                  ]}
                />
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#34d399",
                  marginBottom: 10,
                }}
              >
                MARKET & STATISTICAL MODEL
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 10,
                }}
              >
                <InputCard
                  title="Return Distribution"
                  rows={[
                    ["Model", "Historical bootstrap"],
                    ["Equity data", "99yr S&P 500 (1928–2026)"],
                    ["Phase 1 mean (91/9)", "9.68%/yr"],
                    ["Phase 2 mean (70/30)", "8.93%/yr"],
                  ]}
                />
                <InputCard
                  title="Inflation & Guardrails"
                  rows={[
                    ["Inflation", "Historical bootstrap"],
                    ["Inflation source", "2000–2024 actual CPI"],
                    ["GK floor", fmtM(params.gkFloor) + "/yr"],
                    ["GK ceiling", fmtM(params.gkCeiling) + "/yr"],
                  ]}
                />
                <InputCard
                  title="Simulation Parameters"
                  rows={[
                    ["Simulations", "3,000 paths"],
                    ["Horizons", "Age 85 + Age 90"],
                    ["Withdrawal", "Guyton-Klinger"],
                    ["Airbnb reliability", "80% per year"],
                  ]}
                />
              </div>
            </div>
          </>
        )}
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <SectionHeader
          label="How the Simulation Works"
          open={showHow}
          onToggle={() => setShowHow(!showHow)}
          color="#64748b"
        />
        {showHow && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              fontSize: 12,
              color: "#94a3b8",
              lineHeight: 1.7,
            }}
          >
            <div>
              <div
                style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              >
                1. Accumulation (ages {params.currentAge}–{params.retireAge})
              </div>
              Each of 3,000 paths independently draws a random S&P 500 year and
              a random bond year, blended by glide path weight. Contributions
              are added annually. The result is a unique portfolio value at
              retirement for each path.
            </div>
            <div>
              <div
                style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              >
                2. Retirement spending
              </div>
              Each path draws fresh random returns year by year. Spending
              follows the Blanchett smile curve. SS and Airbnb income offset
              draws. Airbnb fails 20% of years randomly. Healthcare shocks hit
              3.5% of years after age 72.
            </div>
            <div>
              <div
                style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              >
                3. Guyton-Klinger guardrails
              </div>
              Every year, if the current withdrawal rate exceeds 120% of the
              initial rate, spending cuts 10% (never below floor). If it falls
              below 80%, spending increases 10% (never above ceiling). This
              mimics real retiree behavior.
            </div>
            <div>
              <div
                style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}
              >
                4. Survival check
              </div>
              A path "succeeds" if the portfolio balance stays above $0 through
              the target age. The success rate is the percentage of paths that
              survive. The fan chart shows the 10th–90th percentile spread of
              all outcomes.
            </div>
          </div>
        )}
      </div>
      {!r90 && (
        <div
          style={{
            textAlign: "center",
            padding: "20px",
            color: "#475569",
            fontSize: 13,
          }}
        >
          {running
            ? "Running 6,000 paths..."
            : "Run Monte Carlo from the sidebar to see results here."}
        </div>
      )}
      {r90 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          <div
            style={{
              background: `${rateColor(r90.rate)}12`,
              border: `1.5px solid ${rateColor(r90.rate)}44`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
              }}
            >
              SUCCESS RATE ⓘ
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 900,
                color: rateColor(r90.rate),
                fontFamily: "'DM Mono',monospace",
                lineHeight: 1,
                marginBottom: 6,
              }}
            >
              {fmtPct(r90.rate)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
              of 3,000 simulations last to age {params.endAge}
            </div>
            <div
              style={{
                fontSize: 12,
                color: rateColor(r90.rate),
                marginBottom: 14,
                lineHeight: 1.5,
              }}
            >
              {riskLabel(r90.rate)}
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.07)",
                paddingTop: 10,
                display: "flex",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 9,
                    color: "#475569",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  To age 85
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: rateColor(r85?.rate || 0),
                    fontFamily: "'DM Mono',monospace",
                  }}
                >
                  {r85 ? fmtPct(r85.rate) : "—"}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  textAlign: "center",
                  borderLeft: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "#475569",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Stress test
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: rateColor(stress?.rate || 0),
                    fontFamily: "'DM Mono',monospace",
                  }}
                >
                  {stress ? fmtPct(stress.rate) : "—"}
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
              }}
            >
              MEDIAN FINAL BALANCE ⓘ
            </div>
            <div
              style={{
                fontSize: 42,
                fontWeight: 900,
                color: "#14b8a6",
                fontFamily: "'DM Mono',monospace",
                lineHeight: 1,
                marginBottom: 6,
              }}
            >
              {fmtM(r90.term.p50)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
              50th percentile at age {params.endAge}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                lineHeight: 1.5,
                marginBottom: 14,
              }}
            >
              Half of all simulations end above this. A higher balance cushions
              against sequence-of-returns risk.
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.07)",
                paddingTop: 10,
              }}
            >
              {[
                { l: "10th (near-worst)", v: r90.term.p10, c: "#f87171" },
                { l: "25th (cautious)", v: r90.term.p25, c: "#fbbf24" },
                { l: "75th (good case)", v: r90.term.p75, c: "#34d399" },
                { l: "90th (best 10%)", v: r90.term.p90, c: "#5eead4" },
              ].map(({ l, v, c }) => (
                <div
                  key={l}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 5,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "#475569" }}>{l}</span>
                  <span
                    style={{
                      color: c,
                      fontFamily: "'DM Mono',monospace",
                      fontWeight: 600,
                    }}
                  >
                    {fmtM(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 12,
              }}
            >
              MODEL ASSUMPTIONS
            </div>
            {[
              ["3,000 randomized return sequences", "#5eead4"],
              ["99yr S&P 500 + 50yr Bloomberg Agg bootstrap", "#5eead4"],
              ["Separate equity & bond draws each year", "#5eead4"],
              ["Airbnb income fails 20% of years randomly", "#fbbf24"],
              ["Healthcare shocks 3.5%/yr from age 72", "#fbbf24"],
              ["Guyton-Klinger guardrails each path", "#a78bfa"],
              ["Blanchett smile spending (not flat)", "#a78bfa"],
              ["SS COLA 2.4%/yr · Airbnb growth 3%/yr", "#94a3b8"],
              [
                params.tax
                  ? "Tax drag modeled (pre/post SS/RMD)"
                  : "Tax drag OFF",
                "#94a3b8",
              ],
              ["Glide path: 91/9 → 70/30 at age 62", "#94a3b8"],
            ].map(([text, color]) => (
              <div
                key={text}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  marginBottom: 7,
                  fontSize: 11,
                }}
              >
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: color,
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "#64748b", lineHeight: 1.4 }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MortgageTab({ prof }) {
  const [bal, setBal] = useState(prof.mortBalance),
    [rate, setRate] = useState(prof.mortRate),
    [extra, setExtra] = useState(prof.mortExtra);
  const sched = useMemo(
    () => mortgageSchedule(bal, rate, prof.mortStart, prof.mortTerm, extra),
    [bal, rate, extra, prof]
  );
  const schedNE = useMemo(
    () => mortgageSchedule(bal, rate, prof.mortStart, prof.mortTerm, 0),
    [bal, rate, prof]
  );
  const chartData = useMemo(() => {
    const maxLen = Math.max(sched.years.length, schedNE.years.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      yr: new Date().getFullYear() + i,
      "With extra": sched.years[i]?.bal ?? 0,
      Original: schedNE.years[i]?.bal ?? 0,
    }));
  }, [sched, schedNE]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="metrics">
        <div className="met">
          <div className="ml">Current balance</div>
          <div className="mv" style={{ color: "#0ea5e9", fontSize: 18 }}>
            {fmtM(bal)}
          </div>
          <div className="ms">Harrington Park NJ</div>
        </div>
        <div className="met">
          <div className="ml">Payoff year</div>
          <div className="mv" style={{ color: "#10b981", fontSize: 18 }}>
            {sched.payoffYr}
          </div>
          <div className="ms">With ${extra}/mo extra</div>
        </div>
        <div className="met">
          <div className="ml">Interest saved</div>
          <div className="mv" style={{ color: "#34d399", fontSize: 18 }}>
            {fmtM(sched.interestSaved)}
          </div>
          <div className="ms">vs no extra payments</div>
        </div>
        <div className="met">
          <div className="ml">Monthly P&I</div>
          <div className="mv" style={{ color: "#94a3b8", fontSize: 18 }}>
            {fmtM(sched.pmt)}
          </div>
          <div className="ms">At {rate}% fixed</div>
        </div>
      </div>
      <div className="chart-card">
        <div className="ct">
          Balance over time · with vs without extra payments
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Slider
            label="Balance"
            value={bal}
            min={100000}
            max={500000}
            step={1000}
            format={(v) => fmtM(v)}
            onChange={setBal}
          />
          <Slider
            label="Rate"
            value={rate}
            min={3}
            max={10}
            step={0.125}
            format={(v) => v.toFixed(3) + "%"}
            onChange={setRate}
          />
          <Slider
            label="Extra/mo"
            value={extra}
            min={0}
            max={3000}
            step={50}
            format={(v) => fmtM(v) + "/mo"}
            onChange={setExtra}
          />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey="yr"
              stroke="#1e3a5f"
              tick={{ fill: "#475569", fontSize: 9 }}
            />
            <YAxis
              stroke="#1e3a5f"
              tick={{ fill: "#475569", fontSize: 9 }}
              tickFormatter={(v) => fmtM(v)}
              width={54}
            />
            <Tooltip content={<Tip />} />
            <Line
              type="monotone"
              dataKey="With extra"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Original"
              stroke="#475569"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-card">
        <div className="ct">
          Amortization — first 10 years with extra payments
        </div>
        <table className="nw-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Extra</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {sched.years.slice(0, 10).map((r) => (
              <tr key={r.yr}>
                <td
                  style={{
                    textAlign: "left",
                    fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  {r.yr}
                </td>
                <td>{fmtM(r.pPaid)}</td>
                <td style={{ color: "#f87171" }}>{fmtM(r.iPaid)}</td>
                <td style={{ color: "#34d399" }}>{fmtM(r.ePaid)}</td>
                <td style={{ color: "#0ea5e9" }}>{fmtM(r.bal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetWorthTab({ p, results90, inf }) {
  const [showRE, setShowRE] = useState(false);
  const reTotal = p.reHarrington + p.reOrlando105 + p.reOrlando306;
  const mortSched = useMemo(
    () =>
      mortgageSchedule(
        p.mortBalance,
        p.mortRate,
        p.mortStart,
        p.mortTerm,
        p.mortExtra
      ),
    [p]
  );
  const nwData = useMemo(() => {
    if (!results90) return [];
    return Array.from(
      { length: Math.floor(Math.min(35, p.endAge - p.currentAge + 1) / 5) + 1 },
      (_, i) => {
        const age = p.currentAge + i * 5,
          yr = new Date().getFullYear() + i * 5;
        const idx = Math.floor(
          ((i * 5) / (p.endAge - p.currentAge)) * (results90.pcts.length - 1)
        );
        const port =
          results90.pcts[Math.min(idx, results90.pcts.length - 1)]?.p50 || 0;
        const mortEntry = mortSched.years.find((y) => y.yr === yr);
        const mortBal = mortEntry ? mortEntry.bal : 0;
        const re = showRE ? reTotal : 0;
        return {
          age,
          "Liquid Portfolio": port,
          "Mortgage Debt": -mortBal,
          "Real Estate": re,
          "Net Worth": port + re - mortBal,
        };
      }
    );
  }, [p, results90, showRE, mortSched, reTotal]);
  const peakPort = results90
    ? Math.max(...results90.pcts.map((d) => d.p50))
    : 0;
  const peakAge = results90
    ? p.retireAge + results90.pcts.findIndex((d) => d.p50 === peakPort)
    : 0;
  const finalNW = nwData[nwData.length - 1]?.["Net Worth"] || 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="metrics">
        <div className="met">
          <div className="ml">Peak liquid (median)</div>
          <div className="mv" style={{ color: "#10b981", fontSize: 18 }}>
            {fmtM(peakPort)}
          </div>
          <div className="ms">Age {peakAge}</div>
        </div>
        <div className="met">
          <div className="ml">Net worth at 90</div>
          <div className="mv" style={{ color: "#0ea5e9", fontSize: 18 }}>
            {fmtM(finalNW)}
          </div>
          <div className="ms">{showRE ? "Incl." : "Excl."} real estate</div>
        </div>
        <div className="met">
          <div className="ml">Mortgage-free</div>
          <div className="mv" style={{ color: "#a78bfa", fontSize: 18 }}>
            {mortSched.payoffYr}
          </div>
          <div className="ms">With extra payments</div>
        </div>
        <div className="met">
          <div className="ml">Real estate equity</div>
          <div className="mv" style={{ color: "#fbbf24", fontSize: 18 }}>
            {fmtM(reTotal)}
          </div>
          <div className="ms">NOT in liquid total</div>
        </div>
      </div>
      <div className="chart-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div className="ct" style={{ margin: 0 }}>
            Net worth projection · 5-year intervals · median MC path
          </div>
          <Toggle
            val={showRE}
            onChange={setShowRE}
            label="Include RE"
            accent="#fbbf24"
          />
        </div>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart
            data={nwData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey="age"
              stroke="#1e3a5f"
              tick={{ fill: "#475569", fontSize: 9 }}
            />
            <YAxis
              stroke="#1e3a5f"
              tick={{ fill: "#475569", fontSize: 9 }}
              tickFormatter={(v) => fmtM(v)}
              width={54}
            />
            <Tooltip content={<Tip />} />
            <Line
              type="monotone"
              dataKey="Liquid Portfolio"
              stroke="#0ea5e9"
              strokeWidth={2.5}
              dot={false}
            />
            {showRE && (
              <Line
                type="monotone"
                dataKey="Real Estate"
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="Mortgage Debt"
              stroke="#f87171"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Net Worth"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!results90 && (
        <div className="flag-i">
          ℹ Run Monte Carlo first to see net worth projections.
        </div>
      )}
    </div>
  );
}

function ActionPlanTab() {
  const milestones = [
    {
      date: "Now · Age 56 (Mar 2026)",
      color: "#0ea5e9",
      status: "active",
      items: [
        "Alpha FMC engaged · $38,525/yr into 401k",
        "NVDA trigger @ $162.45 armed 🔴",
        "TSLA trigger @ $341.60 armed 🔴",
        "SGOV dry powder $134,895 ready",
        "VOO→VTI Fidelity Roth ✅ · FXAIX→FSKAX Solo 401k ✅",
      ],
    },
    {
      date: "Bucket 2 Begins · Age 58 (Jan 2028)",
      color: "#a78bfa",
      status: "upcoming",
      items: [
        "Begin SCHD in Solo 401k · DRIP ON",
        "No income ETFs before this date",
      ],
    },
    {
      date: "Alpha FMC Ends · Age 58 (Mar 2028)",
      color: "#a78bfa",
      status: "upcoming",
      items: [
        "MVL Advisors target: $20K/mo C2C",
        "Solo 401k resumes ~$77K/yr max",
      ],
    },
    {
      date: "D-Day 🎯 · Age 60 (Mar 14, 2030)",
      color: "#10b981",
      status: "target",
      items: [
        "Target $3.2M liquid · Trigger $3.5M",
        "Retire · Thailand solo 🌴",
        "Bucket strategy operational · GK engaged",
      ],
    },
    {
      date: "SS Gap · Ages 60-64 (Jan 2031-Mar 2034)",
      color: "#f87171",
      status: "critical",
      items: [
        "Zero SS for 3 years — highest-risk window",
        "Bucket 1 + Bucket 2 + Airbnb covers expenses",
        "🚩 Always flag",
      ],
    },
    {
      date: "Roth Window · Ages 61-63",
      color: "#fbbf24",
      status: "upcoming",
      items: [
        "~$60K/yr at 22% bracket",
        "Golden 2033 (age 63): ~$210K conversion",
      ],
    },
    {
      date: "SS Starts · Age 64 (Mar 2034)",
      color: "#10b981",
      status: "upcoming",
      items: [
        "$2,629/mo ($31,543/yr) · CLOSED DECISION",
        "GK prosperity rule likely triggers — spend more",
      ],
    },
    {
      date: "RMDs Begin · Age 73 (2043)",
      color: "#f97316",
      status: "future",
      items: [
        "Joint & Last Survivor table (Mira age 64)",
        "With conversions: ~$28K/yr · Without: ~$272K/yr",
      ],
    },
  ];
  const critical = [
    "SS gap Jan 2031→Mar 2034",
    "NJ domicile — FL before Dec 31, 2030",
    "AAPL concentration ~15% Solo 401k",
  ];
  const actions = [
    "Confirm Alpha 401k elections in Empower",
    "NJ tax attorney consultation 2029",
    "Get Chris earning income → Roth IRA",
    "Backdoor Roth Vin + Mira",
    "CSS Profile before Christopher applies (2027)",
  ];
  const onTrack = [
    "Bootstrap MC engine 99yr S&P + 50yr bonds",
    "Roth IRA ~$732K combined · growth only",
    "Solo 401k $1.658M · FSKAX ✅",
    "Vista Cay debt-free · Airbnb $20K ready",
    "VOO→VTI ✅ · FXAIX→FSKAX ✅",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 10,
        }}
      >
        <div className="ap-col">
          <div className="ap-hdr" style={{ color: "#ef4444" }}>
            🔴 Critical
          </div>
          {critical.map((i) => (
            <div key={i} className="ap-item">
              • {i}
            </div>
          ))}
        </div>
        <div className="ap-col">
          <div className="ap-hdr" style={{ color: "#fbbf24" }}>
            🟡 Action items
          </div>
          {actions.map((i) => (
            <div key={i} className="ap-item">
              • {i}
            </div>
          ))}
        </div>
        <div className="ap-col">
          <div className="ap-hdr" style={{ color: "#10b981" }}>
            🟢 On track
          </div>
          {onTrack.map((i) => (
            <div key={i} className="ap-item">
              • {i}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-card">
        <div className="ct">Milestone timeline · D-Day and beyond</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {milestones.map((m, i) => (
            <div
              key={m.date}
              style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  className="ms-dot"
                  style={{
                    background:
                      m.status === "active" || m.status === "target"
                        ? m.color
                        : `${m.color}44`,
                    border: `2px solid ${m.color}`,
                  }}
                />
                {i < milestones.length - 1 && (
                  <div
                    className="ms-line"
                    style={{
                      height: Math.max(30, m.items.length * 16 + 10),
                      flex: "none",
                    }}
                  />
                )}
              </div>
              <div style={{ paddingBottom: 12, flex: 1 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: m.color,
                    marginBottom: 3,
                  }}
                >
                  {m.date}
                </div>
                {m.items.map((it) => (
                  <div
                    key={it}
                    style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}
                  >
                    · {it}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileWizard({ values, onChange }) {
  const [step, setStep] = useState(0);

  const STEPS = [
    { label: "About You", icon: "👤", sub: `${values.currentAge} yrs old` },
    { label: "Current Savings", icon: "💰", sub: `${fmtM(values.port)} saved` },
    { label: "Contributions", icon: "📋", sub: `${fmtK(values.contrib)}/yr` },
    { label: "Retirement Plan", icon: "🎯", sub: `Age ${values.retireAge}` },
    {
      label: "Other Income",
      icon: "🏖",
      sub: `$${(values.ab / 1000).toFixed(0)}K/yr`,
    },
    { label: "Assumptions", icon: "⚙️", sub: "Model parameters" },
  ];

  const PANELS = [
    <AboutYouPanel values={values} onChange={onChange} />,
    <SavingsPanel values={values} onChange={onChange} />,
    <ContribPanel values={values} onChange={onChange} />,
    <RetirementPanel values={values} onChange={onChange} />,
    <IncomePanel values={values} onChange={onChange} />,
    <AssumptionsPanel values={values} onChange={onChange} />,
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* LEFT SIDEBAR */}
      <div
        style={{ borderRight: "1px solid rgba(255,255,255,0.06)", padding: 16 }}
      >
        {STEPS.map((s, i) => (
          <div
            key={i}
            onClick={() => setStep(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              marginBottom: 4,
              cursor: "pointer",
              background: i === step ? "rgba(13,148,136,0.15)" : "transparent",
              border:
                i === step
                  ? "1px solid rgba(13,148,136,0.3)"
                  : "1px solid transparent",
            }}
          >
            {/* Dot */}
            <div
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                flexShrink: 0,
                background:
                  i < step
                    ? "#0d9488"
                    : i === step
                    ? "#14b8a6"
                    : "rgba(255,255,255,0.1)",
                border: `2px solid ${
                  i <= step ? "#0d9488" : "rgba(255,255,255,0.15)"
                }`,
                boxShadow: i === step ? "0 0 8px #0d948866" : "none",
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: i === step ? "#e2e8f0" : "#64748b",
                }}
              >
                {s.icon} {s.label}
              </div>
              <div style={{ fontSize: 10, color: "#334155" }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* RIGHT PANEL */}
      <div style={{ padding: 24 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#e2e8f0",
            marginBottom: 4,
          }}
        >
          {STEPS[step].icon} {STEPS[step].label}
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
          {STEPS[step].sub}
        </div>

        {/* Panel content */}
        {PANELS[step]}

        {/* Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: step === 0 ? "#334155" : "#94a3b8",
              cursor: step === 0 ? "not-allowed" : "pointer",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            ← Previous
          </button>
          <div style={{ fontSize: 11, color: "#334155" }}>
            {step + 1} / {STEPS.length}
          </div>
          <button
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={step === STEPS.length - 1}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              background: "linear-gradient(135deg,#0d9488,#14b8a6)",
              color: "white",
              cursor: step === STEPS.length - 1 ? "not-allowed" : "pointer",
              fontSize: 12,
              fontFamily: "inherit",
              fontWeight: 600,
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function SavingsPanel({ values, onChange }) {
  const GOAL = 3_200_000;
  // Account breakdown — auto-sum to port
  const solo401k = values.solo401k || 0;
  const alpha401k = values.alpha401k || 0;
  const rothFid = values.rothFid || 0;
  const rothVgd = values.rothVgd || 0;
  const hsaBal = values.hsaBal || 0;
  const taxable = values.taxable || 0;
  const autoTotal = solo401k + alpha401k + rothFid + rothVgd + hsaBal + taxable;
  const percentToGoal = Math.min(100, (autoTotal / GOAL) * 100);
  const remaining = Math.max(0, GOAL - autoTotal);

  // Keep port in sync with auto-total
  const handleAcct = (k, v) => {
    onChange(k, v);
    // recalc total — use current values + new value
    const map = {
      solo401k,
      alpha401k,
      rothFid,
      rothVgd,
      hsaBal,
      taxable,
      [k]: v,
    };
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    onChange("port", total);
  };

  const ACCOUNTS = [
    {
      k: "solo401k",
      label: "Solo 401k (Pre-Tax)",
      color: "#0ea5e9",
      max: 3_000_000,
    },
    {
      k: "alpha401k",
      label: "Alpha FMC 401k (Pre-Tax)",
      color: "#0ea5e9",
      max: 500_000,
    },
    {
      k: "rothFid",
      label: "Roth IRA — Fidelity",
      color: "#a78bfa",
      max: 1_000_000,
    },
    {
      k: "rothVgd",
      label: "Roth IRA — Vanguard",
      color: "#a78bfa",
      max: 500_000,
    },
    { k: "hsaBal", label: "HSA", color: "#34d399", max: 200_000 },
    { k: "taxable", label: "Taxable / SGOV", color: "#fbbf24", max: 500_000 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Account breakdown grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {ACCOUNTS.map((a) => (
          <div
            key={a.k}
            style={{
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${a.color}22`,
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: a.color,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {a.label}
            </div>
            <DualInput
              label=""
              value={values[a.k] || 0}
              min={0}
              max={a.max}
              step={5_000}
              format={(v) => fmtM(v)}
              onChange={(v) => handleAcct(a.k, v)}
            />
          </div>
        ))}
      </div>

      {/* Auto-total summary */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 12, color: "#e2e8f0" }}>
            🎯 $3.2M Goal Progress
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#5eead4",
              fontFamily: "'DM Mono',monospace",
            }}
          >
            {percentToGoal.toFixed(1)}%
          </span>
        </div>
        <div
          style={{
            height: 10,
            background: "rgba(255,255,255,0.1)",
            borderRadius: 5,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percentToGoal}%`,
              height: "100%",
              background: "linear-gradient(90deg,#0d9488,#14b8a6)",
              borderRadius: 5,
              transition: "width 0.3s",
            }}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 8,
            marginTop: 12,
          }}
        >
          {[
            { label: "Pre-Tax", val: solo401k + alpha401k, color: "#0ea5e9" },
            { label: "Roth", val: rothFid + rothVgd, color: "#a78bfa" },
            { label: "HSA", val: hsaBal, color: "#34d399" },
            { label: "Taxable", val: taxable, color: "#fbbf24" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#475569" }}>{s.label}</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: s.color,
                  fontFamily: "'DM Mono',monospace",
                }}
              >
                {fmtM(s.val)}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
            fontSize: 11,
            color: "#64748b",
          }}
        >
          <span>
            Total:{" "}
            <strong style={{ color: "#e2e8f0" }}>{fmtM(autoTotal)}</strong>
          </span>
          <span>
            Remaining:{" "}
            <strong style={{ color: "#f87171" }}>{fmtM(remaining)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function AboutYouPanel({ values, onChange }) {
  const yearsToRetire = Math.max(0, values.retireAge - values.currentAge);
  const yearsInRetire = Math.max(0, values.endAge - values.retireAge);
  const totalHorizon = yearsToRetire + yearsInRetire;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Three sliders */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}
      >
        {[
          {
            label: "Current Age",
            k: "currentAge",
            min: 30,
            max: 75,
            step: 1,
            fmt: (v) => `${v} yrs`,
          },
          {
            label: "Retirement Age",
            k: "retireAge",
            min: 50,
            max: 75,
            step: 1,
            fmt: (v) => `${v} yrs`,
          },
          {
            label: "Planning Horizon",
            k: "endAge",
            min: 75,
            max: 100,
            step: 1,
            fmt: (v) => `to age ${v}`,
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k]}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: "14px 20px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        {[
          {
            label: "Years to retirement",
            val: yearsToRetire,
            color: "#14b8a6",
          },
          {
            label: "Years in retirement",
            val: yearsInRetire,
            color: "#a78bfa",
          },
          {
            label: "Total planning horizon",
            val: `${totalHorizon} yrs`,
            color: "#e2e8f0",
          },
        ].map((m) => (
          <div key={m.label}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
              {m.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: m.color,
                fontFamily: "'DM Mono',monospace",
                lineHeight: 1,
              }}
            >
              {m.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssumptionsPanel({ values, onChange }) {
  const {
    dob,
    abReliability,
    abGrowth,
    ssCola,
    preRetireEq,
    postRetireEq,
    hcShockAge,
    hcProb,
    hcMin,
    hcMax,
    ab,
    ssb,
  } = values;
  const derivedAge = dob
    ? Math.floor((new Date() - new Date(dob)) / (365.25 * 24 * 3600 * 1000))
    : "—";
  const Row = ({ label, desc, children }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>
          {label}
        </div>
        {desc && (
          <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
            {desc}
          </div>
        )}
      </div>
      <div style={{ marginLeft: 16, flexShrink: 0 }}>{children}</div>
    </div>
  );
  const NumInput = ({ k, min, max, step, suffix = "" }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        value={values[k]}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(k, Number(e.target.value))}
        style={{
          width: 80,
          background: "#0d1b2a",
          border: "1px solid #1e3a5f",
          color: "#e2e8f0",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 12,
          fontFamily: "'DM Mono',monospace",
          textAlign: "right",
        }}
      />
      {suffix && (
        <span style={{ fontSize: 11, color: "#475569" }}>{suffix}</span>
      )}
    </div>
  );
  const DateInput = ({ k }) => (
    <input
      type="date"
      value={values[k]}
      onChange={(e) => onChange(k, e.target.value)}
      style={{
        background: "#0d1b2a",
        border: "1px solid #1e3a5f",
        color: "#e2e8f0",
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 12,
        fontFamily: "'DM Mono',monospace",
      }}
    />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#0ea5e9",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          Personal Profile
        </div>
        <Row
          label="Date of Birth"
          desc={`Current age: ${derivedAge} · Used to derive D-Day and accumulation years`}
        >
          <DateInput k="dob" />
        </Row>
        <Row
          label="Airbnb net income / yr"
          desc="Net after expenses · Always use net, never gross"
        >
          <NumInput k="ab" min={0} max={100000} step={1000} suffix="/yr" />
        </Row>
        <Row
          label="Social Security benefit"
          desc="Monthly benefit at your SS start age"
        >
          <NumInput k="ssb" min={0} max={5000} step={100} suffix="/mo" />
        </Row>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#34d399",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          Monte Carlo Model Parameters
        </div>
        <Row
          label="Airbnb reliability"
          desc="Probability Airbnb income arrives in any given year (default 80%)"
        >
          <NumInput k="abReliability" min={0} max={100} step={5} suffix="%" />
        </Row>
        <Row
          label="Airbnb income growth / yr"
          desc="Annual growth rate for Airbnb income (default 3%)"
        >
          <NumInput k="abGrowth" min={0} max={10} step={0.5} suffix="%" />
        </Row>
        <Row
          label="SS COLA / yr"
          desc="Social Security cost-of-living adjustment (default 2.4%)"
        >
          <NumInput k="ssCola" min={0} max={6} step={0.1} suffix="%" />
        </Row>
        <Row
          label="Pre-retirement equity weight"
          desc="Equity % before retirement age (default 91%)"
        >
          <NumInput k="preRetireEq" min={50} max={100} step={1} suffix="%" />
        </Row>
        <Row
          label="Post-retirement equity weight"
          desc="Equity % after retirement age (default 70%)"
        >
          <NumInput k="postRetireEq" min={30} max={90} step={1} suffix="%" />
        </Row>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#f87171",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 4,
          }}
        >
          Healthcare Shock Model
        </div>
        <div style={{ fontSize: 11, color: "#475569", marginBottom: 12 }}>
          In each simulation year after the shock age, there is a random
          probability of a large one-time healthcare cost.
        </div>
        <Row
          label="Shock start age"
          desc="Age after which annual healthcare shocks can occur (default 72)"
        >
          <NumInput k="hcShockAge" min={60} max={85} step={1} suffix="yrs" />
        </Row>
        <Row
          label="Annual shock probability"
          desc="Chance of a shock in any given year (default 3.5%)"
        >
          <NumInput k="hcProb" min={0} max={20} step={0.5} suffix="%" />
        </Row>
        <Row
          label="Shock cost — minimum"
          desc="Low end of randomized healthcare shock cost (default $70K)"
        >
          <NumInput k="hcMin" min={0} max={200000} step={5000} suffix="$" />
        </Row>
        <Row
          label="Shock cost — maximum"
          desc="High end of randomized healthcare shock cost (default $130K)"
        >
          <NumInput k="hcMax" min={0} max={500000} step={5000} suffix="$" />
        </Row>
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#334155",
          fontStyle: "italic",
          textAlign: "right",
        }}
      >
        Changes take effect on next Monte Carlo run · These replace all
        hardcoded simulation values
      </div>
    </div>
  );
}

function ContribPanel({ values, onChange }) {
  const annual401k = values.contrib || 0;
  const hsaAnnual = (values.hsaMonthly || 795.83) * 12;
  const employerMatch = values.employerMatch || 4.5;
  const matchAmount = (annual401k * employerMatch) / 100;
  const totalSavings = annual401k + hsaAnnual + matchAmount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
            401(k) Annual Contribution
          </div>
          <Slider
            label=""
            value={annual401k}
            min={0}
            max={80_000}
            step={500}
            format={(v) => fmtK(v) + "/yr"}
            onChange={(v) => onChange("contrib", v)}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
            HSA Monthly Contribution
          </div>
          <Slider
            label=""
            value={values.hsaMonthly || 795.83}
            min={0}
            max={1000}
            step={50}
            format={(v) => fmtM(v) + "/mo"}
            onChange={(v) => onChange("hsaMonthly", v)}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
            Employer Match (%)
          </div>
          <Slider
            label=""
            value={employerMatch}
            min={0}
            max={10}
            step={0.5}
            format={(v) => v.toFixed(1) + "%"}
            onChange={(v) => onChange("employerMatch", v)}
          />
        </div>
      </div>

      {/* Summary */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 18,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        {[
          { label: "401(k) Contribution", val: annual401k, color: "#0ea5e9" },
          { label: "Employer Match", val: matchAmount, color: "#34d399" },
          { label: "HSA Contribution", val: hsaAnnual, color: "#a78bfa" },
        ].map((m) => (
          <div key={m.label}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
              {m.label}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: m.color,
                fontFamily: "'DM Mono',monospace",
                lineHeight: 1,
              }}
            >
              {fmtK(m.val)}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "linear-gradient(135deg, #0d948818, #14b8a618)",
          border: "1px solid #0d948844",
          borderRadius: 10,
          padding: 18,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
          💰 Total Annual Savings Rate
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 900,
            color: "#14b8a6",
            fontFamily: "'DM Mono',monospace",
            lineHeight: 1,
          }}
        >
          {fmtK(totalSavings)}
          <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>
            /yr
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
          Including employer match and HSA
        </div>
      </div>
    </div>
  );
}
function RetirementPanel({ values, onChange }) {
  const spend = values.sp || 100_000;
  const floor = values.gkFloor || 88_000;
  const ceiling = values.gkCeiling || 115_000;
  const floorPct = (floor / spend) * 100;
  const ceilingPct = (ceiling / spend) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {[
          {
            k: "sp",
            label: "Annual Spend (Both Households)",
            min: 30000,
            max: 200000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
          {
            k: "spThailand",
            label: "Vin Thailand Solo Spend",
            min: 20000,
            max: 150000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
          {
            k: "spMiraNJ",
            label: "Mira NJ Household Spend",
            min: 20000,
            max: 150000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k] || 0}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
        {[
          {
            k: "gkFloor",
            label: "Guyton-Klinger Floor",
            min: 20000,
            max: 150000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
          {
            k: "gkCeiling",
            label: "Guyton-Klinger Ceiling",
            min: 50000,
            max: 250000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k] || 0}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
      </div>

      {/* GK % of spend */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 16 }}>
          🛡️ Guardrails as % of Spend
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
              Floor
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#fbbf24",
                fontFamily: "'DM Mono',monospace",
              }}
            >
              {floorPct.toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: "#334155" }}>
              {fmtK(floor)} / {fmtK(spend)}
            </div>
          </div>
          <div
            style={{
              width: 1,
              height: 30,
              background: "rgba(255,255,255,0.1)",
            }}
          />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>
              Ceiling
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#34d399",
                fontFamily: "'DM Mono',monospace",
              }}
            >
              {ceilingPct.toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: "#334155" }}>
              {fmtK(ceiling)} / {fmtK(spend)}
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#64748b",
            marginTop: 16,
            fontStyle: "italic",
          }}
        >
          GK adjusts spending ±10% when withdrawal rate deviates 20% from
          initial.
        </div>
      </div>
    </div>
  );
}

function IncomePanel({ values, onChange }) {
  const ab = values.ab || 20_000;
  const ssb = values.ssb || 31_543;
  const totalRetirementIncome = ab + ssb;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {[
          {
            k: "ab",
            label: "Airbnb Net Income",
            min: 0,
            max: 60_000,
            step: 1000,
            fmt: (v) => fmtK(v) + "/yr",
          },
          {
            k: "ssb",
            label: "Social Security Benefit",
            min: 0,
            max: 50_000,
            step: 500,
            fmt: (v) => fmtK(v) + "/yr",
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k] || 0}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
        {[
          {
            k: "ssAge",
            label: "SS Start Age",
            min: 62,
            max: 70,
            step: 1,
            fmt: (v) => "Age " + v,
          },
          {
            k: "abReliability",
            label: "Airbnb Reliability",
            min: 0,
            max: 100,
            step: 5,
            fmt: (v) => v + "%",
          },
          {
            k: "abGrowth",
            label: "Airbnb Growth Rate",
            min: 0,
            max: 10,
            step: 0.5,
            fmt: (v) => v + "%/yr",
          },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              {s.label}
            </div>
            <Slider
              label=""
              value={values[s.k] || 0}
              min={s.min}
              max={s.max}
              step={s.step}
              format={s.fmt}
              onChange={(v) => onChange(s.k, v)}
            />
          </div>
        ))}
      </div>

      {/* Total income at retirement */}
      <div
        style={{
          background: "linear-gradient(135deg, #05966918, #0ea5e918)",
          border: "1px solid #05966944",
          borderRadius: 10,
          padding: 18,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
          🏖️ Total Income at Retirement (Pre-Tax)
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 900,
            color: "#34d399",
            fontFamily: "'DM Mono',monospace",
            lineHeight: 1,
          }}
        >
          {fmtK(totalRetirementIncome)}
          <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>
            /yr
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 20,
            marginTop: 12,
            fontSize: 12,
            color: "#64748b",
          }}
        >
          <span>🏖 Airbnb: {fmtK(ab)}</span>
          <span>
            🏛 SS: {fmtK(ssb)} @ age {values.ssAge || 64}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginTop: 8 }}>
          Airbnb reliability: {values.abReliability || 80}% · Growth:{" "}
          {values.abGrowth || 3}%/yr
        </div>
      </div>
    </div>
  );
}

export default function AiRAForecaster() {
  const [mode, setMode] = useState("vin");
  const [activeTab, setTab] = useState("scenarios");
  const [running, setRunning] = useState(false);
  const [stale, setStale] = useState(false);
  const [r85, setR85] = useState(null);
  const [r90, setR90] = useState(null);
  const [stress, setStress] = useState(null);
  const isFirst = useRef(true);

  const prof = PROFILES[mode];
  const [port, setPort] = useState(prof.port);
  const [contrib, setContrib] = useState(prof.contrib);
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
  const [twoHousehold, setTwoHousehold] = useState(true);

  const [assumptions, setAssumptions] = useState({
    dob: "1970-03-14",
    abReliability: 80,
    abGrowth: 3.0,
    ssCola: 2.4,
    preRetireEq: 91,
    postRetireEq: 70,
    hcShockAge: 72,
    hcProb: 3.5,
    hcMin: 70_000,
    hcMax: 130_000,
    ab: 20_000,
    ssb: 31_543,
  });
  const updateAssumption = useCallback(
    (key, val) => setAssumptions((prev) => ({ ...prev, [key]: val })),
    []
  );

  const currentAge = useMemo(() => {
    try {
      const d = new Date(assumptions.dob);
      if (isNaN(d)) return prof.currentAge;
      return Math.floor((new Date() - d) / (365.25 * 24 * 3600 * 1000));
    } catch {
      return prof.currentAge;
    }
  }, [assumptions.dob, prof.currentAge]);

  const DDAY_dynamic = useMemo(() => {
    try {
      const d = new Date(assumptions.dob);
      if (isNaN(d)) return new Date("2030-03-14T00:00:00");
      return new Date(d.getFullYear() + retAge, d.getMonth(), d.getDate());
    } catch {
      return new Date("2030-03-14T00:00:00");
    }
  }, [assumptions.dob, retAge]);

  const days = Math.max(0, Math.floor((DDAY_dynamic - new Date()) / 86400000));
  const countdown = useCountdown(DDAY_dynamic);

  const switchMode = useCallback((m) => {
    setMode(m);
    const p = PROFILES[m];
    setPort(p.port);
    setContrib(p.contrib);
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
    setTwoHousehold(true);
    setR85(null);
    setR90(null);
    setStress(null);
    setStale(false);
  }, []);

  const params = useMemo(
    () => ({
      currentAge: prof.currentAge,
      retireAge: retAge,
      endAge,
      port,
      contrib,
      inf,
      sp: twoHousehold ? sp : prof.spThailand,
      ssAge,
      ssb,
      ab,
      useAb,
      smile,
      tax,
      real,
      gkFloor: twoHousehold ? prof.gkFloor : prof.gkFloorThailand,
      gkCeiling: prof.gkCeiling,
      mortBalance: prof.mortBalance,
      mortRate: prof.mortRate,
      mortStart: prof.mortStart,
      mortTerm: prof.mortTerm,
      mortExtra: prof.mortExtra,
      reHarrington: prof.reHarrington,
      reOrlando105: prof.reOrlando105,
      reOrlando306: prof.reOrlando306,
      twoHousehold,
      currentAge,
      abReliability: assumptions.abReliability,
      abGrowth: assumptions.abGrowth,
      ssCola: assumptions.ssCola,
      preRetireEq: assumptions.preRetireEq,
      postRetireEq: assumptions.postRetireEq,
      hcShockAge: assumptions.hcShockAge,
      hcProb: assumptions.hcProb,
      hcMin: assumptions.hcMin,
      hcMax: assumptions.hcMax,
    }),
    [
      prof,
      retAge,
      endAge,
      port,
      contrib,
      inf,
      sp,
      ssAge,
      ssb,
      ab,
      useAb,
      smile,
      tax,
      real,
      twoHousehold,
      assumptions,
      currentAge,
    ]
  );

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (r85 || r90) setStale(true);
  }, [params]);

  const swr = ((params.sp / port) * 100).toFixed(1);

  const runSimulation = useCallback(() => {
    setRunning(true);
    setStale(false);
    setTimeout(() => {
      const r85_ = runMC(params, 85, 3000, 42, true);
      const r90_ = runMC(params, 90, 3000, 43, true);
      const str = runStress(params, params.endAge, 2000, 99);
      setR85(r85_);
      setR90(r90_);
      setStress(str);
      setRunning(false);
      setTab("montecarlo");
    }, 40);
  }, [params]);

  const analogue = r90 ? getAnalogue(r90.rate) : null;

  const TABS = [
    ["scenarios", "🎯 Scenarios"],
    ["income", "💵 Income"],
    ["montecarlo", "🎲 Monte Carlo"],
    ["mortgage", "🏠 Mortgage"],
    ["networth", "📊 Net Worth"],
    ["actionplan", "✅ Action Plan"],
    ["assumptions", "⚙️ Assumptions"],
  ];

  const needsMC = ["montecarlo", "networth", "fan"];
  const hasMC = !!r90;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="hdr">
          <div>
            <div className="logo">
              AiRA <span className="logo-sub">Freedom Financial</span>
            </div>
            <div style={{ fontSize: 10, color: "#334155" }}>
              v5.1 · All bugs fixed · GK Guardrails · 80% Airbnb reliability ·
              Healthcare shock · 3,000 paths
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {Object.entries(PROFILES).map(([k, v]) => (
              <button
                key={k}
                className={`mbtn ${
                  mode === k ? (k === "demo" ? "demo-on" : "on") : ""
                }`}
                onClick={() => switchMode(k)}
              >
                {k === "demo" ? "🎬 " : "👤 "}
                {v.label}
              </button>
            ))}
            <div
              style={{
                width: 1,
                height: 20,
                background: "rgba(255,255,255,0.1)",
                margin: "0 4px",
              }}
            />
            <button
              className="mbtn"
              title="Export profile to JSON"
              onClick={() =>
                exportProfile({
                  ...assumptions,
                  retireAge: retAge,
                  endAge,
                  port,
                  contrib,
                  sp,
                  ssAge,
                  ssb,
                  ab,
                })
              }
            >
              ⬇ Export
            </button>
            <button
              className="mbtn"
              title="Import profile from JSON"
              onClick={() =>
                importProfile((data) => {
                  if (data.retireAge) setRetAge(data.retireAge);
                  if (data.endAge) setEndAge(data.endAge);
                  if (data.port) setPort(data.port);
                  if (data.contrib) setContrib(data.contrib);
                  if (data.sp) setSp(data.sp);
                  if (data.ssAge) setSsAge(data.ssAge);
                  if (data.ssb) setSsb(data.ssb);
                  if (data.ab) setAb(data.ab);
                  [
                    "dob",
                    "abReliability",
                    "abGrowth",
                    "ssCola",
                    "preRetireEq",
                    "postRetireEq",
                    "hcShockAge",
                    "hcProb",
                    "hcMin",
                    "hcMax",
                  ].forEach((k) => {
                    if (data[k] !== undefined) updateAssumption(k, data[k]);
                  });
                  setStale(true);
                })
              }
            >
              ⬆ Import
            </button>
            <a
              href="https://buymeacoffee.com/vincentplansfreedom"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 13px",
                borderRadius: 7,
                border: "1px solid rgba(255,193,7,0.4)",
                background: "rgba(255,193,7,0.08)",
                color: "#fbbf24",
                fontSize: 11,
                fontFamily: "'DM Sans',sans-serif",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,193,7,0.18)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,193,7,0.08)")
              }
            >
              ☕ Buy me a coffee
            </a>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#14b8a6",
                fontFamily: "'DM Mono',monospace",
              }}
            >
              {days.toLocaleString()}
            </div>
            <div
              style={{ fontSize: 9, color: "#334155" }}
            >{`days · ${DDAY_dynamic.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`}</div>
          </div>
        </div>
        <div className="layout">
          <div className="sidebar">
            <div className="sb-card">
              <div className="sb-title">D-Day Countdown</div>
              <div className="countdown-grid">
                {[
                  { v: countdown.days, l: "DAYS" },
                  { v: countdown.hours, l: "HRS" },
                  { v: countdown.mins, l: "MIN" },
                  { v: countdown.secs, l: "SEC" },
                ].map((u) => (
                  <div key={u.l} className="cd-unit">
                    <div className="cd-val">{String(u.v).padStart(2, "0")}</div>
                    <div className="cd-lbl">{u.l}</div>
                  </div>
                ))}
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${countdown.pct}%` }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9,
                  color: "#334155",
                  marginTop: 3,
                }}
              >
                <span>Mar 2, 2026 (Alpha start)</span>
                <span style={{ color: "#5eead4", fontWeight: 600 }}>
                  {countdown.pct}%
                </span>
              </div>
            </div>
            <div className="sb-card">
              <div className="sb-title">MC Engine — v5.1</div>
              <div style={{ fontSize: 9, color: "#475569", lineHeight: 1.8 }}>
                <div>
                  📈 <span style={{ color: "#5eead4" }}>Equity:</span> 99yr S&P
                  bootstrap [-30/+30%]
                </div>
                <div>
                  📊 <span style={{ color: "#a78bfa" }}>Bonds:</span> 50yr
                  Bloomberg [-15/+20%]
                </div>
                <div>
                  🛡️ <span style={{ color: "#fbbf24" }}>GK Floor:</span>{" "}
                  {fmtM(params.gkFloor)} · Ceiling {fmtM(params.gkCeiling)}
                </div>
                <div>
                  🏖 <span style={{ color: "#059669" }}>Airbnb:</span> 80%
                  reliability per year
                </div>
                <div>
                  🏥 <span style={{ color: "#f87171" }}>Healthcare:</span> 3.5%
                  shock risk age 72+
                </div>
                <div>
                  💹 <span style={{ color: "#14b8a6" }}>Phase 1 (91/9):</span>{" "}
                  {CALIB.phase1Mean}% μ
                </div>
                <div>
                  💹 <span style={{ color: "#fb923c" }}>Phase 2 (70/30):</span>{" "}
                  {CALIB.phase2Mean}% μ
                </div>
              </div>
            </div>
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
              <Toggle
                val={twoHousehold}
                onChange={setTwoHousehold}
                label="🏠🌴 Two households · Vin TH / Mira NJ"
                accent="#a78bfa"
              />
            </div>
            <button
              className="run-btn"
              onClick={runSimulation}
              disabled={running}
              style={{
                background: stale
                  ? "linear-gradient(135deg,#b45309,#d97706)"
                  : undefined,
              }}
            >
              {running
                ? "Running 6,000 paths..."
                : stale
                ? "⚠ Inputs changed — Re-run"
                : "▶ Run Monte Carlo"}
            </button>
            <div style={{ fontSize: 9, color: "#334155", textAlign: "center" }}>
              3,000 × age 85 · 3,000 × age 90 · GK guardrails · 80% Airbnb ·
              healthcare shocks
            </div>
          </div>
          <div className="main">
            <div className="flag-w">
              ⚠ NJ domicile — establish FL residency before Dec 31, 2030 · Roth
              ladder saves ~$50,575 vs NJ
            </div>
            <div className="flag-w">
              ⚠ SS gap Jan 2031 → Mar 2034 — zero SS for 3 years · highest-risk
              window
            </div>
            <div className="flag-i">
              🛡 GK active · WR {swr}% ·{" "}
              {twoHousehold ? "Both households" : "Vin solo"} · Airbnb 80%
              reliable · Healthcare shocks modeled
            </div>
            {stale && (
              <div
                style={{
                  background: "rgba(180,83,9,0.12)",
                  border: "1px solid rgba(217,119,6,0.4)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 12,
                  color: "#fbbf24",
                }}
              >
                ⚠ Inputs changed — success rates below are stale. Press Re-run
                to update.
              </div>
            )}
            <div className="metrics">
              <div className="met">
                <div className="ml">Success to 85</div>
                <div
                  className="mv"
                  style={{
                    color: r85
                      ? r85.rate >= 0.85
                        ? "#0d9488"
                        : r85.rate >= 0.7
                        ? "#f59e0b"
                        : "#ef4444"
                      : "#334155",
                  }}
                >
                  {r85 ? fmtPct(r85.rate) : "—"}
                </div>
                <div className="ms">3,000 paths · GK</div>
              </div>
              <div className="met">
                <div className="ml">Success to 90</div>
                <div
                  className="mv"
                  style={{
                    color: r90
                      ? r90.rate >= 0.85
                        ? "#0d9488"
                        : r90.rate >= 0.7
                        ? "#f59e0b"
                        : "#ef4444"
                      : "#334155",
                  }}
                >
                  {r90 ? fmtPct(r90.rate) : "—"}
                </div>
                <div className="ms">3,000 paths · GK</div>
              </div>
              <div className="met">
                <div className="ml">Portfolio at D-Day</div>
                <div className="mv" style={{ color: "#94a3b8", fontSize: 18 }}>
                  {r90 ? fmtM(r90.medR) : "—"}
                </div>
                <div className="ms">Median projected</div>
              </div>
              <div className="met">
                <div className="ml">Withdrawal rate</div>
                <div
                  className="mv"
                  style={{
                    color:
                      +swr <= 3
                        ? "#0d9488"
                        : +swr <= 4
                        ? "#34d399"
                        : +swr <= 5
                        ? "#f59e0b"
                        : "#ef4444",
                    fontSize: 20,
                  }}
                >
                  {swr}%
                </div>
                <div className="ms">4% = safe benchmark</div>
              </div>
            </div>
            {analogue && (
              <div
                className="analogue"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  {analogue.emoji} "{analogue.text}." — {fmtPct(r90.rate)} to
                  age {endAge}.
                </span>
                <SectorBadge age={prof.currentAge} />
              </div>
            )}
            {r90 &&
              (() => {
                const success = Math.round(r90.rate * 26);
                const fail = 26 - success;
                return (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 10,
                      padding: "12px 16px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#64748b",
                        marginBottom: 8,
                      }}
                    >
                      If 26 people had your exact plan — age {endAge} horizon
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginBottom: 8,
                      }}
                    >
                      {Array.from({ length: 26 }, (_, i) => (
                        <div
                          key={i}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: i < success ? "#0d9488" : "#ef4444",
                            opacity: i < success ? 1 : 0.4,
                            title: i < success ? "Survives" : "Depleted",
                          }}
                        />
                      ))}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        <span style={{ color: "#0d9488", fontWeight: 700 }}>
                          {success}
                        </span>{" "}
                        make it to {endAge}.{" "}
                        {fail > 0 && (
                          <>
                            {" "}
                            <span style={{ color: "#ef4444", fontWeight: 700 }}>
                              {fail}
                            </span>{" "}
                            run out.
                          </>
                        )}
                        {fail === 0 && (
                          <span style={{ color: "#34d399" }}>
                            {" "}
                            Everyone makes it.
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#334155",
                          fontStyle: "italic",
                        }}
                      >
                        100% doesn't exist — room for error IS the plan. —
                        Morgan Housel
                      </div>
                    </div>
                  </div>
                );
              })()}
            <div className="gk-bar">
              <strong style={{ color: "#5eead4" }}>GK Guardrails:</strong> Floor{" "}
              {fmtM(params.gkFloor)} (
              {twoHousehold ? "both households" : "Vin solo"}) · Ceiling{" "}
              {fmtM(params.gkCeiling)} · Initial WR {swr}%. Airbnb modeled at
              80% reliability. Healthcare shocks 3.5%/yr from age 72. As Bill
              Perkins says — spend in the right life phase. 🌴
            </div>
            <div className="tabs">
              {TABS.map(([k, l]) => (
                <button
                  key={k}
                  className={`tab ${activeTab === k ? "on" : ""}`}
                  onClick={() => setTab(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            {needsMC.includes(activeTab) && !hasMC ? (
              <div
                className="chart-card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 260,
                  color: "#475569",
                }}
              >
                Press ▶ Run Monte Carlo to generate charts.
              </div>
            ) : (
              <>
                {activeTab === "fan" && r90 && (
                  <FanChart
                    pcts={r90.pcts}
                    retireAge={retAge}
                    ssAge={ssAge}
                    inf={inf}
                    useReal={real}
                    title={`Portfolio fan · age ${endAge} · 3,000 paths`}
                  />
                )}
                {activeTab === "montecarlo" && (
                  <>
                    <MCTab
                      params={params}
                      r85={r85}
                      r90={r90}
                      stress={stress}
                      running={running}
                      onRun={runSimulation}
                    />
                    {r90 && (
                      <FanChart
                        pcts={r90.pcts}
                        retireAge={retAge}
                        ssAge={ssAge}
                        inf={inf}
                        useReal={real}
                        title={`Portfolio fan · age ${endAge} · 3,000 paths`}
                      />
                    )}
                  </>
                )}
                {activeTab === "scenarios" && (
                  <ScenariosTab
                    baseParams={params}
                    r85={r85}
                    r90={r90}
                    stress={stress}
                    running={running}
                    runSimulation={runSimulation}
                    retAge={retAge}
                    ssAge={ssAge}
                    inf={inf}
                    real={real}
                    endAge={endAge}
                    fmtPct={fmtPct}
                    fmtM={fmtM}
                    FanChart={FanChart}
                    SEQ_2000_2012={SEQ_2000_2012}
                    DeterministicGKView={DeterministicGKView}
                    RothLadder={RothLadder}
                    BucketsTab={BucketsTab}
                    SmileChart={SmileChart}
                  />
                )}
                {activeTab === "income" && <IncomeMap p={params} inf={inf} />}
                {activeTab === "mortgage" && (
                  <MortgageTab prof={PROFILES[mode]} />
                )}
                {activeTab === "networth" && (
                  <NetWorthTab p={params} results90={r90} inf={inf} />
                )}
                {activeTab === "actionplan" && <ActionPlanTab />}
                {activeTab === "assumptions" && (
                  <ProfileWizard
                    values={{
                      ...assumptions,
                      currentAge,
                      retireAge: retAge,
                      endAge,
                      port,
                      contrib,
                      sp,
                      ssAge,
                      ssb,
                      ab,
                    }}
                    onChange={(k, v) => {
                      updateAssumption(k, v);
                      // also wire to main sliders
                      if (k === "retireAge") setRetAge(v);
                      if (k === "endAge") setEndAge(v);
                      if (k === "port") setPort(v);
                      if (k === "contrib") setContrib(v);
                      if (k === "sp") setSp(v);
                      if (k === "ssAge") setSsAge(v);
                      if (k === "ssb") setSsb(v);
                      if (k === "ab") setAb(v);
                    }}
                  />
                )}
              </>
            )}
            <div
              style={{
                fontSize: 9,
                color: "#1e3a5f",
                textAlign: "center",
                paddingTop: 4,
                lineHeight: 1.6,
              }}
            >
              AiRA Freedom Financial v5.1 · 6 bugs fixed · GK guardrails · 80%
              Airbnb reliability · Healthcare shocks · Historical bootstrap 99yr
              S&P + 50yr Bloomberg · MFJ throughout · Not financial advice
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
