import type { GateImpl, GateResult } from './types.js';

/**
 * Settle-time refusal for a DONE task whose DRAFT block never declared a
 * `- verify:` line (issue #206 / rec-20260712-001). `draft-parser.ts` today
 * silently defaults a missing verify line to `''` rather than refusing to
 * parse, so without this gate `settle run` happily writes `T1: DONE` into
 * SUMMARY.md backed by zero evidence. Fires only when `'task-verify-required'`
 * is in the effective gate set; refuses — never mutates the DRAFT or the
 * task's status — naming every offending task id so the operator can go add
 * the missing `- verify:` line and re-settle.
 */
export const runTaskVerifyRequiredGate: GateImpl = async (ctx): Promise<GateResult> => {
  if (!ctx.gateSet.gates.includes('task-verify-required')) {
    return { outcome: 'pass' };
  }

  const offenders = ctx.draft.tasks.filter(
    (t) => t.status === 'DONE' && t.verify.trim().length === 0,
  );
  if (offenders.length === 0) {
    return { outcome: 'pass' };
  }

  const ids = offenders.map((t) => t.id);
  const reason =
    `settle run refused: task${offenders.length > 1 ? 's' : ''} ${ids.join(', ')} ` +
    `${offenders.length > 1 ? 'are' : 'is'} marked DONE but ${offenders.length > 1 ? 'their' : 'its'} ` +
    'DRAFT task block is missing a `- verify:` line (or has one that is empty). ' +
    'Add a `- verify:` line describing how to check the task and re-settle.';
  ctx.io.err(`${reason}\n`);
  return { outcome: 'refuse', reason };
};
