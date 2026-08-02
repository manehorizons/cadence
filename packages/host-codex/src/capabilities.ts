import type { HostCapabilities } from '@thomas-powers-jr/cadence-types';

/**
 * What the OpenAI Codex CLI environment can do, per the phase-65 spike
 * (FINDINGS §4). Codex's hook lifecycle is a near-clone of Claude Code's, so the
 * mapped event set matches; the meaningful divergence is the command surface —
 * Codex custom prompts are a real slash-command surface (`slashCommands: true`)
 * but are install-global and deprecated in favor of "skills", so `skillSystem`
 * is `'prompted'` (we ship prompts today; skills are the forward migration).
 */
export const codexCapabilities: HostCapabilities = {
  hooks: [
    'session-start',
    'user-prompt',
    'pre-tool-edit',
    'post-tool-edit',
    'session-stop',
    'subagent-result',
  ],
  slashCommands: true,
  skillSystem: 'prompted',
  // Codex denies a tool via exit-2 / permissionDecision:"deny" (PreToolUse) and
  // can continue/block a turn end (Stop) — both are blocking points.
  blockingHooks: ['pre-tool-edit', 'session-stop'],
  subagentSpawn: 'native',
  streamingOutput: true,
  // Phase 222 AC-3: unlike host-claude-code's event-map.ts (which reads
  // `agent_id`/`agent_type` off the raw hook envelope), host-codex's
  // extractPayload never extracts an agent identifier — the phase-65 spike's
  // documented Codex hook stdin fields (session_id, cwd, hook_event_name,
  // tool_name, tool_input, permission_mode) don't include one, and it's
  // undocumented whether SubagentStop even carries one. Declared `false`
  // rather than left unset so core can notice loudly instead of silently
  // treating "no agentId" as "no active subagent" for this host.
  agentIdentification: false,
};
