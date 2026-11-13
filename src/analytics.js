// Anonymous funnel counters: fire-and-forget POST to /api/event, which keeps only a
// daily count per event name (db/migrations/009_events.sql). Sends no identifier and
// no plan data. Must never throw or block the UI.
export const EVENTS = ["mc_run", "ai_click", "checkout_start", "report_checkout_start", "report_unlock"];

export function track(name) {
  try {
    if (!EVENTS.includes(name)) return;
    navigator.sendBeacon("/api/event", new Blob([JSON.stringify({ name })], { type: "application/json" }));
  } catch { /* no beacon support, test env, or blocked: counters are best-effort */ }
}
