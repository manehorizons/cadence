import { describe, it, expect } from 'vitest';
import { GateZ, type Gate } from '@cadence/types';

/**
 * AC-9 — total enum coverage tracking. Every `Gate` enum member must be
 * accounted for in exactly one bucket: it has a `gates/*.ts` GateImpl today
 * (IMPLEMENTED), it is the lone deliberate finalizer exception (anomaly-notify,
 * see 39.1), or it is still inline/pending a later v1.3 phase (PENDING). This
 * test fails the moment a gate is added/renamed without a conscious bucket
 * choice — so no gate is ever silently dropped from the future 44.1 registry.
 */

// Gates with a discrete GateImpl module under packages/core/src/gates/.
const IMPLEMENTED: Gate[] = [
  'test-coverage', // gates/coverage.ts (39.1)
  'deep-verify', // gates/deep-verify.ts (39.1)
  'draft-read', // gates/draft-read.ts (39.2)
  'structural-verifier', // gates/structural-verifier.ts (39.2)
  'build-test-must-pass', // gates/build-test-must-pass.ts (39.2)
  'interactive-verdict', // gates/interactive.ts (39.3)
  'code-review', // gates/code-review.ts (39.4)
];

// The single non-GateImpl member: a cross-cutting emission toggle, not a
// producer gate (39.1 Decision Log). Never a registry entry.
const EXCEPTION: Gate[] = ['anomaly-notify'];

// Still inline in settle.ts/draft.ts; extracted by 39.3–39.7.
const PENDING: Gate[] = [
  'coherence-check',
  'approve',
  'per-task-verify',
  'plan-review',
  'security-audit',
];

describe('gate registry coverage (AC-9)', () => {
  it('buckets every Gate enum member exactly once', () => {
    const all = [...IMPLEMENTED, ...EXCEPTION, ...PENDING].sort();
    const enumMembers = [...GateZ.options].sort();
    expect(all).toEqual(enumMembers);
  });

  it('buckets are disjoint', () => {
    const union = new Set([...IMPLEMENTED, ...EXCEPTION, ...PENDING]);
    expect(union.size).toBe(IMPLEMENTED.length + EXCEPTION.length + PENDING.length);
  });

  it('39.2–39.4 bring implemented coverage to seven gates', () => {
    expect(IMPLEMENTED).toContain('draft-read');
    expect(IMPLEMENTED).toContain('structural-verifier');
    expect(IMPLEMENTED).toContain('build-test-must-pass');
    expect(IMPLEMENTED).toContain('interactive-verdict');
    expect(IMPLEMENTED).toContain('code-review');
    expect(IMPLEMENTED).toHaveLength(7);
  });
});
