[View on GitHub](https://github.com/axwack/Aira_Monte_Carlo)

# AiRA Financial Freedom - Retirement Forecaster and Planner

**AI Retirement Assessment — Dedicated to AERA**

AiRA Forecaster is a comprehensive, client‑side web application for retirement planning. It uses historical market data, Monte Carlo simulations, and a variety of dynamic withdrawal strategies to help users explore how different savings and spending decisions might impact their financial future.

## ✨ Why I Built This

This tool was created to address the limitations of generic retirement calculators. I wanted a system that:
- **Respects individual circumstances** (account types, tax domicile, real estate).
- **Models real‑world complexity** (pre‑tax vs. Roth, RMDs, sequence‑of‑returns risk).
- **Provides actionable insights** (dynamic action plans, strategy comparisons).
- **Puts privacy first** – everything runs in your browser; no data is sent to any server unless you explicitly choose to import/export a profile.
- **Made for Me but now for YOU** - I love the retirement planning arc. It's because it's personal and because of this journey, I have learned a lot about how to retire, what it means to retire and how to plan. What was started as anxiety quickly became a very systematic plan to help me enjoy life after work. 

## 🚀 Key Features

- **Multi‑bucket Monte Carlo simulation** – Tracks separate pre‑tax, Roth, taxable, HSA, and cash accounts.
- **Ten withdrawal strategies** – From Guyton‑Klinger to VPW, CAPE‑based, Endowment, 1/N, 95% Rule, and more.
- **Roth conversion explorer** – Models lifetime tax impact with bracket‑filling logic and IRMAA guardrails.
- **Real‑time deterministic projections** – See how any strategy behaves with median historical returns.
- **Dynamic action plan** – Generates a prioritized, colour‑coded list of to‑dos based on your Monte Carlo results.
- **Mortgage payoff visualisation** – Compare standard vs. accelerated payment schedules.
- **Net worth projection** – Charts liquid assets, mortgage debt, real estate and net worth.
- **Profile import/export** – Save your plan locally and share it across devices.
- **100% client‑side** – Your data never leaves your machine (except for optional feedback submissions).

## 🛠️ Technologies Used

- React 19
- Recharts
- Vite / Create React App
- Custom Monte Carlo engine with 99 years of S&P 500 & 50 years of bond data

## 📖 Getting Started

### Prerequisites
- Node.js (v18 or later)
- npm or yarn

### Installation

```bash
git clone https://github.com/yourusername/aira-forecaster.git
cd aira-forecaster
npm install
npm run dev
```

### Roadmap
Roadmap captured (Feature 4): live success rate shift — re-run MC from actual current portfolio value so the headline success % reflects reality, not plan-day projections. That's the big one for adaptive planning

What you're describing is very much grounded in science — it's called adaptive distribution planning (Kitces writes about it extensively). The core idea:

    Your MC simulation at retirement gives you a probability distribution of futures. As time passes, your actual portfolio performance is a data point that narrows which percentile path you're on. You can then re-run the simulation from today's actual values to get a live success rate.

Concretely, what we'd build:

- "You Are Here" dot — a marker at (currentAge, currentPortfolio) on the chart. Immediately tells you whether you're above/below median
- Pre-retirement accumulation line — single deterministic path from current age to retire age (current portfolio × expected return + contributions each year). * Checkpoints before retirement plot against this line instead of the fan
- Percentile readout — for any checkpoint or the current dot, interpolate between the p10/p25/p50/p75/p90 bands to say "you are at approximately the 63rd percentile" — not just green/yellow/red
- Live success rate shift — re-run the MC from your actual current portfolio (not the projected one) so the headline % reflects reality, not your plan-day assumptions

The deterministic pre-retirement path is straightforward:

port[y] = port[y-1] × (1 + expectedReturn) + annualContrib

Same formula the existing simulateDeterministic already uses for accumulation — just expose it as a chart line.

---

### 📋 Readiness Tab — Uncle John's 7-Step Retirement Readiness Check

**Status:** Planned

A new `📋 Readiness` tab alongside Net Worth, Forecast, Income, and Action Plan that scores the user against Uncle John's 7-step retirement framework using their actual profile data. Zero new inputs required — all data comes from the existing profile.

**Seven step scorecards (Green ✅ / Yellow 🟡 / Red 🔴):**

| Step | Profile Keys Used | Status Logic |
|------|-------------------|--------------|
| 1. Know Your Spending | `sp` | ✅ if `sp > 0`, 🔴 if zero |
| 2. Three Buckets Mapped | `accounts` (pretax / roth / taxable) | ✅ if all three funded |
| 3. RMD Window | `currentAge` | 🟡 approaching 59.5, ✅ if past |
| 4. Work Style Decided | `retireAge` | ✅ if `<= 62`, 🟡 if `>= 65` |
| 5. Debt Position | `mortBalance`, `port` | ✅ if `mortBalance < port * 0.15` |
| 6. Social Security | `ssAge`, `ssb` | ✅ if both set |
| 7. Life Designed | `twoHousehold` | ✅ if two-household model active |

**Overall readiness score** displayed as X/7 at the bottom.

**AI layer:** Each step card gets an "Explain This" button that sends the user's actual numbers to the Claude API for a personalized 3–4 sentence explanation — gated behind an API key in assumptions.

**Source attribution:** Framework adapted from Uncle John Financials — youtu.be/jABYsMEoW20

**Implementation notes:**
- Add `["readiness", "📋 Readiness"]` to the `TABS` array in `App.jsx`
- New `ReadinessTab({ p, results90 })` component — `p` is the params object
- Bucket balances computed by filtering `p.accounts[]` by category (same pattern as line 5082)
- No new state, no new computation beyond existing profile keys

---

### DISCLAIMER

AiRA Forecaster is a financial modelling and educational tool. It does not constitute professional financial, investment, tax, or legal advice. All simulations are based on historical data and mathematical projections. Past performance is not indicative of future results. Use at your own risk and consult a qualified financial advisor, CPA, or tax professional before making any financial decisions.
