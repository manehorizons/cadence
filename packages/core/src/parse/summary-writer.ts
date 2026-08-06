import type { Summary } from '@thomas-powers-jr/cadence-types';
import { renderFindingsSection } from './findings-render.js';

export function renderSummaryMd(s: Summary): string {
  const lines: string[] = [
    `# SETTLE Summary — ${s.draftId}`,
    '',
    `**Completed:** ${s.completedAt}`,
    ...(s.contentHash
      ? [`**Content hash (${s.contentHash.algorithm}):** ${s.contentHash.value}`]
      : []),
    '',
    '## Acceptance Criteria',
    '',
  ];
  for (const ac of s.acResults) {
    const badge = ac.pass ? 'PASS' : 'FAIL';
    const evidenceTag = ac.evidence ? ` (${ac.evidence})` : '';
    lines.push(`- ${ac.id}: ${badge}${evidenceTag}${ac.note ? ` — ${ac.note}` : ''}`);
  }
  lines.push('', '## Tasks', '');
  for (const t of s.taskResults) {
    lines.push(`- ${t.id}: ${t.status}${t.notes ? ` — ${t.notes}` : ''}`);
  }
  lines.push(...renderFindingsSection(s));
  if (s.gates && s.gates.length > 0) {
    lines.push('', '## Gate provenance', '');
    for (const g of s.gates) {
      lines.push(`- ${g.gate}: ${g.status}${g.skipReason ? ` — ${g.skipReason}` : ''}`);
    }
    const tokensKnown =
      s.deepVerifyMeta?.inputTokens !== undefined || s.deepVerifyMeta?.outputTokens !== undefined;
    if (tokensKnown) {
      const inTok = s.deepVerifyMeta?.inputTokens ?? 0;
      const outTok = s.deepVerifyMeta?.outputTokens ?? 0;
      lines.push(`  tokens: ${inTok} in / ${outTok} out`);
    }
  }
  if (s.gateBypasses && s.gateBypasses.length > 0) {
    lines.push('', '## Gate bypasses', '');
    for (const b of s.gateBypasses) {
      lines.push(`- ${b.severity.toUpperCase()} ${b.gate} via ${b.flag}: ${b.reason}`);
    }
  }
  if (s.assurance) {
    lines.push('', '## Assurance', '');
    lines.push(`- overall: ${s.assurance.overall}`);
    const tally = s.assurance.evidenceTally;
    lines.push(
      `- evidence tally: ai-verified=${tally['ai-verified']}, executed=${tally.executed}, assertion=${tally.assertion}, mention=${tally.mention}, unverified=${tally.unverified}`,
    );
    for (const v of s.assurance.verifierRollup) {
      lines.push(`- verifier: ${v.provider}${v.model ? ` ${v.model}` : ''} (${v.gateCount} gate(s))`);
    }
  }
  lines.push('', '## Decisions', '');
  if (s.decisions.length === 0) lines.push('_(none)_');
  for (const d of s.decisions) {
    lines.push(`- ${d.id} (${d.phase}): ${d.title}`);
  }
  lines.push('', '## Deferred', '');
  if (s.deferred.length === 0) lines.push('_(none)_');
  for (const d of s.deferred) {
    lines.push(`- ${d.id} (from ${d.from}): ${d.title}`);
  }
  lines.push('', '## Skill audit', '');
  const required = new Set(s.skillAudit.required);
  const invoked = new Set(s.skillAudit.invoked);
  for (const r of required) {
    lines.push(`- ${r}: ${invoked.has(r) ? 'invoked' : 'NOT INVOKED'}`);
  }
  if (required.size === 0) lines.push('_(none)_');
  if (s.stateAtSettle) {
    lines.push('', '## State at settle', '');
    lines.push(`- loop position before settle: ${s.stateAtSettle.loopPositionBeforeSettle}`);
    lines.push(`- revision: ${s.stateAtSettle.revision}`);
    lines.push(`- session subagent spawns: ${s.stateAtSettle.sessionSubagentSpawns}`);
  }
  lines.push('');
  return lines.join('\n');
}
