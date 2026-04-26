// ─────────────────────────────────────────────────────────────
//  AiRA About Content
//  Edit this file to update the About modal — no JSX required.
// ─────────────────────────────────────────────────────────────

export const ABOUT_ME = {
  name:    "Your Name",
  tagline: "Investor · Builder · Freedom Seeker",
  // 2–4 sentences. Plain text only.
  bio: "I built AiRA because I couldn't find a retirement planner that spoke the language of a real DIY investor — one that accounts for rental income, Roth conversions, sequence-of-returns risk, and the nuance of spending less abroad. This tool is the one I wished existed when I started planning my own exit. I share everything I learn about financial independence and early retirement on my channel — subscribe if you want the unfiltered version.",
  // Set url: "" to hide a link entirely.
  links: [
    { icon: "▶️", label: "YouTube Channel",  url: "https://youtube.com/@yourchannel" },
    { icon: "🐦", label: "Twitter / X",       url: "" },
    { icon: "💼", label: "LinkedIn",           url: "" },
    { icon: "📧", label: "Email me",           url: "mailto:you@example.com" },
    { icon: "☕", label: "Buy me a coffee",    url: "https://buymeacoffee.com/yourpage" },
  ],
};

export const ABOUT_PRODUCT = {
  name:        "AiRA Freedom Financial",
  tagline:     "A DIY retirement planner built for the modern retiree.",
  // Shown at the top of the "How It Works" tab as orientation text.
  intro: "AiRA simulates thousands of possible retirement futures so you can stress-test your plan before you need it. Here's how the key pieces fit together — start with your profile, run the Monte Carlo, then use the withdrawal table to inspect individual years.",
  description: "AiRA runs 3,000 stochastic Monte Carlo paths using 99 years of S&P 500 data and 50 years of bond returns, layered with real historical inflation. Every dollar on screen is traceable to a formula — no magic numbers, no black boxes. It models 10 withdrawal strategies, Roth conversion optimization, IRMAA cliffs, RMDs, rental income reliability, healthcare shocks, and a Blanchett spending smile. The deterministic schedule and MC engine are kept in sync so your year-by-year plan always matches the probabilistic output.",
  bullets: [
    "3,000-path Monte Carlo with bootstrap historical returns",
    "10 withdrawal strategies (GK, Fixed %, VPW, CAPE, Endowment, and more)",
    "Roth conversion explorer with bracket-fill optimization",
    "Property rental income, IRMAA, RMDs, and healthcare shock modeling",
    "Deterministic year-by-year withdrawal schedule",
    "Solo Mode for out-of-state / abroad spending scenarios",
    "Export / import JSON profiles — your data stays local",
  ],
};

// ─────────────────────────────────────────────────────────────
//  Feature explanations shown in the "How It Works" tab.
//
//  group: one of "Getting Started" | "Withdrawal Strategies" |
//          "Your Properties" | "Reading the Charts"
//         (or any new label you add — it auto-creates a section)
//
//  Add a new entry here to add a new card. Order within a group
//  follows the array order below.
// ─────────────────────────────────────────────────────────────
export const ABOUT_FEATURES = [
  // ── Getting Started ──────────────────────────────────────
  {
    id:    "solo-mode",
    group: "Getting Started",
    icon:  "🌴",
    title: "Solo Mode",
    body:  "Switches the simulation to your out-of-state spending budget and removes state income tax. Toggle OFF = primary spending + state tax. Toggle ON = out-of-state spending + no state tax. The portfolio withdrawal math (GK guardrails, Fixed %, etc.) is identical either way — only the spending target and whether state tax is applied changes. Set your out-of-state budget in Profile → Spending. If left at $0 it falls back to your primary spending.",
  },
  {
    id:    "ss-storage",
    group: "Getting Started",
    icon:  "🧾",
    title: "Social Security Input",
    body:  "SS is stored as an annual amount internally. The input field shows and accepts monthly dollars — enter your expected monthly benefit and the app stores it as annual (×12). If your exported JSON shows a low number like 2742 but you expected $2,742/month, correct it in Profile → Retirement Plan by entering 2742 in the monthly field.",
  },

  // ── Withdrawal Strategies ─────────────────────────────────
  {
    id:    "fixed-strategy",
    group: "Withdrawal Strategies",
    icon:  "📌",
    title: "Fixed % Withdrawal",
    body:  "Withdraws a constant percentage of the portfolio each year (default 4%). Portfolio draw = rate × portfolio. Social Security and rental income are additive on top — they do NOT reduce the draw. This differs from GK, Vanguard, and all other strategies where guaranteed income offsets how much you pull from the portfolio.",
  },
  {
    id:    "gk-strategy",
    group: "Withdrawal Strategies",
    icon:  "🛡",
    title: "Guyton-Klinger Guardrails",
    body:  "Your spending adapts based on portfolio performance. If the withdrawal rate climbs above 120% of the initial rate, spending cuts 10% (never below the floor). If it falls below 80%, spending rises 10% (never above the ceiling). Floor = 65% and ceiling = 135% of your target spending. Protects against sequence-of-returns risk while letting you spend more in good markets.",
  },

  // ── Your Properties ───────────────────────────────────────
  {
    id:    "property-income",
    group: "Your Properties",
    icon:  "🏠",
    title: "Property Rental Income",
    body:  "Income entered in each property's Income field flows automatically into all simulations. It grows at your Rental Growth Rate and is always included regardless of the Rental Income toggle (which controls separately-entered Airbnb / short-term income). The Rental column in the withdrawal table shows both sources combined.",
  },

  // ── Reading the Charts ────────────────────────────────────
  {
    id:    "reassess-trigger",
    group: "Reading the Charts",
    icon:  "🎯",
    title: "Reassess & Trigger Lines",
    body:  "Two milestone lines on the MC fan chart. Reassess (amber) is your minimum viable number — when the median path crosses it, the plan works mathematically. Trigger (purple) is your early-exit permission slip — a pre-set number where you retire immediately regardless of your original timeline. Set Trigger higher than Reassess. Toggle them off to declutter the chart.",
  },
];
