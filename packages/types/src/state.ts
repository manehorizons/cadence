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
  /**
   * Optimistic-concurrency counter (Phase 173). Bumped by exactly 1 on every
   * successful `SimpleStateBackend.commit()`. A caller's in-memory state
   * carries the revision it was read at; `commit()` refuses when the
   * on-disk revision has since moved, rather than silently overwriting a
   * concurrent writer's change. `.default(0)` keeps pre-Phase-173
   * `state.json` files parsing unchanged.
   */
  revision: z.number().int().nonnegative().default(0),
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
    /**
     * Per-subagent baseline snapshot (subagent task-redundancy monitoring).
     * Keyed by the Claude Code `agentId` from the SubagentStart hook.
     * `taskStatuses` is a snapshot of every DRAFT task's status *at the
     * moment this subagent began* (baseline-at-start, not current-at-stop —
     * fairer to the subagent; see the design doc's "SubagentStop: safety
     * net" section). `touchedFiles` accumulates via PostToolUse for the
     * duration of this subagent's run. Entries are ephemeral — created at
     * SubagentStart, deleted at the matching SubagentStop; an orphaned entry
     * from a crash/interrupt is harmless (never compared against again).
     */
    subagentBaselines: z
      .record(
        z.string(),
        z.object({
          startedAt: z.string(),
          taskStatuses: z.record(z.string(), z.string()),
          touchedFiles: z.array(z.string()),
        }),
      )
      .default({}),
  }),
  skillAudit: z.object({
    required: z.array(z.string()),
    invoked: z.array(z.string()),
    /**
     * Phase 291 (291-01, T1): per-requirement provenance for `required` above —
     * one entry per (skill, source) pair, where `source` is `'config'`,
     * `'draft'`, or `` `pack:<id>` ``. `required` stays the deduped,
     * enforcement-facing union; this array is deliberately NOT deduped across
     * sources, so a skill demanded by both config and a pack yields two
     * entries rather than one collapsed row that hides who demanded it.
     * Absent on every pre-phase-291 record.
     *
     * MUST stay `.optional()` with NO `.default(...)`, mirroring
     * `SummaryZ.coverageScheme`/`GateProvenanceZ.providerSelection` (phase
     * 239/263 precedent): this same shape is mirrored onto `SummaryZ.skillAudit`,
     * and `cadence summary verify` Zod-parses a SUMMARY and then content-hashes
     * the PARSED object (`core/src/services/summary-hash.ts`), so a default
     * here would be injected into every historical SUMMARY at parse time,
     * change its digest, and falsely report every past settle as tampered.
     * `core/tests/summary-skill-audit-provenance-schema.test.ts` fails if a
     * default is added. Kept inline (not a named/exported schema) on purpose —
     * the shape has exactly one consumer pair and needs no public name.
     */
    provenance: z.array(z.object({ skill: z.string(), source: z.string() })).optional(),
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
    revision: 0,
    project: { name: projectName, createdAt: new Date().toISOString() },
    activePhase: null,
    activeDraft: null,
    activeSpec: null,
    loopPosition: 'IDLE',
    tier: null,
    openDrafts: [],
    decisions: [],
    deferred: [],
    session: { tokenUtilization: 0, lastHandoff: null, subagentSpawns: 0, subagentBaselines: {} },
    skillAudit: { required: [], invoked: [] },
    activeTask: null,
    draftReadAt: null,
  };
}
