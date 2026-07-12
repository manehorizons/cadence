import { describe, it, expect } from 'vitest';
import { RetroDigestZ } from '../src/retro.js';

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
