import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { SummaryZ } from '@thomas-powers-jr/cadence-types';
import { computeSummaryContentHash } from '../src/services/summary-hash.js';
import { verifySummaryContentHash } from '../src/services/summary-verify.js';

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

// Phase 275 (T1): `observedProvider`/`observedModel`/`taskId` are a second,
// structurally separate identity field set on `GateProvenanceZ` —
// deliberately distinct from `provider`/`model` so `deriveAssuranceRecord`'s
// fold (which only ever reads `provider`/`model`) cannot see them. Same
// content-hash-safety hazard as `providerSelection` above: NO `.default(...)`
// on any of the three, or parsing a historical SUMMARY would inject a value,
// change its digest, and report every past settle as tampered.
//
// This repo's coverage scanner dedups a phase-qualified AC token per file by
// first occurrence only (`coverage.ts`) — both the hand-built round-trip
// assertion and the real-fixture assertion below MUST live inside a single
// asserting test block (not split into two), and the qualified token itself
// must not be written a second time anywhere earlier in this file (even in a
// comment or describe title), or the real assertion's dedup slot gets stolen
// and its coverage becomes invisible to the evidence-floor gate. Deliberately
// not spelled out literally here for that exact reason — see the test title
// itself for the token.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE_241 = join(
  REPO_ROOT,
  '.cadence',
  'phases',
  '241-anchor-ladder-reachability',
  '241-01-SUMMARY.json',
);

describe('SUMMARY observedProvider/observedModel/taskId provenance · schema (phase 275 T1)', () => {
  it('275-01/AC-5: observedProvider/observedModel/taskId are additive and content-hash-safe', () => {
    // Part 1 — non-tautological round-trip, mirroring providerSelection's
    // pattern above exactly: hash a hand-built legacy object (lacking all
    // three new fields) BEFORE any schema parse, round-trip it through
    // SummaryZ.parse, then re-hash. If any of the three fields carried a
    // `.default(...)`, parsing would inject it and the hashes would diverge.
    const legacy = legacySummary();
    const hash = computeSummaryContentHash(legacy as never);
    const withHash = { ...legacy, contentHash: hash };

    const roundTripped = SummaryZ.parse(withHash);
    const recomputed = computeSummaryContentHash(roundTripped);

    expect(recomputed.value).toBe(hash.value);

    // The legacy gate entry itself must not have gained the new fields via
    // parsing — absent must stay ABSENT, never `undefined` via a default.
    const gate = roundTripped.gates?.[0];
    expect(gate).toBeDefined();
    expect(Object.hasOwn(gate as object, 'observedProvider')).toBe(false);
    expect(Object.hasOwn(gate as object, 'observedModel')).toBe(false);
    expect(Object.hasOwn(gate as object, 'taskId')).toBe(false);

    // A gate entry that DOES carry the new fields parses and preserves them,
    // alongside `provider`/`model` left absent (the shape T2/T4 produce).
    const withNewFields = SummaryZ.parse({
      ...legacySummary(),
      gates: [
        {
          gate: 'per-task-verify',
          status: 'ran',
          taskId: 'T1',
          observedProvider: 'host-cli',
          observedModel: 'claude-sonnet-5',
        },
      ],
    });
    expect(withNewFields.gates?.[0]).toMatchObject({
      taskId: 'T1',
      observedProvider: 'host-cli',
      observedModel: 'claude-sonnet-5',
    });
    expect(Object.hasOwn(withNewFields.gates?.[0] as object, 'provider')).toBe(false);
    expect(Object.hasOwn(withNewFields.gates?.[0] as object, 'model')).toBe(false);

    // Part 2 — sanity-check against a real, historical, settled SUMMARY.json
    // from this repo's own `.cadence/phases/` corpus (predates this phase,
    // so none of its `gates[]` entries carry the new fields): parsing it
    // through the updated schema must not perturb its stored contentHash.
    const raw = readFileSync(FIXTURE_241, 'utf8');
    const parsedFixture = SummaryZ.safeParse(JSON.parse(raw));
    if (!parsedFixture.success) {
      throw new Error(`fixture ${FIXTURE_241} failed SummaryZ validation: ${parsedFixture.error.message}`);
    }
    const fixtureSummary = parsedFixture.data;

    // Sanity: the fixture actually has a gates[] array and a stored hash —
    // otherwise this assertion would pass vacuously.
    expect(fixtureSummary.gates?.length).toBeGreaterThan(0);
    expect(fixtureSummary.contentHash).toBeDefined();

    expect(verifySummaryContentHash(fixtureSummary)).toBe('MATCH');
  });
});
