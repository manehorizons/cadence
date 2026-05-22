import type {
  IntelligenceAuditFinding,
  IntelligenceAuditReport,
} from './store.js';

const SECTION_HEADERS: Record<IntelligenceAuditFinding['kind'], string> = {
  'broken-assumption-link': 'Broken Assumption Links',
  'broken-decision-link': 'Broken Decision Links',
  'broken-evidence-link': 'Broken Evidence Links',
  'orphan-assumption': 'Orphan Assumptions',
  'orphan-decision': 'Orphan Decisions',
  'orphan-evidence': 'Orphan Evidence',
};

const SECTION_ORDER: IntelligenceAuditFinding['kind'][] = [
  'broken-assumption-link',
  'broken-decision-link',
  'broken-evidence-link',
  'orphan-assumption',
  'orphan-decision',
  'orphan-evidence',
];

function renderFindingLine(f: IntelligenceAuditFinding): string {
  switch (f.kind) {
    case 'broken-assumption-link':
      return `- ${f.recId} references missing assumption: ${f.assumptionId}`;
    case 'broken-decision-link':
      return `- ${f.recId} references missing decision: ${f.decisionId}`;
    case 'broken-evidence-link':
      return `- ${f.recId} references missing evidence: ${f.evidenceId}`;
    case 'orphan-assumption':
      return `- ${f.assumptionId} references missing rec: ${f.missingRecId}`;
    case 'orphan-decision':
      return `- ${f.decisionId} references missing rec: ${f.missingRecId}`;
    case 'orphan-evidence':
      return `- ${f.evidenceId} references missing rec: ${f.missingRecId}`;
  }
}

export function renderIntelligenceAudit(report: IntelligenceAuditReport): string {
  if (report.findings.length === 0) {
    return 'Audit clean: no integrity issues.\n';
  }
  const lines: string[] = [];
  lines.push('# CADENCE Intelligence Audit');
  lines.push('');
  lines.push(`Found ${report.findings.length} integrity issue(s):`);
  lines.push('');

  for (const kind of SECTION_ORDER) {
    const items = report.byKind[kind];
    if (items.length === 0) continue;
    lines.push(`## ${SECTION_HEADERS[kind]} (${items.length})`);
    lines.push('');
    for (const f of items) lines.push(renderFindingLine(f));
    lines.push('');
  }

  lines.push('## Remediation');
  lines.push('');
  lines.push(
    '- For broken rec→subject links: run `cadence intelligence reconcile` to re-derive link arrays from current subject ledgers.',
  );
  lines.push(
    '- For orphan subjects: manually inspect; either restore the missing recommendation or remove/re-tag the subject. `reconcile` does NOT auto-remove orphans (operator decision).',
  );
  lines.push('');

  return lines.join('\n');
}
