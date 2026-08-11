import { describe, it, expect } from 'vitest';
import type { GateProvenance } from '@thomas-powers-jr/cadence-types';
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

  it('272-01/AC-5: zero ACs with zero verifier identity resolves to "unverified", not "weak" (rec-20260801-006)', () => {
    // Pins the docstring correction: the 'unverified' branch's two
    // conditions are each vacuously true with empty inputs, so this shape
    // hits 'unverified' before the 'weak' fallback is ever reached.
    const result = deriveAssuranceRecord([], []);
    expect(result.overall).toBe('unverified');
  });

  it('272-01/AC-5: zero ACs with a real verifier present resolves to "mixed" (previously untested branch, rec-20260801-006)', () => {
    // hasRealVerifier=true but totalAcs=0 means strongRatio is 0 by the
    // totalAcs>0 guard, so this can never reach 'strong' -- it lands in the
    // 'mixed' branch via the hasRealVerifier||strongRatio>0 condition alone.
    const realProviderGates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const result = deriveAssuranceRecord(realProviderGates, []);
    expect(result.overall).toBe('mixed');
  });
});

/**
 * Phase 267 (267-01, T3): a mock-identified CLEAN PASS on `code-review`/
 * `security-audit` now arrives as `status: 'skipped'` + a skipReason naming
 * the abstention (`registry.ts`, T2 — dec-20260809-004/-005), instead of the
 * pre-267 `status: 'ran'`. `deriveAssuranceRecord` never branched on
 * `status` before this phase and doesn't need to now: the decision, stated
 * and reasoned in this file's doc comment above `deriveAssuranceRecord`, is
 * that an abstained entry still contributes its `provider: 'mock'` identity
 * to `verifierRollup`/`hasAnyVerifier`, exactly as a `status: 'ran'` (or
 * pre-existing `status: 'refused'`) mock entry already does. `hasRealVerifier`
 * is untouched either way since abstained entries never carry a non-mock
 * provider — the only visible effect is the `'unverified'` vs `'weak'`
 * boundary in the narrowest case (see the second test below).
 */
describe('deriveAssuranceRecord and mock-abstained review gates (267-01/AC-3)', () => {
  const ABSTAIN_SKIP_REASON =
    "code-review: mock-identified clean pass abstained — the mock provider is not real verification, recorded as skipped rather than a persisted pass";

  it('267-01/AC-3: a mock-abstained (status: skipped) review gate produces the IDENTICAL verifierRollup/overall as the equivalent status: ran entry would', () => {
    const acResults = [ac('AC-1', 'mention')];

    const ranGates: GateProvenance[] = [{ gate: 'code-review', status: 'ran', provider: 'mock' }];
    const skippedGates: GateProvenance[] = [
      { gate: 'code-review', status: 'skipped', skipReason: ABSTAIN_SKIP_REASON, provider: 'mock' },
    ];

    const ranResult = deriveAssuranceRecord(ranGates, acResults);
    const skippedResult = deriveAssuranceRecord(skippedGates, acResults);

    // Byte-identical: status is not part of this function's grouping
    // contract, only provider/model are (see doc comment above).
    expect(skippedResult).toEqual(ranResult);
    expect(skippedResult.verifierRollup).toEqual([{ provider: 'mock', gateCount: 1 }]);
  });

  it("267-01/AC-3: overall is 'weak', not 'unverified', when the only verifier signal anywhere is one abstained mock review gate and no AC evidence exceeds unverified", () => {
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'skipped', skipReason: ABSTAIN_SKIP_REASON, provider: 'mock' },
    ];
    const acResults = [ac('AC-1'), ac('AC-2', 'unverified')];

    const result = deriveAssuranceRecord(gates, acResults);

    // hasAnyVerifier is true (the abstained entry still carries provider:
    // 'mock'), which alone rules out the 'unverified' branch — an abstained
    // mock entry is honestly-recorded non-verification, not silence. Without
    // this, the same settle would misreport 'unverified' -- as if nothing
    // had looked at it at all -- purely because T2 renamed the gate's status.
    expect(result.verifierRollup).toEqual([{ provider: 'mock', gateCount: 1 }]);
    expect(result.overall).toBe('weak');
  });

  it('267-01/AC-3: a pre-existing status: refused mock entry (a real finding, never abstained) also contributes to verifierRollup -- confirms status was never a filter, before or after this phase', () => {
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'refused', reason: 'HIGH finding: ...', provider: 'mock' },
    ];
    const result = deriveAssuranceRecord(gates, []);
    expect(result.verifierRollup).toEqual([{ provider: 'mock', gateCount: 1 }]);
  });

  it('267-01/AC-3: an abstained (skipped) mock entry and a bypassed-real-finding (ran) mock entry merge into ONE rollup entry -- grouping is by (provider, model) alone, uniformly across status', () => {
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'skipped', skipReason: ABSTAIN_SKIP_REASON, provider: 'mock' },
      { gate: 'security-audit', status: 'ran', provider: 'mock' },
    ];
    const result = deriveAssuranceRecord(gates, []);
    expect(result.verifierRollup).toEqual([{ provider: 'mock', gateCount: 2 }]);
  });
});

/**
 * Phase 264, T6 — derivation-stability proof. Phase 264 only ever touches
 * render-time label formatting (`services/verifier-label.ts`) and never
 * edits this file's production source (`gates/assurance-record.ts`). This
 * pins `deriveAssuranceRecord`'s output for a small fixed corpus of
 * pre-phase-264-shaped `GateProvenance[]`/`AssuranceAcResult[]` inputs to
 * hand-derived expected values (computed by reading the function's
 * documented rules above, not captured from a live run), so any future
 * accidental edit to the derivation logic breaks loudly here.
 */
describe('deriveAssuranceRecord derivation-stability proof', () => {
  it('264-01/AC-5: overall, verifierRollup, and evidenceTally are byte-identical to hand-derived expected values across an all-mock, mixed mock+real, all-real, and empty corpus', () => {
    // Scenario 1: all-mock gates (both provider='mock', no model -> merge
    // into one rollup entry with gateCount 2), AC evidence at 'mention' and
    // 'unverified' only. hasRealVerifier=false and strongRatio=0, but
    // mention=1 makes noEvidenceAboveUnverified false, so the 'unverified'
    // branch is skipped; falls through the 'strong' and 'mixed' branches
    // (both require hasRealVerifier or strongRatio>0, neither holds) to the
    // final 'weak' else-branch.
    const allMockGates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'mock' },
      { gate: 'security-audit', status: 'ran', provider: 'mock' },
    ];
    const allMockAcs = [ac('AC-1', 'mention'), ac('AC-2', 'unverified')];
    const allMockResult = deriveAssuranceRecord(allMockGates, allMockAcs);
    expect(allMockResult.verifierRollup).toEqual([{ provider: 'mock', gateCount: 2 }]);
    expect(allMockResult.evidenceTally).toEqual({
      'ai-verified': 0,
      executed: 0,
      assertion: 0,
      mention: 1,
      unverified: 1,
    });
    expect(allMockResult.overall).toBe('weak');

    // Scenario 2: mixed mock + real gates (distinct (provider,model) keys,
    // each gateCount 1), all AC evidence at 'mention' (below the strong
    // bar). hasRealVerifier=true (an 'anthropic' entry exists) but
    // strongCount=0 so strongRatio=0 -- fails the 'strong' bar
    // (strongRatio>=0.5) but satisfies the 'mixed' bar
    // (hasRealVerifier || strongRatio>0), landing on 'mixed'.
    const mixedGates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'mock' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const mixedAcs = [ac('AC-1', 'mention'), ac('AC-2', 'mention')];
    const mixedResult = deriveAssuranceRecord(mixedGates, mixedAcs);
    expect(mixedResult.verifierRollup).toEqual([
      { provider: 'mock', gateCount: 1 },
      { provider: 'anthropic', model: 'claude-x', gateCount: 1 },
    ]);
    expect(mixedResult.evidenceTally).toEqual({
      'ai-verified': 0,
      executed: 0,
      assertion: 0,
      mention: 2,
      unverified: 0,
    });
    expect(mixedResult.overall).toBe('mixed');

    // Scenario 3: all-real gates sharing one (provider,model) key (merge to
    // gateCount 2), AC evidence entirely at the two strongest classes
    // ('ai-verified', 'executed'). hasRealVerifier=true and
    // strongRatio=2/2=1.0 >= 0.5 -> 'strong'.
    const allRealGates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const allRealAcs = [ac('AC-1', 'ai-verified'), ac('AC-2', 'executed')];
    const allRealResult = deriveAssuranceRecord(allRealGates, allRealAcs);
    expect(allRealResult.verifierRollup).toEqual([
      { provider: 'anthropic', model: 'claude-x', gateCount: 2 },
    ]);
    expect(allRealResult.evidenceTally).toEqual({
      'ai-verified': 1,
      executed: 1,
      assertion: 0,
      mention: 0,
      unverified: 0,
    });
    expect(allRealResult.overall).toBe('strong');

    // Scenario 4: completely empty corpus -- no gate carries verifier
    // identity (verifierRollup empty -> hasAnyVerifier=false) and no AC
    // evidence exists at all (every tally bucket, including the
    // non-unverified ones, is 0 -> noEvidenceAboveUnverified=true) ->
    // 'unverified'.
    const emptyResult = deriveAssuranceRecord([], []);
    expect(emptyResult.verifierRollup).toEqual([]);
    expect(emptyResult.evidenceTally).toEqual({
      'ai-verified': 0,
      executed: 0,
      assertion: 0,
      mention: 0,
      unverified: 0,
    });
    expect(emptyResult.overall).toBe('unverified');
  });
});
