import { describe, it, expect } from 'vitest';
import { runDeepVerifyGate } from '../../src/gates/deep-verify.js';
import { runPerTaskVerifyGate } from '../../src/gates/per-task-verify.js';
import { MockVerifier } from '../../src/verify/mock-verifier.js';
import { MockPerTaskVerifier } from '../../src/verify/per-task.js';
import type { VerifyInput, VerifyResult } from '../../src/verify/verifier.js';
import type { PerTaskInput, PerTaskResult } from '../../src/verify/per-task.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { BuildGateContext } from '../../src/gates/build-types.js';

/**
 * Phase 267 (267-01, T1) — AC-2 regression guard, case 4. `deep-verify` and
 * `per-task-verify` enforce real AC/test linkage (not a diff-content early
 * return) and MUST NOT be swept into the review-family mock-abstention
 * change — they are explicitly protected by AC-2 and by the phase DRAFT's
 * own Boundaries ("DO NOT touch deep-verify or per-task-verify's mock pass
 * semantics ... converting those to abstention would remove a real gate the
 * evidence ladder and test-coverage gate depend on").
 *
 * Unlike the five review families, these two gates dispatch `verify()`
 * UNCONDITIONALLY under mock both today and after T2 — there is no
 * dispatch-count claim to flip here. These fixtures wire the REAL
 * `MockVerifier`/`MockPerTaskVerifier` classes (not stubs) through their
 * gates and assert today's AC-linked-test / files+diff pass/fail semantics,
 * so a future change that over-broadens the review-family abstention into a
 * blanket "mock never runs" would break these — they are pure regression
 * guards, GREEN before and after T2. The mixed discrimination case (one
 * `runSettleGates` call where deep-verify stays "ran" while code-review, same
 * settle, abstains) lives in `mock-abstention-registry.test.ts`.
 */

describe('Phase 267 AC-2 — deep-verify keeps its AC-linked-test mock pass/fail semantics, unaffected by review-family abstention', () => {
  function deepCtx(over: {
    acs: Array<{ id: string; given: string; when: string; then: string }>;
    tests: Record<string, Array<{ file: string; line: number; snippet: string }>>;
    force?: boolean;
  }): SettleContext {
    let calls = 0;
    const real = new MockVerifier();
    return {
      cwd: '/x',
      state: {} as never,
      draft: { acceptanceCriteria: over.acs, tasks: [] } as never,
      progress: { draftId: 'd', tasks: {} },
      config: null,
      gateSet: { gates: ['deep-verify'], softCap: false },
      opts: { deep: true, ...(over.force ? { force: true } : {}) },
      explicitIds: new Set<string>(),
      touchedFiles: ['a.ts'],
      coverage: async () => new Map(Object.entries(over.tests)),
      diff: () => 'DIFF',
      verifiers: {
        deep: {
          get calls() {
            return calls;
          },
          verify: async (input: VerifyInput): Promise<VerifyResult> => {
            calls += 1;
            return real.verify(input);
          },
        },
      },
      emit: { anomalies: async () => {} },
      io: { err: () => {} },
    } as unknown as SettleContext;
  }

  it('267-01/AC-2: an AC with a linked test still passes under the real mock verifier (today, unchanged by this phase)', async () => {
    const ctx = deepCtx({
      acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tests: { 'AC-1': [{ file: 'tests/a.test.ts', line: 3, snippet: 'AC-1' }] },
    });
    const res = await runDeepVerifyGate(ctx);
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.pass).toBe(true);
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.provider).toBe('mock');
    // Dispatch DID happen — the opposite of the review-family target.
    expect((ctx.verifiers.deep as unknown as { calls: number }).calls).toBe(1);
  });

  it('an AC with NO linked test still refuses under the real mock verifier (today, unchanged by this phase)', async () => {
    const ctx = deepCtx({
      acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tests: {},
    });
    const res = await runDeepVerifyGate(ctx);
    expect(res.outcome).toBe('refuse');
    expect(res.summaryPatch?.deepVerify?.['AC-1']).toEqual({
      pass: false,
      reason: 'no linked test found',
      provider: 'mock',
    });
  });

  it('an AC with NO linked test passes under --force, findings still recorded as failing (unchanged by this phase)', async () => {
    const ctx = deepCtx({
      acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tests: {},
      force: true,
    });
    const res = await runDeepVerifyGate(ctx);
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.pass).toBe(false);
  });
});

describe('Phase 267 AC-2 — per-task-verify keeps its files+diff mock verdict semantics, unaffected by review-family abstention', () => {
  function perTaskCtx(over: { files: string[]; diff: string }): BuildGateContext {
    let calls = 0;
    const real = new MockPerTaskVerifier();
    return {
      cwd: '/x',
      state: {} as never,
      draft: { tasks: [{ id: 'T1', files: over.files }] } as never,
      config: null,
      gateSet: { gates: ['per-task-verify'], softCap: false } as never,
      taskId: 'T1',
      opts: {},
      diff: () => over.diff,
      verifiers: {
        perTask: {
          get calls() {
            return calls;
          },
          verify: async (input: PerTaskInput): Promise<PerTaskResult> => {
            calls += 1;
            return real.verify(input);
          },
        },
      },
      emit: { perTaskFail: async () => {} },
      io: { err: () => {} },
    } as unknown as BuildGateContext;
  }

  it('267-01/AC-2: non-empty files + non-empty diff pass under the real mock verifier (today, unchanged by this phase)', async () => {
    const ctx = perTaskCtx({ files: ['src/a.ts'], diff: 'DIFF' });
    const res = await runPerTaskVerifyGate(ctx);
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.perTaskRecord).toMatchObject({ verdict: 'pass', provider: 'mock' });
    // Dispatch DID happen — the opposite of the review-family target.
    expect((ctx.verifiers.perTask as unknown as { calls: number }).calls).toBe(1);
  });

  it('267-01/AC-2: no files touched still refuses under the real mock verifier (today, unchanged by this phase)', async () => {
    const ctx = perTaskCtx({ files: [], diff: '' });
    const res = await runPerTaskVerifyGate(ctx);
    expect(res.outcome).toBe('refuse');
    expect(res.summaryPatch?.perTaskRecord).toBeUndefined();
  });

  it('267-01/AC-2: files touched but empty diff still records "concerns" under the real mock verifier (today, unchanged by this phase)', async () => {
    const ctx = perTaskCtx({ files: ['src/a.ts'], diff: '' });
    const res = await runPerTaskVerifyGate(ctx);
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.perTaskRecord).toMatchObject({ verdict: 'concerns', provider: 'mock' });
  });
});
