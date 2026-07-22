import type { RecommendationReport } from '@manehorizons/cadence-types';

/**
 * Phase 207 T3 (AC-3): the `## Ranked` section's empty-result copy. Two
 * genuinely different cases, distinguished by `totals.total`:
 *
 * 1. Nothing exists at all (`totals.total === 0`) — the ledger has zero
 *    recommendations, full stop.
 * 2. Something exists but nothing is actionable (`totals.total > 0`,
 *    `ranked.length === 0`) — every recommendation landed in `parked`
 *    (deferred), `needsAttention` (superseded/contradicted), or the
 *    unnamed `excluded` count (rejected/converted/shipped/settle-pending)
 *    instead of the live/scoreable partition `partitionLedger` (
 *    `intelligence/recommend.ts`) computes — there is no separate numeric
 *    score cutoff in this codebase, so "actionable" *is* partition
 *    membership.
 *
 * For case 2, names the nearest miss and its exact unblocking command.
 * `report.parked`/`report.needsAttention` are the only excluded buckets the
 * report itemizes with an id — a status-excluded rec (rejected/converted/
 * shipped/settle-pending) is only ever surfaced as a count, so it can't be
 * named here. This deliberately does not call the shared
 * `findNearestCandidates` (`intelligence/nearest-candidate.ts`, phase 207
 * T1): that helper ranks *within* `partitionLedger`'s `ranked` bucket
 * (recs that already cleared this exact partition test), so by
 * construction it has nothing to find when `ranked` itself is empty — the
 * premise of case 2. Nor does the report carry the score inputs
 * (leverageScore/confidence/riskScore/decayState/priority) `parked`/
 * `needsAttention` entries would need to be ranked against each other, so
 * the first entry in each (ledger order) is named rather than a re-derived
 * ranking — a second scoring implementation is exactly what this phase's
 * DRAFT boundaries forbid.
 */
function renderEmptyRankedLines(report: RecommendationReport): string[] {
  const { totals, parked, needsAttention } = report;

  if (totals.total === 0) {
    return [
      'No recommendations exist yet.',
      '- precondition: the ledger has zero recommendations.',
      '- fix: `cadence recommendation add` to create one, or `cadence scout` to generate candidates.',
    ];
  }

  const lines = [
    'No actionable recommendations.',
    `- precondition: ${totals.total} recommendation(s) exist, but none are in the live/scoreable partition` +
      ` — ${totals.parked} parked (deferred), ${totals.needsAttention} flagged needs-attention,` +
      ` ${totals.excluded} excluded (rejected/converted/shipped/settle-pending).`,
  ];

  const nearestParked = parked[0];
  const nearestAttention = needsAttention[0];
  if (nearestParked) {
    lines.push(
      `- nearest: ${nearestParked.id} — ${nearestParked.title} (deferred, ready: ${nearestParked.readiness})`,
      `- unblock: \`cadence recommendation promote ${nearestParked.id} --status=candidate\``,
    );
  } else if (nearestAttention) {
    lines.push(
      `- nearest: ${nearestAttention.id} — ${nearestAttention.title} (decay: ${nearestAttention.decayState})`,
      '- unblock: `cadence inspect` to review and revalidate it before it can rank again',
    );
  } else {
    lines.push(
      '- no nameable near-miss in this report — the rest are rejected/converted/shipped/settle-pending;' +
        ' run `cadence recommendation list` to review the full ledger.',
    );
  }
  return lines;
}

export function renderRecommendMd(report: RecommendationReport): string {
  const lines: string[] = [
    '# CADENCE Recommended Next Moves',
    '',
    '> Generated from `.cadence/intelligence/recommend.json`.',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    '## Advisory',
    '',
    `- ${report.advisory.primary}`,
  ];
  if (report.advisory.secondary) {
    lines.push(`- then: ${report.advisory.secondary}`);
  }
  lines.push('');

  lines.push('## Ranked', '');
  if (report.ranked.length === 0) {
    lines.push(...renderEmptyRankedLines(report));
  } else {
    if (report.ranked.length < report.totals.ranked) {
      lines.push(
        `(showing top ${report.ranked.length} of ${report.totals.ranked} — run \`cadence recommend\` for the full list)`,
      );
      lines.push('');
    }
    for (const r of report.ranked) {
      lines.push(`### ${r.id} — ${r.title}`);
      lines.push('');
      lines.push(`- score: ${r.score}/100 (raw ${r.raw})`);
      lines.push(
        `- status: ${r.status} · ready: ${r.readiness} · priority: ${r.priority} · decay: ${r.decayState}`,
      );
      const why = r.terms
        .map((t) => `${t.label} ${t.value >= 0 ? '+' : ''}${t.value}`)
        .join(' · ');
      lines.push(`- why: ${why} ⇒ raw ${r.raw} (score ${r.score})`);
      if (r.scoutId) {
        lines.push(`- scout: ${r.scoutId}`);
      }
      if (r.suggestedBackendAction) {
        lines.push(`- next: ${r.suggestedBackendAction}`);
      }
      lines.push('');
    }
  }

  lines.push('## Parked (deferred)', '');
  if (report.parked.length === 0) {
    lines.push('None.');
  } else {
    for (const p of report.parked) {
      lines.push(`- ${p.id} — ${p.title} (${p.status}, ${p.readiness})`);
    }
  }
  lines.push('');

  lines.push('## Needs attention (superseded / contradicted)', '');
  if (report.needsAttention.length === 0) {
    lines.push('None.');
  } else {
    for (const n of report.needsAttention) {
      lines.push(`- ${n.id} — ${n.title} (${n.decayState})`);
    }
  }
  lines.push('');

  lines.push('## Totals', '');
  lines.push(
    `- total ${report.totals.total} · ranked ${report.totals.ranked} · parked ${report.totals.parked} · needs-attention ${report.totals.needsAttention} · excluded ${report.totals.excluded}`,
  );
  lines.push('');

  return lines.join('\n');
}
