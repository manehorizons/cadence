import { z } from 'zod';
import { TaskStatusZ, DecisionZ, DeferredItemZ } from './state.js';

export const DeepVerdictZ = z.object({
  pass: z.boolean(),
  reason: z.string(),
  provider: z.string(),
  model: z.string().optional(),
});
export type DeepVerdict = z.infer<typeof DeepVerdictZ>;

/**
 * Per-file / per-diff finding. Introduced for code-review (Phase 24.3,
 * high/medium/low). Phase 25.2 added `critical` for the security-audit
 * gate — additive; code-review still only emits high/medium/low.
 */
export const FindingZ = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  message: z.string(),
  line: z.number().int().positive().optional(),
});
export type Finding = z.infer<typeof FindingZ>;

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
  /** Phase 16: per-AC `--interactive` walker output. Present only when the walker ran. */
  interactiveVerify: z
    .record(
      z.string(),
      z.object({
        verdict: z.enum(['pass', 'fail']),
        note: z.string().optional(),
      }),
    )
    .optional(),
  /** Phase 24.3: per-file code-review findings. Present only when the gate ran. */
  codeReview: z.record(z.string(), z.array(FindingZ)).optional(),
  /** Phase 25.2: flat security-audit findings. Present only when the gate ran. */
  securityAudit: z.array(FindingZ).optional(),
});
export type Summary = z.infer<typeof SummaryZ>;
