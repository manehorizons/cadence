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
