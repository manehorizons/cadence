import { z } from 'zod';
import { TierZ, TaskStatusZ } from './state.js';
import { ProfileZ } from './profile.js';

export const AcceptanceCriterionZ = z.object({
  id: z.string().regex(/^AC-\d+$/),
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionZ>;

export const TaskZ = z.object({
  id: z.string(),
  name: z.string(),
  files: z.array(z.string()),
  action: z.string(),
  verify: z.string(),
  done: z.string(),
  status: TaskStatusZ.optional(),
  touchedFiles: z.array(z.string()).optional(),
});
export type Task = z.infer<typeof TaskZ>;

export const DraftZ = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^\d{2}-\d{2}$/),
  phase: z.string(),
  tier: TierZ,
  /** Optional per-phase profile override. When set, wins over the project default in config. */
  profile: ProfileZ.optional(),
  title: z.string(),
  objective: z.string(),
  acceptanceCriteria: z.array(AcceptanceCriterionZ),
  tasks: z.array(TaskZ),
  boundaries: z.array(z.string()),
  requiredSkills: z.array(z.string()).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'IN_PROGRESS', 'SETTLED']),
});
export type Draft = z.infer<typeof DraftZ>;
