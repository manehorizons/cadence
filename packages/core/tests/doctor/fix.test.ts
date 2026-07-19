import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { CadenceStateZ, emptyState } from '@manehorizons/cadence-types';
import { runDoctor } from '../../src/doctor/run.js';
import { planFixes, applyFixes } from '../../src/doctor/fix.js';

const ENV = { nodeVersion: process.versions.node, platform: process.platform };
const GIT_COMMIT_IDENTITY = ['-c', 'user.email=cadence-test@example.com', '-c', 'user.name=Cadence Test'];

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/** git-init + commit a fixture's `.cadence/state.json` so it is tracked (with real history, not just staged). */
function seedTrackedState(root: string): void {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.cadence/state.json'], { cwd: root });
  execFileSync('git', [...GIT_COMMIT_IDENTITY, 'commit', '-q', '-m', 'seed tracked state'], {
    cwd: root,
  });
}

// Phase 196 (issue #177), AC-3: `doctor --fix` writes the missing `.gitignore`
// entries and stages the tracked CADENCE-owned paths for removal via
// `git rm --cached`, without committing anything automatically.
describe('applyFixes — untrack-state repair (phase 196, issue #177, AC-3)', () => {
  it('AC-3: gitignores all four entries and stages the tracked path for removal, nothing committed', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-untrack-state' });
    seedTrackedState(active.root);

    const before = await runDoctor(active.root, ENV);
    expect(before.checks.find((c) => c.name === 'state-tracked')?.severity).toBe('warning');

    const plan = planFixes(before);
    const action = plan.actions.find((a) => a.fixId === 'untrack-state');
    expect(action?.kind).toBe('auto');

    const outcomes = await applyFixes(active.root, plan, { wireHost: false });
    expect(outcomes.find((o) => o.fixId === 'untrack-state')?.status).toBe('applied');

    const gitignore = await readFile(join(active.root, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.cadence/state.json');
    expect(gitignore).toContain('.cadence/STATE.md');
    expect(gitignore).toContain('.cadence/mcp-trust.json');
    expect(gitignore).toContain('.cadence/intelligence/context/');

    // No longer tracked (staged for removal from the index).
    const tracked = execFileSync('git', ['ls-files', '--', '.cadence/state.json'], {
      cwd: active.root,
    })
      .toString()
      .trim();
    expect(tracked).toBe('');

    // Staged deletion, nothing committed — HEAD is still the seed commit.
    const status = execFileSync('git', ['status', '--short'], { cwd: active.root }).toString();
    expect(status).toMatch(/^D {2}\.cadence\/state\.json/m);
    const commitCount = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: active.root,
    })
      .toString()
      .trim();
    expect(commitCount).toBe('1'); // still just the seed commit — no auto-commit

    // The finding clears on a fresh run.
    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'state-tracked')?.severity).toBe('ok');
  });

  it('AC-3: a true no-op when nothing is tracked — no untrack-state action is produced', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-untrack-state-clean' });
    execFileSync('git', ['init', '-q'], { cwd: active.root });

    const before = await runDoctor(active.root, ENV);
    expect(before.checks.find((c) => c.name === 'state-tracked')?.severity).toBe('ok');

    const plan = planFixes(before);
    expect(plan.actions.some((a) => a.fixId === 'untrack-state')).toBe(false);

    const outcomes = await applyFixes(active.root, plan, { wireHost: false });
    expect(outcomes.some((o) => o.fixId === 'untrack-state')).toBe(false);
  });

  it('AC-3: a failing untrack-state repair (unwritable .gitignore) is reported best-effort without throwing', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-untrack-state-badgitignore' });
    seedTrackedState(active.root);
    // Make `.gitignore` a directory so `ensureGitignoreEntries` cannot write it —
    // forces the repair to fail without the whole `--fix` run throwing.
    await mkdir(join(active.root, '.gitignore'));

    const before = await runDoctor(active.root, ENV);
    const plan = planFixes(before);
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });

    const outcome = outcomes.find((o) => o.fixId === 'untrack-state');
    expect(outcome?.status).toBe('failed');
    expect(outcome?.message.length).toBeGreaterThan(0);
  });
});

// Phase 196 (issue #177), T5: `doctor --fix --resolve-state-conflict=local|incoming`
// actually acts on T4's diagnosis — writes the chosen side through the normal
// `SimpleStateBackend.commit()` path, regenerating STATE.md correctly.
describe('applyFixes — resolve-state-conflict repair (phase 196, issue #177, AC-5)', () => {
  function conflictBody(local: unknown, incoming: unknown): string {
    return [
      '<<<<<<< HEAD',
      JSON.stringify(local, null, 2),
      '=======',
      JSON.stringify(incoming, null, 2),
      '>>>>>>> worktree-branch',
      '',
    ].join('\n');
  }

  async function seedConflict(root: string, local: unknown, incoming: unknown): Promise<void> {
    await writeFile(join(root, '.cadence', 'state.json'), conflictBody(local, incoming));
  }

  it('AC-5: classified manual in the plan — never auto-applied by a bare --fix', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-resolve-conflict-plan' });
    const base = emptyState('fix-resolve-conflict-plan');
    await seedConflict(
      active.root,
      { ...base, activePhase: '10', loopPosition: 'BUILD' as const },
      { ...base, activePhase: '11', loopPosition: 'SETTLE' as const },
    );

    const report = await runDoctor(active.root, ENV);
    const plan = planFixes(report);
    const action = plan.actions.find((a) => a.fixId === 'resolve-state-conflict');
    expect(action).toBeDefined();
    expect(action?.kind).toBe('manual');
  });

  it('AC-5: --resolve-state-conflict not supplied → skipped, guidance points at the flag, state.json untouched', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-resolve-conflict-noflag' });
    const base = emptyState('fix-resolve-conflict-noflag');
    await seedConflict(
      active.root,
      { ...base, activePhase: '10', loopPosition: 'BUILD' as const },
      { ...base, activePhase: '11', loopPosition: 'SETTLE' as const },
    );
    const before = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');

    const report = await runDoctor(active.root, ENV);
    const plan = planFixes(report);
    const outcomes = await applyFixes(active.root, plan, { wireHost: false });
    const outcome = outcomes.find((o) => o.fixId === 'resolve-state-conflict');
    expect(outcome?.status).toBe('skipped');
    expect(outcome?.message).toMatch(/--resolve-state-conflict/);

    const after = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('AC-5: resolveStateConflict=local writes the local side through commit(), regenerates STATE.md', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-resolve-conflict-local' });
    const base = emptyState('fix-resolve-conflict-local');
    await seedConflict(
      active.root,
      { ...base, activePhase: '10', loopPosition: 'BUILD' as const },
      { ...base, activePhase: '11', loopPosition: 'SETTLE' as const },
    );

    const report = await runDoctor(active.root, ENV);
    const plan = planFixes(report);
    const outcomes = await applyFixes(active.root, plan, {
      wireHost: false,
      resolveStateConflict: 'local',
    });
    const outcome = outcomes.find((o) => o.fixId === 'resolve-state-conflict');
    expect(outcome?.status).toBe('applied');

    const stateRaw = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    const state = JSON.parse(stateRaw);
    expect(state.activePhase).toBe('10');
    expect(state.loopPosition).toBe('BUILD');
    expect(CadenceStateZ.safeParse(state).success).toBe(true);

    const stateMd = await readFile(join(active.root, '.cadence', 'STATE.md'), 'utf8');
    expect(stateMd).toContain('10');

    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'state')?.severity).toBe('ok');
  });

  it('AC-5: resolveStateConflict=incoming writes the incoming side through commit()', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-resolve-conflict-incoming' });
    const base = emptyState('fix-resolve-conflict-incoming');
    await seedConflict(
      active.root,
      { ...base, activePhase: '10', loopPosition: 'BUILD' as const },
      { ...base, activePhase: '11', loopPosition: 'SETTLE' as const },
    );

    const report = await runDoctor(active.root, ENV);
    const plan = planFixes(report);
    const outcomes = await applyFixes(active.root, plan, {
      wireHost: false,
      resolveStateConflict: 'incoming',
    });
    const outcome = outcomes.find((o) => o.fixId === 'resolve-state-conflict');
    expect(outcome?.status).toBe('applied');

    const stateRaw = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    const state = JSON.parse(stateRaw);
    expect(state.activePhase).toBe('11');
    expect(state.loopPosition).toBe('SETTLE');

    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'state')?.severity).toBe('ok');
  });

  it('AC-5: no conflict markers present → no-op, clear message, state.json unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-resolve-conflict-clean' });
    // state.json is already clean (tempRepo seeds a valid one). Build a
    // synthetic plan action as if the check had fired — simulates the flag
    // being supplied after someone already resolved the conflict by hand
    // (or ran doctor --fix against a stale/cached plan).
    const before = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    const plan = {
      actions: [
        {
          check: 'state',
          kind: 'manual' as const,
          fixId: 'resolve-state-conflict',
          title: 'Resolve the state.json conflict (requires --resolve-state-conflict=local|incoming)',
          detail: 'synthetic — simulating a stale finding',
        },
      ],
    };
    const outcomes = await applyFixes(active.root, plan, {
      wireHost: false,
      resolveStateConflict: 'local',
    });
    const outcome = outcomes.find((o) => o.fixId === 'resolve-state-conflict');
    expect(outcome?.status).toBe('skipped');
    expect(outcome?.message).toMatch(/no unresolved conflict/i);

    const after = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('AC-5: a race — the chosen side is no longer valid JSON by the time --fix runs → failed, not thrown', async () => {
    active = await tempRepo({ initialized: true, projectName: 'fix-resolve-conflict-race' });
    const base = emptyState('fix-resolve-conflict-race');
    await seedConflict(
      active.root,
      { ...base, activePhase: '10', loopPosition: 'BUILD' as const },
      { ...base, activePhase: '11', loopPosition: 'SETTLE' as const },
    );
    const report = await runDoctor(active.root, ENV);
    const plan = planFixes(report);

    // Simulate the conflict changing shape between diagnosis and --fix (e.g. a
    // concurrent edit) — the local side is no longer valid JSON.
    await writeFile(
      join(active.root, '.cadence', 'state.json'),
      [
        '<<<<<<< HEAD',
        '{ not valid json',
        '=======',
        JSON.stringify({ ...base, activePhase: '11' }),
        '>>>>>>> worktree-branch',
        '',
      ].join('\n'),
    );

    const outcomes = await applyFixes(active.root, plan, {
      wireHost: false,
      resolveStateConflict: 'local',
    });
    const outcome = outcomes.find((o) => o.fixId === 'resolve-state-conflict');
    expect(outcome?.status).toBe('failed');
    expect(outcome?.message.length).toBeGreaterThan(0);
  });
});
