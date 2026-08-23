import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { pass, fail } from '../../src/doctor/model.js';
import { runDoctor } from '../../src/doctor/run.js';

const ENV = { nodeVersion: process.versions.node, platform: process.platform };

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

// Phase 131 AC-1: each check that has a deterministic repair tags itself with a
// stable `fixId`, so the fix-planner classifies by id rather than parsing detail
// strings. `pass()` and non-repairable failures carry `fixId: null`.
describe('doctor fixId tagging (131 AC-1)', () => {
  it('AC-1: pass() carries fixId null', () => {
    expect(pass('node', 'fine').fixId).toBeNull();
  });

  it('AC-1: fail() defaults fixId to null but accepts a repair id', () => {
    expect(fail('x', 'warning', 'd', 'r').fixId).toBeNull();
    expect(fail('git-hooks', 'warning', 'd', 'r', 'git-hooks').fixId).toBe('git-hooks');
  });

  it('AC-1: git-hooks failure is tagged fixId git-hooks', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    // Phase 133: the git-hooks check is only auto-fixable when .githooks/ exists.
    await mkdir(join(active.root, '.githooks'), { recursive: true });
    const report = await runDoctor(active.root, ENV);
    const c = report.checks.find((x) => x.name === 'git-hooks');
    expect(c?.severity).toBe('warning');
    expect(c?.fixId).toBe('git-hooks');
  });

  it('AC-1: missing STATE.md is tagged fixId state-md', async () => {
    active = await tempRepo({ initialized: true });
    await rm(join(active.root, '.cadence', 'STATE.md'));
    const report = await runDoctor(active.root, ENV);
    const c = report.checks.find((x) => x.name === 'state');
    expect(c?.severity).toBe('warning');
    expect(c?.fixId).toBe('state-md');
  });

  it('AC-1: missing managed host-hooks is tagged fixId host-install', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.claude'), { recursive: true });
    await writeFile(join(active.root, '.claude', 'settings.json'), '{}');
    const report = await runDoctor(active.root, ENV);
    const c = report.checks.find((x) => x.name === 'host-hooks');
    // Phase 295: a settings.json with no hooks at all is missing every
    // expected managed entry -- now error, not warning.
    expect(c?.severity).toBe('error');
    expect(c?.fixId).toBe('host-install');
  });

  it('AC-1: non-portable host-commands is tagged fixId host-install', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.claude', 'commands');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'cadence-progress.md'),
      '<!-- managed-by: cadence -->\n\n!node /abs/path/cli/index.js progress\n',
    );
    const report = await runDoctor(active.root, ENV);
    const c = report.checks.find((x) => x.name === 'host-commands');
    expect(c?.severity).toBe('warning');
    expect(c?.fixId).toBe('host-install');
  });
});
