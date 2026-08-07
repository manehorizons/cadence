import type { Finding, Summary } from '@thomas-powers-jr/cadence-types';
import { redactSecrets } from '../security/redact.js';

/**
 * Phase 257 (257-01, AC-1): shared findings-rendering helper for both
 * Markdown summary renderers (`parse/summary-writer.ts`'s on-disk
 * `<id>-SUMMARY.md` sidecar and `services/summary-render.ts`'s
 * `cadence summary render`). Persisted `codeReview`/`securityAudit`
 * findings on `SummaryZ` were previously JSON-only — a refused settle or a
 * pasted PR summary gave no visibility into the finding that caused the
 * refusal without opening the raw `.json` record. This module is a single
 * pure function both renderers splice into the same shared position (after
 * `## Tasks`, before their respective gates heading) so the finding content
 * and its grouping/ordering rules live in exactly one place.
 *
 * `message` is passed through `redactSecrets` at render time regardless of
 * finding kind: `security-audit` findings are already redacted upstream
 * (`gates/security-audit.ts`) before they ever reach `SummaryZ`, so
 * re-redacting is a harmless no-op there, but `code-review` findings are
 * NOT redacted upstream — this is the only point that ever renders them to
 * a human-facing surface, so it is the enforcement point for that kind.
 */

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Stable sort by severity (critical > high > medium > low), tie-broken by
 *  `id` (codepoint order) when both sides have one. When either side lacks
 *  an `id` the comparator returns 0 — `Array.prototype.sort` is spec-guaranteed
 *  stable, so those entries fall back to their original array order. */
function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    if (a.id !== undefined && b.id !== undefined) {
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    }
    return 0;
  });
}

function renderFindingLine(f: Finding): string {
  let line = `- ${f.severity.toUpperCase()}: ${redactSecrets(f.message)}`;
  if (f.line !== undefined) line += ` (line ${f.line})`;

  const meta: string[] = [];
  if (f.id !== undefined) meta.push(`id: ${f.id}`);
  if (f.target !== undefined) meta.push(`target: ${f.target}`);
  if (f.anchor !== undefined) {
    const refPart = f.anchor.ref !== undefined ? `, ref=${f.anchor.ref}` : '';
    meta.push(`anchor: kind=${f.anchor.kind}${refPart}, tier=${f.anchor.tier}`);
  }
  if (f.disposition !== undefined) meta.push(`disposition: ${f.disposition}`);
  if (f.waiver !== undefined) meta.push(`waiver-expiry: ${f.waiver.expiry}`);

  if (meta.length > 0) line += ` [${meta.join('; ')}]`;
  return line;
}

/**
 * Renders the shared `## Findings` section for a `Summary`, or `[]` when
 * there is nothing to render (`codeReview` absent/`{}`/all-empty-arrays AND
 * `securityAudit` absent/`[]`) — the heading itself is omitted in that case
 * so historical summaries with no findings stay byte-identical.
 */
export function renderFindingsSection(summary: Summary): string[] {
  const codeReviewEntries = Object.entries(summary.codeReview ?? {}).filter(
    ([, findings]) => findings.length > 0,
  );
  const securityAuditFindings = summary.securityAudit ?? [];

  if (codeReviewEntries.length === 0 && securityAuditFindings.length === 0) {
    return [];
  }

  const lines: string[] = ['', '## Findings', ''];

  if (codeReviewEntries.length > 0) {
    lines.push('### Code review', '');
    // codepoint order over file paths
    const sortedFiles = codeReviewEntries.map(([file]) => file).sort();
    for (const file of sortedFiles) {
      const findings = summary.codeReview?.[file] ?? [];
      lines.push(`#### ${file}`, '');
      for (const f of sortFindings(findings)) {
        lines.push(renderFindingLine(f));
      }
      lines.push('');
    }
  }

  if (securityAuditFindings.length > 0) {
    lines.push('### Security audit', '');
    for (const f of sortFindings(securityAuditFindings)) {
      lines.push(renderFindingLine(f));
    }
    lines.push('');
  }

  // Trim the single trailing blank line this function always leaves behind
  // (each subsection above pushes a closing '') so the caller can splice
  // this array in without producing a double-blank-line seam.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}
