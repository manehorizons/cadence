// packages/core/tests/build/task-touched-files.test.ts
//
// Phase 280 (T7): `deriveTaskTouchedFiles` layers first-sighting semantics
// on top of `collectUnscopedTouchedFiles` -- without it, a boundary check
// re-running the raw phase-cumulative touched-file set would re-flag every
// file a DONE task ever touched on every subsequent recording, forever. The
// fix: subtract everything already attributed to a previously-recorded
// task, so a stray file is only ever flagged once, at the recording that
// first observes it.
//
// Git-backed tempRepo pattern mirrors tests/gates/boundary-scan.test.ts:
// `collectUnscopedTouchedFiles` needs a real repo (merge-base diff +
// working-tree status) to exercise meaningfully.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveTaskTouchedFiles } from '../../src/build/task-touched-files.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

async function initRepo(root: string): Promise<void> {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(root, 'README.md'), '# test\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
  git(root, ['checkout', '-b', 'feature']);
}

const roots: string[] = [];
async function makeRepo(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cadence-task-touched-files-')));
  roots.push(root);
  await initRepo(root);
  return root;
}

afterEach(async () => {
  while (roots.length) {
    const root = roots.pop()!;
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
});

describe('deriveTaskTouchedFiles', () => {
  it('first call with an empty previouslyRecorded set yields the full filtered touched-file set', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'src-a.ts'), 'a\n');
    await writeFile(join(root, 'src-b.ts'), 'b\n');

    const result = await deriveTaskTouchedFiles(root, 'main', new Set());

    expect(result.baseRefResolved).toBe(true);
    expect([...result.delta].sort()).toEqual(['src-a.ts', 'src-b.ts']);
  });

  // Load-bearing first-sighting test: a second call, with previouslyRecorded
  // containing everything the first call surfaced, on a scenario where MORE
  // files have since been touched -- the delta must contain only the NEW
  // files, never re-flagging what a previous task already claimed.
  it('a second call excludes previouslyRecorded files and surfaces only newly-touched ones', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'src-a.ts'), 'a\n');
    await writeFile(join(root, 'src-b.ts'), 'b\n');

    const first = await deriveTaskTouchedFiles(root, 'main', new Set());
    expect([...first.delta].sort()).toEqual(['src-a.ts', 'src-b.ts']);

    // More files touched since the first recording -- as if a second task
    // ran and left its own footprint alongside the first task's (still
    // present, unremoved) files.
    await writeFile(join(root, 'src-c.ts'), 'c\n');

    const previouslyRecorded = new Set(first.delta);
    const second = await deriveTaskTouchedFiles(root, 'main', previouslyRecorded);

    expect(second.delta).toEqual(['src-c.ts']);
    expect(second.delta).not.toContain('src-a.ts');
    expect(second.delta).not.toContain('src-b.ts');
  });

  it('never surfaces .cadence/state.json or a *-PROGRESS.json file, even when genuinely touched', async () => {
    const root = await makeRepo();
    await mkdir(join(root, '.cadence', 'phases', '280-x'), { recursive: true });
    await writeFile(join(root, '.cadence', 'state.json'), '{}\n');
    await writeFile(join(root, '.cadence', 'phases', '280-x', '280-01-PROGRESS.json'), '{}\n');
    await writeFile(join(root, 'src-real.ts'), 'real\n');

    const result = await deriveTaskTouchedFiles(root, 'main', new Set());

    expect(result.delta).not.toContain('.cadence/state.json');
    expect(result.delta).not.toContain('.cadence/phases/280-x/280-01-PROGRESS.json');
    expect(result.delta).toContain('src-real.ts');
  });
});
