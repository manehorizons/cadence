import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { SummaryZ } from '@thomas-powers-jr/cadence-types';
import { verifySummaryContentHash } from '../../src/services/summary-verify.js';
import { renderSummaryForReview } from '../../src/services/summary-render.js';

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
