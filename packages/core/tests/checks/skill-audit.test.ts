import { describe, it, expect } from 'vitest';
import { runSkillAuditCheck } from '../../src/checks/skill-audit.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { ResolvedPack } from '../../src/packs/resolve.js';
import type { CadenceState } from '@thomas-powers-jr/cadence-types';

type EmitArg = Parameters<SettleContext['emit']['skillAuditMiss']>[0];

/**
 * Phase 291 (Slice 2) fixtures. `resolvedPacks` is deliberately NOT a field on
 * the `ctx()` context factory below: the DRAFT's Boundaries forbid any
 * `packs/`-typed field on `SettleContext`, and `ctx()`'s
 * `as unknown as SettleContext` cast would silently swallow an extra property,
 * leaving these tests exercising a shape settle never produces. They are a
 * second argument instead, exactly as T2 will pass them.
 */
const pack = (id: string, required: string[]): ResolvedPack => ({
  id,
  source: 'local',
  manifest: { id, version: '1.0.0', skillAudit: { required } },
});

/** An enabled-but-unresolvable pack — the `{ id, source, error }` arm. It must
 *  contribute nothing to either array here; refusing over it is T3's check. */
const brokenPack = (id: string): ResolvedPack => ({
  id,
  source: 'local',
  error: `Failed to read pack manifest for ${id}`,
});

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

describe('runSkillAuditCheck · resolved packs contribute required skills (phase 291 T1)', () => {
  it('291-01/AC-1: a pack-declared required skill unions in and enforces exactly like a config-declared one', async () => {
    // Union: the pack's skill joins config's and the DRAFT's, in source order.
    const unioned = await runSkillAuditCheck(
      ctx({ configRequired: ['a'], draftRequired: ['b'], invoked: ['x:a', 'x:b', 'x:c'] }),
      [pack('cadence/x', ['c'])],
    );
    expect(unioned.outcome).toBe('pass');
    expect(unioned.effectiveRequired).toEqual(['a', 'b', 'c']);

    // Enforcement: a pack-only requirement that was never invoked refuses,
    // with the same error-severity anomaly and refusal stderr a config-declared
    // miss produces — and `requiredWithProvenance` survives the refuse path.
    const emits: EmitArg[] = [];
    const errs: string[] = [];
    const refused = await runSkillAuditCheck(ctx({ invoked: [], emits, errs }), [
      pack('cadence/x', ['tdd']),
    ]);
    expect(refused.outcome).toBe('refuse');
    expect(refused.effectiveRequired).toEqual(['tdd']);
    expect(refused.requiredWithProvenance).toEqual([
      { skill: 'tdd', source: 'pack:cadence/x' },
    ]);
    expect(emits[0]).toMatchObject({ severity: 'error', missing: ['tdd'] });
    expect(errs.join('')).toContain('required skill(s) not invoked: tdd');

    // Same `--allow-skill-audit-miss` bypass.
    const bypassEmits: EmitArg[] = [];
    const bypassErrs: string[] = [];
    const bypassed = await runSkillAuditCheck(
      ctx({ invoked: [], allowSkillAuditMiss: true, emits: bypassEmits, errs: bypassErrs }),
      [pack('cadence/x', ['tdd'])],
    );
    expect(bypassed.outcome).toBe('pass');
    expect(bypassEmits[0]).toMatchObject({ severity: 'warn', bypassed: true, missing: ['tdd'] });
    expect(bypassErrs.join('')).toContain('--allow-skill-audit-miss set');

    // Same telemetry-off degradation: unenforceable warn, never a refusal.
    const offEmits: EmitArg[] = [];
    const telemetryOff = await runSkillAuditCheck(
      ctx({ invoked: [], skillInvocations: false, emits: offEmits }),
      [pack('cadence/x', ['tdd'])],
    );
    expect(telemetryOff.outcome).toBe('pass');
    expect(offEmits[0]).toMatchObject({ severity: 'warn', unenforceable: true, missing: ['tdd'] });

    // An unresolvable pack contributes nothing — no phantom requirement, no
    // refusal from this check (T3 owns refusing over the resolution failure).
    const brokenEmits: EmitArg[] = [];
    const broken = await runSkillAuditCheck(ctx({ invoked: [], emits: brokenEmits }), [
      brokenPack('cadence/missing'),
    ]);
    expect(broken.outcome).toBe('pass');
    expect(broken.effectiveRequired).toEqual([]);
    expect(broken.requiredWithProvenance).toEqual([]);
    expect(brokenEmits).toEqual([]);
  });

  it('291-01/AC-2: a skill required by both config and a pack yields two provenance entries, never one collapsed row', async () => {
    const res = await runSkillAuditCheck(
      ctx({ configRequired: ['foo'], draftRequired: ['bar'], invoked: ['x:foo', 'x:bar'] }),
      [pack('cadence/x', ['foo'])],
    );
    expect(res.outcome).toBe('pass');

    // The enforcement-facing array IS deduped — `foo` enforces once.
    expect(res.effectiveRequired).toEqual(['foo', 'bar']);

    // Provenance is NOT deduped across sources: `foo` is demanded twice, so it
    // appears twice, each row naming who demanded it. Order is config → draft
    // → packs in resolution order.
    expect(res.requiredWithProvenance).toEqual([
      { skill: 'foo', source: 'config' },
      { skill: 'bar', source: 'draft' },
      { skill: 'foo', source: 'pack:cadence/x' },
    ]);

    // Two packs both demanding the same skill stay distinguishable too.
    const twoPacks = await runSkillAuditCheck(ctx({ invoked: ['x:foo'] }), [
      pack('cadence/x', ['foo']),
      pack('cadence/y', ['foo']),
    ]);
    expect(twoPacks.effectiveRequired).toEqual(['foo']);
    expect(twoPacks.requiredWithProvenance).toEqual([
      { skill: 'foo', source: 'pack:cadence/x' },
      { skill: 'foo', source: 'pack:cadence/y' },
    ]);
  });

  it('behaves identically to the pre-Slice-2 code path when no packs resolve', async () => {
    // Default argument (what settle.ts's untouched one-arg call site still
    // does) and an explicit empty array must be indistinguishable.
    const defaulted = await runSkillAuditCheck(
      ctx({ configRequired: ['a'], draftRequired: ['b'], invoked: ['x:a', 'x:b'] }),
    );
    const explicitEmpty = await runSkillAuditCheck(
      ctx({ configRequired: ['a'], draftRequired: ['b'], invoked: ['x:a', 'x:b'] }),
      [],
    );
    expect(defaulted).toEqual(explicitEmpty);
    expect(explicitEmpty.effectiveRequired).toEqual(['a', 'b']);

    // Compile-time proof for T2: `requiredWithProvenance` is assignable to
    // `CadenceState['skillAudit']['provenance']` under
    // `exactOptionalPropertyTypes`, so T2's direct
    // `state.skillAudit.provenance = res.requiredWithProvenance` typechecks
    // without relaxing the schema to `.nullable()` or adding a default. If the
    // schema field ever stops accepting a concrete array, this stops compiling.
    const forState: NonNullable<CadenceState['skillAudit']['provenance']> =
      explicitEmpty.requiredWithProvenance;
    expect(forState).toEqual([
      { skill: 'a', source: 'config' },
      { skill: 'b', source: 'draft' },
    ]);

    // Null config (load failed): still compute the narrower set — which on
    // this path is DRAFT-only, since settle passes `[]` when config is null —
    // but skip enforcement entirely. Never false-refuse, never emit.
    const emits: EmitArg[] = [];
    const errs: string[] = [];
    const nullConfig = await runSkillAuditCheck(
      ctx({ configRequired: null, draftRequired: ['tdd'], invoked: [], emits, errs }),
      [],
    );
    expect(nullConfig.outcome).toBe('pass');
    expect(nullConfig.effectiveRequired).toEqual(['tdd']);
    expect(nullConfig.requiredWithProvenance).toEqual([{ skill: 'tdd', source: 'draft' }]);
    expect(emits).toEqual([]);
    expect(errs).toEqual([]);

    // Nothing required at all → inert pass, empty provenance.
    const inert = await runSkillAuditCheck(ctx({}), []);
    expect(inert.outcome).toBe('pass');
    expect(inert.effectiveRequired).toEqual([]);
    expect(inert.requiredWithProvenance).toEqual([]);
  });
});
