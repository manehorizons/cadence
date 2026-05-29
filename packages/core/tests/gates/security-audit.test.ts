import { describe, it, expect } from 'vitest';
import { runSecurityAuditGate } from '../../src/gates/security-audit.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { Finding } from '@cadence/types';

const CRIT: Finding[] = [{ severity: 'critical', message: 'sqli', line: 7 }];
const LOW: Finding[] = [{ severity: 'low', message: 'nit' }];

function ctx(over: {
  findings?: Finding[];
  verifyThrows?: string;
  allowSecurityAuditFailure?: boolean;
  force?: boolean;
  errs?: string[];
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
        verify: async () => {
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
  });

  // AC-4: verifier throws + bypass → pass
  it('passes when the verifier throws under --allow-security-audit-failure', async () => {
    const res = await runSecurityAuditGate(ctx({ verifyThrows: 'boom', allowSecurityAuditFailure: true }));
    expect(res.outcome).toBe('pass');
  });
});
