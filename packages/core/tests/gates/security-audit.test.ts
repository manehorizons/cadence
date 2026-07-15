import { describe, it, expect } from 'vitest';
import { runSecurityAuditGate } from '../../src/gates/security-audit.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { Finding } from '@manehorizons/cadence-types';

const CRIT: Finding[] = [{ severity: 'critical', message: 'sqli', line: 7 }];
const LOW: Finding[] = [{ severity: 'low', message: 'nit' }];
const SECRET_LOW: Finding[] = [
  { severity: 'low', message: 'hardcoded key AKIAABCDEFGHIJKLMNOP found' },
];
const SECRET_CRIT: Finding[] = [
  { severity: 'critical', message: 'leaked secret AKIAABCDEFGHIJKLMNOP in diff', line: 3 },
];

function ctx(over: {
  findings?: Finding[];
  verifyThrows?: string;
  allowSecurityAuditFailure?: boolean;
  force?: boolean;
  errs?: string[];
  captureOpts?: (opts: { signal?: AbortSignal; traceId?: string } | undefined) => void;
}): SettleContext {
  const errs = over.errs ?? [];
  const opts: Record<string, boolean> = {};
  if (over.allowSecurityAuditFailure) opts.allowSecurityAuditFailure = true;
  if (over.force) opts.force = true;
  return {
    cwd: '/x',
    state: { draftReadAt: null, activePhase: '01-foundation', activeDraft: '01-01' } as never,
    draft: { acceptanceCriteria: [], tasks: [] } as never,
    progress: { draftId: '01-01', tasks: {} },
    config: null,
    gateSet: { gates: ['security-audit'], softCap: false } as never,
    opts,
    explicitIds: new Set<string>(),
    touchedFiles: ['src/x.ts'],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => 'DIFF',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: { verify: async () => ({ findings: {}, provider: 'mock' }) },
      securityAudit: {
        verify: async (
          _input: unknown,
          calledWithOpts?: { signal?: AbortSignal; traceId?: string },
        ) => {
          over.captureOpts?.(calledWithOpts);
          if (over.verifyThrows) throw new Error(over.verifyThrows);
          return { findings: over.findings ?? [], provider: 'mock' };
        },
      },
    },
    emit: { anomalies: async () => {}, codeReviewHigh: async () => {}, codeReviewUnconverged: async () => {} },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: { read: async () => ({ attemptsSoFar: 0, history: [] }), write: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runSecurityAuditGate', () => {
  // AC-3: no findings → pass + empty securityAudit patch
  it('passes with no findings', async () => {
    const res = await runSecurityAuditGate(ctx({ findings: [] }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.securityAudit).toEqual([]);
  });

  // AC-3: non-critical findings → pass + patch, no refusal
  it('passes with non-critical findings', async () => {
    const errs: string[] = [];
    const res = await runSecurityAuditGate(ctx({ findings: LOW, errs }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.securityAudit).toEqual(LOW);
    expect(errs).toEqual([]);
  });

  // AC-4: CRITICAL, no bypass → refuse with per-critical + summary stderr
  it('refuses on a CRITICAL finding', async () => {
    const errs: string[] = [];
    const res = await runSecurityAuditGate(ctx({ findings: CRIT, errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs[0]).toBe('security-audit: 7 critical — sqli\n');
    expect(errs.join('')).toContain('reported 1 CRITICAL finding(s)');
    // AC-2: reason matches the exact summary refusal message.
    expect(res.reason).toBe(
      'settle run refused: security-audit reported 1 CRITICAL finding(s). ' +
        'Pass --allow-security-audit-failure to record them and settle anyway, or --force to bypass.',
    );
  });

  // AC-4: CRITICAL + --allow-security-audit-failure → pass + proceed line
  it('bypasses a CRITICAL finding under --allow-security-audit-failure', async () => {
    const errs: string[] = [];
    const res = await runSecurityAuditGate(
      ctx({ findings: CRIT, allowSecurityAuditFailure: true, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.securityAudit).toEqual(CRIT);
    expect(errs.join('')).toContain('--allow-security-audit-failure set; proceeding past 1 CRITICAL finding(s)');
  });

  // AC-4: CRITICAL + --force → pass with the --force arm
  it('bypasses a CRITICAL finding under --force', async () => {
    const errs: string[] = [];
    const res = await runSecurityAuditGate(ctx({ findings: CRIT, force: true, errs }));
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).toContain('--force set; proceeding past 1 CRITICAL finding(s)');
  });

  // AC-4: verifier throws, no bypass → refuse with failure stderr
  it('refuses when the verifier throws and no bypass flag is set', async () => {
    const errs: string[] = [];
    const res = await runSecurityAuditGate(ctx({ verifyThrows: 'boom', errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('security-audit: verifier failed — boom');
    // AC-2: reason matches the exact stderr message (minus trailing newline).
    expect(res.reason).toBe(
      'security-audit: verifier failed — boom. Pass --allow-security-audit-failure to continue.',
    );
  });

  // AC-4: verifier throws + bypass → pass
  it('passes when the verifier throws under --allow-security-audit-failure', async () => {
    const res = await runSecurityAuditGate(ctx({ verifyThrows: 'boom', allowSecurityAuditFailure: true }));
    expect(res.outcome).toBe('pass');
  });

  // AC-3: pass path — a credential-shaped substring in a finding message is redacted before the summary patch
  it('redacts a credential-shaped substring from a finding message on the pass path', async () => {
    const res = await runSecurityAuditGate(ctx({ findings: SECRET_LOW }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.securityAudit).toEqual([
      { severity: 'low', message: 'hardcoded key [REDACTED] found' },
    ]);
  });

  // AC-3: refuse path — redaction still applies, and severity/line are preserved unchanged
  it('redacts a credential-shaped substring from a finding message on the refuse path', async () => {
    const res = await runSecurityAuditGate(ctx({ findings: SECRET_CRIT }));
    expect(res.outcome).toBe('refuse');
    expect(res.summaryPatch?.securityAudit).toEqual([
      { severity: 'critical', message: 'leaked secret [REDACTED] in diff', line: 3 },
    ]);
  });

  // AC-3: the per-critical stderr line must never leak the raw secret — it must
  // print the redacted message, not the original result.findings message.
  it('redacts a credential-shaped substring from the per-critical stderr output', async () => {
    const errs: string[] = [];
    const res = await runSecurityAuditGate(ctx({ findings: SECRET_CRIT, errs }));
    expect(res.outcome).toBe('refuse');
    const stderrOutput = errs.join('');
    expect(stderrOutput).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(stderrOutput).toContain('[REDACTED]');
    expect(errs[0]).toBe('security-audit: 3 critical — leaked secret [REDACTED] in diff\n');
  });

  // AC-3: a non-secret message passes through unchanged alongside severity/line fields
  it('leaves a non-secret finding message unchanged', async () => {
    const res = await runSecurityAuditGate(ctx({ findings: CRIT }));
    expect(res.summaryPatch?.securityAudit).toEqual(CRIT);
  });

  // Phase 184 (AC-3): the gate must generate a per-run traceId and pass it
  // through on the real verify() call — this is the concrete proof that the
  // signal/traceId plumbing is genuinely connected end-to-end for this gate,
  // not just added-and-unused.
  it('passes a generated traceId through to verify()', async () => {
    let captured: { signal?: AbortSignal; traceId?: string } | undefined;
    const res = await runSecurityAuditGate(
      ctx({
        findings: [],
        captureOpts: (opts) => {
          captured = opts;
        },
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(captured).toBeDefined();
    expect(captured?.traceId).toEqual(expect.any(String));
    expect(captured?.traceId?.length).toBeGreaterThan(0);
  });

  // Phase 184 (AC-3): two separate gate runs must generate two distinct
  // traceIds — proving it is a genuine per-run id, not a hardcoded constant.
  it('generates a distinct traceId on each run', async () => {
    const seen: (string | undefined)[] = [];
    await runSecurityAuditGate(
      ctx({ findings: [], captureOpts: (opts) => seen.push(opts?.traceId) }),
    );
    await runSecurityAuditGate(
      ctx({ findings: [], captureOpts: (opts) => seen.push(opts?.traceId) }),
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeDefined();
    expect(seen[1]).toBeDefined();
    expect(seen[0]).not.toEqual(seen[1]);
  });
});
