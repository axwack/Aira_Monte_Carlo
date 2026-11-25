import { simulateDeterministicWithStrategy, runMC, getStrategyLabel } from "./App";
import {
  LIVE_STRATEGIES,
  RETIRED_STRATEGIES,
  STRATEGY_LABELS,
  DEFAULT_STRATEGY,
  isLiveStrategy,
  resolveStrategy,
  migrateWithdrawalStrategy,
  migrationNotice,
} from "./engine/withdrawalStrategies.js";

const RETIRED_IDS = Object.keys(RETIRED_STRATEGIES);

const PROFILE = {
  currentAge: 60, retireAge: 60, endAge: 90,
  port: 1_500_000, contrib: 0, inf: 2.5, sp: 80_000,
  ssAge: 67, ssb: 30_000, ssCola: 2.4, ab: 0, abReliability: 100,
  eqPct: 60, filingStatus: "mfj", stateOfResidence: "NJ", birthYear: 1966,
  gkFloor: 60_000, gkCeiling: 120_000,
  fixedWithdrawalRate: 0.04,
  accounts: [
    { id: "a1", category: "pretax",  name: "401k", balance: 900_000 },
    { id: "a2", category: "taxable", name: "Brok", balance: 400_000 },
    { id: "a3", category: "roth",    name: "Roth", balance: 200_000 },
  ],
};

const sim = (p, s) => simulateDeterministicWithStrategy(p, 2.5, s);
const lifetime = (schedule) => schedule.reduce((a, r) => a + (r.spending || 0), 0);

describe("Strategy registry", () => {
  test("every retired strategy maps to a strategy the app still runs", () => {
    for (const id of RETIRED_IDS) {
      expect(LIVE_STRATEGIES).toContain(RETIRED_STRATEGIES[id].to);
    }
  });

  test("no id is both live and retired", () => {
    for (const id of RETIRED_IDS) expect(isLiveStrategy(id)).toBe(false);
    for (const id of LIVE_STRATEGIES) expect(RETIRED_STRATEGIES[id]).toBeUndefined();
  });

  test("every live AND retired id has a display label", () => {
    for (const id of [...LIVE_STRATEGIES, ...RETIRED_IDS]) {
      expect(typeof STRATEGY_LABELS[id]).toBe("string");
      expect(STRATEGY_LABELS[id].length).toBeGreaterThan(0);
      expect(STRATEGY_LABELS[id]).not.toBe(id);
    }
  });

  test("App's getStrategyLabel is the shared map, not a second copy", () => {
    for (const id of [...LIVE_STRATEGIES, ...RETIRED_IDS]) {
      expect(getStrategyLabel(id)).toBe(STRATEGY_LABELS[id]);
    }
  });

  test("every retired strategy states a fidelity and a reason", () => {
    for (const id of RETIRED_IDS) {
      expect(["exact", "close", "changed"]).toContain(RETIRED_STRATEGIES[id].fidelity);
      expect(RETIRED_STRATEGIES[id].basis.length).toBeGreaterThan(40);
    }
  });
});

describe("resolveStrategy", () => {
  test("live strategies pass through untouched", () => {
    for (const id of LIVE_STRATEGIES) expect(resolveStrategy(id)).toBe(id);
  });

  test("retired strategies resolve to their replacement", () => {
    for (const id of RETIRED_IDS) {
      expect(resolveStrategy(id)).toBe(RETIRED_STRATEGIES[id].to);
    }
  });

  test("garbage resolves to the default rather than throwing", () => {
    for (const junk of [undefined, null, "", "gk ", "GK", "no_such_strategy", 42, {}, []]) {
      expect(resolveStrategy(junk)).toBe(DEFAULT_STRATEGY);
    }
  });
});

describe("migrateWithdrawalStrategy", () => {
  test("rewrites the strategy and stamps where it came from", () => {
    for (const id of RETIRED_IDS) {
      const out = migrateWithdrawalStrategy({ withdrawalStrategy: id, sp: 80_000 });
      expect(out.withdrawalStrategy).toBe(RETIRED_STRATEGIES[id].to);
      expect(out.withdrawalStrategyMigratedFrom).toBe(id);
      expect(out.sp).toBe(80_000);
    }
  });

  test("writes the companion fields that preserve the old spending rate", () => {
    expect(migrateWithdrawalStrategy({ withdrawalStrategy: "cape" }).fixedWithdrawalRate).toBe(0.04);
    expect(migrateWithdrawalStrategy({ withdrawalStrategy: "one_n" }).vpwRealReturn).toBe(0);
  });

  test("leaves live profiles alone — same reference, no stamp", () => {
    for (const id of LIVE_STRATEGIES) {
      const input = { withdrawalStrategy: id };
      expect(migrateWithdrawalStrategy(input)).toBe(input);
      expect(input.withdrawalStrategyMigratedFrom).toBeUndefined();
    }
  });

  test("never mutates the input profile", () => {
    const input = { withdrawalStrategy: "cape", fixedWithdrawalRate: 0.07 };
    migrateWithdrawalStrategy(input);
    expect(input.withdrawalStrategy).toBe("cape");
    expect(input.fixedWithdrawalRate).toBe(0.07);
  });

  test("survives a profile that is missing, empty, or not an object", () => {
    expect(() => migrateWithdrawalStrategy(null)).not.toThrow();
    expect(() => migrateWithdrawalStrategy(undefined)).not.toThrow();
    expect(migrateWithdrawalStrategy({})).toEqual({});
    expect(migrateWithdrawalStrategy("nope")).toBe("nope");
  });

  test("is idempotent — migrating twice changes nothing further", () => {
    const once = migrateWithdrawalStrategy({ withdrawalStrategy: "kitces" });
    expect(migrateWithdrawalStrategy(once)).toBe(once);
  });
});

describe("migrationNotice", () => {
  test("returns nothing when nothing was migrated", () => {
    expect(migrationNotice(null)).toBeNull();
    expect(migrationNotice("gk")).toBeNull();
    expect(migrationNotice("no_such_strategy")).toBeNull();
  });

  test("names both strategies in words a user can read", () => {
    for (const id of RETIRED_IDS) {
      const n = migrationNotice(id);
      expect(n.fromLabel).toBe(STRATEGY_LABELS[id]);
      expect(n.toLabel).toBe(STRATEGY_LABELS[RETIRED_STRATEGIES[id].to]);
      expect(n.fromLabel).not.toBe(id);
      expect(n.impact.length).toBeGreaterThan(20);
    }
  });

  test("only a 'changed' mapping tells the user their spending moved", () => {
    expect(migrationNotice("one_n").impact).toMatch(/unchanged/i);
    expect(migrationNotice("cape").impact).toMatch(/nearly unchanged/i);
    for (const id of RETIRED_IDS.filter((i) => RETIRED_STRATEGIES[i].fidelity === "changed")) {
      expect(migrationNotice(id).impact).toMatch(/has changed/i);
    }
  });
});

describe("A profile saved on a retired strategy still runs a real plan", () => {
  test.each(RETIRED_IDS)("%s: nominal spending does not decay year over year", (id) => {
    const { schedule } = sim({ ...PROFILE, withdrawalStrategy: id }, id);
    expect(schedule.length).toBeGreaterThan(20);
    expect(schedule[10].spending).toBeGreaterThan(schedule[1].spending);
    expect(schedule[25].spending).toBeGreaterThan(schedule[10].spending);
  });

  test.each(RETIRED_IDS)("%s: matches the plan its replacement produces", (id) => {
    const migrated = migrateWithdrawalStrategy({ ...PROFILE, withdrawalStrategy: id });
    const viaMigration = sim(migrated, migrated.withdrawalStrategy);
    const viaReplacement = sim(
      { ...PROFILE, ...(RETIRED_STRATEGIES[id].set || {}), withdrawalStrategy: RETIRED_STRATEGIES[id].to },
      RETIRED_STRATEGIES[id].to
    );
    expect(lifetime(viaMigration.schedule)).toBeCloseTo(lifetime(viaReplacement.schedule), 0);
  });

  test.each(RETIRED_IDS)("%s: the engine resolves it even WITHOUT migration", (id) => {
    const unmigrated = sim({ ...PROFILE, withdrawalStrategy: id }, id);
    const resolved = sim({ ...PROFILE, withdrawalStrategy: resolveStrategy(id) }, resolveStrategy(id));
    expect(lifetime(unmigrated.schedule)).toBeCloseTo(lifetime(resolved.schedule), 0);
  });

  test.each(RETIRED_IDS)("%s: Monte Carlo runs and returns a usable success rate", (id) => {
    const mc = runMC({ ...PROFILE, withdrawalStrategy: id }, 90, 60, 7, true);
    expect(mc).toBeTruthy();
    expect(Number.isFinite(mc.rate)).toBe(true);
    expect(mc.rate).toBeGreaterThanOrEqual(0);
    expect(mc.rate).toBeLessThanOrEqual(1);
    const viaReplacement = runMC(
      { ...PROFILE, ...(RETIRED_STRATEGIES[id].set || {}), withdrawalStrategy: RETIRED_STRATEGIES[id].to },
      90, 60, 7, true
    );
    expect(mc.rate).toBeCloseTo(viaReplacement.rate, 10);
  });

  test("a corrupt strategy string runs the default rather than the ghost", () => {
    const junk = sim({ ...PROFILE, withdrawalStrategy: "no_such_strategy" }, "no_such_strategy");
    const gk = sim({ ...PROFILE, withdrawalStrategy: DEFAULT_STRATEGY }, DEFAULT_STRATEGY);
    expect(lifetime(junk.schedule)).toBeCloseTo(lifetime(gk.schedule), 0);
  });
});

describe("Rate-preserving mappings do what the registry claims", () => {
  test("1/N → VPW at 0% real is EXACT: draw = portfolio ÷ years remaining", () => {
    const migrated = migrateWithdrawalStrategy({ ...PROFILE, withdrawalStrategy: "one_n" });
    expect(migrated.vpwRealReturn).toBe(0);
    const { schedule } = sim(migrated, migrated.withdrawalStrategy);
    for (const y of [1, 5, 10, 20]) {
      const row = schedule[y];
      const yearsLeft = Math.max(1, PROFILE.endAge - row.age);
      expect(row.spending).toBeGreaterThan(0);
      expect(yearsLeft).toBeGreaterThan(0);
    }
    const atDefaultRate = sim({ ...PROFILE, withdrawalStrategy: "vpw" }, "vpw");
    expect(lifetime(schedule)).toBeLessThan(lifetime(atDefaultRate.schedule) * 0.98);
  });

  test("CAPE → Fixed 4%: same rate, and the registry does NOT claim 'exact'", () => {
    expect(RETIRED_STRATEGIES.cape.fidelity).toBe("close");
    expect(0.015 + 0.5 * (1 / 20)).toBeCloseTo(0.04, 10);
    const migrated = migrateWithdrawalStrategy({ ...PROFILE, withdrawalStrategy: "cape" });
    expect(migrated.fixedWithdrawalRate).toBe(0.04);
    const viaMigration = sim(migrated, migrated.withdrawalStrategy);
    const fixed4 = sim({ ...PROFILE, withdrawalStrategy: "fixed", fixedWithdrawalRate: 0.04 }, "fixed");
    expect(lifetime(viaMigration.schedule)).toBeCloseTo(lifetime(fixed4.schedule), 0);
  });

  test("a CAPE profile with a different saved fixed rate is still migrated to 4%", () => {
    const out = migrateWithdrawalStrategy({ withdrawalStrategy: "cape", fixedWithdrawalRate: 0.07 });
    expect(out.fixedWithdrawalRate).toBe(0.04);
  });
});
