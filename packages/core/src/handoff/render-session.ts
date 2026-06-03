// packages/core/src/handoff/render-session.ts
import type { ContextPacket, GitFacts } from '@manehorizons/cadence-types';

export interface SessionRenderInput {
  generatedAt: string;
  label: string | null;
  packet: ContextPacket;
  git: GitFacts;
  contextPacketPath: string;
}

function fm(input: SessionRenderInput): string {
  const { packet, git } = input;
  const loop = packet.loop;
  const lines = [
    '---',
    'cadence_handoff: 1',
    `generated_at: ${input.generatedAt}`,
    `label: ${input.label ?? ''}`,
    `loop_position: ${loop.loopPosition ?? 'IDLE'}`,
    `active_phase: ${loop.activePhase ?? ''}`,
    `active_draft: ${loop.activeDraft ?? ''}`,
    `tier: ${loop.tier ?? ''}`,
    `git_branch: ${git.available ? git.branch : 'unavailable'}`,
    `git_dirty: ${git.available ? String(git.dirty) : 'unavailable'}`,
    `git_head: ${git.available ? git.head : 'unavailable'}`,
    `git_ahead: ${git.available ? String(git.ahead) : '0'}`,
    `git_behind: ${git.available ? String(git.behind) : '0'}`,
    `context_packet: ${input.contextPacketPath}`,
    '---',
  ];
  return lines.join('\n');
}

function gitBlock(git: GitFacts): string {
  if (!git.available) return '- git: unavailable (not a git repo or git not found)';
  const dirty = git.dirty ? 'dirty' : 'clean';
  const out = [
    `- Branch \`${git.branch}\` (${dirty}), ${git.ahead} ahead / ${git.behind} behind origin`,
    `- HEAD \`${git.head}\``,
  ];
  if (git.recentCommits) out.push('- Recent commits:', '```', git.recentCommits, '```');
  if (git.diffStat) out.push('- Uncommitted (diff --stat):', '```', git.diffStat, '```');
  return out.join('\n');
}

function contextBlock(packet: ContextPacket): string {
  const recs = packet.recommendations.length
    ? packet.recommendations.map((r) => `  - ${r.id} — ${r.title} (${r.status}/${r.readiness})`).join('\n')
    : '  - (none)';
  const asn = packet.assumptions.length
    ? packet.assumptions.map((a) => `  - ${a.id} — ${a.text}`).join('\n')
    : '  - (none)';
  const dec = packet.decisions.length
    ? packet.decisions.map((d) => `  - ${d.id} — ${d.title}`).join('\n')
    : '  - (none)';
  const files = packet.files.length
    ? packet.files.map((f) => `  - \`${f.path}\` — ${f.why}`).join('\n')
    : '  - (none)';
  return [
    `- Top recommendations:\n${recs}`,
    `- Open assumptions:\n${asn}`,
    `- Active decisions:\n${dec}`,
    `- Files in play:\n${files}`,
  ].join('\n');
}

export function renderSession(input: SessionRenderInput): string {
  const { packet, git, label } = input;
  const date = input.generatedAt.slice(0, 10);
  const title = label ? `# Session Handoff — ${date} (${label})` : `# Session Handoff — ${date}`;
  const loop = packet.loop;
  return [
    fm(input),
    '',
    title,
    '',
    '## TL;DR for the next session',
    '<!-- 4–6 bullets: where things stand, the single next action, blockers. FILL IN. -->',
    '',
    "## State on handoff   ·  pre-filled — verify, don't retype",
    gitBlock(git),
    `- Loop: ${loop.loopPosition ?? 'IDLE'} · phase ${loop.activePhase ?? '(none)'} · tier ${loop.tier ?? '(none)'}`,
    '',
    '## CADENCE context   ·  pre-filled from `cadence context handoff`',
    contextBlock(packet),
    '',
    '## What landed this session',
    '<!-- FILL IN -->',
    '',
    '## Carry-forward gotchas',
    '<!-- FILL IN -->',
    '',
    '## Next action',
    '<!-- FILL IN -->',
    '',
  ].join('\n');
}
