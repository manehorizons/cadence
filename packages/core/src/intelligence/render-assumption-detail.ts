import type { Assumption, Recommendation } from '@thomas-powers-jr/cadence-types';

export function renderAssumptionDetail(
  as: Assumption,
  rec?: Recommendation,
): string {
  const lines: string[] = [];
  lines.push(`# ${as.id} — ${as.text}`);
  lines.push('');
  lines.push(`- status: ${as.status}`);
  if (rec) {
    lines.push(`- recommendation: ${rec.id} — ${rec.title}`);
  } else if (as.recommendationId) {
    lines.push(`- recommendation: ${as.recommendationId} (rec not found)`);
  }
  lines.push(`- recorded: ${as.createdAt}`);
  lines.push('');
  return lines.join('\n');
}
