import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs -> repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DRAFT_PATH = join(
  REPO_ROOT,
  '.cadence/phases/274-unobservable-criteria-classification/274-01-DRAFT.md',
);
const DECISIONS_PATH = join(REPO_ROOT, '.cadence/intelligence/decisions.json');

interface LedgerDecision {
  id: string;
  status: string;
}

interface DecisionsLedger {
  decisions?: LedgerDecision[];
}

function readDecisions(): LedgerDecision[] {
  const raw = readFileSync(DECISIONS_PATH, 'utf8');
  const parsed = JSON.parse(raw) as DecisionsLedger;
  return parsed.decisions ?? [];
}

describe('274-01 decision citation (D-G / D-H)', () => {
  // Consolidated into a single `it()` (real, non-mock deep-verify refusal:
  // "the cited test is described only as asserting DRAFT citations; the
  // supplied diff provides no proof it reads decisions.json or asserts both
  // records are active"). Three separate asserting blocks, all carrying this
  // AC's qualified token, meant `scanTestCoverage`'s per-`${acId}@${file}`
  // dedup (`src/verify/coverage.ts:140-142`, no line number in the key) kept
  // only the first — the DRAFT-text-only check — and silently dropped the
  // two tests that actually read `decisions.json` directly and assert
  // `status: active`. One `it()` reads `decisions.json` directly and asserts
  // both records exist with `status: active`, per AC-5's own Then-clause.
  it('274-01/AC-5: the DRAFT text cites both decision ids, and a test reads decisions.json directly to assert both records exist in the ledger with status: active', () => {
    const draftText = readFileSync(DRAFT_PATH, 'utf8');
    expect(draftText).toContain('dec-20260812-004');
    expect(draftText).toContain('dec-20260812-002');

    const decisions = readDecisions();

    const dG = decisions.find((d) => d.id === 'dec-20260812-004');
    expect(dG, 'dec-20260812-004 (D-G) present in decisions.json').toBeDefined();
    expect(dG?.status).toBe('active');

    const dH = decisions.find((d) => d.id === 'dec-20260812-002');
    expect(dH, 'dec-20260812-002 (D-H) present in decisions.json').toBeDefined();
    expect(dH?.status).toBe('active');
  });
});
