import type { Inspection } from '@cadence/types';

export function renderStrategyMd(inspection: Inspection): string {
  const { repo, backend, ledger, flags } = inspection;
  const lines: string[] = [
    '# CADENCE Strategic Status',
    '',
    '> Generated from `.cadence/intelligence/inspection.json`.',
    '',
    `Generated at: ${inspection.generatedAt}`,
    '',
    '## Repository',
    '',
  ];

  if (repo.git.available) {
    lines.push(`- branch: ${repo.git.branch ?? '(unknown)'}`);
    lines.push(`- dirty: ${repo.git.dirty ? 'yes' : 'no'}`);
    if (repo.git.ahead !== undefined || repo.git.behind !== undefined) {
      lines.push(`- vs origin/main: ahead ${repo.git.ahead ?? 0}, behind ${repo.git.behind ?? 0}`);
    }
  } else {
    lines.push('- git: not a git work tree');
  }
  if (repo.pkg.name) lines.push(`- package: ${repo.pkg.name}${repo.pkg.version ? `@${repo.pkg.version}` : ''}`);
  lines.push(`- phases on disk: ${repo.phases.count}${repo.phases.latestId ? ` (latest ${repo.phases.latestId})` : ''}`);
  const missingDocs = (['readme', 'design', 'roadmap', 'changelog'] as const).filter(
    (k) => !repo.docs[k],
  );
  lines.push(`- docs present: ${missingDocs.length === 0 ? 'all' : `missing ${missingDocs.join(', ')}`}`);
  lines.push('');

  lines.push('## CADENCE backend', '');
  if (!backend.present) {
    lines.push('- no CADENCE backend detected (degraded strategic status)');
  } else if (backend.stateError) {
    lines.push(`- state error: ${backend.stateError}`);
  } else {
    lines.push(`- loop: ${backend.loopPosition ?? '(unknown)'}`);
    lines.push(`- active phase: ${backend.activePhase ?? '(none)'}`);
    lines.push(`- active draft: ${backend.activeDraft ?? '(none)'}`);
    lines.push(`- tier: ${backend.tier ?? '(none)'}`);
    if (backend.artifacts) {
      lines.push(
        `- artifacts: phases ${backend.artifacts.phaseCount}, ROADMAP ${backend.artifacts.roadmap ? 'yes' : 'no'}, STATE ${backend.artifacts.state ? 'yes' : 'no'}, MILESTONES ${backend.artifacts.milestones ? 'yes' : 'no'}`,
      );
    }
    if (backend.legalActions.length > 0) {
      lines.push(`- next legal action: ${backend.legalActions[0]}`);
    }
  }
  lines.push('');

  lines.push('## Ledger', '');
  lines.push(`- recommendations: ${ledger.recommendations}`);
  lines.push(`- evidence records: ${ledger.evidence}`);
  const decayKeys = Object.keys(ledger.byDecay).sort();
  if (decayKeys.length > 0) {
    lines.push(`- by decay: ${decayKeys.map((k) => `${k} ${ledger.byDecay[k]}`).join(', ')}`);
  }
  lines.push('');

  lines.push('## Flags', '');
  if (flags.length === 0) {
    lines.push('No flags raised.');
  } else {
    for (const f of flags) {
      lines.push(
        `- [${f.severity}] ${f.code} — ${f.message}${f.evidence ? ` (${f.evidence})` : ''}`,
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}
