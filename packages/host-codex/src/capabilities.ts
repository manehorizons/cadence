import type { HostCapabilities } from '@keel/types';

export const codexCapabilities: HostCapabilities = {
  hooks: ['session-start', 'user-prompt', 'pre-tool-edit', 'post-tool-edit', 'session-stop'],
  slashCommands: true,
  skillSystem: 'native',
  blockingHooks: ['pre-tool-edit', 'session-stop'],
  subagentSpawn: 'none',
  streamingOutput: true,
};
