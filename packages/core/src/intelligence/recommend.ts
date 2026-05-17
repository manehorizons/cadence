import type { Recommendation, ScoreTerm } from '@cadence/types';

const STATUS_PTS: Record<Recommendation['status'], number> = {
  candidate: 0,
  accepted: 6,
  deferred: 0,
  rejected: 0,
  converted: 0,
};
const READINESS_PTS: Record<Recommendation['readiness'], number> = {
  'raw-idea': 0,
  'needs-evidence': 1,
  'needs-decision': 2,
  'ready-for-milestone': 7,
  'ready-for-cadence-spec': 10,
  blocked: -12,
};
const DECAY_PTS: Record<Recommendation['decayState'], number> = {
  fresh: 4,
  aging: 1,
  stale: -6,
  'needs-revalidation': -5,
  superseded: 0,
  contradicted: 0,
};
const PRIORITY_PTS: Record<Recommendation['priority'], number> = {
  low: 0,
  medium: 2,
  high: 5,
  critical: 8,
};
// Tight bounds given Zod field constraints: leverageScore/riskScore ∈ [0,10], confidence ∈ [0,1].
// Update both when a status/readiness/decay/priority enum value is added with pts outside this range.
const SCORE_MIN = -23;
const SCORE_MAX = 44;

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type ScoreResult = { raw: number; score: number; terms: ScoreTerm[] };

export function scoreRecommendation(rec: Recommendation): ScoreResult {
  const lev = rec.leverageScore * 1.0;
  const conf = rec.confidence * 10 * 0.6;
  const risk = rec.riskScore * 0.5;
  const statusPts = STATUS_PTS[rec.status];
  const readinessPts = READINESS_PTS[rec.readiness];
  const decayPts = DECAY_PTS[rec.decayState];
  const priorityPts = PRIORITY_PTS[rec.priority];

  const raw = r1(
    lev + conf - risk + statusPts + readinessPts + decayPts + priorityPts,
  );
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(((raw - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100),
    ),
  );
  const terms: ScoreTerm[] = [
    { label: `lev ${rec.leverageScore}`, value: r1(lev) },
    { label: `conf ${rec.confidence.toFixed(2)}`, value: r1(conf) },
    { label: `risk ${rec.riskScore}`, value: r1(-risk) },
    { label: `status ${rec.status}`, value: statusPts },
    { label: `ready ${rec.readiness}`, value: readinessPts },
    { label: `decay ${rec.decayState}`, value: decayPts },
    { label: `prio ${rec.priority}`, value: priorityPts },
  ];
  return { raw, score, terms };
}
