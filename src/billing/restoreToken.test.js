import { redeemRestoreToken, getStoredJWT, clearStoredJWT, getCreditBalance } from "./credits.js";

const JWT_KEY = "airaJWT.v1";
const CACHED_BALANCE_KEY = "airaCachedBalance.v1";

beforeEach(() => {
  localStorage.clear();
  clearStoredJWT();
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

describe("redeemRestoreToken()", () => {
  test("stores the returned JWT and caches the balance", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: "jwt.abc.def", credits: 4750, customerId: "cus_Real123" }),
    });

    const result = await redeemRestoreToken("a".repeat(64));

    expect(result).toEqual({ credits: 4750 });
    expect(getStoredJWT()).toBe("jwt.abc.def");
    expect(localStorage.getItem(CACHED_BALANCE_KEY)).toBe("4750");
    expect(getCreditBalance()).toBe(4750);
  });

  test("POSTs the token to /api/restore as JSON", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: "jwt", credits: 1 }),
    });

    await redeemRestoreToken("tok_xyz");

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/restore");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ token: "tok_xyz" });
  });

  test("surfaces the server error message on an expired/exhausted link", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "This restore link has expired or has already been used too many times. Please contact support." }),
    });

    await expect(redeemRestoreToken("stale")).rejects.toThrow(/expired or has already been used/i);
  });

  test("does not store a JWT when redemption fails", async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: "nope" }),
    });

    await expect(redeemRestoreToken("bad")).rejects.toThrow();
    expect(getStoredJWT()).toBeNull();
  });

  test("does not clobber an existing JWT when redemption fails", async () => {
    localStorage.setItem(JWT_KEY, "existing.jwt.value");
    global.fetch.mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: "nope" }),
    });

    await expect(redeemRestoreToken("bad")).rejects.toThrow();
    expect(getStoredJWT()).toBe("existing.jwt.value");
  });

  test("falls back to a generic message when the error body is unparseable", async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 500, json: async () => { throw new Error("not json"); },
    });

    await expect(redeemRestoreToken("x")).rejects.toThrow(/restore failed/i);
  });

  test("a successful redemption replaces a stale JWT (new device / re-issued link)", async () => {
    localStorage.setItem(JWT_KEY, "stale.jwt");
    global.fetch.mockResolvedValue({
      ok: true, json: async () => ({ token: "fresh.jwt", credits: 900 }),
    });

    await redeemRestoreToken("tok");

    expect(getStoredJWT()).toBe("fresh.jwt");
    expect(getCreditBalance()).toBe(900);
  });
});
