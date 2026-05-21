import type { IntelligenceDecisionLedger } from '@cadence/types';

export function renderDecisionsMd(ledger: IntelligenceDecisionLedger): string {
  const lines: string[] = [
    '# CADENCE Decisions',
    '',
    '> Generated from `.cadence/intelligence/decisions.json`.',
    '',
  ];
  if (ledger.decisions.length === 0) {
    lines.push('No decisions recorded.', '');
    return lines.join('\n');
  }
  for (const d of ledger.decisions) {
    lines.push(`## ${d.id} — ${d.title}`);
    lines.push('');
    if (d.recommendationId) lines.push(`- recommendation: ${d.recommendationId}`);
    lines.push(`- decided: ${d.decidedAt}`);
    lines.push('');
    lines.push(d.rationale);
    lines.push('');
  }
  return lines.join('\n');
}
