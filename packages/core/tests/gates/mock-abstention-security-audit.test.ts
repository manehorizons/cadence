import { describe, it, expect } from 'vitest';
import { runSecurityAuditGate } from '../../src/gates/security-audit.js';
import { runSettleGates } from '../../src/gates/registry.js';
import { MockSecurityAuditVerifier } from '../../src/verify/security-audit.js';
import type { SecurityAuditInput, SecurityAuditResult } from '../../src/verify/security-audit.js';
import type { SettleContext } from '../../src/gates/types.js';

/**
 * Phase 267 (267-01, T1 — corrected per dec-20260809-004, supersedes
 * dec-20260809-003) — corpus-first adversarial fixtures, proven red before
 * T2's implementation. Mirrors `mock-abstention-code-review.test.ts` exactly,
 * for the security-audit family. AC-1's corrected bar: `verify()` dispatches
 * normally under mock (dispatch count stays 1, exactly as today) — the
 * superseded `dec-20260809-003` no-dispatch design broke 124 pre-existing
 * tests that exercise real mock-verifier gate behavior. The abstention
 * decision instead lives at `registry.ts`'s `GateProvenance` derivation
 * (`runSettleGates`): a mock-identified `outcome:'pass'` must be recorded
 * `status:'skipped'` with a `skipReason` naming mock, instead of today's
 * unconditional `status:'ran'`. `[case N]` tests below drive the real
 * production path end-to-end (`runSettleGates` with its default registry,
 * which wires the real `runSecurityAuditGate`) and assert both the dispatch
 * count (already 1 today) and the derived status (not yet 'skipped' today —
 * this is what makes them red pre-T2, for the new reason). `[GREEN
 * regression]` cases pin the real-provider carve-out, untouched by this
 * correction.
 */

/** A unified diff with an added, non-empty line that does NOT match either
 *  of the mock verifier's markers (`AUTH_HEADER_RE`, `JWT_RE`) — the
 *  "reviewed, found nothing" shape (case 1). */
const SAFE_DIFF = `diff --git a/src/x.ts b/src/x.ts
index 1111111..2222222 100644
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;
`;

function spyVerifier(
  impl: (
    input: SecurityAuditInput,
    opts?: { signal?: AbortSignal; traceId?: string },
  ) => Promise<SecurityAuditResult>,
): {
  calls: number;
  verify: (
    input: SecurityAuditInput,
    opts?: { signal?: AbortSignal; traceId?: string },
  ) => Promise<SecurityAuditResult>;
} {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    verify: async (input, opts) => {
      state.calls += 1;
      return impl(input, opts);
    },
  };
}

function ctx(over: {
  /** `ctx.config?.securityAudit?.provider` — omit entirely to exercise the
   *  defaulted-to-mock path, same rationale as the code-review fixture. */
  configProvider?: string;
  verifierPort: {
    verify: (
      input: SecurityAuditInput,
      opts?: { signal?: AbortSignal; traceId?: string },
    ) => Promise<SecurityAuditResult>;
  };
  diff?: string;
  /** Phase 267 (267-01, whole-branch-review follow-up): --force /
   *  --allow-security-audit-failure, for the bypass-discrimination test
   *  below. Omit for the default `{}` every other fixture in this file
   *  uses. */
  opts?: { force?: boolean; allowSecurityAuditFailure?: boolean };
}): SettleContext {
  return {
    cwd: '/x',
    state: { draftReadAt: null, activePhase: '01-foundation', activeDraft: '01-01' } as never,
    draft: { acceptanceCriteria: [], tasks: [] } as never,
    progress: { draftId: '01-01', tasks: {} },
    config: over.configProvider ? ({ securityAudit: { provider: over.configProvider } } as never) : null,
    gateSet: { gates: ['security-audit'], softCap: false } as never,
    opts: over.opts ?? {},
    explicitIds: new Set<string>(),
    touchedFiles: ['src/x.ts'],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => over.diff ?? SAFE_DIFF,
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: { verify: async () => ({ findings: {}, provider: 'mock' }) },
      securityAudit: over.verifierPort,
    },
    emit: { anomalies: async () => {}, codeReviewHigh: async () => {}, codeReviewUnconverged: async () => {} },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: { read: async () => ({ attemptsSoFar: 0, history: [] }), write: async () => {} },
    io: { err: () => {} },
  } as unknown as SettleContext;
}

describe('Phase 267 — MockSecurityAuditVerifier current behavior (documents the bug T2 fixes)', () => {
  // verify/security-audit.ts is OUT OF SCOPE for T2 — these two pins stay
  // green forever, proving today's mock verifier returns a clean pass in
  // both the "walked, no match" and "empty diff early return" shapes.
  it('case 1: non-empty diff with no matching pattern returns a clean pass (no findings) today', async () => {
    const result = await new MockSecurityAuditVerifier().verify({ files: ['src/x.ts'], diff: SAFE_DIFF });
    expect(result).toEqual({ findings: [], provider: 'mock' });
  });

  it('case 2: EMPTY diff returns the identical clean-pass shape via the security-audit.ts:76-79 early return', async () => {
    const result = await new MockSecurityAuditVerifier().verify({ files: ['src/x.ts'], diff: '' });
    expect(result).toEqual({ findings: [], provider: 'mock' });
  });
});

describe('Phase 267 AC-1 — security-audit: a mock-identified clean pass is recorded as abstained (status:"skipped") at the registry layer, dispatch unaffected', () => {
  it('267-01/AC-1 [case 1] non-empty diff, no findings, DEFAULTED mock (no securityAudit config at all): verify() dispatches normally; registry.ts records status:"skipped" with a skipReason naming mock', async () => {
    const real = new MockSecurityAuditVerifier();
    const spy = spyVerifier((input, opts) => real.verify(input, opts));
    const { gates } = await runSettleGates(ctx({ verifierPort: spy, diff: SAFE_DIFF }), {
      order: ['security-audit'],
    });
    // dec-20260809-004: dispatch happens normally under mock — this half
    // already passes today. TARGET (T2): registry.ts's derivation currently
    // records status:'ran'+provider:'mock' unconditionally; it must instead
    // resolve to status:'skipped' with a skipReason naming mock.
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('267-01/AC-1 [case 1] non-empty diff, no findings, EXPLICIT config.securityAudit.provider = "mock": same abstention-at-recording outcome', async () => {
    const real = new MockSecurityAuditVerifier();
    const spy = spyVerifier((input, opts) => real.verify(input, opts));
    const { gates } = await runSettleGates(
      ctx({ configProvider: 'mock', verifierPort: spy, diff: SAFE_DIFF }),
      { order: ['security-audit'] },
    );
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('267-01/AC-1 [case 2] EMPTY diff, defaulted mock: the critical false-clean-pass shape (security-audit.ts:76-79) — dispatch still happens, but the registry-recorded status must be "skipped", never a persisted pass', async () => {
    const real = new MockSecurityAuditVerifier();
    const spy = spyVerifier((input, opts) => real.verify(input, opts));
    const { gates } = await runSettleGates(ctx({ verifierPort: spy, diff: '' }), {
      order: ['security-audit'],
    });
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('267-01/AC-1 [case 2] EMPTY diff, EXPLICIT config.securityAudit.provider = "mock": same abstention-at-recording outcome', async () => {
    const real = new MockSecurityAuditVerifier();
    const spy = spyVerifier((input, opts) => real.verify(input, opts));
    const { gates } = await runSettleGates(
      ctx({ configProvider: 'mock', verifierPort: spy, diff: '' }),
      { order: ['security-audit'] },
    );
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('[GREEN regression, case 3] real provider (anthropic): verify() must still be dispatched — abstention must not fire for a non-mock provider', async () => {
    const spy = spyVerifier(async () => ({ findings: [], provider: 'anthropic', model: 'claude-x' }));
    const res = await runSecurityAuditGate(ctx({ configProvider: 'anthropic', verifierPort: spy, diff: SAFE_DIFF }));
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
    expect(res.flags?.verifierIdentity?.family).toBe('anthropic');
  });

  it('[GREEN regression, case 3] real provider (local), EMPTY diff: verify() must still be dispatched (empty-diff-under-a-real-provider is a distinct, already-handled provenance case, never mock abstention)', async () => {
    const spy = spyVerifier(async () => ({ findings: [], provider: 'local', model: 'qwen2.5-coder' }));
    const res = await runSecurityAuditGate(ctx({ configProvider: 'local', verifierPort: spy, diff: '' }));
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
    expect(res.flags?.verifierIdentity?.family).toBe('local');
  });
});

describe('267-01/AC-1 — reviewFindingsBypassed discrimination: a bypassed REAL finding under mock is never relabeled "skipped"', () => {
  // Whole-branch-review follow-up (2026-08-09): the registry.ts branch that
  // relabels a mock-identified clean pass to status:'skipped' must NOT also
  // catch a real CRITICAL finding that was waved through via --force /
  // --allow-security-audit-failure -- that's a bypassed real finding, not a
  // clean pass, and must keep status:'ran' (registry.ts's
  // reviewFindingsBypassed guard, gates/types.ts). Verified correct via a
  // throwaway repro during T2's build (per its As-built note) but never
  // committed as a permanent regression test -- this closes that gap.
  const CRITICAL_FINDING = [{ severity: 'critical' as const, message: 'hardcoded secret', line: 1 }];

  it('a CRITICAL finding bypassed via --force under mock stays status:"ran", never relabeled "skipped"', async () => {
    const spy = spyVerifier(async () => ({ findings: CRITICAL_FINDING, provider: 'mock' }));
    const { gates } = await runSettleGates(
      ctx({ verifierPort: spy, opts: { force: true } }),
      { order: ['security-audit'] },
    );
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('ran');
    expect(entry.provider).toBe('mock');
  });

  it('a CRITICAL finding bypassed via --allow-security-audit-failure under mock stays status:"ran"', async () => {
    const spy = spyVerifier(async () => ({ findings: CRITICAL_FINDING, provider: 'mock' }));
    const { gates } = await runSettleGates(
      ctx({ verifierPort: spy, opts: { allowSecurityAuditFailure: true } }),
      { order: ['security-audit'] },
    );
    expect(spy.calls).toBe(1);
    expect(gates[0]!.status).toBe('ran');
  });

  it('a genuinely clean pass with --force set for an unrelated reason (no findings) still abstains -- --force alone must not suppress the relabel', async () => {
    const spy = spyVerifier(async () => ({ findings: [], provider: 'mock' }));
    const { gates } = await runSettleGates(
      ctx({ verifierPort: spy, diff: SAFE_DIFF, opts: { force: true } }),
      { order: ['security-audit'] },
    );
    expect(spy.calls).toBe(1);
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });
});
