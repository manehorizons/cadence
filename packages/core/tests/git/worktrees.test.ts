import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseWorktreePorcelain,
  normalizeWorktreePath,
  isSameWorktree,
  worktreeKey,
  listSiblingWorktrees,
} from '../../src/git/worktrees.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
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

describe('parseWorktreePorcelain', () => {
  it('parses path + branch for a normal entry and a detached-HEAD entry', () => {
    const porcelain = [
      'worktree /repo/main',
      'HEAD abcdef1234567890abcdef1234567890abcdef12',
      'branch refs/heads/main',
      '',
      'worktree /repo/wt-feature',
      'HEAD abcdef1234567890abcdef1234567890abcdef12',
      'branch refs/heads/feature-x',
      '',
      'worktree /repo/wt-detached',
      'HEAD abcdef1234567890abcdef1234567890abcdef12',
      'detached',
      '',
    ].join('\n');

    const entries = parseWorktreePorcelain(porcelain);

    expect(entries).toEqual([
      { path: '/repo/main', branch: 'main' },
      { path: '/repo/wt-feature', branch: 'feature-x' },
      { path: '/repo/wt-detached', branch: null },
    ]);
  });

  it('returns [] for empty porcelain output', () => {
    expect(parseWorktreePorcelain('')).toEqual([]);
  });
});

describe('worktree path self-identification (cross-platform)', () => {
  it('win32 — case-insensitive and separator-insensitive', () => {
    expect(normalizeWorktreePath('C:\\Users\\X\\repo', 'win32')).toBe('c:/users/x/repo');
    expect(isSameWorktree('C:/Users/X/repo', 'C:\\Users\\x\\repo\\', 'win32')).toBe(true);
    expect(isSameWorktree('C:/Users/X/repo', 'C:/Users/X/other', 'win32')).toBe(false);
  });

  it('posix — separator-normalized but case-sensitive', () => {
    expect(isSameWorktree('/tmp/repo/', '/tmp/repo', 'linux')).toBe(true);
    expect(isSameWorktree('/tmp/Repo', '/tmp/repo', 'linux')).toBe(false);
  });
});

describe('worktreeKey', () => {
  let root: string;
  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'cadence-wtkey-')));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  });

  it('resolves an existing path via realpath + normalization', async () => {
    const key = await worktreeKey(root);
    expect(key).toBe(normalizeWorktreePath(await realpath(root)));
  });

  it('falls back to plain normalization when realpath fails (nonexistent path)', async () => {
    const ghost = join(root, 'does-not-exist');
    const key = await worktreeKey(ghost);
    expect(key).toBe(normalizeWorktreePath(ghost));
  });
});

describe('listSiblingWorktrees', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-wt-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  });

  it('returns [] when there are zero sibling worktrees', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-')));
    await initRepo(main);

    const siblings = await listSiblingWorktrees(main);
    expect(siblings).toEqual([]);
  });

  it('returns each sibling path + branch, excluding self', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main2-')));
    await initRepo(main);

    const siblingA = join(parent, `wt-a-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-x', siblingA]);
    const siblingB = join(parent, `wt-b-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-y', siblingB]);

    const siblings = await listSiblingWorktrees(main);

    expect(siblings).toHaveLength(2);
    const a = siblings.find((s) => s.branch === 'feature-x');
    expect(a).toBeDefined();
    expect(await realpath(a!.path)).toBe(await realpath(siblingA));
    const b = siblings.find((s) => s.branch === 'feature-y');
    expect(b).toBeDefined();
    expect(await realpath(b!.path)).toBe(await realpath(siblingB));

    // self-exclusion: the main worktree never appears as its own sibling
    expect(siblings.some((s) => isSameWorktree(s.path, main))).toBe(false);
  });

  it('does not throw when a worktree dir was deleted without remove/prune (ghost entry)', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main3-')));
    await initRepo(main);

    const ghost = join(parent, `wt-ghost-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-ghost', ghost]);
    await rm(ghost, { recursive: true, force: true });

    const siblings = await listSiblingWorktrees(main);
    expect(Array.isArray(siblings)).toBe(true);
  });

  it('resolves to [] for a non-git directory rather than throwing', async () => {
    const plain = await realpath(await mkdtemp(join(parent, 'plain-')));

    const siblings = await listSiblingWorktrees(plain);
    expect(siblings).toEqual([]);
  });
});
