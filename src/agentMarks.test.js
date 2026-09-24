/**
 * Agent attribution + tamper-evidence gate.
 *
 * Two agents work this repo concurrently (see agent-marks.json). This test
 * re-derives the hash of every marked region and fails when one has changed or
 * vanished, so editing another agent's code cannot happen quietly.
 *
 * The suite is the enforcement mechanism, deliberately: a hash in a JSON file is
 * tamper-EVIDENT but not tamper-PROOF — anyone with write access can re-stamp it.
 * Because this test fails on drift, re-stamping becomes a deliberate act that
 * shows up in the diff next to the code change, instead of a silent rewrite.
 *
 * It also asserts the registry is still doing real work: a registry whose
 * regions all failed to resolve (renamed functions, moved files) would "pass"
 * while checking nothing, which is worse than having no gate.
 */

import fs from "fs";
import path from "path";
import { verifyMarks } from "./agentMarks.js";

const REGISTRY = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "agent-marks.json"), "utf8"));
const ROOT = path.join(__dirname, "..");

describe("agent marks — region attribution is intact", () => {
  test("the registry is non-trivial and names real owners", () => {
    expect(Array.isArray(REGISTRY.regions)).toBe(true);
    expect(REGISTRY.regions.length).toBeGreaterThanOrEqual(5);
    for (const r of REGISTRY.regions) {
      expect(typeof r.id).toBe("string");
      expect(r.id.length).toBeGreaterThan(2);
      expect(["deepseek-flash", "aira-claude", "shared"]).toContain(r.owner);
      expect(r.file).toMatch(/^src\//);
      expect(typeof r.startAnchor).toBe("string");
    }
    // Both agents must actually be represented, or this stops being a
    // coordination file and becomes one agent's private notes.
    const owners = new Set(REGISTRY.regions.map((r) => r.owner));
    expect(owners.has("deepseek-flash")).toBe(true);
    expect(owners.has("aira-claude")).toBe(true);
  });

  test("every region resolves to real source — no silent no-ops", () => {
    const results = verifyMarks(ROOT);
    const unresolved = results.filter((r) => r.status === "missing-anchor" || r.status === "missing-file");
    // A missing anchor means the registry is pointing at something that no
    // longer exists; failing here keeps the map honest rather than decorative.
    expect(unresolved.map((r) => `${r.id}:${r.status}`)).toEqual([]);
  });

  test("no region has drifted from its recorded hash", () => {
    const drifted = verifyMarks(ROOT).filter((r) => r.status === "drifted" || r.status === "unstamped");
    if (drifted.length) {
      const detail = drifted
        .map((r) => `  ${r.id} [${r.owner}] ${r.file}\n    ${r.description}\n    recorded ${r.sha} != actual ${r.actual}`)
        .join("\n");
      throw new Error(
        `Marked region(s) changed without re-stamping:\n${detail}\n\n` +
        `If this was intentional: node scripts/agent-marks.mjs --stamp  (and commit agent-marks.json with the change)\n` +
        `If it was NOT: you have edited another agent's region — coordinate before continuing.`
      );
    }
    expect(drifted).toEqual([]);
  });
});
