import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@thomas-powers-jr/cadence-types';
import { settleService } from '../../src/services/settle.js';
import type { CommandIO } from '../../src/services/io.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

const DRAFT = `---
phase: 30-foo
id: 30-01
tier: standard
status: APPROVED
---

# 30-01 — Foo

## Objective

Do the foo.

## Acceptance Criteria

### AC-1: it foos
Given a thing
When it runs
Then it foos.

## Tasks

### T1: foo
- files: \`x.ts\`
- action: foo
- verify: foo
- done: AC-1

## Boundaries

- none
`;

let siblingSeq = 0;

/** A BUILD-state cadence repo on phase 30-foo, in a git repo. Returns {root}. */
async function setupBuildRepo(parent: string, opts: { withSibling30: boolean }): Promise<string> {
  const root = await realpath(await mkdtemp(join(parent, 'main-')));
  const phaseDir = join(root, '.cadence', 'phases', '30-foo');
  await mkdir(phaseDir, { recursive: true });
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(defaultConfig, null, 2));
  const state = {
    ...emptyState('settle-collision'),
    loopPosition: 'BUILD' as const,
    activePhase: '30-foo',
    activeDraft: '30-01',
  };
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
  await writeFile(join(phaseDir, '30-01-DRAFT.md'), DRAFT);
  await writeFile(
    join(phaseDir, '30-01-PROGRESS.json'),
    JSON.stringify({ draftId: '30-01', tasks: { T1: { status: 'DONE' } } }, null, 2),
  );

  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);

  if (opts.withSibling30) {
    const sibling = join(parent, `wt30-${(siblingSeq += 1)}`);
    git(root, ['worktree', 'add', '-b', 'race-30', sibling]);
    await mkdir(join(sibling, '.cadence', 'phases', '30-race'), { recursive: true });
    await writeFile(join(sibling, '.cadence', 'phases', '30-race', '.keep'), '');
  }
  return root;
}

describe(
  'settle backstop phase-collision guard (AC-6)',
  // AC-6 (--allow-phase-collision) bypasses the guard and runs the full settle
  // pipeline including git diffs and file writes. On Windows CI this can exceed
  // the 60s global ceiling. 120s for win32; non-win32 keeps the 20s global default.
  { timeout: process.platform === 'win32' ? 120_000 : 20_000 },
() => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-settle-col-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  });

  it('AC-6: refuses settle when a sibling worktree races the same phase number', async () => {
    const root = await setupBuildRepo(parent, { withSibling30: true });
    const { io, err } = captureIO();
    const res = await settleService(root, { auto: true }, io);
    expect(res.exitCode).toBe(1);
    expect(err.join('')).toContain('phase 30 is in use by worktree');
  });

  it('AC-6: a single-worktree settle is NOT refused by the backstop (no false positive from self)', async () => {
    const root = await setupBuildRepo(parent, { withSibling30: false });
    const { io, err } = captureIO();
    const res = await settleService(root, { auto: true }, io);
    // self (local 30-foo) is excluded → the backstop does not fire; settle
    // proceeds into the gates (whatever the gate outcome, it is NOT the guard).
    expect(err.join('')).not.toContain('phase 30 is in use');
  });

  it('AC-6: --allow-phase-collision lets settle proceed past a sibling race', async () => {
    const root = await setupBuildRepo(parent, { withSibling30: true });
    const { io, err } = captureIO();
    await settleService(root, { auto: true, allowPhaseCollision: true }, io);
    expect(err.join('')).not.toContain('phase 30 is in use');
  });
});
