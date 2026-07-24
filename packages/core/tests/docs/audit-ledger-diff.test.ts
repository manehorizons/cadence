import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root assets from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CLAUDE_MD = join(ROOT, 'CLAUDE.md');

// Guards against the v1.47.0 audit's assurance-levels P0 finding: it was
// partially executed from memory and never reached the recommendation
// ledger. The fix is a named failure mode in CLAUDE.md instructing audit
// sessions to run a mechanical ledger-diff step before closing. This test
// only proves the instruction exists in the doc every session reads first —
// it cannot prove a session actually followed it.
describe('CLAUDE.md documents the audit ledger-diff failure mode', () => {
  it('names "The Unlogged Audit Finding" and requires a ledger-diff via `cadence recommendation add`', () => {
    const claudeMd = readFileSync(CLAUDE_MD, 'utf8');
    expect(claudeMd).toContain('The Unlogged Audit Finding');
    expect(claudeMd).toContain('ledger-diff');
    expect(claudeMd).toContain('cadence recommendation add');
  });
});
