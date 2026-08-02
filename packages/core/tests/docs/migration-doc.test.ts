import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root assets from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const MIGRATION_DOC = 'docs/migration-npm-scope.md';

describe('phase 250 (AC-7): npm scope migration path documented', () => {
  it('250-01/AC-7: docs/migration-npm-scope.md exists and names the proven remediation command, cadence doctor --fix --wire-host (not bare --fix, which does not repair a stale-scope hook)', () => {
    const path = join(ROOT, MIGRATION_DOC);
    expect(existsSync(path), `${MIGRATION_DOC} should exist`).toBe(true);

    const text = readFileSync(path, 'utf8');
    expect(text).toContain('cadence doctor --fix --wire-host');
  });

  it('250-01/AC-7: packages/core/README.md and docs/README.md both link to the migration guide', () => {
    for (const rel of ['packages/core/README.md', 'docs/README.md']) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(text, `${rel} should reference migration-npm-scope.md`).toContain('migration-npm-scope.md');
    }
  });
});
