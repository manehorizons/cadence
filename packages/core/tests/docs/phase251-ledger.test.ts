import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs → repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

// Read the live intelligence ledger directly, matching readme-shakedown.test.ts's
// readFileSync + toContain/toMatch pattern (SPEC Context: the in-repo precedent
// for asserting ledger/doc content directly). Per SPEC Context, this ledger is a
// live, continuously-mutating artifact — assertions below match only on id +
// status (+ evidenceIds.length >= N where not asserting an exact count), never
// on exact array ordering or an unrelated count, so future phases' normal
// promote/archive churn doesn't break this test.
interface LedgerRecommendation {
  id: string;
  title: string;
  status: string;
  shippedRef?: string;
  priority?: string;
  readiness?: string;
  evidenceIds?: string[];
}

interface RecommendationsLedger {
  recommendations?: LedgerRecommendation[];
  archived?: LedgerRecommendation[];
}

function readRecommendationsLedger(): RecommendationsLedger {
  const raw = readFileSync(
    join(REPO_ROOT, '.cadence/intelligence/recommendations.json'),
    'utf8',
  );
  return JSON.parse(raw) as RecommendationsLedger;
}

// A rec closed via the single-commit settle convention's normal promote path
// moves from `recommendations[]` into `archived[]` in the same write
// (`autoArchive`, SPEC Context) — search both arrays, never assume either one.
function findRecommendation(
  ledger: RecommendationsLedger,
  id: string,
): LedgerRecommendation | undefined {
  return (
    (ledger.recommendations ?? []).find((r) => r.id === id) ??
    (ledger.archived ?? []).find((r) => r.id === id)
  );
}

function findRecommendationByTitle(
  ledger: RecommendationsLedger,
  titleSubstring: string,
): LedgerRecommendation | undefined {
  const all = [...(ledger.recommendations ?? []), ...(ledger.archived ?? [])];
  return all.find((r) => r.title.includes(titleSubstring));
}

describe('251-01 finding-durability arc ledger close-out', () => {
  it('251-01/AC-1: rec-20260802-001 is shipped at v1.54.0 with two-plus evidence entries, searched across recommendations[] and archived[]', () => {
    const ledger = readRecommendationsLedger();
    const rec = findRecommendation(ledger, 'rec-20260802-001');

    expect(rec).toBeDefined();
    expect(rec?.status).toBe('shipped');
    expect(rec?.shippedRef ?? '').toContain('v1.54.0');
    expect(rec?.evidenceIds?.length ?? 0).toBeGreaterThanOrEqual(2);

    // autoArchive moves a freshly-shipped rec into archived[] in the same
    // write; assert it landed there specifically, matching this worktree's
    // observed reality (verified via direct promote in T1a).
    const inArchived = (ledger.archived ?? []).some((r) => r.id === 'rec-20260802-001');
    expect(inArchived).toBe(true);

    // T1b: the shippedRef-correction gap recommendation exists, found by
    // title substring (its id is runtime-minted — see SPEC Context).
    const gapRec = findRecommendationByTitle(
      ledger,
      'No CLI path corrects a shippedRef on an already-shipped recommendation',
    );
    expect(gapRec).toBeDefined();
    expect(gapRec?.priority).toBe('low');
    expect(gapRec?.readiness).toBe('needs-decision');

    // T1c: rec-20260802-003 carries the post-migration orphan-count evidence
    // (at least the two pre-existing entries plus this phase's new one) — no
    // orphan-count threshold is asserted anywhere (SPEC Context/Constraints).
    const auditRec = findRecommendation(ledger, 'rec-20260802-003');
    expect(auditRec).toBeDefined();
    expect(auditRec?.evidenceIds?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
