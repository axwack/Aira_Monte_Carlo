/**
 * ai-analysis.js — Direct Gemini API calls from the browser
 *
 * Each user provides their own Gemini API key via Profile → Assumptions.
 * No server proxy needed — calls go directly to Google's API.
 *
 * Get a free key at: https://aistudio.google.com/app/apikey
 *
 * Path A billing stub:
 *   Set BILLING_ENABLED = true to activate credit checks + deductions.
 *   False (default) = pure BYOK — existing behavior, no changes.
 */

import { useState, useEffect, useCallback } from "react";
import { hasEnoughCredits, deductCredits, ESTIMATED_CREDITS_PER_CALL, getStoredJWT, fetchCreditBalance, syncCreditBalance } from "../billing/credits.js";

// ─── Billing mode flag ────────────────────────────────────────────────────────
// Flip to true when Path A (token-resale) goes live.
// When false, all credit logic is bypassed — pure BYOK, no code path changes.
export const BILLING_ENABLED = false;

// ─── Billing proxy ────────────────────────────────────────────────────────────
// Routes all AI calls through /api/analyze when BILLING_ENABLED = true.
// The Worker verifies the JWT, deducts credits from D1, and calls Gemini
// with the server-side key — the user's BYOK key is not needed.

async function callViaProxy(type, data) {
  const jwt = getStoredJWT();
  if (!jwt) throw new Error("Not authenticated — please purchase AiRA credits to continue.");
  const res = await fetch("/api/analyze", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body:    JSON.stringify({ type, ...data }),
  });
  if (res.status === 401) throw new Error("Session expired — please log in again.");
  if (res.status === 402) throw new Error("Insufficient AiRA credits. Please purchase more.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const result = await res.json();
  // Sync balance from the server's response to avoid a second round-trip.
  // Fall back to a live fetch if the server didn't include the remaining balance
  // (e.g. BYOK mode or deduction failed non-fatally).
  if (typeof result._credits_remaining === "number") {
    syncCreditBalance(result._credits_remaining);
  } else {
    fetchCreditBalance();
  }
  return result;
}
