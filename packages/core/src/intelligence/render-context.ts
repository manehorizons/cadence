import type { ContextPacket } from '@thomas-powers-jr/cadence-types';

export function renderContextMd(packet: ContextPacket): string {
  const lines: string[] = [
    `# CADENCE Context Packet — ${packet.scope}`,
    '',
    `> Generated from \`.cadence/intelligence/context/${packet.scope}.json\` (read-only).`,
    '',
    `Generated at: ${packet.generatedAt}`,
    '',
    '## Loop',
    '',
  ];

  if (!packet.loop.present) {
    lines.push('- no CADENCE backend detected (ledger-only packet)');
  } else {
    lines.push(`- position: ${packet.loop.loopPosition ?? '—'}`);
    lines.push(
      `- active: phase ${packet.loop.activePhase ?? '—'} · draft ${packet.loop.activeDraft ?? '—'} · spec ${packet.loop.activeSpec ?? '—'} · tier ${packet.loop.tier ?? '—'}`,
    );
    if (packet.scope !== 'agent' && packet.loop.nextAction)
      lines.push(`- next action: ${packet.loop.nextAction}`);
    if (packet.scope !== 'agent' && packet.loop.stateError)
      lines.push(`- state error: ${packet.loop.stateError}`);
  }
  lines.push('');

  lines.push('## Recommendations', '');
  if (packet.recommendations.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const r of packet.recommendations) {
      lines.push(`### ${r.id} — ${r.title}`);
      lines.push('');
      lines.push(
        `- score: ${r.score}/100 · status: ${r.status} · ready: ${r.readiness} · priority: ${r.priority}`,
      );
      if (r.suggestedBackendAction) lines.push(`- next: ${r.suggestedBackendAction}`);
      lines.push('');
    }
  }

  lines.push('## Open Assumptions', '');
  if (packet.assumptions.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const a of packet.assumptions) {
      lines.push(`- ${a.id} (${a.recommendationId}): ${a.text}`);
    }
  }
  lines.push('');

  lines.push('## Decisions', '');
  if (packet.decisions.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const d of packet.decisions) {
      const tie = d.recommendationId ? ` [${d.recommendationId}]` : '';
      lines.push(`- ${d.id}${tie}: ${d.title} — ${d.rationale}`);
    }
  }
  lines.push('');

  lines.push('## Relevant Files', '');
  if (packet.files.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const f of packet.files) {
      lines.push(`- \`${f.path}\` — ${f.why}`);
    }
  }
  lines.push('');

  if (packet.scope === 'review') {
    lines.push('## Needs Attention', '');
    const attn = packet.needsAttention ?? [];
    if (attn.length === 0) {
      lines.push('_(none)_');
    } else {
      for (const r of attn) {
        lines.push(`### ${r.id} — ${r.title}`);
        lines.push('');
        lines.push(
          `- score: ${r.score}/100 · status: ${r.status} · ready: ${r.readiness} · priority: ${r.priority}`,
        );
        if (r.suggestedBackendAction) lines.push(`- next: ${r.suggestedBackendAction}`);
        lines.push('');
      }
    }
    lines.push('');
  }

  lines.push('## Totals', '');
  lines.push(
    `- recommendations ${packet.totals.recommendations} (${packet.totals.recommendationsOmitted} omitted) · assumptions ${packet.totals.assumptions} · decisions ${packet.totals.decisions} · files ${packet.totals.files}`,
  );
  lines.push('');

  return lines.join('\n');
}
