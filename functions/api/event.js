/**
 * POST /api/event   Body: { "name": "<allow-listed event>" }
 *
 * Increments a daily aggregate counter. Unauthenticated and anonymous on purpose:
 * it stores no identifier, only (UTC day, name) -> count. Always answers 204 so a
 * counter problem can never surface in the app.
 *
 * shortcut: no rate limit, so a script can inflate a counter; fine for a funnel
 * gauge, upgrade (Cloudflare rate-limit rule) if the numbers ever drive money.
 * Required env: DB (D1)
 */
import { handleOptions } from "../_shared/jwt.js";

// Keep in sync with src/analytics.js. Anything else is dropped, so the table
// cannot be filled with arbitrary names.
const EVENTS = new Set(["mc_run", "ai_click", "checkout_start", "report_checkout_start", "report_unlock"]);

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  try {
    const { name } = await request.json();
    if (EVENTS.has(name) && env.DB) {
      const day = new Date().toISOString().slice(0, 10);
      await env.DB
        .prepare("INSERT INTO events (day, name, n) VALUES (?, ?, 1) ON CONFLICT(day, name) DO UPDATE SET n = n + 1")
        .bind(day, name)
        .run();
    }
  } catch { /* never fail the caller over a counter */ }
  return new Response(null, { status: 204 });
}
