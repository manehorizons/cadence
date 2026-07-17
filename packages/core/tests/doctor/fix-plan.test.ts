import { describe, it, expect } from 'vitest';
import { pass, fail, rollup } from '../../src/doctor/model.js';
import { planFixes } from '../../src/doctor/fix.js';

// Phase 131 AC-1: the pure planner turns a DoctorReport into a classified fix
// plan — only failing checks, each tagged auto | wire-host | manual by `fixId`.
describe('planFixes (131 AC-1)', () => {
  it('AC-1: includes only non-ok checks', () => {
    const report = rollup([
      pass('node', 'fine'),
      fail('git-hooks', 'warning', 'unset', 'Run `git config core.hooksPath .githooks`.', 'git-hooks'),
    ]);
    expect(planFixes(report).actions.map((a) => a.check)).toEqual(['git-hooks']);
  });

  it('AC-1: git-hooks and state-md classify as auto', () => {
    const report = rollup([
      fail('git-hooks', 'warning', 'd', 'r', 'git-hooks'),
      fail('state', 'warning', 'd', 'r', 'state-md'),
    ]);
    expect(planFixes(report).actions.every((a) => a.kind === 'auto')).toBe(true);
  });

  it('AC-1 (phase 190): handoff-retention classifies as auto', () => {
    const report = rollup([
      fail('handoff-retention', 'warning', 'd', 'r', 'handoff-retention'),
    ]);
    const [action] = planFixes(report).actions;
    expect(action?.kind).toBe('auto');
    expect(action?.fixId).toBe('handoff-retention');
  });

  it('AC-3 (phase 190): a passing handoff-retention check yields no handoff-retention action', () => {
    const report = rollup([
      pass('node', 'fine'),
      pass('handoff-retention', '3 handoff doc(s); retention disabled (set handoff.retain to cap growth).'),
      fail('git-hooks', 'warning', 'd', 'r', 'git-hooks'),
    ]);
    expect(planFixes(report).actions.some((a) => a.check === 'handoff-retention')).toBe(false);
  });

  it('AC-1: host-install classifies as wire-host', () => {
    const report = rollup([fail('host-hooks', 'warning', 'd', 'r', 'host-install')]);
    const [action] = planFixes(report).actions;
    expect(action?.kind).toBe('wire-host');
    expect(action?.fixId).toBe('host-install');
  });

  it('AC-1: a failing check with no fixId classifies as manual and carries its remediation', () => {
    const report = rollup([
      fail('verification-readiness', 'warning', 'mock', 'Run `cadence activate`.'),
    ]);
    const [action] = planFixes(report).actions;
    expect(action?.kind).toBe('manual');
    expect(action?.fixId).toBeNull();
    expect(action?.detail).toContain('cadence activate');
  });

  it('AC-1: preserves report order across mixed kinds', () => {
    const report = rollup([
      fail('git-hooks', 'warning', 'd', 'r', 'git-hooks'),
      fail('host-hooks', 'warning', 'd', 'r', 'host-install'),
      fail('worktree-phases', 'warning', 'd', 'renumber'),
    ]);
    expect(planFixes(report).actions.map((a) => [a.check, a.kind])).toEqual([
      ['git-hooks', 'auto'],
      ['host-hooks', 'wire-host'],
      ['worktree-phases', 'manual'],
    ]);
  });
});
