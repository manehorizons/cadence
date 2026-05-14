import type { AbstractEvent } from './events.js';

export interface HostCapabilities {
  hooks: AbstractEvent[];
  slashCommands: boolean;
  skillSystem: 'native' | 'prompted' | 'none';
  blockingHooks: AbstractEvent[];
  subagentSpawn: 'native' | 'shell-out' | 'none';
  streamingOutput: boolean;
}
