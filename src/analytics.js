export const EVENTS = ["mc_run", "ai_click", "checkout_start", "report_checkout_start", "report_unlock"];

export function track(name) {
  try {
    if (!EVENTS.includes(name)) return;
    navigator.sendBeacon("/api/event", new Blob([JSON.stringify({ name })], { type: "application/json" }));
  } catch { }
}
