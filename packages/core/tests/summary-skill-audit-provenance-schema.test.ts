import { describe, it, expect } from 'vitest';
import { SummaryZ } from '@thomas-powers-jr/cadence-types';
import { computeSummaryContentHash } from '../src/services/summary-hash.js';
import { verifySummaryContentHash } from '../src/services/summary-verify.js';

// Phase 291 (T1): `skillAudit.provenance` attributes each required skill to the
// source that demanded it (`config` / `draft` / `pack:<id>`), because Slice 2
// makes a resolved pack's `skillAudit.required` a real contributor to the
// enforced set. This file mirrors `summary-provider-selection-schema.test.ts`
// (phase 263) and `summary-coverage-scheme.test.ts` (phase 239) for the exact
// same hazard, applied to this new field.
//
// This repo's coverage scanner dedups a phase-qualified AC token per file by
// first occurrence only (`coverage.ts`), so the token is written ONCE, inside
// the asserting `it()` title below — never in a comment or a `describe` title,
// which would steal the dedup slot and make the real assertion invisible to
// the evidence-floor gate.

/** A minimal, valid pre-phase-291 SUMMARY: its `skillAudit` object carries
 *  only `required`/`invoked`, the exact shape `provenance` attaches to. */
function legacySummary(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    draftId: '01-01',
    completedAt: '2026-01-01T00:00:00.000Z',
    acResults: [{ id: 'AC-1', pass: true }],
    taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
    decisions: [],
    deferred: [],
    skillAudit: { required: ['tdd'], invoked: ['superpowers:tdd'] },
  };
}

describe('SUMMARY skillAudit provenance · schema (phase 291 T1)', () => {
  it('291-01/AC-2: provenance is additive and content-hash-safe on legacy SUMMARYs', () => {
    // THE HAZARD THIS GUARDS: `cadence summary verify` Zod-parses the file and
    // then hashes the PARSED object. If `provenance` carried a Zod
    // `.default(...)`, parsing would inject it into every historical SUMMARY's
    // `skillAudit`, change the digest, and report every past settle as
    // tampered. Hash the hand-built legacy object BEFORE any schema parse,
    // round-trip it through `SummaryZ.parse`, then re-hash: this fails the
    // moment someone adds a default.
    const legacy = legacySummary();
    const hash = computeSummaryContentHash(legacy as never);
    const withHash = { ...legacy, contentHash: hash };

    const roundTripped = SummaryZ.parse(withHash);
    const recomputed = computeSummaryContentHash(roundTripped);
    expect(recomputed.value).toBe(hash.value);

    // Absent must stay genuinely ABSENT — not present-but-`undefined`, which a
    // `.default(undefined)` or a `.nullable()` relaxation would produce.
    expect(Object.hasOwn(roundTripped.skillAudit, 'provenance')).toBe(false);

    // And the stored hash still verifies end-to-end through the real verifier.
    expect(verifySummaryContentHash(roundTripped)).toBe('MATCH');

    // A SUMMARY that DOES carry provenance parses and preserves every row,
    // including the two rows a skill demanded by both config and a pack
    // produces — the schema must not collapse or reorder them.
    const withProvenance = SummaryZ.parse({
      ...legacySummary(),
      skillAudit: {
        required: ['tdd', 'brainstorming'],
        invoked: ['superpowers:tdd'],
        provenance: [
          { skill: 'tdd', source: 'config' },
          { skill: 'brainstorming', source: 'draft' },
          { skill: 'tdd', source: 'pack:cadence/x' },
        ],
      },
    });
    expect(withProvenance.skillAudit.provenance).toEqual([
      { skill: 'tdd', source: 'config' },
      { skill: 'brainstorming', source: 'draft' },
      { skill: 'tdd', source: 'pack:cadence/x' },
    ]);

    // A malformed provenance row is rejected at parse time rather than
    // silently accepted into the audit trail.
    expect(
      SummaryZ.safeParse({
        ...legacySummary(),
        skillAudit: { required: [], invoked: [], provenance: [{ skill: 'tdd' }] },
      }).success,
    ).toBe(false);
  });
});
