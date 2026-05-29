import type { GateImpl, GateResult } from './types.js';

/**
 * Terminal task statuses (DESIGN.md §4.1 "structural verifier"). A task in any
 * other status (PENDING / IN_PROGRESS) is "open" and blocks settle.
 * `DONE_WITH_CONCERNS` is terminal — a done-with-concerns task is settled, not
 * open (docs/concepts.md historically undercounted it; corrected Phase 39.2).
 */
const TERMINAL = new Set(['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED']);

/**
 * Structural-verifier gate (DESIGN.md §4.1 always-fire). Wired for real in
 * Phase 39.2: refuses settle while any task is non-terminal, unless
 * --allow-open-tasks / --force. Pure policy over `ctx.progress.tasks`.
 */
export const runStructuralVerifierGate: GateImpl = async (ctx): Promise<GateResult> => {
  const open = Object.entries(ctx.progress.tasks).filter(
    ([, t]) => !TERMINAL.has(t.status),
  );
  if (open.length > 0 && !ctx.opts.allowOpenTasks && !ctx.opts.force) {
    for (const [id, t] of open) {
      ctx.io.err(`structural-verifier: task ${id} is ${t.status} (not terminal)\n`);
    }
    ctx.io.err(
      'settle run refused: all tasks must be terminal (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED). ' +
        'Pass --allow-open-tasks to bypass, or --force to settle anyway.\n',
    );
    return { outcome: 'refuse' };
  }
  return { outcome: 'pass' };
};
