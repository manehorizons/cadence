import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function doc(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

// AC-3 (Phase 71): docs describe diff-aware deep-verify + diffCapBytes.

describe('deep-verify diff docs (AC-3)', () => {
  it('config.md documents verifier.diffCapBytes with its default', () => {
    const md = doc('docs/reference/config.md');
    expect(md).toContain('verifier.diffCapBytes');
    expect(md).toContain('262144');
  });

  it('concepts.md states deep-verify is sent the actual diff', () => {
    const md = doc('docs/concepts.md');
    expect(md).toMatch(/deep-verify[\s\S]*diff/i);
    expect(md).toContain('diffCapBytes');
  });

  it('DESIGN.md records the deep-verify-reads-the-diff decision', () => {
    const md = doc('DESIGN.md');
    expect(md).toContain('deep-verify` reads the actual diff');
    expect(md).toContain('deepVerifyMeta');
  });
});
