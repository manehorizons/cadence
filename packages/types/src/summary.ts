import { z } from 'zod';
import { TaskStatusZ, DecisionZ, DeferredItemZ } from './state.js';

export const SummaryZ = z.object({
  schemaVersion: z.literal(1),
  draftId: z.string(),
  completedAt: z.string(),
  acResults: z.array(z.object({ id: z.string(), pass: z.boolean(), note: z.string().optional() })),
  taskResults: z.array(
    z.object({ id: z.string(), status: TaskStatusZ, notes: z.string() }),
  ),
  decisions: z.array(DecisionZ),
  deferred: z.array(DeferredItemZ),
  skillAudit: z.object({ required: z.array(z.string()), invoked: z.array(z.string()) }),
});
export type Summary = z.infer<typeof SummaryZ>;
