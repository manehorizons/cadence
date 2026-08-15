import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { SummaryZ } from '@thomas-powers-jr/cadence-types';
import { verifySummaryContentHash } from '../../src/services/summary-verify.js';
import { renderSummaryForReview } from '../../src/services/summary-render.js';
import { computeSummaryContentHash } from '../../src/services/summary-hash.js';

/**
 * Phase 264, T3 — proves that calling `renderSummaryForReview` (T2's
 * `verifierRollup`-against-`gates` join, phase 264's display-layer change)
 * has zero effect on `contentHash` verification.
 *
 * Uses a real, historical, settled `<id>-SUMMARY.json` from this repo's own
 * `.cadence/phases/` corpus rather than a synthetic fixture, so the object
 * under test is exactly the shape `SummaryZ.safeParse` hands to production
 * code (`cli/commands/summary.ts`'s `loadSummary`), not a hand-assembled
 * approximation. `241-anchor-ladder-reachability/241-01-SUMMARY.json` was
 * picked because it carries both a stored `contentHash` AND a populated
 * `assurance.verifierRollup` entry for the `mock` provider (with a matching
 * `gates` entry) — the exact combination T2's join logic
 * (`summary-render.ts`'s call into `formatVerifierRollupLabel`) exercises.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FIXTURE_PATH = join(
  REPO_ROOT,
  '.cadence',
  'phases',
  '241-anchor-ladder-reachability',
  '241-01-SUMMARY.json',
);

describe('render never touches contentHash (phase 264, T3)', () => {
  it('264-01/AC-2: rendering a real settled Summary via renderSummaryForReview has zero effect on verifySummaryContentHash, which still reports MATCH', () => {
    const raw = readFileSync(FIXTURE_PATH, 'utf8');
    const parsed = SummaryZ.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`fixture ${FIXTURE_PATH} failed SummaryZ validation: ${parsed.error.message}`);
    }
    const summary = parsed.data;

    // Sanity: the fixture actually carries a stored contentHash and a
    // populated mock verifierRollup entry — otherwise this test would pass
    // vacuously without exercising T2's render-time join at all.
    expect(summary.contentHash).toBeDefined();
    expect(summary.assurance?.verifierRollup.length).toBeGreaterThan(0);
    expect(summary.assurance?.verifierRollup.some((v) => v.provider === 'mock')).toBe(true);

    // Baseline: verify BEFORE any render call, over the parsed Summary
    // object exactly as production's `loadSummary` produces it.
    expect(verifySummaryContentHash(summary)).toBe('MATCH');

    // The call under test: render to Markdown. This must never mutate
    // `summary` nor otherwise participate in `computeSummaryContentHash`'s
    // input — the renderer only ever reads `s.gates` and
    // `s.assurance.verifierRollup` to build a display label; it does not
    // write back into either.
    const markdown = renderSummaryForReview(summary);
    expect(markdown).toContain(summary.draftId);
    expect(markdown.toLowerCase()).toContain('mock');

    // Re-verify the ORIGINAL parsed Summary object (never the rendered
    // Markdown) after the render call: still MATCH. This is the proof that
    // calling the renderer has no side effect on the hash-verification
    // outcome — render and verify are fully independent code paths.
    expect(verifySummaryContentHash(summary)).toBe('MATCH');
  });
});

/**
 * Phase 274, T3 — AC-4 (content-hash half): `DeepVerdictZ`'s new optional
 * `unobservable` field must be additive in the strongest sense — a historical
 * settled record that predates this phase, where the field is entirely
 * absent, must recompute to the exact same digest it was stamped with at its
 * original settle.
 *
 * Deliberately reuses phase 272's real, committed `272-01-SUMMARY.json`
 * (already the AC-2 replay fixture for `criteria-observability.test.ts`)
 * rather than a synthetic record: its `deepVerify` block genuinely carries
 * `pass: false` entries for AC-1/AC-4/AC-7 (this phase's own motivating
 * case), so this is the exact shape the new field is designed to attach to —
 * and the baseline being asserted against is the `contentHash.value` that
 * was ALREADY on disk before this phase touched `summary.ts`, not a hex
 * literal computed after the schema change (which would prove nothing).
 */
describe('DeepVerdictZ.unobservable is additive — historical records hash unchanged (phase 274, T3)', () => {
  const FIXTURE_272 = join(
    REPO_ROOT,
    '.cadence',
    'phases',
    '272-assurance-record-correctness',
    '272-01-SUMMARY.json',
  );

  it('274-01/AC-4: a real historical SUMMARY.json with deepVerify.unobservable absent everywhere recomputes to its originally-stored contentHash', () => {
    const raw = readFileSync(FIXTURE_272, 'utf8');
    const storedHashValue = (JSON.parse(raw) as { contentHash?: { value?: string } }).contentHash
      ?.value;
    // Sanity: the fixture actually has a stored hash to compare against —
    // otherwise this test would pass vacuously.
    expect(storedHashValue).toBeTruthy();

    const parsed = SummaryZ.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`fixture ${FIXTURE_272} failed SummaryZ validation: ${parsed.error.message}`);
    }
    const summary = parsed.data;

    // Confirm the schema addition didn't perturb parsing: deepVerify has
    // real pass:false entries (272's motivating case) and none of them
    // carry the new field — parsing an old record never invents it.
    expect(summary.deepVerify?.['AC-1']?.pass).toBe(false);
    expect(summary.deepVerify?.['AC-1']?.unobservable).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(summary.deepVerify?.['AC-1'] ?? {}, 'unobservable')).toBe(
      false,
    );

    // The load-bearing assertion: recomputing over the parsed record (with
    // the new optional field absent, exactly as Zod leaves it) reproduces
    // the digest this SUMMARY.json was ALREADY stamped with, pre-dating
    // this phase's schema.ts change entirely.
    expect(verifySummaryContentHash(summary)).toBe('MATCH');
    expect(computeSummaryContentHash(summary).value).toBe(storedHashValue);
  });
});

/**
 * Phase 280 (280-01, T13/T16): `SummaryZ.taskResults[]` gained three new
 * optional fields — `execution`, `isolation`, `modelClass` (T13) — dispatch-
 * contract provenance for how a task was actually carried out. Same
 * content-hash-safety hazard as `coverageScheme`/`providerSelection`/
 * `DeepVerdictZ.unobservable` above: NO `.default(...)` on any of the three,
 * or parsing a historical record would inject a value, change its digest,
 * and falsely report every past settle as tampered.
 *
 * Reuses phase 279's own real, committed `279-01-SUMMARY.json` (predates
 * this phase — none of its `taskResults[]` entries carry the new fields) as
 * the historical fixture: the baseline asserted against is the
 * `contentHash.value` already on disk from that phase's own settle, not a
 * hex literal recomputed after the schema change (which would prove
 * nothing).
 */
describe('SummaryZ.taskResults[].execution/isolation/modelClass are additive — historical records hash unchanged (phase 280, T13/T16)', () => {
  const FIXTURE_279 = join(
    REPO_ROOT,
    '.cadence',
    'phases',
    '279-dispatch-policy-engine',
    '279-01-SUMMARY.json',
  );

  it('280-01/AC-5: a real historical SUMMARY.json with execution/isolation/modelClass absent everywhere recomputes to its originally-stored contentHash, and a hand-built legacy taskResults entry round-trips unchanged while a new-fields entry parses and preserves the enum values', () => {
    const raw = readFileSync(FIXTURE_279, 'utf8');
    const storedHashValue = (JSON.parse(raw) as { contentHash?: { value?: string } }).contentHash
      ?.value;
    // Sanity: the fixture actually has a stored hash to compare against —
    // otherwise this test would pass vacuously.
    expect(storedHashValue).toBeTruthy();

    const parsed = SummaryZ.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`fixture ${FIXTURE_279} failed SummaryZ validation: ${parsed.error.message}`);
    }
    const summary = parsed.data;

    // Confirm the schema addition didn't perturb parsing: the fixture
    // genuinely has taskResults, and none of them carry the new fields post-
    // parse — parsing an old record never invents them.
    expect(summary.taskResults.length).toBeGreaterThan(0);
    for (const t of summary.taskResults) {
      expect(Object.hasOwn(t, 'execution')).toBe(false);
      expect(Object.hasOwn(t, 'isolation')).toBe(false);
      expect(Object.hasOwn(t, 'modelClass')).toBe(false);
    }

    // The load-bearing assertion: recomputing over the parsed record (with
    // the three new optional fields absent, exactly as Zod leaves them)
    // reproduces the digest this SUMMARY.json was ALREADY stamped with,
    // pre-dating this phase's schema.ts change entirely.
    expect(verifySummaryContentHash(summary)).toBe('MATCH');
    expect(computeSummaryContentHash(summary).value).toBe(storedHashValue);

    // Second, non-tautological round-trip mirroring phase 239/263/275's
    // pattern exactly: hash a hand-built legacy object (lacking all three
    // new fields) BEFORE any schema parse, round-trip it through
    // SummaryZ.parse, then re-hash. If any of the three fields carried a
    // `.default(...)`, parsing would inject it and the hashes would diverge.
    const legacy = {
      schemaVersion: 2,
      draftId: '01-01',
      completedAt: '2026-01-01T00:00:00.000Z',
      acResults: [{ id: 'AC-1', pass: true }],
      taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
      decisions: [],
      deferred: [],
      skillAudit: { required: [], invoked: [] },
    };
    const legacyHash = computeSummaryContentHash(legacy as never);
    const withHash = { ...legacy, contentHash: legacyHash };

    const roundTripped = SummaryZ.parse(withHash);
    const recomputed = computeSummaryContentHash(roundTripped);
    expect(recomputed.value).toBe(legacyHash.value);

    const legacyTask = roundTripped.taskResults[0];
    expect(legacyTask).toBeDefined();
    expect(Object.hasOwn(legacyTask as object, 'execution')).toBe(false);
    expect(Object.hasOwn(legacyTask as object, 'isolation')).toBe(false);
    expect(Object.hasOwn(legacyTask as object, 'modelClass')).toBe(false);

    // A taskResults entry that DOES carry the new fields parses and
    // preserves them.
    const withNewFields = SummaryZ.parse({
      ...legacy,
      taskResults: [
        {
          id: 'T1',
          status: 'DONE',
          notes: '',
          execution: 'dispatch',
          isolation: 'worktree',
          modelClass: 'standard',
        },
      ],
    });
    expect(withNewFields.taskResults[0]).toMatchObject({
      execution: 'dispatch',
      isolation: 'worktree',
      modelClass: 'standard',
    });
  });
});
