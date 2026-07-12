import type { RetroDigest } from '@manehorizons/cadence-types';

// deja:new distinct renderer for RetroDigest (settle friction digest), not the SUMMARY renderer — intentionally mirrors renderSummaryMd's section-per-field Markdown shape (phase 174 T3)
export function renderRetroMd(digest: RetroDigest): string {
  // Presence isn't enough: `codeReview`/`securityAudit` can be present-but-empty
  // on a clean settle (see `services/retro.ts`'s `buildRetroDigest` comment) —
  // duplicated here rather than imported since parse/ is a dependency of
  // services/, not the reverse.
  const codeReviewEmpty =
    !digest.findings.codeReview || Object.keys(digest.findings.codeReview).length === 0;
  const securityAuditEmpty =
    !digest.findings.securityAudit || digest.findings.securityAudit.length === 0;
  const boundaryScanEmpty =
    !digest.findings.boundaryScan || digest.findings.boundaryScan.offenders.length === 0;
  const empty =
    digest.bypasses.length === 0 &&
    digest.roughTasks.length === 0 &&
    codeReviewEmpty &&
    securityAuditEmpty &&
    boundaryScanEmpty;

  const lines: string[] = ['# Retro', ''];

  if (empty) {
    lines.push('No friction detected this settle.', '');
    return lines.join('\n');
  }

  if (digest.bypasses.length > 0) {
    lines.push('## Gate bypasses', '');
    for (const b of digest.bypasses) {
      lines.push(`- ${b.severity.toUpperCase()} ${b.gate} via ${b.flag}: ${b.reason}`);
    }
    lines.push('');
  }

  if (digest.roughTasks.length > 0) {
    lines.push('## Rough tasks', '');
    for (const t of digest.roughTasks) {
      lines.push(`- ${t.id}: ${t.status}${t.notes ? ` — ${t.notes}` : ''}`);
    }
    lines.push('');
  }

  if (digest.findings.codeReview) {
    lines.push('## Code review findings', '');
    for (const [file, findings] of Object.entries(digest.findings.codeReview)) {
      for (const f of findings) {
        lines.push(`- ${file}: ${f.severity.toUpperCase()} — ${f.message}${f.line ? ` (line ${f.line})` : ''}`);
      }
    }
    lines.push('');
  }

  if (digest.findings.securityAudit) {
    lines.push('## Security audit findings', '');
    for (const f of digest.findings.securityAudit) {
      lines.push(`- ${f.severity.toUpperCase()} — ${f.message}${f.line ? ` (line ${f.line})` : ''}`);
    }
    lines.push('');
  }

  if (digest.findings.boundaryScan) {
    lines.push('## Boundary scan offenders', '');
    for (const o of digest.findings.boundaryScan.offenders) {
      lines.push(`- ${o}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
