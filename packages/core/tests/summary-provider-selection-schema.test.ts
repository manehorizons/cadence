import { describe, it, expect } from 'vitest';
import { SummaryZ } from '@thomas-powers-jr/cadence-types';
import { computeSummaryContentHash } from '../src/services/summary-hash.js';

// Phase 263 (T2, AC-4): `providerSelection` distinguishes a
// deliberately-configured provider from one that silently fell back to mock
// (at selection time or call time) or a real provider whose call structurally
// could not judge anything because its diff was empty. This file mirrors
// `summary-coverage-scheme.test.ts`'s phase-239 precedent for the exact same
// hazard, applied to this new field: `providerSelection` lives on
// `GateProvenanceZ` (nested inside `SummaryZ.gates[]`) rather than directly on
// `SummaryZ`, but the hazard and the guard are identical.

/** A minimal, valid pre-phase-263 SUMMARY carrying a `gates[]` entry — the
 *  exact shape `providerSelection` attaches to — but not the new field. */
function legacySummary(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    draftId: '01-01',
    completedAt: '2026-01-01T00:00:00.000Z',
    acResults: [{ id: 'AC-1', pass: true }],
    taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
    gates: [
      {
        gate: 'code-review',
        status: 'ran',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
      },
    ],
  };
}

describe('SUMMARY providerSelection provenance · schema (phase 263 T2)', () => {
  it('263-01/AC-4: a pre-phase-263 SUMMARY still parses, and the field is not injected', () => {
    const parsed = SummaryZ.parse(legacySummary());
    const gate = parsed.gates?.[0];
    expect(gate).toBeDefined();
    // Absent must stay ABSENT, not become `undefined` via a Zod default.
    expect(Object.hasOwn(gate as object, 'providerSelection')).toBe(false);
  });

  it("263-01/AC-4: a legacy SUMMARY's contentHash still verifies after a schema round-trip", () => {
    // THE HAZARD THIS GUARDS: `cadence summary verify` Zod-parses the file and
    // then hashes the PARSED object. If `providerSelection` carried a Zod
    // `.default(...)`, parsing would inject it into every historical SUMMARY's
    // `gates[]` entries, changing the digest and reporting every past settle
    // as tampered. This test fails the moment someone adds a default.
    const legacy = legacySummary();
    const hash = computeSummaryContentHash(legacy as never);
    const withHash = { ...legacy, contentHash: hash };

    const roundTripped = SummaryZ.parse(withHash);
    const recomputed = computeSummaryContentHash(roundTripped);

    expect(recomputed.value).toBe(hash.value);
  });

  it('263-01/AC-4: a gate entry carrying providerSelection parses and preserves each enum value', () => {
    for (const value of ['configured', 'fallback', 'empty-diff'] as const) {
      const parsed = SummaryZ.parse({
        ...legacySummary(),
        gates: [
          {
            gate: 'security-audit',
            status: 'ran',
            provider: 'anthropic',
            providerSelection: value,
          },
        ],
      });
      expect(parsed.gates?.[0]?.providerSelection).toBe(value);
    }
  });

  it('263-01/AC-4: an unknown providerSelection value is rejected', () => {
    const bad = {
      ...legacySummary(),
      gates: [
        {
          gate: 'security-audit',
          status: 'ran',
          providerSelection: 'silently-downgraded',
        },
      ],
    };
    expect(SummaryZ.safeParse(bad).success).toBe(false);
  });
});
