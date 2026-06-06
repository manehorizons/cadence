import { describe, it, expect } from 'vitest';
import { runDeepVerifyGate } from '../../src/gates/deep-verify.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { VerifyInput, VerifyResult } from '../../src/verify/verifier.js';

function ctx(over: {
  verify: (input: VerifyInput) => Promise<VerifyResult>;
  opts?: SettleContext['opts'];
  explicitIds?: Set<string>;
  gates?: string[];
  errs?: string[];
  diff?: string;
  diffCapBytes?: number;
}): SettleContext {
  const errs = over.errs ?? [];
  return {
    cwd: '/x',
    state: {} as never,
    draft: {
      acceptanceCriteria: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tasks: [{ id: 'T1', files: ['a.ts'] }],
    } as never,
    progress: { draftId: 'd', tasks: {} },
    config:
      over.diffCapBytes != null
        ? ({ verifier: { provider: 'mock', diffCapBytes: over.diffCapBytes } } as never)
        : null,
    gateSet: { gates: over.gates ?? ['deep-verify'], softCap: false },
    opts: over.opts ?? { deep: true },
    explicitIds: over.explicitIds ?? new Set<string>(),
    touchedFiles: ['a.ts'],
    coverage: async () => new Map(),
    diff: () => over.diff ?? '',
    verifiers: { deep: { verify: over.verify } },
    emit: { anomalies: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runDeepVerifyGate', () => {
  // AC-2: passing verdict → pass + deepVerify summaryPatch
  it('records a passing verdict', async () => {
    const res = await runDeepVerifyGate(
      ctx({ verify: async () => ({ verdicts: { 'AC-1': { pass: true, reason: 'ok' } }, provider: 'mock' }) }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerify?.['AC-1']).toEqual({ pass: true, reason: 'ok', provider: 'mock' });
  });

  // AC-2: failing non-explicit verdict, no --force → refuse with stderr
  it('refuses on a failing verdict', async () => {
    const errs: string[] = [];
    const res = await runDeepVerifyGate(
      ctx({ errs, verify: async () => ({ verdicts: { 'AC-1': { pass: false, reason: 'nope' } }, provider: 'mock' }) }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('deep-verify: AC-1 failed — nope (provider: mock)');
    expect(errs.join('')).toContain('settle run --deep refused');
  });

  // AC-2: failing verdict but --force → pass (still records deepVerify)
  it('passes a failing verdict under --force', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        opts: { deep: true, force: true },
        verify: async () => ({ verdicts: { 'AC-1': { pass: false, reason: 'nope' } }, provider: 'mock' }),
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.pass).toBe(false);
  });

  // AC-2: failing verdict for an explicitly-verdicted AC → not an offender → pass
  it('ignores a failing verdict for an explicit AC', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        explicitIds: new Set(['AC-1']),
        verify: async () => ({ verdicts: { 'AC-1': { pass: false, reason: 'nope' } }, provider: 'mock' }),
      }),
    );
    expect(res.outcome).toBe('pass');
  });

  // AC-2: verifier throws, --allow-verifier-failure → pass + all-fail + flag
  it('degrades on verifier throw with allowVerifierFailure', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        opts: { deep: true, allowVerifierFailure: true },
        verify: async () => { throw new Error('boom'); },
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.pass).toBe(false);
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.reason).toBe('verifier failed: boom');
    expect(res.flags?.verifierFailure).toEqual({ message: 'boom', provider: 'mock' });
  });

  // AC-2: verifier throws, no bypass → refuse
  it('refuses on verifier throw without the bypass flag', async () => {
    const res = await runDeepVerifyGate(
      ctx({ opts: { deep: true }, verify: async () => { throw new Error('boom'); } }),
    );
    expect(res.outcome).toBe('refuse');
  });

  // AC-2: not requested (no --deep, not in gate set) → pass without calling verifier
  it('does not fire when neither --deep nor membership applies', async () => {
    const res = await runDeepVerifyGate(
      ctx({ opts: {}, gates: [], verify: async () => { throw new Error('should not be called'); } }),
    );
    expect(res.outcome).toBe('pass');
  });

  // AC-2: auto=false (legacy --ac-only) skips deep-verify even when requested
  it('skips on auto=false without calling the verifier', async () => {
    const res = await runDeepVerifyGate(
      ctx({ opts: { deep: true, auto: false }, verify: async () => { throw new Error('should not be called'); } }),
    );
    expect(res.outcome).toBe('pass');
  });

  // AC-1 (Phase 70): the gate sends the collected diff to the verifier
  it('sends the collected diff to the verifier', async () => {
    let seen: VerifyInput | undefined;
    const res = await runDeepVerifyGate(
      ctx({
        diff: 'diff --git a/a.ts b/a.ts\n+real change',
        verify: async (input) => {
          seen = input;
          return { verdicts: { 'AC-1': { pass: true, reason: 'ok' } }, provider: 'mock' };
        },
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(seen?.diff).toBe('diff --git a/a.ts b/a.ts\n+real change');
  });

  // AC-1 / AC-2 (Phase 70): an oversized diff is truncated before the verifier sees it
  it('truncates an oversized diff before the verifier sees it', async () => {
    let seen: VerifyInput | undefined;
    await runDeepVerifyGate(
      ctx({
        diff: 'x'.repeat(100),
        diffCapBytes: 40,
        verify: async (input) => {
          seen = input;
          return { verdicts: { 'AC-1': { pass: true, reason: 'ok' } }, provider: 'mock' };
        },
      }),
    );
    expect(seen?.diff.startsWith('x'.repeat(40))).toBe(true);
    expect(seen?.diff).toContain('[diff truncated: 40 of 100 bytes]');
  });

  // AC-4 (Phase 70): deepVerifyMeta provenance recorded on pass
  it('records deepVerifyMeta provenance on pass', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        diff: 'abc',
        verify: async () => ({
          verdicts: { 'AC-1': { pass: true, reason: 'ok' } },
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
        }),
      }),
    );
    expect(res.summaryPatch?.deepVerifyMeta).toEqual({
      diffProvided: true,
      diffBytes: 3,
      truncated: false,
      filesCount: 1,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
  });

  // AC-4 (Phase 70): deepVerifyMeta present even when the gate refuses
  it('records deepVerifyMeta even on refuse', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        diff: 'abc',
        verify: async () => ({ verdicts: { 'AC-1': { pass: false, reason: 'nope' } }, provider: 'mock' }),
      }),
    );
    expect(res.outcome).toBe('refuse');
    expect(res.summaryPatch?.deepVerifyMeta?.diffProvided).toBe(true);
    expect(res.summaryPatch?.deepVerifyMeta?.provider).toBe('mock');
  });

  // AC-4 (Phase 70): diffProvided=false + truncated reflected when no diff collected
  it('marks diffProvided=false when the diff is empty', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        diff: '',
        verify: async () => ({ verdicts: { 'AC-1': { pass: true, reason: 'ok' } }, provider: 'mock' }),
      }),
    );
    expect(res.summaryPatch?.deepVerifyMeta?.diffProvided).toBe(false);
    expect(res.summaryPatch?.deepVerifyMeta?.diffBytes).toBe(0);
    expect(res.summaryPatch?.deepVerifyMeta?.truncated).toBe(false);
  });

  // AC-4 (Phase 70): provenance recorded on a degraded verifier failure too
  it('records deepVerifyMeta on a degraded verifier failure', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        diff: 'abc',
        opts: { deep: true, allowVerifierFailure: true },
        verify: async () => {
          throw new Error('boom');
        },
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerifyMeta?.diffProvided).toBe(true);
    expect(res.summaryPatch?.deepVerifyMeta?.provider).toBe('mock');
  });

  // AC-2: provider model is stamped onto each verdict when the result carries one
  it('stamps the model onto verdicts when present', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        verify: async () => ({
          verdicts: { 'AC-1': { pass: true, reason: 'ok' } },
          provider: 'anthropic',
          model: 'claude-opus-4-8',
        }),
      }),
    );
    expect(res.summaryPatch?.deepVerify?.['AC-1']).toEqual({
      pass: true,
      reason: 'ok',
      provider: 'anthropic',
      model: 'claude-opus-4-8',
    });
  });
});
