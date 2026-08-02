import { describe, expect, it, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { collectGitDiff } from '../../src/git/diff.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

describe('collectGitDiff', () => {
  it('AC-2: passes file paths as argv, not shell-interpolated text', async () => {
    active = await tempRepo({ initialized: true, projectName: 'diff_argv' });
    const root = active.root;
    git(root, ['init', '-q']);
    git(root, ['config', 'user.email', 'test@cadence.local']);
    git(root, ['config', 'user.name', 'Cadence Test']);
    git(root, ['config', 'commit.gpgsign', 'false']);

    await mkdir(join(root, 'src'), { recursive: true });
    const rel = 'src/a & b.test.ts';
    await writeFile(join(root, rel), 'export const value = 1;\n');
    git(root, ['add', rel]);
    git(root, ['commit', '-q', '-m', 'init']);

    await writeFile(join(root, rel), 'export const value = 2; // AC-2\n');

    const diff = collectGitDiff(root, [rel]);
    expect(diff).toContain('a & b.test.ts');
    expect(diff).toContain('AC-2');
  });
});
