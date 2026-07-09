import { z } from 'zod';
import { ContextPacketZ } from './intelligence.js';

/** Read-only git facts captured for a handoff. Best-effort: a non-repo or a
 *  missing git binary yields the `{ available: false }` variant. */
export const GitFactsZ = z.union([
  z.object({ available: z.literal(false) }),
  z.object({
    available: z.literal(true),
    branch: z.string(),
    dirty: z.boolean(),
    ahead: z.number().int().nonnegative(),
    behind: z.number().int().nonnegative(),
    head: z.string(),
    recentCommits: z.string(),
    diffStat: z.string(),
    /** True when a best-effort `git fetch` ran before ahead/behind were read.
     *  False = the counts are against last-fetched refs and may be stale. */
    fetched: z.boolean(),
  }),
]);
export type GitFacts = z.infer<typeof GitFactsZ>;

/** Structured machine facts pre-filled into a SESSION doc. Rendered to flat
 *  snake_case frontmatter keys by render-session.ts. */
export interface HandoffFrontmatter {
  schemaVersion: 1;
  generatedAt: string;
  label: string | null;
  loop: {
    position: string;
    activePhase: string | null;
    activeDraft: string | null;
    tier: string | null;
  };
  git: GitFacts;
  contextPacketPath: string;
}

/** A discoverable SESSION handoff doc, local or from a sibling worktree, for
 *  a future cross-worktree `cadence resume` picker. `worktreePath`/
 *  `worktreeBranch` always come from a live `git worktree list` scan, never
 *  from the doc's own frontmatter — a worktree can move after the doc was
 *  written, so the doc is not a reliable source for "where is this now".
 *  `liveLoopPosition` is that worktree's current `state.json` position,
 *  distinct from `loopPosition` (what the doc said at generation time). */
export const HandoffCandidateZ = z.object({
  path: z.string(),
  fileName: z.string(),
  source: z.enum(['local', 'sibling']),
  worktreePath: z.string(),
  worktreeBranch: z.string().nullable(),
  generatedAt: z.string().nullable(),
  label: z.string().nullable(),
  loopPosition: z.string().nullable(),
  activePhase: z.string().nullable(),
  liveLoopPosition: z.string().nullable(),
});
export type HandoffCandidate = z.infer<typeof HandoffCandidateZ>;

/** Result of the resume-time origin-freshness probe. `checked: false` is a
 *  soft outcome (offline / no upstream / detached), never an error. */
export const RemoteFreshnessZ = z.object({
  checked: z.boolean(),
  reason: z.enum(['not-a-repo', 'detached', 'fetch-failed', 'no-upstream']).optional(),
  branch: z.string().optional(),
  behind: z.number().int().nonnegative().optional(),
  ahead: z.number().int().nonnegative().optional(),
});
export type RemoteFreshness = z.infer<typeof RemoteFreshnessZ>;

/** `cadence resume --json` payload. */
export const ResumeResultZ = z.union([
  z.object({
    found: z.literal(false),
    candidates: z.array(HandoffCandidateZ).optional(),
  }),
  z.object({
    found: z.literal(true),
    handoffPath: z.string(),
    generatedAt: z.string().nullable(),
    doc: z.string(),
    context: ContextPacketZ.nullable(),
    drift: z
      .object({ docLoopPosition: z.string(), liveLoopPosition: z.string() })
      .nullable(),
    mode: z.enum(['brief', 'full']),
    candidates: z.array(HandoffCandidateZ).optional(),
    pickedSource: z.enum(['local', 'sibling']).optional(),
    pickedWorktree: z.string().optional(),
    remote: RemoteFreshnessZ.optional(),
    unfilled: z.array(z.string()).optional(),
  }),
]);
export type ResumeResult = z.infer<typeof ResumeResultZ>;
