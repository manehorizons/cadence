import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { recordTaskOutcome } from '../../src/build/record.js';
import { LoopViolationError } from '../../src/errors.js';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    p.on('exit', (code) => resolve({ code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function arrangeBuildPhase(): Promise<string> {
  active = await tempRepo({ initialized: true });
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
  await run(['draft', 'approve', '01-foundation', '01'], active.root);
  return active.root;
}

describe('recordTaskOutcome', () => {
  it('writes PROGRESS.json with status + notes and updates state.activeTask', async () => {
    const root = await arrangeBuildPhase();

    await recordTaskOutcome(root, 'T1', 'DONE', 'finished');

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
    expect(progress.tasks.T1.notes).toBe('finished');
    const state = JSON.parse(await readFile(join(root, '.cadence/state.json'), 'utf8'));
    expect(state.activeTask?.id).toBe('T1');
    expect(state.activeTask?.status).toBe('DONE');
  });

  it('throws LoopViolationError when loopPosition is not BUILD', async () => {
    active = await tempRepo({ initialized: true });
    await expect(recordTaskOutcome(active.root, 'T1', 'DONE', '')).rejects.toBeInstanceOf(
      LoopViolationError,
    );
  });

  it('produces the same PROGRESS.json that `cadence build task` produces', async () => {
    const rootA = await arrangeBuildPhase();
    await recordTaskOutcome(rootA, 'T1', 'DONE', 'parity');
    const helperOut = JSON.parse(
      await readFile(join(rootA, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    await active!.cleanup();
    active = null;

    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE', '--notes=parity'], active.root);
    const cliOut = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );

    // updatedAt timestamps differ — strip before compare
    delete helperOut.tasks.T1.updatedAt;
    delete cliOut.tasks.T1.updatedAt;
    expect(helperOut).toEqual(cliOut);
  });

  it('280-01/AC-3: uses options.gitTouchedFiles (the git-derived delta) instead of the self-reported state.activeTask.touchedFiles when present', async () => {
    const root = await arrangeBuildPhase();
    const statePath = join(root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: ['src/self-report.ts'] };
    await writeFile(statePath, JSON.stringify(state, null, 2));

    await recordTaskOutcome(root, 'T1', 'DONE', 'git-derived', {
      gitTouchedFiles: ['src/git-derived.ts'],
    });

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.touchedFiles).toEqual(['src/git-derived.ts']);
  });

  it('280-01/AC-3: uses an empty options.gitTouchedFiles array rather than falling back to the self-report', async () => {
    const root = await arrangeBuildPhase();
    const statePath = join(root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: ['src/self-report.ts'] };
    await writeFile(statePath, JSON.stringify(state, null, 2));

    await recordTaskOutcome(root, 'T1', 'DONE', 'empty-git-derived', { gitTouchedFiles: [] });

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.touchedFiles).toEqual([]);
  });

  it('280-01/AC-3: falls back to the self-reported touchedFiles when options is omitted (unchanged pre-DP-B behavior, never blended)', async () => {
    const root = await arrangeBuildPhase();
    const statePath = join(root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activeTask = { id: 'T1', status: 'IN_PROGRESS', touchedFiles: ['src/self-report.ts'] };
    await writeFile(statePath, JSON.stringify(state, null, 2));

    await recordTaskOutcome(root, 'T1', 'DONE', 'no options');

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.touchedFiles).toEqual(['src/self-report.ts']);
  });

  it('still records perTaskVerify when passed inside the options object', async () => {
    const root = await arrangeBuildPhase();

    await recordTaskOutcome(root, 'T1', 'DONE', 'verified', {
      perTaskVerify: { verdict: 'pass', reason: 'ok', provider: 'mock' },
    });

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.perTaskVerify).toEqual({
      verdict: 'pass',
      reason: 'ok',
      provider: 'mock',
    });
  });

  it('280-01/AC-5: spreads execution/isolation/modelClass provenance into the task row when present in options', async () => {
    const root = await arrangeBuildPhase();

    await recordTaskOutcome(root, 'T1', 'DONE', 'dispatched', {
      execution: 'dispatch',
      isolation: 'worktree',
      modelClass: 'standard',
    });

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.execution).toBe('dispatch');
    expect(progress.tasks.T1.isolation).toBe('worktree');
    expect(progress.tasks.T1.modelClass).toBe('standard');
  });

  it('280-01/AC-5: omits execution/isolation/modelClass from the task row when absent from options (additive-only, no defaulting)', async () => {
    const root = await arrangeBuildPhase();

    await recordTaskOutcome(root, 'T1', 'DONE', 'plain');

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.execution).toBeUndefined();
    expect(progress.tasks.T1.isolation).toBeUndefined();
    expect(progress.tasks.T1.modelClass).toBeUndefined();
  });

  it('280-01/AC-2: re-recording a dispatched task without --execution preserves its prior execution/isolation/modelClass (never de-escalates)', async () => {
    const root = await arrangeBuildPhase();

    await recordTaskOutcome(root, 'T1', 'DONE', 'dispatched', {
      execution: 'dispatch',
      isolation: 'worktree',
      modelClass: 'standard',
    });

    // Re-record with a status change and no execution/isolation/modelClass
    // in options -- mirrors an operator re-running `cadence build task T1
    // --status=DONE_WITH_CONCERNS` without repeating the dispatch flags.
    await recordTaskOutcome(root, 'T1', 'DONE_WITH_CONCERNS', 'revisited');

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.status).toBe('DONE_WITH_CONCERNS');
    expect(progress.tasks.T1.execution).toBe('dispatch');
    expect(progress.tasks.T1.isolation).toBe('worktree');
    expect(progress.tasks.T1.modelClass).toBe('standard');
  });

  it('280-01/AC-2: re-recording a dispatched task WITH a new --execution value overrides the prior one (not stuck forever)', async () => {
    const root = await arrangeBuildPhase();

    await recordTaskOutcome(root, 'T1', 'DONE', 'dispatched', {
      execution: 'dispatch',
      isolation: 'worktree',
      modelClass: 'standard',
    });
    await recordTaskOutcome(root, 'T1', 'DONE_WITH_CONCERNS', 'corrected', {
      execution: 'inline',
    });

    const progress = JSON.parse(
      await readFile(join(root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.execution).toBe('inline');
    // isolation/modelClass weren't repeated on the second call either --
    // they follow the same preserve-unless-overridden rule as execution.
    expect(progress.tasks.T1.isolation).toBe('worktree');
    expect(progress.tasks.T1.modelClass).toBe('standard');
  });
});
