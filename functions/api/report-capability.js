/**
 * GET /api/report-capability
 *
 * Unauthenticated, no-secret capability probe: tells the client whether this
 * deployment is configured to serve the printable report feature at all,
 * independent of BILLING_ENABLED/credits/JWT state.
 *
 * Why this exists: BILLING_ENABLED (src/ai/ai-analysis.js) is a source-level
 * constant, not a runtime secret — anyone with the client source can flip it
 * to false and get the report's `locked` prop to always evaluate false (see
 * App.jsx's PrintReport call site), since the report's data is 100%
 * client-computed. Gating on GEMINI_API_KEY being present closes that: the
 * key only exists in the operator's real Cloudflare Pages env (or local
 * `.dev.vars`, gitignored) — a from-scratch self-host of the client source
 * alone can never make this return true. Not full DRM (nothing here is);
 * it just means "flip one boolean" no longer works, matching the soft-gate
 * philosophy already documented in src/report/PrintReport.jsx.
 */
import { json, handleOptions } from "../_shared/jwt.js";

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet({ env }) {
  return json({ available: !!env.GEMINI_API_KEY });
}
