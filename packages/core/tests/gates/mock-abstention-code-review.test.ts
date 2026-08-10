import { describe, it, expect } from 'vitest';
import { runCodeReviewGate } from '../../src/gates/code-review.js';
import { runSettleGates } from '../../src/gates/registry.js';
import { MockCodeReviewVerifier } from '../../src/verify/code-review.js';
import type { CodeReviewInput, CodeReviewResult } from '../../src/verify/code-review.js';
import type { SettleContext } from '../../src/gates/types.js';

/**
 * Phase 267 (267-01, T1 — corrected per dec-20260809-004, supersedes
 * dec-20260809-003) — corpus-first adversarial fixtures, proven red before
 * T2's implementation. AC-1 (as-built amendment, 2026-08-09): a review-family
 * gate (code-review here) must abstain (`status: 'skipped'` + `skipReason`)
 * rather than persist a mock-provider "pass" — but the abstention decision
 * lives at the RECORDING layer (`registry.ts`'s `GateProvenance` derivation
 * in `runSettleGates`), not by suppressing verifier dispatch. The superseded
 * `dec-20260809-003` design ("verify() must never be dispatched under mock")
 * was implemented faithfully by T2's first attempt and broke 124
 * pre-existing tests across 20 files that exercise real mock-verifier gate
 * behavior (console.log-as-HIGH-finding detection, refuse/reloop/escalate
 * convergence, --force/--allow-code-review-failure bypass mechanics) — all of
 * which requires `verify()` to actually run under mock.
 *
 * Corrected target: `runCodeReviewGate` keeps calling
 * `ctx.verifiers.codeReview.verify(input)` UNCONDITIONALLY (dispatch count
 * stays 1, exactly as today) for every provider including mock. What changes
 * is `runSettleGates` → `registry.ts`: when the gate's returned
 * `flags.verifierIdentity.family` is `'mock'` AND `outcome` is `'pass'`, the
 * persisted `GateProvenance` entry must be `status: 'skipped'` with a
 * `skipReason` naming mock, instead of today's unconditional `status: 'ran'`.
 * This file's `[case N]` tests under the AC-1 describe block below drive the
 * REAL production path end-to-end (`runSettleGates` with its default
 * registry, which wires the real `runCodeReviewGate`) and assert BOTH halves
 * — dispatch count 1 (already true today) and the derived `status:'skipped'`
 * (not yet true today — this is what makes them red pre-T2, for the new
 * reason). A mock-served `refuse` (a real finding was flagged) is NOT this
 * file's concern — see `mock-abstention-registry.test.ts` for the
 * refusal-is-never-relabeled guard.
 *
 * `[GREEN regression]` cases pin the AC-1 real-provider carve-out — mock
 * abstention must never fire for a genuinely-configured non-mock provider —
 * and are expected to pass both before and after T2. Untouched by this
 * correction.
 */

/** A unified diff with an added, non-empty line that does NOT match the
 *  mock verifier's `console.log(` marker — the "reviewed, found nothing"
 *  shape (case 1: non-empty diff, no matching pattern). */
const SAFE_DIFF = `diff --git a/src/x.ts b/src/x.ts
index 1111111..2222222 100644
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;
`;

/** Wraps a verify() implementation with a call counter, so a fixture can
 *  assert whether dispatch happened at all — independent of what the result
 *  shape ends up being. This is the primary AC-1 assertion surface: "decided
 *  ... before the verifier is ever dispatched" is a dispatch-count claim,
 *  not a result-shape claim. */
function spyVerifier(
  impl: (input: CodeReviewInput) => Promise<CodeReviewResult>,
): { calls: number; verify: (input: CodeReviewInput) => Promise<CodeReviewResult> } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    verify: async (input: CodeReviewInput) => {
      state.calls += 1;
      return impl(input);
    },
  };
}

function ctx(over: {
  /** `ctx.config?.codeReview?.provider` — omit entirely to exercise the
   *  defaulted-to-mock path (AC-1: "no configuration of CADENCE can produce
   *  a persisted 'pass' for that gate under mock" — including the silent
   *  default, not only an explicit `{provider:'mock'}`). */
  configProvider?: string;
  verifierPort: { verify: (input: CodeReviewInput) => Promise<CodeReviewResult> };
  diff?: string;
}): SettleContext {
  return {
    cwd: '/x',
    state: { draftReadAt: null, activePhase: '01-foundation', activeDraft: '01-01' } as never,
    draft: { acceptanceCriteria: [], tasks: [], boundaries: [] } as never,
    progress: { draftId: '01-01', tasks: {} },
    config: {
      convergence: { maxAttempts: 3 },
      ...(over.configProvider ? { codeReview: { provider: over.configProvider } } : {}),
    } as never,
    gateSet: { gates: ['code-review'], softCap: false } as never,
    opts: {},
    explicitIds: new Set<string>(),
    touchedFiles: ['src/x.ts'],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => over.diff ?? SAFE_DIFF,
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: over.verifierPort,
    },
    emit: {
      anomalies: async () => {},
      codeReviewHigh: async () => {},
      codeReviewUnconverged: async () => {},
    },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: { read: async () => ({ attemptsSoFar: 0, history: [] }), write: async () => {} },
    io: { err: () => {} },
  } as unknown as SettleContext;
}

describe('Phase 267 — MockCodeReviewVerifier current behavior (documents the bug T2 fixes)', () => {
  // verify/code-review.ts is OUT OF SCOPE for T2 (the DRAFT's T2 file list
  // never touches it) — these two pins stay green forever, both before and
  // after T2, and exist to prove (per the task's instructions) that today's
  // mock verifier really does return a clean pass in both shapes.
  it('case 1: non-empty diff with no console.log match returns a clean pass (no findings) today', async () => {
    const result = await new MockCodeReviewVerifier().verify({ files: ['src/x.ts'], diff: SAFE_DIFF });
    expect(result).toEqual({ findings: {}, provider: 'mock' });
  });

  it('case 2: EMPTY diff returns the identical clean-pass shape via the code-review.ts:113-124 early return — indistinguishable from "reviewed, found nothing"', async () => {
    const result = await new MockCodeReviewVerifier().verify({ files: ['src/x.ts'], diff: '' });
    expect(result).toEqual({ findings: {}, provider: 'mock' });
  });
});

describe('Phase 267 AC-1 — code-review: a mock-identified clean pass is recorded as abstained (status:"skipped") at the registry layer, dispatch unaffected', () => {
  it('267-01/AC-1 [case 1] non-empty diff, no findings, DEFAULTED mock (no codeReview config at all): verify() dispatches normally; registry.ts records status:"skipped" with a skipReason naming mock', async () => {
    const real = new MockCodeReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    const { gates } = await runSettleGates(ctx({ verifierPort: spy, diff: SAFE_DIFF }), {
      order: ['code-review'],
    });
    // dec-20260809-004: dispatch happens normally under mock (the opposite
    // of the superseded no-dispatch design) — this half already passes
    // today. TARGET (T2): registry.ts's derivation currently records
    // status:'ran'+provider:'mock' unconditionally; it must instead resolve
    // to status:'skipped' with a skipReason naming mock for this
    // mock-identified clean pass.
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('267-01/AC-1 [case 1] non-empty diff, no findings, EXPLICIT config.codeReview.provider = "mock": same abstention-at-recording outcome', async () => {
    const real = new MockCodeReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    const { gates } = await runSettleGates(
      ctx({ configProvider: 'mock', verifierPort: spy, diff: SAFE_DIFF }),
      { order: ['code-review'] },
    );
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('267-01/AC-1 [case 2] EMPTY diff, defaulted mock: this is the critical false-clean-pass shape (code-review.ts:113-124) — dispatch still happens, but the registry-recorded status must be "skipped", never a persisted pass', async () => {
    const real = new MockCodeReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    const { gates } = await runSettleGates(ctx({ verifierPort: spy, diff: '' }), {
      order: ['code-review'],
    });
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('267-01/AC-1 [case 2] EMPTY diff, EXPLICIT config.codeReview.provider = "mock": same abstention-at-recording outcome', async () => {
    const real = new MockCodeReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    const { gates } = await runSettleGates(
      ctx({ configProvider: 'mock', verifierPort: spy, diff: '' }),
      { order: ['code-review'] },
    );
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('[GREEN regression, case 3] real provider (anthropic): verify() must still be dispatched — abstention must not fire for a non-mock provider', async () => {
    const spy = spyVerifier(async () => ({ findings: {}, provider: 'anthropic', model: 'claude-x' }));
    const res = await runCodeReviewGate(ctx({ configProvider: 'anthropic', verifierPort: spy, diff: SAFE_DIFF }));
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
    expect(res.flags?.verifierIdentity?.family).toBe('anthropic');
  });

  it('[GREEN regression, case 3] real provider (local), EMPTY diff: verify() must still be dispatched (empty-diff-under-a-real-provider is a distinct, already-handled provenance case — providerSelection:"empty-diff" — never mock abstention)', async () => {
    const spy = spyVerifier(async () => ({ findings: {}, provider: 'local', model: 'qwen2.5-coder' }));
    const res = await runCodeReviewGate(ctx({ configProvider: 'local', verifierPort: spy, diff: '' }));
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
    expect(res.flags?.verifierIdentity?.family).toBe('local');
  });
});
