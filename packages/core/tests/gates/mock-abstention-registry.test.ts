import { describe, it, expect } from 'vitest';
import { GATE_REGISTRY, runSettleGates } from '../../src/gates/registry.js';
import type { GateEntry, SettleGate } from '../../src/gates/registry.js';
import type { GateResult, SettleContext } from '../../src/gates/types.js';

/**
 * Phase 267 (267-01, T1 — corrected per dec-20260809-004, supersedes
 * dec-20260809-003) — registry-layer half of the AC-1 corpus. The gate-level
 * files (`mock-abstention-code-review.test.ts`,
 * `mock-abstention-security-audit.test.ts`) now assert dispatch AND this
 * same registry-derivation outcome end-to-end via `runSettleGates`; this
 * file isolates the registry derivation logic alone, independent of how the
 * gate internals behave, by feeding hand-built `GateResult` shapes directly
 * into the registry loop via a stub registry entry — mirroring
 * `registry.test.ts`'s own `recordingRegistry` convention.
 *
 * This file's original 3 `[RED]` cases (a mock-identified `outcome:'pass'`
 * must derive `status:'skipped'` + a `skipReason` naming mock — mirroring
 * the phase-248 `reviewVerifierFailure` skip shape, `registry.ts` lines
 * ~255-286) are UNCHANGED by the dec-20260809-004 correction: that
 * derivation rule was never about dispatch, only about what the registry
 * records once a gate has already returned a result, so it is still exactly
 * right under the corrected design. They remain red today (the registry's
 * current `else` branch always records `status: 'ran'`).
 *
 * NEW for the correction: the discrimination the OLD no-dispatch design
 * never needed to make — a mock-identified `outcome:'refuse'` (mock served a
 * REAL finding, e.g. a detected `console.log(` or a seeded security
 * finding) must NOT be relabeled `'skipped'`. A refusal is never false
 * confidence, regardless of provider (dec-20260809-004). These are `[GREEN
 * regression]` guards: registry.ts's refuse branch (lines 218-226) already
 * has no mock-specific special-casing today, so a mock-identified refuse
 * already stays `status:'refused'` pre-T2 — the guard is against T2
 * over-broadening the fix to relabel refusals too.
 *
 * `[GREEN regression]` cases (pre-existing) pin that a real-provider
 * identity must keep recording `status: 'ran'`, and that this change must
 * not broaden into a blanket "mock never runs" (AC-2's deep-verify
 * discrimination case).
 *
 * Per AC-3 (out of scope for T2/T1, owned by T3): a mock-abstained entry may
 * still carry `provider: 'mock'` on its provenance — these fixtures assert
 * only on `status`/`skipReason`, never on the presence/absence of
 * `provider`, so they do not presume T3's rendering design.
 */

const ALL_GATES: SettleGate[] = [
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
];

/** A stub registry: every gate no-ops to a plain pass unless overridden in
 *  `verdicts`. Mirrors `registry.test.ts`'s `recordingRegistry`, restated
 *  locally per this task's "new test files only" boundary. */
function stubRegistry(verdicts: Partial<Record<SettleGate, GateResult>>): Record<SettleGate, GateEntry> {
  const pass: GateResult = { outcome: 'pass' };
  const entry = (gate: SettleGate): GateEntry => ({
    impl: async () => verdicts[gate] ?? pass,
    selfGuarded: GATE_REGISTRY[gate].selfGuarded ?? false,
  });
  return Object.fromEntries(ALL_GATES.map((g) => [g, entry(g)])) as Record<SettleGate, GateEntry>;
}

function ctxWith(gates: string[], opts: Record<string, unknown> = {}): SettleContext {
  return { gateSet: { gates }, opts } as unknown as SettleContext;
}

describe('Phase 267 AC-1 — registry derives abstention (status:"skipped") for a mock-identified review-family result', () => {
  it('[RED] code-review: a "ran" GateResult carrying verifierIdentity.family:"mock" must be recorded status:"skipped" with a skipReason naming mock, never status:"ran"', async () => {
    const { gates } = await runSettleGates(ctxWith(['code-review']), {
      registry: stubRegistry({
        'code-review': { outcome: 'pass', flags: { verifierIdentity: { family: 'mock' } } },
      }),
      order: ['code-review'],
    });
    const entry = gates[0]!;
    // TODAY: entry === { gate: 'code-review', status: 'ran', provider: 'mock' }
    // (verifierIdentityProvenance merges family/model, but the registry's
    // else-branch unconditionally records 'ran'). TARGET (T2): recognize
    // family === 'mock' for a review-family gate and abstain, mirroring the
    // phase-248 reviewVerifierFailure skip shape.
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('[RED] security-audit: same derivation as code-review', async () => {
    const { gates } = await runSettleGates(ctxWith(['security-audit']), {
      registry: stubRegistry({
        'security-audit': { outcome: 'pass', flags: { verifierIdentity: { family: 'mock' } } },
      }),
      order: ['security-audit'],
    });
    const entry = gates[0]!;
    expect(entry.status).toBe('skipped');
    expect(entry.skipReason).toMatch(/mock/i);
  });

  it('[GREEN regression] code-review: verifierIdentity.family:"anthropic" stays status:"ran" — abstention must not fire for a real provider', async () => {
    const { gates } = await runSettleGates(ctxWith(['code-review']), {
      registry: stubRegistry({
        'code-review': {
          outcome: 'pass',
          flags: { verifierIdentity: { family: 'anthropic', model: 'claude-opus-4' } },
        },
      }),
      order: ['code-review'],
    });
    expect(gates).toEqual([
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-opus-4' },
    ]);
  });

  it('[GREEN regression] security-audit: verifierIdentity.family:"local" stays status:"ran"', async () => {
    const { gates } = await runSettleGates(ctxWith(['security-audit']), {
      registry: stubRegistry({
        'security-audit': {
          outcome: 'pass',
          flags: { verifierIdentity: { family: 'local', model: 'qwen2.5-coder' } },
        },
      }),
      order: ['security-audit'],
    });
    expect(gates).toEqual([
      { gate: 'security-audit', status: 'ran', provider: 'local', model: 'qwen2.5-coder' },
    ]);
  });

  // AC-2 discrimination: the fix must not broaden into a blanket "mock never
  // runs" ban. Same settle, both gates resolve to mock: deep-verify keeps its
  // existing "ran" pass semantics (untouched by this phase) while code-review
  // — a review family — must abstain. Asserting both in ONE run is what
  // actually catches an over-broad implementation that a deep-verify-only or
  // code-review-only test each individually would miss.
  it('267-01/AC-2 [discrimination, half RED/half GREEN] deep-verify stays "ran" under mock while code-review (same settle) abstains', async () => {
    const ctx = { gateSet: { gates: ['deep-verify', 'code-review'] }, opts: { deep: true } } as unknown as SettleContext;
    const { gates } = await runSettleGates(ctx, {
      registry: stubRegistry({
        'deep-verify': { outcome: 'pass' },
        'code-review': { outcome: 'pass', flags: { verifierIdentity: { family: 'mock' } } },
      }),
      order: ['deep-verify', 'code-review'],
    });
    // deep-verify: GREEN today and must remain GREEN — AC-2's core guarantee.
    expect(gates[0]).toEqual({ gate: 'deep-verify', status: 'ran' });
    // code-review: RED today (currently 'ran') — this is what T2 must flip.
    const codeReviewEntry = gates[1]!;
    expect(codeReviewEntry.status).toBe('skipped');
    expect(codeReviewEntry.skipReason).toMatch(/mock/i);
  });

  // dec-20260809-004's discrimination the OLD no-dispatch design never had
  // to make: mock-identified 'pass' abstains (above), but mock-identified
  // 'refuse' (mock served a REAL finding) must NOT be relabeled 'skipped' —
  // a refusal is never false confidence, regardless of provider. GREEN
  // regression today: registry.ts's refuse branch (lines 218-226) has no
  // mock-specific special-casing at all currently, so this already passes —
  // the guard is against T2 over-broadening the abstention fix to also
  // swallow refusals.
  it('267-01/AC-1 [GREEN regression] code-review: a "refused" GateResult carrying verifierIdentity.family:"mock" (mock served a real finding) keeps status:"refused" — never relabeled "skipped"', async () => {
    const { gates } = await runSettleGates(ctxWith(['code-review']), {
      registry: stubRegistry({
        'code-review': {
          outcome: 'refuse',
          reason: 'code-review: attempt 1/3 did not pass',
          flags: { verifierIdentity: { family: 'mock' } },
        },
      }),
      order: ['code-review'],
    });
    expect(gates).toEqual([
      {
        gate: 'code-review',
        status: 'refused',
        reason: 'code-review: attempt 1/3 did not pass',
        provider: 'mock',
      },
    ]);
  });

  it('267-01/AC-1 [GREEN regression] security-audit: same derivation — a mock-identified "refused" GateResult keeps status:"refused"', async () => {
    const { gates } = await runSettleGates(ctxWith(['security-audit']), {
      registry: stubRegistry({
        'security-audit': {
          outcome: 'refuse',
          reason: 'security-audit: blocking finding',
          flags: { verifierIdentity: { family: 'mock' } },
        },
      }),
      order: ['security-audit'],
    });
    expect(gates).toEqual([
      {
        gate: 'security-audit',
        status: 'refused',
        reason: 'security-audit: blocking finding',
        provider: 'mock',
      },
    ]);
  });
});
