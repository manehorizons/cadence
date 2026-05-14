import type { AbstractEvent } from '@keel/types';

export interface HostCapabilities {
  hooks: AbstractEvent[];
  slashCommands: boolean;
  skillSystem: 'native' | 'prompted' | 'none';
  blockingHooks: AbstractEvent[];
  subagentSpawn: 'native' | 'shell-out' | 'none';
  streamingOutput: boolean;
}

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
