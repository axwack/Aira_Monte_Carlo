// Golden master for the Monte Carlo engine. Pins fixed-seed runMC output so a
// refactor (e.g. splitting App.jsx by feature seam) cannot silently change the
// money math. If a number moves, either the refactor broke something or the
// change is intended: in that case review the diff, then `npm test -- -u goldenMaster`.
import { runMC } from "./App";

const ACCOUNTS = [
  { id: "t1", category: "pretax",  name: "401k",    balance: 1_000_000 },
  { id: "t2", category: "roth",    name: "Roth",    balance:   400_000 },
  { id: "t3", category: "taxable", name: "Taxable", balance:   150_000 },
  { id: "t4", category: "cash",    name: "Cash",    balance:    50_000 },
];
const BASE = {
  currentAge: 65, retireAge: 65, endAge: 90,
  sp: 80_000, ssAge: 67, ssb: 24_000, ssCola: 2.4,
  ab: 0, inf: 2.5, filingStatus: "mfj", stateOfResidence: "FL",
  twoHousehold: false, useJointRmdTable: false,
  gkFloor: 48_000, gkCeiling: 115_000, withdrawalBracketTarget: "22",
  irmaaGuard: false, ssTorpedoGuard: true, rothEmergencyReserve: 0, gr: 0.07,
  accounts: ACCOUNTS,
};

const SCENARIOS = {
  base: BASE,
  highSpend: { ...BASE, sp: 140_000 },
  accumulating: { ...BASE, currentAge: 50, retireAge: 65, ab: 30_000 },
  single: { ...BASE, filingStatus: "single", ssb: 18_000 },
};

// Round so float noise across Node versions cannot fail the pin; real drift is far larger.
const r = (x) => (typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x);
const headline = (m) => ({
  rate: r(m.rate), mwRate: r(m.mwRate), medR: r(m.medR),
  medianExhaustAge: m.medianExhaustAge ?? null,
  term: Object.fromEntries(Object.entries(m.term).map(([k, v]) => [k, Math.round(v)])),
  N: m.N,
});

describe("golden master: fixed-seed runMC", () => {
  for (const [name, p] of Object.entries(SCENARIOS)) {
    test(name, () => {
      expect(headline(runMC(p, 90, 300, 42, true))).toMatchSnapshot();
    });
  }
});
