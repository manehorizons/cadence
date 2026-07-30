import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatesFor } from '../../src/gates/engine.js';

// Resolve repo-root assets from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function readDoc(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

/**
 * Phase 241 (AC-5) — pairs `docs/concepts.md`'s anchor-tier prose with the
 * code truth that makes the claim provable: `gates/code-review.ts` now
 * threads the real `SettleContext.gateProvenance` snapshot, so `executable`
 * is reachable in a live settle whenever the declared profile's gate set
 * actually runs `code-review` and the ladder's two conditions (a task->AC
 * citation with a non-empty `verify:`, corroborated by a `ran`
 * `build-test-must-pass` entry) hold. This doesn't claim every profile
 * reaches it — the repo default (`auto`) does not fire `code-review` at
 * `standard` tier at all, so the doc's claim is scoped honestly to profiles
 * whose gate set includes it, e.g. `strict`.
 */
describe('docs/concepts.md documents the executable tier as reachable (phase 241, AC-5)', () => {
  const concepts = readDoc('docs', 'concepts.md');

  it('AC-5: concepts.md no longer claims the executable tier is unconditionally unreachable, and still requires build-test-must-pass corroboration', () => {
    // The old, now-false claim must be gone.
    expect(concepts).not.toMatch(/`executable`\s+tier is not reachable in a real settle yet/i);
    // The current truth must be present: reachable in a live settle, and
    // still gated on a corroborating build-test-must-pass 'ran' entry.
    //
    // Matched on whitespace-normalized text and as CONNECTED clauses, not as
    // independent fragments. The looser form — `executable is reachable`,
    // `build-test-must-pass`, and `status: 'ran'` each asserted separately —
    // is satisfied by prose claiming the tier is reached "unconditionally ...
    // even without a `status: 'ran'` entry", which contradicts the real
    // two-condition ladder in `verify/anchor.ts`. Guarding the overclaim
    // direction is this test's entire job.
    const flat = concepts.replace(/\s+/g, ' ');
    expect(flat).toMatch(
      /`executable` is reachable in a live settle when both of the ladder's conditions hold/i,
    );
    // Condition (a) as well as (b): prose claiming the AC "merely exists in
    // the DRAFT" describes `structured`, and would otherwise slip through.
    expect(flat).toMatch(/cited by a task with a non-empty `verify:`/i);
    expect(flat).toMatch(
      /provenance snapshot contains a `build-test-must-pass` entry with `status: 'ran'`/i,
    );
    expect(flat).toMatch(
      /`skipped`, `refused`, or absent `build-test-must-pass` entry still caps the tier below `executable`/i,
    );
  });

  it('AC-5: the standard/strict gate set derived from gates/engine.ts genuinely includes code-review, which is what makes the executable claim above exercisable', () => {
    // Derived from code, not hardcoded: gatesFor is the single source of
    // truth for which (tier, profile) cells run code-review at all.
    const strictStandard = gatesFor('standard', 'strict');
    expect(strictStandard.gates).toContain('code-review');

    // Honesty check: the repo's default profile (auto) does NOT include
    // code-review at standard tier — asserting both halves makes this a
    // real constraint on the doc's claim, not a tautology.
    const autoStandard = gatesFor('standard', 'auto');
    expect(autoStandard.gates).not.toContain('code-review');
  });
});
