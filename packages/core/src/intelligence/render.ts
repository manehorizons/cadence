import type { EvidenceLedger, RecommendationLedger } from '@cadence/types';

export function renderRecommendationsMd(
  ledger: RecommendationLedger,
  evidenceLedger: EvidenceLedger,
): string {
  const lines: string[] = [
    '# CADENCE Recommendations',
    '',
    '> Generated from `.cadence/intelligence/recommendations.json`.',
    '',
  ];

  if (ledger.recommendations.length === 0) {
    lines.push('No recommendations recorded.', '');
    return lines.join('\n');
  }

  for (const rec of ledger.recommendations) {
    const evidence = evidenceLedger.evidence.filter((ev) => rec.evidenceIds.includes(ev.id));

    lines.push(`## ${rec.id} — ${rec.title}`);
    lines.push('');
    lines.push(`- status: ${rec.status}`);
    lines.push(`- ready: ${rec.readiness}`);
    lines.push(`- priority: ${rec.priority}`);
    lines.push(`- leverage: ${rec.leverageScore}/10`);
    lines.push(`- risk: ${rec.riskScore}/10`);
    lines.push(`- confidence: ${Math.round(rec.confidence * 100)}%`);
    lines.push(`- decay: ${rec.decayState}`);
    if (rec.affectedAreas.length > 0) lines.push(`- areas: ${rec.affectedAreas.join(', ')}`);
    if (rec.affectedFiles.length > 0) lines.push(`- files: ${rec.affectedFiles.join(', ')}`);
    for (const ev of evidence) lines.push(`- evidence: ${ev.summary}`);
    if (rec.suggestedBackendAction) lines.push(`- next: ${rec.suggestedBackendAction}`);
    lines.push('');
    lines.push(rec.summary);
    lines.push('');
  }

  return lines.join('\n');
}
