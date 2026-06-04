import type { IntelligenceStats } from './store/stats.js';

export type RenderIntelligenceStatsOptions = {
  byRec?: boolean;
};

const REC_STATUS_ORDER = [
  'candidate',
  'accepted',
  'deferred',
  'rejected',
  'converted',
] as const;
const REC_READINESS_ORDER = [
  'raw-idea',
  'needs-evidence',
  'needs-decision',
  'ready-for-milestone',
  'ready-for-cadence-spec',
  'blocked',
] as const;
const EV_KIND_ORDER = ['file', 'command', 'cadence-artifact', 'note'] as const;
const AS_STATUS_ORDER = ['open', 'validated', 'rejected'] as const;
const DEC_STATUS_ORDER = ['active', 'superseded', 'rescinded'] as const;

function truncTitle(s: string, n = 40): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

export function renderIntelligenceStats(
  stats: IntelligenceStats,
  options: RenderIntelligenceStatsOptions = {},
): string {
  if (options.byRec) return renderByRec(stats);
  return renderAggregate(stats);
}

function renderAggregate(stats: IntelligenceStats): string {
  const lines: string[] = [];
  lines.push('# CADENCE Intelligence Stats');
  lines.push('');

  lines.push(`## Recommendations (${stats.recommendations.total})`);
  lines.push('');
  lines.push(
    `- by status: ${REC_STATUS_ORDER.map((s) => `${s} ${stats.recommendations.byStatus[s]}`).join(', ')}`,
  );
  lines.push(
    `- by readiness: ${REC_READINESS_ORDER.map((r) => `${r} ${stats.recommendations.byReadiness[r]}`).join(', ')}`,
  );
  lines.push('');

  lines.push(`## Evidence (${stats.evidence.total})`);
  lines.push('');
  lines.push(
    `- by kind: ${EV_KIND_ORDER.map((k) => `${k} ${stats.evidence.byKind[k]}`).join(', ')}`,
  );
  lines.push('');

  lines.push(`## Assumptions (${stats.assumptions.total})`);
  lines.push('');
  lines.push(
    `- by status: ${AS_STATUS_ORDER.map((s) => `${s} ${stats.assumptions.byStatus[s]}`).join(', ')}`,
  );
  lines.push('');

  lines.push(`## Decisions (${stats.decisions.total})`);
  lines.push('');
  lines.push(
    `- by status: ${DEC_STATUS_ORDER.map((s) => `${s} ${stats.decisions.byStatus[s]}`).join(', ')}`,
  );
  lines.push(`- untied: ${stats.decisions.untied}`);
  lines.push('');

  lines.push('## Links');
  lines.push('');
  lines.push(`- broken assumption links: ${stats.links.brokenAssumptionLinks}`);
  lines.push(`- broken decision links: ${stats.links.brokenDecisionLinks}`);
  lines.push(`- broken evidence links: ${stats.links.brokenEvidenceLinks}`);
  lines.push('');

  return lines.join('\n');
}

function renderByRec(stats: IntelligenceStats): string {
  const lines: string[] = [];
  lines.push('# CADENCE Intelligence Stats — Per Rec');
  lines.push('');
  if (stats.perRec.length === 0) {
    lines.push('_(no recommendations)_');
    lines.push('');
    return lines.join('\n');
  }
  lines.push(
    '| Rec | Status | Open | Validated | Rejected | Active | Superseded | Rescinded | Evidence |',
  );
  lines.push(
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const r of stats.perRec) {
    lines.push(
      `| ${r.id} — ${truncTitle(r.title)} | ${r.status} | ${r.assumptionsByStatus.open} | ${r.assumptionsByStatus.validated} | ${r.assumptionsByStatus.rejected} | ${r.decisionsByStatus.active} | ${r.decisionsByStatus.superseded} | ${r.decisionsByStatus.rescinded} | ${r.evidenceCount} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
