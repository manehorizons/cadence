import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { DeepVerdict, GateBypass, GateProvenance } from '@thomas-powers-jr/cadence-types';
import { deriveAssuranceRecord, type AssuranceAcResult } from '../../src/gates/assurance-record.js';
import { GATE_ORDER } from '../../src/gates/registry.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

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

/**
 * Phase 275 (T1) — the load-bearing safety property this phase exists to
 * prove, phase-qualified AC-3. `observedProvider`/`observedModel`/`taskId`
 * are a structurally separate field set on `GateProvenanceZ` (T1,
 * `summary.ts`), populated for `deep-verify` (T2) and `per-task-verify` (T4)
 * specifically so their real provider identity stays invisible to this
 * function's fold — `deriveAssuranceRecord` only ever reads
 * `.provider`/`.model` (see its own doc comment and `rollupByKey`'s
 * `g.provider === undefined` guard above). No change to `assurance-record.ts`
 * itself is expected or made here; this test proves the *existing* code
 * already can't see the new field names.
 *
 * Both the with-fields and without-fields comparison live inside a single
 * asserting test block below (not split across two) — this repo's coverage
 * scanner dedups a phase-qualified AC token per file by first occurrence
 * only, so writing the qualified token a second time anywhere earlier in
 * this file (even in a comment or a describe title) would silently steal the
 * dedup slot from the real assertion below and make it invisible to the
 * coverage/evidence-floor gate. Deliberately not spelled out literally here
 * for that exact reason — see the test title itself for the token.
 */
describe('deriveAssuranceRecord and observedProvider/observedModel/taskId (phase 275, AC-3)', () => {
  it('275-01/AC-3: gates[] entries carrying only observedProvider/taskId (no provider/model) are structurally invisible to verifierRollup and overall', () => {
    const acResults = [ac('AC-1', 'mention')];

    // Baseline: no verifier identity at all on either field set.
    const baselineGates: GateProvenance[] = [{ gate: 'draft-read', status: 'ran' }];
    const baselineResult = deriveAssuranceRecord(baselineGates, acResults);
    expect(baselineResult.verifierRollup).toEqual([]);
    expect(baselineResult.overall).toBe('weak');

    // Otherwise-identical input, but the entries now carry
    // observedProvider/observedModel/taskId (the deep-verify/per-task-verify
    // shape) while `.provider`/`.model` stay absent.
    const observedOnlyGates: GateProvenance[] = [
      {
        gate: 'deep-verify',
        status: 'ran',
        observedProvider: 'anthropic',
        observedModel: 'claude-sonnet-5',
      },
      {
        gate: 'per-task-verify',
        status: 'ran',
        taskId: 'T1',
        observedProvider: 'host-cli',
      },
      {
        gate: 'per-task-verify',
        status: 'ran',
        taskId: 'T2',
        observedProvider: 'host-cli',
        observedModel: 'claude-sonnet-5',
      },
    ];
    const observedOnlyResult = deriveAssuranceRecord(observedOnlyGates, acResults);

    // verifierRollup is empty -- none of observedProvider/observedModel/
    // taskId ever populate it, only `.provider`/`.model` do.
    expect(observedOnlyResult.verifierRollup).toEqual([]);
    // overall is UNCHANGED relative to the otherwise-identical baseline
    // input that carries no verifier identity at all -- proving the
    // observed* fields contribute nothing to the derivation.
    expect(observedOnlyResult.overall).toBe(baselineResult.overall);
    expect(observedOnlyResult).toEqual(baselineResult);

    // AC-3's own wording, taken literally: "overall does not change between
    // an otherwise-identical input with and without them present." The
    // baseline comparison above uses a differently-shaped single entry; this
    // is the literal same-shape twin -- the exact same 3 gate/status/taskId
    // entries in the exact same order, with only observedProvider/
    // observedModel stripped off each one.
    const strippedTwinGates: GateProvenance[] = [
      { gate: 'deep-verify', status: 'ran' },
      { gate: 'per-task-verify', status: 'ran', taskId: 'T1' },
      { gate: 'per-task-verify', status: 'ran', taskId: 'T2' },
    ];
    const strippedTwinResult = deriveAssuranceRecord(strippedTwinGates, acResults);
    expect(observedOnlyResult).toEqual(strippedTwinResult);

    // Sanity check the guard the other direction too: a genuinely-real
    // `.provider`/`.model` entry (not observed*) DOES change `overall`,
    // proving this test's baseline/observed-only equality above isn't
    // vacuous because deriveAssuranceRecord is broken/no-op.
    const realProviderGates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-sonnet-5' },
    ];
    const realProviderResult = deriveAssuranceRecord(realProviderGates, acResults);
    expect(realProviderResult.verifierRollup).not.toEqual([]);
    expect(realProviderResult.overall).not.toBe(baselineResult.overall);
  });
});

/**
 * Phase 283 (283-01, T1) — red regression tests against TODAY's unmodified
 * `deriveAssuranceRecord`, capturing the bug this whole phase exists to fix
 * (see the phase Objective: 272-assurance-record-correctness and
 * 282-coverage-scanner-determinism both graded 'strong' over recorded
 * gateBypasses and real host-cli deep-verify failures).
 *
 * T1 originally wrote these tests against `deriveAssuranceRecord`'s
 * anticipated post-T2 signature via a local type cast (`callWithBypassInput`)
 * because the real function only took two arguments at the time. T2
 * (283-01) has since implemented the real third argument with this exact
 * `{ gateBypasses, deepVerify }` shape (see `AssuranceBypassInput` in
 * `src/gates/assurance-record.ts`), so the cast is now dead plumbing and
 * both tests below call `deriveAssuranceRecord` directly with 3 real
 * arguments. The test bodies/assertions are otherwise unchanged from T1 —
 * these were genuinely RED before T2's implementation and are GREEN now.
 */
describe('deriveAssuranceRecord bypass-aware grading (phase 283-01, T1 red tests)', () => {
  it('283-01/AC-1: an error-severity gateBypasses entry caps overall at mixed, never strong, even though the underlying gates/evidence alone would grade strong', () => {
    // Mirrors a real forced settle: a real (non-mock) verifier ran on every
    // gate that carries identity, and every AC landed at the two strongest
    // evidence classes -- on the gates/acResults alone this is the textbook
    // 'strong' shape (see the 264-01/AC-5 "all-real" scenario above, whose
    // equivalent input already asserts exactly that).
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const acResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'executed')];

    // But this settle also carries a non-empty gateBypasses array with an
    // error-severity entry -- e.g. a --force override of a real refusal.
    // 'settle' is the pseudo-gate name GateBypassZ.gate uses for the
    // --force bypass case specifically (see its doc comment in
    // packages/types/src/summary.ts).
    const gateBypasses: GateBypass[] = [
      { gate: 'settle', flag: '--force', reason: 'operator override of evidence-floor refusal', severity: 'error' },
    ];

    const result = deriveAssuranceRecord(gates, acResults, { gateBypasses });

    // Pre-T2 this evaluated to today's real deriveAssuranceRecord(gates,
    // acResults) result (the third argument was inert), which was 'strong'
    // -- the bug. Post-T2: an error-severity bypass caps overall at 'mixed',
    // never 'strong', regardless of how strong the underlying gates/evidence
    // would otherwise grade.
    expect(result.overall).toBe('mixed');
  });

  it('283-01/AC-2: a deepVerify pass:false verdict from a non-mock provider excludes that AC from strongRatio without altering acResults[].pass', () => {
    const gates: GateProvenance[] = [{ gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' }];

    // Three ACs: two at the strongest evidence classes (as independently
    // recorded coverage/verification evidence -- e.g. from real test
    // execution), one weak. A real (non-mock) deep-verify pass has since
    // objected to both of the strong ones with pass: false -- a real
    // verifier failure that settle recorded acResults[].pass: true over
    // (e.g. via --force), matching the phase Objective's exact scenario.
    // AC-3 (evidence 'mention', no deepVerify entry) exists to keep the
    // denominator non-zero -- and this scenario's assertion discriminating
    // -- under EITHER a numerator-only exclusion reading (strongCount drops
    // to 0 of 3) or a numerator-and-denominator reading (0 of 1, AC-3 alone);
    // both land on 'mixed' here, so this test doesn't silently pass today
    // for the wrong shape of exclusion T2 might pick.
    const ac1 = ac('AC-1', 'ai-verified');
    const ac2 = ac('AC-2', 'executed');
    const ac3 = ac('AC-3', 'mention');
    const acResults = [ac1, ac2, ac3];
    expect(ac1.pass).toBe(true);
    expect(ac2.pass).toBe(true);

    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: false, reason: 'verifier objected: does not satisfy the AC', provider: 'anthropic' },
      'AC-2': { pass: false, reason: 'verifier objected: does not satisfy the AC', provider: 'anthropic' },
    };

    const result = deriveAssuranceRecord(gates, acResults, { deepVerify });

    // Pre-T2 the third argument was inert -- deriveAssuranceRecord only ever
    // read acResults[].evidence, never deepVerify, so both objected-to ACs
    // still fully counted toward strongRatio's numerator (2/3 = 0.667 >=
    // 0.5, with a real verifier present) -- 'strong'. The bug: a real
    // verifier's objection was invisible to the grade.
    // Post-T2: both AC-1 and AC-2 are excluded from strongRatio because of
    // their failing non-mock deepVerify verdicts (whether by shrinking only
    // the numerator to 0/3, or both numerator and denominator to 0/1 -- this
    // scenario's arithmetic lands on 'mixed' either way, since a real
    // verifier is still present), landing on 'mixed'.
    expect(result.overall).toBe('mixed');

    // acResults[].pass must NOT have been altered by this -- the real settle
    // outcome (a --force-recorded pass) stays recorded as-is; only how the
    // AC contributes to the derived grade changes.
    expect(ac1.pass).toBe(true);
    expect(ac2.pass).toBe(true);
  });
});

/**
 * Phase 283 (283-01, T2) — negative cases for AC-1/AC-2, flagged by the
 * independent reviewer of T1 as real test-discrimination gaps (not T1
 * defects): T1 only proved the positive direction of each rule (an
 * error-severity bypass DOES cap; a real deepVerify failure DOES exclude).
 * These prove the rules don't over-fire on the adjacent shape that must NOT
 * trigger them.
 */
describe('deriveAssuranceRecord bypass-aware grading negative cases (phase 283-01, T2)', () => {
  it("283-01/AC-1: a gateBypasses array with ONLY warn-severity entries does not cap overall -- a settle that would otherwise grade 'strong' still grades 'strong'", () => {
    // Identical textbook-'strong' shape to the AC-1 positive test above.
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const acResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'executed')];

    // gateBypasses is non-empty, but every entry is warn-severity -- D-S's
    // cap requires at least one error-severity entry, so this must NOT cap.
    const gateBypasses: GateBypass[] = [
      { gate: 'coherence-check', flag: '--allow-boundary-scan-failure', reason: 'known noisy scan', severity: 'warn' },
    ];

    const result = deriveAssuranceRecord(gates, acResults, { gateBypasses });
    expect(result.overall).toBe('strong');
  });

  it("283-01/AC-2: a deepVerify pass:false verdict from provider: 'mock' does not exclude that AC from strongRatio -- mock failures are not real verification failures", () => {
    // Identical textbook-'strong' shape to the AC-1/AC-2 positive tests
    // above, so exclusion (if it wrongly fired) would be visible as a drop
    // from 'strong' to 'mixed'.
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const ac1 = ac('AC-1', 'ai-verified');
    const ac2 = ac('AC-2', 'executed');
    const acResults = [ac1, ac2];

    // A mock-provider deepVerify entry objects to AC-1 -- D-R's exclusion
    // requires a non-mock provider, so this must NOT exclude AC-1.
    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: false, reason: 'mock placeholder verdict', provider: 'mock' },
    };

    const result = deriveAssuranceRecord(gates, acResults, { deepVerify });
    expect(result.overall).toBe('strong');
    expect(ac1.pass).toBe(true);
  });
});

/**
 * Phase 283 (283-01, T2) — AC-3: proves "clean settles are byte-identical to
 * pre-change output" against the literal, machine-captured T1 fixture
 * (`__fixtures__/assurance-record-clean-settle.json`), not just "looks
 * unchanged." Runs every fixture scenario's `input` through the real post-T2
 * `deriveAssuranceRecord` three ways -- third argument omitted entirely,
 * passed as `{}`, and passed as an explicit-but-clean
 * `{ gateBypasses: [], deepVerify: {} }` -- and asserts each reproduces that
 * scenario's recorded `output`. Checked two ways: Vitest's `toEqual` (deep
 * structural equality, so a genuinely different value is caught even if the
 * failure message is easier to read) AND a literal `JSON.stringify`
 * string-equality check (`toBe`), which is the actual byte-for-byte proof
 * AC-3's wording asks for — `toEqual` alone would tolerate a key-order
 * difference that `JSON.stringify`/`toBe` would not.
 */
describe('deriveAssuranceRecord clean-settle backward compatibility (phase 283-01, T2, AC-3)', () => {
  const fixture = JSON.parse(
    readFileSync(join(FIXTURES_DIR, 'assurance-record-clean-settle.json'), 'utf8'),
  ) as {
    scenarios: Array<{
      name: string;
      input: { gates: GateProvenance[]; acResults: AssuranceAcResult[] };
      output: unknown;
    }>;
  };

  it('283-01/AC-3: every clean-settle fixture scenario reproduces its recorded pre-change output byte-for-byte, with the third argument omitted, {}, and explicitly-clean', () => {
    expect(fixture.scenarios.length).toBeGreaterThan(0);

    for (const scenario of fixture.scenarios) {
      const { gates, acResults } = scenario.input;
      const expectedJson = JSON.stringify(scenario.output);

      const omitted = deriveAssuranceRecord(gates, acResults);
      const emptyObject = deriveAssuranceRecord(gates, acResults, {});
      const explicitlyClean = deriveAssuranceRecord(gates, acResults, { gateBypasses: [], deepVerify: {} });

      expect(omitted, `scenario "${scenario.name}" (third arg omitted)`).toEqual(scenario.output);
      expect(emptyObject, `scenario "${scenario.name}" (third arg {})`).toEqual(scenario.output);
      expect(explicitlyClean, `scenario "${scenario.name}" (third arg explicitly clean)`).toEqual(scenario.output);

      // Byte-for-byte, literally: JSON.stringify + toBe catches a key-order
      // difference that toEqual's structural equality would silently accept.
      expect(JSON.stringify(omitted), `scenario "${scenario.name}" (omitted, stringified)`).toBe(expectedJson);
      expect(JSON.stringify(emptyObject), `scenario "${scenario.name}" ({}, stringified)`).toBe(expectedJson);
      expect(JSON.stringify(explicitlyClean), `scenario "${scenario.name}" (explicitly clean, stringified)`).toBe(
        expectedJson,
      );
    }
  });
});

/**
 * Phase 283 (283-01, T2) — AC-4: proves `deriveAssuranceRecord`'s new
 * bypass-handling code path (D-S's cap) never reads `gateBypasses[].gate`.
 * The phase-233 gate-agnostic tripwire above proves the pre-existing `gates`
 * argument is gate-agnostic; this is the equivalent proof for the new third
 * argument. Two `gateBypasses` entries that differ ONLY in `.gate` (one
 * nonsense/unregistered gate name, one different nonsense/unregistered gate
 * name) must produce byte-identical results, driven by `severity` alone.
 */
describe('deriveAssuranceRecord bypass cap is gate-agnostic (phase 283-01, T2, AC-4)', () => {
  it('283-01/AC-4: the error-severity cap never reads gateBypasses[].gate -- results are identical across entries whose .gate differs (including nonsense/unregistered names), driven by severity alone', () => {
    // Textbook-'strong' shape absent any bypass, so the cap (if it fires) is
    // visible as a drop to 'mixed'.
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const acResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'executed')];

    const bypassesWithGateA: GateBypass[] = [
      { gate: 'totally-not-a-real-registered-gate-name', flag: '--force', reason: 'x', severity: 'error' },
    ];
    const bypassesWithGateB: GateBypass[] = [
      { gate: '', flag: '--force', reason: 'x', severity: 'error' },
    ];
    const bypassesWithGateC: GateBypass[] = [
      { gate: 'build-test-must-pass', flag: '--force', reason: 'x', severity: 'error' },
    ];

    const resultA = deriveAssuranceRecord(gates, acResults, { gateBypasses: bypassesWithGateA });
    const resultB = deriveAssuranceRecord(gates, acResults, { gateBypasses: bypassesWithGateB });
    const resultC = deriveAssuranceRecord(gates, acResults, { gateBypasses: bypassesWithGateC });

    // All three .gate values are different (one nonsense, one empty, one a
    // real registered gate name) -- if the cap read .gate at all, at least
    // one of these could plausibly diverge. It doesn't: severity alone
    // drives the outcome.
    expect(resultA).toEqual(resultB);
    expect(resultB).toEqual(resultC);
    expect(resultA.overall).toBe('mixed');
  });
});

/**
 * Phase 283 (283-01, T3) — an independent reviewer's finding on T2's AC-2
 * test above: that test's own comment admits its arithmetic (2 objected + 1
 * weak AC) lands on 'mixed' under EITHER reading of D-R's exclusion --
 * numerator-only (the actually-implemented rule, per this file's doc
 * comment: "that AC is excluded from strongRatio's numerator") or a wrong
 * numerator-AND-denominator reading. Deferred to T3 as "cheaper now than
 * after T3 wires the real call site" -- a real gap, not a T2 defect. This
 * test picks a scenario where the two readings diverge, so a regression to
 * the wrong (denominator-shrinking) reading would actually fail here.
 */
describe('deriveAssuranceRecord D-R exclusion touches only strongCount\'s numerator, not totalAcs (phase 283-01, T3 gap fix)', () => {
  it("283-01/AC-2: two real-provider-objected ai-verified ACs are excluded from strongRatio's numerator only -- 1/4 = 0.25 -> 'mixed', discriminating against a wrong numerator-and-denominator reading that would give 1/2 = 0.5 -> 'strong'", () => {
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];

    // 4 ACs total (totalAcs = 4), deliberately NOT 3 like the T1 AC-2 test
    // above -- with 3 ACs (2 objected + 1 weak) both readings of D-R
    // coincidentally land on 'mixed'. With 4 (2 objected ai-verified + 1
    // clean ai-verified + 1 mention), the two readings diverge:
    //  - numerator-only (correct): strongCount = 1 (AC-3 alone; AC-1/AC-2
    //    excluded by their real-provider pass:false verdicts, AC-4 never
    //    qualified since 'mention' isn't a strong evidence class in the
    //    first place), totalAcs stays 4 -> 1/4 = 0.25.
    //  - numerator-and-denominator (wrong): AC-1/AC-2 would also be dropped
    //    from the denominator -> totalAcs effectively 2 (AC-3, AC-4) ->
    //    1/2 = 0.5.
    const ac1 = ac('AC-1', 'ai-verified');
    const ac2 = ac('AC-2', 'ai-verified');
    const ac3 = ac('AC-3', 'ai-verified');
    const ac4 = ac('AC-4', 'mention');
    const acResults = [ac1, ac2, ac3, ac4];

    const deepVerify: Record<string, DeepVerdict> = {
      'AC-1': { pass: false, reason: 'verifier objected: does not satisfy the AC', provider: 'anthropic' },
      'AC-2': { pass: false, reason: 'verifier objected: does not satisfy the AC', provider: 'anthropic' },
    };

    const result = deriveAssuranceRecord(gates, acResults, { deepVerify });

    // 0.25 < 0.5 -> fails the 'strong' bar (hasRealVerifier && strongRatio
    // >= 0.5) even with a real verifier present, landing on 'mixed' via the
    // hasRealVerifier||strongRatio>0 branch. 0.5 (the wrong reading) would
    // instead have cleared the 'strong' bar exactly -- that is the failure
    // this test exists to catch if the exclusion ever regresses to touch
    // the denominator.
    expect(result.overall).toBe('mixed');

    // acResults[].pass is untouched by any of this -- D-R never flips it,
    // exactly as the existing T1/T2 tests above already establish.
    expect(ac1.pass).toBe(true);
    expect(ac2.pass).toBe(true);
  });
});

/**
 * Phase 287 (287-01) -- D-Z: closes the gap between phase 263 (gates learned
 * to tag `providerSelection:'empty-diff'` when a real provider's diff was
 * empty and it structurally could not judge anything) and this file's
 * `hasRealVerifier` (which only ever read `provider`/`model`, never
 * `providerSelection`). AC-J3 of HANDOFF-verifier-honesty-verify-premises.md
 * proved by direct fixture call that a settle whose only non-mock signal was
 * `empty-diff` could still grade `'strong'`.
 */
describe('deriveAssuranceRecord excludes empty-diff-only gates from hasRealVerifier (phase 287-01, D-Z)', () => {
  it("287-01/AC-1: a settle whose every non-mock gate is providerSelection:'empty-diff' does not earn 'strong', even with strong AC evidence", () => {
    const gates: GateProvenance[] = [
      { gate: 'security-audit', status: 'ran', provider: 'host-cli', model: 'claude-x', providerSelection: 'empty-diff' },
      { gate: 'code-review', status: 'ran', provider: 'host-cli', model: 'claude-x', providerSelection: 'empty-diff' },
    ];
    const acResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'ai-verified')];

    const result = deriveAssuranceRecord(gates, acResults);
    // Exact value, not just "not strong": hasRealVerifier is false (both
    // gates empty-diff) but strongRatio is 1.0 (>0), so this lands on
    // 'mixed' via the hasRealVerifier||strongRatio>0 branch, same as any
    // other all-mock-with-strong-evidence shape.
    expect(result.overall).toBe('mixed');
  });

  it("287-01/AC-2: a mixed set -- one 'empty-diff' gate plus one genuinely 'configured' non-mock gate -- still reaches 'strong' on the configured gate's evidence", () => {
    const gates: GateProvenance[] = [
      { gate: 'security-audit', status: 'ran', provider: 'host-cli', model: 'claude-x', providerSelection: 'empty-diff' },
      { gate: 'code-review', status: 'ran', provider: 'host-cli', model: 'claude-x', providerSelection: 'configured' },
    ];
    const acResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'ai-verified')];

    const result = deriveAssuranceRecord(gates, acResults);
    expect(result.overall).toBe('strong');
  });

  it("287-01/AC-2: an untagged (pre-phase-263) non-mock gate alongside an 'empty-diff' gate still counts as real -- providerSelection is optional, absence is not empty-diff", () => {
    const gates: GateProvenance[] = [
      { gate: 'security-audit', status: 'ran', provider: 'host-cli', model: 'claude-x', providerSelection: 'empty-diff' },
      { gate: 'code-review', status: 'ran', provider: 'host-cli', model: 'claude-x' },
    ];
    const acResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'ai-verified')];

    const result = deriveAssuranceRecord(gates, acResults);
    expect(result.overall).toBe('strong');
  });

  it("287-01/AC-1: verifierRollup and hasAnyVerifier stay untouched -- the empty-diff gate still shows up in the persisted rollup (report-never-rewrite), only the local 'strong' predicate changes", () => {
    const gates: GateProvenance[] = [
      { gate: 'security-audit', status: 'ran', provider: 'host-cli', model: 'claude-x', providerSelection: 'empty-diff' },
    ];
    const acResults = [ac('AC-1', 'unverified')];

    const result = deriveAssuranceRecord(gates, acResults);
    expect(result.verifierRollup).toEqual([{ provider: 'host-cli', model: 'claude-x', gateCount: 1 }]);
    // hasAnyVerifier must stay true (verifierRollup is non-empty) -- an
    // empty-diff-only settle with zero AC evidence lands at 'weak', not
    // 'unverified' (which requires hasAnyVerifier to be false too).
    expect(result.overall).toBe('weak');
  });

  it('287-01/AC-3: gate provenance carrying no providerSelection field anywhere is byte-identical to the pre-287 baseline (captured before this phase touched assurance-record.ts)', () => {
    const gates: GateProvenance[] = [
      { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
      { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
    ];
    const acResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'executed')];

    const result = deriveAssuranceRecord(gates, acResults);

    // Baseline captured 2026-08-21 against the unmodified phase-233/283 code
    // (same fixture shape as the phase-233 T2 AC-2 test above, which remains
    // untouched and passing as an independent corroboration).
    expect(JSON.stringify(result)).toBe(
      JSON.stringify({
        verifierRollup: [{ provider: 'anthropic', model: 'claude-x', gateCount: 2 }],
        evidenceTally: { 'ai-verified': 1, executed: 1, assertion: 0, mention: 0, unverified: 0 },
        overall: 'strong',
      }),
    );
  });

  it("287-01/AC-4: the empty-diff exclusion never reads gates[].gate -- results are identical across entries whose .gate differs (including a nonsense/unregistered name), driven by providerSelection alone (mirrors 283-01/AC-4's gate-agnostic proof)", () => {
    const acResults = [ac('AC-1', 'ai-verified'), ac('AC-2', 'ai-verified')];

    const emptyDiffGatesA: GateProvenance[] = [
      { gate: 'security-audit', status: 'ran', provider: 'host-cli', model: 'claude-x', providerSelection: 'empty-diff' },
    ];
    const emptyDiffGatesB: GateProvenance[] = [
      { gate: 'totally-not-a-real-registered-gate-name', status: 'ran', provider: 'host-cli', model: 'claude-x', providerSelection: 'empty-diff' },
    ];

    const resultA = deriveAssuranceRecord(emptyDiffGatesA, acResults);
    const resultB = deriveAssuranceRecord(emptyDiffGatesB, acResults);

    // Different .gate values (one real registered gate name, one nonsense)
    // -- if the exclusion read .gate at all, these could plausibly diverge.
    // They don't: providerSelection alone drives the outcome.
    expect(resultA).toEqual(resultB);
    expect(resultA.overall).toBe('mixed');
  });
});

// Phase 287 (287-01) -- AC-5 (read-only corpus sweep: does this phase's fix
// change any historical grade?) has its asserting test added directly to the
// PRE-EXISTING `tests/gates/assurance-record-corpus.test.ts` (phase
// 283-01/AC-5), not a new test here. That file already re-derives `overall` for every
// `.cadence/phases/**/*-SUMMARY.json` record with the live `deriveAssuranceRecord`
// and diffs against each record's own persisted grade, checking every drift
// found against a committed whitelist (`283-01-ASSURANCE-DRIFT-REPORT.md`) --
// a strictly stronger proof than a tag-presence sweep would be, and this
// phase originally added a redundant, weaker duplicate of that walk here
// (removed; see the DRAFT's As-built note). Re-run independently with this
// phase's fix applied: `pnpm --filter @thomas-powers-jr/cadence-core test --
// assurance-record-corpus` -- 6/6 pass, 0 new drift beyond the existing
// whitelist (consistent with the corpus's 0 `providerSelection:'empty-diff'`
// tally measured directly in Phase J's investigation).
