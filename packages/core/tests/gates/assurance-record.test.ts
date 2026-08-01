import { describe, it, expect } from 'vitest';
import type { GateProvenance } from '@manehorizons/cadence-types';
import { deriveAssuranceRecord, type AssuranceAcResult } from '../../src/gates/assurance-record.js';
import { GATE_ORDER } from '../../src/gates/registry.js';

function ac(id: string, evidence?: AssuranceAcResult['evidence']): AssuranceAcResult {
  return { id, pass: true, ...(evidence !== undefined ? { evidence } : {}) };
}

describe('deriveAssuranceRecord (phase 233 T2)', () => {
  it('AC-2: an all-mock-provider run with weak evidence yields a weak/unverified overall', () => {
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'mock' },
      { gate: 'security-audit', status: 'ran', provider: 'mock' },
    ];
    const acResults = [ac('AC-1', 'mention'), ac('AC-2', 'unverified')];

    const mockResult = deriveAssuranceRecord(gates, acResults);
    expect(['weak', 'unverified']).toContain(mockResult.overall);

    // AC-2: an equivalent real-provider run with strong evidence produces a
    // different assurance record from the all-mock run above.
    const realGates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const strongAcResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'executed')];
    const realResult = deriveAssuranceRecord(realGates, strongAcResults);

    expect(realResult.overall).not.toBe(mockResult.overall);
    expect(realResult.overall).toBe('strong');
  });

  it('AC-3: walking every GATE_ORDER gate through the function never throws and treats each uniformly', () => {
    // Only code-review/security-audit carry provider/model in real settles
    // (phase 232); every other gate's provenance entry omits both. Feed all
    // GATE_ORDER ids through uniformly — nothing here branches on gate name.
    const gates: GateProvenance[] = GATE_ORDER.map((gate) =>
      gate === 'code-review' || gate === 'security-audit'
        ? { gate, status: 'ran', provider: 'anthropic', model: 'claude-x' }
        : { gate, status: 'ran' },
    );
    expect(gates).toHaveLength(GATE_ORDER.length);

    expect(() => deriveAssuranceRecord(gates, [])).not.toThrow();
    const result = deriveAssuranceRecord(gates, []);
    // Both provider-carrying entries share the same (provider, model) pair,
    // so they roll up into exactly one verifierRollup entry with gateCount 2
    // — proving the grouping is by (provider, model) alone, not by gate id.
    expect(result.verifierRollup).toEqual([{ provider: 'anthropic', model: 'claude-x', gateCount: 2 }]);
  });

  it('evidenceTally always has exactly the 5 AcEvidenceZ keys present, even for an empty acResults array', () => {
    const result = deriveAssuranceRecord([], []);
    expect(Object.keys(result.evidenceTally).sort()).toEqual(
      ['ai-verified', 'assertion', 'executed', 'mention', 'unverified'].sort(),
    );
    expect(result.evidenceTally).toEqual({
      'ai-verified': 0,
      executed: 0,
      assertion: 0,
      mention: 0,
      unverified: 0,
    });
  });

  it('evidenceTally has all 5 keys present when ACs occupy only 1-2 evidence classes', () => {
    const result = deriveAssuranceRecord([], [ac('AC-1', 'mention'), ac('AC-2', 'mention')]);
    expect(Object.keys(result.evidenceTally).sort()).toEqual(
      ['ai-verified', 'assertion', 'executed', 'mention', 'unverified'].sort(),
    );
    expect(result.evidenceTally).toEqual({
      'ai-verified': 0,
      executed: 0,
      assertion: 0,
      mention: 2,
      unverified: 0,
    });
  });

  it('overall is "unverified" when no gate carries verifier identity and no AC evidence exceeds unverified', () => {
    const gates: GateProvenance[] = [{ gate: 'draft-read', status: 'ran' }];
    const acResults = [ac('AC-1'), ac('AC-2', 'unverified')];
    const result = deriveAssuranceRecord(gates, acResults);
    expect(result.overall).toBe('unverified');
  });

  it('groups verifierRollup by distinct (provider, model) pairs, counting gate occurrences', () => {
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-y' },
    ];
    const result = deriveAssuranceRecord(gates, []);
    expect(result.verifierRollup).toEqual([
      { provider: 'anthropic', model: 'claude-x', gateCount: 1 },
      { provider: 'anthropic', model: 'claude-y', gateCount: 1 },
    ]);
  });
});
