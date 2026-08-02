import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SummaryZ } from '@thomas-powers-jr/cadence-types';
import { GATE_ORDER } from '../../src/gates/registry.js';
import { runCodeReviewGate } from '../../src/gates/code-review.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { CodeReviewResult, Finding } from '../../src/verify/code-review.js';

/**
 * Phase 235 (T6, AC-7) — proves the phase's back-compat contract and pairs
 * `docs/concepts.md` with the anchor ladder / criteria-gap behavior T1–T5
 * actually shipped. Three things must hold simultaneously:
 *
 *  1. `GATE_ORDER` — the canonical settle execution order — is byte-for-byte
 *     unchanged (this phase adds no gate and reorders nothing).
 *  2. The pre-existing HIGH-finding refuse contract of `code-review` is
 *     unchanged for findings that existed before this phase (no anchor, no
 *     gap involvement).
 *  3. A SUMMARY written before this phase (no `anchor` field on any
 *     finding) still parses through the real `SummaryZ` schema.
 *
 * Plus a doc-content check (#4) that `docs/concepts.md` genuinely documents
 * the ladder, the criteria-gap behavior, and the three shipped limitations
 * this phase deliberately did NOT paper over — so the docs can't silently
 * drift from what T1–T5 actually built.
 */

// Resolve repo-root assets from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function readDoc(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

const HIGH: Record<string, Finding[]> = {
  'src/x.ts': [{ severity: 'high', message: 'bad', line: 3 }],
};

/** Minimal `SettleContext` builder — deliberately independent of
 *  `tests/gates/code-review.test.ts`'s own `ctx()` (not imported from it) so
 *  this AC-7 regression check does not silently start passing/failing
 *  because that sibling file changed shape; it re-derives the same
 *  pre-existing wiring from `gates/types.ts` directly. */
function ctx(over: {
  findings?: Record<string, Finding[]>;
  allowCodeReviewFailure?: boolean;
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  const opts: Record<string, boolean> = {};
  if (over.allowCodeReviewFailure) opts.allowCodeReviewFailure = true;
  const result: CodeReviewResult = { findings: over.findings ?? {}, provider: 'mock' };
  return {
    cwd: '/x',
    state: { draftReadAt: null, activePhase: '01-foundation', activeDraft: '01-01' } as never,
    draft: { acceptanceCriteria: [], tasks: [], boundaries: [] } as never,
    progress: { draftId: '01-01', tasks: {} },
    config: { convergence: { maxAttempts: 3 } } as never,
    gateSet: { gates: ['code-review'], softCap: false } as never,
    opts,
    explicitIds: new Set<string>(),
    touchedFiles: ['src/x.ts'],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => 'DIFF',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: { verify: async () => result },
    },
    emit: {
      anomalies: async () => {},
      codeReviewHigh: async () => {},
      codeReviewUnconverged: async () => {},
    },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: {
      read: async () => ({ attemptsSoFar: 0, history: [] }),
      write: async () => {},
    },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('AC-7: GATE_ORDER is unchanged', () => {
  it('AC-7: pins the exact GATE_ORDER sequence — phase 235 adds no gate and reorders nothing', () => {
    expect(GATE_ORDER).toEqual([
      'draft-read',
      'structural-verifier',
      'boundary-scan',
      'task-verify-required',
      'build-test-must-pass',
      'test-coverage',
      'interactive-verdict',
      'deep-verify',
      'code-review',
      'security-audit',
    ]);
  });
});

describe('AC-7: the HIGH-finding refuse contract of code-review is unchanged', () => {
  it('AC-7: a HIGH finding still refuses with the pre-existing reloop message on the first attempt', async () => {
    const errs: string[] = [];
    const res = await runCodeReviewGate(ctx({ findings: HIGH, errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs).toContain('code-review: src/x.ts:3 high — bad\n');
    expect(res.reason).toBe(
      'code-review: attempt 1/3 did not pass — fix the flagged code and re-run `cadence settle run`, ' +
        'or pass --allow-code-review-failure to proceed anyway.',
    );
  });

  it('AC-7: no HIGH finding still passes, exactly as before this phase', async () => {
    const res = await runCodeReviewGate(ctx({ findings: {} }));
    expect(res.outcome).toBe('pass');
  });

  it('AC-7: the SAME pre-existing --allow-code-review-failure bypass still clears a HIGH finding', async () => {
    const errs: string[] = [];
    const res = await runCodeReviewGate(
      ctx({ findings: HIGH, allowCodeReviewFailure: true, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain(
      '--allow-code-review-failure set; proceeding past 1 HIGH finding(s)',
    );
  });
});

describe('AC-7: a pre-existing (pre-phase-235) SUMMARY still parses', () => {
  it('AC-7: a SUMMARY with codeReview findings carrying NO anchor field parses through the real SummaryZ schema', () => {
    // Realistic pre-phase-235 shape: schemaVersion 1, a HIGH finding with no
    // `anchor` key at all (the field did not exist yet) — the back-compat
    // guarantee `AnchorZ.optional()` on `FindingZ` is supposed to provide.
    const preExistingSummary = {
      schemaVersion: 1,
      draftId: '77-01',
      completedAt: '2026-07-15T10:00:00.000Z',
      acResults: [
        { id: 'AC-1', pass: true, evidence: 'executed', note: 'renders cleanly' },
        { id: 'AC-2', pass: false, evidence: 'assertion', note: 'edge case missing' },
      ],
      taskResults: [
        { id: 'T1', status: 'DONE', notes: 'wrote the renderer' },
        { id: 'T2', status: 'BLOCKED', notes: '' },
      ],
      decisions: [],
      deferred: [],
      skillAudit: { required: [], invoked: [] },
      codeReview: {
        'src/legacy.ts': [{ severity: 'high', message: 'pre-existing finding, no anchor', line: 3 }],
      },
      gates: [
        { gate: 'structural-verifier', status: 'ran' },
        { gate: 'code-review', status: 'ran' },
      ],
    };

    const parsed = SummaryZ.safeParse(preExistingSummary);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.codeReview?.['src/legacy.ts']?.[0]?.anchor).toBeUndefined();
    }
  });
});

describe('AC-7: docs/concepts.md documents the anchor ladder, criteria-gap behavior, and its limitations honestly', () => {
  const concepts = readDoc('docs', 'concepts.md');

  it('AC-7: names all four anchor tiers by their exact identifiers', () => {
    expect(concepts).toContain('`executable`');
    expect(concepts).toContain('`structured`');
    expect(concepts).toContain('`declared`');
    expect(concepts).toContain('`undeclared`');
  });

  it('AC-7: explains a criteria gap is emitted through the pre-existing HIGH-finding refuse path, with no new bypass flag', () => {
    expect(concepts).toMatch(/criteria gap/i);
    expect(concepts).toContain('no new refusal path');
    expect(concepts).toContain('no new bypass flag');
  });

  it('AC-7: states the executable tier is reachable in a live settle as of phase 241, closing rec-20260729-002, and still requires corroboration', () => {
    expect(concepts).toContain('rec-20260729-002');
    expect(concepts).toMatch(/closed by phase 241/i);
    // Whitespace-normalized so these assertions survive a reflow of the
    // paragraph but still pin CONNECTED clauses. Asserting the fragments
    // `executable is reachable`, `build-test-must-pass`, and `status: 'ran'`
    // INDEPENDENTLY is not enough: prose claiming "reachable ... even without
    // a `status: 'ran'` entry" satisfies all three in isolation while saying
    // the opposite of what `verify/anchor.ts` implements. The conditional has
    // to be matched as one clause, and the cap has to be asserted too.
    const flat = concepts.replace(/\s+/g, ' ');
    expect(flat).toMatch(
      /`executable` is reachable in a live settle when both of the ladder's conditions hold/i,
    );
    // Condition (a) must be pinned too, not just (b). Without this, prose
    // saying the AC "merely exists in the DRAFT" would satisfy every other
    // assertion here while describing `structured`, not `executable`.
    expect(flat).toMatch(/cited by a task with a non-empty `verify:`/i);
    expect(flat).toMatch(
      /provenance snapshot contains a `build-test-must-pass` entry with `status: 'ran'`/i,
    );
    // The other half of the truth: corroboration is required, not assumed.
    expect(flat).toMatch(
      /`skipped`, `refused`, or absent `build-test-must-pass` entry still caps the tier below `executable`/i,
    );
    // The old, now-false unqualified claim must be gone: any "not reachable"
    // reference to `executable` may only appear scoped to the original-ship
    // framing this bullet corrects, never as an unqualified present-tense claim.
    expect(concepts).not.toMatch(/`executable`\s+tier is not reachable in a real settle yet/i);
  });

  it('AC-7: states anchoring is per-file, not per-finding (rec-20260729-003)', () => {
    expect(concepts).toContain('rec-20260729-003');
    expect(concepts).toMatch(/per-file, not per-finding/i);
  });

  it('AC-7: states a boundary substring match can mask a criteria gap (rec-20260729-005)', () => {
    expect(concepts).toContain('rec-20260729-005');
    expect(concepts).toMatch(/substring/i);
    expect(concepts).toMatch(/mask/i);
  });

  it('AC-7: scopes criteria-anchoring to code-review only, not spec-review/ui-spec-review/plan-review (dec-20260729-003)', () => {
    expect(concepts).toContain('dec-20260729-003');
    expect(concepts).toContain('spec-review');
    expect(concepts).toContain('ui-spec-review');
    expect(concepts).toContain('plan-review');
  });

  it('AC-7: still frames mock as a deterministic placeholder, not real verification, next to the new section', () => {
    // The repo-wide mock-placeholder doc test already pins this framing on
    // docs/concepts.md; this asserts the phrase remains present so the new
    // section could not have been added in a way that implies mock performs
    // real review.
    expect(concepts).toMatch(/placeholder/i);
    expect(concepts).toMatch(/not real verification/i);
  });
});
