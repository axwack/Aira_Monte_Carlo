# AiRA Forecaster

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