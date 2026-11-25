import { createHmac, webcrypto } from "node:crypto";
import { TextEncoder as NodeTextEncoder } from "node:util";
import { onRequestPost as analyze } from "../../functions/api/analyze.js";
import { onRequestPost as webhook } from "../../functions/api/webhook.js";
import { signJWT } from "../../functions/_shared/jwt.js";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = NodeTextEncoder;
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, "crypto", { value: webcrypto, configurable: true, writable: true });
}

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
    expect(db.log.some((s) => s.includes("SET credits = 0"))).toBe(true);
  });
});

describe("merged customers", () => {
  const SECRET = "s".repeat(32);
  const tokenFor = (id) => signJWT({ customerId: id, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);

  test("6. /api/balance resolves a merged-away id and hands back a token for the kept row", async () => {
    const { onRequestGet: balance } = require("../../functions/api/balance.js");
    const { verifyJWT } = require("../../functions/_shared/jwt.js");
    const db = fakeDb({
      "FROM customer_aliases": { first: { customer_id: "cus_KEEP" } },
      "SELECT credits FROM customers": { first: { credits: 4200 } },
    });
    const res = await balance({
      request: new Request("https://x/api/balance", { headers: { Authorization: `Bearer ${await tokenFor("cus_DROP")}` } }),
      env: { JWT_SECRET: SECRET, DB: db },
    });
    const body = await res.json();
    expect(body).toMatchObject({ credits: 4200, customerId: "cus_KEEP" });
    expect((await verifyJWT(body.token, SECRET)).customerId).toBe("cus_KEEP");
  });

  test("7. /api/analyze checks the kept row's balance, not the deleted one", async () => {
    global.fetch = jest.fn();
    const seen = [];
    const db = fakeDb({ "FROM customer_aliases": { first: { customer_id: "cus_KEEP" } } });
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => ({ bind: (...a) => { if (sql.includes("SELECT credits, status")) seen.push(a[0]); return prepare(sql).bind(...a); } });
    await analyze({
      request: new Request("https://x/api/analyze", {
        method: "POST", headers: { Authorization: `Bearer ${await tokenFor("cus_DROP")}` },
        body: JSON.stringify({ type: "chat", values: {}, question: "hi" }),
      }),
      env: { GEMINI_API_KEY: "k", JWT_SECRET: SECRET, DB: db },
    });
    expect(seen).toEqual(["cus_KEEP"]);
    delete global.fetch;
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

  test("5. a handler that throws still clears the dedup row", async () => {
    const WH = "whsec_test";
    const raw = JSON.stringify({ id: "evt_2", type: "charge.refunded", data: { object: { customer: "cus_1", amount_refunded: 500 } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", WH).update(`${t}.${raw}`).digest("hex");
    const db = fakeDb();
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => { if (sql.includes("customer_aliases")) throw new Error("no such table"); return prepare(sql); };
    const res = await webhook({
      request: new Request("https://x/api/webhook", { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${sig}` }, body: raw }),
      env: { STRIPE_WEBHOOK_SECRET: WH, STRIPE_SECRET_KEY: "sk", DB: db },
    });
    expect(res.status).toBe(500);
    expect(db.log.some((s) => s.startsWith("DELETE FROM webhook_events"))).toBe(true);
  });
});

describe("/api/admin", () => {
  const { onRequestPost: admin } = require("../../functions/api/admin.js");
  const call = (db, auth = "Bearer wrong") => admin({
    request: new Request("https://x/api/admin", { method: "POST", headers: { Authorization: auth, "CF-Connecting-IP": "1.2.3.4" }, body: "{}" }),
    env: { ADMIN_SECRET: "a".repeat(64), DB: db },
  });

  test("4. wrong guesses are recorded, rate-limited, and never reveal the secret's length", async () => {
    const db = fakeDb();
    const res = await call(db);
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toMatch(/length|serverExpects/);
    expect(db.log.some((s) => s.startsWith("INSERT INTO admin_audit"))).toBe(true);

    const busy = fakeDb({ "COUNT(*)": { first: { cnt: 10 } } });
    expect((await call(busy)).status).toBe(429);
  });
});
