import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { runDoctor } from '../../src/doctor/run.js';
import { planFixes, applyFixes } from '../../src/doctor/fix.js';

const ENV = { nodeVersion: process.versions.node, platform: process.platform };

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

// Phase 133 (rec-20260701-002 / audit F2): checkGitHooks previously warned
// (and --fix auto-applied) whenever core.hooksPath wasn't ".githooks",
// without ever checking that a .githooks/ directory actually exists, and
// without distinguishing "unset" from "already set to something else" —
// so --fix could point hooksPath at a nonexistent target, or silently
// clobber a Husky-style custom hooksPath.
describe('doctor git-hooks guard (133 AC-1/AC-2/AC-3)', () => {
  it('AC-1: no .githooks/ dir + hooksPath unset → pass (not-applicable), not a warning', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    // Deliberately no .githooks/ directory created.

    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'git-hooks');
    expect(check?.severity).toBe('ok');
    expect(check?.detail).toMatch(/not applicable/i);

    const plan = planFixes(report);
    expect(plan.actions.find((a) => a.check === 'git-hooks')).toBeUndefined();
  });

  it('AC-2: pre-existing custom hooksPath is never auto-overwritten', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    execFileSync('git', ['config', '--local', 'core.hooksPath', '.husky'], {
      cwd: active.root,
    });

    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'git-hooks');
    expect(check?.severity).toBe('warning');

    const plan = planFixes(report);
    const action = plan.actions.find((a) => a.check === 'git-hooks');
    expect(action?.kind).toBe('manual');

    await applyFixes(active.root, plan, { wireHost: false });
    const hooksPathAfter = execFileSync(
      'git',
      ['config', '--local', 'core.hooksPath'],
      { cwd: active.root },
    )
      .toString()
      .trim();
    expect(hooksPathAfter).toBe('.husky');
  });

  it('AC-3: happy path unchanged — .githooks/ present + hooksPath unset still warns and auto-fixes', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    await mkdir(join(active.root, '.githooks'), { recursive: true });
    await writeFile(join(active.root, '.githooks', 'pre-push'), '#!/bin/sh\n');

    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'git-hooks');
    expect(check?.severity).toBe('warning');

    const plan = planFixes(report);
    const action = plan.actions.find((a) => a.check === 'git-hooks');
    expect(action?.kind).toBe('auto');

    await applyFixes(active.root, plan, { wireHost: false });
    const hooksPathAfter = execFileSync(
      'git',
      ['config', '--local', 'core.hooksPath'],
      { cwd: active.root },
    )
      .toString()
      .trim();
    expect(hooksPathAfter).toBe('.githooks');
  });

  it('AC-3: happy path unchanged — hooksPath already .githooks → ok', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
      cwd: active.root,
    });

    const report = await runDoctor(active.root, ENV);
    expect(report.checks.find((c) => c.name === 'git-hooks')?.severity).toBe(
      'ok',
    );
  });
});
