import fs from "fs";
import path from "path";
import { MIN_CREDITS_TO_RUN, LOW_BALANCE_WARN_AT } from "./credits.js";

const ANALYZE = path.join(__dirname, "..", "..", "functions", "api", "analyze.js");

function serverGuard() {
  const src = fs.readFileSync(ANALYZE, "utf8");
  const m = src.match(/const\s+MIN_CREDITS_GUARD\s*=\s*([\d_]+)/);
  if (!m) throw new Error("MIN_CREDITS_GUARD not found in functions/api/analyze.js");
  return Number(m[1].replace(/_/g, ""));
}

describe("credit floor: client vs server", () => {
  test("analyze.js still declares MIN_CREDITS_GUARD", () => {
    expect(Number.isFinite(serverGuard())).toBe(true);
  });

  test("the client floor EQUALS the server floor", () => {
    expect(MIN_CREDITS_TO_RUN).toBe(serverGuard());
  });

  test("the client floor is never BELOW the server's — the failure direction", () => {
    expect(MIN_CREDITS_TO_RUN).toBeGreaterThanOrEqual(serverGuard());
  });
});

describe("low-balance warning threshold", () => {
  test("warns strictly before the floor is reached", () => {
    expect(LOW_BALANCE_WARN_AT).toBeGreaterThan(MIN_CREDITS_TO_RUN);
  });

  test("is derived from the floor, not an unrelated round number", () => {
    expect(LOW_BALANCE_WARN_AT % MIN_CREDITS_TO_RUN).toBe(0);
  });
});
