import { handleOptions } from "../_shared/jwt.js";

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
  } catch { }
  return new Response(null, { status: 204 });
}
