/**
 * reportUnlock.test.js — client-side report paywall gate
 * (REPORT_COST_CREDITS, unlockReport(), isReportUnlocked())
 *
 * Follows the source-text-check convention established in banner.test.js
 * (reads App.jsx as raw text) to guard the "keep in sync" comment between
 * src/billing/credits.js and functions/api/report-unlock.js.
 */
const fs = require("fs");
const path = require("path");

import {
  REPORT_COST_CREDITS,
  unlockReport,
  isReportUnlocked,
} from "./credits.js";

const CLIENT_SRC = fs.readFileSync(path.join(__dirname, "credits.js"), "utf8");
const SERVER_SRC = fs.readFileSync(
  path.join(__dirname, "../../functions/api/report-unlock.js"),
  "utf8"
);

const REPORT_UNLOCK_KEY = "aira_report_unlock";

describe("REPORT_COST_CREDITS", () => {
  test("is exported and a positive integer", () => {
    expect(typeof REPORT_COST_CREDITS).toBe("number");
    expect(REPORT_COST_CREDITS).toBeGreaterThan(0);
    expect(Number.isInteger(REPORT_COST_CREDITS)).toBe(true);
  });

  test("client and server defaults are kept in sync (guards the 'keep in sync' comment)", () => {
    const clientMatch = CLIENT_SRC.match(/export const REPORT_COST_CREDITS = ([\d_]+);/);
    const serverMatch = SERVER_SRC.match(/const DEFAULT_REPORT_COST_CREDITS = ([\d_]+);/);
    expect(clientMatch).not.toBeNull();
    expect(serverMatch).not.toBeNull();

    const clientValue = Number(clientMatch[1].replace(/_/g, ""));
    const serverValue = Number(serverMatch[1].replace(/_/g, ""));
    expect(clientValue).toBe(serverValue);
    expect(clientValue).toBe(REPORT_COST_CREDITS);
  });
});

describe("isReportUnlocked()", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("returns false when nothing is stored", () => {
    expect(isReportUnlocked()).toBe(false);
  });

  test("returns true for a fresh (future) unlock window", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
    localStorage.setItem(REPORT_UNLOCK_KEY, JSON.stringify({ unlockedUntil: future }));
    expect(isReportUnlocked()).toBe(true);
  });

  test("returns false for an expired unlock window", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // -1h
    localStorage.setItem(REPORT_UNLOCK_KEY, JSON.stringify({ unlockedUntil: past }));
    expect(isReportUnlocked()).toBe(false);
  });

  test("returns false and does not throw on corrupt JSON", () => {
    localStorage.setItem(REPORT_UNLOCK_KEY, "not valid json{{{");
    expect(() => isReportUnlocked()).not.toThrow();
    expect(isReportUnlocked()).toBe(false);
  });
});

describe("unlockReport()", () => {
  const JWT_KEY = "airaJWT.v1";

  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("throws without a stored JWT and never calls fetch", async () => {
    await expect(unlockReport()).rejects.toThrow(/authenticated/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("on success, stores the unlock window and returns the server payload", async () => {
    localStorage.setItem(JWT_KEY, "fake.jwt.token");
    const unlockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        creditsUsed: REPORT_COST_CREDITS,
        creditsRemaining: 4_750,
        unlockedUntil,
      }),
    });

    const result = await unlockReport();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/report-unlock",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer fake.jwt.token" }),
      })
    );
    expect(result.creditsRemaining).toBe(4_750);
    expect(isReportUnlocked()).toBe(true);
    expect(JSON.parse(localStorage.getItem(REPORT_UNLOCK_KEY)).unlockedUntil).toBe(unlockedUntil);
  });

  test("on 402 insufficient credits, throws with creditsRemaining attached and does not persist an unlock", async () => {
    localStorage.setItem(JWT_KEY, "fake.jwt.token");
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({
        error: "Insufficient AiRA credits. Please purchase a credit pack to continue.",
        creditsRemaining: 40,
      }),
    });

    await expect(unlockReport()).rejects.toMatchObject({ creditsRemaining: 40 });
    expect(isReportUnlocked()).toBe(false);
  });

  test("on 401, clears the stored JWT", async () => {
    localStorage.setItem(JWT_KEY, "fake.jwt.token");
    global.fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    await expect(unlockReport()).rejects.toThrow(/session expired/i);
    expect(localStorage.getItem(JWT_KEY)).toBeNull();
  });
});
