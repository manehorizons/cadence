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

// Phase 136 (rec-20260701-006 / audit F6): the "drive a real phase yourself"
// walkthrough showed a bare `cadence draft approve ...` with no inline
// pointer to --no-approve; the fuller heads-up note lives two sections
// further down, separated by another code block.
describe('README real-phase walkthrough (phase 136, rec-20260701-006)', () => {
  const md = readFileSync(README, 'utf8');

  function fencedBlockContaining(needle: string): string {
    const blocks = md.split(/```[a-z]*\n/).filter((_, i) => i % 2 === 1);
    const block = blocks.find((b) => b.includes(needle));
    if (block === undefined) {
      throw new Error(`no fenced code block contains: ${needle}`);
    }
    return block;
  }

  it('AC-1: the approve line\'s own code block mentions --no-approve', () => {
    const block = fencedBlockContaining('cadence draft approve 01-fix-login-timeout 01');
    expect(block).toMatch(/--no-approve/);
  });

  it('AC-2: the separate gate-profiles heads-up block is unchanged', () => {
    expect(md).toMatch(/`auto`/);
    expect(md).toMatch(/`standard`/);
    expect(md).toMatch(/`strict`/);
    expect(md).toMatch(/≥\s*20|20 commits/);
  });
});
