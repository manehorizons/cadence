import { z } from 'zod';
import { AcceptanceCriterionZ } from './plan.js';

/**
 * Phase 36.1 — the pre-DRAFT SPEC artifact (`<id>-SPEC.md`). Authored by the
 * host agent/human (cadence is host-agnostic — it scaffolds + validates, it
 * does not generate). Validated by the convergent spec-review gate at
 * `cadence spec approve`.
 */
export const SpecZ = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^\d{2,}-\d{2,}$/),
  phase: z.string(),
  objective: z.string(),
  acceptanceCriteria: z.array(AcceptanceCriterionZ),
  constraints: z.array(z.string()),
  openQuestions: z.array(z.string()),
  status: z.enum(['PENDING', 'APPROVED']),
});
export type Spec = z.infer<typeof SpecZ>;
