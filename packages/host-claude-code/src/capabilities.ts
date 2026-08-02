import type { HostCapabilities } from '@thomas-powers-jr/cadence-types';

export const claudeCodeCapabilities: HostCapabilities = {
  hooks: [
    'session-start',
    'user-prompt',
    'pre-tool-edit',
    'post-tool-edit',
    'session-stop',
    'subagent-result',
    'subagent-start',
  ],
  slashCommands: true,
  skillSystem: 'native',
  blockingHooks: ['pre-tool-edit', 'session-stop', 'subagent-result'],
  subagentSpawn: 'native',
  streamingOutput: true,
};
