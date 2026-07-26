import { describe, it, expect } from 'vitest';
import { runCodeReviewGate } from '../../src/gates/code-review.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { CodeReviewResult, Finding } from '../../src/verify/code-review.js';

const HIGH: Record<string, Finding[]> = { 'src/x.ts': [{ severity: 'high', message: 'bad', line: 3 }] };
const CLEAN: Record<string, Finding[]> = {};

interface Calls {
  high: Array<{ provider: string; bypassed: boolean }>;
  unconverged: number;
  writes: string[];
  unconvergedInfo: Array<Record<string, unknown>>;
}

function ctx(over: {
  findings?: Record<string, Finding[]>;
  verifyThrows?: string;
  attemptsSoFar?: number;
  maxAttempts?: number;
  anomalyNotify?: boolean;
  allowCodeReviewFailure?: boolean;
  force?: boolean;
  provider?: string;
  model?: string;
  errs?: string[];
  calls?: Calls;
}): SettleContext {
  const errs = over.errs ?? [];
  const calls = over.calls ?? { high: [], unconverged: 0, writes: [], unconvergedInfo: [] };
  const opts: Record<string, boolean> = {};
  if (over.allowCodeReviewFailure) opts.allowCodeReviewFailure = true;
  if (over.force) opts.force = true;
  const gates = ['code-review', ...(over.anomalyNotify ? ['anomaly-notify'] : [])];
  const result: CodeReviewResult = {
    findings: over.findings ?? CLEAN,
    provider: over.provider ?? 'mock',
    ...(over.model ? { model: over.model } : {}),
  };
  return {
    cwd: '/x',
    state: { draftReadAt: null, activePhase: '01-foundation', activeDraft: '01-01' } as never,
    draft: { acceptanceCriteria: [], tasks: [] } as never,
    progress: { draftId: '01-01', tasks: {} },
    config: { convergence: { maxAttempts: over.maxAttempts ?? 3 } } as never,
    gateSet: { gates, softCap: false } as never,
    opts,
    explicitIds: new Set<string>(),
    touchedFiles: ['src/x.ts'],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => 'DIFF',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: {
        verify: async () => {
          if (over.verifyThrows) throw new Error(over.verifyThrows);
          return result;
        },
      },
    },
    emit: {
      anomalies: async () => {},
      codeReviewHigh: async (_f, info) => {
        calls.high.push(info);
      },
      codeReviewUnconverged: async (info) => {
        calls.unconverged += 1;
        calls.unconvergedInfo.push(info);
      },
    },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: {
      read: async () => ({ attemptsSoFar: over.attemptsSoFar ?? 0, history: [] }),
      write: async (text: string) => {
        calls.writes.push(text);
      },
    },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runCodeReviewGate', () => {
  // AC-3 / AC-5: no HIGH finding → pass, sidecar converged:true, codeReview patch
  it('passes and records a converged sidecar when there are no HIGH findings', async () => {
    const calls: Calls = { high: [], unconverged: 0, writes: [], unconvergedInfo: [] };
    const res = await runCodeReviewGate(ctx({ findings: CLEAN, calls }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.codeReview).toEqual(CLEAN);
    expect(calls.writes[0]).toContain('"converged": true');
    expect(calls.high).toEqual([]);
    // Full exact-shape characterization (legacy fields preserved alongside the
    // newer converged/attempts/maxAttempts/history fields) — pins today's
    // real output so a later extraction of a shared runner can be diffed
    // against it.
    expect(JSON.parse(calls.writes[0]!)).toEqual({
      draftId: '01-01',
      converged: true,
      attempts: 0,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: true,
          findingsCount: 0,
          provider: 'mock',
          verdict: 'pass',
        },
      ],
      pass: true,
      provider: 'mock',
      findings: 0,
      at: expect.any(String),
    });
  });

  // AC-5: HIGH on first attempt (attempt 1 < 3) → reloop refuse + retry stderr + high emit
  it('refuses with reloop on a HIGH finding (first attempt)', async () => {
    const errs: string[] = [];
    const calls: Calls = { high: [], unconverged: 0, writes: [], unconvergedInfo: [] };
    const res = await runCodeReviewGate(ctx({ findings: HIGH, anomalyNotify: true, errs, calls }));
    expect(res.outcome).toBe('refuse');
    expect(errs).toContain('code-review: src/x.ts:3 high — bad\n');
    expect(errs.join('')).toContain('attempt 1/3 did not pass');
    expect(calls.high).toEqual([{ provider: 'mock', bypassed: false }]);
    expect(calls.unconverged).toBe(0);
    expect(calls.writes[0]).toContain('"converged": false');
    // AC-2: reason matches the exact reloop refusal message.
    expect(res.reason).toBe(
      'code-review: attempt 1/3 did not pass — fix the flagged code and re-run `cadence settle run`, ' +
        'or pass --allow-code-review-failure to proceed anyway.',
    );
    expect(JSON.parse(calls.writes[0]!)).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 1,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'reloop',
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: expect.any(String),
    });
  });

  // AC-5: HIGH at the attempt ceiling (attemptsSoFar 2 → attempt 3 = max) → escalate refuse + both emits
  it('refuses with escalate at the attempt ceiling', async () => {
    const calls: Calls = { high: [], unconverged: 0, writes: [], unconvergedInfo: [] };
    const res = await runCodeReviewGate(
      ctx({ findings: HIGH, attemptsSoFar: 2, maxAttempts: 3, anomalyNotify: true, calls }),
    );
    expect(res.outcome).toBe('refuse');
    expect(calls.high).toEqual([{ provider: 'mock', bypassed: false }]);
    expect(calls.unconverged).toBe(1);
    expect(calls.unconvergedInfo[0]).not.toHaveProperty('bypassed');
    // AC-2: reason matches the exact escalate refusal message.
    expect(res.reason).toBe(
      'settle run refused: code-review did NOT converge after 3 attempts — a human decision is required. ' +
        'Fix the flagged code, or pass --allow-code-review-failure to proceed anyway.',
    );
    expect(JSON.parse(calls.writes[0]!)).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 3,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'escalate',
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: expect.any(String),
    });
  });

  // AC-5: escalate with anomaly-notify OFF → no high emit, but unconverged still fires
  it('still emits unconverged on escalate when anomaly-notify is off', async () => {
    const calls: Calls = { high: [], unconverged: 0, writes: [], unconvergedInfo: [] };
    const res = await runCodeReviewGate(
      ctx({ findings: HIGH, attemptsSoFar: 2, maxAttempts: 3, anomalyNotify: false, calls }),
    );
    expect(res.outcome).toBe('refuse');
    expect(calls.high).toEqual([]);
    expect(calls.unconverged).toBe(1);
  });

  // AC-5: HIGH + --allow-code-review-failure → pass + bypass stderr + high emit bypassed:true
  it('bypasses a HIGH finding under --allow-code-review-failure', async () => {
    const errs: string[] = [];
    const calls: Calls = { high: [], unconverged: 0, writes: [], unconvergedInfo: [] };
    const res = await runCodeReviewGate(
      ctx({ findings: HIGH, allowCodeReviewFailure: true, anomalyNotify: true, errs, calls }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--allow-code-review-failure set; proceeding past 1 HIGH finding(s)');
    expect(calls.high).toEqual([{ provider: 'mock', bypassed: true }]);
    // Characterization gap found in audit: this bypass is at a *reloop*
    // verdict (attemptsSoFar defaults to 0) — the `nv.verdict === 'escalate'`
    // emit-guard in code-review.ts means codeReviewUnconverged must NOT fire
    // here, unlike the escalate-bypass case below.
    expect(calls.unconverged).toBe(0);
    expect(JSON.parse(calls.writes[0]!)).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 1,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'reloop',
          bypassed: true,
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: expect.any(String),
    });
  });

  // Characterization gap found in audit: no prior test exercised the bypass
  // path at the escalate verdict — the only branch where codeReviewUnconverged
  // fires with `bypassed: true` in its payload.
  it('bypasses a HIGH finding under --allow-code-review-failure at the escalate verdict (unconverged emits bypassed:true)', async () => {
    const errs: string[] = [];
    const calls: Calls = { high: [], unconverged: 0, writes: [], unconvergedInfo: [] };
    const res = await runCodeReviewGate(
      ctx({
        findings: HIGH,
        attemptsSoFar: 2,
        maxAttempts: 3,
        allowCodeReviewFailure: true,
        anomalyNotify: true,
        errs,
        calls,
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--allow-code-review-failure set; proceeding past 1 HIGH finding(s)');
    expect(calls.high).toEqual([{ provider: 'mock', bypassed: true }]);
    expect(calls.unconverged).toBe(1);
    expect(calls.unconvergedInfo[0]).toEqual({
      draftId: '01-01',
      attempts: 3,
      maxAttempts: 3,
      findings: 1,
      provider: 'mock',
      bypassed: true,
    });
    expect(JSON.parse(calls.writes[0]!)).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 3,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'escalate',
          bypassed: true,
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: expect.any(String),
    });
  });

  // AC-5: HIGH + --force → pass, --force arm of the proceed line
  it('bypasses a HIGH finding under --force with the --force arm', async () => {
    const errs: string[] = [];
    const res = await runCodeReviewGate(ctx({ findings: HIGH, force: true, errs }));
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--force set; proceeding past 1 HIGH finding(s)');
  });

  // Characterization gap found in audit: no prior test set a `model` on the
  // verifier result, so the `...(result.model ? { model: result.model } : {})`
  // spread (both in the history entry and the sidecar's legacy top-level
  // fields) was never exercised.
  it('includes the model field (history + legacy top-level) when the verifier reports one', async () => {
    const calls: Calls = { high: [], unconverged: 0, writes: [], unconvergedInfo: [] };
    const res = await runCodeReviewGate(
      ctx({ findings: CLEAN, provider: 'anthropic', model: 'claude-x', calls }),
    );
    expect(res.outcome).toBe('pass');
    expect(JSON.parse(calls.writes[0]!)).toEqual({
      draftId: '01-01',
      converged: true,
      attempts: 0,
      maxAttempts: 3,
      history: [
        {
          at: expect.any(String),
          pass: true,
          findingsCount: 0,
          provider: 'anthropic',
          model: 'claude-x',
          verdict: 'pass',
        },
      ],
      pass: true,
      provider: 'anthropic',
      model: 'claude-x',
      findings: 0,
      at: expect.any(String),
    });
  });

  // AC-5: verifier throws, no bypass → refuse with failure stderr
  it('refuses when the verifier throws and no bypass flag is set', async () => {
    const errs: string[] = [];
    const res = await runCodeReviewGate(ctx({ verifyThrows: 'boom', errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('code-review: verifier failed — boom');
    // AC-2: reason matches the exact stderr message (minus trailing newline).
    expect(res.reason).toBe(
      'code-review: verifier failed — boom. Pass --allow-code-review-failure to continue.',
    );
  });

  // AC-5: verifier throws + bypass → pass
  it('passes when the verifier throws under --allow-code-review-failure', async () => {
    const res = await runCodeReviewGate(ctx({ verifyThrows: 'boom', allowCodeReviewFailure: true }));
    expect(res.outcome).toBe('pass');
  });
});
