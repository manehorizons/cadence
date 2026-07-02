import type { AcEvidence, DeepVerdict } from '@manehorizons/cadence-types';
import type { AcId, TestRef } from '../verify/coverage.js';

/**
 * Phase 140: strongest evidence backing an AC's PASS verdict, ranked
 * ai-verified > executed > assertion > mention > unverified. Pure — reads
 * only the coverage scan, coverage mode, whether build-test-must-pass
 * actually executed the suite this settle (`buildTestRan`), and any
 * deep-verify verdicts.
 *
 * A mock-provider deep-verify pass does NOT count as ai-verified (v1.25
 * mock-honesty precedent: mock is a placeholder, not real verification) —
 * it falls through to whatever test-coverage evidence applies.
 */
export function deriveAcEvidence(
  acId: string,
  coverage: Map<AcId, TestRef[]>,
  coverageMode: 'mention' | 'assertion',
  buildTestRan: boolean,
  deepVerify: Record<string, DeepVerdict> | undefined,
): AcEvidence {
  const verdict = deepVerify?.[acId];
  if (verdict?.pass === true && verdict.provider !== 'mock') {
    return 'ai-verified';
  }

  const refs = coverage.get(acId) ?? [];
  if (refs.length === 0) {
    return 'unverified';
  }

  if (coverageMode === 'assertion') {
    const qualifying = refs.some((r) => r.qualifying === true);
    if (qualifying) {
      return buildTestRan ? 'executed' : 'assertion';
    }
    return 'mention';
  }

  return 'mention';
}
