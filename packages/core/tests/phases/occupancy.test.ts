import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatherOccupancy } from '../../src/phases/occupancy.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

async function phaseDir(root: string, name: string): Promise<void> {
  await mkdir(join(root, '.cadence', 'phases', name), { recursive: true });
  await writeFile(join(root, '.cadence', 'phases', name, '.keep'), '');
}

/** Init a git repo with a deterministic `main` branch and an initial commit. */
async function initRepo(root: string): Promise<void> {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(root, 'README.md'), '# test\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
}

describe('gatherOccupancy (AC-2, AC-3)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-occ-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  });

  it('AC-2: detects a phase dir in a sibling worktree', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-')));
    await initRepo(main);
    await phaseDir(main, '83-here');

    const sibling = join(parent, `wt-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-x', sibling]);
    await phaseDir(sibling, '30-sibling');

    const occ = await gatherOccupancy(main, { integrationRef: 'main' });
    const sib = occ.find((o) => o.source === 'sibling' && o.number === 30);
    expect(sib).toBeDefined();
    expect(await realpath(sib!.location)).toBe(await realpath(sibling));
    // local source still seen for nextFree computation
    expect(occ.some((o) => o.source === 'local' && o.number === 83)).toBe(true);
  });

  it('AC-2: detects a phase dir on origin/<integrationRef> (upstream)', async () => {
    const bare = await realpath(await mkdtemp(join(parent, 'bare-')));
    git(bare, ['init', '--bare', '-b', 'main']);

    const work = await realpath(await mkdtemp(join(parent, 'work-')));
    await initRepo(work);
    await phaseDir(work, '42-upstream');
    git(work, ['add', '.']);
    git(work, ['commit', '-m', 'add phase 42']);
    git(work, ['remote', 'add', 'origin', bare]);
    git(work, ['push', '-u', 'origin', 'main']);

    const occ = await gatherOccupancy(work, { integrationRef: 'main' });
    const up = occ.find((o) => o.source === 'upstream' && o.number === 42);
    expect(up).toBeDefined();
    expect(up!.location).toBe('origin/main');
  });

  it('AC-3: a non-git directory yields local-only and never throws', async () => {
    const plain = await realpath(await mkdtemp(join(parent, 'plain-')));
    await phaseDir(plain, '12-local');

    const occ = await gatherOccupancy(plain, { integrationRef: 'main' });
    expect(occ.every((o) => o.source === 'local')).toBe(true);
    expect(occ.some((o) => o.number === 12)).toBe(true);
  });

  it('AC-3: no origin / no remote → upstream contributes nothing (no throw)', async () => {
    const noRemote = await realpath(await mkdtemp(join(parent, 'norem-')));
    await initRepo(noRemote);
    await phaseDir(noRemote, '5-here');

    const occ = await gatherOccupancy(noRemote, { integrationRef: 'main' });
    expect(occ.some((o) => o.source === 'upstream')).toBe(false);
    expect(occ.some((o) => o.source === 'local' && o.number === 5)).toBe(true);
  });

  it('AC-3: a sibling worktree with no .cadence/ contributes nothing', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main2-')));
    await initRepo(main);
    const sibling = join(parent, `bare-wt-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-y', sibling]);
    // no .cadence/ in the sibling

    const occ = await gatherOccupancy(main, { integrationRef: 'main' });
    expect(occ.some((o) => o.source === 'sibling')).toBe(false);
  });

  it('AC-3: an integrationRef absent on origin degrades to no upstream data', async () => {
    const bare = await realpath(await mkdtemp(join(parent, 'bare2-')));
    git(bare, ['init', '--bare', '-b', 'main']);
    const work = await realpath(await mkdtemp(join(parent, 'work2-')));
    await initRepo(work);
    git(work, ['remote', 'add', 'origin', bare]);
    git(work, ['push', '-u', 'origin', 'main']);

    const occ = await gatherOccupancy(work, { integrationRef: 'nonexistent-branch' });
    expect(occ.some((o) => o.source === 'upstream')).toBe(false);
  });
});
