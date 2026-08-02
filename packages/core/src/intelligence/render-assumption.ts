import type { Assumption, AssumptionLedger } from '@thomas-powers-jr/cadence-types';

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

  const open      = ledger.assumptions.filter((a) => a.status === 'open');
  const validated = ledger.assumptions.filter((a) => a.status === 'validated');
  const rejected  = ledger.assumptions.filter((a) => a.status === 'rejected');

  const SECTIONS: Array<[string, Assumption[]]> = [
    ['## Open',      open],
    ['## Validated', validated],
    ['## Rejected',  rejected],
  ];

  for (const [header, items] of SECTIONS) {
    lines.push(header, '');
    if (items.length === 0) {
      lines.push('_(none)_');
      lines.push('');
      continue;
    }
    for (const a of items) {
      lines.push(`### ${a.id} — ${a.text}`);
      lines.push('');
      lines.push(`- recommendation: ${a.recommendationId}`);
      lines.push(`- recorded: ${a.createdAt}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
