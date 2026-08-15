import { z } from 'zod';
import { TierZ, TaskStatusZ } from './state.js';
import { ProfileZ } from './profile.js';

export const AcceptanceCriterionZ = z.object({
  id: z.string().regex(/^AC-\d+$/),
  name: z.string().default(''),
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionZ>;

/** Declared task-execution weight class, used by the dispatch policy engine (Phase 279: dispatch policy engine). */
export const TaskClassZ = z.enum(['mechanical', 'standard', 'complex']);
export type TaskClass = z.infer<typeof TaskClassZ>;

export const TaskZ = z.object({
  id: z.string(),
  name: z.string(),
  files: z.array(z.string()),
  action: z.string(),
  verify: z.string(),
  done: z.string(),
  /** Optional task ids this task requires to complete first (Phase: wave-based dispatch). */
  depends: z.array(z.string()).optional(),
  /** Optional declared execution class; wins over the heuristic classifier when set (Phase 279: dispatch policy engine). */
  class: TaskClassZ.optional(),
  /**
   * Optional machine-readable stop-condition a dispatched agent must honor
   * (Phase 280: dispatch contract). Distinct from a prose file-scope
   * description because it survives a "continue?" approval mid-dispatch —
   * the agent re-checks it even after a human has said yes to keep going.
   * NOT the same field as `touchedFiles` below (a separately-dead field
   * this phase does not populate) — do not conflate the two.
   */
  stop: z.string().optional(),
  status: TaskStatusZ.optional(),
  touchedFiles: z.array(z.string()).optional(),
});
export type Task = z.infer<typeof TaskZ>;

export const DraftZ = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^\d{2,}-\d{2,}$/),
  phase: z.string(),
  tier: TierZ,
  /** Optional per-phase profile override. When set, wins over the project default in config. */
  profile: ProfileZ.optional(),
  /**
   * Optional per-phase boundaryEnforcement override (Phase 155). When set,
   * wins over the project default in config — mirrors `profile` above.
   */
  boundaryEnforcement: z.enum(['warn', 'block']).optional(),
  /**
   * Optional per-phase redundantWorkEnforcement override, mirroring
   * `boundaryEnforcement`. When set, wins over the project default.
   */
  redundantWorkEnforcement: z.enum(['off', 'warn', 'block']).optional(),
  title: z.string(),
  objective: z.string(),
  acceptanceCriteria: z.array(AcceptanceCriterionZ),
  tasks: z.array(TaskZ),
  boundaries: z.array(z.string()),
  requiredSkills: z.array(z.string()).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'IN_PROGRESS', 'SETTLED']),
});
export type Draft = z.infer<typeof DraftZ>;
