import { z } from 'zod';
import { TaskStatusZ, DecisionZ, DeferredItemZ } from './state.js';

export const DeepVerdictZ = z.object({
  pass: z.boolean(),
  reason: z.string(),
  provider: z.string(),
  model: z.string().optional(),
});
export type DeepVerdict = z.infer<typeof DeepVerdictZ>;

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
  /** Phase 15: per-AC `--deep` verifier output. Present only when `--deep` ran. */
  deepVerify: z.record(z.string(), DeepVerdictZ).optional(),
});
export type Summary = z.infer<typeof SummaryZ>;
