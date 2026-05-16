import { z } from 'zod';

export const TierZ = z.enum(['quick-fix', 'standard', 'complex']);
export type Tier = z.infer<typeof TierZ>;

export const LoopPositionZ = z.enum(['SPEC', 'DRAFT', 'BUILD', 'SETTLE', 'IDLE']);
export type LoopPosition = z.infer<typeof LoopPositionZ>;

export const TaskStatusZ = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'DONE',
  'DONE_WITH_CONCERNS',
  'NEEDS_CONTEXT',
  'BLOCKED',
]);
export type TaskStatus = z.infer<typeof TaskStatusZ>;

export const DecisionZ = z.object({
  id: z.string(),
  phase: z.string(),
  draft: z.string().optional(),
  title: z.string(),
  rationale: z.string().optional(),
  decidedAt: z.string(),
});
export type Decision = z.infer<typeof DecisionZ>;

export const DeferredItemZ = z.object({
  id: z.string(),
  from: z.string(),
  title: z.string(),
  type: z.string().optional(),
  createdAt: z.string(),
});
export type DeferredItem = z.infer<typeof DeferredItemZ>;

export const CadenceStateZ = z.object({
  schemaVersion: z.literal(1),
  project: z.object({ name: z.string(), createdAt: z.string() }),
  activePhase: z.string().nullable(),
  activeDraft: z.string().nullable(),
  /** Active `<id>-SPEC.md` while `loopPosition==='SPEC'`; `null` otherwise. */
  activeSpec: z.string().nullable().default(null),
  loopPosition: LoopPositionZ,
  tier: TierZ.nullable(),
  /**
   * ISO8601 timestamp of the most recent successful `cadence draft approve`.
   * The DRAFT-read mtime gate (Phase 23.1) refuses settle when the DRAFT.md
   * file's mtime is newer than this — the human edited the draft after
   * approving. `null` means no approve has happened yet (gate silently passes).
   */
  draftReadAt: z.string().datetime({ offset: true }).nullable().default(null),
  openDrafts: z.array(z.object({ id: z.string(), since: z.string() })),
  decisions: z.array(DecisionZ),
  deferred: z.array(DeferredItemZ),
  session: z.object({
    tokenUtilization: z.number().min(0).max(1),
    lastHandoff: z.string().nullable(),
    subagentSpawns: z.number().int().nonnegative(),
  }),
  skillAudit: z.object({
    required: z.array(z.string()),
    invoked: z.array(z.string()),
  }),
  activeTask: z
    .object({
      id: z.string(),
      status: TaskStatusZ,
      touchedFiles: z.array(z.string()),
    })
    .nullable(),
});

export type CadenceState = z.infer<typeof CadenceStateZ>;

export function emptyState(projectName = 'unnamed'): CadenceState {
  return {
    schemaVersion: 1,
    project: { name: projectName, createdAt: new Date().toISOString() },
    activePhase: null,
    activeDraft: null,
    activeSpec: null,
    loopPosition: 'IDLE',
    tier: null,
    openDrafts: [],
    decisions: [],
    deferred: [],
    session: { tokenUtilization: 0, lastHandoff: null, subagentSpawns: 0 },
    skillAudit: { required: [], invoked: [] },
    activeTask: null,
    draftReadAt: null,
  };
}
