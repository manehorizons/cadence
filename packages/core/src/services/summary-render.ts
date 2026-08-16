import type { Summary } from '@thomas-powers-jr/cadence-types';
import { renderFindingsSection } from '../parse/findings-render.js';
import { formatUnobservableNote } from './ac-observability-label.js';
import { formatVerifierRollupLabel } from './verifier-label.js';

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
    const unobservableNote = formatUnobservableNote(s.deepVerify?.[ac.id]);
    if (unobservableNote) lines.push(unobservableNote);
  }

  lines.push('', '## Tasks', '');
  for (const t of s.taskResults) {
    lines.push(`- ${t.id}: ${t.status}${t.notes ? ` — ${t.notes}` : ''}`);
  }

  lines.push(...renderFindingsSection(s));

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

  if (s.assurance) {
    lines.push('', '## Assurance', '');
    lines.push(`- overall: ${s.assurance.overall}`);
    if (s.gateBypasses && s.gateBypasses.length > 0) {
      const hasError = s.gateBypasses.some((b) => b.severity === 'error');
      lines.push(
        `- bypassed: ${s.gateBypasses.length} gate(s) (severity: ${hasError ? 'error' : 'warn'})`,
      );
    }
    const tally = s.assurance.evidenceTally;
    lines.push(
      `- evidence tally: ai-verified=${tally['ai-verified']}, executed=${tally.executed}, assertion=${tally.assertion}, mention=${tally.mention}, unverified=${tally.unverified}`,
    );
    if (s.assurance.verifierRollup.length > 0) {
      for (const v of s.assurance.verifierRollup) {
        const matchingGates = (s.gates ?? []).filter(
          (g) => g.provider === v.provider && g.model === v.model,
        );
        lines.push(`- verifier: ${formatVerifierRollupLabel(v, matchingGates)}`);
      }
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
