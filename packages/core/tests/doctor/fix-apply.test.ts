import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { runDoctor } from '../../src/doctor/run.js';
import { planFixes, applyFixes, type FixPlan } from '../../src/doctor/fix.js';

const ENV = { nodeVersion: process.versions.node, platform: process.platform };
let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

// Phase 131 AC-2: the in-process auto repairs actually change the repo and the
// finding clears on a fresh run; failures are best-effort (reported, not thrown).
describe('applyFixes auto repairs (131 AC-2)', () => {
  it('AC-2: git-hooks repair sets core.hooksPath=.githooks and clears the finding', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    // Phase 133: the git-hooks check is only auto-fixable when .githooks/ exists.
    await mkdir(join(active.root, '.githooks'), { recursive: true });

    const plan = planFixes(await runDoctor(active.root, ENV));
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });

    const hooksPath = execFileSync('git', ['config', '--local', 'core.hooksPath'], {
      cwd: active.root,
    })
      .toString()
      .trim();
    expect(hooksPath).toBe('.githooks');
    expect(outcomes.find((o) => o.fixId === 'git-hooks')?.status).toBe('applied');

    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'git-hooks')?.severity).toBe('ok');
  });

  it('AC-2: state-md repair regenerates STATE.md without rewriting state.json', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.cadence', 'state.json');
    const stateBefore = await readFile(statePath, 'utf8');
    await rm(join(active.root, '.cadence', 'STATE.md'));

    const plan = planFixes(await runDoctor(active.root, ENV));
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });

    expect(existsSync(join(active.root, '.cadence', 'STATE.md'))).toBe(true);
    expect(outcomes.find((o) => o.fixId === 'state-md')?.status).toBe('applied');
    expect(await readFile(statePath, 'utf8')).toBe(stateBefore);

    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'state')?.severity).toBe('ok');
  });

  it('AC-2: a failing repair is reported best-effort without throwing', async () => {
    active = await tempRepo({ initialized: true }); // no .git → git config fails
    const plan: FixPlan = {
      actions: [
        { check: 'git-hooks', kind: 'auto', fixId: 'git-hooks', title: 't', detail: 'd' },
      ],
    };
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });
    expect(outcomes[0]?.status).toBe('failed');
    expect(outcomes[0]?.message.length).toBeGreaterThan(0);
  });
});
