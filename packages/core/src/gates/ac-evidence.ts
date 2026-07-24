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

/**
 * Phase 214 (T2): numeric rank for the Phase 140 evidence ladder, strongest
 * to weakest — `ai-verified` > `executed` > `assertion` > `mention` >
 * `unverified`. Higher is stronger. Pure lookup, no I/O; the single source
 * of truth for ladder ordering that `meetsEvidenceFloor`/`checkEvidenceFloor`
 * below (and any future evidence-floor consumer) compare against.
 */
const EVIDENCE_RANK: Record<AcEvidence, number> = {
  'ai-verified': 4,
  executed: 3,
  assertion: 2,
  mention: 1,
  unverified: 0,
};

/** Phase 214 (T2): the numeric rank of `level` on the evidence ladder. */
export function rankEvidence(level: AcEvidence): number {
  return EVIDENCE_RANK[level];
}

/**
 * Phase 214 (T2): does `actual` rank at or above `floor` on the evidence
 * ladder? Equal-strength counts as meeting the floor.
 */
export function meetsEvidenceFloor(actual: AcEvidence, floor: AcEvidence): boolean {
  return rankEvidence(actual) >= rankEvidence(floor);
}

/** One AC whose evidence ranked below the configured floor. */
export interface EvidenceFloorOffender {
  readonly id: string;
  readonly actual: AcEvidence;
  readonly required: AcEvidence;
}

/** Result of the evidence-floor gate step (`checkEvidenceFloor`). */
export interface EvidenceFloorCheck {
  readonly outcome: 'pass' | 'refuse';
  readonly offenders: readonly EvidenceFloorOffender[];
  /** Present only when `outcome === 'refuse'`. */
  readonly reason?: string;
}

/**
 * Phase 214 (T2, AC-1): the evidence-floor gate step. Compares each AC's
 * already-derived `deriveAcEvidence` result against the effective
 * `gates.evidenceFloor` (`effectiveEvidenceFloor` in `./engine.js`),
 * refusing when any AC ranks below it.
 *
 * Deliberately pure and data-in rather than a `GateImpl` that re-derives
 * evidence itself: `deriveAcEvidence` needs `deepVerify` +
 * `buildTestRan`, which are only fully known after the settle gate loop
 * and `--auto` AC derivation finish (`services/settle.ts` computes the
 * `acResultsWithEvidence` shape this function consumes at that point, past
 * where a `GateImpl` sees only `SettleContext`). Names every offending AC
 * with its actual vs. required level — never a single blanket refusal — so
 * an operator can see exactly which ACs need stronger evidence.
 */
export function checkEvidenceFloor(
  results: ReadonlyArray<{ id: string; evidence?: AcEvidence }>,
  floor: AcEvidence,
): EvidenceFloorCheck {
  const offenders: EvidenceFloorOffender[] = [];
  for (const r of results) {
    const actual = r.evidence ?? 'unverified';
    if (!meetsEvidenceFloor(actual, floor)) {
      offenders.push({ id: r.id, actual, required: floor });
    }
  }
  if (offenders.length === 0) {
    return { outcome: 'pass', offenders: [] };
  }
  const detail = offenders
    .map((o) => `${o.id} is '${o.actual}', requires '${o.required}'`)
    .join('; ');
  const reason =
    `settle run refused: evidence-floor requires at least '${floor}' evidence for every AC, but ${detail}. ` +
    'Strengthen the evidence (add/execute a qualifying test, or run a real deep-verify pass) or ' +
    'apply a named, reason-required per-AC bypass, then re-settle.';
  return { outcome: 'refuse', offenders, reason };
}
