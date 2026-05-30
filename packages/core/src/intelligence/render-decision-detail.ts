import type {
  IntelligenceDecision,
  IntelligenceDecisionLedger,
  Recommendation,
} from '@manehorizons/cadence-types';

export function renderDecisionDetail(
  dec: IntelligenceDecision,
  rec?: Recommendation,
  decLedger?: IntelligenceDecisionLedger,
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
  if (dec.supersededBy) {
    const exists = decLedger?.decisions.some((x) => x.id === dec.supersededBy) ?? true;
    const suffix = exists ? '' : ' (not found)';
    lines.push(`- superseded-by: ${dec.supersededBy}${suffix}`);
  }
  if (dec.supersedes.length > 0) {
    const parts = dec.supersedes.map((id) => {
      const exists = decLedger?.decisions.some((x) => x.id === id) ?? true;
      return exists ? id : `${id} (not found)`;
    });
    lines.push(`- supersedes: ${parts.join(', ')}`);
  }
  lines.push('');
  lines.push(dec.rationale);
  lines.push('');
  return lines.join('\n');
}
