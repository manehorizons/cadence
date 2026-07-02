import type { Summary } from '@manehorizons/cadence-types';

export function renderSummaryMd(s: Summary): string {
  const lines: string[] = [
    `# SETTLE Summary — ${s.draftId}`,
    '',
    `**Completed:** ${s.completedAt}`,
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
  lines.push('');
  return lines.join('\n');
}
