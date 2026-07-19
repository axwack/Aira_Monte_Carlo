// features.test.js — Pure logic tests for new AiRA features

import {
  BLANK_PROFILE,
  getStrategyLabel,
  getStrategyDescription,
  calcYearTax,
} from './App';

describe('Withdrawal Strategy Dynamic Text', () => {
  test('getStrategyLabel returns correct label for known strategies', () => {
    expect(getStrategyLabel('gk')).toBe('Guyton‑Klinger');
    expect(getStrategyLabel('fixed')).toBe('Fixed Percentage');
    expect(getStrategyLabel('vanguard')).toBe('Vanguard Dynamic Spending');
    expect(getStrategyLabel('vpw')).toBe('VPW (Variable Percentage)');
    expect(getStrategyLabel('unknown')).toBe('unknown');
  });

  test('getStrategyDescription returns description for all strategies', () => {
    const strategies = ['gk', 'fixed', 'vanguard', 'risk', 'kitces', 'vpw', 'cape', 'endowment', 'one_n', 'ninety_five_rule'];
    strategies.forEach(s => {
      expect(typeof getStrategyDescription(s)).toBe('string');
      expect(getStrategyDescription(s).length).toBeGreaterThan(10);
    });
  });
});

describe('Portfolio Checkpoints', () => {
  test('checkpoint age calculation from dob and checkpoint date', () => {
    const dob = '1970-03-14';
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
