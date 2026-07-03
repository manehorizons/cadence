import type {
  IntelligenceMilestone,
  MilestoneLedger,
  MilestonePreMortem,
} from '@manehorizons/cadence-types';

const PM_SECTIONS = [
  ['likelyFailureModes', 'likely failure modes', '_(why might this fail?)_'],
  ['hiddenDependencies', 'hidden dependencies', '_(what must already be true?)_'],
  ['driftRisks', 'drift risks', '_(what docs/specs will drift?)_'],
  ['outOfScope', 'out of scope', '_(what is explicitly NOT in this milestone?)_'],
] as const satisfies ReadonlyArray<[keyof MilestonePreMortem, string, string]>;

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
  for (const [key, label, prompt] of PM_SECTIONS) {
    lines.push(`  - ${label}:`);
    const entries = m.preMortem[key];
    if (entries.length === 0) {
      lines.push(`    - ${prompt}`);
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
  else
    for (const m of closed) {
      lines.push(`- ${m.id} — ${m.name}${m.closedRef ? ` (ref: ${m.closedRef})` : ''}`);
    }
  lines.push('');

  return lines.join('\n');
}
