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
}

function ctx(over: {
  findings?: Record<string, Finding[]>;
  verifyThrows?: string;
  attemptsSoFar?: number;
  maxAttempts?: number;
  anomalyNotify?: boolean;
  allowCodeReviewFailure?: boolean;
  force?: boolean;
  errs?: string[];
  calls?: Calls;
}): SettleContext {
  const errs = over.errs ?? [];
  const calls = over.calls ?? { high: [], unconverged: 0, writes: [] };
  const opts: Record<string, boolean> = {};
  if (over.allowCodeReviewFailure) opts.allowCodeReviewFailure = true;
  if (over.force) opts.force = true;
  const gates = ['code-review', ...(over.anomalyNotify ? ['anomaly-notify'] : [])];
  const result: CodeReviewResult = { findings: over.findings ?? CLEAN, provider: 'mock' };
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
      codeReviewUnconverged: async () => {
        calls.unconverged += 1;
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
    const calls: Calls = { high: [], unconverged: 0, writes: [] };
    const res = await runCodeReviewGate(ctx({ findings: CLEAN, calls }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.codeReview).toEqual(CLEAN);
    expect(calls.writes[0]).toContain('"converged": true');
    expect(calls.high).toEqual([]);
  });

  // AC-5: HIGH on first attempt (attempt 1 < 3) → reloop refuse + retry stderr + high emit
  it('refuses with reloop on a HIGH finding (first attempt)', async () => {
    const errs: string[] = [];
    const calls: Calls = { high: [], unconverged: 0, writes: [] };
    const res = await runCodeReviewGate(ctx({ findings: HIGH, anomalyNotify: true, errs, calls }));
    expect(res.outcome).toBe('refuse');
    expect(errs).toContain('code-review: src/x.ts:3 high — bad\n');
    expect(errs.join('')).toContain('attempt 1/3 did not pass');
    expect(calls.high).toEqual([{ provider: 'mock', bypassed: false }]);
    expect(calls.unconverged).toBe(0);
    expect(calls.writes[0]).toContain('"converged": false');
  });

  // AC-5: HIGH at the attempt ceiling (attemptsSoFar 2 → attempt 3 = max) → escalate refuse + both emits
  it('refuses with escalate at the attempt ceiling', async () => {
    const calls: Calls = { high: [], unconverged: 0, writes: [] };
    const res = await runCodeReviewGate(
      ctx({ findings: HIGH, attemptsSoFar: 2, maxAttempts: 3, anomalyNotify: true, calls }),
    );
    expect(res.outcome).toBe('refuse');
    expect(calls.high).toEqual([{ provider: 'mock', bypassed: false }]);
    expect(calls.unconverged).toBe(1);
  });

  // AC-5: escalate with anomaly-notify OFF → no high emit, but unconverged still fires
  it('still emits unconverged on escalate when anomaly-notify is off', async () => {
    const calls: Calls = { high: [], unconverged: 0, writes: [] };
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
    const calls: Calls = { high: [], unconverged: 0, writes: [] };
    const res = await runCodeReviewGate(
      ctx({ findings: HIGH, allowCodeReviewFailure: true, anomalyNotify: true, errs, calls }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--allow-code-review-failure set; proceeding past 1 HIGH finding(s)');
    expect(calls.high).toEqual([{ provider: 'mock', bypassed: true }]);
  });

  // AC-5: HIGH + --force → pass, --force arm of the proceed line
  it('bypasses a HIGH finding under --force with the --force arm', async () => {
    const errs: string[] = [];
    const res = await runCodeReviewGate(ctx({ findings: HIGH, force: true, errs }));
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--force set; proceeding past 1 HIGH finding(s)');
  });

  // AC-5: verifier throws, no bypass → refuse with failure stderr
  it('refuses when the verifier throws and no bypass flag is set', async () => {
    const errs: string[] = [];
    const res = await runCodeReviewGate(ctx({ verifyThrows: 'boom', errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('code-review: verifier failed — boom');
  });

  // AC-5: verifier throws + bypass → pass
  it('passes when the verifier throws under --allow-code-review-failure', async () => {
    const res = await runCodeReviewGate(ctx({ verifyThrows: 'boom', allowCodeReviewFailure: true }));
    expect(res.outcome).toBe('pass');
  });
});
