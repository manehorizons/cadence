import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the repo-root README from this test file's location:
// packages/core/tests/docs → ../../../../README.md
const README = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'README.md',
);

// AC-5 (phase 48) — README explains all three profiles' approve behavior
describe('README gate-profile heads-up', () => {
  const md = readFileSync(README, 'utf8');

  it('names auto, standard, and strict (AC-5)', () => {
    expect(md).toMatch(/`auto`/);
    expect(md).toMatch(/`standard`/);
    expect(md).toMatch(/`strict`/);
  });

  it('documents the interactive approve gate and --no-approve for CI (AC-5)', () => {
    expect(md).toMatch(/interactive/i);
    expect(md).toMatch(/--no-approve/);
  });

  it('explains the ≥20-commit suggestion heuristic (AC-5)', () => {
    expect(md).toMatch(/≥\s*20|20 commits/);
  });
});
