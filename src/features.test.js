// features.test.js — Pure logic tests for new AiRA features

import {
  BLANK_PROFILE,
  getStrategyLabel,
  getStrategyDescription,
  calcYearTax,
} from './App';
import { LIVE_STRATEGIES, RETIRED_STRATEGIES, resolveStrategy } from './engine/withdrawalStrategies.js';

const RETIRED_IDS = Object.keys(RETIRED_STRATEGIES);

describe('Withdrawal Strategy Dynamic Text', () => {
  test('getStrategyLabel returns correct label for known strategies', () => {
    expect(getStrategyLabel('gk')).toBe('Guyton‑Klinger');
    expect(getStrategyLabel('fixed')).toBe('Fixed Percentage');
    expect(getStrategyLabel('vpw')).toBe('VPW (Variable Percentage)');
    // Retired ids keep their labels — a migration notice and a saved report
    // both have to be able to name what the user used to have.
    expect(getStrategyLabel('vanguard')).toBe('Vanguard Dynamic Spending');
    expect(getStrategyLabel('unknown')).toBe('unknown');
  });

  test('getStrategyDescription returns a description for every live strategy', () => {
    LIVE_STRATEGIES.forEach(s => {
      expect(typeof getStrategyDescription(s)).toBe('string');
      expect(getStrategyDescription(s).length).toBeGreaterThan(10);
    });
  });

  test('getStrategyDescription resolves a retired id instead of falling through', () => {
    // Retired ids have no description of their own; they must describe the
    // strategy the plan will ACTUALLY run, not silently default to GK's text.
    RETIRED_IDS.forEach(s => {
      expect(getStrategyDescription(s)).toBe(getStrategyDescription(resolveStrategy(s)));
      expect(getStrategyDescription(s).length).toBeGreaterThan(10);
    });
  });
});

describe('Portfolio Checkpoints', () => {
  test('checkpoint age calculation from dob and checkpoint date', () => {
    const dob = '1970-01-01';
    const checkpointDate = '2026-04-20';
    const birth = new Date(dob);
    const check = new Date(checkpointDate);
    let age = check.getFullYear() - birth.getFullYear();
    const monthDay = `${check.getMonth()}-${check.getDate()}`;
    const birthMonthDay = `${birth.getMonth()}-${birth.getDate()}`;
    if (monthDay < birthMonthDay) age--;
    expect(age).toBe(56);
  });

  test('checkpoint color logic (green/yellow/red/gray)', () => {
    const getColor = (val, p50, p25) => {
      if (p50 === undefined) return '#64748b';
      if (val >= p50) return '#10b981';
      if (val <= p25) return '#ef4444';
      return '#fbbf24';
    };
    expect(getColor(2_500_000, 2_400_000, 2_000_000)).toBe('#10b981');
    expect(getColor(2_100_000, 2_400_000, 2_000_000)).toBe('#fbbf24');
    expect(getColor(1_800_000, 2_400_000, 2_000_000)).toBe('#ef4444');
    expect(getColor(2_500_000, undefined, undefined)).toBe('#64748b');
  });
});

describe('FanChart Reference Lines', () => {
  test('maxY calculation includes portfolioGoal and earlyRetireTarget', () => {
    const data = [
      { p90: 3_000_000, p75: 2_500_000, p50: 2_000_000 },
      { p90: 3_500_000, p75: 3_000_000, p50: 2_500_000 },
    ];
    const portfolioGoal = 2_000_000;
    const earlyRetireTarget = 3_500_000;
    const maxPortfolio = Math.max(...data.map(d => Math.max(d.p90, d.p75, d.p50)));
    const maxY = Math.max(maxPortfolio, portfolioGoal, earlyRetireTarget) * 1.05;
    expect(maxY).toBe(3_500_000 * 1.05);
  });
});

describe('Fixed Withdrawal Rate Editing', () => {
  test('fixedWithdrawalRate defaults to 4.0 in BLANK_PROFILE', () => {
    expect(BLANK_PROFILE.fixedWithdrawalRate).toBe(4.0);
  });

  test('params uses fixedWithdrawalRate from assumptions', () => {
    const assumptions = { fixedWithdrawalRate: 3.5 };
    const fixedWithdrawalRate = (assumptions.fixedWithdrawalRate || 4.0) / 100;
    expect(fixedWithdrawalRate).toBe(0.035);
  });
});

describe('TwoHousehold Toggle and State Tax', () => {
  test('twoHousehold ON → state tax skipped', () => {
    const taxResult = calcYearTax(65, 2026, 100_000, 20_000, 0, 0, 0, true, 0.025, 'mfj', 'CA');
    expect(taxResult.stateTax).toBe(0);
  });

  test('twoHousehold OFF → state tax applied based on stateOfResidence', () => {
    const caTax = calcYearTax(65, 2026, 100_000, 20_000, 0, 0, 0, false, 0.025, 'mfj', 'CA');
    const flTax = calcYearTax(65, 2026, 100_000, 20_000, 0, 0, 0, false, 0.025, 'mfj', 'FL');
    expect(caTax.stateTax).toBeGreaterThan(0);
    expect(flTax.stateTax).toBe(0);
  });
});

describe('Profile Import/Export', () => {
  test('export includes all new fields', () => {
    const profile = {
      ...BLANK_PROFILE,
      checkpoints: [{ id: '1', date: '2026-01-01', value: 500_000, note: 'test' }],
      portfolioGoal: 2_000_000,
      earlyRetireTarget: 3_000_000,
      fixedWithdrawalRate: 3.8,
      withdrawalStrategy: 'fixed',
    };
    const json = JSON.stringify(profile);
    const parsed = JSON.parse(json);
    expect(parsed.checkpoints).toHaveLength(1);
    expect(parsed.portfolioGoal).toBe(2_000_000);
    expect(parsed.earlyRetireTarget).toBe(3_000_000);
    expect(parsed.fixedWithdrawalRate).toBe(3.8);
    expect(parsed.withdrawalStrategy).toBe('fixed');
  });

  test('import with missing new fields uses defaults', () => {
    const oldProfile = {
      name: 'Old',
      port: 400_000,
      sp: 50_000,
    };
    const merged = {
      ...BLANK_PROFILE,
      ...oldProfile,
      checkpoints: Array.isArray(oldProfile.checkpoints) ? oldProfile.checkpoints : [],
      portfolioGoal: oldProfile.portfolioGoal ?? 3_200_000,
      earlyRetireTarget: oldProfile.earlyRetireTarget ?? 3_500_000,
      fixedWithdrawalRate: oldProfile.fixedWithdrawalRate ?? 4.0,
      withdrawalStrategy: oldProfile.withdrawalStrategy ?? 'gk',
    };
    expect(merged.portfolioGoal).toBe(3_200_000);
    expect(merged.checkpoints).toEqual([]);
  });

  /* Progress check-ins (LS_CHECKINS_KEY) are NOT part of `assumptions`, so the
   * "spread everything so nothing is silently omitted" export missed them
   * entirely: exporting a profile, moving machines and importing it dropped the
   * whole journal without a word. The only export that carried them was a second
   * button on the Progress tab.
   *
   * The two tests above did not catch it because they round-trip a hand-built
   * literal through JSON.stringify rather than inspecting the payload the app
   * actually writes — so they pass no matter what the export button omits. These
   * read the real call site.
   *
   * Note `checkIns` (progress journal) is a different thing from `checkpoints`
   * (portfolio value snapshots, which live in assumptions and always exported).
   */
  const fs   = require('fs');
  const path = require('path');
  const SRC  = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8');

  test('the export payload carries the progress check-ins', () => {
    // Anchored on the BUTTON, not on `exportProfile(` — that string also matches
    // the function definition ~10k lines earlier, and the resulting slice sweeps
    // up an unrelated `checkIns,` prop destructure, so the assertion would pass
    // whatever the export omits. An inert guard is worse than none.
    const i = SRC.indexOf('title="Export profile to JSON"');
    expect(i).toBeGreaterThan(-1);
    const j = SRC.indexOf('⬇ Export', i);
    expect(j).toBeGreaterThan(i);
    expect(SRC.slice(i, j)).toMatch(/^\s*checkIns,\s*$/m);
  });

  test('import restores them by MERGING, so it cannot delete local history', () => {
    const i = SRC.indexOf('importProfile((rawData)');
    expect(i).toBeGreaterThan(-1);
    const handler = SRC.slice(i, i + 2000);
    expect(handler).toContain('data.checkIns');
    // Merge, not replace: a profile imported onto a machine with its own journal
    // must not wipe entries that exist only there.
    expect(handler).toContain('handleImportCheckIns');
    expect(handler).not.toMatch(/setCheckIns\(\s*data\.checkIns\s*\)/);
  });
});

describe('Bucket Tab Sliders', () => {
  test('bucket percentages sum to 100', () => {
    const pct1 = 10;
    const pct2 = 20;
    const pct3 = Math.max(0, 100 - pct1 - pct2);
    expect(pct1 + pct2 + pct3).toBe(100);
  });

  test('dollar targets calculate correctly', () => {
    const port = 1_000_000;
    const pct1 = 6;
    const pct2 = 16;
    const pct3 = 78;
    const target1 = (port * pct1) / 100;
    const target2 = (port * pct2) / 100;
    const target3 = (port * pct3) / 100;
    expect(target1).toBe(60_000);
    expect(target2).toBe(160_000);
    expect(target3).toBe(780_000);
  });
});

describe('Success Rate Tooltip', () => {
  test('tooltip text explains success rate includes expenses and taxes', () => {
    const endAge = 90;
    const tooltip = `Percentage of simulations where your portfolio lasted to age ${endAge}, after all spending, taxes, healthcare shocks, and modeled expenses.`;
    expect(tooltip).toContain('healthcare shocks');
    expect(tooltip).toContain(endAge.toString());
  });
});
// ─── Progress check-ins (v1.1.0.31) ────────────────────────────────────────────

describe('Progress check-ins — storage + rendering', () => {
  const { loadCheckIns, saveCheckIns, ProgressTab } = require('./App');
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { act } = require('react-dom/test-utils');
  global.IS_REACT_ACT_ENVIRONMENT = true;

  const renderToDiv = (el) => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    act(() => { createRoot(div).render(el); });
    return div;
  };

  beforeEach(() => localStorage.removeItem('aira_checkins_v1'));

  test('loadCheckIns returns [] when nothing is stored', () => {
    expect(loadCheckIns()).toEqual([]);
  });

  test('loadCheckIns returns [] on corrupt or non-array data', () => {
    localStorage.setItem('aira_checkins_v1', '{not json');
    expect(loadCheckIns()).toEqual([]);
    localStorage.setItem('aira_checkins_v1', '{"a":1}');
    expect(loadCheckIns()).toEqual([]);
  });

  test('save/load round-trips a check-in entry', () => {
    const entry = { id: 'ci_1', ts: '2026-07-11T12:00:00Z', successRate: 0.91, port: 800_000, sp: 72_000, retireAge: 62, endAge: 90, medianTerminal: 1_200_000 };
    expect(saveCheckIns([entry])).toBe(true);
    expect(loadCheckIns()).toEqual([entry]);
  });

  test('ProgressTab shows the empty state with no check-ins', () => {
    const div = renderToDiv(React.createElement(ProgressTab, { checkIns: [], onDelete: () => {} }));
    expect(div.textContent).toContain('Start your journey');
  });

  test('ProgressTab renders history rows and summary for saved check-ins', () => {
    const checkIns = [
      { id: 'ci_1', ts: '2026-01-05T12:00:00Z', successRate: 0.85, port: 700_000, sp: 70_000, retireAge: 62, endAge: 90, medianTerminal: 900_000 },
      { id: 'ci_2', ts: '2026-07-11T12:00:00Z', successRate: 0.91, port: 800_000, sp: 72_000, retireAge: 62, endAge: 90, medianTerminal: 1_100_000 },
    ];
    const div = renderToDiv(React.createElement(ProgressTab, { checkIns, onDelete: () => {} }));
    expect(div.textContent).toContain('Latest success rate');
    expect(div.textContent).toContain('91.0%');
    expect(div.textContent).toContain('+6.0pp');
    expect(div.textContent).toContain('Check-in history');
  });
});

// ─── Plan shape + progress import/export (v1.2.4) ──────────────────────────────

describe('Plan shape scores + check-in merge', () => {
  const { planShapeScores, mergeCheckIns } = require('./App');

  test('planShapeScores maps a snapshot onto absolute 0-100 axes', () => {
    const s = planShapeScores({ successRate: 0.9, stressRate: 0.75, retireAge: 62.5, sp: 40_000, port: 1_000_000, medianTerminal: 500_000 });
    expect(s.confidence).toBe(90);
    expect(s.resilience).toBe(75);
    expect(s.retireBy).toBe(50);          // (75 − 62.5) / 25 × 100
    expect(s.spend).toBe(100);            // 4% × $1M = $40K = target → capped at 100
    expect(s.legacy).toBe(50);            // $500K / $1M
  });

  test('planShapeScores clamps to [0,100] and tolerates missing fields', () => {
    const s = planShapeScores({});
    for (const k of ['confidence', 'retireBy', 'spend', 'legacy', 'resilience']) {
      expect(s[k]).toBeGreaterThanOrEqual(0);
      expect(s[k]).toBeLessThanOrEqual(100);
    }
    expect(planShapeScores({ retireAge: 45 }).retireBy).toBe(100);
    expect(planShapeScores({ medianTerminal: 5_000_000 }).legacy).toBe(100);
  });

  test('mergeCheckIns dedupes by id (local wins), sorts by timestamp, skips junk', () => {
    const local = [{ id: 'a', ts: '2026-03-01T00:00:00Z', name: 'kept' }];
    const imported = [
      { id: 'a', ts: '2026-03-01T00:00:00Z', name: 'overwritten?' },
      { id: 'b', ts: '2026-01-01T00:00:00Z' },
      { notAnEntry: true },
      null,
    ];
    const merged = mergeCheckIns(local, imported);
    expect(merged.map(c => c.id)).toEqual(['b', 'a']);
    expect(merged.find(c => c.id === 'a').name).toBe('kept');
  });
});

// ─── Age input bounds (v1.2.40) ────────────────────────────────────────────────
// A user reported Social Security "capped at 68". These lock the statutory
// claiming window so no future UI edit can silently narrow it again — the same
// way the retire-age slider once capped at 68 while the wizard allowed 100.

describe('AGE_LIMITS — statutory Social Security claiming window', () => {
  const { AGE_LIMITS } = require('./App');

  test('SS claiming runs 62 through 70 — delayed credits stop at 70, never 68', () => {
    expect(AGE_LIMITS.ss.min).toBe(62);
    expect(AGE_LIMITS.ss.max).toBe(70);
  });

  test('retirement age reaches at least 70 so delayed SS is modelable', () => {
    expect(AGE_LIMITS.retire.max).toBeGreaterThanOrEqual(70);
  });

  test('every age range is well-formed (min < max)', () => {
    for (const [key, r] of Object.entries(AGE_LIMITS)) {
      expect(typeof r.min).toBe('number');
      expect(typeof r.max).toBe('number');
      expect(r.min).toBeLessThan(r.max);
    }
  });
});

// ─── InfoIcon (v1.2.42) ────────────────────────────────────────────────────────
// The Unicode "ⓘ" it replaces rendered at whatever weight and baseline the
// resolving font chose, so it looked thin and misaligned at 10-11px. These lock
// the vector in: no font dependency, scales, and inherits colour.

describe('InfoIcon — SVG info affordance', () => {
  const { InfoIcon, InfoDot } = require('./App');
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { act } = require('react-dom/test-utils');
  global.IS_REACT_ACT_ENVIRONMENT = true;

  const renderToDiv = (el) => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    act(() => { createRoot(div).render(el); });
    return div;
  };

  test('renders an svg, not a text glyph', () => {
    const div = renderToDiv(React.createElement(InfoIcon, {}));
    expect(div.querySelector('svg')).not.toBeNull();
    expect(div.textContent).not.toContain('ⓘ');
  });

  test('honours the size prop and keeps a square viewBox', () => {
    const div = renderToDiv(React.createElement(InfoIcon, { size: 20 }));
    const svg = div.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('height')).toBe('20');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
  });

  test('inherits colour via currentColor so callers keep styling with `color`', () => {
    const div = renderToDiv(React.createElement(InfoIcon, {}));
    expect(div.innerHTML).toContain('currentColor');
  });

  test('InfoDot exposes its explanation as a tooltip', () => {
    const div = renderToDiv(React.createElement(InfoDot, { title: 'Explains the number' }));
    expect(div.querySelector('[title="Explains the number"]')).not.toBeNull();
    expect(div.querySelector('svg')).not.toBeNull();
  });
});
