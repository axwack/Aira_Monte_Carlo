/**
 * Guards for three billing bugs: anonymous callers spending the server Gemini key,
 * an overdraft being "refunded" credits it never took, and a failed webhook being
 * swallowed by its own dedup row on Stripe's retry. Fake D1 + stubbed fetch; no network.
 */
import { createHmac, webcrypto } from "node:crypto";
import { TextEncoder as NodeTextEncoder } from "node:util";
import { onRequestPost as analyze } from "../../functions/api/analyze.js";
import { onRequestPost as webhook } from "../../functions/api/webhook.js";
import { signJWT } from "../../functions/_shared/jwt.js";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = NodeTextEncoder;
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, "crypto", { value: webcrypto, configurable: true, writable: true });
}

/** Fake D1: every statement is recorded; `rules` pick the result by SQL substring. */
function fakeDb(rules = {}) {
  const log = [];
  const pick = (sql) => Object.entries(rules).find(([k]) => sql.includes(k))?.[1];
  return {
    log,
    batch: async (stmts) => { stmts.forEach((st) => log.push(st.sql)); return []; },
    prepare(sql) {
      return {
        bind: (...args) => ({
          sql,
          run:   async () => { log.push(sql); return pick(sql)?.run   ?? { meta: { changes: 1, last_row_id: 7 } }; },
          first: async () => { log.push(sql); return pick(sql)?.first ?? null; },
        }),
      };
    },
  };
}

describe("/api/analyze", () => {
  afterEach(() => { delete global.fetch; });

  test("1. no token and no apiKey is refused, never served with the server key", async () => {
    global.fetch = jest.fn();
    const res = await analyze({
      request: new Request("https://x/api/analyze", { method: "POST", body: JSON.stringify({ type: "chat", values: {}, question: "hi" }) }),
      env: { GEMINI_API_KEY: "server-key" },
    });
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("3. an overdraft with an empty result is not refunded", async () => {
    const SECRET = "s".repeat(32);
    const token = await signJWT({ customerId: "cus_1", exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);
    // 200k tokens = 200 credits against a balance of 60: the conditional UPDATE matches nothing.
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "no cards" }] } }], usageMetadata: { totalTokenCount: 200000 } }),
    }));
    const db = fakeDb({
      "SELECT credits, status": { first: { credits: 60, status: "active" } },
      "credits - ?": { run: { meta: { changes: 0 } } },
    });
    const res = await analyze({
      request: new Request("https://x/api/analyze", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "timesensitive", values: {} }),
      }),
      env: { GEMINI_API_KEY: "server-key", JWT_SECRET: SECRET, DB: db },
    });
    const body = await res.json();
    expect(body._refunded).toBeUndefined();
    expect(db.log.some((s) => s.includes("credits = credits + ?"))).toBe(false);
  });
});

describe("/api/webhook", () => {
  test("2. a 5xx clears the dedup row so Stripe's retry is processed", async () => {
    const WH = "whsec_test";
    const raw = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", WH).update(`${t}.${raw}`).digest("hex");
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "stripe down" } }) }));
    const db = fakeDb();
    const res = await webhook({
      request: new Request("https://x/api/webhook", { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${sig}` }, body: raw }),
      env: { STRIPE_WEBHOOK_SECRET: WH, STRIPE_SECRET_KEY: "sk", DB: db },
    });
    expect(res.status).toBe(500);
    expect(db.log.some((s) => s.startsWith("DELETE FROM webhook_events"))).toBe(true);
    delete global.fetch;
  });
});
