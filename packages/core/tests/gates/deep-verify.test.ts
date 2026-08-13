import { describe, it, expect } from 'vitest';
import { runDeepVerifyGate, isDeepVerifyRequested } from '../../src/gates/deep-verify.js';
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
  acceptanceCriteria?: Array<{ id: string; given: string; when: string; then: string }>;
  coverage?: Map<string, unknown>;
}): SettleContext {
  const errs = over.errs ?? [];
  return {
    cwd: '/x',
    state: {} as never,
    draft: {
      acceptanceCriteria: over.acceptanceCriteria ?? [
        { id: 'AC-1', given: 'g', when: 'w', then: 't' },
      ],
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
    coverage: async () => over.coverage ?? new Map(),
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
    // AC-2: reason matches the exact summary refusal message.
    expect(res.reason).toBe(
      'settle run --deep refused: the independent verifier rejected one or more ACs. ' +
        'Pass --force to settle anyway, or address the gaps.',
    );
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
    // The catch branch never calls `classifyAcObservability` — every AC here
    // is `pass:false` because the verifier itself failed, not because any AC
    // was individually classified — so `unobservable` must stay unset on
    // every verdict it produces. `services/settle.ts`'s verifier-failure
    // exclusion (and `notify/collect.ts`'s honesty-report comment) both
    // depend on this producer-side guarantee holding.
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.unobservable).toBeUndefined();
  });

  // AC-2: verifier throws, no bypass → refuse
  it('refuses on verifier throw without the bypass flag', async () => {
    const res = await runDeepVerifyGate(
      ctx({ opts: { deep: true }, verify: async () => { throw new Error('boom'); } }),
    );
    expect(res.outcome).toBe('refuse');
    // AC-2: reason matches the exact stderr message (minus trailing newline).
    expect(res.reason).toBe(
      'deep-verify: verifier failed — boom. Pass --allow-verifier-failure to continue.',
    );
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

  // AC-5 (Phase 73): token usage from the verifier reaches deepVerifyMeta
  it('threads provider token usage into deepVerifyMeta', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        diff: 'abc',
        verify: async () => ({
          verdicts: { 'AC-1': { pass: true, reason: 'ok' } },
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          usage: { inputTokens: 321, outputTokens: 99 },
        }),
      }),
    );
    expect(res.summaryPatch?.deepVerifyMeta?.inputTokens).toBe(321);
    expect(res.summaryPatch?.deepVerifyMeta?.outputTokens).toBe(99);
  });

  // AC-5 (Phase 73): no usage from the verifier → meta omits token fields
  it('omits token fields from deepVerifyMeta when the verifier reports none', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        diff: 'abc',
        verify: async () => ({
          verdicts: { 'AC-1': { pass: true, reason: 'ok' } },
          provider: 'mock',
        }),
      }),
    );
    expect(res.summaryPatch?.deepVerifyMeta?.inputTokens).toBeUndefined();
    expect(res.summaryPatch?.deepVerifyMeta?.outputTokens).toBeUndefined();
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

describe('runDeepVerifyGate — phase 275 (T2) observed verifier identity', () => {
  it('275-01/AC-1: flags.observedVerifierIdentity is populated on the per-AC-pass, per-AC-fail, and allow-verifier-failure catch paths', async () => {
    // Per-AC-pass path: no offenders, outcome 'pass'.
    const passRes = await runDeepVerifyGate(
      ctx({
        verify: async () => ({
          verdicts: { 'AC-1': { pass: true, reason: 'ok' } },
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
        }),
      }),
    );
    expect(passRes.outcome).toBe('pass');
    expect(passRes.flags?.observedVerifierIdentity).toEqual({
      family: 'anthropic',
      model: 'claude-sonnet-4-6',
    });

    // Per-AC-fail path: an offender with no --force, outcome 'refuse'.
    const refuseRes = await runDeepVerifyGate(
      ctx({
        verify: async () => ({
          verdicts: { 'AC-1': { pass: false, reason: 'nope' } },
          provider: 'mock',
        }),
      }),
    );
    expect(refuseRes.outcome).toBe('refuse');
    expect(refuseRes.flags?.observedVerifierIdentity).toEqual({ family: 'mock' });

    // Verifier-transport-failure catch branch, under --allow-verifier-failure.
    const degradedRes = await runDeepVerifyGate(
      ctx({
        opts: { deep: true, allowVerifierFailure: true },
        verify: async () => {
          throw new Error('boom');
        },
      }),
    );
    expect(degradedRes.outcome).toBe('pass');
    expect(degradedRes.flags?.observedVerifierIdentity).toEqual({ family: 'mock' });

    // Bare-refuse sub-path (no bypass flag) stays out of scope: no meta() call
    // today, so no flags at all — confirms this phase did not add one.
    const bareRefuseRes = await runDeepVerifyGate(
      ctx({ opts: { deep: true }, verify: async () => { throw new Error('boom'); } }),
    );
    expect(bareRefuseRes.outcome).toBe('refuse');
    expect(bareRefuseRes.flags?.observedVerifierIdentity).toBeUndefined();
  });
});

describe('runDeepVerifyGate — phase 274 (T3) unobservable-AC classification', () => {
  // Same shape as `criteria-observability.test.ts`'s AC-F2 fixture and phase
  // 272's real AC-1/AC-4: the "pasted into the SUMMARY" circular-reference
  // signal, built via the exact `[given, when, then].join('\n')` production
  // join `classifyAcObservability`'s JSDoc documents.
  const UNOBSERVABLE_AC = {
    id: 'AC-1',
    given: 'the settle-time code-review gate has run',
    when: 'settle completes',
    then: 'the finding count is pasted into the SUMMARY',
  };

  it('274-01/AC-1: the call site joins given/when/then with newlines, not spaces — pinned via WRITTEN_VERBATIM_CAPTURE, the one signal sensitive to the separator', async () => {
    // classifyAcObservability's JSDoc requires the production join to be
    // `[given, when, then].join('\n')`, not a space or other separator — a
    // different join is untested and could move behavior in the unsafe
    // (false-positive) direction. PASTED_INTO/SELF_REFERENCE fire the same
    // way regardless of separator (their cue phrase sits directly adjacent
    // to the SUMMARY token), so they can't discriminate a join-separator
    // regression at this call site. WRITTEN_VERBATIM_CAPTURE can: it
    // requires "written" immediately before the token AND "verbatim" +
    // "captur-" within the SAME clause after it, where `afterWindow` stops
    // scanning at the first `.`/`\n`. Splitting when/then across a clause
    // boundary (the "SUMMARY" token ends the `when` clause; "verbatim" and
    // "captured" live in `then`) means a newline join leaves `after` empty
    // immediately — signal does not fire, verdict stays observable. A space
    // join would stitch when+then into one clause and DOES fire — this test
    // goes red the moment the call site's separator changes from '\n'.
    const JOIN_SENSITIVE_AC = {
      id: 'AC-1',
      given: 'the shakedown phase runs every command',
      when: 'the friction log reaches a written SUMMARY',
      then: 'every command and its verbatim output is captured',
    };
    const res = await runDeepVerifyGate(
      ctx({
        acceptanceCriteria: [JOIN_SENSITIVE_AC],
        verify: async () => ({
          verdicts: { 'AC-1': { pass: true, reason: 'ok' } },
          provider: 'mock',
        }),
      }),
    );
    const verdict = res.summaryPatch?.deepVerify?.['AC-1'];
    expect(verdict).toEqual({ pass: true, reason: 'ok', provider: 'mock' });
    expect(verdict?.unobservable).toBeUndefined();
  });

  it('274-01/AC-1: an unobservable-classified AC is excluded from offenders and settles without --force even when the verifier fails it', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        acceptanceCriteria: [UNOBSERVABLE_AC],
        verify: async () => ({
          verdicts: { 'AC-1': { pass: false, reason: 'verifier says no' } },
          provider: 'mock',
        }),
      }),
    );
    expect(res.outcome).toBe('pass');
    const verdict = res.summaryPatch?.deepVerify?.['AC-1'];
    expect(verdict?.pass).toBe(false);
    expect(verdict?.unobservable).toBe(true);
    expect(verdict?.provider).toBe('mock');
    // Merged reason: the verifier's own reason plus the classifier's.
    expect(verdict?.reason).toContain('verifier says no');
    expect(verdict?.reason).toContain('pasted into the SUMMARY');
  });

  it('274-01/AC-1: pass is forced to false for an unobservable AC even when the verifier itself said pass:true', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        acceptanceCriteria: [UNOBSERVABLE_AC],
        verify: async () => ({
          verdicts: { 'AC-1': { pass: true, reason: 'looks fine' } },
          provider: 'mock',
        }),
      }),
    );
    expect(res.outcome).toBe('pass');
    const verdict = res.summaryPatch?.deepVerify?.['AC-1'];
    expect(verdict?.pass).toBe(false);
    expect(verdict?.unobservable).toBe(true);
  });

  it('274-01/AC-1: an unobservable AC writes a stderr notice explaining why it is not counted as an offender', async () => {
    const errs: string[] = [];
    await runDeepVerifyGate(
      ctx({
        errs,
        acceptanceCriteria: [UNOBSERVABLE_AC],
        verify: async () => ({
          verdicts: { 'AC-1': { pass: false, reason: 'verifier says no' } },
          provider: 'mock',
        }),
      }),
    );
    expect(errs.join('')).toContain(
      'deep-verify: AC-1 not counted as an offender — structurally unobservable',
    );
  });

  it('274-01/AC-4: an observable AC verdict carries no unobservable key at all', async () => {
    const res = await runDeepVerifyGate(
      ctx({ verify: async () => ({ verdicts: { 'AC-1': { pass: true, reason: 'ok' } }, provider: 'mock' }) }),
    );
    const verdict = res.summaryPatch?.deepVerify?.['AC-1'];
    expect(verdict).toEqual({ pass: true, reason: 'ok', provider: 'mock' });
    expect(Object.prototype.hasOwnProperty.call(verdict ?? {}, 'unobservable')).toBe(false);
  });

  it('274-01/AC-4: settle passes cleanly without --force when the only failing ACs are classifier-marked-unobservable', async () => {
    const OBSERVABLE_PASSING_AC = { id: 'AC-2', given: 'g2', when: 'w2', then: 't2' };
    const res = await runDeepVerifyGate(
      ctx({
        acceptanceCriteria: [UNOBSERVABLE_AC, OBSERVABLE_PASSING_AC],
        verify: async () => ({
          verdicts: {
            'AC-1': { pass: false, reason: 'verifier says no' },
            'AC-2': { pass: true, reason: 'ok' },
          },
          provider: 'mock',
        }),
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.unobservable).toBe(true);
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.pass).toBe(false);
    expect(res.summaryPatch?.deepVerify?.['AC-2']).toEqual({ pass: true, reason: 'ok', provider: 'mock' });
  });

  it('274-01/AC-1: a genuinely failing, observable AC alongside an unobservable one still refuses without --force', async () => {
    const GENUINE_FAILING_AC = { id: 'AC-2', given: 'g2', when: 'w2', then: 't2' };
    const errs: string[] = [];
    const res = await runDeepVerifyGate(
      ctx({
        errs,
        acceptanceCriteria: [UNOBSERVABLE_AC, GENUINE_FAILING_AC],
        verify: async () => ({
          verdicts: {
            'AC-1': { pass: false, reason: 'verifier says no' },
            'AC-2': { pass: false, reason: 'genuinely broken' },
          },
          provider: 'mock',
        }),
      }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('deep-verify: AC-2 failed — genuinely broken');
    expect(errs.join('')).not.toContain('deep-verify: AC-1 failed');
  });
});

describe('isDeepVerifyRequested (AC-1, phase 140)', () => {
  it('true when --deep is set', () => {
    expect(isDeepVerifyRequested(ctx({ verify: async () => ({ verdicts: {}, provider: 'mock' }), opts: { deep: true } }))).toBe(true);
  });

  it('true when deep-verify is a gate-set member, even without --deep', () => {
    expect(
      isDeepVerifyRequested(
        ctx({ verify: async () => ({ verdicts: {}, provider: 'mock' }), opts: {}, gates: ['deep-verify'] }),
      ),
    ).toBe(true);
  });

  it('false when neither --deep nor gate-set membership applies', () => {
    expect(
      isDeepVerifyRequested(ctx({ verify: async () => ({ verdicts: {}, provider: 'mock' }), opts: {}, gates: [] })),
    ).toBe(false);
  });

  it('false when --auto=false overrides an otherwise-requested deep-verify', () => {
    expect(
      isDeepVerifyRequested(
        ctx({ verify: async () => ({ verdicts: {}, provider: 'mock' }), opts: { deep: true, auto: false } }),
      ),
    ).toBe(false);
  });
});
