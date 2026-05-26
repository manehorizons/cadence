import type {
  Assumption,
  Evidence,
  IntelligenceDecision,
  Recommendation,
} from '@cadence/types';

export type RenderRecommendationDetailOptions = {
  openAssumptionsOnly?: boolean;
  activeDecisionsOnly?: boolean;
};

export function renderRecommendationDetail(
  rec: Recommendation,
  evidence: Evidence[],
  assumptions: Assumption[],
  decisions: IntelligenceDecision[],
  options: RenderRecommendationDetailOptions = {},
): string {
  const lines: string[] = [];

  // Header + envelope bullets
  lines.push(`# ${rec.id} — ${rec.title}`);
  lines.push('');
  lines.push(`- status: ${rec.status}`);
  if (rec.convertedToPhaseId !== undefined) {
    // Slice 34.1: render-time field only; no disk check (drift is the audit dim's job).
    lines.push(`- converted-to-phase: ${rec.convertedToPhaseId}`);
  }
  lines.push(`- ready: ${rec.readiness}`);
  lines.push(`- priority: ${rec.priority}`);
  lines.push(`- leverage: ${rec.leverageScore}/10`);
  lines.push(`- risk: ${rec.riskScore}/10`);
  lines.push(`- confidence: ${Math.round(rec.confidence * 100)}%`);
  lines.push(`- decay: ${rec.decayState}`);
  lines.push(`- created: ${rec.createdAt}`);
  lines.push(`- updated: ${rec.updatedAt}`);
  if (rec.affectedAreas.length > 0) lines.push(`- areas: ${rec.affectedAreas.join(', ')}`);
  if (rec.affectedFiles.length > 0) lines.push(`- files: ${rec.affectedFiles.join(', ')}`);
  if (rec.suggestedBackendAction) lines.push(`- next: ${rec.suggestedBackendAction}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(rec.summary);
  lines.push('');

  // Assumptions
  const totalAs = assumptions.length;
  const shownAs = options.openAssumptionsOnly
    ? assumptions.filter((a) => a.status === 'open')
    : assumptions;
  lines.push(`## Assumptions (${shownAs.length}/${totalAs})`);
  lines.push('');
  if (shownAs.length === 0) {
    lines.push('_(none)_');
    lines.push('');
  } else {
    for (const a of shownAs) {
      lines.push(`### ${a.id} — ${a.text}`);
      lines.push('');
      lines.push(`- status: ${a.status}`);
      lines.push(`- recorded: ${a.createdAt}`);
      lines.push('');
    }
  }

  // Decisions
  const totalDec = decisions.length;
  const shownDec = options.activeDecisionsOnly
    ? decisions.filter((d) => d.status === 'active')
    : decisions;
  lines.push(`## Decisions (${shownDec.length}/${totalDec})`);
  lines.push('');
  if (shownDec.length === 0) {
    lines.push('_(none)_');
    lines.push('');
  } else {
    for (const d of shownDec) {
      lines.push(`### ${d.id} — ${d.title}`);
      lines.push('');
      lines.push(`- status: ${d.status}`);
      lines.push(`- decided: ${d.decidedAt}`);
      lines.push('');
      lines.push(d.rationale);
      lines.push('');
    }
  }

  // Evidence
  lines.push(`## Evidence (${evidence.length})`);
  lines.push('');
  if (evidence.length === 0) {
    lines.push('_(none)_');
    lines.push('');
  } else {
    for (const ev of evidence) {
      let line = `- ${ev.kind}: ${ev.summary}`;
      if (ev.kind === 'file' && ev.path) line += ` (${ev.path})`;
      if (ev.kind === 'command' && ev.command) line += ` \`${ev.command}\``;
      lines.push(line);
    }
    lines.push('');
  }

  return lines.join('\n');
}
