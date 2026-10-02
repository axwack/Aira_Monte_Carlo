# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a DIY pre-retiree: a US household planning its own retirement without an advisor, comfortable with account types and taxes, arriving cold with no saved profile. Their first job is to replace the default inputs with their own (accounts, balances, spending, dates) so the forecast is about them.

The owner built AiRA for his own plan first and then opened it to others.

## Product Purpose

AiRA (AI Retirement Assessment) is a client-side retirement forecaster and planner. It uses historical market data, Monte Carlo simulation and a range of withdrawal strategies to show how savings and spending decisions affect a household's financial future. It exists because the owner could not find a cost-effective tool that modelled his real circumstances.

## Positioning

Models real-world complexity that generic calculators skip (pre-tax vs. Roth vs. taxable, RMDs, state tax domicile, real estate, sequence-of-returns risk) and runs entirely in the browser.

## Operating Context

- Five tabs: Net Worth, Forecast, Analysis, Action Plan, Plan inputs. A left sidebar holds the plan launcher, summary cards and quick sliders.
- A visitor with no saved profile lands on a quick-estimate page, then enters the app. A saved profile lives in the browser; profiles can be exported and imported as JSON.
- Three of the owner's PCs feed this repository. The project's `CLAUDE.md` (numbered rules cited in code comments) and the "design authority" agent live on another PC, not in this checkout. `docs/ds/` holds the design-support notes available here.
- Two agents work the repo concurrently; `agent-marks.json` records which regions each owns.

## Capabilities and Constraints

- Multi-bucket Monte Carlo over pre-tax, Roth, taxable, HSA and cash accounts; ten withdrawal strategies; Roth conversion explorer; mortgage and net-worth projection; generated action plan; printable report.
- Stack: React 19, Recharts, Create React App; deployed to Cloudflare Pages.
- Terminology: "Plan inputs" is the single destination for household facts; simulation settings are kept separate because they describe how the model runs.

## Evidence on Hand

- **Isis, first critique, Topic 1 (new-user configuration flow).** She clicked past the quick-estimate page, could not get back to it in the same browser session, and almost gave up because there seemed to be no way to change the default inputs. After reopening in an incognito window she spent several minutes finding where to enter account balances. She reported that the "profile" tab on the far right was too subtle, that she clicked nearly every other button first, and that she expected to change balances and the split by clicking the read-only top-left summary (for example the tax-treatment donut). She asked for input to be anchored to the left sidebar and for a bold, hard-to-miss "CONFIGURE" or "ADJUST VALUES" button near the top left that launches the whole process.
- Other reviewer notes and audits: `docs/ds/` (contrast audit, colour inventory, plan-inputs map).
- No testimonials, usage numbers or benchmarks are on hand; do not invent any.

## Product Principles

1. **Single point of control.** Every input has exactly one editable home; everywhere else shows it read-only with a link back.
2. **Read, never recompute.** The interface displays engine outputs only and does no financial arithmetic of its own.
3. **Client-side privacy.** Everything runs in the browser; no profile data leaves the machine except by explicit export.
4. **Not financial advice.** AiRA is an educational modelling tool; disclaimers and honest "not entered" states stay visible.

## Accessibility & Inclusion

No standard has been set. Open: `docs/ds/contrast-audit.md` reports muted text tokens below target contrast, which Isis noticed at low screen brightness.
