import type { IntelligenceDecision, IntelligenceDecisionLedger } from '@thomas-powers-jr/cadence-types';

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

  const active     = ledger.decisions.filter((d) => d.status === 'active');
  const superseded = ledger.decisions.filter((d) => d.status === 'superseded');
  const rescinded  = ledger.decisions.filter((d) => d.status === 'rescinded');

  const SECTIONS: Array<[string, IntelligenceDecision[]]> = [
    ['## Active',     active],
    ['## Superseded', superseded],
    ['## Rescinded',  rescinded],
  ];

  for (const [header, items] of SECTIONS) {
    lines.push(header, '');
    if (items.length === 0) {
      lines.push('_(none)_');
      lines.push('');
      continue;
    }
    for (const d of items) {
      lines.push(`### ${d.id} — ${d.title}`);
      lines.push('');
      if (d.recommendationId) lines.push(`- recommendation: ${d.recommendationId}`);
      lines.push(`- decided: ${d.decidedAt}`);
      if (d.supersededBy) {
        const exists = ledger.decisions.some((x) => x.id === d.supersededBy);
        const suffix = exists ? '' : ' (not found)';
        lines.push(`- superseded-by: ${d.supersededBy}${suffix}`);
      }
      lines.push('');
      lines.push(d.rationale);
      lines.push('');
    }
  }
  return lines.join('\n');
}
