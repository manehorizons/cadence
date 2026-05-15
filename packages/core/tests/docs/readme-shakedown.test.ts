import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs → repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
const ledger = readFileSync(
  join(REPO_ROOT, '.cadence/shakedown/29-04-REMEDIATION.md'),
  'utf8',
);

describe('29.1 shakedown doc guards', () => {
  it('AC-4: README warns F6 — standard profile makes non-TTY draft approve refuse', () => {
    expect(readme).toMatch(/≥20 commits/);
    expect(readme).toMatch(/draft approve/);
    expect(readme).toMatch(/--no-approve/);
  });

  it('AC-4: README warns F1 — --local writes machine-absolute paths, do not commit', () => {
    expect(readme).toMatch(/--local/);
    expect(readme).toMatch(/machine-absolute paths/);
    expect(readme).toMatch(/[Dd]o not commit/);
    expect(readme).toMatch(/\.gitignore/);
  });

  it('AC-5: remediation ledger dispositions every 29.1 finding', () => {
    for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']) {
      expect(ledger).toContain(id);
    }
    expect(ledger).toMatch(/works-as-designed/);
    expect(ledger).toMatch(/29\.2/);
    expect(ledger).toMatch(/29\.3/);
    expect(ledger).toMatch(/resource-blocked/i);
  });
});
