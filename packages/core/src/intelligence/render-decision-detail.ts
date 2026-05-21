import type { IntelligenceDecision, Recommendation } from '@cadence/types';

export function renderDecisionDetail(
  dec: IntelligenceDecision,
  rec?: Recommendation,
): string {
  const lines: string[] = [];
  lines.push(`# ${dec.id} — ${dec.title}`);
  lines.push('');
  lines.push(`- status: ${dec.status}`);
  if (rec) {
    lines.push(`- recommendation: ${rec.id} — ${rec.title}`);
  } else if (dec.recommendationId) {
    lines.push(`- recommendation: ${dec.recommendationId} (rec not found)`);
  }
  lines.push(`- decided: ${dec.decidedAt}`);
  lines.push('');
  lines.push(dec.rationale);
  lines.push('');
  return lines.join('\n');
}
