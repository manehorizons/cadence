import { describe, it, expect } from 'vitest';
import { runSkillAuditCheck } from '../../src/checks/skill-audit.js';
import type { SettleContext } from '../../src/gates/types.js';

type EmitArg = Parameters<SettleContext['emit']['skillAuditMiss']>[0];

function ctx(over: {
  configRequired?: string[] | null; // null → config is null (load failed)
  draftRequired?: string[];
  invoked?: string[];
  skillInvocations?: boolean; // telemetry toggle, default true
  allowSkillAuditMiss?: boolean;
  emits?: EmitArg[];
  errs?: string[];
}): SettleContext {
  const emits = over.emits ?? [];
  const errs = over.errs ?? [];
  const config =
    over.configRequired === null
      ? null
      : ({
          skillAudit: { required: over.configRequired ?? [] },
          telemetry: { skillInvocations: over.skillInvocations ?? true },
        } as never);
  return {
    cwd: '/x',
    state: { skillAudit: { required: [], invoked: over.invoked ?? [] } } as never,
    draft: { requiredSkills: over.draftRequired ?? [] } as never,
    progress: { draftId: '01-01', tasks: {} },
    config,
    gateSet: { gates: [], softCap: false } as never,
    opts: over.allowSkillAuditMiss ? { allowSkillAuditMiss: true } : {},
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => '',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: { verify: async () => ({ findings: {}, provider: 'mock' }) },
      securityAudit: { verify: async () => ({ findings: [], provider: 'mock' }) },
    },
    emit: {
      anomalies: async () => {},
      codeReviewHigh: async () => {},
      codeReviewUnconverged: async () => {},
      skillAuditMiss: async (p) => {
        emits.push(p);
      },
    },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: { read: async () => ({ attemptsSoFar: 0, history: [] }), write: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runSkillAuditCheck', () => {
  // AC-1/AC-5: no required skills → inert pass, no emit, effective set empty
  it('passes inertly when nothing is required', async () => {
    const emits: EmitArg[] = [];
    const errs: string[] = [];
    const res = await runSkillAuditCheck(ctx({ emits, errs }));
    expect(res.outcome).toBe('pass');
    expect(res.effectiveRequired).toEqual([]);
    expect(emits).toEqual([]);
    expect(errs).toEqual([]);
  });

  // AC-5: config is null (load failed) → enforcement skipped, no emit, but the
  // effective set (from DRAFT) is still recorded — never false-refuse.
  it('skips enforcement but records the effective set when config is null', async () => {
    const emits: EmitArg[] = [];
    const res = await runSkillAuditCheck(
      ctx({ configRequired: null, draftRequired: ['tdd'], invoked: [], emits }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.effectiveRequired).toEqual(['tdd']);
    expect(emits).toEqual([]);
  });

  // AC-4: required satisfied (namespace-qualified invoked) → pass, no emit
  it('passes with no emit when every required skill was invoked', async () => {
    const emits: EmitArg[] = [];
    const res = await runSkillAuditCheck(
      ctx({ configRequired: ['brainstorming'], invoked: ['superpowers:brainstorming'], emits }),
    );
    expect(res.outcome).toBe('pass');
    expect(emits).toEqual([]);
  });

  // AC-5: telemetry.skillInvocations off → unenforceable warn anomaly, pass
  it('emits an unenforceable warn and passes when telemetry is off', async () => {
    const emits: EmitArg[] = [];
    const res = await runSkillAuditCheck(
      ctx({ configRequired: ['tdd'], invoked: [], skillInvocations: false, emits }),
    );
    expect(res.outcome).toBe('pass');
    expect(emits).toHaveLength(1);
    expect(emits[0]).toMatchObject({ severity: 'warn', unenforceable: true, missing: ['tdd'] });
  });

  // AC-1/AC-5: shortfall, no bypass → error anomaly + refusal stderr, refuse
  it('refuses on a shortfall with an error anomaly and refusal stderr', async () => {
    const emits: EmitArg[] = [];
    const errs: string[] = [];
    const res = await runSkillAuditCheck(
      ctx({ configRequired: ['tdd'], invoked: [], emits, errs }),
    );
    expect(res.outcome).toBe('refuse');
    expect(res.effectiveRequired).toEqual(['tdd']);
    expect(emits[0]).toMatchObject({ severity: 'error', missing: ['tdd'] });
    expect(emits[0]?.bypassed).toBeUndefined();
    expect(errs.join('')).toContain('required skill(s) not invoked: tdd');
  });

  // AC-3: shortfall + --allow-skill-audit-miss → warn(bypassed) + proceed, pass
  it('bypasses a shortfall under --allow-skill-audit-miss', async () => {
    const emits: EmitArg[] = [];
    const errs: string[] = [];
    const res = await runSkillAuditCheck(
      ctx({ configRequired: ['tdd'], invoked: [], allowSkillAuditMiss: true, emits, errs }),
    );
    expect(res.outcome).toBe('pass');
    expect(emits[0]).toMatchObject({ severity: 'warn', bypassed: true, missing: ['tdd'] });
    expect(errs.join('')).toContain('--allow-skill-audit-miss set; proceeding past 1 missing skill(s)');
  });

  // AC-2: config ∪ DRAFT requiredSkills → deduped union in effectiveRequired
  it('unions and dedups config + DRAFT required skills', async () => {
    const res = await runSkillAuditCheck(
      ctx({ configRequired: ['a'], draftRequired: ['b'], invoked: ['superpowers:a', 'x:b'] }),
    );
    expect(res.outcome).toBe('pass');
    expect([...res.effectiveRequired].sort()).toEqual(['a', 'b']);
  });
});
