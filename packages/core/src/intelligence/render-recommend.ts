import type { RecommendationReport } from '@manehorizons/cadence-types';

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
    lines.push('No actionable recommendations.');
  } else {
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
