import { json, handleOptions } from "../_shared/jwt.js";

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet({ env }) {
  return json({ available: !!env.GEMINI_API_KEY });
}
