import { z } from 'zod';

export const AbstractEventZ = z.enum([
  'session-start',
  'user-prompt',
  'pre-tool-edit',
  'post-tool-edit',
  'session-stop',
  'subagent-result',
  'subagent-start',
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
  /**
   * Present only when the host's hook fired inside a subagent's tool call
   * (subagent task-redundancy monitoring). `undefined` for main-thread calls.
   * Extracted by the host adapter (e.g. `event-map.ts`'s `extractPayload`),
   * NOT read directly from `raw` by core — core stays host-agnostic.
   */
  agentId: z.string().optional(),
  agentType: z.string().optional(),
});
export type HookContext = z.infer<typeof HookContextZ>;
