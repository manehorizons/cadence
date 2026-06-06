import type { HostCapabilities } from '@manehorizons/cadence-types';

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
};
