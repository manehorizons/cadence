import { z } from 'zod';

export const AbstractEventZ = z.enum([
  'session-start',
  'user-prompt',
  'pre-tool-edit',
  'post-tool-edit',
  'session-stop',
  'subagent-result',
  'skill-invoke',
]);
export type AbstractEvent = z.infer<typeof AbstractEventZ>;

export const HookContextZ = z.object({
  event: AbstractEventZ,
  cwd: z.string(),
  branch: z.string().optional(),
  activePhase: z.string().optional(),
  activeDraft: z.string().optional(),
  hostId: z.string().optional(),
  raw: z.unknown().optional(),
});
export type HookContext = z.infer<typeof HookContextZ>;
