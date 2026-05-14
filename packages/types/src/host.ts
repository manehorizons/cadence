import { z } from 'zod';
import { AbstractEventZ } from './events.js';

export const HostCapabilitiesZ = z.object({
  hooks: z.array(AbstractEventZ),
  slashCommands: z.boolean(),
  skillSystem: z.enum(['native', 'prompted', 'none']),
  blockingHooks: z.array(AbstractEventZ),
  subagentSpawn: z.enum(['native', 'shell-out', 'none']),
  streamingOutput: z.boolean(),
});

export type HostCapabilities = z.infer<typeof HostCapabilitiesZ>;
