import { describe, it, expect } from 'vitest';
import { GateSetZ, GateZ, ProfileZ } from '../src/profile.js';

describe('ProfileZ', () => {
  it.each(['strict', 'standard', 'auto'] as const)('accepts %s', (v) => {
    expect(ProfileZ.safeParse(v).success).toBe(true);
  });

  it('rejects unknown literals', () => {
    expect(ProfileZ.safeParse('lenient').success).toBe(false);
    expect(ProfileZ.safeParse('').success).toBe(false);
    expect(ProfileZ.safeParse(null).success).toBe(false);
  });
});

describe('GateZ', () => {
  it.each([
    'coherence-check',
    'structural-verifier',
    'build-test-must-pass',
    'draft-read',
    'test-coverage',
    'anomaly-notify',
    'approve',
    'per-task-verify',
    'code-review',
    'deep-verify',
    'interactive-verdict',
    'plan-review',
    'security-audit',
  ] as const)('accepts %s', (v) => {
    expect(GateZ.safeParse(v).success).toBe(true);
  });

  it('rejects unknown gate names', () => {
    expect(GateZ.safeParse('made-up-gate').success).toBe(false);
  });
});

describe('GateSetZ', () => {
  it('parses an empty gate set with softCap=false', () => {
    expect(GateSetZ.safeParse({ gates: [], softCap: false }).success).toBe(true);
  });

  it('parses a populated gate set with softCap=true', () => {
    expect(
      GateSetZ.safeParse({
        gates: ['coherence-check', 'test-coverage', 'anomaly-notify'],
        softCap: true,
      }).success,
    ).toBe(true);
  });

  it('rejects unknown gate in array', () => {
    expect(GateSetZ.safeParse({ gates: ['nope'], softCap: false }).success).toBe(false);
  });

  it('rejects missing softCap field', () => {
    expect(GateSetZ.safeParse({ gates: [] }).success).toBe(false);
  });
});
