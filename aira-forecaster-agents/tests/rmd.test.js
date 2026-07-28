// tests/rmd.test.js
import { describe, it, expect } from 'vitest';
import { buildRothExplorer } from '../src/engine/buildRothExplorer.js';

describe('RMD calculations', () => {
  it('should start RMD at age 75 (SECURE 2.0)', () => {
    const res = buildRothExplorer({ });
    // the first year with rmd > 0 in the "cur" (no conversion) scenario
    const firstRmdRow = res.cur.rows.find(r => r.rmd > 0);
    expect(firstRmdRow?.age).toBe(75);
  });

  it('should use Joint Life divisor when flagged', () => {
    const resJoint = buildRothExplorer({ useJointRmdTable: true });
    const resUniform = buildRothExplorer({ useJointRmdTable: false });
    const rmdJoint = resJoint.cur.rows.find(r => r.age === 75)?.rmd || 0;
    const rmdUniform = resUniform.cur.rows.find(r => r.age === 75)?.rmd || 0;
    expect(rmdJoint).toBeLessThan(rmdUniform);
  });
});