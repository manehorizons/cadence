import { describe, it, expect } from 'vitest';
import { GateZ, type Gate } from '@manehorizons/cadence-types';

/**
 * AC-9 — total enum coverage tracking. Every `Gate` enum member must be
 * accounted for in exactly one bucket: it has a `gates/*.ts` GateImpl today
 * (IMPLEMENTED), it is the lone deliberate finalizer exception (anomaly-notify,
 * see 39.1), or it is still inline/pending a later v1.3 phase (PENDING). This
 * test fails the moment a gate is added/renamed without a conscious bucket
 * choice — so no gate is ever silently dropped from the future 44.1 registry.
 */

// Gates with a discrete module under packages/core/src/gates/. NOTE: the
// settle gates are settle `GateImpl`s; the draft/build gates (39.7) carry
// `DraftGateImpl`/`BuildGateImpl` types — distinct, since they fire on other
// surfaces. "IMPLEMENTED" here means "has a discrete gates/*.ts module"; the
// 44.1 settle-registry subset is a further refinement (see 39.7 design doc).
const IMPLEMENTED: Gate[] = [
  'test-coverage', // gates/coverage.ts (39.1)
  'deep-verify', // gates/deep-verify.ts (39.1)
  'draft-read', // gates/draft-read.ts (39.2)
  'structural-verifier', // gates/structural-verifier.ts (39.2)
  'build-test-must-pass', // gates/build-test-must-pass.ts (39.2)
  'interactive-verdict', // gates/interactive.ts (39.3)
  'code-review', // gates/code-review.ts (39.4)
  'security-audit', // gates/security-audit.ts (39.5)
  'coherence-check', // gates/coherence.ts (39.7)
  'approve', // gates/approve.ts (39.7)
  'plan-review', // gates/plan-review.ts (39.7)
  'per-task-verify', // gates/per-task-verify.ts (39.7)
  'boundary-scan', // gates/boundary-scan.ts (phase 156)
  'task-verify-required', // gates/task-verify-required.ts (phase 195, issue #206)
];

// The single non-GateImpl member: a cross-cutting emission toggle, not a
// producer gate (39.1 Decision Log). Never a registry entry.
const EXCEPTION: Gate[] = ['anomaly-notify'];

// All enum gates now have a discrete module (39.7 completed the extraction).
const PENDING: Gate[] = [];

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

  it('39.7 brings implemented coverage to twelve gates (every enum gate but anomaly-notify)', () => {
    expect(IMPLEMENTED).toContain('coherence-check');
    expect(IMPLEMENTED).toContain('approve');
    expect(IMPLEMENTED).toContain('plan-review');
    expect(IMPLEMENTED).toContain('per-task-verify');
    expect(PENDING).toHaveLength(0);
  });

  it('phase 156 adds boundary-scan', () => {
    expect(IMPLEMENTED).toContain('boundary-scan');
  });

  it('phase 195 adds task-verify-required, bringing implemented coverage to fourteen gates', () => {
    expect(IMPLEMENTED).toContain('task-verify-required');
    expect(IMPLEMENTED).toHaveLength(14);
  });
});
