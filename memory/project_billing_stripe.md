---
name: project-billing-stripe
description: Stripe billing scaffold — Path A token resale, BILLING_ENABLED flag, credit packs, D1 schema, UI in Action Plan
metadata:
  type: project
---

Path A (Stripe token resale) billing is fully scaffolded on branch `feature/ai-action-plan-cloudflare`. Not live yet.

**Why:** User chose Path A over BYOK (Path C) to monetize AI usage directly.

**How to apply:** When advising on billing/credits, refer to this scaffold. Do not re-architect — just flip the flag and run the checklist.

## Key facts

- `BILLING_ENABLED = false` in `src/ai/ai-analysis.js` — flip to `true` to go live
- Three credit packs: $5 (5,000 cr), $10 (10,000 cr), $15 (15,000 cr)
- 1 AiRA Credit = 1,000 raw Gemini tokens
- User identity = Stripe customer ID stored in a 30-day JWT in localStorage
- Credits stored in Cloudflare D1 (`customers` table)

## Files

| File | Role |
|------|------|
| `db/schema.sql` | D1 schema — run via wrangler before going live |
| `wrangler.toml` | D1 binding + env var checklist |
| `functions/_shared/jwt.js` | HS256 JWT + Stripe API helpers (no npm) |
| `functions/api/checkout.js` | POST /api/checkout → Stripe Checkout session |
| `functions/api/webhook.js` | POST /api/webhook → credits D1 on payment |
| `functions/api/verify-session.js` | POST /api/verify-session → issues JWT |
| `functions/api/balance.js` | GET /api/balance → live credit count |
| `functions/api/analyze.js` | Proxy: JWT auth + D1 guard + Gemini + D1 deduct |
| `src/billing/credits.js` | Client: JWT mgmt, API calls, CreditPackModal UI |
| `src/ai/ai-analysis.js` | callViaProxy() + BILLING_ENABLED routing in all 6 AI fns |

## UI (Action Plan tab)

- Credit panel (right side of AI controls): shows balance + "💳 Buy Credits" button
- `CreditPackModal`: 3 packs, purple gradient, opens on button click
- `AiUsageBadge`: shown below controls for BYOK users — session tokens + est. cost
- Stripe return toast: green confirmation after successful purchase redirect

## Go-live checklist (not done yet)

1. `wrangler d1 create aira-credits` → paste ID into wrangler.toml
2. `wrangler d1 execute aira-credits --file=db/schema.sql --remote`
3. Create 3 Stripe products ($5/$10/$15), set STRIPE_PRICE_STARTER/VALUE/PRO env vars
4. Add Stripe webhook → `/api/webhook`, event: `checkout.session.completed`
5. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GEMINI_API_KEY, JWT_SECRET in Cloudflare Dashboard
6. Flip `BILLING_ENABLED = true`