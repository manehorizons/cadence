import { describe, it, expect } from 'vitest';
import {
  deriveAcEvidence,
  rankEvidence,
  meetsEvidenceFloor,
  checkEvidenceFloor,
  isUnobservableAc,
} from '../../src/gates/ac-evidence.js';
import type { AcId, TestRef } from '../../src/verify/coverage.js';
import type { AcEvidence, DeepVerdict } from '@thomas-powers-jr/cadence-types';

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

// Phase 214 T2 (AC-1): the evidence ladder rank comparator + evidence-floor
// gate step. `rankEvidence`/`meetsEvidenceFloor` are pure lookups over the
// Phase 140 ladder; `checkEvidenceFloor` is the gate step itself, consuming
// already-derived AC evidence (the shape `services/settle.ts` computes as
// `acResultsWithEvidence`) rather than re-deriving it.
describe('rankEvidence (Phase 214 T2)', () => {
  it('ranks the ladder strongest to weakest: ai-verified > executed > assertion > mention > unverified', () => {
    const order: AcEvidence[] = ['ai-verified', 'executed', 'assertion', 'mention', 'unverified'];
    for (let i = 0; i < order.length - 1; i++) {
      expect(rankEvidence(order[i] as AcEvidence)).toBeGreaterThan(rankEvidence(order[i + 1] as AcEvidence));
    }
  });
});

describe('meetsEvidenceFloor (Phase 214 T2)', () => {
  it('an evidence level meets a floor of the same strength', () => {
    expect(meetsEvidenceFloor('executed', 'executed')).toBe(true);
  });

  it('a stronger evidence level meets a weaker floor', () => {
    expect(meetsEvidenceFloor('ai-verified', 'assertion')).toBe(true);
  });

  it('a weaker evidence level does not meet a stronger floor', () => {
    expect(meetsEvidenceFloor('mention', 'executed')).toBe(false);
  });
});

describe('checkEvidenceFloor (Phase 214 T2, AC-1)', () => {
  it('AC-1: refuses and names the offending AC id plus its actual level vs. the required floor', () => {
    const result = checkEvidenceFloor(
      [
        { id: 'AC-1', evidence: 'mention' },
        { id: 'AC-2', evidence: 'executed' },
      ],
      'executed',
    );

    expect(result.outcome).toBe('refuse');
    expect(result.offenders).toEqual([{ id: 'AC-1', actual: 'mention', required: 'executed' }]);
    expect(result.reason).toContain('AC-1');
    expect(result.reason).toContain('mention');
    expect(result.reason).toContain('executed');
  });

  it('AC-1: names every offending AC when more than one falls below the floor', () => {
    const result = checkEvidenceFloor(
      [
        { id: 'AC-1', evidence: 'unverified' },
        { id: 'AC-2', evidence: 'mention' },
      ],
      'assertion',
    );

    expect(result.outcome).toBe('refuse');
    expect(result.offenders.map((o) => o.id)).toEqual(['AC-1', 'AC-2']);
    expect(result.reason).toContain('AC-1');
    expect(result.reason).toContain('AC-2');
  });

  it('passes settle when every AC is at or above the floor', () => {
    const result = checkEvidenceFloor(
      [
        { id: 'AC-1', evidence: 'executed' },
        { id: 'AC-2', evidence: 'ai-verified' },
      ],
      'executed',
    );

    expect(result.outcome).toBe('pass');
    expect(result.offenders).toEqual([]);
    expect(result.reason).toBeUndefined();
  });

  it('treats a missing evidence field as unverified — the weakest rung', () => {
    const result = checkEvidenceFloor([{ id: 'AC-1' }], 'mention');
    expect(result.outcome).toBe('refuse');
    expect(result.offenders).toEqual([{ id: 'AC-1', actual: 'unverified', required: 'mention' }]);
  });

  it('274-01/AC-4: an entry marked unobservable is skipped entirely, never becoming an offender despite carrying no evidence field', () => {
    const result = checkEvidenceFloor(
      [
        { id: 'AC-1', unobservable: true },
        { id: 'AC-2', evidence: 'executed' },
      ],
      'assertion',
    );
    expect(result.outcome).toBe('pass');
    expect(result.offenders).toEqual([]);
  });

  it("274-01/AC-4: an unobservable entry is never defaulted to 'unverified' even at the strictest floor", () => {
    const result = checkEvidenceFloor([{ id: 'AC-1', unobservable: true }], 'ai-verified');
    expect(result.outcome).toBe('pass');
    expect(result.offenders).toEqual([]);
  });
});

// Phase 274 (T5, D-H): off-ladder placement for the classifier's
// `unobservable` marker. `isUnobservableAc` is the single source of truth
// `deriveAcEvidence`/`checkEvidenceFloor` (and `services/settle.ts`'s
// `deriveEvidenceAndCheckFloor`) all key off of.
describe('isUnobservableAc (Phase 274 T5, D-H)', () => {
  it('274-01/AC-4: true when deepVerify[id].unobservable is set', () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: false, reason: 'circular SUMMARY reference', provider: 'mock', unobservable: true },
    };
    expect(isUnobservableAc('AC-1', deepVerify)).toBe(true);
  });

  it('274-01/AC-4: false for an ordinary (non-unobservable) verdict', () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: false, reason: 'nope', provider: 'mock' },
    };
    expect(isUnobservableAc('AC-1', deepVerify)).toBe(false);
  });

  it('274-01/AC-4: false when the AC has no deepVerify entry at all, or deepVerify is undefined', () => {
    expect(isUnobservableAc('AC-1', {})).toBe(false);
    expect(isUnobservableAc('AC-1', undefined)).toBe(false);
  });
});

describe('deriveAcEvidence — unobservable off-ladder short-circuit (Phase 274 T5, D-H)', () => {
  it("274-01/AC-4: returns undefined — not 'unverified' — for a classifier-marked-unobservable AC with zero coverage refs (the true phase-272-AC-7 shape)", () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': {
        pass: false,
        reason: "AC-1 self-references \"this phase's own SUMMARY\"",
        provider: 'mock',
        unobservable: true,
      },
    };
    expect(deriveAcEvidence('AC-1', NONE, 'assertion', false, deepVerify)).toBeUndefined();
  });

  it('274-01/AC-4: stays undefined even when the AC also has a qualifying test ref — off-ladder wins over ordinary coverage-derived evidence', () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: false, reason: 'unobservable despite coverage', provider: 'mock', unobservable: true },
    };
    expect(
      deriveAcEvidence('AC-1', refs({ qualifying: true }), 'assertion', true, deepVerify),
    ).toBeUndefined();
  });

  it("274-01/AC-4: stays undefined even if the verdict's pass were somehow true and non-mock — the off-ladder check runs before the ai-verified branch", () => {
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: true, reason: 'hypothetical', provider: 'anthropic', unobservable: true },
    };
    expect(deriveAcEvidence('AC-1', NONE, 'mention', false, deepVerify)).toBeUndefined();
  });
});
