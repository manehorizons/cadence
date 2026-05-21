import type { AssumptionLedger } from '@cadence/types';

export function renderAssumptionsMd(ledger: AssumptionLedger): string {
  const lines: string[] = [
    '# CADENCE Assumptions',
    '',
    '> Generated from `.cadence/intelligence/assumptions.json`.',
    '',
  ];
  if (ledger.assumptions.length === 0) {
    lines.push('No assumptions recorded.', '');
    return lines.join('\n');
  }
  for (const a of ledger.assumptions) {
    lines.push(`## ${a.id} — ${a.text}`);
    lines.push('');
    lines.push(`- recommendation: ${a.recommendationId}`);
    lines.push(`- status: ${a.status}`);
    lines.push(`- recorded: ${a.createdAt}`);
    lines.push('');
  }
  return lines.join('\n');
}
