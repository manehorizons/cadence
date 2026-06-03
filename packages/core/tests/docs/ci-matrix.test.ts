import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the repo-root CI workflow from this test file's location:
// packages/core/tests/docs → ../../../../.github/workflows/ci.yml
const CI_YML = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'ci.yml',
);

// AC-3 (phase 50) — the gate runs on all three OSes again. macOS was unblocked
// in phase 49 (realpath) and windows in phase 50 (platform-aware timeouts +
// best-effort temp cleanup). This guard fails loudly if a future edit silently
// drops a leg.
describe('CI workflow OS matrix', () => {
  const yml = readFileSync(CI_YML, 'utf8');

  it('runs the test job on ubuntu, macOS, and windows (AC-3)', () => {
    expect(yml).toContain('ubuntu-latest');
    expect(yml).toContain('macos-latest');
    expect(yml).toContain('windows-latest');
  });

  it('keeps fail-fast disabled so one OS leg cannot cancel the others (AC-3)', () => {
    expect(yml).toMatch(/fail-fast:\s*false/);
  });

  it('preserves the ci-success aggregate status context (AC-3)', () => {
    expect(yml).toContain('ci-success');
  });
});
