import type { GateImpl, GateResult } from './types.js';

/**
 * DRAFT-read mtime gate (Phase 23.1). Extracted from settle.ts verbatim
 * (Phase 39.2). Fires when 'draft-read' is in the effective gate set (checked
 * at the call site). Refuses when the DRAFT.md was edited after approve — its
 * mtime is strictly newer than `state.draftReadAt` — unless --allow-stale-draft.
 * No baseline (null draftReadAt) or an unavailable mtime ⇒ pass.
 */
export const runDraftReadGate: GateImpl = async (ctx): Promise<GateResult> => {
  if (ctx.state.draftReadAt === null) return { outcome: 'pass' };
  const mtimeMs = await ctx.draftMtimeMs();
  if (mtimeMs === null) return { outcome: 'pass' };
  const baselineMs = Date.parse(ctx.state.draftReadAt);
  if (mtimeMs > baselineMs) {
    if (!ctx.opts.allowStaleDraft) {
      ctx.io.err(
        `settle run refused: DRAFT.md was edited after approve (mtime ${new Date(mtimeMs).toISOString()} > draftReadAt ${ctx.state.draftReadAt}). Re-read it then re-approve, or pass --allow-stale-draft to override.\n`,
      );
      return { outcome: 'refuse' };
    }
    ctx.io.err(
      'settle: --allow-stale-draft set; proceeding past draft-read gate (DRAFT.md mtime newer than draftReadAt).\n',
    );
  }
  return { outcome: 'pass' };
};
