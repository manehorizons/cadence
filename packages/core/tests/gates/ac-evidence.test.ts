import { describe, it, expect } from 'vitest';
import { deriveAcEvidence } from '../../src/gates/ac-evidence.js';
import type { AcId, TestRef } from '../../src/verify/coverage.js';
import type { DeepVerdict } from '@manehorizons/cadence-types';

const NONE = new Map<AcId, TestRef[]>();

function refs(...r: Partial<TestRef>[]): Map<AcId, TestRef[]> {
  const m = new Map<AcId, TestRef[]>();
  m.set('AC-1', r.map((x) => ({ file: 'f.test.ts', line: 1, snippet: '', ...x })));
  return m;
}

describe('deriveAcEvidence (AC-2, AC-3, phase 140)', () => {
  it('AC-3: a real (non-mock) deep-verify pass yields ai-verified', () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: true, reason: 'ok', provider: 'anthropic' },
    };
    expect(deriveAcEvidence('AC-1', NONE, 'mention', false, deepVerify)).toBe('ai-verified');
  });

  it('AC-3: a mock-provider deep-verify pass does NOT yield ai-verified — falls through to coverage', () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: true, reason: 'ok', provider: 'mock' },
    };
    expect(deriveAcEvidence('AC-1', refs({ qualifying: true }), 'assertion', false, deepVerify)).toBe('assertion');
  });

  it('AC-3: a mock-provider deep-verify pass with zero coverage falls through to unverified', () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: true, reason: 'ok', provider: 'mock' },
    };
    expect(deriveAcEvidence('AC-1', NONE, 'mention', false, deepVerify)).toBe('unverified');
  });

  it('a failing deep-verify verdict never yields ai-verified, even from a real provider', () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: false, reason: 'nope', provider: 'anthropic' },
    };
    expect(deriveAcEvidence('AC-1', refs({ qualifying: true }), 'assertion', true, deepVerify)).toBe('executed');
  });

  it('AC-2: assertion mode + qualifying ref + buildTestRan=true yields executed', () => {
    expect(deriveAcEvidence('AC-1', refs({ qualifying: true }), 'assertion', true, undefined)).toBe('executed');
  });

  it('AC-2: assertion mode + qualifying ref + buildTestRan=false yields assertion', () => {
    expect(deriveAcEvidence('AC-1', refs({ qualifying: true }), 'assertion', false, undefined)).toBe('assertion');
  });

  it('AC-2: assertion mode + non-qualifying ref yields mention', () => {
    expect(deriveAcEvidence('AC-1', refs({ qualifying: false }), 'assertion', true, undefined)).toBe('mention');
  });

  it('AC-2: mention mode with any ref yields mention, regardless of buildTestRan', () => {
    expect(deriveAcEvidence('AC-1', refs({}), 'mention', true, undefined)).toBe('mention');
  });

  it('AC-2: no refs at all yields unverified', () => {
    expect(deriveAcEvidence('AC-1', NONE, 'mention', false, undefined)).toBe('unverified');
  });
});
