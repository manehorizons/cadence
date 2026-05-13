import type { KeelState } from '@keel/types';

export function renderStateMd(state: KeelState): string {
  const lines = [
    '# KEEL State',
    '',
    '> Derived view. Do not edit by hand — regenerated on every state.json write.',
    '',
    `**Project:** ${state.project.name}`,
    `**Loop position:** ${state.loopPosition}`,
    `**Active phase:** ${state.activePhase ?? '(none)'}`,
    `**Active draft:** ${state.activeDraft ?? '(none)'}`,
    `**Tier:** ${state.tier ?? '(n/a)'}`,
    '',
    '## Telemetry',
    `- Token utilization: ${(state.session.tokenUtilization * 100).toFixed(0)}%`,
    `- Subagent spawns this session: ${state.session.subagentSpawns}`,
    `- Last handoff: ${state.session.lastHandoff ?? '(none)'}`,
    '',
    '## Counts',
    `- Open drafts: ${state.openDrafts.length}`,
    `- Decisions: ${state.decisions.length}`,
    `- Deferred items: ${state.deferred.length}`,
    '',
    '## Skill audit',
    `- Required: ${state.skillAudit.required.join(', ') || '(none)'}`,
    `- Invoked: ${state.skillAudit.invoked.join(', ') || '(none)'}`,
    '',
  ];
  if (state.activeTask) {
    lines.push('## Active task', `- ID: ${state.activeTask.id}`, `- Status: ${state.activeTask.status}`, '');
  }
  return lines.join('\n');
}
