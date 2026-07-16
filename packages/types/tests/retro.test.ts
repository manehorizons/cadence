import { describe, it, expect } from 'vitest';
import { RetroDigestZ, PhaseRetroEntryZ, RetroFrequencyEntryZ, RetroRollupZ } from '../src/retro.js';

describe('RetroDigestZ', () => {
  it('accepts an all-empty digest and applies defaults', () => {
    const parsed = RetroDigestZ.parse({});
    expect(parsed).toEqual({ bypasses: [], roughTasks: [], findings: {} });
  });

  it('accepts a fully populated digest', () => {
    const input = {
      bypasses: [{ gate: 'test-coverage', flag: '--allow-missing-coverage', reason: 'legacy file', severity: 'warn' as const }],
      roughTasks: [{ id: 'T2', status: 'BLOCKED' as const, notes: 'waiting on infra' }],
      findings: {
        codeReview: { 'src/foo.ts': [{ severity: 'high' as const, message: 'no error handling' }] },
        securityAudit: [{ severity: 'critical' as const, message: 'hardcoded secret', line: 12 }],
        boundaryScan: { offenders: ['src/out-of-scope.ts'] },
      },
    };
    expect(() => RetroDigestZ.parse(input)).not.toThrow();
    expect(RetroDigestZ.parse(input)).toEqual(input);
  });

  it('rejects an unknown task status', () => {
    expect(() =>
      RetroDigestZ.parse({ roughTasks: [{ id: 'T1', status: 'WEIRD', notes: '' }] }),
    ).toThrow();
  });
});

describe('PhaseRetroEntryZ', () => {
  it('accepts a phase-tagged digest', () => {
    const input = {
      phaseId: '186-cross-phase-retro-rollup',
      draftId: '186-01',
      digest: { bypasses: [], roughTasks: [], findings: {} },
    };
    expect(() => PhaseRetroEntryZ.parse(input)).not.toThrow();
    expect(PhaseRetroEntryZ.parse(input)).toEqual(input);
  });

  it('rejects a missing phaseId', () => {
    expect(() =>
      PhaseRetroEntryZ.parse({ draftId: '186-01', digest: { bypasses: [], roughTasks: [], findings: {} } }),
    ).toThrow();
  });
});

describe('RetroFrequencyEntryZ', () => {
  it('accepts a valid frequency entry', () => {
    const input = { key: 'test-coverage', count: 2, phaseIds: ['170', '186'] };
    expect(RetroFrequencyEntryZ.parse(input)).toEqual(input);
  });

  it('rejects a non-positive count', () => {
    expect(() => RetroFrequencyEntryZ.parse({ key: 'test-coverage', count: 0, phaseIds: [] })).toThrow();
  });
});

describe('RetroRollupZ', () => {
  it('accepts an all-empty rollup and applies bucket defaults', () => {
    const parsed = RetroRollupZ.parse({ totalPhases: 0, phasesWithFriction: 0 });
    expect(parsed).toEqual({
      totalPhases: 0,
      phasesWithFriction: 0,
      bypasses: { recurring: [], oneOff: [] },
      roughTaskStatuses: { recurring: [], oneOff: [] },
      findingCategories: { recurring: [], oneOff: [] },
    });
  });

  it('accepts a fully populated rollup', () => {
    const input = {
      totalPhases: 3,
      phasesWithFriction: 2,
      bypasses: {
        recurring: [{ key: 'test-coverage', count: 2, phaseIds: ['170', '186'] }],
        oneOff: [{ key: 'boundary-scan', count: 1, phaseIds: ['184'] }],
      },
      roughTaskStatuses: {
        recurring: [{ key: 'BLOCKED', count: 2, phaseIds: ['170', '186'] }],
        oneOff: [],
      },
      findingCategories: {
        recurring: [],
        oneOff: [{ key: 'securityAudit', count: 1, phaseIds: ['184'] }],
      },
    };
    expect(() => RetroRollupZ.parse(input)).not.toThrow();
    expect(RetroRollupZ.parse(input)).toEqual(input);
  });

  it('rejects a negative totalPhases', () => {
    expect(() => RetroRollupZ.parse({ totalPhases: -1, phasesWithFriction: 0 })).toThrow();
  });
});
