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

/** `cadence resume --json` payload. */
export const ResumeResultZ = z.union([
  z.object({ found: z.literal(false) }),
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
  }),
]);
export type ResumeResult = z.infer<typeof ResumeResultZ>;
