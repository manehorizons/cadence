import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RecommendationReportZ } from '@manehorizons/cadence-types';
import type {
  BackendStatus,
  Recommendation,
  RecommendationAdvisory,
  RecommendationRank,
  RecommendationReport,
  ScoreTerm,
} from '@manehorizons/cadence-types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { intelligenceDir } from './store/paths.js';
import { readRecommendationLedger } from './store/io.js';
import { cadenceBackend } from './backend/cadence.js';
import { renderRecommendMd } from './render-recommend.js';

const STATUS_PTS: Record<Recommendation['status'], number> = {
  candidate: 0,
  accepted: 6,
  deferred: 0,
  rejected: 0,
  converted: 0,
  // Phase 100: shipped recs are excluded from ranking (partitionLedger), so this
  // weight is never consulted; present only to satisfy the exhaustive Record.
  shipped: 0,
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

export type Partition = {
  ranked: Recommendation[];
  parked: Recommendation[];
  needsAttention: Recommendation[];
  excludedCount: number;
};

export function partitionLedger(recs: Recommendation[]): Partition {
  const ranked: Recommendation[] = [];
  const parked: Recommendation[] = [];
  const needsAttention: Recommendation[] = [];
  let excludedCount = 0;
  for (const rec of recs) {
    if (
      rec.status === 'rejected' ||
      rec.status === 'converted' ||
      rec.status === 'shipped'
    ) {
      excludedCount += 1;
    } else if (
      rec.decayState === 'superseded' ||
      rec.decayState === 'contradicted'
    ) {
      needsAttention.push(rec);
    } else if (rec.status === 'deferred') {
      parked.push(rec);
    } else {
      ranked.push(rec);
    }
  }
  return { ranked, parked, needsAttention, excludedCount };
}

function resolvedAction(rec: Recommendation): string {
  return rec.suggestedBackendAction ?? 'cadence milestone propose';
}

export function buildAdvisory(
  topRanked: Recommendation | null,
  backend: BackendStatus,
  counts: { needsAttention: number },
): RecommendationAdvisory {
  const inFlight =
    backend.present === true &&
    backend.loopPosition !== undefined &&
    backend.loopPosition !== 'IDLE' &&
    (Boolean(backend.activeDraft) || Boolean(backend.activeSpec));

  if (inFlight) {
    const legal = backend.legalActions[0];
    const advisory: RecommendationAdvisory = {
      kind: 'finish-loop',
      primary: `Finish in-flight CADENCE loop work first${
        legal ? ` — ${legal}` : ''
      }.`,
    };
    if (topRanked) advisory.secondary = resolvedAction(topRanked);
    return advisory;
  }

  if (topRanked) {
    if (topRanked.readiness === 'ready-for-cadence-spec') {
      return { kind: 'spec-new', primary: 'cadence spec new' };
    }
    return { kind: 'top-recommendation', primary: resolvedAction(topRanked) };
  }

  let primary =
    'No actionable recommendations — add one with `cadence recommendation add`.';
  if (counts.needsAttention > 0) {
    primary += ` ${counts.needsAttention} recommendation(s) need revalidation (\`cadence inspect\`).`;
  }
  return { kind: 'empty', primary };
}

export function synthesizeRecommendation(
  recs: Recommendation[],
  backend: BackendStatus,
  now: Date = new Date(),
  filter: { scoutId?: string } = {},
): RecommendationReport {
  // Phase 61: when a scoutId filter is set, scope the whole report to that
  // cluster before partition so totals reflect the scoped set.
  const scoped = filter.scoutId
    ? recs.filter((r) => r.scoutId === filter.scoutId)
    : recs;
  const { ranked, parked, needsAttention, excludedCount } =
    partitionLedger(scoped);

  const scored = ranked
    .map((rec) => ({ rec, ...scoreRecommendation(rec) }))
    .sort((a, b) => {
      if (b.raw !== a.raw) return b.raw - a.raw;
      if (a.rec.createdAt !== b.rec.createdAt) {
        return a.rec.createdAt < b.rec.createdAt ? -1 : 1;
      }
      return a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0;
    });

  const rankedOut: RecommendationRank[] = scored.map((s) => {
    const rank: RecommendationRank = {
      id: s.rec.id,
      title: s.rec.title,
      raw: s.raw,
      score: s.score,
      status: s.rec.status,
      readiness: s.rec.readiness,
      priority: s.rec.priority,
      decayState: s.rec.decayState,
      terms: s.terms,
    };
    if (s.rec.suggestedBackendAction) {
      rank.suggestedBackendAction = s.rec.suggestedBackendAction;
    }
    if (s.rec.scoutId) {
      rank.scoutId = s.rec.scoutId;
    }
    return rank;
  });

  const [first] = scored;
  const advisory = buildAdvisory(first ? first.rec : null, backend, {
    needsAttention: needsAttention.length,
  });

  return RecommendationReportZ.parse({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    ranked: rankedOut,
    parked: parked.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      readiness: r.readiness,
    })),
    needsAttention: needsAttention.map((r) => ({
      id: r.id,
      title: r.title,
      decayState: r.decayState,
    })),
    advisory,
    totals: {
      total: scoped.length,
      ranked: rankedOut.length,
      parked: parked.length,
      needsAttention: needsAttention.length,
      excluded: excludedCount,
    },
  });
}

export async function runRecommend(
  root: string,
  now: Date = new Date(),
  filter: { scoutId?: string } = {},
): Promise<RecommendationReport> {
  const ledger = await readRecommendationLedger(root);
  const backend = await cadenceBackend.readStatus(root);
  const report = synthesizeRecommendation(
    ledger.recommendations,
    backend,
    now,
    filter,
  );

  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  await atomicWriteJSON(join(dir, 'recommend.json'), report);
  await atomicWriteText(join(dir, 'RECOMMEND.md'), renderRecommendMd(report));
  return report;
}
