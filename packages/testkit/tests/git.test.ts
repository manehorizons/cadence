import { describe, it, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo } from '../src/fixture.js';
import { runGit } from '../src/git.js';

describe('runGit', () => {
  it('shells out to git and returns stdout', async () => {
    const fx = await tempRepo();
    try {
      runGit(fx.root, ['init', '-q']);
      runGit(fx.root, ['config', 'user.email', 'test@example.com']);
      runGit(fx.root, ['config', 'user.name', 'Test']);
      await writeFile(join(fx.root, 'README.md'), '# test\n');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'first']);

      const sha = runGit(fx.root, ['rev-parse', 'HEAD']).trim();
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      await fx.cleanup();
    }
  });
});
