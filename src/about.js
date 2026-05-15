// ─────────────────────────────────────────────────────────────
//  AiRA About Content
//  Edit this file to update the About modal — no JSX required.
// ─────────────────────────────────────────────────────────────

export const ABOUT_ME = {
  name:    "TiredToRetire.com/AiRA",
  tagline: "Investor · Builder · Freedom Seeker",
  // 2–4 sentences. Plain text only.
  bio: "I built AiRA because I couldn't find a retirement planner that spoke the language of a real DIY investor — one that accounts for rental income, Roth conversions, sequence-of-returns risk, and the nuance of spending less abroad. This tool is the one I wished existed when I started planning my own exit. I share everything I learn about financial independence and early retirement on my channel — subscribe if you want the unfiltered version.",
  // Set url: "" to hide a link entirely.
  links: [
    { icon: "▶️", label: "YouTube Channel",  url: "https://youtube.com/@vincentplansfreedom" },
    { icon: "🐦", label: "Instagram",       url: "https://www.instagram.com/tiredtoretire/" },
    { icon: "☕", label: "Buy me a coffee",    url: "https://buymeacoffee.com/vincentplansfreedom" },
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
    {
    id:    "checkpoints",
    group: "Reading the Charts",
    icon:  "🎯",
    title: "What are Checkpoints?",
    body:  `Checkpoints let you compare your actual portfolio against AiRA's Monte Carlo projections over time. Add a date and portfolio value, and the app instantly shows whether you're ahead, on track, or behind relative to thousands of simulated paths.<br/><br/>
          Each checkpoint is color‑coded:<br/>
          • <span style="color:#10b981;">Green</span> – at or above the median forecast<br/>
          • <span style="color:#fbbf24;">Yellow</span> – between the 25th and 50th percentile<br/>
          • <span style="color:#ef4444;">Red</span> – below the 25th percentile<br/><br/>
          This isn't just a status check. It's the foundation of adaptive distribution planning, a framework championed by financial planner Michael Kitces. Instead of blindly following a withdrawal plan made years ago, you adjust based on how your portfolio is actually performing. If you're in the green, you might spend a little more. In the red, you tighten up. Over time, checkpoints build a living history of your financial journey, turning a static retirement plan into a responsive roadmap. You're not guessing whether you're still on track—you're measuring it, one checkpoint at a time.`,
     },
  // ── Tax Modeling ──────────────────────────────────────────
  {
    id:    "tax-treatment-matrix",
    group: "Tax Modeling",
    icon:  "📊",
    title: "Tax Treatment by Account Type",
    body:  `<style>
.ttm-sub{font-size:11px;color:#475569;margin-bottom:1.2rem}
.ttm-label{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#475569;margin:1.2rem 0 .5rem}
.ttm-acct-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:1.2rem}
.ttm-acct-card{background:#182038;border-radius:9px;border:.5px solid rgba(96,165,250,0.12);padding:10px 12px}
.ttm-acct-name{font-weight:600;font-size:12px;color:#e2e8f0;margin-bottom:4px}
.ttm-acct-detail{font-size:11px;color:#94a3b8;line-height:1.55}
.ttm-scroll{overflow-x:auto;margin-bottom:1.2rem;border-radius:8px}
.ttm-matrix{width:100%;border-collapse:collapse;min-width:480px}
.ttm-matrix th{font-size:10px;font-weight:500;color:#94a3b8;text-align:left;padding:6px 9px;border-bottom:1px solid rgba(96,165,250,0.12);white-space:nowrap}
.ttm-matrix td{font-size:11px;padding:6px 9px;border-bottom:.5px solid rgba(96,165,250,0.08);vertical-align:middle;color:#e2e8f0}
.ttm-matrix tr:last-child td{border-bottom:none}
.ttm-matrix .ttm-rl{font-weight:500;color:#94a3b8;font-size:11px}
.ttm-matrix .ttm-col-tax{background:rgba(96,165,250,0.04)}
.ttm-note{font-size:10px;color:#475569;margin-top:2px}
.ttm-pill{display:inline-block;padding:1px 7px;border-radius:7px;font-size:10px;font-weight:500;white-space:nowrap;margin:1px 0}
.ttm-r0{background:#0f3d2a;color:#34d39a}
.ttm-rl2{background:#1a3a10;color:#7dca4a}
.ttm-rm{background:#3a2a0a;color:#f59e0b}
.ttm-rh{background:#3a1a0a;color:#f97316}
.ttm-rx{background:#3a0a0a;color:#f87171}
.ttm-rn{background:#1e2d4d;color:#475569}
.ttm-legend{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:.9rem}
.ttm-flag{background:rgba(239,159,39,0.08);border-left:3px solid #EF9F27;border-radius:0 7px 7px 0;padding:9px 13px;margin-bottom:8px;font-size:11px;color:#e2e8f0;line-height:1.6}
.ttm-warn{background:rgba(226,75,74,0.08);border-left:3px solid #E24B4A;border-radius:0 7px 7px 0;padding:9px 13px;margin-bottom:8px;font-size:11px;color:#e2e8f0;line-height:1.6}
</style>
<p class="ttm-sub">How the IRS treats each dollar depending on where it lives — federal rules. State treatment varies; check your domicile.</p>

<p class="ttm-label">The four buckets</p>
<div class="ttm-acct-grid">
  <div class="ttm-acct-card">
    <div class="ttm-acct-name">Taxable brokerage</div>
    <div class="ttm-acct-detail">After-tax contributions. Dividends and interest taxed each year. Gains taxed at sale. Most flexible — but most tax-exposed bucket.</div>
  </div>
  <div class="ttm-acct-card">
    <div class="ttm-acct-name">Pre-tax 401k / IRA</div>
    <div class="ttm-acct-detail">Pre-tax contributions. Grows tax-deferred. Every dollar withdrawn is ordinary income — no capital gains treatment, ever.</div>
  </div>
  <div class="ttm-acct-card">
    <div class="ttm-acct-name">Roth IRA</div>
    <div class="ttm-acct-detail">After-tax contributions. Grows tax-free. Qualified withdrawals (age 59½ + 5-year rule) are 0% federal. No RMDs.</div>
  </div>
  <div class="ttm-acct-card">
    <div class="ttm-acct-name">HSA</div>
    <div class="ttm-acct-detail">Pre-tax contributions. Tax-free growth and withdrawal for qualified medical. After 65 non-medical use = ordinary income, like a 401k.</div>
  </div>
</div>

<p class="ttm-label">How income type maps to tax rate — by bucket</p>
<div class="ttm-legend">
  <span class="ttm-pill ttm-r0">0%</span>
  <span class="ttm-pill ttm-rl2">low &lt;10%</span>
  <span class="ttm-pill ttm-rm">mid 10–20%</span>
  <span class="ttm-pill ttm-rh">high 20–35%</span>
  <span class="ttm-pill ttm-rx">max 35%+</span>
  <span class="ttm-pill ttm-rn">N/A</span>
</div>
<div class="ttm-scroll">
<table class="ttm-matrix">
<thead><tr>
  <th style="width:22%">Income type</th>
  <th style="width:22%" class="ttm-col-tax">Taxable brokerage<br><span class="ttm-note">(federal · state varies)</span></th>
  <th style="width:20%">Pre-tax 401k / IRA<br><span class="ttm-note">at withdrawal</span></th>
  <th style="width:18%">Roth IRA<br><span class="ttm-note">qualified</span></th>
  <th style="width:18%">HSA<br><span class="ttm-note">qual. medical</span></th>
</tr></thead>
<tbody>
<tr>
  <td class="ttm-rl">Long-term cap gains<br><span class="ttm-note">assets held &gt;1 year</span></td>
  <td class="ttm-col-tax">
    <span class="ttm-pill ttm-r0">0% fed</span> lower incomes<br>
    <span class="ttm-pill ttm-rm">15% fed</span> middle incomes<br>
    <span class="ttm-pill ttm-rh">20% fed</span> high incomes<br>
    <span class="ttm-pill ttm-rm">+NIIT 3.8%</span> high MAGI<br>
    <span class="ttm-note">State: some follow fed LTCG rates; others tax as ordinary income</span>
  </td>
  <td><span class="ttm-pill ttm-rh">ordinary income</span><br><span class="ttm-note">No LTCG treatment — ever. All withdrawals = wages equivalent.</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span><br><span class="ttm-note">No tax event inside or at withdrawal.</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span><br><span class="ttm-note">No tax event if qualified medical.</span></td>
</tr>
<tr>
  <td class="ttm-rl">Qualified dividends<br><span class="ttm-note">most US stocks, ETFs</span></td>
  <td class="ttm-col-tax">
    <span class="ttm-pill ttm-r0">0% fed</span> lower incomes<br>
    <span class="ttm-pill ttm-rm">15% fed</span> middle incomes<br>
    <span class="ttm-note">Same thresholds as LTCG · state varies</span>
  </td>
  <td><span class="ttm-pill ttm-rh">ordinary income</span><br><span class="ttm-note">Reinvested inside — tax-deferred until withdrawal.</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span><br><span class="ttm-note">Compounds tax-free.</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
</tr>
<tr>
  <td class="ttm-rl">Ordinary dividends<br><span class="ttm-note">REITs, non-qualified</span></td>
  <td class="ttm-col-tax">
    <span class="ttm-pill ttm-rh">ordinary income fed</span><br>
    <span class="ttm-note">No preferential rate · state tax on top</span>
  </td>
  <td><span class="ttm-pill ttm-rh">ordinary income</span><br><span class="ttm-note">Deferred — paid at withdrawal, not now.</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
</tr>
<tr>
  <td class="ttm-rl">Interest income<br><span class="ttm-note">bonds, T-bills, CDs</span></td>
  <td class="ttm-col-tax">
    <span class="ttm-pill ttm-rh">ordinary income fed</span><br>
    <span class="ttm-note">US Treasuries: state-exempt · state varies for other instruments</span>
  </td>
  <td><span class="ttm-pill ttm-rh">ordinary income</span><br><span class="ttm-note">Deferred until withdrawal.</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
</tr>
<tr>
  <td class="ttm-rl">Short-term cap gains<br><span class="ttm-note">assets held ≤1 year</span></td>
  <td class="ttm-col-tax">
    <span class="ttm-pill ttm-rx">ordinary income fed</span><br>
    <span class="ttm-note">No preferential rate. Worst tax outcome in this bucket.</span>
  </td>
  <td><span class="ttm-pill ttm-rh">ordinary income</span><br><span class="ttm-note">Deferred.</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
</tr>
<tr>
  <td class="ttm-rl">Return of capital<br><span class="ttm-note">options-income funds</span></td>
  <td class="ttm-col-tax">
    <span class="ttm-pill ttm-r0">0% now</span><br>
    <span class="ttm-note">Reduces cost basis. Taxed as LTCG or STCG at sale — deferred, not forgiven.</span>
  </td>
  <td><span class="ttm-pill ttm-rn">irrelevant</span><br><span class="ttm-note">Everything = ordinary income at withdrawal regardless.</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
  <td><span class="ttm-pill ttm-r0">0%</span></td>
</tr>
<tr>
  <td class="ttm-rl">Withdrawal / distribution<br><span class="ttm-note">spending in retirement</span></td>
  <td class="ttm-col-tax">
    <span class="ttm-pill ttm-r0">basis: 0%</span><br>
    <span class="ttm-pill ttm-rl2">gains: LTCG rate</span>
  </td>
  <td>
    <span class="ttm-pill ttm-rh">ordinary income</span><br>
    <span class="ttm-note">Stacks with SS, RMDs. State treatment varies widely.</span>
  </td>
  <td><span class="ttm-pill ttm-r0">0% federal</span><br><span class="ttm-note">Most states follow federal treatment.</span></td>
  <td>
    <span class="ttm-pill ttm-r0">0% if medical</span><br>
    <span class="ttm-pill ttm-rh">ordinary if non-medical</span>
  </td>
</tr>
</tbody>
</table>
</div>

<div class="ttm-warn"><strong>The "taxable first" rule only applies if you have a taxable brokerage.</strong> If your portfolio is entirely pre-tax (traditional IRA/401k), Roth, and HSA, there are no long-term gains to harvest at preferential rates. Pre-tax withdrawals are always ordinary income — the account wrapper, not the underlying holding, determines the tax rate.</div>
<div class="ttm-flag"><strong>State domicile changes the math significantly.</strong> States that tax capital gains as ordinary income eliminate the federal 0% LTCG advantage for taxable accounts. States with no income tax (such as FL, TX, or WA on most income) make taxable gains meaningfully cheaper. Your domicile decision before retirement is one of the highest-leverage tax moves available.</div>
<div class="ttm-flag"><strong>The pre-tax trap.</strong> Large traditional IRA / 401k balances generate forced ordinary income at RMD age, stacking with Social Security taxation and IRMAA surcharges. A Roth conversion ladder in the years before RMDs begin is the primary tool for reducing this exposure.</div>
<div class="ttm-flag"><strong>The optimal withdrawal order:</strong> Roth last (preserve tax-free compounding), HSA for medical (0% always), taxable next (LTCG rates), pre-tax bracketed to avoid crossing into a higher tier. This order minimizes lifetime taxes across all states.</div>`,
  },
  {
    id:    "tax-drag",
    group: "Tax Modeling",
    icon:  "🏛",
    title: "Tax Drag Adjustment",
    body:  `<strong style="color:#e2e8f0;">What is tax drag?</strong> Every dollar you withdraw from a pre-tax account is taxed as ordinary income before you can spend it. "Tax drag" is the gross-up factor AiRA applies so the after-tax cash you keep matches your stated annual spending. If your spend target is $80,000 and your effective drag is 10%, the engine pulls $88,000 from the portfolio so $80,000 lands in your pocket.<br/><br/>
            <strong style="color:#e2e8f0;">Why it varies by year:</strong> Tax exposure isn't flat across retirement. The drag percentage rises in three stages:<br/>
            • <strong>Before Social Security claims</strong> — lowest drag. You're living off taxable / Roth draws with no SS income on the return.<br/>
            • <strong>SS started, before RMDs</strong> — moderate drag. SS becomes partially taxable; provisional-income math starts to bite.<br/>
            • <strong>RMD age and beyond</strong> — highest drag. Forced pre-tax withdrawals stack with SS taxation and IRMAA exposure.<br/><br/>
            <strong style="color:#e2e8f0;">Filing status matters:</strong> Single filers see higher drag than MFJ at every stage — halved brackets and a halved standard deduction mean the same dollar of income hits a higher marginal rate sooner.<br/><br/>
            <strong style="color:#e2e8f0;">Toggle ON (default):</strong> Realistic mode. Withdrawals are grossed up so the spend number you entered is the after-tax amount you actually get to use. This is what you should leave on for any plan you intend to act on.<br/><br/>
            <strong style="color:#e2e8f0;">Toggle OFF:</strong> Pre-tax view. Useful for sanity-checking the underlying portfolio dynamics without tax noise, but it overstates how long your money lasts because Uncle Sam still takes his cut in real life.<br/><br/>
            <strong style="color:#e2e8f0;">Note:</strong> This is the engine's <em>simplified</em> drag model for the high-level success-rate view. The detailed year-by-year withdrawal schedule (and the Roth conversion explorer) compute exact federal + state + IRMAA tax using full progressive brackets — not the drag approximation.`,
  },
     {
    id:    "Tax ",
    group: "Roth Conversions",
    icon:  "🎯",
    title: "Using Tax Room",
    body:  `Tax Room is the amount of taxable income you can add in a given year without pushing yourself into a higher tax bracket. 
    AiRA's Roth conversion tool uses this concept to optimize how much of your traditional assets to convert each year, 
    aiming to fill up your current tax bracket without spilling into the next one. 
    By strategically using your Tax Room, you can minimize the total taxes paid over time 
    and maximize the amount growing tax-free in your Roth account. 
    It's like packing a suitcase for a trip—you want to fill it up as much as possible without going over the weight limit.
     AiRA helps you find that sweet spot for your retirement tax strategy. And remember, the goal isn't just to
      convert as much as possible—it's to convert smartly, 
      using your Tax Room to your advantage while keeping an eye on the overall tax picture. Once you understand how to 
      use Tax Room effectively, you can make informed decisions about your Roth conversions and optimize your retirement income strategy. Save
      the amount and it will automatically be factored in the Roth Conversion forecast for the year you selected. This allows Aira to 
      create a better RMD and Roth conversion schedule for the years after, since it knows how much of your tax bracket you used in the year you made the conversion.`,
     },
]