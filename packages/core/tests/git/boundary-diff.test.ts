import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectUnscopedTouchedFiles } from '../../src/git/boundary-diff.js';

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

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cadence-boundary-diff-')));
  roots.push(root);
  return root;
}

afterEach(async () => {
  while (roots.length) {
    const root = roots.pop()!;
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
});

describe('collectUnscopedTouchedFiles', () => {
  it('returns an empty result for a clean tree with no divergence from the base ref', async () => {
    const root = await makeRoot();
    await initRepo(root);

    const result = await collectUnscopedTouchedFiles(root, 'main');

    expect(result).toEqual({ files: [], baseRefResolved: true });
  });

  it('reports modified, added, and untracked working-tree files', async () => {
    const root = await makeRoot();
    await initRepo(root);
    git(root, ['checkout', '-b', 'feature']);

    await writeFile(join(root, 'README.md'), '# test (modified)\n');
    await writeFile(join(root, 'added.txt'), 'added\n');
    git(root, ['add', 'added.txt']);
    await writeFile(join(root, 'untracked.txt'), 'untracked\n');

    const result = await collectUnscopedTouchedFiles(root, 'main');

    expect(result.baseRefResolved).toBe(true);
    expect(new Set(result.files)).toEqual(new Set(['README.md', 'added.txt', 'untracked.txt']));
  });

  it('reports only the destination path for a renamed file', async () => {
    const root = await makeRoot();
    // orig.txt is committed on `main` itself, before divergence, so the
    // merge-base diff sees no new file — only the working-tree rename shows up.
    await writeFile(join(root, 'orig.txt'), 'content that is long enough to be detected as a rename\n');
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    git(root, ['config', 'commit.gpgsign', 'false']);
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'init']);
    git(root, ['checkout', '-b', 'feature']);

    git(root, ['mv', 'orig.txt', 'renamed.txt']);

    const result = await collectUnscopedTouchedFiles(root, 'main');

    expect(result.baseRefResolved).toBe(true);
    expect(result.files).not.toContain('orig.txt');
    expect(result.files).not.toContain('orig.txt -> renamed.txt');
    expect(result.files).toContain('renamed.txt');
  });

  it('includes committed-since-divergence files via the merge-base diff', async () => {
    const root = await makeRoot();
    await initRepo(root);
    git(root, ['checkout', '-b', 'feature']);

    await writeFile(join(root, 'committed.txt'), 'committed\n');
    git(root, ['add', 'committed.txt']);
    git(root, ['commit', '-m', 'add committed.txt']);

    const result = await collectUnscopedTouchedFiles(root, 'main');

    expect(result.baseRefResolved).toBe(true);
    expect(result.files).toContain('committed.txt');
  });

  it('falls back to a local integrationRef merge-base when no origin remote exists', async () => {
    const root = await makeRoot();
    await initRepo(root);
    git(root, ['checkout', '-b', 'feature']);
    await writeFile(join(root, 'committed.txt'), 'committed\n');
    git(root, ['add', 'committed.txt']);
    git(root, ['commit', '-m', 'add committed.txt']);

    // No `origin` remote configured at all — must fall back to local `main`.
    const result = await collectUnscopedTouchedFiles(root, 'main');

    expect(result.baseRefResolved).toBe(true);
    expect(result.files).toContain('committed.txt');
  });

  it('degrades to baseRefResolved: false but still returns working-tree files when no base ref resolves', async () => {
    const root = await makeRoot();
    await initRepo(root);

    await writeFile(join(root, 'untracked.txt'), 'untracked\n');

    const result = await collectUnscopedTouchedFiles(root, 'does-not-exist-anywhere');

    expect(result.baseRefResolved).toBe(false);
    expect(result.files).toEqual(['untracked.txt']);
  });

  it('resolves to an empty, non-throwing result for a non-git directory', async () => {
    const plain = await makeRoot();

    const result = await collectUnscopedTouchedFiles(plain, 'main');

    expect(result).toEqual({ files: [], baseRefResolved: false });
  });
});
