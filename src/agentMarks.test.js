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
    const owners = new Set(REGISTRY.regions.map((r) => r.owner));
    expect(owners.has("deepseek-flash")).toBe(true);
    expect(owners.has("aira-claude")).toBe(true);
  });

  test("every region resolves to real source — no silent no-ops", () => {
    const results = verifyMarks(ROOT);
    const unresolved = results.filter((r) => r.status === "missing-anchor" || r.status === "missing-file");
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
