import { describe, it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, runGit } from '@thomas-powers-jr/cadence-testkit';
import { discoverChangedPhases, GitDiffError } from '../../src/git/diff-strict.js';

async function initRepo(root: string): Promise<void> {
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  runGit(root, ['config', 'user.name', 'Test']);
}

describe('discoverChangedPhases', () => {
  it('returns the phases whose SUMMARY.json changed between base and HEAD', async () => {
    const fx = await tempRepo();
    try {
      await initRepo(fx.root);
      await writeFile(join(fx.root, 'README.md'), '# test\n');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'base']);
      const baseSha = runGit(fx.root, ['rev-parse', 'HEAD']).trim();

      const phaseDir = join(fx.root, '.cadence', 'phases', '200-example-phase');
      await mkdir(phaseDir, { recursive: true });
      await writeFile(join(phaseDir, '200-01-SUMMARY.json'), '{}');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'add summary']);

      const result = discoverChangedPhases(fx.root, baseSha);
      expect(result).toEqual([
        {
          phase: '200-example-phase',
          id: '200-01',
          path: '.cadence/phases/200-example-phase/200-01-SUMMARY.json',
        },
      ]);
    } finally {
      await fx.cleanup();
    }
  });

  it('returns an empty array when nothing changed', async () => {
    const fx = await tempRepo();
    try {
      await initRepo(fx.root);
      await writeFile(join(fx.root, 'README.md'), '# test\n');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'base']);
      const baseSha = runGit(fx.root, ['rev-parse', 'HEAD']).trim();

      const result = discoverChangedPhases(fx.root, baseSha);
      expect(result).toEqual([]);
    } finally {
      await fx.cleanup();
    }
  });

  it('excludes a SUMMARY.json deleted by the diff range (not treated as a change to verify)', async () => {
    const fx = await tempRepo();
    try {
      await initRepo(fx.root);
      const phaseDir = join(fx.root, '.cadence', 'phases', '200-example-phase');
      await mkdir(phaseDir, { recursive: true });
      await writeFile(join(phaseDir, '200-01-SUMMARY.json'), '{}');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'base with summary']);
      const baseSha = runGit(fx.root, ['rev-parse', 'HEAD']).trim();

      runGit(fx.root, ['rm', '-q', '.cadence/phases/200-example-phase/200-01-SUMMARY.json']);
      runGit(fx.root, ['commit', '-q', '-m', 'remove summary']);

      const result = discoverChangedPhases(fx.root, baseSha);
      expect(result).toEqual([]);
    } finally {
      await fx.cleanup();
    }
  });

  it('throws GitDiffError when the base ref cannot be resolved', async () => {
    const fx = await tempRepo();
    try {
      await initRepo(fx.root);
      await writeFile(join(fx.root, 'README.md'), '# test\n');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'base']);

      expect(() => discoverChangedPhases(fx.root, 'not-a-real-ref')).toThrow(GitDiffError);
    } finally {
      await fx.cleanup();
    }
  });
});
