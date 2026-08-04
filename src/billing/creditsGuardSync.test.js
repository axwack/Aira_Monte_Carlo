/**
 * The client's credit floor must equal the server's.
 *
 * WHY A TEST AND NOT A COMMENT
 * ----------------------------
 * CLAUDE.md already said these two must stay in sync, and named both values as
 * 5. By 2026-08-03 the server was 50 and the client was 5 — a 10x drift that the
 * instruction did not prevent, because a comment cannot fail a build.
 *
 * The consequence is entirely one-sided. The server returns 402 below its floor,
 * so a client floor that is too LOW offers a button that cannot work: at 5–49
 * credits the UI enabled AI analysis and the request was guaranteed to fail.
 * That lands on the user at the worst moment — nearly out of credits, most
 * likely to conclude the product is broken and leave.
 *
 * This reads analyze.js as TEXT rather than importing it. Importing would pull
 * in the Cloudflare runtime (Web Crypto, D1 bindings) which does not exist under
 * jsdom, and — more to the point — a text parse cannot be satisfied by a stale
 * re-export or a shadowed copy. It asserts on the literal a human would read.
 */

import fs from "fs";
import path from "path";
import { MIN_CREDITS_TO_RUN, LOW_BALANCE_WARN_AT } from "./credits.js";

const ANALYZE = path.join(__dirname, "..", "..", "functions", "api", "analyze.js");

function serverGuard() {
  const src = fs.readFileSync(ANALYZE, "utf8");
  // Tolerates numeric separators (50, 5_000) and any spacing.
  const m = src.match(/const\s+MIN_CREDITS_GUARD\s*=\s*([\d_]+)/);
  if (!m) throw new Error("MIN_CREDITS_GUARD not found in functions/api/analyze.js");
  return Number(m[1].replace(/_/g, ""));
}

describe("credit floor: client vs server", () => {
  test("analyze.js still declares MIN_CREDITS_GUARD", () => {
    expect(Number.isFinite(serverGuard())).toBe(true);
  });

  test("the client floor EQUALS the server floor", () => {
    // If this fails, do not just edit the number to make it pass — decide which
    // floor is right, change BOTH, and update CLAUDE.md's billing gotchas.
    expect(MIN_CREDITS_TO_RUN).toBe(serverGuard());
  });

  test("the client floor is never BELOW the server's — the failure direction", () => {
    // Stated separately because this is the asymmetry that actually hurts: too
    // low offers an impossible action, too high merely asks for a top-up early.
    expect(MIN_CREDITS_TO_RUN).toBeGreaterThanOrEqual(serverGuard());
  });
});

describe("low-balance warning threshold", () => {
  test("warns strictly before the floor is reached", () => {
    // A warning at or below the floor arrives after the button has already
    // stopped working, which is not a warning.
    expect(LOW_BALANCE_WARN_AT).toBeGreaterThan(MIN_CREDITS_TO_RUN);
  });

  test("is derived from the floor, not an unrelated round number", () => {
    expect(LOW_BALANCE_WARN_AT % MIN_CREDITS_TO_RUN).toBe(0);
  });
});
