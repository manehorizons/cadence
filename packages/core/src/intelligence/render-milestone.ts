import type {
  IntelligenceMilestone,
  MilestoneLedger,
} from '@cadence/types';

const PROMPTS: Record<keyof IntelligenceMilestone['preMortem'], string> = {
  likelyFailureModes: '_(why might this fail?)_',
  hiddenDependencies: '_(what must already be true?)_',
  driftRisks: '_(what docs/specs will drift?)_',
  outOfScope: '_(what is explicitly NOT in this milestone?)_',
};
const PM_ORDER: Array<[keyof IntelligenceMilestone['preMortem'], string]> = [
  ['likelyFailureModes', 'likely failure modes'],
  ['hiddenDependencies', 'hidden dependencies'],
  ['driftRisks', 'drift risks'],
  ['outOfScope', 'out of scope'],
];

function byId(a: IntelligenceMilestone, b: IntelligenceMilestone): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function detailBlock(m: IntelligenceMilestone, lines: string[]): void {
  lines.push(`### ${m.id} — ${m.name}`);
  lines.push('');
  lines.push(`- objective: ${m.objective}`);
  lines.push(`- status: ${m.status}`);
  lines.push(`- recommendations: ${m.recommendationIds.join(', ')}`);
  lines.push('- pre-mortem:');
  for (const [key, label] of PM_ORDER) {
    lines.push(`  - ${label}:`);
    const entries = m.preMortem[key];
    if (entries.length === 0) {
      lines.push(`    - ${PROMPTS[key]}`);
    } else {
      for (const e of entries) lines.push(`    - ${e}`);
    }
  }
  lines.push('');
}

export function renderMilestonesMd(ledger: MilestoneLedger): string {
  const lines: string[] = [
    '# CADENCE Milestone Candidates',
    '',
    '> Generated from `.cadence/intelligence/milestones.json`.',
    '',
  ];
  const pick = (s: IntelligenceMilestone['status']) =>
    ledger.milestones.filter((m) => m.status === s).sort(byId);

  // detail sections
  for (const [title, status] of [
    ['## Proposed', 'proposed'],
    ['## Accepted', 'accepted'],
  ] as const) {
    lines.push(title, '');
    const ms = pick(status);
    if (ms.length === 0) lines.push('None.', '');
    else for (const m of ms) detailBlock(m, lines);
  }

  // one-liner sections
  lines.push('## Deferred', '');
  const deferred = pick('deferred');
  if (deferred.length === 0) lines.push('None.');
  else for (const m of deferred) lines.push(`- ${m.id} — ${m.name}`);
  lines.push('');

  lines.push('## Exported', '');
  const exported = pick('exported');
  if (exported.length === 0) lines.push('None.');
  else
    for (const m of exported) {
      const paths = m.exportTargets.map((t) => t.artifactPath).join(', ');
      lines.push(`- ${m.id} — ${m.name}${paths ? ` → ${paths}` : ''}`);
    }
  lines.push('');

  lines.push('## Closed', '');
  const closed = pick('closed');
  if (closed.length === 0) lines.push('None.');
  else for (const m of closed) lines.push(`- ${m.id} — ${m.name}`);
  lines.push('');

  return lines.join('\n');
}
