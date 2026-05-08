# AiRA Multi-Agent Retirement Engine
Route requests using natural language. Sub-agents available:
- architect-builder – implementation, TDD, code
- tester – regression tests, failure categorization
- logic-validator – Roth math, BETR, RMD, tax brackets, withdrawal order

Non-negotiable rules:
- RMD age for Vincent Lee (born 1970) = 75
- Withdrawal order: taxable → pre‑tax → Roth (only pre‑tax draw is ordinary income)
- NJ domicile unless FL scenario invoked,
- Never modify another agent's definition file
- Never hard code anything in code that is specific to one user or the author. Always, create a solution that is generic and scalable for other users
- **Whenever you ship a code change**, bump `APP_VERSION`, update `BUILD_TAG`, and refresh `BUILD_TIME` in `src/App.jsx`. The `BUILD_TAG` must lead with the active branch name in brackets, e.g. `"[feature/ai-analysis] v1.0.8.0 — short summary"`. This is how Vincent verifies which build is loaded across machines.

---

## Current State (as of 2026-05-08) — branch: feature/ai-action-plan-cloudflare

### AI is wired and ready to test
- `src/ai/ai-analysis.js` calls **Gemini 2.0 Flash directly from the browser** — no Cloudflare proxy needed
- User enters their own Gemini API key in **Profile → Assumptions** (field: `geminiApiKey`, placeholder `AIza...`)
- Key bug fixed: `geminiApiKey` now forwarded from `assumptions` into `runAIActionPlan` params in App.jsx line ~5513
- `functions/api/analyze.js` exists but is unused (kept as optional proxy if multi-provider is added later)

### To test end-to-end
1. `git pull` then `npm install && npm start`
2. Load a profile, enter Gemini API key in Profile → Assumptions
3. Run Monte Carlo → click the AI button on the Action Plan tab
4. Cards should come back with purple AI notes

### Roadmap item queued
- Allow user to switch AI provider (Gemini / Claude / OpenAI) and model from Profile settings
- Gemini works direct from browser; Anthropic/OpenAI need Cloudflare proxy (CORS restriction)
- Cheapest options: `gemini-2.0-flash` (free), `claude-haiku-3-5` ($0.80/M), `gpt-4o-mini` ($0.15/M)

### Repo hygiene done
- All `.md` files except `README.md` untracked from git (files still on disk)
- `.gitignore` now blocks `*.md` (except README.md), `*.local.js`, `TEST_REPORT.md`
