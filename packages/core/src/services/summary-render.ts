import type { Summary } from '@manehorizons/cadence-types';

// deja:new distinct renderer for `cadence summary render` (phase 202, T1) —
// intentionally NOT the same renderer as `parse/summary-writer.ts`'s
// `renderSummaryMd`, which is settle's on-disk `<id>-SUMMARY.md` sidecar and
// has a different contract: its Decisions/Deferred/Skill-audit sections
// always print (even empty, as `_(none)_`), and it never surfaces a refused
// gate's `reason`. This renderer targets a reviewer pasting into a PR
// description — every empty section is omitted entirely and a refusal's
// reason is shown, since that's the one gate outcome a reviewer most needs
// to notice.

/** Render a validated `Summary` as deterministic, pasteable Markdown for `cadence summary render`. */
export function renderSummaryForReview(s: Summary): string {
  const lines: string[] = [
    `# CADENCE Summary — ${s.draftId}`,
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
    lines.push('', '## Gates', '');
    for (const g of s.gates) {
      const detail = g.status === 'skipped' ? g.skipReason : g.status === 'refused' ? g.reason : undefined;
      lines.push(`- ${g.gate}: ${g.status}${detail ? ` — ${detail}` : ''}`);
    }
  }

  if (s.gateBypasses && s.gateBypasses.length > 0) {
    lines.push('', '## Gate bypasses', '');
    for (const b of s.gateBypasses) {
      lines.push(`- ${b.severity.toUpperCase()} ${b.gate} via ${b.flag}: ${b.reason}`);
    }
  }

  if (s.decisions.length > 0) {
    lines.push('', '## Decisions', '');
    for (const d of s.decisions) {
      lines.push(`- ${d.id} (${d.phase}): ${d.title}`);
    }
  }

  if (s.deferred.length > 0) {
    lines.push('', '## Deferred', '');
    for (const d of s.deferred) {
      lines.push(`- ${d.id} (from ${d.from}): ${d.title}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
