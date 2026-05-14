import type { HostCapabilities } from '@cadence/types';

export const claudeCodeCapabilities: HostCapabilities = {
  hooks: [
    'session-start',
    'user-prompt',
    'pre-tool-edit',
    'post-tool-edit',
    'session-stop',
    'subagent-result',
  ],
  slashCommands: true,
  skillSystem: 'native',
  blockingHooks: ['pre-tool-edit', 'session-stop'],
  subagentSpawn: 'native',
  streamingOutput: true,
};
